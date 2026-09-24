// Firebase Realtime Database Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBLG7RfOWva4JtPzw-IBLImlJS_tz_C6gs",
  authDomain: "propstock-be298.firebaseapp.com",
  databaseURL: "https://propstock-be298-default-rtdb.firebaseio.com",
  projectId: "propstock-be298",
  storageBucket: "propstock-be298.firebasestorage.app",
  messagingSenderId: "277946336138",
  appId: "1:277946336138:web:9963e1bc14ea43baa43e73",
  measurementId: "G-DQFZKWXZD5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// State Cache
let inventoryData = {};
let categoriesData = [];
let logsData = [];
let activeContextItem = null;
let activeContextCategory = null;
let currentGraphMode = 'movement'; // 'movement' or 'levels'
let liveStockChart = null;

// DOM Elements
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const recentLoginCard = document.getElementById('recentLoginCard');
const recentUsernameEl = document.getElementById('recentUsername');
const switchUserBtn = document.getElementById('switchUserBtn');
const usernameGroup = document.getElementById('usernameGroup');
const loginUsernameInput = document.getElementById('loginUsername');
const passcodeContainer = document.getElementById('passcodeContainer');
const pinInputs = [
  document.getElementById('pin1'),
  document.getElementById('pin2'),
  document.getElementById('pin3'),
  document.getElementById('pin4')
];

// App DOM Elements
const stockForm = document.getElementById('stockForm');
const categoryForm = document.getElementById('categoryForm');
const inventoryContainer = document.getElementById('inventoryContainer');
const itemHistoryList = document.getElementById('itemHistoryList');
const stockCategorySelect = document.getElementById('stockCategory');
const dbCategoryFilter = document.getElementById('dbCategoryFilter');
const dbSearchInput = document.getElementById('dbSearchInput');
const dbStatusFilter = document.getElementById('dbStatusFilter');
const itemContextMenu = document.getElementById('itemContextMenu');
const categoryContextMenu = document.getElementById('categoryContextMenu');
const historyModal = document.getElementById('historyModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const renameCategoryModal = document.getElementById('renameCategoryModal');
const renameCategoryForm = document.getElementById('renameCategoryForm');
const renameCategoryInput = document.getElementById('renameCategoryInput');
const closeRenameModalBtn = document.getElementById('closeRenameModalBtn');
const cancelRenameBtn = document.getElementById('cancelRenameBtn');
const logsTableBody = document.getElementById('logsTableBody');
const logSearchInput = document.getElementById('logSearchInput');

// ==========================================
// 0. SECURITY & DATA INTEGRITY UTILITIES
// ==========================================

// Strict HTML Entity Escaper for Anti-XSS
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Safe Database Key Generator (alphanumeric & underscore only)
function encodeDbKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 80);
}

// Web Cryptography API: Salted SHA-256 Passcode Hash
async function computeSecureHash(pin) {
  const encoder = new TextEncoder();
  const saltedPayload = `nia_property_salt_2026_${pin}_secure_auth`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(saltedPayload));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// 0.1 NON-BLOCKING GLASS TOAST NOTIFICATION
// ==========================================
let toastTimeout = null;
function showToast(message, type = 'success', title = 'System Updated') {
  const toastEl = document.getElementById('toastNotification');
  const iconEl = document.getElementById('toastIcon');
  const iconWrap = document.getElementById('toastIconWrap');
  const titleEl = document.getElementById('toastTitle');
  const msgEl = document.getElementById('toastMessage');

  if (!toastEl) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  titleEl.textContent = title;
  msgEl.textContent = message;

  iconWrap.className = `toast-icon-wrap ${type}`;
  if (type === 'success') {
    iconEl.className = 'fa-solid fa-circle-check';
  } else if (type === 'warning') {
    iconEl.className = 'fa-solid fa-triangle-exclamation';
  } else if (type === 'error') {
    iconEl.className = 'fa-solid fa-circle-xmark';
  } else {
    iconEl.className = 'fa-solid fa-circle-info';
  }

  toastEl.classList.remove('hidden', 'toast-hide');

  toastTimeout = setTimeout(() => {
    toastEl.classList.add('toast-hide');
    setTimeout(() => toastEl.classList.add('hidden'), 250);
  }, 3200);
}

// ==========================================
// 0.2 MASTER INSTANT REFRESH ENGINE
// ==========================================
function refreshAllViews() {
  updateStats();
  updateDashboard();
  renderInventory();
  renderCategoriesList();
  updateHistoryDatalist();
  renderLogs(logsData);
  if (liveStockChart) liveStockChart.resize();
}

function refreshCategorySelects() {
  stockCategorySelect.innerHTML = '<option value="">Select Category</option>';
  dbCategoryFilter.innerHTML = '<option value="">All Categories</option>';

  categoriesData.forEach(cat => {
    const escaped = escapeHtml(cat.name);
    stockCategorySelect.insertAdjacentHTML('beforeend', `<option value="${escaped}">${escaped}</option>`);
    dbCategoryFilter.insertAdjacentHTML('beforeend', `<option value="${escaped}">${escaped}</option>`);
  });
}

// ==========================================
// 1. PRE-SEED DEFAULT ADMIN AND CATEGORIES
// ==========================================
async function ensureInitialSeed() {
  const defaultHash = await computeSecureHash('1234');

  db.ref('users/property').once('value', (snap) => {
    if (!snap.exists()) {
      db.ref('users/property').set({
        username: 'property',
        passwordHash: defaultHash,
        role: 'admin',
        title: 'Property Custodian'
      });
    } else {
      const val = snap.val();
      if (!val.passwordHash || val.password === '1234' || val.password === 'propertyoffice') {
        db.ref('users/property').update({
          passwordHash: defaultHash,
          title: 'Property Custodian'
        });
      }
    }
  });

  db.ref('categories').once('value', (snap) => {
    if (!snap.exists()) {
      const initialCats = ["Office Supplies", "IT Equipment", "Hardware & Tools", "Janitorial Supplies"];
      initialCats.forEach(cat => db.ref('categories').push(cat));
    }
  });
}

// ==========================================
// 2. AUTH FLOW & 4-DIGIT SECURE PASSCODE
// ==========================================
let activeLoginUsername = 'property';
let isManualUsernameMode = false;

function getRecentLogins() {
  try {
    const list = JSON.parse(localStorage.getItem('nia_recent_logins'));
    if (Array.isArray(list) && list.length > 0) return list;
  } catch (e) {}
  return [{ username: 'property', role: 'admin', title: 'Property Custodian' }];
}

function saveRecentLogin(userObj) {
  let list = getRecentLogins().filter(u => u.username !== userObj.username);
  list.unshift(userObj);
  if (list.length > 4) list = list.slice(0, 4);
  localStorage.setItem('nia_recent_logins', JSON.stringify(list));
}

function setupLoginUI() {
  const recentList = getRecentLogins();
  if (recentList.length > 0 && !isManualUsernameMode) {
    const primary = recentList[0];
    activeLoginUsername = primary.username;
    recentUsernameEl.textContent = primary.username;
    recentLoginCard.classList.remove('hidden');
    usernameGroup.classList.add('hidden');
  } else {
    recentLoginCard.classList.add('hidden');
    usernameGroup.classList.remove('hidden');
  }
  clearPinInputs();
  setTimeout(() => pinInputs[0].focus(), 150);
}

switchUserBtn.addEventListener('click', () => {
  isManualUsernameMode = !isManualUsernameMode;
  if (isManualUsernameMode) {
    recentLoginCard.classList.add('hidden');
    usernameGroup.classList.remove('hidden');
    loginUsernameInput.value = '';
    loginUsernameInput.focus();
  } else {
    setupLoginUI();
  }
  clearPinInputs();
});

function clearPinInputs() {
  pinInputs.forEach(input => input.value = '');
  pinInputs[0].focus();
}

function getPasscodeValue() {
  return pinInputs.map(input => input.value).join('');
}

pinInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    const val = input.value.replace(/[^0-9]/g, '');
    input.value = val ? val.slice(-1) : '';
    if (input.value && index < pinInputs.length - 1) {
      pinInputs[index + 1].focus();
    }

    const code = getPasscodeValue();
    if (code.length === 4) {
      attemptLogin();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && index > 0) {
      pinInputs[index - 1].focus();
    }
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (/^\d{4}$/.test(pasteData)) {
      pasteData.split('').forEach((digit, i) => {
        if (pinInputs[i]) pinInputs[i].value = digit;
      });
      pinInputs[3].focus();
      attemptLogin();
    }
  });
});

async function attemptLogin() {
  loginError.classList.add('hidden');

  let username = activeLoginUsername;
  if (isManualUsernameMode) {
    username = loginUsernameInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!username) {
      showLoginError('Please enter your username.');
      loginUsernameInput.focus();
      return;
    }
  }

  const passcode = getPasscodeValue();
  if (passcode.length < 4) {
    showLoginError('Please enter all 4 digits.');
    return;
  }

  const computedHash = await computeSecureHash(passcode);

  db.ref(`users/${username}`).once('value', (snap) => {
    const user = snap.val();
    const isHashValid = user && user.passwordHash && user.passwordHash === computedHash;
    const isLegacyValid = user && (user.password === passcode || (username === 'property' && passcode === '1234'));

    if (isHashValid || isLegacyValid) {
      if (!user.passwordHash) {
        db.ref(`users/${username}`).update({ passwordHash: computedHash });
      }

      const userSession = {
        username: user.username || username,
        role: user.role || 'admin',
        title: user.title || 'Property Custodian',
        loginTime: Date.now()
      };

      saveRecentLogin(userSession);
      localStorage.setItem('nia_session', JSON.stringify(userSession));
      showApp();
    } else {
      showLoginError('Incorrect 4-digit passcode.');
      triggerPasscodeShake();
    }
  });
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function triggerPasscodeShake() {
  passcodeContainer.classList.add('shake');
  setTimeout(() => {
    passcodeContainer.classList.remove('shake');
    clearPinInputs();
  }, 400);
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  attemptLogin();
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('nia_session');
  location.reload();
});

function checkSession() {
  const sessionStr = localStorage.getItem('nia_session');
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      const EIGHT_HOURS = 8 * 60 * 60 * 1000;
      if (session.loginTime && Date.now() - session.loginTime < EIGHT_HOURS) {
        showApp();
        return;
      }
    } catch (e) {}
    localStorage.removeItem('nia_session');
  }

  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
  setupLoginUI();
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');

  try {
    const session = JSON.parse(localStorage.getItem('nia_session'));
    if (session) {
      document.getElementById('currentAccountBadge').textContent = escapeHtml(session.username);
      const heroName = document.getElementById('heroUserName');
      if (heroName) heroName.textContent = escapeHtml(session.title || session.username);
    }
  } catch (e) {}

  initDataListeners();
  startLiveClock();
}

// ==========================================
// 3. NAVIGATION DOCK
// ==========================================
document.querySelectorAll('.dock-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const targetSection = document.getElementById(btn.dataset.target);
    if (targetSection) targetSection.classList.add('active');

    if (btn.dataset.target === 'tabHome') {
      updateDashboard();
      if (liveStockChart) liveStockChart.resize();
    } else if (btn.dataset.target === 'tabDatabase') {
      renderInventory();
    } else if (btn.dataset.target === 'tabCategories') {
      renderCategoriesList();
    } else if (btn.dataset.target === 'tabLogs') {
      renderLogs(logsData);
    }
  });
});

window.openStockFormWithAction = function(action) {
  document.querySelector('[data-target="tabForm"]').click();
  const safeAction = action === 'OUT' ? 'OUT' : 'IN';
  const radio = document.querySelector(`input[name="actionType"][value="${safeAction}"]`);
  if (radio) radio.checked = true;
  document.getElementById('stockItemName').focus();
};

// ==========================================
// 4. REALTIME DATA LISTENERS
// ==========================================
function initDataListeners() {
  // Categories Realtime Listener
  db.ref('categories').on('value', (snap) => {
    categoriesData = [];
    snap.forEach(child => {
      categoriesData.push({ key: child.key, name: String(child.val() || '') });
    });
    refreshCategorySelects();
    renderCategoriesList();
    updateStats();
    renderInventory();
  });

  // Inventory Realtime Listener
  db.ref('inventory').on('value', (snap) => {
    inventoryData = snap.val() || {};
    refreshAllViews();
  });

  // Global Activity Logs Listener
  db.ref('activity_logs').limitToLast(100).on('value', (snap) => {
    logsData = [];
    snap.forEach(child => {
      logsData.unshift(child.val());
    });
    renderLogs(logsData);
    updateDashboard();
  });
}

function getCategoryItemCount(catName) {
  return Object.values(inventoryData).filter(item => item.category === catName).length;
}

// ==========================================
// 5. CATEGORY MANAGEMENT (RENAME & REMOVE)
// ==========================================
function renderCategoriesList() {
  const listEl = document.getElementById('categoriesList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const totalEl = document.getElementById('categoryTotalBadge');
  if (totalEl) totalEl.textContent = `${categoriesData.length} Total`;

  categoriesData.forEach(cat => {
    const count = getCategoryItemCount(cat.name);
    const chip = document.createElement('div');
    chip.className = 'category-chip';
    chip.dataset.key = cat.key;
    chip.dataset.name = cat.name;
    chip.innerHTML = `
      <i class="fa-solid fa-folder" style="color:var(--primary);"></i>
      <span class="category-chip-name"><strong>${escapeHtml(cat.name)}</strong></span>
      <span class="category-count-badge" title="${count} item(s) in this category">${count}</span>
      <i class="fa-solid fa-ellipsis-vertical chip-delete" title="More options"></i>
    `;

    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCategoryContextMenu(e.pageX, e.pageY, cat.key, cat.name);
    });

    chip.querySelector('.chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      openCategoryContextMenu(e.pageX, e.pageY, cat.key, cat.name);
    });

    let touchTimer;
    chip.addEventListener('touchstart', (e) => {
      touchTimer = setTimeout(() => {
        const touch = e.touches[0];
        openCategoryContextMenu(touch.pageX, touch.pageY, cat.key, cat.name);
      }, 500);
    });
    chip.addEventListener('touchend', () => clearTimeout(touchTimer));
    chip.addEventListener('touchmove', () => clearTimeout(touchTimer));

    listEl.appendChild(chip);
  });
}

function openCategoryContextMenu(x, y, key, name) {
  activeContextCategory = { key, name };
  document.getElementById('ctxCategoryTitle').textContent = `Category: ${name}`;
  categoryContextMenu.style.left = `${Math.min(x, window.innerWidth - 230)}px`;
  categoryContextMenu.style.top = `${y}px`;
  categoryContextMenu.classList.remove('hidden');
}

document.getElementById('ctxRenameCategory').addEventListener('click', () => {
  if (!activeContextCategory) return;
  categoryContextMenu.classList.add('hidden');
  renameCategoryInput.value = activeContextCategory.name;
  renameCategoryModal.classList.remove('hidden');
  setTimeout(() => renameCategoryInput.focus(), 100);
});

// Rename Category Submit
renameCategoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!activeContextCategory) return;

  const newName = renameCategoryInput.value.trim().slice(0, 50);
  const oldName = activeContextCategory.name;
  const key = activeContextCategory.key;

  if (!newName || newName === oldName) {
    renameCategoryModal.classList.add('hidden');
    return;
  }

  // 1. Update Firebase
  db.ref(`categories/${key}`).set(newName);

  const updates = {};
  Object.entries(inventoryData).forEach(([itemKey, item]) => {
    if (item.category === oldName) {
      updates[`inventory/${itemKey}/category`] = newName;
      item.category = newName;
    }
  });

  if (Object.keys(updates).length > 0) {
    db.ref().update(updates);
  }

  // 2. Optimistic Immediate Update
  const found = categoriesData.find(c => c.key === key);
  if (found) found.name = newName;

  renameCategoryModal.classList.add('hidden');
  refreshCategorySelects();
  refreshAllViews();
  showToast(`Category renamed to "${newName}"`, 'info', 'Category Updated');
});

closeRenameModalBtn.addEventListener('click', () => renameCategoryModal.classList.add('hidden'));
cancelRenameBtn.addEventListener('click', () => renameCategoryModal.classList.add('hidden'));

// Remove Category Submit
document.getElementById('ctxRemoveCategory').addEventListener('click', () => {
  if (!activeContextCategory) return;
  categoryContextMenu.classList.add('hidden');

  const { key, name } = activeContextCategory;
  const count = getCategoryItemCount(name);

  let confirmMsg = `Are you sure you want to remove the category "${name}"?`;
  if (count > 0) {
    confirmMsg = `Security Notice: Category "${name}" currently has ${count} registered item(s).\nAre you sure you want to delete this category?`;
  }

  if (confirm(confirmMsg)) {
    db.ref(`categories/${key}`).remove();
    categoriesData = categoriesData.filter(c => c.key !== key);
    refreshCategorySelects();
    refreshAllViews();
    showToast(`Category "${name}" removed`, 'warning', 'Category Deleted');
  }
});

// Add Category Form
categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('newCategoryInput');
  const cat = input.value.trim().slice(0, 50);
  if (cat) {
    const newRef = db.ref('categories').push(cat);
    categoriesData.push({ key: newRef.key, name: cat });
    input.value = '';
    refreshCategorySelects();
    refreshAllViews();
    showToast(`Category "${cat}" added successfully`, 'success', 'Category Created');
  }
});

// ==========================================
// 6. HOMEPAGE DASHBOARD & ANIMATED CHART
// ==========================================
function startLiveClock() {
  function updateTime() {
    const now = new Date();
    const clockEl = document.getElementById('liveClockText');
    if (clockEl) {
      const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
      clockEl.textContent = `${now.toLocaleDateString(undefined, options)}`;
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
}

document.querySelectorAll('.btn-graph-mode').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-graph-mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGraphMode = btn.dataset.mode;
    renderStockChart();
  });
});

function initStockChart() {
  const ctx = document.getElementById('liveStockChart');
  if (!ctx) return;

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(0, 56, 101, 0.45)');
  gradient.addColorStop(1, 'rgba(0, 56, 101, 0.02)');

  liveStockChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Stock Movement Volume',
        data: [],
        borderColor: '#003865',
        borderWidth: 3,
        pointBackgroundColor: '#0f766e',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeInOutQuart'
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { family: 'Inter', size: 12, weight: '600' },
            color: '#334155'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.5)' },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b', precision: 0 }
        }
      }
    }
  });
}

function renderStockChart() {
  if (!liveStockChart) initStockChart();
  if (!liveStockChart) return;

  if (currentGraphMode === 'movement') {
    const recentLogs = [...logsData].reverse().slice(-14);
    if (recentLogs.length === 0) {
      liveStockChart.data.labels = ['No Data'];
      liveStockChart.data.datasets[0].data = [0];
      liveStockChart.data.datasets[0].label = 'No Transactions Yet';
    } else {
      liveStockChart.data.labels = recentLogs.map(l => {
        const d = new Date(l.date);
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      });
      liveStockChart.data.datasets[0].data = recentLogs.map(l => Number(l.newQty) || 0);
      liveStockChart.data.datasets[0].label = 'Balance Level After Transaction';
    }
  } else {
    const items = Object.values(inventoryData).slice(0, 12);
    if (items.length === 0) {
      liveStockChart.data.labels = ['No Items'];
      liveStockChart.data.datasets[0].data = [0];
      liveStockChart.data.datasets[0].label = 'Empty Inventory';
    } else {
      liveStockChart.data.labels = items.map(i => escapeHtml(i.name));
      liveStockChart.data.datasets[0].data = items.map(i => Number(i.quantity) || 0);
      liveStockChart.data.datasets[0].label = 'Current Quantity in Stock';
    }
  }

  liveStockChart.update();
}

function updateDashboard() {
  renderStockChart();

  const items = Object.values(inventoryData);
  const outOfStock = items.filter(i => (Number(i.quantity) || 0) === 0);
  const lowStock = items.filter(i => (Number(i.quantity) || 0) > 0 && (Number(i.quantity) || 0) <= 5);
  const attentionItems = [...outOfStock, ...lowStock];

  const attentionListEl = document.getElementById('homeAttentionList');
  const countBadge = document.getElementById('outOfStockCountBadge');
  if (countBadge) countBadge.textContent = `${attentionItems.length}`;

  if (attentionListEl) {
    if (attentionItems.length === 0) {
      attentionListEl.innerHTML = '<p class="empty-state-text"><i class="fa-solid fa-check-double" style="color:var(--success);"></i> All items are sufficiently stocked.</p>';
    } else {
      attentionListEl.innerHTML = attentionItems.map(item => `
        <div class="attention-item">
          <div class="attention-info">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${escapeHtml(item.category)} • Balance: <strong>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</strong></div>
          </div>
          <button type="button" class="btn-mini-restock" onclick="quickRestockItem('${encodeDbKey(item.name)}')">
            <i class="fa-solid fa-plus"></i> Restock
          </button>
        </div>
      `).join('');
    }
  }

  const feedEl = document.getElementById('homeRecentActivityList');
  if (feedEl) {
    const recent = logsData.slice(0, 5);
    if (recent.length === 0) {
      feedEl.innerHTML = '<p class="empty-state-text">No activity recorded yet.</p>';
    } else {
      feedEl.innerHTML = recent.map(l => {
        const isIN = l.action === 'IN';
        return `
          <div class="feed-item">
            <div class="feed-left">
              <div class="feed-icon ${isIN ? 'in' : 'out'}">
                <i class="fa-solid ${isIN ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
              </div>
              <div class="feed-details">
                <div class="feed-title"><strong>${escapeHtml(l.itemName)}</strong> (${escapeHtml(l.remarks || (isIN ? 'Stock In' : 'Stock Out'))})</div>
                <div class="feed-time">${new Date(l.date).toLocaleString()}</div>
              </div>
            </div>
            <div class="feed-qty ${isIN ? 'in' : 'out'}">
              ${isIN ? '+' : '-'}${escapeHtml(l.qtyChanged)} ${escapeHtml(l.unit || '')}
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

window.quickRestockItem = function(key) {
  const item = inventoryData[key];
  if (!item) return;
  document.querySelector('[data-target="tabForm"]').click();
  document.getElementById('stockItemName').value = item.name;
  stockCategorySelect.value = item.category;
  document.getElementById('stockUnit').value = item.unit || 'pcs';
  const radio = document.querySelector('input[name="actionType"][value="IN"]');
  if (radio) radio.checked = true;
  document.getElementById('stockQuantity').value = '';
  document.getElementById('stockQuantity').focus();
};

// ==========================================
// 7. AUTOCOMPLETE DATALIST HELPER
// ==========================================
function updateHistoryDatalist() {
  itemHistoryList.innerHTML = '';
  Object.values(inventoryData).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.name;
    itemHistoryList.appendChild(opt);
  });
}

// ==========================================
// 8. RECORD STOCK TRANSACTION (VALIDATED & AUTO-REFRESH)
// ==========================================
stockForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.getElementById('stockItemName').value.trim().slice(0, 80);
  const category = stockCategorySelect.value.trim().slice(0, 50);
  const unit = document.getElementById('stockUnit').value.trim().slice(0, 20);
  const actionRadio = document.querySelector('input[name="actionType"]:checked');
  const action = actionRadio && actionRadio.value === 'OUT' ? 'OUT' : 'IN';
  const qty = Math.max(1, Math.min(100000, parseInt(document.getElementById('stockQuantity').value, 10) || 1));
  const remarks = document.getElementById('stockRemarks').value.trim().slice(0, 200);

  if (!name || !category || !unit) {
    showToast('Please fill out all required fields.', 'warning', 'Form Incomplete');
    return;
  }

  const itemKey = encodeDbKey(name);
  const existing = inventoryData[itemKey];

  let currentQty = existing ? (Number(existing.quantity) || 0) : 0;
  let newQty = currentQty;

  if (action === 'IN') {
    newQty = currentQty + qty;
  } else {
    newQty = Math.max(0, currentQty - qty);
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    date: timestamp,
    action: action,
    qtyChanged: qty,
    prevQty: currentQty,
    newQty: newQty,
    remarks: remarks || (action === 'IN' ? 'Stock Added' : 'Stock Issued'),
    itemName: name,
    category: category,
    unit: unit
  };

  // 1. Optimistic Immediate Update
  inventoryData[itemKey] = {
    name: name,
    category: category,
    unit: unit,
    quantity: newQty,
    lastUpdated: timestamp
  };
  logsData.unshift(logEntry);

  // 2. Persist to Firebase
  db.ref(`inventory/${itemKey}`).update({
    name: name,
    category: category,
    unit: unit,
    quantity: newQty,
    lastUpdated: timestamp
  });
  db.ref(`inventory/${itemKey}/logs`).push(logEntry);
  db.ref('activity_logs').push(logEntry);

  // 3. Clear form and trigger auto-refresh across entire system
  stockForm.reset();
  refreshAllViews();
  showToast(
    `${name} balance is now ${newQty} ${unit} (${action === 'IN' ? '+' : '-'}${qty})`,
    'success',
    'Transaction Recorded'
  );

  // 4. Switch to Database tab to inspect updated item
  document.querySelector('[data-target="tabDatabase"]').click();
});

// ==========================================
// 9. RENDER INVENTORY (ENCODED & GROUPED)
// ==========================================
function renderInventory() {
  const searchTerm = dbSearchInput.value.toLowerCase().trim();
  const catFilter = dbCategoryFilter.value;
  const statusFilter = dbStatusFilter.value;

  const items = Object.entries(inventoryData).map(([key, val]) => ({ key, ...val }));

  const filtered = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                          item.category.toLowerCase().includes(searchTerm);
    const matchesCat = !catFilter || item.category === catFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'in_stock' && (Number(item.quantity) || 0) > 0) ||
      (statusFilter === 'out_of_stock' && (Number(item.quantity) || 0) === 0);
    return matchesSearch && matchesCat && matchesStatus;
  });

  if (filtered.length === 0) {
    inventoryContainer.innerHTML = '<div style="padding:2.5rem; text-align:center; color:#526175;">No inventory items found.</div>';
    return;
  }

  const grouped = {};
  filtered.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  let html = '';
  for (const [catName, catItems] of Object.entries(grouped)) {
    html += `
      <div class="category-group">
        <h3 class="category-group-header"><i class="fa-solid fa-folder"></i> ${escapeHtml(catName)} (${catItems.length})</h3>
        <div class="category-items-grid">
    `;
    catItems.forEach(item => {
      const qtyNum = Number(item.quantity) || 0;
      const isZero = qtyNum === 0;
      html += `
        <div class="stock-card ${isZero ? 'zero-stock' : ''}" data-key="${encodeDbKey(item.key)}">
          <div class="card-title">${escapeHtml(item.name)}</div>
          <div class="card-category">${escapeHtml(item.category)}</div>
          <div class="card-details">
            <span class="card-qty">${qtyNum} <small style="font-size:0.8rem; font-weight:normal;">${escapeHtml(item.unit)}</small></span>
            <span class="badge-status ${isZero ? 'status-out' : 'status-in'}">
              ${isZero ? 'Out of Stock (0 Qty)' : 'In Stock'}
            </span>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  inventoryContainer.innerHTML = html;
  attachCardEvents();
}

// ==========================================
// 10. STATS CALCULATIONS
// ==========================================
function updateStats() {
  const items = Object.values(inventoryData);
  const total = items.length;
  const inStock = items.filter(i => (Number(i.quantity) || 0) > 0).length;
  const outOfStock = items.filter(i => (Number(i.quantity) || 0) === 0).length;
  const totalVolume = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  const elTotal = document.getElementById('statTotalItems');
  const elInStock = document.getElementById('statInStock');
  const elOut = document.getElementById('statOutOfStock');
  const elCats = document.getElementById('statCategories');
  const elVolume = document.getElementById('statTotalVolume');

  if (elTotal) elTotal.textContent = total;
  if (elInStock) elInStock.textContent = inStock;
  if (elOut) elOut.textContent = outOfStock;
  if (elCats) elCats.textContent = categoriesData.length;
  if (elVolume) elVolume.textContent = totalVolume.toLocaleString();
}

// ==========================================
// 11. ITEM CONTEXT MENU & HISTORY MODAL
// ==========================================
function attachCardEvents() {
  document.querySelectorAll('.stock-card').forEach(card => {
    const key = card.dataset.key;

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openItemContextMenu(e.pageX, e.pageY, key);
    });

    let touchTimer;
    card.addEventListener('touchstart', (e) => {
      touchTimer = setTimeout(() => {
        const touch = e.touches[0];
        openItemContextMenu(touch.pageX, touch.pageY, key);
      }, 500);
    });
    card.addEventListener('touchend', () => clearTimeout(touchTimer));
    card.addEventListener('touchmove', () => clearTimeout(touchTimer));
  });
}

function openItemContextMenu(x, y, itemKey) {
  activeContextItem = itemKey;
  itemContextMenu.style.left = `${Math.min(x, window.innerWidth - 230)}px`;
  itemContextMenu.style.top = `${y}px`;
  itemContextMenu.classList.remove('hidden');
}

window.addEventListener('click', () => {
  itemContextMenu.classList.add('hidden');
  categoryContextMenu.classList.add('hidden');
});

document.getElementById('ctxViewHistory').addEventListener('click', () => {
  if (!activeContextItem) return;
  const item = inventoryData[activeContextItem];
  if (!item) return;

  document.getElementById('modalItemTitle').textContent = `${escapeHtml(item.name)} - Stock History`;
  const body = document.getElementById('modalTimelineBody');
  body.innerHTML = '<div class="loading-spinner">Fetching transaction history...</div>';
  historyModal.classList.remove('hidden');

  db.ref(`inventory/${activeContextItem}/logs`).once('value', (snap) => {
    const logs = [];
    snap.forEach(c => logs.unshift(c.val()));

    if (logs.length === 0) {
      body.innerHTML = '<p style="color:#64748b;">No movements recorded yet.</p>';
      return;
    }

    body.innerHTML = logs.map(l => `
      <div class="timeline-item">
        <div class="timeline-date">${new Date(l.date).toLocaleString()}</div>
        <div class="timeline-desc">
          <span class="${l.action === 'IN' ? 'badge-in' : 'badge-out'}">${l.action === 'IN' ? 'Added +' : 'Reduced -'}${escapeHtml(l.qtyChanged)} ${escapeHtml(l.unit || '')}</span>
          <span>(Balance: ${escapeHtml(l.newQty)})</span>
        </div>
        <div class="timeline-notes">${escapeHtml(l.remarks || 'No remarks provided.')}</div>
      </div>
    `).join('');
  });
});

document.getElementById('ctxQuickAction').addEventListener('click', () => {
  if (!activeContextItem) return;
  const item = inventoryData[activeContextItem];
  if (!item) return;
  document.querySelector('[data-target="tabForm"]').click();
  document.getElementById('stockItemName').value = item.name;
  stockCategorySelect.value = item.category;
  document.getElementById('stockUnit').value = item.unit || 'pcs';
});

closeModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('#historyModal .modal-backdrop').addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('#renameCategoryModal .modal-backdrop').addEventListener('click', () => renameCategoryModal.classList.add('hidden'));

// ==========================================
// 12. AUDIT LOGS TABLE
// ==========================================
function renderLogs(logs) {
  const filter = logSearchInput.value.toLowerCase().trim();
  const filtered = logs.filter(l =>
    (l.itemName && l.itemName.toLowerCase().includes(filter)) ||
    (l.remarks && l.remarks.toLowerCase().includes(filter))
  );

  if (filtered.length === 0) {
    logsTableBody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#526175;">No logs found.</td></tr>';
    return;
  }

  logsTableBody.innerHTML = filtered.map(l => `
    <tr>
      <td>${new Date(l.date).toLocaleDateString()} ${new Date(l.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      <td><span class="${l.action === 'IN' ? 'badge-in' : 'badge-out'}">${escapeHtml(l.action)}</span></td>
      <td><strong>${escapeHtml(l.itemName)}</strong></td>
      <td>${l.action === 'IN' ? '+' : '-'}${escapeHtml(l.qtyChanged)} ${escapeHtml(l.unit || '')}</td>
      <td>${escapeHtml(l.newQty)}</td>
      <td><small>${escapeHtml(l.remarks || '')}</small></td>
    </tr>
  `).join('');
}

logSearchInput.addEventListener('input', () => renderLogs(logsData));
dbSearchInput.addEventListener('input', renderInventory);
dbCategoryFilter.addEventListener('change', renderInventory);
dbStatusFilter.addEventListener('change', renderInventory);

// ==========================================
// INITIAL BOOTSTRAP
// ==========================================
ensureInitialSeed();
checkSession();
