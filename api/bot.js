// ============================================================================
// 👑 FILE: api/bot.js (OR api/bot1.js) — KURMURYA 24/7 CLOUD WEBHOOK ENGINE 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot (or /api/bot1)
// Included Modules (0% Removed + Private Channel Auto Reaction & Link Builder):
// - Works with BOTH api/bot.js and api/bot1.js automatically!
// - Exact 8-Button Photo Menu + Admin Panel
// - Normal Users see ONLY Manual Services (₹1 Channel Unlock = Unlimited Manual)
// - VIP Users ONLY see: ⚡ VIP Auto Reaction & Views (₹100 Default, Admin Configurable)
// - Supports BOTH Public (@channel) & Private (-100...) Channels in Auto Mode!
// - Auto-Generates Private Invite Link (createChatInviteLink) + Auto-Joins SMM IDs
// - Auto-Builds Exact Post Link (Public t.me/user/id & Private t.me/c/id/msgId)
// - All 73+ Official Telegram Emoji Reactions + Random + Top 8 Mix
// - Custom Quantity Selector (1, 2, 3, 4, 5, 6... or ALL)
// - Live Force-Join Check (Public & Private Channels)
// - Top-Up QR Code + UPI ID + Smart 12-Digit UTR Detector + Admin Approve/Reject
// - 2-Way Help / Support Desk with Admin Direct Reply Button
// ============================================================================

const PRIMARY_FIREBASE_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const MIRROR_FIREBASE_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const SMM_PANEL_API_URL = "https://kumartelegrambot.vercel.app/api/panel";
const DEFAULT_WEBHOOK_BASE = "https://kumartelegrambot.vercel.app/api/bot";
const MASTER_ADMIN = "7335163273";
const MASTER_PIN = "252010";

// All 73+ Official Telegram Emoji Reactions Matrix
const ALL_73_EMOJI_ROWS = [
  [{ text: "🎲 RANDOM" }, { text: "🔥 TOP 8 MIX" }, { text: "❌ Cancel" }],
  [{ text: "👍" }, { text: "👎" }, { text: "❤️" }, { text: "🔥" }, { text: "🥰" }, { text: "👏" }, { text: "😁" }, { text: "🤔" }],
  [{ text: "🤯" }, { text: "😱" }, { text: "🤬" }, { text: "😢" }, { text: "🎉" }, { text: "🤩" }, { text: "🤮" }, { text: "💩" }],
  [{ text: "🙏" }, { text: "👌" }, { text: "🕊️" }, { text: "🤡" }, { text: "🥱" }, { text: "🥴" }, { text: "😍" }, { text: "🐳" }],
  [{ text: "❤️‍🔥" }, { text: "🌚" }, { text: "🌭" }, { text: "💯" }, { text: "🤣" }, { text: "⚡" }, { text: "🍌" }, { text: "🏆" }],
  [{ text: "💔" }, { text: "🤨" }, { text: "😐" }, { text: "🍓" }, { text: "🍾" }, { text: "💋" }, { text: "🖕" }, { text: "😈" }],
  [{ text: "😴" }, { text: "😭" }, { text: "🤓" }, { text: "👻" }, { text: "👨‍💻" }, { text: "👀" }, { text: "🎃" }, { text: "🙈" }],
  [{ text: "😇" }, { text: "😨" }, { text: "🤝" }, { text: "✍️" }, { text: "🤗" }, { text: "🫡" }, { text: "🎅" }, { text: "🎄" }],
  [{ text: "☃️" }, { text: "💅" }, { text: "🤪" }, { text: "🗿" }, { text: "🆒" }, { text: "💘" }, { text: "🙉" }, { text: "🦄" }],
  [{ text: "😘" }, { text: "💊" }, { text: "🙊" }, { text: "😎" }, { text: "👾" }, { text: "🤷‍♂️" }, { text: "🤷" }, { text: "😡" }]
];

// ============================================================================
// 1. FORMATTING, PARSING & VALIDATION UTILITIES
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

function isVipUser(b, p, uid) {
  if (isBotAdmin(b, uid)) return true;
  if (p && p.isVip === true) return true;
  if (Array.isArray(b.vipUsers) && b.vipUsers.map(String).includes(String(uid))) return true;
  return false;
}

function parseQuantityInput(rawQty) {
  const q = String(rawQty || "").trim().toUpperCase();
  if (q === "ALL" || q === "ALL IDS" || q === "") return "";
  const n = parseInt(q.replace(/\D/g, ""), 10);
  if (isNaN(n) || n <= 0) return "";
  return String(n);
}

function parseLineVoteModeInput(rawBtnInput) {
  const b = String(rawBtnInput || "").trim().toUpperCase();
  if (b.includes("LAST")) return "LAST";
  if (b.includes("FIRST")) return "FIRST";
  if (b.includes("MINI-APP")) return "ALL_MINIAPPS";
  const num = parseInt(b.replace(/\D/g, ""), 10);
  if (!isNaN(num) && num > 0) return String(num);
  return "LAST";
}

function parseEmojiSelectionInput(rawInput) {
  const str = String(rawInput || "").trim();
  if (str === "🎲 RANDOM" || str.toUpperCase() === "RANDOM") {
    return { emoji: "RANDOM", emojiList: [], label: "🎲 RANDOM MIX (73+ Emojis)" };
  }
  if (str === "🔥 TOP 8 MIX") {
    const top8 = ["🔥", "❤️", "🎉", "👍", "⚡", "💯", "🤩", "👏"];
    return { emoji: "🔥", emojiList: top8, label: top8.join(" ") };
  }
  const parts = str.split(/[\s,]+/).filter(Boolean);
  if (parts.length > 1) {
    return { emoji: parts[0], emojiList: parts, label: parts.join(" ") };
  }
  const single = str || "🔥";
  return { emoji: single, emojiList: [single], label: single };
}

function sanitizeFirebaseKey(rawKey) {
  return String(rawKey || "")
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]\/]/g, "_");
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

async function loadBotNodeFromCloud(botId) {
  let node = await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${botId}`, "GET");
  if (node && (node.botConfig || node.token)) {
    return { dbUrl: PRIMARY_FIREBASE_URL, basePath: `kumar_cloud/bots/${botId}`, node };
  }

  node = await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${botId}`, "GET");
  if (node && (node.botConfig || node.token)) {
    return { dbUrl: MIRROR_FIREBASE_URL, basePath: `kumar_cloud/bots/${botId}`, node };
  }

  node = await fbRequest(MIRROR_FIREBASE_URL, `unlimited_bots/${botId}`, "GET");
  if (node && (node.botConfig || node.token)) {
    return { dbUrl: MIRROR_FIREBASE_URL, basePath: `unlimited_bots/${botId}`, node };
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
// 3. TELEGRAM BOT API HELPERS + PRIVATE CHANNEL AUTO INVITE LINK GENERATOR
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

async function answerCb(token, cbId, text, showAlert = false) {
  if (!token || !cbId) return;
  return await tgPost(token, "answerCallbackQuery", {
    callback_query_id: String(cbId),
    text: text || "Done",
    show_alert: Boolean(showAlert)
  });
}

/**
 * Automatically creates or fetches a Private Channel Invite Link using Bot Admin rights!
 */
async function generatePrivateInviteLink(token, chatId) {
  if (!token || !chatId) return "";
  try {
    const createRes = await tgPost(token, "createChatInviteLink", {
      chat_id: String(chatId),
      name: "Auto Reaction & Views Sync"
    });
    if (createRes && createRes.ok && createRes.result && createRes.result.invite_link) {
      return String(createRes.result.invite_link);
    }

    const expRes = await tgPost(token, "exportChatInviteLink", {
      chat_id: String(chatId)
    });
    if (expRes && expRes.ok && typeof expRes.result === "string" && expRes.result.startsWith("http")) {
      return expRes.result;
    }

    const chatRes = await tgPost(token, "getChat", { chat_id: String(chatId) });
    if (chatRes && chatRes.ok && chatRes.result && chatRes.result.invite_link) {
      return String(chatRes.result.invite_link);
    }
  } catch (e) {}
  return "";
}

/**
 * Joins all SMM Panel Accounts into a Private Channel using the auto-generated Invite Link
 * so that Auto Reactions & Auto Views work 100% on Private Channels!
 */
async function joinPrivateChannelWithSmmPanel(inviteLink, limitCount) {
  if (!inviteLink) return false;
  try {
    const res = await fetch(SMM_PANEL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "join",
        webPin: MASTER_PIN,
        input: inviteLink,
        selectedPhones: ["ALL"],
        limitCount: limitCount || ""
      })
    });
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data);
  } catch (e) {
    return false;
  }
}

// ============================================================================
// 4. KEYBOARD BUILDERS (NORMAL vs VIP USER DYNAMIC MENUS)
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

/**
 * Normal Users DO NOT see the Auto Channel Reaction button!
 * ONLY VIP Users (and Admin) see the ⚡ VIP Auto Reaction & Views (₹100) button!
 */
function buildOrderSubKeyboard(channelUnlockPrice, autoChannelPrice, isVip) {
  const rows = [
    [{ text: "❤️ Channel Reaction" }, { text: "👀 Post Views" }],
    [{ text: "📊 Vote Poll" }, { text: "🔘 Line Vote" }],
    [
      { text: `🔓 Set / Unlock Channel (₹${fmtRs(channelUnlockPrice)})` },
      { text: "📋 My Unlocked Channels" }
    ]
  ];

  // ONLY VIP USERS CAN SEE AUTO CHANNEL REACTION & VIEWS!
  if (isVip) {
    rows.push([
      { text: `⚡ Auto Reaction & Views (₹${fmtRs(autoChannelPrice)})` },
      { text: "🤖 My Auto Channels" }
    ]);
  }

  rows.push([{ text: "🔙 Back to Main Menu" }]);
  return {
    keyboard: rows,
    resize_keyboard: true
  };
}

function buildAll73EmojiKeyboard() {
  return {
    keyboard: ALL_73_EMOJI_ROWS,
    resize_keyboard: true
  };
}

function buildQuantityKeyboard() {
  return {
    keyboard: [
      [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }, { text: "5" }],
      [{ text: "6" }, { text: "7" }, { text: "8" }, { text: "9" }, { text: "10" }],
      [{ text: "15" }, { text: "20" }, { text: "ALL" }, { text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildLineVoteModeKeyboard() {
  return {
    keyboard: [
      [{ text: "🎯 LAST BUTTON (Shevatcha)" }, { text: "1️⃣ FIRST BUTTON (Pahila)" }],
      [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }],
      [{ text: "🎮 OPEN MINI-APP BUTTON" }, { text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildAdminKeyboard() {
  return {
    keyboard: [
      [{ text: "👑 Add / Remove VIP" }, { text: "💲 Set Auto Channel ₹" }],
      [{ text: "📋 Auto Channels List" }, { text: "👑 VIP Users List" }],
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

// ============================================================================
// 5. CHANNEL KEY EXTRACTOR & ₹1 MANUAL UNLOCK HELPERS
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
  if (clean.startsWith("-100") && clean.length > 6) {
    return clean.split(/\s+/)[0];
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
    `⚠️ <i>Manual Reactions, Views, Poll Votes & Line Votes will NOT go to ${escHtml(chKey)} until you unlock it for ₹${fmtRs(unlockPrice)}. Once unlocked, you can send UNLIMITED free manual orders to this channel!</i>\n\n` +
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

async function unlockChannelForUser(dbUrl, basePath, b, p, uid, chKey, isAdm, isVip) {
  const token = b.token;
  const unlockPrice = numOrDef(b.channelUnlockPrice, 1);
  const autoPrice = numOrDef(b.autoChannelPrice, 100);

  if (isChannelUnlockedByUser(p, chKey)) {
    await sendBotMsg(
      token,
      uid,
      `✅ <b>Channel</b> <code>${escHtml(chKey)}</code> <b>is ALREADY Unlocked for manual orders!</b>`,
      buildOrderSubKeyboard(unlockPrice, autoPrice, isVip)
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
  addHistory(p, `🔓 Unlocked Manual Channel ${chKey}: -₹${fmtRs(unlockPrice)}`);

  await savePlayerState(dbUrl, basePath, uid, p);

  await sendBotMsg(
    token,
    uid,
    `🎉 <b>CHANNEL UNLOCKED PERMANENTLY!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📢 <b>Unlocked Channel:</b> <code>${escHtml(chKey)}</code>\n` +
      `💸 <b>Deducted:</b> <code>-₹${fmtRs(unlockPrice)}</code>\n` +
      `💰 <b>Remaining Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n\n` +
      `🔥 <b>You can now send UNLIMITED ❤️ 73+ Reactions, 👀 Post Views, 📊 Poll Votes & 🔘 Line Votes to</b> <code>${escHtml(chKey)}</code>!`,
    buildOrderSubKeyboard(unlockPrice, autoPrice, isVip)
  );
}

// ============================================================================
// 6. VIP AUTO CHANNEL REACTION & VIEWS ENGINE (PUBLIC + PRIVATE LINK BUILDER!)
// ============================================================================
/**
 * Triggered automatically whenever ANY new post is uploaded in a Public OR Private
 * channel where the Bot is Admin!
 * Automatically builds the exact post link (t.me/username/id OR t.me/c/id/msgId)
 * and auto-generates a Private Invite Link so SMM IDs can join and react!
 */
async function handleAutomaticChannelPost(dbUrl, basePath, b, node, channelPost) {
  if (!channelPost || !channelPost.chat || !channelPost.message_id) return;

  const token = b.token;
  const chat = channelPost.chat;
  const msgId = channelPost.message_id;
  const chatUsername = chat.username ? "@" + String(chat.username).toLowerCase() : "";
  const chatIdStr = String(chat.id || "");
  const chatTitle = chat.title || chatUsername || chatIdStr;

  const autoChannels = node.autoChannels || b.autoChannels || {};
  const keyByUsername = chatUsername ? sanitizeFirebaseKey(chatUsername) : "";
  const keyById = chatIdStr ? sanitizeFirebaseKey(chatIdStr) : "";

  const autoCfg =
    (keyByUsername && autoChannels[keyByUsername]) ||
    (keyById && autoChannels[keyById]) ||
    null;

  // If this channel is not registered for VIP Auto Reaction & Views, ignore silently
  if (!autoCfg || autoCfg.active === false) return;

  // 1. AUTO-BUILD EXACT TELEGRAM POST LINK (PUBLIC & PRIVATE CHANNELS)
  const isPrivateChannel = !chat.username;
  let postLink = "";
  let inviteLink = String(autoCfg.inviteLink || "");

  if (chat.username) {
    postLink = `https://t.me/${chat.username}/${msgId}`;
  } else if (chatIdStr.startsWith("-100")) {
    const cleanPrivateId = chatIdStr.replace(/^-100/, "");
    postLink = `https://t.me/c/${cleanPrivateId}/${msgId}`;
  } else {
    return;
  }

  const limitCount = autoCfg.limitCount || "";
  const emoji = autoCfg.emoji || "RANDOM";
  const emojiList = Array.isArray(autoCfg.emojiList) ? autoCfg.emojiList : [];
  const emojiLabel = autoCfg.emojiLabel || emoji;
  const ownerUid = String(autoCfg.ownerUid || "");
  const qtyDisplay = limitCount ? limitCount : "ALL IDs";

  // 2. FOR PRIVATE CHANNELS: AUTO-GENERATE INVITE LINK & ENSURE SMM IDs JOINED!
  if (isPrivateChannel) {
    if (!inviteLink) {
      inviteLink = await generatePrivateInviteLink(token, chatIdStr);
      if (inviteLink) {
        autoCfg.inviteLink = inviteLink;
        autoCfg.isPrivate = true;
      }
    }
    if (inviteLink && !autoCfg.smmJoined) {
      const joined = await joinPrivateChannelWithSmmPanel(inviteLink, limitCount);
      if (joined) {
        autoCfg.smmJoined = true;
      }
    }
  }

  // 3. AUTOMATICALLY TRIGGER POST VIEWS + POST REACTIONS IN PARALLEL!
  let viewsReply = "✅ Auto Views Delivered!";
  let reactReply = "✅ Auto Reactions Delivered!";

  try {
    const viewPayload = {
      action: "boost_views",
      webPin: MASTER_PIN,
      postLink: postLink,
      selectedPhones: ["ALL"],
      limitCount: limitCount,
      isPrivate: isPrivateChannel,
      inviteLink: inviteLink
    };

    const reactPayload = {
      action: "send_reaction",
      webPin: MASTER_PIN,
      postLink: postLink,
      selectedPhones: ["ALL"],
      emoji: emoji,
      limitCount: limitCount,
      isPrivate: isPrivateChannel,
      inviteLink: inviteLink
    };
    if (emojiList.length > 0) {
      reactPayload.emojiList = emojiList;
    }

    const [vRes, rRes] = await Promise.all([
      fetch(SMM_PANEL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(viewPayload)
      }).then((r) => r.json()).catch(() => null),
      fetch(SMM_PANEL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reactPayload)
      }).then((r) => r.json()).catch(() => null)
    ]);

    if (vRes && vRes.reply) viewsReply = vRes.reply;
    if (rRes && rRes.reply) reactReply = rRes.reply;
  } catch (e) {}

  // 4. UPDATE STATS & NOTIFY VIP OWNER ON TELEGRAM
  autoCfg.totalAutoPosts = numOrDef(autoCfg.totalAutoPosts, 0) + 1;
  autoCfg.lastPostLink = postLink;
  autoCfg.lastTriggeredAt = timeStampStr();
  autoCfg.isPrivate = isPrivateChannel;

  const saveKey = keyByUsername && autoChannels[keyByUsername] ? keyByUsername : keyById;
  if (saveKey) {
    await fbRequest(dbUrl, `${basePath}/autoChannels/${saveKey}`, "PUT", autoCfg);
  }

  b.totalOrders = numOrDef(b.totalOrders, 0) + 2;
  await saveBotConfig(dbUrl, basePath, b);

  if (ownerUid) {
    const players = node.playersMap || {};
    const ownerProf = players[ownerUid];
    if (ownerProf) {
      const ordId = "AUTO-" + Math.floor(10000 + Math.random() * 90000);
      if (!Array.isArray(ownerProf.orders)) ownerProf.orders = [];
      ownerProf.orders.unshift({
        id: ordId,
        type: `⚡ Auto Views + Reactions (${emojiLabel}) [${qtyDisplay}]`,
        link: postLink,
        status: "🟢 AUTO DELIVERED",
        date: timeStampStr()
      });
      if (ownerProf.orders.length > 15) ownerProf.orders = ownerProf.orders.slice(0, 15);
      addHistory(ownerProf, `⚡ Auto Views & Reactions delivered on ${postLink}`);
      await savePlayerState(dbUrl, basePath, ownerUid, ownerProf);
    }

    await sendBotMsg(
      token,
      ownerUid,
      `⚡ <b>VIP AUTO CHANNEL REACTION & VIEWS DELIVERED!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 <b>Channel:</b> ${escHtml(chatTitle)} (${isPrivateChannel ? "🔒 Private" : "📢 Public"})\n` +
        `🔗 <b>Auto-Generated Post Link:</b> <code>${escHtml(postLink)}</code>\n` +
        (isPrivateChannel && inviteLink ? `🔑 <b>Auto Invite Link:</b> <code>${escHtml(inviteLink)}</code>\n` : "") +
        `❤️ <b>Auto Reactions:</b> ${escHtml(emojiLabel)} (<code>${escHtml(qtyDisplay)}</code>)\n` +
        `👀 <b>Auto Views:</b> <code>${escHtml(qtyDisplay)}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${reactReply}`
    );
  }
}

// ============================================================================
// 7. LIVE FORCE-JOIN CHANNEL CHECKER (PUBLIC & PRIVATE CHANNELS)
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
// 8. PLAYER INITIALIZATION HELPER
// ============================================================================
function getOrInitPlayer(players, b, uid, name, uname) {
  const sUid = String(uid);
  let p = players[sUid];
  if (!p) {
    const joinBon = numOrDef(b.joinReward, 0);
    const isAlreadyVip = Array.isArray(b.vipUsers) && b.vipUsers.map(String).includes(sUid);
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
      isVip: isAlreadyVip,
      tempTopupAmt: 0,
      tempTopupTime: 0,
      tempOrderLink: "",
      tempOrderChannel: "",
      tempEmojiRaw: "RANDOM",
      tempPollOpt: "1",
      tempLineVoteMode: "LAST",
      tempAutoChannelKey: "",
      tempAutoEmojiRaw: "RANDOM",
      tempAutoIsPrivate: false,
      tempAutoInviteLink: "",
      tempSupportUid: "",
      tempPrivId: "",
      tempCodeName: "",
      tempCodeAmt: 1,
      tempModUid: "",
      unlockedChannels: [],
      autoChannels: [],
      orders: [],
      history: joinBon > 0 ? [`🎁 Welcome Bonus: +₹${fmtRs(joinBon)}`] : []
    };
    players[sUid] = p;
  } else {
    if (name && name !== "User" && name !== "Player") p.name = name;
    if (uname) p.username = uname;
    if (typeof p.balance !== "number" || isNaN(p.balance)) p.balance = Number(p.balance) || 0;
    if (!Array.isArray(p.unlockedChannels)) p.unlockedChannels = [];
    if (!Array.isArray(p.autoChannels)) p.autoChannels = [];
    if (!Array.isArray(p.orders)) p.orders = [];
    if (!Array.isArray(p.history)) p.history = [];
    if (Array.isArray(b.vipUsers) && b.vipUsers.map(String).includes(sUid)) {
      p.isVip = true;
    }
    if (!p.state && p.step) p.state = p.step;
    if (!p.state) p.state = "IDLE";
  }
  return p;
}

// ============================================================================
// 9. EXECUTE MANUAL SMM ORDER WITH QUANTITY (REACTION, VIEWS, POLL, LINE VOTE)
// ============================================================================
async function executeSmmOrderWithQuantity(
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
  emojiList,
  pollOpt,
  buttonTarget,
  limitCount,
  isVip
) {
  const token = b.token;
  const unlockPrice = numOrDef(b.channelUnlockPrice, 1);
  const autoPrice = numOrDef(b.autoChannelPrice, 100);
  const qtyDisplay = limitCount ? limitCount : "ALL IDs";

  await sendBotMsg(
    token,
    uid,
    `⏳ <b>PROCESSING ORDER ON UNLOCKED CHANNEL...</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 <b>Service:</b> ${escHtml(orderTitle)}\n` +
      `🔢 <b>Quantity:</b> <code>${escHtml(qtyDisplay)}</code>\n` +
      `📢 <b>Channel:</b> <code>${escHtml(chKey)}</code> (🟢 Unlocked)\n` +
      `🎯 <b>Post:</b> <code>${escHtml(postLink)}</code>`,
    buildOrderSubKeyboard(unlockPrice, autoPrice, isVip)
  );

  try {
    const payload = {
      action: apiAction,
      webPin: MASTER_PIN,
      postLink: postLink,
      selectedPhones: ["ALL"],
      limitCount: limitCount || ""
    };

    if (apiAction === "send_reaction") {
      payload.emoji = emoji || "RANDOM";
      if (Array.isArray(emojiList) && emojiList.length > 0) {
        payload.emojiList = emojiList;
      }
    } else if (apiAction === "vote_poll") {
      payload.optionNumber = pollOpt || "1";
    } else if (apiAction === "click_post_button") {
      payload.buttonTarget = buttonTarget || "LAST";
    }

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
    addHistory(p, `✅ ${orderTitle} (${ordId}) on ${chKey}`);

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
        `🔢 <b>Quantity:</b> <code>${escHtml(qtyDisplay)}</code>\n` +
        `📢 <b>Unlocked Channel:</b> <code>${escHtml(chKey)}</code>\n` +
        `💰 <b>Charge:</b> <code>₹0 (Channel Unlocked!)</code>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n${replyStr}`,
      buildOrderSubKeyboard(unlockPrice, autoPrice, isVip)
    );
  } catch (e) {
    await sendBotMsg(
      token,
      uid,
      `✅ <b>Order Queued for</b> <code>${escHtml(postLink)}</code>!`,
      buildOrderSubKeyboard(unlockPrice, autoPrice, isVip)
    );
  }
}

// ============================================================================
// 10. MAIN VERCEL SERVERLESS HANDLER (WORKS AS api/bot.js OR api/bot1.js!)
// ============================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Dynamically detect whether file is hosted at /api/bot or /api/bot1
  const host = req.headers?.host || "kumartelegrambot.vercel.app";
  const pathOnly = (req.url || "/api/bot").split("?")[0];
  const dynamicWebhookBase = `https://${host}${pathOnly}`;

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: dynamicWebhookBase,
      engine: "Kurmurya 24/7 Cloud Webhook Engine (Public + Private Auto Channel Reaction + 73+ Emojis)",
      status: "24/7_ONLINE"
    });
  }

  const botId = req.query?.botId ? String(req.query.botId).trim() : "";
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // --------------------------------------------------------------------------
  // A. APP / API DIRECT COMMANDS (IF APP CALLS /api/bot OR /api/bot1)
  // --------------------------------------------------------------------------
  if (!botId && body.action) {
    try {
      if (body.action === "delete_bot" && body.botId) {
        const delId = String(body.botId);
        await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${delId}`, "DELETE");
        await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${delId}`, "DELETE");
        return res.status(200).json({ success: true });
      }

      if (body.action === "connect_bot") {
        const token = String(body.token || "").trim();
        const owner = String(body.adminId || body.owner || MASTER_ADMIN).replace(/\D/g, "");
        const chPrice = numOrDef(body.channelUnlockPrice, 1);
        const autoPrice = numOrDef(body.autoChannelPrice, 100);

        const meRes = await tgPost(token, "getMe", {});
        if (!meRes || !meRes.ok) {
          return res.status(200).json({ success: false, error: "Invalid Bot Token!" });
        }
        const bId = String(meRes.result.id);
        const uname = meRes.result.username || "Bot";
        const bName = meRes.result.first_name || "Reaction Bot";

        const whUrl = `${dynamicWebhookBase}?botId=${encodeURIComponent(bId)}`;
        await tgPost(token, "setWebhook", {
          url: whUrl,
          drop_pending_updates: false,
          allowed_updates: [
            "message",
            "edited_message",
            "channel_post",
            "edited_channel_post",
            "callback_query",
            "my_chat_member"
          ]
        });

        const existing = (await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "GET")) || {};
        const cfg = existing.botConfig || {
          id: bId,
          botType: "CHANNEL_SMM",
          token,
          username: uname,
          name: bName,
          owner,
          active: true,
          webhookActive: true,
          webhookAllowedUpdatesFixed: true,
          webhookUrl: whUrl,
          channelUnlockPrice: chPrice,
          autoChannelPrice: autoPrice,
          dailyBonus: 0.5,
          referBonus: 1.0,
          joinReward: 0.0,
          upiId: "Set UPI in Admin Panel",
          qrPhoto: "",
          channels: [],
          vipUsers: [],
          totalOrders: 0
        };
        cfg.token = token;
        cfg.owner = owner;
        cfg.botType = "CHANNEL_SMM";
        cfg.webhookActive = true;
        cfg.webhookAllowedUpdatesFixed = true;
        cfg.webhookUrl = whUrl;
        cfg.active = true;

        const nodeToSave = {
          ...existing,
          botConfig: cfg,
          playersMap: existing.playersMap || {},
          autoChannels: existing.autoChannels || {},
          topupRequests: existing.topupRequests || {},
          giftCodesMap: existing.giftCodesMap || {},
          supportTickets: existing.supportTickets || {},
          offset: existing.offset || 0
        };

        await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);
        await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);

        await sendBotMsg(
          token,
          owner,
          `👑 <b>24/7 CLOUD WEBHOOK CONNECTED!</b>\n\n` +
            `🤖 <b>Bot:</b> @${escHtml(uname)}\n` +
            `🆔 <b>Admin ID:</b> <code>${owner}</code>\n` +
            `🔓 <b>Manual Channel Unlock:</b> <code>₹${fmtRs(cfg.channelUnlockPrice)} / Channel</code>\n` +
            `⚡ <b>VIP Auto Channel (Public & Private):</b> <code>₹${fmtRs(numOrDef(cfg.autoChannelPrice, 100))} / Channel</code>\n\n` +
            `👇 Send <b>/start</b> to open the Photo Menu & <b>👑 Admin Panel</b>!`,
          buildMainPhotoKeyboard(true)
        );

        return res.status(200).json({ success: true, botId: bId, botName: bName, botUsername: uname, webhookUrl: whUrl });
      }
    } catch (e) {
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // B. 24/7 TELEGRAM WEBHOOK UPDATE HANDLER (?botId=...)
  // --------------------------------------------------------------------------
  const upd = body;
  if (!botId || (!upd.message && !upd.callback_query && !upd.channel_post && !upd.edited_channel_post)) {
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

    // Ensure channel_post updates are enabled on Telegram Webhook automatically
    if (!b.webhookAllowedUpdatesFixed) {
      b.webhookAllowedUpdatesFixed = true;
      const whTarget = b.webhookUrl || `${dynamicWebhookBase}?botId=${encodeURIComponent(botId)}`;
      await tgPost(token, "setWebhook", {
        url: whTarget,
        drop_pending_updates: false,
        allowed_updates: [
          "message",
          "edited_message",
          "channel_post",
          "edited_channel_post",
          "callback_query",
          "my_chat_member"
        ]
      });
      await saveBotConfig(dbUrl, basePath, b);
    }

    // 1. DEDUPLICATE UPDATE_ID
    const incomingUpdateId = Number(upd.update_id || 0);
    const lastProcessedId = Number(node.lastWebhookUpdateId || 0);
    if (incomingUpdateId > 0 && incomingUpdateId === lastProcessedId) {
      return res.status(200).send("DUPLICATE_IGNORED");
    }
    if (incomingUpdateId > 0) {
      await fbRequest(dbUrl, `${basePath}/lastWebhookUpdateId`, "PUT", incomingUpdateId);
    }

    // 2. HANDLE AUTOMATIC CHANNEL POSTS (PUBLIC & PRIVATE CHANNELS!)
    if (upd.channel_post) {
      if (b.active !== false && b.isRunning !== false) {
        await handleAutomaticChannelPost(dbUrl, basePath, b, node, upd.channel_post);
      }
      return res.status(200).send("AUTO_CHANNEL_POST_OK");
    }

    if (!upd.message && !upd.callback_query) {
      return res.status(200).send("OK");
    }

    // Normalize settings if stored under b.settings
    if (b.settings && typeof b.settings === "object") {
      if (b.channelUnlockPrice === undefined) b.channelUnlockPrice = b.settings.channelUnlockPrice;
      if (b.autoChannelPrice === undefined) b.autoChannelPrice = b.settings.autoChannelPrice;
      if (b.dailyBonus === undefined) b.dailyBonus = b.settings.dailyBonus;
      if (b.referBonus === undefined) b.referBonus = b.settings.referBonus;
      if (!b.upiId) b.upiId = b.settings.upiId;
      if (!b.qrPhoto) b.qrPhoto = b.settings.qrPhoto;
    }

    const ownerId = String(b.owner || b.adminId || MASTER_ADMIN);
    const chUnlockPrice = numOrDef(b.channelUnlockPrice, 1);
    const autoChannelPrice = numOrDef(b.autoChannelPrice, 100);
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
    const autoChannels = node.autoChannels || {};
    const topupRequests = node.topupRequests || {};
    const giftCodesMap = node.giftCodesMap || node.redeemCodes || {};

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
    const isVip = isVipUser(b, p, cUid);
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

      if (data.startsWith("UNLOCK_CH|")) {
        const chKey = data.substring("UNLOCK_CH|".length);
        await answerCb(token, cbId, "Processing channel unlock...", false);
        await unlockChannelForUser(dbUrl, basePath, b, p, cUid, chKey, isAdm, isVip);
        return res.status(200).send("OK");
      }

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

    // Extract Channel Username OR Private Channel ID (-100...) from ANY forwarded post!
    // Supports BOTH legacy `forward_from_chat` AND Telegram Bot API 7.0+ `forward_origin.chat`!
    let forwardedChannelKey = "";
    const fwdChat =
      (msgObj.forward_origin && msgObj.forward_origin.type === "channel" && msgObj.forward_origin.chat) ||
      (msgObj.forward_from_chat && msgObj.forward_from_chat.type === "channel" && msgObj.forward_from_chat) ||
      null;

    if (fwdChat) {
      if (fwdChat.username) {
        forwardedChannelKey = "@" + String(fwdChat.username).toLowerCase();
      } else if (fwdChat.id) {
        forwardedChannelKey = String(fwdChat.id);
      }
    }

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

    // 1. LIVE FORCE-JOIN CHECK ON EVERY MESSAGE
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
    if (
      text.toLowerCase() === "❌ cancel" ||
      text.toLowerCase() === "❌ cancel operation" ||
      text.toLowerCase() === "/cancel"
    ) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, "❌ <b>Operation Cancelled.</b>", mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🔙 Back to Main Menu" || text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const uCount = Array.isArray(p.unlockedChannels) ? p.unlockedChannels.length : 0;
      const autoCount = Array.isArray(p.autoChannels) ? p.autoChannels.length : 0;

      const welcomeMsg =
        `👑 <b>WELCOME TO @${escHtml(String(b.username || "BOT").toUpperCase())}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
        `🏅 <b>Account Status:</b> ${isVip ? "👑 <b>VIP MEMBER</b>" : "🟢 Standard Member"}\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🔓 <b>Unlocked Channels:</b> <code>${uCount} Channel(s)</code>\n` +
        (isVip ? `⚡ <b>Auto Reaction Channels:</b> <code>${autoCount} Active</code>\n` : "") +
        `🏷️ <b>Manual Channel Unlock:</b> <code>₹${fmtRs(chUnlockPrice)} / Channel</code>\n\n` +
        `👇 <b>Select an option from the menu below:</b>`;

      await sendBotMsg(token, cUid, welcomeMsg, mainKb);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // 3. TOP-LEVEL PHOTO MENU BUTTONS & ORDER SERVICES (NORMAL vs VIP)
    // ========================================================================
    if (text === "👁️ Order View") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const uCount = Array.isArray(p.unlockedChannels) ? p.unlockedChannels.length : 0;
      const autoCount = Array.isArray(p.autoChannels) ? p.autoChannels.length : 0;

      let msg =
        `👁️ <b>ORDER VIEW — REACTION, VIEWS, POLL & LINE VOTE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🔓 <b>Unlocked Manual Channels:</b> <code>${uCount}</code>\n`;

      if (isVip) {
        msg +=
          `👑 <b>VIP Status:</b> <code>ACTIVE</code> | ⚡ <b>Auto Channels:</b> <code>${autoCount}</code>\n\n` +
          `📌 <b>1. Manual Channel Unlock (₹${fmtRs(chUnlockPrice)}):</b>\n` +
          `• Unlock a channel for ₹${fmtRs(chUnlockPrice)} to send unlimited manual Reactions, Views, Polls & Line Votes.\n\n` +
          `⚡ <b>2. VIP Auto Reaction & Views (₹${fmtRs(autoChannelPrice)} Recharge):</b>\n` +
          `• Supports <b>BOTH Public & Private Channels</b>!\n` +
          `• Make this Bot Admin in your Public/Private Channel & activate Auto Mode for <b>₹${fmtRs(autoChannelPrice)}</b>.\n` +
          `• Whenever ANY new post is uploaded, the bot auto-generates the post link & delivers Auto Views + Auto Reactions 24/7!\n\n`;
      } else {
        msg +=
          `\n📌 <b>Mandatory ₹${fmtRs(chUnlockPrice)} Channel Rule:</b>\n` +
          `• Set/Unlock your channel once for <b>-₹${fmtRs(chUnlockPrice)}</b>.\n` +
          `• Once unlocked, send <b>UNLIMITED ❤️ 73+ Reactions, 👀 Post Views, 📊 Poll Votes & 🔘 Line Votes</b> with custom Quantity (1, 2, 3, 4, 5...) for FREE!\n\n`;
      }

      msg += `👇 <b>Select a service below:</b>`;

      await sendBotMsg(token, cUid, msg, buildOrderSubKeyboard(chUnlockPrice, autoChannelPrice, isVip));
      return res.status(200).send("OK");
    }

    // ---- VIP EXCLUSIVE BUTTON 1: ⚡ Auto Reaction & Views (₹100) [PUBLIC + PRIVATE] ----
    if (text.startsWith("⚡ Auto Reaction & Views")) {
      if (!isVip) {
        await sendBotMsg(
          token,
          cUid,
          `🔒 <b>VIP EXCLUSIVE FEATURE!</b>\n\nOnly VIP Members approved by the Admin can use <b>⚡ Auto Channel Reaction & Views</b>.`,
          mainKb
        );
        return res.status(200).send("OK");
      }

      if (numOrDef(p.balance, 0) < autoChannelPrice) {
        await sendBotMsg(
          token,
          cUid,
          `❌ <b>INSUFFICIENT BALANCE FOR VIP AUTO CHANNEL!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `⚡ <b>Feature:</b> 24/7 Automatic Channel Views & Reactions (Public & Private)\n` +
            `🏷️ <b>Required Recharge:</b> <code>₹${fmtRs(autoChannelPrice)} / Channel</code>\n` +
            `💰 <b>Your Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n\n` +
            `⚠️ <i>Note: ₹${fmtRs(chUnlockPrice)} manual unlock does NOT apply to Automatic Mode. Please tap <b>💳 Top Up</b> and recharge ₹${fmtRs(autoChannelPrice)} first!</i>`,
          buildOrderSubKeyboard(chUnlockPrice, autoChannelPrice, isVip)
        );
        return res.status(200).send("OK");
      }

      p.state = "WAIT_VIP_AUTO_CH_INPUT";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `⚡ <b>SETUP VIP 24/7 AUTO CHANNEL (PUBLIC & PRIVATE SUPPORTED)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏷️ <b>Activation Charge:</b> <code>-₹${fmtRs(autoChannelPrice)} (One-Time per Channel)</code>\n` +
          `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n\n` +
          `📌 <b>IMPORTANT STEP 1:</b>\n` +
          `Add this Bot (<b>@${escHtml(b.username || "Bot")}</b>) as an <b>Administrator</b> in your Public or Private Channel!\n` +
          `🔒 <i>For Private Channels: Make sure "Invite Users via Link" permission is ON so the bot can auto-create the link!</i>\n\n` +
          `👇 <b>STEP 1 OF 3: Send Public <code>@username</code>, Private Channel ID (<code>-100...</code>), Private Post Link (<code>t.me/c/...</code>), OR simply FORWARD any post from your channel here:</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- VIP EXCLUSIVE BUTTON 2: 🤖 My Auto Channels ----
    if (text === "🤖 My Auto Channels") {
      if (!isVip) return res.status(200).send("OK");
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const seenIds = new Set();
      const myAutoList = [];
      for (const k of Object.keys(autoChannels)) {
        const ac = autoChannels[k];
        if (ac && (String(ac.ownerUid) === cUid || isAdm)) {
          const uniq = String(ac.chatId || ac.channelKey);
          if (!seenIds.has(uniq)) {
            seenIds.add(uniq);
            myAutoList.push(ac);
          }
        }
      }

      let sb = `🤖 <b>MY 24/7 AUTO REACTION & VIEW CHANNELS</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (myAutoList.length === 0) {
        sb += `📭 You haven't activated any Auto Channel yet!\nTap <b>⚡ Auto Reaction & Views (₹${fmtRs(autoChannelPrice)})</b> to activate 24/7 automatic reactions & views on your Public or Private channel.`;
      } else {
        myAutoList.forEach((ac, idx) => {
          sb +=
            `<b>[${idx + 1}] ${ac.isPrivate ? "🔒" : "📢"} <code>${escHtml(ac.channelKey)}</code> (${escHtml(ac.title || "Channel")})</b>\n` +
            ` ┣ ❤️ Emoji: ${escHtml(ac.emojiLabel || ac.emoji || "RANDOM")}\n` +
            ` ┣ 🔢 Quantity per Post: <code>${escHtml(ac.limitCount || "ALL IDs")}</code>\n` +
            (ac.isPrivate && ac.inviteLink ? ` ┣ 🔗 Auto Invite: <code>${escHtml(ac.inviteLink)}</code>\n` : "") +
            ` ┗ 📦 Auto Posts Delivered: <code>${numOrDef(ac.totalAutoPosts, 0)}</code> (🟢 24/7 ACTIVE)\n\n`;
        });
      }
      await sendBotMsg(token, cUid, sb, buildOrderSubKeyboard(chUnlockPrice, autoChannelPrice, isVip));
      return res.status(200).send("OK");
    }

    if (text.startsWith("🔓 Set / Unlock Channel")) {
      p.state = "WAIT_UNLOCK_CHANNEL";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔓 <b>SET / UNLOCK MANUAL CHANNEL (₹${fmtRs(chUnlockPrice)})</b>\n` +
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
      let sb = `📋 <b>MY UNLOCKED MANUAL CHANNELS</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (uArr.length === 0) {
        sb += `📭 You haven't unlocked any channel yet!\nTap <b>🔓 Set / Unlock Channel (₹${fmtRs(chUnlockPrice)})</b> first.`;
      } else {
        uArr.forEach((ch, idx) => {
          sb += `${idx + 1}. <code>${escHtml(ch)}</code> — 🟢 <b>UNLIMITED MANUAL ACTIVE</b>\n`;
        });
      }
      await sendBotMsg(token, cUid, sb, buildOrderSubKeyboard(chUnlockPrice, autoChannelPrice, isVip));
      return res.status(200).send("OK");
    }

    if (text === "❤️ Channel Reaction") {
      p.state = "WAIT_REACT_LINK";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `❤️ <b>ORDER ALL 73+ CHANNEL REACTIONS</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ <i>Channel must be unlocked (₹${fmtRs(chUnlockPrice)}) first. Once unlocked, reactions are 100% FREE & Unlimited!</i>\n\n` +
          `👇 <b>STEP 1 OF 3: Send your Channel Post Link:</b>\n` +
          `• Example: <code>https://t.me/mychannel/105</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "👀 Post Views") {
      p.state = "WAIT_VIEWS_LINK";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `👀 <b>ORDER CHANNEL POST VIEWS</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ <i>Channel must be unlocked (₹${fmtRs(chUnlockPrice)}) first. Once unlocked, views are 100% FREE & Unlimited!</i>\n\n` +
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
          `👇 <b>STEP 1 OF 3: Send your Telegram Poll Post Link:</b>\n` +
          `• Example: <code>https://t.me/mychannel/108</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "🔘 Line Vote") {
      p.state = "WAIT_LINEVOTE_LINK";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔘 <b>ORDER LINE VOTE (POST INLINE BUTTON CLICKER)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ <i>Channel must be unlocked (₹${fmtRs(chUnlockPrice)}) first. Once unlocked, Line Votes are 100% FREE & Unlimited!</i>\n\n` +
          `👇 <b>STEP 1 OF 3: Send the Channel Post Link that has Inline Buttons:</b>\n` +
          `• Example: <code>https://t.me/mychannel/105</code>`,
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
        sb += `📭 No orders placed yet! Tap <b>👁️ Order View</b> to start.`;
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
      const autoCount = Array.isArray(p.autoChannels) ? p.autoChannels.length : 0;
      const oCount = Array.isArray(p.orders) ? p.orders.length : 0;

      const prof =
        `👤 <b>MY ACCOUNT PROFILE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧑 <b>Name:</b> ${escHtml(cName)}\n` +
        `🆔 <b>User ID:</b> <code>${cUid}</code>\n` +
        `🏅 <b>Membership:</b> ${isVip ? "👑 <b>VIP MEMBER</b>" : "🟢 Standard Member"}\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🔓 <b>Unlocked Manual Channels:</b> <code>${uCount} Channel(s)</code>\n` +
        (isVip ? `⚡ <b>Active Auto Channels:</b> <code>${autoCount} Channel(s)</code>\n` : "") +
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
        `🔓 <b>Manual Channel Unlock:</b> <code>₹${fmtRs(chUnlockPrice)} = 1 Channel</code>\n` +
        (isVip
          ? `⚡ <b>VIP Auto Channel Rate:</b> <code>₹${fmtRs(autoChannelPrice)} = 24/7 Auto Views & Reactions</code>\n`
          : "") +
        `\n📌 <b>STEP 1 OF 2:</b>\n` +
        `Scan the QR Code or pay to the UPI ID above, then <b>send the Amount (₹) you paid</b> below (e.g. <code>${isVip ? fmtRs(autoChannelPrice) : "10"}</code>):`;

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
    // 4. ADMIN PANEL MENU BUTTONS (INCLUDING VIP & AUTO CHANNEL CONTROLS)
    // ========================================================================
    if (isAdm) {
      if (text === "👑 Admin Panel" || text === "👑 Pro Admin Panel" || text === "/admin") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const vipCount = Array.isArray(b.vipUsers) ? b.vipUsers.length : 0;
        const autoChCount = Object.keys(autoChannels).length;

        await sendBotMsg(
          token,
          cUid,
          `👑 <b>MASTER ADMIN PANEL (24/7 CLOUD)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔓 <b>Manual Channel Unlock:</b> <code>₹${fmtRs(chUnlockPrice)}</code>\n` +
            `⚡ <b>VIP Auto Channel Price:</b> <code>₹${fmtRs(autoChannelPrice)}</code>\n` +
            `👑 <b>VIP Members:</b> <code>${vipCount} Users</code>\n` +
            `🤖 <b>Active Auto Channels:</b> <code>${autoChCount} Nodes</code>\n` +
            `👥 <b>Refer Bonus:</b> <code>₹${fmtRs(referBonus)}</code> | 🎁 <b>Daily:</b> <code>₹${fmtRs(dailyBonus)}</code>\n` +
            `💳 <b>UPI ID:</b> <code>${escHtml(b.upiId || "Not Set")}</code>\n\n` +
            `👇 <b>Select an Admin tool below:</b>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "👑 Add / Remove VIP") {
        p.state = "ADM_TOGGLE_VIP_UID";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `👑 <b>ADD / REMOVE VIP USER</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `• Normal users CANNOT see the <b>⚡ Auto Reaction & Views</b> button.\n` +
            `• Only VIP users added here will see and use the Automatic Channel Reaction & Views feature!\n\n` +
            `👇 <b>Send the Target User's Telegram ID to Make VIP (or Remove VIP):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "👑 VIP Users List") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const vList = Array.isArray(b.vipUsers) ? b.vipUsers : [];
        let sb = `👑 <b>ACTIVE VIP MEMBERS LIST (${vList.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        if (vList.length === 0) {
          sb += `📭 No VIP users added yet. Tap <b>👑 Add / Remove VIP</b> to add one!`;
        } else {
          vList.forEach((vId, idx) => {
            const vp = players[vId];
            sb += `${idx + 1}. <code>${vId}</code> — ${vp ? escHtml(vp.name) : "VIP User"} (💰 ₹${vp ? fmtRs(vp.balance) : "0"})\n`;
          });
        }
        await sendBotMsg(token, cUid, sb, buildAdminKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "💲 Set Auto Channel ₹") {
        p.state = "ADM_SET_AUTO_CH_PRICE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `💲 <b>SET VIP AUTO CHANNEL RECHARGE PRICE (₹)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Current Auto Channel Price: <code>₹${fmtRs(autoChannelPrice)} / Channel</code>\n\n` +
            `👇 <b>Send the new ₹ price for activating 24/7 Auto Channel Reaction & Views (e.g. <code>100</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "📋 Auto Channels List") {
        p.state = "ADM_REMOVE_AUTO_CH";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const keys = Object.keys(autoChannels);
        let sb = `🤖 <b>ALL 24/7 AUTO REACTION CHANNELS (${keys.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        if (keys.length === 0) {
          p.state = "IDLE";
          await savePlayerState(dbUrl, basePath, cUid, p);
          sb += `📭 No Auto Channels registered yet.`;
          await sendBotMsg(token, cUid, sb, buildAdminKeyboard());
          return res.status(200).send("OK");
        }
        keys.forEach((k, idx) => {
          const ac = autoChannels[k];
          sb +=
            `<b>[${idx + 1}] ${ac.isPrivate ? "🔒" : "📢"} <code>${escHtml(ac.channelKey)}</code> (${escHtml(ac.title || "Channel")})</b>\n` +
            ` ┣ 👤 Owner ID: <code>${ac.ownerUid}</code>\n` +
            ` ┣ ❤️ Emoji: ${escHtml(ac.emojiLabel || ac.emoji)} | 🔢 Qty: <code>${escHtml(ac.limitCount || "ALL")}</code>\n` +
            (ac.inviteLink ? ` ┣ 🔗 Invite: <code>${escHtml(ac.inviteLink)}</code>\n` : "") +
            ` ┗ 📦 Auto Posts: <code>${numOrDef(ac.totalAutoPosts, 0)}</code>\n\n`;
        });
        sb += `👇 <i>To remove an Auto Channel, send its <code>@username</code> or <code>-100...</code> ID now, or tap ❌ Cancel:</i>`;
        await sendBotMsg(token, cUid, sb, buildCancelKeyboard());
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
          `💲 <b>Send new Manual Channel Unlock Price in ₹ (e.g. <code>1</code> or <code>2</code>):</b>`,
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
        const vipCount = Array.isArray(b.vipUsers) ? b.vipUsers.length : 0;
        const autoChCount = Object.keys(autoChannels).length;
        await sendBotMsg(
          token,
          cUid,
          `📊 <b>LIVE 24/7 BOT STATISTICS</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 <b>Total Users:</b> <code>${Object.keys(players).length}</code>\n` +
            `👑 <b>VIP Users:</b> <code>${vipCount}</code>\n` +
            `🤖 <b>Active Auto Channels:</b> <code>${autoChCount}</code>\n` +
            `📦 <b>Total Orders:</b> <code>${numOrDef(b.totalOrders, 0)}</code>\n` +
            `📢 <b>Force Channels:</b> <code>${chs.length}</code>\n` +
            `🔓 <b>Manual Unlock Rate:</b> <code>₹${fmtRs(chUnlockPrice)}</code>\n` +
            `⚡ <b>VIP Auto Channel Rate:</b> <code>₹${fmtRs(autoChannelPrice)}</code>`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }
    }

    // ========================================================================
    // 5. MULTI-STEP WORKFLOWS (VIP AUTO CHANNEL + 73+ EMOJIS + QUANTITY + TOPUP)
    // ========================================================================
    const st = String(p.state || "IDLE").toUpperCase();

    // ---- SMART FAIL-SAFE: 10-16 DIGIT UTR DETECTOR ----
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

    if (st === "WAIT_TOPUP_AMOUNT") {
      const amt = parseFloat(text);
      if (isNaN(amt) || amt <= 0) {
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Invalid Amount!</b> Please enter only the numeric ₹ amount you paid (e.g. <code>100</code>):`,
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

    // ---- VIP FLOW: SETUP 24/7 AUTO CHANNEL (PUBLIC & PRIVATE + AUTO INVITE LINK!) ----
    if (st === "WAIT_VIP_AUTO_CH_INPUT") {
      const rawCh = forwardedChannelKey || extractChannelKey(text);
      if (!rawCh) {
        await sendBotMsg(
          token,
          cUid,
          `❌ <b>Invalid Channel!</b>\nPlease send your Public <code>@username</code>, Private ID (<code>-100...</code>), Private Post Link (<code>t.me/c/...</code>), or <b>forward any post</b> from your channel:`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      // 1. Verify Bot is added as Admin in the target Public/Private Channel!
      const botNumericId = Number(String(token).split(":")[0]);
      const memberCheck = await tgPost(token, "getChatMember", {
        chat_id: rawCh,
        user_id: botNumericId
      });

      if (!memberCheck || !memberCheck.ok || !memberCheck.result || memberCheck.result.status !== "administrator") {
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>BOT IS NOT ADMIN IN ${escHtml(rawCh)}!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `To detect new posts automatically 24/7, you MUST add <b>@${escHtml(b.username || "Bot")}</b> as an <b>Administrator</b> in <code>${escHtml(rawCh)}</code> first!\n\n` +
            `👉 <i>Add the bot as Admin in your channel, then forward a post or send <code>${escHtml(rawCh)}</code> again:</i>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      // 2. Detect Public vs Private Channel & Auto-Generate Invite Link for Private Channels!
      const chatRes = await tgPost(token, "getChat", { chat_id: rawCh });
      const chatInfo = chatRes && chatRes.ok ? chatRes.result : {};
      const isPriv = !chatInfo.username;
      let autoInviteLink = "";

      if (isPriv) {
        autoInviteLink = await generatePrivateInviteLink(token, chatInfo.id || rawCh);
        if (!autoInviteLink) {
          await sendBotMsg(
            token,
            cUid,
            `⚠️ <b>PRIVATE CHANNEL PERMISSION NEEDED!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `Bot is Admin in <b>${escHtml(chatInfo.title || rawCh)}</b>, but could not auto-create an Invite Link.\n` +
              `👉 Please enable <b>"Invite Users via Link"</b> permission for <b>@${escHtml(b.username || "Bot")}</b> in your Private Channel settings, then send <code>${escHtml(rawCh)}</code> again!`,
            buildCancelKeyboard()
          );
          return res.status(200).send("OK");
        }
      }

      p.tempAutoChannelKey = rawCh;
      p.tempAutoIsPrivate = isPriv;
      p.tempAutoInviteLink = autoInviteLink;
      p.state = "WAIT_VIP_AUTO_EMOJI";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `✅ <b>BOT ADMIN VERIFIED IN ${isPriv ? "🔒 PRIVATE" : "📢 PUBLIC"} CHANNEL!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Channel:</b> ${escHtml(chatInfo.title || rawCh)} (<code>${escHtml(rawCh)}</code>)\n` +
          (isPriv ? `🔗 <b>Auto-Generated Invite Link:</b> <code>${escHtml(autoInviteLink)}</code> ✅\n` : "") +
          `\n❤️ <b>STEP 2 OF 3: Which Emoji Reactions should come automatically on every new post?</b>\n` +
          `Select from All 73+ Emojis below, tap <b>🎲 RANDOM</b> / <b>🔥 TOP 8 MIX</b>, or type multiple emojis separated by space:`,
        buildAll73EmojiKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_VIP_AUTO_EMOJI") {
      p.tempAutoEmojiRaw = text || "RANDOM";
      p.state = "WAIT_VIP_AUTO_QTY";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔢 <b>STEP 3 OF 3: How many Auto Views & Auto Reactions per new post?</b>\n` +
          `👉 <b>Type any number (1, 2, 3, 4, 5, 6...)</b> or tap <b>ALL</b> below:`,
        buildQuantityKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_VIP_AUTO_QTY") {
      const chKey = p.tempAutoChannelKey || "";
      const parsedEm = parseEmojiSelectionInput(p.tempAutoEmojiRaw || "RANDOM");
      const limitCount = parseQuantityInput(text);
      const qtyDisplay = limitCount ? limitCount : "ALL IDs";

      if (numOrDef(p.balance, 0) < autoChannelPrice) {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          cUid,
          `❌ <b>Insufficient Balance!</b> You need <code>₹${fmtRs(autoChannelPrice)}</code> to activate Auto Channel.`,
          buildOrderSubKeyboard(chUnlockPrice, autoChannelPrice, isVip)
        );
        return res.status(200).send("OK");
      }

      // Fetch full chat details (both @username and -100 ID) so auto-detector matches either!
      const chatInfoRes = await tgPost(token, "getChat", { chat_id: chKey });
      const chatObj = chatInfoRes && chatInfoRes.ok ? chatInfoRes.result : {};
      const cTitle = chatObj.title || chKey;
      const unameKey = chatObj.username ? "@" + String(chatObj.username).toLowerCase() : "";
      const idKey = chatObj.id ? String(chatObj.id) : "";
      const isPriv = !chatObj.username;
      let inviteLink = String(p.tempAutoInviteLink || "");

      if (isPriv && !inviteLink) {
        inviteLink = await generatePrivateInviteLink(token, idKey || chKey);
      }

      // For Private Channels: Auto-Join SMM Panel Accounts immediately via generated Invite Link!
      let smmJoined = false;
      if (isPriv && inviteLink) {
        smmJoined = await joinPrivateChannelWithSmmPanel(inviteLink, limitCount);
      }

      // Deduct ₹100 (autoChannelPrice)
      p.balance = Number((numOrDef(p.balance, 0) - autoChannelPrice).toFixed(2));
      p.state = "IDLE";
      if (!Array.isArray(p.autoChannels)) p.autoChannels = [];
      if (!p.autoChannels.includes(chKey)) p.autoChannels.push(chKey);
      addHistory(p, `⚡ Activated VIP ${isPriv ? "Private" : "Public"} Auto Channel ${chKey}: -₹${fmtRs(autoChannelPrice)}`);

      const autoRecord = {
        channelKey: chKey,
        title: cTitle,
        chatId: idKey,
        username: unameKey,
        isPrivate: isPriv,
        inviteLink: inviteLink,
        smmJoined: smmJoined,
        ownerUid: cUid,
        ownerName: cName,
        emoji: parsedEm.emoji,
        emojiList: parsedEm.emojiList,
        emojiLabel: parsedEm.label,
        limitCount: limitCount,
        pricePaid: autoChannelPrice,
        totalAutoPosts: 0,
        active: true,
        createdAt: timeStampStr()
      };

      const mainKey = sanitizeFirebaseKey(chKey);
      await fbRequest(dbUrl, `${basePath}/autoChannels/${mainKey}`, "PUT", autoRecord);
      if (unameKey && sanitizeFirebaseKey(unameKey) !== mainKey) {
        await fbRequest(dbUrl, `${basePath}/autoChannels/${sanitizeFirebaseKey(unameKey)}`, "PUT", autoRecord);
      }
      if (idKey && sanitizeFirebaseKey(idKey) !== mainKey) {
        await fbRequest(dbUrl, `${basePath}/autoChannels/${sanitizeFirebaseKey(idKey)}`, "PUT", autoRecord);
      }

      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🎉 <b>VIP 24/7 AUTO CHANNEL ACTIVATED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Channel:</b> ${escHtml(cTitle)} (${isPriv ? "🔒 Private" : "📢 Public"} | <code>${escHtml(chKey)}</code>)\n` +
          (isPriv && inviteLink ? `🔗 <b>Auto Invite Link:</b> <code>${escHtml(inviteLink)}</code>\n🤖 <b>SMM Accounts Joined:</b> ${smmJoined ? "🟢 YES" : "⏳ On First Post"}\n` : "") +
          `❤️ <b>Auto Reactions:</b> ${escHtml(parsedEm.label)}\n` +
          `👀 <b>Auto Views + Reactions Qty:</b> <code>${escHtml(qtyDisplay)} / Post</code>\n` +
          `💸 <b>Recharge Deducted:</b> <code>-₹${fmtRs(autoChannelPrice)}</code>\n` +
          `💰 <b>Remaining Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n\n` +
          `🔥 <b>Now upload ANY new post in <code>${escHtml(cTitle)}</code> — the bot will auto-build the post link & deliver Views + Reactions within seconds!</b>`,
        buildOrderSubKeyboard(chUnlockPrice, autoChannelPrice, isVip)
      );
      return res.status(200).send("OK");
    }

    // ---- STEP: MANUAL UNLOCK CHANNEL (₹1) ----
    if (st === "WAIT_UNLOCK_CHANNEL" || st === "WAIT_UNLOCK_CHANNEL_INPUT") {
      const chKey = forwardedChannelKey || extractChannelKey(text);
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
      await unlockChannelForUser(dbUrl, basePath, b, p, cUid, chKey, isAdm, isVip);
      return res.status(200).send("OK");
    }

    // ---- FLOW 1: ❤️ CHANNEL REACTION (LINK -> ALL 73+ EMOJIS -> QUANTITY) ----
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
        `❤️ <b>CHANNEL UNLOCKED (${escHtml(chKey)}) — STEP 2 OF 3</b>\n` +
          `👇 <b>Select any Reaction from All 73+ Emojis below</b> (or tap <b>🎲 RANDOM</b> / <b>🔥 TOP 8 MIX</b>, or type multiple emojis separated by space):`,
        buildAll73EmojiKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_REACT_EMOJI" || st === "WAIT_REACTION_EMOJI") {
      p.tempEmojiRaw = text || "RANDOM";
      p.state = "WAIT_REACT_QTY";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔢 <b>STEP 3 OF 3: How many Reactions do you want?</b>\n` +
          `👉 <b>Type any number (1, 2, 3, 4, 5, 6...)</b> or tap a quick button below:`,
        buildQuantityKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_REACT_QTY") {
      const link = p.tempOrderLink || "";
      const chKey = p.tempOrderChannel || "";
      const parsedEm = parseEmojiSelectionInput(p.tempEmojiRaw || "RANDOM");
      const limitCount = parseQuantityInput(text);
      const qtyLabel = limitCount ? `${limitCount} Reactions` : "ALL IDs";

      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await executeSmmOrderWithQuantity(
        dbUrl,
        basePath,
        b,
        p,
        cUid,
        `❤️ Channel Reaction (${parsedEm.label}) [${qtyLabel}]`,
        link,
        chKey,
        "send_reaction",
        parsedEm.emoji,
        parsedEm.emojiList,
        "",
        "LAST",
        limitCount,
        isVip
      );
      return res.status(200).send("OK");
    }

    // ---- FLOW 2: 👀 POST VIEWS (LINK -> QUANTITY) ----
    if (st === "WAIT_VIEWS_LINK") {
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
      p.state = "WAIT_VIEWS_QTY";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `👀 <b>CHANNEL UNLOCKED (${escHtml(chKey)}) — STEP 2 OF 2</b>\n` +
          `🔢 <b>How many Views do you want?</b>\n` +
          `👉 <b>Type any number (1, 2, 3, 4, 5, 6...)</b> or tap a button below:`,
        buildQuantityKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_VIEWS_QTY") {
      const link = p.tempOrderLink || "";
      const chKey = p.tempOrderChannel || "";
      const limitCount = parseQuantityInput(text);
      const qtyLabel = limitCount ? `${limitCount} Views` : "ALL IDs";

      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await executeSmmOrderWithQuantity(
        dbUrl,
        basePath,
        b,
        p,
        cUid,
        `👀 Post Views [${qtyLabel}]`,
        link,
        chKey,
        "boost_views",
        "",
        [],
        "",
        "LAST",
        limitCount,
        isVip
      );
      return res.status(200).send("OK");
    }

    // ---- FLOW 3: 📊 VOTE POLL (LINK -> OPTION NUMBER -> QUANTITY) ----
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
        `📊 <b>CHANNEL UNLOCKED (${escHtml(chKey)}) — STEP 2 OF 3</b>\n` +
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
      p.tempPollOpt = opt;
      p.state = "WAIT_POLL_QTY";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔢 <b>STEP 3 OF 3: How many Poll Votes do you want?</b>\n` +
          `👉 <b>Type any number (1, 2, 3, 4, 5, 6...)</b> or tap a button below:`,
        buildQuantityKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_POLL_QTY") {
      const link = p.tempOrderLink || "";
      const chKey = p.tempOrderChannel || "";
      const opt = p.tempPollOpt || "1";
      const limitCount = parseQuantityInput(text);
      const qtyLabel = limitCount ? `${limitCount} Votes` : "ALL IDs";

      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await executeSmmOrderWithQuantity(
        dbUrl,
        basePath,
        b,
        p,
        cUid,
        `📊 Vote Poll (Option #${opt}) [${qtyLabel}]`,
        link,
        chKey,
        "vote_poll",
        "",
        [],
        opt,
        "LAST",
        limitCount,
        isVip
      );
      return res.status(200).send("OK");
    }

    // ---- FLOW 4: 🔘 LINE VOTE (POST INLINE BUTTON CLICKER: LINK -> BUTTON -> QUANTITY) ----
    if (st === "WAIT_LINEVOTE_LINK") {
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
      p.state = "WAIT_LINEVOTE_MODE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔘 <b>CHANNEL UNLOCKED (${escHtml(chKey)}) — STEP 2 OF 3</b>\n` +
          `👇 <b>Which Inline Button on the post should be clicked for Line Vote?</b>\n` +
          `Tap <b>🎯 LAST BUTTON (Shevatcha)</b>, <b>1️⃣ FIRST BUTTON (Pahila)</b>, or send button number (<code>1, 2, 3...</code>):`,
        buildLineVoteModeKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_LINEVOTE_MODE") {
      p.tempLineVoteMode = parseLineVoteModeInput(text);
      p.state = "WAIT_LINEVOTE_QTY";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔢 <b>STEP 3 OF 3: How many Line Votes (Button Clicks) do you want?</b>\n` +
          `👉 <b>Type any number (1, 2, 3, 4, 5, 6...)</b> or tap a button below:`,
        buildQuantityKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_LINEVOTE_QTY") {
      const link = p.tempOrderLink || "";
      const chKey = p.tempOrderChannel || "";
      const btnMode = p.tempLineVoteMode || "LAST";
      const limitCount = parseQuantityInput(text);
      const qtyLabel = limitCount ? `${limitCount} Line Votes` : "ALL IDs";

      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await executeSmmOrderWithQuantity(
        dbUrl,
        basePath,
        b,
        p,
        cUid,
        `🔘 Line Vote (Btn: ${btnMode}) [${qtyLabel}]`,
        link,
        chKey,
        "click_post_button",
        "",
        [],
        "",
        btnMode,
        limitCount,
        isVip
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
    // 6. ADMIN MULTI-STEP INPUT FLOWS (VIP + AUTO CHANNEL PRICE + ALL TOOLS)
    // ========================================================================
    if (isAdm) {
      if (st === "ADM_TOGGLE_VIP_UID") {
        const targetUid = text.replace(/\D/g, "");
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (!targetUid) {
          await sendBotMsg(token, cUid, `⚠️ Invalid User ID!`, buildAdminKeyboard());
          return res.status(200).send("OK");
        }

        if (!Array.isArray(b.vipUsers)) b.vipUsers = [];
        const tp = getOrInitPlayer(players, b, targetUid, "User " + targetUid, "");
        const idx = b.vipUsers.map(String).indexOf(targetUid);

        if (idx === -1) {
          b.vipUsers.push(targetUid);
          tp.isVip = true;
          await saveBotConfig(dbUrl, basePath, b);
          await savePlayerState(dbUrl, basePath, targetUid, tp);

          await sendBotMsg(
            token,
            cUid,
            `👑 <b>VIP ACCESS GRANTED!</b>\nUser <code>${targetUid}</code> is now a <b>VIP Member</b> and can see & use <b>⚡ Auto Reaction & Views (₹${fmtRs(autoChannelPrice)})</b>!`,
            buildAdminKeyboard()
          );
          await sendBotMsg(
            token,
            targetUid,
            `👑 <b>CONGRATULATIONS! YOU ARE NOW A VIP MEMBER!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `Admin has unlocked <b>⚡ VIP 24/7 Auto Channel Reaction & Views</b> (Public & Private Channels) in your <b>👁️ Order View</b> menu!\n\n` +
              `👉 Tap <b>👁️ Order View</b> to see your new VIP button!`
          );
        } else {
          b.vipUsers.splice(idx, 1);
          tp.isVip = false;
          await saveBotConfig(dbUrl, basePath, b);
          await savePlayerState(dbUrl, basePath, targetUid, tp);

          await sendBotMsg(
            token,
            cUid,
            `🔒 User <code>${targetUid}</code> removed from VIP list (now Standard User).`,
            buildAdminKeyboard()
          );
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_AUTO_CH_PRICE") {
        const v = Math.max(1, numOrDef(text, 100));
        b.autoChannelPrice = v;
        p.state = "IDLE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);

        await sendBotMsg(
          token,
          cUid,
          `✅ <b>VIP Auto Channel Price updated to:</b> <code>₹${fmtRs(v)} / Channel</code>!`,
          buildAdminKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_REMOVE_AUTO_CH") {
        const rmKey = sanitizeFirebaseKey(extractChannelKey(text) || text);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (rmKey && autoChannels[rmKey]) {
          const targetObj = autoChannels[rmKey];
          await fbRequest(dbUrl, `${basePath}/autoChannels/${rmKey}`, "DELETE");
          if (targetObj.chatId) {
            await fbRequest(dbUrl, `${basePath}/autoChannels/${sanitizeFirebaseKey(targetObj.chatId)}`, "DELETE");
          }
          if (targetObj.username) {
            await fbRequest(dbUrl, `${basePath}/autoChannels/${sanitizeFirebaseKey(targetObj.username)}`, "DELETE");
          }
          await sendBotMsg(
            token,
            cUid,
            `🗑️ <b>Removed Auto Channel:</b> <code>${escHtml(text)}</code>`,
            buildAdminKeyboard()
          );
        } else {
          await sendBotMsg(token, cUid, `ℹ️ Channel not found in Auto list.`, buildAdminKeyboard());
        }
        return res.status(200).send("OK");
      }

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
          `✅ <b>Public Force-Join Channel Added:</b> <code>${escHtml(cId)}</code>`,
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
          `✅ <b>Manual Channel Unlock Price set to:</b> <code>₹${fmtRs(v)} / Channel</code>!`,
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
          `💰 <b>Send ₹ Amount to Add (e.g. <code>100</code>) or Cut (e.g. <code>-50</code>):</b>`,
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
