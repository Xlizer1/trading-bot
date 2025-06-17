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
    this.setupSearchEventListeners(); // Add this line
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

  async addItemToWatchlist() {
    const input = document.getElementById("newItemInput");
    const button = document.getElementById("addItemBtn");
    const itemName = input.value.trim();

    if (!itemName) {
      this.showToast("Please enter an item name", "error");
      return;
    }

    if (itemName.length < 3) {
      this.showToast("Item name must be at least 3 characters long", "error");
      return;
    }

    // Show loading state
    const originalButtonText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    button.disabled = true;
    input.disabled = true;

    try {
      const response = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName }),
      });

      const data = await response.json();

      if (data.success) {
        input.value = "";

        // Show success message with price info
        let message = `Added "${itemName}" to watchlist`;
        if (data.data?.priceData?.price) {
          message += ` - Current price: $${data.data.priceData.price.toFixed(
            2
          )}`;

          if (data.data.priceData.analysis?.isGoodDeal) {
            message += ` (${data.data.priceData.analysis.discountPercent.toFixed(
              1
            )}% off - Good deal!)`;
          }
        }

        this.showToast(message, "success");
        this.loadWatchlist();

        // Show immediate activity
        this.addActivity(
          `Added ${itemName} - $${
            data.data?.priceData?.price?.toFixed(2) || "Price pending"
          }`,
          "success"
        );

        // If it's a good deal, highlight it
        if (data.data?.priceData?.analysis?.isGoodDeal) {
          this.addActivity(`🔥 ${itemName} is currently a good deal!`, "deal");
        }
      } else {
        this.showToast(data.error || "Error adding item", "error");
      }
    } catch (error) {
      this.showToast("Error adding item - please try again", "error");
      console.error("Error:", error);
    } finally {
      // Restore button state
      button.innerHTML = originalButtonText;
      button.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  setupSearchEventListeners() {
    // Toggle search visibility
    document.getElementById("toggleSearch").addEventListener("click", () => {
      this.toggleSearchVisibility();
    });

    // Search button
    document.getElementById("searchBtn").addEventListener("click", () => {
      this.performSearch();
    });

    // Enter key in search input
    document.getElementById("searchQuery").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.performSearch();
      }
    });

    // Clear search
    document.getElementById("clearSearchBtn").addEventListener("click", () => {
      this.clearSearch();
    });

    // Category buttons
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const category = e.currentTarget.dataset.category;
        this.searchByCategory(category);
      });
    });

    // Price input validation
    document.getElementById("minPrice").addEventListener("change", (e) => {
      const minPrice = parseFloat(e.target.value);
      const maxPrice = parseFloat(document.getElementById("maxPrice").value);
      if (minPrice > maxPrice) {
        document.getElementById("maxPrice").value = minPrice;
      }
    });
  }

  toggleSearchVisibility() {
    const container = document.getElementById("searchContainer");
    const toggleBtn = document.getElementById("toggleSearch");

    if (container.classList.contains("hidden")) {
      container.classList.remove("hidden");
      toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Search';
    } else {
      container.classList.add("hidden");
      toggleBtn.innerHTML = '<i class="fas fa-eye"></i> Show Search';
    }
  }

  async performSearch() {
    const query = document.getElementById("searchQuery").value.trim();
    const minPrice = parseFloat(document.getElementById("minPrice").value) || 0;
    const maxPrice =
      parseFloat(document.getElementById("maxPrice").value) || 1000;
    const sortBy = document.getElementById("sortBy").value;

    if (!query || query.length < 2) {
      this.showToast("Please enter at least 2 characters to search", "error");
      return;
    }

    this.showSearchLoading(true);
    this.hideSearchResults();

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          minPrice,
          maxPrice,
          sortBy,
          limit: 20,
        }),
      });

      const data = await response.json();

      if (data.success && data.data.success) {
        this.displaySearchResults(data.data.items, query);
        this.addActivity(
          `Found ${data.data.items.length} items for "${query}"`,
          "info"
        );
      } else {
        this.displayNoResults(query);
        this.showToast(data.error || "Search failed", "error");
      }
    } catch (error) {
      console.error("Search error:", error);
      this.displayNoResults(query);
      this.showToast("Search failed - please try again", "error");
    } finally {
      this.showSearchLoading(false);
    }
  }

  async searchByCategory(category) {
    const minPrice = parseFloat(document.getElementById("minPrice").value) || 0;
    const maxPrice =
      parseFloat(document.getElementById("maxPrice").value) || 1000;

    // Update UI to show which category is being searched
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document
      .querySelector(`[data-category="${category}"]`)
      .classList.add("active");

    this.showSearchLoading(true);
    this.hideSearchResults();

    try {
      const response = await fetch(
        `/api/search/popular/${category}?minPrice=${minPrice}&maxPrice=${maxPrice}&limit=15`
      );
      const data = await response.json();

      if (data.success && data.data.success) {
        this.displaySearchResults(data.data.items, `${category} (popular)`);
        this.addActivity(
          `Found ${data.data.items.length} popular ${category}`,
          "info"
        );
      } else {
        this.displayNoResults(`${category} items`);
        this.showToast(data.error || "Search failed", "error");
      }
    } catch (error) {
      console.error("Category search error:", error);
      this.displayNoResults(`${category} items`);
      this.showToast("Search failed - please try again", "error");
    } finally {
      this.showSearchLoading(false);
    }
  }

  displaySearchResults(items, query) {
    const resultsContainer = document.getElementById("searchResults");
    const resultsList = document.getElementById("resultsList");
    const resultsTitle = document.getElementById("resultsTitle");
    const resultsCount = document.getElementById("resultsCount");

    resultsTitle.textContent = `Search Results for "${query}"`;
    resultsCount.textContent = `${items.length} items found`;

    if (items.length === 0) {
      this.displayNoResults(query);
      return;
    }

    // Get current watchlist to mark items already added
    this.getCurrentWatchlist().then((watchlist) => {
      resultsList.innerHTML = items
        .map((item) =>
          this.createSearchResultItem(item, watchlist.includes(item.name))
        )
        .join("");

      resultsContainer.classList.remove("hidden");
    });
  }

  createSearchResultItem(item, inWatchlist) {
    return `
      <div class="search-result-item ${
        inWatchlist ? "in-watchlist" : ""
      }" data-item-name="${item.name}">
        <div class="result-header">
          ${
            item.image
              ? `<img src="${item.image}" alt="${item.name}" class="result-image">`
              : ""
          }
          <div class="result-name">${item.name}</div>
        </div>
        
        <div class="result-details">
          <div class="result-price">$${item.price.toFixed(2)}</div>
          <div class="result-volume">Vol: ${item.volume}</div>
          ${
            item.exterior
              ? `<div class="result-exterior">${item.exterior}</div>`
              : ""
          }
          ${
            item.weapon ? `<div class="result-weapon">${item.weapon}</div>` : ""
          }
        </div>
        
        <div class="result-actions">
          ${
            !inWatchlist
              ? `
            <button onclick="dashboard.addFromSearch('${item.name.replace(
              /'/g,
              "\\'"
            )}', ${item.price})" 
                    class="btn btn-add-to-watchlist btn-sm">
              <i class="fas fa-plus"></i> Add to Watchlist
            </button>
          `
              : `
            <button disabled class="btn btn-secondary btn-sm">
              <i class="fas fa-check"></i> In Watchlist
            </button>
          `
          }
          <button onclick="window.open('${item.marketUrl}', '_blank')" 
                  class="btn btn-view-market btn-sm">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </div>
      </div>
    `;
  }

  displayNoResults(query) {
    const resultsContainer = document.getElementById("searchResults");
    const resultsList = document.getElementById("resultsList");
    const resultsTitle = document.getElementById("resultsTitle");
    const resultsCount = document.getElementById("resultsCount");

    resultsTitle.textContent = `No Results for "${query}"`;
    resultsCount.textContent = "0 items found";

    resultsList.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <h4>No items found</h4>
        <p>Try adjusting your search terms or price range</p>
      </div>
    `;

    resultsContainer.classList.remove("hidden");
  }

  async addFromSearch(itemName, currentPrice) {
    try {
      const response = await fetch("/api/search/add-to-watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName,
          priceData: { price: currentPrice },
        }),
      });

      const data = await response.json();

      if (data.success) {
        this.showToast(`Added "${itemName}" to watchlist`, "success");
        this.addActivity(
          `Added ${itemName} from search - $${currentPrice.toFixed(2)}`,
          "success"
        );

        // Update the search result item to show it's added
        const resultItem = document.querySelector(
          `[data-item-name="${itemName}"]`
        );
        if (resultItem) {
          resultItem.classList.add("in-watchlist");
          const actions = resultItem.querySelector(".result-actions");
          actions.innerHTML = `
            <button disabled class="btn btn-secondary btn-sm">
              <i class="fas fa-check"></i> In Watchlist
            </button>
            <button onclick="window.open('${
              resultItem.querySelector(".btn-view-market").onclick
            }', '_blank')" 
                    class="btn btn-view-market btn-sm">
              <i class="fas fa-external-link-alt"></i>
            </button>
          `;
        }

        // Refresh watchlist
        this.loadWatchlist();
      } else {
        this.showToast(data.error || "Failed to add item", "error");
      }
    } catch (error) {
      console.error("Add from search error:", error);
      this.showToast("Failed to add item - please try again", "error");
    }
  }

  showSearchLoading(show) {
    const loadingContainer = document.getElementById("searchLoading");
    if (show) {
      loadingContainer.classList.remove("hidden");
    } else {
      loadingContainer.classList.add("hidden");
    }
  }

  hideSearchResults() {
    document.getElementById("searchResults").classList.add("hidden");
  }

  clearSearch() {
    document.getElementById("searchQuery").value = "";
    document.getElementById("minPrice").value = "0";
    document.getElementById("maxPrice").value = "100";
    document.getElementById("sortBy").value = "price";

    // Remove active category selection
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.classList.remove("active");
    });

    this.hideSearchResults();
    this.showSearchLoading(false);
  }

  async getCurrentWatchlist() {
    try {
      const response = await fetch("/api/watchlist");
      const data = await response.json();
      return data.success ? data.data : [];
    } catch (error) {
      console.error("Error getting watchlist:", error);
      return [];
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
