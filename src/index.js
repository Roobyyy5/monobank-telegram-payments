// Demo: /buy in the bot creates an order with a unique amount; when that exact
// amount arrives on the Monobank account, the bot confirms the payment.
//   node --env-file=.env src/index.js

import http from "node:http";
import { storeFromEnv } from "./store.js";
import { createPendingOrder, formatUAH } from "./orders.js";
import { handleMonoWebhook } from "./webhook.js";
import { telegram } from "./telegram.js";

const { TELEGRAM_BOT_TOKEN, MONO_WEBHOOK_SECRET, MONO_ACCOUNT_ID = "", CARD_NUMBER = "", PRICE_UAH = "100", PORT = "3000" } = process.env;
if (!TELEGRAM_BOT_TOKEN || !MONO_WEBHOOK_SECRET) {
  console.error("Set TELEGRAM_BOT_TOKEN and MONO_WEBHOOK_SECRET (see .env.example)");
  process.exit(1);
}

const store = storeFromEnv();
const bot = telegram(TELEGRAM_BOT_TOKEN);
const allowedAccounts = MONO_ACCOUNT_ID.split(",").map((s) => s.trim()).filter(Boolean);

// Telegram side: /buy -> invoice with a unique amount.
bot.poll(async (message) => {
  const chatId = message.chat.id;
  if (message.text !== "/buy") {
    await bot.sendMessage(chatId, "Надішліть /buy, щоб отримати рахунок.");
    return;
  }
  const amount = await createPendingOrder(store, Number(PRICE_UAH), { chatId, item: "Demo item" });
  if (amount === null) {
    await bot.sendMessage(chatId, "Забагато відкритих замовлень, спробуйте за кілька хвилин.");
    return;
  }
  await bot.sendMessage(
    chatId,
    `Переказ рівно <b>${formatUAH(amount)} грн</b> на картку <code>${CARD_NUMBER}</code>.\n` +
      "Сума з копійками — це номер вашого замовлення, тож переказуйте її точно.",
  );
});

// Monobank side: webhook confirms the order.
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/mono-webhook") {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {}

    try {
      const result = await handleMonoWebhook(
        { method: req.method, query: Object.fromEntries(url.searchParams), body },
        { store, secret: MONO_WEBHOOK_SECRET, allowedAccounts },
      );
      if (result.paid) {
        const { order, amountKopecks } = result.paid;
        await bot.sendMessage(order.chatId, `Оплату ${formatUAH(amountKopecks)} грн отримано, дякуємо!`);
        console.log(`paid: ${formatUAH(amountKopecks)} UAH, chat ${order.chatId}`);
      }
      res.writeHead(result.status).end("ok");
    } catch (err) {
      // Log, but still answer 200 so Monobank doesn't keep retrying.
      console.error("webhook error:", err);
      res.writeHead(200).end("ok");
    }
  })
  .listen(Number(PORT), () => console.log(`webhook on :${PORT}/mono-webhook, bot polling`));
