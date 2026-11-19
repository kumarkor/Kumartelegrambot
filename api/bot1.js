// ============================================================================
// 👑 FILE: api/bot1.js — 24/7 FULLY AUTOMATIC SMART DICE GIVEAWAY ENGINE 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot1
// Cron URL: https://kumartelegrambot.vercel.app/api/bot1?cron=1
// Language: 100% English (0% Marathi)
//
// CORE RULES & 10 PRO AUTOMATED FEATURES:
// 1. 100% Automatic Real Telegram Post Reaction Tracker (No Refresh Button!)
// 2. Auto 10-Second Live Countdown when Reactions hit 100% -> Opens Numbers
// 3. Scheduled Post Upload Time (e.g. 8.09 pm uploads post; whenever reactions
//    finish—even at 8.30 pm—number selection opens automatically in 10 seconds)
// 4. Smart Multi-Dice Mathematics (1 Dice: 1-6 | 2 Dice: 2-12 | 3 Dice: 3-18...)
// 5. Creator-Only Dice Roll Lock (Users pick numbers; ONLY Creator rolls Dice!)
// 6. Private Telegram Mini-App Verification (`web_app` — URL is never public)
// 7. 1-User 1-Device Anti-Cheat (403 BANNED users strictly blocked from picking)
// 8. Secret Winner Claim Code (`CLAIM-XXXXXX`) sent to Creator & Winner in DM
// 9. Auto-Pin Active Giveaway Post + Full-Screen Telegram Celebration Effects
// 10. Live Number Swap, Lock/Unlock Board, 1-Click Clone & Hall of Fame Board
// ============================================================================

const PRIMARY_FIREBASE_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const MIRROR_FIREBASE_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const VERIFY_WEB_BASE = "https://verification-sigma-flax.vercel.app/";
const VERIFY_API_BASE = "https://verification-sigma-flax.vercel.app/api/verify";
const MASTER_ADMIN = "7335163273";

// Official Telegram Full-Screen Message Effects
const TG_EFFECTS = {
  FIRE: "5104841245755180586",
  PARTY: "5046509860389126442",
  HEART: "5159385139981059251",
  LIKE: "5107584321108051014"
};

// ============================================================================
// 1. UTILITIES, SMART DICE MATHEMATICS & IST SCHEDULER ENGINE
// ============================================================================
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function numOrDef(val, defVal) {
  const n = Number(val);
  return val !== undefined && val !== null && val !== "" && !isNaN(n) ? n : defVal;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateSecretClaimCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CLAIM-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Smart Mathematical Dice Range Calculator:
 * - 1 Dice -> min: 1, max: 6,  totalNumbers: 6  (1, 2, 3, 4, 5, 6)
 * - 2 Dice -> min: 2, max: 12, totalNumbers: 11 (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
 * - 3 Dice -> min: 3, max: 18, totalNumbers: 16 (3 to 18)
 * - 4 Dice -> min: 4, max: 24, totalNumbers: 21 (4 to 24)
 * - 5 Dice -> min: 5, max: 30, totalNumbers: 26 (5 to 30)
 * - 6 Dice -> min: 6, max: 36, totalNumbers: 31 (6 to 36)
 */
function getSmartDiceConfig(diceCountInput) {
  const diceCount = Math.min(6, Math.max(1, parseInt(diceCountInput, 10) || 1));
  const minNumber = diceCount;
  const maxNumber = diceCount * 6;
  const totalNumbers = maxNumber - minNumber + 1;
  const numbersList = [];
  for (let n = minNumber; n <= maxNumber; n++) {
    numbersList.push(n);
  }
  return {
    diceCount,
    minNumber,
    maxNumber,
    totalNumbers,
    numbersList,
    diceEmojis: "🎲".repeat(diceCount)
  };
}

function getIstNowDate() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

function formatIstFullTime(epochMs) {
  if (!epochMs || epochMs <= 0) return "Instant (NOW)";
  const istDate = new Date(Number(epochMs) + 5.5 * 60 * 60 * 1000);
  let hrs = istDate.getUTCHours();
  const mins = String(istDate.getUTCMinutes()).padStart(2, "0");
  const secs = String(istDate.getUTCSeconds()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  const hStr = String(hrs).padStart(2, "0");
  return `${hStr}:${mins}:${secs} ${ampm} IST`;
}

function formatIstShortTime(epochMs) {
  if (!epochMs || epochMs <= 0) return "Instant (NOW)";
  const istDate = new Date(Number(epochMs) + 5.5 * 60 * 60 * 1000);
  let hrs = istDate.getUTCHours();
  const mins = String(istDate.getUTCMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  const hStr = String(hrs).padStart(2, "0");
  return `${hStr}:${mins} ${ampm} IST`;
}

/**
 * Parses post upload time strings like "8.09 pm", "8:09 PM", "20:09", or "NOW"
 */
function parseUserTimeInputToEpoch(rawInput) {
  const str = String(rawInput || "").trim().toLowerCase();
  if (
    !str ||
    str === "now" ||
    str.includes("instant") ||
    str.includes("immediately") ||
    str.includes("skip")
  ) {
    return { ok: true, epochMs: 0, label: "Instant (NOW)" };
  }

  const m = str.match(/^(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?$/i);
  if (!m) {
    return {
      ok: false,
      error: "Invalid time format! Please enter like 8.09 pm or 9:30 pm"
    };
  }

  let hours = parseInt(m[1], 10);
  const minutes = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  const mer = m[3] ? m[3].toLowerCase() : "";

  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) {
    return {
      ok: false,
      error: "Invalid hours or minutes! Example: 8.09 pm"
    };
  }

  if (mer === "pm" && hours < 12) hours += 12;
  if (mer === "am" && hours === 12) hours = 0;

  const istNow = getIstNowDate();
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();

  const targetIstAsUtc = Date.UTC(year, month, day, hours, minutes, 0, 0);
  let targetEpochMs = targetIstAsUtc - 5.5 * 60 * 60 * 1000;

  // If the time already passed today by more than 2 minutes, schedule for tomorrow
  if (targetEpochMs < Date.now() - 2 * 60 * 1000) {
    targetEpochMs += 24 * 60 * 60 * 1000;
  }

  return {
    ok: true,
    epochMs: targetEpochMs,
    label: formatIstShortTime(targetEpochMs)
  };
}

/**
 * Builds visual progress bar & exact percentage (e.g. 50% Complete)
 */
function buildReactionProgressStats(current, target) {
  if (!target || target <= 0) {
    return {
      percent: 100,
      bar: "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢",
      remaining: 0
    };
  }
  const rawPct = Math.floor((current / target) * 100);
  const percent = Math.min(100, Math.max(0, rawPct));
  const filledSlots = Math.min(10, Math.max(0, Math.round(percent / 10)));
  const emptySlots = 10 - filledSlots;
  const bar = "🟢".repeat(filledSlots) + "⚪".repeat(emptySlots);
  const remaining = Math.max(0, target - current);
  return { percent, bar, remaining };
}

// ============================================================================
// 2. 1-USER 1-DEVICE PRIVATE MINI-APP VERIFICATION GATEWAY (`web_app`)
// ============================================================================
function getVerificationMiniAppUrl(userId, botUsername) {
  const cleanBot = String(botUsername || "Kumar_api_bot").replace(/^@/, "").trim();
  return `${VERIFY_WEB_BASE}?userid=${encodeURIComponent(String(userId))}&bot=${encodeURIComponent(cleanBot)}`;
}

function getVerificationApiCheckUrl(userId, botUsername) {
  const cleanBot = String(botUsername || "Kumar_api_bot").replace(/^@/, "").trim();
  return `${VERIFY_API_BASE}?userid=${encodeURIComponent(String(userId))}&bot=${encodeURIComponent(cleanBot)}`;
}

/**
 * Private Telegram Mini-App Keyboard (uses `web_app` so verification URL is NEVER public!)
 */
function buildPrivateMiniAppVerifyKeyboard(userId, botUsername, gwId = "MAIN") {
  const miniAppUrl = getVerificationMiniAppUrl(userId, botUsername);
  return {
    inline_keyboard: [
      [
        {
          text: "🛡️ Open Device Verification Mini App",
          web_app: { url: miniAppUrl }
        }
      ],
      [
        {
          text: "✅ I Have Verified — Check My Status",
          callback_data: `VERIFY_CHECK_ME|${gwId}`
        }
      ]
    ]
  };
}

/**
 * Live check against https://verification-sigma-flax.vercel.app/api/verify
 * Returns:
 * - 200 OK (verified / already_verified) -> allowed: true
 * - 403 BANNED (MULTIPLE_ACCOUNTS_SAME_DEVICE) -> banned: true
 * - Otherwise -> unverified
 */
async function checkUserDeviceVerification(userId, botUsername) {
  try {
    const apiUrl = getVerificationApiCheckUrl(userId, botUsername);
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const data = await res.json();

    if (
      res.status === 403 ||
      data.code === 403 ||
      data.banned === true ||
      data.status === "banned" ||
      String(data.access || "").includes("DENIED")
    ) {
      return {
        allowed: false,
        banned: true,
        verified: false,
        status: "banned",
        deviceId: data.deviceId || "DEV-BANNED",
        firstUserId: data.first_userid || "",
        accountsCount: data.accounts_count || 2,
        reason: data.reason || "MULTIPLE_ACCOUNTS_SAME_DEVICE",
        message:
          data.message ||
          "Direct Banned 🚫! Multiple accounts detected on the same device."
      };
    }

    if (
      data.ok === true &&
      (data.verified === true ||
        data.status === "verified" ||
        data.status === "already_verified")
    ) {
      return {
        allowed: true,
        banned: false,
        verified: true,
        status: data.status || "verified",
        deviceId: data.deviceId || "DEV-VERIFIED",
        firstUserId: data.userid || String(userId),
        accountsCount: data.accounts_count || 1,
        message: data.message || "Verification Successful ✅!"
      };
    }

    return {
      allowed: false,
      banned: false,
      verified: false,
      status: "unverified",
      deviceId: "",
      message:
        data.message ||
        "Device Not Verified! Please open the Verification Mini App inside the bot first."
    };
  } catch (e) {
    return {
      allowed: false,
      banned: false,
      verified: false,
      status: "unverified",
      deviceId: "",
      message: "Please complete Device Verification via the Mini App inside the bot first!"
    };
  }
}

// ============================================================================
// 3. FIREBASE REALTIME DATABASE LAYER (PRIMARY + MIRROR FALLBACK)
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

async function saveGiveaway(dbUrl, basePath, gwId, gwObj) {
  await fbRequest(dbUrl, `${basePath}/giveaways/${gwId}`, "PUT", gwObj);
}

async function patchGiveaway(dbUrl, basePath, gwId, patchFields) {
  await fbRequest(dbUrl, `${basePath}/giveaways/${gwId}`, "PATCH", patchFields);
}

async function saveBotConfig(dbUrl, basePath, botConfigObj) {
  await fbRequest(dbUrl, `${basePath}/botConfig`, "PUT", botConfigObj);
}

// ============================================================================
// 4. TELEGRAM BOT API ENGINE (EFFECTS, AUTO-PIN & ANIMATED DICE)
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

async function sendBotMsg(token, chatId, htmlText, replyMarkup = null, effectId = null) {
  if (!token || !chatId) return { ok: false };
  const payload = {
    chat_id: String(chatId),
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (effectId) payload.message_effect_id = effectId;

  const res = await tgPost(token, "sendMessage", payload);
  if ((!res || !res.ok) && effectId) {
    delete payload.message_effect_id;
    return await tgPost(token, "sendMessage", payload);
  }
  return res;
}

async function editBotMsg(token, chatId, msgId, htmlText, replyMarkup = null) {
  if (!token || !chatId || !msgId) return { ok: false };
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

async function autoPinGiveawayMessage(token, chatId, msgId) {
  if (!token || !chatId || !msgId) return;
  try {
    await tgPost(token, "pinChatMessage", {
      chat_id: String(chatId),
      message_id: Number(msgId),
      disable_notification: false
    });
  } catch (e) {}
}

async function autoUnpinGiveawayMessage(token, chatId, msgId) {
  if (!token || !chatId || !msgId) return;
  try {
    await tgPost(token, "unpinChatMessage", {
      chat_id: String(chatId),
      message_id: Number(msgId)
    });
  } catch (e) {}
}

async function sendAnimatedDice(token, chatId) {
  if (!token || !chatId) return 1;
  const res = await tgPost(token, "sendDice", {
    chat_id: String(chatId),
    emoji: "🎲"
  });
  if (res && res.ok && res.result && res.result.dice && res.result.dice.value) {
    return Number(res.result.dice.value);
  }
  return Math.floor(1 + Math.random() * 6);
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
// 5. KEYBOARD DECKS (100% ENGLISH)
// ============================================================================
function buildMainGiveawayKeyboard(isAdminUser) {
  const rows = [
    [{ text: "🎲 Create Dice Giveaway" }, { text: "🎁 Active Giveaways" }],
    [{ text: "🛡️ Verify My Device" }, { text: "📜 My Created Giveaways" }],
    [{ text: "🏆 Past Winners" }, { text: "🥇 Hall of Fame" }],
    [{ text: "👤 My Profile" }, { text: "ℹ️ How It Works" }]
  ];
  if (isAdminUser) {
    rows.push([{ text: "👑 Admin Panel" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}

function buildReactionTargetKeyboard() {
  return {
    keyboard: [
      [{ text: "⏭️ Skip Reaction (0)" }],
      [{ text: "5" }, { text: "10" }, { text: "15" }, { text: "20" }],
      [{ text: "25" }, { text: "50" }, { text: "100" }, { text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildPostUploadTimeKeyboard() {
  return {
    keyboard: [
      [{ text: "⚡ Upload Post Immediately (NOW)" }],
      [{ text: "8.09 pm" }, { text: "8.30 pm" }, { text: "9.00 pm" }],
      [{ text: "9.30 pm" }, { text: "10.00 pm" }, { text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildSmartDiceCountKeyboard() {
  return {
    keyboard: [
      [
        { text: "🎲 1 Dice — 6 Numbers (1 to 6)" },
        { text: "🎲🎲 2 Dice — 11 Numbers (2 to 12)" }
      ],
      [
        { text: "🎲🎲🎲 3 Dice — 16 Numbers (3 to 18)" },
        { text: "🎲x4 Dice — 21 Numbers (4 to 24)" }
      ],
      [
        { text: "🎲x5 Dice — 26 Numbers (5 to 30)" },
        { text: "🎲x6 Dice — 31 Numbers (6 to 36)" }
      ],
      [{ text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildTargetChatKeyboard(savedChannel) {
  const rows = [[{ text: "🤖 Start Here in Bot Chat" }]];
  if (savedChannel) {
    rows.push([{ text: `📢 Use Saved: ${savedChannel}` }]);
  }
  rows.push([{ text: "❌ Cancel" }]);
  return { keyboard: rows, resize_keyboard: true };
}

function buildCancelKeyboard() {
  return {
    keyboard: [[{ text: "❌ Cancel" }]],
    resize_keyboard: true
  };
}

// ============================================================================
// 6. REAL TELEGRAM REACTION SUMMARY & AUTOMATIC STAGE RENDERERS
// ============================================================================
function getRealReactionSummary(gw) {
  const breakdown = gw.realReactionsBreakdown || {};
  const userMap = gw.userReactionsMap || {};

  const mergedEmojiCounts = { ...breakdown };
  if (Object.keys(mergedEmojiCounts).length === 0) {
    for (const uid of Object.keys(userMap)) {
      const em = userMap[uid];
      if (em) mergedEmojiCounts[em] = (mergedEmojiCounts[em] || 0) + 1;
    }
  }

  let calcTotal = 0;
  const parts = [];
  for (const [em, cnt] of Object.entries(mergedEmojiCounts)) {
    const n = Number(cnt || 0);
    if (n > 0) {
      calcTotal += n;
      parts.push(`${em} <b>${n}</b>`);
    }
  }

  const total = Math.max(calcTotal, numOrDef(gw.realReactionTotal, 0));
  const breakdownLine =
    parts.length > 0
      ? parts.join("   ")
      : "<i>React directly on this post with ❤️ 👍 🔥 🎉 🤩 🏆!</i>";

  return { total, breakdownLine };
}

/**
 * STAGE 1: 100% Automatic Real Reaction Gate Post
 * - ZERO manual refresh buttons!
 * - Auto-updates live % and real emoji breakdown on every reaction.
 * - Runs an automatic 10-second live countdown as soon as 100% is reached.
 */
function renderStage1ReactionGatePost(gw, countdownSecondsLeft = null) {
  const { total, breakdownLine } = getRealReactionSummary(gw);
  const target = numOrDef(gw.targetReactions, 10);
  const { percent, bar, remaining } = buildReactionProgressStats(total, target);

  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");
  const isPrivateBotChat =
    !String(gw.targetChatId).startsWith("@") && !String(gw.targetChatId).startsWith("-100");

  let statusSection = "";
  if (countdownSecondsLeft !== null || (target > 0 && total >= target)) {
    const secLabel = countdownSecondsLeft !== null ? countdownSecondsLeft : 10;
    statusSection =
      `🎉 <b>100% REACTIONS COMPLETED! (${total} / ${target})</b>\n` +
      `🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢 <b>100%</b>\n\n` +
      `⏱️ <b>AUTO-STARTING NUMBER SELECTION IN ${secLabel} SECONDS...</b>\n` +
      `⚡ <i>Get ready to select your Lucky Number (${diceCfg.minNumber} to ${diceCfg.maxNumber})!</i>`;
  } else {
    statusSection =
      `Complete <b>${target} Real Reactions</b> on this post to automatically start the Giveaway!\n\n` +
      `📊 <b>Progress: ${percent}% Complete (${total} / ${target})</b>\n` +
      `${bar}\n` +
      `🔥 <b>${remaining} More Reaction(s) Needed • Auto-Updating Live</b>`;
  }

  const text =
    `🎁 <b>DICE GIVEAWAY — AUTOMATIC REACTION GATE</b> 🎁\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Official Bot:</b> @${escHtml(botUname)}\n` +
    `👑 <b>Hosted By:</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.diceEmojis})</code> ➔ <b>${diceCfg.totalNumbers} Numbers (${diceCfg.minNumber} to ${diceCfg.maxNumber})</b>\n` +
    `🕒 <b>Post Uploaded:</b> <code>${escHtml(gw.uploadedAtLabel || gw.scheduledLabel || "Live")}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${statusSection}\n\n` +
    `💬 <b>Live Post Reactions:</b>\n${breakdownLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ <i>Verify your device below (1 User = 1 Device) while waiting for reactions to reach 100%!</i>`;

  const verifyBtn = isPrivateBotChat
    ? {
        text: `🛡️ Verify Device (Mini App)`,
        web_app: { url: getVerificationMiniAppUrl(gw.creatorId, botUname) }
      }
    : {
        text: `🛡️ Verify Device (@${botUname})`,
        url: `https://t.me/${botUname}?start=VERIFY_${gw.id}`
      };

  return {
    text,
    reply_markup: {
      inline_keyboard: [[verifyBtn]]
    }
  };
}

/**
 * STAGE 2: Smart Number Selection Board
 * - Verified users pick numbers from the smart dice range (e.g. 2..12 for 2 Dice).
 * - Includes the CREATOR-ONLY Roll Dice button (`GW_ROLL|<gwId>`).
 * - Even when all slots are filled, it NEVER auto-rolls — waits strictly for the Creator!
 */
function renderStage2NumberSelectionPost(gw) {
  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");
  const participants = gw.participants || {};
  const pIds = Object.keys(participants);
  const { total, breakdownLine } = getRealReactionSummary(gw);
  const target = numOrDef(gw.targetReactions, 0);
  const isBoardLocked = Boolean(gw.entriesLocked);
  const isBoardFull = pIds.length >= diceCfg.totalNumbers;
  const isPrivateBotChat =
    !String(gw.targetChatId).startsWith("@") && !String(gw.targetChatId).startsWith("-100");

  const numberToUser = {};
  for (const uid of pIds) {
    const pObj = participants[uid];
    numberToUser[Number(pObj.number)] = pObj;
  }

  let pListStr = "";
  if (pIds.length === 0) {
    pListStr = `<i>No verified user has selected a number yet. Verify & pick yours below!</i>\n`;
  } else {
    pIds.slice(0, 35).forEach((uid, idx) => {
      const u = participants[uid];
      const unameStr = u.username ? `@${escHtml(u.username)}` : "None";
      pListStr +=
        `${idx + 1}. 👤 <b>${escHtml(u.name)}</b> (${unameStr} | <code>${u.id}</code>) ➔ 🎯 <b>#${u.number}</b> ✅\n`;
    });
  }

  let boardStatusBanner = "";
  if (isBoardFull) {
    boardStatusBanner = `\n🔥 <b>ALL ${diceCfg.totalNumbers} SLOTS ARE FULL! Waiting for Creator (${escHtml(gw.creatorName)}) to Roll the Dice!</b>\n`;
  } else if (isBoardLocked) {
    boardStatusBanner = `\n🔒 <b>ENTRIES LOCKED BY CREATOR! Ready for Dice Roll!</b>\n`;
  }

  const text =
    `🎲 <b>DICE GIVEAWAY IS LIVE — SELECT YOUR NUMBER!</b> 🎲\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Official Bot:</b> @${escHtml(botUname)}\n` +
    `👑 <b>Creator (Roll Authority):</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.diceEmojis})</code>\n` +
    `🔢 <b>Valid Numbers (${diceCfg.totalNumbers} Slots):</b> <code>${diceCfg.minNumber} to ${diceCfg.maxNumber}</code>\n` +
    (target > 0
      ? `✅ <b>Reactions:</b> <code>100% Complete (${total}/${target})</code>\n   ${breakdownLine}\n`
      : `⏭️ <b>Reactions:</b> Skipped (Instant Start)\n`) +
    `🛡️ <b>Security:</b> <code>1 User = 1 Device Mini-App Shield ⚡</code>\n` +
    `👥 <b>Verified Players Joined:</b> <code>${pIds.length} / ${diceCfg.totalNumbers}</code>\n` +
    `${boardStatusBanner}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Verified Players (Name | Username | ID | Number):</b>\n` +
    `${pListStr}\n` +
    `👇 <b>Step 1: Verify Device (@${escHtml(botUname)}) • Step 2: Tap Your Lucky Number (${diceCfg.minNumber} to ${diceCfg.maxNumber}):</b>`;

  const inline_keyboard = [];

  // Row 1: Device Verification Button
  const verifyBtn = isPrivateBotChat
    ? {
        text: `🛡️ Step 1: Verify Device (Mini App)`,
        web_app: { url: getVerificationMiniAppUrl(gw.creatorId, botUname) }
      }
    : {
        text: `🛡️ Step 1: Verify Device (@${botUname})`,
        url: `https://t.me/${botUname}?start=VERIFY_${gw.id}`
      };
  inline_keyboard.push([verifyBtn]);

  // Smart Number Grid (1..6 for 1 Dice, 2..12 for 2 Dice, 3..18 for 3 Dice, etc.)
  let currentRow = [];
  for (const num of diceCfg.numbersList) {
    const pickedBy = numberToUser[num];
    const btnLabel = pickedBy
      ? `🔒 ${num} (${pickedBy.name.slice(0, 5)})`
      : `🎯 ${num}`;
    currentRow.push({
      text: btnLabel,
      callback_data: `GW_PICK|${gw.id}|${num}`
    });
    if (currentRow.length === 4) {
      inline_keyboard.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) inline_keyboard.push(currentRow);

  // Utility Row: Leave/Release Own Number + Creator Lock Toggle
  inline_keyboard.push([
    { text: "🚪 Release My Number", callback_data: `GW_LEAVE|${gw.id}` },
    {
      text: isBoardLocked ? "🔓 Unlock Entries (Creator)" : "🔒 Lock Entries (Creator)",
      callback_data: `GW_LOCK|${gw.id}`
    }
  ]);

  // Bottom Row: CREATOR-ONLY DICE ROLL BUTTON!
  inline_keyboard.push([
    {
      text: `🎲 ROLL ${diceCfg.diceCount} DICE NOW (Creator Only)`,
      callback_data: `GW_ROLL|${gw.id}`
    }
  ]);

  return { text, reply_markup: { inline_keyboard } };
}

/**
 * Sends a Creator Control Card in Creator's Bot DM with 1-Click Roll / Lock / Cancel buttons
 */
async function sendCreatorControlDeckDM(token, gw, headerMessage) {
  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const pCount = Object.keys(gw.participants || {}).length;

  const msg =
    `${headerMessage}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `📢 <b>Target Chat:</b> <code>${escHtml(gw.targetChatId)}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber} to ${diceCfg.maxNumber})</code>\n` +
    `👥 <b>Joined Players:</b> <code>${pCount} / ${diceCfg.totalNumbers}</code>\n\n` +
    `👑 <i>Only YOU (the Creator) can trigger the Dice Roll below whenever you are ready:</i>`;

  await sendBotMsg(
    token,
    gw.creatorId,
    msg,
    {
      inline_keyboard: [
        [
          {
            text: `🎲 ROLL ${diceCfg.diceCount} DICE NOW & ANNOUNCE WINNER`,
            callback_data: `GW_ROLL|${gw.id}`
          }
        ],
        [
          {
            text: gw.entriesLocked ? "🔓 Unlock Number Board" : "🔒 Lock Number Board",
            callback_data: `GW_LOCK|${gw.id}`
          },
          { text: "❌ Cancel Giveaway", callback_data: `GW_CANCEL|${gw.id}` }
        ]
      ]
    },
    TG_EFFECTS.FIRE
  );
}

// ============================================================================
// 7. AUTOMATIC 10-SECOND COUNTDOWN -> AUTO-OPEN NUMBER SELECTION
// ============================================================================
async function trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw) {
  if (!gw || gw.status !== "WAITING_GATE" || gw.autoStarting) return;

  gw.autoStarting = true;
  await patchGiveaway(dbUrl, basePath, gw.id, { autoStarting: true });

  // Automatic 10-second live countdown (10s -> 5s -> OPEN!)
  const render10 = renderStage1ReactionGatePost(gw, 10);
  await editBotMsg(token, gw.targetChatId, gw.postMessageId, render10.text, render10.reply_markup);
  await sleepMs(4800);

  const render5 = renderStage1ReactionGatePost(gw, 5);
  await editBotMsg(token, gw.targetChatId, gw.postMessageId, render5.text, render5.reply_markup);
  await sleepMs(4700);

  // Unlock Stage 2 Number Selection Grid automatically
  gw.status = "OPEN_NUMBERS";
  gw.autoStarting = false;
  gw.unlockedAt = formatIstFullTime(Date.now());
  await saveGiveaway(dbUrl, basePath, gw.id, gw);

  const stage2Render = renderStage2NumberSelectionPost(gw);
  await editBotMsg(
    token,
    gw.targetChatId,
    gw.postMessageId,
    stage2Render.text,
    stage2Render.reply_markup
  );

  // Send Creator their live Roll Dice Control Deck in Bot DM!
  await sendCreatorControlDeckDM(
    token,
    gw,
    `🔥 <b>100% REACTIONS COMPLETED — NUMBER SELECTION IS NOW LIVE!</b>`
  );
}

// ============================================================================
// 8. CREATOR-ONLY DICE ROLL EXECUTION & WINNER ANNOUNCEMENT ENGINE
// ============================================================================
async function executeCreatorDiceRollAndFinish(dbUrl, basePath, token, gw, playersMap = {}) {
  if (!gw || gw.status === "ROLLING" || gw.status === "FINISHED") {
    return { ok: false, error: "⚠️ Dice has already been rolled for this giveaway!" };
  }

  const { total } = getRealReactionSummary(gw);
  const targetReactions = numOrDef(gw.targetReactions, 0);
  if (targetReactions > 0 && total < targetReactions) {
    return {
      ok: false,
      error: `⚠️ Cannot roll yet! Real reactions are ${total}/${targetReactions}. Wait for 100% reactions first.`
    };
  }

  const participants = gw.participants || {};
  const pIds = Object.keys(participants);
  if (pIds.length === 0) {
    return {
      ok: false,
      error: "⚠️ At least 1 verified user must select a number before rolling the Dice!"
    };
  }

  // Lock status so double-clicks cannot roll twice
  gw.status = "ROLLING";
  await patchGiveaway(dbUrl, basePath, gw.id, { status: "ROLLING" });

  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const targetChatId = gw.targetChatId || gw.creatorId;
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");

  // Update post immediately to show Dice Rolling in progress
  await editBotMsg(
    token,
    targetChatId,
    gw.postMessageId,
    `🎲 <b>CREATOR TRIGGERED THE ROLL! ROLLING ${diceCfg.diceCount} OFFICIAL TELEGRAM DICE (${diceCfg.diceEmojis})...</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
      `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
      `👥 <b>Verified Players Locked:</b> <code>${pIds.length}</code>\n\n` +
      `⏳ <i>Watch the animated dice below... Winner will be announced in 4 seconds!</i>`,
    null
  );

  // Roll N Official Animated Telegram Dice (🎲)
  const rolledValues = [];
  let sumTotal = 0;
  for (let i = 0; i < diceCfg.diceCount; i++) {
    const val = await sendAnimatedDice(token, targetChatId);
    rolledValues.push(val);
    sumTotal += val;
  }

  // Wait 3.5 seconds so users see the animated dice land
  await sleepMs(3500);

  // Find exact match winner(s) for sumTotal
  let winners = [];
  for (const uid of pIds) {
    if (Number(participants[uid].number) === sumTotal) {
      winners.push(participants[uid]);
    }
  }

  // Tie-breaker: if nobody picked the exact sumTotal, pick the closest participant number
  let matchedByClosest = false;
  if (winners.length === 0 && pIds.length > 0) {
    let minDiff = 999999;
    for (const uid of pIds) {
      const diff = Math.abs(Number(participants[uid].number) - sumTotal);
      if (diff < minDiff) minDiff = diff;
    }
    for (const uid of pIds) {
      const diff = Math.abs(Number(participants[uid].number) - sumTotal);
      if (diff === minDiff) {
        winners.push(participants[uid]);
      }
    }
    matchedByClosest = true;
  }

  const secretClaimCode = generateSecretClaimCode();
  gw.status = "FINISHED";
  gw.rolledValues = rolledValues;
  gw.winningNumber = sumTotal;
  gw.winners = winners;
  gw.claimCode = secretClaimCode;
  gw.finishedAt = formatIstFullTime(Date.now());
  await saveGiveaway(dbUrl, basePath, gw.id, gw);

  // Update Winner stats for Hall of Fame Leaderboard
  for (const w of winners) {
    const wp = playersMap[w.id];
    if (wp) {
      wp.wonGiveaways = numOrDef(wp.wonGiveaways, 0) + 1;
      await savePlayerState(dbUrl, basePath, w.id, wp);
    }
  }

  const diceBreakdown = rolledValues
    .map((v, i) => `🎲 Dice #${i + 1}: <b>${v}</b>`)
    .join("  +  ");

  // Build Winner Block (Name, @Username, User ID, Device ID, Selected Number)
  let winnerSection = "";
  winners.forEach((w, idx) => {
    const wUname = w.username ? `@${escHtml(w.username)}` : "None";
    winnerSection +=
      `🏆 <b>OFFICIAL WINNER #${idx + 1}:</b>\n` +
      ` ┣ 👤 <b>Name:</b> ${escHtml(w.name)}\n` +
      ` ┣ 🌐 <b>Username:</b> ${wUname}\n` +
      ` ┣ 🆔 <b>User ID:</b> <code>${w.id}</code>\n` +
      ` ┣ 🛡️ <b>Verified Device:</b> <code>${escHtml(w.deviceId || "VERIFIED")}</code>\n` +
      ` ┗ 🎯 <b>Selected Number:</b> <code>#${w.number}</code> ${matchedByClosest ? `(Closest to #${sumTotal})` : "(Exact Match! 🎯)"}\n\n`;
  });

  // Build Full Participant Audit List
  let allUsersSection = "";
  pIds.forEach((uid, idx) => {
    const u = participants[uid];
    const uNameStr = u.username ? `@${escHtml(u.username)}` : "None";
    allUsersSection +=
      `${idx + 1}. 👤 <b>${escHtml(u.name)}</b> | 🌐 ${uNameStr} | 🆔 <code>${u.id}</code> | 🎯 <b>#${u.number}</b>\n`;
  });

  const finalResultHtml =
    `🎉 <b>DICE GIVEAWAY COMPLETED — WINNER ANNOUNCED!</b> 🎉\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Official Bot:</b> @${escHtml(botUname)}\n` +
    `👑 <b>Hosted By:</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `🎲 <b>Dice Rolled (${diceCfg.diceCount}x):</b> ${diceBreakdown}\n` +
    `🎯 <b>Final Winning Total:</b> <code>#${sumTotal}</code>\n` +
    `🕒 <b>Rolled At:</b> <code>${escHtml(gw.finishedAt)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>ALL VERIFIED PARTICIPANTS (${pIds.length}):</b>\n` +
    `${allUsersSection}`;

  // 1. Update Original Post, Unpin Old Post, Send Winner Announcement & Pin Winner Card
  if (gw.postMessageId) {
    await editBotMsg(token, targetChatId, gw.postMessageId, finalResultHtml, null);
    await autoUnpinGiveawayMessage(token, targetChatId, gw.postMessageId);
  }
  const winMsgRes = await sendBotMsg(token, targetChatId, finalResultHtml, null, TG_EFFECTS.PARTY);
  if (winMsgRes && winMsgRes.ok && winMsgRes.result) {
    await autoPinGiveawayMessage(token, targetChatId, winMsgRes.result.message_id);
  }

  // 2. SEND COMPLETE WINNER REPORT + SECRET CLAIM CODE + 1-CLICK CLONE TO GIVEAWAY CREATOR IN BOT DM!
  const creatorAlertHtml =
    `👑 <b>WINNER REPORT — GIVEAWAY #${gw.id}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📢 <b>Channel / Chat:</b> <code>${escHtml(targetChatId)}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🎲 <b>Dice Result:</b> ${diceBreakdown} = <b>#${sumTotal}</b>\n` +
    `🔐 <b>Secret Winner Claim Code:</b> <code>${secretClaimCode}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>All Verified Users (${pIds.length}):</b>\n${allUsersSection}`;

  await sendBotMsg(
    token,
    gw.creatorId,
    creatorAlertHtml,
    {
      inline_keyboard: [
        [{ text: "🔄 Clone & Re-Run This Giveaway", callback_data: `GW_CLONE|${gw.id}` }]
      ]
    },
    TG_EFFECTS.PARTY
  );

  // 3. DM Each Winner Directly with Their Secret Claim Code & Celebration Effect!
  for (const w of winners) {
    await sendBotMsg(
      token,
      w.id,
      `🎉 <b>CONGRATULATIONS! YOU WON THE DICE GIVEAWAY!</b> 🎉\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
        `🏆 <b>Prize Won:</b> ${escHtml(gw.prize)}\n` +
        `🎲 <b>Winning Dice Total:</b> <code>#${sumTotal}</code>\n` +
        `🔐 <b>Your Secret Claim Code:</b> <code>${secretClaimCode}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Winner Name:</b> ${escHtml(w.name)}\n` +
        `🌐 <b>Username:</b> ${w.username ? "@" + escHtml(w.username) : "None"}\n` +
        `🆔 <b>User ID:</b> <code>${w.id}</code>\n` +
        `🛡️ <b>Verified Device:</b> <code>${escHtml(w.deviceId || "VERIFIED")}</code>\n\n` +
        `👑 <b>Send your Secret Claim Code (<code>${secretClaimCode}</code>) to the Host:</b> ${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"}`,
      null,
      TG_EFFECTS.PARTY
    );
  }

  return { ok: true };
}

// ============================================================================
// 9. AUTO-PUBLISH SCHEDULED GIVEAWAYS (AT EXACT UPLOAD TIME e.g. 8.09 PM)
// ============================================================================
async function checkAndPublishScheduledGiveaways(dbUrl, basePath, token, node) {
  const giveaways = node.giveaways || {};
  const now = Date.now();
  let publishedCount = 0;

  for (const gwId of Object.keys(giveaways)) {
    const gw = giveaways[gwId];
    if (!gw || gw.status !== "SCHEDULED_UPLOAD") continue;

    const uploadEpoch = numOrDef(gw.scheduledEpoch, 0);
    if (uploadEpoch <= 0 || now >= uploadEpoch) {
      const ok = await publishScheduledGiveawayPostNow(dbUrl, basePath, token, gw);
      if (ok) publishedCount++;
    }
  }
  return publishedCount;
}

async function publishScheduledGiveawayPostNow(dbUrl, basePath, token, gw) {
  if (!gw || gw.status !== "SCHEDULED_UPLOAD") return false;

  const targetReactions = numOrDef(gw.targetReactions, 0);
  const nextStatus = targetReactions > 0 ? "WAITING_GATE" : "OPEN_NUMBERS";
  gw.status = nextStatus;
  gw.uploadedAtLabel = formatIstShortTime(Date.now());

  const rendered =
    nextStatus === "WAITING_GATE"
      ? renderStage1ReactionGatePost(gw, null)
      : renderStage2NumberSelectionPost(gw);

  const postRes = await sendBotMsg(token, gw.targetChatId, rendered.text, rendered.reply_markup);
  if (postRes && postRes.ok && postRes.result) {
    gw.postMessageId = postRes.result.message_id;
    await saveGiveaway(dbUrl, basePath, gw.id, gw);
    await autoPinGiveawayMessage(token, gw.targetChatId, gw.postMessageId);

    if (nextStatus === "OPEN_NUMBERS") {
      await sendCreatorControlDeckDM(
        token,
        gw,
        `⏰ <b>SCHEDULED GIVEAWAY #${gw.id} UPLOADED & NUMBERS ARE OPEN!</b>`
      );
    } else {
      await sendBotMsg(
        token,
        gw.creatorId,
        `⏰ <b>SCHEDULED GIVEAWAY #${gw.id} UPLOADED & PINNED LIVE!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Channel / Chat:</b> <code>${escHtml(gw.targetChatId)}</code>\n` +
          `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
          `❤️ <b>Reaction Target:</b> <code>${targetReactions} Real Reactions</code>\n\n` +
          `⚡ <i>As soon as ${targetReactions} real reactions complete (at any time), Number Selection will auto-open in 10 seconds!</i>`,
        null,
        TG_EFFECTS.FIRE
      );
    }
    return true;
  }
  return false;
}

/**
 * Global Cron Runner (`GET /api/bot1?cron=1`):
 * Scans all connected bots in Firebase and auto-uploads any scheduled giveaway posts
 * whose upload time (e.g. 8.09 pm) has arrived!
 */
async function runGlobalScheduledGiveawaysCron() {
  let totalPublished = 0;
  const allBots = (await fbRequest(PRIMARY_FIREBASE_URL, "kumar_cloud/bots", "GET")) || {};
  for (const bId of Object.keys(allBots)) {
    const node = allBots[bId];
    if (!node || !node.botConfig || !node.botConfig.token) continue;
    totalPublished += await checkAndPublishScheduledGiveaways(
      PRIMARY_FIREBASE_URL,
      `kumar_cloud/bots/${bId}`,
      node.botConfig.token,
      node
    );
  }
  return totalPublished;
}

// ============================================================================
// 10. AUTOMATIC REAL TELEGRAM REACTION LISTENER (NO MANUAL REFRESH NEEDED!)
// ============================================================================
async function handleRealTelegramReactionUpdate(dbUrl, basePath, token, node, upd) {
  const giveaways = node.giveaways || {};
  const gwIds = Object.keys(giveaways);
  if (gwIds.length === 0) return;

  // 1. Channel Post Reaction Count Update (`message_reaction_count`)
  if (upd.message_reaction_count) {
    const mrc = upd.message_reaction_count;
    const chatId = String(mrc.chat?.id || "");
    const chatUname = mrc.chat?.username ? "@" + String(mrc.chat.username).toLowerCase() : "";
    const msgId = Number(mrc.message_id || 0);

    for (const gId of gwIds) {
      const gw = giveaways[gId];
      if (!gw || gw.status !== "WAITING_GATE") continue;

      const sameMsg = Number(gw.postMessageId) === msgId;
      const sameChat =
        String(gw.targetChatId).toLowerCase() === chatId.toLowerCase() ||
        (chatUname && String(gw.targetChatId).toLowerCase() === chatUname);

      if (sameMsg && sameChat) {
        let total = 0;
        const breakdown = {};
        const rArr = Array.isArray(mrc.reactions) ? mrc.reactions : [];
        for (const item of rArr) {
          const cnt = numOrDef(item.total_count, 0);
          if (cnt > 0) {
            total += cnt;
            const em = item.type?.emoji || "🔥";
            breakdown[em] = (breakdown[em] || 0) + cnt;
          }
        }

        gw.realReactionTotal = total;
        gw.realReactionsBreakdown = breakdown;
        await saveGiveaway(dbUrl, basePath, gw.id, gw);

        const target = numOrDef(gw.targetReactions, 10);
        if (total >= target) {
          await trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw);
        } else {
          const rendered = renderStage1ReactionGatePost(gw, null);
          await editBotMsg(
            token,
            gw.targetChatId,
            gw.postMessageId,
            rendered.text,
            rendered.reply_markup
          );
        }
      }
    }
  }

  // 2. Group / Private Chat Individual User Reaction (`message_reaction`)
  if (upd.message_reaction) {
    const mr = upd.message_reaction;
    const chatId = String(mr.chat?.id || "");
    const chatUname = mr.chat?.username ? "@" + String(mr.chat.username).toLowerCase() : "";
    const msgId = Number(mr.message_id || 0);
    const reactorId = String(mr.user?.id || "");
    if (!reactorId) return;

    for (const gId of gwIds) {
      const gw = giveaways[gId];
      if (!gw || gw.status !== "WAITING_GATE") continue;

      const sameMsg = Number(gw.postMessageId) === msgId;
      const sameChat =
        String(gw.targetChatId).toLowerCase() === chatId.toLowerCase() ||
        (chatUname && String(gw.targetChatId).toLowerCase() === chatUname);

      if (sameMsg && sameChat) {
        if (!gw.userReactionsMap) gw.userReactionsMap = {};
        const newR = Array.isArray(mr.new_reaction) ? mr.new_reaction : [];
        if (newR.length === 0) {
          delete gw.userReactionsMap[reactorId];
        } else {
          const em = newR[newR.length - 1].emoji || "❤️";
          gw.userReactionsMap[reactorId] = em;
        }

        const breakdown = {};
        let total = 0;
        for (const u of Object.keys(gw.userReactionsMap)) {
          const em = gw.userReactionsMap[u];
          if (em) {
            breakdown[em] = (breakdown[em] || 0) + 1;
            total++;
          }
        }
        gw.realReactionTotal = Math.max(total, numOrDef(gw.realReactionTotal, 0));
        gw.realReactionsBreakdown = breakdown;
        await saveGiveaway(dbUrl, basePath, gw.id, gw);

        const target = numOrDef(gw.targetReactions, 10);
        if (gw.realReactionTotal >= target) {
          await trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw);
        } else {
          const rendered = renderStage1ReactionGatePost(gw, null);
          await editBotMsg(
            token,
            gw.targetChatId,
            gw.postMessageId,
            rendered.text,
            rendered.reply_markup
          );
        }
      }
    }
  }
}

// ============================================================================
// 11. USER PROFILE INITIALIZER
// ============================================================================
function getOrInitUser(players, uid, name, uname) {
  const sUid = String(uid);
  let p = players[sUid];
  if (!p) {
    p = {
      id: sUid,
      name: name || "User " + sUid,
      username: uname || "",
      state: "IDLE",
      verified: false,
      banned: false,
      deviceId: "",
      savedChannel: "",
      tempTargetChat: "",
      tempPrize: "",
      tempReactionTarget: 10,
      tempScheduledEpoch: 0,
      tempScheduledLabel: "Instant (NOW)",
      tempDiceCount: 1,
      createdGiveaways: 0,
      wonGiveaways: 0
    };
    players[sUid] = p;
  } else {
    if (name && name !== "User") p.name = name;
    if (uname !== undefined) p.username = uname;
    if (!p.state) p.state = "IDLE";
  }
  return p;
}

// ============================================================================
// 12. MAIN VERCEL SERVERLESS HANDLER (api/bot1.js)
// ============================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const host = req.headers?.host || "kumartelegrambot.vercel.app";
  const pathOnly = (req.url || "/api/bot1").split("?")[0];
  const dynamicWebhookBase = `https://${host}${pathOnly}`;

  // GET Health Check & Optional Automated Cron Trigger (?cron=1)
  if (req.method === "GET") {
    if (req.query?.cron === "1") {
      const published = await runGlobalScheduledGiveawaysCron();
      return res.status(200).json({
        ok: true,
        cron: true,
        publishedGiveaways: published,
        timeIST: formatIstFullTime(Date.now())
      });
    }
    return res.status(200).json({
      ok: true,
      endpoint: dynamicWebhookBase,
      engine: "Kurmurya 24/7 Fully Automatic Smart Dice Giveaway Engine (Creator-Only Roll)",
      status: "24/7_ONLINE"
    });
  }

  const botId = req.query?.botId ? String(req.query.botId).trim() : "";
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // --------------------------------------------------------------------------
  // A. APP -> WEBSITE CONNECT BOT API (`action: "connect_bot"`)
  // --------------------------------------------------------------------------
  if (!botId && body.action === "connect_bot") {
    try {
      const token = String(body.token || "").trim();
      const owner = String(body.adminId || body.owner || MASTER_ADMIN).replace(/\D/g, "");
      const meRes = await tgPost(token, "getMe", {});
      if (!meRes || !meRes.ok) {
        return res.status(200).json({ success: false, error: "Invalid Bot Token!" });
      }
      const bId = String(meRes.result.id);
      const uname = meRes.result.username || "Kumar_api_bot";
      const bName = meRes.result.first_name || "Dice Giveaway Bot";

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
          "message_reaction",
          "message_reaction_count",
          "my_chat_member"
        ]
      });

      const existing = (await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "GET")) || {};
      const cfg = {
        ...(existing.botConfig || {}),
        id: bId,
        token,
        username: uname,
        name: bName,
        owner,
        active: true,
        webhookActive: true,
        autoReactionWebhookV4: true,
        webhookUrl: whUrl
      };

      const nodeToSave = {
        ...existing,
        botConfig: cfg,
        playersMap: existing.playersMap || {},
        giveaways: existing.giveaways || {}
      };

      await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);
      await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);

      await sendBotMsg(
        token,
        owner,
        `🎲 <b>24/7 AUTOMATIC DICE GIVEAWAY BOT CONNECTED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🤖 <b>Bot Username:</b> @${escHtml(uname)}\n` +
          `👑 <b>Owner ID:</b> <code>${owner}</code>\n` +
          `🛡️ <b>Mini-App Device Shield:</b> <code>ACTIVE ⚡</code>\n` +
          `⏱️ <b>Auto Real Reactions + 10s Countdown:</b> <code>ACTIVE ⚡</code>\n` +
          `🎲 <b>Dice Roll Control:</b> <code>CREATOR-ONLY LOCK 🔒</code>\n\n` +
          `👇 Send <b>/start</b> to launch your first <b>🎲 Dice Giveaway</b>!`,
        buildMainGiveawayKeyboard(true),
        TG_EFFECTS.PARTY
      );

      return res.status(200).json({
        success: true,
        botId: bId,
        botUsername: uname,
        webhookUrl: whUrl
      });
    } catch (e) {
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // B. 24/7 TELEGRAM WEBHOOK UPDATE HANDLER (`?botId=...`)
  // --------------------------------------------------------------------------
  const upd = body;
  if (!botId) return res.status(200).send("OK");

  try {
    const cloudData = await loadBotNodeFromCloud(botId);
    if (!cloudData || !cloudData.node) {
      return res.status(200).send("NO_BOT");
    }

    const { dbUrl, basePath, node } = cloudData;
    const b = node.botConfig || node;
    const token = b.token;
    if (!token) return res.status(200).send("NO_TOKEN");
    const botUsername = String(b.username || "Kumar_api_bot").replace(/^@/, "");

    // Ensure native Telegram reaction updates are active on Webhook
    if (!b.autoReactionWebhookV4) {
      b.autoReactionWebhookV4 = true;
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
          "message_reaction",
          "message_reaction_count",
          "my_chat_member"
        ]
      });
      await saveBotConfig(dbUrl, basePath, b);
    }

    // Deduplicate update_id
    const incomingUpdateId = Number(upd.update_id || 0);
    if (incomingUpdateId > 0 && incomingUpdateId === Number(node.lastWebhookUpdateId || 0)) {
      return res.status(200).send("DUPLICATE_IGNORED");
    }
    if (incomingUpdateId > 0) {
      await fbRequest(dbUrl, `${basePath}/lastWebhookUpdateId`, "PUT", incomingUpdateId);
    }

    // Check & Auto-Publish any Scheduled Giveaways whose upload time (e.g. 8.09 pm) has arrived!
    await checkAndPublishScheduledGiveaways(dbUrl, basePath, token, node);

    // Handle Real Telegram Post Reactions Automatically (No Refresh Button!)
    if (upd.message_reaction || upd.message_reaction_count) {
      await handleRealTelegramReactionUpdate(dbUrl, basePath, token, node, upd);
      return res.status(200).send("REAL_REACTION_OK");
    }

    if (!upd.message && !upd.callback_query) {
      return res.status(200).send("OK");
    }

    const ownerId = String(b.owner || b.adminId || MASTER_ADMIN);
    const players = node.playersMap || {};
    const giveaways = node.giveaways || {};

    const isCb = Boolean(upd.callback_query);
    const fromObj = isCb ? upd.callback_query.from : upd.message?.from;
    if (!fromObj) return res.status(200).send("OK");

    const cUid = String(fromObj.id);
    const cName =
      ((fromObj.first_name || "") + (fromObj.last_name ? " " + fromObj.last_name : ""))
        .trim()
        .replace(/[<>]/g, "") || "User";
    const cUname = fromObj.username || "";
    const isAdm = cUid === ownerId || cUid === MASTER_ADMIN;

    const p = getOrInitUser(players, cUid, cName, cUname);
    const mainKb = buildMainGiveawayKeyboard(isAdm);

    // ========================================================================
    // C. HANDLE INLINE CALLBACKS (PICK NUMBER, LEAVE, LOCK, CREATOR-ONLY ROLL)
    // ========================================================================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;

      // 1. Creator clicked "⚡ Upload Scheduled Post Now"
      if (data.startsWith("GW_PUB_NOW|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw) {
          await answerCb(token, cbId, "⚠️ Giveaway not found!", true);
          return res.status(200).send("OK");
        }
        if (String(cUid) !== String(gw.creatorId)) {
          await answerCb(token, cbId, "🔒 Only the Giveaway Creator can upload early!", true);
          return res.status(200).send("OK");
        }
        if (gw.status !== "SCHEDULED_UPLOAD") {
          await answerCb(token, cbId, "✅ Already uploaded!", true);
          return res.status(200).send("OK");
        }
        await answerCb(token, cbId, "📢 Uploading Giveaway Post now...", false);
        await publishScheduledGiveawayPostNow(dbUrl, basePath, token, gw);
        return res.status(200).send("OK");
      }

      // 2. Creator clicked "🔒 Lock / 🔓 Unlock Entries"
      if (data.startsWith("GW_LOCK|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || gw.status !== "OPEN_NUMBERS") {
          await answerCb(token, cbId, "⚠️ Giveaway is not in number selection mode.", true);
          return res.status(200).send("OK");
        }
        if (String(cUid) !== String(gw.creatorId)) {
          await answerCb(token, cbId, "🔒 Only the Giveaway Creator can lock or unlock entries!", true);
          return res.status(200).send("OK");
        }
        gw.entriesLocked = !gw.entriesLocked;
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(
          token,
          cbId,
          gw.entriesLocked ? "🔒 Entries Locked! Ready to roll Dice." : "🔓 Entries Unlocked!",
          true
        );
        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      // 3. Creator clicked "❌ Cancel Giveaway"
      if (data.startsWith("GW_CANCEL|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || gw.status === "FINISHED") {
          await answerCb(token, cbId, "⚠️ Giveaway already ended.", true);
          return res.status(200).send("OK");
        }
        if (String(cUid) !== String(gw.creatorId)) {
          await answerCb(token, cbId, "🔒 Only the Giveaway Creator can cancel this giveaway!", true);
          return res.status(200).send("OK");
        }
        gw.status = "FINISHED";
        gw.cancelled = true;
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        if (gw.postMessageId) {
          await editBotMsg(
            token,
            gw.targetChatId,
            gw.postMessageId,
            `❌ <b>GIVEAWAY #${gw.id} CANCELLED BY CREATOR (${escHtml(gw.creatorName)})</b>`,
            null
          );
          await autoUnpinGiveawayMessage(token, gw.targetChatId, gw.postMessageId);
        }
        await answerCb(token, cbId, "❌ Giveaway Cancelled.", true);
        return res.status(200).send("OK");
      }

      // 4. Creator clicked "🔄 Clone & Re-Run This Giveaway"
      if (data.startsWith("GW_CLONE|")) {
        const oldGwId = data.split("|")[1];
        const oldGw = giveaways[oldGwId];
        if (!oldGw) {
          await answerCb(token, cbId, "⚠️ Original giveaway not found!", true);
          return res.status(200).send("OK");
        }
        if (String(cUid) !== String(oldGw.creatorId)) {
          await answerCb(token, cbId, "🔒 Only the Creator can clone this giveaway!", true);
          return res.status(200).send("OK");
        }

        const newGwId = "GW" + Math.floor(10000 + Math.random() * 90000);
        const rTarget = numOrDef(oldGw.targetReactions, 0);
        const newGw = {
          id: newGwId,
          botUsername: botUsername,
          creatorId: cUid,
          creatorName: cName,
          creatorUsername: cUname,
          targetChatId: oldGw.targetChatId,
          prize: oldGw.prize,
          targetReactions: rTarget,
          scheduledEpoch: 0,
          scheduledLabel: "Instant (NOW)",
          uploadedAtLabel: formatIstShortTime(Date.now()),
          diceCount: oldGw.diceCount || 1,
          minNumber: oldGw.minNumber || 1,
          maxNumber: oldGw.maxNumber || 6,
          totalNumbers: oldGw.totalNumbers || 6,
          status: rTarget > 0 ? "WAITING_GATE" : "OPEN_NUMBERS",
          entriesLocked: false,
          fullNotified: false,
          realReactionTotal: 0,
          realReactionsBreakdown: {},
          userReactionsMap: {},
          participants: {},
          createdAt: formatIstShortTime(Date.now())
        };

        const rendered =
          rTarget > 0
            ? renderStage1ReactionGatePost(newGw, null)
            : renderStage2NumberSelectionPost(newGw);

        const postRes = await sendBotMsg(token, newGw.targetChatId, rendered.text, rendered.reply_markup);
        if (postRes && postRes.ok && postRes.result) {
          newGw.postMessageId = postRes.result.message_id;
          await saveGiveaway(dbUrl, basePath, newGwId, newGw);
          await autoPinGiveawayMessage(token, newGw.targetChatId, newGw.postMessageId);
          await answerCb(token, cbId, `🎉 Cloned & Launched #${newGwId}!`, true);
          await sendCreatorControlDeckDM(
            token,
            newGw,
            `🔄 <b>CLONED GIVEAWAY #${newGwId} IS NOW LIVE!</b>`
          );
        } else {
          await answerCb(token, cbId, "❌ Could not post to target chat!", true);
        }
        return res.status(200).send("OK");
      }

      // 5. User clicked "🚪 Release My Number"
      if (data.startsWith("GW_LEAVE|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || gw.status !== "OPEN_NUMBERS") {
          await answerCb(token, cbId, "⚠️ Giveaway is already closed.", true);
          return res.status(200).send("OK");
        }
        if (gw.entriesLocked) {
          await answerCb(token, cbId, "🔒 Entries are locked by the Creator!", true);
          return res.status(200).send("OK");
        }
        if (!gw.participants || !gw.participants[cUid]) {
          await answerCb(token, cbId, "ℹ️ You have not selected a number yet.", true);
          return res.status(200).send("OK");
        }
        const freedNum = gw.participants[cUid].number;
        delete gw.participants[cUid];
        gw.fullNotified = false;
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(token, cbId, `🚪 Released Number #${freedNum}!`, true);

        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      // 6. User clicked a Lucky Number Button: "GW_PICK|<gwId>|<num>"
      //    Enforces 1-User 1-Device Mini-App Verification & Blocks 403 Banned Users!
      if (data.startsWith("GW_PICK|")) {
        const parts = data.split("|");
        const gwId = parts[1];
        const pickedNum = parseInt(parts[2], 10);
        const gw = giveaways[gwId];

        if (!gw || gw.status === "FINISHED" || gw.status === "ROLLING") {
          await answerCb(token, cbId, "⚠️ This Giveaway has already ended!", true);
          return res.status(200).send("OK");
        }

        if (gw.status !== "OPEN_NUMBERS") {
          await answerCb(
            token,
            cbId,
            "⚠️ Reactions are not 100% complete yet! Add real reactions on the post first.",
            true
          );
          return res.status(200).send("OK");
        }

        if (gw.entriesLocked) {
          await answerCb(token, cbId, "🔒 Number selection is locked by the Creator! Dice rolling soon.", true);
          return res.status(200).send("OK");
        }

        if (p.banned === true) {
          await answerCb(
            token,
            cbId,
            "🚫 ACCESS DENIED (403 BANNED): Multiple accounts on same device! Banned users cannot select a number.",
            true
          );
          return res.status(200).send("OK");
        }

        // LIVE CALL TO 1-USER 1-DEVICE VERIFICATION API
        const verifyCheck = await checkUserDeviceVerification(cUid, botUsername);

        if (verifyCheck.banned) {
          p.banned = true;
          p.verified = false;
          p.deviceId = verifyCheck.deviceId || "DEV-BANNED";
          await savePlayerState(dbUrl, basePath, cUid, p);

          await answerCb(
            token,
            cbId,
            `🚫 DIRECT BANNED (403)!\nReason: ${verifyCheck.reason}\nDevice: ${verifyCheck.deviceId}\nBanned users cannot join giveaway!`,
            true
          );
          return res.status(200).send("OK");
        }

        if (!verifyCheck.allowed || !verifyCheck.verified) {
          await answerCb(
            token,
            cbId,
            `🔒 DEVICE VERIFICATION REQUIRED!\nTap '🛡️ Step 1: Verify Device (@${botUsername})' on the post to open the Mini App!`,
            true
          );

          // Send Private Mini-App Verification Button in Bot DM (URL stays completely hidden!)
          await sendBotMsg(
            token,
            cUid,
            `🛡️ <b>1-USER 1-DEVICE MINI-APP VERIFICATION</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
              `🆔 <b>Your User ID:</b> <code>${cUid}</code>\n\n` +
              `⚠️ To lock Lucky Number <b>#${pickedNum}</b> in Giveaway <code>${gwId}</code>, verify your device inside the private Mini App below:`,
            buildPrivateMiniAppVerifyKeyboard(cUid, botUsername, gwId)
          );
          return res.status(200).send("OK");
        }

        // User is 100% VERIFIED (200 OK)!
        p.verified = true;
        p.banned = false;
        p.deviceId = verifyCheck.deviceId;
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (!gw.participants) gw.participants = {};

        // Prevent two users from taking the same number
        for (const existingUid of Object.keys(gw.participants)) {
          if (
            existingUid !== cUid &&
            Number(gw.participants[existingUid].number) === pickedNum
          ) {
            await answerCb(
              token,
              cbId,
              `🔒 Number #${pickedNum} is already locked by ${gw.participants[existingUid].name}! Pick another open 🎯 number.`,
              true
            );
            return res.status(200).send("OK");
          }
        }

        const prevPick = gw.participants[cUid] ? gw.participants[cUid].number : null;
        gw.participants[cUid] = {
          id: cUid,
          name: cName,
          username: cUname,
          deviceId: verifyCheck.deviceId,
          number: pickedNum,
          joinedAt: formatIstShortTime(Date.now())
        };

        const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
        const totalJoined = Object.keys(gw.participants).length;
        const boardJustFilled = totalJoined >= diceCfg.totalNumbers && !gw.fullNotified;
        if (boardJustFilled) {
          gw.fullNotified = true;
        }

        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(
          token,
          cbId,
          prevPick && prevPick !== pickedNum
            ? `🔄 Switched from #${prevPick} to Lucky Number #${pickedNum}!`
            : `✅ Verified (${verifyCheck.deviceId})! You locked Lucky Number #${pickedNum}!`,
          true
        );

        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(
          token,
          gw.targetChatId,
          gw.postMessageId,
          rendered.text,
          rendered.reply_markup
        );

        // DO NOT AUTO-ROLL! Instead, notify the Giveaway Creator in DM that all slots are filled!
        if (boardJustFilled) {
          await sendCreatorControlDeckDM(
            token,
            gw,
            `🔥 <b>ALL ${diceCfg.totalNumbers} NUMBERS ARE SELECTED! TAP BELOW TO ROLL THE DICE!</b>`
          );
        }
        return res.status(200).send("OK");
      }

      // 7. STRICT CREATOR-ONLY DICE ROLL BUTTON: "GW_ROLL|<gwId>"
      //    ONLY the specific Admin who created this Giveaway (`gw.creatorId`) can roll!
      if (data.startsWith("GW_ROLL|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];

        if (!gw || gw.status === "FINISHED" || gw.status === "ROLLING") {
          await answerCb(token, cbId, "⚠️ Dice has already been rolled for this giveaway!", true);
          return res.status(200).send("OK");
        }

        // STRICT CHECK: ONLY THE CREATOR WHO CREATED THIS GIVEAWAY CAN ROLL THE DICE!
        if (String(cUid) !== String(gw.creatorId)) {
          await answerCb(
            token,
            cbId,
            `🔒 ACCESS DENIED! Only the Giveaway Creator (${gw.creatorName}) can press Roll Dice!`,
            true
          );
          return res.status(200).send("OK");
        }

        const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
        await answerCb(
          token,
          cbId,
          `🎲 Creator Verified! Rolling ${diceCfg.diceCount} Official Telegram Dice...`,
          false
        );

        const rollRes = await executeCreatorDiceRollAndFinish(
          dbUrl,
          basePath,
          token,
          gw,
          players
        );
        if (!rollRes.ok) {
          await sendBotMsg(token, cUid, rollRes.error, mainKb);
        }
        return res.status(200).send("OK");
      }

      // 8. User clicked "✅ I Have Verified — Check My Status" in Bot DM
      if (data.startsWith("VERIFY_CHECK_ME|")) {
        const gwId = data.split("|")[1] || "MAIN";
        const vCheck = await checkUserDeviceVerification(cUid, botUsername);

        if (vCheck.banned) {
          p.banned = true;
          p.deviceId = vCheck.deviceId;
          await savePlayerState(dbUrl, basePath, cUid, p);
          await answerCb(token, cbId, "🚫 403 BANNED: Multiple accounts on same device!", true);
          await sendBotMsg(
            token,
            cUid,
            `🚫 <b>DIRECT BANNED (403 BANNED)</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `❌ <b>Access:</b> DENIED 🚫 (${escHtml(vCheck.reason)})\n` +
              `🛡️ <b>Device ID:</b> <code>${escHtml(vCheck.deviceId)}</code>\n` +
              `🆔 <b>Primary Account on Device:</b> <code>${escHtml(vCheck.firstUserId)}</code>\n\n` +
              `<i>Banned accounts cannot select numbers in any Dice Giveaway.</i>`
          );
          return res.status(200).send("OK");
        }

        if (vCheck.allowed && vCheck.verified) {
          p.verified = true;
          p.banned = false;
          p.deviceId = vCheck.deviceId;
          await savePlayerState(dbUrl, basePath, cUid, p);
          await answerCb(token, cbId, `✅ Verified! Device: ${vCheck.deviceId}`, true);
          await sendBotMsg(
            token,
            cUid,
            `✅ <b>DEVICE VERIFIED SUCCESSFULLY (200 OK)!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🛡️ <b>Access:</b> GRANTED ✅ (${escHtml(vCheck.status)})\n` +
              `📱 <b>Device ID:</b> <code>${escHtml(vCheck.deviceId)}</code>\n` +
              `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n\n` +
              `🎯 <b>Now return to the Giveaway Post and tap your Lucky Number!</b>`,
            null,
            TG_EFFECTS.PARTY
          );
          return res.status(200).send("OK");
        }

        await answerCb(token, cbId, "❌ Not verified yet! Open the Mini App first.", true);
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Device Not Verified Yet!</b>\nTap the button below to verify inside the private Mini App:`,
          buildPrivateMiniAppVerifyKeyboard(cUid, botUsername, gwId)
        );
        return res.status(200).send("OK");
      }

      await answerCb(token, cbId, "Done", false);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // D. HANDLE TEXT MESSAGES & MINI-APP DEEP LINK (`/start VERIFY_...`)
    // ========================================================================
    const msgObj = upd.message;
    const chatId = String(msgObj.chat?.id || cUid);
    const text = String(msgObj.text || "").trim();

    if (text.toLowerCase() === "❌ cancel" || text.toLowerCase() === "/cancel") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, "❌ <b>Operation Cancelled.</b>", mainKb);
      return res.status(200).send("OK");
    }

    // Handle `/start VERIFY_<gwId>` or `🛡️ Verify My Device` (Always opens Private Mini App!)
    if (text.startsWith("/start VERIFY_") || text === "🛡️ Verify My Device") {
      p.state = "IDLE";
      const gwId = text.startsWith("/start VERIFY_")
        ? text.replace("/start VERIFY_", "").trim()
        : "MAIN";
      const vCheck = await checkUserDeviceVerification(cUid, botUsername);

      if (vCheck.banned) {
        p.banned = true;
        p.deviceId = vCheck.deviceId;
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `🚫 <b>DIRECT BANNED (403 BANNED)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `❌ <b>Access:</b> DENIED 🚫\n` +
            `⚠️ <b>Reason:</b> <code>${escHtml(vCheck.reason)}</code>\n` +
            `📱 <b>Device ID:</b> <code>${escHtml(vCheck.deviceId)}</code>\n` +
            `🆔 <b>First Account ID:</b> <code>${escHtml(vCheck.firstUserId)}</code>\n\n` +
            `<i>Multiple accounts on the same device are strictly prohibited. Banned users cannot pick numbers in any Giveaway!</i>`,
          mainKb
        );
        return res.status(200).send("OK");
      }

      if (vCheck.allowed && vCheck.verified) {
        p.verified = true;
        p.banned = false;
        p.deviceId = vCheck.deviceId;
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `✅ <b>DEVICE ALREADY VERIFIED (200 OK)!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🛡️ <b>Status:</b> <code>${escHtml(vCheck.status.toUpperCase())} ✅</code>\n` +
            `📱 <b>Device ID:</b> <code>${escHtml(vCheck.deviceId)}</code>\n` +
            `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
            `🆔 <b>User ID:</b> <code>${cUid}</code>\n\n` +
            `🎯 <b>You are 100% verified to pick numbers in all Dice Giveaways!</b>`,
          mainKb,
          TG_EFFECTS.PARTY
        );
        return res.status(200).send("OK");
      }

      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `🛡️ <b>1-USER 1-DEVICE MINI-APP VERIFICATION</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
          `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n\n` +
          `📌 <b>Step 1:</b> Tap <b>🛡️ Open Device Verification Mini App</b> below.\n` +
          `📌 <b>Step 2:</b> Once verified inside the Mini App, tap <b>✅ I Have Verified — Check My Status</b>!`,
        buildPrivateMiniAppVerifyKeyboard(cUid, botUsername, gwId)
      );
      return res.status(200).send("OK");
    }

    if (text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const welcomeHtml =
        `🎲 <b>WELCOME TO @${escHtml(botUsername.toUpperCase())} — 24/7 AUTO DICE GIVEAWAY BOT!</b> 🎁\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
        `🌐 <b>Username:</b> ${cUname ? "@" + escHtml(cUname) : "None"}\n` +
        `🛡️ <b>Device Status:</b> ${p.banned ? "🚫 <b>BANNED (403)</b>" : p.verified ? `✅ <b>VERIFIED (${escHtml(p.deviceId)})</b>` : "⏳ <b>Tap Verify My Device</b>"}\n\n` +
        `⚡ <b>10 Pro Automated Features Active:</b>\n` +
        `• <b>❤️ Automatic Real Reactions + % Bar:</b> Live updates with zero refresh buttons!\n` +
        `• <b>⏱️ 10-Second Auto-Start:</b> Automatically opens numbers 10s after 100% reactions!\n` +
        `• <b>🎲 Smart Dice Math:</b> 1 Dice (<code>1-6</code>) • 2 Dice (<code>2-12</code>) • 3 Dice (<code>3-18</code>)\n` +
        `• <b>👑 Creator-Only Dice Roll:</b> Verified users pick numbers; ONLY the Creator rolls the Dice!\n` +
        `• <b>🛡️ Private Mini-App Shield:</b> Blocks multi-account cheaters (403 Banned)!\n` +
        `• <b>🔐 Secret Claim Code & 1-Click Clone:</b> Anti-fake winner codes sent straight to Creator DM!\n\n` +
        `👇 <b>Choose an option from the menu below:</b>`;

      await sendBotMsg(token, chatId, welcomeHtml, mainKb, TG_EFFECTS.PARTY);
      return res.status(200).send("OK");
    }

    // ------------------------------------------------------------------------
    // TOP-LEVEL MENU BUTTONS
    // ------------------------------------------------------------------------
    if (text === "🎲 Create Dice Giveaway") {
      if (p.banned) {
        await sendBotMsg(token, chatId, "🚫 <b>Banned accounts cannot create or join giveaways.</b>", mainKb);
        return res.status(200).send("OK");
      }
      p.state = "GW_STEP1_TARGET_CHAT";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `🎲 <b>CREATE DICE GIVEAWAY (STEP 1 OF 5)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Where should the Giveaway Post be uploaded?</b>\n\n` +
          `• Tap <b>🤖 Start Here in Bot Chat</b> to run it right here.\n` +
          `• OR send your Channel / Group <code>@username</code> or Chat ID (<code>-100...</code>) where <b>@${escHtml(botUsername)}</b> is Admin:`,
        buildTargetChatKeyboard(p.savedChannel)
      );
      return res.status(200).send("OK");
    }

    if (text === "🎁 Active Giveaways") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const activeList = Object.keys(giveaways)
        .map((id) => giveaways[id])
        .filter((g) => g && g.status !== "FINISHED");

      let sb = `🎁 <b>ACTIVE & SCHEDULED GIVEAWAYS (${activeList.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (activeList.length === 0) {
        sb += `📭 No active giveaways right now.\nTap <b>🎲 Create Dice Giveaway</b> to launch one!`;
      } else {
        activeList.slice(0, 10).forEach((g, idx) => {
          const { total } = getRealReactionSummary(g);
          const { percent } = buildReactionProgressStats(total, g.targetReactions);
          const pCount = Object.keys(g.participants || {}).length;
          const dCfg = getSmartDiceConfig(g.diceCount || 1);
          sb +=
            `<b>[${idx + 1}] ${escHtml(g.prize)} (<code>${g.id}</code>)</b>\n` +
            ` ┣ 📢 Chat: <code>${escHtml(g.targetChatId)}</code>\n` +
            ` ┣ 🎲 Mode: <code>${dCfg.diceCount} Dice (${dCfg.minNumber} to ${dCfg.maxNumber})</code>\n` +
            ` ┣ ❤️ Reactions: <code>${percent}% (${total}/${g.targetReactions})</code> | 👥 Joined: <code>${pCount}/${dCfg.totalNumbers}</code>\n` +
            ` ┗ 📌 Status: <b>${g.status}</b> (${escHtml(g.scheduledLabel)})\n\n`;
        });
      }
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "📜 My Created Giveaways") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const myList = Object.keys(giveaways)
        .map((id) => giveaways[id])
        .filter((g) => g && String(g.creatorId) === cUid);

      let sb = `📜 <b>MY CREATED GIVEAWAYS (${myList.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (myList.length === 0) {
        sb += `📭 You haven't created any giveaway yet! Tap <b>🎲 Create Dice Giveaway</b>.`;
      } else {
        myList.slice(0, 10).forEach((g, idx) => {
          const pCount = Object.keys(g.participants || {}).length;
          sb +=
            `<b>[${idx + 1}] ${escHtml(g.prize)} (<code>${g.id}</code>)</b>\n` +
            ` ┣ 📢 Chat: <code>${escHtml(g.targetChatId)}</code>\n` +
            ` ┣ 👥 Players: <code>${pCount}</code> | Status: <b>${g.status}</b>\n` +
            (g.winningNumber
              ? ` ┗ 🎯 Winning Roll: <code>#${g.winningNumber}</code> | 🔐 Claim: <code>${escHtml(g.claimCode || "N/A")}</code>\n\n`
              : `\n`);
        });
      }
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🏆 Past Winners") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const finishedList = Object.keys(giveaways)
        .map((id) => giveaways[id])
        .filter((g) => g && g.status === "FINISHED" && !g.cancelled);

      let sb = `🏆 <b>RECENT GIVEAWAY WINNERS (${finishedList.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (finishedList.length === 0) {
        sb += `📭 No finished giveaways yet.`;
      } else {
        finishedList.slice(0, 10).forEach((g, idx) => {
          const wArr = Array.isArray(g.winners) ? g.winners : [];
          const wNames = wArr
            .map(
              (w) =>
                `${escHtml(w.name)} (${w.username ? "@" + escHtml(w.username) : "None"} | <code>${w.id}</code>)`
            )
            .join(", ");
          sb +=
            `<b>[${idx + 1}] 🎁 ${escHtml(g.prize)} (<code>${g.id}</code>)</b>\n` +
            ` ┣ 🎲 Winning Roll: <code>#${g.winningNumber}</code>\n` +
            ` ┗ 🏆 Winner: ${wNames || "None"}\n\n`;
        });
      }
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🥇 Hall of Fame") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const allUsers = Object.values(players);
      const topWinners = [...allUsers]
        .filter((u) => numOrDef(u.wonGiveaways, 0) > 0)
        .sort((a, b) => numOrDef(b.wonGiveaways, 0) - numOrDef(a.wonGiveaways, 0))
        .slice(0, 5);

      const topHosts = [...allUsers]
        .filter((u) => numOrDef(u.createdGiveaways, 0) > 0)
        .sort((a, b) => numOrDef(b.createdGiveaways, 0) - numOrDef(a.createdGiveaways, 0))
        .slice(0, 5);

      let sb = `🥇 <b>GIVEAWAY HALL OF FAME LEADERBOARD</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      sb += `🏆 <b>Top Giveaway Winners:</b>\n`;
      if (topWinners.length === 0) sb += `<i>No winners recorded yet.</i>\n`;
      else {
        topWinners.forEach((u, i) => {
          sb += `${i + 1}. <b>${escHtml(u.name)}</b> (<code>${u.id}</code>) — 🏆 <b>${u.wonGiveaways} Win(s)</b>\n`;
        });
      }

      sb += `\n👑 <b>Top Giveaway Hosts:</b>\n`;
      if (topHosts.length === 0) sb += `<i>No hosts recorded yet.</i>\n`;
      else {
        topHosts.forEach((u, i) => {
          sb += `${i + 1}. <b>${escHtml(u.name)}</b> (<code>${u.id}</code>) — 🎁 <b>${u.createdGiveaways} Hosted</b>\n`;
        });
      }

      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "👤 My Profile") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const profHtml =
        `👤 <b>MY GIVEAWAY PROFILE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧑 <b>Name:</b> ${escHtml(cName)}\n` +
        `🌐 <b>Username:</b> ${cUname ? "@" + escHtml(cUname) : "None"}\n` +
        `🆔 <b>User ID:</b> <code>${cUid}</code>\n` +
        `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
        `🛡️ <b>Device Verification:</b> ${p.banned ? "🚫 <b>BANNED (403)</b>" : p.verified ? `✅ <b>VERIFIED (${escHtml(p.deviceId)})</b>` : "⏳ <b>Not Verified</b>"}\n` +
        `🎁 <b>Giveaways Hosted:</b> <code>${numOrDef(p.createdGiveaways, 0)}</code>\n` +
        `🏆 <b>Giveaways Won:</b> <code>${numOrDef(p.wonGiveaways, 0)}</code>`;

      await sendBotMsg(token, chatId, profHtml, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "ℹ️ How It Works") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const helpHtml =
        `ℹ️ <b>HOW AUTOMATIC DICE GIVEAWAY WORKS</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `1️⃣ <b>Scheduled Post Upload:</b> If you set <code>8.09 pm</code>, the Giveaway post uploads automatically at <code>8.09 pm</code> and auto-pins.\n` +
        `2️⃣ <b>100% Automatic Real Reactions:</b> Users react directly on the post (❤️ 👍 🔥 🎉). No manual refresh button needed! As soon as reactions hit <b>100%</b> (even at <code>8.30 pm</code>), the bot counts down <b>10 seconds</b> and automatically opens Number Selection.\n` +
        `3️⃣ <b>Smart Dice Range:</b>\n` +
        `   • <b>1 Dice (🎲):</b> 6 Numbers (<code>1 to 6</code>)\n` +
        `   • <b>2 Dice (🎲🎲):</b> 11 Numbers (<code>2 to 12</code> — 1 is impossible on 2 dice!)\n` +
        `   • <b>3 Dice (🎲🎲🎲):</b> 16 Numbers (<code>3 to 18</code>)\n` +
        `4️⃣ <b>Private Mini-App Device Shield:</b> Verification runs inside Telegram's Mini App. Multi-account cheaters get <b>403 BANNED 🚫</b> and cannot pick numbers.\n` +
        `5️⃣ <b>Creator-Only Dice Roll:</b> Verified users select numbers; when ready, <b>ONLY the Creator</b> taps <b>🎲 ROLL DICE NOW</b>! The bot rolls real animated dice and sends the Winner's <b>Name, @Username, User ID & Secret Claim Code</b> directly to the Creator!`;

      await sendBotMsg(token, chatId, helpHtml, mainKb);
      return res.status(200).send("OK");
    }

    if (isAdm && (text === "👑 Admin Panel" || text === "/admin")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `👑 <b>DICE GIVEAWAY MASTER ADMIN PANEL</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
          `👥 <b>Total Bot Users:</b> <code>${Object.keys(players).length}</code>\n` +
          `🎁 <b>Total Giveaways:</b> <code>${Object.keys(giveaways).length}</code>\n` +
          `🛡️ <b>Mini-App Verification Shield:</b> <code>ACTIVE ⚡</code>\n` +
          `🔒 <b>Dice Roll Rule:</b> <code>Creator-Only Authority</code>\n` +
          `🟢 <b>24/7 Cloud Engine:</b> <code>ONLINE (api/bot1.js)</code>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    // ========================================================================
    // E. 5-STEP SMART DICE GIVEAWAY CREATION WIZARD
    // ========================================================================
    const st = String(p.state || "IDLE").toUpperCase();

    // ---- STEP 1: TARGET CHANNEL / CHAT ----
    if (st === "GW_STEP1_TARGET_CHAT") {
      let targetChat = chatId;
      if (text === "🤖 Start Here in Bot Chat") {
        targetChat = chatId;
      } else if (text.startsWith("📢 Use Saved:")) {
        targetChat = text.replace("📢 Use Saved:", "").trim();
      } else {
        let raw = text.trim();
        if (raw.includes("t.me/")) {
          raw = "@" + raw.split("t.me/")[1].split("/")[0].replace("@", "");
        } else if (!raw.startsWith("@") && !raw.startsWith("-")) {
          raw = "@" + raw;
        }
        targetChat = raw;
        p.savedChannel = raw;
      }

      p.tempTargetChat = targetChat;
      p.state = "GW_STEP2_PRIZE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `🏆 <b>STEP 2 OF 5: ENTER GIVEAWAY PRIZE / TITLE</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Target Chat:</b> <code>${escHtml(targetChat)}</code>\n\n` +
          `👇 <b>Type the Prize or Title for this Dice Giveaway:</b>\n` +
          `• Example: <code>₹100 Instant UPI Cash</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 2: PRIZE -> ASK REAL REACTION TARGET OR SKIP ----
    if (st === "GW_STEP2_PRIZE") {
      p.tempPrize = text || "Special Mystery Prize";
      p.state = "GW_STEP3_REACTIONS";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `❤️ <b>STEP 3 OF 5: SET REAL REACTION TARGET OR SKIP</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏆 <b>Prize:</b> ${escHtml(p.tempPrize)}\n\n` +
          `📌 <b>How many Real Telegram Reactions on the post are required to auto-start?</b>\n` +
          `• Example: Send <code>10</code> (Tracks real post reactions automatically; when 100% complete, Number Selection opens automatically in <b>10 seconds</b>!)\n` +
          `• OR tap <b>⏭️ Skip Reaction (0)</b> to open Number Selection immediately:`,
        buildReactionTargetKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 3: REACTION TARGET -> ASK POST UPLOAD TIME ----
    if (st === "GW_STEP3_REACTIONS") {
      let rTarget = 0;
      if (!text.toLowerCase().includes("skip")) {
        const parsed = parseInt(text.replace(/\D/g, ""), 10);
        if (isNaN(parsed) || parsed < 0) {
          await sendBotMsg(
            token,
            chatId,
            `⚠️ Please enter a valid reaction count (e.g. <code>10</code>) or tap <b>⏭️ Skip Reaction (0)</b>:`,
            buildReactionTargetKeyboard()
          );
          return res.status(200).send("OK");
        }
        rTarget = parsed;
      }

      p.tempReactionTarget = rTarget;
      p.state = "GW_STEP4_TIME";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `⏰ <b>STEP 4 OF 5: SET POST UPLOAD TIME (IST)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Real Reactions" : "Skipped (0)"}</code>\n\n` +
          `📌 <b>When should the Giveaway Post be uploaded?</b>\n` +
          `• Type any time like <code>8.09 pm</code>, <code>8:30 pm</code>, <code>9.00 pm</code> (Uploads the post at that time; whenever reactions hit 100%—even at 8.30 pm—Number Selection auto-opens 10 seconds later!)\n` +
          `• OR tap <b>⚡ Upload Post Immediately (NOW)</b>:`,
        buildPostUploadTimeKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 4: POST UPLOAD TIME -> ASK SMART DICE COUNT ----
    if (st === "GW_STEP4_TIME") {
      const parsedTime = parseUserTimeInputToEpoch(text);
      if (!parsedTime.ok) {
        await sendBotMsg(
          token,
          chatId,
          `❌ <b>${escHtml(parsedTime.error)}</b>\nTap <b>⚡ Upload Post Immediately (NOW)</b> or type time like <code>8.09 pm</code>:`,
          buildPostUploadTimeKeyboard()
        );
        return res.status(200).send("OK");
      }

      p.tempScheduledEpoch = parsedTime.epochMs;
      p.tempScheduledLabel = parsedTime.label;
      p.state = "GW_STEP5_DICE_COUNT";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `🎲 <b>STEP 5 OF 5: SELECT DICE COUNT & SMART NUMBER RANGE</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⏰ <b>Post Upload Time:</b> <code>${escHtml(parsedTime.label)}</code>\n\n` +
          `📌 <b>Choose how many Dice will roll (Creator triggers roll!):</b>\n` +
          `• <b>1 Dice (🎲):</b> <code>6 Numbers (1, 2, 3, 4, 5, 6)</code>\n` +
          `• <b>2 Dice (🎲🎲):</b> <code>11 Numbers (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)</code>\n` +
          `• <b>3 Dice (🎲🎲🎲):</b> <code>16 Numbers (3 to 18)</code>\n` +
          `• <b>4 Dice (🎲x4):</b> <code>21 Numbers (4 to 24)</code>\n` +
          `• <b>5 Dice (🎲x5):</b> <code>26 Numbers (5 to 30)</code>\n` +
          `• <b>6 Dice (🎲x6):</b> <code>31 Numbers (6 to 36)</code>\n\n` +
          `👇 <b>Select a Dice mode below:</b>`,
        buildSmartDiceCountKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 5: LAUNCH OR SCHEDULE THE AUTOMATIC DICE GIVEAWAY ----
    if (st === "GW_STEP5_DICE_COUNT") {
      let chosenDiceCount = 1;
      const lower = text.toLowerCase();
      if (lower.includes("2 dice") || lower === "2" || lower === "11" || lower === "12") {
        chosenDiceCount = 2;
      } else if (lower.includes("3 dice") || lower === "3" || lower === "16" || lower === "18") {
        chosenDiceCount = 3;
      } else if (lower.includes("4 dice") || lower === "4" || lower === "21" || lower === "24") {
        chosenDiceCount = 4;
      } else if (lower.includes("5 dice") || lower === "5" || lower === "26" || lower === "30") {
        chosenDiceCount = 5;
      } else if (lower.includes("6 dice") || lower === "31" || lower === "36") {
        chosenDiceCount = 6;
      } else {
        const m = text.match(/(\d+)/);
        if (m) {
          const val = parseInt(m[1], 10);
          if (val >= 1 && val <= 6) chosenDiceCount = val;
          else if (val === 11 || val === 12) chosenDiceCount = 2;
          else if (val >= 16 && val <= 18) chosenDiceCount = 3;
          else if (val >= 21 && val <= 24) chosenDiceCount = 4;
          else if (val >= 26 && val <= 30) chosenDiceCount = 5;
          else if (val >= 31 && val <= 36) chosenDiceCount = 6;
        }
      }

      const diceCfg = getSmartDiceConfig(chosenDiceCount);
      const gwId = "GW" + Math.floor(10000 + Math.random() * 90000);
      const targetChat = p.tempTargetChat || chatId;
      const rTarget = numOrDef(p.tempReactionTarget, 0);
      const schedEpoch = numOrDef(p.tempScheduledEpoch, 0);
      const waitMs = schedEpoch > Date.now() ? schedEpoch - Date.now() : 0;

      const gwObj = {
        id: gwId,
        botUsername: botUsername,
        creatorId: cUid,
        creatorName: cName,
        creatorUsername: cUname,
        targetChatId: targetChat,
        prize: p.tempPrize || "Special Prize",
        targetReactions: rTarget,
        scheduledEpoch: schedEpoch,
        scheduledLabel: p.tempScheduledLabel || "Instant (NOW)",
        diceCount: diceCfg.diceCount,
        minNumber: diceCfg.minNumber,
        maxNumber: diceCfg.maxNumber,
        totalNumbers: diceCfg.totalNumbers,
        status: waitMs > 0 ? "SCHEDULED_UPLOAD" : rTarget > 0 ? "WAITING_GATE" : "OPEN_NUMBERS",
        entriesLocked: false,
        fullNotified: false,
        realReactionTotal: 0,
        realReactionsBreakdown: {},
        userReactionsMap: {},
        participants: {},
        createdAt: formatIstShortTime(Date.now())
      };

      p.state = "IDLE";
      p.createdGiveaways = numOrDef(p.createdGiveaways, 0) + 1;
      await savePlayerState(dbUrl, basePath, cUid, p);

      // Case A: Scheduled for a future upload time (e.g. 8.09 pm)
      if (waitMs > 0) {
        await saveGiveaway(dbUrl, basePath, gwId, gwObj);

        if (waitMs <= 25000) {
          await sendBotMsg(
            token,
            chatId,
            `⏳ <b>Giveaway #${gwId} scheduled! Auto-uploading post in ${Math.ceil(waitMs / 1000)}s at ${escHtml(gwObj.scheduledLabel)}...</b>`,
            mainKb
          );
          await sleepMs(waitMs);
          await publishScheduledGiveawayPostNow(dbUrl, basePath, token, gwObj);
          return res.status(200).send("OK");
        }

        await sendBotMsg(
          token,
          chatId,
          `⏰ <b>DICE GIVEAWAY SCHEDULED FOR AUTO-UPLOAD!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 <b>Giveaway ID:</b> <code>${gwId}</code>\n` +
            `📢 <b>Target Chat:</b> <code>${escHtml(targetChat)}</code>\n` +
            `🏆 <b>Prize:</b> ${escHtml(gwObj.prize)}\n` +
            `🕒 <b>Post Upload Time:</b> <code>${escHtml(gwObj.scheduledLabel)}</code>\n` +
            `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Real Reactions" : "Skipped (0)"}</code>\n` +
            `🎲 <b>Smart Dice Range:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber} to ${diceCfg.maxNumber} = ${diceCfg.totalNumbers} Numbers)</code>\n` +
            `🔒 <b>Roll Authority:</b> <code>Creator Only (You)</code>\n\n` +
            `<i>At ${escHtml(gwObj.scheduledLabel)}, the post will upload automatically. Or tap below to upload it right now:</i>`,
          {
            inline_keyboard: [
              [{ text: "⚡ Upload Post Right Now", callback_data: `GW_PUB_NOW|${gwId}` }]
            ]
          }
        );
        return res.status(200).send("OK");
      }

      // Case B: Upload Post Immediately (NOW)
      gwObj.uploadedAtLabel = formatIstShortTime(Date.now());
      const rendered =
        rTarget > 0
          ? renderStage1ReactionGatePost(gwObj, null)
          : renderStage2NumberSelectionPost(gwObj);

      const postRes = await sendBotMsg(token, targetChat, rendered.text, rendered.reply_markup);
      if (!postRes || !postRes.ok) {
        await sendBotMsg(
          token,
          chatId,
          `❌ <b>Could not upload post to <code>${escHtml(targetChat)}</code>!</b>\n` +
            `Make sure <b>@${escHtml(botUsername)}</b> is added as an <b>Administrator</b> in <code>${escHtml(targetChat)}</code>, or choose <b>🤖 Start Here in Bot Chat</b>.`,
          mainKb
        );
        return res.status(200).send("OK");
      }

      gwObj.postMessageId = postRes.result.message_id;
      await saveGiveaway(dbUrl, basePath, gwId, gwObj);
      await autoPinGiveawayMessage(token, targetChat, gwObj.postMessageId);

      if (rTarget === 0) {
        await sendCreatorControlDeckDM(
          token,
          gwObj,
          `🎉 <b>DICE GIVEAWAY #${gwId} UPLOADED & NUMBERS ARE LIVE!</b>`
        );
      } else {
        await sendBotMsg(
          token,
          chatId,
          `🎉 <b>DICE GIVEAWAY #${gwId} UPLOADED & PINNED LIVE!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📢 <b>Chat:</b> <code>${escHtml(targetChat)}</code>\n` +
            `🏆 <b>Prize:</b> ${escHtml(gwObj.prize)}\n` +
            `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
            `❤️ <b>Reaction Target:</b> <code>${rTarget} Real Reactions (Auto-starts 10s after 100%!)</code>\n` +
            `🎲 <b>Smart Dice Range:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber} to ${diceCfg.maxNumber} = ${diceCfg.totalNumbers} Numbers)</code>\n` +
            `🔒 <b>Dice Roll Control:</b> <code>Creator Only (You)</code>`,
          mainKb,
          TG_EFFECTS.FIRE
        );
      }
      return res.status(200).send("OK");
    }

    // Default Fallback
    await sendBotMsg(
      token,
      chatId,
      `🎲 <b>Tap '🎲 Create Dice Giveaway' below to launch a new Automatic Giveaway:</b>`,
      mainKb
    );
  } catch (err) {}

  return res.status(200).send("OK");
}