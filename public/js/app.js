// Estado global da aplicação
let currentView = 'dashboard';
let currentLeadId = null;
let vehiclesData = [];
let leadsData = [];
let testDrivesData = [];

// Inicialização ao carregar o DOM
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadSettings();
  loadDashboardData();
  initSimulator();
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

  // Checa hash da URL
  if (window.location.hash) {
    const viewFromHash = window.location.hash.replace('#', '');
    if (document.getElementById(`view-${viewFromHash}`)) {
      switchView(viewFromHash);
    }
  }
}

function switchView(viewName) {
  currentView = viewName;

  // Atualiza botões
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Atualiza containers
  document.querySelectorAll('.content-view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  // Atualiza títulos
  const titles = {
    dashboard: { title: 'Dashboard Geral', subtitle: 'Visão geral do showroom, leads e conversão de vendas' },
    vehicles: { title: 'Estoque de Veículos', subtitle: 'Gerencie o catálogo de carros disponíveis e fotos' },
    crm: { title: 'CRM & Funil de Leads', subtitle: 'Acompanhe os clientes e o estágio no funil de vendas' },
    testdrives: { title: 'Agenda de Test-Drive', subtitle: 'Controle de visitas e agendamentos de clientes' },
    simulator: { title: 'Simulador de WhatsApp IA', subtitle: 'Converse com o AI SDR e veja a telemetria das tools' },
    settings: { title: 'Configurações & Provedores', subtitle: 'Ajuste chaves de API, modelos de IA e dados da concessionária' }
  };

  if (titles[viewName]) {
    document.getElementById('pageTitle').textContent = titles[viewName].title;
    document.getElementById('pageSubtitle').textContent = titles[viewName].subtitle;
  }

  // Carregamento de dados específicos da tela
  if (viewName === 'dashboard') loadDashboardData();
  else if (viewName === 'vehicles') loadVehicles();
  else if (viewName === 'crm') loadCRM();
  else if (viewName === 'testdrives') loadTestDrives();
}

// ==========================================
// 2. DASHBOARD & MÉTRICAS
// ==========================================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard/metrics');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    document.getElementById('statTotalVehicles').textContent = data.totalVehicles;
    document.getElementById('statInventoryValue').textContent = `R$ ${Number(data.totalInventoryValue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
    document.getElementById('statTotalLeads').textContent = data.totalLeads;
    document.getElementById('statQualifiedLeads').textContent = `${data.qualifiedLeads} Qualificados`;
    document.getElementById('statTestDrives').textContent = data.scheduledTestDrives;

    // Renderiza barras do funil
    renderPipelineBars(data.pipeline, data.totalLeads);

    // Carrega próximos test-drives
    loadUpcomingTestDrives();
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
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
      container.innerHTML = '<p class="text-muted" style="color: var(--text-muted); font-size: 0.85rem;">Nenhum test-drive agendado no momento.</p>';
      return;
    }

    container.innerHTML = json.data.slice(0, 4).map(td => `
      <div class="upcoming-item">
        <div class="upcoming-car">
          <img class="upcoming-thumb" src="${td.vehicle_image || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=100'}" alt="${td.vehicle_model}">
          <div class="upcoming-details">
            <h4>${td.vehicle_make} ${td.vehicle_model}</h4>
            <p><i class="fa-solid fa-user"></i> ${td.lead_name} (${td.lead_phone})</p>
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
// 3. ESTOQUE DE VEÍCULOS
// ==========================================
async function loadVehicles() {
  try {
    const res = await fetch('/api/vehicles');
    const json = await res.json();
    if (json.success) {
      vehiclesData = json.data;
      renderVehiclesGrid(vehiclesData);
      setupVehicleFilters();
    }
  } catch (err) {
    console.error('Erro ao carregar veículos:', err);
  }
}

function renderVehiclesGrid(vehicles) {
  const container = document.getElementById('vehiclesContainer');
  if (vehicles.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhum veículo encontrado com esses filtros.</div>';
    return;
  }

  container.innerHTML = vehicles.map(v => {
    const photo = (v.images && v.images.length > 0) ? v.images[0] : 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800';
    return `
      <div class="vehicle-card">
        <div class="vehicle-image-wrapper">
          <img src="${photo}" alt="${v.make} ${v.model}">
          <span class="vehicle-badge-status ${v.status}">${v.status}</span>
          <span class="vehicle-body-type">${v.body_type || 'Carro'}</span>
        </div>
        <div class="vehicle-content">
          <h3 class="vehicle-title">${v.make} ${v.model}</h3>
          <p class="vehicle-version">${v.version || ''}</p>
          <div class="vehicle-specs">
            <span class="vehicle-spec-item"><i class="fa-solid fa-calendar"></i> ${v.year_fab}/${v.year_model}</span>
            <span class="vehicle-spec-item"><i class="fa-solid fa-gauge"></i> ${Number(v.mileage).toLocaleString('pt-BR')} km</span>
            <span class="vehicle-spec-item"><i class="fa-solid fa-gas-pump"></i> ${v.fuel}</span>
            <span class="vehicle-spec-item"><i class="fa-solid fa-gears"></i> ${v.transmission}</span>
          </div>
          <div class="vehicle-footer">
            <div class="vehicle-price">R$ ${Number(v.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div class="vehicle-actions">
              <button class="btn-icon" title="Editar Veículo" onclick="editVehicle(${v.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-icon" title="Excluir" onclick="deleteVehicle(${v.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setupVehicleFilters() {
  const searchInput = document.getElementById('vehicleSearchInput');
  const bodyFilter = document.getElementById('bodyTypeFilter');
  const statusFilter = document.getElementById('statusFilter');

  const applyFilters = () => {
    const term = searchInput.value.toLowerCase().trim();
    const body = bodyFilter.value;
    const status = statusFilter.value;

    const filtered = vehiclesData.filter(v => {
      const matchTerm = !term || `${v.make} ${v.model} ${v.version}`.toLowerCase().includes(term);
      const matchBody = !body || v.body_type === body;
      const matchStatus = !status || v.status === status;
      return matchTerm && matchBody && matchStatus;
    });

    renderVehiclesGrid(filtered);
  };

  searchInput.oninput = applyFilters;
  bodyFilter.onchange = applyFilters;
  statusFilter.onchange = applyFilters;
}

// Modal de Veículo
function openNewVehicleModal() {
  document.getElementById('vehicleEditId').value = '';
  document.getElementById('vehicleForm').reset();
  document.getElementById('vehicleModalTitle').textContent = 'Cadastrar Novo Veículo';
  document.getElementById('vehicleModal').classList.add('active');
}

function closeVehicleModal() {
  document.getElementById('vehicleModal').classList.remove('active');
}

function editVehicle(id) {
  const v = vehiclesData.find(item => item.id === id);
  if (!v) return;

  document.getElementById('vehicleEditId').value = v.id;
  document.getElementById('vMake').value = v.make;
  document.getElementById('vModel').value = v.model;
  document.getElementById('vVersion').value = v.version || '';
  document.getElementById('vYearFab').value = v.year_fab;
  document.getElementById('vYearModel').value = v.year_model;
  document.getElementById('vPrice').value = v.price;
  document.getElementById('vMileage').value = v.mileage;
  document.getElementById('vBodyType').value = v.body_type || 'SUV';
  document.getElementById('vTransmission').value = v.transmission;
  document.getElementById('vFuel').value = v.fuel;
  document.getElementById('vColor').value = v.color || '';
  document.getElementById('vStatus').value = v.status || 'disponivel';
  document.getElementById('vFeatures').value = (v.features || []).join(', ');
  document.getElementById('vImages').value = (v.images || []).join(', ');

  document.getElementById('vehicleModalTitle').textContent = 'Editar Veículo';
  document.getElementById('vehicleModal').classList.add('active');
}

async function handleSaveVehicle(e) {
  e.preventDefault();
  const id = document.getElementById('vehicleEditId').value;

  const featuresText = document.getElementById('vFeatures').value;
  const features = featuresText ? featuresText.split(',').map(s => s.trim()).filter(Boolean) : [];

  const imagesText = document.getElementById('vImages').value;
  const images = imagesText ? imagesText.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : [];

  const payload = {
    make: document.getElementById('vMake').value,
    model: document.getElementById('vModel').value,
    version: document.getElementById('vVersion').value,
    year_fab: parseInt(document.getElementById('vYearFab').value, 10),
    year_model: parseInt(document.getElementById('vYearModel').value, 10),
    price: parseFloat(document.getElementById('vPrice').value),
    mileage: parseInt(document.getElementById('vMileage').value, 10),
    body_type: document.getElementById('vBodyType').value,
    transmission: document.getElementById('vTransmission').value,
    fuel: document.getElementById('vFuel').value,
    color: document.getElementById('vColor').value,
    status: document.getElementById('vStatus').value,
    features,
    images
  };

  try {
    const url = id ? `/api/vehicles/${id}` : '/api/vehicles';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      closeVehicleModal();
      loadVehicles();
      loadDashboardData();
    } else {
      alert('Erro ao salvar veículo: ' + json.error);
    }
  } catch (err) {
    alert('Erro de conexão ao salvar veículo');
  }
}

async function deleteVehicle(id) {
  if (!confirm('Deseja realmente remover este veículo do estoque?')) return;
  try {
    const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      loadVehicles();
      loadDashboardData();
    }
  } catch (e) {
    alert('Erro ao excluir veículo');
  }
}

// ==========================================
// 4. CRM & KANBAN DE LEADS
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

    const card = document.createElement('div');
    card.className = 'lead-card';
    card.innerHTML = `
      <div class="lead-card-header">
        <span class="lead-name">${lead.name || 'Cliente'}</span>
        <span class="lead-time">${new Date(lead.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      ${lead.vehicle_model ? `<div class="lead-car-tag"><i class="fa-solid fa-car"></i> ${lead.vehicle_make} ${lead.vehicle_model}</div>` : ''}
      <div class="lead-summary">${lead.ai_summary || 'Interessado em ver opções de veículos.'}</div>
      <div class="lead-badges">
        <span class="badge-tag"><i class="fa-solid fa-phone"></i> ${lead.phone}</span>
        ${lead.has_trade_in ? '<span class="badge-tag" style="color: var(--accent-amber);"><i class="fa-solid fa-rotate"></i> Tem Troca</span>' : ''}
        ${lead.payment_method ? `<span class="badge-tag">${lead.payment_method.replace('_', ' ')}</span>` : ''}
      </div>
    `;

    // Clique no card abre no simulador
    card.onclick = () => {
      currentLeadId = lead.id;
      switchView('simulator');
      loadSimulatorHistory(lead.id);
    };

    col.appendChild(card);
  });

  stages.forEach(s => {
    const badge = document.getElementById(`count-${s}`);
    if (badge) badge.textContent = counts[s];
  });
}

// ==========================================
// 5. TEST-DRIVES
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
        <td><strong><i class="fa-solid fa-clock" style="color: var(--accent-cyan); margin-right: 6px;"></i>${td.scheduled_at}</strong></td>
        <td>${td.lead_name}</td>
        <td>${td.lead_phone}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${td.vehicle_image || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=80'}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover;">
            <span>${td.vehicle_make} ${td.vehicle_model}</span>
          </div>
        </td>
        <td>${td.seller_name || 'Lucas'}</td>
        <td><span class="stat-badge ${td.status === 'confirmado' ? 'success' : td.status === 'realizado' ? 'info' : 'warning'}">${td.status}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-icon" title="Confirmar" onclick="changeTestDriveStatus(${td.id}, 'confirmado')"><i class="fa-solid fa-check"></i></button>
            <button class="btn-icon" title="Marcar como Realizado" onclick="changeTestDriveStatus(${td.id}, 'realizado')"><i class="fa-solid fa-flag-checkered"></i></button>
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
    const res = await fetch(`/api/test-drives/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const json = await res.json();
    if (json.success) {
      loadTestDrives();
      loadDashboardData();
    }
  } catch (e) {
    alert('Erro ao atualizar status do test-drive');
  }
}

// ==========================================
// 6. SIMULADOR DE WHATSAPP EM TEMPO REAL
// ==========================================
function initSimulator() {
  // Inicializa com lead padrão
  resetSimulatorChat();
}

function openSimulatorModal() {
  switchView('simulator');
}

async function resetSimulatorChat() {
  try {
    const res = await fetch('/api/chat/reset', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      currentLeadId = json.leadId;
      document.getElementById('waMessagesContainer').innerHTML = `
        <div class="wa-bubble incoming">
          <p>Olá! Sou o consultor virtual da <strong>AutoPrime Veículos</strong> 🚗💨</p>
          <p>Estou à disposição para te apresentar nosso estoque, simular parcelas ou agendar um Test Drive no carro dos seus sonhos. Como posso te ajudar hoje?</p>
          <span class="wa-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      `;
      document.getElementById('telemetryLogsContainer').innerHTML = `
        <div class="telemetry-empty">
          <i class="fa-solid fa-terminal"></i>
          <p>Sessão reiniciada (Lead ID: #${currentLeadId}). Digite uma mensagem para acompanhar a IA!</p>
        </div>
      `;
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadSimulatorHistory(leadId) {
  try {
    const res = await fetch(`/api/chat/messages/${leadId}`);
    const json = await res.json();
    if (!json.success) return;

    const container = document.getElementById('waMessagesContainer');
    container.innerHTML = '';

    json.data.forEach(msg => {
      appendWaBubble(msg.sender === 'user' ? 'outgoing' : 'incoming', msg.content);
    });
  } catch (e) {
    console.error(e);
  }
}

function sendQuickPrompt(text) {
  document.getElementById('waChatInput').value = text;
  handleSendUserMessage(new Event('submit'));
}

async function handleSendUserMessage(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('waChatInput');
  const message = input.value.trim();
  if (!message) return;

  // 1. Adiciona bolha do usuário
  appendWaBubble('outgoing', message);
  input.value = '';

  // 2. Indicador digitando...
  const statusEl = document.getElementById('waTypingStatus');
  statusEl.textContent = 'digitando...';

  const sendBtn = document.getElementById('waSendBtn');
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: currentLeadId,
        message: message,
        channel: 'simulator'
      })
    });

    const data = await res.json();

    if (data.success) {
      currentLeadId = data.leadId;
      appendWaBubble('incoming', data.reply);

      // Renderiza telemetria se houve chamada de ferramenta
      if (data.tools && data.tools.length > 0) {
        renderTelemetryTools(data.tools, data.provider);
      }
    } else {
      appendWaBubble('incoming', 'Desculpe, tive um imprevisto técnico ao consultar os dados. Poderia tentar novamente?');
    }
  } catch (err) {
    appendWaBubble('incoming', 'Erro ao conectar ao servidor da IA.');
  } finally {
    statusEl.textContent = 'online';
    sendBtn.disabled = false;
  }
}

function appendWaBubble(type, text) {
  const container = document.getElementById('waMessagesContainer');
  const bubble = document.createElement('div');
  bubble.className = `wa-bubble ${type}`;

  // Formata quebras de linha e negrito estilo WhatsApp (*texto*)
  const formattedText = text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  bubble.innerHTML = `
    <div>${formattedText}</div>
    <span class="wa-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
  `;

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function renderTelemetryTools(tools, provider) {
  const container = document.getElementById('telemetryLogsContainer');
  const empty = container.querySelector('.telemetry-empty');
  if (empty) empty.remove();

  tools.forEach(t => {
    const logItem = document.createElement('div');
    logItem.className = 'tool-event';
    logItem.innerHTML = `
      <div class="tool-event-title">
        <i class="fa-solid fa-code"></i> TOOL EXECUTION: <code>${t.name}()</code>
      </div>
      <div style="margin-bottom: 6px; color: var(--text-secondary); font-size: 0.72rem;">
        Parâmetros recebidos da IA:
      </div>
      <div class="tool-json">${JSON.stringify(t.args, null, 2)}</div>
      <div style="margin: 6px 0 4px 0; color: var(--text-secondary); font-size: 0.72rem;">
        Retorno do SQLite para a IA:
      </div>
      <div class="tool-json" style="color: #4ade80;">${JSON.stringify(t.result, null, 2)}</div>
    `;
    container.appendChild(logItem);
  });

  container.scrollTop = container.scrollHeight;
}

// ==========================================
// 7. CONFIGURAÇÕES
// ==========================================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    document.getElementById('sidebarAiProvider').textContent = `${data.provider.toUpperCase()} (${data.hasGeminiKey || data.hasOpenAiKey ? 'Chave Configurada' : 'Motor Nativo Ativo'})`;
    document.getElementById('telemetryProviderBadge').textContent = `${data.provider.toUpperCase()}`;
    document.getElementById('dealershipSubtitle').textContent = data.dealership.name;

    // Preenche formulário
    const radio = document.querySelector(`input[name="aiProvider"][value="${data.provider}"]`);
    if (radio) radio.checked = true;

    document.getElementById('dealershipNameInput').value = data.dealership.name;
    document.getElementById('dealershipPhoneInput').value = data.dealership.phone;
    document.getElementById('dealershipAddressInput').value = data.dealership.address;
    document.getElementById('webhookUrlDisplay').textContent = `${window.location.origin}/api/webhook/whatsapp`;
  } catch (e) {
    console.error(e);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const provider = document.querySelector('input[name="aiProvider"]:checked').value;
  const geminiKey = document.getElementById('geminiApiKey').value.trim();
  const openaiKey = document.getElementById('openaiApiKey').value.trim();
  const dealershipName = document.getElementById('dealershipNameInput').value.trim();
  const dealershipPhone = document.getElementById('dealershipPhoneInput').value.trim();
  const dealershipAddress = document.getElementById('dealershipAddressInput').value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        geminiKey: geminiKey || undefined,
        openaiKey: openaiKey || undefined,
        dealershipName,
        dealershipPhone,
        dealershipAddress
      })
    });

    const json = await res.json();
    if (json.success) {
      alert('Configurações salvas com sucesso!');
      loadSettings();
    }
  } catch (err) {
    alert('Erro ao salvar configurações');
  }
}
