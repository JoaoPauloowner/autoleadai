const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runScenarioTests() {
  console.log('\n===============================================================');
  console.log('🧪 TESTE COMPLETO DOS CENÁRIOS DO ZERO (CENÁRIO A & CENÁRIO B)');
  console.log('===============================================================\n');

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

  const dbPath = path.join(__dirname, '..', 'data', 'autolead.db');

  // Passo 1: Limpa tabela de usuários e sessões para simular instalação limpa
  console.log('Passo 1: Resetando tabela de usuários para simular banco limpo do zero...');
  const db = new DatabaseSync(dbPath);
  db.exec('DELETE FROM sessions;');
  db.exec('DELETE FROM users;');
  db.close();

  // CENÁRIO A: Fluxo de Primeira Configuração (First-Run Setup)
  console.log('\n--- CENÁRIO A: Fluxo de Primeira Configuração ---');

  // A1: GET /api/auth/setup-status deve retornar needsSetup: true
  const statusBefore = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/setup-status',
    method: 'GET'
  });
  assert(statusBefore.statusCode === 200, 'GET /api/auth/setup-status responde 200');
  assert(statusBefore.data.needsSetup === true, 'Banco limpo detectado: needsSetup === true');

  // A2: Criar a conta do proprietário via POST /api/auth/setup
  const ownerData = {
    name: 'Carlos Fundador',
    email: 'proprietario.real@concessionaria.com.br',
    password: 'MinhaSenhaSuperForte123!'
  };

  const setupRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/setup',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, ownerData);

  assert(setupRes.statusCode === 201, `POST /api/auth/setup retornou 201 Created (${setupRes.statusCode})`);
  assert(setupRes.data.success === true, 'Proprietário criado com sucesso via setup');

  // A3: Confirmar que a tela de setup nunca mais aparece em requisições futuras
  const statusAfter = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/setup-status',
    method: 'GET'
  });
  assert(statusAfter.data.needsSetup === false, 'needsSetup agora é false permanentemente');

  // A4: Confirmar que tentar rodar setup novamente é estritamente bloqueado (403 Forbidden)
  const duplicateSetup = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/setup',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Tentativa Repetida',
    email: 'outro@loja.com',
    password: 'OutraSenhaForte123!'
  });
  assert(duplicateSetup.statusCode === 403, `Segunda chamada de setup é bloqueada com 403 Forbidden (${duplicateSetup.statusCode})`);

  // A5: Confirmar que o login normal funciona com a conta recém-criada
  const loginOwner = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: ownerData.email,
    password: ownerData.password
  });

  assert(loginOwner.statusCode === 200, `Login do Proprietário recém-criado teve sucesso (200)`);
  assert(loginOwner.data.token && loginOwner.data.user.role === 'owner', `Token emitido com role 'owner' para ${loginOwner.data.user.name}`);
  const ownerToken = loginOwner.data.token;

  // CENÁRIO B: Edição de e-mail de usuário existente
  console.log('\n--- CENÁRIO B: Edição de E-mail de Usuário Existente ---');

  // B1: Com o proprietário criado, criar um vendedor via POST /api/users
  const sellerInitialEmail = 'vendedor.antigo@concessionaria.com.br';
  const sellerPassword = 'SenhaVendedor123!';
  const createSeller = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/users',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    name: 'Vendedor Teste',
    email: sellerInitialEmail,
    role: 'salesperson',
    password: sellerPassword
  });

  assert(createSeller.statusCode === 201, `Vendedor criado pelo Owner com sucesso (status: ${createSeller.statusCode})`);
  const sellerId = createSeller.data.user.id;

  // B2: Confirmar login funcionando com o e-mail antigo
  const loginSellerOld = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: sellerInitialEmail,
    password: sellerPassword
  });
  assert(loginSellerOld.statusCode === 200, 'Login do vendedor com e-mail antigo funciona normalmente');

  // B3: Testar validações de e-mail na edição
  // B3.1: Formato inválido
  const editInvalid = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/${sellerId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    email: 'formato-invalido'
  });
  assert(editInvalid.statusCode === 400, 'Rejeita formato de e-mail inválido com status 400');

  // B3.2: E-mail duplicado pertencente a outro usuário (proprietário)
  const editDuplicate = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/${sellerId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    email: ownerData.email
  });
  assert(editDuplicate.statusCode === 409, 'Rejeita duplicidade de e-mail existente com status 409');

  // B4: Editar o e-mail do vendedor para um novo e-mail
  const sellerNewEmail = 'vendedor.novo@concessionaria.com.br';
  const editSuccess = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/${sellerId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    name: 'Vendedor Teste Renomeado',
    email: sellerNewEmail
  });

  assert(editSuccess.statusCode === 200, `E-mail alterado com sucesso para ${sellerNewEmail} (status 200)`);
  assert(editSuccess.data.user.email === sellerNewEmail, `Objeto retornado contém o novo e-mail`);

  // B5: Confirmar que o login passa a funcionar com o novo e-mail
  const loginSellerNew = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: sellerNewEmail,
    password: sellerPassword
  });
  assert(loginSellerNew.statusCode === 200, 'Login do vendedor com o NOVO e-mail funciona perfeitamente');
  assert(loginSellerNew.data.token != null, 'Novo token de sessão emitido com sucesso');

  // B6: Confirmar que o e-mail antigo NÃO funciona mais
  const loginSellerOldAgain = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: sellerInitialEmail,
    password: sellerPassword
  });
  assert(loginSellerOldAgain.statusCode === 401, `Login com e-mail antigo foi bloqueado com 401 Unauthorized (${loginSellerOldAgain.statusCode})`);

  // B7: Verificar registro de auditoria no banco
  const dbVerify = new DatabaseSync(dbPath);
  const auditLogs = dbVerify.prepare(`
    SELECT * FROM audit_log 
    WHERE action = 'update_user' AND entity_id = ? 
    ORDER BY id DESC LIMIT 1
  `).get(String(sellerId));

  assert(auditLogs != null, 'Registro de auditoria encontrado para update_user');
  assert(auditLogs.details.includes(sellerNewEmail), 'Log de auditoria registra a troca para o novo e-mail');
  dbVerify.close();

  console.log('\n===============================================================');
  console.log(`RESULTADO DOS CENÁRIOS: ${passed} passaram | ${failed} falharam`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runScenarioTests();
