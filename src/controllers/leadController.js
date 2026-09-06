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

    sql += ' ORDER BY l.updated_at DESC';

    const leads = db.prepare(sql).all(...params);
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

    res.json({
      success: true,
      data: {
        ...lead,
        messages,
        testDrives
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
