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

  async searchItems(query, options = {}) {
    await this.rateLimiter.checkLimit();

    try {
      const {
        maxPrice = 1000,
        minPrice = 0,
        limit = 20,
        currency = 1,
        sortBy = "price", // 'price', 'name', 'volume'
      } = options;

      logger.debug(
        `Searching for: "${query}" with price range $${minPrice}-$${maxPrice}`
      );

      // Use Steam's search endpoint
      const searchUrl = `${this.baseUrl}/search/render/?appid=${
        this.appId
      }&query=${encodeURIComponent(
        query
      )}&start=0&count=${limit}&search_descriptions=0&sort_column=default&sort_dir=asc&norender=1`;

      const response = await axios.get(searchUrl, {
        headers: this.defaultHeaders,
        timeout: 15000,
      });

      if (response.data && response.data.success) {
        const searchResults = response.data.results || [];

        // Parse search results and get prices
        const itemsWithPrices = await this.enrichSearchResults(
          searchResults,
          currency,
          maxPrice,
          minPrice
        );

        // Sort results
        const sortedItems = this.sortSearchResults(itemsWithPrices, sortBy);

        return {
          success: true,
          items: sortedItems,
          total: response.data.total_count || 0,
          query: query,
          filters: { maxPrice, minPrice, sortBy },
        };
      }

      return { success: false, error: "Search failed", items: [] };
    } catch (error) {
      logger.error(`Search error: ${error.message}`);
      return { success: false, error: error.message, items: [] };
    }
  }

  async enrichSearchResults(searchResults, currency, maxPrice, minPrice) {
    const itemsWithPrices = [];
    const batchSize = 3; // Process items in small batches to avoid rate limiting

    for (let i = 0; i < searchResults.length; i += batchSize) {
      const batch = searchResults.slice(i, i + batchSize);

      const batchPromises = batch.map(async (item) => {
        try {
          const itemName = item.name || item.market_hash_name;
          if (!itemName) return null;

          // Get current price
          const priceData = await this.fetchItemPrice(itemName, currency);

          if (
            priceData.success &&
            priceData.price >= minPrice &&
            priceData.price <= maxPrice
          ) {
            return {
              name: itemName,
              price: priceData.price,
              volume: priceData.volume,
              image: item.asset_description?.icon_url
                ? `https://community.cloudflare.steamstatic.com/economy/image/${item.asset_description.icon_url}`
                : null,
              exterior: this.extractExterior(itemName),
              weapon: this.extractWeapon(itemName),
              rarity:
                item.asset_description?.tags?.find(
                  (tag) => tag.category === "Rarity"
                )?.localized_tag_name || "Unknown",
              marketUrl: this.generateMarketUrl(itemName),
            };
          }

          return null;
        } catch (error) {
          logger.debug(
            `Error getting price for ${item.name}: ${error.message}`
          );
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      itemsWithPrices.push(...batchResults.filter((item) => item !== null));

      // Small delay between batches
      if (i + batchSize < searchResults.length) {
        await this.rateLimiter.sleep(1000);
      }
    }

    return itemsWithPrices;
  }

  sortSearchResults(items, sortBy) {
    switch (sortBy) {
      case "price":
        return items.sort((a, b) => a.price - b.price);
      case "name":
        return items.sort((a, b) => a.name.localeCompare(b.name));
      case "volume":
        return items.sort((a, b) => b.volume - a.volume);
      default:
        return items;
    }
  }

  extractExterior(itemName) {
    const exteriors = [
      "Factory New",
      "Minimal Wear",
      "Field-Tested",
      "Well-Worn",
      "Battle-Scarred",
    ];
    for (const exterior of exteriors) {
      if (itemName.includes(`(${exterior})`)) {
        return exterior;
      }
    }
    return null;
  }

  extractWeapon(itemName) {
    const weapons = [
      "AK-47",
      "M4A4",
      "M4A1-S",
      "AWP",
      "Desert Eagle",
      "Glock-18",
      "USP-S",
      "Karambit",
      "Bayonet",
    ];
    for (const weapon of weapons) {
      if (itemName.includes(weapon)) {
        return weapon;
      }
    }
    return itemName.split(" |")[0] || "Unknown";
  }

  // Predefined search for popular CS2 items by category
  async getPopularItems(category, options = {}) {
    const queries = {
      rifles: "AK-47 M4A4 M4A1-S",
      pistols: "Desert Eagle Glock-18 USP-S",
      snipers: "AWP SSG 08",
      knives: "Karambit Bayonet Huntsman",
      cases: "Case",
      stickers: "Sticker",
    };

    if (queries[category]) {
      return await this.searchItems(queries[category], options);
    }

    return { success: false, error: "Unknown category", items: [] };
  }
}

module.exports = { SteamMarketAPI };
