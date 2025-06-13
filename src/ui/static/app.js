class CS2Dashboard {
  constructor() {
    this.socket = io();
    this.isMonitoring = false;
    this.chart = null;
    this.init();
  }

  init() {
    this.setupSocketListeners();
    this.setupEventListeners();
    this.loadInitialData();
    this.requestNotificationPermission();
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      this.updateConnectionStatus("connected");
      this.addActivity("Connected to server", "success");
    });

    this.socket.on("disconnect", () => {
      this.updateConnectionStatus("disconnected");
      this.addActivity("Disconnected from server", "error");
    });

    this.socket.on("monitor:started", () => {
      this.isMonitoring = true;
      this.updateMonitoringStatus();
      this.addActivity("Monitoring started", "success");
    });

    this.socket.on("monitor:stopped", () => {
      this.isMonitoring = false;
      this.updateMonitoringStatus();
      this.addActivity("Monitoring stopped", "info");
    });

    this.socket.on("monitor:cycleStart", (data) => {
      this.addActivity(`Starting cycle #${data.cycleNumber}`, "info");
    });

    this.socket.on("monitor:cycleComplete", (data) => {
      this.updateStats();
      this.addActivity(
        `Cycle #${data.cycleNumber} completed (${data.duration}ms)`,
        "success"
      );
      this.refreshDeals();
    });

    this.socket.on("monitor:itemProcessed", (data) => {
      if (data.analysis?.isGoodDeal) {
        this.addActivity(`Deal found: ${data.itemName}`, "deal");
      }
    });

    this.socket.on("monitor:alert", (alert) => {
      this.showAlertNotification(alert);
      this.refreshAlerts();
      this.addActivity(
        `🚨 ${alert.itemName} - ${alert.discountPercent.toFixed(1)}% off!`,
        "alert"
      );
    });

    this.socket.on("monitor:watchlistUpdated", () => {
      this.loadWatchlist();
    });
  }

  setupEventListeners() {
    // Toggle monitoring
    document
      .getElementById("toggleMonitoring")
      .addEventListener("click", () => {
        this.toggleMonitoring();
      });

    // Add item to watchlist
    document.getElementById("addItemBtn").addEventListener("click", () => {
      this.addItemToWatchlist();
    });

    document
      .getElementById("newItemInput")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.addItemToWatchlist();
        }
      });

    // Refresh buttons
    document.getElementById("refreshDeals").addEventListener("click", () => {
      this.refreshDeals();
    });

    // Chart item selector
    document
      .getElementById("chartItemSelect")
      .addEventListener("change", (e) => {
        if (e.target.value) {
          this.loadPriceChart(e.target.value);
        }
      });

    // Alert notification close
    document.addEventListener("click", (e) => {
      if (e.target.closest(".alert-close")) {
        this.hideAlertNotification();
      }
    });
  }

  async loadInitialData() {
    await Promise.all([
      this.updateStats(),
      this.loadWatchlist(),
      this.refreshDeals(),
      this.refreshAlerts(),
    ]);
  }

  async updateStats() {
    try {
      const response = await fetch("/api/status");
      const data = await response.json();

      if (data.success) {
        const stats = data.data;
        this.isMonitoring = stats.isRunning;
        this.updateMonitoringStatus();

        document.getElementById("totalItems").textContent =
          stats.totalItems || 0;
        document.getElementById("totalAlerts").textContent =
          stats.totalAlerts || 0;
        document.getElementById("totalCycles").textContent =
          stats.totalCycles || 0;
        document.getElementById("lastCycleTime").textContent =
          stats.lastCycleTime ? `${stats.lastCycleTime}ms` : "-";
      }
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  }

  async toggleMonitoring() {
    try {
      const endpoint = this.isMonitoring ? "/api/stop" : "/api/start";
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();

      if (data.success) {
        this.showToast(data.message);
      } else {
        this.showToast(data.error, "error");
      }
    } catch (error) {
      this.showToast("Error toggling monitoring", "error");
      console.error("Error:", error);
    }
  }

  updateMonitoringStatus() {
    const toggleBtn = document.getElementById("toggleMonitoring");
    const statusIndicator = document.getElementById("statusIndicator");

    if (this.isMonitoring) {
      toggleBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Monitoring';
      toggleBtn.className = "btn btn-danger";
      this.updateConnectionStatus("monitoring");
    } else {
      toggleBtn.innerHTML = '<i class="fas fa-play"></i> Start Monitoring';
      toggleBtn.className = "btn btn-primary";
      this.updateConnectionStatus("connected");
    }
  }

  updateConnectionStatus(status) {
    const indicator = document.getElementById("statusIndicator");
    const dot = indicator.querySelector(".status-dot");
    const text = indicator.querySelector(".status-text");

    dot.className = `status-dot ${status}`;

    switch (status) {
      case "connected":
        text.textContent = "Connected";
        break;
      case "monitoring":
        text.textContent = "Monitoring";
        break;
      case "disconnected":
        text.textContent = "Disconnected";
        break;
    }
  }

  async loadWatchlist() {
    try {
      const response = await fetch("/api/watchlist");
      const data = await response.json();

      if (data.success) {
        this.renderWatchlist(data.data);
        this.updateChartSelector(data.data);
      }
    } catch (error) {
      console.error("Error loading watchlist:", error);
    }
  }

  renderWatchlist(items) {
    const container = document.getElementById("watchlistItems");

    if (items.length === 0) {
      container.innerHTML = '<div class="loading">No items in watchlist</div>';
      return;
    }

    container.innerHTML = items
      .map(
        (item) => `
            <div class="watchlist-item">
                <span class="watchlist-name">${item}</span>
                <div>
                    <span class="watchlist-status status-watching">Watching</span>
                    <button onclick="dashboard.removeFromWatchlist('${item}')" 
                            class="btn btn-danger btn-sm">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `
      )
      .join("");
  }

  updateChartSelector(items) {
    const select = document.getElementById("chartItemSelect");
    const currentValue = select.value;

    select.innerHTML =
      '<option value="">Select item to view chart...</option>' +
      items
        .map(
          (item) =>
            `<option value="${item}" ${
              item === currentValue ? "selected" : ""
            }>${item}</option>`
        )
        .join("");
  }

  async addItemToWatchlist() {
    const input = document.getElementById("newItemInput");
    const itemName = input.value.trim();

    if (!itemName) {
      this.showToast("Please enter an item name", "error");
      return;
    }

    try {
      const response = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName }),
      });

      const data = await response.json();

      if (data.success) {
        input.value = "";
        this.showToast(`Added "${itemName}" to watchlist`);
        this.loadWatchlist();
      } else {
        this.showToast(data.error, "error");
      }
    } catch (error) {
      this.showToast("Error adding item", "error");
      console.error("Error:", error);
    }
  }

  async removeFromWatchlist(itemName) {
    try {
      const response = await fetch(
        `/api/watchlist/${encodeURIComponent(itemName)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        this.showToast(`Removed "${itemName}" from watchlist`);
        this.loadWatchlist();
      } else {
        this.showToast(data.error, "error");
      }
    } catch (error) {
      this.showToast("Error removing item", "error");
      console.error("Error:", error);
    }
  }

  async refreshDeals() {
    try {
      const response = await fetch("/api/deals?limit=10");
      const data = await response.json();

      if (data.success) {
        this.renderDeals(data.data);
      }
    } catch (error) {
      console.error("Error refreshing deals:", error);
    }
  }

  renderDeals(deals) {
    const container = document.getElementById("dealsList");

    if (deals.length === 0) {
      container.innerHTML = '<div class="loading">No current deals found</div>';
      return;
    }

    container.innerHTML = deals
      .map(
        (deal) => `
            <div class="deal-item">
                <div class="deal-header">
                    <span class="deal-name">${deal.itemName}</span>
                    <span class="deal-score">${deal.dealScore}/100</span>
                </div>
                <div class="deal-details">
                    <span class="deal-price">$${deal.currentPrice.toFixed(
                      2
                    )}</span>
                    <span class="deal-discount">${deal.discountPercent.toFixed(
                      1
                    )}% off</span>
                </div>
                <div class="deal-actions">
                    <button onclick="dashboard.openMarketUrl('${
                      deal.itemName
                    }')" 
                            class="btn btn-primary btn-sm">
                        <i class="fas fa-external-link-alt"></i> View on Steam
                    </button>
                    <button onclick="dashboard.loadPriceChart('${
                      deal.itemName
                    }')" 
                            class="btn btn-secondary btn-sm">
                        <i class="fas fa-chart-line"></i> Chart
                    </button>
                </div>
            </div>
        `
      )
      .join("");
  }

  async refreshAlerts() {
    try {
      const response = await fetch("/api/alerts?limit=20");
      const data = await response.json();

      if (data.success) {
        this.renderAlerts(data.data);
      }
    } catch (error) {
      console.error("Error refreshing alerts:", error);
    }
  }

  renderAlerts(alerts) {
    const container = document.getElementById("alertsList");

    if (alerts.length === 0) {
      container.innerHTML = '<div class="loading">No alerts yet</div>';
      return;
    }

    container.innerHTML = alerts
      .map(
        (alert) => `
            <div class="alert-item">
                <span class="alert-time">${new Date(
                  alert.timestamp
                ).toLocaleString()}</span>
                <div class="alert-message">
                    ${alert.itemName} - $${alert.currentPrice.toFixed(2)} 
                    (${alert.discountPercent.toFixed(1)}% off)
                </div>
            </div>
        `
      )
      .join("");
  }

  async openMarketUrl(itemName) {
    try {
      const response = await fetch(
        `/api/market-url/${encodeURIComponent(itemName)}`
      );
      const data = await response.json();

      if (data.success) {
        window.open(data.data.url, "_blank");
      }
    } catch (error) {
      console.error("Error getting market URL:", error);
    }
  }

  async loadPriceChart(itemName) {
    try {
      // Update selector
      document.getElementById("chartItemSelect").value = itemName;

      const response = await fetch(
        `/api/price-history/${encodeURIComponent(itemName)}?limit=50`
      );
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        this.renderPriceChart(itemName, data.data);
      } else {
        this.showToast("No price history available for this item", "error");
      }
    } catch (error) {
      console.error("Error loading price chart:", error);
      this.showToast("Error loading price chart", "error");
    }
  }

  renderPriceChart(itemName, priceHistory) {
    const ctx = document.getElementById("priceChart").getContext("2d");

    if (this.chart) {
      this.chart.destroy();
    }

    const labels = priceHistory.map((entry) =>
      new Date(entry.timestamp).toLocaleDateString()
    );

    const prices = priceHistory.map((entry) => entry.price);

    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: `${itemName} Price`,
            data: prices,
            borderColor: "#667eea",
            backgroundColor: "rgba(102, 126, 234, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function (value) {
                return "$" + value.toFixed(2);
              },
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
      },
    });
  }

  showAlertNotification(alert) {
    const notification = document.getElementById("alertNotification");
    const title = notification.querySelector(".alert-title");
    const message = notification.querySelector(".alert-message");

    title.textContent = `Deal Alert: ${alert.itemName}`;
    message.textContent = `$${alert.currentPrice.toFixed(
      2
    )} (${alert.discountPercent.toFixed(1)}% off)`;

    notification.classList.remove("hidden");

    // Auto-hide after 10 seconds
    setTimeout(() => {
      this.hideAlertNotification();
    }, 10000);

    // Browser notification
    if (Notification.permission === "granted") {
      new Notification(`CS2 Deal Alert: ${alert.itemName}`, {
        body: `$${alert.currentPrice.toFixed(
          2
        )} (${alert.discountPercent.toFixed(1)}% off)`,
        icon: "/favicon.ico",
      });
    }
  }

  hideAlertNotification() {
    document.getElementById("alertNotification").classList.add("hidden");
  }

  addActivity(message, type = "info") {
    const container = document.getElementById("activityList");
    const time = new Date().toLocaleTimeString();

    const activityItem = document.createElement("div");
    activityItem.className = "activity-item";
    activityItem.innerHTML = `
            <span class="activity-time">${time}</span>
            <span class="activity-message ${type}">${message}</span>
        `;

    container.insertBefore(activityItem, container.firstChild);

    // Keep only last 50 items
    const items = container.querySelectorAll(".activity-item");
    if (items.length > 50) {
      items[items.length - 1].remove();
    }
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener("DOMContentLoaded", () => {
  dashboard = new CS2Dashboard();
});

// Make dashboard available globally for onclick handlers
window.dashboard = dashboard;
