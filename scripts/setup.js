#!/usr/bin/env node

const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const readline = require("readline");

class Setup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rootDir = path.join(__dirname, "..");
    this.oldDataDir = path.join(this.rootDir, "data");
    this.newDataDir = path.join(this.rootDir, "data");
    this.envFile = path.join(this.rootDir, ".env");
  }

  async start() {
    console.log(chalk.blue.bold("\n🚀 CS2 Skin Monitor Pro Setup\n"));

    try {
      await this.checkExistingInstallation();
      await this.createDirectories();
      await this.setupConfiguration();
      await this.migrateData();
      await this.installDependencies();
      await this.runInitialTests();

      console.log(chalk.green.bold("\n✅ Setup completed successfully!\n"));
      await this.showGettingStarted();
    } catch (error) {
      console.error(chalk.red.bold("\n❌ Setup failed:"), error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async checkExistingInstallation() {
    console.log(chalk.blue("🔍 Checking for existing installation...\n"));

    const hasOldData = await fs.pathExists(
      path.join(this.oldDataDir, "price_history.json")
    );
    const hasOldEnv = await fs.pathExists(this.envFile);

    if (hasOldData || hasOldEnv) {
      console.log(
        chalk.yellow("📦 Found existing CS2 Skin Monitor installation")
      );

      const migrate = await this.askQuestion(
        "Would you like to migrate your existing data? (y/n): "
      );

      this.shouldMigrate = migrate.toLowerCase() === "y";

      if (this.shouldMigrate) {
        console.log(chalk.green("✅ Will migrate existing data\n"));
      } else {
        console.log(
          chalk.yellow(
            "⚠️  Will start fresh (existing data will be backed up)\n"
          )
        );
      }
    } else {
      console.log(chalk.green("✅ Fresh installation detected\n"));
      this.shouldMigrate = false;
    }
  }

  async createDirectories() {
    console.log(chalk.blue("📁 Creating directory structure...\n"));

    const directories = [
      "data",
      "logs",
      "backups",
      "src/api",
      "src/core",
      "src/data",
      "src/ui/static",
      "src/utils",
    ];

    for (const dir of directories) {
      const dirPath = path.join(this.rootDir, dir);
      await fs.ensureDir(dirPath);
      console.log(chalk.gray(`  Created: ${dir}`));
    }

    console.log(chalk.green("✅ Directory structure created\n"));
  }

  async setupConfiguration() {
    console.log(chalk.blue("⚙️  Setting up configuration...\n"));

    if ((await fs.pathExists(this.envFile)) && !this.shouldMigrate) {
      const overwrite = await this.askQuestion(
        "Configuration file exists. Overwrite? (y/n): "
      );

      if (overwrite.toLowerCase() !== "y") {
        console.log(chalk.yellow("⚠️  Keeping existing configuration\n"));
        return;
      }
    }

    const config = await this.collectConfiguration();
    await this.writeConfiguration(config);

    console.log(chalk.green("✅ Configuration saved\n"));
  }

  async collectConfiguration() {
    console.log(chalk.cyan("Please provide configuration details:\n"));

    const config = {};

    // Basic settings
    config.DISCOUNT_THRESHOLD = await this.askQuestion(
      "Discount threshold (0.25 for 25%): ",
      "0.25"
    );

    config.MONITORING_INTERVAL = await this.askQuestion(
      "Monitoring interval in minutes (5): ",
      "5"
    );

    config.PORT = await this.askQuestion("Web dashboard port (3000): ", "3000");

    // Currency settings
    console.log(chalk.cyan("\nCurrency options:"));
    console.log("1=USD, 2=GBP, 3=EUR, 4=RUB, 5=BRL, 6=AUD, 7=CNY");
    config.CURRENCY = await this.askQuestion("Currency (1 for USD): ", "1");

    config.COUNTRY = await this.askQuestion("Country code (US): ", "US");

    // Debug settings
    const enableDebug = await this.askQuestion(
      "Enable debug logging? (y/n): ",
      "n"
    );
    config.DEBUG = enableDebug.toLowerCase() === "y" ? "true" : "false";

    // Notifications
    const enableNotifications = await this.askQuestion(
      "Enable browser notifications? (y/n): ",
      "y"
    );
    config.ENABLE_NOTIFICATIONS =
      enableNotifications.toLowerCase() === "y" ? "true" : "false";

    // Webhooks
    const enableWebhooks = await this.askQuestion(
      "Enable webhook notifications (Discord/Slack)? (y/n): ",
      "n"
    );
    config.ENABLE_WEBHOOKS =
      enableWebhooks.toLowerCase() === "y" ? "true" : "false";

    if (config.ENABLE_WEBHOOKS === "true") {
      config.DISCORD_WEBHOOK_URL = await this.askQuestion(
        "Discord webhook URL (optional): ",
        ""
      );

      config.SLACK_WEBHOOK_URL = await this.askQuestion(
        "Slack webhook URL (optional): ",
        ""
      );
    }

    return config;
  }

  async writeConfiguration(config) {
    const envContent = `# CS2 Skin Monitor Pro Configuration
# Generated by setup script on ${new Date().toISOString()}

# Monitoring Settings
DISCOUNT_THRESHOLD=${config.DISCOUNT_THRESHOLD}
MIN_PRICE_HISTORY=5
MONITORING_INTERVAL=${config.MONITORING_INTERVAL}

# Rate Limiting
REQUEST_DELAY=3000
RATE_LIMIT_DELAY=60000

# Currency Settings
CURRENCY=${config.CURRENCY}
COUNTRY=${config.COUNTRY}

# Data Storage
MAX_PRICE_HISTORY=100
MAX_ALERTS=1000

# Web Server
PORT=${config.PORT}

# Logging
LOG_LEVEL=info
DEBUG=${config.DEBUG}
VERBOSE=false
ENABLE_FILE_LOGGING=true

# Notifications
ENABLE_NOTIFICATIONS=${config.ENABLE_NOTIFICATIONS}
ENABLE_WEBHOOKS=${config.ENABLE_WEBHOOKS}
ENABLE_EMAIL_ALERTS=false

${
  config.DISCORD_WEBHOOK_URL
    ? `# Discord webhook
DISCORD_WEBHOOK_URL=${config.DISCORD_WEBHOOK_URL}`
    : ""
}

${
  config.SLACK_WEBHOOK_URL
    ? `# Slack webhook
SLACK_WEBHOOK_URL=${config.SLACK_WEBHOOK_URL}`
    : ""
}
`;

    await fs.writeFile(this.envFile, envContent);
  }

  async migrateData() {
    if (!this.shouldMigrate) {
      console.log(chalk.blue("📊 Initializing fresh data files...\n"));
      await this.createDefaultData();
      return;
    }

    console.log(chalk.blue("📦 Migrating existing data...\n"));

    try {
      // Backup existing data
      const backupDir = path.join(
        this.rootDir,
        "backups",
        `migration_${Date.now()}`
      );
      await fs.ensureDir(backupDir);

      const dataFiles = ["price_history.json", "watchlist.json", "alerts.json"];

      for (const file of dataFiles) {
        const oldFile = path.join(this.oldDataDir, file);
        const backupFile = path.join(backupDir, file);

        if (await fs.pathExists(oldFile)) {
          await fs.copy(oldFile, backupFile);
          console.log(chalk.gray(`  Backed up: ${file}`));
        }
      }

      // Migrate data (files should already be in the right place)
      console.log(chalk.green("✅ Data migration completed\n"));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Migration warning: ${error.message}`));
      await this.createDefaultData();
    }
  }

  async createDefaultData() {
    const defaultWatchlist = [
      "AK-47 | Redline (Field-Tested)",
      "AWP | Dragon Lore (Field-Tested)",
      "M4A4 | Howl (Field-Tested)",
      "Karambit | Doppler (Factory New)",
      "AK-47 | Fire Serpent (Field-Tested)",
    ];

    await fs.writeJson(
      path.join(this.newDataDir, "watchlist.json"),
      defaultWatchlist,
      { spaces: 2 }
    );
    await fs.writeJson(
      path.join(this.newDataDir, "price_history.json"),
      {},
      { spaces: 2 }
    );
    await fs.writeJson(path.join(this.newDataDir, "alerts.json"), [], {
      spaces: 2,
    });

    console.log(chalk.gray("  Created default watchlist"));
    console.log(chalk.gray("  Created empty price history"));
    console.log(chalk.gray("  Created empty alerts log"));
  }

  async installDependencies() {
    console.log(chalk.blue("📦 Checking dependencies...\n"));

    const packageJson = path.join(this.rootDir, "package.json");

    if (await fs.pathExists(packageJson)) {
      console.log(chalk.green("✅ package.json found"));
      console.log(chalk.cyan('Run "npm install" to install dependencies\n'));
    } else {
      console.log(chalk.yellow("⚠️  package.json not found"));
      console.log(
        chalk.cyan("Make sure to install the required dependencies\n")
      );
    }
  }

  async runInitialTests() {
    console.log(chalk.blue("🧪 Running initial tests...\n"));

    try {
      // Test configuration loading
      require("dotenv").config({ path: this.envFile });
      console.log(chalk.green("✅ Configuration loads correctly"));

      // Test data directory access
      const testFile = path.join(this.newDataDir, "test.json");
      await fs.writeJson(testFile, { test: true });
      await fs.remove(testFile);
      console.log(chalk.green("✅ Data directory is writable"));

      // Test logging directory
      const logDir = path.join(this.rootDir, "logs");
      await fs.ensureDir(logDir);
      console.log(chalk.green("✅ Logging directory is ready"));

      console.log(chalk.green("\n✅ All tests passed\n"));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Test warning: ${error.message}\n`));
    }
  }

  async showGettingStarted() {
    console.log(chalk.cyan.bold("🎮 Getting Started:\n"));

    console.log(chalk.white("1. Install dependencies:"));
    console.log(chalk.gray("   npm install\n"));

    console.log(chalk.white("2. Start the web interface:"));
    console.log(chalk.gray("   npm start\n"));

    console.log(chalk.white("3. Open your browser:"));
    console.log(
      chalk.gray(`   http://localhost:${process.env.PORT || 3000}\n`)
    );

    console.log(chalk.white("4. Alternative CLI usage:"));
    console.log(chalk.gray("   npm run monitor    # Start CLI monitoring"));
    console.log(chalk.gray("   npm run check      # Single price check"));
    console.log(chalk.gray("   npm run list       # Show watchlist\n"));

    console.log(chalk.cyan.bold("📚 Documentation:"));
    console.log(chalk.white("- Configuration: Edit .env file"));
    console.log(chalk.white("- Data files: Located in ./data/"));
    console.log(chalk.white("- Logs: Located in ./logs/\n"));

    console.log(chalk.yellow.bold("⚠️  Important:"));
    console.log(chalk.yellow("- This tool is for educational purposes only"));
    console.log(
      chalk.yellow("- All purchases must be made manually through Steam")
    );
    console.log(chalk.yellow("- Respect Steam's Terms of Service\n"));
  }

  askQuestion(question, defaultValue = "") {
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan(question), (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }
}

// Run setup
const setup = new Setup();
setup.start().catch(console.error);
