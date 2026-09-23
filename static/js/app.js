// Global State Management
let currentRole = 'Admin';
let currentUserPermissions = {};
let activeFranchiseId = null;
let currentProfileTab = 'overview';
let activePage = 'dashboard';
let activeExpenseSubTab = 'entries';
let dashboardData = { franchise_cards: [] };
let expenseCategoriesList = [];
let allFranchisesList = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
  restoreSidebarState();
  initEventListeners();
});

async function checkAuthSession() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app-container');
  if (loginScreen) loginScreen.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';

  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        currentRole = data.user.role || 'Super Admin';
        currentUserPermissions = data.user.permissions || {};
        
        const roleBadge = document.getElementById('current-role-badge');
        if (roleBadge) roleBadge.innerText = currentRole;

        const roleSelect = document.getElementById('topbar-role-select');
        if (roleSelect) roleSelect.value = currentRole;
        
        const userFullname = document.getElementById('current-user-fullname');
        if (userFullname) userFullname.innerText = data.user.full_name || 'Sakshi Shukla';

        const topUserFullname = document.getElementById('top-user-fullname');
        if (topUserFullname) topUserFullname.innerText = data.user.full_name || 'Sakshi Shukla';

        const topUserRole = document.getElementById('top-user-role');
        if (topUserRole) topUserRole.innerText = currentRole;

        const initials = (data.user.full_name || 'Sakshi Shukla').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const topAvatar = document.getElementById('top-avatar-circle');
        if (topAvatar) topAvatar.innerText = initials || 'SS';

        const nameEl = document.getElementById('dash-greeting-title');
        if (nameEl) {
          const firstName = (data.user.full_name || 'Sakshi').split(' ')[0];
          nameEl.innerText = `Good Morning, ${firstName}!`;
        }

        applySidebarPermissions(currentUserPermissions, currentRole);
        loadDashboard();
        return;
      }
    }
  } catch (err) {
    console.error('Session init info:', err);
  }

  currentRole = 'Super Admin';
  loadDashboard();
}

async function handleTestRoleChange(newRole) {
  try {
    const res = await fetch('/api/auth/switch_role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    const data = await res.json();
    if (data.status === 'success' && data.user) {
      currentRole = data.user.role;
      currentUserPermissions = data.user.permissions || {};
      
      const roleBadge = document.getElementById('current-role-badge');
      if (roleBadge) roleBadge.innerText = currentRole;

      const userFullname = document.getElementById('current-user-fullname');
      if (userFullname) userFullname.innerText = data.user.full_name;

      const topUserFullname = document.getElementById('top-user-fullname');
      if (topUserFullname) topUserFullname.innerText = data.user.full_name;

      const topUserRole = document.getElementById('top-user-role');
      if (topUserRole) topUserRole.innerText = currentRole;

      const initials = (data.user.full_name || 'Sakshi Shukla').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const topAvatar = document.getElementById('top-avatar-circle');
      if (topAvatar) topAvatar.innerText = initials || 'SS';

      const roleSelect = document.getElementById('topbar-role-select');
      if (roleSelect) roleSelect.value = currentRole;

      applySidebarPermissions(currentUserPermissions, currentRole);
      switchPage(activePage || 'dashboard');
    }
  } catch (err) {
    console.error('Failed to switch test role:', err);
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  loadDashboard();
}

function applySidebarPermissions(userPermissions, userRole) {
  if (userRole === 'Super Admin') {
    document.querySelectorAll('#sidebar .nav-category, #sidebar li, #sidebar .nav-single-item').forEach(el => {
      el.style.display = '';
    });
    return;
  }

  const navModuleMap = {
    'nav-leads': 'leads',
    'nav-calling': 'calling',
    'nav-followup': 'followup',
    'nav-plans': 'plans',
    'nav-token': 'token',
    'nav-survey': 'survey',
    'nav-agreement': 'agreement',
    'nav-payments': 'payments',
    'nav-visit_expenses': 'visit_expenses',
    'nav-interior': 'interior',
    'nav-branding': 'branding',
    'nav-marketing': 'marketing',
    'nav-training': 'training',
    'nav-operations': 'operations',
    'nav-influencer': 'influencer',
    'nav-opening': 'opening',
    'nav-active': 'active',
    'nav-materials': 'materials',
    'nav-purchases': 'purchases',
    'nav-gr': 'gr',
    'nav-expenses': 'expenses',
    'nav-support': 'support',
    'nav-complaints': 'complaints',
    'nav-audit': 'audit',
    'nav-reports': 'reports',
    'nav-users': 'user_management',
    'nav-permissions': 'user_management'
  };

  const perms = userPermissions || {};

  Object.keys(navModuleMap).forEach(navId => {
    const navEl = document.getElementById(navId);
    if (!navEl) return;
    const modKey = navModuleMap[navId];
    
    let canView = false;
    if (modKey === 'user_management') {
      canView = (userRole === 'Super Admin');
    } else if (perms[modKey]) {
      canView = Boolean(perms[modKey].view || perms[modKey].read);
    } else {
      canView = true;
    }

    navEl.style.display = canView ? '' : 'none';
  });

  document.querySelectorAll('#sidebar .nav-category').forEach(catEl => {
    const visibleItems = catEl.querySelectorAll('ul.submenu li:not([style*="display: none"])');
    catEl.style.display = (visibleItems && visibleItems.length > 0) ? '' : 'none';
  });
}

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
    try {
      const lRes = await fetch('/api/leads');
      allLeadsList = await lRes.json();
    } catch(lErr) { console.error('Error loading leads list:', lErr); }
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

    // Header Greeting & Date
    const nameEl = document.getElementById('dash-greeting-title');
    if (nameEl) {
      const userFullName = data.current_user?.full_name || 'Sakshi Shukla';
      const firstName = userFullName.split(' ')[0] || 'Sakshi';
      nameEl.innerText = `Good Morning, ${firstName}!`;
    }

    const dateEl = document.getElementById('dash-header-date');
    if (dateEl) {
      dateEl.innerText = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // 5 Pastel KPI Card Values
    const setElemText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

    setElemText('kpi-total-leads-val', data.total_leads || 0);
    setElemText('kpi-pending-followups-val', data.pending_followups || 0);
    setElemText('kpi-interested-plans-val', data.interested_plans || 0);
    setElemText('kpi-tokens-received-val', data.tokens_received || 0);
    setElemText('kpi-active-franchises-val', data.active_franchises || 0);

    // KPI Growth Trend Badges
    const g = data.growth_percentages || {};
    setElemText('kpi-lead-trend', `↑ ${g.leads || 0}%`);
    setElemText('kpi-followup-trend', `↑ ${g.followups || 0}%`);
    setElemText('kpi-interested-trend', `↑ ${g.interested || 0}%`);
    setElemText('kpi-tokens-trend', `↑ ${g.tokens || 0}%`);
    setElemText('kpi-franchise-trend', `↑ ${g.franchises || 0}%`);

    // Legacy KPI element fallbacks if present
    setElemText('kpi-total-franchises', data.total_franchises || 0);
    setElemText('kpi-active-franchises', data.active_franchises || 0);
    setElemText('kpi-net-purchase', `Rs. ${(data.net_purchase || 0).toLocaleString('en-IN')}`);
    setElemText('kpi-gr-percent', `${data.gr_percent || 0}%`);
    setElemText('kpi-outstanding', `Rs. ${(data.outstanding || 0).toLocaleString('en-IN')}`);
    setElemText('kpi-company-support', `Rs. ${(data.total_company_support || 0).toLocaleString('en-IN')}`);

    // Render Charts and Widgets
    renderGrowthBarChart(data.growth_chart_data);
    renderLeadSourcesDonut(data.lead_sources, data.total_leads || 0);
    renderFranchiseStatusTable(data.franchise_status_list);
    renderUpcomingTasksList(data.upcoming_tasks);
    renderRecentActivityFeed(data.recent_activities);

    if (data.franchise_cards) {
      renderFranchiseCards(data.franchise_cards);
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderGrowthBarChart(chartData) {
  const container = document.getElementById('cora-growth-bar-chart');
  if (!container) return;
  if (!chartData || chartData.length === 0) {
    container.innerHTML = `<div style="width:100%; text-align:center; color:#94A3B8; font-size:0.8rem;">No historical trend data available.</div>`;
    return;
  }

  const maxVal = Math.max(...chartData.flatMap(d => [d.leads || 0, d.interested || 0, d.tokens || 0, d.franchises || 0]), 15);

  container.innerHTML = chartData.map(d => {
    const hLeads = Math.max(10, Math.round(((d.leads || 0) / maxVal) * 140));
    const hInterested = Math.max(10, Math.round(((d.interested || 0) / maxVal) * 140));
    const hTokens = Math.max(10, Math.round(((d.tokens || 0) / maxVal) * 140));
    const hFranchises = Math.max(10, Math.round(((d.franchises || 0) / maxVal) * 140));

    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1;">
        <div style="display: flex; align-items: flex-end; gap: 4px; height: 150px;">
          <div style="width: 8px; height: ${hLeads}px; background: #2563EB; border-radius: 4px 4px 0 0;" title="Leads: ${d.leads}"></div>
          <div style="width: 8px; height: ${hInterested}px; background: #8B5CF6; border-radius: 4px 4px 0 0;" title="Interested: ${d.interested}"></div>
          <div style="width: 8px; height: ${hTokens}px; background: #10B981; border-radius: 4px 4px 0 0;" title="Tokens: ${d.tokens}"></div>
          <div style="width: 8px; height: ${hFranchises}px; background: #F59E0B; border-radius: 4px 4px 0 0;" title="Franchises: ${d.franchises}"></div>
        </div>
        <span style="font-size: 0.75rem; font-weight: 600; color: #64748B;">${d.month}</span>
      </div>
    `;
  }).join('');
}

function renderLeadSourcesDonut(sources, totalLeads) {
  const donutBox = document.getElementById('cora-donut-chart-box');
  const sourcesList = document.getElementById('cora-lead-sources-list');
  if (!donutBox || !sourcesList) return;

  if (!sources || sources.length === 0) {
    donutBox.innerHTML = '';
    sourcesList.innerHTML = `<div style="color:#94A3B8; font-size:0.8rem;">No lead sources recorded.</div>`;
    return;
  }

  let cumulativePct = 0;
  const donutSegments = sources.map(s => {
    const pct = s.percentage || 0;
    const strokeDasharray = `${pct} ${100 - pct}`;
    const strokeDashoffset = 100 - cumulativePct;
    cumulativePct += pct;
    return `<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="${s.color}" stroke-width="3.8" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"></circle>`;
  }).join('');

  donutBox.innerHTML = `
    <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#F1F5F9" stroke-width="3.8"></circle>
      ${donutSegments}
    </svg>
    <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
      <span style="font-size: 1.2rem; font-weight: 800; color: #0F172A; line-height: 1;">${totalLeads}</span>
      <span style="font-size: 0.62rem; color: #64748B; font-weight: 600; margin-top: 2px;">Total Leads</span>
    </div>
  `;

  sourcesList.innerHTML = sources.map(s => `
    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${s.color}; flex-shrink: 0;"></span>
        <span style="color: #475569; font-weight: 500;">${s.name}</span>
      </div>
      <span style="font-weight: 700; color: #0F172A;">${s.percentage}%</span>
    </div>
  `).join('');
}

function renderFranchiseStatusTable(statusList) {
  const tbody = document.getElementById('cora-franchise-status-tbody');
  if (!tbody) return;

  if (!statusList || statusList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 16px; color: #94A3B8;">No franchise records available.</td></tr>`;
    return;
  }

  const defaultThumb = "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=100&q=80";

  tbody.innerHTML = statusList.slice(0, 5).map(f => {
    const sLower = (f.status || 'active').toLowerCase();
    let bg = '#DCFCE7', fg = '#16A34A'; // Active
    if (sLower.includes('setup') || sLower.includes('progress')) { bg = '#FEF3C7'; fg = '#D97706'; }
    else if (sLower.includes('pending') || sLower.includes('review')) { bg = '#FEE2E2'; fg = '#DC2626'; }

    return `
      <tr onclick="openExploreFranchise(${f.id})" style="border-bottom: 1px solid #F1F5F9; cursor: pointer;" title="Click to view full franchise profile">
        <td style="padding: 10px 6px; display: flex; align-items: center; gap: 8px;">
          <img src="${defaultThumb}" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover;">
          <span style="font-weight: 600; color: #0F172A;">${f.name}</span>
        </td>
        <td style="padding: 10px 6px; color: #475569;">${f.city || 'Store'}</td>
        <td style="padding: 10px 6px;">
          <span style="background: ${bg}; color: ${fg}; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">${f.status}</span>
        </td>
        <td style="padding: 10px 6px; color: #64748B;">${f.next_followup}</td>
      </tr>
    `;
  }).join('');
}

function renderUpcomingTasksList(tasks) {
  const list = document.getElementById('cora-upcoming-tasks-list');
  if (!list) return;

  if (!tasks || tasks.length === 0) {
    list.innerHTML = `<div style="text-align: center; padding: 16px; color: #94A3B8; font-size: 0.8rem;">No pending tasks scheduled.</div>`;
    return;
  }

  list.innerHTML = tasks.map(t => `
    <div style="display: flex; align-items: flex-start; gap: 10px;">
      <input type="checkbox" ${t.completed ? 'checked' : ''} style="margin-top: 3px; cursor: pointer; accent-color: #2563EB;">
      <div style="flex-grow: 1;">
        <div style="font-size: 0.82rem; font-weight: 600; color: ${t.completed ? '#94A3B8' : '#0F172A'}; ${t.completed ? 'text-decoration: line-through;' : ''}">
          <a href="javascript:void(0)" onclick="switchPage('${t.link_page || 'followup'}')" style="color: inherit; text-decoration: none;">${t.title}</a>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 0.72rem; color: #64748B;">
          <span style="background: #F1F5F9; color: #475569; padding: 1px 6px; border-radius: 4px; font-weight: 600;">${t.module}</span>
          <span>${t.due_text}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderRecentActivityFeed(activities) {
  const feed = document.getElementById('cora-recent-activity-feed');
  if (!feed) return;

  if (!activities || activities.length === 0) {
    feed.innerHTML = `<div style="text-align: center; padding: 16px; color: #94A3B8; font-size: 0.8rem;">No recent system activity.</div>`;
    return;
  }

  feed.innerHTML = activities.map(act => `
    <div style="display: flex; align-items: flex-start; gap: 10px;">
      <div style="width: 28px; height: 28px; border-radius: 50%; background: ${act.bg_color}; color: ${act.icon_color}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; margin-top: 2px;">
        <i class="fa-solid ${act.icon}"></i>
      </div>
      <div style="flex-grow: 1;">
        <div style="font-size: 0.8rem; font-weight: 600; color: #0F172A;">${act.title}</div>
        <div style="font-size: 0.72rem; color: #64748B;">${act.person} ${act.remarks ? '&bull; ' + act.remarks.substring(0, 30) : ''}</div>
      </div>
      <span style="font-size: 0.68rem; color: #94A3B8; white-space: nowrap;">${act.time_ago}</span>
    </div>
  `).join('');
}

function openNewLeadModal() {
  switchPage('leads');
  setTimeout(() => {
    if (typeof openLeadModal === 'function') {
      openLeadModal();
    } else {
      const modal = document.getElementById('lead-modal-overlay');
      if (modal) modal.style.display = 'flex';
    }
  }, 100);
}

function renderFranchiseCards(cards) {
  const grid = document.getElementById('franchise-cards-grid');
  if (!grid) return;

  if (!cards || cards.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 24px 20px; background: #FFFFFF; border-radius: 10px; border: 1px dashed #CBD5E1; margin-top: 4px;">
        <i class="fa-solid fa-store" style="font-size: 1.5rem; color: #94A3B8; margin-bottom: 6px;"></i>
        <h4 style="color: #0F172A; margin: 0 0 4px; font-weight: 700; font-size: 0.92rem;">No Franchises Found</h4>
        <p style="color: #64748B; margin: 0 0 12px; font-size: 0.8rem;">Click below to add a new franchise workspace.</p>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button class="btn-add-franchise" onclick="openNewFranchiseModal()" style="height: 30px; font-size: 0.78rem; padding: 0 14px;">
            <i class="fa-solid fa-plus"></i> Add Franchise
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
    'complaints': 'Franchise Complaints & Issues Module',
    'audit': 'System Audit History Log',
    'users': 'User Management & Access Control',
    'permissions': 'User Roles & Access Control',
    'health': 'Data Health & System Persistence Status',
    'sheets': 'Google Sheets Integration & Synchronization'
  };

  titleEl.innerText = titles[pageId] || 'Module Workspace';
  descEl.innerText = `Dedicated separate working page for managing ${titles[pageId] || pageId}.`;

  if (pageId === 'leads') {
    renderLeadsWorkspace(contentEl);
  } else if (pageId === 'survey') {
    renderSurveyWorkspace(contentEl);
  } else if (pageId === 'agreement') {
    renderAgreementWorkspace(contentEl);
  } else if (pageId === 'interior') {
    renderInteriorWorkspace(contentEl);
  } else if (pageId === 'health') {
    renderHealthWorkspace(contentEl);
  } else if (pageId === 'sheets') {
    renderGoogleSheetsWorkspace(contentEl);
  } else if (pageId === 'expenses') {
    renderExpensesWorkspace(contentEl);
  } else if (pageId === 'visit_expenses') {
    renderVisitExpensesWorkspace(contentEl);
  } else if (pageId === 'complaints') {
    renderComplaintsWorkspace(contentEl);
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

// --- LEADS & PRE-FRANCHISE INQUIRY WORKSPACE ---

let allLeadsList = [];

async function renderLeadsWorkspace(containerEl) {
  containerEl.innerHTML = `
    <!-- Top Stats / KPI Cards for Leads -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #64748B; text-transform: uppercase;">Total Inquiries</div>
        <div id="lead-kpi-total" style="font-size: 1.5rem; font-weight: 800; color: #0F172A; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Pre-Franchise Leads</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #D97706; text-transform: uppercase;">Follow-ups Pending</div>
        <div id="lead-kpi-followup" style="font-size: 1.5rem; font-weight: 800; color: #D97706; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Active Discussions</div>
      </div>
      <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #059669; text-transform: uppercase;">Token Received (₹25k)</div>
        <div id="lead-kpi-token" style="font-size: 1.5rem; font-weight: 800; color: #059669; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #047857; margin-top: 2px;">Ready for Conversion</div>
      </div>
      <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #2563EB; text-transform: uppercase;">Converted Franchises</div>
        <div id="lead-kpi-converted" style="font-size: 1.5rem; font-weight: 800; color: #2563EB; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #1D4ED8; margin-top: 2px;">Transferred to Master</div>
      </div>
    </div>

    <!-- Filters & Action Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 10px;">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; flex: 1;">
        <div style="position: relative; min-width: 220px;">
          <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.85rem;"></i>
          <input type="text" id="leads-search-input" placeholder="Search Customer, Mobile, City..." oninput="filterLeadsTable()" style="padding: 7px 10px 7px 32px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; width: 100%;">
        </div>

        <select id="leads-filter-status" onchange="filterLeadsTable()" style="padding: 7px 10px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; background: #FFFFFF; font-weight: 500;">
          <option value="ALL">All Statuses</option>
          <option value="New">New</option>
          <option value="Calling Pending">Calling Pending</option>
          <option value="Connected">Connected</option>
          <option value="Interested">Interested</option>
          <option value="Not Interested">Not Interested</option>
          <option value="Follow-up">Follow-up</option>
          <option value="Token Pending">Token Pending</option>
          <option value="Token Received">Token Received (Ready for Conversion)</option>
          <option value="Converted to Franchise">Converted to Franchise</option>
          <option value="Lost">Lost</option>
        </select>

        <select id="leads-filter-plan" onchange="filterLeadsTable()" style="padding: 7px 10px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; background: #FFFFFF; font-weight: 500;">
          <option value="ALL">All Plans</option>
          <option value="Plan A">Plan A</option>
          <option value="Plan B">Plan B</option>
          <option value="Plan C">Plan C</option>
        </select>

        <select id="leads-filter-executive" onchange="filterLeadsTable()" style="padding: 7px 10px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; background: #FFFFFF; font-weight: 500;">
          <option value="ALL">All Executives</option>
        </select>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="openBatchImportModal('leads')" style="background: #0284C7; color: #FFFFFF; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-file-import"></i> Auto-Import Excel/PDF
        </button>
        <button onclick="openLeadModal()" style="background: #2563EB; color: #FFFFFF; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-user-plus"></i> + Add Pre-Franchise Inquiry
        </button>
      </div>
    </div>

    <!-- Leads Table Container -->
    <div style="overflow-x: auto; border: 1px solid #E2E8F0; border-radius: 10px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.83rem;">
        <thead>
          <tr style="background: #F8FAFC; text-align: left; color: #475569; border-bottom: 1px solid #E2E8F0;">
            <th style="padding: 11px 14px;"># ID</th>
            <th style="padding: 11px 14px;">Inquiry Date</th>
            <th style="padding: 11px 14px;">Customer & Mobile</th>
            <th style="padding: 11px 14px;">City & Location</th>
            <th style="padding: 11px 14px;">Plan & Investment</th>
            <th style="padding: 11px 14px;">Assigned Executive</th>
            <th style="padding: 11px 14px;">Lead Status</th>
            <th style="padding: 11px 14px;">Next Follow-up</th>
            <th style="padding: 11px 14px; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody id="leads-table-body">
          <tr><td colspan="9" style="padding: 25px; text-align: center; color: #64748B;">Loading pre-franchise inquiry records...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  await loadLeadsData();
}

async function loadLeadsData() {
  try {
    const res = await fetch('/api/leads');
    allLeadsList = await res.json();
    populateExecutiveFilter();
    updateLeadKPIs();
    renderLeadsRows(allLeadsList);
  } catch (err) {
    console.error("Error loading leads:", err);
  }
}

function updateLeadKPIs() {
  const total = allLeadsList.length;
  const followup = allLeadsList.filter(l => l.status === 'Follow-up' || l.status === 'Calling Pending' || l.status === 'Connected').length;
  const tokenRec = allLeadsList.filter(l => l.status === 'Token Received').length;
  const converted = allLeadsList.filter(l => l.status === 'Converted to Franchise').length;

  if (document.getElementById('lead-kpi-total')) document.getElementById('lead-kpi-total').innerText = total;
  if (document.getElementById('lead-kpi-followup')) document.getElementById('lead-kpi-followup').innerText = followup;
  if (document.getElementById('lead-kpi-token')) document.getElementById('lead-kpi-token').innerText = tokenRec;
  if (document.getElementById('lead-kpi-converted')) document.getElementById('lead-kpi-converted').innerText = converted;
}

async function populateExecutiveFilter() {
  const execSelect = document.getElementById('leads-filter-executive');
  if (!execSelect) return;
  try {
    const res = await fetch('/api/executives');
    const execs = await res.json();
    let html = '<option value="ALL">All Executives</option>';
    if (Array.isArray(execs)) {
      execs.forEach(e => {
        if (e) html += `<option value="${e}">${e}</option>`;
      });
    }
    execSelect.innerHTML = html;
  } catch (err) {
    console.error("Error populating executive filter:", err);
  }
}

function filterLeadsTable() {
  const search = (document.getElementById('leads-search-input')?.value || '').toLowerCase();
  const status = document.getElementById('leads-filter-status')?.value || 'ALL';
  const plan = document.getElementById('leads-filter-plan')?.value || 'ALL';
  const exec = document.getElementById('leads-filter-executive')?.value || 'ALL';

  const filtered = allLeadsList.filter(l => {
    const matchSearch = !search || 
      (l.customer_name && l.customer_name.toLowerCase().includes(search)) ||
      (l.mobile && l.mobile.toLowerCase().includes(search)) ||
      (l.city && l.city.toLowerCase().includes(search)) ||
      (l.assigned_person && l.assigned_person.toLowerCase().includes(search));
    const matchStatus = status === 'ALL' || l.status === status;
    const matchPlan = plan === 'ALL' || l.plan_discussed === plan;
    const matchExec = exec === 'ALL' || l.assigned_person === exec;
    return matchSearch && matchStatus && matchPlan && matchExec;
  });

  renderLeadsRows(filtered);
}

function getLeadStatusBadge(status) {
  const styles = {
    'New': 'background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1;',
    'Calling Pending': 'background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A;',
    'Connected': 'background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;',
    'Interested': 'background: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0;',
    'Not Interested': 'background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;',
    'Follow-up': 'background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;',
    'Token Pending': 'background: #FFF7ED; color: #C2410C; border: 1px solid #FFEDD5;',
    'Token Received': 'background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; font-weight: 700;',
    'Converted to Franchise': 'background: #2563EB; color: #FFFFFF; font-weight: 700;',
    'Lost': 'background: #F3F4F6; color: #6B7280; border: 1px solid #D1D5DB;'
  };
  const style = styles[status] || 'background: #F1F5F9; color: #334155;';
  return `<span style="padding: 4px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; display: inline-block; ${style}">${status || 'New'}</span>`;
}

function renderLeadsRows(leads) {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  if (!leads || leads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding: 25px; text-align: center; color: #64748B;">No pre-franchise inquiry records found. Click "+ Add Pre-Franchise Inquiry" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(l => {
    const isConverted = l.status === 'Converted' || l.status === 'Converted to Franchise';
    const leadJson = JSON.stringify(l).replace(/'/g, "&apos;");

    return `
      <tr style="border-bottom: 1px solid #F1F5F9;">
        <td style="padding: 10px 14px; font-weight: 700; color: #64748B;">#${l.id}</td>
        <td style="padding: 10px 14px; color: #334155;">${l.inquiry_date || '-'}</td>
        <td style="padding: 10px 14px;">
          <div style="font-weight: 700; color: #0F172A;">${l.customer_name || 'Customer'}</div>
          <div style="font-size: 0.78rem; color: #64748B;"><i class="fa-solid fa-phone" style="font-size: 0.7rem; color: #2563EB;"></i> ${l.mobile || '-'}</div>
        </td>
        <td style="padding: 10px 14px; color: #334155;">
          <div style="font-weight: 600;">${l.city || '-'}</div>
          <div style="font-size: 0.75rem; color: #64748B;">${l.location || l.state || ''}</div>
        </td>
        <td style="padding: 10px 14px;">
          <span style="font-weight: 600; color: #2563EB;">${l.plan_discussed || 'Plan A'}</span>
          <div style="font-size: 0.75rem; color: #64748B;">Cap: ${l.investment_capacity || '-'}</div>
        </td>
        <td style="padding: 10px 14px; color: #334155; font-weight: 500;">${l.assigned_person || '-'}</td>
        <td style="padding: 10px 14px;">${getLeadStatusBadge(l.status)}</td>
        <td style="padding: 10px 14px; color: #D97706; font-weight: 600;">${l.followup_date || '-'}</td>
        <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
          ${!isConverted ? `
            <button onclick="openLeadConversionModal(${l.id})" style="background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; margin-right: 4px;" title="Convert to Official Franchise Profile">
              <i class="fa-solid fa-store"></i> Convert to Franchise
            </button>
          ` : `
            <span style="font-size: 0.75rem; color: #2563EB; font-weight: 700; margin-right: 4px;"><i class="fa-solid fa-circle-check"></i> Converted</span>
          `}
          <button onclick='openLeadModal(${leadJson})' style="background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; margin-right: 4px;">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button onclick="deleteLead(${l.id})" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FCA5A5; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- INDIAN STATES & CITIES DATA DICTIONARY ---

const INDIA_STATE_CITIES = {
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Junagadh", "Anand", "Navsari", "Morbi", "Nadiad", "Surendranagar", "Bharuch", "Mehsana", "Porbandar", "Vapi", "Other City"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Chhatrapati Sambhajinagar (Aurangabad)", "Solapur", "Amravati", "Navi Mumbai", "Kolhapur", "Sangli", "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", "Ichalkaranji", "Jalna", "Palghar", "Nanded", "Other City"],
  "Delhi": ["New Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi", "Central Delhi", "Noida (NCR)", "Gurugram (NCR)", "Faridabad (NCR)", "Ghaziabad (NCR)", "Greater Noida (NCR)", "Other City"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer", "Bhilwara", "Alwar", "Sikar", "Sri Ganganagar", "Pali", "Chittorgarh", "Tonk", "Kishangarh", "Beawar", "Jhunjhunu", "Other City"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Meerut", "Prayagraj (Allahabad)", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Noida", "Ghaziabad", "Jhansi", "Muzaffarnagar", "Mathura", "Firozabad", "Rampur", "Shahjahanpur", "Ayodhya", "Farrukhabad", "Other City"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa", "Murwara (Katni)", "Singrauli", "Burhanpur", "Khandwa", "Bhind", "Chhindwara", "Guna", "Shivpuri", "Vidisha", "Chhatarpur", "Damoh", "Mandsaur", "Other City"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Hoshiarpur", "Batala", "Pathankot", "Moga", "Abohar", "Khanna", "Phagwara", "Muktsar", "Barnala", "Firozpur", "Kapurthala", "Sangrur", "Other City"],
  "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal", "Sonipat", "Panchkula", "Bhiwani", "Sirsa", "Bahadurgarh", "Jind", "Thanesar", "Kaithal", "Rewari", "Palwal", "Other City"],
  "Karnataka": ["Bengaluru", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi", "Kalaburagi (Gulbarga)", "Davanagere", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Raichur", "Bidar", "Hosapete", "Hassan", "Gadag", "Udupi", "Other City"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tiruppur", "Erode", "Vellore", "Tirunelveli", "Thoothukudi", "Nagercoil", "Thanjavur", "Dindigul", "Cuddalore", "Kanchipuram", "Ranipet", "Karur", "Other City"],
  "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Baharampur", "Habra", "Kharagpur", "Shantipur", "Dankuni", "Dhulian", "Ranaghat", "Haldia", "Raiganj", "Krishnanagar", "Nabadwip", "Midnapore", "Other City"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet", "Siddipet", "Miryalaguda", "Jagtial", "Other City"],
  "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia", "Darbhanga", "Bihar Sharif", "Arrah", "Begusarai", "Katihar", "Munger", "Chhapra", "Danapur", "Bettiah", "Saharsa", "Sasaram", "Hajipur", "Dehri", "Siwan", "Motihari", "Nawada", "Other City"],
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Kakinada", "Rajamahendravaram", "Kadapa", "Tirupati", "Anantapur", "Vizianagaram", "Eluru", "Nandyal", "Ongole", "Adoni", "Machilipatnam", "Tenali", "Proddatur", "Chittoor", "Hindupur", "Other City"],
  "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur", "Kannur", "Alappuzha", "Kottayam", "Palakkad", "Manjeri", "Thalassery", "Ponnani", "Vatakara", "Kanhangad", "Payyanur", "Koyilandy", "Other City"],
  "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Bhadrak", "Baripada", "Jharsuguda", "Jeypore", "Bargarh", "Rayagada", "Other City"],
  "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon", "Dhubri", "Diphu", "North Lakhimpur", "Karimganj", "Sivasagar", "Goalpara", "Other City"],
  "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar", "Phusro", "Hazaribagh", "Giridih", "Ramgarh", "Medininagar (Daltonganj)", "Chirkunda", "Other City"],
  "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Rajnandgaon", "Raigarh", "Jagdalpur", "Ambikapur", "Dhamtari", "Chirmiri", "Bhatapara", "Other City"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Kashipur", "Rishikesh", "Other City"],
  "Himachal Pradesh": ["Shimla", "Mandi", "Solan", "Dharamshala", "Baddi", "Kullu", "Hamirpur", "Other City"],
  "Jammu & Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Kathua", "Udhampur", "Sopore", "Other City"],
  "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Other City"],
  "Other State": ["Other City"]
};

function handleLeadStateChange(stateVal, selectedCity = '') {
  const citySel = document.getElementById('lead-city');
  const customInput = document.getElementById('lead-custom-city');
  if (!citySel) return;

  const cities = INDIA_STATE_CITIES[stateVal] || ["Other City"];
  let html = '<option value="" disabled>-- Select City --</option>';
  cities.forEach(c => {
    html += `<option value="${c}">${c}</option>`;
  });
  citySel.innerHTML = html;

  if (selectedCity && cities.includes(selectedCity)) {
    citySel.value = selectedCity;
    if (customInput) customInput.style.display = 'none';
  } else if (selectedCity) {
    citySel.value = "Other City";
    if (customInput) {
      customInput.style.display = 'block';
      customInput.value = selectedCity;
    }
  } else {
    if (cities.length > 0) citySel.selectedIndex = 1;
    if (customInput) customInput.style.display = 'none';
  }
}

function handleLeadCityChange(cityVal) {
  const customInput = document.getElementById('lead-custom-city');
  if (!customInput) return;
  if (cityVal === 'Other City') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

let callerModalContext = null;

function openLeadModalFromCaller() {
  callerModalContext = 'universal';
  const univModal = document.getElementById('universal-entry-modal');
  if (univModal) univModal.style.display = 'none';
  openLeadModal();
}

function openLeadModalFromAddFranchise() {
  callerModalContext = 'addFranchise';
  const addFModal = document.getElementById('add-franchise-modal');
  if (addFModal) addFModal.style.display = 'none';
  openLeadModal();
}

function openLeadModal(leadData = null) {
  const modal = document.getElementById('lead-inquiry-modal');
  if (!modal) return;

  const titleEl = document.getElementById('lead-modal-title');
  if (titleEl) {
    titleEl.innerText = leadData ? `Edit Pre-Franchise Inquiry (#${leadData.id})` : 'Pre-Franchise Inquiry Record';
  }

  document.getElementById('lead-id').value = leadData ? leadData.id : '';
  document.getElementById('lead-customer-name').value = leadData ? (leadData.customer_name || '') : '';
  document.getElementById('lead-mobile').value = leadData ? (leadData.mobile || '') : '';
  document.getElementById('lead-email').value = leadData ? (leadData.email || '') : '';

  const stateVal = leadData ? (leadData.state || 'Gujarat') : 'Gujarat';
  const cityVal = leadData ? (leadData.city || '') : '';
  const stateEl = document.getElementById('lead-state');
  if (stateEl) {
    stateEl.value = stateVal;
    handleLeadStateChange(stateVal, cityVal);
  }

  document.getElementById('lead-location').value = leadData ? (leadData.location || '') : '';
  document.getElementById('lead-source').value = leadData ? (leadData.source || 'Direct Call') : 'Direct Call';
  document.getElementById('lead-inquiry-date').value = leadData ? (leadData.inquiry_date || (new Date()).toISOString().split('T')[0]) : (new Date()).toISOString().split('T')[0];
  document.getElementById('lead-assigned-person').value = leadData ? (leadData.assigned_person || 'Rajesh Kumar') : 'Rajesh Kumar';
  document.getElementById('lead-existing-business').value = leadData ? (leadData.existing_business || '') : '';
  document.getElementById('lead-interested-plan').value = leadData ? (leadData.plan_discussed || 'Plan A') : 'Plan A';
  document.getElementById('lead-investment-capacity').value = leadData ? (leadData.investment_capacity || '') : '';
  document.getElementById('lead-shop-availability').value = leadData ? (leadData.shop_availability || 'Available & Ready') : 'Available & Ready';
  document.getElementById('lead-status').value = leadData ? (leadData.status || 'New') : 'New';
  document.getElementById('lead-location-details').value = leadData ? (leadData.location_details || '') : '';
  document.getElementById('lead-requirements').value = leadData ? (leadData.requirements || '') : '';
  document.getElementById('lead-objections').value = leadData ? (leadData.objections || '') : '';
  document.getElementById('lead-followup-date').value = leadData ? (leadData.followup_date || '') : '';
  document.getElementById('lead-remarks').value = leadData ? (leadData.remarks || '') : '';

  modal.style.display = 'flex';
}

function closeLeadModal() {
  const modal = document.getElementById('lead-inquiry-modal');
  if (modal) modal.style.display = 'none';
}

async function handleLeadFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('lead-id').value;

  let cityVal = document.getElementById('lead-city')?.value || '';
  if (cityVal === 'Other City') {
    cityVal = document.getElementById('lead-custom-city')?.value || 'Other City';
  }

  const payload = {
    customer_name: document.getElementById('lead-customer-name').value,
    mobile: document.getElementById('lead-mobile').value,
    email: document.getElementById('lead-email').value,
    city: cityVal,
    state: document.getElementById('lead-state').value,
    location: document.getElementById('lead-location').value,
    source: document.getElementById('lead-source').value,
    inquiry_date: document.getElementById('lead-inquiry-date').value,
    assigned_person: document.getElementById('lead-assigned-person').value,
    existing_business: document.getElementById('lead-existing-business').value,
    plan_discussed: document.getElementById('lead-interested-plan').value,
    investment_capacity: document.getElementById('lead-investment-capacity').value,
    shop_availability: document.getElementById('lead-shop-availability').value,
    status: document.getElementById('lead-status').value,
    location_details: document.getElementById('lead-location-details').value,
    requirements: document.getElementById('lead-requirements').value,
    objections: document.getElementById('lead-objections').value,
    followup_date: document.getElementById('lead-followup-date').value,
    remarks: document.getElementById('lead-remarks').value
  };

  try {
    const url = id ? `/api/leads/${id}` : '/api/leads';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeLeadModal();
      await loadLeadsData();

      if (callerModalContext === 'universal') {
        callerModalContext = null;
        const moduleKey = document.getElementById('entry-module-key')?.value || 'calling';
        openUniversalEntryModal(moduleKey, null, data.lead ? data.lead.id : null);
      } else if (callerModalContext === 'addFranchise') {
        callerModalContext = null;
        openNewFranchiseModal(data.lead ? data.lead.id : null);
      }
    } else {
      alert(data.message || 'Failed to save lead inquiry record.');
    }
  } catch (err) {
    console.error(err);
    alert('Error saving lead inquiry.');
  }
}

function openLeadConversionModal(leadId) {
  const lead = allLeadsList.find(l => l.id === leadId);
  if (!lead) return;

  const modal = document.getElementById('lead-conversion-modal');
  if (!modal) return;

  document.getElementById('convert-lead-id').value = lead.id;
  document.getElementById('convert-customer-name').value = `${lead.customer_name} (${lead.mobile} - ${lead.city})`;
  const randomCode = `FR-${Math.floor(1000 + Math.random() * 9000)}`;
  document.getElementById('convert-franchise-code').value = randomCode;
  document.getElementById('convert-plan-name').value = lead.plan_discussed || 'Plan A';
  document.getElementById('convert-agreed-amount').value = 500000;
  document.getElementById('convert-token-amount').value = 25000;

  modal.style.display = 'flex';
}

function closeLeadConversionModal() {
  const modal = document.getElementById('lead-conversion-modal');
  if (modal) modal.style.display = 'none';
}

async function handleLeadConversionSubmit(e) {
  e.preventDefault();
  const leadId = document.getElementById('convert-lead-id').value;
  const payload = {
    code: document.getElementById('convert-franchise-code').value,
    plan_name: document.getElementById('convert-plan-name').value,
    agreed_amount: parseFloat(document.getElementById('convert-agreed-amount').value || 500000),
    token_amount: parseFloat(document.getElementById('convert-token-amount').value || 25000)
  };

  try {
    const res = await fetch(`/api/leads/${leadId}/convert_to_franchise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert(`Success! Lead converted to Franchise (${data.franchise.code} - ${data.franchise.name}).`);
      closeLeadConversionModal();
      await loadFranchisesList();
      await loadLeadsData();
    } else {
      alert(data.message || 'Conversion failed.');
    }
  } catch (err) {
    console.error(err);
    alert('Error converting lead to franchise.');
  }
}

async function deleteLead(leadId) {
  if (!confirm(`Are you sure you want to delete Pre-Franchise Lead #${leadId}?`)) return;
  try {
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.status === 'success') {
      loadLeadsData();
    } else {
      alert(data.message || 'Failed to delete lead.');
    }
  } catch (err) {
    console.error(err);
    alert('Error deleting lead.');
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
  } else if (tab === 'survey' || tab === 'site_visit') {
    renderProfileSurveyTab(container, data);
  } else if (tab === 'documents' || tab === 'agreements') {
    renderProfileDocumentsTab(container, data);
  } else if (tab === 'interior' || tab === 'interior_setup') {
    renderProfileInteriorTab(container, data);
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
  },
  'audit': {
    title: 'System Audit Log',
    f1_label: 'Module / Stage', f1_prop: 'stage_name',
    f2_label: 'Performed By', f2_prop: 'performed_by',
    f3_label: 'Action & Remarks', f3_prop: 'remarks',
    endpoint: '/api/audit_logs'
  },
  'performance': {
    title: 'Performance Metric',
    f1_label: 'Store / Unit', f1_prop: 'name',
    f2_label: 'POS Status', f2_prop: 'pos_status',
    f3_label: 'Audit Score (%)', f3_prop: 'checklist_score',
    endpoint: '/api/operations'
  }
};

function populateFranchiseSelect(selectId, selectedVal) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  let optionsHtml = '';
  
  // Group 1: Pre-Franchise Inquiry Leads
  if (allLeadsList && allLeadsList.length > 0) {
    optionsHtml += '<optgroup label="-- PRE-FRANCHISE INQUIRY LEADS (CUSTOMERS) --">';
    allLeadsList.forEach(l => {
      const valStr = `LEAD_${l.id}`;
      const isSel = (selectedVal === valStr || selectedVal == l.id || selectedVal === `LEAD_${l.id}`);
      optionsHtml += `<option value="LEAD_${l.id}" ${isSel ? 'selected' : ''}>[Lead #${l.id}] ${l.customer_name} (${l.mobile} - ${l.city || 'No City'})</option>`;
    });
    optionsHtml += '</optgroup>';
  }

  // Group 2: Active Franchises
  if (allFranchisesList && allFranchisesList.length > 0) {
    optionsHtml += '<optgroup label="-- OFFICIAL FRANCHISE STORES --">';
    allFranchisesList.forEach(f => {
      const valStr = `FRAN_${f.id}`;
      const isSel = (selectedVal === valStr || selectedVal == f.id || selectedVal === `FRAN_${f.id}`);
      optionsHtml += `<option value="FRAN_${f.id}" ${isSel ? 'selected' : ''}>[Franchise] ${f.name} (${f.code}) - ${f.city}</option>`;
    });
    optionsHtml += '</optgroup>';
  }

  if (!optionsHtml) {
    optionsHtml = '<option value="">No leads or franchises available</option>';
  }

  sel.innerHTML = optionsHtml;
}

function openUniversalEntryModal(moduleKey, entryData = null, autoSelectLeadId = null) {
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

  const btnAddLead = document.getElementById('btn-modal-add-lead');
  const labelFranchise = document.getElementById('entry-franchise-label');
  if (['calling', 'followup', 'token', 'plans', 'leads', 'survey', 'agreement'].includes(moduleKey)) {
    if (btnAddLead) btnAddLead.style.display = 'inline-flex';
    if (labelFranchise) labelFranchise.innerHTML = 'Customer / Pre-Franchise Lead <span style="color: red;">*</span>';
  } else {
    if (btnAddLead) btnAddLead.style.display = 'none';
    if (labelFranchise) labelFranchise.innerHTML = 'Franchise Store <span style="color: red;">*</span>';
  }

  let selVal = entryData ? (entryData.franchise_id ? `FRAN_${entryData.franchise_id}` : (entryData.lead_id ? `LEAD_${entryData.lead_id}` : null)) : null;
  if (!selVal && autoSelectLeadId) {
    selVal = `LEAD_${autoSelectLeadId}`;
  } else if (!selVal && activeFranchiseId) {
    selVal = `FRAN_${activeFranchiseId}`;
  }

  populateFranchiseSelect('entry-franchise-id', selVal);

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

  const selectedTargetVal = document.getElementById('entry-franchise-id').value;
  let franchiseId = null;
  let leadId = null;
  let customerName = '';

  if (selectedTargetVal.startsWith('LEAD_')) {
    leadId = parseInt(selectedTargetVal.replace('LEAD_', ''));
    const matchedLead = allLeadsList.find(l => l.id === leadId);
    if (matchedLead) customerName = matchedLead.customer_name;
  } else if (selectedTargetVal.startsWith('FRAN_')) {
    franchiseId = parseInt(selectedTargetVal.replace('FRAN_', ''));
    const matchedFranchise = allFranchisesList.find(f => f.id === franchiseId);
    if (matchedFranchise) customerName = matchedFranchise.owner_name;
  } else if (selectedTargetVal) {
    franchiseId = parseInt(selectedTargetVal);
  }

  const person = document.getElementById('entry-person').value;
  const dateVal = document.getElementById('entry-date').value;
  const val1 = document.getElementById('entry-field-1').value;
  const val2 = document.getElementById('entry-field-2').value;
  const val3 = document.getElementById('entry-field-3').value;
  const status = document.getElementById('entry-status').value;
  const remarks = document.getElementById('entry-remarks').value;

  const jsonPayload = {
    franchise_id: franchiseId,
    lead_id: leadId,
    customer_name: customerName,
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

let genericModuleDataStore = {};

async function populateGenericExecutiveFilter(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  try {
    const res = await fetch('/api/executives');
    const execs = await res.json();
    let html = '<option value="ALL">All Executives</option>';
    if (Array.isArray(execs)) {
      execs.forEach(e => {
        if (e) html += `<option value="${e}">${e}</option>`;
      });
    }
    el.innerHTML = html;
  } catch (err) {
    console.error("Error loading generic executive filter:", err);
  }
}

function populateGenericStatusFilter(pageId, records) {
  const statusEl = document.getElementById(`generic-status-${pageId}`);
  if (!statusEl) return;
  const statuses = Array.from(new Set((records || []).map(r => r.status).filter(Boolean)));
  let html = '<option value="ALL">All Statuses</option>';
  statuses.forEach(s => {
    html += `<option value="${s}">${s}</option>`;
  });
  statusEl.innerHTML = html;
}

function filterGenericTableData(pageId) {
  const records = genericModuleDataStore[pageId] || [];
  const cfg = MODULE_FIELD_CONFIG[pageId] || MODULE_FIELD_CONFIG['leads'];

  const searchVal = (document.getElementById(`generic-search-${pageId}`)?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById(`generic-status-${pageId}`)?.value || 'ALL';
  const planVal = document.getElementById(`generic-plan-${pageId}`)?.value || 'ALL';
  const execVal = document.getElementById(`generic-exec-${pageId}`)?.value || 'ALL';

  const filtered = records.filter(r => {
    const linkedLead = (r.lead_id && Array.isArray(allLeadsList)) ? allLeadsList.find(l => l.id === r.lead_id) : null;

    const custName = r.customer_name || (linkedLead ? linkedLead.customer_name : '') || '';
    const personName = r.person || r.assigned_person || r.caller_person || r.surveyor_name || r.auditor_name || (linkedLead ? linkedLead.assigned_person : '') || '';
    const f1 = String(r[cfg.f1_prop] || '');
    const f2 = String(r[cfg.f2_prop] || '');
    const f3 = String(r[cfg.f3_prop] || '');
    const refNo = r.reference_no || r.invoice_no || r.objection || r.remarks || '';
    
    const matchSearch = !searchVal || 
      custName.toLowerCase().includes(searchVal) ||
      personName.toLowerCase().includes(searchVal) ||
      f1.toLowerCase().includes(searchVal) ||
      f2.toLowerCase().includes(searchVal) ||
      f3.toLowerCase().includes(searchVal) ||
      refNo.toLowerCase().includes(searchVal);

    const recStatus = r.status || 'Active';
    const matchStatus = statusVal === 'ALL' || recStatus === statusVal;

    const recPlan = r.plan_discussed || r.plan_name || r.plan || (linkedLead ? linkedLead.plan_discussed : '') || '';
    const matchPlan = planVal === 'ALL' || recPlan === planVal;

    const recExec = r.person || r.assigned_person || r.caller_person || r.executive || (linkedLead ? linkedLead.assigned_person : '') || '';
    const matchExec = execVal === 'ALL' || recExec === execVal;

    return matchSearch && matchStatus && matchPlan && matchExec;
  });

  renderGenericTableRows(pageId, filtered);
}

function renderGenericTableRows(pageId, records) {
  const cfg = MODULE_FIELD_CONFIG[pageId] || MODULE_FIELD_CONFIG['leads'];
  const tbody = document.getElementById(`generic-table-body-${pageId}`);
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding: 25px; text-align: center; color: var(--text-muted);">No entries match the selected filters. Click "+ Add New ${cfg.title}" or change filter criteria.</td></tr>`;
    return;
  }

  const franchisesMap = {};
  if (Array.isArray(allFranchisesList)) {
    allFranchisesList.forEach(f => franchisesMap[f.id] = f.name);
  }

  tbody.innerHTML = records.map(r => {
    const linkedLead = (r.lead_id && Array.isArray(allLeadsList)) ? allLeadsList.find(l => l.id === r.lead_id) : null;
    const fName = r.customer_name || (linkedLead ? linkedLead.customer_name : '') || (franchisesMap[r.franchise_id] || `Franchise #${r.franchise_id}`);
    const pName = r.person || r.assigned_person || r.caller_person || r.surveyor_name || r.auditor_name || (linkedLead ? linkedLead.assigned_person : 'Staff');
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
}

async function renderGenericModuleTable(pageId, containerEl) {
  const cfg = MODULE_FIELD_CONFIG[pageId] || MODULE_FIELD_CONFIG['leads'];

  if (!allLeadsList || allLeadsList.length === 0) {
    try {
      const lRes = await fetch('/api/leads');
      allLeadsList = await lRes.json();
    } catch(e) {}
  }

  containerEl.innerHTML = `
    <!-- Top Multi-Filter Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 10px;">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; flex: 1;">
        <div style="position: relative; min-width: 200px; flex: 1;">
          <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.85rem;"></i>
          <input type="text" id="generic-search-${pageId}" placeholder="Search customer, person, details..." oninput="filterGenericTableData('${pageId}')" style="padding: 7px 10px 7px 32px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; width: 100%;">
        </div>

        <select id="generic-status-${pageId}" onchange="filterGenericTableData('${pageId}')" style="padding: 7px 10px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; background: #FFFFFF; font-weight: 500;">
          <option value="ALL">All Statuses</option>
        </select>

        <select id="generic-plan-${pageId}" onchange="filterGenericTableData('${pageId}')" style="padding: 7px 10px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; background: #FFFFFF; font-weight: 500;">
          <option value="ALL">All Plans</option>
          <option value="Plan A">Plan A</option>
          <option value="Plan B">Plan B</option>
          <option value="Plan C">Plan C</option>
        </select>

        <select id="generic-exec-${pageId}" onchange="filterGenericTableData('${pageId}')" style="padding: 7px 10px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.82rem; background: #FFFFFF; font-weight: 500;">
          <option value="ALL">All Executives</option>
        </select>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
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

    <!-- Records Table -->
    <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 8px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="background: #F1F5F9; text-align: left; color: #334155;">
            <th style="padding: 10px 14px;"># ID</th>
            <th style="padding: 10px 14px;">Customer / Store</th>
            <th style="padding: 10px 14px;">Responsible Person</th>
            <th style="padding: 10px 14px;">${cfg.f1_label}</th>
            <th style="padding: 10px 14px;">${cfg.f2_label}</th>
            <th style="padding: 10px 14px;">${cfg.f3_label}</th>
            <th style="padding: 10px 14px;">Status</th>
            <th style="padding: 10px 14px;">Linked Document</th>
            <th style="padding: 10px 14px; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody id="generic-table-body-${pageId}">
          <tr><td colspan="9" style="padding: 20px; text-align: center; color: var(--text-muted);">Loading entries...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  populateGenericExecutiveFilter(`generic-exec-${pageId}`);

  try {
    const res = await fetch(cfg.endpoint);
    const records = await res.json();
    genericModuleDataStore[pageId] = records || [];

    populateGenericStatusFilter(pageId, genericModuleDataStore[pageId]);
    filterGenericTableData(pageId);
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
  { key: 'complaints', name: 'Complaints & Issues' },
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

let activeUserSubTab = 'users';
let allRolesList = [];
let currentEditingRole = null;

async function loadRolesList() {
  try {
    const res = await fetch('/api/roles');
    if (res.status === 403) {
      allRolesList = [];
      return;
    }
    allRolesList = await res.json();
    populateRoleDropdowns();
  } catch (err) {
    console.error('Error loading roles list:', err);
  }
}

function populateRoleDropdowns() {
  const filterSelect = document.getElementById('users-filter-role');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = `<option value="">All Roles</option>` +
      allRolesList.map(r => `<option value="${r.name}" ${r.name === currentVal ? 'selected' : ''}>${r.name}</option>`).join('');
  }

  const modalSelect = document.getElementById('user-role');
  if (modalSelect) {
    const currentVal = modalSelect.value || 'Manager';
    modalSelect.innerHTML = allRolesList.map(r => `<option value="${r.name}" ${r.name === currentVal ? 'selected' : ''}>${r.name} ${r.is_system ? '(System Role)' : '(Custom Role)'}</option>`).join('');
  }
}

async function renderUsersWorkspace(container) {
  await loadRolesList();

  container.innerHTML = `
    <!-- Top System & Master Settings Header Banner -->
    <div style="background: #FFFFFF; padding: 20px 24px; border-radius: 12px; border: 1px solid #E2E8F0; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h2 style="margin: 0 0 6px 0; font-size: 1.35rem; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-gear" style="color: #2563EB;"></i> System & Master Settings
          </h2>
          <p style="margin: 0; font-size: 0.85rem; color: #64748B;">Manage franchise user accounts, role definitions, and process-level permissions matrix.</p>
        </div>
      </div>

      <!-- Top Sub-Tabs Bar -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid #E2E8F0; padding-bottom: 2px;">
        <button id="user-subtab-users-btn" onclick="switchUserSubTab('users')" style="padding: 10px 20px; font-weight: 600; font-size: 0.88rem; border: none; background: ${activeUserSubTab === 'users' ? '#0F172A' : 'transparent'}; color: ${activeUserSubTab === 'users' ? '#FFFFFF' : '#64748B'}; border-radius: 8px 8px 0 0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
          <i class="fa-solid fa-users"></i> Users Register (<span id="count-users-tab">0</span>)
        </button>
        <button id="user-subtab-roles-btn" onclick="switchUserSubTab('roles')" style="padding: 10px 20px; font-weight: 600; font-size: 0.88rem; border: none; background: ${activeUserSubTab === 'roles' ? '#0F172A' : 'transparent'}; color: ${activeUserSubTab === 'roles' ? '#FFFFFF' : '#64748B'}; border-radius: 8px 8px 0 0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
          <i class="fa-solid fa-shield-halved"></i> Roles & Permissions (<span id="count-roles-tab">${allRolesList.length}</span>)
        </button>
      </div>
    </div>

    <!-- Subtab Content Area -->
    <div id="user-subtab-content">
      ${activeUserSubTab === 'users' ? getUsersRegisterTabHTML() : getRolesRegisterTabHTML()}
    </div>
  `;

  if (activeUserSubTab === 'users') {
    loadUsers();
  } else {
    renderRolesTable(allRolesList);
  }
}

function switchUserSubTab(tabName) {
  activeUserSubTab = tabName;
  const usersBtn = document.getElementById('user-subtab-users-btn');
  const rolesBtn = document.getElementById('user-subtab-roles-btn');
  const content = document.getElementById('user-subtab-content');

  if (usersBtn && rolesBtn && content) {
    if (tabName === 'users') {
      usersBtn.style.background = '#0F172A';
      usersBtn.style.color = '#FFFFFF';
      rolesBtn.style.background = 'transparent';
      rolesBtn.style.color = '#64748B';
      content.innerHTML = getUsersRegisterTabHTML();
      loadUsers();
    } else {
      rolesBtn.style.background = '#0F172A';
      rolesBtn.style.color = '#FFFFFF';
      usersBtn.style.background = 'transparent';
      usersBtn.style.color = '#64748B';
      content.innerHTML = getRolesRegisterTabHTML();
      loadRolesList().then(() => renderRolesTable(allRolesList));
    }
  }
}

function getUsersRegisterTabHTML() {
  return `
    <div style="background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-user-gear" style="color: #10B981;"></i> Internal User Accounts Register
          </h3>
          <p style="margin: 4px 0 0 0; font-size: 0.82rem; color: #64748B;">Authorized franchise managers, executives, accountants, and administrators. No self-registration.</p>
        </div>
        <button onclick="openNewUserModal()" style="padding: 8px 18px; border-radius: 8px; border: none; background: #10B981; color: #FFFFFF; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-plus"></i> ADD USER
        </button>
      </div>

      <!-- Filter Controls -->
      <div style="background: #F8FAFC; padding: 12px 15px; border-radius: 8px; border: 1px solid #E2E8F0; margin-bottom: 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
        <input type="text" id="users-filter-search" oninput="debounce(loadUsers, 300)()" placeholder="Search name, email, mobile..." style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem; width: 240px;">

        <select id="users-filter-role" onchange="loadUsers()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
          <option value="">All Roles</option>
          ${allRolesList.map(r => `<option value="${r.name}">${r.name}</option>`).join('')}
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
      </div>

      <!-- Users Table -->
      <div style="overflow-x: auto; border: 1px solid #E2E8F0; border-radius: 8px;">
        <table class="data-table" style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
          <thead>
            <tr style="background: #F8FAFC; color: #475569; text-align: left; border-bottom: 1px solid #E2E8F0;">
              <th style="padding: 12px 15px; font-weight: 700;">NAME</th>
              <th style="padding: 12px 15px; font-weight: 700;">WORK EMAIL</th>
              <th style="padding: 12px 15px; font-weight: 700;">ROLE</th>
              <th style="padding: 12px 15px; font-weight: 700;">STATUS</th>
              <th style="padding: 12px 15px; font-weight: 700;">LAST LOGIN</th>
              <th style="padding: 12px 15px; font-weight: 700;">CREATED DATE</th>
              <th style="padding: 12px 15px; font-weight: 700; text-align: right;">ACTIONS</th>
            </tr>
          </thead>
          <tbody id="users-table-tbody">
            <tr><td colspan="7" style="text-align: center; padding: 25px; color: #64748B;">Loading users register...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getRolesRegisterTabHTML() {
  return `
    <div style="background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-shield-halved" style="color: #8B5CF6;"></i> Roles & Process Permissions Register
          </h3>
          <p style="margin: 4px 0 0 0; font-size: 0.82rem; color: #64748B;">Configure process-level access for Super Admin, Admin, Manager, Field Executive, Accountant, Franchisee, and custom roles.</p>
        </div>
        <button onclick="openCreateRoleModal()" style="padding: 8px 18px; border-radius: 8px; border: none; background: #8B5CF6; color: #FFFFFF; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-plus"></i> CREATE ROLE
        </button>
      </div>

      <!-- Roles Table -->
      <div style="overflow-x: auto; border: 1px solid #E2E8F0; border-radius: 8px;">
        <table class="data-table" style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
          <thead>
            <tr style="background: #F8FAFC; color: #475569; text-align: left; border-bottom: 1px solid #E2E8F0;">
              <th style="padding: 12px 15px; font-weight: 700; width: 22%;">ROLE NAME</th>
              <th style="padding: 12px 15px; font-weight: 700; width: 35%;">DESCRIPTION</th>
              <th style="padding: 12px 15px; font-weight: 700;">ASSIGNED USERS</th>
              <th style="padding: 12px 15px; font-weight: 700;">PERMISSIONS</th>
              <th style="padding: 12px 15px; font-weight: 700;">STATUS</th>
              <th style="padding: 12px 15px; font-weight: 700; text-align: right;">ACTIONS</th>
            </tr>
          </thead>
          <tbody id="roles-table-tbody">
            <tr><td colspan="6" style="text-align: center; padding: 25px; color: #64748B;">Loading roles & permissions register...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
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
      const tbody = document.getElementById('users-table-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr><td colspan="7" style="text-align: center; padding: 30px; color: #DC2626; font-weight: 600;">
            <i class="fa-solid fa-lock" style="font-size: 1.5rem; display: block; margin-bottom: 8px;"></i>
            Access Restricted: User Management section is accessible only to Super Admin users.
          </td></tr>
        `;
      }
      return;
    }

    const users = await res.json();
    allUsersList = users;
    renderUsersTable(users);
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-tbody');
  const tabCount = document.getElementById('count-users-tab');
  if (tabCount && users) tabCount.innerText = users.length;
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: #64748B;">No users found matching current filters.</td></tr>`;
    return;
  }

  const roleStyles = {
    'Super Admin': 'background: #F3E8FF; color: #6B21A8;',
    'Administrator': 'background: #F3E8FF; color: #6B21A8;',
    'Admin': 'background: #FEE2E2; color: #991B1B;',
    'Manager': 'background: #DBEAFE; color: #1E40AF;',
    'Field Executive': 'background: #DCFCE7; color: #166534;',
    'Accountant': 'background: #FEF3C7; color: #92400E;',
    'Franchisee': 'background: #FFEDD5; color: #C2410C;'
  };

  tbody.innerHTML = users.map(u => {
    const initials = (u.full_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const style = roleStyles[u.role] || 'background: #E2E8F0; color: #334155;';
    const statusBadge = u.is_active
      ? `<span style="background: #DCFCE7; color: #15803D; padding: 3px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> ACTIVE</span>`
      : `<span style="background: #F3F4F6; color: #6B7280; padding: 3px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> INACTIVE</span>`;

    return `
      <tr style="border-bottom: 1px solid #F1F5F9;">
        <td style="padding: 12px 15px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #E2E8F0; color: #475569; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">${initials}</div>
            <div>
              <div style="font-weight: 700; color: #0F172A;">${u.full_name}</div>
              <div style="font-size: 0.76rem; color: #94A3B8;">${u.mobile ? `${u.mobile}` : ''}</div>
            </div>
          </div>
        </td>
        <td style="padding: 12px 15px; color: #334155; font-family: monospace; font-size: 0.82rem;">${u.username}</td>
        <td style="padding: 12px 15px;">
          <span style="padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px; ${style}">
            <i class="fa-solid fa-shield-halved" style="font-size: 0.7rem;"></i> ${u.role}
          </span>
        </td>
        <td style="padding: 12px 15px;">${statusBadge}</td>
        <td style="padding: 12px 15px; font-size: 0.8rem; color: #64748B;">${u.last_login || '-'}</td>
        <td style="padding: 12px 15px; font-size: 0.8rem; color: #64748B;">${u.created_at ? u.created_at.split(' ')[0] : '-'}</td>
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

function renderRolesTable(roles) {
  const tbody = document.getElementById('roles-table-tbody');
  const tabCount = document.getElementById('count-roles-tab');
  if (tabCount && roles) tabCount.innerText = roles.length;
  if (!tbody) return;

  if (!roles || roles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 25px; color: #64748B;">No process roles found.</td></tr>`;
    return;
  }

  tbody.innerHTML = roles.map(r => {
    const sysBadge = r.is_system
      ? `<span style="background: #E2E8F0; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; margin-left: 6px;">SYSTEM ROLE</span>`
      : '';

    const permText = r.total_actions === 96
      ? `ALL 96 PERMISSIONS`
      : `${r.total_actions} actions`;

    return `
      <tr style="border-bottom: 1px solid #F1F5F9;">
        <td style="padding: 12px 15px;">
          <div style="font-weight: 700; color: #0F172A; display: flex; align-items: center;">
            ${r.name} ${sysBadge}
          </div>
        </td>
        <td style="padding: 12px 15px; color: #64748B; font-size: 0.82rem;">${r.description || 'Custom defined process role.'}</td>
        <td style="padding: 12px 15px;">
          <span style="background: #F1F5F9; color: #475569; padding: 3px 10px; border-radius: 6px; font-weight: 600; font-size: 0.78rem;">
            ${r.user_count} ${r.user_count === 1 ? 'user' : 'users'}
          </span>
        </td>
        <td style="padding: 12px 15px;">
          <span style="background: #F3E8FF; color: #6B21A8; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.75rem;">
            ${permText}
          </span>
        </td>
        <td style="padding: 12px 15px;">
          <span style="background: #DCFCE7; color: #15803D; padding: 3px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> ACTIVE
          </span>
        </td>
        <td style="padding: 12px 15px; text-align: right; white-space: nowrap;">
          <button onclick="openEditRoleModal(${r.id})" title="Edit Role & Permissions" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; color: #2563EB; font-size: 0.8rem; margin-right: 4px;">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="duplicateRole(${r.id})" title="Duplicate Role" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; color: #475569; font-size: 0.8rem; margin-right: 4px;">
            <i class="fa-regular fa-copy"></i>
          </button>
          <button onclick="resetRolePermissions(${r.id})" title="Reset Role Permissions" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; color: #D97706; font-size: 0.8rem; margin-right: 4px;">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
          <button onclick="deleteRole(${r.id})" title="${r.is_system ? 'System roles cannot be deleted' : 'Delete Role'}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid ${r.is_system ? '#CBD5E1' : '#FCA5A5'}; background: ${r.is_system ? '#F1F5F9' : '#FEF2F2'}; cursor: ${r.is_system ? 'not-allowed' : 'pointer'}; color: ${r.is_system ? '#94A3B8' : '#DC2626'}; font-size: 0.8rem;" ${r.is_system ? 'disabled' : ''}>
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

// --- ROLE MANAGEMENT MODALS & PERMISSIONS MATRIX ---

function renderRolePermissionsMatrixTable(customPermissions) {
  const tbody = document.getElementById('role-perms-tbody');
  if (!tbody) return;

  const actions = ['view', 'add', 'edit', 'delete', 'approve', 'export'];

  tbody.innerHTML = ALL_MODULES.map(mod => {
    let modPerms = {};
    if (customPermissions && customPermissions[mod.key]) {
      modPerms = customPermissions[mod.key];
    } else {
      actions.forEach(a => modPerms[a] = (a !== 'delete'));
    }

    const checkboxesHtml = actions.map(action => `
      <td style="text-align: center; padding: 8px;">
        <input type="checkbox" id="role_perm_${mod.key}_${action}" data-module="${mod.key}" data-action="${action}" ${modPerms[action] ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
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

function selectAllRolePermissions(state) {
  ALL_MODULES.forEach(mod => {
    ['view', 'add', 'edit', 'delete', 'approve', 'export'].forEach(action => {
      const cb = document.getElementById(`role_perm_${mod.key}_${action}`);
      if (cb) cb.checked = state;
    });
  });
}

function openCreateRoleModal() {
  currentEditingRole = null;
  document.getElementById('role-form-id').value = '';
  document.getElementById('role-modal-title').innerText = 'Create New Process Role';
  const nameInput = document.getElementById('role-name-input');
  nameInput.value = '';
  nameInput.disabled = false;
  document.getElementById('role-desc-input').value = '';

  renderRolePermissionsMatrixTable(null);
  document.getElementById('role-modal').style.display = 'flex';
}

function openEditRoleModal(roleId) {
  const r = allRolesList.find(x => x.id === roleId);
  if (!r) return;

  currentEditingRole = r;
  document.getElementById('role-form-id').value = r.id;
  document.getElementById('role-modal-title').innerText = `Edit Role: ${r.name}`;
  const nameInput = document.getElementById('role-name-input');
  nameInput.value = r.name;
  nameInput.disabled = r.is_system;
  document.getElementById('role-desc-input').value = r.description || '';

  renderRolePermissionsMatrixTable(r.permissions);
  document.getElementById('role-modal').style.display = 'flex';
}

function closeRoleModal() {
  document.getElementById('role-modal').style.display = 'none';
}

async function handleSaveRoleModal(e) {
  e.preventDefault();

  const roleId = document.getElementById('role-form-id').value;
  const name = document.getElementById('role-name-input').value.trim();
  const description = document.getElementById('role-desc-input').value.trim();

  const permissions = {};
  ALL_MODULES.forEach(mod => {
    permissions[mod.key] = {};
    ['view', 'add', 'edit', 'delete', 'approve', 'export'].forEach(action => {
      const cb = document.getElementById(`role_perm_${mod.key}_${action}`);
      permissions[mod.key][action] = cb ? cb.checked : false;
    });
  });

  const payload = { name, description, permissions };
  const url = roleId ? `/api/roles/${roleId}` : '/api/roles';
  const method = roleId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(data.message || 'Role saved successfully!');
      closeRoleModal();
      await loadRolesList();
      if (activeUserSubTab === 'roles') {
        renderRolesTable(allRolesList);
      }
    } else {
      alert(data.message || data.error || 'Failed to save role.');
    }
  } catch (err) {
    console.error('Error saving role:', err);
    alert('An unexpected error occurred while saving role.');
  }
}

async function duplicateRole(roleId) {
  const r = allRolesList.find(x => x.id === roleId);
  const newName = prompt(`Duplicate role "${r ? r.name : ''}" as:`, r ? `${r.name} (Copy)` : '');
  if (!newName) return;

  try {
    const res = await fetch(`/api/roles/${roleId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(data.message || 'Role duplicated successfully!');
      await loadRolesList();
      if (activeUserSubTab === 'roles') renderRolesTable(allRolesList);
    } else {
      alert(data.message || data.error || 'Failed to duplicate role.');
    }
  } catch (err) {
    console.error('Error duplicating role:', err);
  }
}

async function resetRolePermissions(roleId) {
  const r = allRolesList.find(x => x.id === roleId);
  if (!confirm(`Are you sure you want to reset default permissions for role "${r ? r.name : ''}"?`)) return;

  try {
    const res = await fetch(`/api/roles/${roleId}/reset`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(data.message || 'Role permissions reset to default!');
      await loadRolesList();
      if (activeUserSubTab === 'roles') renderRolesTable(allRolesList);
    } else {
      alert(data.message || data.error || 'Failed to reset role.');
    }
  } catch (err) {
    console.error('Error resetting role permissions:', err);
  }
}

async function deleteRole(roleId) {
  const r = allRolesList.find(x => x.id === roleId);
  if (!confirm(`Are you sure you want to delete custom role "${r ? r.name : ''}"?`)) return;

  try {
    const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(data.message || 'Role deleted successfully!');
      await loadRolesList();
      if (activeUserSubTab === 'roles') renderRolesTable(allRolesList);
    } else {
      alert(data.message || data.error || 'Failed to delete role.');
    }
  } catch (err) {
    console.error('Error deleting role:', err);
  }
}


// --- AUTHENTICATION & PERMISSIONS ENFORCEMENT ---

let currentUser = null;

async function checkAuthSession() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app-container');
  if (loginScreen) loginScreen.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';

  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        currentUser = data.user;
        currentRole = data.user.role || 'Super Admin';
        currentUserPermissions = data.user.permissions || {};
        
        const nameEl = document.getElementById('current-user-fullname');
        const roleEl = document.getElementById('current-role-badge');
        if (nameEl) nameEl.innerText = currentUser.full_name || 'System Admin';
        if (roleEl) roleEl.innerText = currentRole;
        
        const roleSelect = document.getElementById('topbar-role-select');
        if (roleSelect) roleSelect.value = currentRole;

        applySidebarPermissions(currentUserPermissions, currentRole);
      }
    }
  } catch (err) {
    console.error('Session init info:', err);
  }
}

function showLoginScreen() {
  currentUser = null;
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app-container');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (appContainer) appContainer.style.display = 'none';
}

async function handleLoginSubmit(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }

  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value.trim() || '';
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
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });

    let data;
    const rawText = await res.text();
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      data = { status: 'error', message: 'Invalid response from server.' };
    }

    if (res.ok && data.status === 'success') {
      const user = data.user;
      if (user) {
        currentUser = user;

        const loginScreen = document.getElementById('login-screen');
        const appContainer = document.getElementById('app-container');
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        
        currentRole = currentUser.role;
        currentUserPermissions = currentUser.permissions || {};

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

        const greetingEl = document.getElementById('dash-greeting-title');
        if (greetingEl) {
          const firstName = (currentUser.full_name || 'User').split(' ')[0];
          greetingEl.innerText = `Good Morning, ${firstName}!`;
        }

        try { applySidebarPermissions(currentUserPermissions, currentRole); } catch(e) { console.error(e); }
        try { restoreSidebarState(); } catch(e) { console.error(e); }
        try { initEventListeners(); } catch(e) { console.error(e); }
        try { loadDashboard(); } catch(e) { console.error(e); }
        try { loadExpenseCategories(); } catch(e) { console.error(e); }
        try { loadFranchisesList(); } catch(e) { console.error(e); }
      } else {
        await checkAuthSession();
      }
    } else {
      if (errorAlert) {
        errorAlert.innerText = data.message || 'Invalid username/email or password.';
        errorAlert.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    if (errorAlert) {
      errorAlert.innerText = 'Network connection error. Please try again.';
      errorAlert.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Account';
    }
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
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
    'complaints': ['nav-complaints'],
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

// --- ADD FRANCHISE MODAL HANDLERS ---

function populateAddFranchiseLeadSelect(selectedLeadId = null) {
  const sel = document.getElementById('add-f-lead-id');
  if (!sel) return;
  let html = '<option value="">-- Select from Pre-Franchise Leads (Auto-fill) --</option>';
  if (allLeadsList && allLeadsList.length > 0) {
    allLeadsList.forEach(l => {
      const isSel = selectedLeadId == l.id;
      html += `<option value="${l.id}" ${isSel ? 'selected' : ''}>[Lead #${l.id}] ${l.customer_name} (${l.mobile} - ${l.city || 'No City'})</option>`;
    });
  }
  sel.innerHTML = html;
}

function autoFillFranchiseFromLead(leadIdStr) {
  if (!leadIdStr) return;
  const leadId = parseInt(leadIdStr);
  const lead = allLeadsList.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('add-f-owner-name').value = lead.customer_name || '';
  document.getElementById('add-f-owner-mobile').value = lead.mobile || '';
  document.getElementById('add-f-owner-email').value = lead.email || '';
  document.getElementById('add-f-name').value = `Ajit Zone - ${lead.city || lead.customer_name}`;
  document.getElementById('add-f-city').value = lead.city || '';
  document.getElementById('add-f-state').value = lead.state || '';
  document.getElementById('add-f-assigned-person').value = lead.assigned_person || 'Priya Sharma';
  document.getElementById('add-f-plan-name').value = lead.plan_discussed || 'Standard Plan';
}

function openNewFranchiseModal(autoSelectLeadId = null) {
  const modal = document.getElementById('add-franchise-modal');
  if (modal) {
    document.getElementById('add-f-code').value = `FR-${Math.floor(1000 + Math.random() * 9000)}`;
    document.getElementById('add-f-name').value = '';
    document.getElementById('add-f-owner-name').value = '';
    document.getElementById('add-f-owner-mobile').value = '';
    document.getElementById('add-f-owner-email').value = '';
    document.getElementById('add-f-city').value = '';
    document.getElementById('add-f-state').value = '';
    document.getElementById('add-f-assigned-person').value = 'Priya Sharma';
    document.getElementById('add-f-plan-name').value = 'Standard Plan';
    document.getElementById('add-f-agreed-amount').value = 500000;
    document.getElementById('add-f-status').value = 'Active';

    populateAddFranchiseLeadSelect(autoSelectLeadId);
    if (autoSelectLeadId) {
      autoFillFranchiseFromLead(autoSelectLeadId);
    }

    modal.style.display = 'flex';
  }
}

function closeNewFranchiseModal() {
  const modal = document.getElementById('add-franchise-modal');
  if (modal) modal.style.display = 'none';
}

async function handleNewFranchiseSubmit(evt) {
  evt.preventDefault();
  const leadIdVal = document.getElementById('add-f-lead-id')?.value;
  const payload = {
    code: document.getElementById('add-f-code').value.trim(),
    name: document.getElementById('add-f-name').value.trim(),
    owner_name: document.getElementById('add-f-owner-name').value.trim(),
    owner_mobile: document.getElementById('add-f-owner-mobile').value.trim(),
    owner_email: document.getElementById('add-f-owner-email').value.trim(),
    city: document.getElementById('add-f-city').value.trim(),
    state: document.getElementById('add-f-state').value.trim(),
    assigned_person: document.getElementById('add-f-assigned-person').value.trim(),
    plan_name: document.getElementById('add-f-plan-name').value,
    agreed_amount: parseFloat(document.getElementById('add-f-agreed-amount').value || 500000),
    status: document.getElementById('add-f-status').value,
    lead_id: leadIdVal ? parseInt(leadIdVal) : null
  };

  try {
    const res = await fetch('/api/franchises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(`Franchise "${data.franchise.name}" created successfully!`);
      closeNewFranchiseModal();
      loadDashboard();
      loadFranchisesList();
      if (typeof loadLeadsData === 'function') loadLeadsData();
    } else {
      alert(data.error || 'Failed to create franchise');
    }
  } catch (err) {
    console.error('Error creating franchise:', err);
    alert('Failed to connect to server.');
  }
}

// --- CONVERT LEAD TO FRANCHISE HANDLERS ---

function openConvertLeadModal(leadId, leadName, leadCity, leadPlan) {
  const modal = document.getElementById('convert-lead-modal');
  if (modal) {
    document.getElementById('convert-lead-id').value = leadId;
    document.getElementById('convert-token-amount').value = 25000;
    document.getElementById('convert-payment-mode').value = 'Bank Transfer';
    document.getElementById('convert-reference-no').value = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
    document.getElementById('convert-agreed-amount').value = 500000;
    const infoEl = document.getElementById('convert-lead-info-text');
    if (infoEl) {
      infoEl.innerText = `Converting pre-token inquiry "${leadName || 'Lead'}" (${leadCity || 'City'}) into full Franchise Profile.`;
    }
    modal.style.display = 'flex';
  }
}

function closeConvertLeadModal() {
  const modal = document.getElementById('convert-lead-modal');
  if (modal) modal.style.display = 'none';
}

async function submitConvertLeadToFranchise(evt) {
  evt.preventDefault();
  const leadId = document.getElementById('convert-lead-id').value;
  const payload = {
    token_amount: parseFloat(document.getElementById('convert-token-amount').value || 25000),
    payment_mode: document.getElementById('convert-payment-mode').value,
    reference_no: document.getElementById('convert-reference-no').value.trim(),
    agreed_amount: parseFloat(document.getElementById('convert-agreed-amount').value || 500000)
  };

  try {
    const res = await fetch(`/api/leads/${leadId}/convert_to_franchise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(data.message);
      closeConvertLeadModal();
      loadDashboard();
      loadFranchisesList();
      if (data.franchise && data.franchise.id) {
        exploreFranchise(data.franchise.id);
      }
    } else {
      alert(data.error || 'Failed to convert lead to franchise.');
    }
  } catch (err) {
    console.error('Error converting lead:', err);
    alert('Server error during lead conversion.');
  }
}

// --- COMPLAINTS & ISSUES MODULE WORKSPACE ---

function renderComplaintsWorkspace(container) {
  container.innerHTML = `
    <!-- Complaints KPIs -->
    <div class="kpi-container" style="grid-template-columns: repeat(5, 1fr); gap: 15px; margin-bottom: 20px;">
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4>Total Complaints</h4>
          <p id="comp-kpi-total">0</p>
        </div>
        <div class="kpi-icon icon-blue"><i class="fa-solid fa-triangle-exclamation"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4>Open Issues</h4>
          <p id="comp-kpi-open" style="color: #DC2626;">0</p>
        </div>
        <div class="kpi-icon icon-red"><i class="fa-solid fa-folder-open"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4>In Progress</h4>
          <p id="comp-kpi-progress" style="color: #D97706;">0</p>
        </div>
        <div class="kpi-icon icon-orange"><i class="fa-solid fa-spinner"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4>Resolved / Closed</h4>
          <p id="comp-kpi-resolved" style="color: #059669;">0</p>
        </div>
        <div class="kpi-icon icon-green"><i class="fa-solid fa-circle-check"></i></div>
      </div>
      <div class="kpi-card" style="padding: 15px;">
        <div class="kpi-info">
          <h4>High / Urgent</h4>
          <p id="comp-kpi-urgent" style="color: #7C3AED;">0</p>
        </div>
        <div class="kpi-icon icon-purple"><i class="fa-solid fa-fire"></i></div>
      </div>
    </div>

    <!-- Filters & Action Header -->
    <div style="background: #F8FAFC; padding: 15px; border-radius: 10px; border: 1px solid #E2E8F0; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <select id="comp-filter-franchise" onchange="loadComplaints()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
          <option value="">All Franchises</option>
          ${allFranchisesList.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
        </select>

        <select id="comp-filter-category" onchange="loadComplaints()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
          <option value="">All Categories</option>
          <option value="Operations">Operations</option>
          <option value="IT & POS">IT & POS</option>
          <option value="Stock & Supply">Stock & Supply</option>
          <option value="Billing & Accounts">Billing & Accounts</option>
          <option value="Marketing">Marketing</option>
          <option value="Quality">Product Quality</option>
          <option value="Other">Other</option>
        </select>

        <select id="comp-filter-priority" onchange="loadComplaints()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
          <option value="">All Priorities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>

        <select id="comp-filter-status" onchange="loadComplaints()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.85rem;">
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Escalated">Escalated</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      <button onclick="openComplaintModal()" class="btn-add-franchise" style="background: #2563EB;">
        <i class="fa-solid fa-plus"></i> Log New Complaint
      </button>
    </div>

    <!-- Table Container -->
    <div id="complaints-table-container"></div>
  `;
  loadComplaints();
}

async function loadComplaints() {
  const tableContainer = document.getElementById('complaints-table-container');
  if (!tableContainer) return;

  const fId = document.getElementById('comp-filter-franchise')?.value || '';
  const category = document.getElementById('comp-filter-category')?.value || '';
  const priority = document.getElementById('comp-filter-priority')?.value || '';
  const status = document.getElementById('comp-filter-status')?.value || '';
  const search = document.getElementById('global-search')?.value || '';

  const params = new URLSearchParams({ franchise_id: fId, category, priority, status, search });
  try {
    const res = await fetch(`/api/complaints?${params.toString()}`);
    const data = await res.json();

    if (data.stats) {
      if (document.getElementById('comp-kpi-total')) document.getElementById('comp-kpi-total').innerText = data.stats.total || 0;
      if (document.getElementById('comp-kpi-open')) document.getElementById('comp-kpi-open').innerText = data.stats.open || 0;
      if (document.getElementById('comp-kpi-progress')) document.getElementById('comp-kpi-progress').innerText = data.stats.in_progress || 0;
      if (document.getElementById('comp-kpi-resolved')) document.getElementById('comp-kpi-resolved').innerText = data.stats.resolved || 0;
      if (document.getElementById('comp-kpi-urgent')) document.getElementById('comp-kpi-urgent').innerText = data.stats.urgent_high || 0;
    }

    if (!data.complaints || data.complaints.length === 0) {
      tableContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; background: #FFFFFF; border-radius: 12px; border: 1px dashed #CBD5E1;">
          <i class="fa-solid fa-clipboard-check" style="font-size: 2.5rem; color: #94A3B8; margin-bottom: 10px;"></i>
          <h4 style="margin: 0 0 5px; color: #0F172A;">No Complaints Recorded</h4>
          <p style="color: #64748B; margin: 0 0 15px; font-size: 0.88rem;">Click below to log a new franchise complaint or issue.</p>
          <button onclick="openComplaintModal()" class="btn-add-franchise" style="width: auto; margin: 0 auto;">
            <i class="fa-solid fa-plus"></i> Log New Complaint
          </button>
        </div>
      `;
      return;
    }

    tableContainer.innerHTML = `
      <table class="custom-table">
        <thead>
          <tr>
            <th>Date / Time</th>
            <th>Franchise Store</th>
            <th>Reported By</th>
            <th>Category</th>
            <th>Issue Description</th>
            <th>Priority</th>
            <th>Assigned To</th>
            <th>Status</th>
            <th>Resolution / Action</th>
            <th>Attachment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.complaints.map(c => {
            const prioColor = c.priority === 'Urgent' ? '#DC2626' : (c.priority === 'High' ? '#D97706' : '#2563EB');
            const statusBg = c.status === 'Open' ? '#FEF2F2' : (c.status === 'In Progress' ? '#FEF3C7' : '#ECFDF5');
            const statusText = c.status === 'Open' ? '#DC2626' : (c.status === 'In Progress' ? '#D97706' : '#059669');

            return `
              <tr>
                <td>${c.date_time}</td>
                <td><b>${c.franchise_name}</b> <br><small style="color:#94A3B8;">${c.franchise_code}</small></td>
                <td>${c.reported_by}</td>
                <td><span class="records-badge">${c.category}</span></td>
                <td style="max-width: 250px;">${c.issue}</td>
                <td><b style="color: ${prioColor}">${c.priority}</b></td>
                <td>${c.assigned_person}</td>
                <td><span style="background: ${statusBg}; color: ${statusText}; padding: 3px 8px; border-radius: 9999px; font-weight: 600; font-size: 0.78rem;">${c.status}</span></td>
                <td style="max-width: 200px;">
                  ${c.resolution ? `<b>Res:</b> ${c.resolution} <br><small style="color:#64748B;">${c.resolution_date || ''}</small>` : (c.action_taken || '-')}
                </td>
                <td>
                  ${c.document_path ? `
                    <button onclick="previewPDF('${c.document_path}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;">
                      <i class="fa-solid fa-paperclip"></i> File
                    </button>
                  ` : '-'}
                </td>
                <td style="white-space: nowrap;">
                  <button onclick='openComplaintModal(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; margin-right:4px;">
                    <i class="fa-solid fa-pen"></i> Edit
                  </button>
                  <button onclick="deleteComplaint(${c.id})" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; padding:4px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer;">
                    <i class="fa-solid fa-trash-can"></i> Delete
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Error loading complaints:', err);
  }
}

function openComplaintModal(data = null) {
  const modal = document.getElementById('complaint-modal');
  if (!modal) return;

  const fSelect = document.getElementById('complaint-franchise-id');
  if (fSelect) {
    fSelect.innerHTML = allFranchisesList.map(f => `<option value="${f.id}">${f.name} (${f.code})</option>`).join('');
  }

  if (data) {
    document.getElementById('complaint-modal-title').innerText = 'Edit Complaint Record';
    document.getElementById('complaint-id').value = data.id;
    document.getElementById('complaint-franchise-id').value = data.franchise_id;
    document.getElementById('complaint-date-time').value = data.date_time || '';
    document.getElementById('complaint-reported-by').value = data.reported_by || '';
    document.getElementById('complaint-category').value = data.category || 'Operations';
    document.getElementById('complaint-priority').value = data.priority || 'Medium';
    document.getElementById('complaint-assigned-person').value = data.assigned_person || '';
    document.getElementById('complaint-status').value = data.status || 'Open';
    document.getElementById('complaint-issue').value = data.issue || '';
    document.getElementById('complaint-action-taken').value = data.action_taken || '';
    document.getElementById('complaint-resolution').value = data.resolution || '';
    document.getElementById('complaint-resolution-date').value = data.resolution_date || '';
    document.getElementById('complaint-remarks').value = data.remarks || '';
  } else {
    document.getElementById('complaint-modal-title').innerText = 'Log New Franchise Complaint';
    document.getElementById('complaint-id').value = '';
    document.getElementById('complaint-date-time').value = new Date().toISOString().replace('T', ' ').substring(0, 16);
    document.getElementById('complaint-reported-by').value = '';
    document.getElementById('complaint-category').value = 'Operations';
    document.getElementById('complaint-priority').value = 'Medium';
    document.getElementById('complaint-assigned-person').value = 'Support Team';
    document.getElementById('complaint-status').value = 'Open';
    document.getElementById('complaint-issue').value = '';
    document.getElementById('complaint-action-taken').value = '';
    document.getElementById('complaint-resolution').value = '';
    document.getElementById('complaint-resolution-date').value = '';
    document.getElementById('complaint-remarks').value = '';
  }

  modal.style.display = 'flex';
}

function closeComplaintModal() {
  const modal = document.getElementById('complaint-modal');
  if (modal) modal.style.display = 'none';
}

async function handleComplaintSubmit(evt) {
  evt.preventDefault();
  const cId = document.getElementById('complaint-id').value;
  const isEdit = !!cId;
  const fileInput = document.getElementById('complaint-document-file');

  const formData = new FormData();
  formData.append('franchise_id', document.getElementById('complaint-franchise-id').value);
  formData.append('date_time', document.getElementById('complaint-date-time').value);
  formData.append('reported_by', document.getElementById('complaint-reported-by').value);
  formData.append('category', document.getElementById('complaint-category').value);
  formData.append('priority', document.getElementById('complaint-priority').value);
  formData.append('assigned_person', document.getElementById('complaint-assigned-person').value);
  formData.append('status', document.getElementById('complaint-status').value);
  formData.append('issue', document.getElementById('complaint-issue').value);
  formData.append('action_taken', document.getElementById('complaint-action-taken').value);
  formData.append('resolution', document.getElementById('complaint-resolution').value);
  formData.append('resolution_date', document.getElementById('complaint-resolution-date').value);
  formData.append('remarks', document.getElementById('complaint-remarks').value);

  if (fileInput && fileInput.files[0]) {
    formData.append('document_file', fileInput.files[0]);
  }

  try {
    const url = isEdit ? `/api/complaints/${cId}` : '/api/complaints';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(`Complaint ${isEdit ? 'updated' : 'logged'} successfully!`);
      closeComplaintModal();
      loadComplaints();
    } else {
      alert(data.error || 'Failed to save complaint');
    }
  } catch (err) {
    console.error('Error saving complaint:', err);
    alert('Failed to connect to server.');
  }
}

async function deleteComplaint(cId) {
  if (!confirm('Are you sure you want to delete this complaint record?')) return;
  try {
    const res = await fetch(`/api/complaints/${cId}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    loadComplaints();
  } catch (err) {
    alert('Failed to delete complaint.');
  }
}

// --- SUPER ADMIN DATA HEALTH & SYSTEM PERSISTENCE WORKSPACE ---

async function renderHealthWorkspace(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <div style="padding: 30px; text-align: center; color: #64748B;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.8rem; color: #2563EB;"></i>
      <div style="margin-top: 12px; font-size: 0.9rem; font-weight: 600;">Connecting to active database engine & auditing persistent storage...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/system/health');
    const data = await res.json();

    if (data.error) {
      containerEl.innerHTML = `
        <div style="background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 10px; padding: 20px; color: #991B1B; font-weight: 600;">
          <i class="fa-solid fa-lock" style="margin-right: 8px;"></i> ${data.error}
        </div>
      `;
      return;
    }

    const db = data.database || {};
    const storage = data.storage || {};
    const recs = data.records_summary || {};
    const tCounts = recs.table_counts || {};

    const isPg = db.is_production_cloud;
    const isConn = db.status === 'CONNECTED';

    let tableRowsHtml = '';
    Object.keys(tCounts).sort().forEach(tbl => {
      tableRowsHtml += `
        <tr style="border-bottom: 1px solid #F1F5F9;">
          <td style="padding: 10px 14px; font-weight: 600; color: #334155;"><i class="fa-solid fa-table" style="color: #64748B; margin-right: 8px;"></i> ${tbl}</td>
          <td style="padding: 10px 14px; font-weight: 700; color: #0284C7; text-align: right;">${tCounts[tbl].toLocaleString('en-IN')}</td>
          <td style="padding: 10px 14px; text-align: center;">
            <span style="background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; padding: 3px 10px; border-radius: 12px; font-size: 0.74rem; font-weight: 700;"><i class="fa-solid fa-shield-check"></i> Persisted</span>
          </td>
        </tr>
      `;
    });

    containerEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 1.2rem; color: #0F172A; font-weight: 800;">
            <i class="fa-solid fa-server" style="color: #2563EB;"></i> Data Health & System Persistence Status
          </h3>
          <p style="margin: 4px 0 0 0; font-size: 0.83rem; color: #64748B;">Real-time database connection diagnostics, engine type, table row counts, and storage persistence metrics.</p>
        </div>
        <button onclick="renderHealthWorkspace(document.getElementById('module-page-content'))" style="background: #2563EB; color: #FFFFFF; border: none; padding: 9px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.83rem; display: flex; align-items: center; gap: 8px; box-shadow: 0 1px 3px rgba(37,99,235,0.2);">
          <i class="fa-solid fa-rotate-right"></i> Run Health Audit & Refresh
        </button>
      </div>

      <!-- KPI Summary Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div style="background: #FFFFFF; border: 1px solid ${isConn ? '#A7F3D0' : '#FECACA'}; border-radius: 12px; padding: 18px 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Active Database Engine</div>
          <div style="font-size: 1.35rem; font-weight: 800; color: ${isPg ? '#059669' : '#D97706'}; margin-top: 6px;">${db.engine || 'Unknown'}</div>
          <div style="font-size: 0.78rem; color: #475569; margin-top: 4px; font-weight: 600;"><i class="fa-solid fa-hard-drive" style="color: #64748B;"></i> ${db.persistence_mode || ''}</div>
        </div>

        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Connection Status</div>
          <div style="font-size: 1.35rem; font-weight: 800; color: #047857; margin-top: 6px;"><i class="fa-solid fa-circle-check"></i> ${db.status || 'CONNECTED'}</div>
          <div style="font-size: 0.78rem; color: #64748B; margin-top: 4px;">Latency: <strong style="color: #2563EB;">${db.ping_ms} ms</strong></div>
        </div>

        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">File Storage Engine</div>
          <div style="font-size: 1.35rem; font-weight: 800; color: #2563EB; margin-top: 6px;">${storage.provider || 'Local Storage'}</div>
          <div style="font-size: 0.78rem; color: #64748B; margin-top: 4px;">Total Stored Files: <strong style="color: #0F172A;">${storage.total_files} files</strong></div>
        </div>

        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Total Persisted Records</div>
          <div style="font-size: 1.35rem; font-weight: 800; color: #0F172A; margin-top: 6px;">${recs.total_records ? recs.total_records.toLocaleString('en-IN') : 0}</div>
          <div style="font-size: 0.78rem; color: #64748B; margin-top: 4px;">Across <strong style="color: #0F172A;">${recs.total_tables || 0} Active Tables</strong></div>
        </div>
      </div>

      <!-- Table Breakdown Grid -->
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
        <div style="padding: 14px 20px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-size: 0.88rem; color: #334155;"><i class="fa-solid fa-list-check" style="color: #64748B; margin-right: 6px;"></i> Detailed Table Persistence Breakdown</span>
          <span style="font-size: 0.78rem; color: #047857; font-weight: 700; background: #ECFDF5; padding: 3px 10px; border-radius: 12px; border: 1px solid #A7F3D0;"><i class="fa-solid fa-lock"></i> All Records Intact</span>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="background: #F1F5F9; text-align: left; color: #475569;">
                <th style="padding: 11px 16px;">Database Table Name</th>
                <th style="padding: 11px 16px; text-align: right;">Total Active Records</th>
                <th style="padding: 11px 16px; text-align: center;">Persistence Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Health workspace error:", err);
    containerEl.innerHTML = `<div style="padding: 20px; color: #DC2626;">Failed to load system health data.</div>`;
  }
}

// --- GOOGLE SHEETS INTEGRATION & SYNCHRONIZATION WORKSPACE ---

async function renderGoogleSheetsWorkspace(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <div style="padding: 30px; text-align: center; color: #64748B;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.8rem; color: #0284C7;"></i>
      <div style="margin-top: 12px; font-size: 0.9rem; font-weight: 600;">Loading Google Sheets Integration status...</div>
    </div>
  `;

  await loadGoogleSheetsWorkspace(containerEl);
}

async function loadGoogleSheetsWorkspace(containerEl) {
  try {
    const [configRes, logsRes] = await Promise.all([
      fetch('/api/google_sheets/config'),
      fetch('/api/google_sheets/logs')
    ]);

    const configData = await configRes.json();
    const logsData = await logsRes.json();

    if (configData.error && configRes.status === 403) {
      containerEl.innerHTML = `
        <div style="background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 10px; padding: 20px; color: #991B1B; font-weight: 600;">
          <i class="fa-solid fa-shield-halved" style="margin-right: 8px;"></i> Access Restricted: ${configData.error}
        </div>
      `;
      return;
    }

    const cfg = configData.config || {};
    const logs = logsData.logs || [];

    const isConn = cfg.last_status === 'CONNECTED' || cfg.last_status === 'SUCCESS';
    const statusBadgeHtml = cfg.is_active 
      ? `<span style="padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; background: ${isConn ? '#DCFCE7' : '#FEF3C7'}; color: ${isConn ? '#166534' : '#92400E'}; display: inline-flex; align-items: center; gap: 6px;">
           <i class="fa-solid ${isConn ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${isConn ? 'Connected & Active' : (cfg.last_status || 'Configured')}
         </span>`
      : `<span style="padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; background: #F1F5F9; color: #64748B; display: inline-flex; align-items: center; gap: 6px;">
           <i class="fa-solid fa-circle-pause"></i> Sync Disabled
         </span>`;

    let logsRowsHtml = '';
    if (logs.length === 0) {
      logsRowsHtml = `<tr><td colspan="6" style="text-align: center; color: #94A3B8; padding: 20px;">No synchronization log events recorded yet.</td></tr>`;
    } else {
      logs.forEach(l => {
        const isOk = l.status === 'SUCCESS';
        const stBadge = isOk 
          ? `<span style="padding: 2px 8px; border-radius: 12px; background: #DCFCE7; color: #15803D; font-size: 0.72rem; font-weight: 700;">SUCCESS</span>`
          : `<span style="padding: 2px 8px; border-radius: 12px; background: #FEF2F2; color: #B91C1C; font-size: 0.72rem; font-weight: 700;">FAILED</span>`;

        logsRowsHtml += `
          <tr style="border-bottom: 1px solid #F1F5F9;">
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #64748B;">${l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : 'N/A'}</td>
            <td style="padding: 10px 12px; font-weight: 600; color: #1E293B;">${l.module_name || 'N/A'}</td>
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #475569;">${l.record_identifier || 'N/A'}</td>
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #475569;">${l.action || 'SYNC'}</td>
            <td style="padding: 10px 12px; text-align: center;">${stBadge}</td>
            <td style="padding: 10px 12px; font-size: 0.78rem; color: ${isOk ? '#64748B' : '#DC2626'}; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${l.error_message || ''}">
              ${l.error_message || (isOk ? 'Synced cleanly to sheet' : 'Unknown error')}
            </td>
          </tr>
        `;
      });
    }

    containerEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Status Header Card -->
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px 26px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #0F172A;">Google Sheets Unified Sync Engine</h3>
                ${statusBadgeHtml}
              </div>
              <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #64748B;">
                Automated composite record upsert, dynamic column discovery, and single-spreadsheet module tab mapping.
              </p>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button onclick="testGoogleSheetsConnection()" class="btn" style="background: #0284C7; color: #FFFFFF; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem;">
                <i class="fa-solid fa-plug-circle-check"></i> Test Connection
              </button>
              <button onclick="triggerGoogleSheetsSyncAll()" class="btn" style="background: #16A34A; color: #FFFFFF; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem;">
                <i class="fa-solid fa-rotate"></i> Sync All Modules Now
              </button>
              <button onclick="triggerGoogleSheetsRetryFailed()" class="btn" style="background: #EA580C; color: #FFFFFF; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem;">
                <i class="fa-solid fa-arrows-rotate"></i> Retry Failed Syncs
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px; padding-top: 18px; border-top: 1px solid #F1F5F9;">
            <div>
              <div style="font-size: 0.75rem; color: #64748B; font-weight: 600; text-transform: uppercase;">Active Spreadsheet ID</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: #1E293B; margin-top: 4px; font-family: monospace; word-break: break-all;">
                ${cfg.spreadsheet_id || '<span style="color: #94A3B8; font-weight: 400;">Not configured yet</span>'}
              </div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #64748B; font-weight: 600; text-transform: uppercase;">Service Account Identity</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: #0284C7; margin-top: 4px; font-family: monospace;">
                ${cfg.service_account_email || 'Server Environment File / Secret'}
              </div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #64748B; font-weight: 600; text-transform: uppercase;">Last Synchronization</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: #1E293B; margin-top: 4px;">
                ${cfg.last_sync_at ? new Date(cfg.last_sync_at).toLocaleString('en-IN') : 'Never'}
              </div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #64748B; font-weight: 600; text-transform: uppercase;">Sync Status / Detail</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: ${isConn ? '#16A34A' : '#D97706'}; margin-top: 4px;">
                ${cfg.last_status || 'Idle'} ${cfg.error_message ? `(${cfg.error_message})` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Configuration Settings Form & Security Card -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          
          <!-- Configuration Form -->
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <h4 style="margin: 0 0 16px 0; font-size: 1.05rem; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-sliders" style="color: #0284C7;"></i> Integration Configuration
            </h4>

            <form onsubmit="saveGoogleSheetsConfig(event); return false;">
              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Google Spreadsheet ID *</label>
                <input type="text" id="sheets-spreadsheet-id" value="${cfg.spreadsheet_id || ''}" placeholder="e.g. 1BxiMVs0XRA5nFMdKbBUI6H6OrXmT..." style="width: 100%; padding: 10px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 0.88rem; font-family: monospace; box-sizing: border-box;" required>
                <div style="font-size: 0.75rem; color: #64748B; margin-top: 4px;">Extracted from your Google Sheet URL (docs.google.com/spreadsheets/d/<b>SPREADSHEET_ID</b>/edit)</div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 10px; font-size: 0.88rem; font-weight: 600; color: #334155; cursor: pointer;">
                  <input type="checkbox" id="sheets-is-active" ${cfg.is_active ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #0284C7;">
                  Enable Google Sheets Integration
                </label>
                <label style="display: flex; align-items: center; gap: 10px; font-size: 0.88rem; font-weight: 600; color: #334155; cursor: pointer;">
                  <input type="checkbox" id="sheets-auto-sync" ${cfg.auto_sync_enabled !== false ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #0284C7;">
                  Automatic Real-time Sync on Create/Edit
                </label>
              </div>

              <button type="submit" id="save-sheets-config-btn" style="background: #0284C7; color: #FFFFFF; font-weight: 600; padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-floppy-disk"></i> Save Configuration
              </button>
            </form>
          </div>

          <!-- Security & Architecture Card -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px;">
            <h4 style="margin: 0 0 14px 0; font-size: 1.05rem; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-shield-halved" style="color: #16A34A;"></i> Security & Data Isolation Controls
            </h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.83rem; color: #475569; display: flex; flex-direction: column; gap: 10px;">
              <li><b>Zero Credential Leaks</b>: Service Account private keys (<code>client_email</code>, <code>private_key</code>) are stored strictly in server-side environment variables or <code>config/google_service_account.json</code>. Never stored in database tables or exposed to the browser UI.</li>
              <li><b>Sensitive Field Sanitization</b>: Passwords, password hashes, security tokens, and permission manifests are automatically stripped before sending data to Google Sheets.</li>
              <li><b>Single Unified Spreadsheet Architecture</b>: All 16 software modules share one central Google Sheet with dedicated auto-created tab worksheets (<code>Leads</code>, <code>Franchises</code>, <code>Payments</code>, etc.).</li>
              <li><b>Composite Unique Key Upsert</b>: Each record uses a unique <code>Record ID</code> (Column A) and composite key (<code>MODULE:ID</code>) to update existing rows and prevent duplicate entries.</li>
            </ul>
          </div>
        </div>

        <!-- Synchronization Log History -->
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-list-check" style="color: #6366F1;"></i> Synchronization Activity Log
            </h4>
            <button onclick="renderGoogleSheetsWorkspace(document.getElementById('module-page-content'))" style="background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-arrows-rotate"></i> Refresh Logs
            </button>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                  <th style="padding: 10px 12px; font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Timestamp</th>
                  <th style="padding: 10px 12px; font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Module Name</th>
                  <th style="padding: 10px 12px; font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Record Identifier</th>
                  <th style="padding: 10px 12px; font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Action</th>
                  <th style="padding: 10px 12px; font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase; text-align: center;">Status</th>
                  <th style="padding: 10px 12px; font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Details / Error</th>
                </tr>
              </thead>
              <tbody>
                ${logsRowsHtml}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  } catch (err) {
    console.error("Error loading Google Sheets Workspace:", err);
    containerEl.innerHTML = `<div style="padding: 20px; color: #DC2626;">Failed to load Google Sheets configuration.</div>`;
  }
}

async function saveGoogleSheetsConfig(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('save-sheets-config-btn');
  if (btn) btn.disabled = true;

  const spreadsheetId = document.getElementById('sheets-spreadsheet-id').value.trim();
  const isActive = document.getElementById('sheets-is-active').checked;
  const autoSyncEnabled = document.getElementById('sheets-auto-sync').checked;

  try {
    const res = await fetch('/api/google_sheets/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheet_id: spreadsheetId,
        is_active: isActive,
        auto_sync_enabled: autoSyncEnabled
      })
    });
    const data = await res.json();
    if (res.ok && data.status === 'SUCCESS') {
      alert("Google Sheets configuration saved successfully!");
      renderGoogleSheetsWorkspace(document.getElementById('module-page-content'));
    } else {
      alert("Failed to save configuration: " + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Save config error:", err);
    alert("An error occurred while saving configuration.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function testGoogleSheetsConnection() {
  try {
    const res = await fetch('/api/google_sheets/test', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.status === 'SUCCESS') {
      alert(`✅ Connection Successful!\nSpreadsheet Title: ${data.title}\nSpreadsheet ID: ${data.spreadsheet_id}`);
      renderGoogleSheetsWorkspace(document.getElementById('module-page-content'));
    } else {
      alert(`❌ Connection Test Failed:\n${data.error || 'Check service account JSON and spreadsheet permission (share with client_email).'}`);
    }
  } catch (err) {
    console.error("Test connection error:", err);
    alert("Error testing Google Sheets connection.");
  }
}

async function triggerGoogleSheetsSyncAll() {
  if (!confirm("Are you sure you want to synchronize all software module records to Google Sheets now?")) return;
  
  try {
    const res = await fetch('/api/google_sheets/sync_all', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.status === 'SUCCESS') {
      alert(`✅ Synchronization Completed!\nTotal Records Processed: ${data.total_synced}\nFailed Items: ${data.total_failed}`);
      renderGoogleSheetsWorkspace(document.getElementById('module-page-content'));
    } else {
      alert(`❌ Sync Failed:\n${data.error || 'Check Google Sheets settings.'}`);
    }
  } catch (err) {
    console.error("Sync all error:", err);
    alert("Error executing sync all data.");
  }
}

async function triggerGoogleSheetsRetryFailed() {
  try {
    const res = await fetch('/api/google_sheets/retry_failed', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.status === 'SUCCESS') {
      alert(`✅ Retry Execution Completed!\nRetried Logs: ${data.total_retried}\nNewly Synced: ${data.total_synced}`);
      renderGoogleSheetsWorkspace(document.getElementById('module-page-content'));
    } else {
      alert(`❌ Retry Failed:\n${data.error || 'No failed logs to retry or connection issue.'}`);
    }
  } catch (err) {
    console.error("Retry failed error:", err);
    alert("Error retrying failed sync items.");
  }
}

// --- SURVEY, SITE VISIT & APPROVAL WORKFLOW MODULE ---

let allSurveysList = [];
let allAgreementsList = [];

async function renderSurveyWorkspace(containerEl) {
  containerEl.innerHTML = `
    <!-- Top Stats / KPI Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #64748B; text-transform: uppercase;">Total Site Surveys</div>
        <div id="survey-kpi-total" style="font-size: 1.5rem; font-weight: 800; color: #0F172A; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Version History Preserved</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #D97706; text-transform: uppercase;">Under Review</div>
        <div id="survey-kpi-review" style="font-size: 1.5rem; font-weight: 800; color: #D97706; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Feasibility Assessment</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #059669; text-transform: uppercase;">Approved Sites</div>
        <div id="survey-kpi-approved" style="font-size: 1.5rem; font-weight: 800; color: #059669; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Ready for Commercials</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #2563EB; text-transform: uppercase;">Average Rating Score</div>
        <div id="survey-kpi-avg-score" style="font-size: 1.5rem; font-weight: 800; color: #2563EB; margin-top: 4px;">0.0 / 10</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Site Feasibility Index</div>
      </div>
    </div>

    <!-- Filters & Actions -->
    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 18px; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 10px;">
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; flex: 1;">
        <input type="text" id="survey-search-input" placeholder="Search Surveyor, Customer, Remarks..." onkeyup="filterSurveysList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; width: 250px;">
        <select id="survey-status-filter" onchange="filterSurveysList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; font-weight: 600;">
          <option value="ALL">All Workflow Statuses</option>
          <option value="Under Review">Under Review</option>
          <option value="Approved">Approved</option>
          <option value="Pending Changes">Pending Changes</option>
          <option value="Rejected">Rejected</option>
          <option value="Agreement Signed">Agreement Signed</option>
        </select>
        <select id="survey-franchise-filter" onchange="filterSurveysList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem;">
          <option value="">All Franchises & Leads</option>
        </select>
      </div>
      <button onclick="openSurveyModal()" style="background: #2563EB; color: #FFFFFF; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-plus"></i> Upload Site Survey Report
      </button>
    </div>

    <!-- Data Table -->
    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <table class="custom-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Version</th>
            <th>Franchise / Lead</th>
            <th>Surveyor & Date</th>
            <th>Site Metrics (Area/Front/Footfall/Rent)</th>
            <th>Rating Score</th>
            <th>Workflow Status</th>
            <th>PDF Report</th>
            <th>Approval Info</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="survey-table-body">
          <tr><td colspan="9" style="text-align: center; padding: 20px; color: #64748B;">Loading site surveys...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  await populateFranchiseAndLeadDropdown('survey-franchise-filter');
  await loadSurveysData();
}

async function loadSurveysData() {
  try {
    const res = await fetch('/api/surveys');
    allSurveysList = await res.json();

    const totalCount = allSurveysList.length;
    const reviewCount = allSurveysList.filter(s => s.status === 'Under Review' || !s.status).length;
    const approvedCount = allSurveysList.filter(s => s.status === 'Approved' || s.status === 'Agreement Signed').length;
    
    let totalScore = 0;
    allSurveysList.forEach(s => totalScore += (s.rating_score || 0));
    const avgScore = totalCount > 0 ? (totalScore / totalCount).toFixed(1) : '0.0';

    if (document.getElementById('survey-kpi-total')) {
      document.getElementById('survey-kpi-total').innerText = totalCount;
      document.getElementById('survey-kpi-review').innerText = reviewCount;
      document.getElementById('survey-kpi-approved').innerText = approvedCount;
      document.getElementById('survey-kpi-avg-score').innerText = `${avgScore} / 10`;
    }

    renderSurveysTableRows(allSurveysList);
  } catch (err) {
    console.error("Failed to load surveys data:", err);
  }
}

function renderSurveysTableRows(surveys) {
  const tbody = document.getElementById('survey-table-body');
  if (!tbody) return;

  if (!surveys || surveys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #64748B;">No site survey records found. Click "+ Upload Site Survey Report" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = surveys.map(s => {
    const targetName = s.franchise_name ? `<span style="color:#0F172A; font-weight:700;">${s.franchise_name}</span>` :
                       s.lead_name ? `<span style="color:#2563EB; font-weight:600;">Lead: ${s.lead_name}</span>` :
                       (s.customer_name || 'N/A');

    const statusBg = s.status === 'Approved' ? 'background:#D1FAE5; color:#059669;' :
                     s.status === 'Agreement Signed' ? 'background:#DBEAFE; color:#1D4ED8;' :
                     s.status === 'Rejected' ? 'background:#FEE2E2; color:#DC2626;' :
                     s.status === 'Pending Changes' ? 'background:#FFEDD5; color:#C2410C;' :
                     'background:#FEF3C7; color:#D97706;';

    return `
      <tr>
        <td><span class="records-badge" style="background:#EFF6FF; color:#2563EB; font-weight:700;">v${s.version_number}</span></td>
        <td>${targetName}</td>
        <td><b>${s.surveyor_name || 'Inspector'}</b><br><span style="font-size:0.75rem; color:#64748B;">${s.survey_date || ''}</span></td>
        <td>
          <div style="font-size:0.8rem;">
            <b>${s.area_sqft || 0}</b> sqft • <b>${s.frontage_ft || 0}</b>ft front<br>
            <span style="color:#64748B;">Footfall: <b>${s.daily_footfall || 0}</b>/day • Rent: <b>Rs. ${(s.monthly_rent||0).toLocaleString('en-IN')}</b></span>
          </div>
        </td>
        <td><b style="color: #D97706;"><i class="fa-solid fa-star"></i> ${(s.rating_score || 0).toFixed(1)} / 10</b></td>
        <td><span class="records-badge" style="${statusBg}">${s.status || 'Under Review'}</span></td>
        <td>
          ${s.pdf_filepath ? `
            <button onclick="previewPDF('${s.pdf_filepath}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-file-pdf"></i> Preview
            </button>
          ` : '<span style="color:#94A3B8; font-size:0.78rem;">No PDF</span>'}
        </td>
        <td>
          ${s.approved_by ? `<div style="font-size:0.78rem;"><b>${s.approved_by}</b><br><span style="color:#64748B;">${s.approval_date || ''}</span></div>` : '<span style="color:#94A3B8; font-size:0.78rem;">-</span>'}
        </td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            <button onclick="openExtractedJsonModalBySurveyId(${s.id})" style="background:#F1F5F9; color:#334155; border:1px solid #CBD5E1; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Review & Edit Extracted Info">
              <i class="fa-solid fa-sliders"></i> Edit
            </button>
            <button onclick="openApprovalModalBySurveyId(${s.id})" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Workflow Status Change">
              <i class="fa-solid fa-check-to-slot"></i> Status
            </button>
            <button onclick="deleteSurveyVersion(${s.id})" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; padding:3px 6px; border-radius:6px; font-size:0.75rem; cursor:pointer;" title="Delete Version">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterSurveysList() {
  const searchQ = (document.getElementById('survey-search-input')?.value || '').toLowerCase();
  const statusF = document.getElementById('survey-status-filter')?.value || 'ALL';
  const fFilter = document.getElementById('survey-franchise-filter')?.value || '';

  const filtered = allSurveysList.filter(s => {
    const matchesSearch = !searchQ ||
      (s.surveyor_name || '').toLowerCase().includes(searchQ) ||
      (s.customer_name || '').toLowerCase().includes(searchQ) ||
      (s.franchise_name || '').toLowerCase().includes(searchQ) ||
      (s.lead_name || '').toLowerCase().includes(searchQ) ||
      (s.remarks || '').toLowerCase().includes(searchQ);

    const matchesStatus = statusF === 'ALL' || s.status === statusF;

    let matchesFranchise = true;
    if (fFilter) {
      if (fFilter.startsWith('f_')) {
        matchesFranchise = s.franchise_id === parseInt(fFilter.replace('f_', ''));
      } else if (fFilter.startsWith('l_')) {
        matchesFranchise = s.lead_id === parseInt(fFilter.replace('l_', ''));
      }
    }

    return matchesSearch && matchesStatus && matchesFranchise;
  });

  renderSurveysTableRows(filtered);
}

// --- APPROVAL & COMMERCIAL AGREEMENTS WORKSPACE ---

async function renderAgreementWorkspace(containerEl) {
  containerEl.innerHTML = `
    <!-- Top Stats / KPI Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #64748B; text-transform: uppercase;">Commercial Agreements</div>
        <div id="agreement-kpi-total" style="font-size: 1.5rem; font-weight: 800; color: #0F172A; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Legal & Franchising Contracts</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #059669; text-transform: uppercase;">Approved Site Feasibilities</div>
        <div id="agreement-kpi-approved-surveys" style="font-size: 1.5rem; font-weight: 800; color: #059669; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Passed Inspection</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #2563EB; text-transform: uppercase;">Agreements Signed</div>
        <div id="agreement-kpi-signed" style="font-size: 1.5rem; font-weight: 800; color: #2563EB; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Fully Executed Docs</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #D97706; text-transform: uppercase;">Under Legal Review</div>
        <div id="agreement-kpi-pending" style="font-size: 1.5rem; font-weight: 800; color: #D97706; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Awaiting Execution</div>
      </div>
    </div>

    <!-- Filters & Upload Action -->
    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 18px; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 10px;">
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; flex: 1;">
        <input type="text" id="agreement-search-input" placeholder="Search Franchise, Lead or Evaluator..." onkeyup="filterAgreementsList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; width: 260px;">
        <select id="agreement-status-filter" onchange="filterAgreementsList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; font-weight: 600;">
          <option value="ALL">All Agreement Stages</option>
          <option value="Approved">Approved Site</option>
          <option value="Agreement Signed">Agreement Signed</option>
          <option value="Under Review">Under Review</option>
          <option value="Pending Changes">Pending Changes</option>
        </select>
      </div>
      <button onclick="openUploadDocumentModal('Agreement')" style="background: #059669; color: #FFFFFF; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-file-signature"></i> Upload Signed Agreement Doc
      </button>
    </div>

    <!-- Master Table -->
    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <table class="custom-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Franchise / Lead Target</th>
            <th>Latest Feasibility Score</th>
            <th>Agreement Stage</th>
            <th>Approved By</th>
            <th>Approval Date</th>
            <th>Survey PDF</th>
            <th>Signed Contract Doc</th>
            <th>Workflow Actions</th>
          </tr>
        </thead>
        <tbody id="agreement-table-body">
          <tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748B;">Loading commercial agreements...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  await loadAgreementsData();
}

async function loadAgreementsData() {
  try {
    const [surveysRes, docsRes] = await Promise.all([
      fetch('/api/surveys'),
      fetch('/api/documents?stage_name=Agreement')
    ]);

    const surveys = await surveysRes.json();
    const agreementDocs = await docsRes.json();

    allAgreementsList = surveys;

    const totalAgreements = surveys.length;
    const approvedSurveys = surveys.filter(s => s.status === 'Approved' || s.status === 'Agreement Signed').length;
    const signedCount = surveys.filter(s => s.status === 'Agreement Signed').length;
    const pendingCount = surveys.filter(s => s.status === 'Under Review' || s.status === 'Pending Changes').length;

    if (document.getElementById('agreement-kpi-total')) {
      document.getElementById('agreement-kpi-total').innerText = totalAgreements;
      document.getElementById('agreement-kpi-approved-surveys').innerText = approvedSurveys;
      document.getElementById('agreement-kpi-signed').innerText = signedCount;
      document.getElementById('agreement-kpi-pending').innerText = pendingCount;
    }

    renderAgreementsTableRows(surveys, agreementDocs);
  } catch (err) {
    console.error("Failed to load agreements data:", err);
  }
}

function renderAgreementsTableRows(surveys, agreementDocs = []) {
  const tbody = document.getElementById('agreement-table-body');
  if (!tbody) return;

  if (!surveys || surveys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748B;">No commercial agreement workflow records. Upload a site survey report first.</td></tr>`;
    return;
  }

  tbody.innerHTML = surveys.map(s => {
    const targetName = s.franchise_name ? `<span style="color:#0F172A; font-weight:700;">${s.franchise_name}</span>` :
                       s.lead_name ? `<span style="color:#2563EB; font-weight:600;">Lead: ${s.lead_name}</span>` :
                       (s.customer_name || 'N/A');

    const linkedDoc = agreementDocs.find(d => (s.franchise_id && d.franchise_id === s.franchise_id) || (s.lead_id && d.lead_id === s.lead_id));

    const statusBg = s.status === 'Agreement Signed' ? 'background:#DBEAFE; color:#1D4ED8;' :
                     s.status === 'Approved' ? 'background:#D1FAE5; color:#059669;' :
                     s.status === 'Rejected' ? 'background:#FEE2E2; color:#DC2626;' :
                     'background:#FEF3C7; color:#D97706;';

    return `
      <tr>
        <td>${targetName}</td>
        <td>
          <b style="color: #D97706;"><i class="fa-solid fa-star"></i> ${(s.rating_score || 0).toFixed(1)} / 10</b>
          <br><span style="font-size:0.75rem; color:#64748B;">${s.area_sqft || 0} sqft • v${s.version_number}</span>
        </td>
        <td><span class="records-badge" style="${statusBg}">${s.status || 'Under Review'}</span></td>
        <td><b>${s.approved_by || '-'}</b></td>
        <td><span style="font-size:0.8rem; color:#64748B;">${s.approval_date || '-'}</span></td>
        <td>
          ${s.pdf_filepath ? `
            <button onclick="previewPDF('${s.pdf_filepath}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">
              <i class="fa-solid fa-file-pdf"></i> Site Report
            </button>
          ` : '-'}
        </td>
        <td>
          ${linkedDoc ? `
            <button onclick="previewPDF('${linkedDoc.file_path}')" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">
              <i class="fa-solid fa-file-contract"></i> Signed Contract
            </button>
          ` : `
            <button onclick="openUploadDocumentModal('Agreement', ${s.franchise_id || 'null'}, ${s.lead_id || 'null'})" style="background:#F8FAFC; color:#64748B; border:1px dashed #CBD5E1; padding:3px 8px; border-radius:6px; font-size:0.75rem; cursor:pointer;">
              + Upload Doc
            </button>
          `}
        </td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            <button onclick="openApprovalModalBySurveyId(${s.id})" style="background:#2563EB; color:#FFFFFF; border:none; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">
              <i class="fa-solid fa-check-to-slot"></i> Change Stage
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAgreementsList() {
  const searchQ = (document.getElementById('agreement-search-input')?.value || '').toLowerCase();
  const statusF = document.getElementById('agreement-status-filter')?.value || 'ALL';

  const filtered = allAgreementsList.filter(s => {
    const matchesSearch = !searchQ ||
      (s.customer_name || '').toLowerCase().includes(searchQ) ||
      (s.franchise_name || '').toLowerCase().includes(searchQ) ||
      (s.lead_name || '').toLowerCase().includes(searchQ) ||
      (s.approved_by || '').toLowerCase().includes(searchQ);

    const matchesStatus = statusF === 'ALL' || s.status === statusF;
    return matchesSearch && matchesStatus;
  });

  renderAgreementsTableRows(filtered);
}

// --- MODALS FOR SURVEY & APPROVAL WORKFLOW ---

async function openSurveyModal(targetFranchiseId = null, targetLeadId = null) {
  document.getElementById('modal-title').innerText = 'Upload Site Survey & Location Feasibility Report';
  
  const [fRes, lRes] = await Promise.all([
    fetch('/api/franchises'),
    fetch('/api/leads')
  ]);
  const franchises = await fRes.json();
  const leads = await lRes.json();

  let targetOptions = `<option value="">Select Target Franchise or Inquiry Lead...</option>`;
  targetOptions += `<optgroup label="Active / Existing Franchises">`;
  franchises.forEach(f => {
    const sel = targetFranchiseId && f.id === targetFranchiseId ? 'selected' : '';
    targetOptions += `<option value="f_${f.id}" ${sel}>Franchise: ${f.name} (${f.owner_name})</option>`;
  });
  targetOptions += `</optgroup><optgroup label="Pre-Franchise Inquiries / Leads">`;
  leads.forEach(l => {
    const sel = targetLeadId && l.id === targetLeadId ? 'selected' : '';
    targetOptions += `<option value="l_${l.id}" ${sel}>Lead: ${l.customer_name} (${l.city || 'City N/A'})</option>`;
  });
  targetOptions += `</optgroup>`;

  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitSurveyForm(event)" style="display: flex; flex-direction: column; gap: 14px;">
      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Link to Franchise or Inquiry Lead *</label>
        <select id="survey-modal-target" required style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
          ${targetOptions}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Surveyor / Inspector Name *</label>
          <input type="text" id="survey-modal-surveyor" required placeholder="e.g. Rajesh Kumar" value="Rajesh Kumar" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Survey Date *</label>
          <input type="date" id="survey-modal-date" required value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Attach Site Survey PDF Report Document</label>
        <input type="file" id="survey-modal-pdf" accept=".pdf,.png,.jpg,.jpeg" style="width:100%; padding:6px; font-size:0.82rem; border:1px solid #CBD5E1; border-radius:6px; background:#F8FAFC;">
        <span style="font-size:0.75rem; color:#64748B;">Upload original PDF site audit report for inline document preview.</span>
      </div>

      <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
        <div style="font-size:0.82rem; font-weight:700; color:#0F172A; margin-bottom:8px;"><i class="fa-solid fa-ruler-combined" style="color:#2563EB;"></i> Key Extracted Site Metrics</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size:0.78rem; font-weight:600;">Area (sq ft)</label>
            <input type="number" step="any" id="survey-modal-area" placeholder="1000" value="1200" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.78rem; font-weight:600;">Frontage (ft)</label>
            <input type="number" step="any" id="survey-modal-frontage" placeholder="25" value="30" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.78rem; font-weight:600;">Daily Footfall</label>
            <input type="number" id="survey-modal-footfall" placeholder="500" value="850" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top:10px;">
          <div>
            <label style="font-size:0.78rem; font-weight:600;">Estimated Monthly Rent (Rs.)</label>
            <input type="number" step="any" id="survey-modal-rent" placeholder="45000" value="50000" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.78rem; font-weight:600;">Feasibility Score (0.0 to 10.0)</label>
            <input type="number" step="0.1" min="0" max="10" id="survey-modal-score" placeholder="8.5" value="8.5" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem; font-weight:700; color:#D97706;">
          </div>
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Remarks & Field Inspection Summary</label>
        <textarea id="survey-modal-remarks" rows="2" placeholder="Site located on main high street near metro station..." style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;"></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
        <button type="button" onclick="closeModal()" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; font-weight: 600;">Cancel</button>
        <button type="submit" style="padding: 8px 20px; border-radius: 6px; border: none; background: #2563EB; color: #FFFFFF; cursor: pointer; font-weight: 600;">Save & Upload Survey Report</button>
      </div>
    </form>
  `;

  document.getElementById('custom-modal').style.display = 'flex';
}

async function submitSurveyForm(e) {
  e.preventDefault();
  const targetVal = document.getElementById('survey-modal-target').value;
  if (!targetVal) {
    alert("Please select a Target Franchise or Inquiry Lead!");
    return;
  }

  const formData = new FormData();
  if (targetVal.startsWith('f_')) {
    formData.append('franchise_id', targetVal.replace('f_', ''));
  } else if (targetVal.startsWith('l_')) {
    formData.append('lead_id', targetVal.replace('l_', ''));
  }

  formData.append('surveyor_name', document.getElementById('survey-modal-surveyor').value);
  formData.append('survey_date', document.getElementById('survey-modal-date').value);
  formData.append('area_sqft', document.getElementById('survey-modal-area').value);
  formData.append('frontage_ft', document.getElementById('survey-modal-frontage').value);
  formData.append('daily_footfall', document.getElementById('survey-modal-footfall').value);
  formData.append('monthly_rent', document.getElementById('survey-modal-rent').value);
  formData.append('rating_score', document.getElementById('survey-modal-score').value);
  formData.append('remarks', document.getElementById('survey-modal-remarks').value);

  const pdfInput = document.getElementById('survey-modal-pdf');
  if (pdfInput && pdfInput.files.length > 0) {
    formData.append('pdf_file', pdfInput.files[0]);
  }

  try {
    const res = await fetch('/api/surveys', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeModal();
      if (activePage === 'survey') renderSurveyWorkspace(document.getElementById('module-page-content'));
      else if (activePage === 'agreement') renderAgreementWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Error saving survey: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Failed to save site survey report.");
  }
}

function openExtractedJsonModalBySurveyId(sId) {
  const survey = allSurveysList.find(s => s.id === sId);
  if (!survey) return;

  document.getElementById('modal-title').innerText = `Review & Edit Extracted Information (Version v${survey.version_number})`;
  
  let extractedObj = {};
  if (survey.extracted_json) {
    try {
      extractedObj = typeof survey.extracted_json === 'string' ? JSON.parse(survey.extracted_json) : survey.extracted_json;
    } catch (e) {}
  }

  document.getElementById('modal-body').innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background:#EFF6FF; border:1px solid #BFDBFE; padding:10px 14px; border-radius:8px; font-size:0.82rem; color:#1E40AF;">
        <i class="fa-solid fa-code-branch"></i> <b>Version History Preservation Engine:</b> Choose <b>"Save as New Version (v${survey.version_number + 1})"</b> to record new site edits while maintaining full historical audit logs of previous survey versions.
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Surveyor Name</label>
          <input type="text" id="edit-surveyor" value="${survey.surveyor_name || ''}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600;">Survey Date</label>
          <input type="date" id="edit-date" value="${survey.survey_date || ''}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
        <div>
          <label style="font-size:0.78rem; font-weight:600;">Area (sq ft)</label>
          <input type="number" step="any" id="edit-area" value="${survey.area_sqft || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:600;">Frontage (ft)</label>
          <input type="number" step="any" id="edit-frontage" value="${survey.frontage_ft || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:600;">Daily Footfall</label>
          <input type="number" id="edit-footfall" value="${survey.daily_footfall || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div>
          <label style="font-size:0.78rem; font-weight:600;">Monthly Rent (Rs.)</label>
          <input type="number" step="any" id="edit-rent" value="${survey.monthly_rent || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:600;">Rating Score (0 to 10)</label>
          <input type="number" step="0.1" id="edit-score" value="${survey.rating_score || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem; font-weight:700; color:#D97706;">
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600;">Extracted Payload (JSON Format Inspection)</label>
        <textarea id="edit-json-str" rows="3" style="width:100%; font-family:monospace; font-size:0.78rem; padding:8px; border-radius:6px; border:1px solid #CBD5E1; background:#F8FAFC;">${JSON.stringify(extractedObj, null, 2)}</textarea>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600;">Remarks / Review Notes</label>
        <textarea id="edit-remarks" rows="2" style="width:100%; padding:8px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">${survey.remarks || ''}</textarea>
      </div>

      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; border-top: 1px solid #E2E8F0; padding-top: 12px;">
        <button type="button" onclick="closeModal()" style="padding: 8px 14px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; font-weight: 600;">Cancel</button>
        <div style="display: flex; gap: 8px;">
          <button type="button" onclick="submitExtractedJsonForm(${survey.id}, false)" style="padding: 8px 14px; border-radius: 6px; border: 1px solid #2563EB; background: #EFF6FF; color: #2563EB; cursor: pointer; font-weight: 600;">Update In-Place (v${survey.version_number})</button>
          <button type="button" onclick="submitExtractedJsonForm(${survey.id}, true)" style="padding: 8px 16px; border-radius: 6px; border: none; background: #059669; color: #FFFFFF; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-code-fork"></i> Save as New Version (v${survey.version_number + 1})
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('custom-modal').style.display = 'flex';
}

async function submitExtractedJsonForm(sId, saveAsNewVersion) {
  let jsonStr = document.getElementById('edit-json-str').value;
  try {
    JSON.parse(jsonStr);
  } catch (e) {
    alert("Invalid JSON format in Extracted Payload textarea.");
    return;
  }

  const payload = {
    surveyor_name: document.getElementById('edit-surveyor').value,
    survey_date: document.getElementById('edit-date').value,
    area_sqft: document.getElementById('edit-area').value,
    frontage_ft: document.getElementById('edit-frontage').value,
    daily_footfall: document.getElementById('edit-footfall').value,
    monthly_rent: document.getElementById('edit-rent').value,
    rating_score: document.getElementById('edit-score').value,
    extracted_json: jsonStr,
    remarks: document.getElementById('edit-remarks').value,
    save_as_new_version: saveAsNewVersion
  };

  try {
    const res = await fetch(`/api/surveys/${sId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeModal();
      if (activePage === 'survey') renderSurveyWorkspace(document.getElementById('module-page-content'));
      else if (activePage === 'agreement') renderAgreementWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Update failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Failed to update site survey.");
  }
}

function openApprovalModalBySurveyId(sId) {
  const survey = allSurveysList.find(s => s.id === sId);
  if (!survey) return;

  document.getElementById('modal-title').innerText = `Workflow & Approval Status Tracker (v${survey.version_number})`;

  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitApprovalForm(event, ${survey.id})" style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
        <div style="font-size:0.85rem; font-weight:700; color:#0F172A;">
          Target: ${survey.franchise_name || survey.lead_name || survey.customer_name || 'N/A'}
        </div>
        <div style="font-size:0.78rem; color:#64748B; margin-top:4px;">
          Version: <b>v${survey.version_number}</b> • Rating: <b>${survey.rating_score}/10</b> • Area: <b>${survey.area_sqft} sqft</b>
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">New Approval Status *</label>
        <select id="approval-status-select" required style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem; font-weight:700;">
          <option value="Under Review" ${survey.status === 'Under Review' ? 'selected' : ''}>Under Review (Feasibility Evaluation)</option>
          <option value="Approved" ${survey.status === 'Approved' ? 'selected' : ''}>Approved (Site Accepted)</option>
          <option value="Pending Changes" ${survey.status === 'Pending Changes' ? 'selected' : ''}>Pending Changes (Re-survey Required)</option>
          <option value="Rejected" ${survey.status === 'Rejected' ? 'selected' : ''}>Rejected (Site Rejected)</option>
          <option value="Agreement Signed" ${survey.status === 'Agreement Signed' ? 'selected' : ''}>Agreement Signed (Contract Executed)</option>
        </select>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Evaluator / Approver Name *</label>
        <input type="text" id="approval-by-input" required value="${survey.approved_by || 'Admin / Management'}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Approval / Review Remarks</label>
        <textarea id="approval-remarks-input" rows="3" placeholder="Provide reason or conditional approval terms..." style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;"></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
        <button type="button" onclick="closeModal()" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; font-weight: 600;">Cancel</button>
        <button type="submit" style="padding: 8px 20px; border-radius: 6px; border: none; background: #059669; color: #FFFFFF; cursor: pointer; font-weight: 600;">Update Status & Log Audit</button>
      </div>
    </form>
  `;

  document.getElementById('custom-modal').style.display = 'flex';
}

async function submitApprovalForm(e, sId) {
  e.preventDefault();
  const payload = {
    status: document.getElementById('approval-status-select').value,
    approved_by: document.getElementById('approval-by-input').value,
    remarks: document.getElementById('approval-remarks-input').value
  };

  try {
    const res = await fetch(`/api/surveys/${sId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeModal();
      if (activePage === 'survey') renderSurveyWorkspace(document.getElementById('module-page-content'));
      else if (activePage === 'agreement') renderAgreementWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Failed to update approval status: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Server error during approval workflow update.");
  }
}

async function openUploadDocumentModal(stageName = 'Agreement', targetFranchiseId = null, targetLeadId = null) {
  document.getElementById('modal-title').innerText = `Upload ${stageName} Document`;

  const [fRes, lRes] = await Promise.all([
    fetch('/api/franchises'),
    fetch('/api/leads')
  ]);
  const franchises = await fRes.json();
  const leads = await lRes.json();

  let targetOptions = `<option value="">Select Target Franchise or Inquiry Lead...</option>`;
  targetOptions += `<optgroup label="Active / Existing Franchises">`;
  franchises.forEach(f => {
    const sel = targetFranchiseId && f.id === targetFranchiseId ? 'selected' : '';
    targetOptions += `<option value="f_${f.id}" ${sel}>Franchise: ${f.name} (${f.owner_name})</option>`;
  });
  targetOptions += `</optgroup><optgroup label="Pre-Franchise Inquiries / Leads">`;
  leads.forEach(l => {
    const sel = targetLeadId && l.id === targetLeadId ? 'selected' : '';
    targetOptions += `<option value="l_${l.id}" ${sel}>Lead: ${l.customer_name}</option>`;
  });
  targetOptions += `</optgroup>`;

  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitDocumentUploadForm(event)" style="display: flex; flex-direction: column; gap: 14px;">
      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Link to Franchise or Lead *</label>
        <select id="doc-modal-target" required style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
          ${targetOptions}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Workflow Stage *</label>
          <input type="text" id="doc-modal-stage" required value="${stageName}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Document Type</label>
          <select id="doc-modal-type" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
            <option value="PDF">PDF Agreement Document</option>
            <option value="Signed Contract">Signed Franchise Contract</option>
            <option value="KYC / Identity">KYC / Identity Document</option>
            <option value="Site Survey">Site Inspection Report</option>
            <option value="Financial">Payment / Financial Slip</option>
          </select>
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Document Title / Description *</label>
        <input type="text" id="doc-modal-title" required placeholder="e.g. Executed Commercial Franchise Agreement 2026" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Select File *</label>
        <input type="file" id="doc-modal-file" required accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem; background:#F8FAFC;">
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Uploaded By</label>
        <input type="text" id="doc-modal-by" value="Legal Dept / Admin" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
        <button type="button" onclick="closeModal()" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; font-weight: 600;">Cancel</button>
        <button type="submit" style="padding: 8px 20px; border-radius: 6px; border: none; background: #059669; color: #FFFFFF; cursor: pointer; font-weight: 600;">Upload & Link Document</button>
      </div>
    </form>
  `;

  document.getElementById('custom-modal').style.display = 'flex';
}

async function submitDocumentUploadForm(e) {
  e.preventDefault();
  const targetVal = document.getElementById('doc-modal-target').value;
  if (!targetVal) {
    alert("Please select a target franchise or lead.");
    return;
  }

  const formData = new FormData();
  if (targetVal.startsWith('f_')) formData.append('franchise_id', targetVal.replace('f_', ''));
  else if (targetVal.startsWith('l_')) formData.append('lead_id', targetVal.replace('l_', ''));

  formData.append('stage_name', document.getElementById('doc-modal-stage').value);
  formData.append('doc_type', document.getElementById('doc-modal-type').value);
  formData.append('doc_title', document.getElementById('doc-modal-title').value);
  formData.append('uploaded_by', document.getElementById('doc-modal-by').value);

  const fileInput = document.getElementById('doc-modal-file');
  if (fileInput && fileInput.files.length > 0) {
    formData.append('file', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeModal();
      if (activePage === 'agreement') renderAgreementWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Upload failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Failed to upload document file.");
  }
}

async function deleteSurveyVersion(sId) {
  if (!confirm("Are you sure you want to delete this survey version record?")) return;
  try {
    const res = await fetch(`/api/surveys/${sId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.status === 'success') {
      if (activePage === 'survey') renderSurveyWorkspace(document.getElementById('module-page-content'));
      else if (activePage === 'agreement') renderAgreementWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    }
  } catch (err) {
    alert("Failed to delete survey record.");
  }
}

async function populateFranchiseAndLeadDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  try {
    const [fRes, lRes] = await Promise.all([
      fetch('/api/franchises'),
      fetch('/api/leads')
    ]);
    const franchises = await fRes.json();
    const leads = await lRes.json();

    let html = `<option value="">All Franchises & Leads</option>`;
    html += `<optgroup label="Franchises">`;
    franchises.forEach(f => {
      html += `<option value="f_${f.id}">${f.name}</option>`;
    });
    html += `</optgroup><optgroup label="Inquiry Leads">`;
    leads.forEach(l => {
      html += `<option value="l_${l.id}">Lead: ${l.customer_name}</option>`;
    });
    html += `</optgroup>`;
    sel.innerHTML = html;
  } catch (e) {}
}

function renderProfileSurveyTab(container, data) {
  const f = data.franchise;
  const surveyList = data.surveys || [];
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3>Site Survey & Location Feasibility Reports (Version History Log)</h3>
      <button class="btn-ref-explore" onclick="openSurveyModal(${f.id})" style="width: auto; padding: 6px 14px;">
        <i class="fa-solid fa-plus"></i> Upload New Survey Version
      </button>
    </div>
    <table class="custom-table">
      <thead>
        <tr>
          <th>Version</th>
          <th>Surveyor & Date</th>
          <th>Metrics (Area/Frontage/Footfall/Rent)</th>
          <th>Rating Score</th>
          <th>Workflow Status</th>
          <th>Approval Info</th>
          <th>PDF Report</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${surveyList.length ? surveyList.map(s => `
          <tr>
            <td><span class="records-badge" style="background:#EFF6FF; color:#2563EB; font-weight:700;">v${s.version_number}</span></td>
            <td><b>${s.surveyor_name || 'Inspector'}</b><br><span style="font-size:0.75rem; color:#64748B;">${s.survey_date || ''}</span></td>
            <td>${s.area_sqft} sqft • ${s.frontage_ft}ft front • ${s.daily_footfall}/day • Rs. ${(s.monthly_rent||0).toLocaleString('en-IN')}/mo</td>
            <td><b style="color: #D97706;"><i class="fa-solid fa-star"></i> ${(s.rating_score||0).toFixed(1)} / 10</b></td>
            <td>
              <span class="records-badge" style="${
                s.status === 'Approved' ? 'background:#D1FAE5; color:#059669;' :
                s.status === 'Agreement Signed' ? 'background:#DBEAFE; color:#1D4ED8;' :
                s.status === 'Rejected' ? 'background:#FEE2E2; color:#DC2626;' :
                s.status === 'Pending Changes' ? 'background:#FFEDD5; color:#C2410C;' :
                'background:#FEF3C7; color:#D97706;'
              }">${s.status || 'Under Review'}</span>
            </td>
            <td>${s.approved_by ? `${s.approved_by}<br><span style="font-size:0.75rem; color:#64748B;">${s.approval_date || ''}</span>` : '-'}</td>
            <td>
              ${s.pdf_filepath ? `
                <button onclick="previewPDF('${s.pdf_filepath}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer;">
                  <i class="fa-solid fa-file-pdf"></i> View PDF
                </button>
              ` : '-'}
            </td>
            <td>
              <div style="display:flex; gap:4px;">
                <button onclick="openExtractedJsonModalBySurveyId(${s.id})" style="background:#F1F5F9; color:#334155; border:1px solid #CBD5E1; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">Edit</button>
                <button onclick="openApprovalModalBySurveyId(${s.id})" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">Status</button>
              </div>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="8" style="text-align: center;">No site survey records found for this franchise profile.</td></tr>'}
      </tbody>
    </table>
  `;
}

function renderProfileDocumentsTab(container, data) {
  const f = data.franchise;
  const docList = data.documents || [];
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3>Franchise Document Repository & Agreement Filings</h3>
      <button class="btn-ref-explore" onclick="openUploadDocumentModal('General', ${f.id})" style="width: auto; padding: 6px 14px;">
        <i class="fa-solid fa-cloud-arrow-up"></i> Upload Document
      </button>
    </div>
    <table class="custom-table">
      <thead>
        <tr><th>Stage</th><th>Document Title</th><th>Doc Type</th><th>File Name</th><th>Uploaded By</th><th>Upload Date</th><th>Preview</th></tr>
      </thead>
      <tbody>
        ${docList.length ? docList.map(d => `
          <tr>
            <td><span class="records-badge">${d.stage_name || 'General'}</span></td>
            <td><b>${d.doc_title}</b></td>
            <td>${d.doc_type || 'PDF'}</td>
            <td>${d.file_name}</td>
            <td>${d.uploaded_by || 'Staff'}</td>
            <td>${d.uploaded_at || ''}</td>
            <td>
              <button onclick="previewPDF('${d.file_path}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-eye"></i> View File
              </button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="7" style="text-align: center;">No documents uploaded for this franchise.</td></tr>'}
      </tbody>
    </table>
  `;
}

// --- INTERIOR & STORE CONSTRUCTION SETUP ENGINE ---

let allInteriorsList = [];

async function renderInteriorWorkspace(containerEl) {
  containerEl.innerHTML = `
    <!-- Top Stats / KPI Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #64748B; text-transform: uppercase;">Total Projects</div>
        <div id="interior-kpi-total" style="font-size: 1.5rem; font-weight: 800; color: #0F172A; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Store Setup Workspaces</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #2563EB; text-transform: uppercase;">Active Construction</div>
        <div id="interior-kpi-inprogress" style="font-size: 1.5rem; font-weight: 800; color: #2563EB; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Planned & In Progress</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #059669; text-transform: uppercase;">Completed Stores</div>
        <div id="interior-kpi-completed" style="font-size: 1.5rem; font-weight: 800; color: #059669; margin-top: 4px;">0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Fully Inspected & Ready</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #7C3AED; text-transform: uppercase;">Total Setup Investment</div>
        <div id="interior-kpi-total-cost" style="font-size: 1.5rem; font-weight: 800; color: #7C3AED; margin-top: 4px;">Rs. 0</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Aggregated Capex Expenses</div>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 0.78rem; font-weight: 600; color: #D97706; text-transform: uppercase;">Avg Completion Progress</div>
        <div id="interior-kpi-avg-progress" style="font-size: 1.5rem; font-weight: 800; color: #D97706; margin-top: 4px;">0%</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Overall Execution Meter</div>
      </div>
    </div>

    <!-- Filters & Create Action -->
    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 18px; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 10px;">
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; flex: 1;">
        <input type="text" id="interior-search-input" placeholder="Search Franchise, Contractor, Inspector..." onkeyup="filterInteriorsList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; width: 260px;">
        <select id="interior-status-filter" onchange="filterInteriorsList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; font-weight: 600;">
          <option value="ALL">All Construction Statuses</option>
          <option value="Planned">Planned</option>
          <option value="In Progress">In Progress</option>
          <option value="Under Inspection">Under Inspection</option>
          <option value="Completed">Completed</option>
          <option value="Delayed">Delayed</option>
        </select>
        <select id="interior-target-filter" onchange="filterInteriorsList()" style="padding: 7px 12px; border-radius: 6px; border: 1px solid #CBD5E1; font-size: 0.82rem; font-weight: 600;">
          <option value="ALL">All Franchises & Leads</option>
          <option value="FRANCHISE">Active Franchises Only</option>
          <option value="LEAD">Inquiry Leads Only</option>
        </select>
      </div>

      <button onclick="openInteriorModal()" style="background: #2563EB; color: #FFFFFF; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-plus"></i> + Add Store Construction Setup
      </button>
    </div>

    <!-- Interior Records Master Table -->
    <div style="overflow-x: auto; border: 1px solid #E2E8F0; border-radius: 10px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.83rem;">
        <thead>
          <tr style="background: #F8FAFC; text-align: left; color: #475569; border-bottom: 1px solid #E2E8F0;">
            <th style="padding: 11px 14px;"># ID</th>
            <th style="padding: 11px 14px;">Linked Target</th>
            <th style="padding: 11px 14px;">Contractor & Inspector</th>
            <th style="padding: 11px 14px;">Timelines (Start / Target / Actual)</th>
            <th style="padding: 11px 14px;">Cost Breakdown & Total Setup Cost</th>
            <th style="padding: 11px 14px;">Progress %</th>
            <th style="padding: 11px 14px;">Status</th>
            <th style="padding: 11px 14px;">Blueprint Design</th>
            <th style="padding: 11px 14px; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody id="interior-table-body">
          <tr><td colspan="9" style="padding: 25px; text-align: center; color: #64748B;">Loading store construction setup records...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  await loadInteriorsData();
}

async function loadInteriorsData() {
  try {
    const res = await fetch('/api/interiors');
    allInteriorsList = await res.json();

    const totalCount = allInteriorsList.length;
    const inProgressCount = allInteriorsList.filter(i => i.status === 'In Progress' || i.status === 'Planned' || i.status === 'Under Inspection').length;
    const completedCount = allInteriorsList.filter(i => i.status === 'Completed').length;
    let totalCostSum = 0;
    let totalPctSum = 0;
    allInteriorsList.forEach(i => {
      totalCostSum += (i.total_cost || 0);
      totalPctSum += (i.completion_percentage || 0);
    });
    const avgPct = totalCount > 0 ? Math.round(totalPctSum / totalCount) : 0;

    if (document.getElementById('interior-kpi-total')) {
      document.getElementById('interior-kpi-total').innerText = totalCount;
      document.getElementById('interior-kpi-inprogress').innerText = inProgressCount;
      document.getElementById('interior-kpi-completed').innerText = completedCount;
      document.getElementById('interior-kpi-total-cost').innerText = `Rs. ${totalCostSum.toLocaleString('en-IN')}`;
      document.getElementById('interior-kpi-avg-progress').innerText = `${avgPct}%`;
    }

    renderInteriorsTableRows(allInteriorsList);
  } catch (err) {
    console.error("Failed to load interiors data:", err);
  }
}

function renderInteriorsTableRows(records) {
  const tbody = document.getElementById('interior-table-body');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 25px; color: #64748B;">No interior construction setup records found. Click "+ Add Store Construction Setup" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(i => {
    const targetName = i.franchise_name ? `<span style="color:#0F172A; font-weight:700;"><i class="fa-solid fa-store" style="color:#2563EB;"></i> ${i.franchise_name}</span>` :
                       i.lead_name ? `<span style="color:#2563EB; font-weight:600;"><i class="fa-solid fa-filter-circle-dollar"></i> Lead: ${i.lead_name}</span>` :
                       (i.customer_name || 'N/A');

    const statusBg = i.status === 'Completed' ? 'background:#D1FAE5; color:#059669;' :
                     i.status === 'In Progress' ? 'background:#DBEAFE; color:#1D4ED8;' :
                     i.status === 'Under Inspection' ? 'background:#FEF3C7; color:#D97706;' :
                     i.status === 'Delayed' ? 'background:#FEE2E2; color:#DC2626;' :
                     'background:#F1F5F9; color:#475569;';

    const blueprintExt = (i.blueprint_filename || '').split('.').pop().toLowerCase();
    const isPdf = blueprintExt === 'pdf';
    const isImage = ['png', 'jpg', 'jpeg'].includes(blueprintExt);

    return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 14px; font-weight: 700; color: #475569;">#${i.id}</td>
        <td style="padding: 10px 14px;">${targetName}</td>
        <td style="padding: 10px 14px;">
          <b>${i.contractor_name || 'Internal Team'}</b><br>
          <span style="font-size: 0.75rem; color: #64748B;">Inspector: ${i.inspected_by || 'Staff'}</span>
        </td>
        <td style="padding: 10px 14px;">
          <div style="font-size: 0.78rem;">
            <b>Start:</b> ${i.start_date || '-'}<br>
            <b>Target:</b> ${i.target_completion_date || '-'}<br>
            ${i.actual_completion_date ? `<span style="color:#059669;"><b>Actual:</b> ${i.actual_completion_date}</span>` : ''}
          </div>
        </td>
        <td style="padding: 10px 14px;">
          <div style="font-size: 0.78rem;">
            <span style="color:#475569;">Civil: <b>Rs. ${(i.civil_cost||0).toLocaleString('en-IN')}</b> • Furniture: <b>Rs. ${(i.carpentry_cost||0).toLocaleString('en-IN')}</b></span><br>
            <span style="color:#475569;">Elec: <b>Rs. ${(i.electrical_cost||0).toLocaleString('en-IN')}</b> • Plumb: <b>Rs. ${(i.plumbing_cost||0).toLocaleString('en-IN')}</b> • HVAC: <b>Rs. ${(i.hvac_cost||0).toLocaleString('en-IN')}</b></span><br>
            <b style="color: #7C3AED; font-size: 0.84rem;">Total Setup Cost: Rs. ${(i.total_cost||0).toLocaleString('en-IN')}</b>
          </div>
        </td>
        <td style="padding: 10px 14px; min-width: 120px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; background: #E2E8F0; border-radius: 6px; height: 8px; overflow: hidden;">
              <div style="width: ${i.completion_percentage||0}%; background: ${i.completion_percentage === 100 ? '#059669' : '#2563EB'}; height: 100%;"></div>
            </div>
            <b style="font-size: 0.78rem; color: #0F172A;">${i.completion_percentage||0}%</b>
          </div>
        </td>
        <td style="padding: 10px 14px;">
          <span class="records-badge" style="${statusBg}">${i.status || 'Planned'}</span>
        </td>
        <td style="padding: 10px 14px;">
          ${i.blueprint_filepath ? (
            isPdf ? `
              <button onclick="previewPDF('${i.blueprint_filepath}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-file-pdf"></i> Blueprint PDF
              </button>
            ` : (isImage ? `
              <button onclick="previewImageModal('${i.blueprint_filename}', '${i.contractor_name||'Blueprint'}')" style="background:#F0FDF4; color:#059669; border:1px solid #A7F3D0; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-image"></i> Blueprint Image
              </button>
            ` : `
              <a href="${i.blueprint_filepath}" target="_blank" style="background:#F1F5F9; color:#334155; border:1px solid #CBD5E1; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; text-decoration:none;">Download File</a>
            `)
          ) : '<span style="color:#94A3B8; font-size:0.78rem;">No Blueprint</span>'}
        </td>
        <td style="padding: 10px 14px; text-align: right;">
          <div style="display:flex; gap:4px; justify-content: flex-end;">
            <button onclick="openUpdateInteriorProgressModalByRecordId(${i.id})" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Update Progress & Status">
              <i class="fa-solid fa-bars-progress"></i> Progress
            </button>
            <button onclick="openInteriorModal(${i.id})" style="background:#F1F5F9; color:#334155; border:1px solid #CBD5E1; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Edit Full Setup">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button onclick="deleteInteriorRecord(${i.id})" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; padding:4px 8px; border-radius:6px; font-size:0.75rem; cursor:pointer;" title="Delete Record">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterInteriorsList() {
  const searchQ = (document.getElementById('interior-search-input')?.value || '').toLowerCase();
  const statusF = document.getElementById('interior-status-filter')?.value || 'ALL';
  const targetF = document.getElementById('interior-target-filter')?.value || 'ALL';

  const filtered = allInteriorsList.filter(i => {
    const matchesSearch = !searchQ ||
      (i.contractor_name || '').toLowerCase().includes(searchQ) ||
      (i.inspected_by || '').toLowerCase().includes(searchQ) ||
      (i.customer_name || '').toLowerCase().includes(searchQ) ||
      (i.franchise_name || '').toLowerCase().includes(searchQ) ||
      (i.lead_name || '').toLowerCase().includes(searchQ) ||
      (i.remarks || '').toLowerCase().includes(searchQ);

    const matchesStatus = statusF === 'ALL' || i.status === statusF;

    let matchesTarget = true;
    if (targetF === 'FRANCHISE') matchesTarget = !!i.franchise_id;
    else if (targetF === 'LEAD') matchesTarget = !!i.lead_id;

    return matchesSearch && matchesStatus && matchesTarget;
  });

  renderInteriorsTableRows(filtered);
}

function previewImageModal(filename, title = 'Blueprint Image') {
  document.getElementById('modal-title').innerText = `Blueprint Preview - ${title}`;
  document.getElementById('modal-body').innerHTML = `
    <div style="text-align: center; padding: 10px;">
      <img src="/uploads/interiors/${filename}" style="max-width: 100%; max-height: 70vh; border-radius: 8px; border: 1px solid #CBD5E1; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" alt="Blueprint Image">
      <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
        <button onclick="closeModal()" style="padding: 8px 18px; border-radius: 6px; border: none; background: #2563EB; color: #FFFFFF; font-weight: 600; cursor: pointer;">Close Preview</button>
      </div>
    </div>
  `;
  document.getElementById('custom-modal').style.display = 'flex';
}

async function openInteriorModal(recordId = null) {
  const isEdit = !!recordId;
  let record = null;
  if (isEdit) {
    record = allInteriorsList.find(i => i.id === recordId);
  }

  document.getElementById('modal-title').innerText = isEdit ? `Edit Interior Setup (#${recordId})` : 'New Interior & Store Construction Setup';

  const [fRes, lRes] = await Promise.all([
    fetch('/api/franchises'),
    fetch('/api/leads')
  ]);
  const franchises = await fRes.json();
  const leads = await lRes.json();

  let targetOptions = `<option value="">Select Target Franchise OR Pre-Franchise Lead...</option>`;
  targetOptions += `<optgroup label="Active / Existing Franchises">`;
  franchises.forEach(f => {
    const sel = record && record.franchise_id === f.id ? 'selected' : '';
    targetOptions += `<option value="f_${f.id}" ${sel}>Franchise: ${f.name} (${f.city})</option>`;
  });
  targetOptions += `</optgroup><optgroup label="Pre-Franchise Inquiry Leads">`;
  leads.forEach(l => {
    const sel = record && record.lead_id === l.id ? 'selected' : '';
    targetOptions += `<option value="l_${l.id}" ${sel}>Lead: ${l.customer_name} (${l.city || 'No City'})</option>`;
  });
  targetOptions += `</optgroup>`;

  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitInteriorForm(event, ${recordId || 'null'})" enctype="multipart/form-data" style="display: flex; flex-direction: column; gap: 14px;">
      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Link to Target Franchise or Lead * (Must pick one)</label>
        <select id="interior-modal-target" required style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
          ${targetOptions}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Contractor / Firm Name *</label>
          <input type="text" id="interior-modal-contractor" required value="${record?.contractor_name || ''}" placeholder="e.g. Apex Civil Contractors Pvt Ltd" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Inspector / Site Manager Name</label>
          <input type="text" id="interior-modal-inspector" value="${record?.inspected_by || 'Interior Lead'}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
        <div>
          <label style="font-size:0.78rem; font-weight:600; color:#334155;">Start Date</label>
          <input type="date" id="interior-modal-start" value="${record?.start_date || ''}" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:600; color:#334155;">Target Completion Date</label>
          <input type="date" id="interior-modal-target-date" value="${record?.target_completion_date || ''}" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:600; color:#334155;">Actual Completion Date</label>
          <input type="date" id="interior-modal-actual-date" value="${record?.actual_completion_date || ''}" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
        </div>
      </div>

      <!-- Cost Breakdown Fields -->
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
        <div style="font-size:0.82rem; font-weight:700; color:#0F172A; margin-bottom:8px;">Capex Cost Breakdown (Auto-Calculates Total Setup Cost)</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;">
          <div>
            <label style="font-size:0.75rem; font-weight:600;">Civil Cost (Rs.)</label>
            <input type="number" step="any" id="interior-modal-civil" oninput="recalcInteriorTotal()" value="${record?.civil_cost || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:600;">Carpentry / Furniture (Rs.)</label>
            <input type="number" step="any" id="interior-modal-carpentry" oninput="recalcInteriorTotal()" value="${record?.carpentry_cost || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:600;">Electrical Cost (Rs.)</label>
            <input type="number" step="any" id="interior-modal-electrical" oninput="recalcInteriorTotal()" value="${record?.electrical_cost || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size:0.75rem; font-weight:600;">Plumbing Cost (Rs.)</label>
            <input type="number" step="any" id="interior-modal-plumbing" oninput="recalcInteriorTotal()" value="${record?.plumbing_cost || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:600;">HVAC Cost (Rs.)</label>
            <input type="number" step="any" id="interior-modal-hvac" oninput="recalcInteriorTotal()" value="${record?.hvac_cost || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem;">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700; color:#7C3AED;">Total Setup Cost (Rs.)</label>
            <input type="number" step="any" id="interior-modal-total-cost" readonly value="${record?.total_cost || 0}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #C4B5FD; background:#F5F3FF; font-size:0.85rem; font-weight:700; color:#7C3AED;">
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Construction Status *</label>
          <select id="interior-modal-status" onchange="handleInteriorStatusChange()" required style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem; font-weight:700;">
            <option value="Planned" ${record?.status === 'Planned' ? 'selected' : ''}>Planned</option>
            <option value="In Progress" ${record?.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Under Inspection" ${record?.status === 'Under Inspection' ? 'selected' : ''}>Under Inspection</option>
            <option value="Completed" ${record?.status === 'Completed' ? 'selected' : ''}>Completed (100% Final)</option>
            <option value="Delayed" ${record?.status === 'Delayed' ? 'selected' : ''}>Delayed</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Completion Progress % (0 to 100)</label>
          <input type="number" min="0" max="100" id="interior-modal-pct" oninput="handleInteriorPctInput()" value="${record?.completion_percentage || 0}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem; font-weight:700; color:#2563EB;">
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Upload Store Blueprint Design (PDF / PNG / JPG)</label>
        <input type="file" id="interior-modal-file" accept=".pdf,.png,.jpg,.jpeg" style="width:100%; padding:6px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.82rem; background:#F8FAFC;">
        ${record?.blueprint_filename ? `<div style="font-size:0.75rem; color:#64748B; margin-top:3px;">Existing Blueprint: <b>${record.blueprint_filename}</b></div>` : ''}
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Remarks / Inspection Notes</label>
        <textarea id="interior-modal-remarks" rows="2" placeholder="Inspection findings, contractor notes, material details..." style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">${record?.remarks || ''}</textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
        <button type="button" onclick="closeModal()" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; font-weight: 600;">Cancel</button>
        <button type="submit" style="padding: 8px 20px; border-radius: 6px; border: none; background: #2563EB; color: #FFFFFF; cursor: pointer; font-weight: 600;">${isEdit ? 'Update Interior Record' : 'Create Interior Setup'}</button>
      </div>
    </form>
  `;

  document.getElementById('custom-modal').style.display = 'flex';
  recalcInteriorTotal();
}

function recalcInteriorTotal() {
  const civil = parseFloat(document.getElementById('interior-modal-civil')?.value || 0);
  const carp = parseFloat(document.getElementById('interior-modal-carpentry')?.value || 0);
  const elec = parseFloat(document.getElementById('interior-modal-electrical')?.value || 0);
  const plumb = parseFloat(document.getElementById('interior-modal-plumbing')?.value || 0);
  const hvac = parseFloat(document.getElementById('interior-modal-hvac')?.value || 0);
  const total = civil + carp + elec + plumb + hvac;
  const totalEl = document.getElementById('interior-modal-total-cost');
  if (totalEl) totalEl.value = total;
}

function handleInteriorStatusChange() {
  const st = document.getElementById('interior-modal-status')?.value;
  const pctEl = document.getElementById('interior-modal-pct');
  if (st === 'Completed' && pctEl) {
    pctEl.value = 100;
  }
}

function handleInteriorPctInput() {
  const pctEl = document.getElementById('interior-modal-pct');
  const stEl = document.getElementById('interior-modal-status');
  if (!pctEl || !stEl) return;
  let val = parseInt(pctEl.value || 0);
  if (val > 100) {
    val = 100;
    pctEl.value = 100;
  }
  if (val < 0) {
    val = 0;
    pctEl.value = 0;
  }
  if (val === 100) {
    stEl.value = 'Completed';
  } else if (val > 0 && stEl.value === 'Planned') {
    stEl.value = 'In Progress';
  }
}

async function submitInteriorForm(e, recordId = null) {
  e.preventDefault();
  const targetVal = document.getElementById('interior-modal-target').value;
  if (!targetVal) {
    alert("Please select a target Franchise or Lead.");
    return;
  }

  const formData = new FormData();
  if (targetVal.startsWith('f_')) formData.append('franchise_id', targetVal.replace('f_', ''));
  else if (targetVal.startsWith('l_')) formData.append('lead_id', targetVal.replace('l_', ''));

  formData.append('contractor_name', document.getElementById('interior-modal-contractor').value);
  formData.append('inspected_by', document.getElementById('interior-modal-inspector').value);
  formData.append('start_date', document.getElementById('interior-modal-start').value);
  formData.append('target_completion_date', document.getElementById('interior-modal-target-date').value);
  formData.append('actual_completion_date', document.getElementById('interior-modal-actual-date').value);

  formData.append('civil_cost', document.getElementById('interior-modal-civil').value || 0);
  formData.append('carpentry_cost', document.getElementById('interior-modal-carpentry').value || 0);
  formData.append('electrical_cost', document.getElementById('interior-modal-electrical').value || 0);
  formData.append('plumbing_cost', document.getElementById('interior-modal-plumbing').value || 0);
  formData.append('hvac_cost', document.getElementById('interior-modal-hvac').value || 0);

  formData.append('completion_percentage', document.getElementById('interior-modal-pct').value || 0);
  formData.append('status', document.getElementById('interior-modal-status').value);
  formData.append('remarks', document.getElementById('interior-modal-remarks').value);

  const fileInput = document.getElementById('interior-modal-file');
  if (fileInput && fileInput.files.length > 0) {
    formData.append('blueprint', fileInput.files[0]);
  }

  const url = recordId ? `/api/interiors/${recordId}` : '/api/interiors';
  const method = recordId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      body: formData
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeModal();
      if (activePage === 'interior') renderInteriorWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Save failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Server error submitting interior setup record.");
  }
}

function openUpdateInteriorProgressModalByRecordId(id) {
  const record = allInteriorsList.find(i => i.id === id);
  if (!record) return;

  document.getElementById('modal-title').innerText = `Update Construction Progress (#${record.id})`;
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitInteriorProgressUpdate(event, ${record.id})" style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
        <div style="font-size:0.85rem; font-weight:700; color:#0F172A;">
          ${record.franchise_name || record.lead_name || record.customer_name || 'N/A'}
        </div>
        <div style="font-size:0.78rem; color:#64748B; margin-top:4px;">
          Contractor: <b>${record.contractor_name}</b> • Total Capex: <b>Rs. ${(record.total_cost||0).toLocaleString('en-IN')}</b>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Completion Progress % *</label>
          <input type="number" min="0" max="100" id="progress-modal-pct" oninput="handleProgressModalPctInput()" required value="${record.completion_percentage || 0}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.88rem; font-weight:700; color:#2563EB;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Construction Status *</label>
          <select id="progress-modal-status" onchange="handleProgressModalStatusChange()" required style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem; font-weight:700;">
            <option value="Planned" ${record.status === 'Planned' ? 'selected' : ''}>Planned</option>
            <option value="In Progress" ${record.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Under Inspection" ${record.status === 'Under Inspection' ? 'selected' : ''}>Under Inspection</option>
            <option value="Completed" ${record.status === 'Completed' ? 'selected' : ''}>Completed (100% Final)</option>
            <option value="Delayed" ${record.status === 'Delayed' ? 'selected' : ''}>Delayed</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Actual Completion Date</label>
          <input type="date" id="progress-modal-actual-date" value="${record.actual_completion_date || ''}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; color:#334155;">Inspector Name</label>
          <input type="text" id="progress-modal-inspector" value="${record.inspected_by || 'Quality Auditor'}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#334155;">Inspection Remarks / Milestone Notes</label>
        <textarea id="progress-modal-remarks" rows="3" placeholder="Notes on civil completion, electrical wiring, flooring status..." style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #CBD5E1; font-size:0.85rem;">${record.remarks || ''}</textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
        <button type="button" onclick="closeModal()" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer; font-weight: 600;">Cancel</button>
        <button type="submit" style="padding: 8px 20px; border-radius: 6px; border: none; background: #059669; color: #FFFFFF; cursor: pointer; font-weight: 600;">Save Progress Update</button>
      </div>
    </form>
  `;
  document.getElementById('custom-modal').style.display = 'flex';
}

function handleProgressModalStatusChange() {
  const st = document.getElementById('progress-modal-status')?.value;
  const pctEl = document.getElementById('progress-modal-pct');
  if (st === 'Completed' && pctEl) {
    pctEl.value = 100;
  }
}

function handleProgressModalPctInput() {
  const pctEl = document.getElementById('progress-modal-pct');
  const stEl = document.getElementById('progress-modal-status');
  if (!pctEl || !stEl) return;
  let val = parseInt(pctEl.value || 0);
  if (val > 100) { val = 100; pctEl.value = 100; }
  if (val < 0) { val = 0; pctEl.value = 0; }
  if (val === 100) stEl.value = 'Completed';
  else if (val > 0 && stEl.value === 'Planned') stEl.value = 'In Progress';
}

async function submitInteriorProgressUpdate(e, id) {
  e.preventDefault();
  const payload = {
    completion_percentage: document.getElementById('progress-modal-pct').value,
    status: document.getElementById('progress-modal-status').value,
    actual_completion_date: document.getElementById('progress-modal-actual-date').value,
    inspected_by: document.getElementById('progress-modal-inspector').value,
    remarks: document.getElementById('progress-modal-remarks').value
  };

  try {
    const res = await fetch(`/api/interiors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      closeModal();
      if (activePage === 'interior') renderInteriorWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Update failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Server error updating progress.");
  }
}

async function deleteInteriorRecord(id) {
  if (!confirm("Are you sure you want to delete this interior construction setup record? This action will be logged in the audit trail.")) return;

  try {
    const res = await fetch(`/api/interiors/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.status === 'success') {
      if (activePage === 'interior') renderInteriorWorkspace(document.getElementById('module-page-content'));
      else if (activeFranchiseId) loadFranchiseProfileData(activeFranchiseId);
    } else {
      alert(`Delete failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert("Server error deleting record.");
  }
}

function renderProfileInteriorTab(container, data) {
  const f = data.franchise;
  const interiorList = data.interiors || [];
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3>Interior & Store Construction Setup Workspaces</h3>
      <button class="btn-ref-explore" onclick="openInteriorModal()" style="width: auto; padding: 6px 14px;">
        <i class="fa-solid fa-plus"></i> + Add Construction Setup
      </button>
    </div>
    <table class="custom-table">
      <thead>
        <tr>
          <th>Contractor</th>
          <th>Start / Target Date</th>
          <th>Cost Breakdown</th>
          <th>Total Setup Cost</th>
          <th>Progress %</th>
          <th>Status</th>
          <th>Blueprint</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${interiorList.length ? interiorList.map(i => `
          <tr>
            <td><b>${i.contractor_name || 'Contractor'}</b><br><span style="font-size:0.75rem; color:#64748B;">Inspector: ${i.inspected_by || 'Staff'}</span></td>
            <td>${i.start_date || '-'} to ${i.target_completion_date || '-'}</td>
            <td>
              <div style="font-size:0.75rem;">
                Civil: Rs.${(i.civil_cost||0).toLocaleString('en-IN')} | Carpentry: Rs.${(i.carpentry_cost||0).toLocaleString('en-IN')}<br>
                Elec: Rs.${(i.electrical_cost||0).toLocaleString('en-IN')} | HVAC: Rs.${(i.hvac_cost||0).toLocaleString('en-IN')}
              </div>
            </td>
            <td><b style="color:#7C3AED;">Rs. ${(i.total_cost||0).toLocaleString('en-IN')}</b></td>
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <div style="flex:1; background:#E2E8F0; border-radius:4px; height:6px; overflow:hidden;">
                  <div style="width:${i.completion_percentage||0}%; background:${i.completion_percentage===100?'#059669':'#2563EB'}; height:100%;"></div>
                </div>
                <b>${i.completion_percentage||0}%</b>
              </div>
            </td>
            <td>
              <span class="records-badge" style="${
                i.status === 'Completed' ? 'background:#D1FAE5; color:#059669;' :
                i.status === 'In Progress' ? 'background:#DBEAFE; color:#1D4ED8;' :
                i.status === 'Under Inspection' ? 'background:#FEF3C7; color:#D97706;' :
                i.status === 'Delayed' ? 'background:#FEE2E2; color:#DC2626;' :
                'background:#F1F5F9; color:#475569;'
              }">${i.status || 'Planned'}</span>
            </td>
            <td>
              ${i.blueprint_filepath ? `
                <button onclick="previewPDF('${i.blueprint_filepath}')" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer;">
                  <i class="fa-solid fa-file"></i> View Blueprint
                </button>
              ` : '-'}
            </td>
            <td>
              <button onclick="openUpdateInteriorProgressModalByRecordId(${i.id})" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">Progress</button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="8" style="text-align: center;">No store construction setup records logged for this franchise profile.</td></tr>'}
      </tbody>
    </table>
  `;
}




