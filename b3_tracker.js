require('dotenv').config();

process.env.TZ = "America/Sao_Paulo";

const axios = require("axios");
const cron = require("node-cron");
const YahooFinance = require("yahoo-finance2").default;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

/** Tickers B3 (sem .SA). Fonte: Yahoo Finance (série .SA na B3). */
const FIIS = ["XPLG11", "PVBI11", "VISC11", "BTHF11"];
const ETFS = ["IVVB11", "WRLD11"];
const ACOES = ["BBSE3", "TAEE11", "ITUB4"];

const GRUPOS = [
  { label: "FIIs", tickers: FIIS },
  { label: "ETFs", tickers: ETFS },
  { label: "Ações", tickers: ACOES },
];

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const QUOTE_FIELDS = [
  "symbol",
  "regularMarketPrice",
  "regularMarketOpen",
  "regularMarketPreviousClose",
];

function b3ToYahooSymbol(ticker) {
  return `${String(ticker).trim().toUpperCase()}.SA`;
}

function yahooSymbolToB3(symbol) {
  return String(symbol).replace(/\.SA$/i, "");
}

/**
 * Abertura efetiva: Yahoo costuma enviar regularMarketOpen = 0 fora do pregão para FIIs BR.
 */
function resolveReferencePrice(quote) {
  const open = quote.regularMarketOpen;
  const prev = quote.regularMarketPreviousClose;
  if (typeof open === "number" && open > 0) return open;
  if (typeof prev === "number" && prev > 0) return prev;
  return null;
}

function formatMoney(value) {
  return `R$ ${Number(value).toFixed(2)}`;
}

function formatVariationLine(diff, variationPct) {
  const emoji = variationPct >= 0 ? "🟢" : "🔴";
  return `Variação: ${emoji} ${formatMoney(diff)} (${variationPct.toFixed(2)}%)\n\n`;
}

/**
 * Uma única requisição para todos os ativos (menos latência que N chamadas HTTP).
 */
async function fetchQuotes(tickers) {
  const symbols = tickers.map(b3ToYahooSymbol);
  const quotes = await yahooFinance.quote(symbols, { fields: QUOTE_FIELDS });
  const list = Array.isArray(quotes) ? quotes : [quotes];
  const byTicker = new Map();
  for (const q of list) {
    if (q && q.symbol) byTicker.set(yahooSymbolToB3(q.symbol), q);
  }
  return tickers.map((ticker) => ({
    ticker,
    quote: byTicker.get(ticker) ?? null,
  }));
}

function buildTickerBlock(ticker, quote) {
  const price = quote.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return `${ticker}: ❌ sem cotação\n\n`;
  }
  const open = resolveReferencePrice(quote);
  if (open == null || open <= 0) {
    return `${ticker}: ❌ referência inválida\n\n`;
  }
  const diff = price - open;
  const variationPct = (diff / open) * 100;
  return (
    `${ticker}\n` +
    `Abertura: ${formatMoney(open)}\n` +
    `Atual: ${formatMoney(price)}\n` +
    formatVariationLine(diff, variationPct)
  );
}

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

async function generateReport(type) {
  const todos = GRUPOS.flatMap((g) => g.tickers);
  let msg = `📊 Relatório B3 (${type})\n\n`;
  try {
    const rows = await fetchQuotes(todos);
    const porTicker = new Map(rows.map((r) => [r.ticker, r.quote]));
    for (const { label, tickers } of GRUPOS) {
      msg += `— ${label} —\n\n`;
      for (const ticker of tickers) {
        const quote = porTicker.get(ticker);
        if (quote) {
          msg += buildTickerBlock(ticker, quote);
        } else {
          msg += `${ticker}: ❌ não encontrado\n\n`;
        }
      }
    }
    await sendTelegram(msg);
  } catch (err) {
    const detail = err.response?.data ?? err.message;
    console.error("Erro ao gerar relatório:", detail);
  }
}

function scheduleReports() {
  cron.schedule("0 9 * * 1-5", () => generateReport("Pré-abertura"));
  cron.schedule("0 11 * * 1-5", () => generateReport("Pós-abertura"));
  cron.schedule("0 21 * * 1-5", () => generateReport("Fechamento do dia"));
}

function main() {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error("Defina TELEGRAM_TOKEN e CHAT_ID no ambiente.");
    process.exitCode = 1;
    return;
  }
  scheduleReports();
  generateReport("Teste inicial");
}

// Servidor Web simples para manter a Nuvem ativa
const express = require("express");
const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("B3 Tracker rodando ativamente!");
});

app.listen(PORT, () => {
  console.log(`Servidor de monitoramento ativo na porta ${PORT}`);
});

main();
