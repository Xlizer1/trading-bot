const fs = require("fs-extra");
const path = require("path");
const logger = require("../utils/logger");

class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, "../../data");
    this.priceHistoryFile = path.join(this.dataDir, "price_history.json");
    this.watchlistFile = path.join(this.dataDir, "watchlist.json");
    this.alertsFile = path.join(this.dataDir, "alerts.json");
    this.settingsFile = path.join(this.dataDir, "settings.json");

    this.maxPriceHistory = parseInt(process.env.MAX_PRICE_HISTORY) || 100;
    this.maxAlerts = parseInt(process.env.MAX_ALERTS) || 1000;
  }

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      await fs.ensureDir(this.dataDir);

      // Initialize data files
      await this.initializeDataFiles();

      logger.info("Data manager initialized");
    } catch (error) {
      logger.error(`Failed to initialize data manager: ${error.message}`);
      throw error;
    }
  }

  async initializeDataFiles() {
    // Initialize price history
    if (!(await fs.pathExists(this.priceHistoryFile))) {
      await fs.writeJson(this.priceHistoryFile, {});
      logger.debug("Created price history file");
    }

    // Initialize watchlist with popular CS2 skins
    if (!(await fs.pathExists(this.watchlistFile))) {
      const defaultWatchlist = [
        "AK-47 | Redline (Field-Tested)",
        "AWP | Dragon Lore (Field-Tested)",
        "M4A4 | Howl (Field-Tested)",
        "Karambit | Doppler (Factory New)",
        "AK-47 | Fire Serpent (Field-Tested)",
        "AWP | Asiimov (Field-Tested)",
        "M4A1-S | Knight (Factory New)",
        "Glock-18 | Fade (Factory New)",
        "AWP | Medusa (Field-Tested)",
        "StatTrak™ AK-47 | Vulcan (Factory New)",
      ];
      await fs.writeJson(this.watchlistFile, defaultWatchlist);
      logger.info("Created default watchlist");
    }

    // Initialize alerts
    if (!(await fs.pathExists(this.alertsFile))) {
      await fs.writeJson(this.alertsFile, []);
      logger.debug("Created alerts file");
    }

    // Initialize settings
    if (!(await fs.pathExists(this.settingsFile))) {
      const defaultSettings = {
        discountThreshold: 0.25,
        minPriceHistory: 5,
        monitoringInterval: 5,
        currency: 1,
        country: "US",
        notifications: {
          browser: true,
          email: false,
          webhook: false,
        },
        theme: "dark",
        autoRefresh: true,
      };
      await fs.writeJson(this.settingsFile, defaultSettings);
      logger.debug("Created default settings");
    }
  }

  // Price History Management
  async storePriceData(itemName, priceData) {
    try {
      const history = await this.getPriceHistoryRaw();

      if (!history[itemName]) {
        history[itemName] = [];
      }

      // Add new price data
      history[itemName].push(priceData);

      // Keep only last N price points per item
      if (history[itemName].length > this.maxPriceHistory) {
        history[itemName] = history[itemName].slice(-this.maxPriceHistory);
      }

      await fs.writeJson(this.priceHistoryFile, history, { spaces: 2 });
      logger.debug(`Stored price data for ${itemName}: $${priceData.price}`);
    } catch (error) {
      logger.error(
        `Error storing price data for ${itemName}: ${error.message}`
      );
      throw error;
    }
  }

  async getPriceHistory(itemName, limit = null) {
    try {
      const history = await this.getPriceHistoryRaw();
      const itemHistory = history[itemName] || [];

      if (limit) {
        return itemHistory.slice(-limit);
      }

      return itemHistory;
    } catch (error) {
      logger.error(
        `Error getting price history for ${itemName}: ${error.message}`
      );
      return [];
    }
  }

  async getPriceHistoryRaw() {
    try {
      return await fs.readJson(this.priceHistoryFile);
    } catch (error) {
      logger.warn("Price history file not found, returning empty object");
      return {};
    }
  }

  async getAllPriceHistory() {
    return await this.getPriceHistoryRaw();
  }

  async deletePriceHistory(itemName) {
    try {
      const history = await this.getPriceHistoryRaw();

      if (history[itemName]) {
        delete history[itemName];
        await fs.writeJson(this.priceHistoryFile, history, { spaces: 2 });
        logger.info(`Deleted price history for ${itemName}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(
        `Error deleting price history for ${itemName}: ${error.message}`
      );
      throw error;
    }
  }

  // Watchlist Management
  async getWatchlist() {
    try {
      return await fs.readJson(this.watchlistFile);
    } catch (error) {
      logger.warn("Watchlist file not found, returning empty array");
      return [];
    }
  }

  async addToWatchlist(itemName) {
    try {
      const watchlist = await this.getWatchlist();

      if (watchlist.includes(itemName)) {
        throw new Error(`"${itemName}" is already in watchlist`);
      }

      watchlist.push(itemName);
      await fs.writeJson(this.watchlistFile, watchlist, { spaces: 2 });
      logger.info(`Added "${itemName}" to watchlist`);

      return true;
    } catch (error) {
      logger.error(`Error adding to watchlist: ${error.message}`);
      throw error;
    }
  }

  async removeFromWatchlist(itemName) {
    try {
      const watchlist = await this.getWatchlist();
      const index = watchlist.indexOf(itemName);

      if (index === -1) {
        throw new Error(`"${itemName}" not found in watchlist`);
      }

      watchlist.splice(index, 1);
      await fs.writeJson(this.watchlistFile, watchlist, { spaces: 2 });
      logger.info(`Removed "${itemName}" from watchlist`);

      return true;
    } catch (error) {
      logger.error(`Error removing from watchlist: ${error.message}`);
      throw error;
    }
  }

  async clearWatchlist() {
    try {
      await fs.writeJson(this.watchlistFile, []);
      logger.info("Cleared watchlist");
      return true;
    } catch (error) {
      logger.error(`Error clearing watchlist: ${error.message}`);
      throw error;
    }
  }

  // Alerts Management
  async storeAlert(alert) {
    try {
      const alerts = await this.getAlerts();

      alerts.push({
        ...alert,
        id: this.generateAlertId(),
        timestamp: new Date().toISOString(),
      });

      // Keep only last N alerts
      if (alerts.length > this.maxAlerts) {
        alerts.splice(0, alerts.length - this.maxAlerts);
      }

      await fs.writeJson(this.alertsFile, alerts, { spaces: 2 });
      logger.debug(`Stored alert for ${alert.itemName}`);

      return alerts[alerts.length - 1];
    } catch (error) {
      logger.error(`Error storing alert: ${error.message}`);
      throw error;
    }
  }

  async getAlerts(limit = null) {
    try {
      const alerts = await fs.readJson(this.alertsFile);

      if (limit) {
        return alerts.slice(-limit).reverse();
      }

      return alerts.reverse();
    } catch (error) {
      logger.warn("Alerts file not found, returning empty array");
      return [];
    }
  }

  async clearAlerts() {
    try {
      await fs.writeJson(this.alertsFile, []);
      logger.info("Cleared all alerts");
      return true;
    } catch (error) {
      logger.error(`Error clearing alerts: ${error.message}`);
      throw error;
    }
  }

  async deleteAlert(alertId) {
    try {
      const alerts = await fs.readJson(this.alertsFile);
      const filteredAlerts = alerts.filter((alert) => alert.id !== alertId);

      if (filteredAlerts.length === alerts.length) {
        return false; // Alert not found
      }

      await fs.writeJson(this.alertsFile, filteredAlerts, { spaces: 2 });
      logger.debug(`Deleted alert ${alertId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting alert: ${error.message}`);
      throw error;
    }
  }

  // Settings Management
  async getSettings() {
    try {
      return await fs.readJson(this.settingsFile);
    } catch (error) {
      logger.warn("Settings file not found, returning default settings");
      return {
        discountThreshold: 0.25,
        minPriceHistory: 5,
        monitoringInterval: 5,
        currency: 1,
        country: "US",
      };
    }
  }

  async updateSettings(newSettings) {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = { ...currentSettings, ...newSettings };

      await fs.writeJson(this.settingsFile, updatedSettings, { spaces: 2 });
      logger.info("Settings updated");

      return updatedSettings;
    } catch (error) {
      logger.error(`Error updating settings: ${error.message}`);
      throw error;
    }
  }

  // Data Export/Import
  async exportData() {
    try {
      const data = {
        watchlist: await this.getWatchlist(),
        priceHistory: await this.getAllPriceHistory(),
        alerts: await this.getAlerts(),
        settings: await this.getSettings(),
        exportDate: new Date().toISOString(),
        version: "1.0",
      };

      return data;
    } catch (error) {
      logger.error(`Error exporting data: ${error.message}`);
      throw error;
    }
  }

  async importData(data) {
    try {
      // Validate data structure
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format");
      }

      // Backup current data
      const backup = await this.exportData();
      const backupFile = path.join(this.dataDir, `backup_${Date.now()}.json`);
      await fs.writeJson(backupFile, backup);

      // Import new data
      if (data.watchlist) {
        await fs.writeJson(this.watchlistFile, data.watchlist);
      }

      if (data.priceHistory) {
        await fs.writeJson(this.priceHistoryFile, data.priceHistory);
      }

      if (data.alerts) {
        await fs.writeJson(this.alertsFile, data.alerts);
      }

      if (data.settings) {
        await fs.writeJson(this.settingsFile, data.settings);
      }

      logger.info("Data imported successfully");
      logger.info(`Backup saved to: ${backupFile}`);

      return true;
    } catch (error) {
      logger.error(`Error importing data: ${error.message}`);
      throw error;
    }
  }

  // Statistics
  async getStatistics() {
    try {
      const watchlist = await this.getWatchlist();
      const priceHistory = await this.getAllPriceHistory();
      const alerts = await this.getAlerts();

      const totalPricePoints = Object.values(priceHistory).reduce(
        (total, history) => total + history.length,
        0
      );

      const oldestPriceDate = Math.min(
        ...Object.values(priceHistory)
          .filter((history) => history.length > 0)
          .map((history) => new Date(history[0].timestamp).getTime())
      );

      return {
        watchlistCount: watchlist.length,
        totalPricePoints,
        totalAlerts: alerts.length,
        oldestData:
          oldestPriceDate !== Infinity
            ? new Date(oldestPriceDate).toISOString()
            : null,
        dataSize: await this.calculateDataSize(),
      };
    } catch (error) {
      logger.error(`Error getting statistics: ${error.message}`);
      return {};
    }
  }

  async calculateDataSize() {
    try {
      const files = [
        this.priceHistoryFile,
        this.watchlistFile,
        this.alertsFile,
        this.settingsFile,
      ];

      let totalSize = 0;

      for (const file of files) {
        try {
          const stats = await fs.stat(file);
          totalSize += stats.size;
        } catch (error) {
          // File doesn't exist, skip
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  // Utility methods
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async cleanup() {
    try {
      // Clean up old backup files (keep last 5)
      const files = await fs.readdir(this.dataDir);
      const backupFiles = files
        .filter((file) => file.startsWith("backup_"))
        .sort()
        .reverse();

      if (backupFiles.length > 5) {
        const filesToDelete = backupFiles.slice(5);
        for (const file of filesToDelete) {
          await fs.remove(path.join(this.dataDir, file));
        }
        logger.info(`Cleaned up ${filesToDelete.length} old backup files`);
      }
    } catch (error) {
      logger.error(`Error during cleanup: ${error.message}`);
    }
  }
}

module.exports = { DataManager };
