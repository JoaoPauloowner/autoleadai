const db = require('../config/database');
const auditService = require('../services/auditService');

exports.listKnowledge = (req, res) => {
  try {
    const items = db.prepare(`
      SELECT * FROM store_knowledge 
      ORDER BY category ASC, id DESC
    `).all();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createKnowledge = (req, res) => {
  try {
    const { category = 'geral', question, answer, keywords = '' } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ success: false, error: 'Pergunta é obrigatória' });
    }
    if (!answer || !answer.trim()) {
      return res.status(400).json({ success: false, error: 'Resposta é obrigatória' });
    }

    const stmt = db.prepare(`
      INSERT INTO store_knowledge (category, question, answer, keywords)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(category.trim(), question.trim(), answer.trim(), keywords.trim());

    auditService.logAudit({
      actor: 'admin',
      action: 'create_knowledge_item',
      entity_type: 'store_knowledge',
      entity_id: result.lastInsertRowid,
      details: { question, category }
    });

    res.json({
      success: true,
      message: 'Item de conhecimento adicionado com sucesso',
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.bulkImportKnowledge = (req, res) => {
  try {
    const { rawText, items } = req.body;
    let itemsToInsert = [];

    if (Array.isArray(items) && items.length > 0) {
      itemsToInsert = items;
    } else if (rawText && typeof rawText === 'string') {
      // Aceita formato linha por linha: Pergunta | Resposta | Categoria (opcional)
      const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        if (line.includes('|')) {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            itemsToInsert.push({
              question: parts[0],
              answer: parts[1],
              category: parts[2] || 'geral',
              keywords: parts[0].toLowerCase()
            });
          }
        }
      }
    }

    if (itemsToInsert.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum item válido identificado. Envie uma lista JSON ou texto no formato: Pergunta | Resposta'
      });
    }

    const stmt = db.prepare(`
      INSERT INTO store_knowledge (category, question, answer, keywords)
      VALUES (?, ?, ?, ?)
    `);

    let importedCount = 0;
    for (const item of itemsToInsert) {
      if (!item.question || !item.answer) continue;
      stmt.run(
        item.category || 'geral',
        item.question.trim(),
        item.answer.trim(),
        item.keywords || ''
      );
      importedCount++;
    }

    auditService.logAudit({
      actor: 'admin',
      action: 'bulk_import_knowledge',
      entity_type: 'store_knowledge',
      details: { count: importedCount }
    });

    res.json({
      success: true,
      message: `${importedCount} perguntas e respostas treinadas e integradas ao RAG com sucesso!`,
      importedCount
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateKnowledge = (req, res) => {
  try {
    const { id } = req.params;
    const { category, question, answer, keywords, is_active } = req.body;

    db.prepare(`
      UPDATE store_knowledge
      SET category = COALESCE(?, category),
          question = COALESCE(?, question),
          answer = COALESCE(?, answer),
          keywords = COALESCE(?, keywords),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(category, question, answer, keywords, is_active !== undefined ? (is_active ? 1 : 0) : null, id);

    res.json({ success: true, message: 'Item atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteKnowledge = (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM store_knowledge WHERE id = ?').run(id);

    auditService.logAudit({
      actor: 'admin',
      action: 'delete_knowledge_item',
      entity_type: 'store_knowledge',
      entity_id: id
    });

    res.json({ success: true, message: 'Item removido da base de conhecimento' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
