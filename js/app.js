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
// 1. Pre-seed Default Admin and Categories
// ==========================================
function ensureInitialSeed() {
  db.ref('users/property').once('value', (snap) => {
    if (!snap.exists()) {
      db.ref('users/property').set({
        username: 'property',
        password: '1234', // 4-digit passcode
        role: 'admin',
        title: 'Property Custodian'
      });
    } else {
      const val = snap.val();
      // Ensure 4-digit passcode format exists for 'property'
      if (!val.password || val.password === 'propertyoffice') {
        db.ref('users/property').update({ password: '1234', title: 'Property Custodian' });
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
// 2. Auth Flow with Recent Logins & 4-Digit Passcode
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

// Toggle manual username or recent account
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

// Passcode inputs navigation & auto-submit
pinInputs.forEach((input, index) => {
  // Input event: auto advance on digit
  input.addEventListener('input', (e) => {
    const val = input.value;
    if (val.length >= 1) {
      input.value = val.slice(-1); // Only keep single digit
      if (index < pinInputs.length - 1) {
        pinInputs[index + 1].focus();
      }
    }

    // Auto-enter: Check if all 4 digits are entered
    const code = getPasscodeValue();
    if (code.length === 4) {
      attemptLogin();
    }
  });

  // Keydown event: Backspace navigates to previous box
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && index > 0) {
      pinInputs[index - 1].focus();
    }
  });

  // Paste event: Support pasting 4 digits
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

// Perform Authentication
function attemptLogin() {
  loginError.classList.add('hidden');

  let username = activeLoginUsername;
  if (isManualUsernameMode) {
    username = loginUsernameInput.value.trim().toLowerCase();
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

  db.ref(`users/${username}`).once('value', (snap) => {
    const user = snap.val();
    // Allow either the 4-digit passcode or fallback to 1234 for property
    if (user && (user.password === passcode || (username === 'property' && passcode === '1234'))) {
      const userSession = {
        username: user.username || username,
        role: user.role || 'admin',
        title: user.title || 'Property Custodian'
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
  const session = localStorage.getItem('nia_session');
  if (session) {
    showApp();
  } else {
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
    setupLoginUI();
  }
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');

  try {
    const session = JSON.parse(localStorage.getItem('nia_session'));
    if (session) {
      document.getElementById('currentAccountBadge').textContent = session.username;
      const heroName = document.getElementById('heroUserName');
      if (heroName) heroName.textContent = session.title || session.username;
    }
  } catch (e) {}

  initDataListeners();
  startLiveClock();
}

// ==========================================
// 3. Navigation Dock
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
    }
  });
});

window.openStockFormWithAction = function(action) {
  document.querySelector('[data-target="tabForm"]').click();
  const radio = document.querySelector(`input[name="actionType"][value="${action}"]`);
  if (radio) radio.checked = true;
  document.getElementById('stockItemName').focus();
};

// ==========================================
// 4. Realtime Data Listeners
// ==========================================
function initDataListeners() {
  // Categories Listener
  db.ref('categories').on('value', (snap) => {
    categoriesData = [];
    stockCategorySelect.innerHTML = '<option value="">Select Category</option>';
    dbCategoryFilter.innerHTML = '<option value="">All Categories</option>';

    snap.forEach(child => {
      const catName = child.val();
      const catKey = child.key;
      categoriesData.push({ key: catKey, name: catName });

      // Populate form and filter selects
      stockCategorySelect.insertAdjacentHTML('beforeend', `<option value="${catName}">${catName}</option>`);
      dbCategoryFilter.insertAdjacentHTML('beforeend', `<option value="${catName}">${catName}</option>`);
    });

    renderCategoriesList();
    updateStats();
    renderInventory();
  });

  // Inventory Listener
  db.ref('inventory').on('value', (snap) => {
    inventoryData = snap.val() || {};
    renderInventory();
    renderCategoriesList();
    updateHistoryDatalist();
    updateStats();
    updateDashboard();
  });

  // Global Logs Listener
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
// 5. Category Management (Right-Click Rename / Delete & Count)
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
      <span class="category-chip-name"><strong>${cat.name}</strong></span>
      <span class="category-count-badge" title="${count} item(s) in this category">${count}</span>
      <i class="fa-solid fa-ellipsis-vertical chip-delete" title="More options"></i>
    `;

    // Right-click event for Desktop
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCategoryContextMenu(e.pageX, e.pageY, cat.key, cat.name);
    });

    // Click on options ellipsis icon
    chip.querySelector('.chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      openCategoryContextMenu(e.pageX, e.pageY, cat.key, cat.name);
    });

    // Mobile Long-Press (500ms)
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
  categoryContextMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  categoryContextMenu.style.top = `${y}px`;
  categoryContextMenu.classList.remove('hidden');
}

// Rename Category Action
document.getElementById('ctxRenameCategory').addEventListener('click', () => {
  if (!activeContextCategory) return;
  categoryContextMenu.classList.add('hidden');
  renameCategoryInput.value = activeContextCategory.name;
  renameCategoryModal.classList.remove('hidden');
  setTimeout(() => renameCategoryInput.focus(), 100);
});

// Submit Rename Form
renameCategoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!activeContextCategory) return;

  const newName = renameCategoryInput.value.trim();
  const oldName = activeContextCategory.name;
  const key = activeContextCategory.key;

  if (!newName || newName === oldName) {
    renameCategoryModal.classList.add('hidden');
    return;
  }

  // 1. Update Category in Firebase
  db.ref(`categories/${key}`).set(newName);

  // 2. Cascade rename to all inventory items with the old category name
  const updates = {};
  Object.entries(inventoryData).forEach(([itemKey, item]) => {
    if (item.category === oldName) {
      updates[`inventory/${itemKey}/category`] = newName;
    }
  });

  if (Object.keys(updates).length > 0) {
    db.ref().update(updates);
  }

  renameCategoryModal.classList.add('hidden');
});

// Close Rename Modal
closeRenameModalBtn.addEventListener('click', () => renameCategoryModal.classList.add('hidden'));
cancelRenameBtn.addEventListener('click', () => renameCategoryModal.classList.add('hidden'));

// Remove Category Action
document.getElementById('ctxRemoveCategory').addEventListener('click', () => {
  if (!activeContextCategory) return;
  categoryContextMenu.classList.add('hidden');

  const { key, name } = activeContextCategory;
  const count = getCategoryItemCount(name);

  let confirmMsg = `Are you sure you want to remove the category "${name}"?`;
  if (count > 0) {
    confirmMsg = `Warning: Category "${name}" currently has ${count} registered item(s).\nAre you sure you want to delete this category?`;
  }

  if (confirm(confirmMsg)) {
    db.ref(`categories/${key}`).remove();
  }
});

// Add Category Form
categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('newCategoryInput');
  const cat = input.value.trim();
  if (cat) {
    db.ref('categories').push(cat);
    input.value = '';
  }
});

// ==========================================
// 6. Homepage Dashboard & Live Animated Chart
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

// Chart Mode Switches
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
  gradient.addColorStop(0, 'rgba(0, 56, 101, 0.4)');
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
        duration: 900,
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
          backgroundColor: '#0f172a',
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
          grid: { color: '#f1f5f9' },
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
    // Movement History Mode: Use chronological activity logs
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
      liveStockChart.data.datasets[0].data = recentLogs.map(l => l.newQty);
      liveStockChart.data.datasets[0].label = 'Balance Level After Transaction';
    }
  } else {
    // Stock by Item Mode: Display current inventory items
    const items = Object.values(inventoryData).slice(0, 12);
    if (items.length === 0) {
      liveStockChart.data.labels = ['No Items'];
      liveStockChart.data.datasets[0].data = [0];
      liveStockChart.data.datasets[0].label = 'Empty Inventory';
    } else {
      liveStockChart.data.labels = items.map(i => i.name);
      liveStockChart.data.datasets[0].data = items.map(i => i.quantity);
      liveStockChart.data.datasets[0].label = 'Current Quantity in Stock';
    }
  }

  liveStockChart.update();
}

function updateDashboard() {
  renderStockChart();

  // 1. Attention List (Out of Stock or Low Stock)
  const items = Object.values(inventoryData);
  const outOfStock = items.filter(i => i.quantity === 0);
  const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= 5);
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
            <div class="item-name">${item.name}</div>
            <div class="item-meta">${item.category} • Balance: <strong>${item.quantity} ${item.unit}</strong></div>
          </div>
          <button type="button" class="btn-mini-restock" onclick="quickRestockItem('${item.name.replace(/'/g, "\\'")}', '${item.category.replace(/'/g, "\\'")}', '${(item.unit || 'pcs').replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-plus"></i> Restock
          </button>
        </div>
      `).join('');
    }
  }

  // 2. Recent Activity Feed
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
                <div class="feed-title"><strong>${l.itemName}</strong> (${l.remarks || (isIN ? 'Stock In' : 'Stock Out')})</div>
                <div class="feed-time">${new Date(l.date).toLocaleString()}</div>
              </div>
            </div>
            <div class="feed-qty ${isIN ? 'in' : 'out'}">
              ${isIN ? '+' : '-'}${l.qtyChanged} ${l.unit || ''}
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

window.quickRestockItem = function(name, category, unit) {
  document.querySelector('[data-target="tabForm"]').click();
  document.getElementById('stockItemName').value = name;
  stockCategorySelect.value = category;
  document.getElementById('stockUnit').value = unit || 'pcs';
  const radio = document.querySelector('input[name="actionType"][value="IN"]');
  if (radio) radio.checked = true;
  document.getElementById('stockQuantity').value = '';
  document.getElementById('stockQuantity').focus();
};

// ==========================================
// 7. Autocomplete Datalist Helper
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
// 8. Record Stock Transaction (IN / OUT)
// ==========================================
stockForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('stockItemName').value.trim();
  const category = stockCategorySelect.value;
  const unit = document.getElementById('stockUnit').value;
  const action = document.querySelector('input[name="actionType"]:checked').value;
  const qty = parseInt(document.getElementById('stockQuantity').value, 10);
  const remarks = document.getElementById('stockRemarks').value.trim();

  // Create clean key from item name
  const itemKey = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const existing = inventoryData[itemKey];

  let currentQty = existing ? existing.quantity : 0;
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

  // 1. Update/Set Item in inventory (Never delete even if 0)
  db.ref(`inventory/${itemKey}`).update({
    name: name,
    category: category,
    unit: unit,
    quantity: newQty,
    lastUpdated: timestamp
  });

  // 2. Append to Item-specific logs
  db.ref(`inventory/${itemKey}/logs`).push(logEntry);

  // 3. Append to Global Activity Logs
  db.ref('activity_logs').push(logEntry);

  stockForm.reset();
  alert(`Transaction recorded! Item balance: ${newQty} ${unit}`);
  document.querySelector('[data-target="tabDatabase"]').click();
});

// ==========================================
// 9. Render Inventory Grouped by Category & Filtered
// ==========================================
function renderInventory() {
  const searchTerm = dbSearchInput.value.toLowerCase();
  const catFilter = dbCategoryFilter.value;
  const statusFilter = dbStatusFilter.value;

  const items = Object.entries(inventoryData).map(([key, val]) => ({ key, ...val }));

  const filtered = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                          item.category.toLowerCase().includes(searchTerm);
    const matchesCat = !catFilter || item.category === catFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'in_stock' && item.quantity > 0) ||
      (statusFilter === 'out_of_stock' && item.quantity === 0);
    return matchesSearch && matchesCat && matchesStatus;
  });

  if (filtered.length === 0) {
    inventoryContainer.innerHTML = '<div style="padding:2rem; text-align:center; color:#94a3b8;">No inventory items found.</div>';
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
      <div class="category-group">
        <h3 class="category-group-header"><i class="fa-solid fa-folder"></i> ${catName} (${catItems.length})</h3>
        <div class="category-items-grid">
    `;
    catItems.forEach(item => {
      const isZero = item.quantity === 0;
      html += `
        <div class="stock-card ${isZero ? 'zero-stock' : ''}" data-key="${item.key}">
          <div class="card-title">${item.name}</div>
          <div class="card-category">${item.category}</div>
          <div class="card-details">
            <span class="card-qty">${item.quantity} <small style="font-size:0.8rem; font-weight:normal;">${item.unit}</small></span>
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
// 10. Stats Updates
// ==========================================
function updateStats() {
  const items = Object.values(inventoryData);
  const total = items.length;
  const inStock = items.filter(i => i.quantity > 0).length;
  const outOfStock = items.filter(i => i.quantity === 0).length;
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
// 11. Item Context Menu & Mobile Long-Press Logic
// ==========================================
function attachCardEvents() {
  document.querySelectorAll('.stock-card').forEach(card => {
    const key = card.dataset.key;

    // Desktop Right Click
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openItemContextMenu(e.pageX, e.pageY, key);
    });

    // Mobile Long Press Support (500ms)
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
  itemContextMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  itemContextMenu.style.top = `${y}px`;
  itemContextMenu.classList.remove('hidden');
}

// Close Context Menus on external click
window.addEventListener('click', () => {
  itemContextMenu.classList.add('hidden');
  categoryContextMenu.classList.add('hidden');
});

// Item Context Menu Action: View History
document.getElementById('ctxViewHistory').addEventListener('click', () => {
  if (!activeContextItem) return;
  const item = inventoryData[activeContextItem];
  document.getElementById('modalItemTitle').textContent = `${item.name} - Stock History`;
  const body = document.getElementById('modalTimelineBody');
  body.innerHTML = '<div class="loading-spinner">Fetching transaction history...</div>';
  historyModal.classList.remove('hidden');

  db.ref(`inventory/${activeContextItem}/logs`).once('value', (snap) => {
    const logs = [];
    snap.forEach(c => logs.unshift(c.val()));

    if (logs.length === 0) {
      body.innerHTML = '<p style="color:#64748b;">No log movements recorded yet.</p>';
      return;
    }

    body.innerHTML = logs.map(l => `
      <div class="timeline-item">
        <div class="timeline-date">${new Date(l.date).toLocaleString()}</div>
        <div class="timeline-desc">
          <span class="${l.action === 'IN' ? 'badge-in' : 'badge-out'}">${l.action === 'IN' ? 'Added +' : 'Reduced -'}${l.qtyChanged} ${l.unit || ''}</span>
          <span>(Balance: ${l.newQty})</span>
        </div>
        <div class="timeline-notes">${l.remarks || 'No remarks provided.'}</div>
      </div>
    `).join('');
  });
});

// Item Context Menu Action: Quick Stock In/Out Adjustment
document.getElementById('ctxQuickAction').addEventListener('click', () => {
  if (!activeContextItem) return;
  const item = inventoryData[activeContextItem];
  document.querySelector('[data-target="tabForm"]').click();
  document.getElementById('stockItemName').value = item.name;
  stockCategorySelect.value = item.category;
  document.getElementById('stockUnit').value = item.unit || 'pcs';
});

// Close History Modal
closeModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('#historyModal .modal-backdrop').addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('#renameCategoryModal .modal-backdrop').addEventListener('click', () => renameCategoryModal.classList.add('hidden'));

// ==========================================
// 12. Audit Logs Table Rendering
// ==========================================
function renderLogs(logs) {
  const filter = logSearchInput.value.toLowerCase();
  const filtered = logs.filter(l =>
    (l.itemName && l.itemName.toLowerCase().includes(filter)) ||
    (l.remarks && l.remarks.toLowerCase().includes(filter))
  );

  if (filtered.length === 0) {
    logsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">No logs found.</td></tr>';
    return;
  }

  logsTableBody.innerHTML = filtered.map(l => `
    <tr>
      <td>${new Date(l.date).toLocaleDateString()} ${new Date(l.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      <td><span class="${l.action === 'IN' ? 'badge-in' : 'badge-out'}">${l.action}</span></td>
      <td><strong>${l.itemName}</strong></td>
      <td>${l.action === 'IN' ? '+' : '-'}${l.qtyChanged} ${l.unit || ''}</td>
      <td>${l.newQty}</td>
      <td><small>${l.remarks || ''}</small></td>
    </tr>
  `).join('');
}

logSearchInput.addEventListener('input', () => renderLogs(logsData));
dbSearchInput.addEventListener('input', renderInventory);
dbCategoryFilter.addEventListener('change', renderInventory);
dbStatusFilter.addEventListener('change', renderInventory);

// ==========================================
// Initial Bootstrap
// ==========================================
ensureInitialSeed();
checkSession();
