// Global State Management
let currentRole = 'Admin';
let activeFranchiseId = null;
let currentProfileTab = 'overview';
let activePage = 'dashboard';
let activeExpenseSubTab = 'entries';
let dashboardData = { franchise_cards: [] };
let expenseCategoriesList = [];
let allFranchisesList = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
});

function initEventListeners() {
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(loadDashboard, 300));
  }

  ['filter-person', 'filter-date-preset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadDashboard);
  });

  const datePreset = document.getElementById('filter-date-preset');
  if (datePreset) {
    datePreset.addEventListener('change', (e) => {
      const customPicker = document.getElementById('custom-date-container');
      if (customPicker) {
        customPicker.style.display = e.target.value === 'Custom Date' ? 'inline-flex' : 'none';
      }
    });
  }

  const roleSelect = document.getElementById('user-role-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      currentRole = e.target.value;
      document.getElementById('current-role-badge').innerText = currentRole;
    });
  }
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

async function loadExpenseCategories() {
  try {
    const res = await fetch('/api/expense_categories');
    expenseCategoriesList = await res.json();
  } catch (err) {
    console.error('Error loading expense categories:', err);
  }
}

async function loadFranchisesList() {
  try {
    const res = await fetch('/api/franchises');
    allFranchisesList = await res.json();
  } catch (err) {
    console.error('Error loading franchises list:', err);
  }
}

// --- DASHBOARD LOADER ---

async function loadDashboard() {
  const search = document.getElementById('global-search')?.value || '';
  const person = document.getElementById('filter-person')?.value || '';
  const datePreset = document.getElementById('filter-date-preset')?.value || 'Till Now';

  const queryParams = new URLSearchParams({ search, person, date_preset: datePreset });
  
  try {
    const response = await fetch(`/api/dashboard/stats?${queryParams.toString()}`);
    const data = await response.json();
    dashboardData = data;

    document.getElementById('kpi-total-franchises').innerText = data.total_franchises || 0;
    document.getElementById('kpi-active-franchises').innerText = data.active_franchises || 0;
    document.getElementById('kpi-net-purchase').innerText = `Rs. ${(data.net_purchase || 0).toLocaleString('en-IN')}`;
    document.getElementById('kpi-gr-percent').innerText = `${data.gr_percent || 0}%`;
    document.getElementById('kpi-outstanding').innerText = `Rs. ${(data.outstanding || 0).toLocaleString('en-IN')}`;
    document.getElementById('kpi-company-support').innerText = `Rs. ${(data.total_company_support || 0).toLocaleString('en-IN')}`;

    renderFranchiseCards(data.franchise_cards);
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderFranchiseCards(cards) {
  const grid = document.getElementById('franchise-cards-grid');
  if (!grid) return;

  if (!cards || cards.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #FFFFFF; border-radius: 16px; border: 1px dashed #CBD5E1; margin-top: 10px;">
        <i class="fa-solid fa-store" style="font-size: 3rem; color: #94A3B8; margin-bottom: 15px;"></i>
        <h3 style="color: #0F172A; margin: 0 0 8px; font-weight: 700;">No Franchises Found</h3>
        <p style="color: #64748B; margin: 0 0 20px;">Click below to load sample temporary data or create a new franchise.</p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button class="btn-add-franchise" onclick="loadSampleTemporaryData()" style="background: #2563EB;">
            <i class="fa-solid fa-database"></i> Add Temporary Data
          </button>
          <button class="btn-add-franchise" onclick="openNewFranchiseModal()">
            <i class="fa-solid fa-plus"></i> Add Franchise Lead
          </button>
        </div>
      </div>
    `;
    return;
  }

  const defaultStoreImg = "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=300&q=80";

  grid.innerHTML = cards.map((c) => {
    const f = c.franchise;
    const recordsCount = c.records_count || 12;
    const statusLower = (f.status || 'active').toLowerCase();
    const statusClass = statusLower.includes('active') ? 'active' : (statusLower.includes('pending') ? 'pending' : 'inactive');

    return `
      <div class="ref-franchise-card" style="position: relative;">
        <button onclick="deleteFranchiseCard(${f.id}, event)" title="Delete this temporary franchise" style="position: absolute; right: 12px; top: 12px; background: rgba(254, 242, 242, 0.9); border: 1px solid #FCA5A5; color: #DC2626; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.75rem; z-index: 10;">
          <i class="fa-solid fa-trash-can"></i>
        </button>

        <div class="card-top-body">
          <div class="store-thumb-container">
            <img src="${defaultStoreImg}" class="store-thumb-img" alt="${f.name}">
          </div>
          <div class="card-info-side">
            <div class="info-head-row" style="padding-right: 24px;">
              <h3 class="ref-franchise-title" title="${f.name}">${f.name}</h3>
              <span class="records-badge">${recordsCount} Records</span>
            </div>
            <div class="ref-location-row">
              <i class="fa-solid fa-location-dot"></i> ${f.city}, ${f.state || 'India'}
            </div>
            <div class="ref-tags-row">
              <span class="tag-status-pill tag-status-${statusClass}">
                <span class="dot-indicator dot-${statusClass}"></span> ${f.status || 'Active'}
              </span>
              <span class="tag-plain-pill">${f.plan_name || 'Plan A'}</span>
              <span class="tag-plain-pill">Retail</span>
            </div>
          </div>
        </div>
        <button class="btn-ref-explore" onclick="openExploreFranchise(${f.id})">
          Explore Franchise &rarr;
        </button>
      </div>
    `;
  }).join('');
}

async function loadSampleTemporaryData() {
  try {
    const res = await fetch('/api/seed_demo_data', { method: 'POST' });
    const data = await res.json();
    alert(data.message);
    loadDashboard();
    loadExpenseCategories();
    loadFranchisesList();
  } catch (err) {
    alert("Failed to load temporary data.");
  }
}

async function deleteFranchiseCard(fId, evt) {
  if (evt) evt.stopPropagation();
  if (!confirm("Are you sure you want to delete this franchise? All associated data will be deleted.")) return;
  try {
    const res = await fetch(`/api/franchise/${fId}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    if (activeFranchiseId === fId) {
      switchPage('dashboard');
    } else {
      loadDashboard();
    }
  } catch (err) {
    alert("Failed to delete franchise.");
  }
}

// --- SIDEBAR TOGGLE & ACCORDION FUNCTIONS ---

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const toggleIcon = document.getElementById('toggle-icon');
  
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  
  if (toggleIcon) {
    toggleIcon.className = isCollapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
  }
  if (toggleBtn) {
    toggleBtn.title = isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
  }
  
  localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
}

function toggleCategory(catId) {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('collapsed')) {
    toggleSidebar();
  }
  
  const catEl = document.getElementById(catId);
  if (!catEl) return;
  
  catEl.classList.toggle('open');
  saveOpenCategories();
}

function saveOpenCategories() {
  const openCats = Array.from(document.querySelectorAll('.nav-category.open')).map(el => el.id);
  localStorage.setItem('sidebar_open_categories', JSON.stringify(openCats));
}

function restoreSidebarState() {
  // 1. Restore Collapsed State
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const toggleIcon = document.getElementById('toggle-icon');
  
  if (isCollapsed && sidebar) {
    sidebar.classList.add('collapsed');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-right';
    if (toggleBtn) toggleBtn.title = 'Expand Sidebar';
  }
  
  // 2. Restore Open Categories
  const savedCats = localStorage.getItem('sidebar_open_categories');
  if (savedCats) {
    try {
      const openCats = JSON.parse(savedCats);
      openCats.forEach(id => {
        const cat = document.getElementById(id);
        if (cat) cat.classList.add('open');
      });
    } catch (e) {}
  } else {
    const defaultLead = document.getElementById('cat-lead');
    if (defaultLead) defaultLead.classList.add('open');
  }
}

// --- PAGE NAVIGATION & WORKSPACES ---

function switchPage(pageId) {
  activePage = pageId;
  
  document.querySelectorAll('#sidebar .active').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#sidebar li').forEach(el => el.classList.remove('active'));
  
  const activeNavItem = document.getElementById(`nav-${pageId}`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
    
    const parentCategory = activeNavItem.closest('.nav-category');
    if (parentCategory && !parentCategory.classList.contains('open')) {
      parentCategory.classList.add('open');
      saveOpenCategories();
    }
  }

  if (pageId === 'dashboard') {
    document.getElementById('dashboard-overview').style.display = 'block';
    document.getElementById('explore-franchise-view').style.display = 'none';
    document.getElementById('module-page-view').style.display = 'none';
    loadDashboard();
  } else {
    document.getElementById('dashboard-overview').style.display = 'none';
    document.getElementById('explore-franchise-view').style.display = 'none';
    document.getElementById('module-page-view').style.display = 'block';
    renderModulePage(pageId);
  }
}

function renderModulePage(pageId) {
  const titleEl = document.getElementById('module-page-title');
  const descEl = document.getElementById('module-page-desc');
  const contentEl = document.getElementById('module-page-content');

  const titles = {
    'leads': 'Leads & Assignments Workspace',
    'calling': 'Calling History Master Log',
    'followup': 'Follow-up Scheduler & Records',
    'plans': 'Franchise Plan Selection',
    'token': 'Token Advance Receipts',
    'survey': 'Survey Reports & Site Visits',
    'agreement': 'Approval & Commercial Agreements',
    'payments': 'Franchise Fee Payments & Outstanding Balance',
    'interior': 'Interior & Store Construction',
    'branding': 'Branding Setup',
    'marketing': 'Marketing Campaigns',
    'training': 'Staff Training & Certification',
    'operations': 'Store Operations & SOP Compliance',
    'influencer': 'Influencer Campaigns',
    'opening': 'Franchise Opening Launch',
    'active': 'Active Franchises Directory',
    'materials': 'Material & Asset Tracking (Given → Returned → Balance)',
    'purchases': 'Purchases Log (Stock Inventory Invoices)',
    'gr': 'Goods Return (GR/Return) Management',
    'expenses': 'Expenses Tracker & Management',
    'visit_expenses': 'Dedicated Visit Expenses Tracker',
    'support': 'What We Provided / Company Support Summary',
    'performance': 'Performance Analytics',
    'reports': 'Reports & Exports Generator (PDF, Excel, Word)',
    'audit': 'System Audit History Log',
    'users': 'User Management & Access Control',
    'permissions': 'User Roles & Access Control'
  };

  titleEl.innerText = titles[pageId] || 'Module Workspace';
  descEl.innerText = `Dedicated separate working page for managing ${titles[pageId] || pageId}.`;

  if (pageId === 'expenses') {
    renderExpensesWorkspace(contentEl);
  } else if (pageId === 'visit_expenses') {
    renderVisitExpensesWorkspace(contentEl);
  } else if (pageId === 'users' || pageId === 'permissions') {
    renderUsersWorkspace(contentEl);
  } else if (pageId === 'reports') {
    contentEl.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 15px;">
        <div class="kpi-card" style="flex-direction: column; align-items: flex-start;">
          <h4><i class="fa-solid fa-file-pdf" style="color:#DC2626;"></i> PDF Profile Report</h4>
          <p style="font-size: 0.9rem; font-weight: normal; margin-top: 8px; color: #64748B;">Generates formatted PDF report for Franchise Profile, financial summary, and activity timeline.</p>
          <button class="btn-ref-explore" onclick="triggerReportExport('pdf')" style="margin-top: 15px; background: #DC2626;"><i class="fa-solid fa-download"></i> Download PDF</button>
        </div>
        <div class="kpi-card" style="flex-direction: column; align-items: flex-start;">
          <h4><i class="fa-solid fa-file-excel" style="color:#059669;"></i> Excel (.xlsx) Report</h4>
          <p style="font-size: 0.9rem; font-weight: normal; margin-top: 8px; color: #64748B;">Multi-sheet Excel download containing Franchises master list, purchases, GR returns, and audit trail.</p>
          <button class="btn-ref-explore" onclick="triggerReportExport('excel')" style="margin-top: 15px; background: #059669;"><i class="fa-solid fa-download"></i> Download Excel</button>
        </div>
        <div class="kpi-card" style="flex-direction: column; align-items: flex-start;">
          <h4><i class="fa-solid fa-file-word" style="color:#DB2777;"></i> Word (.doc) Report</h4>
          <p style="font-size: 0.9rem; font-weight: normal; margin-top: 8px; color: #64748B;">Word executive summary report with table structures and company investment details.</p>
          <button class="btn-ref-explore" onclick="triggerReportExport('word')" style="margin-top: 15px; background: #DB2777;"><i class="fa-solid fa-download"></i> Download Word</button>
        </div>
      </div>
    `;
  } else {
    renderGenericModuleTable(pageId, contentEl);
  }
}

// --- DYNAMIC EXPENSES MODULE WORKSPACE ---

function renderExpensesWorkspace(container) {
  container.innerHTML = `
    <div style="display: flex; gap: 10px; border-bottom: 2px solid #E2E8F0; margin-bottom: 20px;">
      <button id="exp-tab-entries" onclick="switchExpenseSubTab('entries')" style="padding: 10px 20px; border: none; background: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; color: #2563EB; border-bottom: 3px solid #2563EB;">
        <i class="fa-solid fa-receipt"></i> All Expense Entries
      </button>
      <button id="exp-tab-master" onclick="switchExpenseSubTab('master')" style="padding: 10px 20px; border: none; background: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; color: #64748B;">
        <i class="fa-solid fa-tags"></i> Expense Category Master
      </button>
    </div>

    <div id="expense-subtab-content">
      <!-- Loaded dynamically -->
    </div>
  `;
  switchExpenseSubTab(activeExpenseSubTab);
}

function switchExpenseSubTab(subTab) {
  activeExpenseSubTab = subTab;
  const entriesBtn = document.getElementById('exp-tab-entries');
  const masterBtn = document.getElementById('exp-tab-master');
  
  if (entriesBtn && masterBtn) {
    if (subTab === 'entries') {
      entriesBtn.style.color = '#2563EB';
      entriesBtn.style.borderBottom = '3px solid #2563EB';
      masterBtn.style.color = '#64748B';
      masterBtn.style.borderBottom = 'none';
      loadExpenseEntriesTab();
    } else {
      masterBtn.style.color = '#2563EB';
      masterBtn.style.borderBottom = '3px solid #2563EB';
      entriesBtn.style.color = '#64748B';
      entriesBtn.style.borderBottom = 'none';
      loadExpenseCategoryMasterTab();
    }
  }
}

async function loadExpenseEntriesTab() {
  const container = document.getElementById('expense-subtab-content');
  if (!container) return;

  container.innerHTML = `
    <!-- Expense Filters -->
    <div style="background: #F8FAFC; padding: 15px; border-radius: 10px; border: 1px solid #E2E8F0; margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
      <select id="exp-filter-franchise" onchange="fetchFilteredExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Franchises</option>
        ${allFranchisesList.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
      </select>

      <select id="exp-filter-category" onchange="fetchFilteredExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Expense Categories</option>
        ${expenseCategoriesList.filter(c => c.is_active).map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
      </select>

      <select id="exp-filter-person" onchange="fetchFilteredExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Responsible Persons</option>
        <option value="Store Manager">Store Manager</option>
        <option value="Rajesh Kumar">Rajesh Kumar</option>
        <option value="Vikram Singh">Vikram Singh</option>
        <option value="Ananya Sharma">Ananya Sharma</option>
      </select>

      <select id="exp-filter-date" onchange="fetchFilteredExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="Till Now" selected>Date: Till Now (All Time)</option>
        <option value="Today">Today</option>
        <option value="7 Days">Last 7 Days</option>
        <option value="30 Days">Last 30 Days</option>
        <option value="This Month">This Month</option>
        <option value="Quarterly">Quarterly</option>
        <option value="Half Yearly">Half Yearly</option>
        <option value="Yearly">Yearly</option>
      </select>

      <input type="text" id="exp-search" oninput="debounce(fetchFilteredExpenses, 300)()" placeholder="Search description, vendor, invoice..." style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem; width: 220px;">

      <button class="btn-ref-explore" onclick="openAddExpenseEntryModal()" style="width: auto; padding: 6px 16px; margin-left: auto;">
        <i class="fa-solid fa-plus"></i> Add Expense Entry
      </button>
    </div>

    <!-- Automatic Summary Calculations Banner -->
    <div id="expense-totals-banner" style="margin-bottom: 20px;"></div>

    <!-- Expense Entries Table -->
    <div id="expense-table-container">
      <p style="text-align: center; color: #64748B;">Loading expenses...</p>
    </div>
  `;

  await fetchFilteredExpenses();
}

async function fetchFilteredExpenses() {
  const franchise_id = document.getElementById('exp-filter-franchise')?.value || '';
  const category = document.getElementById('exp-filter-category')?.value || '';
  const person = document.getElementById('exp-filter-person')?.value || '';
  const date_preset = document.getElementById('exp-filter-date')?.value || 'Till Now';
  const search = document.getElementById('exp-search')?.value || '';

  const params = new URLSearchParams({ franchise_id, category, person, date_preset, search });

  try {
    const res = await fetch(`/api/expenses?${params.toString()}`);
    const data = await res.json();

    // Render Totals Banner (Category-wise, Franchise-wise, Person-wise, Grand Total)
    const bannerEl = document.getElementById('expense-totals-banner');
    if (bannerEl) {
      const catPills = Object.entries(data.category_totals || {}).map(([c, total]) => `
        <span style="background: #EFF6FF; color: #1D4ED8; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
          ${c}: Rs. ${total.toLocaleString('en-IN')}
        </span>
      `).join(' ');

      const franPills = Object.entries(data.franchise_totals || {}).map(([f, total]) => `
        <span style="background: #F0FDF4; color: #15803D; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
          ${f}: Rs. ${total.toLocaleString('en-IN')}
        </span>
      `).join(' ');

      const personPills = Object.entries(data.person_totals || {}).map(([p, total]) => `
        <span style="background: #FEF3C7; color: #B45309; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
          ${p}: Rs. ${total.toLocaleString('en-IN')}
        </span>
      `).join(' ');

      bannerEl.innerHTML = `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F1F5F9; padding-bottom: 10px;">
            <h4 style="margin: 0; color: #0F172A; font-size: 1rem;"><i class="fa-solid fa-calculator" style="color: var(--accent-blue);"></i> Dynamic Expenses Totals Summary</h4>
            <span style="font-size: 1.25rem; font-weight: 700; color: #DC2626;">Grand Total: Rs. ${(data.grand_total || 0).toLocaleString('en-IN')}</span>
          </div>

          <div>
            <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">Category-wise Totals:</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">${catPills || '<span style="font-size:0.8rem; color:#94A3B8;">No categories recorded</span>'}</div>
          </div>

          <div>
            <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">Franchise-wise Totals:</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">${franPills || '<span style="font-size:0.8rem; color:#94A3B8;">No franchises recorded</span>'}</div>
          </div>

          <div>
            <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">Person-wise Totals:</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">${personPills || '<span style="font-size:0.8rem; color:#94A3B8;">No staff recorded</span>'}</div>
          </div>
        </div>
      `;
    }

    // Render Table
    const tableEl = document.getElementById('expense-table-container');
    if (tableEl) {
      if (!data.expenses || data.expenses.length === 0) {
        tableEl.innerHTML = `
          <div style="padding: 40px; text-align: center; background: #FFFFFF; border-radius: 12px; border: 1px dashed #CBD5E1;">
            <p style="color: #64748B; margin: 0 0 15px;">No expense entries found matching filters.</p>
            <button class="btn-ref-explore" onclick="openAddExpenseEntryModal()" style="width: auto; margin: 0 auto; padding: 8px 16px;">
              <i class="fa-solid fa-plus"></i> Add Expense Entry
            </button>
          </div>
        `;
        return;
      }

      tableEl.innerHTML = `
        <table class="custom-table">
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Franchise</th>
              <th>Category</th>
              <th>Sub-Category</th>
              <th>Description</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Mode / Paid By</th>
              <th>Person</th>
              <th>Receipt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.expenses.map(e => `
              <tr>
                <td>${e.expense_date} ${e.expense_time || ''}</td>
                <td><b>${e.franchise_name}</b></td>
                <td><span class="records-badge">${e.category_name}</span></td>
                <td>${e.sub_category || '-'}</td>
                <td>${e.description}</td>
                <td>${e.vendor_party || '-'}</td>
                <td><b style="color: #DC2626;">Rs. ${e.amount.toLocaleString('en-IN')}</b></td>
                <td>${e.payment_mode} (${e.paid_by})</td>
                <td>${e.person}</td>
                <td>
                  ${e.document_path ? `
                    <button onclick="previewPDF('/uploads/${e.document_path}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;">
                      <i class="fa-solid fa-paperclip"></i> View Receipt
                    </button>
                  ` : '-'}
                </td>
                <td style="white-space: nowrap;">
                  <button onclick='openUniversalEntryModal("expenses", ${JSON.stringify(e).replace(/'/g, "&apos;")})' style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; margin-right:4px;" title="Edit Expense">
                    <i class="fa-solid fa-pen"></i> Edit
                  </button>
                  <button onclick="deleteExpenseEntry(${e.id})" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; padding:4px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;" title="Delete Expense">
                    <i class="fa-solid fa-trash-can"></i> Delete
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    console.error('Error fetching expenses:', err);
  }
}

// --- EXPENSE CATEGORY MASTER TAB ---

async function loadExpenseCategoryMasterTab() {
  const container = document.getElementById('expense-subtab-content');
  if (!container) return;

  await loadExpenseCategories();

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h3 style="margin: 0; color: #0F172A;">Expense Category Master</h3>
        <p style="margin: 4px 0 0; font-size: 0.85rem; color: #64748B;">Admin can create, edit, and deactivate custom categories. New categories automatically appear in Expense Entry forms.</p>
      </div>
      <button class="btn-ref-explore" onclick="openAddCategoryModal()" style="width: auto; padding: 8px 16px;">
        <i class="fa-solid fa-plus"></i> Add New Custom Category
      </button>
    </div>

    <table class="custom-table">
      <thead>
        <tr>
          <th>Category ID</th>
          <th>Category Name</th>
          <th>Description</th>
          <th>Status</th>
          <th>Created Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${expenseCategoriesList.map(c => `
          <tr>
            <td>#${c.id}</td>
            <td><b>${c.name}</b></td>
            <td>${c.description || '-'}</td>
            <td>
              <span class="tag-status-pill tag-status-${c.is_active ? 'active' : 'inactive'}">
                <span class="dot-indicator dot-${c.is_active ? 'active' : 'inactive'}"></span> ${c.is_active ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td>${c.created_at}</td>
            <td>
              <button onclick="openEditCategoryModal(${c.id}, '${c.name}', '${c.description}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button onclick="toggleCategoryStatus(${c.id}, ${c.is_active})" style="background:${c.is_active ? '#FEF2F2' : '#ECFDF5'}; color:${c.is_active ? '#DC2626' : '#059669'}; border:1px solid ${c.is_active ? '#FCA5A5' : '#A7F3D0'}; padding:3px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer; margin-left:4px;">
                ${c.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- EXPENSE MODAL HANDLERS ---

function openAddExpenseEntryModal() {
  document.getElementById('modal-title').innerText = 'Add Dynamic Expense Entry';
  document.getElementById('modal-body').innerHTML = `
    <form id="form-add-expense" onsubmit="submitExpenseEntry(event)" enctype="multipart/form-data">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Franchise *</label>
          <select id="exp-f-id" required style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px;">
            ${allFranchisesList.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Expense Category *</label>
          <select id="exp-cat-name" required style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px;">
            ${expenseCategoriesList.filter(c => c.is_active).map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Sub-Category / Expense Type</label>
          <input type="text" id="exp-sub-cat" placeholder="e.g. Monthly Rent" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Amount (Rs.) *</label>
          <input type="number" id="exp-amt" required placeholder="0.00" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px;">
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:0.8rem; font-weight:600;">Description / Purpose *</label>
        <textarea id="exp-desc" required rows="2" placeholder="Detail reason for this expense..." style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px;"></textarea>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Payment Mode</label>
          <select id="exp-mode" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px;">
            <option>Cash</option>
            <option>Bank Transfer</option>
            <option>UPI</option>
            <option>Corporate Card</option>
            <option>Cheque</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Paid By</label>
          <select id="exp-paid-by" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px;">
            <option>Store</option>
            <option>Franchisee</option>
            <option>Company</option>
            <option>Field Executive</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Responsible Person *</label>
          <input type="text" id="exp-person" required value="Store Manager" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px;">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Vendor / Party Name</label>
          <input type="text" id="exp-vendor" placeholder="e.g. Property Landlord / Vendor" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Bill / Invoice Number</label>
          <input type="text" id="exp-bill-no" placeholder="INV-001" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px;">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Date & Time</label>
          <input type="date" id="exp-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Bill / Receipt Upload</label>
          <input type="file" id="exp-file" accept="image/*,application/pdf" style="width:100%; padding:4px; font-size:0.8rem;">
        </div>
      </div>

      <button type="submit" class="btn-ref-explore" style="width:100%;">Save Expense Entry</button>
    </form>
  `;
  document.getElementById('custom-modal').style.display = 'flex';
}

async function submitExpenseEntry(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('franchise_id', document.getElementById('exp-f-id').value);
  formData.append('category_name', document.getElementById('exp-cat-name').value);
  formData.append('sub_category', document.getElementById('exp-sub-cat').value);
  formData.append('amount', document.getElementById('exp-amt').value);
  formData.append('description', document.getElementById('exp-desc').value);
  formData.append('payment_mode', document.getElementById('exp-mode').value);
  formData.append('paid_by', document.getElementById('exp-paid-by').value);
  formData.append('person', document.getElementById('exp-person').value);
  formData.append('vendor_party', document.getElementById('exp-vendor').value);
  formData.append('bill_invoice_no', document.getElementById('exp-bill-no').value);
  formData.append('expense_date', document.getElementById('exp-date').value);

  const fileInput = document.getElementById('exp-file');
  if (fileInput && fileInput.files.length > 0) {
    formData.append('receipt_file', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    closeModal();
    if (activePage === 'expenses') {
      fetchFilteredExpenses();
    } else if (activeFranchiseId) {
      loadFranchiseProfileData(activeFranchiseId);
    }
  } catch (err) {
    alert("Failed to save expense entry.");
  }
}

async function deleteExpenseEntry(expId) {
  if (!confirm("Are you sure you want to delete this expense entry?")) return;
  try {
    const res = await fetch(`/api/expenses/${expId}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    fetchFilteredExpenses();
  } catch (err) {
    alert("Failed to delete expense entry.");
  }
}

function openAddCategoryModal() {
  document.getElementById('modal-title').innerText = 'Add Custom Expense Category';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitCategoryForm(event)">
      <div style="margin-bottom: 12px;">
        <label style="font-size:0.85rem; font-weight:600;">Category Name *</label>
        <input type="text" id="cat-name" required placeholder="e.g. Local Staff Salary" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; margin-top:4px;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="font-size:0.85rem; font-weight:600;">Description</label>
        <textarea id="cat-desc" rows="2" placeholder="Category description..." style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; margin-top:4px;"></textarea>
      </div>
      <button type="submit" class="btn-ref-explore" style="width:100%;">Create Category</button>
    </form>
  `;
  document.getElementById('custom-modal').style.display = 'flex';
}

async function submitCategoryForm(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('cat-name').value,
    description: document.getElementById('cat-desc').value,
    is_active: true
  };
  try {
    const res = await fetch('/api/expense_categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    closeModal();
    loadExpenseCategoryMasterTab();
  } catch (err) {
    alert("Failed to save category.");
  }
}

async function toggleCategoryStatus(catId, currentStatus) {
  try {
    await fetch(`/api/expense_categories/${catId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentStatus })
    });
    loadExpenseCategoryMasterTab();
  } catch (err) {
    alert("Failed to update status.");
  }
}

// --- EXPLORE FRANCHISE PROFILE VIEW ---

async function openExploreFranchise(fId) {
  activeFranchiseId = fId;
  document.getElementById('dashboard-overview').style.display = 'none';
  document.getElementById('module-page-view').style.display = 'none';
  document.getElementById('explore-franchise-view').style.display = 'block';

  await loadFranchiseProfileData(fId);
}

async function loadFranchiseProfileData(fId) {
  const personFilter = document.getElementById('profile-person-filter')?.value || '';
  const queryParams = new URLSearchParams({ person: personFilter });

  try {
    const response = await fetch(`/api/franchise/${fId}/profile?${queryParams.toString()}`);
    const data = await response.json();

    const f = data.franchise;
    const fin = data.financials;

    document.getElementById('prof-franchise-name').innerText = f.name;
    document.getElementById('prof-franchise-code').innerText = `${f.code} • ${f.city}, ${f.state}`;
    document.getElementById('prof-owner-info').innerText = `Owner: ${f.owner_name} | Mobile: ${f.owner_mobile}`;
    document.getElementById('prof-executive-info').innerText = `Executive: ${f.assigned_person}`;

    document.getElementById('prof-net-purchase').innerText = `Rs. ${fin.net_purchase.toLocaleString('en-IN')}`;
    document.getElementById('prof-gr-percent').innerText = `${fin.gr_percent}%`;
    document.getElementById('prof-outstanding').innerText = `Rs. ${fin.outstanding.toLocaleString('en-IN')}`;
    document.getElementById('prof-company-support').innerText = `Rs. ${fin.total_support.toLocaleString('en-IN')}`;

    renderProfileTabContent(currentProfileTab, data);
  } catch (err) {
    console.error('Error loading franchise profile:', err);
  }
}

function switchProfileTab(tabName, evt) {
  currentProfileTab = tabName;
  document.querySelectorAll('.profile-nav-tabs button').forEach(b => b.classList.remove('active'));
  if (evt) evt.target.classList.add('active');

  if (activeFranchiseId) {
    loadFranchiseProfileData(activeFranchiseId);
  }
}

function renderProfileTabContent(tab, data) {
  const container = document.getElementById('profile-tab-body');
  if (!container) return;

  const f = data.franchise;
  const fin = data.financials;

  if (tab === 'overview' || tab === 'lead') {
    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="kpi-card" style="flex-direction: column; align-items: flex-start;">
          <h4>Lead & Customer Details</h4>
          <p style="font-size: 1.1rem; margin-top: 10px;">${f.owner_name}</p>
          <div style="font-size: 0.9rem; color: #64748B; margin-top: 8px;">
            <div><b>Phone:</b> ${f.owner_mobile}</div>
            <div><b>Email:</b> ${f.owner_email || 'N/A'}</div>
            <div><b>City:</b> ${f.city}</div>
            <div><b>Assigned Staff:</b> ${f.assigned_person}</div>
            <div><b>Created Date:</b> ${f.created_at}</div>
          </div>
        </div>
        <div class="kpi-card" style="flex-direction: column; align-items: flex-start;">
          <h4>Plan & Commercial Agreement</h4>
          <p style="font-size: 1.1rem; margin-top: 10px; color: #2563EB;">${f.plan_name}</p>
          <div style="font-size: 0.9rem; color: #64748B; margin-top: 8px;">
            <div><b>Agreed Plan Fee:</b> Rs. ${f.agreed_amount.toLocaleString('en-IN')}</div>
            <div><b>Total Received (Token + Fee):</b> Rs. ${fin.total_received.toLocaleString('en-IN')}</div>
            <div><b>Outstanding Balance:</b> Rs. ${fin.outstanding.toLocaleString('en-IN')}</div>
            <div><b>Status:</b> ${f.status}</div>
          </div>
        </div>
      </div>
    `;
  } else if (tab === 'expenses') {
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3>Store Operating Expenses (Entry-Based)</h3>
        <button class="btn-ref-explore" onclick="openAddExpenseEntryModal()" style="width: auto; padding: 6px 14px;">
          <i class="fa-solid fa-plus"></i> Add Expense Entry
        </button>
      </div>
      <div class="kpi-card" style="margin-bottom: 20px; background: #FEF2F2; border-color: #FCA5A5;">
        <div>
          <h4 style="color: #991B1B;">Total Operating Expenses for ${f.name}</h4>
          <p style="color: #1E293B; font-size: 1.6rem; margin-top: 5px;">Rs. ${fin.total_expenses.toLocaleString('en-IN')}</p>
        </div>
      </div>
      <table class="custom-table">
        <thead>
          <tr><th>Date/Time</th><th>Category</th><th>Sub-Category</th><th>Description</th><th>Vendor</th><th>Amount</th><th>Paid By</th><th>Person</th><th>Receipt</th></tr>
        </thead>
        <tbody>
          ${data.expenses.length ? data.expenses.map(e => `
            <tr>
              <td>${e.expense_date} ${e.expense_time || ''}</td>
              <td><span class="records-badge">${e.category_name}</span></td>
              <td>${e.sub_category || '-'}</td>
              <td>${e.description}</td>
              <td>${e.vendor_party || '-'}</td>
              <td><b style="color: #DC2626;">Rs. ${e.amount.toLocaleString('en-IN')}</b></td>
              <td>${e.paid_by}</td>
              <td>${e.person}</td>
              <td>
                ${e.document_path ? `
                  <button onclick="previewPDF('/uploads/${e.document_path}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;">
                    <i class="fa-solid fa-paperclip"></i> View
                  </button>
                ` : '-'}
              </td>
            </tr>
          `).join('') : '<tr><td colspan="9" style="text-align: center;">No operating expense entries recorded for this franchise.</td></tr>'}
        </tbody>
      </table>
    `;
  } else if (tab === 'company_support') {
    const csList = data.company_support;
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3>What We Provided / Company Support Summary (Company Capital)</h3>
        <button class="btn-ref-explore" onclick="openAddSupportModal(${f.id})" style="width: auto; padding: 6px 14px;">
          <i class="fa-solid fa-hand-holding-hand"></i> Record Support
        </button>
      </div>
      <div class="kpi-card" style="margin-bottom: 20px; background: #EFF6FF; border-color: #BFDBFE;">
        <div>
          <h4 style="color: #1E429F;">Total Company Investment Provided</h4>
          <p style="color: #1E293B; font-size: 1.6rem; margin-top: 5px;">Rs. ${fin.total_support.toLocaleString('en-IN')}</p>
        </div>
      </div>
      <table class="custom-table">
        <thead>
          <tr><th>Date</th><th>Interior</th><th>Training</th><th>Influencer</th><th>Branding</th><th>Marketing</th><th>Material</th><th>Travel/Other</th><th>Total Investment</th></tr>
        </thead>
        <tbody>
          ${csList.length ? csList.map(cs => `
            <tr>
              <td>${cs.date_provided || cs.created_at}</td>
              <td>Rs. ${cs.interior_support}</td>
              <td>Rs. ${cs.training_support}</td>
              <td>Rs. ${cs.influencer_support}</td>
              <td>Rs. ${cs.branding_support}</td>
              <td>Rs. ${cs.marketing_support}</td>
              <td>Rs. ${cs.material_support}</td>
              <td>Rs. ${cs.travel_support + cs.other_support}</td>
              <td><b>Rs. ${cs.total_investment.toLocaleString('en-IN')}</b></td>
            </tr>
          `).join('') : '<tr><td colspan="9" style="text-align: center;">No company support entries logged.</td></tr>'}
        </tbody>
      </table>
    `;
  } else if (tab === 'visit_expenses') {
    renderVisitExpensesWorkspace(container);
  } else if (tab === 'timeline') {
    container.innerHTML = `
      <h3>Complete Chronological Activity Timeline</h3>
      <div class="timeline-feed">
        ${data.timeline.length ? data.timeline.map(t => `
          <div class="timeline-item">
            <div class="timeline-icon"></div>
            <div class="timeline-card">
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#64748B; margin-bottom:4px;">
                <span><b>${t.stage_name}</b> (${t.type})</span>
                <span>${t.timestamp}</span>
              </div>
              <div style="font-size:0.9rem; font-weight:600; color:#0F172A;">By: ${t.person}</div>
              <div style="font-size:0.85rem; color:#475569; margin-top:4px;">${t.remarks}</div>
            </div>
          </div>
        `).join('') : '<p style="color:#64748B;">No activity logged yet.</p>'}
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #64748B;">
        <h4>Section: ${tab.toUpperCase()}</h4>
        <p>Dynamic records management for ${tab} module.</p>
      </div>
    `;
  }
}

// --- MODAL UTILS ---

function closeModal() {
  document.getElementById('custom-modal').style.display = 'none';
}

function previewPDF(url) {
  document.getElementById('pdf-frame').src = url;
  document.getElementById('pdf-modal').style.display = 'flex';
}

function closePDFModal() {
  document.getElementById('pdf-modal').style.display = 'none';
  document.getElementById('pdf-frame').src = '';
}

function triggerReportExport(format) {
  const fId = activeFranchiseId ? `?franchise_id=${activeFranchiseId}&format=${format}` : `?format=${format}`;
  window.open(`/api/reports/export${fId}`, '_blank');
}

// --- UNIVERSAL ENTRY MODAL & MODULE CRUD ENGINE ---

const MODULE_FIELD_CONFIG = {
  'leads': {
    title: 'Lead Record',
    f1_label: 'Customer Name', f1_prop: 'customer_name',
    f2_label: 'Mobile & City', f2_prop: 'mobile',
    f3_label: 'Source', f3_prop: 'source',
    endpoint: '/api/leads'
  },
  'calling': {
    title: 'Calling Log Entry',
    f1_label: 'Discussion Details', f1_prop: 'discussion',
    f2_label: 'Requirement / Objection', f2_prop: 'requirement',
    f3_label: 'Next Follow-up Date', f3_prop: 'next_followup_date',
    endpoint: '/api/calls'
  },
  'followup': {
    title: 'Follow-up Record',
    f1_label: 'Follow-up Discussion', f1_prop: 'discussion',
    f2_label: 'Outcome / Decision', f2_prop: 'outcome',
    f3_label: 'Next Follow-up Date', f3_prop: 'next_date',
    endpoint: '/api/followups'
  },
  'plans': {
    title: 'Franchise Plan Selection',
    f1_label: 'Plan Name (e.g. Plan A)', f1_prop: 'plan_name',
    f2_label: 'Assigned Person', f2_prop: 'assigned_person',
    f3_label: 'Agreed Franchise Fee (Rs.)', f3_prop: 'agreed_amount',
    endpoint: '/api/franchises'
  },
  'token': {
    title: 'Token Advance Receipt',
    f1_label: 'Payment Mode', f1_prop: 'payment_mode',
    f2_label: 'Reference / UTR Number', f2_prop: 'reference_no',
    f3_label: 'Token Amount (Rs.)', f3_prop: 'token_amount',
    endpoint: '/api/tokens'
  },
  'survey': {
    title: 'Survey Report & Site Inspection',
    f1_label: 'Surveyor / Inspector Name', f1_prop: 'surveyor_name',
    f2_label: 'Site Area & Frontage', f2_prop: 'area_sqft',
    f3_label: 'Rating Score / Rent (Rs.)', f3_prop: 'rating_score',
    endpoint: '/api/survey/upload'
  },
  'agreement': {
    title: 'Commercial Agreement',
    f1_label: 'Payment Type', f1_prop: 'payment_type',
    f2_label: 'Reference / Contract No.', f2_prop: 'reference_no',
    f3_label: 'Agreed Amount (Rs.)', f3_prop: 'amount',
    endpoint: '/api/payments'
  },
  'payments': {
    title: 'Franchise Payment Receipt',
    f1_label: 'Payment Category', f1_prop: 'payment_type',
    f2_label: 'Payment Mode & Ref No.', f2_prop: 'reference_no',
    f3_label: 'Amount Received (Rs.)', f3_prop: 'amount',
    endpoint: '/api/payments'
  },
  'interior': {
    title: 'Interior Setup Record',
    f1_label: 'Setup Details', f1_prop: 'remarks',
    f2_label: 'Responsible Manager', f2_prop: 'person',
    f3_label: 'Estimated Cost (Rs.)', f3_prop: 'amount',
    endpoint: '/api/company_support'
  },
  'branding': {
    title: 'Branding Setup Record',
    f1_label: 'Installation Date', f1_prop: 'installation_date',
    f2_label: 'Branding Vendor', f2_prop: 'person',
    f3_label: 'Signage & Vinyl Cost (Rs.)', f3_prop: 'signage_cost',
    endpoint: '/api/branding'
  },
  'marketing': {
    title: 'Marketing Campaign Entry',
    f1_label: 'Campaign Name', f1_prop: 'campaign_name',
    f2_label: 'Channel (Digital/Print)', f2_prop: 'channel',
    f3_label: 'Campaign Budget / Cost (Rs.)', f3_prop: 'cost',
    endpoint: '/api/marketing'
  },
  'training': {
    title: 'Staff Training Record',
    f1_label: 'Batch Name', f1_prop: 'batch_name',
    f2_label: 'Trainer Name', f2_prop: 'trainer_name',
    f3_label: 'Staff Count', f3_prop: 'staff_count',
    endpoint: '/api/training'
  },
  'operations': {
    title: 'Store Operations Audit',
    f1_label: 'Auditor Name', f1_prop: 'auditor_name',
    f2_label: 'POS Operational Status', f2_prop: 'pos_status',
    f3_label: 'Checklist Audit Score (%)', f3_prop: 'checklist_score',
    endpoint: '/api/operations'
  },
  'influencer': {
    title: 'Influencer Campaign Entry',
    f1_label: 'Campaign Name', f1_prop: 'campaign_name',
    f2_label: 'Influencer Channel/Handle', f2_prop: 'channel',
    f3_label: 'Campaign Budget (Rs.)', f3_prop: 'cost',
    endpoint: '/api/marketing'
  },
  'opening': {
    title: 'Franchise Launch Event',
    f1_label: 'Event Details', f1_prop: 'remarks',
    f2_label: 'Auditor / Lead Manager', f2_prop: 'auditor_name',
    f3_label: 'Checklist Score (%)', f3_prop: 'checklist_score',
    endpoint: '/api/operations'
  },
  'active': {
    title: 'Active Store Entry',
    f1_label: 'Manager Name', f1_prop: 'person',
    f2_label: 'POS Status', f2_prop: 'pos_status',
    f3_label: 'Operations Score (%)', f3_prop: 'checklist_score',
    endpoint: '/api/operations'
  },
  'materials': {
    title: 'Material & Asset Entry',
    f1_label: 'Asset Item Name', f1_prop: 'item_name',
    f2_label: 'Category', f2_prop: 'category',
    f3_label: 'Quantity Given', f3_prop: 'quantity_given',
    endpoint: '/api/materials'
  },
  'purchases': {
    title: 'Purchase Order Invoice',
    f1_label: 'Invoice Number', f1_prop: 'invoice_no',
    f2_label: 'Item Details', f2_prop: 'item_details',
    f3_label: 'Invoice Amount (Rs.)', f3_prop: 'amount',
    endpoint: '/api/purchases'
  },
  'gr': {
    title: 'Goods Return (GR) Entry',
    f1_label: 'GR Return Number', f1_prop: 'gr_number',
    f2_label: 'Return Reason & Items', f2_prop: 'item_details',
    f3_label: 'Return Value (Rs.)', f3_prop: 'return_amount',
    endpoint: '/api/gr_returns'
  },
  'support': {
    title: 'Company Support Entry',
    f1_label: 'Provided Date', f1_prop: 'date_provided',
    f2_label: 'Support Remarks', f2_prop: 'remarks',
    f3_label: 'Interior Support Cost (Rs.)', f3_prop: 'interior_support',
    endpoint: '/api/company_support'
  },
  'visit_expenses': {
    title: 'Visit Expense Record',
    f1_label: 'Visit Location & Purpose', f1_prop: 'visit_location',
    f2_label: 'Visiting Person / Employee', f2_prop: 'visiting_person',
    f3_label: 'Travel Expense Amount (Rs.)', f3_prop: 'travel_expense',
    endpoint: '/api/visit_expenses'
  }
};

function populateFranchiseSelect(selectId, selectedVal) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = allFranchisesList.map(f => `
    <option value="${f.id}" ${f.id == selectedVal ? 'selected' : ''}>${f.name} (${f.code}) - ${f.city}</option>
  `).join('');
}

function openUniversalEntryModal(moduleKey, entryData = null) {
  const modal = document.getElementById('universal-entry-modal');
  if (!modal) return;

  const cfg = MODULE_FIELD_CONFIG[moduleKey] || {
    title: 'Record Entry',
    f1_label: 'Detail 1', f1_prop: 'detail_1',
    f2_label: 'Detail 2', f2_prop: 'detail_2',
    f3_label: 'Amount / Value (Rs.)', f3_prop: 'amount',
    endpoint: '/api/leads'
  };

  document.getElementById('entry-module-key').value = moduleKey;
  document.getElementById('entry-id').value = entryData ? (entryData.id || '') : '';
  
  const titleEl = document.getElementById('universal-modal-title');
  if (titleEl) {
    titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--accent-blue);"></i> <span>${entryData ? 'Edit ' + cfg.title : 'Add New ' + cfg.title}</span>`;
  }

  populateFranchiseSelect('entry-franchise-id', entryData ? (entryData.franchise_id || activeFranchiseId) : (activeFranchiseId || (allFranchisesList[0] ? allFranchisesList[0].id : 1)));

  document.getElementById('entry-person').value = entryData ? (entryData.person || entryData.assigned_person || entryData.caller_person || entryData.surveyor_name || 'Rajesh Kumar') : 'Rajesh Kumar';
  document.getElementById('entry-date').value = entryData ? (entryData.payment_date || entryData.expense_date || entryData.purchase_date || entryData.return_date || entryData.installation_date || entryData.date_given || entryData.date_provided || datetime_today()) : datetime_today();

  document.getElementById('entry-field-1-label').innerText = cfg.f1_label;
  document.getElementById('entry-field-1').value = entryData ? (entryData[cfg.f1_prop] || entryData.name || entryData.customer_name || entryData.item_name || entryData.invoice_no || entryData.gr_number || entryData.campaign_name || entryData.batch_name || '') : '';

  document.getElementById('entry-field-2-label').innerText = cfg.f2_label;
  document.getElementById('entry-field-2').value = entryData ? (entryData[cfg.f2_prop] || entryData.mobile || entryData.reference_no || entryData.item_details || entryData.trainer_name || entryData.pos_status || '') : '';

  document.getElementById('entry-field-3-label').innerText = cfg.f3_label;
  document.getElementById('entry-field-3').value = entryData ? (entryData[cfg.f3_prop] || entryData.amount || entryData.token_amount || entryData.return_amount || entryData.cost || entryData.agreed_amount || 0) : '';

  document.getElementById('entry-status').value = entryData ? (entryData.status || 'Active') : 'Active';
  document.getElementById('entry-remarks').value = entryData ? (entryData.remarks || '') : '';
  
  const filePreview = document.getElementById('entry-document-preview');
  if (filePreview) {
    filePreview.innerText = (entryData && entryData.document_path) ? `Attached File: ${entryData.document_path}` : '';
  }

  modal.style.display = 'flex';
}

function closeUniversalEntryModal() {
  const modal = document.getElementById('universal-entry-modal');
  if (modal) modal.style.display = 'none';
}

async function handleUniversalEntrySubmit(evt) {
  evt.preventDefault();
  const moduleKey = document.getElementById('entry-module-key').value;
  const entryId = document.getElementById('entry-id').value;
  const cfg = MODULE_FIELD_CONFIG[moduleKey] || { endpoint: '/api/leads' };

  const franchiseId = document.getElementById('entry-franchise-id').value;
  const person = document.getElementById('entry-person').value;
  const dateVal = document.getElementById('entry-date').value;
  const val1 = document.getElementById('entry-field-1').value;
  const val2 = document.getElementById('entry-field-2').value;
  const val3 = document.getElementById('entry-field-3').value;
  const status = document.getElementById('entry-status').value;
  const remarks = document.getElementById('entry-remarks').value;

  const jsonPayload = {
    franchise_id: parseInt(franchiseId),
    person: person,
    assigned_person: person,
    caller_person: person,
    surveyor_name: person,
    auditor_name: person,
    status: status,
    remarks: remarks,
    date: dateVal,
    payment_date: dateVal,
    expense_date: dateVal,
    purchase_date: dateVal,
    return_date: dateVal,
    installation_date: dateVal,
    date_given: dateVal,
    date_provided: dateVal,
    training_date: dateVal
  };

  jsonPayload[cfg.f1_prop] = val1;
  jsonPayload[cfg.f2_prop] = val2;
  jsonPayload[cfg.f3_prop] = val3;

  let url = cfg.endpoint;
  let method = 'POST';

  if (entryId) {
    url = `${cfg.endpoint}/${entryId}`;
    method = 'PUT';
  }

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonPayload)
    });
    const result = await res.json();

    if (result.status === 'success') {
      alert(`Record ${entryId ? 'updated' : 'saved'} successfully!`);
      closeUniversalEntryModal();
      
      if (activePage === 'dashboard') {
        loadDashboard();
      } else {
        renderModulePage(activePage);
      }
      if (activeFranchiseId) {
        loadFranchiseProfileData(activeFranchiseId);
      }
    } else {
      alert(result.error || "Failed to save record.");
    }
  } catch (err) {
    alert("Server communication error.");
  }
}

async function deleteModuleEntry(endpoint, id, refreshCallback) {
  if (!confirm(`Are you sure you want to delete this record?`)) return;
  try {
    const res = await fetch(`${endpoint}/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || "Record deleted.");
    if (refreshCallback) refreshCallback();
  } catch (err) {
    alert("Failed to delete record.");
  }
}

function datetime_today() {
  return new Date().toISOString().split('T')[0];
}

async function renderGenericModuleTable(pageId, containerEl) {
  const cfg = MODULE_FIELD_CONFIG[pageId] || MODULE_FIELD_CONFIG['leads'];
  
  containerEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid fa-filter text-muted"></i>
        <span style="font-weight: 600; font-size: 0.85rem;">Records Overview</span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="openImportHistoryModal('${pageId}')" style="background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem;">
          <i class="fa-solid fa-clock-rotate-left"></i> Import History
        </button>
        <button onclick="openBatchImportModal('${pageId}')" style="background: #0284C7; color: #FFFFFF; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem;">
          <i class="fa-solid fa-file-import"></i> Auto-Import Excel/PDF
        </button>
        <button onclick="openUniversalEntryModal('${pageId}')" style="background: var(--accent-blue); color: #FFFFFF; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem;">
          <i class="fa-solid fa-plus"></i> Add New ${cfg.title}
        </button>
      </div>
    </div>

    <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 8px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #F1F5F9; text-align: left; color: #334155;">
            <th style="padding: 10px 14px;"># ID</th>
            <th style="padding: 10px 14px;">Franchise Store</th>
            <th style="padding: 10px 14px;">Responsible Person</th>
            <th style="padding: 10px 14px;">${cfg.f1_label}</th>
            <th style="padding: 10px 14px;">${cfg.f2_label}</th>
            <th style="padding: 10px 14px;">${cfg.f3_label}</th>
            <th style="padding: 10px 14px;">Status</th>
            <th style="padding: 10px 14px;">Linked Document</th>
            <th style="padding: 10px 14px; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody id="generic-table-body">
          <tr><td colspan="9" style="padding: 20px; text-align: center; color: var(--text-muted);">Loading entries...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const res = await fetch(cfg.endpoint);
    const records = await res.json();

    const tbody = document.getElementById('generic-table-body');
    if (!tbody) return;

    if (!records || records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="padding: 25px; text-align: center; color: var(--text-muted);">No entries found. Click "+ Add New ${cfg.title}" or "Auto-Import Excel/PDF" to record an entry.</td></tr>`;
      return;
    }

    const franchisesMap = {};
    allFranchisesList.forEach(f => franchisesMap[f.id] = f.name);

    tbody.innerHTML = records.map(r => {
      const fName = franchisesMap[r.franchise_id] || `Franchise #${r.franchise_id}`;
      const pName = r.person || r.assigned_person || r.caller_person || r.surveyor_name || r.auditor_name || 'Staff';
      const v1 = r[cfg.f1_prop] || r.name || r.customer_name || r.item_name || r.invoice_no || r.gr_number || r.campaign_name || r.batch_name || '-';
      const v2 = r[cfg.f2_prop] || r.mobile || r.reference_no || r.item_details || r.trainer_name || r.pos_status || '-';
      const v3 = r[cfg.f3_prop] !== undefined ? (typeof r[cfg.f3_prop] === 'number' ? `Rs. ${r[cfg.f3_prop].toLocaleString('en-IN')}` : r[cfg.f3_prop]) : '-';
      const filePath = r.document_path || r.file_path || r.pdf_filepath;

      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 10px 14px; font-weight: 600; color: var(--text-muted);">#${r.id}</td>
          <td style="padding: 10px 14px; font-weight: 600; color: #1E293B;">${fName}</td>
          <td style="padding: 10px 14px; color: #2563EB; font-weight: 500;">${pName}</td>
          <td style="padding: 10px 14px;">${v1}</td>
          <td style="padding: 10px 14px; color: #64748B;">${v2}</td>
          <td style="padding: 10px 14px; font-weight: 600; color: #059669;">${v3}</td>
          <td style="padding: 10px 14px;"><span class="role-badge" style="background:#F1F5F9; color:#334155;">${r.status || 'Active'}</span></td>
          <td style="padding: 10px 14px;">
            ${filePath ? `
              <a href="${filePath}" target="_blank" style="background: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="View Original Linked File">
                <i class="fa-solid fa-file-earmark-arrow-down"></i> Original File
              </a>
            ` : '-'}
          </td>
          <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
            <button onclick='openUniversalEntryModal("${pageId}", ${JSON.stringify(r).replace(/'/g, "&apos;")})' style="background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 4px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600; cursor: pointer; margin-right: 4px;">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button onclick='deleteModuleEntry("${cfg.endpoint}", ${r.id}, () => renderModulePage("${pageId}"))' style="background: #FEF2F2; color: #DC2626; border: 1px solid #FCA5A5; padding: 4px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

// --- UNIVERSAL AUTO-EXTRACTION & BATCH IMPORT FRONTEND CONTROLLERS ---

async function autoExtractModalFile(inputEl) {
  if (!inputEl.files || inputEl.files.length === 0) return;
  const file = inputEl.files[0];
  const statusEl = document.getElementById('modal-extract-status');
  statusEl.innerHTML = `<span style="color: #2563EB;"><i class="fa-solid fa-spinner fa-spin"></i> Extracting data from ${file.name}...</span>`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/extract_file', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.status === 'success' && data.extracted_records && data.extracted_records.length > 0) {
      const rec = data.extracted_records[0];
      if (rec.date) document.getElementById('entry-date').value = rec.date;
      if (rec.person) document.getElementById('entry-person').value = rec.person;
      if (rec.description) document.getElementById('entry-field-1').value = rec.description;
      if (rec.vendor_party || rec.reference_no) document.getElementById('entry-field-2').value = rec.vendor_party || rec.reference_no;
      if (rec.amount) document.getElementById('entry-field-3').value = rec.amount;
      if (rec.remarks) document.getElementById('entry-remarks').value = rec.remarks;

      const previewEl = document.getElementById('entry-document-preview');
      if (previewEl) previewEl.innerHTML = `Linked Original File: <a href="${data.file_path}" target="_blank">${data.file_name}</a>`;

      statusEl.innerHTML = `<span style="color: #16A34A; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Extracted data from ${file.name}. Review/edit fields below.</span>`;
    } else {
      statusEl.innerHTML = `<span style="color: #DC2626;"><i class="fa-solid fa-triangle-exclamation"></i> No structured fields found in ${file.name}. Enter details manually.</span>`;
    }
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<span style="color: #DC2626;">Error extracting file data.</span>`;
  }
}

let currentBatchModuleKey = 'expenses';
let currentBatchFileData = null;
let currentBatchRecords = [];

function openBatchImportModal(moduleKey = 'expenses') {
  currentBatchModuleKey = moduleKey;
  const cfg = MODULE_FIELD_CONFIG[moduleKey] || { title: moduleKey };
  document.getElementById('batch-import-title').innerText = `Auto-Import ${cfg.title || moduleKey} Records (Excel/PDF)`;
  populateFranchiseSelect('batch-import-franchise-id', activeFranchiseId || (allFranchisesList[0] ? allFranchisesList[0].id : 1));
  
  document.getElementById('batch-import-file-input').value = '';
  document.getElementById('batch-import-warning').style.display = 'none';
  document.getElementById('batch-extracted-preview').style.display = 'none';
  document.getElementById('batch-confirm-btn').disabled = true;
  currentBatchFileData = null;
  currentBatchRecords = [];

  document.getElementById('batch-import-modal').style.display = 'flex';
}

function closeBatchImportModal() {
  document.getElementById('batch-import-modal').style.display = 'none';
}

async function handleBatchFileSelect(inputEl) {
  if (!inputEl.files || inputEl.files.length === 0) return;
  const file = inputEl.files[0];
  const warningEl = document.getElementById('batch-import-warning');
  const previewEl = document.getElementById('batch-extracted-preview');
  
  warningEl.style.display = 'block';
  warningEl.style.background = '#EFF6FF';
  warningEl.style.border = '1px solid #BFDBFE';
  warningEl.style.color = '#1D4ED8';
  warningEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reading & extracting data from ${file.name}...`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/extract_file', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.status === 'success') {
      currentBatchFileData = data;
      currentBatchRecords = data.extracted_records || [];

      if (data.is_duplicate) {
        warningEl.style.background = '#FEF3C7';
        warningEl.style.border = '1px solid #F59E0B';
        warningEl.style.color = '#92400E';
        warningEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i> <b>Duplicate File Warning:</b> This file (<b>${file.name}</b>) was previously imported on ${data.previous_import ? data.previous_import.uploaded_at : 'an earlier date'}. Re-importing will append new records without overwriting.`;
      } else {
        warningEl.style.background = '#F0FDF4';
        warningEl.style.border = '1px solid #BBF7D0';
        warningEl.style.color = '#15803D';
        warningEl.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> Extracted <b>${currentBatchRecords.length}</b> records from <b>${file.name}</b>. Review and edit fields below before importing.`;
      }

      renderBatchPreviewRows();
      previewEl.style.display = 'block';
      document.getElementById('batch-confirm-btn').disabled = false;
    } else {
      warningEl.style.background = '#FEF2F2';
      warningEl.style.border = '1px solid #FCA5A5';
      warningEl.style.color = '#B91C1C';
      warningEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Failed to extract file: ${data.error || 'Unknown error'}`;
    }
  } catch (err) {
    console.error(err);
    warningEl.innerHTML = `Server extraction error.`;
  }
}

function renderBatchPreviewRows() {
  const tbody = document.getElementById('batch-preview-tbody');
  const countEl = document.getElementById('batch-extracted-count');
  if (!tbody) return;

  countEl.innerText = `Extracted Records (${currentBatchRecords.length})`;
  if (currentBatchRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding: 15px; text-align: center; color: #94A3B8;">No records found. Click "Add Manual Row" to create an entry.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentBatchRecords.map((r, idx) => `
    <tr>
      <td style="padding: 4px;"><input type="date" value="${r.date || datetime_today()}" onchange="currentBatchRecords[${idx}].date=this.value" style="width: 100%; font-size: 0.8rem; padding: 4px;"></td>
      <td style="padding: 4px;"><input type="text" value="${r.person || 'Rajesh Kumar'}" onchange="currentBatchRecords[${idx}].person=this.value" style="width: 100%; font-size: 0.8rem; padding: 4px;"></td>
      <td style="padding: 4px;"><input type="text" value="${r.description || r.purpose || ''}" onchange="currentBatchRecords[${idx}].description=this.value" style="width: 100%; font-size: 0.8rem; padding: 4px;"></td>
      <td style="padding: 4px;"><input type="number" step="any" value="${r.amount || 0}" onchange="currentBatchRecords[${idx}].amount=this.value" style="width: 90px; font-size: 0.8rem; padding: 4px;"></td>
      <td style="padding: 4px;"><input type="text" value="${r.category || r.vendor_party || ''}" onchange="currentBatchRecords[${idx}].category=this.value" style="width: 100%; font-size: 0.8rem; padding: 4px;"></td>
      <td style="padding: 4px;"><input type="text" value="${r.remarks || ''}" onchange="currentBatchRecords[${idx}].remarks=this.value" style="width: 100%; font-size: 0.8rem; padding: 4px;"></td>
      <td style="padding: 4px; text-align: center;">
        <button type="button" onclick="deleteBatchRow(${idx})" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FCA5A5; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function addEmptyBatchRow() {
  currentBatchRecords.push({
    date: datetime_today(),
    person: 'Rajesh Kumar',
    description: 'Manual entry',
    amount: 0,
    category: 'General',
    remarks: ''
  });
  renderBatchPreviewRows();
}

function deleteBatchRow(idx) {
  currentBatchRecords.splice(idx, 1);
  renderBatchPreviewRows();
}

async function submitBatchImport() {
  if (!currentBatchRecords || currentBatchRecords.length === 0) {
    alert("No records to import!");
    return;
  }
  const franchiseId = document.getElementById('batch-import-franchise-id').value;
  const payload = {
    module_name: currentBatchModuleKey,
    franchise_id: parseInt(franchiseId),
    file_name: currentBatchFileData ? currentBatchFileData.file_name : 'Manual_Import.xlsx',
    file_path: currentBatchFileData ? currentBatchFileData.file_path : '',
    file_hash: currentBatchFileData ? currentBatchFileData.file_hash : '',
    file_type: currentBatchFileData ? currentBatchFileData.file_type : 'Excel',
    uploaded_by: 'System Admin',
    records: currentBatchRecords,
    remarks: `Non-destructive import into ${currentBatchModuleKey}`
  };

  try {
    const res = await fetch('/api/import_file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'success') {
      alert(`Success: ${data.message}`);
      closeBatchImportModal();
      if (activePage === 'dashboard') {
        loadDashboard();
      } else {
        renderModulePage(activePage);
      }
      if (activeFranchiseId) {
        loadFranchiseProfileData(activeFranchiseId);
      }
    } else {
      alert(`Import failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Server communication error during import.");
  }
}

async function openImportHistoryModal(moduleFilter = '') {
  const modal = document.getElementById('import-history-modal');
  const tbody = document.getElementById('import-history-tbody');
  if (!modal || !tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #94A3B8;">Loading import history...</td></tr>`;
  modal.style.display = 'flex';

  try {
    const url = moduleFilter ? `/api/import_history?module=${moduleFilter}` : '/api/import_history';
    const res = await fetch(url);
    const imports = await res.json();

    if (!imports || imports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 25px; text-align: center; color: #94A3B8;">No import history recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = imports.map(i => `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 12px; font-weight: 500; color: #334155;">${i.uploaded_at}</td>
        <td style="padding: 10px 12px;"><span style="background: #EFF6FF; color: #2563EB; padding: 2px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;">${i.module_name}</span></td>
        <td style="padding: 10px 12px; font-weight: 600; color: #0F172A;">${i.file_name}</td>
        <td style="padding: 10px 12px; font-weight: 700; color: #16A34A;">${i.records_count} rows</td>
        <td style="padding: 10px 12px; color: #64748B;">${i.uploaded_by}</td>
        <td style="padding: 10px 12px;">
          ${i.file_path ? `
            <a href="${i.file_path}" target="_blank" style="background: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600; text-decoration: none;">
              <i class="fa-solid fa-file-earmark-arrow-down"></i> Original File
            </a>
          ` : '-'}
        </td>
        <td style="padding: 10px 12px; font-size: 0.75rem; color: #64748B;">
          <span style="color: #16A34A; font-weight: 600;">✔ ${i.status}</span><br>
          <code style="font-size: 0.7rem; color: #94A3B8;">${(i.file_hash || '').substring(0, 12)}...</code>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #DC2626;">Error loading import history.</td></tr>`;
  }
}

function closeImportHistoryModal() {
  const modal = document.getElementById('import-history-modal');
  if (modal) modal.style.display = 'none';
}

// --- VISIT EXPENSES MODULE CONTROLLERS ---

async function renderVisitExpensesWorkspace(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <!-- Top Action & Filter Toolbar -->
    <div style="display: flex; gap: 10px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; background: #F8FAFC; padding: 15px; border-radius: 10px; border: 1px solid #E2E8F0;">
      <select id="ve-filter-franchise" onchange="fetchFilteredVisitExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Franchises</option>
        ${allFranchisesList.map(f => `<option value="${f.id}">${f.name} (${f.code})</option>`).join('')}
      </select>

      <select id="ve-filter-person" onchange="fetchFilteredVisitExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Visiting Persons / Staff</option>
        <option value="Rajesh Kumar">Rajesh Kumar</option>
        <option value="Priya Sharma">Priya Sharma</option>
        <option value="Vikram Singh">Vikram Singh</option>
        <option value="Suresh Patel">Suresh Patel</option>
        <option value="Ananya Sharma">Ananya Sharma</option>
      </select>

      <select id="ve-filter-date" onchange="fetchFilteredVisitExpenses()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="Till Now" selected>Date Preset: Till Now (All Time)</option>
        <option value="Today">Today</option>
        <option value="7 Days">Last 7 Days</option>
        <option value="30 Days">Last 30 Days</option>
        <option value="This Month">This Month</option>
        <option value="Quarterly">Quarterly</option>
        <option value="Half Yearly">Half Yearly</option>
        <option value="Yearly">Yearly</option>
      </select>

      <input type="text" id="ve-search" oninput="fetchFilteredVisitExpenses()" placeholder="Search location, person, purpose..." style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem; width: 220px;">

      <div style="display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap;">
        <button onclick="openImportHistoryModal('visit_expenses')" style="background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem;">
          <i class="fa-solid fa-clock-rotate-left"></i> Import History
        </button>
        <button onclick="openBatchImportModal('visit_expenses')" style="background: #0284C7; color: #FFFFFF; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem;">
          <i class="fa-solid fa-file-import"></i> Auto-Import Excel/PDF
        </button>
        <button class="btn-ref-explore" onclick="openAddVisitExpenseModal()" style="width: auto; padding: 6px 16px;">
          <i class="fa-solid fa-plus"></i> Add Visit Expense Entry
        </button>
      </div>
    </div>

    <!-- Automatic Summary Calculations Banner -->
    <div id="visit-expense-totals-banner" style="margin-bottom: 20px;"></div>

    <!-- Visit Expense Entries Table -->
    <div id="visit-expense-table-container">
      <p style="text-align: center; color: #64748B;">Loading visit expenses...</p>
    </div>
  `;

  await fetchFilteredVisitExpenses();
}

async function fetchFilteredVisitExpenses() {
  const franchise_id = activeFranchiseId || (document.getElementById('ve-filter-franchise')?.value || '');
  const person = document.getElementById('ve-filter-person')?.value || '';
  const date_preset = document.getElementById('ve-filter-date')?.value || 'Till Now';
  const search = document.getElementById('ve-search')?.value || '';

  const params = new URLSearchParams({ franchise_id, person, date_preset, search });

  try {
    const res = await fetch(`/api/visit_expenses?${params.toString()}`);
    const data = await res.json();

    const bannerEl = document.getElementById('visit-expense-totals-banner');
    if (bannerEl) {
      bannerEl.innerHTML = `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F1F5F9; padding-bottom: 10px;">
            <h4 style="margin: 0; color: #0F172A; font-size: 1rem;"><i class="fa-solid fa-plane-departure" style="color: var(--accent-blue);"></i> Dedicated Visit Expense Summary</h4>
            <span style="font-size: 1.25rem; font-weight: 700; color: #2563EB;">Total Visit Expense: Rs. ${(data.total_visit_expense || 0).toLocaleString('en-IN')}</span>
          </div>

          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <span style="background: #EFF6FF; color: #1D4ED8; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
              Travel Total: Rs. ${(data.tot_travel || 0).toLocaleString('en-IN')}
            </span>
            <span style="background: #F0FDF4; color: #15803D; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
              Food Total: Rs. ${(data.tot_food || 0).toLocaleString('en-IN')}
            </span>
            <span style="background: #FEF3C7; color: #B45309; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
              Hotel / Stay Total: Rs. ${(data.tot_stay || 0).toLocaleString('en-IN')}
            </span>
            <span style="background: #F3E8FF; color: #7E22CE; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
              Other Total: Rs. ${(data.tot_other || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      `;
    }

    const tableEl = document.getElementById('visit-expense-table-container');
    if (tableEl) {
      if (!data.visit_expenses || data.visit_expenses.length === 0) {
        tableEl.innerHTML = `
          <div style="padding: 40px; text-align: center; background: #FFFFFF; border-radius: 12px; border: 1px dashed #CBD5E1;">
            <p style="color: #64748B; margin: 0 0 15px;">No visit expense entries found matching filters.</p>
            <button class="btn-ref-explore" onclick="openAddVisitExpenseModal()" style="width: auto; margin: 0 auto; padding: 8px 16px;">
              <i class="fa-solid fa-plus"></i> Add Visit Expense Entry
            </button>
          </div>
        `;
        return;
      }

      tableEl.innerHTML = `
        <table class="custom-table">
          <thead>
            <tr>
              <th>Visit Date</th>
              <th>Franchise Store</th>
              <th>Visiting Person</th>
              <th>Location</th>
              <th>Purpose of Visit</th>
              <th>Travel (Rs.)</th>
              <th>Food (Rs.)</th>
              <th>Stay (Rs.)</th>
              <th>Other (Rs.)</th>
              <th>Total Expense</th>
              <th>Mode / Paid By</th>
              <th>Bill Attachment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.visit_expenses.map(e => `
              <tr>
                <td><b>${e.visit_date}</b></td>
                <td><b>${e.franchise_name}</b></td>
                <td><span style="color: #2563EB; font-weight: 600;">${e.visiting_person}</span></td>
                <td>${e.visit_location || '-'}</td>
                <td>${e.purpose || '-'}</td>
                <td>Rs. ${(e.travel_expense || 0).toLocaleString('en-IN')}</td>
                <td>Rs. ${(e.food_expense || 0).toLocaleString('en-IN')}</td>
                <td>Rs. ${(e.hotel_stay_expense || 0).toLocaleString('en-IN')}</td>
                <td>Rs. ${(e.other_expense || 0).toLocaleString('en-IN')}</td>
                <td><b style="color: #2563EB;">Rs. ${e.total_expense.toLocaleString('en-IN')}</b></td>
                <td>${e.payment_mode} (${e.paid_by})</td>
                <td>
                  ${e.document_path ? `
                    <a href="${e.document_path}" target="_blank" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                      <i class="fa-solid fa-paperclip"></i> View Receipt
                    </a>
                  ` : '-'}
                </td>
                <td style="white-space: nowrap;">
                  <button onclick='openAddVisitExpenseModal(${JSON.stringify(e).replace(/'/g, "&apos;")})' style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; margin-right:4px;" title="Edit Visit Expense">
                    <i class="fa-solid fa-pen"></i> Edit
                  </button>
                  <button onclick="deleteVisitExpenseEntry(${e.id})" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; padding:4px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;" title="Delete Visit Expense">
                    <i class="fa-solid fa-trash-can"></i> Delete
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    console.error('Error fetching visit expenses:', err);
  }
}

function openAddVisitExpenseModal(entryData = null) {
  openUniversalEntryModal('visit_expenses', entryData);
}

async function deleteVisitExpenseEntry(id) {
  if (!confirm("Are you sure you want to delete this Visit Expense record?")) return;
  try {
    const res = await fetch(`/api/visit_expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || "Record deleted.");
    fetchFilteredVisitExpenses();
  } catch (err) {
    alert("Failed to delete record.");
  }
}

// --- USER MANAGEMENT MODULE ---
let allUsersList = [];
let currentEditingUser = null;

const ALL_MODULES = [
  { key: 'leads', name: 'Leads & Assignments' },
  { key: 'calling', name: 'Calling History' },
  { key: 'followup', name: 'Follow-ups' },
  { key: 'survey', name: 'Survey Reports' },
  { key: 'visit', name: 'Site Visit & Expenses' },
  { key: 'payments', name: 'Franchise Payments' },
  { key: 'expenses', name: 'Expenses Management' },
  { key: 'purchase', name: 'Purchase Log' },
  { key: 'gr', name: 'Goods Return (GR)' },
  { key: 'training', name: 'Staff Training' },
  { key: 'interior', name: 'Interior & Store Setup' },
  { key: 'marketing', name: 'Marketing Campaigns' },
  { key: 'reports', name: 'Reports & Exports' },
  { key: 'settings', name: 'Settings & Master Setup' },
  { key: 'user_management', name: 'User Management' }
];

const DEFAULT_ROLE_PERMISSIONS = {
  'Admin': { view: true, add: true, edit: true, delete: true, approve: true, export: true },
  'Manager': { view: true, add: true, edit: true, delete: false, approve: true, export: true },
  'Field Executive': {
    leads: { view: true, add: true, edit: true, delete: false, approve: false, export: false },
    calling: { view: true, add: true, edit: true, delete: false, approve: false, export: false },
    followup: { view: true, add: true, edit: true, delete: false, approve: false, export: false },
    survey: { view: true, add: true, edit: true, delete: false, approve: false, export: false },
    visit: { view: true, add: true, edit: true, delete: false, approve: false, export: false },
    training: { view: true, add: true, edit: true, delete: false, approve: false, export: false },
    interior: { view: true, add: true, edit: true, delete: false, approve: false, export: false }
  },
  'Accountant': {
    payments: { view: true, add: true, edit: true, delete: false, approve: true, export: true },
    expenses: { view: true, add: true, edit: true, delete: false, approve: true, export: true },
    purchase: { view: true, add: true, edit: true, delete: false, approve: true, export: true },
    gr: { view: true, add: true, edit: true, delete: false, approve: true, export: true },
    reports: { view: true, add: true, edit: true, delete: false, approve: true, export: true }
  },
  'Franchisee': {
    survey: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    payments: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    expenses: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    purchase: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    gr: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    training: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    interior: { view: true, add: true, edit: false, delete: false, approve: false, export: false },
    marketing: { view: true, add: true, edit: false, delete: false, approve: false, export: false }
  }
};

function renderUsersWorkspace(container) {
  container.innerHTML = `
    <!-- Stat Pills Header -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4 style="font-size: 0.8rem; color: #64748B;">Total Users</h4>
          <p id="users-stat-total" style="font-size: 1.4rem; font-weight: 700; color: #0F172A; margin: 4px 0 0 0;">0</p>
        </div>
        <div class="kpi-icon icon-blue"><i class="fa-solid fa-users"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4 style="font-size: 0.8rem; color: #64748B;">Active Users</h4>
          <p id="users-stat-active" style="font-size: 1.4rem; font-weight: 700; color: #16A34A; margin: 4px 0 0 0;">0</p>
        </div>
        <div class="kpi-icon icon-green"><i class="fa-solid fa-user-check"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4 style="font-size: 0.8rem; color: #64748B;">Admins & Managers</h4>
          <p id="users-stat-managers" style="font-size: 1.4rem; font-weight: 700; color: #2563EB; margin: 4px 0 0 0;">0</p>
        </div>
        <div class="kpi-icon icon-purple"><i class="fa-solid fa-user-gear"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4 style="font-size: 0.8rem; color: #64748B;">Field & Franchisees</h4>
          <p id="users-stat-field" style="font-size: 1.4rem; font-weight: 700; color: #D97706; margin: 4px 0 0 0;">0</p>
        </div>
        <div class="kpi-icon icon-orange"><i class="fa-solid fa-store"></i></div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div style="background: #F8FAFC; padding: 15px; border-radius: 10px; border: 1px solid #E2E8F0; margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
      <input type="text" id="users-filter-search" oninput="debounce(loadUsers, 300)()" placeholder="Search name, email, mobile, department..." style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem; width: 260px;">

      <select id="users-filter-role" onchange="loadUsers()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Roles</option>
        <option value="Admin">Admin</option>
        <option value="Manager">Manager</option>
        <option value="Field Executive">Field Executive</option>
        <option value="Accountant">Accountant</option>
        <option value="Franchisee">Franchisee</option>
      </select>

      <select id="users-filter-status" onchange="loadUsers()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Status</option>
        <option value="active">Active Only</option>
        <option value="inactive">Inactive Only</option>
      </select>

      <select id="users-filter-franchise" onchange="loadUsers()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
        <option value="">All Franchises</option>
        ${allFranchisesList.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
      </select>

      <button class="btn-ref-explore" onclick="openNewUserModal()" style="width: auto; padding: 6px 16px; margin-left: auto; background: #2563EB;">
        <i class="fa-solid fa-user-plus"></i> Create New User
      </button>
    </div>

    <!-- Users Data Table -->
    <div style="background: #FFFFFF; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="overflow-x: auto;">
        <table class="data-table" style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
          <thead>
            <tr style="background: #F1F5F9; color: #475569; text-align: left;">
              <th style="padding: 12px 15px;">User Info</th>
              <th style="padding: 12px 15px;">Role</th>
              <th style="padding: 12px 15px;">Assigned Franchise</th>
              <th style="padding: 12px 15px;">Department</th>
              <th style="padding: 12px 15px;">Status</th>
              <th style="padding: 12px 15px;">Last Login</th>
              <th style="padding: 12px 15px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="users-table-tbody">
            <tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748B;">Loading users list...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadUsers();
}

async function loadUsers() {
  const search = document.getElementById('users-filter-search')?.value || '';
  const role = document.getElementById('users-filter-role')?.value || '';
  const status = document.getElementById('users-filter-status')?.value || '';
  const franchise_id = document.getElementById('users-filter-franchise')?.value || '';

  const queryParams = new URLSearchParams({ search, role, status, franchise_id });

  try {
    const res = await fetch(`/api/users?${queryParams.toString()}`);
    if (res.status === 403) {
      document.getElementById('users-table-tbody').innerHTML = `
        <tr><td colspan="7" style="text-align: center; padding: 30px; color: #DC2626; font-weight: 600;">
          <i class="fa-solid fa-lock" style="font-size: 1.5rem; display: block; margin-bottom: 8px;"></i>
          Access Restricted: User Management section is accessible only to Admin users.
        </td></tr>
      `;
      return;
    }

    const users = await res.json();
    allUsersList = users;

    // Update KPI pills
    const total = users.length;
    const active = users.filter(u => u.is_active).length;
    const managers = users.filter(u => ['Admin', 'Manager'].includes(u.role)).length;
    const field = users.filter(u => ['Field Executive', 'Franchisee'].includes(u.role)).length;

    if (document.getElementById('users-stat-total')) document.getElementById('users-stat-total').innerText = total;
    if (document.getElementById('users-stat-active')) document.getElementById('users-stat-active').innerText = active;
    if (document.getElementById('users-stat-managers')) document.getElementById('users-stat-managers').innerText = managers;
    if (document.getElementById('users-stat-field')) document.getElementById('users-stat-field').innerText = field;

    renderUsersTable(users);
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-tbody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: #64748B;">No users found matching current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const roleColors = {
      'Admin': 'background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;',
      'Manager': 'background: #DBEAFE; color: #1E40AF; border: 1px solid #93C5FD;',
      'Field Executive': 'background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;',
      'Accountant': 'background: #D1FAE5; color: #065F46; border: 1px solid #6EE7B7;',
      'Franchisee': 'background: #F3E8FF; color: #6B21A8; border: 1px solid #D8B4FE;'
    };

    const statusBadge = u.is_active
      ? `<span style="background: #DCFCE7; color: #166534; padding: 3px 10px; border-radius: 9999px; font-weight: 600; font-size: 0.75rem;"><i class="fa-solid fa-circle" style="font-size: 0.5rem; margin-right: 4px;"></i> Active</span>`
      : `<span style="background: #F3F4F6; color: #4B5563; padding: 3px 10px; border-radius: 9999px; font-weight: 600; font-size: 0.75rem;"><i class="fa-solid fa-circle" style="font-size: 0.5rem; margin-right: 4px;"></i> Inactive</span>`;

    return `
      <tr style="border-bottom: 1px solid #F1F5F9;">
        <td style="padding: 12px 15px;">
          <div style="font-weight: 600; color: #0F172A;">${u.full_name}</div>
          <div style="font-size: 0.78rem; color: #64748B;"><i class="fa-regular fa-envelope"></i> ${u.username} ${u.mobile ? `| <i class="fa-solid fa-phone"></i> ${u.mobile}` : ''}</div>
        </td>
        <td style="padding: 12px 15px;">
          <span style="padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; ${roleColors[u.role] || ''}">
            ${u.role}
          </span>
        </td>
        <td style="padding: 12px 15px; color: #334155;">
          <i class="fa-solid fa-store text-muted"></i> ${u.franchise_name || 'All Franchises'}
        </td>
        <td style="padding: 12px 15px; color: #475569;">
          ${u.department || '<span style="color: #94A3B8;">N/A</span>'}
        </td>
        <td style="padding: 12px 15px;">
          ${statusBadge}
        </td>
        <td style="padding: 12px 15px; font-size: 0.8rem; color: #64748B;">
          ${u.last_login || 'Never'}
        </td>
        <td style="padding: 12px 15px; text-align: right; white-space: nowrap;">
          <button onclick="openEditUserModal(${u.id})" title="Edit User & Permissions" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; color: #2563EB; font-size: 0.8rem; margin-right: 4px;">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button onclick="toggleUserStatus(${u.id}, ${u.is_active})" title="${u.is_active ? 'Deactivate Account' : 'Activate Account'}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; color: ${u.is_active ? '#D97706' : '#16A34A'}; font-size: 0.8rem; margin-right: 4px;">
            <i class="fa-solid ${u.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i> ${u.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button onclick="openResetPasswordModal(${u.id}, '${u.full_name}')" title="Reset User Password" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; color: #D97706; font-size: 0.8rem; margin-right: 4px;">
            <i class="fa-solid fa-key"></i> Password
          </button>
          <button onclick="deleteUser(${u.id}, '${u.full_name}')" title="Delete User Account" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #FCA5A5; background: #FEF2F2; cursor: pointer; color: #DC2626; font-size: 0.8rem;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openNewUserModal() {
  currentEditingUser = null;
  document.getElementById('user-form-id').value = '';
  document.getElementById('user-modal-title').innerText = 'Create New User';
  document.getElementById('user-full-name').value = '';
  document.getElementById('user-username').value = '';
  document.getElementById('user-mobile').value = '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password').required = true;
  document.getElementById('user-password-hint').innerText = '(Required for new user)';
  document.getElementById('user-role').value = 'Manager';
  document.getElementById('user-department').value = '';
  document.getElementById('user-status').value = 'true';

  populateFranchiseDropdownInUserModal('');
  renderPermissionsMatrixTable('Manager', null);
  switchUserModalTab('basic');

  document.getElementById('user-modal').style.display = 'flex';
}

function openEditUserModal(userId) {
  const user = allUsersList.find(u => u.id === userId);
  if (!user) return;

  currentEditingUser = user;
  document.getElementById('user-form-id').value = user.id;
  document.getElementById('user-modal-title').innerText = `Edit User: ${user.full_name}`;
  document.getElementById('user-full-name').value = user.full_name;
  document.getElementById('user-username').value = user.username;
  document.getElementById('user-mobile').value = user.mobile || '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password').required = false;
  document.getElementById('user-password-hint').innerText = '(Leave blank to keep unchanged)';
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-department').value = user.department || '';
  document.getElementById('user-status').value = user.is_active ? 'true' : 'false';

  populateFranchiseDropdownInUserModal(user.franchise_id || '');
  renderPermissionsMatrixTable(user.role, user.permissions);
  switchUserModalTab('basic');

  document.getElementById('user-modal').style.display = 'flex';
}

function populateFranchiseDropdownInUserModal(selectedId) {
  const select = document.getElementById('user-franchise-id');
  if (!select) return;

  select.innerHTML = `<option value="">All Franchises (Unrestricted Access)</option>` +
    allFranchisesList.map(f => `<option value="${f.id}" ${String(f.id) === String(selectedId) ? 'selected' : ''}>${f.name} (${f.code})</option>`).join('');
}

function switchUserModalTab(tabName) {
  const basicBtn = document.getElementById('user-tab-basic');
  const permsBtn = document.getElementById('user-tab-perms');
  const basicContent = document.getElementById('user-tab-content-basic');
  const permsContent = document.getElementById('user-tab-content-perms');

  if (tabName === 'basic') {
    basicBtn.style.color = '#2563EB';
    basicBtn.style.borderBottom = '3px solid #2563EB';
    permsBtn.style.color = '#64748B';
    permsBtn.style.borderBottom = 'none';
    basicContent.style.display = 'grid';
    permsContent.style.display = 'none';
  } else {
    permsBtn.style.color = '#2563EB';
    permsBtn.style.borderBottom = '3px solid #2563EB';
    basicBtn.style.color = '#64748B';
    basicBtn.style.borderBottom = 'none';
    basicContent.style.display = 'none';
    permsContent.style.display = 'flex';
  }
}

function handleModalRoleChange(newRole) {
  renderPermissionsMatrixTable(newRole, null);
}

function renderPermissionsMatrixTable(role, customPermissions) {
  const tbody = document.getElementById('user-perms-tbody');
  if (!tbody) return;

  const actions = ['view', 'add', 'edit', 'delete', 'approve', 'export'];

  tbody.innerHTML = ALL_MODULES.map(mod => {
    let modPerms = {};
    if (customPermissions && customPermissions[mod.key]) {
      modPerms = customPermissions[mod.key];
    } else {
      // Get role defaults
      if (role === 'Admin') {
        actions.forEach(a => modPerms[a] = true);
      } else if (role === 'Manager') {
        actions.forEach(a => modPerms[a] = (a !== 'delete'));
      } else {
        const roleDefs = DEFAULT_ROLE_PERMISSIONS[role] || {};
        const modDefs = roleDefs[mod.key] || { view: false, add: false, edit: false, delete: false, approve: false, export: false };
        actions.forEach(a => modPerms[a] = !!modDefs[a]);
      }
    }

    const checkboxesHtml = actions.map(action => `
      <td style="text-align: center; padding: 8px;">
        <input type="checkbox" id="perm_${mod.key}_${action}" data-module="${mod.key}" data-action="${action}" ${modPerms[action] ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
      </td>
    `).join('');

    return `
      <tr style="border-bottom: 1px solid #F1F5F9;">
        <td style="padding: 8px 12px; font-weight: 600; color: #1E293B;">${mod.name}</td>
        ${checkboxesHtml}
      </tr>
    `;
  }).join('');
}

function grantAllModalPermissions(state) {
  ALL_MODULES.forEach(mod => {
    ['view', 'add', 'edit', 'delete', 'approve', 'export'].forEach(action => {
      const cb = document.getElementById(`perm_${mod.key}_${action}`);
      if (cb) cb.checked = state;
    });
  });
}

function resetModalRolePermissions() {
  const role = document.getElementById('user-role')?.value || 'Manager';
  renderPermissionsMatrixTable(role, null);
}

function extractPermissionsFromMatrix() {
  const perms = {};
  ALL_MODULES.forEach(mod => {
    perms[mod.key] = {};
    ['view', 'add', 'edit', 'delete', 'approve', 'export'].forEach(action => {
      const cb = document.getElementById(`perm_${mod.key}_${action}`);
      perms[mod.key][action] = cb ? cb.checked : false;
    });
  });
  return perms;
}

async function saveUser(e) {
  e.preventDefault();

  const userId = document.getElementById('user-form-id').value;
  const full_name = document.getElementById('user-full-name').value.trim();
  const username = document.getElementById('user-username').value.trim();
  const mobile = document.getElementById('user-mobile').value.trim();
  const password = document.getElementById('user-password').value.trim();
  const role = document.getElementById('user-role').value;
  const franchise_id = document.getElementById('user-franchise-id').value;
  const department = document.getElementById('user-department').value.trim();
  const is_active = document.getElementById('user-status').value === 'true';
  const permissions = extractPermissionsFromMatrix();

  const payload = {
    full_name,
    username,
    mobile,
    role,
    franchise_id: franchise_id ? parseInt(franchise_id) : null,
    department,
    is_active,
    permissions
  };

  if (password) {
    payload.password = password;
  }

  try {
    const url = userId ? `/api/users/${userId}` : '/api/users';
    const method = userId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (res.ok && result.status === 'success') {
      alert(result.message || 'User saved successfully!');
      closeUserModal();
      loadUsers();
    } else {
      alert(`Error: ${result.message || result.error || 'Failed to save user.'}`);
    }
  } catch (err) {
    console.error('Error saving user:', err);
    alert('An unexpected error occurred while saving user.');
  }
}

function closeUserModal() {
  document.getElementById('user-modal').style.display = 'none';
}

async function toggleUserStatus(userId, currentStatus) {
  const user = allUsersList.find(u => u.id === userId);
  const actionText = currentStatus ? 'deactivate' : 'activate';

  if (!confirm(`Are you sure you want to ${actionText} user "${user ? user.full_name : 'ID ' + userId}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentStatus })
    });
    const result = await res.json();
    if (res.ok && result.status === 'success') {
      loadUsers();
    } else {
      alert(`Error: ${result.message || result.error || 'Failed to update user status.'}`);
    }
  } catch (err) {
    console.error('Error toggling user status:', err);
  }
}

function openResetPasswordModal(userId, userName) {
  document.getElementById('reset-pass-user-id').value = userId;
  document.getElementById('reset-pass-user-label').innerText = `Resetting password for: ${userName}`;
  document.getElementById('reset-new-password').value = '';
  document.getElementById('reset-confirm-password').value = '';
  document.getElementById('reset-password-modal').style.display = 'flex';
}

function closeResetPasswordModal() {
  document.getElementById('reset-password-modal').style.display = 'none';
}

async function submitResetPassword(e) {
  e.preventDefault();

  const userId = document.getElementById('reset-pass-user-id').value;
  const newPass = document.getElementById('reset-new-password').value.trim();
  const confirmPass = document.getElementById('reset-confirm-password').value.trim();

  if (!newPass) {
    alert('Please enter a new password.');
    return;
  }
  if (newPass !== confirmPass) {
    alert('New password and confirm password do not match.');
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/reset_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPass })
    });
    const result = await res.json();
    if (res.ok && result.status === 'success') {
      alert(result.message || 'Password reset successfully!');
      closeResetPasswordModal();
    } else {
      alert(`Error: ${result.message || result.error || 'Failed to reset password.'}`);
    }
  } catch (err) {
    console.error('Error resetting password:', err);
  }
}

async function deleteUser(userId, userName) {
  if (!confirm(`Are you sure you want to permanently delete user "${userName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok && result.status === 'success') {
      alert(result.message || 'User deleted successfully.');
      loadUsers();
    } else {
      alert(`Error: ${result.message || result.error || 'Failed to delete user.'}`);
    }
  } catch (err) {
    console.error('Error deleting user:', err);
  }
}

// --- AUTHENTICATION & PERMISSIONS ENFORCEMENT ---

let currentUser = null;

async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && data.user) {
      currentUser = data.user;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      
      const nameEl = document.getElementById('current-user-fullname');
      const roleEl = document.getElementById('current-role-badge');
      if (nameEl) nameEl.innerText = currentUser.full_name;
      if (roleEl) {
        roleEl.innerText = currentUser.role;
        if (currentUser.role === 'Super Admin') {
          roleEl.style.background = '#FEF3C7';
          roleEl.style.color = '#92400E';
          roleEl.style.border = '1px solid #FCD34D';
        } else {
          roleEl.style.background = '#DBEAFE';
          roleEl.style.color = '#1E40AF';
          roleEl.style.border = '1px solid #93C5FD';
        }
      }

      applyPermissionsToUI(currentUser);

      restoreSidebarState();
      initEventListeners();
      loadDashboard();
      loadExpenseCategories();
      loadFranchisesList();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error('Error checking auth session:', err);
    showLoginScreen();
  }
}

function showLoginScreen() {
  currentUser = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

function quickLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  handleLoginSubmit(new Event('submit'));
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorAlert = document.getElementById('login-error-alert');
  const btn = document.getElementById('login-btn');

  if (!username || !password) {
    if (errorAlert) {
      errorAlert.innerText = 'Please enter both Username/Email and Password.';
      errorAlert.style.display = 'block';
    }
    return;
  }

  if (errorAlert) errorAlert.style.display = 'none';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      checkAuthSession();
    } else {
      if (errorAlert) {
        errorAlert.innerText = data.message || 'Invalid username or password.';
        errorAlert.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    if (errorAlert) {
      errorAlert.innerText = 'Server connection error. Please try again.';
      errorAlert.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    showLoginScreen();
  }
}

function applyPermissionsToUI(user) {
  const isSuperAdmin = user.role === 'Super Admin';
  const perms = user.permissions || {};

  // User Management visibility (Strictly Super Admin only)
  const navUsers = document.getElementById('nav-users');
  if (navUsers) {
    navUsers.style.display = isSuperAdmin ? 'block' : 'none';
  }

  if (isSuperAdmin) {
    // Show all categories & menu items
    document.querySelectorAll('#sidebar .nav-category').forEach(el => el.style.display = 'block');
    document.querySelectorAll('#sidebar .submenu li').forEach(el => el.style.display = 'block');
    return;
  }

  // Module to Sidebar Element IDs Map
  const moduleNavMap = {
    'leads': ['nav-leads', 'nav-plans'],
    'calling': ['nav-calling'],
    'followup': ['nav-followup'],
    'survey': ['nav-survey'],
    'visit': ['nav-visit_expenses'],
    'payments': ['nav-payments', 'nav-token', 'nav-agreement'],
    'expenses': ['nav-expenses'],
    'purchase': ['nav-purchases', 'nav-materials'],
    'gr': ['nav-gr'],
    'training': ['nav-training'],
    'interior': ['nav-interior'],
    'marketing': ['nav-marketing', 'nav-branding', 'nav-influencer', 'nav-operations', 'nav-opening', 'nav-active'],
    'reports': ['nav-reports', 'nav-performance']
  };

  Object.keys(moduleNavMap).forEach(modKey => {
    const modPerm = perms[modKey] || {};
    const canView = !!modPerm.view;
    const navIds = moduleNavMap[modKey];

    navIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = canView ? 'block' : 'none';
      }
    });
  });

  // Hide empty categories
  document.querySelectorAll('#sidebar .nav-category').forEach(cat => {
    const visibleItems = cat.querySelectorAll('.submenu li[style*="display: block"], .submenu li:not([style*="display: none"])');
    cat.style.display = visibleItems.length > 0 ? 'block' : 'none';
  });
}


