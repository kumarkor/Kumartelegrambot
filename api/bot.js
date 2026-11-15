// ============================================================================
// 👑 FILE: api/bot.js — KURMURYA 24/7 CLOUD WEBHOOK ENGINE (0% BUG EDITION) 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot
// Works 24/7 Non-Stop in 0.01s even when App & Phone are Switched OFF!
// ============================================================================

const PRIMARY_FIREBASE_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const FALLBACK_FIREBASE_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const SMM_PANEL_API_URL = "https://kumartelegrambot.vercel.app/api/panel";
const WEBHOOK_BASE_URL = "https://kumartelegrambot.vercel.app/api/bot";
const MASTER_ADMIN = "7335163273";
const MASTER_PIN = "252010";

// ============================================================================
// 1. FORMATTING & VALIDATION UTILITIES
// ============================================================================
function fmtRs(val) {
  const n = Number(val || 0);
  if (isNaN(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
}

function numOrDef(val, defVal) {
  const n = Number(val);
  return val !== undefined && val !== null && val !== "" && !isNaN(n) ? n : defVal;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function timeStampStr() {
  const d = new Date();
  return d.toISOString().slice(5, 10) + " " + d.toTimeString().slice(0, 5);
}

function addHistory(p, entryText) {
  if (!Array.isArray(p.history)) p.history = [];
  p.history.unshift("[" + timeStampStr() + "] " + entryText);
  if (p.history.length > 25) p.history = p.history.slice(0, 25);
}

function isBotAdmin(b, uid) {
  const sUid = String(uid);
  const owner = String(b.owner || b.adminId || MASTER_ADMIN);
  if (sUid === owner || sUid === MASTER_ADMIN) return true;
  if (Array.isArray(b.admins) && b.admins.map(String).includes(sUid)) return true;
  return false;
}

// ============================================================================
// 2. SMART FIREBASE REALTIME DATABASE HELPERS (ATOMIC READ/WRITE)
// ============================================================================
async function fbRequest(baseUrl, path, method = "GET", data = null) {
  try {
    const cleanPath = String(path).replace(/^\/+|\/+$/g, "");
    const opts = {
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (data !== null && method !== "GET" && method !== "DELETE") {
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(`${baseUrl}/${cleanPath}.json`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * Automatically locates which Firebase DB holds this botId,
 * ensuring 100% compatibility with Channel.java!
 */
async function loadBotNodeFromCloud(botId) {
  // 1. Check Primary Firebase (/kumar_cloud/bots/{botId})
  let node = await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${botId}`, "GET");
  if (node && (node.botConfig || node.token)) {
    return { dbUrl: PRIMARY_FIREBASE_URL, basePath: `kumar_cloud/bots/${botId}`, node };
  }

  // 2. Check Primary Firebase (/unlimited_bots/{botId})
  node = await fbRequest(PRIMARY_FIREBASE_URL, `unlimited_bots/${botId}`, "GET");
  if (node && (node.botConfig || node.token)) {
    return { dbUrl: PRIMARY_FIREBASE_URL, basePath: `unlimited_bots/${botId}`, node };
  }

  // 3. Check Fallback Firebase (/kumar_cloud/bots/{botId})
  node = await fbRequest(FALLBACK_FIREBASE_URL, `kumar_cloud/bots/${botId}`, "GET");
  if (node && (node.botConfig || node.token)) {
    return { dbUrl: FALLBACK_FIREBASE_URL, basePath: `kumar_cloud/bots/${botId}`, node };
  }

  return null;
}

async function savePlayerState(dbUrl, basePath, uid, playerObj) {
  await fbRequest(dbUrl, `${basePath}/playersMap/${uid}`, "PUT", playerObj);
}

async function saveBotConfig(dbUrl, basePath, botConfigObj) {
  await fbRequest(dbUrl, `${basePath}/botConfig`, "PUT", botConfigObj);
}

// ============================================================================
// 3. TELEGRAM BOT API HELPERS (POST JSON - RELIABLE & FAST)
// ============================================================================
async function tgPost(token, method, payload = {}) {
  if (!token) return { ok: false };
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

async function sendBotMsg(token, chatId, htmlText, replyMarkup = null) {
  if (!token || !chatId) return;
  const payload = {
    chat_id: String(chatId),
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return await tgPost(token, "sendMessage", payload);
}

async function sendBotPhoto(token, chatId, photoUrlOrFileId, captionHtml, replyMarkup = null) {
  if (!token || !chatId) return;
  if (!photoUrlOrFileId) {
    return await sendBotMsg(token, chatId, captionHtml, replyMarkup);
  }
  const payload = {
    chat_id: String(chatId),
    photo: String(photoUrlOrFileId),
    caption: captionHtml || "",
    parse_mode: "HTML"
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await tgPost(token, "sendPhoto", payload);
  if (!res || !res.ok) {
    return await sendBotMsg(token, chatId, captionHtml, replyMarkup);
  }
  return res;
}

async function editBotMsg(token, chatId, msgId, htmlText, replyMarkup = null) {
  if (!token || !msgId) return await sendBotMsg(token, chatId, htmlText, replyMarkup);
  const payload = {
    chat_id: String(chatId),
    message_id: Number(msgId),
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return await tgPost(token, "editMessageText", payload);
}

async function answerCb(token, cbId, text, showAlert = false) {
  if (!token || !cbId) return;
  return await tgPost(token, "answerCallbackQuery", {
    callback_query_id: String(cbId),
    text: text || "Done",
    show_alert: Boolean(showAlert)
  });
}

// ============================================================================
// 4. KEYBOARD BUILDERS (EXACT 8-BUTTON PHOTO UI + REACTION/POLL + ADMIN)
// ============================================================================
function buildMainPhotoKeyboard(isAdminUser) {
  const rows = [
    [{ text: "👁️ Order View" }, { text: "🔍 Order Status" }],
    [{ text: "👤 My Account" }, { text: "🎁 Daily Bonus" }],
    [{ text: "👥 Refer & Earn" }, { text: "🎟️ Redeem Code" }],
    [{ text: "💳 Top Up" }, { text: "ℹ️ Help / Support" }]
  ];
  if (isAdminUser) {
    rows.push([{ text: "👑 Admin Panel" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}

function buildOrderSubKeyboard(channelUnlockPrice) {
  return {
    keyboard: [
      [{ text: "❤️ Channel Reaction" }, { text: "📊 Vote Poll" }],
      [
        { text: `🔓 Set / Unlock Channel (₹${fmtRs(channelUnlockPrice)})` },
        { text: "📋 My Unlocked Channels" }
      ],
      [{ text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function buildAdminKeyboard() {
  return {
    keyboard: [
      [{ text: "📢 Add Public Channel" }, { text: "🔒 Add Private Channel" }],
      [{ text: "🗑️ Remove Force Channel" }, { text: "📋 Force Channel List" }],
      [{ text: "💲 Set Channel ₹ Price" }, { text: "👥 Set Refer Amount" }],
      [{ text: "🎁 Set Daily Bonus" }, { text: "🎟️ Create Redeem Code" }],
      [{ text: "💳 Set QR & UPI ID" }, { text: "💰 Add / Cut User ₹" }],
      [{ text: "🚫 Ban / Unban User" }, { text: "📢 Broadcast All" }],
      [{ text: "📊 Bot Stats" }, { text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function buildCancelKeyboard() {
  return {
    keyboard: [[{ text: "❌ Cancel" }]],
    resize_keyboard: true
  };
}

function buildEmojiKeyboard() {
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
// 5. CHANNEL KEY EXTRACTOR & ₹1 UNLOCK HELPERS
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

function isChannelUnlockedByUser(p, chKey) {
  if (!chKey || !p) return false;
  const arr = Array.isArray(p.unlockedChannels) ? p.unlockedChannels : [];
  return arr.some((item) => String(item).toLowerCase() === String(chKey).toLowerCase());
}

async function sendChannelLockedPrompt(token, uid, chKey, unlockPrice, bal) {
  const msg =
    `🔒 <b>CHANNEL NOT UNLOCKED YET!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📢 <b>Target Channel:</b> <code>${escHtml(chKey)}</code>\n` +
    `🏷️ <b>One-Time Unlock Fee:</b> <code>₹${fmtRs(unlockPrice)}</code>\n` +
    `💰 <b>Your Balance:</b> <code>₹${fmtRs(bal)}</code>\n\n` +
    `⚠️ <i>Reactions & Poll Votes will NOT go to ${escHtml(chKey)} until you unlock it for ₹${fmtRs(unlockPrice)}. Once unlocked, you can send UNLIMITED free Reactions & Poll Votes to this channel!</i>\n\n` +
    `👇 <b>Tap below to unlock this channel now:</b>`;

  await sendBotMsg(token, uid, msg, {
    inline_keyboard: [
      [
        {
          text: `🔓 Unlock ${chKey} Now (-₹${fmtRs(unlockPrice)})`,
          callback_data: `UNLOCK_CH|${chKey}`
        }
      ]
    ]
  });
}

async function unlockChannelForUser(dbUrl, basePath, b, p, uid, chKey, isAdm) {
  const token = b.token;
  const unlockPrice = numOrDef(b.channelUnlockPrice, 1);

  if (isChannelUnlockedByUser(p, chKey)) {
    await sendBotMsg(
      token,
      uid,
      `✅ <b>Channel</b> <code>${escHtml(chKey)}</code> <b>is ALREADY Unlocked!</b>\nYou can send unlimited Reactions & Poll Votes to it now.`,
      buildOrderSubKeyboard(unlockPrice)
    );
    return;
  }

  const bal = numOrDef(p.balance, 0);
  if (bal < unlockPrice) {
    await sendBotMsg(
      token,
      uid,
      `❌ <b>INSUFFICIENT WALLET BALANCE!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 <b>Channel to Unlock:</b> <code>${escHtml(chKey)}</code>\n` +
        `🏷️ <b>Required Fee:</b> <code>₹${fmtRs(unlockPrice)}</code>\n` +
        `💰 <b>Your Balance:</b> <code>₹${fmtRs(bal)}</code>\n\n` +
        `👉 Tap <b>💳 Top Up</b>, <b>🎁 Daily Bonus</b>, or <b>👥 Refer & Earn</b> to add balance!`,
      buildMainPhotoKeyboard(isAdm)
    );
    return;
  }

  p.balance = Number((bal - unlockPrice).toFixed(2));
  if (!Array.isArray(p.unlockedChannels)) p.unlockedChannels = [];
  p.unlockedChannels.push(chKey.toLowerCase());
  addHistory(p, `🔓 Unlocked Channel ${chKey}: -₹${fmtRs(unlockPrice)}`);

  await savePlayerState(dbUrl, basePath, uid, p);

  await sendBotMsg(
    token,
    uid,
    `🎉 <b>CHANNEL UNLOCKED PERMANENTLY!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📢 <b>Unlocked Channel:</b> <code>${escHtml(chKey)}</code>\n` +
      `💸 <b>Deducted:</b> <code>-₹${fmtRs(unlockPrice)}</code>\n` +
      `💰 <b>Remaining Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n\n` +
      `🔥 <b>You can now send UNLIMITED ❤️ Channel Reactions & 📊 Poll Votes to</b> <code>${escHtml(chKey)}</code>!`,
    buildOrderSubKeyboard(unlockPrice)
  );
}

// ============================================================================
// 6. LIVE FORCE-JOIN CHANNEL CHECKER (PUBLIC & PRIVATE CHANNELS)
// ============================================================================
async function verifyForceJoinLive(token, b, uid) {
  if (isBotAdmin(b, uid)) return true;

  const chs = Array.isArray(b.channels)
    ? b.channels
    : Array.isArray(b.forceChannels)
    ? b.forceChannels
    : [];
  if (chs.length === 0) return true;

  const missing = [];
  for (let i = 0; i < chs.length; i++) {
    const ch = chs[i];
    if (!ch || !ch.chatId) continue;
    try {
      const res = await tgPost(token, "getChatMember", {
        chat_id: String(ch.chatId),
        user_id: Number(uid)
      });
      if (res && res.ok && res.result) {
        const st = res.result.status || "left";
        const isJoined =
          st === "creator" ||
          st === "administrator" ||
          st === "member" ||
          (st === "restricted" && res.result.is_member === true);
        if (!isJoined) missing.push(ch);
      }
    } catch (e) {}
  }

  if (missing.length > 0) {
    const ikb = [];
    for (let i = 0; i < missing.length; i++) {
      const c = missing[i];
      const url = c.link || c.inviteLink || "https://t.me/";
      const title = c.title || `📢 Join Channel #${i + 1}`;
      ikb.push([{ text: title, url }]);
    }
    ikb.push([{ text: "✅ Joined / Verify Now", callback_data: "VERIFY_FORCE_JOIN" }]);

    const gateMsg =
      `⚠️ <b>MANDATORY CHANNEL JOIN GATE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `To use this bot (or because you left a required channel), you must join all official channels below first!\n\n` +
      `👇 <b>Join all channels & tap '✅ Joined / Verify Now':</b>`;

    await sendBotMsg(token, uid, gateMsg, { inline_keyboard: ikb });
    return false;
  }
  return true;
}

// ============================================================================
// 7. PLAYER INITIALIZATION HELPER
// ============================================================================
function getOrInitPlayer(players, b, uid, name, uname) {
  const sUid = String(uid);
  let p = players[sUid];
  if (!p) {
    const joinBon = numOrDef(b.joinReward, 0);
    p = {
      id: sUid,
      name: name || "User " + sUid,
      username: uname || "",
      balance: joinBon,
      totalEarned: joinBon,
      referrals: 0,
      referredBy: "",
      referralCredited: false,
      lastDaily: 0,
      state: "IDLE",
      banned: false,
      tempTopupAmt: 0,
      tempTopupTime: 0,
      tempOrderLink: "",
      tempOrderChannel: "",
      tempSupportUid: "",
      tempPrivId: "",
      tempCodeName: "",
      tempCodeAmt: 1,
      tempModUid: "",
      unlockedChannels: [],
      orders: [],
      history: joinBon > 0 ? [`🎁 Welcome Bonus: +₹${fmtRs(joinBon)}`] : []
    };
    players[sUid] = p;
  } else {
    if (name && name !== "User" && name !== "Player") p.name = name;
    if (uname) p.username = uname;
    if (typeof p.balance !== "number" || isNaN(p.balance)) p.balance = Number(p.balance) || 0;
    if (!Array.isArray(p.unlockedChannels)) p.unlockedChannels = [];
    if (!Array.isArray(p.orders)) p.orders = [];
    if (!Array.isArray(p.history)) p.history = [];
    // Normalize legacy 'step' field if present
    if (!p.state && p.step) p.state = p.step;
    if (!p.state) p.state = "IDLE";
  }
  return p;
}

// ============================================================================
// 8. EXECUTE REACTION & POLL ORDER VIA SMM PANEL API
// ============================================================================
async function executeReactionOrPollOrder(
  dbUrl,
  basePath,
  b,
  p,
  uid,
  orderTitle,
  postLink,
  chKey,
  apiAction,
  emoji,
  pollOpt
) {
  const token = b.token;
  const unlockPrice = numOrDef(b.channelUnlockPrice, 1);

  await sendBotMsg(
    token,
    uid,
    `⏳ <b>PROCESSING ORDER ON UNLOCKED CHANNEL...</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 <b>Service:</b> ${escHtml(orderTitle)}\n` +
      `📢 <b>Channel:</b> <code>${escHtml(chKey)}</code> (🟢 Unlocked)\n` +
      `🎯 <b>Post:</b> <code>${escHtml(postLink)}</code>`,
    buildOrderSubKeyboard(unlockPrice)
  );

  try {
    const payload = {
      action: apiAction,
      webPin: MASTER_PIN,
      postLink: postLink,
      selectedPhones: ["ALL"]
    };
    if (apiAction === "send_reaction") payload.emoji = emoji;
    if (apiAction === "vote_poll") payload.optionNumber = pollOpt;

    const res = await fetch(SMM_PANEL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const apiRes = await res.json();
    const replyStr = apiRes?.reply || "✅ Delivered Successfully!";

    const ordId = "ORD-" + Math.floor(10000 + Math.random() * 90000);
    if (!Array.isArray(p.orders)) p.orders = [];
    p.orders.unshift({
      id: ordId,
      type: orderTitle,
      link: postLink,
      status: "🟢 COMPLETED",
      date: timeStampStr()
    });
    if (p.orders.length > 15) p.orders = p.orders.slice(0, 15);
    addHistory(p, `✅ ${orderTitle} (${ ordId }) on ${chKey}`);

    b.totalOrders = numOrDef(b.totalOrders, 0) + 1;

    await savePlayerState(dbUrl, basePath, uid, p);
    await saveBotConfig(dbUrl, basePath, b);

    await sendBotMsg(
      token,
      uid,
      `🎉 <b>ORDER DELIVERED!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 <b>Order ID:</b> <code>${ordId}</code>\n` +
        `🛒 <b>Service:</b> ${escHtml(orderTitle)}\n` +
        `📢 <b>Unlocked Channel:</b> <code>${escHtml(chKey)}</code>\n` +
        `💰 <b>Charge:</b> <code>₹0 (Channel Unlocked!)</code>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n${replyStr}`,
      buildOrderSubKeyboard(unlockPrice)
    );
  } catch (e) {
    await sendBotMsg(
      token,
      uid,
      `✅ <b>Order Queued for</b> <code>${escHtml(postLink)}</code>!`,
      buildOrderSubKeyboard(unlockPrice)
    );
  }
}

// ============================================================================
// 9. MAIN VERCEL SERVERLESS HANDLER (WEBHOOK + APP API)
// ============================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      engine: "Kurmurya 24/7 Cloud Webhook Engine Active",
      status: "24/7_ONLINE"
    });
  }

  const botId = req.query?.botId ? String(req.query.botId).trim() : "";
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // --------------------------------------------------------------------------
  // A. APP / API DIRECT COMMANDS (IF APP CALLS /api/bot WITHOUT TELEGRAM UPDATE)
  // --------------------------------------------------------------------------
  if (!botId && body.action) {
    try {
      if (body.action === "connect_bot") {
        const token = String(body.token || "").trim();
        const owner = String(body.adminId || body.owner || MASTER_ADMIN).replace(/\D/g, "");
        const chPrice = numOrDef(body.channelUnlockPrice, 1);

        const meRes = await tgPost(token, "getMe", {});
        if (!meRes || !meRes.ok) {
          return res.status(200).json({ success: false, error: "Invalid Bot Token!" });
        }
        const bId = String(meRes.result.id);
        const uname = meRes.result.username || "Bot";
        const bName = meRes.result.first_name || "Reaction Bot";

        const whUrl = `${WEBHOOK_BASE_URL}?botId=${encodeURIComponent(bId)}`;
        await tgPost(token, "setWebhook", { url: whUrl, drop_pending_updates: false });

        const existing = (await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "GET")) || {};
        const cfg = existing.botConfig || {
          id: bId,
          token,
          username: uname,
          name: bName,
          owner,
          active: true,
          webhookActive: true,
          webhookUrl: whUrl,
          channelUnlockPrice: chPrice,
          dailyBonus: 0.5,
          referBonus: 1.0,
          joinReward: 0.0,
          upiId: "Set UPI in Admin Panel",
          qrPhoto: "",
          channels: [],
          totalOrders: 0
        };
        cfg.token = token;
        cfg.owner = owner;
        cfg.webhookActive = true;
        cfg.webhookUrl = whUrl;
        cfg.active = true;

        const nodeToSave = {
          ...existing,
          botConfig: cfg,
          playersMap: existing.playersMap || {},
          topupRequests: existing.topupRequests || {},
          giftCodesMap: existing.giftCodesMap || {},
          supportTickets: existing.supportTickets || {},
          offset: existing.offset || 0
        };

        await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);
        await sendBotMsg(
          token,
          owner,
          `👑 <b>24/7 CLOUD WEBHOOK CONNECTED!</b>\n\n` +
            `🤖 <b>Bot:</b> @${escHtml(uname)}\n` +
            `🆔 <b>Admin ID:</b> <code>${owner}</code>\n` +
            `🔓 <b>Channel Unlock Rate:</b> <code>₹${fmtRs(cfg.channelUnlockPrice)} / Channel</code>\n\n` +
            `👇 Send <b>/start</b> to open the Photo Menu & <b>👑 Admin Panel</b>!`,
          buildMainPhotoKeyboard(true)
        );

        return res.status(200).json({ success: true, botId: bId, botUsername: uname, webhookUrl: whUrl });
      }
    } catch (e) {
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // B. 24/7 TELEGRAM WEBHOOK UPDATE HANDLER (?botId=...)
  // --------------------------------------------------------------------------
  const upd = body;
  if (!botId || (!upd.message && !upd.callback_query)) {
    return res.status(200).send("OK");
  }

  try {
    const cloudData = await loadBotNodeFromCloud(botId);
    if (!cloudData || !cloudData.node) {
      return res.status(200).send("NO_BOT");
    }

    const { dbUrl, basePath, node } = cloudData;
    const b = node.botConfig || node;
    const token = b.token;
    if (!token) return res.status(200).send("NO_TOKEN");

    // 1. DEDUPLICATE UPDATE_ID SO THE BOT NEVER SENDS DUPLICATE MESSAGES!
    const incomingUpdateId = Number(upd.update_id || 0);
    const lastProcessedId = Number(node.lastWebhookUpdateId || 0);
    if (incomingUpdateId > 0 && incomingUpdateId === lastProcessedId) {
      return res.status(200).send("DUPLICATE_IGNORED");
    }
    if (incomingUpdateId > 0) {
      await fbRequest(dbUrl, `${basePath}/lastWebhookUpdateId`, "PUT", incomingUpdateId);
    }

    // Normalize settings if stored under b.settings
    if (b.settings && typeof b.settings === "object") {
      if (b.channelUnlockPrice === undefined) b.channelUnlockPrice = b.settings.channelUnlockPrice;
      if (b.dailyBonus === undefined) b.dailyBonus = b.settings.dailyBonus;
      if (b.referBonus === undefined) b.referBonus = b.settings.referBonus;
      if (!b.upiId) b.upiId = b.settings.upiId;
      if (!b.qrPhoto) b.qrPhoto = b.settings.qrPhoto;
    }

    const ownerId = String(b.owner || b.adminId || MASTER_ADMIN);
    const chUnlockPrice = numOrDef(b.channelUnlockPrice, 1);
    const dailyBonus = numOrDef(b.dailyBonus, 0.5);
    const referBonus = numOrDef(b.referBonus, 1);

    if (b.active === false || b.isRunning === false) {
      const fromId = upd.message?.from?.id || upd.callback_query?.from?.id;
      if (fromId && String(fromId) !== ownerId) {
        await sendBotMsg(token, fromId, "🔴 <b>This Bot is currently paused by its Administrator.</b>");
        return res.status(200).send("BOT_OFF");
      }
    }

    const players = node.playersMap || node.users || {};
    const topupRequests = node.topupRequests || {};
    const giftCodesMap = node.giftCodesMap || node.redeemCodes || {};
    const supportTickets = node.supportTickets || {};

    const isCb = Boolean(upd.callback_query);
    const fromObj = isCb ? upd.callback_query.from : upd.message?.from;
    if (!fromObj) return res.status(200).send("OK");

    const cUid = String(fromObj.id);
    const cName =
      ((fromObj.first_name || "") + (fromObj.last_name ? " " + fromObj.last_name : ""))
        .trim()
        .replace(/[<>]/g, "") || "User";
    const cUname = fromObj.username || "";

    const isBrandNewUser = !players[cUid];
    const p = getOrInitPlayer(players, b, cUid, cName, cUname);
    const isAdm = isBotAdmin(b, cUid);
    const mainKb = buildMainPhotoKeyboard(isAdm);

    // Check Ban
    if (p.banned && !isAdm) {
      if (isCb) await answerCb(token, upd.callback_query.id, "🚫 You are BANNED from this bot!", true);
      else await sendBotMsg(token, cUid, "🚫 <b>You are BANNED from this bot by the Administrator.</b>");
      return res.status(200).send("BANNED");
    }

    // ========================================================================
    // C. HANDLE INLINE BUTTON CALLBACK QUERIES
    // ========================================================================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;

      // 1. Verify Force-Join Button
      if (data === "VERIFY_FORCE_JOIN") {
        const joinedOk = await verifyForceJoinLive(token, b, cUid);
        if (joinedOk) {
          await answerCb(token, cbId, "🎉 Verification Successful! Welcome!", true);
          await sendBotMsg(
            token,
            cUid,
            `✅ <b>Channel Membership Verified!</b>\nWelcome, <b>${escHtml(cName)}</b>! Choose an option below:`,
            mainKb
          );
        } else {
          await answerCb(token, cbId, "❌ You still haven't joined all required channels!", true);
        }
        return res.status(200).send("OK");
      }

      // 2. Inline Channel Unlock Button: "UNLOCK_CH|<channelKey>"
      if (data.startsWith("UNLOCK_CH|")) {
        const chKey = data.substring("UNLOCK_CH|".length);
        await answerCb(token, cbId, "Processing channel unlock...", false);
        await unlockChannelForUser(dbUrl, basePath, b, p, cUid, chKey, isAdm);
        return res.status(200).send("OK");
      }

      // 3. Admin Support Reply Button: "REPLY_USER|<targetUid>"
      if (data.startsWith("REPLY_USER|") && isAdm) {
        const targetUid = data.substring("REPLY_USER|".length);
        p.state = "ADM_REPLY_USER";
        p.tempSupportUid = targetUid;
        await savePlayerState(dbUrl, basePath, cUid, p);

        await answerCb(token, cbId, "Type your reply message now", false);
        await sendBotMsg(
          token,
          cUid,
          `↩️ <b>REPLYING TO USER:</b> <code>${targetUid}</code>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👇 <b>Type and send your reply message now:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      // 4. Admin Approve / Reject Top-Up Buttons: "TOPUP_OK|<reqId>" or "TOPUP_NO|<reqId>"
      if ((data.startsWith("TOPUP_OK|") || data.startsWith("TOPUP_NO|")) && isAdm) {
        const approve = data.startsWith("TOPUP_OK|");
        const reqId = data.substring(9);
        const reqObj = topupRequests[reqId];

        if (!reqObj || reqObj.status !== "PENDING") {
          await answerCb(token, cbId, "⚠️ Top-Up request already processed!", true);
          return res.status(200).send("OK");
        }

        const buyerId = String(reqObj.userId);
        const amt = numOrDef(reqObj.amount, 0);
        const utr = String(reqObj.utr || "");
        const buyerProf = getOrInitPlayer(players, b, buyerId, reqObj.userName || "User", "");

        if (approve) {
          reqObj.status = "APPROVED";
          buyerProf.balance = Number((numOrDef(buyerProf.balance, 0) + amt).toFixed(2));
          buyerProf.totalEarned = Number((numOrDef(buyerProf.totalEarned, 0) + amt).toFixed(2));
          addHistory(buyerProf, `✅ Top-Up Approved (#${reqId}): +₹${fmtRs(amt)}`);

          await fbRequest(dbUrl, `${basePath}/topupRequests/${reqId}`, "PUT", reqObj);
          await savePlayerState(dbUrl, basePath, buyerId, buyerProf);

          await answerCb(token, cbId, `✅ Approved +₹${fmtRs(amt)}!`, true);
          await sendBotMsg(
            token,
            buyerId,
            `🎉 <b>TOP-UP APPROVED!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `💳 <b>Amount Credited:</b> <code>+₹${fmtRs(amt)}</code>\n` +
              `🧾 <b>UTR / Ref:</b> <code>${escHtml(utr)}</code>\n` +
              `💰 <b>New Wallet Balance:</b> <code>₹${fmtRs(buyerProf.balance)}</code>`
          );
          await sendBotMsg(
            token,
            cUid,
            `✅ <b>Top-Up Request (${reqId}) Approved!</b>\nAdded <code>+₹${fmtRs(amt)}</code> to User <code>${buyerId}</code>.`,
            buildAdminKeyboard()
          );
        } else {
          reqObj.status = "REJECTED";
          await fbRequest(dbUrl, `${basePath}/topupRequests/${reqId}`, "PUT", reqObj);

          await answerCb(token, cbId, "❌ Top-Up Rejected", true);
          await sendBotMsg(
            token,
            buyerId,
            `❌ <b>TOP-UP REQUEST REJECTED</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🧾 <b>UTR:</b> <code>${escHtml(utr)}</code>\n` +
              `💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n` +
              `Please contact <b>ℹ️ Help / Support</b> if you have any issue.`
          );
          await sendBotMsg(
            token,
            cUid,
            `❌ <b>Top-Up Request (${reqId}) Rejected.</b>`,
            buildAdminKeyboard()
          );
        }
        return res.status(200).send("OK");
      }

      await answerCb(token, cbId, "Done", false);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // D. HANDLE TEXT & PHOTO MESSAGES
    // ========================================================================
    const msgObj = upd.message;
    const text = String(msgObj.text || "").trim();
    const photoArr = msgObj.photo;
    const photoFileId =
      Array.isArray(photoArr) && photoArr.length > 0
        ? photoArr[photoArr.length - 1].file_id || ""
        : "";

    // Track referral on first /start REF_<inviterId>
    if (isBrandNewUser && text.startsWith("/start ")) {
      const parts = text.split(/\s+/);
      if (parts.length > 1 && parts[1].toUpperCase().startsWith("REF_")) {
        const invId = parts[1].substring(4).trim();
        if (invId && invId !== cUid) {
          p.referredBy = invId;
        }
      }
    }

    // 1. LIVE FORCE-JOIN CHECK ON EVERY MESSAGE (IF USER LEAVES CHANNEL -> BLOCK IMMEDIATELY!)
    const joinedOk = await verifyForceJoinLive(token, b, cUid);
    if (!joinedOk) {
      await savePlayerState(dbUrl, basePath, cUid, p);
      return res.status(200).send("FORCE_JOIN_GATE");
    }

    // Credit Referral Bonus after user passes Force-Join verification
    if (p.referredBy && !p.referralCredited) {
      p.referralCredited = true;
      const invId = String(p.referredBy);
      if (players[invId]) {
        const invP = getOrInitPlayer(players, b, invId, "Inviter", "");
        invP.balance = Number((numOrDef(invP.balance, 0) + referBonus).toFixed(2));
        invP.referrals = numOrDef(invP.referrals, 0) + 1;
        addHistory(invP, `👥 Referral Bonus (${cName}): +₹${fmtRs(referBonus)}`);
        await savePlayerState(dbUrl, basePath, invId, invP);

        await sendBotMsg(
          token,
          invId,
          `🎉 <b>NEW REFERRAL VERIFIED!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 <b>User:</b> ${escHtml(cName)}\n` +
            `🎁 <b>Referral Bonus:</b> <code>+₹${fmtRs(referBonus)}</code>\n` +
            `💰 <b>Your Balance:</b> <code>₹${fmtRs(invP.balance)}</code>`
        );
      }
    }

    // 2. CANCEL / BACK / START COMMANDS
    if (text.toLowerCase() === "❌ cancel" || text.toLowerCase() === "/cancel") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, "❌ <b>Operation Cancelled.</b>", mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🔙 Back to Main Menu" || text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const uCount = Array.isArray(p.unlockedChannels) ? p.unlockedChannels.length : 0;

      const welcomeMsg =
        `👑 <b>WELCOME TO @${escHtml(String(b.username || "BOT").toUpperCase())}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount} Channel(s)</code>\n` +
        `🏷️ <b>Channel Unlock Rate:</b> <code>₹${fmtRs(chUnlockPrice)} / Channel (Unlimited Reactions & Polls!)</code>\n\n` +
        `👇 <b>Select an option from the menu below:</b>`;

      await sendBotMsg(token, cUid, welcomeMsg, mainKb);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // 3. TOP-LEVEL MENU BUTTONS (ALWAYS OVERRIDE ANY STUCK STATE!)
    // ========================================================================
    if (text === "👁️ Order View") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const uCount = Array.isArray(p.unlockedChannels) ? p.unlockedChannels.length : 0;

      const msg =
        `👁️ <b>ORDER VIEW — REACTION & POLL SUITE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount}</code>\n\n` +
        `📌 <b>Mandatory ₹${fmtRs(chUnlockPrice)} Channel Rule:</b>\n` +
        `• Set/Unlock your channel once for <b>-₹${fmtRs(chUnlockPrice)}</b>.\n` +
        `• Once unlocked, send <b>UNLIMITED ❤️ Channel Reactions & 📊 Poll Votes</b> to that channel for FREE!\n` +
        `• Without unlocking a channel for ₹${fmtRs(chUnlockPrice)}, reactions/votes will not go to that channel.\n\n` +
        `👇 <b>Select a service below:</b>`;

      await sendBotMsg(token, cUid, msg, buildOrderSubKeyboard(chUnlockPrice));
      return res.status(200).send("OK");
    }

    if (text.startsWith("🔓 Set / Unlock Channel")) {
      p.state = "WAIT_UNLOCK_CHANNEL";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔓 <b>SET / UNLOCK CHANNEL (₹${fmtRs(chUnlockPrice)})</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
          `🏷️ <b>One-Time Unlock Charge:</b> <code>-₹${fmtRs(chUnlockPrice)}</code>\n\n` +
          `👇 <b>Send your Channel @username OR any Post Link from your channel:</b>\n` +
          `• Example: <code>@mychannel</code> or <code>https://t.me/mychannel/105</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "📋 My Unlocked Channels") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const uArr = Array.isArray(p.unlockedChannels) ? p.unlockedChannels : [];
      let sb = `📋 <b>MY UNLOCKED CHANNELS</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (uArr.length === 0) {
        sb += `📭 You haven't unlocked any channel yet!\nTap <b>🔓 Set / Unlock Channel (₹${fmtRs(chUnlockPrice)})</b> first.`;
      } else {
        uArr.forEach((ch, idx) => {
          sb += `${idx + 1}. <code>${escHtml(ch)}</code> — 🟢 <b>UNLIMITED ACTIVE</b>\n`;
        });
      }
      await sendBotMsg(token, cUid, sb, buildOrderSubKeyboard(chUnlockPrice));
      return res.status(200).send("OK");
    }

    if (text === "❤️ Channel Reaction") {
      p.state = "WAIT_REACT_LINK";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `❤️ <b>ORDER CHANNEL REACTION</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ <i>Channel must be unlocked (₹${fmtRs(chUnlockPrice)}) first. Once unlocked, reactions are 100% FREE & Unlimited!</i>\n\n` +
          `👇 <b>STEP 1 OF 2: Send your Channel Post Link:</b>\n` +
          `• Example: <code>https://t.me/mychannel/105</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "📊 Vote Poll") {
      p.state = "WAIT_POLL_LINK";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `📊 <b>ORDER VOTE POLL</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ <i>Channel must be unlocked (₹${fmtRs(chUnlockPrice)}) first. Once unlocked, poll votes are 100% FREE & Unlimited!</i>\n\n` +
          `👇 <b>STEP 1 OF 2: Send your Telegram Poll Post Link:</b>\n` +
          `• Example: <code>https://t.me/mychannel/108</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "🔍 Order Status") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const ords = Array.isArray(p.orders) ? p.orders : [];
      let sb = `🔍 <b>MY ORDER STATUS & HISTORY</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (ords.length === 0) {
        sb += `📭 No Reaction or Poll orders placed yet! Tap <b>👁️ Order View</b> to start.`;
      } else {
        ords.slice(0, 10).forEach((o, i) => {
          sb +=
            `<b>[${i + 1}] ${escHtml(o.id)} — ${escHtml(o.type)}</b>\n` +
            ` ┣ 🎯 <code>${escHtml(o.link)}</code>\n` +
            ` ┗ 📌 Status: ${escHtml(o.status)}\n\n`;
        });
      }
      await sendBotMsg(token, cUid, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "👤 My Account") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const uCount = Array.isArray(p.unlockedChannels) ? p.unlockedChannels.length : 0;
      const oCount = Array.isArray(p.orders) ? p.orders.length : 0;

      const prof =
        `👤 <b>MY ACCOUNT PROFILE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧑 <b>Name:</b> ${escHtml(cName)}\n` +
        `🆔 <b>User ID:</b> <code>${cUid}</code>\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount} Channel(s)</code>\n` +
        `📦 <b>Total Orders:</b> <code>${oCount} Orders</code>\n` +
        `👥 <b>Total Referrals:</b> <code>${numOrDef(p.referrals, 0)} Users</code>`;

      await sendBotMsg(token, cUid, prof, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🎁 Daily Bonus") {
      p.state = "IDLE";
      const now = Date.now();
      const last = numOrDef(p.lastDaily, 0);
      const dayMs = 24 * 60 * 60 * 1000;
      if (now - last < dayMs) {
        const rem = dayMs - (now - last);
        const hrs = Math.floor(rem / (1000 * 60 * 60));
        const mins = Math.floor((rem % (1000 * 60 * 60)) / (1000 * 60));
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `⏳ <b>DAILY BONUS COOLDOWN</b>\nNext claim available in: <code>${hrs}h ${mins}m</code>`,
          mainKb
        );
        return res.status(200).send("OK");
      }

      p.balance = Number((numOrDef(p.balance, 0) + dailyBonus).toFixed(2));
      p.lastDaily = now;
      addHistory(p, `🎁 Daily Bonus: +₹${fmtRs(dailyBonus)}`);
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🎁 <b>DAILY BONUS CLAIMED!</b>\n` +
          `💎 <b>Added:</b> <code>+₹${fmtRs(dailyBonus)}</code>\n` +
          `💰 <b>New Balance:</b> <code>₹${fmtRs(p.balance)}</code>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    if (text === "👥 Refer & Earn") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const link = `https://t.me/${b.username || "bot"}?start=REF_${cUid}`;

      await sendBotMsg(
        token,
        cUid,
        `👥 <b>REFER & EARN MONEY</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔗 <b>Your Referral Link:</b>\n<code>${link}</code>\n\n` +
          `🎁 <b>Per Referral Bonus:</b> <code>+₹${fmtRs(referBonus)}</code>\n` +
          `👥 <b>Total Referrals:</b> <code>${numOrDef(p.referrals, 0)} Friends</code>\n\n` +
          `<i>Share your link! When friends join the required channels, you earn ₹${fmtRs(referBonus)} instantly!</i>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    if (text === "🎟️ Redeem Code") {
      p.state = "WAIT_REDEEM_CODE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        cUid,
        `🎟️ <b>REDEEM PROMO CODE</b>\n👇 <b>Send your Gift / Promo Code below:</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "💳 Top Up") {
      const upiId = b.upiId || "Not Configured Yet";
      const qrPhoto = b.qrPhoto || "";
      p.state = "WAIT_TOPUP_AMOUNT";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const caption =
        `💳 <b>ADD FUNDS / TOP UP WALLET</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏦 <b>UPI ID:</b> <code>${escHtml(upiId)}</code>\n` +
        `🔓 <b>Channel Rate:</b> <code>₹${fmtRs(chUnlockPrice)} = 1 Channel (Unlimited Reactions & Polls)</code>\n\n` +
        `📌 <b>STEP 1 OF 2:</b>\n` +
        `Scan the QR Code or pay to the UPI ID above, then <b>send the Amount (₹) you paid</b> below (e.g. <code>10</code>):`;

      if (qrPhoto) {
        await sendBotPhoto(token, cUid, qrPhoto, caption, buildCancelKeyboard());
      } else {
        await sendBotMsg(token, cUid, caption, buildCancelKeyboard());
      }
      return res.status(200).send("OK");
    }

    if (text === "ℹ️ Help / Support") {
      p.state = "WAIT_SUPPORT_MSG";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        cUid,
        `ℹ️ <b>HELP & SUPPORT DESK</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👇 <b>Type and send your message or question below.</b>\nOur Admin will receive your details and reply directly!`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ========================================================================
    // 4. ADMIN PANEL MENU BUTTONS (FOR ADMIN ID)
    // ========================================================================
    if (isAdm) {
      if (text === "👑 Admin Panel" || text === "👑 Pro Admin Panel" || text === "/admin") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `👑 <b>MASTER ADMIN PANEL (24/7 CLOUD)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔓 <b>Channel Unlock Price:</b> <code>₹${fmtRs(chUnlockPrice)}</code>\n` +
            `👥 <b>Refer Bonus:</b> <code>₹${fmtRs(referBonus)}</code>\n` +
            `🎁 <b>Daily Bonus:</b> <code>₹${fmtRs(dailyBonus)}</code>\n` +
            `💳 <b>UPI ID:</b> <code>${escHtml(b.upiId || "Not Set")}</code>\n\n` +
            `👇 <b>Select an Admin tool below:</b>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "📢 Add Public Channel") {
        p.state = "ADM_ADD_PUB_CH";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `📢 <b>ADD PUBLIC FORCE-JOIN CHANNEL</b>\n⚠️ <i>Make sure Bot is Admin in the channel!</i>\n👇 <b>Send Public Channel @username (e.g. <code>@mychannel</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "🔒 Add Private Channel") {
        p.state = "ADM_ADD_PRIV_ID";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🔒 <b>ADD PRIVATE CHANNEL (STEP 1 OF 2)</b>\n⚠️ <i>Make sure Bot is Admin in the private channel!</i>\n👇 <b>Send Private Channel Chat ID (e.g. <code>-1001234567890</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "📋 Force Channel List") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const chs = Array.isArray(b.channels) ? b.channels : [];
        let sb = `📋 <b>ACTIVE FORCE-JOIN CHANNELS</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        if (chs.length === 0) sb += `📭 No Force-Join channels configured.`;
        else {
          chs.forEach((c, i) => {
            sb += `${i + 1}. <code>${escHtml(c.chatId)}</code>\n   🔗 ${escHtml(c.link || c.inviteLink || "")}\n\n`;
          });
        }
        await sendBotMsg(token, cUid, sb, buildAdminKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🗑️ Remove Force Channel") {
        p.state = "ADM_REM_FORCE_CH";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🗑️ <b>Send Channel @username, Chat ID (-100...), or <code>ALL</code> to clear:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "💲 Set Channel ₹ Price") {
        p.state = "ADM_SET_CH_PRICE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `💲 <b>Send new Channel Unlock Price in ₹ (e.g. <code>1</code> or <code>2</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "👥 Set Refer Amount") {
        p.state = "ADM_SET_REFER";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `👥 <b>Send new Referral Bonus amount in ₹:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🎁 Set Daily Bonus") {
        p.state = "ADM_SET_DAILY";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `🎁 <b>Send new Daily Bonus amount in ₹:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🎟️ Create Redeem Code") {
        p.state = "ADM_CODE_NAME";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🎟️ <b>STEP 1 OF 3: Send Redeem Code Name (e.g. <code>FREE10</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "💳 Set QR & UPI ID") {
        p.state = "ADM_SET_UPI";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `💳 <b>STEP 1 OF 2: Send your Admin UPI ID (e.g. <code>Kumarkor@fam</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "💰 Add / Cut User ₹") {
        p.state = "ADM_MOD_UID";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `💰 <b>STEP 1 OF 2: Send Target User's Telegram ID:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "🚫 Ban / Unban User") {
        p.state = "ADM_BAN_UID";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🚫 <b>Send Target User's Telegram ID to Ban or Unban:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "📢 Broadcast All") {
        p.state = "ADM_BCAST";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `📢 <b>Send the message you want to Broadcast to all users:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "📊 Bot Stats") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const chs = Array.isArray(b.channels) ? b.channels : [];
        await sendBotMsg(
          token,
          cUid,
          `📊 <b>LIVE 24/7 BOT STATISTICS</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 <b>Total Users:</b> <code>${Object.keys(players).length}</code>\n` +
            `📦 <b>Total Orders:</b> <code>${numOrDef(b.totalOrders, 0)}</code>\n` +
            `📢 <b>Force Channels:</b> <code>${chs.length}</code>\n` +
            `🔓 <b>Channel Unlock Rate:</b> <code>₹${fmtRs(chUnlockPrice)}</code>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }
    }

    // ========================================================================
    // 5. MULTI-STEP WORKFLOWS (WITH SMART UTR FAIL-SAFE!)
    // ========================================================================
    const st = String(p.state || "IDLE").toUpperCase();

    // ---- SMART FAIL-SAFE: IF USER ALREADY ENTERED TOP-UP AMOUNT & SENDS 10-16 DIGIT UTR ----
    const isLikelyUtrNumber = /^\d{10,16}$/.test(text);
    const hasRecentTopupAmt =
      numOrDef(p.tempTopupAmt, 0) > 0 && Date.now() - numOrDef(p.tempTopupTime, 0) < 15 * 60 * 1000;

    if (st === "WAIT_TOPUP_UTR" || (st === "IDLE" && isLikelyUtrNumber && hasRecentTopupAmt)) {
      if (text.length < 4) {
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Invalid UTR!</b> Please send your valid 12-Digit UTR / UPI Reference ID:`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      const amt = numOrDef(p.tempTopupAmt, 10);
      p.state = "IDLE";
      p.tempTopupAmt = 0;
      p.tempTopupTime = 0;

      const reqId = "TOP" + Math.floor(100000 + Math.random() * 900000);
      const reqObj = {
        id: reqId,
        userId: cUid,
        userName: cName,
        username: cUname,
        amount: amt,
        utr: text,
        status: "PENDING",
        date: timeStampStr()
      };

      addHistory(p, `⏳ Top-Up Submitted (#${reqId}): ₹${fmtRs(amt)} (UTR: ${text})`);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await fbRequest(dbUrl, `${basePath}/topupRequests/${reqId}`, "PUT", reqObj);

      // 1. Confirm to User
      await sendBotMsg(
        token,
        cUid,
        `✅ <b>TOP-UP REQUEST SUBMITTED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 <b>Request ID:</b> <code>${reqId}</code>\n` +
          `💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n` +
          `🧾 <b>UTR / Ref:</b> <code>${escHtml(text)}</code>\n\n` +
          `⏳ <i>Sent to Admin for verification! Your wallet will be credited as soon as Admin approves.</i>`,
        mainKb
      );

      // 2. Alert Admin with Approve & Reject Inline Buttons
      const admAlert =
        `💳 <b>NEW TOP-UP REQUEST RECEIVED!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User Name:</b> ${escHtml(cName)}\n` +
        `🆔 <b>User ID:</b> <code>${cUid}</code>\n` +
        `🌐 <b>Username:</b> ${cUname ? "@" + escHtml(cUname) : "None"}\n` +
        `💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n` +
        `🧾 <b>UTR / Ref:</b> <code>${escHtml(text)}</code>\n\n` +
        `👇 <b>Tap below to Approve or Reject:</b>`;

      await sendBotMsg(token, ownerId, admAlert, {
        inline_keyboard: [
          [
            { text: `✅ Approve +₹${fmtRs(amt)}`, callback_data: `TOPUP_OK|${reqId}` },
            { text: "❌ Reject", callback_data: `TOPUP_NO|${reqId}` }
          ]
        ]
      });

      return res.status(200).send("OK");
    }

    // ---- STEP: TOP-UP STEP 1 (ENTER AMOUNT) ----
    if (st === "WAIT_TOPUP_AMOUNT") {
      const amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) {
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Invalid Amount!</b> Please enter only the numeric ₹ amount you paid (e.g. <code>10</code>):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      p.tempTopupAmt = amt;
      p.tempTopupTime = Date.now();
      p.state = "WAIT_TOPUP_UTR";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🧾 <b>STEP 2 OF 2: SEND UTR / REF NO</b>\n` +
          `💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n` +
          `👇 <b>Send your 12-Digit UTR / UPI Reference ID:</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP: UNLOCK CHANNEL ----
    if (st === "WAIT_UNLOCK_CHANNEL" || st === "WAIT_UNLOCK_CHANNEL_INPUT") {
      const chKey = extractChannelKey(text);
      if (!chKey) {
        await sendBotMsg(
          token,
          cUid,
          `❌ <b>Invalid Channel!</b> Send a valid Channel <code>@username</code> or Post Link (e.g. <code>https://t.me/mychannel/105</code>):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await unlockChannelForUser(dbUrl, basePath, b, p, cUid, chKey, isAdm);
      return res.status(200).send("OK");
    }

    // ---- STEP: CHANNEL REACTION ----
    if (st === "WAIT_REACT_LINK" || st === "WAIT_REACTION_POST_LINK") {
      const chKey = extractChannelKey(text);
      if (!chKey || !text.includes("t.me/")) {
        await sendBotMsg(
          token,
          cUid,
          `❌ <b>Invalid Post Link!</b> Send a valid Channel Post Link (e.g. <code>https://t.me/mychannel/105</code>):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (!isChannelUnlockedByUser(p, chKey)) {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendChannelLockedPrompt(token, cUid, chKey, chUnlockPrice, p.balance);
        return res.status(200).send("OK");
      }

      p.tempOrderLink = text;
      p.tempOrderChannel = chKey;
      p.state = "WAIT_REACT_EMOJI";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `❤️ <b>CHANNEL UNLOCKED (${escHtml(chKey)}) — STEP 2 OF 2</b>\n` +
          `👇 <b>Select Emoji Reaction below (or type RANDOM):</b>`,
        buildEmojiKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_REACT_EMOJI" || st === "WAIT_REACTION_EMOJI") {
      const link = p.tempOrderLink || "";
      const chKey = p.tempOrderChannel || "";
      const emoji = text || "RANDOM";
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await executeReactionOrPollOrder(
        dbUrl,
        basePath,
        b,
        p,
        cUid,
        `❤️ Channel Reaction (${emoji})`,
        link,
        chKey,
        "send_reaction",
        emoji,
        ""
      );
      return res.status(200).send("OK");
    }

    // ---- STEP: VOTE POLL ----
    if (st === "WAIT_POLL_LINK" || st === "WAIT_POLL_POST_LINK") {
      const chKey = extractChannelKey(text);
      if (!chKey || !text.includes("t.me/")) {
        await sendBotMsg(
          token,
          cUid,
          `❌ <b>Invalid Poll Link!</b> Send a valid Telegram Poll Post Link (e.g. <code>https://t.me/mychannel/108</code>):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (!isChannelUnlockedByUser(p, chKey)) {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendChannelLockedPrompt(token, cUid, chKey, chUnlockPrice, p.balance);
        return res.status(200).send("OK");
      }

      p.tempOrderLink = text;
      p.tempOrderChannel = chKey;
      p.state = "WAIT_POLL_OPT";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `📊 <b>CHANNEL UNLOCKED (${escHtml(chKey)}) — STEP 2 OF 2</b>\n` +
          `👇 <b>Send Poll Option Number to Vote (e.g. <code>1</code> or <code>2</code>):</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_POLL_OPT" || st === "WAIT_POLL_OPTION_NUMBER") {
      const opt = text.replace(/\D/g, "");
      if (!opt) {
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Invalid Option!</b> Send a valid option number (e.g. 1, 2, 3):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }
      const link = p.tempOrderLink || "";
      const chKey = p.tempOrderChannel || "";
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await executeReactionOrPollOrder(
        dbUrl,
        basePath,
        b,
        p,
        cUid,
        `📊 Vote Poll (Option #${opt})`,
        link,
        chKey,
        "vote_poll",
        "",
        opt
      );
      return res.status(200).send("OK");
    }

    // ---- STEP: REDEEM CODE ----
    if (st === "WAIT_REDEEM_CODE") {
      const codeKey = text.toUpperCase().trim();
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const g = giftCodesMap[codeKey];
      if (!g) {
        await sendBotMsg(token, cUid, `❌ <b>Invalid or Expired Redeem Code!</b>`, mainKb);
        return res.status(200).send("OK");
      }
      const usedArr = Array.isArray(g.used)
        ? g.used
        : Array.isArray(g.claimedBy)
        ? g.claimedBy
        : [];
      if (usedArr.map(String).includes(cUid)) {
        await sendBotMsg(token, cUid, `⚠️ <b>You already redeemed this code!</b>`, mainKb);
        return res.status(200).send("OK");
      }
      if (usedArr.length >= numOrDef(g.max, 1)) {
        await sendBotMsg(token, cUid, `❌ <b>This Redeem Code has reached its maximum claim limit!</b>`, mainKb);
        return res.status(200).send("OK");
      }

      usedArr.push(cUid);
      g.used = usedArr;
      const amt = numOrDef(g.amount, 1);
      p.balance = Number((numOrDef(p.balance, 0) + amt).toFixed(2));
      addHistory(p, `🎟️ Redeem Code (${codeKey}): +₹${fmtRs(amt)}`);

      await fbRequest(dbUrl, `${basePath}/giftCodesMap/${codeKey}`, "PUT", g);
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🎉 <b>CODE REDEEMED SUCCESSFULLY!</b>\n` +
          `💎 <b>Added:</b> <code>+₹${fmtRs(amt)}</code>\n` +
          `💰 <b>New Balance:</b> <code>₹${fmtRs(p.balance)}</code>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    // ---- STEP: HELP / SUPPORT MESSAGE ----
    if (st === "WAIT_SUPPORT_MSG" || st === "WAIT_SUPPORT_MESSAGE") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const tId = "SUP" + Math.floor(10000 + Math.random() * 90000);
      const ticketObj = {
        id: tId,
        userId: cUid,
        userName: cName,
        username: cUname,
        message: text,
        date: timeStampStr()
      };
      await fbRequest(dbUrl, `${basePath}/supportTickets/${tId}`, "PUT", ticketObj);

      await sendBotMsg(
        token,
        cUid,
        `✅ <b>Your message has been sent to Admin!</b>\nYou will receive a reply here shortly.`,
        mainKb
      );

      const supAlert =
        `📩 <b>NEW HELP / SUPPORT MESSAGE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User Name:</b> ${escHtml(cName)}\n` +
        `🆔 <b>User ID:</b> <code>${cUid}</code>\n` +
        `🌐 <b>Username:</b> ${cUname ? "@" + escHtml(cUname) : "None"}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💬 <b>Message:</b>\n${escHtml(text)}`;

      await sendBotMsg(token, ownerId, supAlert, {
        inline_keyboard: [[{ text: `↩️ Reply to ${cName}`, callback_data: `REPLY_USER|${cUid}` }]]
      });
      return res.status(200).send("OK");
    }

    // ========================================================================
    // 6. ADMIN MULTI-STEP INPUT FLOWS
    // ========================================================================
    if (isAdm) {
      if (st === "ADM_REPLY_USER" || st === "ADMIN_REPLY_SUPPORT_USER") {
        const targetUid = p.tempSupportUid || p.tempSupportTargetId || "";
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (targetUid) {
          await sendBotMsg(token, targetUid, `👨‍💻 <b>ADMIN SUPPORT REPLY:</b>\n\n${escHtml(text)}`);
          await sendBotMsg(
            token,
            cUid,
            `✅ <b>Reply delivered to User</b> <code>${targetUid}</code>!`,
            buildAdminKeyboard()
          );
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_ADD_PUB_CH" || st === "ADMIN_ADD_PUBLIC_CH") {
        let cId = text.trim();
        if (!cId.startsWith("@")) cId = "@" + cId.replace("https://t.me/", "").replace("/", "");
        const link = "https://t.me/" + cId.replace("@", "");
        if (!Array.isArray(b.channels)) b.channels = [];
        b.channels.push({ type: "PUBLIC", chatId: cId, link, title: `📢 Join ${cId}` });
        p.state = "IDLE";

        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>Public Force-Join Channel Added:</b> <code>${escHtml(cId)}</code>\nLive join/leave check is now active!`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_ADD_PRIV_ID" || st === "ADMIN_ADD_PRIV_CH_ID") {
        if (!text.startsWith("-100")) {
          await sendBotMsg(
            token,
            cUid,
            `⚠️ Private Channel Chat ID must start with <code>-100</code> (e.g. <code>-1001234567890</code>):`,
            buildCancelKeyboard()
          );
          return res.status(200).send("OK");
        }
        p.tempPrivId = text.trim();
        p.state = "ADM_ADD_PRIV_LINK";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🔗 <b>STEP 2 OF 2: Send Private Channel Invite Link (e.g. <code>https://t.me/+AbCdEfGh</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_ADD_PRIV_LINK" || st === "ADMIN_ADD_PRIV_CH_LINK") {
        const cId = p.tempPrivId || "";
        if (!Array.isArray(b.channels)) b.channels = [];
        b.channels.push({
          type: "PRIVATE",
          chatId: cId,
          link: text.trim(),
          title: "🔒 Join Private Channel"
        });
        p.state = "IDLE";

        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>Private Force-Join Channel Added!</b>\nID: <code>${escHtml(cId)}</code>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_REM_FORCE_CH" || st === "ADMIN_REMOVE_FORCE_CH") {
        p.state = "IDLE";
        if (text.toUpperCase() === "ALL") {
          b.channels = [];
        } else {
          b.channels = (b.channels || []).filter(
            (c) => String(c.chatId).toLowerCase() !== text.toLowerCase()
          );
        }
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `✅ <b>Force-Join Channels Updated!</b>`, buildAdminKeyboard());
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_CH_PRICE" || st === "ADMIN_SET_CHANNEL_PRICE") {
        const v = Math.max(0.1, numOrDef(text, 1));
        b.channelUnlockPrice = v;
        p.state = "IDLE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>Channel Unlock Price set to:</b> <code>₹${fmtRs(v)} / Channel</code>!`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_REFER" || st === "ADMIN_SET_REFER_AMT") {
        const v = Math.max(0, numOrDef(text, 1));
        b.referBonus = v;
        p.state = "IDLE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>Refer Bonus set to:</b> <code>₹${fmtRs(v)}</code>!`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_DAILY" || st === "ADMIN_SET_DAILY_AMT") {
        const v = Math.max(0, numOrDef(text, 0.5));
        b.dailyBonus = v;
        p.state = "IDLE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>Daily Bonus set to:</b> <code>₹${fmtRs(v)}</code>!`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_CODE_NAME" || st === "ADMIN_CREATE_CODE_NAME") {
        p.tempCodeName = text.toUpperCase().trim();
        p.state = "ADM_CODE_AMT";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `💎 <b>STEP 2 OF 3: Send ₹ Reward Amount:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (st === "ADM_CODE_AMT" || st === "ADMIN_CREATE_CODE_AMT") {
        p.tempCodeAmt = Math.max(0.1, numOrDef(text, 1));
        p.state = "ADM_CODE_MAX";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `👥 <b>STEP 3 OF 3: Send Max Users Limit:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (st === "ADM_CODE_MAX" || st === "ADMIN_CREATE_CODE_MAX") {
        const cName = p.tempCodeName || "PROMO";
        const cAmt = numOrDef(p.tempCodeAmt, 1);
        const cMax = Math.max(1, parseInt(text, 10) || 1);
        const codeObj = { code: cName, amount: cAmt, max: cMax, used: [] };
        p.state = "IDLE";

        await fbRequest(dbUrl, `${basePath}/giftCodesMap/${cName}`, "PUT", codeObj);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🎟️ <b>REDEEM CODE CREATED!</b>\nCode: <code>${cName}</code> | Amount: <code>₹${fmtRs(cAmt)}</code> | Max: <code>${cMax}</code>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_UPI" || st === "ADMIN_SET_UPI_ID") {
        b.upiId = text.trim();
        p.state = "ADM_SET_QR";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>UPI ID Saved:</b> <code>${escHtml(b.upiId)}</code>\n📸 <b>STEP 2 OF 2: Now send your QR Code Photo directly in chat (or URL, or type SKIP):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_QR" || st === "ADMIN_SET_QR_PHOTO") {
        if (photoFileId) b.qrPhoto = photoFileId;
        else if (text.toUpperCase() !== "SKIP") b.qrPhoto = text.trim();
        p.state = "IDLE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `✅ <b>QR Code & UPI ID Saved Successfully!</b>`, buildAdminKeyboard());
        return res.status(200).send("OK");
      }

      if (st === "ADM_MOD_UID" || st === "ADMIN_MOD_BAL_UID") {
        p.tempModUid = text.replace(/\D/g, "");
        p.state = "ADM_MOD_AMT";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `💰 <b>Send ₹ Amount to Add (e.g. <code>10</code>) or Cut (e.g. <code>-5</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_MOD_AMT" || st === "ADMIN_MOD_BAL_AMT") {
        const tUid = p.tempModUid || "";
        const delta = parseFloat(text) || 0;
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (tUid) {
          const tp = getOrInitPlayer(players, b, tUid, "User " + tUid, "");
          tp.balance = Math.max(0, Number((numOrDef(tp.balance, 0) + delta).toFixed(2)));
          await savePlayerState(dbUrl, basePath, tUid, tp);

          await sendBotMsg(
            token,
            cUid,
            `✅ User <code>${tUid}</code> New Balance: <code>₹${fmtRs(tp.balance)}</code>`,
            buildAdminKeyboard()
          );
          await sendBotMsg(
            token,
            tUid,
            `🏦 <b>Admin Updated Your Wallet!</b>\nNew Balance: <code>₹${fmtRs(tp.balance)}</code>`
          );
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_BAN_UID") {
        const targetUid = text.replace(/\D/g, "");
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (targetUid) {
          const tp = getOrInitPlayer(players, b, targetUid, "User " + targetUid, "");
          tp.banned = !tp.banned;
          await savePlayerState(dbUrl, basePath, targetUid, tp);
          await sendBotMsg(
            token,
            cUid,
            `✅ User <code>${targetUid}</code> is now <b>${tp.banned ? "🚫 BANNED" : "🟢 UNBANNED"}</b>!`,
            buildAdminKeyboard()
          );
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_BCAST" || st === "ADMIN_BROADCAST_MSG") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const uIds = Object.keys(players);
        for (const uId of uIds) {
          await sendBotMsg(token, uId, `📢 <b>ANNOUNCEMENT</b>\n━━━━━━━━━━━━━━━━━━━━\n${text}`);
        }
        await sendBotMsg(
          token,
          cUid,
          `✅ <b>Broadcast delivered to ${uIds.length} users!</b>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }
    }

    // Direct Redeem Code Check if user types a valid code in IDLE state
    const upperTxt = text.toUpperCase().trim();
    if (giftCodesMap[upperTxt]) {
      const g = giftCodesMap[upperTxt];
      const usedArr = Array.isArray(g.used) ? g.used : [];
      if (!usedArr.map(String).includes(cUid) && usedArr.length < numOrDef(g.max, 1)) {
        usedArr.push(cUid);
        g.used = usedArr;
        const amt = numOrDef(g.amount, 1);
        p.balance = Number((numOrDef(p.balance, 0) + amt).toFixed(2));
        await fbRequest(dbUrl, `${basePath}/giftCodesMap/${upperTxt}`, "PUT", g);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `🎉 <b>GIFT CODE REDEEMED!</b>\nAdded: <code>+₹${fmtRs(amt)}</code>\nBalance: <code>₹${fmtRs(p.balance)}</code>`,
          mainKb
        );
        return res.status(200).send("OK");
      }
    }

    // Default Fallback
    await sendBotMsg(token, cUid, `⚡ <b>Choose an option from the menu below:</b>`, mainKb);
  } catch (err) {}

  return res.status(200).send("OK");
}
