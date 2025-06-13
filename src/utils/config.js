const path = require("path");
const fs = require("fs-extra");
const logger = require("./logger");

class Config {
  constructor() {
    this.configFile = path.join(__dirname, "../../.env");
    this.defaults = {
      // Monitoring Settings
      DISCOUNT_THRESHOLD: "0.25",
      MIN_PRICE_HISTORY: "5",
      MONITORING_INTERVAL: "5",

      // Rate Limiting
      REQUEST_DELAY: "3000",
      RATE_LIMIT_DELAY: "60000",

      // Currency and Location
      CURRENCY: "1",
      COUNTRY: "US",

      // Data Storage
      MAX_PRICE_HISTORY: "100",
      MAX_ALERTS: "1000",

      // Web Server
      PORT: "3000",

      // Logging
      LOG_LEVEL: "info",
      DEBUG: "false",
      VERBOSE: "false",
      ENABLE_FILE_LOGGING: "true",

      // Features
      ENABLE_NOTIFICATIONS: "true",
      ENABLE_WEBHOOKS: "false",
      ENABLE_EMAIL_ALERTS: "false",
    };
  }

  async initialize() {
    try {
      await this.createConfigIfNotExists();
      await this.validateConfig();
      logger.info("Configuration initialized");
    } catch (error) {
      logger.error(`Failed to initialize configuration: ${error.message}`);
      throw error;
    }
  }

  async createConfigIfNotExists() {
    if (!(await fs.pathExists(this.configFile))) {
      logger.info("Creating default configuration file...");
      await this.createDefaultConfig();
    }
  }

  async createDefaultConfig() {
    const content = this.generateConfigContent();
    await fs.writeFile(this.configFile, content);
    logger.info("Default configuration created at .env");
  }

  generateConfigContent() {
    return `# CS2 Skin Monitor Configuration
# Generated on ${new Date().toISOString()}

# ================================
# MONITORING SETTINGS
# ================================
# Discount threshold (0.25 = 25% below average price)
DISCOUNT_THRESHOLD=${this.defaults.DISCOUNT_THRESHOLD}

# Minimum price points needed for analysis
MIN_PRICE_HISTORY=${this.defaults.MIN_PRICE_HISTORY}

# Minutes between monitoring cycles
MONITORING_INTERVAL=${this.defaults.MONITORING_INTERVAL}

# ================================
# RATE LIMITING
# ================================
# Milliseconds between requests to Steam API
REQUEST_DELAY=${this.defaults.REQUEST_DELAY}

# Milliseconds to wait when rate limited
RATE_LIMIT_DELAY=${this.defaults.RATE_LIMIT_DELAY}

# ================================
# CURRENCY & LOCATION
# ================================
# Currency: 1=USD, 2=GBP, 3=EUR, 4=RUB, 5=BRL, etc.
CURRENCY=${this.defaults.CURRENCY}

# Country code for regional pricing
COUNTRY=${this.defaults.COUNTRY}

# ================================
# DATA STORAGE
# ================================
# Maximum price points to store per item
MAX_PRICE_HISTORY=${this.defaults.MAX_PRICE_HISTORY}

# Maximum alerts to keep in history
MAX_ALERTS=${this.defaults.MAX_ALERTS}

# ================================
# WEB SERVER
# ================================
# Port for web dashboard
PORT=${this.defaults.PORT}

# ================================
# LOGGING & DEBUG
# ================================
# Log level: error, warn, info, debug
LOG_LEVEL=${this.defaults.LOG_LEVEL}

# Enable debug logging (shows API responses)
DEBUG=${this.defaults.DEBUG}

# Enable verbose output
VERBOSE=${this.defaults.VERBOSE}

# Save logs to file
ENABLE_FILE_LOGGING=${this.defaults.ENABLE_FILE_LOGGING}

# ================================
# NOTIFICATIONS
# ================================
# Enable browser notifications
ENABLE_NOTIFICATIONS=${this.defaults.ENABLE_NOTIFICATIONS}

# Enable webhook notifications (Discord, Slack, etc.)
ENABLE_WEBHOOKS=${this.defaults.ENABLE_WEBHOOKS}

# Enable email alerts
ENABLE_EMAIL_ALERTS=${this.defaults.ENABLE_EMAIL_ALERTS}

# ================================
# WEBHOOK CONFIGURATION
# ================================
# Uncomment and configure if ENABLE_WEBHOOKS=true

# Discord webhook URL
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url

# Slack webhook URL  
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your-webhook-url

# Generic webhook URL
# GENERIC_WEBHOOK_URL=https://your-server.com/webhook

# ================================
# EMAIL CONFIGURATION
# ================================
# Uncomment and configure if ENABLE_EMAIL_ALERTS=true

# SMTP server configuration
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_SECURE=false
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASS=your-app-password
# EMAIL_TO=recipient@example.com

# ================================
# ADVANCED SETTINGS
# ================================
# Steam API timeout in milliseconds
# API_TIMEOUT=15000

# Maximum concurrent API requests
# MAX_CONCURRENT_REQUESTS=3

# Custom user agent for requests
# USER_AGENT=CS2SkinMonitor/2.0

# Enable data compression
# ENABLE_COMPRESSION=true
`;
  }

  async validateConfig() {
    const requiredVars = [
      "DISCOUNT_THRESHOLD",
      "MIN_PRICE_HISTORY",
      "MONITORING_INTERVAL",
      "REQUEST_DELAY",
      "RATE_LIMIT_DELAY",
    ];

    const missing = requiredVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required configuration variables: ${missing.join(", ")}`
      );
    }

    // Validate numeric values
    const numericVars = {
      DISCOUNT_THRESHOLD: { min: 0.01, max: 0.99 },
      MIN_PRICE_HISTORY: { min: 1, max: 100 },
      MONITORING_INTERVAL: { min: 1, max: 60 },
      REQUEST_DELAY: { min: 1000, max: 30000 },
      RATE_LIMIT_DELAY: { min: 10000, max: 300000 },
      PORT: { min: 1000, max: 65535 },
    };

    for (const [varName, { min, max }] of Object.entries(numericVars)) {
      const value = parseFloat(process.env[varName]);
      if (isNaN(value) || value < min || value > max) {
        logger.warn(
          `Invalid value for ${varName}: ${process.env[varName]}. Should be between ${min} and ${max}`
        );
      }
    }
  }

  get(key, defaultValue = null) {
    return process.env[key] || this.defaults[key] || defaultValue;
  }

  getNumber(key, defaultValue = 0) {
    const value = this.get(key);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getBoolean(key, defaultValue = false) {
    const value = this.get(key);
    if (typeof value === "string") {
      return value.toLowerCase() === "true";
    }
    return defaultValue;
  }

  async update(key, value) {
    try {
      // Read current config
      const content = await fs.readFile(this.configFile, "utf8");

      // Update the value
      const regex = new RegExp(`^${key}=.*$`, "m");
      const newLine = `${key}=${value}`;

      let updatedContent;
      if (regex.test(content)) {
        updatedContent = content.replace(regex, newLine);
      } else {
        updatedContent = content + `\n${newLine}`;
      }

      // Write back to file
      await fs.writeFile(this.configFile, updatedContent);

      // Update process.env
      process.env[key] = value;

      logger.info(`Configuration updated: ${key}=${value}`);
    } catch (error) {
      logger.error(`Failed to update configuration: ${error.message}`);
      throw error;
    }
  }

  async backup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(
        path.dirname(this.configFile),
        `.env.backup.${timestamp}`
      );

      await fs.copy(this.configFile, backupFile);
      logger.info(`Configuration backed up to ${backupFile}`);

      return backupFile;
    } catch (error) {
      logger.error(`Failed to backup configuration: ${error.message}`);
      throw error;
    }
  }

  async restore(backupFile) {
    try {
      if (!(await fs.pathExists(backupFile))) {
        throw new Error(`Backup file not found: ${backupFile}`);
      }

      await fs.copy(backupFile, this.configFile);
      logger.info(`Configuration restored from ${backupFile}`);

      // Reload environment variables
      require("dotenv").config({ override: true });
    } catch (error) {
      logger.error(`Failed to restore configuration: ${error.message}`);
      throw error;
    }
  }

  getAllSettings() {
    const settings = {};

    for (const [key, defaultValue] of Object.entries(this.defaults)) {
      settings[key] = this.get(key, defaultValue);
    }

    return settings;
  }

  getWebhookConfig() {
    if (!this.getBoolean("ENABLE_WEBHOOKS")) {
      return null;
    }

    const config = {};

    if (this.get("DISCORD_WEBHOOK_URL")) {
      config.discord = {
        type: "discord",
        url: this.get("DISCORD_WEBHOOK_URL"),
      };
    }

    if (this.get("SLACK_WEBHOOK_URL")) {
      config.slack = {
        type: "slack",
        url: this.get("SLACK_WEBHOOK_URL"),
      };
    }

    if (this.get("GENERIC_WEBHOOK_URL")) {
      config.generic = {
        type: "generic",
        url: this.get("GENERIC_WEBHOOK_URL"),
      };
    }

    return Object.keys(config).length > 0 ? config : null;
  }

  getEmailConfig() {
    if (!this.getBoolean("ENABLE_EMAIL_ALERTS")) {
      return null;
    }

    const requiredFields = [
      "EMAIL_HOST",
      "EMAIL_PORT",
      "EMAIL_USER",
      "EMAIL_PASS",
      "EMAIL_TO",
    ];
    const hasAllFields = requiredFields.every((field) => this.get(field));

    if (!hasAllFields) {
      logger.warn("Email alerts enabled but configuration incomplete");
      return null;
    }

    return {
      host: this.get("EMAIL_HOST"),
      port: this.getNumber("EMAIL_PORT"),
      secure: this.getBoolean("EMAIL_SECURE"),
      auth: {
        user: this.get("EMAIL_USER"),
        pass: this.get("EMAIL_PASS"),
      },
      to: this.get("EMAIL_TO"),
    };
  }
}

// Create singleton instance
const config = new Config();

module.exports = config;
