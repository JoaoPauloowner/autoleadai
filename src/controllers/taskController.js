const db = require('../config/database');

exports.listTasks = (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT t.*, l.name as lead_name, l.phone as lead_phone, l.status as lead_status,
             v.make as vehicle_make, v.model as vehicle_model
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      LEFT JOIN vehicles v ON l.interested_vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY t.due_at ASC';

    const tasks = db.prepare(sql).all(...params).map(task => {
      const isOverdue = new Date(task.due_at) < new Date() && task.status !== 'concluida';
      return {
        ...task,
        status: isOverdue ? 'atrasada' : task.status
      };
    });

    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    console.error('Erro ao listar tarefas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createTask = (req, res) => {
  try {
    const { lead_id, type, title, due_at, notes } = req.body;

    if (!lead_id || !title || !due_at) {
      return res.status(400).json({ success: false, error: 'Lead, título e prazo são obrigatórios' });
    }

    const stmt = db.prepare(`
      INSERT INTO tasks (lead_id, type, title, due_at, notes, status)
      VALUES (?, ?, ?, ?, ?, 'pendente')
    `);

    const result = stmt.run(lead_id, type || 'whatsapp', title, due_at, notes || '');

    // Atualiza a próxima ação no lead
    db.prepare(`UPDATE leads SET next_action_title = ?, next_action_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(title, due_at, lead_id);

    res.status(201).json({
      success: true,
      message: 'Tarefa de follow-up criada com sucesso',
      id: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.completeTask = (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`
      UPDATE tasks 
      SET status = 'concluida', completed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);

    res.json({ success: true, message: 'Tarefa concluída com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteTask = (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.json({ success: true, message: 'Tarefa removida com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
