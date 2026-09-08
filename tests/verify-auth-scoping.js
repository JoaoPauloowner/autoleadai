// Test script for User Auth, Scoping, and Lead Distribution
const http = require('http');
const fs = require('fs');
const path = require('path');

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

async function run() {
  // Carrega credenciais geradas dinamicamente
  let adminPassword = process.env.TEST_ADMIN_PASSWORD;
  let lucasPassword = process.env.TEST_LUCAS_PASSWORD;
  let marcosPassword = process.env.TEST_MARCOS_PASSWORD;

  const credsPath = path.join(__dirname, '..', 'data', 'initial_credentials.json');
  if (fs.existsSync(credsPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      adminPassword = adminPassword || creds.admin;
      lucasPassword = lucasPassword || creds.lucas;
      marcosPassword = marcosPassword || creds.marcos;
    } catch (e) {}
  }

  if (!adminPassword || !lucasPassword || !marcosPassword) {
    throw new Error('Falha ao obter credenciais dos usuários seed. Verifique se data/initial_credentials.json foi gerado ou forneça TEST_ADMIN_PASSWORD, etc.');
  }

  console.log('--- TEST 1: Login Carlos Diretor (Owner) ---');
  const loginOwner = await request('/api/auth/login', { method: 'POST' }, {
    email: 'admin@autolead.com',
    password: adminPassword
  });
  console.log('Owner Login Status:', loginOwner.status, 'Success:', loginOwner.data.success, 'User:', loginOwner.data.user?.name, 'Role:', loginOwner.data.user?.role);
  if (!loginOwner.data.token) throw new Error('Failed to get owner token');
  const ownerToken = loginOwner.data.token;

  console.log('\n--- TEST 2: Owner Access Knowledge Base (RAG) ---');
  const ownerKnowledge = await request('/api/knowledge', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log('Owner Knowledge Status:', ownerKnowledge.status, 'Count:', ownerKnowledge.data.data?.length);
  if (ownerKnowledge.status !== 200) throw new Error(`Falha no Teste 2: Esperado status 200, recebeu ${ownerKnowledge.status}`);

  console.log('\n--- TEST 3: Owner Access All Leads ---');
  const ownerLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log('Owner Leads Count:', ownerLeads.data.data?.length);
  console.log('Sample Leads assigned_to:', ownerLeads.data.data?.slice(0, 3).map(l => ({ id: l.id, name: l.name, seller: l.assigned_seller_name })));
  if (ownerLeads.status !== 200) throw new Error(`Falha no Teste 3: Esperado status 200, recebeu ${ownerLeads.status}`);

  console.log('\n--- TEST 4: Login Lucas Mendes (Salesperson) ---');
  const loginLucas = await request('/api/auth/login', { method: 'POST' }, {
    email: 'lucas@autolead.com',
    password: lucasPassword
  });
  console.log('Lucas Login Status:', loginLucas.status, 'Success:', loginLucas.data.success, 'Role:', loginLucas.data.user?.role);
  if (!loginLucas.data.token) throw new Error('Failed to get Lucas token');
  const lucasToken = loginLucas.data.token;
  const lucasId = loginLucas.data.user.id;

  console.log('\n--- TEST 5: Lucas Access Knowledge Base (Must be 403 Forbidden) ---');
  const lucasKnowledge = await request('/api/knowledge', {
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  console.log('Lucas Knowledge Status (Expected 403):', lucasKnowledge.status, 'Error:', lucasKnowledge.data.error);
  if (lucasKnowledge.status !== 403) throw new Error(`Falha no Teste 5: Esperado status 403, recebeu ${lucasKnowledge.status}`);

  console.log('\n--- TEST 6: Lucas Scoped Leads (Only assigned to Lucas) ---');
  const lucasLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  console.log('Lucas Leads Count:', lucasLeads.data.data?.length);
  const allLucas = (lucasLeads.data.data || []).every(l => l.assigned_to === lucasId);
  console.log('Are ALL returned leads assigned strictly to Lucas?', allLucas);
  if (!allLucas) throw new Error('Falha no Teste 6: Leads não estão estritamente filtrados para o Lucas');

  console.log('\n--- TEST 7: Login Marcos Silva (Salesperson) ---');
  const loginMarcos = await request('/api/auth/login', { method: 'POST' }, {
    email: 'marcos@autolead.com',
    password: marcosPassword
  });
  console.log('Marcos Login Status:', loginMarcos.status, 'Role:', loginMarcos.data.user?.role);
  if (!loginMarcos.data.token) throw new Error('Failed to get Marcos token');
  const marcosToken = loginMarcos.data.token;
  const marcosId = loginMarcos.data.user.id;

  console.log('\n--- TEST 8: Marcos Scoped Leads ---');
  const marcosLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${marcosToken}` }
  });
  console.log('Marcos Leads Count:', marcosLeads.data.data?.length);
  const allMarcos = (marcosLeads.data.data || []).every(l => l.assigned_to === marcosId);
  console.log('Are ALL returned leads assigned strictly to Marcos?', allMarcos);
  if (!allMarcos) throw new Error('Falha no Teste 8: Leads não estão estritamente filtrados para o Marcos');

  console.log('\n--- TEST 9: Round-Robin Distribution on New Leads ---');
  const dynamicPhone1 = `119${Date.now().toString().slice(-7)}1`;
  const dynamicPhone2 = `119${Date.now().toString().slice(-7)}2`;

  const lead1 = await request('/api/leads', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  }, {
    name: 'Cliente Teste Round Robin 1',
    phone: dynamicPhone1
  });
  console.log('Created Lead 1 assigned_to ID:', lead1.data.assigned_to);

  const lead2 = await request('/api/leads', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  }, {
    name: 'Cliente Teste Round Robin 2',
    phone: dynamicPhone2
  });
  console.log('Created Lead 2 assigned_to ID:', lead2.data.assigned_to);
  const isDistributedSequentially = lead1.data.assigned_to !== lead2.data.assigned_to;
  console.log('Different sellers assigned sequentially?', isDistributedSequentially);
  if (!isDistributedSequentially) throw new Error('Falha no Teste 9: Round-Robin não distribuiu para vendedores diferentes');

  console.log('\n--- TEST 10: Lucas Tries to Access or Update Marcos\'s Lead (Must be 403) ---');
  // Re-busca a lista atualizada de leads do Marcos para garantir que temos um lead real
  const freshMarcosLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${marcosToken}` }
  });

  if (!freshMarcosLeads.data.data || freshMarcosLeads.data.data.length === 0) {
    throw new Error('Falha no Teste 10: nenhum lead disponível para testar o cenário');
  }

  const unauthorizedLead = freshMarcosLeads.data.data[0];
  if (!unauthorizedLead || !unauthorizedLead.id) {
    throw new Error('Falha no Teste 10: nenhum lead disponível para testar o cenário');
  }

  console.log(`Testando tentativa de acesso não autorizado de Lucas ao lead #${unauthorizedLead.id} de Marcos...`);

  const lucasAccessAttempt = await request(`/api/leads/${unauthorizedLead.id}`, {
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  if (lucasAccessAttempt.status !== 403) {
    throw new Error(`Falha no Teste 10: Esperado status 403 ao acessar lead de outro vendedor, mas recebeu ${lucasAccessAttempt.status}`);
  }
  console.log('Lucas accessing Marcos lead Status (Expected 403):', lucasAccessAttempt.status, 'Error:', lucasAccessAttempt.data.error);

  const lucasUpdateAttempt = await request(`/api/leads/${unauthorizedLead.id}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  }, { status: 'proposta' });
  if (lucasUpdateAttempt.status !== 403) {
    throw new Error(`Falha no Teste 10: Esperado status 403 ao editar lead de outro vendedor, mas recebeu ${lucasUpdateAttempt.status}`);
  }
  console.log('Lucas updating Marcos lead Status (Expected 403):', lucasUpdateAttempt.status, 'Error:', lucasUpdateAttempt.data.error);

  console.log('\n🎉 ALL 10 TESTS PASSED SUCCESSFULLY AND VERIFIED!');
}

run().catch(err => {
  console.error('\n❌ ERRO DE TESTE:', err.message);
  process.exit(1);
});
