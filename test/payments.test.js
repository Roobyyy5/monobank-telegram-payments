// node --test
import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/store.js";
import { createPendingOrder, popPendingOrder, MAX_OFFSET_KOPECKS } from "../src/orders.js";
import { handleMonoWebhook } from "../src/webhook.js";

const income = (amount, account = "acc-shop") => ({ data: { account, statementItem: { id: "tx1", amount } } });
const opts = (store) => ({ store, secret: "s3cret", allowedAccounts: ["acc-shop"] });

test("concurrent orders at one price get different amounts", async () => {
  const store = new MemoryStore();
  const amounts = await Promise.all(Array.from({ length: 50 }, (_, i) => createPendingOrder(store, 1490, { i })));
  assert.equal(new Set(amounts).size, 50);
  for (const a of amounts) assert.ok(a >= 149000 && a < 149000 + MAX_OFFSET_KOPECKS);
});

test("returns null when all 100 amounts are taken", async () => {
  const store = new MemoryStore();
  for (let i = 0; i < MAX_OFFSET_KOPECKS; i++) assert.notEqual(await createPendingOrder(store, 10, { i }), null);
  assert.equal(await createPendingOrder(store, 10, { i: "extra" }), null);
});

test("payment confirms the order exactly once", async () => {
  const store = new MemoryStore();
  const amount = await createPendingOrder(store, 250, { chatId: 1 });
  const first = await handleMonoWebhook({ method: "POST", query: { key: "s3cret" }, body: income(amount) }, opts(store));
  const again = await handleMonoWebhook({ method: "POST", query: { key: "s3cret" }, body: income(amount) }, opts(store));
  assert.deepEqual(first.paid.order, { chatId: 1 });
  assert.equal(again.paid, undefined);
  assert.equal(await popPendingOrder(store, amount), null);
});

test("wrong secret, other account, wrong amount and probes confirm nothing", async () => {
  const store = new MemoryStore();
  const amount = await createPendingOrder(store, 250, { chatId: 1 });
  const call = (req) => handleMonoWebhook(req, opts(store));
  assert.equal((await call({ method: "POST", query: { key: "nope" }, body: income(amount) })).status, 401);
  assert.equal((await call({ method: "POST", query: { key: "s3cret" }, body: income(amount, "acc-other") })).paid, undefined);
  assert.equal((await call({ method: "POST", query: { key: "s3cret" }, body: income(amount + 1) })).paid, undefined);
  assert.equal((await call({ method: "POST", query: { key: "s3cret" }, body: income(-amount) })).paid, undefined);
  assert.equal((await call({ method: "GET", query: {}, body: null })).status, 200); // registration probe
  // The order is still open and can be paid.
  assert.ok((await call({ method: "POST", query: { key: "s3cret" }, body: income(amount) })).paid);
});
