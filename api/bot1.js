// ============================================================================
// 👑 FILE: api/bot1.js — 24/7 REAL REACTION & SMART DICE GIVEAWAY ENGINE 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot1
// Included Features (0% Forgotten):
// 1. Real Native Telegram Post Reactions Counter (message_reaction_count & message_reaction)
// 2. Live Reaction Completion Percentage (e.g. 50% Complete) + Emoji Breakdown
// 3. Automatic 10-Second Countdown -> Auto-Opens Number Selection after 100% Reactions!
// 4. Scheduled Post Upload Time (e.g. 8.09 pm uploads post; whenever reactions finish
//    even at 8.30 pm, 10 seconds later number selection starts automatically!)
// 5. Smart Dice Mathematics:
//    - 1 Dice (🎲)       -> 6 Numbers:  1, 2, 3, 4, 5, 6
//    - 2 Dice (🎲🎲)     -> 11 Numbers: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 (No '1'!)
//    - 3 Dice (🎲🎲🎲)   -> 16 Numbers: 3, 4, 5, ..., 18 (No '1' or '2'!)
//    - N Dice            -> (5*N + 1) Numbers: From N to 6*N
// 6. 1-User 1-Device Verification API Gateway Integration:
//    - Link:  https://verification-sigma-flax.vercel.app/?userid={UID}&bot={BOT}
//    - Check: https://verification-sigma-flax.vercel.app/api/verify?userid={UID}&bot={BOT}
//    - Blocks unverified users & permanently blocks 403 BANNED (Multi-Account) users!
// 7. Sends Full Winner Details (Name, @Username, User ID, Device ID) to Giveaway Creator!
// ============================================================================

const PRIMARY_FIREBASE_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const MIRROR_FIREBASE_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const VERIFY_WEB_BASE = "https://verification-sigma-flax.vercel.app/";
const VERIFY_API_BASE = "https://verification-sigma-flax.vercel.app/api/verify";
const MASTER_ADMIN = "7335163273";

// ============================================================================
// 1. UTILITIES, SMART DICE MATH & IST TIME PARSER
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

/**
 * Calculates exact mathematical range for N dice:
 * 1 Dice -> min: 1, max: 6,  totalNumbers: 6  (1..6)
 * 2 Dice -> min: 2, max: 12, totalNumbers: 11 (2..12)
 * 3 Dice -> min: 3, max: 18, totalNumbers: 16 (3..18)
 * 4 Dice -> min: 4, max: 24, totalNumbers: 21 (4..24)
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

function formatIstTime(epochMs) {
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
 * Parses post upload time input like "8.09 pm", "8:09 PM", "20:09", or "NOW"
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
    return { ok: false, error: "Invalid time format! Example: 8.09 pm or 9:30 pm" };
  }

  let hours = parseInt(m[1], 10);
  const minutes = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  const mer = m[3] ? m[3].toLowerCase() : "";

  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) {
    return { ok: false, error: "Invalid hours or minutes! Example: 8.09 pm" };
  }

  if (mer === "pm" && hours < 12) hours += 12;
  if (mer === "am" && hours === 12) hours = 0;

  const istNow = getIstNowDate();
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();

  const targetIstAsUtc = Date.UTC(year, month, day, hours, minutes, 0, 0);
  let targetEpochMs = targetIstAsUtc - 5.5 * 60 * 60 * 1000;

  // If the time has already passed today by more than 2 minutes, schedule for tomorrow
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
 * Builds visual progress bar + exact percentage (e.g. 50% Complete)
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
// 2. 1-USER 1-DEVICE VERIFICATION API GATEWAY CHECKER
// ============================================================================
function getVerificationWebLink(userId, botUsername) {
  const cleanBot = String(botUsername || "Kumar_api_bot").replace(/^@/, "").trim();
  return `${VERIFY_WEB_BASE}?userid=${encodeURIComponent(String(userId))}&bot=${encodeURIComponent(cleanBot)}`;
}

function getVerificationApiUrl(userId, botUsername) {
  const cleanBot = String(botUsername || "Kumar_api_bot").replace(/^@/, "").trim();
  return `${VERIFY_API_BASE}?userid=${encodeURIComponent(String(userId))}&bot=${encodeURIComponent(cleanBot)}`;
}

/**
 * Calls https://verification-sigma-flax.vercel.app/api/verify?userid=...&bot=...
 * Returns { allowed, banned, verified, status, deviceId, firstUserId, message }
 */
async function checkUserDeviceVerification(userId, botUsername) {
  try {
    const apiUrl = getVerificationApiUrl(userId, botUsername);
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const data = await res.json();

    // Case 1: 403 BANNED (2nd User on Same Device -> Direct Banned!)
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
        reason: data.reason || "MULTIPLE_ACCOUNTS_SAME_DEVICE",
        message:
          data.message ||
          "Direct Banned 🚫! Multiple accounts detected on the same device."
      };
    }

    // Case 2: 200 OK — VERIFIED or ALREADY VERIFIED
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
        deviceId: data.deviceId || "VERIFIED-DEV",
        firstUserId: data.userid || String(userId),
        message: data.message || "Verification Successful ✅!"
      };
    }

    // Case 3: Not Verified Yet
    return {
      allowed: false,
      banned: false,
      verified: false,
      status: "unverified",
      deviceId: "",
      message:
        data.message ||
        "⚠️ Device Not Verified! Tap the '🛡️ Verify Device' button on the post first."
    };
  } catch (e) {
    return {
      allowed: false,
      banned: false,
      verified: false,
      status: "unverified",
      deviceId: "",
      message: "⚠️ Please complete Device Verification first using the '🛡️ Verify Device' button!"
    };
  }
}

// ============================================================================
// 3. FIREBASE REALTIME DATABASE HELPERS
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
// 4. TELEGRAM BOT API HELPERS
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
  if (!token || !chatId) return { ok: false };
  const payload = {
    chat_id: String(chatId),
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return await tgPost(token, "sendMessage", payload);
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
// 5. KEYBOARD BUILDERS FOR DICE GIVEAWAY BOT
// ============================================================================
function buildMainGiveawayKeyboard(isAdminUser) {
  const rows = [
    [{ text: "🎲 Create Dice Giveaway" }, { text: "🎁 Active Giveaways" }],
    [{ text: "🛡️ Verify My Device" }, { text: "📜 My Created Giveaways" }],
    [{ text: "🏆 Past Winners" }, { text: "👤 My Profile" }],
    [{ text: "ℹ️ How Giveaway Works" }]
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
// 6. REAL TELEGRAM REACTION COUNTER & STAGE RENDERERS
// ============================================================================
function getRealReactionSummary(gw) {
  const breakdown = gw.realReactionsBreakdown || {};
  const userMap = gw.userReactionsMap || {};

  // Combine per-user reactions (groups) and anonymous reaction counts (channels)
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
      : "<i>React on this post below with ❤️ 👍 🔥 🎉 🤩 🏆 etc.!</i>";

  return { total, breakdownLine };
}

/**
 * STAGE 1: Real Telegram Reaction Gate Post
 * Shows live Reaction %, Progress Bar, Bot @username, and Real Emoji Breakdown!
 */
function renderStage1ReactionGatePost(gw, isCountdown10Sec = false) {
  const { total, breakdownLine } = getRealReactionSummary(gw);
  const target = numOrDef(gw.targetReactions, 10);
  const { percent, bar, remaining } = buildReactionProgressStats(total, target);

  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");

  let statusSection = "";
  if (isCountdown10Sec || (target > 0 && total >= target)) {
    statusSection =
      `🎉 <b>100% REACTIONS COMPLETED! (${total} / ${target})</b>\n` +
      `🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢 <b>100%</b>\n\n` +
      `⏳ <b>Auto-Starting Number Selection (${diceCfg.minNumber} to ${diceCfg.maxNumber}) in 10 Seconds...</b>`;
  } else {
    statusSection =
      `${target} Real Reactions पूर्ण करा आणि Giveaway सुरू करा!\n\n` +
      `📊 <b>Progress: ${percent}% Complete (${total} / ${target})</b>\n` +
      `${bar}\n` +
      `🔥 <b>${remaining} More Reaction(s) Needed to Unlock Numbers!</b>`;
  }

  const text =
    `🎁 <b>DICE GIVEAWAY — WAITING FOR REACTIONS!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Giveaway Bot:</b> @${escHtml(botUname)}\n` +
    `👑 <b>Hosted By:</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.diceEmojis})</code> ➔ <b>${diceCfg.totalNumbers} Numbers (${diceCfg.minNumber} to ${diceCfg.maxNumber})</b>\n` +
    `🕒 <b>Post Uploaded:</b> <code>${escHtml(gw.uploadedAtLabel || gw.scheduledLabel || "Live")}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${statusSection}\n\n` +
    `💬 <b>Live Post Reactions:</b>\n${breakdownLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👇 <i>Long-press / tap this post to add a Real Telegram Reaction (❤️ 👍 🔥 🎉), and verify your device below so you are ready when numbers unlock!</i>`;

  const inline_keyboard = [
    [
      {
        text: `🛡️ Verify Device (@${botUname})`,
        url: `https://t.me/${botUname}?start=VERIFY_${gw.id}`
      }
    ],
    [
      {
        text: `🔄 Refresh Reaction Status (${percent}%)`,
        callback_data: `GW_CHECK|${gw.id}`
      }
    ]
  ];

  return { text, reply_markup: { inline_keyboard } };
}

/**
 * STAGE 2: Smart Number Selection Post (Unlocked automatically 10s after reactions complete!)
 * - 1 Dice: Buttons 1 to 6 (6 numbers)
 * - 2 Dice: Buttons 2 to 12 (11 numbers - no '1'!)
 * - 3 Dice: Buttons 3 to 18 (16 numbers - no '1' or '2'!)
 * - Includes Verification Button & blocks Banned/Unverified users!
 */
function renderStage2NumberSelectionPost(gw) {
  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");
  const participants = gw.participants || {};
  const pIds = Object.keys(participants);
  const { total, breakdownLine } = getRealReactionSummary(gw);
  const target = numOrDef(gw.targetReactions, 0);

  // Map which numbers have been picked
  const numberToUser = {};
  for (const uid of pIds) {
    const pObj = participants[uid];
    numberToUser[Number(pObj.number)] = pObj;
  }

  let pListStr = "";
  if (pIds.length === 0) {
    pListStr = `<i>No verified user has picked a number yet. Verify & pick yours below!</i>\n`;
  } else {
    pIds.slice(0, 30).forEach((uid, idx) => {
      const u = participants[uid];
      const unameStr = u.username ? `@${escHtml(u.username)}` : "None";
      pListStr +=
        `${idx + 1}. 👤 <b>${escHtml(u.name)}</b> (${unameStr} | <code>${u.id}</code>) ➔ 🎯 <b>#${u.number}</b> ✅\n`;
    });
  }

  const text =
    `🎲 <b>DICE GIVEAWAY IS NOW LIVE!</b> 🎲\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Bot:</b> @${escHtml(botUname)}\n` +
    `👑 <b>Host:</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.diceEmojis})</code>\n` +
    `🔢 <b>Valid Numbers (${diceCfg.totalNumbers}):</b> <code>${diceCfg.minNumber} to ${diceCfg.maxNumber}</code>\n` +
    (target > 0
      ? `✅ <b>Reactions:</b> <code>100% Complete (${total}/${target})</code>\n   ${breakdownLine}\n`
      : `⏭️ <b>Reactions:</b> Skipped (Instant Start)\n`) +
    `🛡️ <b>Security:</b> <code>1 User = 1 Device Verification Active ⚡</code>\n` +
    `👥 <b>Joined Verified Users:</b> <code>${pIds.length} / ${diceCfg.totalNumbers}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Verified Players (Name | Username | ID | Number):</b>\n` +
    `${pListStr}\n` +
    `👇 <b>Step 1: Verify Device (@${escHtml(botUname)}) • Step 2: Select Number (${diceCfg.minNumber} to ${diceCfg.maxNumber}):</b>`;

  const inline_keyboard = [];

  // Top Row: 1-User 1-Device Verification Button via Bot
  inline_keyboard.push([
    {
      text: `🛡️ Step 1: Verify Device (@${botUname})`,
      url: `https://t.me/${botUname}?start=VERIFY_${gw.id}`
    }
  ]);

  // Smart Number Grid: Starts from diceCfg.minNumber (e.g. 2 for 2 Dice) up to diceCfg.maxNumber (e.g. 12)
  let currentRow = [];
  for (const num of diceCfg.numbersList) {
    const pickedBy = numberToUser[num];
    const btnLabel = pickedBy ? `🔒 ${num} (${pickedBy.name.slice(0, 5)})` : `🎯 ${num}`;
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

  // Roll Dice Button
  inline_keyboard.push([
    {
      text: `🎲 ROLL ${diceCfg.diceCount} DICE NOW & ANNOUNCE WINNER!`,
      callback_data: `GW_ROLL|${gw.id}`
    }
  ]);

  return { text, reply_markup: { inline_keyboard } };
}

// ============================================================================
// 7. AUTO-TRANSITION FROM REACTION GATE -> 10 SECONDS -> NUMBER SELECTION
// ============================================================================
async function trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw) {
  if (!gw || gw.status !== "WAITING_GATE" || gw.autoStarting) return;

  // Lock autoStarting so parallel reaction events don't trigger twice
  gw.autoStarting = true;
  await patchGiveaway(dbUrl, basePath, gw.id, { autoStarting: true });

  // 1. Immediately update post to show 100% Reactions Complete + 10s Countdown
  const countdownRender = renderStage1ReactionGatePost(gw, true);
  await editBotMsg(
    token,
    gw.targetChatId,
    gw.postMessageId,
    countdownRender.text,
    countdownRender.reply_markup
  );

  // 2. Wait 10 Seconds (9.5s to stay safely inside serverless window)
  await sleepMs(9500);

  // 3. Switch Giveaway status to OPEN_NUMBERS & display Smart Number Selection Grid!
  gw.status = "OPEN_NUMBERS";
  gw.autoStarting = false;
  gw.unlockedAt = formatIstTime(Date.now());
  await saveGiveaway(dbUrl, basePath, gw.id, gw);

  const stage2Render = renderStage2NumberSelectionPost(gw);
  await editBotMsg(
    token,
    gw.targetChatId,
    gw.postMessageId,
    stage2Render.text,
    stage2Render.reply_markup
  );

  // Notify Creator in Bot Chat that 100% Reactions completed and Number Selection is now Open!
  await sendBotMsg(
    token,
    gw.creatorId,
    `🔥 <b>100% REACTIONS COMPLETED ON GIVEAWAY #${gw.id}!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
      `⏱️ <b>10-Second Countdown Finished!</b>\n` +
      `🎯 <b>Number Selection (${gw.minNumber || gw.diceCount} to ${gw.maxNumber}) is now LIVE in <code>${escHtml(gw.targetChatId)}</code>!</b>`
  );
}

// ============================================================================
// 8. EXECUTE MULTI-DICE ROLL & NOTIFY CREATOR + WINNER + CHANNEL
// ============================================================================
async function executeSmartDiceRollAndFinish(dbUrl, basePath, token, gw) {
  const { total } = getRealReactionSummary(gw);
  const targetReactions = numOrDef(gw.targetReactions, 0);

  if (targetReactions > 0 && total < targetReactions && !gw.forceUnlocked) {
    return {
      ok: false,
      error: `⚠️ Cannot roll dice yet! Reactions are ${total}/${targetReactions}. Complete 100% reactions first!`
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

  gw.status = "ROLLING";
  await patchGiveaway(dbUrl, basePath, gw.id, { status: "ROLLING" });

  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const targetChatId = gw.targetChatId || gw.creatorId;
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");

  // Roll N real animated Telegram Dice (🎲) in the target chat!
  const rolledValues = [];
  let sumTotal = 0;
  for (let i = 0; i < diceCfg.diceCount; i++) {
    const val = await sendAnimatedDice(token, targetChatId);
    rolledValues.push(val);
    sumTotal += val;
  }

  // Wait 3.5 seconds so users see the animated dice finish rolling before winner pops up
  await sleepMs(3500);

  // Find exact match winner(s) for sumTotal (which is guaranteed between N and 6N!)
  let winners = [];
  for (const uid of pIds) {
    if (Number(participants[uid].number) === sumTotal) {
      winners.push(participants[uid]);
    }
  }

  // If nobody picked the exact sumTotal, pick the participant whose number is closest to sumTotal
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

  gw.status = "FINISHED";
  gw.rolledValues = rolledValues;
  gw.winningNumber = sumTotal;
  gw.winners = winners;
  gw.finishedAt = formatIstTime(Date.now());
  await saveGiveaway(dbUrl, basePath, gw.id, gw);

  const diceBreakdown = rolledValues
    .map((v, i) => `🎲 Dice #${i + 1}: <b>${v}</b>`)
    .join("  +  ");

  // Build Winner Block (Name, @Username, User ID, Device ID, Number)
  let winnerSection = "";
  winners.forEach((w, idx) => {
    const wUname = w.username ? `@${escHtml(w.username)}` : "None";
    winnerSection +=
      `🏆 <b>WINNER #${idx + 1} DETAILS:</b>\n` +
      ` ┣ 👤 <b>Name:</b> ${escHtml(w.name)}\n` +
      ` ┣ 🌐 <b>Username:</b> ${wUname}\n` +
      ` ┣ 🆔 <b>User ID:</b> <code>${w.id}</code>\n` +
      ` ┣ 🛡️ <b>Device ID:</b> <code>${escHtml(w.deviceId || "VERIFIED")}</code>\n` +
      ` ┗ 🎯 <b>Winning Number:</b> <code>#${w.number}</code> ${matchedByClosest ? `(Closest to ${sumTotal})` : "(Exact Match! 🎯)"}\n\n`;
  });

  // Build All Joined Users List
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
    `🤖 <b>Bot:</b> @${escHtml(botUname)}\n` +
    `👑 <b>Hosted By:</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `🎲 <b>Dice Rolled (${diceCfg.diceCount}x):</b> ${diceBreakdown}\n` +
    `🎯 <b>Final Dice Total:</b> <code>#${sumTotal}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>ALL VERIFIED PARTICIPANTS (${pIds.length}):</b>\n` +
    `${allUsersSection}`;

  // 1. Update Giveaway Post & Send Result in Channel/Group
  if (gw.postMessageId) {
    await editBotMsg(token, targetChatId, gw.postMessageId, finalResultHtml, null);
  }
  await sendBotMsg(token, targetChatId, finalResultHtml, null);

  // 2. ALWAYS SEND WINNER NOTIFICATION MESSAGE TO THE GIVEAWAY CREATOR IN BOT!
  const creatorAlertHtml =
    `👑 <b>YOUR GIVEAWAY #${gw.id} HAS A WINNER!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📢 <b>Channel / Chat:</b> <code>${escHtml(targetChatId)}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🎲 <b>Dice Rolled:</b> ${diceBreakdown} = <b>#${sumTotal}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>All Joined Users (${pIds.length}):</b>\n${allUsersSection}`;

  await sendBotMsg(token, gw.creatorId, creatorAlertHtml, null);

  // 3. Also DM the Winner(s) directly in Bot!
  for (const w of winners) {
    if (String(w.id) !== String(gw.creatorId)) {
      await sendBotMsg(
        token,
        w.id,
        `🎉 <b>CONGRATULATIONS! YOU WON THE DICE GIVEAWAY!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
          `🏆 <b>Prize Won:</b> ${escHtml(gw.prize)}\n` +
          `🎲 <b>Winning Dice Roll:</b> <code>#${sumTotal}</code>\n` +
          `👤 <b>Name:</b> ${escHtml(w.name)}\n` +
          `🌐 <b>Username:</b> ${w.username ? "@" + escHtml(w.username) : "None"}\n` +
          `🆔 <b>User ID:</b> <code>${w.id}</code>\n` +
          `🛡️ <b>Verified Device:</b> <code>${escHtml(w.deviceId || "VERIFIED")}</code>\n\n` +
          `👑 <b>Giveaway Host has been notified!</b> Host: ${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"}`
      );
    }
  }

  return { ok: true };
}

// ============================================================================
// 9. CHECK & PUBLISH SCHEDULED GIVEAWAYS (WHEN UPLOAD TIME e.g. 8.09 PM ARRIVES)
// ============================================================================
async function checkAndPublishScheduledGiveaways(dbUrl, basePath, token, node) {
  const giveaways = node.giveaways || {};
  const now = Date.now();

  for (const gwId of Object.keys(giveaways)) {
    const gw = giveaways[gwId];
    if (!gw || gw.status !== "SCHEDULED_UPLOAD") continue;

    const uploadEpoch = numOrDef(gw.scheduledEpoch, 0);
    if (uploadEpoch <= 0 || now >= uploadEpoch) {
      await publishScheduledGiveawayPostNow(dbUrl, basePath, token, gw);
    }
  }
}

async function publishScheduledGiveawayPostNow(dbUrl, basePath, token, gw) {
  if (!gw || gw.status !== "SCHEDULED_UPLOAD") return false;

  const targetReactions = numOrDef(gw.targetReactions, 0);
  const nextStatus = targetReactions > 0 ? "WAITING_GATE" : "OPEN_NUMBERS";
  gw.status = nextStatus;
  gw.uploadedAtLabel = formatIstShortTime(Date.now());

  const rendered =
    nextStatus === "WAITING_GATE"
      ? renderStage1ReactionGatePost(gw, false)
      : renderStage2NumberSelectionPost(gw);

  const postRes = await sendBotMsg(token, gw.targetChatId, rendered.text, rendered.reply_markup);
  if (postRes && postRes.ok && postRes.result) {
    gw.postMessageId = postRes.result.message_id;
    await saveGiveaway(dbUrl, basePath, gw.id, gw);

    await sendBotMsg(
      token,
      gw.creatorId,
      `⏰ <b>SCHEDULED GIVEAWAY #${gw.id} UPLOADED LIVE!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 <b>Channel / Chat:</b> <code>${escHtml(gw.targetChatId)}</code>\n` +
        `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
        `❤️ <b>Reaction Target:</b> <code>${targetReactions > 0 ? targetReactions + " Real Reactions" : "Skipped (Numbers Open Now!)"}</code>\n\n` +
        `🔥 <i>As soon as ${targetReactions} reactions are completed on the post, Number Selection will start automatically in 10 seconds!</i>`
    );
    return true;
  }
  return false;
}

// ============================================================================
// 10. HANDLE REAL TELEGRAM POST REACTIONS (message_reaction_count & message_reaction)
// ============================================================================
async function handleRealTelegramReactionUpdate(dbUrl, basePath, token, node, upd) {
  const giveaways = node.giveaways || {};
  const gwIds = Object.keys(giveaways);
  if (gwIds.length === 0) return;

  // 1. Channel Post Reaction Count Update (message_reaction_count)
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
            const em = item.type?.emoji || "✨";
            breakdown[em] = (breakdown[em] || 0) + cnt;
          }
        }

        gw.realReactionTotal = total;
        gw.realReactionsBreakdown = breakdown;
        await saveGiveaway(dbUrl, basePath, gw.id, gw);

        const target = numOrDef(gw.targetReactions, 10);
        if (total >= target) {
          // 100% REACTIONS COMPLETED -> WAIT 10 SECONDS & AUTO-START NUMBER SELECTION!
          await trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw);
        } else {
          // Update Live % and Progress Bar on Post
          const rendered = renderStage1ReactionGatePost(gw, false);
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

  // 2. Individual User Reaction Update in Group/Bot Chat (message_reaction)
  if (upd.message_reaction) {
    const mr = upd.message_reaction;
    const chatId = String(mr.chat?.id || "");
    const chatUname = mr.chat?.username ? "@" + String(mrc?.chat?.username || mr.chat?.username || "").toLowerCase() : "";
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

        // Recalculate breakdown from userReactionsMap
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
          const rendered = renderStage1ReactionGatePost(gw, false);
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

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: dynamicWebhookBase,
      engine: "Kurmurya 24/7 Real Reaction & Smart Dice Giveaway Bot (1-User 1-Device Verified)",
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
        realReactionWebhookV2: true,
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
        `🎲 <b>24/7 DICE GIVEAWAY BOT CONNECTED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🤖 <b>Bot Username:</b> @${escHtml(uname)}\n` +
          `👑 <b>Owner ID:</b> <code>${owner}</code>\n` +
          `🛡️ <b>1-User 1-Device API:</b> <code>ACTIVE ⚡</code>\n` +
          `❤️ <b>Real Post Reactions + 10s Auto-Start:</b> <code>ACTIVE ⚡</code>\n\n` +
          `👇 Send <b>/start</b> to create your first <b>🎲 Dice Giveaway</b>!`,
        buildMainGiveawayKeyboard(true)
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

    // Ensure native Telegram reaction updates (`message_reaction_count` & `message_reaction`) are enabled
    if (!b.realReactionWebhookV2) {
      b.realReactionWebhookV2 = true;
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

    // Handle Real Telegram Post Reactions (message_reaction_count & message_reaction)
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
    // C. HANDLE INLINE BUTTON CALLBACKS (CHECK REACTION, VERIFY & PICK NUMBER, ROLL DICE)
    // ========================================================================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;

      // 1. User clicked "🔄 Refresh Reaction Status (%)" on Stage 1 Post
      if (data.startsWith("GW_CHECK|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw) {
          await answerCb(token, cbId, "⚠️ Giveaway not found!", true);
          return res.status(200).send("OK");
        }

        const { total } = getRealReactionSummary(gw);
        const target = numOrDef(gw.targetReactions, 10);
        const { percent, remaining } = buildReactionProgressStats(total, target);

        if (total >= target && gw.status === "WAITING_GATE") {
          await answerCb(
            token,
            cbId,
            "🎉 100% Reactions Complete! Starting in 10 seconds...",
            true
          );
          await trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw);
        } else {
          await answerCb(
            token,
            cbId,
            `📊 Progress: ${percent}% Complete (${total}/${target} Real Reactions). Need ${remaining} more!`,
            true
          );
          const rendered = renderStage1ReactionGatePost(gw, false);
          await editBotMsg(
            token,
            gw.targetChatId,
            gw.postMessageId,
            rendered.text,
            rendered.reply_markup
          );
        }
        return res.status(200).send("OK");
      }

      // 2. Creator clicked "⚡ Publish Scheduled Post Now"
      if (data.startsWith("GW_PUB_NOW|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw) {
          await answerCb(token, cbId, "⚠️ Giveaway not found!", true);
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

      // 3. User clicked a Number Button (e.g. 🎯 2 .. 🎯 12): "GW_PICK|<gwId>|<num>"
      //    -> ENFORCES 1-USER 1-DEVICE VERIFICATION API & BLOCKS BANNED USERS!
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
            "⚠️ Reactions are not 100% complete yet! Complete the post reactions first.",
            true
          );
          return res.status(200).send("OK");
        }

        // Fast check if user was already marked banned in Firebase
        if (p.banned === true) {
          await answerCb(
            token,
            cbId,
            "🚫 ACCESS DENIED (403 BANNED): Multiple accounts on same device! Banned users cannot pick a number.",
            true
          );
          return res.status(200).send("OK");
        }

        // LIVE CALL TO VERIFICATION API GATEWAY (`verification-sigma-flax.vercel.app/api/verify`)
        const verifyCheck = await checkUserDeviceVerification(cUid, botUsername);

        if (verifyCheck.banned) {
          // 403 BANNED (2nd User on Same Device) -> Block permanently!
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
          // User has NOT completed 1-User 1-Device verification yet!
          await answerCb(
            token,
            cbId,
            `🔒 DEVICE VERIFICATION REQUIRED!\nTap '🛡️ Step 1: Verify Device (@${botUsername})' button on the post first!`,
            true
          );

          // Also DM user the direct verification button in Bot chat if possible
          const verifyUrl = getVerificationWebLink(cUid, botUsername);
          await sendBotMsg(
            token,
            cUid,
            `🛡️ <b>1-USER 1-DEVICE VERIFICATION REQUIRED</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
              `🆔 <b>Your User ID:</b> <code>${cUid}</code>\n\n` +
              `⚠️ To select Lucky Number <b>#${pickedNum}</b> in Giveaway <code>${gwId}</code>, you must verify your device first (1 User = 1 Device).\n\n` +
              `👇 <b>Tap below to Verify in 2 Seconds:</b>`,
            {
              inline_keyboard: [
                [{ text: "🛡️ Verify Device (Mini App)", web_app: { url: verifyUrl } }],
                [{ text: "✅ I Have Verified — Check Status", callback_data: `VERIFY_CHECK_ME|${gwId}` }]
              ]
            }
          );
          return res.status(200).send("OK");
        }

        // User is 100% VERIFIED (200 OK)! Save deviceId and lock their number
        p.verified = true;
        p.banned = false;
        p.deviceId = verifyCheck.deviceId;
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (!gw.participants) gw.participants = {};

        // Check if another user already locked this exact number
        for (const existingUid of Object.keys(gw.participants)) {
          if (
            existingUid !== cUid &&
            Number(gw.participants[existingUid].number) === pickedNum
          ) {
            await answerCb(
              token,
              cbId,
              `⚠️ Number #${pickedNum} is already locked by ${gw.participants[existingUid].name}! Pick another number.`,
              true
            );
            return res.status(200).send("OK");
          }
        }

        gw.participants[cUid] = {
          id: cUid,
          name: cName,
          username: cUname,
          deviceId: verifyCheck.deviceId,
          number: pickedNum,
          joinedAt: formatIstShortTime(Date.now())
        };

        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(
          token,
          cbId,
          `✅ Verified (${verifyCheck.deviceId})! You locked Lucky Number #${pickedNum}!`,
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

        // If all available numbers (e.g. all 6 for 1 Dice or all 11 for 2 Dice) are filled, auto-roll Dice!
        const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
        if (Object.keys(gw.participants).length >= diceCfg.totalNumbers) {
          await executeSmartDiceRollAndFinish(dbUrl, basePath, token, gw);
        }
        return res.status(200).send("OK");
      }

      // 4. User clicked "✅ I Have Verified — Check Status": "VERIFY_CHECK_ME|<gwId>"
      if (data.startsWith("VERIFY_CHECK_ME|")) {
        const vCheck = await checkUserDeviceVerification(cUid, botUsername);
        if (vCheck.banned) {
          p.banned = true;
          p.deviceId = vCheck.deviceId;
          await savePlayerState(dbUrl, basePath, cUid, p);
          await answerCb(token, cbId, "🚫 403 BANNED: Multiple accounts on same device!", true);
          await sendBotMsg(
            token,
            cUid,
            `🚫 <b>DIRECT BANNED (403)</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `❌ <b>Status:</b> DENIED 🚫 (${escHtml(vCheck.reason)})\n` +
              `🛡️ <b>Device ID:</b> <code>${escHtml(vCheck.deviceId)}</code>\n` +
              `🆔 <b>First Account on Device:</b> <code>${escHtml(vCheck.firstUserId)}</code>\n\n` +
              `<i>Banned accounts cannot participate in any Dice Giveaway.</i>`
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
            `✅ <b>DEVICE VERIFIED SUCCESSFULLY!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🛡️ <b>Access:</b> GRANTED ✅ (${escHtml(vCheck.status)})\n` +
              `📱 <b>Device ID:</b> <code>${escHtml(vCheck.deviceId)}</code>\n` +
              `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n\n` +
              `🎯 <b>Now go back to the Giveaway Post and tap your Lucky Number!</b>`
          );
          return res.status(200).send("OK");
        }

        const verifyUrl = getVerificationWebLink(cUid, botUsername);
        await answerCb(token, cbId, "❌ Not verified yet! Tap the Verify link first.", true);
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Still Not Verified!</b>\nTap the button below to complete verification in your browser:`,
          {
            inline_keyboard: [[{ text: "⚡ Open Verification Page", url: verifyUrl }]]
          }
        );
        return res.status(200).send("OK");
      }

      // 5. Host / User clicked "🎲 ROLL DICE NOW & ANNOUNCE WINNER!": "GW_ROLL|<gwId>"
      if (data.startsWith("GW_ROLL|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];

        if (!gw || gw.status === "FINISHED" || gw.status === "ROLLING") {
          await answerCb(token, cbId, "⚠️ Dice already rolled for this giveaway!", true);
          return res.status(200).send("OK");
        }

        const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
        const pCount = Object.keys(gw.participants || {}).length;

        if (cUid !== String(gw.creatorId) && !isAdm && pCount < diceCfg.totalNumbers) {
          await answerCb(
            token,
            cbId,
            `⏳ Only the Giveaway Host (${gw.creatorName}) can roll early, or wait until all ${diceCfg.totalNumbers} numbers are picked!`,
            true
          );
          return res.status(200).send("OK");
        }

        await answerCb(token, cbId, `🎲 Rolling ${diceCfg.diceCount} Official Telegram Dice...`, false);
        const rollRes = await executeSmartDiceRollAndFinish(dbUrl, basePath, token, gw);
        if (!rollRes.ok) {
          await sendBotMsg(token, cUid, rollRes.error, mainKb);
        }
        return res.status(200).send("OK");
      }

      await answerCb(token, cbId, "Done", false);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // D. HANDLE TEXT MESSAGES & DEEP-LINK VERIFICATION (`/start VERIFY_...`)
    // ========================================================================
    const msgObj = upd.message;
    const chatId = String(msgObj.chat?.id || cUid);
    const text = String(msgObj.text || "").trim();

    // Global Cancel
    if (text.toLowerCase() === "❌ cancel" || text.toLowerCase() === "/cancel") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, "❌ <b>Operation Cancelled.</b>", mainKb);
      return res.status(200).send("OK");
    }

    // Handle `/start VERIFY_<gwId>` or `🛡️ Verify My Device`
    if (text.startsWith("/start VERIFY_") || text === "🛡️ Verify My Device") {
      p.state = "IDLE";
      const gwId = text.startsWith("/start VERIFY_") ? text.replace("/start VERIFY_", "").trim() : "MAIN";
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
            `🎯 <b>You are 100% eligible to select numbers in all Dice Giveaways!</b>`,
          mainKb
        );
        return res.status(200).send("OK");
      }

      const verifyUrl = getVerificationWebLink(cUid, botUsername);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `🛡️ <b>1-USER 1-DEVICE SECURITY GATEWAY</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
          `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n\n` +
          `📌 <b>Step 1:</b> Tap <b>⚡ Verify My Device Now</b> below.\n` +
          `📌 <b>Step 2:</b> After verification finishes, tap <b>✅ Check Verification Status</b> or pick your number on the Giveaway post!`,
        {
          inline_keyboard: [
            [{ text: `🛡️ Verify My Device (Mini App)`, web_app: { url: verifyUrl } }],
            [{ text: "✅ Check Verification Status", callback_data: `VERIFY_CHECK_ME|${gwId}` }]
          ]
        }
      );
      return res.status(200).send("OK");
    }

    if (text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const welcomeHtml =
        `🎲 <b>WELCOME TO @${escHtml(botUsername.toUpperCase())} — DICE GIVEAWAY BOT!</b> 🎁\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
        `🌐 <b>Username:</b> ${cUname ? "@" + escHtml(cUname) : "None"}\n` +
        `🛡️ <b>Device Status:</b> ${p.banned ? "🚫 <b>BANNED (403)</b>" : p.verified ? `✅ <b>VERIFIED (${escHtml(p.deviceId)})</b>` : "⏳ <b>Tap Verify Device</b>"}\n\n` +
        `🔥 <b>Smart Features:</b>\n` +
        `• <b>❤️ Real Post Reactions + % Bar:</b> Counts real Telegram reactions on the post!\n` +
        `• <b>⏱️ 10-Second Auto Start:</b> Once reactions reach 100%, number selection opens automatically in 10 seconds!\n` +
        `• <b>🎲 Smart Dice Math:</b>\n` +
        `  ┣ <code>1 Dice (🎲)</code> ➔ <b>6 Numbers (1 to 6)</b>\n` +
        `  ┣ <code>2 Dice (🎲🎲)</code> ➔ <b>11 Numbers (2 to 12)</b>\n` +
        `  ┗ <code>3 Dice (🎲🎲🎲)</code> ➔ <b>16 Numbers (3 to 18)</b>\n` +
        `• <b>🛡️ 1-User 1-Device Verification:</b> Blocks multi-account cheaters (403 Banned)!\n` +
        `• <b>👑 Instant Creator Alert:</b> Sends Winner's Name, @Username & ID directly to the Creator!\n\n` +
        `👇 <b>Choose an option from the menu below:</b>`;

      await sendBotMsg(token, chatId, welcomeHtml, mainKb);
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
          `• Tap <b>🤖 Start Here in Bot Chat</b> to test/run right here.\n` +
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
            ` ┣ ❤️ Reactions: <code>${percent}% (${total}/${g.targetReactions})</code> | 👥 Joined: <code>${pCount}</code>\n` +
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
            (g.winningNumber ? ` ┗ 🎯 Winning Dice Number: <code>#${g.winningNumber}</code>\n\n` : `\n`);
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
        .filter((g) => g && g.status === "FINISHED");

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
        `🎁 <b>Giveaways Hosted:</b> <code>${numOrDef(p.createdGiveaways, 0)}</code>`;

      await sendBotMsg(token, chatId, profHtml, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "ℹ️ How Giveaway Works") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const helpHtml =
        `ℹ️ <b>HOW SMART DICE GIVEAWAY WORKS</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `1️⃣ <b>Post Upload Time:</b> If you set <code>8.09 pm</code>, the Giveaway Reaction post uploads at <code>8.09 pm</code>.\n` +
        `2️⃣ <b>Real Telegram Reactions + %:</b> Users react directly on the post (❤️ 👍 🔥 🎉). Once reactions reach <b>100%</b> (even if at <code>8.30 pm</code>), the bot waits <b>10 seconds</b> and automatically opens Number Selection!\n` +
        `3️⃣ <b>Smart Dice Numbers:</b>\n` +
        `   • <b>1 Dice (🎲):</b> 6 Numbers (<code>1 to 6</code>)\n` +
        `   • <b>2 Dice (🎲🎲):</b> 11 Numbers (<code>2 to 12</code> — since 2 dice can never roll 1!)\n` +
        `   • <b>3 Dice (🎲🎲🎲):</b> 16 Numbers (<code>3 to 18</code>)\n` +
        `4️⃣ <b>1-User 1-Device Security:</b> Users must verify via @${escHtml(botUsername)}. Multi-account users get <b>403 BANNED 🚫</b> and cannot pick numbers.\n` +
        `5️⃣ <b>Creator Winner Alert:</b> When Dice rolls, the Winner's <b>Name, @Username & User ID</b> are sent straight to the Giveaway Creator!`;

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
          `🛡️ <b>Verification Gateway:</b> <code>ACTIVE (verification-sigma-flax.vercel.app)</code>\n` +
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
          `📌 <b>How many Real Telegram Reactions on the post are required to start?</b>\n` +
          `• Example: Send <code>10</code> (Shows live <code>%</code> progress bar; when 10 reactions complete, Number Selection starts automatically in <b>10 seconds</b>!)\n` +
          `• OR tap <b>⏭️ Skip Reaction (0)</b> to open Number Selection immediately:`,
        buildReactionTargetKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 3: REACTION TARGET -> ASK POST UPLOAD TIME (e.g. 8.09 pm or NOW) ----
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
          `• Type any time like <code>8.09 pm</code>, <code>8:30 pm</code>, <code>9.00 pm</code> (At that time the post uploads; whenever reactions reach 100% — even at 8.30 pm — Number Selection opens 10 seconds later!)\n` +
          `• OR tap <b>⚡ Upload Post Immediately (NOW)</b>:`,
        buildPostUploadTimeKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 4: POST UPLOAD TIME -> ASK SMART DICE COUNT (1 Dice=1..6, 2 Dice=2..12) ----
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
          `📌 <b>Choose how many Dice will roll:</b>\n` +
          `• <b>1 Dice (🎲):</b> <code>6 Numbers (1, 2, 3, 4, 5, 6)</code>\n` +
          `• <b>2 Dice (🎲🎲):</b> <code>11 Numbers (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)</code>\n` +
          `• <b>3 Dice (🎲🎲🎲):</b> <code>16 Numbers (3 to 18)</code>\n` +
          `• <b>4 Dice (🎲x4):</b> <code>21 Numbers (4 to 24)</code>\n\n` +
          `👇 <b>Tap a button below (or type <code>1</code>, <code>2</code>, <code>3</code>, or <code>6</code> / <code>12</code>):</b>`,
        buildSmartDiceCountKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 5: CREATE OR SCHEDULE THE GIVEAWAY POST! ----
    if (st === "GW_STEP5_DICE_COUNT") {
      let chosenDiceCount = 1;
      const lower = text.toLowerCase();
      if (lower.includes("2 dice") || lower === "2" || lower === "11" || lower === "12") {
        chosenDiceCount = 2;
      } else if (lower.includes("3 dice") || lower === "3" || lower === "16" || lower === "18") {
        chosenDiceCount = 3;
      } else if (lower.includes("4 dice") || lower === "4" || lower === "21" || lower === "24") {
        chosenDiceCount = 4;
      } else {
        const m = text.match(/(\d+)/);
        if (m) {
          const val = parseInt(m[1], 10);
          if (val >= 1 && val <= 4) chosenDiceCount = val;
          else if (val === 11 || val === 12) chosenDiceCount = 2;
          else if (val >= 16 && val <= 18) chosenDiceCount = 3;
          else if (val >= 21 && val <= 24) chosenDiceCount = 4;
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
        realReactionTotal: 0,
        realReactionsBreakdown: {},
        userReactionsMap: {},
        participants: {},
        createdAt: formatIstShortTime(Date.now())
      };

      p.state = "IDLE";
      p.createdGiveaways = numOrDef(p.createdGiveaways, 0) + 1;
      await savePlayerState(dbUrl, basePath, cUid, p);

      // Case A: Scheduled for a future time (e.g. 8.09 pm)
      if (waitMs > 0) {
        await saveGiveaway(dbUrl, basePath, gwId, gwObj);

        // If scheduled within 25 seconds, wait right here & auto-upload at exact time!
        if (waitMs <= 25000) {
          await sendBotMsg(
            token,
            chatId,
            `⏳ <b>Giveaway #${gwId} scheduled! Uploading post in ${Math.ceil(waitMs / 1000)}s at ${escHtml(gwObj.scheduledLabel)}...</b>`,
            mainKb
          );
          await sleepMs(waitMs);
          await publishScheduledGiveawayPostNow(dbUrl, basePath, token, gwObj);
          return res.status(200).send("OK");
        }

        await sendBotMsg(
          token,
          chatId,
          `⏰ <b>DICE GIVEAWAY SCHEDULED FOR UPLOAD!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 <b>Giveaway ID:</b> <code>${gwId}</code>\n` +
            `📢 <b>Target Chat:</b> <code>${escHtml(targetChat)}</code>\n` +
            `🏆 <b>Prize:</b> ${escHtml(gwObj.prize)}\n` +
            `🕒 <b>Post Upload Time:</b> <code>${escHtml(gwObj.scheduledLabel)}</code>\n` +
            `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Real Reactions" : "Skipped (0)"}</code>\n` +
            `🎲 <b>Smart Dice Range:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber} to ${diceCfg.maxNumber} = ${diceCfg.totalNumbers} Numbers)</code>\n\n` +
            `<i>At ${escHtml(gwObj.scheduledLabel)}, the post will upload. Or tap below to upload it immediately:</i>`,
          {
            inline_keyboard: [
              [{ text: "⚡ Upload Post Now", callback_data: `GW_PUB_NOW|${gwId}` }]
            ]
          }
        );
        return res.status(200).send("OK");
      }

      // Case B: Upload Post Immediately (NOW)
      gwObj.uploadedAtLabel = formatIstShortTime(Date.now());
      const rendered =
        rTarget > 0
          ? renderStage1ReactionGatePost(gwObj, false)
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

      await sendBotMsg(
        token,
        chatId,
        `🎉 <b>DICE GIVEAWAY #${gwId} UPLOADED LIVE!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Chat:</b> <code>${escHtml(targetChat)}</code>\n` +
          `🏆 <b>Prize:</b> ${escHtml(gwObj.prize)}\n` +
          `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
          `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Real Reactions (Auto-starts 10s after 100%!)" : "Skipped (Numbers Open Now!)"}</code>\n` +
          `🎲 <b>Smart Dice Range:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber} to ${diceCfg.maxNumber} = ${diceCfg.totalNumbers} Numbers)</code>\n` +
          `🛡️ <b>1-User 1-Device Verification:</b> <code>ACTIVE ⚡</code>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    // Default Fallback
    await sendBotMsg(
      token,
      chatId,
      `🎲 <b>Tap '🎲 Create Dice Giveaway' below to start a new Giveaway:</b>`,
      mainKb
    );
  } catch (err) {}

  return res.status(200).send("OK");
}
