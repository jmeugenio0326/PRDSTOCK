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

// DOM Elements
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const stockForm = document.getElementById('stockForm');
const categoryForm = document.getElementById('categoryForm');
const inventoryContainer = document.getElementById('inventoryContainer');
const itemHistoryList = document.getElementById('itemHistoryList');
const stockCategorySelect = document.getElementById('stockCategory');
const dbCategoryFilter = document.getElementById('dbCategoryFilter');
const dbSearchInput = document.getElementById('dbSearchInput');
const dbStatusFilter = document.getElementById('dbStatusFilter');
const itemContextMenu = document.getElementById('itemContextMenu');
const historyModal = document.getElementById('historyModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const logsTableBody = document.getElementById('logsTableBody');
const logSearchInput = document.getElementById('logSearchInput');

// 1. Pre-seed Default Admin and Categories
function ensureInitialSeed() {
  db.ref('users/property').once('value', (snap) => {
    if (!snap.exists()) {
      db.ref('users/property').set({
        username: 'property',
        password: 'propertyoffice',
        role: 'admin'
      });
    }
  });

  db.ref('categories').once('value', (snap) => {
    if (!snap.exists()) {
      const initialCats = ["Office Supplies", "IT Equipment", "Hardware & Tools", "Janitorial Supplies"];
      initialCats.forEach(cat => db.ref('categories').push(cat));
    }
  });
}

// 2. Auth Flow
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  loginError.classList.add('hidden');
  db.ref(`users/${u}`).once('value', (snap) => {
    const user = snap.val();
    if (user && user.password === p) {
      localStorage.setItem('nia_session', JSON.stringify({ username: user.username, role: user.role }));
      showApp();
    } else {
      loginError.textContent = 'Invalid username or password.';
      loginError.classList.remove('hidden');
    }
  });
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
  }
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  initDataListeners();
}

// 3. Bottom Dock Navigation
document.querySelectorAll('.dock-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
});

// 4. Realtime Listeners
function initDataListeners() {
  // Categories Listener
  db.ref('categories').on('value', (snap) => {
    categoriesData = [];
    stockCategorySelect.innerHTML = '<option value="">Select Category</option>';
    dbCategoryFilter.innerHTML = '<option value="">All Categories</option>';
    const listEl = document.getElementById('categoriesList');
    listEl.innerHTML = '';

    snap.forEach(child => {
      const catName = child.val();
      const catKey = child.key;
      categoriesData.push({ key: catKey, name: catName });

      // Populate selects
      stockCategorySelect.insertAdjacentHTML('beforeend', `<option value="${catName}">${catName}</option>`);
      dbCategoryFilter.insertAdjacentHTML('beforeend', `<option value="${catName}">${catName}</option>`);

      // Populate list chips
      listEl.insertAdjacentHTML('beforeend', `
        <div class="category-chip">
          <span>${catName}</span>
          <i class="fa-solid fa-xmark chip-delete" onclick="deleteCategory('${catKey}')"></i>
        </div>
      `);
    });
    document.getElementById('statCategories').textContent = categoriesData.length;
    renderInventory();
  });

  // Inventory Listener
  db.ref('inventory').on('value', (snap) => {
    inventoryData = snap.val() || {};
    renderInventory();
    updateHistoryDatalist();
    updateStats();
  });

  // Global Logs Listener
  db.ref('activity_logs').limitToLast(100).on('value', (snap) => {
    logsData = [];
    snap.forEach(child => {
      logsData.unshift(child.val());
    });
    renderLogs(logsData);
  });
}

// 5. Autocomplete Datalist Helper
function updateHistoryDatalist() {
  itemHistoryList.innerHTML = '';
  Object.values(inventoryData).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.name;
    itemHistoryList.appendChild(opt);
  });
}

// 6. Record Stock Transaction (IN / OUT)
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
  alert(`Transaction saved! Item balance: ${newQty} ${unit}`);
  document.querySelector('[data-target="tabDatabase"]').click();
});

// 7. Render Inventory Grouped by Category & Filtered
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

// 8. Stats Updates
function updateStats() {
  const items = Object.values(inventoryData);
  const total = items.length;
  const inStock = items.filter(i => i.quantity > 0).length;
  const outOfStock = items.filter(i => i.quantity === 0).length;

  document.getElementById('statTotalItems').textContent = total;
  document.getElementById('statInStock').textContent = inStock;
  document.getElementById('statOutOfStock').textContent = outOfStock;
}

// 9. Context Menu & Mobile Long-Press Logic
function attachCardEvents() {
  document.querySelectorAll('.stock-card').forEach(card => {
    const key = card.dataset.key;

    // Desktop Right Click
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.pageX, e.pageY, key);
    });

    // Mobile Long Press Support (500ms)
    let touchTimer;
    card.addEventListener('touchstart', (e) => {
      touchTimer = setTimeout(() => {
        const touch = e.touches[0];
        openContextMenu(touch.pageX, touch.pageY, key);
      }, 500);
    });
    card.addEventListener('touchend', () => clearTimeout(touchTimer));
    card.addEventListener('touchmove', () => clearTimeout(touchTimer));
  });
}

function openContextMenu(x, y, itemKey) {
  activeContextItem = itemKey;
  itemContextMenu.style.left = `${x}px`;
  itemContextMenu.style.top = `${y}px`;
  itemContextMenu.classList.remove('hidden');
}

// Close Context Menu on external click
window.addEventListener('click', () => itemContextMenu.classList.add('hidden'));

// Context Menu Action: View History
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

// Context Menu Action: Quick Stock In/Out Adjustment
document.getElementById('ctxQuickAction').addEventListener('click', () => {
  if (!activeContextItem) return;
  const item = inventoryData[activeContextItem];
  document.querySelector('[data-target="tabForm"]').click();
  document.getElementById('stockItemName').value = item.name;
  stockCategorySelect.value = item.category;
  document.getElementById('stockUnit').value = item.unit || 'pcs';
});

// Close Modal
closeModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
document.querySelector('.modal-backdrop').addEventListener('click', () => historyModal.classList.add('hidden'));

// 10. Audit Logs Table Rendering
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

// 11. Category Management (Add/Delete)
categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('newCategoryInput');
  const cat = input.value.trim();
  if (cat) {
    db.ref('categories').push(cat);
    input.value = '';
  }
});

window.deleteCategory = function(key) {
  if (confirm('Are you sure you want to remove this category?')) {
    db.ref(`categories/${key}`).remove();
  }
};

// Initial Bootstrap
ensureInitialSeed();
checkSession();
