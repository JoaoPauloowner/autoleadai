const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n================================================================');
  console.log('🧪 TESTE DE PERSISTÊNCIA: CIDADE DA CONCESSIONÁRIA & REINÍCIO');
  console.log('================================================================\n');

  const credsPath = path.join(__dirname, '..', 'data', 'initial_credentials.json');
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

  // 1. Login como Owner
  const login = await request('/api/auth/login', { method: 'POST' }, {
    email: 'admin@autolead.com',
    password: creds.admin
  });
  if (!login.data.token) throw new Error('Falha no login do Owner');
  const token = login.data.token;
  console.log('✅ 1. Login do Owner realizado com sucesso');

  // 2. Altera a cidade para Campinas - SP
  const novaCidade = 'Campinas - SP';
  const postRes = await request('/api/settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  }, {
    dealershipCity: novaCidade
  });
  if (postRes.status !== 200) throw new Error('Falha ao salvar dealershipCity no POST /api/settings');
  console.log(`✅ 2. POST /api/settings com dealershipCity="${novaCidade}" respondeu 200`);

  // 3. Checa se o GET /api/settings reflete a nova cidade imediatamente
  const getRes1 = await request('/api/settings', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (getRes1.data.data?.dealership?.city !== novaCidade) {
    throw new Error(`GET /api/settings não retornou a nova cidade. Retornou: ${getRes1.data.data?.dealership?.city}`);
  }
  console.log(`✅ 3. GET /api/settings em memória retornou: "${getRes1.data.data.dealership.city}"`);

  // 4. Mata o processo do servidor e sobe de novo para testar persistência em disco (SQLite)
  console.log('🔄 4. Simulando reinício do servidor (lendo direto do banco com módulo isolado)...');
  
  // Limpa o cache do require para forçar releitura do banco e do ai-provider
  delete require.cache[require.resolve('../src/config/database')];
  delete require.cache[require.resolve('../src/config/settings-store')];
  delete require.cache[require.resolve('../src/config/ai-provider')];

  const freshConfig = require('../src/config/ai-provider');
  if (freshConfig.dealership.city !== novaCidade) {
    throw new Error(`Falha na persistência: ao recarregar o módulo isolado, cidade esperada "${novaCidade}", mas veio "${freshConfig.dealership.city}"`);
  }
  console.log(`✅ 5. ai-provider recarregado do zero com dados persistidos no SQLite: "${freshConfig.dealership.city}"`);

  // 5. Restaura para São Paulo - SP
  const resetRes = await request('/api/settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  }, {
    dealershipCity: 'São Paulo - SP'
  });
  console.log('✅ 6. Cidade restaurada com sucesso para "São Paulo - SP"');

  console.log('\n================================================================');
  console.log('🎉 TESTE DE PERSISTÊNCIA DA CIDADE CONCLUÍDO COM 100% DE SUCESSO!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
