// ==================== 旅遊助手 PWA ====================

// --- State ---
let scheduleData = [];
let randomPlaces = [];
let foodList = [];
let currentPosition = null;
let selectedDate = new Date();

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    applyStoredFontSize();
    initTabs();
    initClock();
    initLocation();
    initDateSelector();
    initButtons();
    initAI();
    initPullToRefresh();
    registerServiceWorker();
    // User select & data loading
    initUserSelect();
});

// --- Tabs ---
function initTabs() {
    // Bottom tab bar
    $$('.bottom-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.bottom-tab').forEach(b => b.classList.remove('active'));
            $$('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            $(`#tab-${btn.dataset.tab}`).classList.add('active');
            // Hide subpage when switching tabs
            const subpage = $('#more-subpage');
            if (subpage) subpage.style.display = 'none';
            const moreMenu = document.querySelector('#tab-more .more-menu');
            if (moreMenu) moreMenu.style.display = 'flex';
            // Reset explore filters to collapsed state
            if (btn.dataset.tab === 'explore') {
                updateRandomList();
                updateFoodList();
            }
        });
    });

    // Explore toggle (food / places)
    $$('.explore-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.explore-toggle-btn').forEach(b => b.classList.remove('active'));
            $$('.explore-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            $(`#explore-${btn.dataset.explore}`).classList.add('active');
        });
    });

    // More menu sub-pages
    $$('.more-menu-item[data-page]').forEach(item => {
        item.addEventListener('click', () => {
            openMoreSubpage(item.dataset.page);
        });
    });

    // Back button
    $('#more-back').addEventListener('click', () => {
        $('#more-subpage').style.display = 'none';
        document.querySelector('#tab-more .more-menu').style.display = 'flex';
    });
}

function openMoreSubpage(page) {
    const tpl = $(`#tpl-${page}`);
    if (!tpl) return;

    const content = $('#more-subpage-content');
    content.innerHTML = tpl.innerHTML;
    $('#more-subpage').style.display = 'block';
    document.querySelector('#tab-more .more-menu').style.display = 'none';

    // Re-initialize the sub-page functionality
    initSubpage(page);
}

function initSubpage(page) {
    switch (page) {
        case 'schedule-manage':
            initScheduleManage();
            break;
        case 'currency':
            initCurrency();
            break;
        case 'packing':
            initPackingList();
            renderPackingList();
            break;
        case 'emergency':
            initEmergencyFromSegments();
            break;
        case 'trip-dates':
            initCountdown();
            // Only load segments if not already loaded
            if (segments.length === 0) {
                loadSegments().then(() => {
                    initSegments();
                    if (segments.length > 0) {
                        loadTripWeatherBySegments();
                    } else {
                        loadTripWeather();
                    }
                });
            } else {
                initSegments();
                if (segments.length > 0) {
                    loadTripWeatherBySegments();
                } else {
                    loadTripWeather();
                }
            }
            break;
        case 'settings':
            initSettingsPage();
            break;
    }
}

function initSettingsPage() {
    const currentSize = localStorage.getItem('fontSize') || 'normal';
    $$('.font-size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === currentSize);
        btn.addEventListener('click', () => {
            setFontSize(btn.dataset.size);
            $$('.font-size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function setFontSize(size) {
    document.documentElement.classList.remove('font-normal', 'font-large', 'font-xlarge');
    document.documentElement.classList.add(`font-${size}`);
    localStorage.setItem('fontSize', size);
}

function applyStoredFontSize() {
    const size = localStorage.getItem('fontSize') || 'normal';
    document.documentElement.classList.add(`font-${size}`);
}

// --- Clock ---
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
    // Re-check current activity every minute
    setInterval(() => updateNowTab(), 60000);
}

function updateClock() {
    const now = new Date();
    $('#current-time').textContent = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    $('#current-date').textContent = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

// --- Location ---
let currentLocationName = '';

function initLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(
            (pos) => {
                currentPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                // Only reverse geocode once (or when refreshed)
                if (!currentLocationName) {
                    reverseGeocode(currentPosition.lat, currentPosition.lng);
                }
            },
            (err) => {
                $('#current-location').textContent = '📍 無法取得位置（請開啟定位權限）';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh`);
        if (!res.ok) return;
        const data = await res.json();
        const city = data.address.city || data.address.town || data.address.county || '';
        const country = data.address.country || '';
        if (city || country) {
            currentLocationName = country ? `${city}, ${country}` : city;
            $('#current-location').textContent = `📍 ${currentLocationName}`;
        } else {
            $('#current-location').textContent = '📍 目前位置已取得';
        }
    } catch (e) {
        $('#current-location').textContent = '📍 目前位置已取得';
    }
}

// --- Settings (loaded from Apps Script) ---
const CONFIG_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzQcoVLDmpAtDc-M8WWac5zMgrNgbOO_Aoupthms1nCfFvhKjIP4AKO5F8EP2wT4AI-/exec';
let currentUser = null;    

function getUserPassword() {
    return localStorage.getItem('userPassword_' + currentUser) || '';
}

function getAuthParams() {
    return `&user=${encodeURIComponent(currentUser)}&password=${encodeURIComponent(getUserPassword())}`;
}

async function initUserSelect() {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
        // Already has a saved user, try to load directly
        const savedPassword = localStorage.getItem('userPassword_' + saved);
        if (savedPassword !== null) {
            try {
                const config = JSON.parse(localStorage.getItem('userConfig_' + saved));
                if (config) {
                    currentUser = saved;
                    applyUserConfig(config);
                    showMainApp();
                    loadData();
                    return;
                }
            } catch (e) {}
        }
    }
    // Show user select screen
    await loadUserList();
}

async function loadUserList() {
    const container = $('#user-list');
    try {
        const res = await fetch(CONFIG_SCRIPT_URL + '?action=listUsers');
        const data = await res.json();

        if (!data.users || data.users.length === 0) {
            container.innerHTML = '<p class="hint">尚未設定任何用戶</p>';
            return;
        }

        container.innerHTML = data.users.map(name => `
            <button class="user-btn" onclick="selectUser('${name.replace(/'/g, "\\'")}')">${name}</button>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p class="hint">❌ 無法載入用戶列表，請檢查 Apps Script 連結</p>';
        console.error('Load users failed:', err);
    }
}

async function selectUser(name) {
    const password = prompt(`請輸入 ${name} 的密碼：`);
    if (password === null) return; // User cancelled

    showLoading(true);
    try {
        const res = await fetch(CONFIG_SCRIPT_URL + '?action=getConfig&user=' + encodeURIComponent(name) + '&password=' + encodeURIComponent(password));
        const config = await res.json();

        if (config.error) {
            alert('登入失敗：' + config.error);
            showLoading(false);
            return;
        }

        // Save to localStorage
        currentUser = name;
        localStorage.setItem('currentUser', name);
        localStorage.setItem('userPassword_' + name, password);
        localStorage.setItem('userConfig_' + name, JSON.stringify(config));
        localStorage.setItem('geminiApiKey', config.apiKey || '');

        applyUserConfig(config);
        showMainApp();
        showLoading(false);
        // Load data in background (won't block UI)
        loadData();
    } catch (err) {
        alert('讀取設定失敗：' + err.message);
        console.error(err);
        showLoading(false);
    }
}

function applyUserConfig(config) {
    // Store sheet settings for data loading
    window.SHEET_ID = config.sheetId || '';
    window.SHEET_NAME_SCHEDULE = config.sheetNameSchedule || '行程表';
    window.SHEET_NAME_RANDOM = config.sheetNameRandom || '隨機景點';
    window.SHEET_NAME_FOOD = config.sheetNameFood || '美食';

    // Apply trip dates
    localStorage.setItem('tripStartDate', config.tripStartDate || '');
    localStorage.setItem('tripEndDate', config.tripEndDate || '');

    // Apply hotel info
    localStorage.setItem('hotelAddress', config.hotelAddress || '');
    localStorage.setItem('hotelPhone', config.hotelPhone || '');
}

function showMainApp() {
    $('#user-select-screen').style.display = 'none';
    $('.app-header').style.display = 'flex';
    $('.bottom-tab-bar').style.display = 'flex';
    $('#current-user-name').textContent = currentUser;
    // Init tools only once
    if (!window._toolsInitialized) {
        window._toolsInitialized = true;
    }
    updateCountdownDisplay();
}

function switchUser() {
    localStorage.removeItem('currentUser');
    $('#user-select-screen').style.display = 'flex';
    $('.app-header').style.display = 'none';
    $('.bottom-tab-bar').style.display = 'none';
    loadUserList();
}

function loadSettings() {
    // No-op, settings loaded via user select
}

function saveSettings() {
    // No-op
}

function extractSheetId(input) {
    if (!input) return '';
    if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length > 20) {
        return input;
    }
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return '';
}

function getSheetCsvUrl(sheetId, sheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

// --- Data Loading ---
async function loadData() {
    const sheetId = window.SHEET_ID;
    if (!sheetId) return;

    // 1. 先從 localStorage 快取載入（秒開）
    const cached = localStorage.getItem('cachedAllData');
    if (cached) {
        try {
            const data = JSON.parse(cached);
            applyAllData(data);
        } catch (e) {}
        // Don't show loading if we have cache
    } else {
        showLoading(true);
    }

    // 2. 背景從 API 更新最新資料
    try {
        const res = await fetch(CONFIG_SCRIPT_URL + '?action=getAllData' + getAuthParams());
        const data = await res.json();

        if (data.error) {
            console.error('getAllData error:', data.error);
            if (!cached) showLoading(false);
            return;
        }

        // Save to cache
        localStorage.setItem('cachedAllData', JSON.stringify(data));
        applyAllData(data);
    } catch (err) {
        console.error('載入資料失敗:', err);
    }

    showLoading(false);
    updateCurrentWeather();
}

// Silent background refresh (no loading overlay)
async function silentLoadData() {
    try {
        const res = await fetch(CONFIG_SCRIPT_URL + '?action=getAllData' + getAuthParams());
        const data = await res.json();
        if (!data.error) {
            localStorage.setItem('cachedAllData', JSON.stringify(data));
            
            // Preserve pending items that aren't in the API response yet
            const pendingSchedule = scheduleData.filter(item => item._pending);
            
            applyAllData(data);
            
            // If there are still pending items not reflected in API, re-add them
            if (pendingSchedule.length > 0) {
                const newPlaces = scheduleData.map(s => s.place);
                pendingSchedule.forEach(p => {
                    if (!newPlaces.includes(p.place)) {
                        scheduleData.push(p);
                    }
                });
            }
            
            // Re-render schedule edit list if it's open
            const schedList = $('#schedule-edit-list');
            if (schedList) renderScheduleEditList();
        }
    } catch (e) {
        console.log('背景更新失敗:', e);
    }
}

function applyAllData(data) {
    if (data.schedule) {
        scheduleData = mapApiData(data.schedule, mapScheduleItem);
    }
    if (data.places) {
        randomPlaces = mapApiData(data.places, mapRandomPlace);
    }
    if (data.food) {
        foodList = mapApiData(data.food, mapFoodItem);
    }
    if (data.packing) {
        packingItems = mapApiData(data.packing, mapPackingItem);
    }
    if (data.segments) {
        segments = mapApiData(data.segments, mapSegmentItem);
    }

    updateNowTab();
    updateTimeline();
    updateRandomList();
    updateFoodList();
    renderPackingList();
}

// --- API Data Mapping ---
function mapApiData(arr, mapFn) {
    if (!Array.isArray(arr)) return [];
    return arr.map(mapFn).filter(Boolean);
}

function mapScheduleItem(row) {
    return {
        date: row['日期'] || row['date'] || '',
        startTime: row['開始時間'] || row['startTime'] || '',
        endTime: row['結束時間'] || row['endTime'] || '',
        place: row['地點'] || row['place'] || '',
        address: row['地址'] || row['address'] || '',
        notes: row['備註'] || row['notes'] || '',
        _uuid: row._uuid || '',
        _rowIndex: row._rowIndex
    };
}

function mapRandomPlace(row) {
    return {
        place: row['地點'] || row['place'] || '',
        address: row['地址'] || row['address'] || '',
        type: row['類型'] || row['type'] || '',
        notes: row['備註'] || row['notes'] || '',
        city: row['城市'] || row['city'] || '',
        _uuid: row._uuid || '',
        _rowIndex: row._rowIndex
    };
}

function mapFoodItem(row) {
    return {
        name: row['店名'] || row['name'] || '',
        hours: row['營業時間'] || row['hours'] || '',
        address: row['地址'] || row['address'] || '',
        type: row['類型'] || row['type'] || '',
        price: row['價位'] || row['price'] || '',
        rating: row['Google評分'] || row['評分'] || row['rating'] || '',
        queue: row['是否排隊'] || row['是否需排隊'] || row['排隊'] || row['queue'] || '',
        recommend: row['推薦餐點'] || row['推薦'] || row['recommend'] || '',
        area: row['地區'] || row['區域'] || row['area'] || '',
        notes: row['備註'] || row['notes'] || '',
        city: row['城市'] || row['city'] || '',
        _uuid: row._uuid || '',
        _rowIndex: row._rowIndex
    };
}

function mapPackingItem(row, idx) {
    return {
        id: idx,
        item: row['物品'] || row['item'] || '',
        category: row['分類'] || row['category'] || '',
        _uuid: row._uuid || '',
        _rowIndex: row._rowIndex
    };
}

function mapSegmentItem(row, idx) {
    return {
        idx,
        name: row['段落名'] || row['名稱'] || row['name'] || '',
        country: row['國家'] || row['country'] || '',
        city: row['城市'] || row['city'] || '',
        lat: parseFloat(row['緯度'] || row['lat']) || 0,
        lng: parseFloat(row['經度'] || row['lng']) || 0,
        startDate: toInputDate(row['開始日'] || row['開始日期'] || row['startDate'] || ''),
        endDate: toInputDate(row['結束日'] || row['結束日期'] || row['endDate'] || ''),
        hotelName: row['住宿名稱'] || row['飯店名稱'] || row['hotelName'] || '',
        hotelAddress: row['住宿地址'] || row['飯店地址'] || row['hotelAddress'] || '',
        hotelPhone: row['住宿電話'] || row['飯店電話'] || row['hotelPhone'] || '',
        _uuid: row._uuid || '',
        _rowIndex: row._rowIndex
    };
}
// --- CSV Parsing ---
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function parseScheduleCSV(csv) {
    // DEPRECATED: kept as fallback, prefer mapApiData
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Skip header
    return lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return {
            date: cols[0] || '',
            startTime: cols[1] || '',
            endTime: cols[2] || '',
            place: cols[3] || '',
            address: cols[4] || '',
            notes: cols[5] || ''
        };
    }).filter(item => item.date && item.place);
}

function parseRandomCSV(csv) {
    // DEPRECATED: kept as fallback, prefer mapApiData
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return {
            place: cols[0] || '',
            address: cols[1] || '',
            type: cols[2] || '',
            notes: cols[3] || '',
            city: cols[4] || ''
        };
    }).filter(item => item.place);
}

function parseFoodCSV(csv) {
    // DEPRECATED: kept as fallback, prefer mapApiData
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return {
            name: cols[0] || '',
            hours: cols[1] || '',
            address: cols[2] || '',
            type: cols[3] || '',
            price: cols[4] || '',
            rating: cols[5] || '',
            queue: cols[6] || '',
            recommend: cols[7] || '',
            area: cols[8] || '',
            notes: cols[9] || '',
            city: cols[10] || ''
        };
    }).filter(item => item.name);
}

// --- Now Tab ---
function updateNowTab() {
    const now = new Date();
    const today = formatDate(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todaySchedule = scheduleData.filter(item => normalizeDate(item.date) === today);

    let currentActivity = null;
    let nextActivity = null;

    for (let i = 0; i < todaySchedule.length; i++) {
        const item = todaySchedule[i];
        const start = timeToMinutes(item.startTime);
        const end = timeToMinutes(item.endTime);

        if (currentMinutes >= start && currentMinutes < end) {
            currentActivity = item;
            nextActivity = todaySchedule[i + 1] || null;
            break;
        } else if (currentMinutes < start) {
            nextActivity = item;
            break;
        }
    }

    // Update current activity card
    if (currentActivity) {
        $('#now-place').textContent = currentActivity.place;
        $('#now-time-range').textContent = `⏰ ${currentActivity.startTime} - ${currentActivity.endTime}`;
        $('#now-notes').textContent = currentActivity.notes ? `📝 ${currentActivity.notes}` : '';
        $('#navigate-now').onclick = () => navigateTo(currentActivity.address || currentActivity.place);
        $('#current-activity').style.display = 'block';
    } else {
        $('#now-place').textContent = '目前沒有行程';
        $('#now-time-range').textContent = '';
        $('#now-notes').textContent = todaySchedule.length > 0 ? '等待下一個行程...' : '今天沒有安排行程';
        $('#navigate-now').style.display = 'none';
        $('#current-activity').style.display = 'block';
    }

    // Update next activity card
    if (nextActivity) {
        $('#next-place').textContent = nextActivity.place;
        $('#next-time-range').textContent = `⏰ ${nextActivity.startTime} - ${nextActivity.endTime}`;
        $('#next-notes').textContent = nextActivity.notes ? `📝 ${nextActivity.notes}` : '';
        $('#navigate-next').onclick = () => navigateTo(nextActivity.address || nextActivity.place);
        $('#next-activity').style.display = 'block';
    } else {
        $('#next-activity').style.display = 'none';
    }
}

// --- Timeline ---
function updateTimeline() {
    const dateStr = formatDate(selectedDate);
    const daySchedule = scheduleData.filter(item => normalizeDate(item.date) === dateStr);

    const container = $('#timeline-list');
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const isToday = formatDate(now) === dateStr;

    if (daySchedule.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>這天沒有安排行程</p>
            </div>
        `;
        return;
    }

    container.innerHTML = daySchedule.map(item => {
        const start = timeToMinutes(item.startTime);
        const end = timeToMinutes(item.endTime);
        let status = '';

        if (isToday) {
            if (currentMinutes >= start && currentMinutes < end) status = 'current';
            else if (currentMinutes >= end) status = 'past';
        }

        return `
            <div class="timeline-item ${status}">
                <div class="time">${item.startTime} - ${item.endTime}</div>
                <div class="place">${item.place}</div>
                ${item.notes ? `<div class="notes">${item.notes}</div>` : ''}
                <button class="navigate-timeline" onclick="navigateTo('${(item.address || item.place).replace(/'/g, "\\'")}')">
                    🧭 導航
                </button>
            </div>
        `;
    }).join('');
}

// --- Date Selector ---
function initDateSelector() {
    updateSelectedDateDisplay();

    $('#prev-day').addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() - 1);
        updateSelectedDateDisplay();
        updateTimeline();
    });

    $('#next-day').addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() + 1);
        updateSelectedDateDisplay();
        updateTimeline();
    });

    $('#timeline-date-picker').addEventListener('change', (e) => {
        if (e.target.value) {
            selectedDate = new Date(e.target.value + 'T00:00:00');
            updateSelectedDateDisplay();
            updateTimeline();
        }
    });
}

function updateSelectedDateDisplay() {
    $('#selected-date').textContent = selectedDate.toLocaleDateString('zh-TW', {
        month: 'long', day: 'numeric', weekday: 'short'
    });
    const picker = $('#timeline-date-picker');
    if (picker) picker.value = selectedDate.toISOString().split('T')[0];
}

// --- Random Places ---
let selectedCategory = 'all';

function updateRandomList() {
    const container = $('#random-list');
    const filtersContainer = $('#category-filters');

    if (randomPlaces.length === 0) {
        filtersContainer.innerHTML = '';
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🎲</div>
                <p>尚未設定隨機景點</p>
            </div>
        `;
        return;
    }

    // Build category filters (collapsible - show max 4 + expand)
    const categories = [...new Set(randomPlaces.map(p => p.type).filter(Boolean))];
    const MAX_VISIBLE = 4;
    const visibleCats = categories.slice(0, MAX_VISIBLE);
    const hiddenCats = categories.slice(MAX_VISIBLE);

    filtersContainer.innerHTML = `
        <button class="filter-btn ${selectedCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
        ${visibleCats.map(cat => `
            <button class="filter-btn ${selectedCategory === cat ? 'active' : ''}" data-category="${cat}">${getCategoryEmoji(cat)} ${cat}</button>
        `).join('')}
        ${hiddenCats.length > 0 ? `
            <button class="filter-btn filter-expand-btn" data-expand="places">+${hiddenCats.length} 更多</button>
            ${hiddenCats.map(cat => `
                <button class="filter-btn filter-hidden ${selectedCategory === cat ? 'active' : ''}" data-category="${cat}" style="display:none;">${getCategoryEmoji(cat)} ${cat}</button>
            `).join('')}
        ` : ''}
    `;

    // Bind expand button
    const expandBtn = filtersContainer.querySelector('.filter-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            filtersContainer.querySelectorAll('.filter-hidden').forEach(b => b.style.display = '');
            expandBtn.style.display = 'none';
        });
    }

    // Bind filter clicks
    filtersContainer.querySelectorAll('.filter-btn:not(.filter-expand-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedCategory = btn.dataset.category;
            filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFilteredList();
            $('#random-pick').style.display = 'none';
        });
    });

    renderFilteredList();
}

function getFilteredPlaces() {
    if (selectedCategory === 'all') return randomPlaces;
    return randomPlaces.filter(p => p.type === selectedCategory);
}

function renderFilteredList() {
    const container = $('#random-list');
    const filtered = getFilteredPlaces();

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>這個分類沒有景點</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => `
        <div class="place-card" onclick="navigateTo('${(item.address || item.place).replace(/'/g, "\\'")}')">
            <div class="place-info">
                <h3>${item.place}</h3>
                <p>${item.notes || ''}</p>
            </div>
            ${item.type ? `<span class="place-type">${getCategoryEmoji(item.type)} ${item.type}</span>` : ''}
        </div>
    `).join('');
}

function getCategoryEmoji(type) {
    const emojiMap = {
        '吃': '🍽️',
        '美食': '🍽️',
        '餐廳': '🍽️',
        '小吃': '🍜',
        '咖啡': '☕',
        '飲料': '🧋',
        '購物': '🛍️',
        '逛街': '🛍️',
        '景點': '📸',
        '觀光': '📸',
        '自然': '🌿',
        '公園': '🌳',
        '玩具店': '🧸',
        '玩具': '🧸',
        '文創': '🎨',
        '書店': '📚',
        '夜市': '🏮',
        '廟宇': '🏯',
        '博物館': '🏛️',
        '娛樂': '🎮',
        '酒吧': '🍺',
        '甜點': '🍰',
    };
    return emojiMap[type] || '📍';
}

function shuffleRandom() {
    const filtered = getFilteredPlaces();
    if (filtered.length === 0) {
        $('#random-pick').style.display = 'none';
        return;
    }

    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    $('#random-pick').style.display = 'block';
    $('#random-place').textContent = pick.place;
    $('#random-type').textContent = pick.type ? `${getCategoryEmoji(pick.type)} ${pick.type}` : '';
    $('#random-notes').textContent = pick.notes ? `📝 ${pick.notes}` : '';
    $('#navigate-random').onclick = () => navigateTo(pick.address || pick.place);

    // Animation
    $('#random-pick').style.animation = 'none';
    setTimeout(() => { $('#random-pick').style.animation = 'fadeIn 0.3s ease'; }, 10);
}

// --- Food List ---
let selectedFoodCategory = 'all';

function updateFoodList() {
    const container = $('#food-list');
    const filtersContainer = $('#food-category-filters');

    if (foodList.length === 0) {
        filtersContainer.innerHTML = '';
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🍽️</div>
                <p>尚未設定美食清單</p>
            </div>
        `;
        return;
    }

    // Build category filters (collapsible)
    const categories = [...new Set(foodList.map(f => f.type).filter(Boolean))];
    const MAX_VISIBLE_FOOD = 4;
    const visibleCats = categories.slice(0, MAX_VISIBLE_FOOD);
    const hiddenCats = categories.slice(MAX_VISIBLE_FOOD);

    filtersContainer.innerHTML = `
        <button class="filter-btn ${selectedFoodCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
        ${visibleCats.map(cat => `
            <button class="filter-btn ${selectedFoodCategory === cat ? 'active' : ''}" data-category="${cat}">${getFoodEmoji(cat)} ${cat}</button>
        `).join('')}
        ${hiddenCats.length > 0 ? `
            <button class="filter-btn filter-expand-btn" data-expand="food">+${hiddenCats.length} 更多</button>
            ${hiddenCats.map(cat => `
                <button class="filter-btn filter-hidden ${selectedFoodCategory === cat ? 'active' : ''}" data-category="${cat}" style="display:none;">${getFoodEmoji(cat)} ${cat}</button>
            `).join('')}
        ` : ''}
    `;

    // Bind expand button
    const expandBtn = filtersContainer.querySelector('.filter-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            filtersContainer.querySelectorAll('.filter-hidden').forEach(b => b.style.display = '');
            expandBtn.style.display = 'none';
        });
    }

    // Bind filter clicks
    filtersContainer.querySelectorAll('.filter-btn:not(.filter-expand-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedFoodCategory = btn.dataset.category;
            filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFilteredFoodList();
            $('#food-pick').style.display = 'none';
        });
    });

    renderFilteredFoodList();
}

function getFilteredFood() {
    if (selectedFoodCategory === 'all') return foodList;
    return foodList.filter(f => f.type === selectedFoodCategory);
}

function renderFilteredFoodList() {
    const container = $('#food-list');
    const filtered = getFilteredFood();

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>這個分類沒有餐廳</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const tags = [
            item.price ? `💰 ${item.price}` : '',
            item.rating ? `⭐ ${item.rating}` : '',
            item.queue ? `🕐 ${item.queue}` : '',
            item.area ? `📍 ${item.area}` : '',
            item.hours ? `🕒 ${item.hours}` : ''
        ].filter(Boolean).join('　');

        return `
            <div class="place-card food-card" onclick="navigateTo('${(item.address || item.name).replace(/'/g, "\\'")}')">
                <div class="place-info">
                    <h3>${item.name}</h3>
                    ${tags ? `<p class="food-tags">${tags}</p>` : ''}
                    ${item.recommend ? `<p class="food-recommend">🍽️ ${item.recommend}</p>` : ''}
                    ${item.notes ? `<p class="food-notes">${item.notes}</p>` : ''}
                </div>
                ${item.type ? `<span class="place-type">${getFoodEmoji(item.type)} ${item.type}</span>` : ''}
            </div>
        `;
    }).join('');
}

function getFoodEmoji(type) {
    const emojiMap = {
        '拉麵': '🍜',
        '日式': '🍱',
        '壽司': '🍣',
        '燒肉': '🥩',
        '火鍋': '🫕',
        '牛排': '🥩',
        '義式': '🍝',
        '披薩': '🍕',
        '漢堡': '🍔',
        '炸雞': '🍗',
        '中式': '🥢',
        '台式': '🍚',
        '小吃': '🧆',
        '滷味': '🍲',
        '早餐': '🥞',
        '早午餐': '🥞',
        '咖啡': '☕',
        '飲料': '🧋',
        '甜點': '🍰',
        '冰品': '🍦',
        '麵包': '🥐',
        '韓式': '🥘',
        '泰式': '🍛',
        '印度': '🍛',
        '越南': '🍜',
        '素食': '🥗',
        '海鮮': '🦐',
        '居酒屋': '🍶',
        '酒吧': '🍺',
        '夜市': '🏮',
    };
    return emojiMap[type] || '🍽️';
}

function shuffleFood() {
    const filtered = getFilteredFood();
    if (filtered.length === 0) {
        $('#food-pick').style.display = 'none';
        return;
    }

    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    $('#food-pick').style.display = 'block';
    $('#food-pick-name').textContent = pick.name;
    $('#food-pick-type').textContent = pick.type ? `${getFoodEmoji(pick.type)} ${pick.type}` : '';

    const details = [
        pick.price ? `💰 ${pick.price}` : '',
        pick.rating ? `⭐ ${pick.rating}` : '',
        pick.queue ? `🕐 ${pick.queue}` : '',
        pick.area ? `📍 ${pick.area}` : '',
        pick.hours ? `🕒 ${pick.hours}` : '',
        pick.recommend ? `🍽️ ${pick.recommend}` : '',
        pick.notes ? `📝 ${pick.notes}` : ''
    ].filter(Boolean).join('　');

    $('#food-pick-notes').textContent = details;
    $('#navigate-food-pick').onclick = () => navigateTo(pick.address || pick.name);

    // Animation
    $('#food-pick').style.animation = 'none';
    setTimeout(() => { $('#food-pick').style.animation = 'fadeIn 0.3s ease'; }, 10);
}

// --- Navigation ---
function navigateTo(destination) {
    if (!destination) return;

    let url;
    if (currentPosition) {
        // Use current location as starting point
        url = `https://www.google.com/maps/dir/?api=1&origin=${currentPosition.lat},${currentPosition.lng}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
    } else {
        // Just open destination
        url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`;
    }

    window.open(url, '_blank');
}

// --- Buttons ---
function initButtons() {
    $('#food-shuffle-btn').addEventListener('click', () => shuffleFood());
    $('#shuffle-btn').addEventListener('click', () => shuffleRandom());
}

async function refreshAll() {
    if (!currentUser) return;

    // Reset location name to re-query on refresh
    currentLocationName = '';
    if (currentPosition) {
        reverseGeocode(currentPosition.lat, currentPosition.lng);
    }

    // Process any pending sync queue items
    await processSyncQueue();

    try {
        // Re-fetch user config from Apps Script (with password)
        const res = await fetch(CONFIG_SCRIPT_URL + '?action=getConfig&user=' + encodeURIComponent(currentUser) + '&password=' + encodeURIComponent(getUserPassword()));
        const config = await res.json();
        if (!config.error) {
            localStorage.setItem('userConfig_' + currentUser, JSON.stringify(config));
            localStorage.setItem('geminiApiKey', config.apiKey || '');
            applyUserConfig(config);
            // Refresh tools display
            refreshToolsDisplay();
        }
    } catch (e) {
        console.log('重新取得設定失敗:', e);
    }

    // Reload all data via getAllData
    try {
        const res = await fetch(CONFIG_SCRIPT_URL + '?action=getAllData' + getAuthParams());
        const data = await res.json();

        if (!data.error) {
            if (data.schedule) {
                scheduleData = mapApiData(data.schedule, mapScheduleItem);
            }
            if (data.places) {
                randomPlaces = mapApiData(data.places, mapRandomPlace);
            }
            if (data.food) {
                foodList = mapApiData(data.food, mapFoodItem);
            }
            if (data.packing) {
                packingItems = mapApiData(data.packing, mapPackingItem);
            }
            if (data.segments) {
                segments = mapApiData(data.segments, mapSegmentItem);
            }
        }

        updateNowTab();
        updateTimeline();
        updateRandomList();
        updateFoodList();
        renderPackingList();
    } catch (err) {
        console.error('重新載入資料失敗:', err);
    }
}

// --- Utilities ---
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

function normalizeDate(dateStr) {
    // Handle various date formats: 2026/7/28, 2026-7-28, etc.
    const parts = dateStr.replace(/-/g, '/').split('/');
    if (parts.length !== 3) return dateStr;
    const y = parts[0];
    const m = String(parseInt(parts[1])).padStart(2, '0');
    const d = String(parseInt(parts[2])).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

function timeToMinutes(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

function showLoading(show) {
    $('#loading').style.display = show ? 'flex' : 'none';
}

// --- Service Worker ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('SW registered:', reg.scope);
                // Check for updates and auto-reload
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                            // New SW activated, reload to get new content
                            window.location.reload();
                        }
                    });
                });
            })
            .catch(err => console.log('SW registration failed:', err));

        // Also detect controller change (when skipWaiting + claim takes effect)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
}

// --- Pull to Refresh ---
function initPullToRefresh() {
    let startY = 0;
    let pulling = false;
    const indicator = $('#pull-indicator');

    document.addEventListener('touchstart', (e) => {
        // Don't trigger on AI tab or More tab subpages
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;
        if (activeTab.id === 'tab-ai' || activeTab.id === 'tab-more') return;
        if (activeTab.scrollTop === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 60) {
            indicator.classList.add('visible');
        } else {
            indicator.classList.remove('visible');
        }
    }, { passive: true });

    document.addEventListener('touchend', async () => {
        if (!pulling) return;
        pulling = false;
        if (indicator.classList.contains('visible')) {
            indicator.querySelector('span').textContent = '🔄 更新中...';
            // Don't show full-screen loading, just update in background
            refreshAll().then(() => {
                indicator.classList.remove('visible');
                indicator.querySelector('span').textContent = '↓ 下拉更新';
            });
        }
    });
}


// ==================== 工具 ====================

function initTools() {
    // Now tools are initialized on demand when subpages open
    // This is kept for backward compatibility
}

function refreshToolsDisplay() {
    // Called after refresh to update countdown on main page if visible
    updateCountdownDisplay();
}

// Update countdown display if it exists in DOM
function updateCountdownDisplay() {
    const el = $('#countdown-number');
    if (!el) return;
    updateCountdown();
}

// --- Countdown ---
function initCountdown() {
    const startInput = $('#trip-start-date');
    const endInput = $('#trip-end-date');

    // Load saved dates (normalize to YYYY-MM-DD for date input)
    const savedStart = toInputDate(localStorage.getItem('tripStartDate') || '');
    const savedEnd = toInputDate(localStorage.getItem('tripEndDate') || '');
    startInput.value = savedStart;
    endInput.value = savedEnd;
    // Store normalized back so countdown reads consistent format
    if (savedStart) localStorage.setItem('tripStartDate', savedStart);
    if (savedEnd) localStorage.setItem('tripEndDate', savedEnd);

    updateCountdown();
    setInterval(updateCountdown, 60000);

    let savingDates = false;
    $('#save-trip-dates').addEventListener('click', async () => {
        if (savingDates) return;
        savingDates = true;
        $('#save-trip-dates').disabled = true;
        $('#save-trip-dates').textContent = '儲存中...';

        const startVal = startInput.value;
        const endVal = endInput.value;
        localStorage.setItem('tripStartDate', startVal);
        localStorage.setItem('tripEndDate', endVal);
        updateCountdown();

        // Save to Apps Script
        await saveUserInfoToServer({
            tripStartDate: startVal,
            tripEndDate: endVal
        });

        alert('✅ 旅程日期已儲存');
        savingDates = false;
        $('#save-trip-dates').disabled = false;
        $('#save-trip-dates').textContent = '修改';
        // Reload weather
        if (segments.length > 0) {
            loadTripWeatherBySegments();
        } else {
            loadTripWeather();
        }
    });
}

// Normalize any date string to YYYY-MM-DD for <input type="date">
function toInputDate(str) {
    if (!str) return '';
    // Already correct format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // ISO string with time
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return '';
}

// Format date for display (e.g. "2026-08-08" → "8/8")
function formatSegDate(str) {
    if (!str) return '';
    const normalized = toInputDate(str);
    if (!normalized) return str;
    const parts = normalized.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function updateCountdown() {
    const startStr = localStorage.getItem('tripStartDate');
    const endStr = localStorage.getItem('tripEndDate');
    const numberEl = $('#countdown-number');
    const labelEl = $('#countdown-label');

    if (!numberEl || !labelEl) return;

    if (!startStr) {
        numberEl.textContent = '-';
        labelEl.textContent = '請設定出發日期';
        return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : null;

    const daysUntilStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24));

    if (daysUntilStart > 0) {
        numberEl.textContent = daysUntilStart;
        labelEl.textContent = '天後出發 ✈️';
    } else if (end && today <= end) {
        const tripDay = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
        const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        numberEl.textContent = `Day ${tripDay}`;
        labelEl.textContent = `旅程第 ${tripDay}/${totalDays} 天 🎉`;
    } else {
        numberEl.textContent = '🏠';
        labelEl.textContent = '旅程已結束，回憶滿滿';
    }
}

// --- Currency ---
function initCurrency() {
    const jpyInput = $('#jpy-input');
    const twdInput = $('#twd-input');
    const rateInput = $('#rate-input');

    // Load saved rate
    const savedRate = localStorage.getItem('exchangeRate') || '';
    const lastFetch = localStorage.getItem('exchangeRateTime') || '0';
    const hoursSinceLastFetch = (Date.now() - parseInt(lastFetch)) / (1000 * 60 * 60);

    if (savedRate) {
        rateInput.value = savedRate;
    }

    // Auto fetch if no rate or older than 12 hours
    if (!savedRate || hoursSinceLastFetch > 12) {
        fetchExchangeRate();
    }

    jpyInput.addEventListener('input', () => {
        const jpy = parseFloat(jpyInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        twdInput.value = jpy > 0 ? (jpy * rate).toFixed(0) : '';
    });

    twdInput.addEventListener('input', () => {
        const twd = parseFloat(twdInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        jpyInput.value = (twd > 0 && rate > 0) ? (twd / rate).toFixed(0) : '';
    });

    rateInput.addEventListener('change', () => {
        localStorage.setItem('exchangeRate', rateInput.value);
        // Recalculate
        if (jpyInput.value) {
            const jpy = parseFloat(jpyInput.value) || 0;
            twdInput.value = (jpy * parseFloat(rateInput.value)).toFixed(0);
        }
    });

    $('#fetch-rate').addEventListener('click', fetchExchangeRate);
}

async function fetchExchangeRate() {
    const btn = $('#fetch-rate');
    btn.disabled = true;
    btn.textContent = '更新中...';

    try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/JPY');
        const data = await res.json();
        const rate = data.rates.TWD;
        if (rate) {
            $('#rate-input').value = rate.toFixed(4);
            localStorage.setItem('exchangeRate', rate.toFixed(4));
            localStorage.setItem('exchangeRateTime', Date.now().toString());
            // Recalculate
            const jpy = parseFloat($('#jpy-input').value) || 0;
            if (jpy > 0) {
                $('#twd-input').value = (jpy * rate).toFixed(0);
            }
            btn.textContent = '✅ 已更新';
            setTimeout(() => { btn.textContent = '更新匯率'; }, 2000);
        }
    } catch (err) {
        btn.textContent = '❌ 失敗';
        setTimeout(() => { btn.textContent = '更新匯率'; }, 2000);
        console.error('匯率抓取失敗:', err);
    }

    btn.disabled = false;
}

// --- Emergency Info ---
function initEmergency() {
    const savedAddress = localStorage.getItem('hotelAddress') || '';
    const savedPhone = localStorage.getItem('hotelPhone') || '';

    if (savedAddress) {
        $('#hotel-address').textContent = savedAddress;
    }
    if (savedPhone) {
        $('#hotel-phone').textContent = savedPhone;
        $('#hotel-phone').href = `tel:${savedPhone}`;
    }

    $('#edit-hotel-address').value = savedAddress;
    $('#edit-hotel-phone').value = savedPhone;

    // Toggle edit form
    $('#toggle-emergency-edit').addEventListener('click', () => {
        const form = $('#emergency-edit-form');
        const isVisible = form.style.display !== 'none';
        form.style.display = isVisible ? 'none' : 'flex';
        $('#toggle-emergency-edit').textContent = isVisible ? '修改住宿資訊' : '取消';
    });

    // Save with debounce
    let saving = false;
    $('#save-emergency').addEventListener('click', async () => {
        if (saving) return;
        saving = true;
        $('#save-emergency').disabled = true;

        const address = $('#edit-hotel-address').value.trim();
        const phone = $('#edit-hotel-phone').value.trim();
        localStorage.setItem('hotelAddress', address);
        localStorage.setItem('hotelPhone', phone);
        $('#hotel-address').textContent = address || '未設定';
        $('#hotel-phone').textContent = phone || '未設定';
        $('#hotel-phone').href = phone ? `tel:${phone}` : '';

        // Save to Apps Script
        await saveUserInfoToServer({
            hotelAddress: address,
            hotelPhone: phone
        });

        // Hide form
        $('#emergency-edit-form').style.display = 'none';
        $('#toggle-emergency-edit').textContent = '修改住宿資訊';

        alert('✅ 住宿資訊已儲存');
        saving = false;
        $('#save-emergency').disabled = false;
    });
}

// --- Packing List ---
let packingItems = [];
let editingPackingIndex = null;

function initPackingList() {
    loadPackingList();

    // Add button
    const addBtn = $('#add-packing-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            editingPackingIndex = null;
            showPackingForm(null);
        });
    }

    // Cancel
    const cancelBtn = $('#packing-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            $('#packing-form').style.display = 'none';
        });
    }

    // Save
    const saveBtn = $('#packing-save');
    if (saveBtn) {
        let saving = false;
        saveBtn.addEventListener('click', async () => {
            if (saving) return;
            saving = true;
            saveBtn.disabled = true;

            const item = {
                item: $('#packing-item-name').value.trim(),
                category: $('#packing-item-category').value.trim()
            };

            if (!item.item) {
                alert('請填寫物品名稱');
                saving = false;
                saveBtn.disabled = false;
                return;
            }

            await savePackingItem(editingPackingIndex !== null ? 'update' : 'add', item, editingPackingIndex);
            $('#packing-form').style.display = 'none';
            saving = false;
            saveBtn.disabled = false;
        });
    }
}

function showPackingForm(item) {
    $('#packing-form').style.display = 'block';
    $('#packing-item-name').value = item ? item.item : '';
    $('#packing-item-category').value = item ? item.category : '';
}

async function loadPackingList() {
    // Data already loaded by loadData/getAllData, just render
    const container = $('#packing-list');
    if (!container) return;
    if (packingItems.length === 0) {
        container.innerHTML = '<p class="hint">行李清單是空的</p>';
        return;
    }
    renderPackingList();
}

function parsePackingCSV(csv) {
    // DEPRECATED: kept as fallback, prefer mapApiData
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map((line, idx) => {
        const cols = parseCSVLine(line);
        return {
            id: idx,
            item: cols[0] || '',
            category: cols[1] || '',
        };
    }).filter(item => item.item);
}

function renderPackingList() {
    const container = $('#packing-list');
    if (!container) return;
    const checked = JSON.parse(localStorage.getItem('packingChecked') || '[]');

    if (packingItems.length === 0) {
        container.innerHTML = '<p class="hint">行李清單是空的</p>';
        updatePackingProgress(0, 0);
        return;
    }

    container.innerHTML = packingItems.map(item => {
        const isChecked = checked.includes(item.id);
        return `
            <div class="packing-item ${isChecked ? 'checked' : ''}">
                <div class="check" onclick="togglePacking(${item.id})">${isChecked ? '✓' : ''}</div>
                <span onclick="togglePacking(${item.id})">${item.item}</span>
                ${item.category ? `<span class="place-type" style="margin-left:auto;">${item.category}</span>` : ''}
                <button class="sched-action-btn edit" onclick="editPackingItem(${item.id})" style="margin-left:8px;">✏️</button>
                <button class="sched-action-btn delete" onclick="deletePackingItemConfirm(${item.id})">🗑️</button>
            </div>
        `;
    }).join('');

    updatePackingProgress(checked.filter(id => id < packingItems.length).length, packingItems.length);
}

function togglePacking(id) {
    let checked = JSON.parse(localStorage.getItem('packingChecked') || '[]');
    if (checked.includes(id)) {
        checked = checked.filter(i => i !== id);
    } else {
        checked.push(id);
    }
    localStorage.setItem('packingChecked', JSON.stringify(checked));
    renderPackingList();
}

function editPackingItem(id) {
    editingPackingIndex = id;
    showPackingForm(packingItems[id]);
}

async function deletePackingItemConfirm(id) {
    const item = packingItems[id];
    if (!confirm(`確定刪除「${item.item}」？`)) return;
    await savePackingItem('delete', null, id);
}

async function savePackingItem(action, item, idx) {
    const sheetId = window.SHEET_ID;
    const uuid = (action !== 'add' && packingItems[idx]) ? (packingItems[idx]._uuid || '') : '';

    const payload = {
        action: action === 'add' ? 'addPackingItem' :
                action === 'update' ? 'updatePackingItem' : 'deletePackingItem',
        sheetId: sheetId,
        user: currentUser,
        password: getUserPassword(),
        uuid: uuid,
        item: item
    };

    try {
        const res = await fetch(CONFIG_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow'
        });

        if (!res.ok && res.status !== 0) {
            let errMsg = `HTTP ${res.status}`;
            try { const d = await res.json(); errMsg = d.error || errMsg; } catch (e) {}
            throw new Error(errMsg);
        }

        let result = { success: true };
        try { result = await res.json(); } catch (e) {}
        if (result.error) throw new Error(result.error);

        // Update local data
        if (action === 'add') {
            packingItems.push({ id: packingItems.length, item: item.item, category: item.category });
        } else if (action === 'update') {
            packingItems[idx] = { ...packingItems[idx], ...item };
        } else if (action === 'delete') {
            packingItems.splice(idx, 1);
            // Re-index
            packingItems.forEach((p, i) => p.id = i);
            // Clean checked
            localStorage.setItem('packingChecked', JSON.stringify([]));
        }

        renderPackingList();
        alert(action === 'delete' ? '✅ 已刪除' : '✅ 已儲存');

    } catch (err) {
        console.error('行李清單儲存失敗:', err);
        addToSyncQueue(payload);

        if (action === 'add') {
            packingItems.push({ id: packingItems.length, item: item.item, category: item.category });
        } else if (action === 'update') {
            packingItems[idx] = { ...packingItems[idx], ...item };
        } else if (action === 'delete') {
            packingItems.splice(idx, 1);
            packingItems.forEach((p, i) => p.id = i);
        }

        renderPackingList();
        alert('⚠️ 已暫存本地（網路恢復後自動同步）');
    }
}

function updatePackingProgress(done, total) {
    const el = $('#packing-progress-text');
    if (!el) return;
    el.textContent = `${done}/${total}`;
    const pct = total > 0 ? (done / total * 100) : 0;
    const bar = $('#packing-progress-bar');
    if (bar) bar.style.width = `${pct}%`;
}

// --- Save to Apps Script ---
async function saveUserInfoToServer(fields) {
    if (!currentUser) return;

    try {
        await fetch(CONFIG_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'updateUserInfo',
                user: currentUser,
                fields: fields
            }),
            mode: 'no-cors' // Apps Script redirects, so use no-cors
        });

        // Also update local cached config
        try {
            const cached = JSON.parse(localStorage.getItem('userConfig_' + currentUser) || '{}');
            Object.assign(cached, fields);
            localStorage.setItem('userConfig_' + currentUser, JSON.stringify(cached));
        } catch (e) {}
    } catch (err) {
        console.error('儲存到伺服器失敗:', err);
    }
}


// ==================== 天氣 (Open-Meteo) ====================

// Weather code to emoji mapping
function getWeatherEmoji(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌦️';
    if (code <= 65) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌤️';
}

function getWeatherDesc(code) {
    if (code === 0) return '晴';
    if (code <= 3) return '多雲';
    if (code <= 48) return '霧';
    if (code <= 55) return '小雨';
    if (code <= 65) return '雨';
    if (code <= 77) return '雪';
    if (code <= 82) return '陣雨';
    if (code <= 86) return '大雪';
    if (code >= 95) return '雷雨';
    return '晴時多雲';
}

async function fetchWeather(lat, lng, days) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Asia%2FTokyo&forecast_days=${days || 7}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API: ${res.status}`);
    return await res.json();
}

// Show current weather on "Now" tab
async function updateCurrentWeather() {
    const el = $('#current-weather');
    if (!el) return;

    let lat, lng;
    if (currentPosition) {
        lat = currentPosition.lat;
        lng = currentPosition.lng;
    } else {
        // Default to Tokyo if no GPS
        lat = 35.6762;
        lng = 139.6503;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,precipitation&daily=precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=1`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        const temp = Math.round(data.current.temperature_2m);
        const code = data.current.weather_code;
        const rainProb = data.daily.precipitation_probability_max[0];
        const emoji = getWeatherEmoji(code);
        const desc = getWeatherDesc(code);

        el.textContent = `${emoji} ${temp}°C ${desc}　降雨 ${rainProb}%`;
        el.style.display = 'block';
    } catch (e) {
        console.log('天氣取得失敗:', e);
    }
}

// Show trip weather forecast in trip-dates subpage
async function loadTripWeather() {
    const section = $('#trip-weather-section');
    const container = $('#trip-weather-list');
    const alertEl = $('#weather-alert');
    if (!section || !container) return;

    const startStr = localStorage.getItem('tripStartDate');
    const endStr = localStorage.getItem('tripEndDate');
    if (!startStr || !endStr) return;

    const start = new Date(startStr);
    const end = new Date(endStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Open-Meteo only provides 16 days forecast
    const maxForecastDate = new Date(today);
    maxForecastDate.setDate(maxForecastDate.getDate() + 15);

    if (start > maxForecastDate) {
        section.style.display = 'block';
        container.innerHTML = '<p class="hint">天氣預報僅提供未來 16 天，旅程日期超出範圍</p>';
        return;
    }

    // Use GPS or default Tokyo coordinates
    let lat = 35.6762, lng = 139.6503;
    if (currentPosition) {
        lat = currentPosition.lat;
        lng = currentPosition.lng;
    }

    try {
        const data = await fetchWeather(lat, lng, 16);
        const dates = data.daily.time;
        const maxTemps = data.daily.temperature_2m_max;
        const minTemps = data.daily.temperature_2m_min;
        const rainProbs = data.daily.precipitation_probability_max;
        const codes = data.daily.weather_code;

        // Filter to trip dates
        const tripDays = [];
        const rainyDays = [];

        // Use string comparison to avoid timezone issues
        const startDateStr = startStr;
        const endDateStr = endStr;

        for (let i = 0; i < dates.length; i++) {
            if (dates[i] >= startDateStr && dates[i] <= endDateStr) {
                const rain = rainProbs[i];
                const dateObj = new Date(dates[i] + 'T00:00:00');
                const dayInfo = {
                    date: dates[i],
                    dayLabel: dateObj.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                    emoji: getWeatherEmoji(codes[i]),
                    maxTemp: Math.round(maxTemps[i]),
                    minTemp: Math.round(minTemps[i]),
                    rain: rain
                };
                tripDays.push(dayInfo);
                if (rain >= 50) rainyDays.push(dayInfo);
            }
        }

        if (tripDays.length === 0) {
            section.style.display = 'block';
            container.innerHTML = '<p class="hint">無法取得旅程期間天氣資料</p>';
            return;
        }

        // Rain alert
        if (rainyDays.length > 0) {
            const rainyDateList = rainyDays.map(d => d.dayLabel).join('、');
            alertEl.textContent = `☔ 提醒：${rainyDateList} 降雨機率高，記得帶傘！`;
            alertEl.style.display = 'block';
        } else {
            alertEl.style.display = 'none';
        }

        // Render list (include days with no forecast)
        const allTripDays = [];
        const currentDate = new Date(startStr + 'T00:00:00');
        const endDate = new Date(endStr + 'T00:00:00');

        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const idx = dates.indexOf(dateStr);
            if (idx !== -1) {
                allTripDays.push({
                    dayLabel: currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                    emoji: getWeatherEmoji(codes[idx]),
                    maxTemp: Math.round(maxTemps[idx]),
                    minTemp: Math.round(minTemps[idx]),
                    rain: rainProbs[idx],
                    available: true
                });
            } else {
                allTripDays.push({
                    dayLabel: currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                    available: false
                });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        container.innerHTML = allTripDays.map(day => {
            if (!day.available) {
                return `
                    <div class="weather-day" style="opacity:0.5;">
                        <span class="weather-date">${day.dayLabel}</span>
                        <span class="weather-icon">⏳</span>
                        <span class="weather-temp" style="flex:1;">尚無預報（超出預報範圍）</span>
                    </div>
                `;
            }
            return `
                <div class="weather-day ${day.rain >= 50 ? 'rainy' : ''}">
                    <span class="weather-date">${day.dayLabel}</span>
                    <span class="weather-icon">${day.emoji}</span>
                    <span class="weather-temp">${day.maxTemp}° / ${day.minTemp}°</span>
                    <span class="weather-rain">降雨 ${day.rain}%</span>
                </div>
            `;
        }).join('');

        section.style.display = 'block';
    } catch (e) {
        console.log('旅程天氣取得失敗:', e);
        section.style.display = 'block';
        container.innerHTML = '<p class="hint">天氣資料載入失敗</p>';
    }
}


// ==================== 行程段落管理 ====================

// 常見旅遊城市座標資料庫
const CITY_DATABASE = {
    '日本': {
        '東京': { lat: 35.6762, lng: 139.6503 },
        '大阪': { lat: 34.6937, lng: 135.5023 },
        '京都': { lat: 35.0116, lng: 135.7681 },
        '名古屋': { lat: 35.1815, lng: 136.9066 },
        '福岡': { lat: 33.5904, lng: 130.4017 },
        '札幌': { lat: 43.0618, lng: 141.3545 },
        '沖繩': { lat: 26.3344, lng: 127.8056 },
        '神戶': { lat: 34.6901, lng: 135.1956 },
        '橫濱': { lat: 35.4437, lng: 139.6380 },
        '奈良': { lat: 34.6851, lng: 135.8048 },
        '廣島': { lat: 34.3853, lng: 132.4553 },
        '仙台': { lat: 38.2682, lng: 140.8694 },
        '金澤': { lat: 36.5613, lng: 136.6562 },
        '熊本': { lat: 32.8032, lng: 130.7079 },
        '長崎': { lat: 32.7503, lng: 129.8777 },
    },
    '韓國': {
        '首爾': { lat: 37.5665, lng: 126.9780 },
        '釜山': { lat: 35.1796, lng: 129.0756 },
        '濟州': { lat: 33.4996, lng: 126.5312 },
        '仁川': { lat: 37.4563, lng: 126.7052 },
        '大邱': { lat: 35.8714, lng: 128.6014 },
    },
    '泰國': {
        '曼谷': { lat: 13.7563, lng: 100.5018 },
        '清邁': { lat: 18.7883, lng: 98.9853 },
        '普吉島': { lat: 7.8804, lng: 98.3923 },
        '芭達雅': { lat: 12.9236, lng: 100.8825 },
    },
    '越南': {
        '河內': { lat: 21.0278, lng: 105.8342 },
        '胡志明市': { lat: 10.8231, lng: 106.6297 },
        '峴港': { lat: 16.0544, lng: 108.2022 },
    },
    '新加坡': {
        '新加坡': { lat: 1.3521, lng: 103.8198 },
    },
    '馬來西亞': {
        '吉隆坡': { lat: 3.1390, lng: 101.6869 },
        '檳城': { lat: 5.4164, lng: 100.3327 },
        '沙巴': { lat: 5.9804, lng: 116.0735 },
    },
    '香港': {
        '香港': { lat: 22.3193, lng: 114.1694 },
    },
    '澳門': {
        '澳門': { lat: 22.1987, lng: 113.5439 },
    },
    '美國': {
        '紐約': { lat: 40.7128, lng: -74.0060 },
        '洛杉磯': { lat: 34.0522, lng: -118.2437 },
        '舊金山': { lat: 37.7749, lng: -122.4194 },
        '拉斯維加斯': { lat: 36.1699, lng: -115.1398 },
    },
    '英國': {
        '倫敦': { lat: 51.5074, lng: -0.1278 },
    },
    '法國': {
        '巴黎': { lat: 48.8566, lng: 2.3522 },
    },
    '澳洲': {
        '雪梨': { lat: -33.8688, lng: 151.2093 },
        '墨爾本': { lat: -37.8136, lng: 144.9631 },
    },
};

const COUNTRY_LIST = Object.keys(CITY_DATABASE);

function getCitiesForCountry(country) {
    return CITY_DATABASE[country] ? Object.keys(CITY_DATABASE[country]) : [];
}

function getCityCoords(country, city) {
    if (CITY_DATABASE[country] && CITY_DATABASE[country][city]) {
        return CITY_DATABASE[country][city];
    }
    return null;
}

// Geocoding fallback for custom cities (using Open-Meteo geocoding API - free, no key)
async function geocodeCity(cityName) {
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            return { lat: data.results[0].latitude, lng: data.results[0].longitude };
        }
    } catch (e) {
        console.log('Geocoding failed:', e);
    }
    return null;
}

let segments = [];
let editingSegmentIndex = null;

async function loadSegments() {
    // Data already loaded by loadData/getAllData
    // This function is kept for backward compatibility but is now a no-op
    // Segments are loaded via getAllData in loadData()
}

function parseSegmentsCSV(csv) {
    // DEPRECATED: kept as fallback, prefer mapApiData
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1).map((line, idx) => {
        const cols = parseCSVLine(line);
        return {
            idx, name: cols[0] || '', country: cols[1] || '', city: cols[2] || '',
            lat: parseFloat(cols[3]) || 0, lng: parseFloat(cols[4]) || 0,
            startDate: toInputDate(cols[5] || ''), endDate: toInputDate(cols[6] || ''),
            hotelName: cols[7] || '', hotelAddress: cols[8] || '', hotelPhone: cols[9] || ''
        };
    }).filter(s => s.name);
}

function getCurrentSegment() {
    if (segments.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    return segments.find(s => today >= s.startDate && today <= s.endDate) || segments[0];
}

function initSegments() {
    renderSegmentsList();
    populateCountryDropdown();

    // Country change → update city dropdown
    $('#seg-country').addEventListener('change', () => {
        const country = $('#seg-country').value;
        populateCityDropdown(country);
    });

    // City change → show custom input if "other"
    $('#seg-city').addEventListener('change', () => {
        const city = $('#seg-city').value;
        $('#seg-city-custom').style.display = city === '__custom__' ? 'block' : 'none';
    });

    $('#add-segment-btn').addEventListener('click', () => {
        editingSegmentIndex = null;
        showSegmentForm(null);
    });

    $('#seg-cancel').addEventListener('click', () => {
        $('#segment-form').style.display = 'none';
    });

    let saving = false;
    $('#seg-save').addEventListener('click', async () => {
        if (saving) return;
        saving = true;
        $('#seg-save').disabled = true;
        $('#seg-save').textContent = '儲存中...';

        const country = $('#seg-country').value;
        let city = $('#seg-city').value;
        if (city === '__custom__') {
            city = $('#seg-city-custom').value.trim();
        }

        // Get coordinates
        let coords = getCityCoords(country, city);
        if (!coords && city) {
            // Try geocoding for custom city
            coords = await geocodeCity(city);
        }

        const item = {
            name: $('#seg-name').value.trim(),
            country: country,
            city: city,
            lat: coords ? coords.lat : 0,
            lng: coords ? coords.lng : 0,
            startDate: $('#seg-start').value,
            endDate: $('#seg-end').value,
            hotelName: $('#seg-hotel-name').value.trim(),
            hotelAddress: $('#seg-hotel-address').value.trim(),
            hotelPhone: $('#seg-hotel-phone').value.trim()
        };

        if (!item.name || !item.city) {
            alert('請至少填寫旅程名稱和城市');
            saving = false;
            $('#seg-save').disabled = false;
            $('#seg-save').textContent = '儲存';
            return;
        }

        await saveSegment(editingSegmentIndex !== null ? 'update' : 'add', item, editingSegmentIndex);
        $('#segment-form').style.display = 'none';
        saving = false;
        $('#seg-save').disabled = false;
        $('#seg-save').textContent = '儲存';
    });
}

function populateCountryDropdown() {
    const select = $('#seg-country');
    if (!select) return;
    select.innerHTML = '<option value="">選擇國家</option>' +
        COUNTRY_LIST.map(c => `<option value="${c}">${c}</option>`).join('') +
        '<option value="__custom__">其他（手動輸入）</option>';
}

function populateCityDropdown(country) {
    const select = $('#seg-city');
    const customInput = $('#seg-city-custom');
    if (!select) return;

    if (!country || country === '__custom__') {
        select.innerHTML = '<option value="">請輸入城市</option><option value="__custom__">手動輸入</option>';
        select.value = '__custom__';
        customInput.style.display = 'block';
        return;
    }

    const cities = getCitiesForCountry(country);
    select.innerHTML = '<option value="">選擇城市</option>' +
        cities.map(c => `<option value="${c}">${c}</option>`).join('') +
        '<option value="__custom__">其他（手動輸入）</option>';
    customInput.style.display = 'none';
}

function showSegmentForm(item) {
    $('#segment-form').style.display = 'block';
    $('#segment-form-title').textContent = item ? '編輯旅途' : '新增旅途';
    $('#seg-name').value = item ? item.name : '';

    // Set country dropdown
    const countrySelect = $('#seg-country');
    if (item && item.country) {
        // Check if country is in our list
        if (COUNTRY_LIST.includes(item.country)) {
            countrySelect.value = item.country;
        } else {
            countrySelect.value = '__custom__';
        }
        populateCityDropdown(item.country);
    } else {
        countrySelect.value = '';
        populateCityDropdown('');
    }

    // Set city dropdown
    const citySelect = $('#seg-city');
    const customInput = $('#seg-city-custom');
    if (item && item.city) {
        const cities = getCitiesForCountry(item.country);
        if (cities.includes(item.city)) {
            citySelect.value = item.city;
            customInput.style.display = 'none';
        } else {
            citySelect.value = '__custom__';
            customInput.style.display = 'block';
            customInput.value = item.city;
        }
    } else {
        customInput.style.display = 'none';
    }

    $('#seg-start').value = item ? toInputDate(item.startDate) : '';
    $('#seg-end').value = item ? toInputDate(item.endDate) : '';
    $('#seg-hotel-name').value = item ? item.hotelName : '';
    $('#seg-hotel-address').value = item ? item.hotelAddress : '';
    $('#seg-hotel-phone').value = item ? item.hotelPhone : '';
}

function renderSegmentsList() {
    const container = $('#segments-list');
    if (!container) return;

    if (segments.length === 0) {
        container.innerHTML = '<p class="hint">尚未設定旅途資訊，請新增以取得天氣和住宿資料</p>';
        return;
    }

    container.innerHTML = segments.map((seg, idx) => `
        <div class="segment-card">
            <div class="segment-info">
                <div class="segment-city">${seg.country ? seg.country + ' · ' : ''}${seg.city}</div>
                <div class="segment-dates">${formatSegDate(seg.startDate)} ~ ${formatSegDate(seg.endDate)}</div>
                ${seg.hotelName ? `<div class="segment-hotel">🏨 ${seg.hotelName}</div>` : ''}
            </div>
            <div class="sched-actions">
                <button class="sched-action-btn edit" onclick="editSegment(${idx})">✏️</button>
                <button class="sched-action-btn delete" onclick="deleteSegmentConfirm(${idx})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function editSegment(idx) {
    editingSegmentIndex = idx;
    showSegmentForm(segments[idx]);
}

async function deleteSegmentConfirm(idx) {
    if (!confirm(`確定刪除「${segments[idx].name}」？`)) return;
    await saveSegment('delete', null, idx);
}

async function saveSegment(action, item, idx) {
    const sheetId = window.SHEET_ID;
    const uuid = (action !== 'add' && segments[idx]) ? (segments[idx]._uuid || '') : '';
    const payload = {
        action: action === 'add' ? 'addSegment' : action === 'update' ? 'updateSegment' : 'deleteSegment',
        sheetId,
        user: currentUser,
        password: getUserPassword(),
        uuid: uuid,
        item
    };

    try {
        const res = await fetch(CONFIG_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow'
        });

        if (!res.ok && res.status !== 0) throw new Error(`HTTP ${res.status}`);

        if (action === 'add') segments.push({ ...item, idx: segments.length });
        else if (action === 'update') segments[idx] = { ...segments[idx], ...item };
        else if (action === 'delete') segments.splice(idx, 1);

        renderSegmentsList();
        loadTripWeatherBySegments();
        alert(action === 'delete' ? '✅ 已刪除' : '✅ 已儲存');
    } catch (err) {
        addToSyncQueue(payload);
        if (action === 'add') segments.push({ ...item, idx: segments.length });
        else if (action === 'update') segments[idx] = { ...segments[idx], ...item };
        else if (action === 'delete') segments.splice(idx, 1);
        renderSegmentsList();
        alert('⚠️ 已暫存本地（網路恢復後自動同步）');
    }
}

// Weather by segments
async function loadTripWeatherBySegments() {
    const section = $('#trip-weather-section');
    const container = $('#trip-weather-list');
    const alertEl = $('#weather-alert');
    if (!section || !container) return;

    if (segments.length === 0) {
        // Fallback to old single-location weather
        loadTripWeather();
        return;
    }

    // Deduplicate segments by city+dates
    const seen = new Set();
    const uniqueSegments = segments.filter(seg => {
        const key = `${seg.city}-${seg.startDate}-${seg.endDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    section.style.display = 'block';
    container.innerHTML = '<p class="hint">載入天氣中...</p>';

    const allDays = [];
    const rainyDays = [];

    for (const seg of uniqueSegments) {
        if (!seg.startDate || !seg.endDate) continue;

        // Add city header
        allDays.push({ type: 'header', city: seg.city, startDate: seg.startDate, endDate: seg.endDate });

        if (!seg.lat || !seg.lng) {
            // No coordinates - show error for all days
            const currentDate = new Date(seg.startDate + 'T00:00:00');
            const endDate = new Date(seg.endDate + 'T00:00:00');
            while (currentDate <= endDate) {
                allDays.push({
                    type: 'day',
                    dayLabel: currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                    available: false, error: true, errorMsg: `無法查到「${seg.city}」的氣象`
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
            continue;
        }

        try {
            const data = await fetchWeather(seg.lat, seg.lng, 16);
            const dates = data.daily.time;
            const maxTemps = data.daily.temperature_2m_max;
            const minTemps = data.daily.temperature_2m_min;
            const rainProbs = data.daily.precipitation_probability_max;
            const codes = data.daily.weather_code;

            const currentDate = new Date(seg.startDate + 'T00:00:00');
            const endDate = new Date(seg.endDate + 'T00:00:00');

            while (currentDate <= endDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const idx = dates.indexOf(dateStr);
                if (idx !== -1) {
                    const rain = rainProbs[idx];
                    const dayInfo = {
                        type: 'day',
                        dayLabel: currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                        emoji: getWeatherEmoji(codes[idx]),
                        maxTemp: Math.round(maxTemps[idx]),
                        minTemp: Math.round(minTemps[idx]),
                        rain, city: seg.city
                    };
                    allDays.push(dayInfo);
                    if (rain >= 50) rainyDays.push(dayInfo);
                } else {
                    allDays.push({
                        type: 'day',
                        dayLabel: currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                        available: false
                    });
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } catch (e) {
            allDays.push({ type: 'day', dayLabel: '', available: false, error: true });
        }
    }

    // Rain alert
    if (rainyDays.length > 0) {
        const rainyList = rainyDays.map(d => `${d.city} ${d.dayLabel}`).join('、');
        alertEl.textContent = `☔ 提醒：${rainyList} 降雨機率高，記得帶傘！`;
        alertEl.style.display = 'block';
    } else {
        alertEl.style.display = 'none';
    }

    // Render
    container.innerHTML = allDays.map(day => {
        if (day.type === 'header') {
            return `<div class="weather-city-header">📍 ${day.city}（${formatSegDate(day.startDate)} ~ ${formatSegDate(day.endDate)}）</div>`;
        }
        if (!day.available && day.available !== undefined) {
            return `<div class="weather-day" style="opacity:0.5;"><span class="weather-date">${day.dayLabel}</span><span class="weather-icon">⏳</span><span class="weather-temp" style="flex:1;">${day.errorMsg || (day.error ? '載入失敗' : '尚無預報')}</span></div>`;
        }
        return `<div class="weather-day ${day.rain >= 50 ? 'rainy' : ''}"><span class="weather-date">${day.dayLabel}</span><span class="weather-icon">${day.emoji}</span><span class="weather-temp">${day.maxTemp}° / ${day.minTemp}°</span><span class="weather-rain">降雨 ${day.rain}%</span></div>`;
    }).join('');
}

// Emergency info from segments
function initEmergencyFromSegments() {
    const currentSeg = getCurrentSegment();
    const currentSegEl = $('#emergency-current-segment');
    const allHotelsEl = $('#emergency-all-hotels');

    if (segments.length > 0 && currentSegEl) {
        if (currentSeg) {
            currentSegEl.style.display = 'block';
            currentSegEl.innerHTML = `
                <div class="segment-card" style="border-left:4px solid var(--primary);margin-bottom:12px;">
                    <div class="segment-info">
                        <div class="segment-city">目前行程：${currentSeg.name}</div>
                        <div class="segment-dates">${currentSeg.city}（${formatSegDate(currentSeg.startDate)} ~ ${formatSegDate(currentSeg.endDate)}）</div>
                        ${currentSeg.hotelName ? `<div class="segment-hotel">🏨 ${currentSeg.hotelName}</div>` : ''}
                        ${currentSeg.hotelAddress ? `<div class="segment-hotel">📫 ${currentSeg.hotelAddress}</div>` : ''}
                        ${currentSeg.hotelPhone ? `<div class="segment-hotel">📞 <a href="tel:${currentSeg.hotelPhone}">${currentSeg.hotelPhone}</a></div>` : ''}
                    </div>
                </div>
            `;
        }

        if (allHotelsEl && segments.length > 1) {
            allHotelsEl.innerHTML = `
                <div class="tool-header" style="font-size:0.85rem;">🏨 所有住宿</div>
                ${segments.map(s => `
                    <div class="emergency-item" style="flex-direction:column;align-items:flex-start;gap:2px;">
                        <span style="font-weight:500;">${s.name} · ${s.city}（${formatSegDate(s.startDate)} ~ ${formatSegDate(s.endDate)}）</span>
                        <span class="emergency-value">${s.hotelName || '未設定'}</span>
                        ${s.hotelPhone ? `<a href="tel:${s.hotelPhone}" class="emergency-value">${s.hotelPhone}</a>` : ''}
                    </div>
                `).join('')}
            `;
        }
    }
}


// ==================== 行程管理 ====================

let schedManageDate = new Date();
let editingIndex = null; // null = 新增, number = 編輯第幾列

function initScheduleManage() {
    updateSchedDateDisplay();
    renderScheduleEditList();

    // Date navigation
    $('#sched-prev-day').addEventListener('click', () => {
        schedManageDate.setDate(schedManageDate.getDate() - 1);
        updateSchedDateDisplay();
        renderScheduleEditList();
    });
    $('#sched-next-day').addEventListener('click', () => {
        schedManageDate.setDate(schedManageDate.getDate() + 1);
        updateSchedDateDisplay();
        renderScheduleEditList();
    });
    $('#sched-date-picker').addEventListener('change', (e) => {
        schedManageDate = new Date(e.target.value);
        renderScheduleEditList();
    });

    // Add button
    $('#add-schedule-btn').addEventListener('click', () => {
        editingIndex = null;
        showScheduleForm(null);
    });

    // Cancel
    $('#sched-cancel').addEventListener('click', () => {
        $('#schedule-form').style.display = 'none';
    });

    // Save
    let saving = false;
    $('#sched-save').addEventListener('click', async () => {
        if (saving) return;
        saving = true;
        $('#sched-save').disabled = true;
        $('#sched-save').textContent = '儲存中...';

        const item = {
            date: $('#sched-date').value,
            startTime: $('#sched-start').value,
            endTime: $('#sched-end').value,
            place: $('#sched-place').value.trim(),
            address: $('#sched-address').value.trim(),
            notes: $('#sched-notes').value.trim()
        };

        if (!item.date || !item.startTime || !item.place) {
            alert('請至少填寫日期、開始時間和地點');
            saving = false;
            $('#sched-save').disabled = false;
            $('#sched-save').textContent = '儲存';
            return;
        }

        if (editingIndex !== null) {
            await saveScheduleItem('update', item, editingIndex);
        } else {
            await saveScheduleItem('add', item, null);
        }

        $('#schedule-form').style.display = 'none';
        saving = false;
        $('#sched-save').disabled = false;
        $('#sched-save').textContent = '儲存';
    });

    // Show sync queue status
    showSyncStatus();
}

function updateSchedDateDisplay() {
    const picker = $('#sched-date-picker');
    const label = $('#sched-selected-date');
    if (picker) {
        picker.value = schedManageDate.toISOString().split('T')[0];
    }
    if (label) {
        label.textContent = schedManageDate.toLocaleDateString('zh-TW', {
            month: 'long', day: 'numeric', weekday: 'short'
        });
    }
}

function renderScheduleEditList() {
    const container = $('#schedule-edit-list');
    const dateStr = formatDate(schedManageDate);
    const daySchedule = scheduleData.filter((item, idx) => {
        item._idx = idx; // track original index
        return normalizeDate(item.date) === dateStr;
    });

    if (daySchedule.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>這天沒有行程</p></div>';
        return;
    }

    container.innerHTML = daySchedule.map(item => `
        <div class="schedule-edit-item${item._pending ? ' pending' : ''}">
            <div class="sched-info">
                <div class="sched-time">${item.startTime} - ${item.endTime}</div>
                <div class="sched-place">${item.place}</div>
            </div>
            <div class="sched-actions">
                ${item._pending ? '<span class="hint">同步中...</span>' : `
                <button class="sched-action-btn edit" onclick="editScheduleItem(${item._idx})">✏️</button>
                <button class="sched-action-btn delete" onclick="deleteScheduleItemConfirm(${item._idx})">🗑️</button>
                `}
            </div>
        </div>
    `).join('');
}

function showScheduleForm(item) {
    $('#schedule-form').style.display = 'block';
    $('#schedule-form-title').textContent = item ? '編輯行程' : '新增行程';

    const dateStr = schedManageDate.toISOString().split('T')[0];
    $('#sched-date').value = item ? toInputDate(item.date.replace(/\//g, '-')) : dateStr;
    $('#sched-start').value = item ? item.startTime : '';
    $('#sched-end').value = item ? item.endTime : '';
    $('#sched-place').value = item ? item.place : '';
    $('#sched-address').value = item ? item.address : '';
    $('#sched-notes').value = item ? item.notes : '';
}

function editScheduleItem(idx) {
    editingIndex = idx;
    showScheduleForm(scheduleData[idx]);
}

async function deleteScheduleItemConfirm(idx) {
    const item = scheduleData[idx];
    if (!confirm(`確定刪除「${item.place}」？`)) return;

    await saveScheduleItem('delete', null, idx);
}

async function saveScheduleItem(action, item, idx) {
    const sheetId = window.SHEET_ID;
    const sheetName = window.SHEET_NAME_SCHEDULE;
    const uuid = (action !== 'add' && scheduleData[idx]) ? (scheduleData[idx]._uuid || '') : '';

    const payload = {
        action: action === 'add' ? 'addScheduleItem' :
                action === 'update' ? 'updateScheduleItem' : 'deleteScheduleItem',
        sheetId: sheetId,
        sheetName: sheetName,
        user: currentUser,
        password: getUserPassword(),
        uuid: uuid,
        item: item
    };

    // Optimistic update: update local immediately, write to server in background
    if (action === 'add') {
        item._pending = true;
        item._uuid = '';
        scheduleData.push(item);
    } else if (action === 'update') {
        scheduleData[idx] = { ...scheduleData[idx], ...item };
    } else if (action === 'delete') {
        scheduleData.splice(idx, 1);
    }

    // Update local cache
    try {
        const cached = JSON.parse(localStorage.getItem('cachedAllData') || '{}');
        if (cached.schedule) {
            cached.schedule = scheduleData;
            localStorage.setItem('cachedAllData', JSON.stringify(cached));
        }
    } catch (e) {}

    renderScheduleEditList();
    updateNowTab();
    updateTimeline();

    // Write to server in background (queued to prevent concurrent delete issues)
    queueServerWrite(payload, action);
}

// Ensure server writes execute one at a time (especially for deletes)
let _writeQueue = Promise.resolve();

function queueServerWrite(payload, action) {
    _writeQueue = _writeQueue.then(() => {
        return fetch(CONFIG_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow'
        }).then(async res => {
            let result = {};
            try { result = await res.json(); } catch (e) { result = { success: true }; }
            if (result.error) {
                console.error('背景寫入失敗:', result.error);
                addToSyncQueue(payload);
                showSyncStatus();
                alert('⚠️ 寫入 Sheet 失敗：' + result.error + '\n資料已暫存');
            } else if (action === 'delete') {
                // After delete, refresh to get correct uuid mapping
                return silentLoadData();
            }
            // Refresh to get real uuid for new items
            if (action === 'add') {
                return silentLoadData();
            }
        }).catch(err => {
            console.error('背景寫入失敗:', err);
            addToSyncQueue(payload);
            showSyncStatus();
            alert('⚠️ 網路異常，資料已暫存本地');
        });
    });
}

// --- Offline Sync Queue ---
function addToSyncQueue(payload) {
    const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    queue.push({ payload, timestamp: Date.now() });
    localStorage.setItem('syncQueue', JSON.stringify(queue));
}

function getSyncQueue() {
    return JSON.parse(localStorage.getItem('syncQueue') || '[]');
}

function showSyncStatus() {
    const el = $('#sync-status');
    const actionsEl = $('#sync-actions');
    if (!el) return;
    const queue = getSyncQueue();
    if (queue.length > 0) {
        el.style.display = 'block';
        el.textContent = `⚠️ ${queue.length} 筆待同步`;
        if (actionsEl) actionsEl.style.display = 'block';
    } else {
        el.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
    }
}

function clearSyncQueue() {
    if (!confirm('確定清除所有待同步項目？（這些操作將不會被同步到 Google Sheets）')) return;
    localStorage.setItem('syncQueue', '[]');
    showSyncStatus();
    alert('✅ 已清除');
}

async function retrySyncQueue() {
    const queue = getSyncQueue();
    if (queue.length === 0) {
        alert('沒有待同步的項目');
        return;
    }
    alert(`開始同步 ${queue.length} 筆...`);
    await processSyncQueue();
    const remaining = getSyncQueue();
    if (remaining.length === 0) {
        alert('✅ 全部同步成功！');
        silentLoadData();
    } else {
        alert(`⚠️ 還有 ${remaining.length} 筆同步失敗`);
    }
    showSyncStatus();
}

async function processSyncQueue() {
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const entry of queue) {
        try {
            // Ensure payload has current auth info
            const payload = { ...entry.payload, user: currentUser, password: getUserPassword() };
            const res = await fetch(CONFIG_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
                redirect: 'follow'
            });
            // If we get a response (even opaque), consider it success
            if (res.ok || res.status === 0) {
                // Success, don't add to remaining
            } else {
                remaining.push(entry);
            }
        } catch (e) {
            remaining.push(entry);
        }
    }

    localStorage.setItem('syncQueue', JSON.stringify(remaining));
}


// ==================== AI 助手 (Gemini via Apps Script Proxy) ====================

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';

let aiChatHistory = [];

function initAI() {
    const input = $('#ai-input');
    const sendBtn = $('#ai-send');
    const imageInput = $('#ai-image-input');
    const voiceBtn = $('#ai-voice');

    sendBtn.addEventListener('click', () => sendAIMessage());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            sendAIMessage();
        }
    });

    // Image upload
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageUpload(file);
            imageInput.value = '';
        }
    });

    // Voice input
    voiceBtn.addEventListener('click', () => toggleVoiceInput());

    // Quick actions
    $$('.ai-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
    });

    // Long press header to reset API key
    let pressTimer;
    const header = $('.app-header h1');
    header.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
            const key = prompt('設定 Gemini API Key：', localStorage.getItem('geminiApiKey') || '');
            if (key !== null) {
                localStorage.setItem('geminiApiKey', key.trim());
                alert('API Key 已更新！');
            }
        }, 2000);
    });
    header.addEventListener('touchend', () => clearTimeout(pressTimer));
    header.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

// --- Voice Input (Web Speech API) ---
let recognition = null;
let isRecording = false;

function toggleVoiceInput() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('你的瀏覽器不支援語音輸入');
        return;
    }

    if (isRecording) {
        stopVoiceInput();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW';
    recognition.continuous = false;
    recognition.interimResults = true;

    const voiceBtn = $('#ai-voice');
    const input = $('#ai-input');

    recognition.onstart = () => {
        isRecording = true;
        voiceBtn.classList.add('recording');
        input.placeholder = '🎙️ 正在聽...';
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        input.value = transcript;

        // If final result, auto-send
        if (event.results[event.results.length - 1].isFinal) {
            stopVoiceInput();
            if (transcript.trim()) {
                sendAIMessage();
            }
        }
    };

    recognition.onerror = (event) => {
        console.log('Speech recognition error:', event.error);
        stopVoiceInput();
    };

    recognition.onend = () => {
        stopVoiceInput();
    };

    recognition.start();
}

function stopVoiceInput() {
    isRecording = false;
    const voiceBtn = $('#ai-voice');
    voiceBtn.classList.remove('recording');
    $('#ai-input').placeholder = '打字或拍照翻譯...';
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
}

// --- Quick Actions ---
function handleQuickAction(action) {
    switch (action) {
        case 'recommend':
            triggerFoodRecommendation();
            break;
        case 'translate':
            triggerTranslateMode();
            break;
        case 'identify':
            triggerIdentifyMode();
            break;
    }
}

function triggerFoodRecommendation() {
    const now = new Date();
    const hour = now.getHours();
    let mealType = '吃的';
    if (hour < 10) mealType = '早餐';
    else if (hour < 14) mealType = '午餐';
    else if (hour < 17) mealType = '下午茶或點心';
    else mealType = '晚餐';

    let msg = `現在${hour}點了，我想吃${mealType}。`;
    if (currentPosition) {
        msg += `我目前在 ${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)} 附近。`;
    }
    msg += '根據我的美食清單，推薦我現在可以去哪家？考慮營業時間和距離。';

    $('#ai-input').value = msg;
    sendAIMessage();
}

function triggerTranslateMode() {
    const text = prompt('輸入你要翻譯的中文：\n（會翻成日文，大字顯示給店員看）');
    if (!text || !text.trim()) return;

    // Check API key
    if (!localStorage.getItem('geminiApiKey')) {
        const key = prompt('首次使用請輸入 Gemini API Key：\n（到 https://aistudio.google.com/apikey 免費申請）');
        if (key && key.trim()) {
            localStorage.setItem('geminiApiKey', key.trim());
        } else {
            return;
        }
    }

    appendAIMessage(`🎌 翻譯：${text}`, 'user');
    const loadingEl = appendAIMessage('翻譯中...', 'bot loading');

    callGeminiTranslate(text.trim()).then(result => {
        loadingEl.remove();
        // Show translation in big readable format with speak button
        const speakId = 'speak-' + Date.now();
        const html = `
            <div class="translation-label">🇹🇼 中文</div>
            <p>${text}</p>
            <div class="translation-block">
                <div class="translation-label">🇯🇵 日文 <button class="speak-btn" onclick="speakJapanese('${speakId}')">🔊 播放</button></div>
                <span id="${speakId}">${result}</span>
            </div>
        `;
        appendAIMessageRaw(html, 'bot');
    }).catch(err => {
        loadingEl.remove();
        appendAIMessage(`❌ 翻譯失敗：${err.message}`, 'bot');
    });
}

function triggerIdentifyMode() {
    // Open camera for photo identification
    const imageInput = $('#ai-image-input');
    // Set a flag so we know to use "identify" prompt instead of "translate"
    window._aiImageMode = 'identify';
    imageInput.click();
}

async function callGeminiTranslate(text) {
    const requestBody = {
        contents: [{
            role: 'user',
            parts: [{ text: `請把以下中文翻譯成日文。只回覆日文翻譯結果，不要加其他說明。如果是對話場景，提供最自然的日文說法。\n\n${text}` }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 512
        }
    };

    let data = await callGeminiProxy(requestBody, GEMINI_MODEL);

    if (!data || data.error) {
        data = await callGeminiProxy(requestBody, GEMINI_MODEL_FALLBACK);
    }

    if (!data || data.error) {
        throw new Error(data?.error?.message || '翻譯失敗');
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || '翻譯失敗';
}

// --- Text to Speech (Japanese) ---
function speakJapanese(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const text = el.textContent.trim();
    if (!text) return;

    if (!('speechSynthesis' in window)) {
        alert('你的瀏覽器不支援語音播放');
        return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.85; // Slightly slower for clarity

    // Try to find a Japanese voice
    const voices = speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.startsWith('ja'));
    if (jaVoice) utterance.voice = jaVoice;

    speechSynthesis.speak(utterance);
}

async function sendAIMessage() {
    const input = $('#ai-input');
    const message = input.value.trim();
    if (!message) return;

    // Check API key
    if (!localStorage.getItem('geminiApiKey')) {
        const key = prompt('首次使用請輸入 Gemini API Key：\n（到 https://aistudio.google.com/apikey 免費申請）');
        if (key && key.trim()) {
            localStorage.setItem('geminiApiKey', key.trim());
        } else {
            return;
        }
    }

    // Show user message
    appendAIMessage(message, 'user');
    input.value = '';

    // Show loading
    const loadingEl = appendAIMessage('思考中...', 'bot loading');

    try {
        const response = await callGemini(message);
        loadingEl.remove();
        appendAIMessage(response, 'bot');
    } catch (err) {
        loadingEl.remove();
        appendAIMessage(`❌ 發生錯誤：${err.message}`, 'bot');
        console.error('Gemini API error:', err);
    }
}

function appendAIMessage(text, type) {
    const container = $('#ai-messages');
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.innerHTML = formatAIResponse(text);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function formatAIResponse(text) {
    // Basic markdown-like formatting
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function buildSystemContext() {
    const now = new Date();
    const today = formatDate(now);
    const todayISO = now.toISOString().split('T')[0];
    const currentTime = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

    // Determine current segment
    const currentSeg = getCurrentSegment();

    let context = `你是一個旅遊行程助手。現在的時間是 ${today} ${currentTime}。`;

    if (currentSeg) {
        context += `\n目前所在段落：${currentSeg.country} ${currentSeg.city}（${currentSeg.startDate} ~ ${currentSeg.endDate}）`;
        if (currentSeg.hotelName) {
            context += `\n住宿：${currentSeg.hotelName}（${currentSeg.hotelAddress}）`;
        }
    }

    if (currentPosition) {
        context += `\n使用者 GPS 位置：${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}`;
    }

    // Today's schedule only
    const todaySchedule = scheduleData.filter(item => normalizeDate(item.date) === today);
    if (todaySchedule.length > 0) {
        context += '\n\n【今天的行程】\n';
        todaySchedule.forEach(item => {
            context += `- ${item.startTime}~${item.endTime} ${item.place}（${item.address}）${item.notes ? '備註：' + item.notes : ''}\n`;
        });
    }

    // Tomorrow's schedule (for planning ahead)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);
    const tomorrowSchedule = scheduleData.filter(item => normalizeDate(item.date) === tomorrowStr);
    if (tomorrowSchedule.length > 0) {
        context += '\n\n【明天的行程】\n';
        tomorrowSchedule.forEach(item => {
            context += `- ${item.startTime}~${item.endTime} ${item.place}（${item.address}）${item.notes ? '備註：' + item.notes : ''}\n`;
        });
    }

    // Food list - filter by current segment's city
    if (foodList.length > 0) {
        let relevantFood = foodList;
        if (currentSeg && currentSeg.city) {
            const cityFood = foodList.filter(f => f.city && f.city === currentSeg.city);
            if (cityFood.length > 0) {
                relevantFood = cityFood;
            } else {
                // Fallback: try area field
                const areaFood = foodList.filter(f => f.area && f.area.includes(currentSeg.city));
                if (areaFood.length > 0) relevantFood = areaFood;
            }
        }
        relevantFood = relevantFood.slice(0, 30);
        context += '\n\n【美食清單】\n';
        relevantFood.forEach(item => {
            context += `- ${item.name}（${item.address || ''}）${item.type || ''}${item.recommend ? ' 推薦：' + item.recommend : ''}\n`;
        });
        if (relevantFood.length < foodList.length) {
            context += `（僅列出${currentSeg ? currentSeg.city : ''}相關 ${relevantFood.length} 家，共 ${foodList.length} 家）\n`;
        }
    }

    // Random places - filter by current segment's city
    if (randomPlaces.length > 0) {
        let relevantPlaces = randomPlaces;
        if (currentSeg && currentSeg.city) {
            const cityPlaces = randomPlaces.filter(p => p.city && p.city === currentSeg.city);
            if (cityPlaces.length > 0) relevantPlaces = cityPlaces;
        }
        relevantPlaces = relevantPlaces.slice(0, 20);
        context += '\n\n【景點清單】\n';
        relevantPlaces.forEach(item => {
            context += `- ${item.place}（${item.address || ''}）${item.type || ''}\n`;
        });
    }

    context += '\n\n請用繁體中文回答。根據以上資料回答問題，提供具體建議。回答簡潔實用。';

    return context;
}

async function callGemini(userMessage) {
    // Build conversation with context
    const systemContext = buildSystemContext();

    // Add to chat history
    aiChatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    const requestBody = {
        system_instruction: {
            parts: [{ text: systemContext }]
        },
        contents: aiChatHistory,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
        }
    };

    // Call via Apps Script proxy, try primary model first
    let data = await callGeminiProxy(requestBody, GEMINI_MODEL);
    let firstError = '';

    if (!data || data.error) {
        firstError = typeof data?.error === 'string' ? data.error : (data?.error?.message || 'Unknown error');
        console.log(`${GEMINI_MODEL} 失敗(${firstError})，切換備援 ${GEMINI_MODEL_FALLBACK}`);
        data = await callGeminiProxy(requestBody, GEMINI_MODEL_FALLBACK);
    }

    if (!data || data.error) {
        const secondError = typeof data?.error === 'string' ? data.error : (data?.error?.message || '');
        throw new Error(firstError || secondError || '呼叫 Gemini 失敗');
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我無法回答這個問題。';

    // Add AI response to history
    aiChatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });

    // Keep history manageable (last 20 messages)
    if (aiChatHistory.length > 20) {
        aiChatHistory = aiChatHistory.slice(-20);
    }

    return aiResponse;
}

async function callGeminiProxy(requestBody, model) {
    const apiKey = localStorage.getItem('geminiApiKey') || '';
    if (!apiKey) throw new Error('未設定 API Key');

    const m = model || GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { error: { message: errData.error?.message || `HTTP ${res.status}` } };
    }

    return await res.json();
}

// --- Image Translation ---
async function handleImageUpload(file) {
    // Check API key
    if (!localStorage.getItem('geminiApiKey')) {
        const key = prompt('首次使用請輸入 Gemini API Key：\n（到 https://aistudio.google.com/apikey 免費申請）');
        if (key && key.trim()) {
            localStorage.setItem('geminiApiKey', key.trim());
        } else {
            return;
        }
    }

    // Convert image to base64
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';

    // Determine mode
    const mode = window._aiImageMode || 'translate';
    window._aiImageMode = null;

    const modeLabel = mode === 'identify' ? '🏯 辨識這個地方' : '📷 翻譯這張圖片';

    // Show image in chat
    const imgHtml = `<img src="data:${mimeType};base64,${base64}" alt="uploaded image">`;
    appendAIMessageRaw(`${modeLabel}：${imgHtml}`, 'user');

    // Show loading
    const loadingEl = appendAIMessage(mode === 'identify' ? '辨識中...' : '翻譯中...', 'bot loading');

    try {
        const response = await callGeminiWithImage(base64, mimeType, mode);
        loadingEl.remove();
        appendAIMessage(response, 'bot');
    } catch (err) {
        loadingEl.remove();
        appendAIMessage(`❌ 發生錯誤：${err.message}`, 'bot');
        console.error('Gemini image error:', err);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function appendAIMessageRaw(html, type) {
    const container = $('#ai-messages');
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

async function callGeminiWithImage(base64, mimeType, mode) {
    let prompt;
    if (mode === 'identify') {
        prompt = '請辨識這張照片中的建築物、神社、寺廟、地標或景點。告訴我這是什麼地方、它的歷史背景和有趣的資訊。用繁體中文回答，格式清楚易讀。';
    } else {
        prompt = '請翻譯這張圖片中的所有日文/外文文字成繁體中文。如果是菜單，請列出每道菜的名稱和中文翻譯。如果是路標或指示牌，請說明內容。格式清楚易讀。';
    }

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
        }
    };

    let data = await callGeminiProxy(requestBody, GEMINI_MODEL);

    if (!data || data.error) {
        console.log(`圖片處理：${GEMINI_MODEL} 失敗，切換備援 ${GEMINI_MODEL_FALLBACK}`);
        data = await callGeminiProxy(requestBody, GEMINI_MODEL_FALLBACK);
    }

    if (!data || data.error) {
        throw new Error(data?.error?.message || '圖片處理失敗');
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，無法辨識圖片內容。';
}
