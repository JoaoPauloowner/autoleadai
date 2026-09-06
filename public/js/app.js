// Estado global da aplicação
let currentView = 'dashboard';
let currentLeadId = null;
let vehiclesData = [];
let leadsData = [];
let testDrivesData = [];
let tasksData = [];

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
    simulator: { title: 'Central de WhatsApp da Loja', subtitle: 'Atendimento aos clientes, simulações de financiamento e agendamentos automáticos' },
    crm: { title: 'Funil de Vendas (CRM)', subtitle: 'Gestão visual de clientes desde o primeiro contato até a entrega das chaves' },
    testdrives: { title: 'Agenda de Visitas & Test-Drive', subtitle: 'Clientes agendados para visitar o showroom hoje e nos próximos dias' },
    tasks: { title: 'Tarefas da Equipe de Vendas', subtitle: 'Follow-ups pendentes, ligações e retornos agendados para os vendedores' },
    vehicles: { title: 'Estoque do Showroom', subtitle: 'Catálogo de veículos da loja, fotos, preços e status no pátio' },
    settings: { title: 'Dados da Concessionária', subtitle: 'Informações da loja, endereço do showroom, horários e WhatsApp de atendimento' }
  };

  if (titles[viewName]) {
    document.getElementById('pageTitle').textContent = titles[viewName].title;
    document.getElementById('pageSubtitle').textContent = titles[viewName].subtitle;
  }

  if (viewName === 'dashboard') loadDashboardData();
  else if (viewName === 'crm') loadCRM();
  else if (viewName === 'tasks') loadTasks();
  else if (viewName === 'testdrives') loadTestDrives();
  else if (viewName === 'vehicles') loadVehicles();
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
    card.innerHTML = `
      <div class="lead-card-top">
        <span class="lead-name">${lead.name || 'Cliente'}</span>
        <span class="lead-score-pill ${scoreClass}" title="${tooltipText}">
          <i class="fa-solid ${scoreIcon}"></i> ${score} pts
        </span>
      </div>
      ${lead.vehicle_model ? `<div class="lead-car-tag"><i class="fa-solid fa-car"></i> ${lead.vehicle_make} ${lead.vehicle_model}</div>` : ''}
      <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.35; margin-bottom: 6px;">
        ${lead.ai_summary || 'Lead em atendimento.'}
      </div>
      ${lead.next_action_title ? `
        <div class="lead-next-action-row" title="Próxima ação de follow-up">
          <i class="fa-solid fa-calendar-check" style="color: var(--accent-cyan);"></i>
          <span>${lead.next_action_title}</span>
        </div>
      ` : `
        <div class="lead-next-action-row" style="border-color: #ef4444; color: #fca5a5;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Sem próxima ação agendada</span>
        </div>
      `}
      <div class="lead-badges">
        <span class="badge-tag"><i class="fa-solid fa-phone"></i> ${lead.phone}</span>
        ${lead.has_trade_in ? '<span class="badge-tag" style="color: var(--accent-amber);"><i class="fa-solid fa-rotate"></i> Troca</span>' : ''}
        ${lead.payment_method ? `<span class="badge-tag">${lead.payment_method.replace('_', ' ')}</span>` : ''}
      </div>
    `;

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
        <div class="task-title">${t.title}</div>
        <div class="task-lead-info">
          <i class="fa-solid fa-user"></i> <strong>${t.lead_name}</strong> (${t.lead_phone})
          ${t.vehicle_model ? `• ${t.vehicle_make} ${t.vehicle_model}` : ''}
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
// 6. SIMULADOR MULTIMODAL (ÁUDIO + VISÃO)
// ==========================================
function initSimulator() {
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
          <p>Olá! Sou o consultor virtual da <strong>AutoPrime Seminovos</strong> 🚗💨</p>
          <p>Você pode me mandar mensagens de texto, <strong>áudios</strong> ou até a <strong>foto do seu carro usado</strong> para avaliarmos na troca!</p>
          <span class="wa-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      `;
      updateSimulatorScoreBar(25, { interesse: 5, prazo: 10, capacidade: 5, compromisso: 5 });
      document.getElementById('telemetryLogsContainer').innerHTML = `
        <div class="telemetry-empty">
          <i class="fa-solid fa-comments"></i>
          <p>Aguardando mensagens do cliente...<br>À medida que a conversa acontece, os veículos pesquisados, simulações e visitas aparecerão aqui.</p>
        </div>
      `;
    }
  } catch (e) {
    console.error(e);
  }
}

function updateSimulatorScoreBar(score, breakdown) {
  const bar = document.getElementById('activeScoreBadge');
  const detail = document.getElementById('activeScoreDetail');
  if (bar) bar.innerHTML = `<i class="fa-solid fa-fire"></i> Lead Score: ${score} pts`;
  if (detail && breakdown) {
    detail.textContent = `Interesse: ${breakdown.interesse} | Prazo: ${breakdown.prazo} | Entrada: ${breakdown.capacidade} | Visita: ${breakdown.compromisso}`;
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

    const leadRes = await fetch(`/api/leads/${leadId}`);
    const leadJson = await leadRes.json();
    if (leadJson.success) {
      updateSimulatorScoreBar(leadJson.data.score || 25, leadJson.data.score_breakdown);
    }
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

  appendWaBubble('outgoing', message);
  input.value = '';

  const statusEl = document.getElementById('waTypingStatus');
  statusEl.textContent = 'digitando...';

  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: currentLeadId, message })
    });

    const data = await res.json();
    if (data.success) {
      currentLeadId = data.leadId;
      appendWaBubble('incoming', data.reply);
      if (data.score) {
        updateSimulatorScoreBar(data.score.total, data.score.breakdown);
      }
      if (data.tools && data.tools.length > 0) {
        renderTelemetryTools(data.tools, data.provider);
      }
    }
  } catch (err) {
    appendWaBubble('incoming', 'Erro ao conectar à IA.');
  } finally {
    statusEl.textContent = 'online';
  }
}

/**
 * Simulação de envio de áudio nativo pelo cliente (RAG Multimodal)
 */
async function simulateSendAudio() {
  appendWaBubble('outgoing', '🎙️ <em>[Mensagem de voz - 0:14s]</em> "Oi Lucas! Eu vi o anúncio do Renegade. Queria saber se vocês aceitam meu carro na troca e quanto fica a parcela em 48x?"');

  const statusEl = document.getElementById('waTypingStatus');
  statusEl.textContent = 'ouvindo áudio e transcrevendo...';

  try {
    const res = await fetch('/api/chat/send-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: currentLeadId,
        mockText: 'Olá! Vi o anúncio do Renegade no site de vocês. Tenho um Onix 2019 e gostaria de saber quanto vocês pagam na troca e o valor da parcela em 48x.'
      })
    });

    const data = await res.json();
    if (data.success) {
      appendWaBubble('incoming', data.reply);
      if (data.score) updateSimulatorScoreBar(data.score.total, data.score.breakdown);
      if (data.tools) renderTelemetryTools(data.tools, 'RAG Multimodal (Transcrição de Áudio)');
    }
  } catch (e) {
    appendWaBubble('incoming', 'Erro ao processar áudio.');
  } finally {
    statusEl.textContent = 'online';
  }
}

/**
 * Simulação de envio de foto do carro na troca (RAG Multimodal Vision)
 */
async function simulateSendCarPhoto() {
  appendWaBubble('outgoing', '📷 <em>[Foto do Veículo da Troca enviada pelo cliente]</em><br><img src="https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=300" style="width: 100%; border-radius: 8px; margin-top: 6px;">');

  const statusEl = document.getElementById('waTypingStatus');
  statusEl.textContent = 'analisando imagem do veículo...';

  try {
    const res = await fetch('/api/chat/send-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: currentLeadId,
        mockDetails: 'Foto analisada: Chevrolet Onix Sedan Premier 2019/2020 Azul, lataria íntegra, conjunto óptico sem trincas, rodas de liga leve originais. Pré-avaliação entre R$ 48.000 e R$ 52.000 a confirmar no showroom.'
      })
    });

    const data = await res.json();
    if (data.success) {
      appendWaBubble('incoming', data.reply);
      if (data.tools) renderTelemetryTools(data.tools, 'RAG Multimodal (Visão Computacional)');
    }
  } catch (e) {
    appendWaBubble('incoming', 'Erro ao processar imagem.');
  } finally {
    statusEl.textContent = 'online';
  }
}

function appendWaBubble(type, text) {
  const container = document.getElementById('waMessagesContainer');
  const bubble = document.createElement('div');
  bubble.className = `wa-bubble ${type}`;

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
    let actionTitle = 'Ação Comercial';
    let iconClass = 'fa-solid fa-bolt';
    let summaryHtml = '';

    if (t.name === 'buscar_estoque') {
      actionTitle = 'Consulta ao Estoque do Pátio';
      iconClass = 'fa-solid fa-car-side';
      const count = (t.result && t.result.veiculos) ? t.result.veiculos.length : 0;
      summaryHtml = `
        <div style="font-size: 0.85rem; color: #fff; margin-bottom: 4px;">
          <strong>${count} veículo(s)</strong> localizado(s) no showroom.
        </div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">
          Filtros: ${t.args.marca || 'Qualquer'} ${t.args.modelo || ''} ${t.args.tipoCarroceria ? `(${t.args.tipoCarroceria})` : ''} ${t.args.precoMax ? `até R$ ${Number(t.args.precoMax).toLocaleString('pt-BR')}` : ''}
        </div>
      `;
    } else if (t.name === 'simular_financiamento') {
      actionTitle = 'Cálculo de Financiamento Automático';
      iconClass = 'fa-solid fa-calculator';
      const sim = t.result?.simulacao || {};
      summaryHtml = `
        <div style="font-size: 0.85rem; color: #4ade80; margin-bottom: 4px;">
          <strong>Entrada:</strong> R$ ${Number(sim.entrada || 0).toLocaleString('pt-BR')} | <strong>${sim.parcelas || 48}x</strong> de <strong>R$ ${Number(sim.valorParcela || 0).toLocaleString('pt-BR')}</strong>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">
          Simulação apresentada instantaneamente ao comprador.
        </div>
      `;
    } else if (t.name === 'agendar_test_drive') {
      actionTitle = 'Visita / Test-Drive Agendado!';
      iconClass = 'fa-solid fa-calendar-check';
      summaryHtml = `
        <div style="font-size: 0.85rem; color: #38bdf8; margin-bottom: 4px;">
          <strong>Data/Horário:</strong> ${t.args.dataHora || 'Horário comercial'}
        </div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">
          Vendedor da loja escalado para receber o cliente no showroom.
        </div>
      `;
    } else if (t.name === 'salvar_qualificacao_lead') {
      actionTitle = 'Ficha de Qualificação do Comprador';
      iconClass = 'fa-solid fa-user-check';
      summaryHtml = `
        <div style="font-size: 0.82rem; color: #fff; line-height: 1.4;">
          ${t.args.carroTroca ? `🚗 <strong>Possui carro na troca:</strong> ${t.args.carroTroca}<br>` : ''}
          ${t.args.valorEntrada ? `💵 <strong>Entrada disponível:</strong> R$ ${Number(t.args.valorEntrada).toLocaleString('pt-BR')}<br>` : ''}
          ${t.args.urgenciaCompra ? `⏱️ <strong>Prazo de compra:</strong> ${t.args.urgenciaCompra}` : ''}
        </div>
      `;
    } else {
      actionTitle = 'Atendimento ao Cliente';
      iconClass = 'fa-solid fa-check-double';
      summaryHtml = `<div style="font-size: 0.8rem; color: var(--text-secondary);">${JSON.stringify(t.args)}</div>`;
    }

    const logItem = document.createElement('div');
    logItem.className = 'tool-event';
    logItem.style.borderLeft = '3px solid var(--accent-cyan)';
    logItem.style.background = 'rgba(255, 255, 255, 0.03)';
    logItem.style.padding = '10px 14px';
    logItem.style.borderRadius = '8px';
    logItem.style.marginBottom = '8px';

    logItem.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-size: 0.82rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
          <i class="${iconClass}" style="color: var(--accent-cyan);"></i> ${actionTitle}
        </span>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      ${summaryHtml}
    `;
    container.appendChild(logItem);
  });

  container.scrollTop = container.scrollHeight;
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
        <td><strong><i class="fa-solid fa-clock" style="color: var(--accent-cyan); margin-right: 6px;"></i>${td.scheduled_at}</strong></td>
        <td>${td.lead_name}</td>
        <td>${td.lead_phone}</td>
        <td>${td.vehicle_make} ${td.vehicle_model}</td>
        <td>${td.seller_name || 'Lucas'}</td>
        <td><span class="stat-badge ${td.status === 'confirmado' ? 'success' : 'warning'}">${td.status}</span></td>
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
      renderVehiclesGrid(vehiclesData);
    }
  } catch (err) {
    console.error(err);
  }
}

function renderVehiclesGrid(vehicles) {
  const container = document.getElementById('vehiclesContainer');
  if (!container) return;
  container.innerHTML = vehicles.map(v => {
    const photo = (v.images && v.images.length > 0) ? v.images[0] : 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800';
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
            <span>${v.year_fab}/${v.year_model}</span>
            <span>${Number(v.mileage).toLocaleString('pt-BR')} km</span>
            <span>${v.fuel}</span>
            <span>${v.transmission}</span>
          </div>
          <div class="vehicle-footer">
            <div class="vehicle-price">R$ ${Number(v.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openNewVehicleModal() {
  document.getElementById('vehicleModal').classList.add('active');
}

function closeVehicleModal() {
  document.getElementById('vehicleModal').classList.remove('active');
}

async function handleSaveVehicle(e) {
  e.preventDefault();
  const payload = {
    make: document.getElementById('vMake').value,
    model: document.getElementById('vModel').value,
    version: document.getElementById('vVersion').value,
    year_fab: parseInt(document.getElementById('vYearFab').value, 10),
    year_model: parseInt(document.getElementById('vYearModel').value, 10),
    price: parseFloat(document.getElementById('vPrice').value)
  };

  try {
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if ((await res.json()).success) {
      closeVehicleModal();
      loadVehicles();
      loadDashboardData();
    }
  } catch (err) {
    alert('Erro ao salvar veículo');
  }
}

// ==========================================
// 8. CONFIGURAÇÕES
// ==========================================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    document.getElementById('sidebarAiProvider').textContent = `${data.provider.toUpperCase()} (${data.hasGeminiKey || data.hasOpenAiKey ? 'Chave Configurada' : 'Motor Nativo Ativo'})`;
    document.getElementById('dealershipSubtitle').textContent = data.dealership.name;
    document.getElementById('telemetryProviderBadge').textContent = `${data.provider.toUpperCase()}`;

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

    if ((await res.json()).success) {
      alert('Configurações salvas com sucesso!');
      loadSettings();
    }
  } catch (err) {
    alert('Erro ao salvar configurações');
  }
}
