const { DataManager } = require("../data/dataManager");
const logger = require("../utils/logger");
const EventEmitter = require("events");

class AlertManager extends EventEmitter {
  constructor() {
    super();
    this.dataManager = new DataManager();
    this.recentAlerts = new Map(); // Track recent alerts to avoid spam
    this.alertCooldown = 30 * 60 * 1000; // 30 minutes cooldown per item
    this.maxAlertsPerHour = 10; // Rate limiting
    this.hourlyAlertCount = 0;
    this.lastHourReset = Date.now();
  }

  async createAlert(itemName, monitorResult) {
    try {
      // Check rate limiting
      if (!this.shouldCreateAlert(itemName)) {
        logger.debug(
          `Alert suppressed for ${itemName} (rate limited or cooldown)`
        );
        return null;
      }

      const alert = this.buildAlert(itemName, monitorResult);

      // Store alert
      const storedAlert = await this.dataManager.storeAlert(alert);

      // Track for cooldown
      this.recentAlerts.set(itemName, Date.now());
      this.hourlyAlertCount++;

      // Log the alert
      logger.dealAlert(
        alert.itemName,
        alert.currentPrice,
        alert.discountPercent,
        alert.volume
      );

      // Emit event for real-time updates
      this.emit("alertCreated", storedAlert);

      // Send notifications
      await this.sendNotifications(storedAlert);

      return storedAlert;
    } catch (error) {
      logger.error(`Error creating alert for ${itemName}: ${error.message}`);
      throw error;
    }
  }

  buildAlert(itemName, monitorResult) {
    const { price, volume, analysis } = monitorResult;

    return {
      itemName,
      currentPrice: price,
      averagePrice: analysis.average,
      discountPercent: analysis.discountPercent,
      discountAmount: analysis.average - price,
      volume,
      dealScore: analysis.dealScore || 0,
      confidence: analysis.confidence || 0,
      trend: analysis.trend || {},
      pricePoints: analysis.pricePoints || 0,
      alertType: this.determineAlertType(analysis),
      severity: this.calculateSeverity(analysis),
      marketUrl: this.generateMarketUrl(itemName),
      message: this.generateAlertMessage(itemName, analysis),
    };
  }

  determineAlertType(analysis) {
    if (analysis.discountPercent >= 50) return "exceptional";
    if (analysis.discountPercent >= 35) return "excellent";
    if (analysis.discountPercent >= 25) return "good";
    return "moderate";
  }

  calculateSeverity(analysis) {
    let severity = 1;

    // Base on discount percentage
    if (analysis.discountPercent >= 50) severity = 5;
    else if (analysis.discountPercent >= 40) severity = 4;
    else if (analysis.discountPercent >= 30) severity = 3;
    else if (analysis.discountPercent >= 20) severity = 2;

    // Adjust for deal score
    if (analysis.dealScore >= 90) severity = Math.min(5, severity + 1);

    // Adjust for confidence
    if (analysis.confidence >= 80) severity = Math.min(5, severity + 0.5);

    return Math.round(severity);
  }

  generateAlertMessage(itemName, analysis) {
    const discount = analysis.discountPercent.toFixed(1);
    const price = analysis.currentPrice.toFixed(2);
    const score = analysis.dealScore || 0;

    let message = `🔥 ${itemName} is ${discount}% below average at $${price}`;

    if (score >= 90) {
      message += ` (Exceptional deal - Score: ${score}/100)`;
    } else if (score >= 75) {
      message += ` (Great deal - Score: ${score}/100)`;
    } else if (score >= 60) {
      message += ` (Good deal - Score: ${score}/100)`;
    }

    return message;
  }

  generateMarketUrl(itemName) {
    const encodedName = encodeURIComponent(itemName);
    return `https://steamcommunity.com/market/listings/730/${encodedName}`;
  }

  shouldCreateAlert(itemName) {
    // Check hourly rate limit
    this.resetHourlyCountIfNeeded();
    if (this.hourlyAlertCount >= this.maxAlertsPerHour) {
      logger.warn("Hourly alert limit reached");
      return false;
    }

    // Check item-specific cooldown
    const lastAlert = this.recentAlerts.get(itemName);
    if (lastAlert && Date.now() - lastAlert < this.alertCooldown) {
      return false;
    }

    return true;
  }

  resetHourlyCountIfNeeded() {
    const now = Date.now();
    if (now - this.lastHourReset >= 60 * 60 * 1000) {
      // 1 hour
      this.hourlyAlertCount = 0;
      this.lastHourReset = now;
    }
  }

  async sendNotifications(alert) {
    try {
      const settings = await this.dataManager.getSettings();

      // Browser notification (handled by frontend)
      if (settings.notifications?.browser) {
        this.emit("browserNotification", alert);
      }

      // Email notification
      if (settings.notifications?.email && settings.emailConfig) {
        await this.sendEmailNotification(alert, settings.emailConfig);
      }

      // Webhook notification (Discord, Slack, etc.)
      if (settings.notifications?.webhook && settings.webhookConfig) {
        await this.sendWebhookNotification(alert, settings.webhookConfig);
      }
    } catch (error) {
      logger.error(
        `Error sending notifications for ${alert.itemName}: ${error.message}`
      );
    }
  }

  async sendEmailNotification(alert, emailConfig) {
    try {
      // Email implementation would go here
      // For now, just log that we would send an email
      logger.info(`Would send email notification for ${alert.itemName}`);

      // Example implementation:
      // const nodemailer = require('nodemailer');
      // const transporter = nodemailer.createTransporter(emailConfig);
      // await transporter.sendMail({
      //   to: emailConfig.to,
      //   subject: `CS2 Deal Alert: ${alert.itemName}`,
      //   html: this.generateEmailHTML(alert)
      // });
    } catch (error) {
      logger.error(`Email notification failed: ${error.message}`);
    }
  }

  async sendWebhookNotification(alert, webhookConfig) {
    try {
      const axios = require("axios");

      let payload;

      if (webhookConfig.type === "discord") {
        payload = this.buildDiscordPayload(alert);
      } else if (webhookConfig.type === "slack") {
        payload = this.buildSlackPayload(alert);
      } else {
        payload = this.buildGenericPayload(alert);
      }

      await axios.post(webhookConfig.url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });

      logger.info(`Webhook notification sent for ${alert.itemName}`);
    } catch (error) {
      logger.error(`Webhook notification failed: ${error.message}`);
    }
  }

  buildDiscordPayload(alert) {
    const color =
      alert.severity >= 4
        ? 0xff0000
        : alert.severity >= 3
        ? 0xffa500
        : 0x00ff00;

    return {
      embeds: [
        {
          title: `🔥 CS2 Deal Alert: ${alert.itemName}`,
          description: alert.message,
          color: color,
          fields: [
            {
              name: "Current Price",
              value: `$${alert.currentPrice.toFixed(2)}`,
              inline: true,
            },
            {
              name: "Discount",
              value: `${alert.discountPercent.toFixed(1)}%`,
              inline: true,
            },
            {
              name: "Deal Score",
              value: `${alert.dealScore}/100`,
              inline: true,
            },
            {
              name: "Volume",
              value: alert.volume.toString(),
              inline: true,
            },
            {
              name: "Confidence",
              value: `${alert.confidence}%`,
              inline: true,
            },
          ],
          footer: {
            text: "CS2 Skin Monitor",
          },
          timestamp: new Date().toISOString(),
          url: alert.marketUrl,
        },
      ],
    };
  }

  buildSlackPayload(alert) {
    const emoji =
      alert.severity >= 4 ? "🚨" : alert.severity >= 3 ? "🔥" : "💰";

    return {
      text: `${emoji} CS2 Deal Alert: ${alert.itemName}`,
      attachments: [
        {
          color:
            alert.severity >= 4
              ? "danger"
              : alert.severity >= 3
              ? "warning"
              : "good",
          fields: [
            {
              title: "Price",
              value: `$${alert.currentPrice.toFixed(2)}`,
              short: true,
            },
            {
              title: "Discount",
              value: `${alert.discountPercent.toFixed(1)}%`,
              short: true,
            },
            {
              title: "Deal Score",
              value: `${alert.dealScore}/100`,
              short: true,
            },
            {
              title: "Volume",
              value: alert.volume.toString(),
              short: true,
            },
          ],
          actions: [
            {
              type: "button",
              text: "View on Steam Market",
              url: alert.marketUrl,
            },
          ],
          footer: "CS2 Skin Monitor",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  buildGenericPayload(alert) {
    return {
      alert: {
        itemName: alert.itemName,
        currentPrice: alert.currentPrice,
        discountPercent: alert.discountPercent,
        dealScore: alert.dealScore,
        severity: alert.severity,
        marketUrl: alert.marketUrl,
        message: alert.message,
        timestamp: alert.timestamp,
      },
    };
  }

  async getRecentAlerts(limit = 20) {
    return await this.dataManager.getAlerts(limit);
  }

  async clearAlerts() {
    return await this.dataManager.clearAlerts();
  }

  async deleteAlert(alertId) {
    return await this.dataManager.deleteAlert(alertId);
  }

  async getAlertStatistics() {
    try {
      const alerts = await this.dataManager.getAlerts();

      const now = Date.now();
      const last24h = alerts.filter(
        (alert) =>
          now - new Date(alert.timestamp).getTime() < 24 * 60 * 60 * 1000
      );
      const last7d = alerts.filter(
        (alert) =>
          now - new Date(alert.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
      );

      const alertsByType = alerts.reduce((acc, alert) => {
        acc[alert.alertType] = (acc[alert.alertType] || 0) + 1;
        return acc;
      }, {});

      const averageDiscount =
        alerts.length > 0
          ? alerts.reduce((sum, alert) => sum + alert.discountPercent, 0) /
            alerts.length
          : 0;

      return {
        total: alerts.length,
        last24h: last24h.length,
        last7d: last7d.length,
        byType: alertsByType,
        averageDiscount: averageDiscount.toFixed(1),
        topItems: this.getTopAlertItems(alerts, 5),
      };
    } catch (error) {
      logger.error(`Error getting alert statistics: ${error.message}`);
      return {};
    }
  }

  getTopAlertItems(alerts, limit) {
    const itemCounts = alerts.reduce((acc, alert) => {
      acc[alert.itemName] = (acc[alert.itemName] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(itemCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([itemName, count]) => ({ itemName, count }));
  }

  // Cleanup old alerts and reset cooldowns
  cleanup() {
    try {
      // Clear old cooldowns
      const now = Date.now();
      for (const [itemName, timestamp] of this.recentAlerts.entries()) {
        if (now - timestamp > this.alertCooldown) {
          this.recentAlerts.delete(itemName);
        }
      }

      logger.debug("Alert manager cleanup completed");
    } catch (error) {
      logger.error(`Alert manager cleanup error: ${error.message}`);
    }
  }
}

module.exports = { AlertManager };
