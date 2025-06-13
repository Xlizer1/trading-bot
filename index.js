const axios = require("axios");
const chalk = require("chalk");
const cron = require("node-cron");
const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

// ⚠️  LEGAL WARNING ⚠️
console.log(chalk.red.bold("\n⚠️  LEGAL WARNING ⚠️"));
console.log(chalk.yellow("This bot is for educational purposes only."));
console.log(
  chalk.yellow(
    "Steam's Terms of Service prohibit automated marketplace interactions."
  )
);
console.log(
  chalk.yellow(
    "Use at your own risk. The author is not responsible for any account actions.\n"
  )
);

class CS2SkinMonitor {
  constructor() {
    this.dataDir = path.join(__dirname, "data");
    this.priceHistoryFile = path.join(this.dataDir, "price_history.json");
    this.watchlistFile = path.join(this.dataDir, "watchlist.json");
    this.alertsFile = path.join(this.dataDir, "alerts.json");

    this.baseUrl = "https://steamcommunity.com/market";
    this.appId = 730; // CS2 App ID
    this.currency = 1; // USD
    this.country = "US";

    this.discountThreshold = 0.25; // 25% below average
    this.minPriceHistory = 5; // Minimum price points for analysis
    this.debug = process.env.DEBUG === "true" || false;

    this.init();
  }

  async init() {
    // Create data directory if it doesn't exist
    await fs.ensureDir(this.dataDir);

    // Initialize data files
    await this.initializeDataFiles();

    console.log(chalk.green("✅ CS2 Skin Monitor initialized"));
    console.log(chalk.blue(`📁 Data directory: ${this.dataDir}`));
    console.log(
      chalk.blue(`💰 Discount threshold: ${this.discountThreshold * 100}%`)
    );
  }

  async initializeDataFiles() {
    // Initialize price history
    if (!(await fs.pathExists(this.priceHistoryFile))) {
      await fs.writeJson(this.priceHistoryFile, {});
    }

    // Initialize watchlist with some popular CS2 skins
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
      ];
      await fs.writeJson(this.watchlistFile, defaultWatchlist);
    }

    // Initialize alerts
    if (!(await fs.pathExists(this.alertsFile))) {
      await fs.writeJson(this.alertsFile, []);
    }
  }

  async fetchItemPrice(itemName) {
    try {
      const encodedName = encodeURIComponent(itemName);
      const url = `${this.baseUrl}/priceoverview/?appid=${this.appId}&currency=${this.currency}&market_hash_name=${encodedName}`;

      console.log(chalk.gray(`🔍 Fetching price for: ${itemName}`));

      const response = await axios.get(url, {
        headers: {
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
        },
        timeout: 10000,
      });

      // Debug logging
      if (this.debug) {
        console.log(chalk.cyan(`Debug - API Response for ${itemName}:`));
        console.log(chalk.gray(JSON.stringify(response.data, null, 2)));
      }

      if (response.data && response.data.success) {
        // Handle price parsing more safely
        let price = 0;
        if (response.data.lowest_price) {
          const priceStr = response.data.lowest_price
            .toString()
            .replace(/[$,]/g, "");
          price = parseFloat(priceStr) || 0;
        } else if (response.data.median_price) {
          const priceStr = response.data.median_price
            .toString()
            .replace(/[$,]/g, "");
          price = parseFloat(priceStr) || 0;
        }

        // Handle volume parsing more safely
        let volume = 0;
        if (response.data.volume) {
          if (typeof response.data.volume === "string") {
            volume = parseInt(response.data.volume.replace(/,/g, "")) || 0;
          } else if (typeof response.data.volume === "number") {
            volume = response.data.volume;
          }
        }

        if (price > 0) {
          return {
            success: true,
            price: price,
            volume: volume,
            timestamp: new Date().toISOString(),
            raw: response.data,
          };
        } else {
          console.log(chalk.yellow(`⚠️  No valid price for: ${itemName}`));
          return { success: false, error: "No valid price found" };
        }
      } else {
        console.log(
          chalk.yellow(`⚠️  API returned no success for: ${itemName}`)
        );
        console.log(
          chalk.gray(`Raw response: ${JSON.stringify(response.data)}`)
        );
        return { success: false, error: "API returned no success flag" };
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error fetching ${itemName}: ${error.message}`));

      // Add debug info for API errors
      if (error.response) {
        console.log(chalk.gray(`HTTP Status: ${error.response.status}`));
        if (error.response.status === 429) {
          console.log(chalk.yellow("⏰ Rate limited. Waiting 60 seconds..."));
          await this.sleep(60000);
        } else if (error.response.status === 500) {
          console.log(
            chalk.yellow("🔧 Steam server error. Trying again in 10 seconds...")
          );
          await this.sleep(10000);
        }
      }

      return { success: false, error: error.message };
    }
  }

  async storePriceData(itemName, priceData) {
    const history = await fs.readJson(this.priceHistoryFile);

    if (!history[itemName]) {
      history[itemName] = [];
    }

    history[itemName].push(priceData);

    // Keep only last 100 price points per item
    if (history[itemName].length > 100) {
      history[itemName] = history[itemName].slice(-100);
    }

    await fs.writeJson(this.priceHistoryFile, history, { spaces: 2 });
  }

  async analyzePrice(itemName, currentPrice) {
    const history = await fs.readJson(this.priceHistoryFile);
    const itemHistory = history[itemName] || [];

    if (itemHistory.length < this.minPriceHistory) {
      return {
        hasEnoughData: false,
        message: `Need ${
          this.minPriceHistory - itemHistory.length
        } more price points for analysis`,
      };
    }

    // Calculate 30-day average (or all available data if less than 30 days)
    const recentPrices = itemHistory
      .filter((entry) => entry.success)
      .slice(-30)
      .map((entry) => entry.price);

    if (recentPrices.length === 0) {
      return { hasEnoughData: false, message: "No valid price data" };
    }

    const average =
      recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const discountPrice = average * (1 - this.discountThreshold);
    const isGoodDeal = currentPrice <= discountPrice;
    const discountPercent = ((average - currentPrice) / average) * 100;

    return {
      hasEnoughData: true,
      average: average,
      discountPrice: discountPrice,
      currentPrice: currentPrice,
      isGoodDeal: isGoodDeal,
      discountPercent: discountPercent,
      pricePoints: recentPrices.length,
    };
  }

  async logAlert(itemName, analysis, volume) {
    const alerts = await fs.readJson(this.alertsFile);

    const alert = {
      timestamp: new Date().toISOString(),
      itemName: itemName,
      currentPrice: analysis.currentPrice,
      averagePrice: analysis.average,
      discountPercent: analysis.discountPercent,
      volume: volume,
      message: `🚨 DEAL ALERT: ${itemName} is ${analysis.discountPercent.toFixed(
        1
      )}% below average!`,
    };

    alerts.push(alert);

    // Keep only last 1000 alerts
    if (alerts.length > 1000) {
      alerts.splice(0, alerts.length - 1000);
    }

    await fs.writeJson(this.alertsFile, alerts, { spaces: 2 });

    // Console alert
    console.log(chalk.green.bold("\n🚨 DEAL ALERT! 🚨"));
    console.log(chalk.yellow(`Item: ${itemName}`));
    console.log(
      chalk.yellow(`Current Price: $${analysis.currentPrice.toFixed(2)}`)
    );
    console.log(chalk.yellow(`Average Price: $${analysis.average.toFixed(2)}`));
    console.log(
      chalk.yellow(`Discount: ${analysis.discountPercent.toFixed(1)}%`)
    );
    console.log(chalk.yellow(`Volume: ${volume}`));
    console.log(chalk.cyan(`💡 Manual action required - check Steam Market!`));
    console.log("");
  }

  async monitorItem(itemName) {
    const priceData = await this.fetchItemPrice(itemName);

    if (!priceData.success) {
      return;
    }

    // Store price data
    await this.storePriceData(itemName, priceData);

    // Analyze price
    const analysis = await this.analyzePrice(itemName, priceData.price);

    if (!analysis.hasEnoughData) {
      console.log(
        chalk.blue(
          `📊 ${itemName}: $${priceData.price.toFixed(2)} (${analysis.message})`
        )
      );
      return;
    }

    // Check for good deal
    if (analysis.isGoodDeal) {
      await this.logAlert(itemName, analysis, priceData.volume);
    } else {
      console.log(
        chalk.white(
          `📊 ${itemName}: $${priceData.price.toFixed(
            2
          )} (avg: $${analysis.average.toFixed(2)})`
        )
      );
    }
  }

  async runMonitoring() {
    console.log(chalk.blue("\n🔍 Starting monitoring cycle..."));

    const watchlist = await fs.readJson(this.watchlistFile);

    for (let i = 0; i < watchlist.length; i++) {
      const itemName = watchlist[i];
      await this.monitorItem(itemName);

      // Add delay between requests to avoid rate limiting
      if (i < watchlist.length - 1) {
        await this.sleep(3000); // 3 second delay
      }
    }

    console.log(chalk.blue("✅ Monitoring cycle completed\n"));
  }

  async addToWatchlist(itemName) {
    const watchlist = await fs.readJson(this.watchlistFile);

    if (!watchlist.includes(itemName)) {
      watchlist.push(itemName);
      await fs.writeJson(this.watchlistFile, watchlist, { spaces: 2 });
      console.log(chalk.green(`✅ Added "${itemName}" to watchlist`));
    } else {
      console.log(chalk.yellow(`⚠️  "${itemName}" is already in watchlist`));
    }
  }

  async removeFromWatchlist(itemName) {
    const watchlist = await fs.readJson(this.watchlistFile);
    const index = watchlist.indexOf(itemName);

    if (index > -1) {
      watchlist.splice(index, 1);
      await fs.writeJson(this.watchlistFile, watchlist, { spaces: 2 });
      console.log(chalk.green(`✅ Removed "${itemName}" from watchlist`));
    } else {
      console.log(chalk.yellow(`⚠️  "${itemName}" not found in watchlist`));
    }
  }

  async showWatchlist() {
    const watchlist = await fs.readJson(this.watchlistFile);
    console.log(chalk.blue("\n📋 Current Watchlist:"));
    watchlist.forEach((item, index) => {
      console.log(chalk.white(`${index + 1}. ${item}`));
    });
    console.log("");
  }

  async showRecentAlerts(limit = 10) {
    const alerts = await fs.readJson(this.alertsFile);
    const recentAlerts = alerts.slice(-limit).reverse();

    console.log(chalk.blue(`\n🚨 Recent Alerts (last ${limit}):`));

    if (recentAlerts.length === 0) {
      console.log(chalk.gray("No alerts yet."));
      return;
    }

    recentAlerts.forEach((alert, index) => {
      const date = new Date(alert.timestamp).toLocaleString();
      console.log(chalk.yellow(`${index + 1}. [${date}] ${alert.itemName}`));
      console.log(
        chalk.white(
          `   Price: $${alert.currentPrice.toFixed(
            2
          )} (${alert.discountPercent.toFixed(1)}% off)`
        )
      );
    });
    console.log("");
  }

  startScheduledMonitoring() {
    console.log(
      chalk.green("🕐 Starting scheduled monitoring (every 5 minutes)...")
    );
    console.log(chalk.gray("Press Ctrl+C to stop\n"));

    // Run immediately
    this.runMonitoring();

    // Then run every 5 minutes
    cron.schedule("*/5 * * * *", () => {
      this.runMonitoring();
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// CLI Interface
async function main() {
  const monitor = new CS2SkinMonitor();

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "monitor":
      monitor.startScheduledMonitoring();
      break;

    case "check":
      await monitor.runMonitoring();
      break;

    case "add":
      if (args[1]) {
        await monitor.addToWatchlist(args.slice(1).join(" "));
      } else {
        console.log(chalk.red("❌ Please provide an item name"));
      }
      break;

    case "remove":
      if (args[1]) {
        await monitor.removeFromWatchlist(args.slice(1).join(" "));
      } else {
        console.log(chalk.red("❌ Please provide an item name"));
      }
      break;

    case "list":
      await monitor.showWatchlist();
      break;

    case "alerts":
      const limit = args[1] ? parseInt(args[1]) : 10;
      await monitor.showRecentAlerts(limit);
      break;

    default:
      console.log(chalk.blue("\n🎮 CS2 Skin Monitor Commands:"));
      console.log(
        chalk.white("  node index.js monitor     - Start continuous monitoring")
      );
      console.log(
        chalk.white("  node index.js check       - Run single monitoring cycle")
      );
      console.log(
        chalk.white("  node index.js add <item>  - Add item to watchlist")
      );
      console.log(
        chalk.white(
          "  node index.js remove <item> - Remove item from watchlist"
        )
      );
      console.log(
        chalk.white("  node index.js list        - Show current watchlist")
      );
      console.log(
        chalk.white("  node index.js alerts [n]  - Show recent alerts")
      );
      console.log(
        chalk.gray(
          '\nExample: node index.js add "AK-47 | Redline (Field-Tested)"\n'
        )
      );
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n👋 Shutting down CS2 Skin Monitor..."));
  process.exit(0);
});

main().catch(console.error);
