// ===== 기존(대시보드 읽기용) =====
const SPREADSHEET_ID = '103b7b86DIRP6CiHpVUi6gSkjxJ8uWXjYnudlKjhKYaI';
const API_KEY = 'AIzaSyBwudOxtEn7Z8xO5ahXgbxzKjj6uHaVqh4';
const SHEET_NAME = '일별데이터';
const SHEET_MANAGE = '채널관리';

let allData = [];
let charts = {};
let manageData = [];
let manageFiltered = [];

// ===== 할 일(Task) =====
let tasks = [];

const ADMIN_PASS_KEY = 'ADMIN_PASS_SESSION'; // sessionStorage key

document.addEventListener('DOMContentLoaded', function() {
  loadData();
});

function switchTab(tab) {
  const dash = document.getElementById('dashboardSection');
  const manage = document.getElementById('manageSection');
  const tasksSection = document.getElementById('tasksSection');
  const routineSection = document.getElementById('routineSection');

  const btnD = document.getElementById('tabDashboard');
  const btnM = document.getElementById('tabManage');
  const btnT = document.getElementById('tabTasks');
  const btnR = document.getElementById('tabRoutine');

  // reset
  dash.classList.add('hidden');
  manage.classList.add('hidden');
  tasksSection.classList.add('hidden');
  routineSection.classList.add('hidden');

  btnD.classList.remove('active');
  btnM.classList.remove('active');
  btnT.classList.remove('active');
  btnR.classList.remove('active');

  if (tab === 'manage') {
    manage.classList.remove('hidden');
    btnM.classList.add('active');

  } else if (tab === 'tasks') {
    tasksSection.classList.remove('hidden');
    btnT.classList.add('active');

    if (!manageData || manageData.length === 0) {
      loadManageData().then(() => {
        populateTaskChannelSelect();
      });
    } else {
      populateTaskChannelSelect();
    }

    loadTasks();

  } else if (tab === 'routine') {
    routineSection.classList.remove('hidden');
    btnR.classList.add('active');
    loadRoutines(); // <-- 루틴 로더(아래에서 구현 필요)

  } else {
    dash.classList.remove('hidden');
    btnD.classList.add('active');
  }
}

// =========================
// 대시보드(수익 데이터)
// =========================
async function loadData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.values) {
      allData = parseSheetData(data.values);
      updateDashboard();
      updateLastUpdateTime();
      await loadManageData();
    }
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    alert('데이터를 불러오는데 실패했습니다.');
  }
}

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
      // 드롭다운도 비움
      populateTaskChannelSelect();
      return;
    }

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

    populateTaskChannelSelect(); // ✅ 할 일 채널 드롭다운 채우기

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
    const btn = document.getElementById('openSheetBtn');
    if (btn) btn.href = sheetUrl;
  } catch (e) {
    console.error('채널관리 로드 오류:', e);
  }
}

// 일별데이터: 날짜 | channel_id | 채널명 | 조회수 | 수익 | RPM
function parseSheetData(values) {
  const rows = values.slice(1);
  return rows.map(row => ({
    date: row[0],
    channelId: row[1],
    channel: row[2],
    views: parseInt(row[3]) || 0,
    revenue: parseInt(row[4]) || 0,
    rpm: parseFloat(row[5]) || 0
  })).filter(x => x.date);
}

function updateDashboard() {
  updateStats();
  updateChannelCards();
  updateCharts();
  updateTable();
  updateChannelFilter();
  updateHealthBanner(); // 건강도 배너(전체 기준)
}

function updateStats() {
  const thisMonth = getCurrentMonth();
  const monthData = allData.filter(d => (d.date || '').startsWith(thisMonth));
  const totalRevenue = monthData.reduce((sum, d) => sum + d.revenue, 0);
  const totalViews = monthData.reduce((sum, d) => sum + d.views, 0);
  const avgRpm = totalViews > 0 ? (totalRevenue / totalViews * 1000) : 0;
  const channels = [...new Set(allData.map(d => d.channelId).filter(Boolean))];

  document.getElementById('totalRevenue').textContent = `₩${totalRevenue.toLocaleString()}`;
  document.getElementById('totalViews').textContent = totalViews.toLocaleString();
  document.getElementById('avgRpm').textContent = `₩${avgRpm.toFixed(1)}`;
  document.getElementById('activeChannels').textContent = channels.length;
}

function updateChannelCards() {
  const thisMonth = getCurrentMonth();
  const channelIds = [...new Set(allData.map(d => d.channelId).filter(Boolean))];
  const container = document.getElementById('channelCards');

  container.innerHTML = channelIds.map(cid => {
    const channelName = getChannelNameById(cid) || cid;
    const channelData = allData.filter(d => d.channelId === cid && (d.date || '').startsWith(thisMonth));
    const totalRevenue = channelData.reduce((sum, d) => sum + d.revenue, 0);
    const totalViews = channelData.reduce((sum, d) => sum + d.views, 0);
    const avgRpm = totalViews > 0 ? (totalRevenue / totalViews * 1000) : 0;

    return `
      <div class="channel-card">
        <h3>${escapeHtml(channelName)}</h3>
        <div class="metric"><span class="metric-label">총 수익</span><span class="metric-value">₩${totalRevenue.toLocaleString()}</span></div>
        <div class="metric"><span class="metric-label">총 조회수</span><span class="metric-value">${totalViews.toLocaleString()}</span></div>
        <div class="metric"><span class="metric-label">평균 RPM</span><span class="metric-value">₩${avgRpm.toFixed(1)}</span></div>
        <div class="metric"><span class="metric-label">데이터 수</span><span class="metric-value">${channelData.length}일</span></div>
      </div>
    `;
  }).join('');
}

function updateCharts() {
  updateRevenueChart();
  updateChannelComparisonChart();
  updateMonthlyRevenueChart();
}

function updateRevenueChart() {
  const ctx = document.getElementById('revenueChart');
  const last30Days = allData.slice(-30);
  const channelIds = [...new Set(last30Days.map(d => d.channelId).filter(Boolean))];
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
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₩' + v.toLocaleString() } } }
    }
  });
}

function updateChannelComparisonChart() {
  const ctx = document.getElementById('channelComparisonChart');
  const thisMonth = getCurrentMonth();
  const channelIds = [...new Set(allData.map(d => d.channelId).filter(Boolean))];

  const labels = channelIds.map(cid => getChannelNameById(cid) || cid);
  const revenues = channelIds.map(cid => {
    const channelData = allData.filter(d => d.channelId === cid && (d.date || '').startsWith(thisMonth));
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
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₩' + v.toLocaleString() } } }
    }
  });
}

// ===== 월별 수익 차트 =====
function updateMonthlyRevenueChart() {
  const ctx = document.getElementById('monthlyRevenueChart');
  if (!ctx) return;

  const periodSelect = document.getElementById('monthlyPeriodFilter');
  const periodValue = periodSelect ? periodSelect.value : '6';
  
  // 일별 데이터를 월별로 집계
  const monthlyMap = {};
  
  allData.forEach(item => {
    if (!item.date) return;
    
    // 날짜에서 연월 추출 (예: "2024-01-15" → "2024-01")
    const yearMonth = item.date.substring(0, 7);
    
    if (!monthlyMap[yearMonth]) {
      monthlyMap[yearMonth] = {
        revenue: 0,
        views: 0,
        count: 0
      };
    }
    
    monthlyMap[yearMonth].revenue += item.revenue;
    monthlyMap[yearMonth].views += item.views;
    monthlyMap[yearMonth].count += 1;
  });
  
  // 정렬 및 기간 필터링
  let sortedMonths = Object.keys(monthlyMap).sort();
  
  if (periodValue !== 'all') {
    const numMonths = parseInt(periodValue);
    sortedMonths = sortedMonths.slice(-numMonths);
  }
  
  // 라벨 생성 (예: "2024-01" → "2024년 1월")
  const labels = sortedMonths.map(ym => {
    const [year, month] = ym.split('-');
    return `${year}년 ${parseInt(month)}월`;
  });
  
  // 수익 데이터
  const revenues = sortedMonths.map(ym => monthlyMap[ym].revenue);
  
  // 이번 달 강조를 위한 색상
  const currentYearMonth = getCurrentMonth(); // "2024-01" 형식
  const backgroundColors = sortedMonths.map(ym => 
    ym === currentYearMonth 
      ? 'rgba(72, 187, 120, 0.7)'  // 이번 달: 초록색
      : 'rgba(66, 153, 225, 0.7)'  // 그 외: 파란색
  );
  
  const borderColors = sortedMonths.map(ym => 
    ym === currentYearMonth 
      ? 'rgba(72, 187, 120, 1)' 
      : 'rgba(66, 153, 225, 1)'
  );
  
  // 기존 차트 삭제
  if (charts.monthly) charts.monthly.destroy();
  
  // 새 차트 생성
  charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '월별 수익',
        data: revenues,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              return '수익: ₩' + value.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₩' + value.toLocaleString();
            }
          }
        }
      }
    }
  });
}

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

function updateChannelFilter() {
  const select = document.getElementById('channelFilter');
  const channels = [...new Set(allData.map(d => d.channel).filter(Boolean))];
  select.innerHTML = '<option value="all">전체 채널</option>' +
    channels.map(ch => `<option value="${escapeHtml(ch)}">${escapeHtml(ch)}</option>`).join('');
}

function filterData() {
  const selected = document.getElementById('channelFilter').value;
  const tbody = document.getElementById('tableBody');
  let filteredData = allData;
  if (selected !== 'all') filteredData = allData.filter(d => d.channel === selected);
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

// ===== 채널관리(기존) =====
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

  document.getElementById('manageDetail').classList.remove('hidden');
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

  const s = calcRecentSummary(item.channelId, 7);
  document.getElementById('kpi7Views').textContent = s.views.toLocaleString();
  document.getElementById('kpi7Revenue').textContent = `₩${s.revenue.toLocaleString()}`;
  document.getElementById('kpi7Rpm').textContent = `₩${s.rpm.toFixed(1)}`;
}

function closeDetail() {
  document.getElementById('manageDetail')?.classList.add('hidden');
}

function calcRecentSummary(channelId, days) {
  const sorted = [...allData].filter(d => d.channelId === channelId).sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.slice(-days);
  const views = last.reduce((s, x) => s + x.views, 0);
  const revenue = last.reduce((s, x) => s + x.revenue, 0);
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
  const m = manageData.find(x => x.channelId === channelId);
  if (m && m.name) return m.name;
  const any = allData.find(d => d.channelId === channelId);
  return any ? any.channel : '';
}

// ===== 할 일(Task) 채널 드롭다운 =====
function populateTaskChannelSelect() {
  const sel = document.getElementById('newChannelId');
  if (!sel) return;

  const items = (manageData || [])
    .filter(m => (m.channelId || '').trim() && (m.name || '').trim())
    .map(m => ({ id: (m.channelId || '').trim(), name: (m.name || '').trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));

  sel.innerHTML =
    `<option value="">(채널 선택)</option>` +
    items.map(x => `<option value="${escapeAttr(x.id)}">${escapeHtml(x.name)}</option>`).join('');

  onScopeChange(); // scope에 맞춰 disabled 상태 동기화
}

function onScopeChange() {
  const scope = document.getElementById('newScope')?.value || 'ALL';
  const sel = document.getElementById('newChannelId');
  if (!sel) return;

  const needChannel = (scope === 'CHANNEL');
  sel.disabled = !needChannel;
  if (!needChannel) sel.value = '';
}

// =========================
// 할 일(Task) - 읽기/쓰기
// =========================
function setAdminPass() {
  const v = document.getElementById('adminPassInput').value || '';
  if (!v) { alert('비밀번호를 입력하세요.'); return; }
  sessionStorage.setItem(ADMIN_PASS_KEY, v);
  document.getElementById('adminPassInput').value = '';
  alert('관리자 모드 ON (세션)');
  refreshAdminUI();
}

function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_PASS_KEY);
  alert('로그아웃 완료');
  refreshAdminUI();
}

function getAdminPass() {
  return sessionStorage.getItem(ADMIN_PASS_KEY) || '';
}

function refreshAdminUI() {
  const isAdmin = !!getAdminPass();
  const btn = document.getElementById('btnOpenCreate');
  if (btn) btn.disabled = !isAdmin;
  const form = document.getElementById('createForm');
  if (!isAdmin && form) form.classList.add('hidden');
}

function toggleCreateForm(open) {
  const isAdmin = !!getAdminPass();
  if (!isAdmin) { alert('관리자 모드를 먼저 켜주세요.'); return; }

  document.getElementById('createForm').classList.toggle('hidden', !open);

  if (open) {
    onCategoryChange();
    populateTaskChannelSelect();
    onScopeChange();
  }
}

function onCategoryChange() {
  const category = document.getElementById('newCategory').value;
  const scope = document.getElementById('newScope');
  if (category === '개인') {
    scope.value = 'PERSONAL';
  } else {
    if (scope.value === 'PERSONAL') scope.value = 'ALL';
  }
  onScopeChange();
}

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'failed');
    tasks = j.tasks || [];
    renderTasks();
    refreshAdminUI();
  } catch (e) {
    console.error(e);
    alert('할 일 로드 실패: ' + e.message);
  }
}

function normalizeTask(t) {
  return {
    task_id: t.task_id || '',
    category: t.category || '',
    channel_scope: t.channel_scope || '',
    channel_id: t.channel_id || '',
    title: t.title || '',
    status: t.status || 'TODO',
    priority: t.priority || 'P1',
    due_date: t.due_date || '',
    tags: t.tags || '',
    memo: t.memo || '',
    done_at: t.done_at || ''
  };
}

function isOverdue(due) {
  if (!due) return false;
  const t = new Date().toISOString().slice(0, 10);
  return due < t;
}

function isToday(due) {
  if (!due) return false;
  const t = new Date().toISOString().slice(0, 10);
  return due === t;
}

function renderTasks() {
  const cat = document.getElementById('taskCategory').value;
  const st = document.getElementById('taskStatus').value;
  const pr = document.getElementById('taskPriority').value;
  const q = (document.getElementById('taskSearch').value || '').toLowerCase().trim();

  const list = tasks.map(normalizeTask).filter(t => {
    if (t.status === 'DELETED') return false; // ✅ 숨김 삭제
    const okCat = (cat === 'all') || t.category === cat;
    const okSt = (st === 'all') || t.status === st;
    const okPr = (pr === 'all') || t.priority === pr;
    const hay = `${t.title} ${t.memo} ${t.tags}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    return okCat && okSt && okPr && okQ;
  });

  // today/overdue
  const todayBox = document.getElementById('todayTasks');
  const todayList = list.filter(t =>
    (t.status !== 'DONE') && (isToday(t.due_date) || isOverdue(t.due_date))
  ).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  todayBox.innerHTML = todayList.length ? todayList.map(t => `
    <div class="task-item">
      <div class="task-left">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">${escapeHtml(t.category)} · ${escapeHtml(t.priority)} · ${t.due_date ? `마감 ${t.due_date}` : '마감 없음'}</div>
      </div>
      <div class="task-right">
        ${renderStatusSelect(t)}
        ${renderDoneButton(t)}
      </div>
    </div>
  `).join('') : `<div class="hint">오늘/지연된 할 일이 없습니다.</div>`;

  // table
  const tbody = document.getElementById('tasksTbody');
  tbody.innerHTML = list
    .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))
    .map(t => `
      <tr>
        <td>${renderDoneCheckbox(t)}</td>
        <td>${escapeHtml(t.category)}</td>
        <td>
          <span class="task-title" title="${escapeAttr(t.title || '')}">
            ${escapeHtml(t.title || '')}
          </span>
        </td>
        <td>${renderStatusSelect(t)}</td>
        <td>${renderPrioritySelect(t)}</td>
        <td>${t.due_date ? t.due_date : '-'}</td>
        <td>${
          t.channel_scope === 'CHANNEL'
            ? escapeHtml(getChannelNameById(t.channel_id) || t.channel_id)
            : escapeHtml(t.channel_scope)
        }</td>
        <td>${escapeHtml(t.tags)}</td>
        <td>
          <button class="btn" onclick="openEditModal('${escapeAttr(t.task_id)}')">편집</button>
          <button class="btn danger" onclick="deleteTaskQuick('${escapeAttr(t.task_id)}')">삭제</button>
        </td>
      </tr>
    `).join('');
}

function renderDoneCheckbox(t) {
  const disabled = !getAdminPass() ? 'disabled' : '';
  const checked = (t.status === 'DONE') ? 'checked' : '';
  return `<input type="checkbox" ${checked} ${disabled} onchange="toggleDone('${escapeAttr(t.task_id)}', this.checked)" />`;
}

function renderDoneButton(t) {
  const disabled = !getAdminPass() ? 'disabled' : '';
  return `<button class="btn" ${disabled} onclick="markDone('${escapeAttr(t.task_id)}')">✅ DONE</button>`;
}

function renderStatusSelect(t) {
  const disabled = !getAdminPass() ? 'disabled' : '';
  const opts = ['TODO', 'DOING', 'DONE', 'HOLD']
    .map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('');
  return `<select class="select" ${disabled} onchange="updateTaskStatus('${escapeAttr(t.task_id)}', this.value)">${opts}</select>`;
}

function renderPrioritySelect(t) {
  const disabled = !getAdminPass() ? 'disabled' : '';
  const opts = ['P0', 'P1', 'P2']
    .map(p => `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('');
  return `<select class="select" ${disabled} onchange="updateTaskPriority('${escapeAttr(t.task_id)}', this.value)">${opts}</select>`;
}

async function apiPatch(payload) {
  const pass = getAdminPass();
  if (!pass) { alert('관리자 모드를 켜주세요.'); throw new Error('no admin'); }

  const res = await fetch('/api/tasks', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-pass': pass },
    body: JSON.stringify(payload)
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'patch failed');
}

async function apiPost(payload) {
  const pass = getAdminPass();
  if (!pass) { alert('관리자 모드를 켜주세요.'); throw new Error('no admin'); }

  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-pass': pass },
    body: JSON.stringify(payload)
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'post failed');
}

async function createTask() {
  const category = document.getElementById('newCategory').value;
  const title = (document.getElementById('newTitle').value || '').trim();
  const priority = document.getElementById('newPriority').value;
  const due_date = (document.getElementById('newDue').value || '').trim();
  const channel_scope = document.getElementById('newScope').value;
  const channel_id = (document.getElementById('newChannelId').value || '').trim();
  const tags = (document.getElementById('newTags').value || '').trim();
  const memo = (document.getElementById('newMemo').value || '').trim();

  if (!title) { alert('제목은 필수입니다.'); return; }

  // 개인이면 scope 강제 PERSONAL
  let scope = channel_scope;
  let cid = channel_id;
  if (category === '개인') {
    scope = 'PERSONAL';
    cid = '';
  } else {
    if (scope === 'CHANNEL' && !cid) {
      alert('업무 scope=CHANNEL이면 채널을 선택하세요.');
      return;
    }
  }

  await apiPost({
    category,
    title,
    status: 'TODO',
    priority,
    due_date,
    channel_scope: scope,
    channel_id: cid,
    tags,
    memo
  });

  // 폼 초기화
  document.getElementById('newTitle').value = '';
  document.getElementById('newDue').value = '';
  document.getElementById('newChannelId').value = '';
  document.getElementById('newTags').value = '';
  document.getElementById('newMemo').value = '';

  onScopeChange();
  toggleCreateForm(false);
  await loadTasks();
}

async function markDone(task_id) {
  await apiPatch({ task_id, done: true });
  await loadTasks();
}

async function toggleDone(task_id, checked) {
  if (checked) {
    await apiPatch({ task_id, done: true });
  } else {
    await apiPatch({ task_id, done: false, status: 'TODO' });
  }
  await loadTasks();
}

async function updateTaskStatus(task_id, status) {
  await apiPatch({ task_id, status });
  await loadTasks();
}

async function updateTaskPriority(task_id, priority) {
  await apiPatch({ task_id, priority });
  await loadTasks();
}

// ===== 건강도 배너(현재는 전체 기준) =====
function updateHealthBanner() {
  const el = document.getElementById('healthBanner');
  if (!el) return;

  const sorted = [...allData].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 35) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  const last7 = sorted.slice(-7);
  const prev28 = sorted.slice(-35, -7);

  const sum = arr => ({
    views: arr.reduce((s, x) => s + x.views, 0),
    revenue: arr.reduce((s, x) => s + x.revenue, 0)
  });

  const a = sum(last7);
  const b = sum(prev28);
  const rpm7 = a.views ? (a.revenue / a.views * 1000) : 0;
  const rpm28 = b.views ? (b.revenue / b.views * 1000) : 0;

  const rev7avg = a.revenue / 7;
  const rev28avg = b.revenue / prev28.length;

  const warnings = [];
  if (rpm28 > 0 && rpm7 < rpm28 * 0.7) warnings.push(`RPM 급락: 최근7일 ₩${rpm7.toFixed(1)} (28일평균 ₩${rpm28.toFixed(1)} 대비 -30%↑)`);
  if (rev28avg > 0 && rev7avg < rev28avg * 0.7) warnings.push(`수익 급락: 최근7일 일평균 ₩${Math.round(rev7avg).toLocaleString()} (28일평균 ₩${Math.round(rev28avg).toLocaleString()} 대비 -30%↑)`);

  if (!warnings.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.innerHTML = `<strong>⚠️ 채널 건강도 경고</strong> ${warnings.join(' · ')}`;
}

// ===== 유틸 =====
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function updateLastUpdateTime() {
  document.getElementById('lastUpdate').textContent = new Date().toLocaleString('ko-KR');
}
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeAttr(s = '') {
  // channel_id(UC...)는 공백이 없어서 사실상 안전하지만, 최소한의 처리
  return escapeHtml(s).replaceAll(' ', '%20');
}

// ===== 할 일 편집 모달 =====
function openEditModal(taskId) {
  const t = tasks.map(normalizeTask).find(x => x.task_id === taskId);
  if (!t) { alert('대상을 찾지 못했습니다.'); return; }

  document.getElementById('editTaskId').value = t.task_id;
  document.getElementById('editTitle').value = t.title || '';
  document.getElementById('editDue').value = t.due_date || '';
  document.getElementById('editTags').value = t.tags || '';
  document.getElementById('editMemo').value = t.memo || '';

  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal')?.classList.add('hidden');
}

async function saveEditModal() {
  const task_id = (document.getElementById('editTaskId').value || '').trim();
  const title = (document.getElementById('editTitle').value || '').trim();
  const due_date = (document.getElementById('editDue').value || '').trim();
  const tags = (document.getElementById('editTags').value || '').trim();
  const memo = (document.getElementById('editMemo').value || '').trim();

  if (!task_id) { alert('task_id 없음'); return; }
  if (!title) { alert('제목은 필수입니다.'); return; }

  await apiPatch({ task_id, title, due_date, tags, memo });

  closeEditModal();
  await loadTasks();
}

async function deleteTaskQuick(taskId) {
  const ok = confirm('삭제할까요? (숨김 처리됩니다)');
  if (!ok) return;
  await apiPatch({ task_id: taskId, status: 'DELETED' });
  await loadTasks();
}

async function deleteTaskFromModal() {
  const task_id = (document.getElementById('editTaskId').value || '').trim();
  if (!task_id) return;

  const ok = confirm('삭제할까요? (숨김 처리됩니다)');
  if (!ok) return;

  await apiPatch({ task_id, status: 'DELETED' });
  closeEditModal();
  await loadTasks();
}

// ===== 루틴(Routine) =====
let routines = [];

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

function routineTypeLabel(t) {
  if (t === 'WORK') return '출근';
  if (t === 'WORKOUT') return '운동';
  return t || '-';
}

async function loadRoutines() {
  try {
    const res = await fetch('/api/routines');
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'failed');
    routines = j.items || [];
    renderRoutines();
  } catch (e) {
    console.error(e);
    alert('루틴 로드 실패: ' + e.message);
  }
}

function renderRoutines() {
  const tbody = document.getElementById('routineTbody');
  if (!tbody) return;

  const list = (routines || [])
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''));

  tbody.innerHTML = list.slice(0, 30).map(r => `
    <tr>
      <td>${escapeHtml(r.date || '-')}</td>
      <td>${escapeHtml(routineTypeLabel(r.type))}</td>
      <td>${escapeHtml(r.note || '')}</td>
      <td>${escapeHtml(r.created_at || '')}</td>
    </tr>
  `).join('');

  const t = todayYMD();
  const todayWork = list.find(x => x.date === t && x.type === 'WORK');
  const todayWorkout = list.find(x => x.date === t && x.type === 'WORKOUT');

  document.getElementById('todayWorkStat').textContent = todayWork ? 'OK(기록됨)' : '미기록';
  document.getElementById('todayWorkoutStat').textContent = todayWorkout ? 'OK(기록됨)' : '미기록';
  document.getElementById('routineComment').textContent = buildRoutineComment(list);
}

function buildRoutineComment(list) {
  // 현실적인 매니저 톤(짧게, 팩트)
  const t = todayYMD();
  const last7Start = new Date();
  last7Start.setDate(last7Start.getDate() - 6);
  const startYMD = last7Start.toISOString().slice(0, 10);

  const in7 = (list || []).filter(x => (x.date || '') >= startYMD && (x.date || '') <= t);
  const workDays = new Set(in7.filter(x => x.type === 'WORK').map(x => x.date)).size;
  const workoutDays = new Set(in7.filter(x => x.type === 'WORKOUT').map(x => x.date)).size;

  const todayWork = in7.some(x => x.date === t && x.type === 'WORK');
  const todayWorkout = in7.some(x => x.date === t && x.type === 'WORKOUT');

  const todayNotes = in7.filter(x => x.date === t).map(x => (x.note || '').toLowerCase()).join(' ');
  const lowSignalWords = ['하기싫', '귀찮', '피곤', '힘들', '짜증', '무기력', '포기'];
  const hasLowSignal = lowSignalWords.some(w => todayNotes.includes(w));

  if (!todayWork && !todayWorkout) return '오늘 기록 0. 버튼 누르고 한 줄만 남겨.';
  if (!todayWork) return '출근 기록 빠짐. 시작부터 찍어.';
  if (!todayWorkout) return '운동 기록 없음. 10분이라도 했으면 적어. 안 했으면 내일 계획 써.';

  if (workDays >= 5 && workoutDays >= 3) return `7일: 출근 ${workDays}/7, 운동 ${workoutDays}/7. 유지.`;
  if (workDays >= 5 && workoutDays <= 1) return `출근은 됨( ${workDays}/7 ). 운동은 없음( ${workoutDays}/7 ). 보완해.`;
  if (workDays <= 3 && workoutDays >= 3) return `운동은 했는데( ${workoutDays}/7 ), 업무 루틴 약함( ${workDays}/7 ). 정리해.`;
  if (workDays <= 3 && workoutDays <= 1) return `7일: 출근 ${workDays}/7, 운동 ${workoutDays}/7. 루틴 붕괴.`;

  if (hasLowSignal) return '컨디션 저하 신호. 오늘은 최소 단위만.';
  return `기록은 했음(출근 ${workDays}/7, 운동 ${workoutDays}/7). 내일도 동일하게.`;
}

function openRoutineModal(type) {
  const pass = getAdminPass();
  if (!pass) {
    alert('관리자 모드를 먼저 켜주세요.');
    return;
  }

  const t = todayYMD();
  const found = (routines || []).find(x => x.date === t && x.type === type);

  document.getElementById('routineType').value = type;
  document.getElementById('routineNote').value = found ? (found.note || '') : '';

  // editMode: '1'이면 PATCH, 아니면 POST
  if (!document.getElementById('routineEditMode')) {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'routineEditMode';
    document.body.appendChild(hidden);
  }
  document.getElementById('routineEditMode').value = found ? '1' : '0';

  const isEdit = !!found;
  document.getElementById('routineModalTitle').textContent =
    (type === 'WORK')
      ? (isEdit ? '출근 기록 수정' : '출근 기록')
      : (isEdit ? '운동 기록 수정' : '운동 기록');

  document.getElementById('routineModal').classList.remove('hidden');
}

function closeRoutineModal() {
  document.getElementById('routineModal')?.classList.add('hidden');
}

async function saveRoutine() {
  const pass = getAdminPass();
  if (!pass) { alert('관리자 모드를 먼저 켜주세요.'); return; }

  const type = (document.getElementById('routineType').value || '').trim();
  const note = (document.getElementById('routineNote').value || '').trim();
  const editMode = (document.getElementById('routineEditMode')?.value || '0') === '1';

  if (!type) { alert('type 누락'); return; }
  if (!note) { alert('메모를 한 줄이라도 적어.'); return; }

  const method = editMode ? 'PATCH' : 'POST';

  const res = await fetch('/api/routines', {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-pass': pass },
    body: JSON.stringify({ type, note })
  });

  const j = await res.json();

  if (!j.ok) {
    // POST에서 이미 있으면 안내: 수정으로 유도
    if (res.status === 409) {
      alert('오늘은 이미 기록이 있어. “수정”으로 변경해서 저장해.');
    } else {
      alert('저장 실패: ' + (j.error || 'unknown'));
    }
    return;
  }

  closeRoutineModal();
  await loadRoutines();
}
