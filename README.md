# CS2 Skin Monitor Pro 🎮

> **Advanced CS2 skin price monitoring with web dashboard and enhanced analytics**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

## ⚠️ Legal Disclaimer

**This tool is for educational purposes only.** Steam's Terms of Service prohibit automated marketplace interactions. This monitor provides **alerts only** - all purchases must be made manually through Steam's official interface. Use at your own risk.

## 🚀 What's New in v2.0

### ✨ Major Features

- **🖥️ Web Dashboard** - Beautiful, real-time interface with charts and analytics
- **📊 Enhanced Analytics** - Deal scoring, confidence ratings, and trend analysis
- **🔔 Smart Notifications** - Browser alerts, Discord/Slack webhooks, email support
- **📈 Price Charts** - Interactive historical price visualization
- **🏗️ Modular Architecture** - Clean, organized codebase with separated concerns
- **⚡ Real-time Updates** - WebSocket-powered live data updates
- **💾 Data Export/Import** - Backup and restore your monitoring data

### 🎯 Improved Monitoring

- **Deal Score Algorithm** - 0-100 scoring system for ranking deals
- **Confidence Ratings** - Reliability indicators based on data quality
- **Trend Analysis** - 7-day and 30-day price movement tracking
- **Volume Monitoring** - Market activity tracking
- **Rate Limiting** - Smart request management to avoid API limits

## 📸 Screenshots

### Web Dashboard

![Dashboard](https://via.placeholder.com/800x400/667eea/white?text=Web+Dashboard+Preview)

### Deal Alerts

![Alerts](https://via.placeholder.com/800x400/10b981/white?text=Real-time+Deal+Alerts)

## 🛠️ Quick Setup

### Prerequisites

- **Node.js** 16.0.0 or higher
- **npm** 8.0.0 or higher

### Installation

1. **Clone & Install**

```bash
git clone https://github.com/yourusername/cs2-skin-monitor-pro.git
cd cs2-skin-monitor-pro
npm install
```

2. **Run Setup Script**

```bash
npm run setup
```

3. **Start Web Interface**

```bash
npm start
```

4. **Open Dashboard**

```
http://localhost:3000
```

That's it! 🎉

## 📖 Usage Guide

### Web Interface (Recommended)

The web dashboard provides the best experience with real-time updates, charts, and easy watchlist management.

```bash
npm start                    # Start web interface
npm run dev                  # Development mode with auto-reload
```

### Command Line Interface

For advanced users or server deployments:

```bash
npm run monitor             # Start continuous monitoring
npm run check               # Single monitoring cycle
npm run list                # Show current watchlist

# Add/remove items
node index.js add "AK-47 | Redline (Field-Tested)"
node index.js remove "AK-47 | Redline (Field-Tested)"

# View alerts and deals
node index.js alerts 10     # Show last 10 alerts
node index.js deals         # Show current top deals
```

## ⚙️ Configuration

Edit `.env` file to customize behavior:

```env
# Monitoring Settings
DISCOUNT_THRESHOLD=0.25      # 25% below average = alert
MIN_PRICE_HISTORY=5          # Minimum data points for analysis
MONITORING_INTERVAL=5        # Minutes between checks

# Web Dashboard
PORT=3000                    # Dashboard port

# Notifications
ENABLE_NOTIFICATIONS=true    # Browser notifications
ENABLE_WEBHOOKS=false        # Discord/Slack integration
DISCORD_WEBHOOK_URL=         # Your Discord webhook URL
SLACK_WEBHOOK_URL=           # Your Slack webhook URL

# Debug & Logging
DEBUG=false                  # Show API responses
LOG_LEVEL=info               # error, warn, info, debug
ENABLE_FILE_LOGGING=true     # Save logs to file
```

## 🔧 Advanced Features

### Deal Scoring Algorithm

Our proprietary algorithm scores deals 0-100 based on:

- **Discount Percentage** - How much below average
- **Price Stability** - How consistent historical prices are
- **Market Trend** - Whether prices are rising or falling
- **Data Confidence** - Quality and quantity of price history

### Webhook Notifications

#### Discord Setup

1. Create a Discord webhook in your server
2. Add `DISCORD_WEBHOOK_URL=your-webhook-url` to `.env`
3. Set `ENABLE_WEBHOOKS=true`

#### Slack Setup

1. Create a Slack incoming webhook
2. Add `SLACK_WEBHOOK_URL=your-webhook-url` to `.env`
3. Set `ENABLE_WEBHOOKS=true`

### Data Management

```bash
# Backup data
npm run backup

# Restore from backup
npm run restore backup-file.json

# Export data via web interface
# Settings -> Data Management -> Export
```

## 📊 File Structure

```
cs2-skin-monitor-pro/
├── src/
│   ├── api/                 # Steam API interactions
│   │   ├── steamMarket.js   # API client
│   │   └── rateLimiter.js   # Request rate limiting
│   ├── core/                # Core business logic
│   │   ├── monitor.js       # Main monitoring engine
│   │   ├── analyzer.js      # Price analysis algorithms
│   │   └── alertManager.js  # Alert generation & sending
│   ├── data/                # Data layer
│   │   └── dataManager.js   # File operations & storage
│   ├── ui/                  # Web interface
│   │   ├── server.js        # Express server & Socket.IO
│   │   └── static/          # Frontend files (HTML/CSS/JS)
│   └── utils/               # Utilities
│       ├── logger.js        # Logging system
│       └── config.js        # Configuration management
├── data/                    # Data storage
│   ├── watchlist.json       # Items to monitor
│   ├── price_history.json   # Historical price data
│   └── alerts.json          # Generated alerts
├── logs/                    # Application logs
├── scripts/                 # Setup & maintenance scripts
└── .env                     # Configuration file
```

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup

```bash
git clone https://github.com/yourusername/cs2-skin-monitor-pro.git
cd cs2-skin-monitor-pro
npm install
npm run dev                  # Start with auto-reload
```

## 🐛 Troubleshooting

### Common Issues

**Port already in use:**

```bash
# Change port in .env file
PORT=3001
```

**Rate limiting errors:**

```bash
# Increase delays in .env
REQUEST_DELAY=5000
RATE_LIMIT_DELAY=120000
```

**No deals found:**

- Adjust `DISCOUNT_THRESHOLD` in `.env` (try 0.15 for 15%)
- Add more items to watchlist
- Wait for more price history to accumulate

**WebSocket connection issues:**

- Check firewall settings
- Try different port
- Disable browser extensions that block WebSockets

### Getting Help

1. **Check the logs** in `./logs/app.log`
2. **Enable debug mode** with `DEBUG=true` in `.env`
3. **Search existing issues** on GitHub
4. **Create a new issue** with logs and configuration

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Steam Community Market API** for providing price data
- **Chart.js** for beautiful price charts
- **Socket.IO** for real-time communications
- **Express.js** for the web framework
- **CS2 Community** for feedback and feature requests

## 🔗 Links

- **Documentation:** [Wiki](https://github.com/yourusername/cs2-skin-monitor-pro/wiki)
- **Bug Reports:** [Issues](https://github.com/yourusername/cs2-skin-monitor-pro/issues)
- **Feature Requests:** [Discussions](https://github.com/yourusername/cs2-skin-monitor-pro/discussions)
- **Discord Community:** [Join Chat](https://discord.gg/your-invite)

---

**⭐ Star this repo if you find it helpful!**

**📧 Questions?** Open an issue or reach out on Discord.

**💰 Support Development:** [GitHub Sponsors](https://github.com/sponsors/yourusername)
