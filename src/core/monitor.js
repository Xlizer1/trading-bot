const cron = require("node-cron");
const { SteamMarketAPI } = require("../api/steamMarket");
const { DataManager } = require("../data/dataManager");
const { PriceAnalyzer } = require("./analyzer");
const { AlertManager } = require("./alertManager");
const logger = require("../utils/logger");
const EventEmitter = require("events");

class Monitor extends EventEmitter {
  constructor() {
    super();
    this.steamApi = new SteamMarketAPI();
    this.dataManager = new DataManager();
    this.analyzer = new PriceAnalyzer();
    this.alertManager = new AlertManager();

    this.isRunning = false;
    this.currentCycle = null;
    this.stats = {
      totalCycles: 0,
      totalItems: 0,
      totalAlerts: 0,
      lastCycleTime: null,
      errors: 0,
    };
  }

  async initialize() {
    await this.dataManager.initialize();
    logger.info("Monitor initialized");
    this.emit("initialized");
  }

  async startMonitoring(intervalMinutes = 5) {
    if (this.isRunning) {
      logger.warn("Monitor is already running");
      return;
    }

    this.isRunning = true;
    logger.info(
      `Starting scheduled monitoring (every ${intervalMinutes} minutes)`
    );

    // Run immediately
    this.runCycle();

    // Schedule recurring runs
    const cronPattern = `*/${intervalMinutes} * * * *`;
    this.currentCycle = cron.schedule(cronPattern, () => {
      this.runCycle();
    });

    this.emit("started");
  }

  stopMonitoring() {
    if (!this.isRunning) {
      logger.warn("Monitor is not running");
      return;
    }

    this.isRunning = false;
    if (this.currentCycle) {
      this.currentCycle.destroy();
      this.currentCycle = null;
    }

    logger.info("Monitor stopped");
    this.emit("stopped");
  }

  async runCycle() {
    if (!this.isRunning) return;

    const cycleStart = Date.now();
    this.stats.totalCycles++;

    logger.info(`Starting monitoring cycle #${this.stats.totalCycles}`);
    this.emit("cycleStart", { cycleNumber: this.stats.totalCycles });

    try {
      const watchlist = await this.dataManager.getWatchlist();
      const results = [];

      for (let i = 0; i < watchlist.length; i++) {
        const itemName = watchlist[i];

        try {
          const result = await this.monitorItem(itemName);
          results.push(result);
          this.stats.totalItems++;

          this.emit("itemProcessed", result);
        } catch (error) {
          logger.error(`Error monitoring ${itemName}: ${error.message}`);
          this.stats.errors++;
          this.emit("itemError", { itemName, error: error.message });
        }
      }

      const cycleTime = Date.now() - cycleStart;
      this.stats.lastCycleTime = cycleTime;

      logger.info(
        `Cycle #${this.stats.totalCycles} completed in ${cycleTime}ms`
      );
      this.emit("cycleComplete", {
        cycleNumber: this.stats.totalCycles,
        duration: cycleTime,
        results,
      });
    } catch (error) {
      logger.error(`Cycle error: ${error.message}`);
      this.stats.errors++;
      this.emit("cycleError", { error: error.message });
    }
  }

  async monitorItem(itemName) {
    logger.debug(`Monitoring item: ${itemName}`);

    // Fetch current price
    const priceData = await this.steamApi.fetchItemPrice(itemName);

    if (!priceData.success) {
      return {
        itemName,
        success: false,
        error: priceData.error,
      };
    }

    // Store price data
    await this.dataManager.storePriceData(itemName, priceData);

    // Analyze for deals
    const analysis = await this.analyzer.analyzePrice(
      itemName,
      priceData.price
    );

    const result = {
      itemName,
      success: true,
      price: priceData.price,
      volume: priceData.volume,
      analysis,
      timestamp: priceData.timestamp,
    };

    // Check for alerts
    if (analysis.hasEnoughData && analysis.isGoodDeal) {
      await this.handleAlert(itemName, result);
    }

    return result;
  }

  async handleAlert(itemName, result) {
    try {
      const alert = await this.alertManager.createAlert(itemName, result);
      this.stats.totalAlerts++;

      logger.info(
        `🚨 DEAL ALERT: ${itemName} - ${result.analysis.discountPercent.toFixed(
          1
        )}% off`
      );

      this.emit("alert", alert);
    } catch (error) {
      logger.error(`Alert error for ${itemName}: ${error.message}`);
    }
  }

  async addToWatchlist(itemName) {
    try {
      // First, test if the item exists by fetching its price
      logger.info(`Testing item availability: ${itemName}`);
      const priceData = await this.steamApi.fetchItemPrice(itemName);

      if (!priceData.success) {
        return {
          success: false,
          error: `Unable to find item "${itemName}" on Steam Market. Please check the spelling and try again.`,
          details: priceData.error,
        };
      }

      // Item exists, add to watchlist
      await this.dataManager.addToWatchlist(itemName);

      // Store the initial price data
      await this.dataManager.storePriceData(itemName, priceData);

      // Analyze the price immediately
      const analysis = await this.analyzer.analyzePrice(
        itemName,
        priceData.price
      );

      logger.info(
        `Added "${itemName}" to watchlist with initial price: $${priceData.price}`
      );

      this.emit("watchlistUpdated", {
        action: "add",
        itemName,
        initialPrice: priceData.price,
        volume: priceData.volume,
        analysis: analysis,
      });

      // Emit the item data for real-time UI updates
      this.emit("itemProcessed", {
        itemName,
        success: true,
        price: priceData.price,
        volume: priceData.volume,
        analysis,
        timestamp: priceData.timestamp,
        isNewItem: true,
      });

      return {
        success: true,
        message: `Successfully added "${itemName}" to watchlist`,
        priceData: {
          price: priceData.price,
          volume: priceData.volume,
          hasEnoughData: analysis.hasEnoughData,
          analysis: analysis.hasEnoughData
            ? {
                isGoodDeal: analysis.isGoodDeal,
                discountPercent: analysis.discountPercent,
                dealScore: analysis.dealScore,
              }
            : null,
        },
      };
    } catch (error) {
      logger.error(`Error adding to watchlist: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async removeFromWatchlist(itemName) {
    try {
      await this.dataManager.removeFromWatchlist(itemName);
      logger.info(`Removed "${itemName}" from watchlist`);
      this.emit("watchlistUpdated", { action: "remove", itemName });
      return { success: true };
    } catch (error) {
      logger.error(`Error removing from watchlist: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async getWatchlist() {
    return await this.dataManager.getWatchlist();
  }

  async getRecentAlerts(limit = 10) {
    return await this.alertManager.getRecentAlerts(limit);
  }

  async getPriceHistory(itemName, limit = 100) {
    return await this.dataManager.getPriceHistory(itemName, limit);
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      rateLimiterStats: this.steamApi.rateLimiter.getStats(),
    };
  }

  async generateMarketUrl(itemName) {
    return this.steamApi.generateMarketUrl(itemName);
  }
}

module.exports = { Monitor };
