#!/usr/bin/env node

const { WebServer } = require("./src/ui/server");
const { Monitor } = require("./src/core/monitor");
const logger = require("./src/utils/logger");
const chalk = require("chalk");
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
    "This tool provides monitoring and alerts only - all purchases must be made manually."
  )
);
console.log(
  chalk.yellow(
    "Use at your own risk. The author is not responsible for any account actions.\n"
  )
);

class CS2Application {
  constructor() {
    this.webServer = null;
    this.monitor = null;
    this.mode = "web"; // 'web' or 'cli'
  }

  async start() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Determine mode
    if (command && command !== "web") {
      this.mode = "cli";
      await this.runCLI(command, args.slice(1));
    } else {
      this.mode = "web";
      await this.startWebInterface();
    }
  }

  async startWebInterface() {
    try {
      logger.info("Starting CS2 Skin Monitor Web Interface...");

      const port = process.env.PORT || 3000;
      this.webServer = new WebServer(port);

      await this.webServer.start();

      console.log(chalk.green.bold("\n🚀 CS2 Skin Monitor Started!"));
      console.log(chalk.blue(`📊 Web Dashboard: http://localhost:${port}`));
      console.log(
        chalk.blue("💡 Open your browser to start monitoring CS2 skin prices")
      );
      console.log(chalk.gray("Press Ctrl+C to stop\n"));
    } catch (error) {
      logger.error(`Failed to start web interface: ${error.message}`);
      process.exit(1);
    }
  }

  async runCLI(command, args) {
    try {
      this.monitor = new Monitor();
      await this.monitor.initialize();

      switch (command) {
        case "monitor":
          console.log(chalk.blue("🔍 Starting CLI monitoring mode..."));
          console.log(
            chalk.gray(
              "Note: For a better experience, use the web interface with: node index.js\n"
            )
          );
          this.monitor.startScheduledMonitoring();
          break;

        case "check":
          console.log(chalk.blue("🔍 Running single monitoring cycle...\n"));
          await this.monitor.runCycle();
          process.exit(0);

        case "add":
          if (args[0]) {
            const itemName = args.join(" ");
            const result = await this.monitor.addToWatchlist(itemName);
            if (result.success) {
              console.log(chalk.green(`✅ Added "${itemName}" to watchlist`));
            } else {
              console.log(chalk.red(`❌ ${result.error}`));
            }
          } else {
            console.log(chalk.red("❌ Please provide an item name"));
          }
          process.exit(0);

        case "remove":
          if (args[0]) {
            const itemName = args.join(" ");
            const result = await this.monitor.removeFromWatchlist(itemName);
            if (result.success) {
              console.log(
                chalk.green(`✅ Removed "${itemName}" from watchlist`)
              );
            } else {
              console.log(chalk.red(`❌ ${result.error}`));
            }
          } else {
            console.log(chalk.red("❌ Please provide an item name"));
          }
          process.exit(0);

        case "list":
          const watchlist = await this.monitor.getWatchlist();
          console.log(chalk.blue("\n📋 Current Watchlist:"));
          if (watchlist.length === 0) {
            console.log(chalk.gray("No items in watchlist"));
          } else {
            watchlist.forEach((item, index) => {
              console.log(chalk.white(`${index + 1}. ${item}`));
            });
          }
          console.log("");
          process.exit(0);

        case "alerts":
          const limit = args[0] ? parseInt(args[0]) : 10;
          const alerts = await this.monitor.getRecentAlerts(limit);
          console.log(chalk.blue(`\n🚨 Recent Alerts (last ${limit}):`));
          if (alerts.length === 0) {
            console.log(chalk.gray("No alerts yet."));
          } else {
            alerts.forEach((alert, index) => {
              const date = new Date(alert.timestamp).toLocaleString();
              console.log(
                chalk.yellow(`${index + 1}. [${date}] ${alert.itemName}`)
              );
              console.log(
                chalk.white(
                  `   Price: $${alert.currentPrice.toFixed(
                    2
                  )} (${alert.discountPercent.toFixed(1)}% off)`
                )
              );
            });
          }
          console.log("");
          process.exit(0);

        case "deals":
          console.log(chalk.blue("\n🔥 Current Top Deals:"));
          const deals = await this.monitor.analyzer.getTopDeals(5);
          if (deals.length === 0) {
            console.log(chalk.gray("No deals found."));
          } else {
            deals.forEach((deal, index) => {
              console.log(chalk.green(`${index + 1}. ${deal.itemName}`));
              console.log(
                chalk.white(
                  `   Price: $${deal.currentPrice.toFixed(
                    2
                  )} (${deal.discountPercent.toFixed(1)}% off)`
                )
              );
              console.log(chalk.blue(`   Deal Score: ${deal.dealScore}/100`));
            });
          }
          console.log("");
          process.exit(0);

        default:
          this.showHelp();
          process.exit(0);
      }
    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  }

  showHelp() {
    console.log(chalk.blue("\n🎮 CS2 Skin Monitor Commands:"));
    console.log(
      chalk.white("  node index.js [web]       - Start web interface (default)")
    );
    console.log(
      chalk.white("  node index.js monitor     - Start CLI monitoring")
    );
    console.log(
      chalk.white("  node index.js check       - Run single monitoring cycle")
    );
    console.log(
      chalk.white("  node index.js add <item>  - Add item to watchlist")
    );
    console.log(
      chalk.white("  node index.js remove <item> - Remove item from watchlist")
    );
    console.log(
      chalk.white("  node index.js list        - Show current watchlist")
    );
    console.log(
      chalk.white("  node index.js alerts [n]  - Show recent alerts")
    );
    console.log(
      chalk.white("  node index.js deals       - Show current top deals")
    );
    console.log(
      chalk.gray(
        '\nExample: node index.js add "AK-47 | Redline (Field-Tested)"\n'
      )
    );
    console.log(
      chalk.blue(
        "💡 Recommended: Use the web interface for the best experience!"
      )
    );
    console.log(chalk.blue("   Just run: node index.js\n"));
  }

  async stop() {
    logger.info("Shutting down CS2 Skin Monitor...");

    if (this.webServer) {
      await this.webServer.stop();
    }

    if (this.monitor) {
      this.monitor.stopMonitoring();
    }

    logger.info("Shutdown complete");
    process.exit(0);
  }
}

// Handle graceful shutdown
const app = new CS2Application();

process.on("SIGINT", async () => {
  console.log(chalk.yellow("\n👋 Shutting down CS2 Skin Monitor..."));
  await app.stop();
});

process.on("SIGTERM", async () => {
  await app.stop();
});

// Start the application
app.start().catch((error) => {
  logger.error(`Application startup failed: ${error.message}`);
  process.exit(1);
});
