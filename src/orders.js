// Matching a plain card transfer to an order by its exact amount.
//
// Transfer comments are unreliable (people skip them, some transfer methods
// drop them), so every open order gets a unique amount instead: the price plus
// 0-99 kopecks. The customer pays exactly what the invoice says, and the
// webhook finds the order by that amount.

export const MAX_OFFSET_KOPECKS = 100;
export const ORDER_TTL_SECONDS = 60 * 60 * 24; // unpaid orders release their amount after a day

const orderKey = (kopecks) => `order:${kopecks}`;

// Reserves a unique amount for a new order and returns it in kopecks, or null
// if all 100 amounts around this price are taken by open orders.
//
// The offset comes from a counter, so consecutive orders get different
// kopecks without retries in the common case; SET NX makes the reservation
// atomic, so two concurrent orders can never share an amount.
export async function createPendingOrder(store, priceUAH, order) {
  const baseKopecks = Math.round(priceUAH * 100);
  for (let attempt = 0; attempt < MAX_OFFSET_KOPECKS; attempt++) {
    const seq = await store.incr("order:seq");
    const amountKopecks = baseKopecks + (seq % MAX_OFFSET_KOPECKS);
    if (await store.setNX(orderKey(amountKopecks), order, ORDER_TTL_SECONDS)) return amountKopecks;
  }
  return null;
}

// Claims the order for a received amount. GETDEL is atomic, so if the same
// transaction is delivered twice only the first delivery gets the order.
export async function popPendingOrder(store, amountKopecks) {
  return store.getdel(orderKey(amountKopecks));
}

// 149037 -> "1490.37"
export const formatUAH = (kopecks) => (kopecks / 100).toFixed(2);
