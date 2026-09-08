/**
 * Script de Demonstração / Desenvolvimento: AutoLead AI
 * Executável via: npm run seed:demo
 * 
 * Popula usuários fictícios (Carlos Diretor, Lucas Mendes e Marcos Silva),
 * gera senhas aleatórias seguras e salva em data/initial_credentials.json.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

console.log('\n================================================================================');
console.log('🚗💨 AUTOLEAD AI — POPULANDO DADOS DE DEMONSTRAÇÃO (SEED MANUAL)');
console.log('================================================================================\n');

try {
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, organization_id, is_active)
    VALUES (?, ?, ?, ?, 'default', 1)
  `);

  const updateUser = db.prepare(`
    UPDATE users 
    SET name = ?, password_hash = ?, role = ?, is_active = 1
    WHERE email = ?
  `);

  const adminPassword = crypto.randomBytes(8).toString('hex');
  const lucasPassword = crypto.randomBytes(8).toString('hex');
  const marcosPassword = crypto.randomBytes(8).toString('hex');

  const ownerHash = bcrypt.hashSync(adminPassword, 10);
  const lucasHash = bcrypt.hashSync(lucasPassword, 10);
  const marcosHash = bcrypt.hashSync(marcosPassword, 10);

  const demoUsers = [
    { name: 'Carlos Diretor', email: 'admin@autolead.com', hash: ownerHash, role: 'owner', pass: adminPassword },
    { name: 'Lucas Mendes', email: 'lucas@autolead.com', hash: lucasHash, role: 'salesperson', pass: lucasPassword },
    { name: 'Marcos Silva', email: 'marcos@autolead.com', hash: marcosHash, role: 'salesperson', pass: marcosPassword }
  ];

  for (const u of demoUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (existing) {
      updateUser.run(u.name, u.hash, u.role, u.email);
    } else {
      insertUser.run(u.name, u.email, u.hash, u.role);
    }
  }

  // Garante diretório data
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Salva no arquivo initial_credentials.json para uso em testes
  const credsPath = path.join(dataDir, 'initial_credentials.json');
  fs.writeFileSync(credsPath, JSON.stringify({
    admin: adminPassword,
    lucas: lucasPassword,
    marcos: marcosPassword,
    updated_at: new Date().toISOString()
  }, null, 2));

  // Atribui leads existentes aos vendedores de teste
  const lucas = db.prepare("SELECT id FROM users WHERE email = 'lucas@autolead.com'").get();
  const marcos = db.prepare("SELECT id FROM users WHERE email = 'marcos@autolead.com'").get();

  if (lucas && marcos) {
    db.prepare(`
      UPDATE leads 
      SET assigned_to = CASE WHEN (id % 2 = 0) THEN ? ELSE ? END 
      WHERE assigned_to IS NULL OR assigned_to NOT IN (SELECT id FROM users)
    `).run(lucas.id, marcos.id);
  }

  console.log('✅ Usuários de demonstração criados/atualizados com sucesso!\n');
  console.log(`👑 Carlos Diretor (Owner):       admin@autolead.com  | Senha: ${adminPassword}`);
  console.log(`👔 Lucas Mendes   (Salesperson): lucas@autolead.com  | Senha: ${lucasPassword}`);
  console.log(`👔 Marcos Silva   (Salesperson): marcos@autolead.com  | Senha: ${marcosPassword}`);
  console.log('\n📄 Credenciais salvas em: data/initial_credentials.json');
  console.log('================================================================================\n');

  process.exit(0);
} catch (err) {
  console.error('❌ Erro ao popular dados de demonstração:', err);
  process.exit(1);
}
