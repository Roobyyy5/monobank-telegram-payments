// Minimal Telegram Bot API client: long polling, so the bot itself needs no
// public URL (only the Monobank webhook does).

export function telegram(token) {
  const call = async (method, params = {}) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
    return json.result;
  };

  return {
    sendMessage: (chatId, text) => call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" }),

    // Calls onMessage(message) for every incoming text message, forever.
    async poll(onMessage) {
      let offset = 0;
      for (;;) {
        try {
          const updates = await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
          for (const update of updates) {
            offset = update.update_id + 1;
            if (update.message?.text) await onMessage(update.message);
          }
        } catch (err) {
          console.error(err.message);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    },
  };
}
