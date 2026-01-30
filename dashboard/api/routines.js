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

export default async function handler(req, res) {
  try {
    const sheets = await getSheetsClient();

    // GET: 전체 조회
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

    // POST: 오늘 1회 기록(타입별 1회)
    if (req.method === 'POST') {
      if (!mustAdmin(req, res)) return;

      const { type, note } = req.body || {};
      const t = String(type || '').trim();
      const n = String(note || '').trim();

      if (!t || !['WORK', 'WORKOUT'].includes(t)) {
        res.status(400).json({ ok: false, error: 'invalid type' });
        return;
      }
      if (!n) {
        res.status(400).json({ ok: false, error: 'note required' });
        return;
      }

      // 기존 데이터 읽어서 (date,type) 중복 체크
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_ROUTINE}!A:B`
      });

      const values = r.data.values || [];
      const rows = values.slice(1);

      const date = todayYMD();
      const exists = rows.some(row => (row?.[0] || '') === date && (row?.[1] || '') === t);

      if (exists) {
        res.status(409).json({ ok: false, error: 'already recorded today' });
        return;
      }

      const created_at = nowIso();

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_ROUTINE}!A:D`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[date, t, n, created_at]]
        }
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
