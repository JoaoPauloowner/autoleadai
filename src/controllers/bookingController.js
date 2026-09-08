const db = require('../config/database');

exports.listTestDrives = (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT td.*, 
             l.name as lead_name, l.phone as lead_phone, l.assigned_to as lead_assigned_to,
             v.make as vehicle_make, v.model as vehicle_model, v.version as vehicle_version, v.price as vehicle_price, v.images as vehicle_images
      FROM test_drives td
      JOIN leads l ON td.lead_id = l.id
      JOIN vehicles v ON td.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    // Escopo rígido por vendedor: visualiza apenas test-drives dos seus próprios leads
    if (req.user && req.user.role === 'salesperson') {
      sql += ' AND l.assigned_to = ?';
      params.push(req.user.id);
    }

    if (status) {
      sql += ' AND td.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY td.scheduled_at ASC';

    const testDrives = db.prepare(sql).all(...params).map(td => {
      let images = [];
      try { images = JSON.parse(td.vehicle_images || '[]'); } catch (e) {}
      return {
        ...td,
        vehicle_image: images[0] || null
      };
    });

    res.json({ success: true, count: testDrives.length, data: testDrives });
  } catch (error) {
    console.error('Erro ao listar test-drives:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createTestDrive = (req, res) => {
  try {
    const { lead_id, vehicle_id, scheduled_at, notes, seller_name } = req.body;

    if (!lead_id || !vehicle_id || !scheduled_at) {
      return res.status(400).json({ success: false, error: 'Lead, veículo e data/hora são obrigatórios' });
    }

    // Escopo por vendedor ao criar test-drive
    if (req.user && req.user.role === 'salesperson') {
      const lead = db.prepare('SELECT assigned_to FROM leads WHERE id = ?').get(lead_id);
      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead não encontrado' });
      }
      if (lead.assigned_to !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Acesso negado. Você só pode agendar test-drives para seus próprios leads.' });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO test_drives (lead_id, vehicle_id, scheduled_at, seller_name, notes, status)
      VALUES (?, ?, ?, ?, ?, 'confirmado')
    `);

    const result = stmt.run(
      lead_id,
      vehicle_id,
      scheduled_at,
      seller_name || (req.user ? req.user.name : 'Consultor de Vendas'),
      notes || ''
    );

    // Atualiza o status do lead para test_drive se ainda estiver em etapas anteriores
    db.prepare(`UPDATE leads SET status = 'test_drive', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('novo', 'qualificado')`)
      .run(lead_id);

    res.status(201).json({
      success: true,
      message: 'Test-drive agendado com sucesso',
      id: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateTestDriveStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const td = db.prepare(`
      SELECT td.id, td.lead_id, l.assigned_to
      FROM test_drives td
      JOIN leads l ON td.lead_id = l.id
      WHERE td.id = ?
    `).get(id);

    if (!td) {
      return res.status(404).json({ success: false, error: 'Agendamento de test-drive não encontrado' });
    }

    // Validação de escopo do vendedor
    if (req.user && req.user.role === 'salesperson' && td.assigned_to !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Este test-drive pertence ao lead de outro vendedor.' });
    }

    const valid = ['pendente', 'confirmado', 'realizado', 'cancelado'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status de test-drive inválido' });
    }

    const updates = ['status = ?'];
    const params = [status];

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    params.push(id);
    db.prepare(`UPDATE test_drives SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Status do test-drive atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
