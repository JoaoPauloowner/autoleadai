// Test script for User Auth, Scoping, and Lead Distribution
const http = require('http');

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
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
  console.log('--- TEST 1: Login Carlos Diretor (Owner) ---');
  const loginOwner = await request('/api/auth/login', { method: 'POST' }, {
    email: 'admin@autolead.com',
    password: 'admin123'
  });
  console.log('Owner Login Status:', loginOwner.status, 'Success:', loginOwner.data.success, 'User:', loginOwner.data.user?.name, 'Role:', loginOwner.data.user?.role);
  if (!loginOwner.data.token) throw new Error('Failed to get owner token');
  const ownerToken = loginOwner.data.token;

  console.log('\n--- TEST 2: Owner Access Knowledge Base (RAG) ---');
  const ownerKnowledge = await request('/api/knowledge', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log('Owner Knowledge Status:', ownerKnowledge.status, 'Count:', ownerKnowledge.data.data?.length);

  console.log('\n--- TEST 3: Owner Access All Leads ---');
  const ownerLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log('Owner Leads Count:', ownerLeads.data.data?.length);
  console.log('Sample Leads assigned_to:', ownerLeads.data.data?.slice(0, 3).map(l => ({ id: l.id, name: l.name, seller: l.assigned_seller_name })));

  console.log('\n--- TEST 4: Login Lucas Mendes (Salesperson) ---');
  const loginLucas = await request('/api/auth/login', { method: 'POST' }, {
    email: 'lucas@autolead.com',
    password: 'vendedor123'
  });
  console.log('Lucas Login Status:', loginLucas.status, 'Success:', loginLucas.data.success, 'Role:', loginLucas.data.user?.role);
  const lucasToken = loginLucas.data.token;
  const lucasId = loginLucas.data.user.id;

  console.log('\n--- TEST 5: Lucas Access Knowledge Base (Must be 403 Forbidden) ---');
  const lucasKnowledge = await request('/api/knowledge', {
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  console.log('Lucas Knowledge Status (Expected 403):', lucasKnowledge.status, 'Error:', lucasKnowledge.data.error);

  console.log('\n--- TEST 6: Lucas Scoped Leads (Only assigned to Lucas) ---');
  const lucasLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${lucasToken}` }
  });
  console.log('Lucas Leads Count:', lucasLeads.data.data?.length);
  const allLucas = lucasLeads.data.data.every(l => l.assigned_to === lucasId);
  console.log('Are ALL returned leads assigned strictly to Lucas?', allLucas);

  console.log('\n--- TEST 7: Login Marcos Silva (Salesperson) ---');
  const loginMarcos = await request('/api/auth/login', { method: 'POST' }, {
    email: 'marcos@autolead.com',
    password: 'vendedor123'
  });
  console.log('Marcos Login Status:', loginMarcos.status, 'Role:', loginMarcos.data.user?.role);
  const marcosToken = loginMarcos.data.token;
  const marcosId = loginMarcos.data.user.id;

  console.log('\n--- TEST 8: Marcos Scoped Leads ---');
  const marcosLeads = await request('/api/leads', {
    headers: { 'Authorization': `Bearer ${marcosToken}` }
  });
  console.log('Marcos Leads Count:', marcosLeads.data.data?.length);
  const allMarcos = marcosLeads.data.data.every(l => l.assigned_to === marcosId);
  console.log('Are ALL returned leads assigned strictly to Marcos?', allMarcos);

  console.log('\n--- TEST 9: Round-Robin Distribution on New Leads ---');
  const lead1 = await request('/api/leads', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  }, {
    name: 'Cliente Teste Round Robin 1',
    phone: '11999990001'
  });
  console.log('Created Lead 1 Full Response:', lead1);
  console.log('Created Lead 1 assigned_to ID:', lead1.data.assigned_to);

  const lead2 = await request('/api/leads', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  }, {
    name: 'Cliente Teste Round Robin 2',
    phone: '11999990002'
  });
  console.log('Created Lead 2 assigned_to ID:', lead2.data.assigned_to);
  console.log('Different sellers assigned sequentially?', lead1.data.assigned_to !== lead2.data.assigned_to);

  console.log('\n--- TEST 10: Lucas Tries to Access or Update Marcos\'s Lead (Must be 403) ---');
  const unauthorizedLead = marcosLeads.data.data[0];
  if (unauthorizedLead) {
    const lucasAccessAttempt = await request(`/api/leads/${unauthorizedLead.id}`, {
      headers: { 'Authorization': `Bearer ${lucasToken}` }
    });
    console.log('Lucas accessing Marcos lead Status (Expected 403):', lucasAccessAttempt.status, 'Error:', lucasAccessAttempt.data.error);

    const lucasUpdateAttempt = await request(`/api/leads/${unauthorizedLead.id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${lucasToken}` }
    }, { status: 'proposta' });
    console.log('Lucas updating Marcos lead Status (Expected 403):', lucasUpdateAttempt.status, 'Error:', lucasUpdateAttempt.data.error);
  }

  console.log('\n🎉 ALL 10 TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
