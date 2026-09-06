const db = require('../config/database');

exports.listLeads = (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT l.*, v.make as vehicle_make, v.model as vehicle_model, v.price as vehicle_price
      FROM leads l
      LEFT JOIN vehicles v ON l.interested_vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY l.score DESC, l.updated_at DESC';

    const leads = db.prepare(sql).all(...params).map(lead => {
      let breakdown = { interesse: 15, prazo: 10, capacidade: 10, compromisso: 5 };
      try {
        if (lead.score_breakdown) breakdown = JSON.parse(lead.score_breakdown);
      } catch (e) {}
      return {
        ...lead,
        score_breakdown: breakdown
      };
    });

    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    console.error('Erro ao listar leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getLeadDetails = (req, res) => {
  try {
    const { id } = req.params;
    const lead = db.prepare(`
      SELECT l.*, v.make as vehicle_make, v.model as vehicle_model, v.price as vehicle_price, v.images as vehicle_images
      FROM leads l
      LEFT JOIN vehicles v ON l.interested_vehicle_id = v.id
      WHERE l.id = ?
    `).get(id);

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    const messages = db.prepare(`
      SELECT * FROM chat_messages WHERE lead_id = ? ORDER BY created_at ASC
    `).all(id);

    const testDrives = db.prepare(`
      SELECT td.*, v.make, v.model FROM test_drives td
      JOIN vehicles v ON td.vehicle_id = v.id
      WHERE td.lead_id = ?
      ORDER BY td.scheduled_at DESC
    `).all(id);

    const tasks = db.prepare(`
      SELECT * FROM tasks WHERE lead_id = ? ORDER BY due_at ASC
    `).all(id);

    let breakdown = { interesse: 15, prazo: 10, capacidade: 10, compromisso: 5 };
    try {
      if (lead.score_breakdown) breakdown = JSON.parse(lead.score_breakdown);
    } catch (e) {}

    res.json({
      success: true,
      data: {
        ...lead,
        score_breakdown: breakdown,
        messages,
        testDrives,
        tasks
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateLeadStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['novo', 'qualificado', 'test_drive', 'proposta', 'fechado', 'perdido'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status de funil inválido' });
    }

    db.prepare(`UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id);
    res.json({ success: true, message: 'Status do lead atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createLead = (req, res) => {
  try {
    const {
      name, phone, email, channel, status, budget_max,
      payment_method, has_trade_in, trade_in_details, interested_vehicle_id, ai_summary
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Nome e telefone são obrigatórios' });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '');
    const scorer = require('../ai/scorer');
    const initialScore = scorer.calculateScore({
      hasVehicle: !!interested_vehicle_id,
      paymentMethod: payment_method,
      budget: budget_max,
      hasTradeIn: !!has_trade_in,
      timeline: '15_dias'
    });

    const stmt = db.prepare(`
      INSERT INTO leads (
        name, phone, email, channel, status, budget_max,
        payment_method, has_trade_in, trade_in_details, interested_vehicle_id,
        ai_summary, score, score_breakdown, last_inbound_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(
      name.trim(),
      cleanPhone,
      email || null,
      channel || 'manual',
      status || 'novo',
      budget_max ? parseFloat(budget_max) : null,
      payment_method || 'financiamento',
      has_trade_in ? 1 : 0,
      trade_in_details || null,
      interested_vehicle_id ? parseInt(interested_vehicle_id, 10) : null,
      ai_summary || 'Contato cadastrado manualmente na loja',
      initialScore.total,
      JSON.stringify(initialScore.breakdown)
    );

    res.status(201).json({
      success: true,
      message: 'Contato cadastrado com sucesso',
      id: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateLead = (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, phone, email, status, budget_max,
      payment_method, has_trade_in, trade_in_details, interested_vehicle_id,
      next_action_title, next_action_at
    } = req.body;

    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name.trim()); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone.toString().replace(/\D/g, '')); }
    if (email !== undefined) { fields.push('email = ?'); params.push(email || null); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (budget_max !== undefined) { fields.push('budget_max = ?'); params.push(budget_max ? parseFloat(budget_max) : null); }
    if (payment_method !== undefined) { fields.push('payment_method = ?'); params.push(payment_method); }
    if (has_trade_in !== undefined) { fields.push('has_trade_in = ?'); params.push(has_trade_in ? 1 : 0); }
    if (trade_in_details !== undefined) { fields.push('trade_in_details = ?'); params.push(trade_in_details); }
    if (interested_vehicle_id !== undefined) { fields.push('interested_vehicle_id = ?'); params.push(interested_vehicle_id ? parseInt(interested_vehicle_id, 10) : null); }
    if (next_action_title !== undefined) { fields.push('next_action_title = ?'); params.push(next_action_title); }
    if (next_action_at !== undefined) { fields.push('next_action_at = ?'); params.push(next_action_at); }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    params.push(id);
    db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Dados do comprador atualizados com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteLead = (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    res.json({ success: true, message: 'Contato removido com sucesso do funil' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.handlePortalLeadWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('📬 [Portal Lead Recebido]', JSON.stringify(payload).substring(0, 200));

    const name = payload.name || payload.nome || payload.lead_name || 'Comprador de Portal';
    const phone = (payload.phone || payload.telefone || payload.contact || '').toString().replace(/\D/g, '');
    const email = payload.email || null;
    const portal = payload.portal || payload.source || payload.origem || 'Webmotors / Meta Ads';
    const vehicleName = payload.vehicle || payload.veiculo || payload.carro || '';

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Telefone do comprador é obrigatório' });
    }

    let vehicleId = null;
    if (vehicleName) {
      const car = db.prepare('SELECT id FROM vehicles WHERE model LIKE ? OR make LIKE ?').get(`%${vehicleName}%`, `%${vehicleName}%`);
      if (car) vehicleId = car.id;
    }

    let lead = db.prepare('SELECT * FROM leads WHERE phone = ?').get(phone);
    if (!lead) {
      const stmt = db.prepare(`
        INSERT INTO leads (name, phone, email, channel, status, interested_vehicle_id, source_campaign, score, last_inbound_at)
        VALUES (?, ?, ?, ?, 'novo', ?, ?, 65, CURRENT_TIMESTAMP)
      `);
      const r = stmt.run(name, phone, email, portal.toLowerCase(), vehicleId, `Portal: ${portal}`);
      lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(r.lastInsertRowid);
    }

    res.status(201).json({
      success: true,
      message: `Lead recebido com sucesso do portal ${portal}`,
      leadId: lead.id
    });
  } catch (error) {
    console.error('Erro no webhook de portais:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDashboardMetrics = (req, res) => {
  try {
    const totalVehicles = db.prepare("SELECT COUNT(*) as count, SUM(price) as total_value FROM vehicles WHERE status = 'disponivel'").get();
    const totalLeads = db.prepare("SELECT COUNT(*) as count FROM leads").get();
    const qualifiedLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status IN ('qualificado', 'test_drive', 'proposta')").get();
    const scheduledTestDrives = db.prepare("SELECT COUNT(*) as count FROM test_drives WHERE status = 'confirmado'").get();
    
    // Funil de vendas
    const pipelineStages = ['novo', 'qualificado', 'test_drive', 'proposta', 'fechado', 'perdido'];
    const pipelineCounts = {};
    for (const stage of pipelineStages) {
      const row = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = ?").get(stage);
      pipelineCounts[stage] = row.count;
    }

    res.json({
      success: true,
      data: {
        totalVehicles: totalVehicles.count || 0,
        totalInventoryValue: totalVehicles.total_value || 0,
        totalLeads: totalLeads.count || 0,
        qualifiedLeads: qualifiedLeads.count || 0,
        scheduledTestDrives: scheduledTestDrives.count || 0,
        pipeline: pipelineCounts
      }
    });
  } catch (error) {
    console.error('Erro ao carregar métricas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Análise Executiva de Vazamento de Receita & SLA (Prompt 1 AutoPilot Ops)
 */
exports.getLeakageAnalytics = (req, res) => {
  try {
    // 1. Leads sem resposta após 15 min (SLA de ouro)
    // Leads que enviaram mensagem mas não tiveram resposta recente ou demorou mais de 15 min
    const unansweredRows = db.prepare(`
      SELECT id, name, phone, channel, strftime('%s', 'now') - strftime('%s', last_inbound_at) as waiting_seconds
      FROM leads
      WHERE (last_outbound_at IS NULL OR last_outbound_at < last_inbound_at)
        AND status IN ('novo', 'qualificado')
    `).all();

    const unansweredLeads = unansweredRows.filter(r => r.waiting_seconds > 900); // > 15 min

    // 2. Leads ativos sem próxima ação definida
    const noNextAction = db.prepare(`
      SELECT id, name, phone, status, score
      FROM leads
      WHERE (next_action_title IS NULL OR next_action_title = '')
        AND status IN ('novo', 'qualificado', 'test_drive', 'proposta')
    `).all();

    // 3. Tarefas de follow-up atrasadas
    const overdueTasks = db.prepare(`
      SELECT t.id, t.title, t.due_at, l.name as lead_name, l.phone as lead_phone
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.status != 'concluida'
        AND datetime(t.due_at) < datetime('now')
    `).all();

    // 4. Test drives pendentes próximos de vencer confirmação
    const pendingTestDrives = db.prepare(`
      SELECT td.id, td.scheduled_at, l.name as lead_name, v.make, v.model
      FROM test_drives td
      JOIN leads l ON td.lead_id = l.id
      JOIN vehicles v ON td.vehicle_id = v.id
      WHERE td.status = 'pendente'
    `).all();

    // Estimativa de margem média por veículo (padrão de mercado: R$ 7.500)
    const averageGrossMargin = 7500;
    const totalRisks = unansweredLeads.length + noNextAction.length + overdueTasks.length;
    const potentialRevenueAtRisk = totalRisks * averageGrossMargin;

    res.json({
      success: true,
      data: {
        slaLimitMinutes: 15,
        unansweredCount: unansweredLeads.length,
        unansweredLeads: unansweredLeads.slice(0, 5),
        noNextActionCount: noNextAction.length,
        noNextActionLeads: noNextAction.slice(0, 5),
        overdueTasksCount: overdueTasks.length,
        overdueTasks: overdueTasks.slice(0, 5),
        pendingAppointmentsCount: pendingTestDrives.length,
        totalAtRiskOpportunities: totalRisks,
        potentialRevenueAtRisk: `R$ ${potentialRevenueAtRisk.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`,
        summaryMessage: totalRisks > 0
          ? `Atenção: Existem ${totalRisks} gargalos operacionais no seu funil gerando risco de vazamento de até R$ ${potentialRevenueAtRisk.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} em margem comercial.`
          : 'Excelente! Operação comercial sem vazamentos ativos ou leads atrasados no momento.'
      }
    });
  } catch (error) {
    console.error('Erro na análise de vazamento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
