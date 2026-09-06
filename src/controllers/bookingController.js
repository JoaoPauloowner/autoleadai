const db = require('../config/database');

exports.listTestDrives = (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT td.*, 
             l.name as lead_name, l.phone as lead_phone,
             v.make as vehicle_make, v.model as vehicle_model, v.version as vehicle_version, v.price as vehicle_price, v.images as vehicle_images
      FROM test_drives td
      JOIN leads l ON td.lead_id = l.id
      JOIN vehicles v ON td.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

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

exports.updateTestDriveStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

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
