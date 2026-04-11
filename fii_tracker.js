const axios = require("axios");
const cron = require("node-cron");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;

const FIIS = ["XPLG11", "PVBI11", "VISC11", "BTHF11"];

async function getPrice(ticker) {
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`;

    const response = await axios.get(url);

    const result = response.data.results[0];

    if (!result) {
      console.error(`Erro ao buscar ${ticker}: ativo não encontrado`);
      return null;
    }

    return {
      price: result.regularMarketPrice,
      previousClose: result.regularMarketPreviousClose,
    };

  } catch (err) {
    console.error(`Erro ao buscar ${ticker}:`, err.response?.data || err.message);
    return null;
  }
}

async function sendTelegram(message) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
  });
}

async function generateReport(type) {
  let msg = `📊 Relatório FIIs (${type})\n\n`;

  for (let fii of FIIS) {
    const data = await getPrice(fii);

    if (data && data.price && data.previousClose) {
      const variation = ((data.price - data.previousClose) / data.previousClose) * 100;
      const emoji = variation >= 0 ? "🟢" : "🔴";

      msg += `${fii}: R$ ${data.price.toFixed(2)} (${emoji} ${variation.toFixed(2)}%)\n`;
    } else {
      msg += `${fii}: ❌ erro\n`;
    }
  }

  await sendTelegram(msg);
}

// 🟢 Abertura
cron.schedule("58 9 * * 1-5", async () => {
  await generateReport("Abertura");
});

// 🔴 Fechamento
cron.schedule("5 18 * * 1-5", async () => {
  await generateReport("Fechamento");
});

// Teste inicial
generateReport("Teste inicial");