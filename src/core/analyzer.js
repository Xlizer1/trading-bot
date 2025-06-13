const { DataManager } = require("../data/dataManager");
const logger = require("../utils/logger");

class PriceAnalyzer {
  constructor() {
    this.dataManager = new DataManager();
    this.discountThreshold = parseFloat(process.env.DISCOUNT_THRESHOLD) || 0.25;
    this.minPriceHistory = parseInt(process.env.MIN_PRICE_HISTORY) || 5;
  }

  async analyzePrice(itemName, currentPrice) {
    try {
      const history = await this.dataManager.getPriceHistory(itemName);

      if (history.length < this.minPriceHistory) {
        return {
          hasEnoughData: false,
          message: `Need ${
            this.minPriceHistory - history.length
          } more price points for analysis`,
          currentPrice,
        };
      }

      // Get valid price points
      const validPrices = history
        .filter((entry) => entry.success && entry.price > 0)
        .map((entry) => entry.price);

      if (validPrices.length === 0) {
        return {
          hasEnoughData: false,
          message: "No valid price data",
          currentPrice,
        };
      }

      // Calculate statistics
      const stats = this.calculatePriceStats(validPrices);
      const discountPrice = stats.average * (1 - this.discountThreshold);
      const isGoodDeal = currentPrice <= discountPrice;
      const discountPercent =
        ((stats.average - currentPrice) / stats.average) * 100;

      // Calculate trend
      const trend = this.calculateTrend(validPrices);

      // Calculate deal score (0-100)
      const dealScore = this.calculateDealScore(currentPrice, stats, trend);

      return {
        hasEnoughData: true,
        currentPrice,
        average: stats.average,
        median: stats.median,
        min: stats.min,
        max: stats.max,
        standardDeviation: stats.standardDeviation,
        discountPrice,
        isGoodDeal,
        discountPercent,
        pricePoints: validPrices.length,
        trend,
        dealScore,
        confidence: this.calculateConfidence(
          validPrices.length,
          stats.standardDeviation,
          stats.average
        ),
      };
    } catch (error) {
      logger.error(`Analysis error for ${itemName}: ${error.message}`);
      return {
        hasEnoughData: false,
        error: error.message,
        currentPrice,
      };
    }
  }

  calculatePriceStats(prices) {
    const sorted = [...prices].sort((a, b) => a - b);
    const sum = prices.reduce((a, b) => a + b, 0);
    const average = sum / prices.length;

    // Median
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    // Standard deviation
    const variance =
      prices.reduce((acc, price) => acc + Math.pow(price - average, 2), 0) /
      prices.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      average,
      median,
      min: Math.min(...prices),
      max: Math.max(...prices),
      standardDeviation,
      variance,
    };
  }

  calculateTrend(prices, periods = [7, 30]) {
    const trends = {};

    for (const period of periods) {
      if (prices.length >= period) {
        const recentPrices = prices.slice(-period);
        const olderPrices = prices.slice(-period * 2, -period);

        if (olderPrices.length > 0) {
          const recentAvg =
            recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
          const olderAvg =
            olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
          const change = ((recentAvg - olderAvg) / olderAvg) * 100;

          trends[`${period}d`] = {
            change: change,
            direction: change > 5 ? "up" : change < -5 ? "down" : "stable",
          };
        }
      }
    }

    return trends;
  }

  calculateDealScore(currentPrice, stats, trend) {
    // Base score from discount percentage
    const discountPercent =
      ((stats.average - currentPrice) / stats.average) * 100;
    let score = Math.max(0, Math.min(100, discountPercent * 2)); // 50% discount = 100 score

    // Adjust for price stability (lower std dev = more reliable)
    const stabilityFactor =
      1 - Math.min(1, stats.standardDeviation / stats.average);
    score *= 0.7 + stabilityFactor * 0.3;

    // Adjust for trend (upward trend = better deal)
    if (trend["7d"]?.direction === "up") {
      score *= 1.1;
    } else if (trend["7d"]?.direction === "down") {
      score *= 0.9;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  calculateConfidence(dataPoints, stdDev, average) {
    // More data points = higher confidence
    const dataConfidence = Math.min(1, dataPoints / 30);

    // Lower volatility = higher confidence
    const volatility = stdDev / average;
    const stabilityConfidence = Math.max(0, 1 - volatility);

    // Combined confidence score
    return Math.round((dataConfidence * 0.6 + stabilityConfidence * 0.4) * 100);
  }

  async getBulkAnalysis(itemNames) {
    const results = {};

    for (const itemName of itemNames) {
      try {
        const history = await this.dataManager.getPriceHistory(itemName);
        const latestPrice =
          history.length > 0 ? history[history.length - 1]?.price : 0;

        if (latestPrice > 0) {
          results[itemName] = await this.analyzePrice(itemName, latestPrice);
        }
      } catch (error) {
        logger.error(`Bulk analysis error for ${itemName}: ${error.message}`);
        results[itemName] = { error: error.message };
      }
    }

    return results;
  }

  async getTopDeals(limit = 10) {
    try {
      const watchlist = await this.dataManager.getWatchlist();
      const analyses = await this.getBulkAnalysis(watchlist);

      const deals = Object.entries(analyses)
        .filter(
          ([_, analysis]) => analysis.hasEnoughData && analysis.isGoodDeal
        )
        .map(([itemName, analysis]) => ({ itemName, ...analysis }))
        .sort((a, b) => b.dealScore - a.dealScore)
        .slice(0, limit);

      return deals;
    } catch (error) {
      logger.error(`Error getting top deals: ${error.message}`);
      return [];
    }
  }
}

module.exports = { PriceAnalyzer };
