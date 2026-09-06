/**
 * Mecanismo de resiliência para chamadas de IA e integrações externas.
 * Evita travamentos de requisições quando o provedor externo estiver lento ou indisponível.
 */
class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 30000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.failures = 0;
    this.openedAt = 0;
  }

  canRequest() {
    return !this.openedAt || Date.now() - this.openedAt >= this.cooldownMs;
  }

  async run(operation) {
    if (!this.canRequest()) {
      throw new Error('Circuito de IA temporariamente aberto devido a falhas consecutivas do provedor externo. Ativando contingência.');
    }
    try {
      const result = await operation();
      this.failures = 0;
      this.openedAt = 0;
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) {
        this.openedAt = Date.now();
        console.warn(`[CircuitBreaker] Limite de falhas atingido (${this.failures}). Circuito aberto por ${this.cooldownMs / 1000}s.`);
      }
      throw error;
    }
  }
}

/**
 * Envolve uma Promise com timeout finito para evitar conexões penduradas.
 */
function withTimeout(operation, timeoutMs = 15000) {
  return Promise.race([
    operation(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout na chamada externa (excedeu ${timeoutMs / 1000}s)`)), timeoutMs)
    )
  ]);
}

const aiCircuitBreaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 });

module.exports = {
  CircuitBreaker,
  withTimeout,
  aiCircuitBreaker
};
