import fetch from "node-fetch";

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1383941638132334694/09WawDIqBATp4tTWa5jkNsnYlHypbuofbzgRRwrMivHR8ZPRGsahNRnYcIg3nr6gs1Hq";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { user_id, nickname, reason } = req.body;

  if (!user_id || !nickname || !reason) {
    return res.status(400).json({ ok: false, error: "Missing user_id, nickname or reason" });
  }

  const discordPayload = {
    content: `🚨 AntiCheat Report 🚨\nUser ID: **${user_id}**\nNickname: **${nickname}**\nReason: **${reason}**`,
  };

  try {
    const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (!discordResponse.ok) {
      const text = await discordResponse.text();
      return res.status(500).json({ ok: false, error: `Discord webhook error: ${text}` });
    }

    return res.status(200).json({ ok: true, message: "Report forwarded to Discord" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
