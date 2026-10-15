// Registers the webhook with Monobank and lists your accounts, so you can put
// the right id into MONO_ACCOUNT_ID. Run once (and again if the URL changes):
//   node --env-file=.env scripts/register-webhook.js https://your-domain.example
//
// MONO_TOKEN is only needed here, not by the running bot.

const { MONO_TOKEN, MONO_WEBHOOK_SECRET } = process.env;
const baseUrl = process.argv[2];
if (!MONO_TOKEN || !MONO_WEBHOOK_SECRET || !baseUrl) {
  console.error("Usage: MONO_TOKEN=... MONO_WEBHOOK_SECRET=... node scripts/register-webhook.js https://your-domain");
  process.exit(1);
}

const headers = { "X-Token": MONO_TOKEN };

const info = await fetch("https://api.monobank.ua/personal/client-info", { headers }).then((r) => r.json());
if (info.errorDescription) throw new Error(info.errorDescription);
console.log("Accounts (use the id of the shop's card in MONO_ACCOUNT_ID):");
for (const a of info.accounts || []) {
  console.log(`  ${a.id}  ${a.type}  ${a.maskedPan?.join(", ") || a.iban}`);
}

const webHookUrl = `${baseUrl.replace(/\/$/, "")}/mono-webhook?key=${encodeURIComponent(MONO_WEBHOOK_SECRET)}`;
const res = await fetch("https://api.monobank.ua/personal/webhook", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ webHookUrl }),
});
console.log(`Webhook registration: HTTP ${res.status} ${await res.text()}`);
