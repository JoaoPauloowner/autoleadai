const db = require('../config/database');
const { calculateLeadScore } = require('../ai/scorer');
const auditService = require('../services/auditService');

exports.importLeadsCsv = (req, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ success: false, error: 'Conteúdo CSV em texto é obrigatório' });
    }

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'O CSV precisa ter um cabeçalho e pelo menos 1 linha de dados' });
    }

    // Detecta separador (, ou ;)
    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/["']/g, ''));

    const nameIdx = headers.findIndex(h => h.includes('nome') || h.includes('name') || h.includes('cliente'));
    const phoneIdx = headers.findIndex(h => h.includes('tel') || h.includes('fone') || h.includes('cel') || h.includes('phone'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
    const carIdx = headers.findIndex(h => h.includes('carro') || h.includes('veiculo') || h.includes('veículo') || h.includes('modelo'));
    const budgetIdx = headers.findIndex(h => h.includes('valor') || h.includes('preco') || h.includes('preço') || h.includes('orcamento') || h.includes('orçamento'));
    const sourceIdx = headers.findIndex(h => h.includes('origem') || h.includes('fonte') || h.includes('canal') || h.includes('source'));

    if (phoneIdx === -1) {
      return res.status(400).json({ success: false, error: 'Coluna de Telefone não identificada no cabeçalho do CSV' });
    }

    let imported = 0;
    const errors = [];
    const createdLeads = [];

    const insertLeadStmt = db.prepare(`
      INSERT INTO leads (name, phone, email, channel, status, budget_max, score, score_breakdown, ai_summary, next_action_title, next_action_at, source_campaign, is_demo_data)
      VALUES (?, ?, ?, ?, 'novo', ?, ?, ?, ?, ?, datetime('now', '+2 hours'), ?, 1)
    `);

    const insertTaskStmt = db.prepare(`
      INSERT INTO tasks (lead_id, type, title, due_at, status)
      VALUES (?, 'whatsapp', ?, datetime('now', '+2 hours'), 'pendente')
    `);

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(separator).map(col => col.trim().replace(/^["']|["']$/g, ''));
      if (row.length === 0 || !row[0]) continue;

      const rawPhone = row[phoneIdx] || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');

      if (!cleanPhone || cleanPhone.length < 8) {
        errors.push({ line: i + 1, error: 'Telefone inválido', row: row.join('; ') });
        continue;
      }

      // Verifica se já existe
      const exists = db.prepare('SELECT id FROM leads WHERE phone = ?').get(cleanPhone);
      if (exists) {
        errors.push({ line: i + 1, error: `Telefone ${cleanPhone} já cadastrado`, row: row.join('; ') });
        continue;
      }

      const name = (nameIdx !== -1 && row[nameIdx]) ? row[nameIdx] : `Lead Importado #${i}`;
      const email = (emailIdx !== -1 && row[emailIdx]) ? row[emailIdx] : null;
      const carInterest = (carIdx !== -1 && row[carIdx]) ? row[carIdx] : 'Veículos em Destaque';
      const budget = (budgetIdx !== -1 && row[budgetIdx]) ? parseFloat(row[budgetIdx].replace(/[^\d.,]/g, '').replace(',', '.')) || null : null;
      const source = (sourceIdx !== -1 && row[sourceIdx]) ? row[sourceIdx] : 'Importação CSV';

      // Calcula Lead Score inicial do lead importado
      const scoreData = calculateLeadScore({
        lead: { interested_vehicle_id: null, has_trade_in: 0, budget_max: budget, status: 'novo' },
        messages: [{ content: `Interesse no veículo: ${carInterest}. Orçamento informado: ${budget || 'A definir'}` }]
      });

      const summary = `Lead importado via CSV (${source}). Interesse em: ${carInterest}.`;
      const nextAction = `Primeiro contato via WhatsApp sobre ${carInterest}`;

      try {
        const resLead = insertLeadStmt.run(
          name,
          cleanPhone,
          email,
          source.toLowerCase().includes('meta') || source.toLowerCase().includes('facebook') ? 'instagram' : 'webmotors',
          budget,
          scoreData.total,
          JSON.stringify(scoreData.breakdown),
          summary,
          nextAction,
          source
        );

        const newLeadId = resLead.lastInsertRowid;
        insertTaskStmt.run(newLeadId, nextAction);

        imported++;
        createdLeads.push({ id: newLeadId, name, phone: cleanPhone, carInterest, score: scoreData.total });
      } catch (err) {
        errors.push({ line: i + 1, error: err.message, row: row.join('; ') });
      }
    }

    auditService.logAudit({
      organization_id: 'default',
      actor: 'admin',
      action: 'import_leads_csv',
      entity_type: 'leads',
      entity_id: null,
      details: {
        totalRows: lines.length - 1,
        importedCount: imported,
        errorCount: errors.length
      }
    });

    res.json({
      success: true,
      summary: {
        totalRows: lines.length - 1,
        importedCount: imported,
        errorCount: errors.length
      },
      errors,
      leads: createdLeads.slice(0, 10)
    });
  } catch (error) {
    console.error('Erro na importação CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
