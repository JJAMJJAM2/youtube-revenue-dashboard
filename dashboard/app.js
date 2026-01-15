// Google Sheets API 설정
const SPREADSHEET_ID = '103b7b86DIRP6CiHpVUi6gSkjxJ8uWXjYnudlKjhKYaI';
const API_KEY = 'AIzaSyBwudOxtEn7Z8xO5ahXgbxzKjj6uHaVqh4';

// Sheets
const SHEET_NAME = '일별데이터';
const SHEET_MANAGE = '채널관리';
const SHEET_HISTORY = '수창이력';   // (현재 MVP에서는 읽지 않지만 시트명 상수로 준비)
const SHEET_SOURCES = '콘텐츠소스';  // (현재 MVP에서는 읽지 않지만 시트명 상수로 준비)

let allData = [];
let charts = {};

let manageData = [];
let manageFiltered = [];

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
  loadData();
});

// 탭 전환
function switchTab(tab) {
  const dash = document.getElementById('dashboardSection');
  const manage = document.getElementById('manageSection');
  const btnD = document.getElementById('tabDashboard');
  const btnM = document.getElementById('tabManage');

  if (tab === 'manage') {
    dash.classList.add('hidden');
    manage.classList.remove('hidden');
    btnD.classList.remove('active');
    btnM.classList.add('active');
  } else {
    manage.classList.add('hidden');
    dash.classList.remove('hidden');
    btnM.classList.remove('active');
    btnD.classList.add('active');
  }
}

// 데이터 로드 (일별데이터)
async function loadData() {
  try {
    showLoading();

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.values) {
      allData = parseSheetData(data.values);
      updateDashboard();
      updateLastUpdateTime();
      await loadManageData(); // 채널관리도 함께 로드
    }

    hideLoading();
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    alert('데이터를 불러오는데 실패했습니다.');
    hideLoading();
  }
}

// 채널관리 로드
async function loadManageData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_MANAGE)}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      manageData = [];
      manageFiltered = [];
      buildTopicFilter();
      renderManageTable();
      return;
    }

    // 채널관리 헤더:
    // channel_id | 채널명 | 주제(니치) | 수창 상태 | 계정 이메일 | 원본 소스 | 전략 | 담당자 | 메모
    const rows = data.values.slice(1);
    manageData = rows.map(r => ({
      channelId: (r[0] || '').trim(),
      name: r[1] || '',
      topic: r[2] || '',
      status: r[3] || '',
      email: r[4] || '',
      source: r[5] || '',
      strategy: r[6] || '',
      owner: r[7] || '',
      memo: r[8] || ''
    })).filter(x => x.channelId || x.name);

    manageFiltered = [...manageData];
    buildTopicFilter();
    renderManageTable();

    // 시트 편집 링크
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
    const btn = document.getElementById('openSheetBtn');
    if (btn) btn.href = sheetUrl;

  } catch (e) {
    console.error('채널관리 로드 오류:', e);
  }
}

// 시트 데이터 파싱 (일별데이터: 날짜 | channel_id | 채널명 | 조회수 | 수익(원) | RPM)
function parseSheetData(values) {
  const rows = values.slice(1);

  return rows.map(row => ({
    date: row[0],
    channelId: row[1],
    channel: row[2],
    views: parseInt(row<span class="cursor">█</span>
