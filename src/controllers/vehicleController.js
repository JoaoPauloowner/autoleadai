const db = require('../config/database');

exports.listVehicles = (req, res) => {
  try {
    const { status, make, body_type, min_price, max_price } = req.query;
    let sql = 'SELECT * FROM vehicles WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (make) {
      sql += ' AND make LIKE ?';
      params.push(`%${make}%`);
    }
    if (body_type) {
      sql += ' AND body_type = ?';
      params.push(body_type);
    }
    if (min_price) {
      sql += ' AND price >= ?';
      params.push(Number(min_price));
    }
    if (max_price) {
      sql += ' AND price <= ?';
      params.push(Number(max_price));
    }

    sql += ' ORDER BY created_at DESC';

    const vehicles = db.prepare(sql).all(...params).map(v => {
      let features = [];
      let images = [];
      try { features = JSON.parse(v.features || '[]'); } catch (e) {}
      try { images = JSON.parse(v.images || '[]'); } catch (e) {}
      return { ...v, features, images };
    });

    res.json({ success: true, count: vehicles.length, data: vehicles });
  } catch (error) {
    console.error('Erro ao listar veículos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getVehicle = (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);

    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    }

    let features = [];
    let images = [];
    try { features = JSON.parse(vehicle.features || '[]'); } catch (e) {}
    try { images = JSON.parse(vehicle.images || '[]'); } catch (e) {}

    res.json({ success: true, data: { ...vehicle, features, images } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createVehicle = (req, res) => {
  try {
    const {
      make, model, version, year_fab, year_model, price, mileage,
      transmission, fuel, color, plate_end, body_type, features, images, status
    } = req.body;

    if (!make || !model || !price) {
      return res.status(400).json({ success: false, error: 'Marca, modelo e preço são obrigatórios' });
    }

    const stmt = db.prepare(`
      INSERT INTO vehicles (
        make, model, version, year_fab, year_model, price, mileage,
        transmission, fuel, color, plate_end, body_type, features, images, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const featuresJson = typeof features === 'object' ? JSON.stringify(features) : (features || '[]');
    const imagesJson = typeof images === 'object' ? JSON.stringify(images) : (images || '[]');

    const result = stmt.run(
      make,
      model,
      version || '',
      parseInt(year_fab || new Date().getFullYear(), 10),
      parseInt(year_model || new Date().getFullYear(), 10),
      parseFloat(price),
      parseInt(mileage || 0, 10),
      transmission || 'Automático',
      fuel || 'Flex',
      color || 'Prata',
      plate_end || '',
      body_type || 'Sedan',
      featuresJson,
      imagesJson,
      status || 'disponivel'
    );

    res.status(201).json({
      success: true,
      message: 'Veículo cadastrado com sucesso',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Erro ao cadastrar veículo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateVehicle = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    }

    const fields = [];
    const params = [];

    const allowed = [
      'make', 'model', 'version', 'year_fab', 'year_model', 'price', 'mileage',
      'transmission', 'fuel', 'color', 'plate_end', 'body_type', 'status'
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }

    if (req.body.features !== undefined) {
      fields.push('features = ?');
      params.push(typeof req.body.features === 'object' ? JSON.stringify(req.body.features) : req.body.features);
    }
    if (req.body.images !== undefined) {
      fields.push('images = ?');
      params.push(typeof req.body.images === 'object' ? JSON.stringify(req.body.images) : req.body.images);
    }

    if (fields.length === 0) {
      return res.json({ success: true, message: 'Nenhuma alteração enviada' });
    }

    params.push(id);
    db.prepare(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Veículo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar veículo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteVehicle = (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
    res.json({ success: true, message: 'Veículo removido com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
