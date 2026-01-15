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
    views: parseInt(row[3]) || 0,
    revenue: parseInt(row[4]) || 0,
    rpm: parseFloat(row[5]) || 0
  })).filter(x => x.date && x.channelId);
}

// 대시보드 업데이트
function updateDashboard() {
  updateStats();
  updateChannelCards();
  updateCharts();
  updateTable();
  updateChannelFilter();
  updateHealthBanner();
}

// 통계 업데이트
function updateStats() {
  const thisMonth = getCurrentMonth();
  const monthData = allData.filter(d => d.date.startsWith(thisMonth));

  const totalRevenue = monthData.reduce((sum, d) => sum + d.revenue, 0);
  const totalViews = monthData.reduce((sum, d) => sum + d.views, 0);
  const avgRpm = totalViews > 0 ? (totalRevenue / totalViews * 1000) : 0;

  const channels = [...new Set(allData.map(d => d.channelId))];

  document.getElementById('totalRevenue').textContent = `₩${totalRevenue.toLocaleString()}`;
  document.getElementById('totalViews').textContent = totalViews.toLocaleString();
  document.getElementById('avgRpm').textContent = `₩${avgRpm.toFixed(1)}`;
  document.getElementById('activeChannels').textContent = channels.length;
}

// 채널 카드 업데이트
function updateChannelCards() {
  const thisMonth = getCurrentMonth();
  const channelIds = [...new Set(allData.map(d => d.channelId))];
  const container = document.getElementById('channelCards');

  container.innerHTML = channelIds.map(cid => {
    const channelName = getChannelNameById(cid) || cid;

    const channelData = allData.filter(d =>
      d.channelId === cid && d.date.startsWith(thisMonth)
    );

    const totalRevenue = channelData.reduce((sum, d) => sum + d.revenue, 0);
    const totalViews = channelData.reduce((sum, d) => sum + d.views, 0);
    const avgRpm = totalViews > 0 ? (totalRevenue / totalViews * 1000) : 0;

    return `
      <div class="channel-card">
        <h3>${escapeHtml(channelName)}</h3>
        <div class="metric">
          <span class="metric-label">총 수익</span>
          <span class="metric-value">₩${totalRevenue.toLocaleString()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">총 조회수</span>
          <span class="metric-value">${totalViews.toLocaleString()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">평균 RPM</span>
          <span class="metric-value">₩${avgRpm.toFixed(1)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">데이터 수</span>
          <span class="metric-value">${channelData.length}일</span>
        </div>
      </div>
    `;
  }).join('');
}

// 차트 업데이트
function updateCharts() {
  updateRevenueChart();
  updateChannelComparisonChart();
  updateRpmChart();
}

// 일별 수익 차트 (최근 30일)
function updateRevenueChart() {
  const ctx = document.getElementById('revenueChart');
  const last30Days = allData.slice(-30);

  const channelIds = [...new Set(last30Days.map(d => d.channelId))];
  const dates = [...new Set(last30Days.map(d => d.date))].sort();

  const datasets = channelIds.map((cid, index) => {
    const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#e53e3e', '#38b2ac'];
    const name = getChannelNameById(cid) || cid;
    return {
      label: name,
      data: dates.map(date => {
        const item = last30Days.find(d => d.date === date && d.channelId === cid);
        return item ? item.revenue : 0;
      }),
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '20',
      tension: 0.4
    };
  });

  if (charts.revenue) charts.revenue.destroy();

  charts.revenue = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: value => '₩' + value.toLocaleString() }
        }
      }
    }
  });
}

// 채널별 비교 차트 (이번 달)
function updateChannelComparisonChart() {
  const ctx = document.getElementById('channelComparisonChart');
  const thisMonth = getCurrentMonth();
  const channelIds = [...new Set(allData.map(d => d.channelId))];

  const labels = channelIds.map(cid => getChannelNameById(cid) || cid);
  const revenues = channelIds.map(cid => {
    const channelData = allData.filter(d => d.channelId === cid && d.date.startsWith(thisMonth));
    return channelData.reduce((sum, d) => sum + d.revenue, 0);
  });

  if (charts.comparison) charts.comparison.destroy();

  charts.comparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '이번 달 수익',
        data: revenues,
        backgroundColor: ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#e53e3e', '#38b2ac']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: value => '₩' + value.toLocaleString() }
        }
      }
    }
  });
}

// RPM 추이 차트 (최근 30일)
function updateRpmChart() {
  const ctx = document.getElementById('rpmChart');
  const last30Days = allData.slice(-30);

  const channelIds = [...new Set(last30Days.map(d => d.channelId))];
  const dates = [...new Set(last30Days.map(d => d.date))].sort();

  const datasets = channelIds.map((cid, index) => {
    const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#e53e3e', '#38b2ac'];
    const name = getChannelNameById(cid) || cid;
    return {
      label: name,
      data: dates.map(date => {
        const item = last30Days.find(d => d.date === date && d.channelId === cid);
        return item ? item.rpm : 0;
      }),
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '20',
      tension: 0.4
    };
  });

  if (charts.rpm) charts.rpm.destroy();

  charts.rpm = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: value => '₩' + Number(value).toFixed(1) }
        }
      }
    }
  });
}

// 테이블 업데이트
function updateTable() {
  const tbody = document.getElementById('tableBody');
  const recentData = allData.slice(-30).reverse();

  tbody.innerHTML = recentData.map(row => `
    <tr>
      <td>${row.date}</td>
      <td>${escapeHtml(row.channel)}</td>
      <td>${row.views.toLocaleString()}</td>
      <td>₩${row.revenue.toLocaleString()}</td>
      <td>₩${row.rpm.toFixed(1)}</td>
    </tr>
  `).join('');
}

// 채널 필터 업데이트
function updateChannelFilter() {
  const select = document.getElementById('channelFilter');
  const channels = [...new Set(allData.map(d => d.channel))];

  select.innerHTML = '<option value="all">전체 채널</option>' +
    channels.map(channel =>
      `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`
    ).join('');
}

// 필터 적용 (대시보드 테이블)
function filterData() {
  const selected = document.getElementById('channelFilter').value;
  const tbody = document.getElementById('tableBody');

  let filteredData = allData;
  if (selected !== 'all') {
    filteredData = allData.filter(d => d.channel === selected);
  }

  const recentData = filteredData.slice(-30).reverse();

  tbody.innerHTML = recentData.map(row => `
    <tr>
      <td>${row.date}</td>
      <td>${escapeHtml(row.channel)}</td>
      <td>${row.views.toLocaleString()}</td>
      <td>₩${row.revenue.toLocaleString()}</td>
      <td>₩${row.rpm.toFixed(1)}</td>
    </tr>
  `).join('');
}

/* =========================
   채널관리: 필터/테이블/상세
========================= */

function buildTopicFilter() {
  const select = document.getElementById('topicFilter');
  if (!select) return;

  const topics = [...new Set(manageData.map(d => (d.topic || '').trim()).filter(Boolean))].sort();

  select.innerHTML =
    `<option value="all">주제(니치): 전체</option>` +
    topics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

function applyManageFilters() {
  const q = (document.getElementById('manageSearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('statusFilter')?.value || 'all';
  const topic = document.getElementById('topicFilter')?.value || 'all';

  manageFiltered = manageData.filter(d => {
    const okStatus = (status === 'all') || (d.status === status);
    const okTopic = (topic === 'all') || (d.topic === topic);

    const hay = `${d.name} ${d.topic} ${d.strategy} ${d.memo} ${d.source} ${d.email}`.toLowerCase();
    const okQ = !q || hay.includes(q);

    return okStatus && okTopic && okQ;
  });

  renderManageTable();
}

function renderManageTable() {
  const tbody = document.getElementById('manageTbody');
  if (!tbody) return;

  tbody.innerHTML = manageFiltered.map(d => `
    <tr onclick="openDetail('${escapeAttr(d.channelId)}')">
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.topic)}</td>
      <td><span class="badge ${statusClass(d.status)}">${escapeHtml(d.status || '-')}</span></td>
      <td>${escapeHtml(d.email)}</td>
      <td>${escapeHtml(d.source)}</td>
      <td>${escapeHtml(d.owner)}</td>
    </tr>
  `).join('');
}

function openDetail(channelId) {
  const item = manageData.find(d => d.channelId === channelId);
  if (!item) return;

  const panel = document.getElementById('manageDetail');
  panel.classList.remove('hidden');

  document.getElementById('detailChannelName').textContent = item.name || '-';
  document.getElementById('detailChannelId').textContent = item.channelId || '-';
  document.getElementById('detailTopic').textContent = item.topic || '-';
  document.getElementById('detailStrategy').textContent = item.strategy || '-';
  document.getElementById('detailMemo').textContent = item.memo || '-';
  document.getElementById('detailSource').textContent = item.source || '-';
  document.getElementById('detailEmail').textContent = item.email || '-';
  document.getElementById('detailOwner').textContent = item.owner || '-';

  const badge = document.getElementById('detailStatusBadge');
  badge.className = `badge ${statusClass(item.status)}`;
  badge.textContent = item.status || '-';

  const summary = calcRecentSummary(item.channelId, 7);
  document.getElementById('kpi7Views').textContent = summary.views.toLocaleString();
  document.getElementById('kpi7Revenue').textContent = `₩${summary.revenue.toLocaleString()}`;
  document.getElementById('kpi7Rpm').textContent = `₩${summary.rpm.toFixed(1)}`;
}

function closeDetail() {
  document.getElementById('manageDetail')?.classList.add('hidden');
}

function calcRecentSummary(channelId, days) {
  const sorted = [...allData]
    .filter(d => d.channelId === channelId)
    .sort((a,b) => a.date.localeCompare(b.date));

  const last = sorted.slice(-days);
  const views = last.reduce((s,x) => s + x.views, 0);
  const revenue = last.reduce((s,x) => s + x.revenue, 0);
  const rpm = views > 0 ? (revenue / views * 1000) : 0;

  return { views, revenue, rpm };
}

function statusClass(status) {
  if (status === 'ON') return 'on';
  if (status === 'OFF') return 'off';
  if (status === '심사중') return 'review';
  if (status === '제한') return 'limit';
  return '';
}

function getChannelNameById(channelId) {
  const found = manageData.find(m => m.channelId === channelId);
  if (found && found.name) return found.name;

  // manageData가 아직 로드되기 전이라면, allData의 채널명 사용
  const any = allData.find(d => d.channelId === channelId);
  return any ? any.channel : '';
}

/* =========================
   채널 건강도 배너(최근7일 vs 28일)
========================= */
function updateHealthBanner() {
  const el = document.getElementById('healthBanner');
  if (!el) return;

  const sorted = [...allData].sort((a,b) => a.date.localeCompare(b.date));
  if (sorted.length < 14) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  const last7 = sorted.slice(-7);
  const prev28 = sorted.slice(-35, -7); // 28일(가능하면)

  if (prev28.length < 14) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  const sum = (arr) => ({
    views: arr.reduce((s,x)=>s+x.views,0),
    revenue: arr.reduce((s,x)=>s+x.revenue,0),
  });

  const a = sum(last7);
  const b = sum(prev28);

  const rpm7 = a.views ? (a.revenue/a.views*1000) : 0;
  const rpm28 = b.views ? (b.revenue/b.views*1000) : 0;

  const rev7avg = a.revenue / 7;
  const rev28avg = b.revenue / prev28.length;

  const warnings = [];

  if (rpm28 > 0 && rpm7 < rpm28 * 0.7) {
    warnings.push(`RPM 급락: 최근7일 ₩${rpm7.toFixed(1)} (28일평균 ₩${rpm28.toFixed(1)} 대비 -30%↑)`);
  }
  if (rev28avg > 0 && rev7avg < rev28avg * 0.7) {
    warnings.push(`수익 급락: 최근7일 일평균 ₩${Math.round(rev7avg).toLocaleString()} (28일평균 ₩${Math.round(rev28avg).toLocaleString()} 대비 -30%↑)`);
  }

  if (warnings.length === 0) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  el.classList.remove('hidden');
  el.innerHTML = `<strong>⚠️ 채널 건강도 경고</strong> ${warnings.join(' · ')}`;
}

/* =========================
   유틸
========================= */
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function updateLastUpdateTime() {
  const now = new Date();
  document.getElementById('lastUpdate').textContent = now.toLocaleString('ko-KR');
}

function showLoading() { /* 옵션 */ }
function hideLoading() { /* 옵션 */ }

function escapeHtml(s='') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

function escapeAttr(s='') {
  // onclick 인자용: HTML escape + 안전 처리
  return escapeHtml(s).replaceAll(' ', '%20');
}
