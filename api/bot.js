// ============================================================================
// 👑 24/7 CLOUD TELEGRAM BOT WEBHOOK & MULTI-BOT ENGINE (api/bot.js) 👑
// Hosted on: https://kumartelegrambot.vercel.app/api/bot
// Database:  https://kurmuryatelegrambot-default-rtdb.firebaseio.com
// Runs 24/7 Non-Stop via Telegram Webhooks (Even when App & Phone are OFF!)
// ============================================================================

const FIREBASE_DB_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const SMM_PANEL_API_URL = "https://kumartelegrambot.vercel.app/api/panel";
const WEBHOOK_BASE_URL = "https://kumartelegrambot.vercel.app/api/bot";
const MASTER_PIN = "252010";

// ============================================================================
// 1. FIREBASE REALTIME DATABASE HELPERS
// ============================================================================
async function fbGet(path) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fbPut(path, data) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fbPatch(path, data) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fbDelete(path) {
  try {
    await fetch(`${FIREBASE_DB_URL}/${path}.json`, { method: "DELETE" });
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// 2. TELEGRAM BOT API HELPERS
// ============================================================================
async function tgApi(token, method, payload = {}) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

async function sendBotMessage(token, chatId, htmlText, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return await tgApi(token, "sendMessage", payload);
}

async function sendBotPhoto(token, chatId, photoUrlOrFileId, captionHtml, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    photo: photoUrlOrFileId,
    caption: captionHtml,
    parse_mode: "HTML"
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await tgApi(token, "sendPhoto", payload);
  if (!res || !res.ok) {
    return await sendBotMessage(token, chatId, captionHtml, replyMarkup);
  }
  return res;
}

function fmtMoney(val) {
  const n = Number(val || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
}

// ============================================================================
// 3. KEYBOARD DECKS (EXACT 8-BUTTON PHOTO UI + REACTION/POLL + ADMIN PANEL)
// ============================================================================
function getMainPhotoKeyboard(isAdmin) {
  const rows = [
    [{ text: "👁️ Order View" }, { text: "🔍 Order Status" }],
    [{ text: "👤 My Account" }, { text: "🎁 Daily Bonus" }],
    [{ text: "👥 Refer & Earn" }, { text: "🎟️ Redeem Code" }],
    [{ text: "💳 Top Up" }, { text: "ℹ️ Help / Support" }]
  ];
  if (isAdmin) {
    rows.push([{ text: "👑 Admin Panel" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}

function getOrderSubKeyboard(unlockPrice) {
  return {
    keyboard: [
      [{ text: "❤️ Channel Reaction" }, { text: "📊 Vote Poll" }],
      [
        { text: `🔓 Set / Unlock Channel (₹${fmtMoney(unlockPrice)})` },
        { text: "📋 My Unlocked Channels" }
      ],
      [{ text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function getAdminKeyboard() {
  return {
    keyboard: [
      [{ text: "📢 Add Public Channel" }, { text: "🔒 Add Private Channel" }],
      [{ text: "🗑️ Remove Force Channel" }, { text: "📋 Force Channel List" }],
      [{ text: "💲 Set Channel ₹ Price" }, { text: "👥 Set Refer Amount" }],
      [{ text: "🎁 Set Daily Bonus" }, { text: "🎟️ Create Redeem Code" }],
      [{ text: "💳 Set QR & UPI ID" }, { text: "💰 Add / Cut User ₹" }],
      [{ text: "📢 Broadcast All" }, { text: "📊 Bot Stats" }],
      [{ text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function getCancelKeyboard() {
  return {
    keyboard: [[{ text: "❌ Cancel" }]],
    resize_keyboard: true
  };
}

function getEmojiKeyboard() {
  return {
    keyboard: [
      [{ text: "🔥" }, { text: "❤️" }, { text: "🎉" }, { text: "👍" }],
      [{ text: "⚡" }, { text: "💯" }, { text: "🤩" }, { text: "👏" }],
      [{ text: "RANDOM" }, { text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

// ============================================================================
// 4. EXTRACT CHANNEL KEY & CHECK UNLOCK STATUS
// ============================================================================
function extractChannelKey(input) {
  if (!input) return "";
  const clean = String(input).trim();
  if (clean.includes("t.me/c/")) {
    const after = clean.split("t.me/c/")[1] || "";
    const parts = after.split("/");
    if (parts[0]) return "-100" + parts[0].replace(/\D/g, "");
  }
  if (clean.includes("t.me/")) {
    const after = clean.split("t.me/")[1] || "";
    const parts = after.split("/");
    if (parts[0]) {
      const ch = parts[0].replace("@", "").trim();
      if (!ch.startsWith("+") && ch.toLowerCase() !== "joinchat") {
        return "@" + ch.toLowerCase();
      }
    }
  }
  if (clean.startsWith("@") && clean.length > 2) {
    return clean.split(/\s+/)[0].toLowerCase();
  }
  if (/^[a-zA-Z0-9_]{4,}$/.test(clean)) {
    return "@" + clean.toLowerCase();
  }
  return "";
}

function isChannelUnlocked(userProf, chKey) {
  if (!chKey || !userProf) return false;
  const list = Array.isArray(userProf.unlockedChannels) ? userProf.unlockedChannels : [];
  return list.some((item) => String(item).toLowerCase() === String(chKey).toLowerCase());
}

// ============================================================================
// 5. LIVE FORCE-JOIN CHECKER (PUBLIC & PRIVATE CHANNELS)
// ============================================================================
async function verifyForceJoin(token, botRecord, userId, adminId) {
  if (String(userId) === String(adminId)) return true;
  const forceChannels = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels : [];
  if (forceChannels.length === 0) return true;

  const missing = [];
  for (const ch of forceChannels) {
    if (!ch || !ch.chatId) continue;
    const res = await tgApi(token, "getChatMember", {
      chat_id: ch.chatId,
      user_id: Number(userId)
    });
    if (res && res.ok && res.result) {
      const st = res.result.status || "left";
      const joined =
        st === "creator" ||
        st === "administrator" ||
        st === "member" ||
        (st === "restricted" && res.result.is_member === true);
      if (!joined) missing.push(ch);
    }
  }

  if (missing.length > 0) {
    const inline_keyboard = missing.map((ch, idx) => [
      {
        text: ch.title || `📢 Join Channel #${idx + 1}`,
        url: ch.inviteLink || "https://t.me/"
      }
    ]);
    inline_keyboard.push([{ text: "✅ Joined / Verify Now", callback_data: "VERIFY_FORCE_JOIN" }]);

    await sendBotMessage(
      token,
      userId,
      "⚠️ <b>MANDATORY CHANNEL JOIN GATE</b>\n\n" +
        "To use this bot (or because you left an official channel), you must join all required channels below first!\n\n" +
        "👇 <b>Join all channels & tap '✅ Joined / Verify Now':</b>",
      { inline_keyboard }
    );
    return false;
  }
  return true;
}

// ============================================================================
// 6. MAIN VERCEL SERVERLESS HANDLER
// ============================================================================
export default async function handler(req, res) {
  // Enable CORS for Website & Android App
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const query = req.query || {};
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    // ------------------------------------------------------------------------
    // A. IF REQUEST HAS ?botId=... -> IT IS A 24/7 TELEGRAM WEBHOOK UPDATE!
    // ------------------------------------------------------------------------
    if (query.botId && (body.message || body.callback_query)) {
      await handleTelegramWebhookUpdate(String(query.botId), body);
      return res.status(200).json({ ok: true });
    }

    // ------------------------------------------------------------------------
    // B. MANAGEMENT API CALLS FROM WEBSITE OR ANDROID APP (Channel.java)
    // ------------------------------------------------------------------------
    const action = body.action || query.action || "";

    // 1. Connect & Register a 24/7 Bot via Webhook
    if (action === "connect_bot") {
      const token = String(body.token || "").trim();
      const adminId = String(body.adminId || "").replace(/\D/g, "");
      const unlockPrice = Math.max(0.1, Number(body.channelUnlockPrice || 1));

      if (!token.includes(":") || !adminId) {
        return res.status(200).json({
          success: false,
          error: "Please provide a valid Bot Token and Admin Telegram ID!"
        });
      }

      const meRes = await tgApi(token, "getMe");
      if (!meRes || !meRes.ok) {
        return res.status(200).json({
          success: false,
          error: meRes?.description || "Invalid Telegram Bot Token!"
        });
      }

      const botInfo = meRes.result;
      const botId = String(botInfo.id);
      const botName = botInfo.first_name || "Telegram Bot";
      const botUsername = botInfo.username || "bot";

      // Set 24/7 Telegram Webhook to this Vercel API!
      const webhookUrl = `${WEBHOOK_BASE_URL}?botId=${botId}`;
      const whRes = await tgApi(token, "setWebhook", {
        url: webhookUrl,
        drop_pending_updates: false
      });

      if (!whRes || !whRes.ok) {
        return res.status(200).json({
          success: false,
          error: "Failed to set 24/7 Webhook: " + (whRes?.description || "Unknown error")
        });
      }

      // Load existing bot data from Firebase if any
      let existing = await fbGet(`unlimited_bots/${botId}`);
      if (!existing || typeof existing !== "object") existing = {};

      const settings = existing.settings || {
        channelUnlockPrice: unlockPrice,
        referBonus: 1,
        dailyBonus: 0.5,
        upiId: "Set UPI in Admin Panel",
        qrPhoto: ""
      };
      settings.channelUnlockPrice = unlockPrice;

      const botRecord = {
        ...existing,
        botId,
        token,
        botName,
        botUsername,
        adminId,
        webhookUrl,
        isRunning: true,
        updatedAt: new Date().toISOString(),
        settings,
        forceChannels: Array.isArray(existing.forceChannels) ? existing.forceChannels : []
      };

      await fbPut(`unlimited_bots/${botId}`, botRecord);

      // Send live confirmation message to Admin on Telegram
      await sendBotMessage(
        token,
        adminId,
        `👑 <b>24/7 CLOUD WEBHOOK ACTIVATED!</b>\n\n` +
          `🤖 <b>Bot:</b> ${botName} (@${botUsername})\n` +
          `🆔 <b>Admin ID:</b> <code>${adminId}</code>\n` +
          `🔓 <b>Channel Unlock Price:</b> <code>₹${fmtMoney(unlockPrice)} / Channel</code>\n` +
          `☁️ <b>24/7 Status:</b> <code>🟢 ALWAYS ONLINE (Vercel + Firebase)</code>\n\n` +
          `<i>Even if you close the App or turn off your phone, this bot will run 24/7 non-stop!</i>\n` +
          `👇 Send <b>/start</b> to open the Photo Menu & <b>👑 Admin Panel</b>!`,
        getMainPhotoKeyboard(true)
      );

      return res.status(200).json({
        success: true,
        botId,
        botName,
        botUsername,
        adminId,
        webhookUrl
      });
    }

    // 2. List All Connected 24/7 Bots
    if (action === "list_bots") {
      const allBots = (await fbGet("unlimited_bots")) || {};
      return res.status(200).json({ success: true, bots: allBots });
    }

    // 3. Update Bot Settings (Prices, UPI, QR, Admin ID)
    if (action === "update_settings") {
      const botId = String(body.botId || "");
      const botRecord = await fbGet(`unlimited_bots/${botId}`);
      if (!botRecord) return res.status(200).json({ success: false, error: "Bot not found" });

      if (body.adminId) botRecord.adminId = String(body.adminId).replace(/\D/g, "");
      const s = botRecord.settings || {};
      if (body.channelUnlockPrice !== undefined) s.channelUnlockPrice = Number(body.channelUnlockPrice);
      if (body.referBonus !== undefined) s.referBonus = Number(body.referBonus);
      if (body.dailyBonus !== undefined) s.dailyBonus = Number(body.dailyBonus);
      if (body.upiId !== undefined) s.upiId = String(body.upiId).trim();
      if (body.qrPhoto !== undefined) s.qrPhoto = String(body.qrPhoto).trim();
      botRecord.settings = s;

      await fbPut(`unlimited_bots/${botId}`, botRecord);
      return res.status(200).json({ success: true });
    }

    // 4. Add Force-Join Channel (Public or Private)
    if (action === "add_force_channel") {
      const botId = String(body.botId || "");
      const botRecord = await fbGet(`unlimited_bots/${botId}`);
      if (!botRecord) return res.status(200).json({ success: false, error: "Bot not found" });

      let chatId = String(body.chatId || "").trim();
      let inviteLink = String(body.inviteLink || "").trim();
      let title = String(body.title || "📢 Join Official Channel").trim();

      const isPrivate = chatId.startsWith("-100") || inviteLink.includes("+") || inviteLink.includes("joinchat");
      if (!isPrivate && !chatId.startsWith("@") && !chatId.startsWith("-")) {
        chatId = "@" + chatId;
      }
      if (!inviteLink) {
        inviteLink = "https://t.me/" + chatId.replace("@", "");
      }

      const arr = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels : [];
      arr.push({
        type: isPrivate ? "PRIVATE" : "PUBLIC",
        chatId,
        inviteLink,
        title
      });

      await fbPatch(`unlimited_bots/${botId}`, { forceChannels: arr });
      return res.status(200).json({ success: true, forceChannels: arr });
    }

    // 5. Clear Force-Join Channels
    if (action === "clear_force_channels") {
      const botId = String(body.botId || "");
      await fbPatch(`unlimited_bots/${botId}`, { forceChannels: [] });
      return res.status(200).json({ success: true });
    }

    // 6. Pause / Resume 24/7 Bot
    if (action === "toggle_bot") {
      const botId = String(body.botId || "");
      const botRecord = await fbGet(`unlimited_bots/${botId}`);
      if (!botRecord) return res.status(200).json({ success: false, error: "Bot not found" });

      const nextState = !botRecord.isRunning;
      if (nextState) {
        await tgApi(botRecord.token, "setWebhook", { url: `${WEBHOOK_BASE_URL}?botId=${botId}` });
      } else {
        await tgApi(botRecord.token, "deleteWebhook");
      }
      await fbPatch(`unlimited_bots/${botId}`, { isRunning: nextState });
      return res.status(200).json({ success: true, isRunning: nextState });
    }

    // 7. Delete Bot
    if (action === "delete_bot") {
      const botId = String(body.botId || "");
      const botRecord = await fbGet(`unlimited_bots/${botId}`);
      if (botRecord && botRecord.token) {
        await tgApi(botRecord.token, "deleteWebhook");
      }
      await fbDelete(`unlimited_bots/${botId}`);
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({
      ok: true,
      service: "Kurmurya 24/7 Cloud Telegram Bot Webhook API",
      status: "ONLINE"
    });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}

// ============================================================================
// 7. 24/7 TELEGRAM WEBHOOK UPDATE ENGINE (RUNS IN CLOUD!)
// ============================================================================
async function handleTelegramWebhookUpdate(botId, update) {
  const botRecord = await fbGet(`unlimited_bots/${botId}`);
  if (!botRecord || !botRecord.token || botRecord.isRunning === false) return;

  const token = botRecord.token;
  const adminId = String(botRecord.adminId || "");
  const settings = botRecord.settings || {};
  const chUnlockPrice = Number(settings.channelUnlockPrice || 1);
  const referBonus = Number(settings.referBonus || 1);
  const dailyBonus = Number(settings.dailyBonus || 0.5);

  // --------------------------------------------------------------------------
  // A. HANDLE INLINE BUTTON CALLBACKS (VERIFY JOIN, UNLOCK CH, TOPUP, REPLY)
  // --------------------------------------------------------------------------
  if (update.callback_query) {
    const cb = update.callback_query;
    const cbId = cb.id;
    const data = String(cb.data || "");
    const from = cb.from;
    const clickerId = String(from.id);
    const firstName = from.first_name || "User";
    const isAdmin = clickerId === adminId;

    if (data === "VERIFY_FORCE_JOIN") {
      const joined = await verifyForceJoin(token, botRecord, clickerId, adminId);
      if (joined) {
        await tgApi(token, "answerCallbackQuery", {
          callback_query_id: cbId,
          text: "🎉 Verification Successful! Welcome!",
          show_alert: true
        });
        await sendBotMessage(
          token,
          clickerId,
          `✅ <b>Channel Membership Verified!</b>\nWelcome, <b>${firstName}</b>! Choose an option from the menu below:`,
          getMainPhotoKeyboard(isAdmin)
        );
      } else {
        await tgApi(token, "answerCallbackQuery", {
          callback_query_id: cbId,
          text: "❌ Please join all required channels first!",
          show_alert: true
        });
      }
      return;
    }

    if (data.startsWith("UNLOCK_CH|")) {
      const chKey = data.substring("UNLOCK_CH|".length);
      await tgApi(token, "answerCallbackQuery", { callback_query_id: cbId, text: "Processing channel unlock..." });
      await unlockChannelForUser(botId, token, botRecord, clickerId, chKey, isAdmin);
      return;
    }

    if (data.startsWith("REPLY_USER|") && isAdmin) {
      const targetUserId = data.substring("REPLY_USER|".length);
      const adminProf = await getOrCreateUser(botId, botRecord, adminId, "Admin", "");
      adminProf.step = "admin_reply_support_user";
      adminProf.tempSupportTargetId = targetUserId;
      await fbPut(`unlimited_bots/${botId}/users/${adminId}`, adminProf);

      await tgApi(token, "answerCallbackQuery", { callback_query_id: cbId, text: "Send your reply message now" });
      await sendBotMessage(
        token,
        adminId,
        `↩️ <b>REPLYING TO USER:</b> <code>${targetUserId}</code>\n\n👇 <b>Type and send your reply message now:</b>`,
        getCancelKeyboard()
      );
      return;
    }

    if ((data.startsWith("TOPUP_OK|") || data.startsWith("TOPUP_NO|")) && isAdmin) {
      const approve = data.startsWith("TOPUP_OK|");
      const reqId = data.substring(9);
      const reqObj = await fbGet(`unlimited_bots/${botId}/topupRequests/${reqId}`);
      if (!reqObj || reqObj.status !== "PENDING") {
        await tgApi(token, "answerCallbackQuery", {
          callback_query_id: cbId,
          text: "⚠️ Request already processed!",
          show_alert: true
        });
        return;
      }

      const buyerId = String(reqObj.userId);
      const amount = Number(reqObj.amount || 0);
      const utr = String(reqObj.utr || "");

      if (approve) {
        reqObj.status = "APPROVED";
        await fbPut(`unlimited_bots/${botId}/topupRequests/${reqId}`, reqObj);

        const buyerProf = await getOrCreateUser(botId, botRecord, buyerId, reqObj.userName || "User", "");
        buyerProf.balance = Number(buyerProf.balance || 0) + amount;
        await fbPut(`unlimited_bots/${botId}/users/${buyerId}`, buyerProf);

        await tgApi(token, "answerCallbackQuery", {
          callback_query_id: cbId,
          text: `✅ Approved +₹${fmtMoney(amount)}`
        });
        await sendBotMessage(
          token,
          buyerId,
          `🎉 <b>TOP-UP APPROVED!</b>\n\n` +
            `💳 <b>Amount Credited:</b> <code>+₹${fmtMoney(amount)}</code>\n` +
            `🧾 <b>UTR / Ref:</b> <code>${utr}</code>\n` +
            `💰 <b>New Wallet Balance:</b> <code>₹${fmtMoney(buyerProf.balance)}</code>`
        );
        await sendBotMessage(
          token,
          adminId,
          `✅ <b>Top-Up (${reqId}) Approved!</b> Added <code>+₹${fmtMoney(amount)}</code> to User <code>${buyerId}</code>.`,
          getAdminKeyboard()
        );
      } else {
        reqObj.status = "REJECTED";
        await fbPut(`unlimited_bots/${botId}/topupRequests/${reqId}`, reqObj);
        await tgApi(token, "answerCallbackQuery", { callback_query_id: cbId, text: "❌ Top-Up Rejected" });
        await sendBotMessage(
          token,
          buyerId,
          `❌ <b>TOP-UP REQUEST REJECTED</b>\n\n` +
            `🧾 <b>UTR:</b> <code>${utr}</code>\n` +
            `💰 <b>Amount:</b> <code>₹${fmtMoney(amount)}</code>\n` +
            `Contact <b>ℹ️ Help / Support</b> if needed.`
        );
        await sendBotMessage(token, adminId, `❌ <b>Top-Up (${reqId}) Rejected.</b>`, getAdminKeyboard());
      }
      return;
    }
    return;
  }

  // --------------------------------------------------------------------------
  // B. HANDLE INCOMING TEXT & PHOTO MESSAGES
  // --------------------------------------------------------------------------
  const msg = update.message;
  if (!msg || !msg.from) return;

  const userId = String(msg.from.id);
  const firstName = msg.from.first_name || "User";
  const username = msg.from.username || "";
  const text = String(msg.text || "").trim();
  const isAdmin = userId === adminId;

  let photoFileId = "";
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    photoFileId = msg.photo[msg.photo.length - 1].file_id || "";
  }

  const existingUsers = botRecord.users || {};
  const isNewUser = !existingUsers[userId];
  const userProf = await getOrCreateUser(botId, botRecord, userId, firstName, username);

  if (isNewUser && text.startsWith("/start ")) {
    const parts = text.split(/\s+/);
    if (parts[1] && parts[1].startsWith("REF_")) {
      const invId = parts[1].replace("REF_", "").trim();
      if (invId && invId !== userId) {
        userProf.referredBy = invId;
        await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      }
    }
  }

  // 1. LIVE FORCE-JOIN CHANNEL CHECK ON EVERY MESSAGE
  const joinedAll = await verifyForceJoin(token, botRecord, userId, adminId);
  if (!joinedAll) return;

  // Credit referral bonus once user passes Force-Join check
  if (userProf.referredBy && !userProf.referralCredited) {
    userProf.referralCredited = true;
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    const inviter = await fbGet(`unlimited_bots/${botId}/users/${userProf.referredBy}`);
    if (inviter) {
      inviter.balance = Number(inviter.balance || 0) + referBonus;
      inviter.referrals = Number(inviter.referrals || 0) + 1;
      await fbPut(`unlimited_bots/${botId}/users/${userProf.referredBy}`, inviter);

      await sendBotMessage(
        token,
        userProf.referredBy,
        `🎉 <b>NEW REFERRAL VERIFIED!</b>\n\n` +
          `👤 <b>User:</b> ${firstName}\n` +
          `🎁 <b>Bonus Earned:</b> <code>+₹${fmtMoney(referBonus)}</code>\n` +
          `💰 <b>Your Balance:</b> <code>₹${fmtMoney(inviter.balance)}</code>`
      );
    }
  }

  // 2. CANCEL / BACK / START COMMANDS
  if (text.toLowerCase() === "❌ cancel" || text.toLowerCase() === "/cancel") {
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(token, userId, "❌ <b>Operation Cancelled.</b>", getMainPhotoKeyboard(isAdmin));
    return;
  }

  if (text === "🔙 Back to Main Menu" || text.startsWith("/start")) {
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    const uCount = Array.isArray(userProf.unlockedChannels) ? userProf.unlockedChannels.length : 0;

    await sendBotMessage(
      token,
      userId,
      `👑 <b>WELCOME TO @${String(botRecord.botUsername || "BOT").toUpperCase()}</b>\n\n` +
        `👤 <b>User:</b> ${firstName} (<code>${userId}</code>)\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount} Channel(s)</code>\n` +
        `🏷️ <b>Channel Unlock Rate:</b> <code>₹${fmtMoney(chUnlockPrice)} / Channel (Unlimited Reactions & Polls!)</code>\n\n` +
        `👇 <b>Select an option from the menu below:</b>`,
      getMainPhotoKeyboard(isAdmin)
    );
    return;
  }

  // ==========================================================================
  // 3. EXACT 8 BUTTONS FROM PHOTO (40630.jpg)
  // ==========================================================================
  if (text === "👁️ Order View") {
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    const uCount = Array.isArray(userProf.unlockedChannels) ? userProf.unlockedChannels.length : 0;

    await sendBotMessage(
      token,
      userId,
      `👁️ <b>ORDER VIEW — REACTION & POLL SUITE</b>\n\n` +
        `💰 <b>Your Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount}</code>\n\n` +
        `📌 <b>Mandatory ₹${fmtMoney(chUnlockPrice)} Channel Rule:</b>\n` +
        `• Set/Unlock your channel once for <b>-₹${fmtMoney(chUnlockPrice)}</b>.\n` +
        `• After unlocking, you can send <b>UNLIMITED ❤️ Channel Reactions & 📊 Poll Votes</b> to that channel for FREE!\n` +
        `• Until you pay ₹${fmtMoney(chUnlockPrice)} for a channel, no reactions or poll votes will go to it.\n\n` +
        `👇 <b>Select a service below:</b>`,
      getOrderSubKeyboard(chUnlockPrice)
    );
    return;
  }

  if (text.startsWith("🔓 Set / Unlock Channel")) {
    userProf.step = "wait_unlock_channel_input";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      `🔓 <b>SET / UNLOCK CHANNEL (₹${fmtMoney(chUnlockPrice)})</b>\n\n` +
        `💰 <b>Your Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>\n` +
        `🏷️ <b>One-Time Charge:</b> <code>-₹${fmtMoney(chUnlockPrice)}</code>\n\n` +
        `👇 <b>Send your Channel @username OR any Post Link from your channel:</b>\n` +
        `• Example: <code>@mychannel</code> or <code>https://t.me/mychannel/105</code>`,
      getCancelKeyboard()
    );
    return;
  }

  if (text === "📋 My Unlocked Channels") {
    const list = Array.isArray(userProf.unlockedChannels) ? userProf.unlockedChannels : [];
    let msgTxt = "📋 <b>MY UNLOCKED CHANNELS</b>\n\n";
    if (list.length === 0) {
      msgTxt += `📭 You haven't unlocked any channel yet!\nTap <b>🔓 Set / Unlock Channel (₹${fmtMoney(chUnlockPrice)})</b> first.`;
    } else {
      list.forEach((ch, i) => {
        msgTxt += `${i + 1}. <code>${ch}</code> — 🟢 <b>UNLIMITED ACTIVE</b>\n`;
      });
    }
    await sendBotMessage(token, userId, msgTxt, getOrderSubKeyboard(chUnlockPrice));
    return;
  }

  if (text === "❤️ Channel Reaction") {
    userProf.step = "wait_reaction_post_link";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      `❤️ <b>ORDER CHANNEL REACTION</b>\n\n` +
        `⚡ <i>Channel must be unlocked (₹${fmtMoney(chUnlockPrice)}) first. Once unlocked, reactions are 100% FREE & Unlimited!</i>\n\n` +
        `👇 <b>STEP 1 OF 2: Send your Channel Post Link:</b>\n` +
        `• Example: <code>https://t.me/mychannel/105</code>`,
      getCancelKeyboard()
    );
    return;
  }

  if (text === "📊 Vote Poll") {
    userProf.step = "wait_poll_post_link";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      `📊 <b>ORDER VOTE POLL</b>\n\n` +
        `⚡ <i>Channel must be unlocked (₹${fmtMoney(chUnlockPrice)}) first. Once unlocked, poll votes are 100% FREE & Unlimited!</i>\n\n` +
        `👇 <b>STEP 1 OF 2: Send your Telegram Poll Post Link:</b>\n` +
        `• Example: <code>https://t.me/mychannel/108</code>`,
      getCancelKeyboard()
    );
    return;
  }

  if (text === "🔍 Order Status") {
    const orders = Array.isArray(userProf.orders) ? userProf.orders : [];
    let out = "🔍 <b>MY ORDER STATUS & HISTORY</b>\n\n";
    if (orders.length === 0) {
      out += "📭 No Reaction or Poll orders yet! Tap <b>👁️ Order View</b> to start.";
    } else {
      orders.slice(0, 10).forEach((o, idx) => {
        out += `<b>[${idx + 1}] ${o.id} — ${o.type}</b>\n ┣ 🎯 <code>${o.link}</code>\n ┗ 📌 Status: ${o.status}\n\n`;
      });
    }
    await sendBotMessage(token, userId, out, getMainPhotoKeyboard(isAdmin));
    return;
  }

  if (text === "👤 My Account") {
    const uCount = Array.isArray(userProf.unlockedChannels) ? userProf.unlockedChannels.length : 0;
    const oCount = Array.isArray(userProf.orders) ? userProf.orders.length : 0;
    await sendBotMessage(
      token,
      userId,
      `👤 <b>MY ACCOUNT PROFILE</b>\n\n` +
        `🆔 <b>User ID:</b> <code>${userId}</code>\n` +
        `👤 <b>Name:</b> ${firstName}\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount} Channel(s)</code>\n` +
        `📦 <b>Total Orders:</b> <code>${oCount} Orders</code>\n` +
        `👥 <b>Referrals:</b> <code>${userProf.referrals || 0} Users</code>`,
      getMainPhotoKeyboard(isAdmin)
    );
    return;
  }

  if (text === "🎁 Daily Bonus") {
    const now = Date.now();
    const last = Number(userProf.lastDaily || 0);
    const dayMs = 24 * 60 * 60 * 1000;
    if (now - last < dayMs) {
      const rem = dayMs - (now - last);
      const hrs = Math.floor(rem / (1000 * 60 * 60));
      const mins = Math.floor((rem % (1000 * 60 * 60)) / (1000 * 60));
      await sendBotMessage(
        token,
        userId,
        `⏳ <b>DAILY BONUS COOLDOWN</b>\n\nNext claim available in: <code>${hrs}h ${mins}m</code>`,
        getMainPhotoKeyboard(isAdmin)
      );
      return;
    }
    userProf.balance = Number(userProf.balance || 0) + dailyBonus;
    userProf.lastDaily = now;
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    await sendBotMessage(
      token,
      userId,
      `🎁 <b>DAILY BONUS CLAIMED!</b>\n\n` +
        `💎 <b>Added:</b> <code>+₹${fmtMoney(dailyBonus)}</code>\n` +
        `💰 <b>New Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>`,
      getMainPhotoKeyboard(isAdmin)
    );
    return;
  }

  if (text === "👥 Refer & Earn") {
    const refLink = `https://t.me/${botRecord.botUsername || "bot"}?start=REF_${userId}`;
    await sendBotMessage(
      token,
      userId,
      `👥 <b>REFER & EARN MONEY</b>\n\n` +
        `🔗 <b>Your Referral Link:</b>\n<code>${refLink}</code>\n\n` +
        `🎁 <b>Per Referral Bonus:</b> <code>+₹${fmtMoney(referBonus)}</code>\n` +
        `👥 <b>Total Referrals:</b> <code>${userProf.referrals || 0} Friends</code>`,
      getMainPhotoKeyboard(isAdmin)
    );
    return;
  }

  if (text === "🎟️ Redeem Code") {
    userProf.step = "wait_redeem_code";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      "🎟️ <b>REDEEM PROMO CODE</b>\n\n👇 <b>Send your Gift / Promo Code below:</b>",
      getCancelKeyboard()
    );
    return;
  }

  if (text === "💳 Top Up") {
    const upiId = settings.upiId || "Not Configured Yet";
    const qrPhoto = settings.qrPhoto || "";
    userProf.step = "wait_topup_amount";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    const caption =
      `💳 <b>TOP UP WALLET BALANCE</b>\n\n` +
      `🏦 <b>UPI ID:</b> <code>${upiId}</code>\n` +
      `🔓 <b>Channel Rate:</b> <code>₹${fmtMoney(chUnlockPrice)} = 1 Channel (Unlimited Reactions & Polls)</code>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 <b>STEP 1 OF 2:</b>\n` +
      `Scan the QR Code or pay to the UPI ID above, then <b>send the Amount (₹) you paid</b> below (e.g. <code>10</code>):`;

    if (qrPhoto) {
      await sendBotPhoto(token, userId, qrPhoto, caption, getCancelKeyboard());
    } else {
      await sendBotMessage(token, userId, caption, getCancelKeyboard());
    }
    return;
  }

  if (text === "ℹ️ Help / Support") {
    userProf.step = "wait_support_message";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      "ℹ️ <b>HELP & SUPPORT DESK</b>\n\n👇 <b>Type and send your message below.</b> Admin will receive your details and reply directly!",
      getCancelKeyboard()
    );
    return;
  }

  // ==========================================================================
  // 4. ADMIN PANEL COMMANDS (FOR ADMIN TELEGRAM ID)
  // ==========================================================================
  if (isAdmin) {
    if (text === "👑 Admin Panel" || text === "/admin") {
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        userId,
        `👑 <b>MASTER ADMIN CONTROL PANEL (24/7 CLOUD)</b>\n\n` +
          `🔓 <b>Channel Unlock Price:</b> <code>₹${fmtMoney(chUnlockPrice)}</code>\n` +
          `👥 <b>Refer Bonus:</b> <code>₹${fmtMoney(referBonus)}</code>\n` +
          `🎁 <b>Daily Bonus:</b> <code>₹${fmtMoney(dailyBonus)}</code>\n` +
          `💳 <b>UPI ID:</b> <code>${settings.upiId || "Not Set"}</code>\n\n` +
          `👇 <b>Select an Admin tool below:</b>`,
        getAdminKeyboard()
      );
      return;
    }

    if (text === "📢 Add Public Channel") {
      userProf.step = "admin_add_public_ch";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        userId,
        "📢 <b>ADD PUBLIC FORCE-JOIN CHANNEL</b>\n\n⚠️ <i>Make sure this Bot is an Admin in your channel!</i>\n👇 <b>Send Public Channel @username (e.g. <code>@mychannel</code>):</b>",
        getCancelKeyboard()
      );
      return;
    }

    if (text === "🔒 Add Private Channel") {
      userProf.step = "admin_add_priv_ch_id";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        userId,
        "🔒 <b>ADD PRIVATE CHANNEL (STEP 1 OF 2)</b>\n\n⚠️ <i>Make sure this Bot is an Admin in your private channel!</i>\n👇 <b>Send Private Channel Chat ID (e.g. <code>-1001234567890</code>):</b>",
        getCancelKeyboard()
      );
      return;
    }

    if (text === "📋 Force Channel List") {
      const fArr = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels : [];
      let out = "📋 <b>ACTIVE FORCE-JOIN CHANNELS</b>\n\n";
      if (fArr.length === 0) out += "📭 No Force-Join channels added.";
      else {
        fArr.forEach((c, i) => {
          out += `${i + 1}. [${c.type}] <code>${c.chatId}</code>\n   🔗 ${c.inviteLink}\n\n`;
        });
      }
      await sendBotMessage(token, userId, out, getAdminKeyboard());
      return;
    }

    if (text === "🗑️ Remove Force Channel") {
      userProf.step = "admin_remove_force_ch";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        userId,
        "🗑️ <b>REMOVE FORCE CHANNEL</b>\n\nSend Channel <code>@username</code>, Chat ID (<code>-100...</code>), or <code>ALL</code>:",
        getCancelKeyboard()
      );
      return;
    }

    if (text === "💲 Set Channel ₹ Price") {
      userProf.step = "admin_set_channel_price";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        userId,
        `💲 <b>SET CHANNEL UNLOCK PRICE (₹)</b>\nCurrent: <code>₹${fmtMoney(chUnlockPrice)}</code>\n👇 <b>Send new ₹ price per channel (e.g. <code>1</code>):</b>`,
        getCancelKeyboard()
      );
      return;
    }

    if (text === "👥 Set Refer Amount") {
      userProf.step = "admin_set_refer_amt";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, userId, "👥 <b>Send new Referral Bonus amount in ₹:</b>", getCancelKeyboard());
      return;
    }

    if (text === "🎁 Set Daily Bonus") {
      userProf.step = "admin_set_daily_amt";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, userId, "🎁 <b>Send new Daily Bonus amount in ₹:</b>", getCancelKeyboard());
      return;
    }

    if (text === "🎟️ Create Redeem Code") {
      userProf.step = "admin_create_code_name";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, userId, "🎟️ <b>STEP 1 OF 3: Send Redeem Code Name (e.g. <code>KUMAR10</code>):</b>", getCancelKeyboard());
      return;
    }

    if (text === "💳 Set QR & UPI ID") {
      userProf.step = "admin_set_upi_id";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, userId, "💳 <b>STEP 1 OF 2: Send your UPI ID (e.g. <code>name@upi</code>):</b>", getCancelKeyboard());
      return;
    }

    if (text === "💰 Add / Cut User ₹") {
      userProf.step = "admin_mod_bal_uid";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, userId, "💰 <b>STEP 1 OF 2: Send Target User's Telegram ID:</b>", getCancelKeyboard());
      return;
    }

    if (text === "📢 Broadcast All") {
      userProf.step = "admin_broadcast_msg";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, userId, "📢 <b>Send the message to Broadcast to all bot users:</b>", getCancelKeyboard());
      return;
    }

    if (text === "📊 Bot Stats") {
      const uTotal = Object.keys(botRecord.users || {}).length;
      const oTotal = Number(botRecord.totalOrders || 0);
      const fTotal = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels.length : 0;
      await sendBotMessage(
        token,
        userId,
        `📊 <b>24/7 CLOUD BOT STATS</b>\n\n` +
          `👥 <b>Total Users:</b> <code>${uTotal}</code>\n` +
          `📦 <b>Total Orders:</b> <code>${oTotal}</code>\n` +
          `📢 <b>Force Channels:</b> <code>${fTotal}</code>\n` +
          `🔓 <b>Channel Unlock Rate:</b> <code>₹${fmtMoney(chUnlockPrice)}</code>`,
        getAdminKeyboard()
      );
      return;
    }
  }

  // ==========================================================================
  // 5. MULTI-STEP WORKFLOWS (USER & ADMIN)
  // ==========================================================================
  const step = userProf.step || "";

  if (step === "wait_unlock_channel_input") {
    const chKey = extractChannelKey(text);
    if (!chKey) {
      await sendBotMessage(
        token,
        userId,
        "❌ <b>Invalid Channel!</b> Send a valid <code>@username</code> or Post Link:",
        getCancelKeyboard()
      );
      return;
    }
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await unlockChannelForUser(botId, token, botRecord, userId, chKey, isAdmin);
    return;
  }

  if (step === "wait_reaction_post_link") {
    const chKey = extractChannelKey(text);
    if (!chKey || !text.includes("t.me/")) {
      await sendBotMessage(token, userId, "❌ <b>Invalid Post Link!</b> Example: <code>https://t.me/mychannel/105</code>", getCancelKeyboard());
      return;
    }
    if (!isChannelUnlocked(userProf, chKey)) {
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendChannelLockedPrompt(token, userId, chKey, chUnlockPrice, userProf.balance);
      return;
    }
    userProf.tempOrderLink = text;
    userProf.tempOrderChannel = chKey;
    userProf.step = "wait_reaction_emoji";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      `❤️ <b>CHANNEL UNLOCKED (${chKey}) — STEP 2 OF 2</b>\n\n👇 <b>Select Emoji Reaction below:</b>`,
      getEmojiKeyboard()
    );
    return;
  }

  if (step === "wait_reaction_emoji") {
    const postLink = userProf.tempOrderLink || "";
    const chKey = userProf.tempOrderChannel || "";
    const emoji = text || "RANDOM";
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    await executeSmmReactionOrPoll(
      botId,
      token,
      botRecord,
      userProf,
      userId,
      `❤️ Channel Reaction (${emoji})`,
      postLink,
      chKey,
      "send_reaction",
      emoji,
      "",
      chUnlockPrice
    );
    return;
  }

  if (step === "wait_poll_post_link") {
    const chKey = extractChannelKey(text);
    if (!chKey || !text.includes("t.me/")) {
      await sendBotMessage(token, userId, "❌ <b>Invalid Poll Link!</b> Example: <code>https://t.me/mychannel/108</code>", getCancelKeyboard());
      return;
    }
    if (!isChannelUnlocked(userProf, chKey)) {
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendChannelLockedPrompt(token, userId, chKey, chUnlockPrice, userProf.balance);
      return;
    }
    userProf.tempOrderLink = text;
    userProf.tempOrderChannel = chKey;
    userProf.step = "wait_poll_option_number";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      `📊 <b>CHANNEL UNLOCKED (${chKey}) — STEP 2 OF 2</b>\n\n👇 <b>Send Poll Option Number (e.g. <code>1</code> or <code>2</code>):</b>`,
      getCancelKeyboard()
    );
    return;
  }

  if (step === "wait_poll_option_number") {
    const optNum = text.replace(/\D/g, "");
    if (!optNum) {
      await sendBotMessage(token, userId, "⚠️ Send a valid option number (1, 2, 3...):", getCancelKeyboard());
      return;
    }
    const postLink = userProf.tempOrderLink || "";
    const chKey = userProf.tempOrderChannel || "";
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    await executeSmmReactionOrPoll(
      botId,
      token,
      botRecord,
      userProf,
      userId,
      `📊 Vote Poll (Option #${optNum})`,
      postLink,
      chKey,
      "vote_poll",
      "",
      optNum,
      chUnlockPrice
    );
    return;
  }

  if (step === "wait_redeem_code") {
    const codeKey = text.toUpperCase();
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    const codeObj = await fbGet(`unlimited_bots/${botId}/redeemCodes/${codeKey}`);
    if (!codeObj) {
      await sendBotMessage(token, userId, "❌ <b>Invalid or Expired Redeem Code!</b>", getMainPhotoKeyboard(isAdmin));
      return;
    }
    const claimedBy = Array.isArray(codeObj.claimedBy) ? codeObj.claimedBy : [];
    if (claimedBy.includes(userId)) {
      await sendBotMessage(token, userId, "⚠️ <b>You already redeemed this code!</b>", getMainPhotoKeyboard(isAdmin));
      return;
    }
    if (Number(codeObj.used || 0) >= Number(codeObj.max || 1)) {
      await sendBotMessage(token, userId, "❌ <b>Code claim limit reached!</b>", getMainPhotoKeyboard(isAdmin));
      return;
    }

    claimedBy.push(userId);
    codeObj.claimedBy = claimedBy;
    codeObj.used = Number(codeObj.used || 0) + 1;
    await fbPut(`unlimited_bots/${botId}/redeemCodes/${codeKey}`, codeObj);

    const amt = Number(codeObj.amount || 1);
    userProf.balance = Number(userProf.balance || 0) + amt;
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    await sendBotMessage(
      token,
      userId,
      `🎉 <b>CODE REDEEMED!</b>\n\n💎 <b>Added:</b> <code>+₹${fmtMoney(amt)}</code>\n💰 <b>New Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>`,
      getMainPhotoKeyboard(isAdmin)
    );
    return;
  }

  if (step === "wait_topup_amount") {
    const amt = Number(text);
    if (!amt || amt <= 0) {
      await sendBotMessage(token, userId, "⚠️ Enter a valid ₹ amount (e.g. <code>10</code>):", getCancelKeyboard());
      return;
    }
    userProf.tempTopupAmount = amt;
    userProf.step = "wait_topup_utr";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await sendBotMessage(
      token,
      userId,
      `🧾 <b>STEP 2 OF 2: SEND UTR / REF NO</b>\n\n💰 <b>Amount:</b> <code>₹${fmtMoney(amt)}</code>\n👇 <b>Send your 12-Digit UTR / UPI Reference ID:</b>`,
      getCancelKeyboard()
    );
    return;
  }

  if (step === "wait_topup_utr") {
    if (text.length < 4) {
      await sendBotMessage(token, userId, "⚠️ Send a valid UTR / Reference Number:", getCancelKeyboard());
      return;
    }
    const amt = Number(userProf.tempTopupAmount || 1);
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    const reqId = "TOP" + Math.floor(100000 + Math.random() * 900000);
    await fbPut(`unlimited_bots/${botId}/topupRequests/${reqId}`, {
      id: reqId,
      userId,
      userName: firstName,
      amount: amt,
      utr: text,
      status: "PENDING"
    });

    await sendBotMessage(
      token,
      userId,
      `✅ <b>TOP-UP SUBMITTED!</b>\n\n🆔 <b>ID:</b> <code>${reqId}</code>\n💰 <b>Amount:</b> <code>₹${fmtMoney(amt)}</code>\n🧾 <b>UTR:</b> <code>${text}</code>\n\n⏳ <i>Admin will verify & approve shortly!</i>`,
      getMainPhotoKeyboard(isAdmin)
    );

    if (adminId) {
      await sendBotMessage(
        token,
        adminId,
        `💳 <b>NEW TOP-UP REQUEST</b>\n\n` +
          `👤 <b>Name:</b> ${firstName}\n` +
          `🆔 <b>User ID:</b> <code>${userId}</code>\n` +
          `🌐 <b>Username:</b> ${username ? "@" + username : "None"}\n` +
          `💰 <b>Amount:</b> <code>₹${fmtMoney(amt)}</code>\n` +
          `🧾 <b>UTR:</b> <code>${text}</code>`,
        {
          inline_keyboard: [
            [
              { text: `✅ Approve +₹${fmtMoney(amt)}`, callback_data: `TOPUP_OK|${reqId}` },
              { text: "❌ Reject", callback_data: `TOPUP_NO|${reqId}` }
            ]
          ]
        }
      );
    }
    return;
  }

  if (step === "wait_support_message") {
    userProf.step = "";
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

    await sendBotMessage(
      token,
      userId,
      "✅ <b>Your message has been sent to Admin!</b> You will receive a reply here soon.",
      getMainPhotoKeyboard(isAdmin)
    );

    if (adminId) {
      await sendBotMessage(
        token,
        adminId,
        `📩 <b>NEW HELP / SUPPORT MESSAGE</b>\n\n` +
          `👤 <b>User Name:</b> ${firstName}\n` +
          `🆔 <b>User ID:</b> <code>${userId}</code>\n` +
          `🌐 <b>Username:</b> ${username ? "@" + username : "None"}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💬 <b>Message:</b>\n${text}`,
        {
          inline_keyboard: [[{ text: `↩️ Reply to ${firstName}`, callback_data: `REPLY_USER|${userId}` }]]
        }
      );
    }
    return;
  }

  // ---- ADMIN MULTI-STEP HANDLERS ----
  if (isAdmin) {
    if (step === "admin_reply_support_user") {
      const targetUid = userProf.tempSupportTargetId || "";
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      if (targetUid) {
        await sendBotMessage(token, targetUid, `👨‍💻 <b>ADMIN SUPPORT REPLY:</b>\n\n${text}`);
        await sendBotMessage(token, adminId, `✅ <b>Reply sent to User</b> <code>${targetUid}</code>!`, getAdminKeyboard());
      }
      return;
    }

    if (step === "admin_add_public_ch") {
      let cId = text.trim();
      if (!cId.startsWith("@")) cId = "@" + cId.replace("https://t.me/", "").replace("/", "");
      const link = "https://t.me/" + cId.replace("@", "");
      const arr = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels : [];
      arr.push({ type: "PUBLIC", chatId: cId, inviteLink: link, title: `📢 Join ${cId}` });
      await fbPatch(`unlimited_bots/${botId}`, { forceChannels: arr });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, `✅ <b>Public Channel Added:</b> <code>${cId}</code>`, getAdminKeyboard());
      return;
    }

    if (step === "admin_add_priv_ch_id") {
      if (!text.startsWith("-100")) {
        await sendBotMessage(token, adminId, "⚠️ Private Channel ID must start with <code>-100</code>:", getCancelKeyboard());
        return;
      }
      userProf.tempPrivChatId = text;
      userProf.step = "admin_add_priv_ch_link";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, "🔗 <b>STEP 2 OF 2: Send Private Channel Invite Link (https://t.me/+...):</b>", getCancelKeyboard());
      return;
    }

    if (step === "admin_add_priv_ch_link") {
      const cId = userProf.tempPrivChatId || "";
      const arr = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels : [];
      arr.push({ type: "PRIVATE", chatId: cId, inviteLink: text, title: "🔒 Join Private Channel" });
      await fbPatch(`unlimited_bots/${botId}`, { forceChannels: arr });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, `✅ <b>Private Force-Join Channel Added!</b>\nID: <code>${cId}</code>`, getAdminKeyboard());
      return;
    }

    if (step === "admin_remove_force_ch") {
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      if (text.toUpperCase() === "ALL") {
        await fbPatch(`unlimited_bots/${botId}`, { forceChannels: [] });
        await sendBotMessage(token, adminId, "🗑️ <b>All Force-Join Channels Cleared!</b>", getAdminKeyboard());
        return;
      }
      const oldArr = Array.isArray(botRecord.forceChannels) ? botRecord.forceChannels : [];
      const newArr = oldArr.filter((c) => String(c.chatId).toLowerCase() !== text.toLowerCase());
      await fbPatch(`unlimited_bots/${botId}`, { forceChannels: newArr });
      await sendBotMessage(token, adminId, "✅ <b>Force-Join Channel List Updated!</b>", getAdminKeyboard());
      return;
    }

    if (step === "admin_set_channel_price") {
      settings.channelUnlockPrice = Math.max(0.1, Number(text) || 1);
      await fbPatch(`unlimited_bots/${botId}`, { settings });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, `✅ <b>Channel Unlock Price set to: ₹${fmtMoney(settings.channelUnlockPrice)}</b>`, getAdminKeyboard());
      return;
    }

    if (step === "admin_set_refer_amt") {
      settings.referBonus = Math.max(0, Number(text) || 1);
      await fbPatch(`unlimited_bots/${botId}`, { settings });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, `✅ <b>Refer Bonus set to: ₹${fmtMoney(settings.referBonus)}</b>`, getAdminKeyboard());
      return;
    }

    if (step === "admin_set_daily_amt") {
      settings.dailyBonus = Math.max(0, Number(text) || 0.5);
      await fbPatch(`unlimited_bots/${botId}`, { settings });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, `✅ <b>Daily Bonus set to: ₹${fmtMoney(settings.dailyBonus)}</b>`, getAdminKeyboard());
      return;
    }

    if (step === "admin_create_code_name") {
      userProf.tempCodeName = text.toUpperCase();
      userProf.step = "admin_create_code_amt";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, "💎 <b>STEP 2 OF 3: Send ₹ Reward Amount:</b>", getCancelKeyboard());
      return;
    }

    if (step === "admin_create_code_amt") {
      userProf.tempCodeAmt = Number(text) || 1;
      userProf.step = "admin_create_code_max";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, "👥 <b>STEP 3 OF 3: Send Max Users Limit:</b>", getCancelKeyboard());
      return;
    }

    if (step === "admin_create_code_max") {
      const cName = userProf.tempCodeName || "PROMO";
      const cAmt = Number(userProf.tempCodeAmt || 1);
      const cMax = Math.max(1, parseInt(text, 10) || 1);
      await fbPut(`unlimited_bots/${botId}/redeemCodes/${cName}`, {
        code: cName,
        amount: cAmt,
        max: cMax,
        used: 0,
        claimedBy: []
      });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        adminId,
        `🎟️ <b>REDEEM CODE CREATED!</b>\nCode: <code>${cName}</code> | Amount: <code>₹${fmtMoney(cAmt)}</code> | Limit: <code>${cMax}</code>`,
        getAdminKeyboard()
      );
      return;
    }

    if (step === "admin_set_upi_id") {
      settings.upiId = text;
      await fbPatch(`unlimited_bots/${botId}`, { settings });
      userProf.step = "admin_set_qr_photo";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(
        token,
        adminId,
        `✅ <b>UPI ID Saved:</b> <code>${text}</code>\n📸 <b>STEP 2 OF 2: Send QR Code Photo directly in chat (or URL, or type SKIP):</b>`,
        getCancelKeyboard()
      );
      return;
    }

    if (step === "admin_set_qr_photo") {
      if (photoFileId) settings.qrPhoto = photoFileId;
      else if (text.toUpperCase() !== "SKIP") settings.qrPhoto = text;
      await fbPatch(`unlimited_bots/${botId}`, { settings });
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, "✅ <b>QR Code & UPI ID Saved!</b>", getAdminKeyboard());
      return;
    }

    if (step === "admin_mod_bal_uid") {
      userProf.tempModUid = text.replace(/\D/g, "");
      userProf.step = "admin_mod_bal_amt";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      await sendBotMessage(token, adminId, "💰 <b>Send ₹ Amount to Add (e.g. 10) or Cut (e.g. -5):</b>", getCancelKeyboard());
      return;
    }

    if (step === "admin_mod_bal_amt") {
      const targetUid = userProf.tempModUid || "";
      const delta = Number(text) || 0;
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

      const tProf = await getOrCreateUser(botId, botRecord, targetUid, "User", "");
      tProf.balance = Math.max(0, Number(tProf.balance || 0) + delta);
      await fbPut(`unlimited_bots/${botId}/users/${targetUid}`, tProf);

      await sendBotMessage(token, adminId, `✅ User <code>${targetUid}</code> New Balance: <code>₹${fmtMoney(tProf.balance)}</code>`, getAdminKeyboard());
      await sendBotMessage(token, targetUid, `🏦 <b>Admin Updated Your Wallet!</b>\nNew Balance: <code>₹${fmtMoney(tProf.balance)}</code>`);
      return;
    }

    if (step === "admin_broadcast_msg") {
      userProf.step = "";
      await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
      const uMap = botRecord.users || {};
      const ids = Object.keys(uMap);
      for (const uid of ids) {
        await sendBotMessage(token, uid, `📢 <b>ANNOUNCEMENT</b>\n\n${text}`);
      }
      await sendBotMessage(token, adminId, `✅ <b>Broadcast sent to ${ids.length} users!</b>`, getAdminKeyboard());
      return;
    }
  }

  await sendBotMessage(token, userId, "⚡ <b>Choose an option from the menu below:</b>", getMainPhotoKeyboard(isAdmin));
}

// ============================================================================
// 8. CHANNEL UNLOCK (-₹1) & SMM ORDER EXECUTION HELPERS
// ============================================================================
async function getOrCreateUser(botId, botRecord, userId, firstName, username) {
  const users = botRecord.users || {};
  let u = users[userId];
  if (!u) {
    u = {
      id: userId,
      name: firstName || "User",
      username: username || "",
      balance: 0,
      referrals: 0,
      referredBy: "",
      referralCredited: false,
      lastDaily: 0,
      step: "",
      unlockedChannels: [],
      orders: []
    };
    await fbPut(`unlimited_bots/${botId}/users/${userId}`, u);
  }
  return u;
}

async function sendChannelLockedPrompt(token, userId, chKey, unlockPrice, bal) {
  await sendBotMessage(
    token,
    userId,
    `🔒 <b>CHANNEL NOT UNLOCKED YET!</b>\n\n` +
      `📢 <b>Channel:</b> <code>${chKey}</code>\n` +
      `🏷️ <b>One-Time Unlock Price:</b> <code>₹${fmtMoney(unlockPrice)}</code>\n` +
      `💰 <b>Your Balance:</b> <code>₹${fmtMoney(bal)}</code>\n\n` +
      `⚠️ <i>Reactions & Poll Votes will NOT go to ${chKey} until you unlock it for ₹${fmtMoney(unlockPrice)}. Once unlocked, you get UNLIMITED free Reactions & Poll Votes on this channel!</i>`,
    {
      inline_keyboard: [
        [{ text: `🔓 Unlock ${chKey} Now (-₹${fmtMoney(unlockPrice)})`, callback_data: `UNLOCK_CH|${chKey}` }]
      ]
    }
  );
}

async function unlockChannelForUser(botId, token, botRecord, userId, chKey, isAdmin) {
  const settings = botRecord.settings || {};
  const unlockPrice = Number(settings.channelUnlockPrice || 1);
  const userProf = await getOrCreateUser(botId, botRecord, userId, "User", "");

  if (isChannelUnlocked(userProf, chKey)) {
    await sendBotMessage(
      token,
      userId,
      `✅ <b>Channel</b> <code>${chKey}</code> <b>is ALREADY Unlocked!</b>`,
      getOrderSubKeyboard(unlockPrice)
    );
    return;
  }

  const bal = Number(userProf.balance || 0);
  if (bal < unlockPrice) {
    await sendBotMessage(
      token,
      userId,
      `❌ <b>INSUFFICIENT BALANCE!</b>\n\nRequired: <code>₹${fmtMoney(unlockPrice)}</code> | Your Balance: <code>₹${fmtMoney(bal)}</code>\nTap <b>💳 Top Up</b> to add balance!`,
      getMainPhotoKeyboard(isAdmin)
    );
    return;
  }

  userProf.balance = bal - unlockPrice;
  const arr = Array.isArray(userProf.unlockedChannels) ? userProf.unlockedChannels : [];
  arr.push(chKey.toLowerCase());
  userProf.unlockedChannels = arr;
  await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);

  await sendBotMessage(
    token,
    userId,
    `🎉 <b>CHANNEL UNLOCKED PERMANENTLY!</b>\n\n` +
      `📢 <b>Channel:</b> <code>${chKey}</code>\n` +
      `💸 <b>Deducted:</b> <code>-₹${fmtMoney(unlockPrice)}</code>\n` +
      `💰 <b>Remaining Balance:</b> <code>₹${fmtMoney(userProf.balance)}</code>\n\n` +
      `🔥 <b>Now send UNLIMITED ❤️ Channel Reactions & 📊 Poll Votes to</b> <code>${chKey}</code>!`,
    getOrderSubKeyboard(unlockPrice)
  );
}

async function executeSmmReactionOrPoll(
  botId,
  token,
  botRecord,
  userProf,
  userId,
  orderTitle,
  postLink,
  chKey,
  apiAction,
  emoji,
  optionNumber,
  unlockPrice
) {
  await sendBotMessage(
    token,
    userId,
    `⏳ <b>PROCESSING ORDER ON UNLOCKED CHANNEL...</b>\n\n🛒 <b>Service:</b> ${orderTitle}\n📢 <b>Channel:</b> <code>${chKey}</code> (🟢 Unlocked)`,
    getOrderSubKeyboard(unlockPrice)
  );

  try {
    const payload = {
      action: apiAction,
      webPin: MASTER_PIN,
      postLink,
      selectedPhones: ["ALL"]
    };
    if (apiAction === "send_reaction") payload.emoji = emoji;
    if (apiAction === "vote_poll") payload.optionNumber = optionNumber;

    const res = await fetch(SMM_PANEL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const replyStr = data?.reply || "✅ Delivered Successfully!";

    const ordId = "ORD-" + Math.floor(10000 + Math.random() * 90000);
    const orders = Array.isArray(userProf.orders) ? userProf.orders : [];
    orders.unshift({ id: ordId, type: orderTitle, link: postLink, status: "🟢 COMPLETED" });
    userProf.orders = orders.slice(0, 15);

    await fbPut(`unlimited_bots/${botId}/users/${userId}`, userProf);
    await fbPatch(`unlimited_bots/${botId}`, { totalOrders: Number(botRecord.totalOrders || 0) + 1 });

    await sendBotMessage(
      token,
      userId,
      `🎉 <b>ORDER DELIVERED!</b>\n\n` +
        `🆔 <b>Order ID:</b> <code>${ordId}</code>\n` +
        `🛒 <b>Service:</b> ${orderTitle}\n` +
        `📢 <b>Channel:</b> <code>${chKey}</code>\n` +
        `💰 <b>Fee:</b> <code>₹0 (Channel Unlocked!)</code>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n${replyStr}`,
      getOrderSubKeyboard(unlockPrice)
    );
  } catch (e) {
    await sendBotMessage(
      token,
      userId,
      `✅ <b>Order Queued for</b> <code>${postLink}</code>!`,
      getOrderSubKeyboard(unlockPrice)
    );
  }
}
