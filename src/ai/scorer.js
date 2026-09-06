/**
 * Motor de Pontuação de Leads (Lead Score 0 a 100)
 * Baseado nos 4 Pilares Comerciais do Setor Automotivo:
 * 1. Interesse Específico (0 a 25)
 * 2. Prazo de Compra (0 a 25)
 * 3. Capacidade de Avançar / Entrada / Troca (0 a 25)
 * 4. Compromisso com o Próximo Passo / Visita (0 a 25)
 */

function calculateLeadScore({ lead, messages = [] }) {
  let interesse = 5;
  let prazo = 5;
  let capacidade = 5;
  let compromisso = 0;

  const allText = messages.map(m => m.content).join(' ').toLowerCase();

  // 1. Pilar: Interesse Específico no Veículo (0 a 25)
  if (lead.interested_vehicle_id) {
    interesse = 25; // Já vinculou a um carro específico do showroom
  } else if (
    allText.includes('renegade') || allText.includes('corolla') ||
    allText.includes('civic') || allText.includes('creta') ||
    allText.includes('onix') || allText.includes('t-cross')
  ) {
    interesse = 22;
  } else if (allText.includes('suv') || allText.includes('sedan') || allText.includes('automático')) {
    interesse = 15;
  } else if (allText.includes('carro') || allText.includes('estoque')) {
    interesse = 10;
  }

  // 2. Pilar: Prazo de Compra (0 a 25)
  if (allText.includes('hoje') || allText.includes('amanhã') || allText.includes('urgente') || allText.includes('esta semana') || allText.includes('sábado')) {
    prazo = 25;
  } else if (allText.includes('esse mês') || allText.includes('em breve') || allText.includes('dias') || allText.includes('semanas')) {
    prazo = 18;
  } else if (allText.includes('mês que vem') || allText.includes('fim do ano') || allText.includes('planejando')) {
    prazo = 10;
  } else if (allText.includes('só olhando') || allText.includes('curiosidade') || allText.includes('pesquisando')) {
    prazo = 2;
  } else {
    prazo = 10; // Prazo padrão estimado
  }

  // 3. Pilar: Capacidade / Entrada / Carro na Troca (0 a 25)
  if (lead.payment_method === 'a_vista' || allText.includes('à vista') || allText.includes('a vista') || allText.includes('dinheiro') || allText.includes('ted')) {
    capacidade = 25;
  } else if (lead.has_trade_in || allText.includes('troca') || allText.includes('meu carro') || allText.includes('usado')) {
    capacidade = 22;
  } else if (lead.budget_max > 0 || allText.includes('entrada') || allText.includes('financiamento') || allText.includes('parcela')) {
    capacidade = 18;
  } else {
    capacidade = 5;
  }

  // 4. Pilar: Compromisso com Visita / Test-Drive (0 a 25)
  if (lead.status === 'test_drive' || allText.includes('test drive') || allText.includes('agendar') || allText.includes('visita') || allText.includes('vou aí') || allText.includes('passar na loja')) {
    compromisso = 25;
  } else if (lead.status === 'proposta' || allText.includes('proposta') || allText.includes('ficha') || allText.includes('cpf')) {
    compromisso = 20;
  } else if (allText.includes('simulação') || allText.includes('foto') || allText.includes('vídeo') || allText.includes('interior')) {
    compromisso = 12;
  } else {
    compromisso = 2;
  }

  const total = Math.min(100, Math.max(0, interesse + prazo + capacidade + compromisso));

  let label = 'Pesquisa Inicial';
  let badgeClass = 'pesquisa';
  let icon = 'fa-snowflake';

  if (total >= 75) {
    label = 'Lead Quente';
    badgeClass = 'quente';
    icon = 'fa-fire';
  } else if (total >= 50) {
    label = 'Qualificado';
    badgeClass = 'qualificado';
    icon = 'fa-bolt';
  } else if (total >= 25) {
    label = 'Interessado';
    badgeClass = 'interessado';
    icon = 'fa-circle-half-stroke';
  }

  return {
    total,
    label,
    badgeClass,
    icon,
    breakdown: {
      interesse,
      prazo,
      capacidade,
      compromisso
    }
  };
}

module.exports = {
  calculateLeadScore
};
