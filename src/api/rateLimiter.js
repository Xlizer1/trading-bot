const logger = require("../utils/logger");

class RateLimiter {
  constructor() {
    this.requestDelay = parseInt(process.env.REQUEST_DELAY) || 3000;
    this.rateLimitDelay = parseInt(process.env.RATE_LIMIT_DELAY) || 60000;
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.rateLimitHits = 0;
  }

  async checkLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      logger.debug(`Rate limit: waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async handleRateLimit() {
    this.rateLimitHits++;
    logger.warn(
      `Rate limit hit #${this.rateLimitHits}. Waiting ${this.rateLimitDelay}ms`
    );
    await this.sleep(this.rateLimitDelay);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      totalRequests: this.requestCount,
      rateLimitHits: this.rateLimitHits,
      avgDelay: this.requestDelay,
    };
  }

  reset() {
    this.requestCount = 0;
    this.rateLimitHits = 0;
    this.lastRequestTime = 0;
  }
}

module.exports = { RateLimiter };
