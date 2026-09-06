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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (interested_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  addColumnIfNotExists('leads', 'score', 'INTEGER DEFAULT 25');
  addColumnIfNotExists('leads', 'score_breakdown', 'TEXT');
  addColumnIfNotExists('leads', 'next_action_title', 'TEXT');
  addColumnIfNotExists('leads', 'next_action_at', 'DATETIME');
  addColumnIfNotExists('leads', 'source_campaign', 'TEXT');
  addColumnIfNotExists('leads', 'last_inbound_at', 'DATETIME');
  addColumnIfNotExists('leads', 'last_outbound_at', 'DATETIME');
  addColumnIfNotExists('leads', 'is_demo_data', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('chat_messages', 'copilot_status', "TEXT DEFAULT 'approved'");

  // Popula veículos se estiver vazio
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM vehicles');
  const { count } = countStmt.get();

  if (count === 0) {
    console.log('🚗 Populando estoque inicial demonstrativo de veículos...');
    const insertStmt = db.prepare(`
      INSERT INTO vehicles (make, model, version, year_fab, year_model, price, mileage, transmission, fuel, color, plate_end, body_type, features, images, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedVehicles = [
      {
        make: 'Jeep',
        model: 'Renegade',
        version: 'Longitude 1.3 Turbo 4x2 Flex',
        year_fab: 2022,
        year_model: 2023,
        price: 98900,
        mileage: 38500,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Cinza Granite',
        plate_end: '7',
        body_type: 'SUV',
        features: JSON.stringify(['Bancos de Couro', 'Central Multimídia 8.4"', 'Faróis Full LED', 'Câmera de Ré', 'Ar Digital Dual Zone']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Toyota',
        model: 'Corolla',
        version: 'XEi 2.0 Dynamic Force Direct Shift',
        year_fab: 2021,
        year_model: 2022,
        price: 119900,
        mileage: 44000,
        transmission: 'Automático CVT',
        fuel: 'Flex',
        color: 'Branco Pérola',
        plate_end: '3',
        body_type: 'Sedan',
        features: JSON.stringify(['Toyota Safety Sense', '7 Airbags', 'Chave Presencial', 'Bancos em Couro Preto']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Hyundai',
        model: 'Creta',
        version: 'Platinum 1.0 Turbo GDI Flex',
        year_fab: 2023,
        year_model: 2023,
        price: 128900,
        mileage: 21000,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Prata Sand',
        plate_end: '9',
        body_type: 'SUV',
        features: JSON.stringify(['Teto Solar Panorâmico', 'Bancos com Ventilação', 'Câmera 360 Graus']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Honda',
        model: 'Civic',
        version: 'Touring 1.5 Turbo',
        year_fab: 2020,
        year_model: 2021,
        price: 132000,
        mileage: 52000,
        transmission: 'Automático CVT',
        fuel: 'Gasolina',
        color: 'Preto Cristal',
        plate_end: '5',
        body_type: 'Sedan',
        features: JSON.stringify(['Motor 1.5 Turbo 173cv', 'Teto Solar', 'Som Premium 452W']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Chevrolet',
        model: 'Onix Plus',
        version: 'Premier 1.0 Turbo Flex',
        year_fab: 2022,
        year_model: 2022,
        price: 79900,
        mileage: 39000,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Azul Seeker',
        plate_end: '2',
        body_type: 'Sedan',
        features: JSON.stringify(['Wi-Fi Nativo', 'Alerta de Ponto Cego', 'Carregador Celular sem Fio']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Volkswagen',
        model: 'T-Cross',
        version: 'Comfortline 200 TSI',
        year_fab: 2021,
        year_model: 2022,
        price: 104900,
        mileage: 41000,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Branco Puro',
        plate_end: '6',
        body_type: 'SUV',
        features: JSON.stringify(['VW Play 10.1"', 'Painel Digital', 'Frenagem Autônoma de Emergência']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1541348263662-e0c8de4259ba?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      }
    ];

    for (const v of seedVehicles) {
      insertStmt.run(v.make, v.model, v.version, v.year_fab, v.year_model, v.price, v.mileage, v.transmission, v.fuel, v.color, v.plate_end, v.body_type, v.features, v.images, v.status);
    }
  }

  // Popula tarefas e leads de demonstração se tarefas estiverem vazias
  const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
  if (taskCount === 0) {
    console.log('📊 Populando leads de demonstração com Lead Score e tarefas...');
    const insertLead = db.prepare(`
      INSERT INTO leads (name, phone, email, channel, status, budget_max, payment_method, has_trade_in, trade_in_details, interested_vehicle_id, ai_summary, score, score_breakdown, next_action_title, next_action_at, source_campaign, last_inbound_at, last_outbound_at, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?), 1)
    `);

    // 1. Lead Quente com Test Drive (90 pontos)
    const r1 = insertLead.run(
      'Roberto Mendes', '(11) 98765-4321', 'roberto@gmail.com', 'whatsapp', 'test_drive', 105000, 'financiamento', 1, 'HB20 2018 com 65.000km', 1,
      'Cliente muito decidido pelo Jeep Renegade. Entrada de R$ 35 mil + troca do HB20. Test Drive agendado para amanhã.',
      92, JSON.stringify({ interesse: 25, prazo: 25, capacidade: 20, compromisso: 22 }),
      'Confirmar presença no Test Drive de amanhã',
      new Date(Date.now() + 24*3600*1000).toISOString(),
      'Campanha Meta Seminovos',
      '-2 hours', '-1 hour'
    );

    // 2. Lead sem resposta > 15 min (Alerta de Vazamento de SLA!)
    const r2 = insertLead.run(
      'Mariana Albuquerque', '(11) 97654-3210', 'mariana@outlook.com', 'webmotors', 'novo', 125000, 'a_vista', 0, null, 2,
      'Perguntou sobre o Corolla XEi 2022 anunciado na Webmotors. Pede laudo cautelar e fotos do interior.',
      68, JSON.stringify({ interesse: 25, prazo: 18, capacidade: 25, compromisso: 0 }),
      'Enviar laudo cautelar e fotos do Corolla',
      new Date(Date.now() + 2*3600*1000).toISOString(),
      'Webmotors Destaque',
      '-45 minutes', null // Nunca respondido! > 15 min vazamento de SLA
    );

    // 3. Lead Qualificado sem próxima ação (Alerta de Vazamento!)
    const r3 = insertLead.run(
      'Carlos Eduardo', '(11) 96543-2109', 'carlos.edu@empresa.com', 'site', 'qualificado', 135000, 'financiamento', 0, null, 4,
      'Interesse no Civic Touring 1.5 Turbo. Pediu simulação com 50k de entrada.',
      60, JSON.stringify({ interesse: 25, prazo: 15, capacidade: 20, compromisso: 0 }),
      null, // Sem próxima ação agendada! Vazamento operacional
      null,
      'Google Ads Pesquisa',
      '-1 day', '-1 day'
    );

    // 4. Lead com follow-up atrasado (Alerta de Vazamento!)
    const r4 = insertLead.run(
      'Fernanda Costa', '(11) 95432-1098', 'fernanda@terra.com.br', 'instagram', 'proposta', 110000, 'a_vista', 1, 'Onix 2019 Premier', 6,
      'Negociando o T-Cross Comfortline. Proposta enviada aguardando aceite do gerente.',
      78, JSON.stringify({ interesse: 22, prazo: 20, capacidade: 21, compromisso: 15 }),
      'Retornar sobre contraproposta de avaliação do Onix',
      new Date(Date.now() - 3*3600*1000).toISOString(), // Atrasado há 3 horas!
      'Instagram Reels Carros',
      '-2 days', '-2 days'
    );

    // Semeia tarefas correspondentes
    const insertTask = db.prepare(`
      INSERT INTO tasks (lead_id, type, title, due_at, status)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertTask.run(r1.lastInsertRowid, 'test_drive', 'Confirmar veículo higienizado para o test drive do Roberto', new Date(Date.now() + 18*3600*1000).toISOString(), 'pendente');
    insertTask.run(r2.lastInsertRowid, 'whatsapp', 'URGENTE: Mariana aguardando resposta sobre o Corolla há 45 min', new Date(Date.now() - 30*60*1000).toISOString(), 'atrasada');
    insertTask.run(r4.lastInsertRowid, 'ligacao', 'Ligar para Fernanda fechamento da proposta do T-Cross', new Date(Date.now() - 2*3600*1000).toISOString(), 'atrasada');
  }
}

initDatabase();

module.exports = db;
