const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || "info";
    this.logFile = path.join(__dirname, "../../logs/app.log");
    this.enableFileLogging = process.env.ENABLE_FILE_LOGGING === "true";
    this.verbose = process.env.VERBOSE === "true";
    this.debug = process.env.DEBUG === "true";

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };

    this.init();
  }

  init() {
    if (this.enableFileLogging) {
      try {
        fs.ensureDirSync(path.dirname(this.logFile));
      } catch (error) {
        console.warn("Could not create logs directory:", error.message);
      }
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  async writeToFile(formattedMessage) {
    if (this.enableFileLogging) {
      try {
        await fs.appendFile(this.logFile, formattedMessage + "\n");
      } catch (error) {
        console.error("Failed to write to log file:", error.message);
      }
    }
  }

  error(message, meta = {}) {
    if (!this.shouldLog("error")) return;

    const formatted = this.formatMessage("error", message, meta);
    console.error(chalk.red("❌ " + message));
    this.writeToFile(formatted);
  }

  warn(message, meta = {}) {
    if (!this.shouldLog("warn")) return;

    const formatted = this.formatMessage("warn", message, meta);
    console.warn(chalk.yellow("⚠️  " + message));
    this.writeToFile(formatted);
  }

  info(message, meta = {}) {
    if (!this.shouldLog("info")) return;

    const formatted = this.formatMessage("info", message, meta);
    console.log(chalk.blue("ℹ️  " + message));
    this.writeToFile(formatted);
  }

  debug(message, meta = {}) {
    if (!this.shouldLog("debug") || !this.debug) return;

    const formatted = this.formatMessage("debug", message, meta);
    console.log(chalk.gray("🔍 " + message));
    this.writeToFile(formatted);
  }

  success(message, meta = {}) {
    const formatted = this.formatMessage("info", message, meta);
    console.log(chalk.green("✅ " + message));
    this.writeToFile(formatted);
  }

  // HTTP request logging
  request(method, url, statusCode, duration) {
    const color =
      statusCode >= 400
        ? chalk.red
        : statusCode >= 300
        ? chalk.yellow
        : chalk.green;
    const message = `${method} ${url} ${statusCode} - ${duration}ms`;
    console.log(color("🌐 " + message));

    if (this.enableFileLogging) {
      const formatted = this.formatMessage("info", message);
      this.writeToFile(formatted);
    }
  }

  // Performance logging
  performance(operation, duration, details = {}) {
    const message = `${operation} completed in ${duration}ms`;
    console.log(chalk.magenta("⏱️  " + message));

    if (this.enableFileLogging) {
      const formatted = this.formatMessage("info", message, details);
      this.writeToFile(formatted);
    }
  }

  // API response logging
  apiResponse(endpoint, success, data = {}) {
    const status = success ? "SUCCESS" : "ERROR";
    const color = success ? chalk.green : chalk.red;
    const icon = success ? "✅" : "❌";

    const message = `API ${endpoint} - ${status}`;
    console.log(color(icon + " " + message));

    if (this.debug && data) {
      console.log(chalk.gray("   Data:", JSON.stringify(data, null, 2)));
    }

    if (this.enableFileLogging) {
      const formatted = this.formatMessage("info", message, data);
      this.writeToFile(formatted);
    }
  }

  // Deal alert logging
  dealAlert(itemName, currentPrice, discountPercent, volume) {
    const message = `DEAL ALERT: ${itemName} - $${currentPrice.toFixed(
      2
    )} (${discountPercent.toFixed(1)}% off, Vol: ${volume})`;
    console.log(chalk.green.bold("🚨 " + message));

    if (this.enableFileLogging) {
      const formatted = this.formatMessage("info", message);
      this.writeToFile(formatted);
    }
  }

  // Rate limit logging
  rateLimit(endpoint, retryAfter) {
    const message = `Rate limited on ${endpoint}, waiting ${retryAfter}ms`;
    console.log(chalk.yellow("⏰ " + message));

    if (this.enableFileLogging) {
      const formatted = this.formatMessage("warn", message);
      this.writeToFile(formatted);
    }
  }

  // System stats logging
  systemStats(stats) {
    if (this.verbose) {
      console.log(chalk.cyan("📊 System Stats:"));
      Object.entries(stats).forEach(([key, value]) => {
        console.log(chalk.cyan(`   ${key}: ${value}`));
      });
    }

    if (this.enableFileLogging) {
      const formatted = this.formatMessage("info", "System Stats", stats);
      this.writeToFile(formatted);
    }
  }

  // Clear old logs
  async clearOldLogs(maxAgeDays = 7) {
    if (!this.enableFileLogging) return;

    try {
      const stats = await fs.stat(this.logFile);
      const ageMs = Date.now() - stats.mtime.getTime();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

      if (ageMs > maxAgeMs) {
        await fs.remove(this.logFile);
        this.info("Cleared old log file");
      }
    } catch (error) {
      // Log file doesn't exist or can't be accessed
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
