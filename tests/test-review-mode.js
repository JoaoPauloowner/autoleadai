const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

function request(pathUrl, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: pathUrl,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 TESTES AUTOMATIZADOS: MODO COPILOTO / REVISÃO HUMANA (AI REVIEW)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Carrega credenciais
  const credsPath = path.join(__dirname, '..', 'data', 'initial_credentials.json');
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

  const loginOwner = await request('/api/auth/login', { method: 'POST' }, {
    email: 'admin@autolead.com',
    password: creds.admin
  });
  const ownerToken = loginOwner.data.token;
  assert(ownerToken, 'Login do Owner realizado com sucesso');

  const loginLucas = await request('/api/auth/login', { method: 'POST' }, {
    email: 'lucas@autolead.com',
    password: creds.lucas
  });
  const lucasToken = loginLucas.data.token;
  const lucasId = loginLucas.data.user.id;
  assert(lucasToken, 'Login do Vendedor Lucas realizado');

  const loginMarcos = await request('/api/auth/login', { method: 'POST' }, {
    email: 'marcos@autolead.com',
    password: creds.marcos
  });
  const marcosToken = loginMarcos.data.token;
  const marcosId = loginMarcos.data.user.id;
  assert(marcosToken, 'Login do Vendedor Marcos realizado');

  // 2. Testa GET /api/settings para checar campos DeepSeek e Review Mode
  console.log('\n--- TESTE 1: Configuração do Motor de IA e Provedor DeepSeek ---');
  const getSettings = await request('/api/settings', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert(getSettings.status === 200, 'GET /api/settings responde 200');
  assert(getSettings.data.data.deepseekModel === 'deepseek-chat', 'Modelo DeepSeek configurado como deepseek-chat');
  assert(getSettings.data.data.geminiModel === 'gemini-3.1-flash-lite', 'Modelo Gemini atualizado para gemini-3.1-flash-lite');
  assert(typeof getSettings.data.data.aiReviewMode === 'boolean', 'aiReviewMode retornado como booleano nas configs');

  // Atualiza aiReviewMode via POST /api/settings
  const postSettings = await request('/api/settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  }, {
    aiReviewMode: true,
    deepseekKey: 'sk-test-deepseek-key'
  });
  assert(postSettings.status === 200, 'POST /api/settings salva aiReviewMode: true');

  const verifySettings = await request('/api/settings', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert(verifySettings.data.data.aiReviewMode === true, 'aiReviewMode persistido como true');
  assert(verifySettings.data.data.hasDeepseekKey === true, 'hasDeepseekKey persistido como true');

  // Cria leads de teste controlados para Lucas e Marcos
  const now = Date.now();
  const insertLead = db.prepare(`
    INSERT INTO leads (name, phone, channel, status, score, assigned_to, ai_enabled)
    VALUES (?, ?, 'whatsapp', 'qualificado', 50, ?, 1)
  `);

  const leadLucasRes = insertLead.run('Lead do Lucas Copilot', `551198888${now.toString().slice(-4)}`, lucasId);
  const leadLucasId = Number(leadLucasRes.lastInsertRowid);

  const leadMarcosRes = insertLead.run('Lead do Marcos Copilot', `551197777${now.toString().slice(-4)}`, marcosId);
  const leadMarcosId = Number(leadMarcosRes.lastInsertRowid);

  // 3. Testa Criação de Mensagens Pendentes de Revisão
  console.log('\n--- TESTE 2: Mensagem salva como pending_review e listada em GET /api/chat/pending-review ---');
  const insertMsg = db.prepare(`
    INSERT INTO chat_messages (lead_id, sender, content, copilot_status)
    VALUES (?, 'assistant', ?, ?)
  `);

  const msgDraftLucasRes = insertMsg.run(
    leadLucasId,
    'Olá! Este é um rascunho de IA para o lead do Lucas.',
    'pending_review'
  );
  const msgDraftLucasId = Number(msgDraftLucasRes.lastInsertRowid);

  // Consulta pending reviews como Owner
  const ownerPending = await request('/api/chat/pending-review', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert(ownerPending.status === 200, 'Owner consulta GET /api/chat/pending-review com sucesso');
  const foundLucasMsgInOwner = ownerPending.data.data.find(m => m.id === msgDraftLucasId);
  assert(foundLucasMsgInOwner !== undefined, 'Owner vê a mensagem pendente do Lucas');
  assert(foundLucasMsgInOwner?.copilot_status === 'pending_review', 'Status da mensagem é pending_review');

  // 4. Testa Aprovação de Rascunho (POST /api/chat/:messageId/approve)
  console.log('\n--- TESTE 3: Aprovação de rascunho pelo vendedor responsável ---');
  const approveRes = await request(`/api/chat/${msgDraftLucasId}/approve`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  assert(approveRes.status === 200, 'Lucas aprova seu próprio rascunho com 200 OK');
  assert(approveRes.data.copilot_status === 'approved', 'Status de retorno é approved');

  // Verifica no banco
  const approvedDbMsg = db.prepare('SELECT copilot_status FROM chat_messages WHERE id = ?').get(msgDraftLucasId);
  assert(approvedDbMsg.copilot_status === 'approved', 'No banco de dados o status foi atualizado para approved');

  // Tentativa de aprovar novamente deve falhar com 400
  const reApproveRes = await request(`/api/chat/${msgDraftLucasId}/approve`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  assert(reApproveRes.status === 400, 'Re-aprovação de mensagem já processada bloqueada com 400');

  // 5. Testa Edição e Envio (POST /api/chat/:messageId/edit-and-send)
  console.log('\n--- TESTE 4: Edição de texto e envio de rascunho ---');
  const msgDraft2Res = insertMsg.run(
    leadLucasId,
    'Texto original da IA aguardando edição.',
    'pending_review'
  );
  const msgDraft2Id = Number(msgDraft2Res.lastInsertRowid);

  const editedText = 'Texto editado e validado pessoalmente pelo consultor de vendas.';
  const editAndSendRes = await request(`/api/chat/${msgDraft2Id}/edit-and-send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  }, { editedText });

  assert(editAndSendRes.status === 200, 'Lucas edita e envia rascunho com sucesso (200)');
  assert(editAndSendRes.data.copilot_status === 'edited', 'Status de retorno é edited');
  assert(editAndSendRes.data.content === editedText, 'Conteúdo retornado reflete o texto editado');

  const editedDbMsg = db.prepare('SELECT content, copilot_status FROM chat_messages WHERE id = ?').get(msgDraft2Id);
  assert(editedDbMsg.content === editedText, 'No banco de dados o conteúdo da mensagem foi atualizado');
  assert(editedDbMsg.copilot_status === 'edited', 'No banco de dados o status é edited');

  // 6. Testa Recusa de Rascunho com Human Takeover (POST /api/chat/:messageId/reject)
  console.log('\n--- TESTE 5: Recusa de rascunho com assunção humana (markHumanTakeover) ---');
  const msgDraft3Res = insertMsg.run(
    leadLucasId,
    'Rascunho que o vendedor não quer enviar.',
    'pending_review'
  );
  const msgDraft3Id = Number(msgDraft3Res.lastInsertRowid);

  const rejectRes = await request(`/api/chat/${msgDraft3Id}/reject`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  }, { markHumanTakeover: true });

  assert(rejectRes.status === 200, 'Lucas recusa rascunho com 200 OK');
  assert(rejectRes.data.copilot_status === 'rejected', 'Status de retorno é rejected');

  const rejectedDbMsg = db.prepare('SELECT copilot_status FROM chat_messages WHERE id = ?').get(msgDraft3Id);
  assert(rejectedDbMsg.copilot_status === 'rejected', 'No banco de dados o status é rejected');

  const leadUpdated = db.prepare('SELECT ai_enabled FROM leads WHERE id = ?').get(leadLucasId);
  assert(leadUpdated.ai_enabled === 0, 'Com markHumanTakeover: true, o lead teve ai_enabled desativado (0)');

  // 7. Testa Escopo de Autorização: Vendedor A não pode atuar em rascunho do Vendedor B (403)
  console.log('\n--- TESTE 6: Escopo de Autorização entre Vendedores (403 Forbidden) ---');
  const msgDraftMarcosRes = insertMsg.run(
    leadMarcosId,
    'Rascunho pertencente ao lead do Marcos.',
    'pending_review'
  );
  const msgDraftMarcosId = Number(msgDraftMarcosRes.lastInsertRowid);

  // Lucas tenta aprovar o rascunho do Marcos
  const unauthorizedApprove = await request(`/api/chat/${msgDraftMarcosId}/approve`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  assert(unauthorizedApprove.status === 403, 'Lucas tentando aprovar lead do Marcos recebe 403 Forbidden');

  // Lucas tenta editar o rascunho do Marcos
  const unauthorizedEdit = await request(`/api/chat/${msgDraftMarcosId}/edit-and-send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  }, { editedText: 'Tentativa indevida' });
  assert(unauthorizedEdit.status === 403, 'Lucas tentando editar lead do Marcos recebe 403 Forbidden');

  // Lucas tenta recusar o rascunho do Marcos
  const unauthorizedReject = await request(`/api/chat/${msgDraftMarcosId}/reject`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  }, { markHumanTakeover: false });
  assert(unauthorizedReject.status === 403, 'Lucas tentando recusar lead do Marcos recebe 403 Forbidden');

  // Lucas visualiza lista pendente e NÃO deve ver o rascunho do Marcos
  const lucasPendingList = await request('/api/chat/pending-review', {
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  const sawMarcosDraft = lucasPendingList.data.data.some(m => m.id === msgDraftMarcosId);
  assert(!sawMarcosDraft, 'Lucas NÃO visualiza rascunho pendente do Marcos em seu GET /api/chat/pending-review');

  // Marcos visualiza e vê seu próprio rascunho
  const marcosPendingList = await request('/api/chat/pending-review', {
    headers: { 'Authorization': `Bearer ${marcosToken}` }
  });
  const marcosSawOwnDraft = marcosPendingList.data.data.some(m => m.id === msgDraftMarcosId);
  assert(marcosSawOwnDraft, 'Marcos visualiza seu próprio rascunho na lista pendente');

  // Marcos aprova seu próprio rascunho
  const marcosApprove = await request(`/api/chat/${msgDraftMarcosId}/approve`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${marcosToken}` }
  });
  assert(marcosApprove.status === 200, 'Marcos aprova com sucesso seu próprio rascunho');

  // 8. Testa Registro de Auditoria
  console.log('\n--- TESTE 7: Registros de Auditoria dos Eventos Copiloto ---');
  const auditLogs = db.prepare(`
    SELECT action, entity_id, actor
    FROM audit_log
    WHERE action IN ('copilot_approve', 'copilot_edit_and_send', 'copilot_reject')
    ORDER BY created_at DESC
    LIMIT 10
  `).all();
  const actionsLogged = auditLogs.map(a => a.action);
  assert(actionsLogged.includes('copilot_approve'), 'Ação copilot_approve registrada no log de auditoria');
  assert(actionsLogged.includes('copilot_edit_and_send'), 'Ação copilot_edit_and_send registrada no log de auditoria');
  assert(actionsLogged.includes('copilot_reject'), 'Ação copilot_reject registrada no log de auditoria');

  // Restaura aiReviewMode para false como padrão limpo
  await request('/api/settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  }, { aiReviewMode: false });
  const finalSettings = await request('/api/settings', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert(finalSettings.data.data.aiReviewMode === false, 'aiReviewMode restaurado para false como padrão');

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL: ${passed} passaram | ${failed} falharam`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\n❌ ERRO INESPERADO NOS TESTES:', err);
  process.exit(1);
});
