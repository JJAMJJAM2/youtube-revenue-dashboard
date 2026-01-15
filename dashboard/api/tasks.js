// dashboard/api/tasks.js
// Vercel Serverless Function
// GET  /api/tasks
// POST /api/tasks
// PATCH /api/tasks

const { google } = require('googleapis');

const SHEET_NAME = '할일';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function checkPass(req) {
  const adminPass = requireEnv('ADMIN_PASS');
  const incoming = req.headers['x-admin-pass'];
  return incoming && incoming === adminPass;
}

function nowKSTISOString() {
  // 간단히 ISO로 저장(표시용은 프론트에서 변환)
  return new Date().toISOString();
}

async function getSheetsClient() {
  const spreadsheetId = requireEnv('SPREADSHEET_ID');
  const saJson = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON');

  let creds;
  try {
    creds = JSON.parse(saJson);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

async function readAllTasks(sheets, spreadsheetId) {
  const range = `${SHEET_NAME}!A:O`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = resp.data.values || [];
  if (values.length === 0) return [];

  const headers = values[0];
  const rows = values.slice(1);

  const tasks = rows.map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i] ?? ''));
    return obj;
  });

  return tasks;
}

async function appendTask(sheets, spreadsheetId, task) {
  const range = `${SHEET_NAME}!A:O`;

  const createdAt = nowKSTISOString();
  const updatedAt = createdAt;

  // 필드 기본값
  const row = [
    task.task_id || `T${Date.now()}`,                 // task_id
    task.category || '업무',                          // category
    task.channel_scope || (task.category === '개인' ? 'PERSONAL' : 'ALL'),
    task.channel_id || '',
    task.title || '',
    task.status || 'TODO',
    task.priority || 'P1',
    task.due_date || '',
    task.recurrence || 'NONE',
    task.assignee || '',
    task.tags || '',
    task.memo || '',
    createdAt,
    updatedAt,
    task.done_at || ''
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  return true;
}

async function batchUpdateCells(sheets, spreadsheetId, updates) {
  // updates: [{range: '할일!F10', values:[[...]]}, ...]
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });
}

async function patchTask(sheets, spreadsheetId, payload) {
  // payload: { task_id, status?, memo?, due_date?, priority?, done? }
  const all = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:O`
  });

  const values = all.data.values || [];
  if (values.length <= 1) throw new Error('No tasks sheet data');

  const headers = values[0];
  const rows = values.slice(1);

  const colIndex = (name) => headers.indexOf(name);

  const idxTaskId = colIndex('task_id');
  if (idxTaskId < 0) throw new Error('task_id column missing');

  const rowIndex = rows.findIndex(r => (r[idxTaskId] ?? '') === payload.task_id);
  if (rowIndex < 0) throw new Error('task not found');

  const sheetRowNumber = rowIndex + 2; // + header row

  const updates = [];
  const updatedAtCol = colIndex('updated_at');
  const doneAtCol = colIndex('done_at');

  const setCell = (colName, value) => {
    const c = colIndex(colName);
    if (c < 0) return;
    const colLetter = String.fromCharCode('A'.charCodeAt(0) + c);
    updates.push({
      range: `${SHEET_NAME}!${colLetter}${sheetRowNumber}`,
      values: [[value]],
    });
  };

  if (payload.status !== undefined) setCell('status', payload.status);
  if (payload.priority !== undefined) setCell('priority', payload.priority);
  if (payload.due_date !== undefined) setCell('due_date', payload.due_date);
  if (payload.memo !== undefined) setCell('memo', payload.memo);

  // done=true면 status DONE + done_at 세팅
  if (payload.done === true) {
    setCell('status', 'DONE');
    if (doneAtCol >= 0) setCell('done_at', nowKSTISOString());
  }
  if (payload.done === false) {
    // done 해제 시 done_at 비우기(원하면)
    if (doneAtCol >= 0) setCell('done_at', '');
  }

  if (updatedAtCol >= 0) setCell('updated_at', nowKSTISOString());

  if (updates.length === 0) return;

  await batchUpdateCells(sheets, spreadsheetId, updates);
}

module.exports = async (req, res) => {
  try {
    const { sheets, spreadsheetId } = await getSheetsClient();

    if (req.method === 'GET') {
      // 읽기는 공개 가능(하지만 우리는 여기서도 API 통해 읽게 해도 됨)
      const tasks = await readAllTasks(sheets, spreadsheetId);
      return json(res, 200, { ok: true, tasks });
    }

    // 쓰기: 비밀번호 필수
    if (!checkPass(req)) {
      return json(res, 401, { ok: false, error: 'Unauthorized' });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.title || !body.category) {
        return json(res, 400, { ok: false, error: 'category/title required' });
      }
      await appendTask(sheets, spreadsheetId, body);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      if (!body.task_id) {
        return json(res, 400, { ok: false, error: 'task_id required' });
      }
      await patchTask(sheets, spreadsheetId, body);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e.message || e) });
  }
};
