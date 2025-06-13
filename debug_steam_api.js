const axios = require("axios");
const chalk = require("chalk");

async function testSteamAPI() {
  console.log(chalk.blue("🔧 Testing Steam Community Market API...\n"));

  const testItems = [
    "AK-47 | Redline (Field-Tested)",
    "P250 | Sand Dune (Field-Tested)", // Cheap item that should always be available
    "Sticker | Hello",
  ];

  for (const itemName of testItems) {
    console.log(chalk.yellow(`Testing: ${itemName}`));

    try {
      const encodedName = encodeURIComponent(itemName);
      const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodedName}`;

      console.log(chalk.gray(`URL: ${url}`));

      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://steamcommunity.com/market/",
          Origin: "https://steamcommunity.com",
        },
        timeout: 15000,
      });

      console.log(chalk.green("✅ Response received"));
      console.log(chalk.cyan("Raw response:"));
      console.log(JSON.stringify(response.data, null, 2));

      if (response.data && response.data.success) {
        console.log(chalk.green("✅ Success flag is true"));
        console.log(
          chalk.blue(`Lowest price: ${response.data.lowest_price || "N/A"}`)
        );
        console.log(
          chalk.blue(`Median price: ${response.data.median_price || "N/A"}`)
        );
        console.log(chalk.blue(`Volume: ${response.data.volume || "N/A"}`));
      } else {
        console.log(chalk.red("❌ Success flag is false or missing"));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      if (error.response) {
        console.log(chalk.red(`HTTP Status: ${error.response.status}`));
        console.log(
          chalk.red(`Response data: ${JSON.stringify(error.response.data)}`)
        );
      }
    }

    console.log(chalk.gray("─".repeat(50)));

    // Wait between requests
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

testSteamAPI().catch(console.error);
