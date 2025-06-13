const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const cors = require("cors");
const { Monitor } = require("../core/monitor");
const logger = require("../utils/logger");

class WebServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.monitor = new Monitor();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketEvents();
    this.setupMonitorEvents();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "static")));

    // Logging middleware
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Serve main page
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "static", "index.html"));
    });

    // API Routes
    const apiRouter = express.Router();

    // Monitor status and control
    apiRouter.get("/status", async (req, res) => {
      try {
        const stats = this.monitor.getStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    apiRouter.post("/start", async (req, res) => {
      try {
        const { interval } = req.body;
        await this.monitor.startMonitoring(interval || 5);
        res.json({ success: true, message: "Monitoring started" });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    apiRouter.post("/stop", async (req, res) => {
      try {
        this.monitor.stopMonitoring();
        res.json({ success: true, message: "Monitoring stopped" });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Watchlist management
    apiRouter.get("/watchlist", async (req, res) => {
      try {
        const watchlist = await this.monitor.getWatchlist();
        res.json({ success: true, data: watchlist });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    apiRouter.post("/watchlist/add", async (req, res) => {
      try {
        const { itemName } = req.body;
        if (!itemName) {
          return res
            .status(400)
            .json({ success: false, error: "Item name required" });
        }

        const result = await this.monitor.addToWatchlist(itemName);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    apiRouter.delete("/watchlist/:itemName", async (req, res) => {
      try {
        const { itemName } = req.params;
        const result = await this.monitor.removeFromWatchlist(
          decodeURIComponent(itemName)
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Price data and analysis
    apiRouter.get("/price-history/:itemName", async (req, res) => {
      try {
        const { itemName } = req.params;
        const { limit } = req.query;
        const history = await this.monitor.getPriceHistory(
          decodeURIComponent(itemName),
          parseInt(limit) || 100
        );
        res.json({ success: true, data: history });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    apiRouter.get("/deals", async (req, res) => {
      try {
        const { limit } = req.query;
        const deals = await this.monitor.analyzer.getTopDeals(
          parseInt(limit) || 10
        );
        res.json({ success: true, data: deals });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Alerts
    apiRouter.get("/alerts", async (req, res) => {
      try {
        const { limit } = req.query;
        const alerts = await this.monitor.getRecentAlerts(
          parseInt(limit) || 20
        );
        res.json({ success: true, data: alerts });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Market URL generation
    apiRouter.get("/market-url/:itemName", async (req, res) => {
      try {
        const { itemName } = req.params;
        const url = await this.monitor.generateMarketUrl(
          decodeURIComponent(itemName)
        );
        res.json({ success: true, data: { url } });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.use("/api", apiRouter);
  }

  setupSocketEvents() {
    this.io.on("connection", (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      socket.on("disconnect", () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // Send initial data
      socket.emit("status", this.monitor.getStats());
    });
  }

  setupMonitorEvents() {
    // Forward monitor events to connected clients
    this.monitor.on("started", () => {
      this.io.emit("monitor:started");
    });

    this.monitor.on("stopped", () => {
      this.io.emit("monitor:stopped");
    });

    this.monitor.on("cycleStart", (data) => {
      this.io.emit("monitor:cycleStart", data);
    });

    this.monitor.on("cycleComplete", (data) => {
      this.io.emit("monitor:cycleComplete", data);
    });

    this.monitor.on("itemProcessed", (data) => {
      this.io.emit("monitor:itemProcessed", data);
    });

    this.monitor.on("alert", (alert) => {
      logger.info("Broadcasting alert to clients");
      this.io.emit("monitor:alert", alert);
    });

    this.monitor.on("watchlistUpdated", (data) => {
      this.io.emit("monitor:watchlistUpdated", data);
    });
  }

  async start() {
    try {
      await this.monitor.initialize();

      this.server.listen(this.port, () => {
        logger.info(`Web server running on http://localhost:${this.port}`);
      });
    } catch (error) {
      logger.error(`Failed to start web server: ${error.message}`);
      throw error;
    }
  }

  async stop() {
    this.monitor.stopMonitoring();
    this.server.close();
    logger.info("Web server stopped");
  }
}

module.exports = { WebServer };
