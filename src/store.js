// Tiny key-value store with the three operations the payment flow needs:
// SET ... NX EX (reserve), GETDEL (claim once) and INCR (counter).
//
// MemoryStore is enough for one process and for tests. For serverless or
// several instances use UpstashStore (Redis over HTTP, free tier is plenty):
// without a shared store two instances could hand out the same amount.

export class MemoryStore {
  #data = new Map(); // key -> { value, expiresAt }

  #alive(key) {
    const entry = this.#data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.#data.delete(key);
      return undefined;
    }
    return entry;
  }

  async incr(key) {
    const next = Number(this.#alive(key)?.value ?? 0) + 1;
    this.#data.set(key, { value: next });
    return next;
  }

  // Returns true if the key was free and is now set.
  async setNX(key, value, ttlSeconds) {
    if (this.#alive(key)) return false;
    this.#data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  // Returns the value and deletes it in one step, or null.
  async getdel(key) {
    const entry = this.#alive(key);
    if (!entry) return null;
    this.#data.delete(key);
    return entry.value;
  }
}

export class UpstashStore {
  constructor(url, token) {
    this.url = url;
    this.token = token;
  }

  async #cmd(...args) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(args),
    });
    const json = await res.json();
    if (json.error) throw new Error(`Upstash: ${json.error}`);
    return json.result;
  }

  async incr(key) {
    return this.#cmd("INCR", key);
  }

  async setNX(key, value, ttlSeconds) {
    return (await this.#cmd("SET", key, JSON.stringify(value), "EX", ttlSeconds, "NX")) === "OK";
  }

  async getdel(key) {
    const raw = await this.#cmd("GETDEL", key);
    return raw == null ? null : JSON.parse(raw);
  }
}

export function storeFromEnv(env = process.env) {
  return env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
    : new MemoryStore();
}
