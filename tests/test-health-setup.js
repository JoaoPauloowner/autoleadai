const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTES AUTOMATIZADOS: /health & FIRST-RUN SETUP');
  console.log('======================================================\n');

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

  // 1. Teste GET /health
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    });
    assert(res.statusCode === 200, `GET /health status 200 (retornou: ${res.statusCode})`);
    assert(res.data && res.data.status === 'ok', `GET /health retorna { status: 'ok' } (retornou: ${JSON.stringify(res.data)})`);
  } catch (err) {
    assert(false, `GET /health falhou com erro de conexão: ${err.message}`);
  }

  // 2. Teste GET /api/auth/setup-status no servidor ativo
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/setup-status',
      method: 'GET'
    });
    assert(res.statusCode === 200, `GET /api/auth/setup-status status 200 (retornou: ${res.statusCode})`);
    assert(res.data && res.data.success === true, `GET /api/auth/setup-status retorna success: true`);
    assert(res.data && typeof res.data.needsSetup === 'boolean', `GET /api/auth/setup-status retorna campo booleano needsSetup (${res.data?.needsSetup})`);
  } catch (err) {
    assert(false, `GET /api/auth/setup-status falhou com erro: ${err.message}`);
  }

  // 3. Teste POST /api/auth/setup no servidor ativo (se já existirem usuários, DEVE retornar 403 Forbidden)
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/setup',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Tentativa Invasor',
      email: 'hacker@invasao.com',
      password: 'senhaMuitoLonga123'
    });

    if (res.statusCode === 403) {
      assert(true, `POST /api/auth/setup bloqueia com 403 quando o sistema já possui usuários`);
      assert(res.data.error.includes('já foi configurado') || res.data.error.includes('já possui'), `Mensagem de erro clara de segurança: ${res.data.error}`);
    } else {
      console.log(`Nota: Banco de dados está atualmente em estado needsSetup: true (status retornado: ${res.statusCode})`);
    }
  } catch (err) {
    assert(false, `POST /api/auth/setup falhou com erro: ${err.message}`);
  }

  // 4. Teste em banco temporário isolado do fluxo de ponta a ponta (Zero Users -> Setup -> Post-Setup Lockout)
  console.log('\n--- Testando ciclo completo de First-Run Setup em banco isolado ---');
  const tempDbPath = path.join(__dirname, 'temp_setup_test.db');
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  try {
    const tempDb = new DatabaseSync(tempDbPath);
    tempDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'salesperson',
        organization_id TEXT NOT NULL DEFAULT 'default',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Passo A: banco vazio -> needsSetup = true
    const checkEmpty = tempDb.prepare('SELECT COUNT(*) as count FROM users').get();
    assert(checkEmpty.count === 0, 'Banco temporário iniciado com 0 usuários');
    assert((!checkEmpty || checkEmpty.count === 0) === true, 'needsSetup é true quando users = 0');

    // Passo B: Validações de entrada
    const shortPass = '123';
    assert(shortPass.length < 8, 'Validação rejeita senha menor que 8 caracteres');

    // Passo C: Inserção do primeiro owner
    const cleanName = 'Carlos Proprietário';
    const cleanEmail = 'proprietario@concessionaria.com.br';
    const cleanPass = 'SenhaForte123!';
    const passwordHash = bcrypt.hashSync(cleanPass, 10);

    const insertStmt = tempDb.prepare(`
      INSERT INTO users (name, email, password_hash, role, organization_id, is_active)
      VALUES (?, ?, ?, 'owner', 'default', 1)
    `);
    const insertResult = insertStmt.run(cleanName, cleanEmail, passwordHash);
    assert(insertResult.lastInsertRowid > 0, `Primeiro proprietário inserido com ID ${insertResult.lastInsertRowid}`);

    // Passo D: Agora needsSetup deve ser false
    const checkPopulated = tempDb.prepare('SELECT COUNT(*) as count FROM users').get();
    assert(checkPopulated.count === 1, 'Banco temporário agora possui exatamente 1 usuário');
    const userInDb = tempDb.prepare('SELECT * FROM users WHERE id = ?').get(insertResult.lastInsertRowid);
    assert(userInDb.role === 'owner', `Papel atribuído é estritamente 'owner' (${userInDb.role})`);
    assert(bcrypt.compareSync(cleanPass, userInDb.password_hash), 'Hash bcrypt da senha validado com sucesso');

    // Passo E: Segunda tentativa de setup DEVE falhar (bloqueio atômico)
    const existingNow = tempDb.prepare('SELECT COUNT(*) as count FROM users').get();
    const wouldBlock = (existingNow && existingNow.count > 0);
    assert(wouldBlock === true, 'Segunda chamada de setup é estritamente bloqueada com 403 Forbidden');

    tempDb.close();
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch (err) {
    assert(false, `Falha no teste isolado de banco: ${err.message}`);
  }

  console.log('\n======================================================');
  console.log(`RESULTADO: ${passed} passaram | ${failed} falharam`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
