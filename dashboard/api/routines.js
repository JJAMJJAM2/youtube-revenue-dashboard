import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const ADMIN_PASS = process.env.ADMIN_PASS;

const SHEET_ROUTINE = '루틴기록';

function mustAdmin(req, res) {
  const pass = req.headers['x-admin-pass'];
  if (!ADMIN_PASS || pass !== ADMIN_PASS) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

function nowIso() {
  return new Date().toISOString();
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

async function getSheetsClient() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID not set');
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

function normalizeRow(row) {
  return {
    date: row[0] || '',
    type: row[1] || '',
    note: row[2] || '',
    created_at: row[3] || ''
  };
}

function normalizeType(type) {
  const t = String(type || '').trim().toUpperCase();
  if (t === 'WORK' || t === 'WORKOUT') return t;
  return '';
}

async function findRowIndexByDateType(sheets, date, type) {
  // A:B를 읽고, (date,type) 매칭되는 "시트 행 번호(1-based)"를 찾는다.
  // values는 0-based array이고, 헤더가 1행이므로 실제 row number는 i+1.
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_ROUTINE}!A:B`
  });

  const values = r.data.values || [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const d = row[0] || '';
    const t = row[1] || '';
    if (d === date && t === type) {
      return i + 1; // 실제 시트 행 번호
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const sheets = await getSheetsClient();

    // GET: 목록 조회
    if (req.method === 'GET') {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_ROUTINE}!A:D`
      });

      const values = r.data.values || [];
      const rows = values.slice(1).map(normalizeRow).filter(x => x.date && x.type);

      res.status(200).json({ ok: true, items: rows });
      return;
    }

    // POST: 오늘 1회 기록(타입별 1회) - 이미 있으면 409
    if (req.method === 'POST') {
      if (!mustAdmin(req, res)) return;

      const { type, note } = req.body || {};
      const t = normalizeType(type);
      const n = String(note || '').trim();

      if (!t) return res.status(400).json({ ok: false, error: 'invalid type' });
      if (!n) return res.status(400).json({ ok: false, error: 'note required' });

      const date = todayYMD();
      const rowIndex = await findRowIndexByDateType(sheets, date, t);

      if (rowIndex) {
        res.status(409).json({ ok: false, error: 'already recorded today' });
        return;
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_ROUTINE}!A:D`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[date, t, n, nowIso()]]
        }
      });

      res.status(200).json({ ok: true });
      return;
    }

    // PATCH: 오늘 기록 수정 (note만 업데이트) - 없으면 404
    if (req.method === 'PATCH') {
      if (!mustAdmin(req, res)) return;

      const { type, note } = req.body || {};
      const t = normalizeType(type);
      const n = String(note || '').trim();

      if (!t) return res.status(400).json({ ok: false, error: 'invalid type' });
      if (!n) return res.status(400).json({ ok: false, error: 'note required' });

      const date = todayYMD();
      const rowIndex = await findRowIndexByDateType(sheets, date, t);

      if (!rowIndex) {
        res.status(404).json({ ok: false, error: 'no record today' });
        return;
      }

      // C열(note)만 업데이트 (created_at은 최초 기록 시간 유지)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_ROUTINE}!C${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[n]] }
      });

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'server error' });
  }
}
