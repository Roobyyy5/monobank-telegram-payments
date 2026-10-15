import { timingSafeEqual } from "node:crypto";
import { popPendingOrder } from "./orders.js";

function sameSecret(given, expected) {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Handles one request to the Monobank webhook URL and returns { status, paid }.
// `paid` is { order, amountKopecks } when an order was confirmed.
//
// Monobank personal webhooks are not signed, so the URL carries a secret
// (?key=...) that is checked here. Monobank also probes the URL right after
// registration; anything that isn't an income transaction gets 200 and is
// ignored, otherwise registration fails.
export async function handleMonoWebhook({ method, query, body }, { store, secret, allowedAccounts = [] }) {
  if (method !== "POST") return { status: 200 };
  if (!sameSecret(query.key, secret)) return { status: 401 };

  const item = body?.data?.statementItem;
  if (!item || !Number.isInteger(item.amount) || item.amount <= 0) return { status: 200 };

  // The webhook reports every account of the token owner. Only income on the
  // shop's account may confirm an order, or an unrelated transfer to another
  // card with the same amount would confirm someone else's order.
  if (allowedAccounts.length && !allowedAccounts.includes(body.data.account)) return { status: 200 };

  const order = await popPendingOrder(store, item.amount);
  if (!order) return { status: 200 };
  return { status: 200, paid: { order, amountKopecks: item.amount } };
}
