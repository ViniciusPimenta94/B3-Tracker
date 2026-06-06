require("dotenv").config();

process.env.TZ = "America/Sao_Paulo";

const axios = require("axios");
const cron = require("node-cron");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;

/* =========================
   CARTEIRA
========================= */

const FIIS = ["XPLG11", "PVBI11", "VISC11", "BTHF11", "CPTS11"];
const ETFS = ["IVVB11", "WRLD11"];
const ACOES = ["BBSE3", "TAEE11", "ITUB4", "WEGE3"];

const GRUPOS = [
  { nome: "🏢 FIIs", ativos: FIIS },
  { nome: "🌎 ETFs", ativos: ETFS },
  { nome: "🏦 Ações", ativos: ACOES },
];

/* =========================
   HELPERS
========================= */

function formatMoney(value) {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function getVariationEmoji(value) {
  if (value > 0) return "🟢";
  if (value < 0) return "🔴";
  return "⚪";
}

function getTrendEmoji(value) {
  if (value >= 2) return "🚀";
  if (value >= 1) return "📈";
  if (value <= -2) return "💥";
  if (value <= -1) return "📉";
  return "➡️";
}

function getMarketStatus() {
  const now = new Date();
  const hour = now.getHours();

  if (hour < 10) return "🌅 Pré-mercado";
  if (hour >= 10 && hour < 18) return "📈 Mercado Aberto";
  return "🌙 Pós-mercado";
}

function getCurrentDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/* =========================
   BRAPI
========================= */

async function getAssetData(ticker) {
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`;

    const response = await axios.get(url);

    const result = response.data.results?.[0];

    if (!result) return null;

    const current = result.regularMarketPrice;
    const open = result.regularMarketOpen || result.regularMarketPreviousClose;

    const diff = current - open;
    const variation = (diff / open) * 100;

    return {
      ticker,
      current,
      open,
      diff,
      variation,
      high: result.regularMarketDayHigh,
      low: result.regularMarketDayLow,
      volume: result.regularMarketVolume,
    };
  } catch (err) {
    console.error(`Erro ao buscar ${ticker}:`, err.response?.data || err.message);
    return null;
  }
}

/* =========================
   TELEGRAM
========================= */

async function sendTelegram(message) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }
    );

    console.log("✅ Relatório enviado!");
  } catch (err) {
    console.error("Erro Telegram:", err.response?.data || err.message);
  }
}

/* =========================
   RELATÓRIO
========================= */

async function generateReport(tipo) {
  console.log(`📊 Gerando relatório: ${tipo}`);

  let message = "";

  message += `📊 B3 TRACKER\n\n`;

  message += `🕒 ${getCurrentDate()}\n`;
  message += `${getMarketStatus()}\n`;
  message += `📌 *${tipo}*\n\n`;

  for (const grupo of GRUPOS) {
    message += `━━━━━━━━━━━━━━━\n`;
    message += `${grupo.nome}\n`;
    message += `━━━━━━━━━━━━━━━\n\n`;

    for (const ativo of grupo.ativos) {
      const data = await getAssetData(ativo);

      if (!data) {
        message += `❌ *${ativo}* → erro ao buscar cotação\n\n`;
        continue;
      }

      const variationEmoji = getVariationEmoji(data.variation);
      const trendEmoji = getTrendEmoji(data.variation);

      message += `*${ativo}* ${trendEmoji}\n`;
      message += `💰 Atual: ${formatMoney(data.current)}\n`;
      message += `🚪 Abertura: ${formatMoney(data.open)}\n`;
      message += `📊 Variação: ${variationEmoji} ${data.variation.toFixed(2)}%\n`;
      message += `💵 Diferença: ${formatMoney(data.diff)}\n`;
      message += `⬆️ Máx: ${formatMoney(data.high)}\n`;
      message += `⬇️ Mín: ${formatMoney(data.low)}\n\n`;
    }
  }

  message += `━━━━━━━━━━━━━━━\n`;
  message += `🤖 Bot ativo via Render\n`;
  message += `📡 Dados: brapi.dev\n`;
  message += `━━━━━━━━━━━━━━━`;

  await sendTelegram(message);
}

/* =========================
   AGENDAMENTOS
========================= */

function scheduleReports() {
  // 09h -> pré-abertura
  cron.schedule(
    "0 9 * * 1-5",
    () => {
      console.log("⏰ Executando Pré-abertura");
      generateReport("Pré-abertura");
    },
    {
      timezone: "America/Sao_Paulo",
    }
  );

  // 11h -> pós abertura
  cron.schedule(
    "0 11 * * 1-5",
    () => {
      console.log("⏰ Executando Pós-abertura");
      generateReport("Pós-abertura");
    },
    {
      timezone: "America/Sao_Paulo",
    }
  );

  // 21h -> fechamento consolidado
  cron.schedule(
    "0 21 * * 1-5",
    () => {
      console.log("⏰ Executando Fechamento");
      generateReport("Fechamento do Dia");
    },
    {
      timezone: "America/Sao_Paulo",
    }
  );

  console.log("⏰ Cron jobs agendados!");
}

/* =========================
   EXPRESS SERVER
========================= */

app.get("/", (req, res) => {
  res.send("✅ B3 Tracker Online");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor online na porta ${PORT}`);
});

/* =========================
   START
========================= */

function main() {
  if (!TELEGRAM_TOKEN || !CHAT_ID || !BRAPI_TOKEN) {
    console.error("❌ Variáveis de ambiente faltando.");
    return;
  }

  scheduleReports();

  // Teste ao iniciar
  generateReport("Teste Inicial");
}

/* =========================
   HEARTBEAT
========================= */

setInterval(() => {
  console.log(
    "🤖 Bot online:",
    new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    })
  );
}, 1000 * 60 * 30);

/* =========================
   START
========================= */

main();