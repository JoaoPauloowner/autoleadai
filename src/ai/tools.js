const db = require('../config/database');
const config = require('../config/ai-provider');

/**
 * Definições das ferramentas em formato compatível com OpenAI e Gemini
 */
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'buscar_estoque',
      description: 'Busca veículos disponíveis no estoque da loja por termo livre, marca, modelo, faixa de preço máxima, tipo de carroceria (SUV, Sedan, Hatch) ou câmbio.',
      parameters: {
        type: 'object',
        properties: {
          termo: {
            type: 'string',
            description: 'Nome da marca, modelo ou palavra-chave (ex: "Renegade", "Jeep", "Corolla", "Civic", "Creta", "Onix")'
          },
          preco_max: {
            type: 'number',
            description: 'Valor máximo em Reais que o cliente deseja pagar (ex: 100000)'
          },
          body_type: {
            type: 'string',
            description: 'Tipo de carroceria (ex: "SUV", "Sedan", "Hatch")'
          },
          transmissao: {
            type: 'string',
            description: 'Tipo de câmbio (ex: "Automático", "Manual")'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detalhes_veiculo',
      description: 'Obtém a ficha técnica completa, opcionais, quilometragem, fotos e preço exato de um veículo específico pelo ID.',
      parameters: {
        type: 'object',
        properties: {
          veiculo_id: {
            type: 'integer',
            description: 'ID do veículo no estoque da loja'
          }
        },
        required: ['veiculo_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'simular_financiamento',
      description: 'Calcula uma estimativa realista de parcelas de financiamento bancário para o veículo com base no valor total, valor da entrada e quantidade de parcelas (ex: 24, 36, 48 ou 60x).',
      parameters: {
        type: 'object',
        properties: {
          valor_veiculo: {
            type: 'number',
            description: 'Preço de venda do veículo'
          },
          valor_entrada: {
            type: 'number',
            description: 'Valor de entrada pago pelo cliente em Reais'
          },
          parcelas: {
            type: 'integer',
            description: 'Número de parcelas desejadas (padrão: 48)'
          }
        },
        required: ['valor_veiculo', 'valor_entrada']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'salvar_qualificacao_lead',
      description: 'Atualiza o perfil de compra do lead no CRM da loja quando ele informar preferências de orçamento, forma de pagamento ou se tem carro na troca.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: {
            type: 'integer',
            description: 'ID do lead'
          },
          nome: {
            type: 'string',
            description: 'Nome do cliente se informado'
          },
          forma_pagamento: {
            type: 'string',
            enum: ['a_vista', 'financiamento', 'consorcio'],
            description: 'Forma pretendida de pagamento'
          },
          orcamento_max: {
            type: 'number',
            description: 'Orçamento máximo informado'
          },
          tem_troca: {
            type: 'boolean',
            description: 'Se o cliente possui um veículo usado para dar como entrada/troca'
          },
          detalhes_troca: {
            type: 'string',
            description: 'Detalhes do veículo da troca (ex: "Gol 2018 1.0 flex com 70.000km")'
          },
          veiculo_interesse_id: {
            type: 'integer',
            description: 'ID do carro do estoque que o cliente demonstrou maior interesse'
          },
          resumo_qualificacao: {
            type: 'string',
            description: 'Breve resumo do perfil do comprador e momento de compra'
          }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agendar_test_drive',
      description: 'Agenda um Test Drive presencial para o cliente conhecer e dirigir o veículo na concessionária.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: {
            type: 'integer',
            description: 'ID do lead'
          },
          veiculo_id: {
            type: 'integer',
            description: 'ID do veículo escolhido para o test drive'
          },
          data_hora: {
            type: 'string',
            description: 'Data e hora combinada (ex: "2026-09-08 14:30" ou formato ISO)'
          },
          observacoes: {
            type: 'string',
            description: 'Observações adicionais do cliente'
          }
        },
        required: ['lead_id', 'veiculo_id', 'data_hora']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'solicitar_atendente_humano',
      description: 'Aciona um consultor de vendas humano quando o cliente exigir negociação personalizada, fechar contrato imediatamente ou solicitar falar com uma pessoa.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: {
            type: 'integer',
            description: 'ID do lead'
          },
          motivo: {
            type: 'string',
            description: 'Motivo da transferência para o consultor humano'
          }
        },
        required: ['lead_id', 'motivo']
      }
    }
  }
];

/**
 * Executores das ferramentas diretamente contra o SQLite e regras de negócio
 */
const toolExecutors = {
  buscar_estoque: ({ termo, preco_max, body_type, transmissao }) => {
    let sql = `SELECT id, make, model, version, year_fab, year_model, price, mileage, transmission, fuel, color, body_type, images, status 
               FROM vehicles WHERE status != 'vendido'`;
    const params = [];

    if (termo) {
      sql += ` AND (make LIKE ? OR model LIKE ? OR version LIKE ?)`;
      const t = `%${termo}%`;
      params.push(t, t, t);
    }
    if (preco_max && preco_max > 0) {
      sql += ` AND price <= ?`;
      params.push(preco_max);
    }
    if (body_type) {
      sql += ` AND body_type LIKE ?`;
      params.push(`%${body_type}%`);
    }
    if (transmissao) {
      sql += ` AND transmission LIKE ?`;
      params.push(`%${transmissao}%`);
    }

    sql += ` ORDER BY price ASC LIMIT 5`;

    const stmt = db.prepare(sql);
    const results = stmt.all(...params);

    const formatted = results.map(car => {
      let imgs = [];
      try { imgs = JSON.parse(car.images); } catch (e) {}
      return {
        id: car.id,
        titulo: `${car.make} ${car.model} ${car.version}`,
        ano: `${car.year_fab}/${car.year_model}`,
        preco: `R$ ${car.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        preco_numerico: car.price,
        km: `${car.mileage.toLocaleString('pt-BR')} km`,
        cambio: car.transmission,
        combustivel: car.fuel,
        cor: car.color,
        tipo: car.body_type,
        status: car.status,
        foto_principal: imgs[0] || null,
        total_fotos: imgs.length
      };
    });

    return {
      total_encontrados: formatted.length,
      veiculos: formatted,
      mensagem: formatted.length > 0 
        ? `Encontrei ${formatted.length} veículo(s) com essas características em nosso estoque.` 
        : 'Nenhum veículo encontrado com esses critérios exatos. Recomende modelos semelhantes ou pergunte se o cliente aceita outras opções.'
    };
  },

  detalhes_veiculo: ({ veiculo_id }) => {
    const stmt = db.prepare('SELECT * FROM vehicles WHERE id = ?');
    const car = stmt.get(veiculo_id);

    if (!car) {
      return { erro: `Veículo com ID ${veiculo_id} não foi encontrado no estoque.` };
    }

    let features = [];
    let images = [];
    try { features = JSON.parse(car.features); } catch (e) {}
    try { images = JSON.parse(car.images); } catch (e) {}

    return {
      id: car.id,
      titulo: `${car.make} ${car.model} ${car.version}`,
      ano: `${car.year_fab}/${car.year_model}`,
      preco: `R$ ${car.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      preco_numerico: car.price,
      km: `${car.mileage.toLocaleString('pt-BR')} km`,
      cambio: car.transmission,
      combustivel: car.fuel,
      cor: car.color,
      final_placa: car.plate_end,
      tipo: car.body_type,
      opcionais: features,
      fotos: images,
      status: car.status
    };
  },

  simular_financiamento: ({ valor_veiculo, valor_entrada, parcelas = 48 }) => {
    const entrada = Math.max(0, valor_entrada || 0);
    const saldoDevedor = valor_veiculo - entrada;

    if (saldoDevedor <= 0) {
      return {
        tipo: 'a_vista',
        mensagem: 'O valor da entrada cobre o total do veículo! Pagamento à vista.',
        valor_veiculo,
        entrada
      };
    }

    // Coeficiente Price com juros mensais configurados (ex: 1.49% a.m.)
    const taxaMes = config.dealership.interestRate;
    const n = Math.min(60, Math.max(12, parcelas));
    const parcelaEstimada = (saldoDevedor * taxaMes) / (1 - Math.pow(1 + taxaMes, -n));

    // Exemplos rápidos em outros prazos
    const simular = (qtd) => {
      const p = (saldoDevedor * taxaMes) / (1 - Math.pow(1 + taxaMes, -qtd));
      return `R$ ${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return {
      valor_veiculo: `R$ ${valor_veiculo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      entrada: `R$ ${entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      saldo_financiado: `R$ ${saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      prazo_solicitado: `${n}x de R$ ${parcelaEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      outras_opcoes: {
        '36x': simular(36),
        '48x': simular(48),
        '60x': simular(60)
      },
      aviso: 'Simulação preliminar sujeita a análise de crédito bancário e score do CPF do cliente.'
    };
  },

  salvar_qualificacao_lead: ({ lead_id, nome, forma_pagamento, orcamento_max, tem_troca, detalhes_troca, veiculo_interesse_id, resumo_qualificacao }) => {
    const leadStmt = db.prepare('SELECT * FROM leads WHERE id = ?');
    const current = leadStmt.get(lead_id);
    if (!current) return { erro: 'Lead não encontrado.' };

    const updates = [];
    const params = [];

    if (nome && nome.trim()) {
      updates.push('name = ?');
      params.push(nome.trim());
    }
    if (forma_pagamento) {
      updates.push('payment_method = ?');
      params.push(forma_pagamento);
    }
    if (orcamento_max) {
      updates.push('budget_max = ?');
      params.push(orcamento_max);
    }
    if (tem_troca !== undefined) {
      updates.push('has_trade_in = ?');
      params.push(tem_troca ? 1 : 0);
    }
    if (detalhes_troca) {
      updates.push('trade_in_details = ?');
      params.push(detalhes_troca);
    }
    if (veiculo_interesse_id) {
      updates.push('interested_vehicle_id = ?');
      params.push(veiculo_interesse_id);
    }
    if (resumo_qualificacao) {
      updates.push('ai_summary = ?');
      params.push(resumo_qualificacao);
    }

    // Avança o status do funil para 'qualificado' se ainda estiver 'novo'
    if (current.status === 'novo') {
      updates.push("status = 'qualificado'");
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    if (updates.length > 0) {
      params.push(lead_id);
      db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    return {
      sucesso: true,
      mensagem: 'Perfil do lead atualizado no CRM com sucesso.',
      lead_id
    };
  },

  agendar_test_drive: ({ lead_id, veiculo_id, data_hora, observacoes }) => {
    const carStmt = db.prepare('SELECT make, model, version, price FROM vehicles WHERE id = ?');
    const car = carStmt.get(veiculo_id);
    if (!car) return { erro: 'Veículo informado não existe.' };

    // Previne duplicidade: se já houver visita ativa para este cliente, atualiza os dados
    const existingActive = db.prepare(`
      SELECT id FROM test_drives 
      WHERE lead_id = ? AND status IN ('pendente', 'confirmado')
    `).get(lead_id);

    // Obtém o nome do vendedor real atribuído ao lead
    let sellerName = config.dealership.defaultSeller || 'Consultor de Plantão';
    if (lead_id) {
      const assignedSeller = db.prepare(`
        SELECT u.name FROM leads l
        JOIN users u ON u.id = l.assigned_to
        WHERE l.id = ?
      `).get(lead_id);
      if (assignedSeller && assignedSeller.name) {
        sellerName = assignedSeller.name;
      }
    }

    if (existingActive) {
      db.prepare(`
        UPDATE test_drives 
        SET vehicle_id = ?, scheduled_at = ?, seller_name = ?, notes = ?, status = 'confirmado'
        WHERE id = ?
      `).run(
        veiculo_id,
        data_hora,
        sellerName,
        observacoes || 'Reagendado pelo assistente virtual AutoLead',
        existingActive.id
      );
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO test_drives (lead_id, vehicle_id, scheduled_at, seller_name, status, notes)
        VALUES (?, ?, ?, ?, 'confirmado', ?)
      `);

      insertStmt.run(
        lead_id,
        veiculo_id,
        data_hora,
        sellerName,
        observacoes || 'Agendado pelo assistente virtual AutoLead'
      );
    }

    // Atualiza status do lead no CRM
    db.prepare(`UPDATE leads SET status = 'test_drive', interested_vehicle_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(veiculo_id, lead_id);

    return {
      sucesso: true,
      mensagem: `Test Drive confirmado para ${car.make} ${car.model} em ${data_hora} com o consultor ${sellerName}.`,
      consultor: sellerName,
      concessionaria: {
        nome: config.dealership.name,
        endereco: config.dealership.address,
        cidade: config.dealership.city,
        telefone: config.dealership.phone
      },
      veiculo: `${car.make} ${car.model} ${car.version}`,
      data_hora
    };
  },

  solicitar_atendente_humano: ({ lead_id, motivo }) => {
    db.prepare(`UPDATE leads SET status = 'proposta', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(lead_id);
    return {
      sucesso: true,
      mensagem: 'Notificação enviada para a equipe de vendas. Um consultor humano dará continuidade em breve.',
      motivo
    };
  }
};

module.exports = {
  toolDefinitions,
  toolExecutors
};
