const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Garante que o diretório 'data' exista
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'autolead.db');
const db = new DatabaseSync(dbPath);

try {
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('Aviso PRAGMA:', e.message);
}

function addColumnIfNotExists(table, column, def) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
  } catch (e) {
    // Coluna já existe, ignora
  }
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      version TEXT NOT NULL,
      year_fab INTEGER NOT NULL,
      year_model INTEGER NOT NULL,
      price REAL NOT NULL,
      mileage INTEGER NOT NULL,
      transmission TEXT NOT NULL,
      fuel TEXT NOT NULL,
      color TEXT NOT NULL,
      plate_end TEXT,
      body_type TEXT DEFAULT 'Sedan',
      features TEXT, -- JSON array
      images TEXT,   -- JSON array de URLs
      status TEXT DEFAULT 'disponivel', -- 'disponivel', 'reservado', 'vendido'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      channel TEXT DEFAULT 'whatsapp', -- 'whatsapp', 'simulator', 'site', 'webmotors', 'instagram'
      status TEXT DEFAULT 'novo',      -- 'novo', 'qualificado', 'test_drive', 'proposta', 'fechado', 'perdido'
      budget_max REAL,
      payment_method TEXT,             -- 'a_vista', 'financiamento', 'consorcio'
      has_trade_in INTEGER DEFAULT 0,  -- 0 ou 1
      trade_in_details TEXT,
      interested_vehicle_id INTEGER,
      ai_summary TEXT,
      score INTEGER DEFAULT 25,        -- Lead Score de 0 a 100
      score_breakdown TEXT,            -- JSON com as 4 notas dos pilares
      next_action_title TEXT,          -- Próxima ação recomendada
      next_action_at DATETIME,         -- Prazo da próxima ação
      source_campaign TEXT,            -- Origem da campanha
      last_inbound_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_outbound_at DATETIME,
      is_demo_data INTEGER DEFAULT 0,
      ai_enabled INTEGER DEFAULT 1,    -- 1: IA atende no WhatsApp | 0: Vendedor humano assumiu
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (interested_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL,              -- 'whatsapp', 'ligacao', 'test_drive', 'proposta'
      title TEXT NOT NULL,
      due_at DATETIME NOT NULL,
      status TEXT DEFAULT 'pendente',  -- 'pendente', 'concluida', 'atrasada'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      lead_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      scheduled_at DATETIME NOT NULL,
      seller_name TEXT DEFAULT 'Consultor de Vendas',
      status TEXT DEFAULT 'confirmado', -- 'pendente', 'confirmado', 'realizado', 'cancelado'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      lead_id INTEGER NOT NULL,
      sender TEXT NOT NULL,           -- 'user', 'assistant', 'system'
      content TEXT NOT NULL,
      tool_calls TEXT,                -- JSON com ferramentas acionadas pela IA
      copilot_status TEXT DEFAULT 'approved', -- 'pending_review', 'approved', 'rejected', 'edited'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_rules (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT PRIMARY KEY,
      received_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'salesperson', 'manager')),
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      category TEXT DEFAULT 'geral', -- 'financiamento', 'troca', 'garantia', 'loja', 'documentacao'
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      keywords TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    // Garante que não haja múltiplos test drives ativos duplicados por lead
    db.exec(`
      UPDATE test_drives
      SET status = 'cancelado',
          notes = COALESCE(notes || ' | ', '') || 'Duplicidade cancelada'
      WHERE status IN ('pendente', 'confirmado')
        AND id NOT IN (
          SELECT MIN(id)
          FROM test_drives
          WHERE status IN ('pendente', 'confirmado')
          GROUP BY lead_id
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_test_drive_per_lead
        ON test_drives (lead_id)
        WHERE status IN ('pendente', 'confirmado');
    `);
  } catch (idxErr) {
    console.warn('Aviso ao aplicar índice de test-drive:', idxErr.message);
  }

  // Garante colunas novas caso o banco já existisse
  addColumnIfNotExists('vehicles', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('leads', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('tasks', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('test_drives', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('chat_messages', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('leads', 'score', 'INTEGER DEFAULT 25');
  addColumnIfNotExists('leads', 'score_breakdown', 'TEXT');
  addColumnIfNotExists('leads', 'next_action_title', 'TEXT');
  addColumnIfNotExists('leads', 'next_action_at', 'DATETIME');
  addColumnIfNotExists('leads', 'source_campaign', 'TEXT');
  addColumnIfNotExists('leads', 'last_inbound_at', 'DATETIME');
  addColumnIfNotExists('leads', 'last_outbound_at', 'DATETIME');
  addColumnIfNotExists('leads', 'is_demo_data', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('leads', 'ai_enabled', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('leads', 'assigned_to', 'INTEGER');
  addColumnIfNotExists('leads', 'remote_jid', 'TEXT');
  addColumnIfNotExists('chat_messages', 'copilot_status', "TEXT DEFAULT 'approved'");

  // Migração da tabela users para aceitar papel 'manager' caso tenha sido criada com restrição antiga
  try {
    const usersTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (usersTableSql && usersTableSql.sql && !usersTableSql.sql.includes("'manager'")) {
      console.log('🔄 Migrando tabela users para suportar o papel manager...');
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec(`
        CREATE TABLE users_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id TEXT DEFAULT 'default',
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('owner', 'salesperson', 'manager')),
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_temp (id, organization_id, name, email, password_hash, role, is_active, created_at)
          SELECT id, organization_id, name, email, password_hash, role, is_active, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_temp RENAME TO users;
      `);
      db.exec('PRAGMA foreign_keys = ON;');
      console.log('✅ Tabela users migrada com sucesso com suporte ao perfil manager.');
    }
  } catch (migErr) {
    console.warn('Aviso ao migrar tabela users:', migErr.message);
  }

  // Sementes padrão da Base de Conhecimento (RAG) da concessionária
  try {
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM store_knowledge').get();
    if (!existingCount || existingCount.count === 0) {
      const insertKnowledge = db.prepare(`
        INSERT INTO store_knowledge (category, question, answer, keywords)
        VALUES (?, ?, ?, ?)
      `);
      const defaultKnowledge = [
        [
          'financiamento',
          'Vocês financiam sem entrada ou com entrada facilitada?',
          'Sim! Trabalhamos com mais de 10 bancos e financeiras parceiras, com planos sem entrada (sujeito à análise de crédito do CPF) ou parcelamento da entrada em até 18x no cartão de crédito.',
          'financiamento, sem entrada, entrada facilitada, cartao, parcelar entrada, bancos'
        ],
        [
          'troca',
          'A loja aceita meu carro ou moto usado na troca?',
          'Com certeza! Avaliamos o seu seminovo ou moto com excelente avaliação de mercado na troca. O valor pode ser usado como entrada integral no seu novo veículo.',
          'troca, usado, avaliar usado, pegar na troca, moto na troca, carro na troca'
        ],
        [
          'troca',
          'Vocês aceitam carro financiado ou com dívida na troca?',
          'Sim! Avaliamos seu veículo, quitamos o saldo devedor restante junto ao banco e a diferença você utiliza como entrada na compra do seu novo seminovo.',
          'carro financiado, divida, saldo devedor, quitar financiamento'
        ],
        [
          'garantia',
          'Como funciona a garantia dos veículos seminovos?',
          'Todos os nossos seminovos passam por rigorosa perícia cautelar aprovada e contam com 1 ano de garantia completa para motor e câmbio em todo o território nacional.',
          'garantia, 1 ano, motor, cambio, cautelar, revisao'
        ],
        [
          'documentacao',
          'Quais documentos preciso enviar para aprovar a ficha de financiamento?',
          'Para análise rápida basta informar seu CPF, data de nascimento e número de telefone. Para assinatura do contrato, serão necessários CNH/RG, comprovante de residência atualizado e comprovante de renda.',
          'documentos, aprovar ficha, cpf, cnh, comprovante'
        ],
        [
          'loja',
          'Onde a loja fica localizada e qual o horário de funcionamento?',
          'Estamos localizados na Av. dos Bandeirantes, 1500 (São Paulo - SP), com estacionamento próprio para clientes. Atendemos de segunda a sexta das 08h às 19h e aos sábados das 09h às 16h.',
          'endereco, onde fica, localizacao, horario, sabado, funcionamento'
        ]
      ];

      for (const item of defaultKnowledge) {
        insertKnowledge.run(item[0], item[1], item[2], item[3]);
      }
      console.log('📚 [RAG] Base de conhecimento da concessionária inicializada com 6 perguntas oficiais.');
    }
  } catch (seedErr) {
    console.warn('Aviso ao inicializar store_knowledge:', seedErr.message);
  }

  // Sementes padrão de Usuários (RBAC) e Distribuição Inicial de Leads
  try {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const fs = require('fs');
    const path = require('path');

    const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (!existingUsers || existingUsers.count === 0) {
      const insertUser = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);

      // Gera senhas aleatórias seguras (crypto.randomBytes) sem valores previsíveis
      const adminPassword = crypto.randomBytes(8).toString('hex');
      const lucasPassword = crypto.randomBytes(8).toString('hex');
      const marcosPassword = crypto.randomBytes(8).toString('hex');

      const ownerHash = bcrypt.hashSync(adminPassword, 10);
      const lucasHash = bcrypt.hashSync(lucasPassword, 10);
      const marcosHash = bcrypt.hashSync(marcosPassword, 10);

      insertUser.run('Carlos Diretor', 'admin@autolead.com', ownerHash, 'owner');
      insertUser.run('Lucas Mendes', 'lucas@autolead.com', lucasHash, 'salesperson');
      insertUser.run('Marcos Silva', 'marcos@autolead.com', marcosHash, 'salesperson');

      // Salva em arquivo local protegido (gitignored) para testes e automações locais
      const credsPath = path.join(__dirname, '..', '..', 'data', 'initial_credentials.json');
      try {
        fs.writeFileSync(credsPath, JSON.stringify({
          admin: adminPassword,
          lucas: lucasPassword,
          marcos: marcosPassword,
          created_at: new Date().toISOString()
        }, null, 2));
      } catch (e) {}

      console.log('\n================================================================================');
      console.log('🔐 [SEGURANÇA] SENHAS ALEATÓRIAS GERADAS NA CRIAÇÃO INICIAL DO BANCO');
      console.log('⚠️  ATENÇÃO: Nenhuma senha padrão fixa foi utilizada no código-fonte.');
      console.log('    Guarde estas credenciais e altere-as assim que realizar o primeiro login!\n');
      console.log(`👑 Carlos Diretor (Owner):       admin@autolead.com  | Senha: ${adminPassword}`);
      console.log(`👔 Lucas Mendes   (Salesperson): lucas@autolead.com  | Senha: ${lucasPassword}`);
      console.log(`👔 Marcos Silva   (Salesperson): marcos@autolead.com  | Senha: ${marcosPassword}`);
      console.log('================================================================================\n');
    }

    // Atribui leads existentes sem assigned_to aos vendedores para teste imediato
    const lucas = db.prepare("SELECT id FROM users WHERE email = 'lucas@autolead.com'").get();
    const marcos = db.prepare("SELECT id FROM users WHERE email = 'marcos@autolead.com'").get();

    if (lucas && marcos) {
      db.prepare(`
        UPDATE leads 
        SET assigned_to = CASE WHEN (id % 2 = 0) THEN ? ELSE ? END 
        WHERE assigned_to IS NULL OR assigned_to NOT IN (SELECT id FROM users)
      `).run(lucas.id, marcos.id);
    }
  } catch (userErr) {
    console.warn('Aviso ao inicializar users:', userErr.message);
  }

  // Modo de produção: Inicializa tabelas limpas sem dados fictícios
  // Para adicionar veículos, use a interface web, planilha CSV ou a rota de ERP
  console.log('✅ Banco de dados SQLite inicializado pronto para operação real da loja.');
}

initDatabase();

module.exports = db;
