const axios = require("axios");
const { RateLimiter } = require("./rateLimiter");
const logger = require("../utils/logger");

class SteamMarketAPI {
  constructor() {
    this.baseUrl = "https://steamcommunity.com/market";
    this.appId = 730; // CS2 App ID
    this.rateLimiter = new RateLimiter();

    this.defaultHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://steamcommunity.com/market/",
      Origin: "https://steamcommunity.com",
    };
  }

  async fetchItemPrice(itemName, currency = 1) {
    await this.rateLimiter.checkLimit();

    try {
      const encodedName = encodeURIComponent(itemName);
      const url = `${this.baseUrl}/priceoverview/?appid=${this.appId}&currency=${currency}&market_hash_name=${encodedName}`;

      logger.debug(`Fetching price for: ${itemName}`);

      const response = await axios.get(url, {
        headers: this.defaultHeaders,
        timeout: 15000,
      });

      if (response.data && response.data.success) {
        const parsed = this.parsePrice(response.data);

        if (parsed.price > 0) {
          logger.debug(`Price fetched for ${itemName}: $${parsed.price}`);
          return {
            success: true,
            ...parsed,
            timestamp: new Date().toISOString(),
            raw: response.data,
          };
        } else {
          logger.warn(`No valid price found for: ${itemName}`);
          return {
            success: false,
            error: "No valid price found",
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        logger.warn(`API returned no success for: ${itemName}`);
        return {
          success: false,
          error: "API returned no success flag",
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      logger.error(`Error fetching ${itemName}: ${error.message}`);

      if (error.response?.status === 429) {
        logger.warn("Rate limited. Adding delay...");
        await this.rateLimiter.handleRateLimit();
      }

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  parsePrice(data) {
    let price = 0;
    let volume = 0;

    // Parse price - prefer median over lowest
    if (data.median_price) {
      price = this.cleanPrice(data.median_price);
    } else if (data.lowest_price) {
      price = this.cleanPrice(data.lowest_price);
    }

    // Parse volume
    if (data.volume) {
      volume = this.cleanVolume(data.volume);
    }

    return { price, volume };
  }

  cleanPrice(priceStr) {
    if (!priceStr) return 0;
    const cleaned = priceStr.toString().replace(/[$,]/g, "");
    return parseFloat(cleaned) || 0;
  }

  cleanVolume(volumeStr) {
    if (!volumeStr) return 0;
    if (typeof volumeStr === "number") return volumeStr;
    const cleaned = volumeStr.toString().replace(/,/g, "");
    return parseInt(cleaned) || 0;
  }

  async searchItems(query, limit = 10) {
    await this.rateLimiter.checkLimit();

    try {
      const url = `${this.baseUrl}/search/render/?appid=${
        this.appId
      }&query=${encodeURIComponent(query)}&start=0&count=${limit}`;

      const response = await axios.get(url, {
        headers: this.defaultHeaders,
        timeout: 10000,
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          items: this.parseSearchResults(response.data),
        };
      }

      return { success: false, error: "Search failed" };
    } catch (error) {
      logger.error(`Search error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  parseSearchResults(data) {
    if (!data.results_html) return [];

    // This would need cheerio to parse HTML results
    // For now, return empty array
    return [];
  }

  generateMarketUrl(itemName) {
    const encodedName = encodeURIComponent(itemName);
    return `${this.baseUrl}/listings/${this.appId}/${encodedName}`;
  }
}

module.exports = { SteamMarketAPI };
