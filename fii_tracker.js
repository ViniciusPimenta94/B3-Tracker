process.env.TZ = "America/Sao_Paulo";

const axios = require("axios");
const cron = require("node-cron");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;

const FIIS = ["XPLG11", "PVBI11", "VISC11", "BTHF11"];

// 🔎 Busca dados do ativo
async function getPrice(ticker) {
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`;

    const response = await axios.get(url);
    const result = response.data.results[0];

    if (!result) return null;

    return {
      open: result.regularMarketOpen,
      price: result.regularMarketPrice,
      previousClose: result.regularMarketPreviousClose,
    };

  } catch (err) {
    console.error(`Erro ao buscar ${ticker}:`, err.response?.data || err.message);
    return null;
  }
}

// 📩 Envia mensagem pro Telegram
async function sendTelegram(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.response?.data || err.message);
  }
}

// 📊 Gera relatório
async function generateReport(type) {
  let msg = `📊 Relatório FIIs (${type})\n\n`;

  try {
    // ⚡ Busca tudo em paralelo (mais rápido)
    const results = await Promise.all(
      FIIS.map(async (fii) => ({
        fii,
        data: await getPrice(fii)
      }))
    );

    for (let { fii, data } of results) {
      if (data && data.price != null) {
        // 🧠 Se ainda não abriu, usa fechamento anterior
        const open = data.open ?? data.previousClose;

        const diff = data.price - open;
        const variation = (diff / open) * 100;

        const emoji = variation >= 0 ? "🟢" : "🔴";

        msg += `${fii}\n`;
        msg += `Abertura: R$ ${open.toFixed(2)}\n`;
        msg += `Atual: R$ ${data.price.toFixed(2)}\n`;
        msg += `Variação: ${emoji} R$ ${diff.toFixed(2)} (${variation.toFixed(2)}%)\n\n`;

      } else {
        msg += `${fii}: ❌ erro\n\n`;
      }
    }

    await sendTelegram(msg);

  } catch (err) {
    console.error("Erro ao gerar relatório:", err.message);
  }
}

// ⏰ CRON JOBS (horário de Brasília)

// 🟡 Pré-abertura
cron.schedule("0 9 * * 1-5", async () => {
  await generateReport("Pré-abertura");
});

// 🟢 Pós-abertura
cron.schedule("0 11 * * 1-5", async () => {
  await generateReport("Pós-abertura");
});

// 🌙 Fechamento do dia
cron.schedule("0 21 * * 1-5", async () => {
  await generateReport("Fechamento do dia");
});

// 🚀 Teste ao iniciar
generateReport("Teste inicial");