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
let unitsData = [];
let logsData = [];
let activeContextItem = null;
let activeContextCategory = null;
let activeContextUnit = null;
let currentGraphMode = 'movement'; // 'movement' or 'levels'
let liveStockChart = null;

// DOM Elements - Login & Auth
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

// DOM Elements - Navigation & Header Profile
const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
const cancelProfileModalBtn = document.getElementById('cancelProfileModalBtn');
const changePasscodeForm = document.getElementById('changePasscodeForm');
const changePasscodeError = document.getElementById('changePasscodeError');
const oldPasscodeInput = document.getElementById('oldPasscode');
const newPasscodeInput = document.getElementById('newPasscode');
const togglePasscodeAccordionBtn = document.getElementById('togglePasscodeAccordionBtn');
const passcodeAccordionBody = document.getElementById('passcodeAccordionBody');
const passcodeAccordionChevron = document.getElementById('passcodeAccordionChevron');
const passcodeToggleLabel = document.getElementById('passcodeToggleLabel');

// DOM Elements - Confirmation Modal
const confirmModal = document.getElementById('confirmModal');
const confirmTitleEl = document.getElementById('confirmTitle');
const confirmMessageEl = document.getElementById('confirmMessage');
const confirmDetailsBox = document.getElementById('confirmDetailsBox');
const acceptConfirmBtn = document.getElementById('acceptConfirmBtn');
const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
const closeConfirmModalBtn = document.getElementById('closeConfirmModalBtn');
let onConfirmCallback = null;

// App DOM Elements - Tabs & Forms
const stockForm = document.getElementById('stockForm');
const categoryForm = document.getElementById('categoryForm');
const unitForm = document.getElementById('unitForm');
const inventoryContainer = document.getElementById('inventoryContainer');
const itemHistoryList = document.getElementById('itemHistoryList');
const stockCategorySelect = document.getElementById('stockCategory');
const stockUnitSelect = document.getElementById('stockUnit');
const dbCategoryFilter = document.getElementById('dbCategoryFilter');
const dbSearchInput = document.getElementById('dbSearchInput');
const dbStatusFilter = document.getElementById('dbStatusFilter');
const dbResetFiltersBtn = document.getElementById('dbResetFiltersBtn');
const dbItemsSummaryBadge = document.getElementById('dbItemsSummaryBadge');
const itemContextMenu = document.getElementById('itemContextMenu');
const categoryContextMenu = document.getElementById('categoryContextMenu');
const unitContextMenu = document.getElementById('unitContextMenu');
const historyModal = document.getElementById('historyModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const renameCategoryModal = document.getElementById('renameCategoryModal');
const renameCategoryForm = document.getElementById('renameCategoryForm');
const renameCategoryInput = document.getElementById('renameCategoryInput');
const closeRenameModalBtn = document.getElementById('closeRenameModalBtn');
const cancelRenameBtn = document.getElementById('cancelRenameBtn');
const renameUnitModal = document.getElementById('renameUnitModal');
const renameUnitForm = document.getElementById('renameUnitForm');
const renameUnitInput = document.getElementById('renameUnitInput');
const closeRenameUnitModalBtn = document.getElementById('closeRenameUnitModalBtn');
const cancelRenameUnitBtn = document.getElementById('cancelRenameUnitBtn');
const logsTableBody = document.getElementById('logsTableBody');
const logSearchInput = document.getElementById('logSearchInput');

// Subtabs - Categories vs Units
const tabSubBtnCategories = document.getElementById('tabSubBtnCategories');
const tabSubBtnUnits = document.getElementById('tabSubBtnUnits');
const subpanelCategories = document.getElementById('subpanelCategories');
const subpanelUnits = document.getElementById('subpanelUnits');
const categoryCountSubtab = document.getElementById('categoryCountSubtab');
const unitCountSubtab = document.getElementById('unitCountSubtab');

// ==========================================
// 0. LUCIDE SVG ICONS REFRESH HELPER
// ==========================================
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ==========================================
// 0.1 SECURITY & DATA INTEGRITY UTILITIES
// ==========================================
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

function encodeDbKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 80);
}

async function computeSecureHash(pin) {
  const encoder = new TextEncoder();
  const saltedPayload = `nia_property_salt_2026_${pin}_secure_auth`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(saltedPayload));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// 0.2 NON-BLOCKING GLASS TOAST NOTIFICATION
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
    iconEl.setAttribute('data-lucide', 'check-circle-2');
  } else if (type === 'warning') {
    iconEl.setAttribute('data-lucide', 'alert-triangle');
  } else if (type === 'error') {
    iconEl.setAttribute('data-lucide', 'x-circle');
  } else {
    iconEl.setAttribute('data-lucide', 'info');
  }

  toastEl.classList.remove('hidden', 'toast-hide');
  refreshIcons();

  toastTimeout = setTimeout(() => {
    toastEl.classList.add('toast-hide');
    setTimeout(() => toastEl.classList.add('hidden'), 250);
  }, 3200);
}

// ==========================================
// 0.3 UNIVERSAL CONFIRMATION MODAL HELPER
// ==========================================
function openConfirmDialog({ 
  title, 
  message, 
  detailsHtml = '', 
  confirmText = 'Confirm & Proceed', 
  cancelText = 'Cancel', 
  confirmBtnClass = 'btn-primary', 
  iconTheme = 'warning', 
  onConfirm 
}) {
  confirmTitleEl.textContent = title || 'Confirm Action';
  confirmMessageEl.textContent = message || 'Please confirm this action to proceed:';

  const iconWrap = document.getElementById('confirmIconWrap');
  const confirmIcon = document.getElementById('confirmIcon');

  if (iconTheme === 'danger') {
    iconWrap.className = 'w-8 h-8 rounded-full flex items-center justify-center danger';
    confirmIcon.setAttribute('data-lucide', 'alert-triangle');
  } else if (iconTheme === 'info') {
    iconWrap.className = 'w-8 h-8 rounded-full flex items-center justify-center info';
    confirmIcon.setAttribute('data-lucide', 'info');
  } else {
    iconWrap.className = 'w-8 h-8 rounded-full flex items-center justify-center text-amber-600 bg-amber-50 border border-amber-200';
    confirmIcon.setAttribute('data-lucide', 'alert-triangle');
  }

  if (detailsHtml) {
    confirmDetailsBox.innerHTML = detailsHtml;
    confirmDetailsBox.classList.remove('hidden');
  } else {
    confirmDetailsBox.innerHTML = '';
    confirmDetailsBox.classList.add('hidden');
  }

  cancelConfirmBtn.textContent = cancelText;
  acceptConfirmBtn.textContent = confirmText;
  acceptConfirmBtn.className = `btn glass-btn text-xs py-2 px-4 rounded-full ${confirmBtnClass}`;

  onConfirmCallback = onConfirm;
  confirmModal.classList.remove('hidden');
  refreshIcons();
}

function closeConfirmDialog() {
  confirmModal.classList.add('hidden');
  onConfirmCallback = null;
}

acceptConfirmBtn.addEventListener('click', () => {
  if (typeof onConfirmCallback === 'function') {
    const cb = onConfirmCallback;
    closeConfirmDialog();
    cb();
  } else {
    closeConfirmDialog();
  }
});

cancelConfirmBtn.addEventListener('click', closeConfirmDialog);
closeConfirmModalBtn.addEventListener('click', closeConfirmDialog);
document.querySelector('#confirmModal .modal-backdrop').addEventListener('click', closeConfirmDialog);

// ==========================================
// 0.4 MASTER INSTANT REFRESH ENGINE
// ==========================================
function refreshAllViews() {
  updateStats();
  updateDashboard();
  renderInventory();
  renderCategoriesList();
  renderUnitsList();
  refreshUnitSelects();
  updateHistoryDatalist();
  renderLogs(logsData);
  if (liveStockChart) liveStockChart.resize();
  refreshIcons();
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
// 1. PRE-SEED DEFAULT ADMIN, CATEGORIES & UNITS
// ==========================================
async function ensureInitialSeed() {
  const defaultHash = await computeSecureHash('1234');

  db.ref('users/property').once('value', (snap) => {
    if (!snap.exists()) {
      db.ref('users/property').set({
        username: 'property',
        passwordHash: defaultHash,
        role: 'admin',
        title: 'Administrator'
      });
    } else {
      const val = snap.val();
      if (!val.passwordHash || val.password === '1234' || val.password === 'propertyoffice') {
        db.ref('users/property').update({
          passwordHash: defaultHash,
          title: 'Administrator'
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

  db.ref('units').once('value', (snap) => {
    if (!snap.exists()) {
      const initialUnits = ["pcs", "boxes", "reams", "sets", "rolls", "packs", "units", "meters", "bottles", "pairs"];
      initialUnits.forEach(u => db.ref('units').push(u));
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
  return [{ username: 'property', role: 'admin', title: 'Administrator' }];
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
    recentUsernameEl.textContent = 'Administrator';
    recentLoginCard.classList.remove('hidden');
    usernameGroup.classList.add('hidden');
  } else {
    recentLoginCard.classList.add('hidden');
    usernameGroup.classList.remove('hidden');
  }
  clearPinInputs();
  refreshIcons();
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
  refreshIcons();
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
        title: 'Administrator',
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

// Logout with Simple Confirmation & Red Warning Icon
logoutBtn.addEventListener('click', () => {
  openConfirmDialog({
    title: 'Sign Out',
    message: 'Are you sure you want to sign out?',
    detailsHtml: '',
    confirmText: 'Sign Out',
    cancelText: 'Cancel',
    iconTheme: 'danger',
    confirmBtnClass: 'btn-primary bg-red-600 hover:bg-red-700 shadow-sm',
    onConfirm: () => {
      localStorage.removeItem('nia_session');
      location.reload();
    }
  });
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
    const heroName = document.getElementById('heroUserName');
    if (heroName) heroName.textContent = 'Administrator';
  } catch (e) {}

  initDataListeners();
  startLiveClock();
  refreshIcons();
}

// ==========================================
// 3. ADMINISTRATOR PROFILE & CHANGE PASSCODE POPUP
// ==========================================
profileBtn.addEventListener('click', () => {
  changePasscodeError.classList.add('hidden');
  changePasscodeForm.reset();
  if (passcodeAccordionBody) {
    passcodeAccordionBody.classList.add('hidden');
    if (passcodeAccordionChevron) passcodeAccordionChevron.style.transform = 'rotate(0deg)';
    if (passcodeToggleLabel) passcodeToggleLabel.textContent = 'Expand';
  }
  profileModal.classList.remove('hidden');
  refreshIcons();
});

if (togglePasscodeAccordionBtn) {
  togglePasscodeAccordionBtn.addEventListener('click', () => {
    const isHidden = passcodeAccordionBody.classList.contains('hidden');
    if (isHidden) {
      passcodeAccordionBody.classList.remove('hidden');
      if (passcodeAccordionChevron) passcodeAccordionChevron.style.transform = 'rotate(180deg)';
      if (passcodeToggleLabel) passcodeToggleLabel.textContent = 'Minimize';
      setTimeout(() => oldPasscodeInput.focus(), 120);
    } else {
      passcodeAccordionBody.classList.add('hidden');
      if (passcodeAccordionChevron) passcodeAccordionChevron.style.transform = 'rotate(0deg)';
      if (passcodeToggleLabel) passcodeToggleLabel.textContent = 'Expand';
    }
    refreshIcons();
  });
}

function closeProfileModal() {
  profileModal.classList.add('hidden');
  if (passcodeAccordionBody) {
    passcodeAccordionBody.classList.add('hidden');
    if (passcodeAccordionChevron) passcodeAccordionChevron.style.transform = 'rotate(0deg)';
    if (passcodeToggleLabel) passcodeToggleLabel.textContent = 'Expand';
  }
}

closeProfileModalBtn.addEventListener('click', closeProfileModal);
cancelProfileModalBtn.addEventListener('click', closeProfileModal);
document.querySelector('#profileModal .modal-backdrop').addEventListener('click', closeProfileModal);

changePasscodeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  changePasscodeError.classList.add('hidden');

  const oldCode = oldPasscodeInput.value.trim();
  const newCode = newPasscodeInput.value.trim();

  if (!/^\d{4}$/.test(oldCode)) {
    changePasscodeError.textContent = 'Current passcode must be 4 numeric digits.';
    changePasscodeError.classList.remove('hidden');
    oldPasscodeInput.focus();
    return;
  }

  if (!/^\d{4}$/.test(newCode)) {
    changePasscodeError.textContent = 'New passcode must be exactly 4 numeric digits.';
    changePasscodeError.classList.remove('hidden');
    newPasscodeInput.focus();
    return;
  }

  if (oldCode === newCode) {
    changePasscodeError.textContent = 'New passcode cannot be identical to current passcode.';
    changePasscodeError.classList.remove('hidden');
    newPasscodeInput.focus();
    return;
  }

  const session = JSON.parse(localStorage.getItem('nia_session') || '{}');
  const username = session.username || 'property';

  const oldHash = await computeSecureHash(oldCode);

  db.ref(`users/${username}`).once('value', async (snap) => {
    const user = snap.val();
    const isOldValid = user && (user.passwordHash === oldHash || user.password === oldCode || (username === 'property' && oldCode === '1234'));

    if (!isOldValid) {
      changePasscodeError.textContent = 'Incorrect current passcode. Please try again.';
      changePasscodeError.classList.remove('hidden');
      oldPasscodeInput.focus();
      return;
    }

    // Confirmation before committing new passcode
    openConfirmDialog({
      title: 'Confirm Passcode Update',
      message: 'Are you sure you want to update your 4-digit passcode?',
      detailsHtml: `
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">Account:</span>
          <span class="confirm-detail-value">Administrator (@${escapeHtml(username)})</span>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">New Passcode:</span>
          <span class="confirm-detail-value font-mono tracking-widest text-[#003865]">${escapeHtml(newCode)}</span>
        </div>
      `,
      confirmText: 'Yes, Update Passcode',
      confirmBtnClass: 'btn-primary',
      onConfirm: async () => {
        const newHash = await computeSecureHash(newCode);

        await db.ref(`users/${username}`).update({
          passwordHash: newHash,
          password: null,
          lastPasscodeChange: new Date().toISOString()
        });

        closeProfileModal();
        showToast(`Passcode updated successfully to "${newCode}"!`, 'success', 'Security Updated');
      }
    });
  });
});

// ==========================================
// 4. NAVIGATION DOCK
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
    refreshIcons();
  });
});

window.openStockFormWithAction = function(action) {
  document.querySelector('[data-target="tabForm"]').click();
  const safeAction = action === 'OUT' ? 'OUT' : 'IN';
  const radio = document.querySelector(`input[name="actionType"][value="${safeAction}"]`);
  if (radio) radio.checked = true;
  document.getElementById('stockItemName').focus();
  refreshIcons();
};

// ==========================================
// 5. REALTIME DATA LISTENERS
// ==========================================
function initDataListeners() {
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

  db.ref('units').on('value', (snap) => {
    unitsData = [];
    snap.forEach(child => {
      unitsData.push({ key: child.key, name: String(child.val() || '') });
    });
    refreshUnitSelects();
    renderUnitsList();
    refreshIcons();
  });

  db.ref('inventory').on('value', (snap) => {
    inventoryData = snap.val() || {};
    refreshAllViews();
  });

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
// 6. CATEGORY MANAGEMENT (CLICKABLE 3-DOTS & CONFIRMATIONS)
// ==========================================
function renderCategoriesList() {
  const listEl = document.getElementById('categoriesList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const totalEl = document.getElementById('categoryTotalBadge');
  if (totalEl) totalEl.textContent = `${categoriesData.length} Total`;
  const subtabBadge = document.getElementById('categoryCountSubtab');
  if (subtabBadge) subtabBadge.textContent = categoriesData.length;

  categoriesData.forEach(cat => {
    const count = getCategoryItemCount(cat.name);
    const chip = document.createElement('div');
    chip.className = 'category-chip glass-subpanel flex items-center justify-between gap-2.5';
    chip.dataset.key = cat.key;
    chip.dataset.name = cat.name;
    chip.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="folder" class="w-4 h-4 text-[#003865] flex-shrink-0"></i>
        <span class="category-chip-name font-semibold text-slate-800 truncate">${escapeHtml(cat.name)}</span>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <span class="category-count-badge" title="${count} item(s) in this category">${count}</span>
        <button type="button" class="btn-category-options" data-key="${cat.key}" data-name="${escapeHtml(cat.name)}" title="Category Options">
          <i data-lucide="more-vertical" class="w-4 h-4 text-slate-600"></i>
        </button>
      </div>
    `;

    // Clickable 3-dots button for category options
    chip.querySelector('.btn-category-options').addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      openCategoryContextMenu(rect.left - 130, rect.bottom + window.scrollY + 6, cat.key, cat.name);
    });

    listEl.appendChild(chip);
  });

  refreshIcons();
}

function openCategoryContextMenu(x, y, key, name) {
  activeContextCategory = { key, name };
  document.getElementById('ctxCategoryTitle').textContent = `Category: ${name}`;
  categoryContextMenu.style.left = `${Math.max(10, Math.min(x, window.innerWidth - 230))}px`;
  categoryContextMenu.style.top = `${y}px`;
  categoryContextMenu.classList.remove('hidden');
  refreshIcons();
}

document.getElementById('ctxRenameCategory').addEventListener('click', () => {
  if (!activeContextCategory) return;
  categoryContextMenu.classList.add('hidden');
  renameCategoryInput.value = activeContextCategory.name;
  renameCategoryModal.classList.remove('hidden');
  refreshIcons();
  setTimeout(() => renameCategoryInput.focus(), 100);
});

// Rename Category with Confirmation
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

  const affectedCount = getCategoryItemCount(oldName);

  openConfirmDialog({
    title: 'Confirm Category Rename',
    message: `Are you sure you want to rename "${oldName}" to "${newName}"?`,
    detailsHtml: `
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Current Name:</span>
        <span class="confirm-detail-value">${escapeHtml(oldName)}</span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">New Name:</span>
        <span class="confirm-detail-value font-semibold text-[#003865]">${escapeHtml(newName)}</span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Affected Items:</span>
        <span class="confirm-detail-value">${affectedCount} item(s) will be updated</span>
      </div>
    `,
    confirmText: 'Rename Category',
    confirmBtnClass: 'btn-primary',
    onConfirm: () => {
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

      const found = categoriesData.find(c => c.key === key);
      if (found) found.name = newName;

      renameCategoryModal.classList.add('hidden');
      refreshCategorySelects();
      refreshAllViews();
      showToast(`Category renamed to "${newName}"`, 'info', 'Category Updated');
    }
  });
});

closeRenameModalBtn.addEventListener('click', () => renameCategoryModal.classList.add('hidden'));
cancelRenameBtn.addEventListener('click', () => renameCategoryModal.classList.add('hidden'));

// Remove Category with Confirmation
document.getElementById('ctxRemoveCategory').addEventListener('click', () => {
  if (!activeContextCategory) return;
  categoryContextMenu.classList.add('hidden');

  const { key, name } = activeContextCategory;
  const count = getCategoryItemCount(name);

  openConfirmDialog({
    title: 'Confirm Category Deletion',
    message: `Are you sure you want to remove the category "${name}"?`,
    detailsHtml: `
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Category Name:</span>
        <span class="confirm-detail-value">${escapeHtml(name)}</span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Registered Items:</span>
        <span class="confirm-detail-value ${count > 0 ? 'text-red-600 font-bold' : ''}">${count} item(s)</span>
      </div>
      ${count > 0 ? '<p class="text-[11px] text-amber-700 mt-2"><strong>Warning:</strong> Existing items will keep their recorded category name until reassigned.</p>' : ''}
    `,
    confirmText: 'Delete Category',
    confirmBtnClass: 'btn-primary bg-red-600 hover:bg-red-700',
    onConfirm: () => {
      db.ref(`categories/${key}`).remove();
      categoriesData = categoriesData.filter(c => c.key !== key);
      refreshCategorySelects();
      refreshAllViews();
      showToast(`Category "${name}" removed`, 'warning', 'Category Deleted');
    }
  });
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
// 6.1 SUBTAB SWITCHER (CATEGORIES vs UNITS)
// ==========================================
if (tabSubBtnCategories && tabSubBtnUnits) {
  tabSubBtnCategories.addEventListener('click', () => {
    tabSubBtnCategories.classList.add('active');
    tabSubBtnCategories.classList.remove('text-slate-600');
    tabSubBtnUnits.classList.remove('active');
    tabSubBtnUnits.classList.add('text-slate-600');
    if (subpanelCategories) subpanelCategories.classList.remove('hidden');
    if (subpanelUnits) subpanelUnits.classList.add('hidden');
    refreshIcons();
  });

  tabSubBtnUnits.addEventListener('click', () => {
    tabSubBtnUnits.classList.add('active');
    tabSubBtnUnits.classList.remove('text-slate-600');
    tabSubBtnCategories.classList.remove('active');
    tabSubBtnCategories.classList.add('text-slate-600');
    if (subpanelUnits) subpanelUnits.classList.remove('hidden');
    if (subpanelCategories) subpanelCategories.classList.add('hidden');
    refreshIcons();
  });
}

// ==========================================
// 6.2 UNIT MANAGEMENT (VIEW, ADD, RENAME, REMOVE)
// ==========================================
function getUnitItemCount(unitName) {
  return Object.values(inventoryData).filter(item => item.unit === unitName).length;
}

function refreshUnitSelects() {
  const stockUnitSelect = document.getElementById('stockUnit');
  if (!stockUnitSelect) return;
  const currentVal = stockUnitSelect.value;
  stockUnitSelect.innerHTML = '<option value="">Select Unit</option>';

  unitsData.forEach(u => {
    const escaped = escapeHtml(u.name);
    stockUnitSelect.insertAdjacentHTML('beforeend', `<option value="${escaped}">${escaped}</option>`);
  });

  if (currentVal && unitsData.some(u => u.name === currentVal)) {
    stockUnitSelect.value = currentVal;
  } else if (unitsData.some(u => u.name === 'pcs')) {
    stockUnitSelect.value = 'pcs';
  }
}

function renderUnitsList() {
  const listEl = document.getElementById('unitsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const totalEl = document.getElementById('unitTotalBadge');
  if (totalEl) totalEl.textContent = `${unitsData.length} Total`;
  const subtabBadge = document.getElementById('unitCountSubtab');
  if (subtabBadge) subtabBadge.textContent = unitsData.length;

  unitsData.forEach(unit => {
    const count = getUnitItemCount(unit.name);
    const chip = document.createElement('div');
    chip.className = 'category-chip glass-subpanel flex items-center justify-between gap-2.5';
    chip.dataset.key = unit.key;
    chip.dataset.name = unit.name;
    chip.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="scale" class="w-4 h-4 text-[#0f766e] flex-shrink-0"></i>
        <span class="category-chip-name font-semibold text-slate-800 truncate">${escapeHtml(unit.name)}</span>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <span class="category-count-badge" title="${count} item(s) using this unit">${count}</span>
        <button type="button" class="btn-category-options btn-unit-options" data-key="${unit.key}" data-name="${escapeHtml(unit.name)}" title="Unit Options">
          <i data-lucide="more-vertical" class="w-4 h-4 text-slate-600"></i>
        </button>
      </div>
    `;

    chip.querySelector('.btn-unit-options').addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      openUnitContextMenu(rect.left - 130, rect.bottom + window.scrollY + 6, unit.key, unit.name);
    });

    listEl.appendChild(chip);
  });

  refreshIcons();
}

function openUnitContextMenu(x, y, key, name) {
  activeContextUnit = { key, name };
  const titleEl = document.getElementById('ctxUnitTitle');
  if (titleEl) titleEl.textContent = `Unit: ${name}`;
  if (unitContextMenu) {
    unitContextMenu.style.left = `${Math.max(10, Math.min(x, window.innerWidth - 230))}px`;
    unitContextMenu.style.top = `${y}px`;
    unitContextMenu.classList.remove('hidden');
  }
  refreshIcons();
}

// Add Unit Form Submit
if (unitForm) {
  unitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newUnitInput');
    const unitName = input.value.trim().toLowerCase().slice(0, 30);
    if (!unitName) return;

    if (unitsData.some(u => u.name.toLowerCase() === unitName)) {
      showToast(`Unit "${unitName}" already exists!`, 'warning', 'Duplicate Unit');
      return;
    }

    const newRef = db.ref('units').push(unitName);
    unitsData.push({ key: newRef.key, name: unitName });
    input.value = '';
    refreshUnitSelects();
    renderUnitsList();
    showToast(`Unit "${unitName}" added successfully`, 'success', 'Unit Created');
  });
}

// Rename Unit Modal actions
const ctxRenameUnitBtn = document.getElementById('ctxRenameUnit');
if (ctxRenameUnitBtn) {
  ctxRenameUnitBtn.addEventListener('click', () => {
    if (!activeContextUnit) return;
    if (unitContextMenu) unitContextMenu.classList.add('hidden');
    if (renameUnitInput) renameUnitInput.value = activeContextUnit.name;
    if (renameUnitModal) renameUnitModal.classList.remove('hidden');
    refreshIcons();
    setTimeout(() => { if (renameUnitInput) renameUnitInput.focus(); }, 100);
  });
}

if (closeRenameUnitModalBtn) {
  closeRenameUnitModalBtn.addEventListener('click', () => {
    if (renameUnitModal) renameUnitModal.classList.add('hidden');
  });
}
if (cancelRenameUnitBtn) {
  cancelRenameUnitBtn.addEventListener('click', () => {
    if (renameUnitModal) renameUnitModal.classList.add('hidden');
  });
}
const renameUnitBackdrop = document.querySelector('#renameUnitModal .modal-backdrop');
if (renameUnitBackdrop) {
  renameUnitBackdrop.addEventListener('click', () => {
    if (renameUnitModal) renameUnitModal.classList.add('hidden');
  });
}

if (renameUnitForm) {
  renameUnitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeContextUnit) return;

    const newName = renameUnitInput.value.trim().toLowerCase().slice(0, 30);
    const oldName = activeContextUnit.name;
    const key = activeContextUnit.key;

    if (!newName || newName === oldName) {
      if (renameUnitModal) renameUnitModal.classList.add('hidden');
      return;
    }

    const affectedCount = getUnitItemCount(oldName);

    openConfirmDialog({
      title: 'Confirm Unit Rename',
      message: `Are you sure you want to rename unit "${oldName}" to "${newName}"?`,
      detailsHtml: `
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">Current Unit:</span>
          <span class="confirm-detail-value">${escapeHtml(oldName)}</span>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">New Unit:</span>
          <span class="confirm-detail-value font-semibold text-[#003865]">${escapeHtml(newName)}</span>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">Affected Items:</span>
          <span class="confirm-detail-value">${affectedCount} item(s) will be updated</span>
        </div>
      `,
      confirmText: 'Rename Unit',
      confirmBtnClass: 'btn-primary',
      onConfirm: () => {
        db.ref(`units/${key}`).set(newName);

        const updates = {};
        Object.entries(inventoryData).forEach(([itemKey, item]) => {
          if (item.unit === oldName) {
            updates[`inventory/${itemKey}/unit`] = newName;
            item.unit = newName;
          }
        });

        if (Object.keys(updates).length > 0) {
          db.ref().update(updates);
        }

        const found = unitsData.find(u => u.key === key);
        if (found) found.name = newName;

        if (renameUnitModal) renameUnitModal.classList.add('hidden');
        refreshUnitSelects();
        refreshAllViews();
        showToast(`Unit renamed to "${newName}"`, 'info', 'Unit Updated');
      }
    });
  });
}

// Remove Unit with Confirmation
const ctxRemoveUnitBtn = document.getElementById('ctxRemoveUnit');
if (ctxRemoveUnitBtn) {
  ctxRemoveUnitBtn.addEventListener('click', () => {
    if (!activeContextUnit) return;
    if (unitContextMenu) unitContextMenu.classList.add('hidden');

    const { key, name } = activeContextUnit;
    const count = getUnitItemCount(name);

    openConfirmDialog({
      title: 'Confirm Unit Deletion',
      message: `Are you sure you want to remove the unit "${name}"?`,
      detailsHtml: `
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">Unit Name:</span>
          <span class="confirm-detail-value">${escapeHtml(name)}</span>
        </div>
        <div class="confirm-detail-row">
          <span class="confirm-detail-label">Registered Items:</span>
          <span class="confirm-detail-value ${count > 0 ? 'text-red-600 font-bold' : ''}">${count} item(s)</span>
        </div>
        ${count > 0 ? '<p class="text-[11px] text-amber-700 mt-2"><strong>Notice:</strong> Existing items will keep their recorded unit until modified.</p>' : ''}
      `,
      confirmText: 'Delete Unit',
      confirmBtnClass: 'btn-primary bg-red-600 hover:bg-red-700',
      onConfirm: () => {
        db.ref(`units/${key}`).remove();
        unitsData = unitsData.filter(u => u.key !== key);
        refreshUnitSelects();
        renderUnitsList();
        refreshAllViews();
        showToast(`Unit "${name}" removed`, 'warning', 'Unit Deleted');
      }
    });
  });
}

// ==========================================
// 7. HOMEPAGE DASHBOARD & ANIMATED CHART
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
      attentionListEl.innerHTML = '<p class="empty-state-text"><i data-lucide="check-check" class="w-4 h-4 text-emerald-500 inline mr-1"></i> All items are sufficiently stocked.</p>';
    } else {
      attentionListEl.innerHTML = attentionItems.map(item => `
        <div class="attention-item">
          <div class="attention-info">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${escapeHtml(item.category)} • Balance: <strong>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</strong></div>
          </div>
          <button type="button" class="btn-mini-restock" onclick="quickRestockItem('${encodeDbKey(item.name)}')">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Restock
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
                <i data-lucide="${isIN ? 'arrow-down-left' : 'arrow-up-right'}" class="w-4 h-4"></i>
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

  refreshIcons();
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
  refreshIcons();
};

// ==========================================
// 8. AUTOCOMPLETE DATALIST HELPER
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
// 9. RECORD STOCK TRANSACTION (CONFIRMATION ENGINE)
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

  const currentQty = existing ? (Number(existing.quantity) || 0) : 0;
  const newQty = action === 'IN' ? currentQty + qty : Math.max(0, currentQty - qty);

  // Open Glass Confirmation Dialog before committing
  openConfirmDialog({
    title: 'Confirm Stock Movement',
    message: 'Please review and confirm this stock movement before recording:',
    detailsHtml: `
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Item Name:</span>
        <span class="confirm-detail-value">${escapeHtml(name)}</span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Category:</span>
        <span class="confirm-detail-value">${escapeHtml(category)}</span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Transaction Type:</span>
        <span class="confirm-detail-value ${action === 'IN' ? 'text-emerald-700' : 'text-amber-700'} font-bold">
          ${action === 'IN' ? 'Stock IN (+ Added)' : 'Stock OUT (- Deducted)'}
        </span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Quantity:</span>
        <span class="confirm-detail-value font-bold">${qty} ${escapeHtml(unit)}</span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Inventory Balance:</span>
        <span class="confirm-detail-value font-mono font-bold">${currentQty} &rarr; <span class="text-[#003865]">${newQty} ${escapeHtml(unit)}</span></span>
      </div>
      <div class="confirm-detail-row">
        <span class="confirm-detail-label">Remarks:</span>
        <span class="confirm-detail-value italic text-slate-500">${remarks ? escapeHtml(remarks) : 'None (Optional)'}</span>
      </div>
    `,
    confirmText: 'Record Stock',
    confirmBtnClass: 'btn-primary',
    onConfirm: () => {
      const timestamp = new Date().toISOString();
      const logEntry = {
        date: timestamp,
        action: action,
        qtyChanged: qty,
        prevQty: currentQty,
        newQty: newQty,
        remarks: remarks || '',
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

      // 3. Clear form and trigger auto-refresh across system
      stockForm.reset();
      refreshAllViews();
      showToast(
        `${name} balance is now ${newQty} ${unit} (${action === 'IN' ? '+' : '-'}${qty})`,
        'success',
        'Stock Recorded'
      );

      // 4. Switch to Database tab
      document.querySelector('[data-target="tabDatabase"]').click();
    }
  });
});

// ==========================================
// 10. RENDER INVENTORY DATABASE (ENHANCED UI & ARRANGEMENT)
// ==========================================
function renderInventory() {
  const searchTerm = dbSearchInput.value.toLowerCase().trim();
  const catFilter = dbCategoryFilter.value;
  const statusFilter = dbStatusFilter.value;

  const items = Object.entries(inventoryData).map(([key, val]) => ({ key, ...val }));

  const filtered = items.filter(item => {
    const qtyNum = Number(item.quantity) || 0;
    const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                          item.category.toLowerCase().includes(searchTerm) ||
                          (item.unit && item.unit.toLowerCase().includes(searchTerm));
    const matchesCat = !catFilter || item.category === catFilter;
    let matchesStatus = true;
    if (statusFilter === 'in_stock') matchesStatus = qtyNum > 0;
    else if (statusFilter === 'out_of_stock') matchesStatus = qtyNum === 0;
    else if (statusFilter === 'low_stock') matchesStatus = qtyNum > 0 && qtyNum <= 5;

    return matchesSearch && matchesCat && matchesStatus;
  });

  // Update Summary Badge
  if (dbItemsSummaryBadge) {
    dbItemsSummaryBadge.textContent = `${filtered.length} of ${items.length} items displayed`;
  }

  if (filtered.length === 0) {
    inventoryContainer.innerHTML = `
      <div class="card glass-panel text-center py-12 px-4">
        <i data-lucide="package-search" class="w-12 h-12 text-slate-400 mx-auto mb-3"></i>
        <h4 class="font-bold text-slate-800 text-base mb-1">No matching items found</h4>
        <p class="text-xs text-slate-500 mb-4 max-w-sm mx-auto">Try adjusting your search terms or filters to find what you are looking for.</p>
        <button type="button" class="btn btn-secondary glass-btn-secondary text-xs py-1.5 px-3" onclick="resetDbFilters()">
          Clear Filters
        </button>
      </div>
    `;
    refreshIcons();
    return;
  }

  // Group by Category
  const grouped = {};
  filtered.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  let html = '';
  for (const [catName, catItems] of Object.entries(grouped)) {
    html += `
      <div class="category-group mb-6">
        <div class="category-group-header flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60">
          <div class="flex items-center gap-2">
            <i data-lucide="folder" class="w-4 h-4 text-[#003865]"></i>
            <span class="font-bold text-sm text-[#003865]">${escapeHtml(catName)}</span>
          </div>
          <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
            ${catItems.length} item${catItems.length > 1 ? 's' : ''}
          </span>
        </div>
        <div class="category-items-grid">
    `;
    catItems.forEach(item => {
      const qtyNum = Number(item.quantity) || 0;
      const isZero = qtyNum === 0;
      const isLow = qtyNum > 0 && qtyNum <= 5;
      html += `
        <div class="stock-card ${isZero ? 'zero-stock' : ''} flex flex-col justify-between" data-key="${encodeDbKey(item.key)}">
          <div>
            <div class="flex justify-between items-start gap-2 mb-1.5">
              <h4 class="card-title text-sm font-bold text-slate-900 leading-tight">${escapeHtml(item.name)}</h4>
              <span class="badge-status ${isZero ? 'status-out' : (isLow ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'status-in')}">
                ${isZero ? 'Out of Stock' : (isLow ? 'Low Stock' : 'In Stock')}
              </span>
            </div>
            <div class="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
              <i data-lucide="tag" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>${escapeHtml(item.category)}</span>
            </div>
          </div>

          <div class="mt-2 pt-2.5 border-t border-slate-200/70 flex items-center justify-between">
            <div>
              <span class="text-[11px] text-slate-500 block font-medium">Available Balance</span>
              <span class="card-qty text-base font-extrabold text-[#003865]">
                ${qtyNum} <small class="text-xs font-normal text-slate-500">${escapeHtml(item.unit)}</small>
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" class="btn-card-action" onclick="openItemHistory('${encodeDbKey(item.key)}')" title="View Stock Movement History">
                <i data-lucide="history" class="w-3.5 h-3.5"></i>
              </button>
              <button type="button" class="btn-card-action" onclick="openQuickAdjustment('${encodeDbKey(item.key)}')" title="Record Stock Adjustment">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  inventoryContainer.innerHTML = html;
  attachCardEvents();
  refreshIcons();
}

window.openItemHistory = function(itemKey) {
  activeContextItem = itemKey;
  const item = inventoryData[itemKey];
  if (!item) return;

  document.getElementById('modalItemTitle').textContent = `${item.name} - Stock History`;
  const body = document.getElementById('modalTimelineBody');
  body.innerHTML = '<div class="loading-spinner"><i data-lucide="loader-2" class="w-5 h-5 animate-spin inline mr-1"></i> Fetching transaction history...</div>';
  historyModal.classList.remove('hidden');
  refreshIcons();

  db.ref(`inventory/${itemKey}/logs`).once('value', (snap) => {
    const logs = [];
    snap.forEach(c => logs.unshift(c.val()));

    if (logs.length === 0) {
      body.innerHTML = '<p class="text-xs text-slate-500 py-4 text-center">No transaction logs recorded yet.</p>';
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
};

window.openQuickAdjustment = function(itemKey) {
  const item = inventoryData[itemKey];
  if (!item) return;
  document.querySelector('[data-target="tabForm"]').click();
  document.getElementById('stockItemName').value = item.name;
  stockCategorySelect.value = item.category;
  document.getElementById('stockUnit').value = item.unit || 'pcs';
  document.getElementById('stockQuantity').value = '';
  document.getElementById('stockQuantity').focus();
  refreshIcons();
};

window.resetDbFilters = function() {
  dbSearchInput.value = '';
  dbCategoryFilter.value = '';
  dbStatusFilter.value = '';
  renderInventory();
};

if (dbResetFiltersBtn) {
  dbResetFiltersBtn.addEventListener('click', resetDbFilters);
}

// ==========================================
// 11. STATS CALCULATIONS
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
// 12. ITEM CONTEXT MENU
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
  refreshIcons();
}

window.addEventListener('click', () => {
  itemContextMenu.classList.add('hidden');
  categoryContextMenu.classList.add('hidden');
  if (unitContextMenu) unitContextMenu.classList.add('hidden');
});

document.getElementById('ctxViewHistory').addEventListener('click', () => {
  if (activeContextItem) openItemHistory(activeContextItem);
});

document.getElementById('ctxQuickAction').addEventListener('click', () => {
  if (activeContextItem) openQuickAdjustment(activeContextItem);
});

closeModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('#historyModal .modal-backdrop').addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('#renameCategoryModal .modal-backdrop').addEventListener('click', () => renameCategoryModal.classList.add('hidden'));

// ==========================================
// 13. AUDIT LOGS TABLE
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
      <td><small class="text-slate-600">${escapeHtml(l.remarks || '—')}</small></td>
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
document.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
});
ensureInitialSeed();
checkSession();
refreshIcons();
