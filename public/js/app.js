// Estado global da aplicação
let currentView = 'dashboard';
let currentLeadId = null;
let activeChatLeadId = null;
let liveConvosData = [];
let liveFilter = 'all';
let livePollingTimer = null;
let lastMessagesCount = 0;
let knowledgeData = [];
let currentKnowledgeCat = 'all';
let vehiclesData = [];
let leadsData = [];
let testDrivesData = [];
let tasksData = [];
let pendingReviewList = [];

// ==========================================
// 0. SEGURANÇA: ESCAPE HTML E AUTENTICAÇÃO
// ==========================================
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const AUTH_STORAGE_KEY = 'autolead_admin_api_key';
let currentUser = null;

function getStoredToken() {
  return localStorage.getItem(AUTH_STORAGE_KEY);
}

function showLoginScreen(message = null, isSuccess = false) {
  hideSetupScreen();
  const overlay = document.getElementById('loginScreenOverlay');
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) {
    if (message) {
      if (isSuccess) {
        alertEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> ${escapeHtml(message)}`;
        alertEl.style.background = 'rgba(34, 197, 94, 0.12)';
        alertEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        alertEl.style.color = '#86efac';
      } else {
        alertEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(message)}`;
        alertEl.style.background = 'rgba(239, 68, 68, 0.12)';
        alertEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        alertEl.style.color = '#fca5a5';
      }
      alertEl.style.display = 'flex';
    } else {
      alertEl.style.display = 'none';
    }
  }
  if (overlay) overlay.style.display = 'flex';
  const emailInput = document.getElementById('loginEmail');
  if (emailInput && !emailInput.value) {
    emailInput.value = 'admin@autolead.com';
  }
  const passInput = document.getElementById('loginPassword');
  if (passInput) passInput.focus();
}

function showSetupScreen() {
  hideLoginScreen();
  const overlay = document.getElementById('setupScreenOverlay');
  if (overlay) overlay.style.display = 'flex';
  const nameInput = document.getElementById('setupName');
  if (nameInput) nameInput.focus();
}

function hideSetupScreen() {
  const overlay = document.getElementById('setupScreenOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function handleSetupSubmit(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('setupName')?.value?.trim();
  const email = document.getElementById('setupEmail')?.value?.trim();
  const password = document.getElementById('setupPassword')?.value?.trim();
  const confirmPassword = document.getElementById('setupConfirmPassword')?.value?.trim();

  const alertEl = document.getElementById('setupAlert');
  const btn = document.getElementById('btnSetupSubmit');
  const btnText = document.getElementById('setupBtnText');
  const btnSpinner = document.getElementById('setupBtnSpinner');

  if (password !== confirmPassword) {
    if (alertEl) {
      alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> As senhas digitadas não coincidem.';
      alertEl.style.display = 'flex';
    }
    return;
  }

  if (password.length < 8) {
    if (alertEl) {
      alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> A senha deve ter no mínimo 8 caracteres.';
      alertEl.style.display = 'flex';
    }
    return;
  }

  btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-flex';
  if (alertEl) alertEl.style.display = 'none';

  try {
    const res = await window.originalFetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const json = await res.json();

    if (json.success) {
      hideSetupScreen();
      const loginEmailInput = document.getElementById('loginEmail');
      if (loginEmailInput) loginEmailInput.value = email;
      showLoginScreen('Proprietário cadastrado com sucesso! Faça login com a senha que acabou de criar.', true);
    } else {
      if (alertEl) {
        alertEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(json.error || 'Erro ao realizar configuração inicial.')}`;
        alertEl.style.display = 'flex';
      }
    }
  } catch (err) {
    if (alertEl) {
      alertEl.innerHTML = '<i class="fa-solid fa-wifi"></i> Erro de comunicação com o servidor.';
      alertEl.style.display = 'flex';
    }
  } finally {
    btn.disabled = false;
    if (btnText) btnText.style.display = 'inline-flex';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

function fillEmail(email) {
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  if (emailInput) emailInput.value = email;
  if (passInput) {
    passInput.value = '';
    passInput.focus();
  }
}

function hideLoginScreen() {
  const overlay = document.getElementById('loginScreenOverlay');
  if (overlay) overlay.style.display = 'none';
}

function applyUserRolePermissions(user) {
  currentUser = user;
  const nameEl = document.getElementById('loggedUserName');
  const roleEl = document.getElementById('loggedUserRole');
  const navSettings = document.getElementById('navItemSettings');
  const navKnowledge = document.getElementById('navItemKnowledge');

  if (nameEl && user) nameEl.textContent = user.name || user.email;
  if (roleEl && user) {
    if (user.role === 'owner') {
      roleEl.textContent = 'DIRETOR / DONO';
      roleEl.className = 'stat-badge success';
    } else if (user.role === 'manager') {
      roleEl.textContent = 'GERENTE';
      roleEl.className = 'stat-badge warning';
    } else {
      roleEl.textContent = 'VENDEDOR';
      roleEl.className = 'stat-badge info';
    }
  }

  // Oculta telas restritas conforme perfil
  const isOwner = user && user.role === 'owner';
  const isManagerOrOwner = user && (user.role === 'owner' || user.role === 'manager');

  if (navSettings) navSettings.style.display = isManagerOrOwner ? 'flex' : 'none';
  if (navKnowledge) navKnowledge.style.display = isOwner ? 'flex' : 'none';

  // Configura visibilidade dentro da tela de Configurações
  const teamCard = document.getElementById('teamSettingsCard');
  if (teamCard) teamCard.style.display = isManagerOrOwner ? 'block' : 'none';

  // Se for gerente, desabilita salvar dados cadastrais da loja (apenas owner)
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    const saveBtn = settingsForm.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.style.display = isOwner ? 'inline-flex' : 'none';
  }

  if (!isManagerOrOwner && currentView === 'settings') {
    switchView('dashboard');
  }
  if (!isOwner && currentView === 'knowledge') {
    switchView('dashboard');
  }
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const btn = document.getElementById('btnLoginSubmit');
  const btnText = document.getElementById('loginBtnText');
  const btnSpinner = document.getElementById('loginBtnSpinner');
  const alertEl = document.getElementById('loginAlert');

  if (!email || !password) {
    if (alertEl) {
      alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Preencha o e-mail e a senha.';
      alertEl.style.display = 'flex';
    }
    return;
  }

  btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-flex';
  if (alertEl) alertEl.style.display = 'none';

  try {
    const res = await window.originalFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const json = await res.json();

    if (json.success && json.token) {
      localStorage.setItem(AUTH_STORAGE_KEY, json.token);
      hideLoginScreen();
      applyUserRolePermissions(json.user);
      loadDashboardData();
      loadLiveConversations();
      if (json.user.role === 'owner') {
        loadSettings();
        loadKnowledgeList();
      }
      if (json.user.role === 'owner' || json.user.role === 'manager') {
        loadUsersList();
      }
      checkWhatsAppStatus();
    } else {
      if (alertEl) {
        alertEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(json.error || 'Credenciais inválidas.')}`;
        alertEl.style.display = 'flex';
      }
    }
  } catch (err) {
    if (alertEl) {
      alertEl.innerHTML = '<i class="fa-solid fa-wifi"></i> Erro de conexão com o servidor.';
      alertEl.style.display = 'flex';
    }
  } finally {
    btn.disabled = false;
    if (btnText) btnText.style.display = 'inline-flex';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

async function handleLogout() {
  try {
    const token = getStoredToken();
    if (token) {
      await window.originalFetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    }
  } catch (e) {
    console.warn('Erro ao chamar logout:', e);
  }
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.clear();
  currentUser = null;
  // Recarrega completamente para zerar estados em memória e abrir a tela de login instantaneamente
  window.location.href = '/';
}

(function setupApiAuth() {
  window.originalFetch = window.fetch.bind(window);

  window.fetch = async function (url, options = {}) {
    const isPublicAuthCall = url === '/api/auth/login' || url === '/api/auth/setup' || url === '/api/auth/setup-status';
    const isApiCall = typeof url === 'string' && url.startsWith('/api') && !url.startsWith('/api/webhook') && !url.startsWith('/api/integrations') && !isPublicAuthCall;

    const token = getStoredToken();
    if (isApiCall && token) {
      options = { ...options, headers: { ...(options.headers || {}), 'x-api-key': token, 'Authorization': `Bearer ${token}` } };
    }

    const response = await window.originalFetch(url, options);

    if (isApiCall && response.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      currentUser = null;
      showLoginScreen('Sua sessão expirou. Faça login novamente.');
    }

    return response;
  };
})();

// Inicialização ao carregar o DOM
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNeuralBackground();
  initNavigation();

  // 1. Verifica se o sistema precisa de Primeira Configuração (First-Run Setup)
  try {
    const setupRes = await window.originalFetch('/api/auth/setup-status');
    const setupJson = await setupRes.json();
    if (setupJson && setupJson.needsSetup) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      showSetupScreen();
      return;
    }
  } catch (err) {
    console.warn('Erro ao verificar setup-status:', err);
  }

  // 2. Se o sistema já possui usuários, prossegue com verificação de sessão/login
  const token = getStoredToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch('/api/auth/me');
    const json = await res.json();
    if (json.success && json.user) {
      applyUserRolePermissions(json.user);
      loadDashboardData();
      loadLiveConversations();
      if (json.user.role === 'owner') {
        loadSettings();
        loadKnowledgeList();
      }
      if (json.user.role === 'owner' || json.user.role === 'manager') {
        loadUsersList();
      }
      checkWhatsAppStatus();
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      showLoginScreen('Sessão expirada. Faça login novamente.');
    }
  } catch (err) {
    console.error('Erro ao verificar sessão:', err);
    showLoginScreen();
  }
});

// ==========================================
// 1. NAVEGAÇÃO ENTRE TELAS (VIEWS)
// ==========================================
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  if (window.location.hash) {
    const viewFromHash = window.location.hash.replace('#', '');
    if (document.getElementById(`view-${viewFromHash}`)) {
      switchView(viewFromHash);
    }
  }
}

function switchView(viewName) {
  currentView = viewName;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  document.querySelectorAll('.content-view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  const titles = {
    dashboard: { title: 'Cockpit de Vendas & Pátio', subtitle: 'Acompanhamento em tempo real de receita, estoque e oportunidades em risco' },
    livechat: { title: 'Atendimento ao Vivo (WhatsApp da Loja)', subtitle: 'Conversas em tempo real, transição fluida entre IA e Vendedor Humano' },
    crm: { title: 'Funil de Vendas (CRM)', subtitle: 'Gestão visual de clientes desde o primeiro contato até a entrega das chaves' },
    testdrives: { title: 'Agenda de Visitas & Test-Drive', subtitle: 'Clientes agendados para visitar o showroom hoje e nos próximos dias' },
    tasks: { title: 'Tarefas da Equipe de Vendas', subtitle: 'Follow-ups pendentes, ligações e retornos agendados para os vendedores' },
    vehicles: { title: 'Estoque do Showroom', subtitle: 'Catálogo de veículos da loja, fotos, preços e status no pátio' },
    knowledge: { title: 'Base de Conhecimento & Treinamento da IA (RAG)', subtitle: 'Perguntas frequentes, políticas de financiamento e regras de negócio da concessionária' },
    settings: { title: 'Dados da Concessionária', subtitle: 'Informações da loja, endereço do showroom, horários e WhatsApp de atendimento' }
  };

  if (titles[viewName]) {
    document.getElementById('pageTitle').textContent = titles[viewName].title;
    document.getElementById('pageSubtitle').textContent = titles[viewName].subtitle;
  }

  if (viewName === 'dashboard') {
    loadDashboardData();
    loadPendingReviewMessages(true);
  } else if (viewName === 'livechat') {
    loadLiveConversations();
    loadPendingReviewMessages();
    if (livePollingTimer) clearInterval(livePollingTimer);
    livePollingTimer = setInterval(() => {
      if (currentView === 'livechat') {
        loadLiveConversations(true);
        loadPendingReviewMessages(true);
        if (activeChatLeadId) {
          renderLiveChatMessages(activeChatLeadId, true);
        }
      }
    }, 3000);
  } else {
    loadPendingReviewMessages(true);
    if (livePollingTimer) {
      clearInterval(livePollingTimer);
      livePollingTimer = null;
    }
    if (viewName === 'crm') loadCRM();
    else if (viewName === 'tasks') loadTasks();
    else if (viewName === 'testdrives') loadTestDrives();
    else if (viewName === 'vehicles') loadVehicles();
    else if (viewName === 'knowledge') loadKnowledgeList();
    else if (viewName === 'settings') {
      if (currentUser && currentUser.role === 'owner') loadSettings();
      if (currentUser && (currentUser.role === 'owner' || currentUser.role === 'manager')) loadUsersList();
    }
  }
}

// ==========================================
// 2. DASHBOARD & ANÁLISE DE VAZAMENTO (SLA)
// ==========================================
async function loadDashboardData() {
  try {
    const resMetrics = await fetch('/api/dashboard/metrics');
    const jsonMetrics = await resMetrics.json();
    if (jsonMetrics.success) {
      const data = jsonMetrics.data;
      document.getElementById('statTotalVehicles').textContent = data.totalVehicles;
      document.getElementById('statInventoryValue').textContent = `R$ ${Number(data.totalInventoryValue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
      document.getElementById('statTotalLeads').textContent = data.totalLeads;
      document.getElementById('statQualifiedLeads').textContent = `${data.qualifiedLeads} Qualificados`;
      document.getElementById('statTestDrives').textContent = data.scheduledTestDrives;

      renderPipelineBars(data.pipeline, data.totalLeads);
    }

    // Carrega análise de vazamentos de receita (Prompt 1 AutoPilot Ops)
    loadLeakageAnalytics();
    loadUpcomingTestDrives();
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

async function loadLeakageAnalytics() {
  try {
    const res = await fetch('/api/dashboard/leakage');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    document.getElementById('leakagePotentialValue').textContent = `${data.potentialRevenueAtRisk} em risco`;
    document.getElementById('leakageSummaryText').textContent = data.summaryMessage;

    const tagsContainer = document.getElementById('leakageAlertTags');
    tagsContainer.innerHTML = `
      <span class="leakage-tag-item" onclick="switchView('crm')">
        <i class="fa-solid fa-clock"></i> <strong>${data.unansweredCount}</strong> sem resposta > 15m
      </span>
      <span class="leakage-tag-item" onclick="switchView('tasks')">
        <i class="fa-solid fa-triangle-exclamation"></i> <strong>${data.overdueTasksCount}</strong> follow-ups atrasados
      </span>
      <span class="leakage-tag-item" onclick="switchView('crm')">
        <i class="fa-solid fa-compass"></i> <strong>${data.noNextActionCount}</strong> sem próxima ação
      </span>
    `;

    // Atualiza badge na sidebar
    const badge = document.getElementById('navOverdueTasksBadge');
    if (data.overdueTasksCount > 0) {
      badge.textContent = data.overdueTasksCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.error('Erro ao carregar vazamentos:', e);
  }
}

function renderPipelineBars(pipeline, totalLeads) {
  const container = document.getElementById('pipelineBars');
  const labels = {
    novo: 'Novos Leads',
    qualificado: 'Qualificados pela IA',
    test_drive: 'Test-Drive Agendado',
    proposta: 'Proposta / Em Negociação',
    fechado: 'Venda Concluída'
  };

  const total = totalLeads || 1;
  let html = '';

  for (const [key, label] of Object.entries(labels)) {
    const count = pipeline[key] || 0;
    const percentage = Math.round((count / total) * 100);
    html += `
      <div class="pipeline-item">
        <div class="pipeline-info">
          <span class="pipeline-label">${label}</span>
          <span class="pipeline-count">${count} leads (${percentage}%)</span>
        </div>
        <div class="pipeline-track">
          <div class="pipeline-fill ${key}" style="width: ${Math.max(4, percentage)}%"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

async function loadUpcomingTestDrives() {
  try {
    const res = await fetch('/api/test-drives?status=confirmado');
    const json = await res.json();
    const container = document.getElementById('upcomingTestDrives');

    if (!json.success || json.data.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem;">Nenhum agendamento pendente para hoje.</p>';
      return;
    }

    container.innerHTML = json.data.slice(0, 3).map(td => `
      <div class="upcoming-item">
        <div class="upcoming-car">
          <img class="upcoming-thumb" src="${td.vehicle_image || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=100'}" alt="${td.vehicle_model}">
          <div class="upcoming-details">
            <h4>${td.vehicle_make} ${td.vehicle_model}</h4>
            <p><i class="fa-solid fa-user"></i> ${td.lead_name}</p>
          </div>
        </div>
        <div class="upcoming-time">
          <div class="upcoming-date">${td.scheduled_at}</div>
          <span class="stat-badge warning">Confirmado</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

// ==========================================
// 3. CRM & KANBAN COM LEAD SCORE (0-100)
// ==========================================
async function loadCRM() {
  try {
    const res = await fetch('/api/leads');
    const json = await res.json();
    if (json.success) {
      leadsData = json.data;
      renderKanban(leadsData);
    }
  } catch (err) {
    console.error('Erro ao carregar CRM:', err);
  }
}

function renderKanban(leads) {
  const stages = ['novo', 'qualificado', 'test_drive', 'proposta', 'fechado'];
  const columns = {};

  stages.forEach(s => {
    columns[s] = document.getElementById(`col-${s}`);
    if (columns[s]) columns[s].innerHTML = '';
    const badge = document.getElementById(`count-${s}`);
    if (badge) badge.textContent = '0';
  });

  const counts = { novo: 0, qualificado: 0, test_drive: 0, proposta: 0, fechado: 0 };

  leads.forEach(lead => {
    const stage = stages.includes(lead.status) ? lead.status : 'novo';
    counts[stage]++;

    const col = columns[stage];
    if (!col) return;

    // Classe e ícone do Lead Score (0 a 100)
    const score = lead.score || 25;
    let scoreClass = 'pesquisa';
    let scoreIcon = 'fa-snowflake';

    if (score >= 75) { scoreClass = 'quente'; scoreIcon = 'fa-fire'; }
    else if (score >= 50) { scoreClass = 'qualificado'; scoreIcon = 'fa-bolt'; }
    else if (score >= 25) { scoreClass = 'interessado'; scoreIcon = 'fa-circle-half-stroke'; }

    const breakdown = lead.score_breakdown || { interesse: 15, prazo: 10, capacidade: 10, compromisso: 5 };
    const tooltipText = `Interesse: ${breakdown.interesse}/25 | Prazo: ${breakdown.prazo}/25 | Entrada: ${breakdown.capacidade}/25 | Visita: ${breakdown.compromisso}/25`;

    const card = document.createElement('div');
    card.className = 'lead-card';
    card.style.cursor = 'grab';
    card.draggable = true;
    card.dataset.leadId = lead.id;
    card.dataset.stage = stage;

    card.innerHTML = `
      <div class="lead-card-top">
        <span class="lead-name">${escapeHtml(lead.name) || 'Cliente'}</span>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="lead-score-pill ${scoreClass}" title="${escapeHtml(tooltipText)}">
            <i class="fa-solid ${scoreIcon}"></i> ${score} pts
          </span>
          <button type="button" class="btn-icon" onclick="event.stopPropagation(); confirmDeleteLead(${lead.id}, '${escapeHtml(lead.name || 'Cliente')}')" title="Excluir contato" style="width: 28px; height: 28px; border: none; background: rgba(239, 68, 68, 0.15); color: #ef4444; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-trash" style="font-size: 0.75rem;"></i>
          </button>
        </div>
      </div>
      ${lead.vehicle_model ? `<div class="lead-car-tag"><i class="fa-solid fa-car"></i> ${escapeHtml(lead.vehicle_make)} ${escapeHtml(lead.vehicle_model)}</div>` : ''}
      <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.35; margin-bottom: 6px;">
        ${escapeHtml(lead.ai_summary) || 'Lead em atendimento.'}
      </div>
      ${lead.next_action_title ? `
        <div class="lead-next-action-row" title="Próxima ação de follow-up">
          <i class="fa-solid fa-calendar-check" style="color: var(--accent-cyan);"></i>
          <span>${escapeHtml(lead.next_action_title)}</span>
        </div>
      ` : `
        <div class="lead-next-action-row" style="border-color: #ef4444; color: #fca5a5;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Sem próxima ação agendada</span>
        </div>
      `}
      <div class="lead-badges">
        <span class="badge-tag"><i class="fa-solid fa-phone"></i> ${escapeHtml(lead.phone)}</span>
        ${lead.assigned_seller_name ? `<span class="badge-tag" style="color: var(--primary); border-color: rgba(0, 229, 255, 0.4);"><i class="fa-solid fa-user-tie"></i> ${escapeHtml(lead.assigned_seller_name)}</span>` : ''}
        ${lead.has_trade_in ? '<span class="badge-tag" style="color: var(--accent-amber);"><i class="fa-solid fa-rotate"></i> Troca</span>' : ''}
        ${lead.payment_method ? `<span class="badge-tag">${escapeHtml(lead.payment_method.replace('_', ' '))}</span>` : ''}
      </div>
    `;

    // Handlers de Drag & Drop para o cartão
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(lead.id));
      card.classList.add('is-dragging');
      card._isDragging = true;
      setTimeout(() => { card._isDragging = false; }, 400);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('is-drag-over'));
    });

    card.onclick = () => {
      if (card._isDragging) return;
      openLeadDetails(lead.id);
    };

    col.appendChild(card);
  });

  stages.forEach(s => {
    const badge = document.getElementById(`count-${s}`);
    if (badge) badge.textContent = counts[s];
    const col = columns[s];
    if (col && counts[s] === 0) {
      col.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.76rem; padding: 24px 8px; border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px; margin-top: 4px;">Nenhum cliente nesta etapa</div>';
    }
  });

  initKanbanDragAndDrop();
}

function initKanbanDragAndDrop() {
  const board = document.getElementById('kanbanBoard');
  if (!board || board._dndBound) return;
  board._dndBound = true;

  const cols = board.querySelectorAll('.kanban-col');
  cols.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('is-drag-over');
    });

    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('is-drag-over');
      }
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('is-drag-over');

      const leadIdStr = e.dataTransfer.getData('text/plain');
      if (!leadIdStr) return;
      const leadId = parseInt(leadIdStr, 10);
      if (!leadId) return;

      const targetStage = col.dataset.stage;
      const currentLead = leadsData.find(l => l.id === leadId);
      if (!currentLead || currentLead.status === targetStage) return;

      // Optimistic UI update
      const prevStage = currentLead.status;
      currentLead.status = targetStage;
      renderKanban(leadsData);

      try {
        const res = await fetch(`/api/leads/${leadId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStage })
        });
        const json = await res.json();
        if (!json.success) {
          alert('Erro ao mover contato: ' + (json.error || 'Acesso negado'));
          currentLead.status = prevStage;
          renderKanban(leadsData);
        } else {
          loadDashboardData();
        }
      } catch (err) {
        console.error('Erro ao mover lead:', err);
        currentLead.status = prevStage;
        renderKanban(leadsData);
      }
    });
  });
}

// ==========================================
// 4. TAREFAS & FOLLOW-UP OPERACIONAL
// ==========================================
async function loadTasks() {
  try {
    const filter = document.getElementById('taskStatusFilter')?.value || '';
    const url = filter ? `/api/tasks?status=${filter}` : '/api/tasks';
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) return;

    tasksData = json.data;
    renderTasksGrid(tasksData);
  } catch (e) {
    console.error('Erro ao carregar tarefas:', e);
  }
}

function renderTasksGrid(tasks) {
  const container = document.getElementById('tasksContainer');
  if (tasks.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma tarefa pendente no momento. Parabéns, funil limpo!</div>';
    return;
  }

  container.innerHTML = tasks.map(t => {
    const isOverdue = t.status === 'atrasada';
    return `
      <div class="task-card ${t.status}">
        <div class="task-header">
          <span class="task-type-badge ${t.type}">${t.type}</span>
          ${isOverdue ? '<span style="color: #f87171; font-size: 0.72rem; font-weight: 800;"><i class="fa-solid fa-triangle-exclamation"></i> ATRASADA</span>' : ''}
        </div>
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-lead-info">
          <i class="fa-solid fa-user"></i> <strong>${escapeHtml(t.lead_name)}</strong> (${escapeHtml(t.lead_phone)})
          ${t.vehicle_model ? `• ${escapeHtml(t.vehicle_make)} ${escapeHtml(t.vehicle_model)}` : ''}
        </div>
        <div class="task-footer">
          <span class="task-due ${isOverdue ? 'overdue' : ''}">
            <i class="fa-regular fa-clock"></i> Prazo: ${new Date(t.due_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          ${t.status !== 'concluida' ? `
            <button class="btn btn-outline btn-sm" onclick="completeTask(${t.id})">
              <i class="fa-solid fa-check"></i> Concluir
            </button>
          ` : '<span style="color: var(--accent-emerald); font-size: 0.75rem; font-weight: 700;">Concluída</span>'}
        </div>
      </div>
    `;
  }).join('');
}

async function completeTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/complete`, { method: 'PATCH' });
    const json = await res.json();
    if (json.success) {
      loadTasks();
      loadLeakageAnalytics();
    }
  } catch (e) {
    alert('Erro ao concluir tarefa');
  }
}

function openNewTaskModal() {
  const title = prompt('Título da Tarefa de Follow-up (Ex: Ligar para confirmar proposta):');
  if (!title) return;
  const leadId = prompt('ID do Lead associado:');
  if (!leadId) return;

  fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: parseInt(leadId, 10),
      type: 'whatsapp',
      title,
      due_at: new Date(Date.now() + 24*3600*1000).toISOString()
    })
  }).then(r => r.json()).then(json => {
    if (json.success) {
      loadTasks();
      loadLeakageAnalytics();
    } else {
      alert('Erro: ' + json.error);
    }
  });
}

// ==========================================
// 5. IMPORTADOR DE LEADS CSV (Prompt 1)
// ==========================================
function openCsvImportModal() {
  document.getElementById('csvModal').classList.add('active');
  document.getElementById('csvImportResult').style.display = 'none';
}

function closeCsvModal() {
  document.getElementById('csvModal').classList.remove('active');
}

function loadExampleCsv() {
  const sample = `nome,telefone,email,carro,orcamento,origem
Bruno Oliveira,11988776655,bruno@gmail.com,Jeep Renegade,95000,Webmotors
Camila Duarte,11977665544,camila@empresa.com,Toyota Corolla,120000,Facebook Ads
Marcos Vinicius,11966554433,marcos@terra.com.br,Hyundai Creta,110000,iCarros`;
  document.getElementById('csvInputText').value = sample;
}

async function submitCsvImport() {
  const content = document.getElementById('csvInputText').value.trim();
  if (!content) {
    alert('Cole o conteúdo da planilha CSV para importar');
    return;
  }

  const resultBox = document.getElementById('csvImportResult');
  resultBox.style.display = 'block';
  resultBox.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Processando e calculando Lead Scores...</p>';

  try {
    const res = await fetch('/api/imports/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvContent: content })
    });

    const json = await res.json();
    if (json.success) {
      resultBox.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid var(--accent-emerald); padding: 12px; border-radius: 8px; color: #fff; font-size: 0.85rem;">
          <h4 style="color: var(--accent-emerald); margin-bottom: 4px;"><i class="fa-solid fa-circle-check"></i> Importação Concluída com Sucesso!</h4>
          <p><strong>${json.summary.importedCount}</strong> leads importados e pontuados automaticamente com follow-ups agendados.</p>
        </div>
      `;
      loadCRM();
      loadTasks();
      loadDashboardData();
    } else {
      resultBox.innerHTML = `<p style="color: #ef4444;">Erro: ${json.error}</p>`;
    }
  } catch (err) {
    resultBox.innerHTML = '<p style="color: #ef4444;">Erro de conexão ao importar.</p>';
  }
}

// ==========================================
// 6. CENTRAL DE ATENDIMENTO AO VIVO (LIVE WHATSAPP INBOX)
// ==========================================

async function loadLiveConversations(silent = false) {
  try {
    const res = await fetch('/api/chat/conversations');
    const json = await res.json();
    if (!json.success) return;

    liveConvosData = json.data || [];
    const countEl = document.getElementById('countAllChats');
    if (countEl) countEl.textContent = liveConvosData.length;

    renderLiveConversationsList();

    // If an active chat is selected, make sure its details stay updated in header
    if (activeChatLeadId) {
      const activeLead = liveConvosData.find(c => c.id === activeChatLeadId);
      if (activeLead) {
        updateActiveChatHeader(activeLead);
      }
    }
  } catch (err) {
    if (!silent) console.error('Erro ao carregar conversas do WhatsApp:', err);
  }
}

function setLiveFilter(filter) {
  liveFilter = filter;
  document.querySelectorAll('.livechat-filter-pills .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderLiveConversationsList();
}

function filterLiveConversations() {
  renderLiveConversationsList();
}

function renderLiveConversationsList() {
  const container = document.getElementById('liveChatListContainer');
  if (!container) return;

  const searchTerm = (document.getElementById('liveChatSearchInput')?.value || '').toLowerCase().trim();

  let filtered = liveConvosData.filter(c => {
    // Filter pill logic
    if (liveFilter === 'pending_review') {
      const hasPending = pendingReviewList.some(p => p.lead_id === c.id);
      if (!hasPending) return false;
    }
    if (liveFilter === 'ai' && c.ai_enabled === 0) return false;
    if (liveFilter === 'human' && c.ai_enabled === 1) return false;

    // Search filter
    if (searchTerm) {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const car = (c.vehicle_model || '').toLowerCase();
      if (!name.includes(searchTerm) && !phone.includes(searchTerm) && !car.includes(searchTerm)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 0.8rem; font-family: 'Roboto Mono', monospace;">
        <i class="fa-solid fa-inbox" style="font-size: 1.5rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        Nenhuma conversa encontrada
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(c => {
    const isSelected = c.id === activeChatLeadId;
    const score = c.score || 25;
    let scoreClass = 'pesquisa';
    if (score >= 75) scoreClass = 'quente';
    else if (score >= 50) scoreClass = 'qualificado';

    // Format time
    let timeStr = '';
    if (c.last_message_at) {
      const d = new Date(c.last_message_at);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      timeStr = isToday 
        ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }

    const isAi = c.ai_enabled === 1 || c.ai_enabled === null || c.ai_enabled === undefined;
    const badgeHtml = isAi 
      ? `<span class="convo-ai-badge ai" title="IA respondendo automaticamente"><i class="fa-solid fa-robot"></i> IA</span>`
      : `<span class="convo-ai-badge human" title="Vendedor humano assumiu"><i class="fa-solid fa-user"></i> Vendedor</span>`;

    const hasPendingReview = pendingReviewList.some(p => p.lead_id === c.id);
    const pendingReviewTag = hasPendingReview 
      ? `<span class="badge-tag" style="font-size: 0.65rem; background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 1px 4px; border-radius: 4px;" title="Aguardando aprovação humana"><i class="fa-solid fa-hourglass-half"></i> Revisão</span>`
      : '';

    const initials = (c.name || 'C')
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const senderPrefix = c.last_sender === 'user' ? '' : (c.last_sender === 'assistant' ? (isAi ? '🤖 IA: ' : '👤 Você: ') : '');
    const preview = c.last_message ? `${senderPrefix}${c.last_message}` : 'Nova conversa iniciada';

    return `
      <div class="livechat-convo-item ${isSelected ? 'active' : ''}" onclick="selectLiveConversation(${c.id})">
        <div class="convo-avatar">
          ${initials}
          <span class="avatar-status-dot ${isAi ? 'ai-online' : 'human-online'}"></span>
        </div>
        <div class="convo-info">
          <div class="convo-top-row">
            <span class="convo-name">${escapeHtml(c.name || 'Cliente Sem Nome')}</span>
            <span class="convo-time">${timeStr}</span>
          </div>
          <div class="convo-preview-row">
            <span class="convo-preview">${escapeHtml(preview)}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${c.assigned_seller_name ? `<span class="badge-tag" style="font-size: 0.65rem; color: var(--primary); padding: 1px 4px; border: 1px solid rgba(0, 229, 255, 0.3); border-radius: 4px;" title="Vendedor atribuído"><i class="fa-solid fa-user-tie"></i> ${escapeHtml(c.assigned_seller_name)}</span>` : ''}
              ${pendingReviewTag}
              ${badgeHtml}
              <span class="lead-score-pill ${scoreClass}" style="padding: 1px 5px; font-size: 0.65rem;">
                ${score} pts
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function selectLiveConversation(leadId) {
  activeChatLeadId = leadId;
  renderLiveConversationsList();

  const emptyState = document.getElementById('liveChatEmptyState');
  const activeWindow = document.getElementById('liveChatActiveWindow');
  if (emptyState) emptyState.style.display = 'none';
  if (activeWindow) activeWindow.style.display = 'flex';

  let lead = liveConvosData.find(c => c.id === leadId);
  if (!lead) {
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      const json = await res.json();
      if (json.success) lead = json.data;
    } catch (e) {
      console.error(e);
    }
  }

  if (lead) {
    updateActiveChatHeader(lead);
  }

  // Load chat messages
  lastMessagesCount = 0;
  await renderLiveChatMessages(leadId, false);

  // Focus message input
  const input = document.getElementById('liveChatMessageInput');
  if (input) input.focus();
}

function updateActiveChatHeader(lead) {
  const nameEl = document.getElementById('activeChatLeadName');
  const phoneEl = document.getElementById('activeChatLeadPhone');
  const scoreEl = document.getElementById('activeChatScoreBadge');
  const avatarEl = document.getElementById('activeChatAvatar');
  const carInterestEl = document.getElementById('activeChatCarInterest');
  const tradeInEl = document.getElementById('activeChatTradeIn');
  const stageEl = document.getElementById('activeChatStage');
  const toggleBtn = document.getElementById('btnToggleAiStatus');
  const toggleIcon = document.getElementById('aiToggleIcon');
  const toggleText = document.getElementById('aiToggleText');

  if (nameEl) nameEl.textContent = lead.name || 'Cliente Sem Nome';
  if (phoneEl) {
    const sellerTag = lead.assigned_seller_name ? ` • Vendedor: ${lead.assigned_seller_name}` : '';
    phoneEl.textContent = `${lead.phone || 'Sem telefone'} • Canal: ${lead.channel || 'WhatsApp'}${sellerTag}`;
  }

  const score = lead.score || 25;
  if (scoreEl) {
    let scoreClass = 'pesquisa';
    if (score >= 75) scoreClass = 'quente';
    else if (score >= 50) scoreClass = 'qualificado';
    scoreEl.className = `lead-score-pill ${scoreClass}`;
    scoreEl.textContent = `${score} pts`;
  }

  if (avatarEl) {
    const initials = (lead.name || 'C').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    avatarEl.textContent = initials;
  }

  if (carInterestEl) {
    carInterestEl.textContent = lead.vehicle_model 
      ? `${lead.vehicle_make || ''} ${lead.vehicle_model}`
      : 'Veículos em Destaque';
  }

  if (tradeInEl) {
    tradeInEl.textContent = lead.has_trade_in ? (lead.trade_in_details || 'Possui carro na troca') : 'Sem veículo na troca';
  }

  if (stageEl) {
    const stageNames = {
      novo: 'Novo Lead',
      qualificado: 'Qualificado pela IA',
      test_drive: 'Visita Marcada',
      proposta: 'Em Negociação',
      fechado: 'Venda Fechada'
    };
    stageEl.textContent = stageNames[lead.status] || lead.status;
  }

  // Update AI vs Human Toggle Switch
  const isAi = lead.ai_enabled === 1 || lead.ai_enabled === null || lead.ai_enabled === undefined;
  if (toggleBtn) {
    if (isAi) {
      toggleBtn.className = 'btn-ai-toggle ai-active';
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-robot';
      if (toggleText) toggleText.textContent = 'IA Ativa (Automático)';
      toggleBtn.title = 'Clique para o vendedor assumir o atendimento humano';
    } else {
      toggleBtn.className = 'btn-ai-toggle human-active';
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-user-check';
      if (toggleText) toggleText.textContent = 'Vendedor Assumiu';
      toggleBtn.title = 'Clique para devolver o atendimento para a IA';
    }
  }
}

async function renderLiveChatMessages(leadId, silent = false) {
  try {
    const res = await fetch(`/api/chat/messages/${leadId}`);
    const json = await res.json();
    if (!json.success) return;

    const messages = json.data || [];
    const container = document.getElementById('liveChatMessagesStream');
    if (!container) return;

    // Check if message count changed or if first load
    if (silent && messages.length === lastMessagesCount) {
      return;
    }
    lastMessagesCount = messages.length;

    const lead = liveConvosData.find(c => c.id === leadId);
    const isAi = lead ? (lead.ai_enabled === 1 || lead.ai_enabled === null || lead.ai_enabled === undefined) : true;

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; margin: auto; padding: 30px;">
          <i class="fa-brands fa-whatsapp" style="font-size: 2rem; color: #25d366; margin-bottom: 8px; display: block;"></i>
          Canal aberto. Nenhuma mensagem trocada ainda com este cliente.
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => {
      const isCustomer = m.sender === 'user';
      const time = m.created_at 
        ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '';

      const formattedContent = escapeHtml(m.content)
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      const bubbleClass = isCustomer ? 'incoming' : 'outgoing';
      let copilotBadge = '';
      if (!isCustomer && m.copilot_status === 'pending_review') {
        copilotBadge = `<span class="badge-tag" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; margin-left: 6px;"><i class="fa-solid fa-hourglass-half"></i> Aguardando Revisão</span>`;
      } else if (!isCustomer && m.copilot_status === 'rejected') {
        copilotBadge = `<span class="badge-tag" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; margin-left: 6px;"><i class="fa-solid fa-ban"></i> Recusado</span>`;
      } else if (!isCustomer && m.copilot_status === 'edited') {
        copilotBadge = `<span class="badge-tag" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; margin-left: 6px;"><i class="fa-solid fa-pen-to-square"></i> Editado</span>`;
      }

      const headerLabel = isCustomer 
        ? `<span class="bubble-sender-name"><i class="fa-solid fa-user"></i> ${escapeHtml(lead?.name || 'Cliente')}</span>`
        : `<span class="bubble-sender-name" style="color: var(--primary);"><i class="fa-solid ${isAi ? 'fa-robot' : 'fa-user-tie'}"></i> ${isAi ? 'AutoLead IA' : 'Vendedor da Loja'}</span>`;

      return `
        <div class="livechat-bubble ${bubbleClass}">
          <div class="bubble-header-row">
            <div>
              ${headerLabel}
              ${copilotBadge}
            </div>
            <span class="bubble-timestamp">${time}</span>
          </div>
          <div class="bubble-body-text">${formattedContent}</div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    if (!silent) console.error('Erro ao renderizar mensagens:', err);
  }
}

async function toggleCurrentChatAi() {
  if (!activeChatLeadId) return;

  const lead = liveConvosData.find(c => c.id === activeChatLeadId);
  const currentAiState = lead ? (lead.ai_enabled === 1 || lead.ai_enabled === null || lead.ai_enabled === undefined) : true;
  const newAiState = currentAiState ? 0 : 1;

  // Optimistic UI update
  if (lead) lead.ai_enabled = newAiState;
  const dummyLead = lead || { ai_enabled: newAiState };
  updateActiveChatHeader(dummyLead);
  renderLiveConversationsList();

  try {
    const res = await fetch(`/api/leads/${activeChatLeadId}/ai-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_enabled: newAiState })
    });
    const json = await res.json();
    if (!json.success) {
      alert('Erro ao atualizar controle de IA: ' + json.error);
      if (lead) lead.ai_enabled = currentAiState ? 1 : 0;
      updateActiveChatHeader(lead);
      renderLiveConversationsList();
    }
  } catch (err) {
    console.error('Erro ao alterar status da IA:', err);
  }
}

async function handleSendHumanMessage(e) {
  e.preventDefault();
  if (!activeChatLeadId) return;

  const input = document.getElementById('liveChatMessageInput');
  const message = input.value.trim();
  if (!message) return;

  // Clear input immediately
  input.value = '';

  // Switch to seller human mode automatically if not already
  const lead = liveConvosData.find(c => c.id === activeChatLeadId);
  if (lead && lead.ai_enabled === 1) {
    lead.ai_enabled = 0;
    updateActiveChatHeader(lead);
    renderLiveConversationsList();
  }

  // Optimistically append bubble to container
  const container = document.getElementById('liveChatMessagesStream');
  if (container) {
    const bubble = document.createElement('div');
    bubble.className = 'livechat-bubble outgoing';
    bubble.innerHTML = `
      <div class="bubble-header-row">
        <span class="bubble-sender-name" style="color: var(--primary);"><i class="fa-solid fa-user-tie"></i> Vendedor da Loja</span>
        <span class="bubble-timestamp">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="bubble-body-text">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
    `;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  try {
    const res = await fetch('/api/chat/send-human', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: activeChatLeadId,
        message
      })
    });
    const json = await res.json();
    if (!json.success) {
      alert('Aviso: Não foi possível enviar mensagem pelo WhatsApp (' + (json.error || 'Erro de conexão') + ')');
    }
    loadLiveConversations(true);
    renderLiveChatMessages(activeChatLeadId, true);
  } catch (err) {
    console.error('Erro ao enviar mensagem humana:', err);
  }
}

function openLeadDetailsFromChat() {
  if (activeChatLeadId) {
    openLeadDetails(activeChatLeadId);
  }
}

// ==========================================
// 6.1 BASE DE CONHECIMENTO & TREINAMENTO DA IA (RAG)
// ==========================================

async function loadKnowledgeList() {
  try {
    const res = await fetch('/api/knowledge');
    const json = await res.json();
    if (!json.success) return;

    knowledgeData = json.data || [];
    const countEl = document.getElementById('countAllKnowledge');
    if (countEl) countEl.textContent = knowledgeData.length;

    renderKnowledgeCards();
  } catch (err) {
    console.error('Erro ao carregar base de conhecimento:', err);
  }
}

function filterKnowledgeCategory(cat) {
  currentKnowledgeCat = cat;
  document.querySelectorAll('#knowledgeCategoryFilterBar .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  renderKnowledgeCards();
}

function renderKnowledgeCards() {
  const container = document.getElementById('knowledgeCardsContainer');
  if (!container) return;

  const filtered = knowledgeData.filter(k => {
    if (currentKnowledgeCat === 'all') return true;
    return k.category === currentKnowledgeCat;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-brain" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 12px; display: block;"></i>
        <h4 style="color: #fff; margin-bottom: 6px;">Nenhuma Pergunta Cadastrada Nesta Categoria</h4>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 440px; margin: 0 auto 16px;">
          Cadastre perguntas frequentes e regras para treinar a IA a responder aos clientes automaticamente no WhatsApp.
        </p>
        <button class="btn btn-primary" onclick="openNewKnowledgeModal()">
          <i class="fa-solid fa-plus"></i> Cadastrar Pergunta
        </button>
      </div>
    `;
    return;
  }

  const categoryLabels = {
    financiamento: 'Financiamento',
    troca: 'Troca / Usado',
    garantia: 'Garantia & Laudo',
    documentacao: 'Documentação',
    loja: 'Regras da Loja',
    geral: 'Geral'
  };

  container.innerHTML = filtered.map(k => {
    const keywordsList = k.keywords ? k.keywords.split(',').map(kw => kw.trim()).filter(Boolean) : [];
    return `
      <div class="knowledge-card">
        <div class="knowledge-card-header">
          <span class="knowledge-cat-badge ${escapeHtml(k.category)}">
            ${categoryLabels[k.category] || escapeHtml(k.category)}
          </span>
          <div style="display: flex; gap: 6px;">
            <button class="btn-icon" title="Editar" onclick="editKnowledgeItem(${k.id})">
              <i class="fa-solid fa-pen" style="font-size: 0.72rem;"></i>
            </button>
            <button class="btn-icon" title="Excluir" onclick="deleteKnowledgeItem(${k.id})" style="color: #ef4444;">
              <i class="fa-solid fa-trash" style="font-size: 0.72rem;"></i>
            </button>
          </div>
        </div>
        <h4 class="knowledge-question">
          <i class="fa-solid fa-circle-question" style="color: var(--primary); margin-right: 6px;"></i>
          ${escapeHtml(k.question)}
        </h4>
        <div class="knowledge-answer">
          ${escapeHtml(k.answer)}
        </div>
        ${keywordsList.length > 0 ? `
          <div class="knowledge-keywords-row">
            ${keywordsList.map(kw => `<span class="keyword-tag"><i class="fa-solid fa-tag"></i> ${escapeHtml(kw)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function openNewKnowledgeModal() {
  const form = document.getElementById('knowledgeForm');
  if (form) form.reset();
  const editId = document.getElementById('knowledgeEditId');
  if (editId) editId.value = '';
  const title = document.getElementById('knowledgeModalTitle');
  if (title) title.innerHTML = '<i class="fa-solid fa-brain"></i> Nova Pergunta & Resposta (RAG)';
  const modal = document.getElementById('knowledgeModal');
  if (modal) modal.classList.add('active');
}

function closeKnowledgeModal() {
  const modal = document.getElementById('knowledgeModal');
  if (modal) modal.classList.remove('active');
}

function editKnowledgeItem(id) {
  const item = knowledgeData.find(k => k.id === id);
  if (!item) return;

  document.getElementById('knowledgeEditId').value = item.id;
  document.getElementById('kCategory').value = item.category;
  document.getElementById('kQuestion').value = item.question;
  document.getElementById('kAnswer').value = item.answer;
  document.getElementById('kKeywords').value = item.keywords || '';

  const title = document.getElementById('knowledgeModalTitle');
  if (title) title.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Pergunta & Resposta (RAG)';

  const modal = document.getElementById('knowledgeModal');
  if (modal) modal.classList.add('active');
}

async function handleSaveKnowledge(e) {
  e.preventDefault();
  const editId = document.getElementById('knowledgeEditId').value;
  const category = document.getElementById('kCategory').value;
  const question = document.getElementById('kQuestion').value.trim();
  const answer = document.getElementById('kAnswer').value.trim();
  const keywords = document.getElementById('kKeywords').value.trim();

  try {
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/knowledge/${editId}` : '/api/knowledge';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, question, answer, keywords })
    });
    const json = await res.json();
    if (json.success) {
      closeKnowledgeModal();
      loadKnowledgeList();
    } else {
      alert('Erro ao salvar: ' + json.error);
    }
  } catch (err) {
    alert('Erro de conexão ao salvar na base de conhecimento');
  }
}

function openBulkKnowledgeModal() {
  const modal = document.getElementById('bulkKnowledgeModal');
  if (modal) modal.classList.add('active');
}

function closeBulkKnowledgeModal() {
  const modal = document.getElementById('bulkKnowledgeModal');
  if (modal) modal.classList.remove('active');
}

async function submitBulkKnowledge() {
  const textarea = document.getElementById('bulkKnowledgeInput');
  const rawText = textarea.value.trim();
  if (!rawText) {
    alert('Cole pelo menos uma pergunta e resposta no formato solicitado');
    return;
  }

  const lines = rawText.split('\n');
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length >= 2) {
      items.push({
        question: parts[0],
        answer: parts[1],
        category: parts[2] || 'geral',
        keywords: parts[3] || ''
      });
    }
  }

  if (items.length === 0) {
    alert('Nenhuma pergunta válida encontrada. Certifique-se de separar pergunta e resposta com " | "');
    return;
  }

  try {
    const res = await fetch('/api/knowledge/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const json = await res.json();
    if (json.success) {
      alert(`Sucesso! ${json.summary.importedCount} perguntas cadastradas e indexadas no RAG.`);
      textarea.value = '';
      closeBulkKnowledgeModal();
      loadKnowledgeList();
    } else {
      alert('Erro: ' + json.error);
    }
  } catch (err) {
    alert('Erro ao importar perguntas em lote');
  }
}

async function deleteKnowledgeItem(id) {
  if (!confirm('Deseja realmente remover esta pergunta da base de conhecimento da IA?')) return;

  try {
    const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      loadKnowledgeList();
    } else {
      alert('Erro ao excluir: ' + json.error);
    }
  } catch (err) {
    alert('Erro ao excluir pergunta');
  }
}

// ==========================================
// 7. TEST-DRIVES & ESTOQUE
// ==========================================
async function loadTestDrives() {
  try {
    const res = await fetch('/api/test-drives');
    const json = await res.json();
    if (!json.success) return;

    testDrivesData = json.data;
    const tbody = document.getElementById('testDrivesTableBody');

    if (testDrivesData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum agendamento registrado ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = testDrivesData.map(td => `
      <tr>
        <td><strong><i class="fa-solid fa-clock" style="color: var(--accent-cyan); margin-right: 6px;"></i>${escapeHtml(td.scheduled_at)}</strong></td>
        <td>${escapeHtml(td.lead_name)}</td>
        <td>${escapeHtml(td.lead_phone)}</td>
        <td>${escapeHtml(td.vehicle_make)} ${escapeHtml(td.vehicle_model)}</td>
        <td>${escapeHtml(td.seller_name) || 'Lucas'}</td>
        <td><span class="stat-badge ${td.status === 'confirmado' ? 'success' : 'warning'}">${escapeHtml(td.status)}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-icon" title="Confirmar" onclick="changeTestDriveStatus(${td.id}, 'confirmado')"><i class="fa-solid fa-check"></i></button>
            <button class="btn-icon" title="Cancelar" onclick="changeTestDriveStatus(${td.id}, 'cancelado')"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function changeTestDriveStatus(id, newStatus) {
  try {
    await fetch(`/api/test-drives/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    loadTestDrives();
    loadDashboardData();
  } catch (e) {
    alert('Erro ao atualizar agendamento');
  }
}

async function loadVehicles() {
  try {
    const res = await fetch('/api/vehicles');
    const json = await res.json();
    if (json.success) {
      vehiclesData = json.data;
      setupVehicleSearchListeners();
      renderVehiclesGrid(vehiclesData);
    }
  } catch (err) {
    console.error(err);
  }
}

let vehiclePendingDeletionId = null;

function filterVehicles() {
  const query = (document.getElementById('vehicleSearchInput')?.value || '').toLowerCase().trim();
  const bodyType = document.getElementById('bodyTypeFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';

  const filtered = vehiclesData.filter(v => {
    if (bodyType && v.body_type !== bodyType) return false;
    if (status && v.status !== status) return false;
    if (query) {
      const matchText = `${v.make || ''} ${v.model || ''} ${v.version || ''} ${v.year_model || ''}`.toLowerCase();
      if (!matchText.includes(query)) return false;
    }
    return true;
  });

  renderVehiclesGrid(filtered);
}

function renderVehiclesGrid(vehicles) {
  const container = document.getElementById('vehiclesContainer');
  if (!container) return;

  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-car-side" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px; display: block;"></i>
        <h3 style="color: #fff; margin-bottom: 8px;">Nenhum Veículo Encontrado</h3>
        <p style="color: var(--text-secondary); max-width: 440px; margin: 0 auto 20px; font-size: 0.9rem;">
          Nenhum veículo corresponde aos filtros selecionados. Limpe os filtros ou cadastre um novo veículo no showroom.
        </p>
        <button class="btn btn-primary" onclick="openNewVehicleModal()">
          <i class="fa-solid fa-plus"></i> Cadastrar Novo Veículo
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = vehicles.map(v => {
    const photo = (v.images && v.images.length > 0) ? v.images[0] : 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800';
    const statusLabels = {
      disponivel: '🟢 Disponível',
      reservado: '🟡 Reservado',
      vendido: '🔴 Vendido'
    };
    const currentStatusLabel = statusLabels[v.status] || v.status;
    const isVendido = v.status === 'vendido';

    return `
      <div class="vehicle-card" style="${isVendido ? 'opacity: 0.75; filter: grayscale(20%);' : ''}">
        <div class="vehicle-image-wrapper">
          <img src="${escapeHtml(photo)}" alt="${escapeHtml(v.make)} ${escapeHtml(v.model)}">
          <span class="vehicle-badge-status ${escapeHtml(v.status)}" title="Clique no botão Status abaixo para alterar">
            ${escapeHtml(currentStatusLabel)}
          </span>
          <span class="vehicle-body-type">${escapeHtml(v.body_type) || 'Carro'}</span>
        </div>
        <div class="vehicle-content">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <h3 class="vehicle-title">${escapeHtml(v.make)} ${escapeHtml(v.model)}</h3>
          </div>
          <p class="vehicle-version">${escapeHtml(v.version) || ''}</p>
          <div class="vehicle-specs">
            <span>${v.year_fab}/${v.year_model}</span>
            <span>${Number(v.mileage || 0).toLocaleString('pt-BR')} km</span>
            <span>${escapeHtml(v.fuel || 'Flex')}</span>
            <span>${escapeHtml(v.transmission || 'Automático')}</span>
          </div>
          <div class="vehicle-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 8px;">
            <div class="vehicle-price" style="font-weight: 800; font-size: 1.15rem; color: var(--primary);">
              R$ ${Number(v.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-outline btn-sm" onclick="quickToggleVehicleStatus(${v.id})" title="Alterar status de venda rápido" style="padding: 4px 8px; font-size: 0.75rem;">
                <i class="fa-solid fa-arrows-rotate"></i> Status
              </button>
              <button class="btn btn-outline btn-sm" onclick="openEditVehicleModal(${v.id})" title="Editar Veículo" style="padding: 4px 8px; font-size: 0.75rem;">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn btn-outline btn-sm" onclick="confirmDeleteVehicle(${v.id}, '${escapeHtml(v.make)} ${escapeHtml(v.model)}')" title="Excluir Veículo" style="color: var(--error); border-color: rgba(239, 68, 68, 0.4); padding: 4px 8px; font-size: 0.75rem;">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setupVehicleSearchListeners() {
  const searchInput = document.getElementById('vehicleSearchInput');
  const bodyFilter = document.getElementById('bodyTypeFilter');
  const statusFilter = document.getElementById('statusFilter');

  if (searchInput && !searchInput._listenerAttached) {
    searchInput._listenerAttached = true;
    searchInput.addEventListener('input', filterVehicles);
  }
  if (bodyFilter && !bodyFilter._listenerAttached) {
    bodyFilter._listenerAttached = true;
    bodyFilter.addEventListener('change', filterVehicles);
  }
  if (statusFilter && !statusFilter._listenerAttached) {
    statusFilter._listenerAttached = true;
    statusFilter.addEventListener('change', filterVehicles);
  }
}

function openNewVehicleModal() {
  const form = document.getElementById('vehicleForm');
  if (form) form.reset();
  const editId = document.getElementById('vehicleEditId');
  if (editId) editId.value = '';
  const title = document.getElementById('vehicleModalTitle');
  if (title) title.textContent = 'Cadastrar Veículo no Showroom';
  const statusEl = document.getElementById('vStatus');
  if (statusEl) statusEl.value = 'disponivel';
  document.getElementById('vehicleModal')?.classList.add('active');
}

function openEditVehicleModal(vehicleId) {
  const vehicle = vehiclesData.find(v => v.id === vehicleId);
  if (!vehicle) return;

  const title = document.getElementById('vehicleModalTitle');
  if (title) title.textContent = `Editar Veículo: ${vehicle.make} ${vehicle.model}`;

  const editId = document.getElementById('vehicleEditId');
  if (editId) editId.value = vehicle.id;

  const vMake = document.getElementById('vMake');
  if (vMake) vMake.value = vehicle.make || '';

  const vModel = document.getElementById('vModel');
  if (vModel) vModel.value = vehicle.model || '';

  const vVersion = document.getElementById('vVersion');
  if (vVersion) vVersion.value = vehicle.version || '';

  const vYearFab = document.getElementById('vYearFab');
  if (vYearFab) vYearFab.value = vehicle.year_fab || 2022;

  const vYearModel = document.getElementById('vYearModel');
  if (vYearModel) vYearModel.value = vehicle.year_model || 2023;

  const vPrice = document.getElementById('vPrice');
  if (vPrice) vPrice.value = vehicle.price || '';

  const vStatus = document.getElementById('vStatus');
  if (vStatus) vStatus.value = vehicle.status || 'disponivel';

  const vMileage = document.getElementById('vMileage');
  if (vMileage) vMileage.value = vehicle.mileage || 0;

  const vTransmission = document.getElementById('vTransmission');
  if (vTransmission) vTransmission.value = vehicle.transmission || 'Automático';

  const vFuel = document.getElementById('vFuel');
  if (vFuel) vFuel.value = vehicle.fuel || 'Flex';

  document.getElementById('vehicleModal')?.classList.add('active');
}

function closeVehicleModal() {
  document.getElementById('vehicleModal')?.classList.remove('active');
}

async function handleSaveVehicle(e) {
  e.preventDefault();
  const editId = document.getElementById('vehicleEditId')?.value;
  const isEditing = !!editId;

  const payload = {
    make: document.getElementById('vMake').value.trim(),
    model: document.getElementById('vModel').value.trim(),
    version: document.getElementById('vVersion').value.trim(),
    year_fab: parseInt(document.getElementById('vYearFab').value, 10),
    year_model: parseInt(document.getElementById('vYearModel').value, 10),
    price: parseFloat(document.getElementById('vPrice').value),
    status: document.getElementById('vStatus')?.value || 'disponivel',
    mileage: parseInt(document.getElementById('vMileage')?.value || '0', 10),
    transmission: document.getElementById('vTransmission')?.value || 'Automático',
    fuel: document.getElementById('vFuel')?.value || 'Flex'
  };

  try {
    const url = isEditing ? `/api/vehicles/${editId}` : '/api/vehicles';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getStoredToken()
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      closeVehicleModal();
      loadVehicles();
      loadDashboardData();
    } else {
      alert('Erro ao salvar veículo: ' + (json.error || 'Acesso negado'));
    }
  } catch (err) {
    console.error('Erro ao salvar veículo:', err);
    alert('Erro de comunicação ao salvar veículo.');
  }
}

async function quickToggleVehicleStatus(vehicleId) {
  const vehicle = vehiclesData.find(v => v.id === vehicleId);
  if (!vehicle) return;

  const statusCycle = {
    disponivel: 'reservado',
    reservado: 'vendido',
    vendido: 'disponivel'
  };

  const nextStatus = statusCycle[vehicle.status] || 'disponivel';
  const prevStatus = vehicle.status;

  // Atualização otimista
  vehicle.status = nextStatus;
  filterVehicles();

  try {
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getStoredToken()
      },
      body: JSON.stringify({ status: nextStatus })
    });

    const json = await res.json();
    if (!json.success) {
      vehicle.status = prevStatus;
      filterVehicles();
      alert('Erro ao atualizar status: ' + (json.error || 'Acesso negado'));
    } else {
      loadDashboardData();
    }
  } catch (err) {
    vehicle.status = prevStatus;
    filterVehicles();
    console.error('Erro ao alternar status do veículo:', err);
  }
}

function confirmDeleteVehicle(vehicleId, vehicleName = 'este veículo') {
  vehiclePendingDeletionId = vehicleId;
  const modal = document.getElementById('deleteVehicleConfirmModal');
  const title = document.getElementById('deleteVehicleConfirmTitle');
  const desc = document.getElementById('deleteVehicleConfirmDesc');
  const btn = document.getElementById('btnExecuteDeleteVehicle');

  if (title) title.textContent = `Excluir "${escapeHtml(vehicleName)}"?`;
  if (desc) desc.innerHTML = `Tem certeza que deseja remover este veículo do estoque? A inteligência artificial deixará de oferecê-lo aos compradores no WhatsApp imediatamente.`;

  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await executeDeleteVehicle(vehiclePendingDeletionId);
      } finally {
        btn.disabled = false;
        closeDeleteVehicleModal();
      }
    };
  }

  if (modal) modal.classList.add('active');
}

function closeDeleteVehicleModal() {
  const modal = document.getElementById('deleteVehicleConfirmModal');
  if (modal) modal.classList.remove('active');
  vehiclePendingDeletionId = null;
}

async function executeDeleteVehicle(vehicleId) {
  if (!vehicleId) return;

  // Remoção otimista do estoque
  vehiclesData = vehiclesData.filter(v => v.id !== vehicleId);
  filterVehicles();

  try {
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + getStoredToken()
      }
    });
    const json = await res.json();
    if (json.success) {
      loadVehicles();
      loadDashboardData();
    } else {
      alert('Erro ao excluir veículo: ' + (json.error || 'Acesso negado'));
      loadVehicles();
    }
  } catch (err) {
    console.error('Erro ao excluir veículo:', err);
    alert('Erro de comunicação ao excluir veículo.');
    loadVehicles();
  }
}

// ==========================================
// 8. CONFIGURAÇÕES
// ==========================================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings', {
      headers: {
        'Authorization': 'Bearer ' + getStoredToken()
      }
    });
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    const sidebarAi = document.getElementById('sidebarAiProvider');
    if (sidebarAi) sidebarAi.textContent = `${data.provider.toUpperCase()} (${data.hasGeminiKey || data.hasOpenAiKey ? 'Chave Configurada' : 'Motor Nativo Ativo'})`;

    const subtitle = document.getElementById('dealershipSubtitle');
    if (subtitle) subtitle.textContent = data.dealership.name;

    const telemetryBadge = document.getElementById('telemetryProviderBadge');
    if (telemetryBadge) telemetryBadge.textContent = `${data.provider.toUpperCase()}`;

    const radio = document.querySelector(`input[name="aiProvider"][value="${data.provider}"]`);
    if (radio) radio.checked = true;

    const providerSelect = document.getElementById('aiProviderSelect');
    if (providerSelect && data.provider) {
      providerSelect.value = data.provider;
    }

    const reviewToggle = document.getElementById('aiReviewModeToggle');
    if (reviewToggle) {
      reviewToggle.checked = !!data.aiReviewMode;
      updateReviewModeLabel();
    }

    const geminiKeyEl = document.getElementById('geminiApiKey');
    if (geminiKeyEl && data.hasGeminiKey) {
      geminiKeyEl.placeholder = '•••••••••••••••• (Chave já configurada)';
    }

    const openaiKeyEl = document.getElementById('openaiApiKey');
    if (openaiKeyEl && data.hasOpenAiKey) {
      openaiKeyEl.placeholder = '•••••••••••••••• (Chave já configurada)';
    }

    const deepseekKeyEl = document.getElementById('deepseekApiKey');
    if (deepseekKeyEl && data.hasDeepseekKey) {
      deepseekKeyEl.placeholder = '•••••••••••••••• (Chave já configurada)';
    }

    const nameInput = document.getElementById('dealershipNameInput');
    if (nameInput) nameInput.value = data.dealership.name;

    const phoneInput = document.getElementById('dealershipPhoneInput');
    if (phoneInput) phoneInput.value = data.dealership.phone;

    // Se o WhatsApp estiver conectado com número real e o campo ainda for o default genérico, sincroniza o número conectado
    try {
      const waRes = await fetch('/api/whatsapp/status');
      const waJson = await waRes.json();
      if (waJson.success && waJson.data?.status === 'connected' && waJson.data?.phone) {
        if (phoneInput && (!phoneInput.value || phoneInput.value === '(11) 99999-8888')) {
          phoneInput.value = waJson.data.phone;
        }
      }
    } catch (_) {}

    const addrInput = document.getElementById('dealershipAddressInput');
    if (addrInput) addrInput.value = data.dealership.address;

    const webhookDisplay = document.getElementById('webhookUrlDisplay');
    if (webhookDisplay) webhookDisplay.textContent = `${window.location.origin}/api/webhook/whatsapp`;
  } catch (e) {
    console.error(e);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const dealershipName = document.getElementById('dealershipNameInput')?.value?.trim();
  const dealershipPhone = document.getElementById('dealershipPhoneInput')?.value?.trim();
  const dealershipAddress = document.getElementById('dealershipAddressInput')?.value?.trim();

  const bodyData = {
    dealershipName,
    dealershipPhone,
    dealershipAddress
  };

  const providerEl = document.getElementById('aiProviderSelect') || document.querySelector('input[name="aiProvider"]:checked');
  if (providerEl?.value) bodyData.provider = providerEl.value;

  const geminiKeyEl = document.getElementById('geminiApiKey');
  if (geminiKeyEl?.value?.trim()) bodyData.geminiKey = geminiKeyEl.value.trim();

  const openaiKeyEl = document.getElementById('openaiApiKey');
  if (openaiKeyEl?.value?.trim()) bodyData.openaiKey = openaiKeyEl.value.trim();

  const deepseekKeyEl = document.getElementById('deepseekApiKey');
  if (deepseekKeyEl?.value?.trim()) bodyData.deepseekKey = deepseekKeyEl.value.trim();

  const reviewToggle = document.getElementById('aiReviewModeToggle');
  if (reviewToggle) bodyData.aiReviewMode = reviewToggle.checked;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getStoredToken()
      },
      body: JSON.stringify(bodyData)
    });

    const json = await res.json();
    if (json.success) {
      alert('Configurações salvas com sucesso!');
      loadSettings();
    } else {
      alert('Erro ao salvar configurações: ' + (json.error || 'Acesso negado'));
    }
  } catch (err) {
    console.error('Erro ao salvar configurações:', err);
    alert('Erro de comunicação ao salvar configurações.');
  }
}

// ==========================================
// 9. CONEXÃO WHATSAPP POR QR CODE
// ==========================================
let waPollingInterval = null;

async function checkWhatsAppStatus() {
  try {
    const res = await fetch('/api/whatsapp/status');
    const json = await res.json();
    if (!json.success) return;

    const { status, qrCode, phone } = json.data;

    const topbarText = document.getElementById('topbarWaStatusText');
    const topbarBtn = document.getElementById('topbarWaBtn');
    const settingsBtn = document.getElementById('waSettingsBtnText');
    const settingsDesc = document.getElementById('waSettingsStatusDesc');

    if (status === 'connected') {
      if (topbarText) topbarText.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; background: #fff; border-radius: 50%; margin-right: 4px;"></span> WhatsApp Conectado`;
      if (topbarBtn) {
        topbarBtn.style.background = '#16a34a';
        topbarBtn.style.color = '#fff';
      }
      if (settingsBtn) settingsBtn.textContent = 'Gerenciar Conexão';
      if (settingsDesc) settingsDesc.innerHTML = `🟢 <strong>Ativo e respondendo:</strong> ${phone || 'Conectado'}`;

      // Atualiza modal se estiver aberto
      const discView = document.getElementById('waModalDisconnectedView');
      if (discView) discView.style.display = 'none';
      const qrView = document.getElementById('waModalQrView');
      if (qrView) qrView.style.display = 'none';
      const connView = document.getElementById('waModalConnectedView');
      if (connView) connView.style.display = 'block';
      const phoneDisp = document.getElementById('waConnectedPhoneDisplay');
      if (phoneDisp) phoneDisp.textContent = phone || 'Conectado';
    } else if (status === 'connecting') {
      if (topbarText) topbarText.textContent = 'Aguardando QR Code...';
      if (settingsBtn) settingsBtn.textContent = 'Aguardando Leitura';
      if (settingsDesc) settingsDesc.textContent = 'Aponte a câmera do WhatsApp para o QR Code na tela.';

      const discView = document.getElementById('waModalDisconnectedView');
      if (discView) discView.style.display = 'none';
      const connView = document.getElementById('waModalConnectedView');
      if (connView) connView.style.display = 'none';
      const qrView = document.getElementById('waModalQrView');
      if (qrView) qrView.style.display = 'block';

      const spinner = document.getElementById('qrLoadingSpinner');
      const img = document.getElementById('qrCodeImage');
      if (qrCode) {
        if (spinner) spinner.style.display = 'none';
        if (img) {
          img.src = qrCode;
          img.style.display = 'block';
        }
      } else {
        if (spinner) spinner.style.display = 'block';
        if (img) img.style.display = 'none';
      }
    } else {
      if (topbarText) topbarText.textContent = 'Conectar WhatsApp';
      if (topbarBtn) {
        topbarBtn.style.background = '#25d366';
        topbarBtn.style.color = '#0b141a';
      }
      if (settingsBtn) settingsBtn.textContent = 'Conectar por QR Code';
      if (settingsDesc) settingsDesc.textContent = 'Conecte o celular da loja escaneando o QR Code para ativar o atendente virtual.';

      document.getElementById('waModalDisconnectedView').style.display = 'block';
      document.getElementById('waModalQrView').style.display = 'none';
      document.getElementById('waModalConnectedView').style.display = 'none';
    }
  } catch (e) {
    console.error('Erro ao verificar status do WhatsApp:', e);
  }
}

function openWhatsAppModal() {
  document.getElementById('whatsAppModal').classList.add('active');
  checkWhatsAppStatus();
  if (waPollingInterval) clearInterval(waPollingInterval);
  waPollingInterval = setInterval(checkWhatsAppStatus, 2500);
}

function closeWhatsAppModal() {
  document.getElementById('whatsAppModal').classList.remove('active');
  if (waPollingInterval) {
    clearInterval(waPollingInterval);
    waPollingInterval = null;
  }
}

async function startWhatsAppConnection() {
  document.getElementById('waModalDisconnectedView').style.display = 'none';
  document.getElementById('waModalConnectedView').style.display = 'none';
  document.getElementById('waModalQrView').style.display = 'block';
  document.getElementById('qrLoadingSpinner').style.display = 'block';
  document.getElementById('qrCodeImage').style.display = 'none';

  try {
    await fetch('/api/whatsapp/connect', { method: 'POST' });
    checkWhatsAppStatus();
    if (!waPollingInterval) {
      waPollingInterval = setInterval(checkWhatsAppStatus, 2500);
    }
  } catch (err) {
    alert('Erro ao iniciar conexão WhatsApp.');
  }
}

async function disconnectWhatsAppConnection() {
  if (!confirm('Deseja realmente desconectar este número de WhatsApp da concessionária?')) return;
  try {
    await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    checkWhatsAppStatus();
  } catch (err) {
    alert('Erro ao desconectar WhatsApp.');
  }
}

// ==========================================
// 10. TEMA: MODO CLARO & MODO ESCURO
// ==========================================
function initTheme() {
  const saved = localStorage.getItem('theme');
  const btn = document.getElementById('themeToggleBtn');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
  } else {
    document.body.classList.remove('light-mode');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  }
}

// ==========================================
// 11. CADASTRO DE NOVO CONTATO (+ NOVO LEAD)
// ==========================================
async function openNewLeadModal() {
  document.getElementById('newLeadModal').classList.add('active');
  document.getElementById('newLeadForm').reset();
  document.getElementById('nlTradeInDetailsRow').style.display = 'none';

  // Popula seletor de veículos do estoque
  const vSelect = document.getElementById('nlVehicleSelect');
  vSelect.innerHTML = '<option value="">Ainda não definiu / Em pesquisa</option>';
  try {
    const res = await fetch('/api/vehicles');
    const json = await res.json();
    if (json.success) {
      json.data.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.make} ${v.model} ${v.version || ''} - R$ ${Number(v.price).toLocaleString('pt-BR')}`;
        vSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error(e);
  }
}

function closeNewLeadModal() {
  document.getElementById('newLeadModal').classList.remove('active');
}

async function handleCreateLead(e) {
  e.preventDefault();
  const name = document.getElementById('nlName').value.trim();
  const phone = document.getElementById('nlPhone').value.trim();
  const email = document.getElementById('nlEmail').value.trim();
  const channel = document.getElementById('nlChannel').value;
  const interested_vehicle_id = document.getElementById('nlVehicleSelect').value;
  const payment_method = document.getElementById('nlPaymentMethod').value;
  const budget_max = document.getElementById('nlBudget').value;
  const has_trade_in = document.getElementById('nlHasTradeIn').checked;
  const trade_in_details = document.getElementById('nlTradeInDetails').value.trim();
  const status = document.getElementById('nlStatus').value;

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        email: email || undefined,
        channel,
        interested_vehicle_id: interested_vehicle_id ? parseInt(interested_vehicle_id, 10) : undefined,
        payment_method,
        budget_max: budget_max ? parseFloat(budget_max) : undefined,
        has_trade_in,
        trade_in_details: has_trade_in ? trade_in_details : undefined,
        status
      })
    });

    const json = await res.json();
    if (json.success) {
      closeNewLeadModal();
      loadCRM();
      loadDashboardData();
    } else {
      alert('Erro: ' + json.error);
    }
  } catch (err) {
    console.error('Erro ao cadastrar contato:', err);
  }
}

// ==========================================
// 12. FICHA COMPLETA DO COMPRADOR (RAIO-X DE COMPRA)
// ==========================================
let currentDetailLeadId = null;
let currentDetailLeadPhone = null;

async function openLeadDetails(id) {
  currentDetailLeadId = id;
  const modal = document.getElementById('leadDetailsModal');
  modal.classList.add('active');

  try {
    // Busca dados dos veículos para preencher dropdown
    const vSelect = document.getElementById('ldVehicleSelect');
    vSelect.innerHTML = '<option value="">Nenhum veículo vinculado</option>';
    const vRes = await fetch('/api/vehicles');
    const vJson = await vRes.json();
    if (vJson.success) {
      vJson.data.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.make} ${v.model} ${v.version || ''} - R$ ${Number(v.price).toLocaleString('pt-BR')}`;
        vSelect.appendChild(opt);
      });
    }

    // Busca detalhes do lead
    const res = await fetch(`/api/leads/${id}`);
    const json = await res.json();
    if (!json.success) return;

    const lead = json.data;
    currentDetailLeadPhone = lead.phone;

    document.getElementById('ldLeadName').textContent = lead.name || 'Cliente';
    const sellerStr = lead.assigned_seller_name ? ` • Vendedor: ${lead.assigned_seller_name}` : '';
    document.getElementById('ldLeadPhone').textContent = `Telefone: ${lead.phone} • Origem: ${lead.channel || 'Balcão'}${sellerStr}`;
    document.getElementById('ldStatus').value = lead.status || 'novo';

    // Lead Score
    const score = lead.score || 25;
    const badge = document.getElementById('ldScoreBadge');
    badge.innerHTML = `<i class="fa-solid fa-fire"></i> ${score} pts`;

    const b = lead.score_breakdown || { interesse: 15, prazo: 10, capacidade: 10, compromisso: 5 };
    document.getElementById('ldScoreInteresse').textContent = `${b.interesse || 0}/25`;
    document.getElementById('ldScorePrazo').textContent = `${b.prazo || 0}/25`;
    document.getElementById('ldScoreCapacidade').textContent = `${b.capacidade || 0}/25`;
    document.getElementById('ldScoreCompromisso').textContent = `${b.compromisso || 0}/25`;

    if (lead.interested_vehicle_id) {
      vSelect.value = lead.interested_vehicle_id;
    }

    document.getElementById('ldPaymentMethod').value = lead.payment_method || 'financiamento';
    document.getElementById('ldBudget').value = lead.budget_max || '';

    const hasTradeIn = !!lead.has_trade_in;
    document.getElementById('ldHasTradeIn').checked = hasTradeIn;
    document.getElementById('ldTradeInGroup').style.display = hasTradeIn ? 'block' : 'none';
    document.getElementById('ldTradeInDetails').value = lead.trade_in_details || '';

    document.getElementById('ldNextActionTitle').value = lead.next_action_title || '';
    document.getElementById('ldAiSummaryText').textContent = lead.ai_summary || 'Nenhuma observação registrada.';
  } catch (e) {
    console.error('Erro ao abrir detalhes do lead:', e);
  }
}

function closeLeadDetailsModal() {
  document.getElementById('leadDetailsModal').classList.remove('active');
  currentDetailLeadId = null;
  currentDetailLeadPhone = null;
}

async function handleUpdateLead(e) {
  e.preventDefault();
  if (!currentDetailLeadId) return;

  const status = document.getElementById('ldStatus').value;
  const interested_vehicle_id = document.getElementById('ldVehicleSelect').value;
  const payment_method = document.getElementById('ldPaymentMethod').value;
  const budget_max = document.getElementById('ldBudget').value;
  const has_trade_in = document.getElementById('ldHasTradeIn').checked;
  const trade_in_details = document.getElementById('ldTradeInDetails').value.trim();
  const next_action_title = document.getElementById('ldNextActionTitle').value.trim();

  try {
    const res = await fetch(`/api/leads/${currentDetailLeadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        interested_vehicle_id: interested_vehicle_id ? parseInt(interested_vehicle_id, 10) : null,
        payment_method,
        budget_max: budget_max ? parseFloat(budget_max) : null,
        has_trade_in,
        trade_in_details: has_trade_in ? trade_in_details : null,
        next_action_title: next_action_title || null
      })
    });

    const json = await res.json();
    if (json.success) {
      closeLeadDetailsModal();
      loadCRM();
      loadDashboardData();
    } else {
      alert('Erro: ' + json.error);
    }
  } catch (err) {
    console.error('Erro ao atualizar comprador:', err);
  }
}

let leadPendingDeletionId = null;

function confirmDeleteLead(leadId, leadName = 'este contato') {
  leadPendingDeletionId = leadId;
  const modal = document.getElementById('deleteLeadConfirmModal');
  const title = document.getElementById('deleteLeadConfirmTitle');
  const desc = document.getElementById('deleteLeadConfirmDesc');
  const btn = document.getElementById('btnExecuteDeleteLead');

  if (title) title.textContent = `Excluir "${escapeHtml(leadName)}"?`;
  if (desc) desc.innerHTML = `Tem certeza que deseja remover este lead do funil comercial? Todo o histórico de mensagens, tarefas e agendamentos deste contato será excluído permanentemente.`;

  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await executeDeleteLead(leadPendingDeletionId);
      } finally {
        btn.disabled = false;
        closeDeleteLeadModal();
      }
    };
  }

  if (modal) modal.classList.add('active');
}

function closeDeleteLeadModal() {
  const modal = document.getElementById('deleteLeadConfirmModal');
  if (modal) modal.classList.remove('active');
  leadPendingDeletionId = null;
}

async function handleDeleteCurrentLead() {
  if (!currentDetailLeadId) return;
  const lead = leadsData.find(l => l.id === currentDetailLeadId);
  const name = lead ? lead.name : 'este contato';
  const idToDelete = currentDetailLeadId;
  closeLeadDetailsModal();
  confirmDeleteLead(idToDelete, name);
}

async function executeDeleteLead(leadId) {
  if (!leadId) return;

  // Remoção otimista do array em memória para resposta instantânea
  leadsData = leadsData.filter(l => l.id !== leadId);
  renderKanban(leadsData);

  try {
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      loadCRM();
      loadDashboardData();
      loadTasks();
    } else {
      alert('Erro ao excluir: ' + (json.error || 'Acesso negado'));
      loadCRM();
    }
  } catch (err) {
    console.error('Erro ao excluir contato:', err);
    alert('Erro de comunicação ao excluir contato.');
    loadCRM();
  }
}

async function handleDeleteLead(leadId) {
  const lead = leadsData.find(l => l.id === leadId);
  confirmDeleteLead(leadId, lead ? lead.name : 'este contato');
}

function openCurrentLeadWhatsApp() {
  if (!currentDetailLeadPhone) return;
  const rawPhone = currentDetailLeadPhone.replace(/\D/g, '');
  const finalPhone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;
  window.open(`https://wa.me/${finalPhone}`, '_blank');
}

// ==========================================================================
// ESTILO DEEP LEARNING HIGH-TECH: AMBIENT NEURAL NETWORK VISUALIZATION
// ==========================================================================
function initNeuralBackground() {
  const canvas = document.getElementById('neuralCanvas');
  if (!canvas) return;

  // Respeita preferência do usuário por menos animação
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const nodeCount = Math.min(36, Math.floor((width * height) / 38000));
  const nodes = [];

  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 1.8 + 1.2
    });
  }

  let animationFrameId = null;

  function render() {
    if (document.hidden) {
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const isLight = document.body.classList.contains('light-mode');
    const nodeColor = isLight ? 'rgba(46, 125, 50, 0.45)' : 'rgba(118, 185, 0, 0.65)';
    const lineColor = isLight ? '46, 125, 50' : '118, 185, 0';

    // Update positions
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      node.x += node.vx;
      node.y += node.vy;

      if (node.x < 0) node.x = width;
      if (node.x > width) node.x = 0;
      if (node.y < 0) node.y = height;
      if (node.y > height) node.y = 0;

      // Draw node
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();

      // Connect near nodes
      for (let j = i + 1; j < nodes.length; j++) {
        const other = nodes[j];
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 130) {
          const alpha = (1 - dist / 130) * (isLight ? 0.2 : 0.35);
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
          ctx.strokeStyle = `rgba(${lineColor}, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    animationFrameId = requestAnimationFrame(render);
  }

  render();
}

// ==========================================
// 12. GESTÃO DE EQUIPE & USUÁRIOS (RBAC)
// ==========================================
let usersData = [];

async function loadUsersList() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/users');
    const json = await res.json();
    if (!json.success || !json.users) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: var(--error);">${escapeHtml(json.error || 'Erro ao carregar equipe')}</td></tr>`;
      return;
    }

    usersData = json.users;
    if (usersData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: var(--text-secondary);">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    const isCallerManager = currentUser && currentUser.role === 'manager';
    const isCallerOwner = currentUser && currentUser.role === 'owner';

    tbody.innerHTML = usersData.map(u => {
      let roleBadge = '';
      if (u.role === 'owner') {
        roleBadge = '<span class="stat-badge success"><i class="fa-solid fa-crown"></i> DONO</span>';
      } else if (u.role === 'manager') {
        roleBadge = '<span class="stat-badge warning"><i class="fa-solid fa-user-gear"></i> GERENTE</span>';
      } else {
        roleBadge = '<span class="stat-badge info"><i class="fa-solid fa-user-tie"></i> VENDEDOR</span>';
      }

      const statusBadge = u.is_active
        ? '<span class="stat-badge success"><i class="fa-solid fa-circle-check"></i> Ativo</span>'
        : '<span class="stat-badge error" style="background: rgba(239,68,68,0.15); color: #ef4444;"><i class="fa-solid fa-circle-xmark"></i> Inativo</span>';

      // Gerente só gerencia vendedor; Owner gerencia todos exceto desativar o último owner
      const canManage = isCallerOwner || (isCallerManager && u.role === 'salesperson');

      let actionButtons = '';
      if (canManage) {
        actionButtons = `
          <button class="btn btn-outline btn-sm" onclick="openEditUserModal(${u.id})" title="Editar Usuário" style="font-size: 0.75rem; padding: 4px 8px;">
            <i class="fa-solid fa-user-pen"></i> Editar
          </button>
          <button class="btn btn-outline btn-sm" onclick="handleResetUserPassword(${u.id}, '${escapeHtml(u.name)}')" title="Redefinir Senha do Usuário" style="font-size: 0.75rem; padding: 4px 8px;">
            <i class="fa-solid fa-key"></i> Redefinir
          </button>
          <button class="btn btn-outline btn-sm" onclick="handleToggleUserStatus(${u.id}, ${u.is_active ? 1 : 0})" title="${u.is_active ? 'Desativar Usuário' : 'Reativar Usuário'}" style="font-size: 0.75rem; padding: 4px 8px; ${u.is_active ? 'color: #ef4444; border-color: rgba(239,68,68,0.4);' : 'color: #22c55e; border-color: rgba(34,197,94,0.4);'}">
            <i class="fa-solid fa-${u.is_active ? 'ban' : 'check'}"></i> ${u.is_active ? 'Desativar' : 'Ativar'}
          </button>
        `;
      } else {
        actionButtons = `<span style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-lock"></i> Protegido</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 12px 14px; font-weight: 500; color: var(--text-primary);">${escapeHtml(u.name)}</td>
          <td style="padding: 12px 14px; color: var(--text-secondary);">${escapeHtml(u.email)}</td>
          <td style="padding: 12px 14px;">${roleBadge}</td>
          <td style="padding: 12px 14px;">${statusBadge}</td>
          <td style="padding: 12px 14px; text-align: right; white-space: nowrap; gap: 6px;">${actionButtons}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar lista de usuários:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: var(--error);">Erro de conexão ao carregar equipe.</td></tr>`;
  }
}

function openNewUserModal() {
  const roleSelect = document.getElementById('nuRole');
  const alertEl = document.getElementById('newUserAlert');
  if (alertEl) alertEl.style.display = 'none';

  document.getElementById('nuName').value = '';
  document.getElementById('nuEmail').value = '';
  document.getElementById('nuPassword').value = '';

  if (roleSelect) {
    if (currentUser && currentUser.role === 'manager') {
      roleSelect.innerHTML = `<option value="salesperson">Vendedor (Consultor Comercial)</option>`;
    } else {
      roleSelect.innerHTML = `
        <option value="salesperson">Vendedor (Consultor Comercial)</option>
        <option value="manager">Gerente Comercial</option>
      `;
    }
  }

  document.getElementById('newUserModal').classList.add('active');
}

function closeNewUserModal() {
  document.getElementById('newUserModal').classList.remove('active');
}

function openEditUserModal(userId) {
  const user = usersData.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('euUserId').value = user.id;
  document.getElementById('euName').value = user.name;
  document.getElementById('euEmail').value = user.email;
  document.getElementById('euActive').value = user.is_active ? '1' : '0';

  const roleSelect = document.getElementById('euRole');
  const alertEl = document.getElementById('editUserAlert');
  if (alertEl) alertEl.style.display = 'none';

  if (roleSelect) {
    if (currentUser && currentUser.role === 'manager') {
      roleSelect.innerHTML = `<option value="salesperson">Vendedor (Consultor Comercial)</option>`;
      roleSelect.disabled = true;
    } else {
      roleSelect.disabled = false;
      if (user.role === 'owner') {
        roleSelect.innerHTML = `<option value="owner">Proprietário (Owner)</option>`;
      } else {
        roleSelect.innerHTML = `
          <option value="salesperson" ${user.role === 'salesperson' ? 'selected' : ''}>Vendedor (Consultor Comercial)</option>
          <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Gerente Comercial</option>
        `;
      }
    }
    roleSelect.value = user.role;
  }

  document.getElementById('editUserModal').classList.add('active');
}

function closeEditUserModal() {
  document.getElementById('editUserModal').classList.remove('active');
}

async function handleUpdateUserSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('euUserId').value;
  const name = document.getElementById('euName').value.trim();
  const email = document.getElementById('euEmail').value.trim();
  const role = document.getElementById('euRole').value;
  const isActive = document.getElementById('euActive').value === '1';
  const alertEl = document.getElementById('editUserAlert');
  const btn = document.getElementById('btnUpdateUser');

  if (alertEl) alertEl.style.display = 'none';
  btn.disabled = true;

  try {
    const payload = { name, email, is_active: isActive };
    if (currentUser && currentUser.role === 'owner') {
      payload.role = role;
    }

    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.success) {
      if (alertEl) {
        alertEl.textContent = json.error || 'Erro ao atualizar usuário.';
        alertEl.style.display = 'block';
      }
      return;
    }

    closeEditUserModal();
    loadUsersList();
  } catch (err) {
    if (alertEl) {
      alertEl.textContent = 'Erro de comunicação com o servidor.';
      alertEl.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
  }
}

async function handleSaveUser(e) {
  e.preventDefault();
  const name = document.getElementById('nuName').value.trim();
  const email = document.getElementById('nuEmail').value.trim();
  const role = document.getElementById('nuRole').value;
  const password = document.getElementById('nuPassword').value.trim();
  const alertEl = document.getElementById('newUserAlert');
  const btn = document.getElementById('btnSaveUser');

  if (alertEl) alertEl.style.display = 'none';
  btn.disabled = true;

  try {
    const payload = { name, email, role };
    if (password) payload.password = password;

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.success) {
      if (alertEl) {
        alertEl.textContent = json.error || 'Erro ao cadastrar usuário.';
        alertEl.style.display = 'block';
      }
      return;
    }

    closeNewUserModal();
    loadUsersList();

    if (json.initialPassword) {
      showTempPasswordModal(
        'Usuário Criado com Sucesso!',
        `O usuário <strong>${escapeHtml(json.user.name)}</strong> (${escapeHtml(json.user.email)}) foi cadastrado. Copie a senha inicial abaixo:`,
        json.initialPassword
      );
    }
  } catch (err) {
    if (alertEl) {
      alertEl.textContent = 'Erro de comunicação com o servidor.';
      alertEl.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
  }
}

async function handleResetUserPassword(userId, userName) {
  if (!confirm(`Deseja redefinir a senha de "${userName}"? Todas as sessões dele serão invalidadas e uma nova senha será gerada.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Erro ao redefinir senha.');
      return;
    }

    showTempPasswordModal(
      'Senha Redefinida com Sucesso!',
      `A nova senha de acesso de <strong>${escapeHtml(userName)}</strong> foi gerada. Envie-a ao usuário:`,
      json.newPassword
    );
  } catch (err) {
    alert('Erro de conexão ao redefinir senha.');
  }
}

async function handleToggleUserStatus(userId, currentActive) {
  const newActive = currentActive ? 0 : 1;
  const actionText = newActive ? 'reativar' : 'desativar';

  if (!confirm(`Deseja realmente ${actionText} este usuário?`)) return;

  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newActive === 1 })
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || `Erro ao ${actionText} usuário.`);
      return;
    }

    loadUsersList();
  } catch (err) {
    alert(`Erro ao ${actionText} usuário.`);
  }
}

function showTempPasswordModal(title, desc, password) {
  const modal = document.getElementById('tempPasswordModal');
  const titleEl = document.getElementById('tempPasswordModalTitle');
  const descEl = document.getElementById('tempPasswordModalDesc');
  const displayEl = document.getElementById('tempPasswordDisplay');

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.innerHTML = desc;
  if (displayEl) displayEl.textContent = password;
  if (modal) modal.classList.add('active');
}

function closeTempPasswordModal() {
  const modal = document.getElementById('tempPasswordModal');
  if (modal) modal.classList.remove('active');
}

function copyTempPassword() {
  const displayEl = document.getElementById('tempPasswordDisplay');
  if (!displayEl) return;
  const text = displayEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert('Senha copiada para a área de transferência!');
  }).catch(() => {
    prompt('Copie a senha manualmente:', text);
  });
}

// ==========================================
// 13. TROCA DE PRÓPRIA SENHA DO USUÁRIO
// ==========================================
function openChangePasswordModal() {
  const alertEl = document.getElementById('changePasswordAlert');
  if (alertEl) alertEl.style.display = 'none';
  document.getElementById('cpCurrentPassword').value = '';
  document.getElementById('cpNewPassword').value = '';
  document.getElementById('cpConfirmPassword').value = '';
  document.getElementById('changePasswordModal').classList.add('active');
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.remove('active');
}

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('cpCurrentPassword').value;
  const newPassword = document.getElementById('cpNewPassword').value;
  const confirmPassword = document.getElementById('cpConfirmPassword').value;
  const alertEl = document.getElementById('changePasswordAlert');
  const btn = document.getElementById('btnSubmitChangePassword');

  if (newPassword !== confirmPassword) {
    if (alertEl) {
      alertEl.textContent = 'A nova senha e a confirmação não coincidem.';
      alertEl.style.display = 'block';
    }
    return;
  }

  if (newPassword.length < 8) {
    if (alertEl) {
      alertEl.textContent = 'A nova senha deve ter no mínimo 8 caracteres.';
      alertEl.style.display = 'block';
    }
    return;
  }

  btn.disabled = true;
  if (alertEl) alertEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const json = await res.json();
    if (!json.success) {
      if (alertEl) {
        alertEl.textContent = json.error || 'Erro ao alterar senha.';
        alertEl.style.display = 'block';
      }
      return;
    }

    closeChangePasswordModal();
    alert('Sua senha foi alterada com sucesso! Por segurança, faça login novamente com a nova senha.');
    handleLogout();
  } catch (err) {
    if (alertEl) {
      alertEl.textContent = 'Erro de conexão ao alterar senha.';
      alertEl.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
  }
}

// ==========================================
// 10. MODO COPILOTO / REVISÃO HUMANA DE RESPOSTAS
// ==========================================
function updateReviewModeLabel() {
  const toggle = document.getElementById('aiReviewModeToggle');
  const label = document.getElementById('aiReviewModeLabel');
  if (!toggle || !label) return;
  if (toggle.checked) {
    label.textContent = 'Ativado';
    label.style.color = '#3b82f6';
  } else {
    label.textContent = 'Desativado';
    label.style.color = 'var(--text-secondary)';
  }
}

async function loadPendingReviewMessages(silent = false) {
  try {
    const token = getStoredToken();
    if (!token) return;

    const res = await fetch('/api/chat/pending-review', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (!json.success) return;

    pendingReviewList = json.data || [];
    const count = pendingReviewList.length;

    // Atualiza badges no menu e filtros
    const navBadge = document.getElementById('navPendingReviewBadge');
    if (navBadge) {
      navBadge.textContent = count;
      navBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    const countFilterEl = document.getElementById('countReviewFilter');
    if (countFilterEl) countFilterEl.textContent = count;

    const filterPill = document.getElementById('filterPillPendingReview');
    if (filterPill) {
      filterPill.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    const countText = document.getElementById('pendingReviewCountText');
    if (countText) countText.textContent = count;

    renderPendingReviewUI();
  } catch (err) {
    if (!silent) console.error('Erro ao carregar mensagens pendentes de revisão:', err);
  }
}

function renderPendingReviewUI() {
  const section = document.getElementById('pendingReviewSection');
  const listContainer = document.getElementById('pendingReviewCardsList');
  if (!section || !listContainer) return;

  if (!pendingReviewList || pendingReviewList.length === 0) {
    section.style.display = 'none';
    listContainer.innerHTML = '';
    return;
  }

  section.style.display = 'block';

  listContainer.innerHTML = pendingReviewList.map(msg => {
    const leadName = escapeHtml(msg.lead_name || 'Lead Sem Nome');
    const leadPhone = escapeHtml(msg.lead_phone || 'WhatsApp');
    const vehicle = msg.vehicle_model ? `<span class="badge badge-info" style="font-size: 0.75rem;"><i class="fa-solid fa-car"></i> ${escapeHtml(msg.vehicle_model)}</span>` : '';
    const formattedDate = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="pending-review-card" id="pending-card-${msg.id}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px;">
          <div>
            <strong style="color: #fff; font-size: 0.95rem;">${leadName}</strong>
            <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">${leadPhone}</span>
            ${vehicle}
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-family: 'Roboto Mono', monospace;">
            <i class="fa-solid fa-clock"></i> ${formattedDate}
          </span>
        </div>

        <div class="pending-draft-content" id="draft-content-${msg.id}">
          <p style="margin: 0; color: #e2e8f0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(msg.content)}</p>
        </div>

        <div id="draft-edit-box-${msg.id}" style="display: none; margin-bottom: 12px;">
          <textarea class="pending-draft-textarea" id="draft-textarea-${msg.id}" rows="4">${escapeHtml(msg.content)}</textarea>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="cancelEditDraft(${msg.id})">Cancelar</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="confirmEditAndSendDraft(${msg.id})">
              <i class="fa-solid fa-paper-plane"></i> Salvar & Enviar
            </button>
          </div>
        </div>

        <div class="pending-card-actions" id="draft-actions-${msg.id}">
          <button type="button" class="btn btn-success btn-sm" onclick="approvePendingDraft(${msg.id})">
            <i class="fa-solid fa-check"></i> Aprovar e Enviar
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="openEditDraft(${msg.id})">
            <i class="fa-solid fa-pen-to-square"></i> Editar Resposta
          </button>
          <button type="button" class="btn btn-danger btn-sm" onclick="rejectPendingDraft(${msg.id})">
            <i class="fa-solid fa-ban"></i> Recusar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openEditDraft(msgId) {
  const content = document.getElementById(`draft-content-${msgId}`);
  const editBox = document.getElementById(`draft-edit-box-${msgId}`);
  const actions = document.getElementById(`draft-actions-${msgId}`);
  if (content) content.style.display = 'none';
  if (actions) actions.style.display = 'none';
  if (editBox) editBox.style.display = 'block';
  const textarea = document.getElementById(`draft-textarea-${msgId}`);
  if (textarea) textarea.focus();
}

function cancelEditDraft(msgId) {
  const content = document.getElementById(`draft-content-${msgId}`);
  const editBox = document.getElementById(`draft-edit-box-${msgId}`);
  const actions = document.getElementById(`draft-actions-${msgId}`);
  if (content) content.style.display = 'block';
  if (actions) actions.style.display = 'flex';
  if (editBox) editBox.style.display = 'none';
}

async function approvePendingDraft(msgId) {
  try {
    const res = await fetch(`/api/chat/${msgId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getStoredToken()
      }
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Erro ao aprovar resposta.');
      return;
    }
    await loadPendingReviewMessages();
    loadLiveConversations(true);
    if (activeChatLeadId) renderLiveChatMessages(activeChatLeadId, true);
  } catch (err) {
    console.error('Erro ao aprovar rascunho:', err);
    alert('Erro de conexão ao aprovar resposta.');
  }
}

async function confirmEditAndSendDraft(msgId) {
  const textarea = document.getElementById(`draft-textarea-${msgId}`);
  const editedText = textarea?.value?.trim();
  if (!editedText) {
    alert('O texto da mensagem não pode ficar vazio.');
    return;
  }

  try {
    const res = await fetch(`/api/chat/${msgId}/edit-and-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getStoredToken()
      },
      body: JSON.stringify({ editedText })
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Erro ao editar e enviar resposta.');
      return;
    }
    await loadPendingReviewMessages();
    loadLiveConversations(true);
    if (activeChatLeadId) renderLiveChatMessages(activeChatLeadId, true);
  } catch (err) {
    console.error('Erro ao editar e enviar rascunho:', err);
    alert('Erro de conexão ao editar e enviar resposta.');
  }
}

async function rejectPendingDraft(msgId) {
  const humanTakeover = confirm('Deseja recusar o envio desta resposta da IA?\\n\\nClique em OK para recusar E desativar a IA deste lead (assumir como humano).\\nClique em Cancelar para apenas descartar esta mensagem mantendo a IA ativa.');

  try {
    const res = await fetch(`/api/chat/${msgId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getStoredToken()
      },
      body: JSON.stringify({ markHumanTakeover: humanTakeover })
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Erro ao recusar resposta.');
      return;
    }
    await loadPendingReviewMessages();
    loadLiveConversations(true);
    if (activeChatLeadId) renderLiveChatMessages(activeChatLeadId, true);
  } catch (err) {
    console.error('Erro ao recusar rascunho:', err);
    alert('Erro de conexão ao recusar resposta.');
  }
}
