// Google Sheets API 설정
const SPREADSHEET_ID = '103b7b86DIRP6CiHpVUi6gSkjxJ8uWXjYnudlKjhKYaI'; // 나중에 변경
const API_KEY = 'AIzaSyBwudOxtEn7Z8xO5ahXgbxzKjj6uHaVqh4'; // 나중에 변경
const SHEET_NAME = '일별데이터';

let allData = [];
let charts = {};

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
    loadData();
});

// 데이터 로드
async function loadData() {
    try {
        showLoading();
        
        // Google Sheets API 호출
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.values) {
            allData = parseSheetData(data.values);
            updateDashboard();
            updateLastUpdateTime();
        }
        
        hideLoading();
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        alert('데이터를 불러오는데 실패했습니다.');
        hideLoading();
    }
}

// 시트 데이터 파싱
function parseSheetData(values) {
    const headers = values[0];
    const rows = values.slice(1);
    
    return rows.map(row => ({
        date: row[0],
        channel: row[1],
        views: parseInt(row[2]) || 0,
        revenue: parseInt(row[3]) || 0,
        rpm: parseFloat(row[4]) || 0
    }));
}

// 대시보드 업데이트
function updateDashboard() {
    updateStats();
    updateChannelCards();
    updateCharts();
    updateTable();
    updateChannelFilter();
}

// 통계 업데이트
function updateStats() {
    const thisMonth = getCurrentMonth();
    const monthData = allData.filter(d => d.date.startsWith(thisMonth));
    
    const totalRevenue = monthData.reduce((sum, d) => sum + d.revenue, 0);
    const totalViews = monthData.reduce((sum, d) => sum + d.views, 0);
    const avgRpm = totalViews > 0 ? (totalRevenue / totalViews * 1000) : 0;
    const channels = [...new Set(allData.map(d => d.channel))];
    
    document.getElementById('totalRevenue').textContent = `₩${totalRevenue.toLocaleString()}`;
    document.getElementById('totalViews').textContent = totalViews.toLocaleString();
    document.getElementById('avgRpm').textContent = `₩${avgRpm.toFixed(1)}`;
    document.getElementById('activeChannels').textContent = channels.length;
}

// 채널 카드 업데이트
function updateChannelCards() {
    const thisMonth = getCurrentMonth();
    const channels = [...new Set(allData.map(d => d.channel))];
    const container = document.getElementById('channelCards');
    
    container.innerHTML = channels.map(channel => {
        const channelData = allData.filter(d => 
            d.channel === channel && d.date.startsWith(thisMonth)
        );
        
        const totalRevenue = channelData.reduce((sum, d) => sum + d.revenue, 0);
        const totalViews = channelData.reduce((sum, d) => sum + d.views, 0);
        const avgRpm = totalViews > 0 ? (totalRevenue / totalViews * 1000) : 0;
        
        return `
            <div class="channel-card">
                <h3>${channel}</h3>
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

// 일별 수익 차트
function updateRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    const last30Days = allData.slice(-30);
    
    const channels = [...new Set(last30Days.map(d => d.channel))];
    const dates = [...new Set(last30Days.map(d => d.date))].sort();
    
    const datasets = channels.map((channel, index) => {
        const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea'];
        return {
            label: channel,
            data: dates.map(date => {
                const item = last30Days.find(d => d.date === date && d.channel === channel);
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
        data: {
            labels: dates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₩' + value.toLocaleString()
                    }
                }
            }
        }
    });
}

// 채널별 비교 차트
function updateChannelComparisonChart() {
    const ctx = document.getElementById('channelComparisonChart');
    const thisMonth = getCurrentMonth();
    const channels = [...new Set(allData.map(d => d.channel))];
    
    const revenues = channels.map(channel => {
        const channelData = allData.filter(d => 
            d.channel === channel && d.date.startsWith(thisMonth)
        );
        return channelData.reduce((sum, d) => sum + d.revenue, 0);
    });
    
    if (charts.comparison) charts.comparison.destroy();
    
    charts.comparison = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: channels,
            datasets: [{
                label: '이번 달 수익',
                data: revenues,
                backgroundColor: ['#4299e1', '#48bb78', '#ed8936', '#9f7aea']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₩' + value.toLocaleString()
                    }
                }
            }
        }
    });
}

// RPM 추이 차트
function updateRpmChart() {
    const ctx = document.getElementById('rpmChart');
    const last30Days = allData.slice(-30);
    
    const channels = [...new Set(last30Days.map(d => d.channel))];
    const dates = [...new Set(last30Days.map(d => d.date))].sort();
    
    const datasets = channels.map((channel, index) => {
        const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea'];
        return {
            label: channel,
            data: dates.map(date => {
                const item = last30Days.find(d => d.date === date && d.channel === channel);
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
        data: {
            labels: dates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₩' + value.toFixed(1)
                    }
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
            <td>${row.channel}</td>
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
            `<option value="${channel}">${channel}</option>`
        ).join('');
}

// 필터 적용
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
            <td>${row.channel}</td>
            <td>${row.views.toLocaleString()}</td>
            <td>₩${row.revenue.toLocaleString()}</td>
            <td>₩${row.rpm.toFixed(1)}</td>
        </tr>
    `).join('');
}

// 유틸리티 함수
function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function updateLastUpdateTime() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = 
        now.toLocaleString('ko-KR');
}

function showLoading() {
    // 로딩 표시 (옵션)
}

function hideLoading() {
    // 로딩 숨김 (옵션)
}
