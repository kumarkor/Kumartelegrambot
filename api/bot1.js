// ============================================================================
// 👑 FILE: api/bot1.js — 24/7 OWNER-ONLY DICE GIVEAWAY + SMART WALLET API OS 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot1
// Cron URL: https://kumartelegrambot.vercel.app/api/bot1?cron=1
// Language: 100% English (0% Marathi)
//
// COMPLETE ARCHITECTURE:
// 1. OWNER-ONLY GIVEAWAY CREATION: Only the Bot Owner/Admin can create giveaways
//    and roll dice. Normal users participate, win cash prizes into their Wallet,
//    and withdraw via UPI or Custom Wallet API!
// 2. AUTO-CREDIT WINNER WALLET: Winning a Dice Giveaway automatically credits
//    the ₹ Prize Amount directly to the Winner's Bot Wallet + sends Claim Code!
// 3. DYNAMIC CUSTOM WALLET API WITHDRAWAL ENGINE:
//    - Admin sets Custom Wallet Name (e.g. "Payzy Wallet" / "SMARTU Wallet")
//    - Admin sets API URL Template with placeholders:
//      {amount}, {token}, {key}, {number}, {userid}, {comment}
//    - Supports User Token Only, User Key Only, Both User Token & Key, or
//      User Account/Number with Admin Merchant Token/Key!
//    - Auto-detects API Success vs Failure -> Instant Auto-Refund on Failure!
// 4. UPI WITHDRAWAL SYSTEM: Instant Admin Approve / Reject & Refund buttons!
// 5. 100% AUTOMATIC REAL REACTIONS + 10s COUNTDOWN + SCHEDULED POST UPLOAD
// 6. SMART MULTI-DICE MATH: 1 Dice (1-6) | 2 Dice (2-12) | 3 Dice (3-18)...
// 7. PRIVATE MINI-APP 1-USER 1-DEVICE VERIFICATION (`web_app`, Blocks 403 BANNED)
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
// 1. CORE FORMATTING, SMART DICE MATH & IST TIME ENGINE
// ============================================================================
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtRs(val) {
  const n = Number(val || 0);
  if (isNaN(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
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

function addHistory(p, entry) {
  if (!Array.isArray(p.history)) p.history = [];
  p.history.unshift(`[${formatIstShortTime(Date.now())}] ${entry}`);
  if (p.history.length > 25) p.history = p.history.slice(0, 25);
}

/**
 * Smart Mathematical Dice Range Calculator:
 * 1 Dice -> 1..6  (6 numbers)
 * 2 Dice -> 2..12 (11 numbers - 1 is impossible on 2 dice!)
 * 3 Dice -> 3..18 (16 numbers)
 * 4 Dice -> 4..24 (21 numbers)
 * 5 Dice -> 5..30 (26 numbers)
 * 6 Dice -> 6..36 (31 numbers)
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
  return `${String(hrs).padStart(2, "0")}:${mins}:${secs} ${ampm} IST`;
}

function formatIstShortTime(epochMs) {
  if (!epochMs || epochMs <= 0) return "Instant (NOW)";
  const istDate = new Date(Number(epochMs) + 5.5 * 60 * 60 * 1000);
  let hrs = istDate.getUTCHours();
  const mins = String(istDate.getUTCMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  return `${String(hrs).padStart(2, "0")}:${mins} ${ampm} IST`;
}

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
  const targetIstAsUtc = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    hours,
    minutes,
    0,
    0
  );
  let targetEpochMs = targetIstAsUtc - 5.5 * 60 * 60 * 1000;
  if (targetEpochMs < Date.now() - 2 * 60 * 1000) {
    targetEpochMs += 24 * 60 * 60 * 1000;
  }

  return {
    ok: true,
    epochMs: targetEpochMs,
    label: formatIstShortTime(targetEpochMs)
  };
}

function buildReactionProgressStats(current, target) {
  if (!target || target <= 0) {
    return { percent: 100, bar: "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢", remaining: 0 };
  }
  const percent = Math.min(100, Math.max(0, Math.floor((current / target) * 100)));
  const filled = Math.min(10, Math.max(0, Math.round(percent / 10)));
  const bar = "🟢".repeat(filled) + "⚪".repeat(10 - filled);
  return { percent, bar, remaining: Math.max(0, target - current) };
}

function isBotOwner(b, uid) {
  const sUid = String(uid);
  const owner = String(b.owner || b.adminId || MASTER_ADMIN);
  return sUid === owner || sUid === MASTER_ADMIN;
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
          text: "✅ I Have Verified — Check Status",
          callback_data: `VERIFY_CHECK_ME|${gwId}`
        }
      ]
    ]
  };
}

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
        reason: data.reason || "MULTIPLE_ACCOUNTS_SAME_DEVICE",
        message: data.message || "Direct Banned 🚫! Multiple accounts detected on this device."
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
        message: data.message || "Verification Successful ✅!"
      };
    }

    return {
      allowed: false,
      banned: false,
      verified: false,
      status: "unverified",
      deviceId: "",
      message: data.message || "Please verify your device inside the Mini App first!"
    };
  } catch (e) {
    return {
      allowed: false,
      banned: false,
      verified: false,
      status: "unverified",
      deviceId: "",
      message: "Please verify your device inside the Mini App first!"
    };
  }
}

// ============================================================================
// 3. CUSTOM WALLET API AUTO-PAYOUT ENGINE ({amount}, {token}, {key}, {number})
// ============================================================================
/**
 * Normalizes Wallet API Configuration inside botConfig (`b.walletApi`)
 */
function getWalletApiConfig(b) {
  const w = b.walletApi || {};
  return {
    enabled: Boolean(w.enabled && w.apiUrl),
    walletName: String(w.walletName || "Custom Wallet"),
    apiUrl: String(w.apiUrl || ""),
    httpMethod: String(w.httpMethod || "GET").toUpperCase(), // GET or POST
    // Credential mode for USER:
    // "TOKEN" (User provides {token})
    // "KEY" (User provides {key})
    // "BOTH" (User provides {token} AND {key})
    // "NUMBER" (User provides {number}; Admin's merchant token/key used for {token}/{key})
    authMode: String(w.authMode || "BOTH").toUpperCase(),
    merchantToken: String(w.merchantToken || ""),
    merchantKey: String(w.merchantKey || "")
  };
}

/**
 * Checks whether the user has linked the required Wallet credentials for the configured authMode
 */
function getMissingUserWalletField(wCfg, p) {
  const mode = wCfg.authMode;
  if (mode === "TOKEN" && !p.userWalletToken) return "TOKEN";
  if (mode === "KEY" && !p.userWalletKey) return "KEY";
  if (mode === "BOTH") {
    if (!p.userWalletToken) return "TOKEN";
    if (!p.userWalletKey) return "KEY";
  }
  if (mode === "NUMBER" && !p.userWalletNumber) return "NUMBER";
  return "";
}

/**
 * Executes live withdrawal payout request to the Admin's Custom Wallet API.
 * Replaces {amount}, {token}, {key}, {number}, {userid}, {comment} dynamically!
 * Intelligently parses JSON / text response to decide SUCCESS vs FAIL.
 */
async function executeCustomWalletApiWithdrawal(wCfg, p, amount, reqId, botUsername) {
  try {
    const finalToken =
      wCfg.authMode === "TOKEN" || wCfg.authMode === "BOTH"
        ? String(p.userWalletToken || wCfg.merchantToken || "")
        : String(wCfg.merchantToken || p.userWalletToken || "");

    const finalKey =
      wCfg.authMode === "KEY" || wCfg.authMode === "BOTH"
        ? String(p.userWalletKey || wCfg.merchantKey || "")
        : String(wCfg.merchantKey || p.userWalletKey || "");

    const finalNumber = String(p.userWalletNumber || p.upiId || p.id || "");
    const finalComment = `Giveaway Payout #${reqId} via @${botUsername}`;
    const amtStr = fmtRs(amount);

    const hasPlaceholdersInUrl =
      wCfg.apiUrl.includes("{amount}") ||
      wCfg.apiUrl.includes("{token}") ||
      wCfg.apiUrl.includes("{key}") ||
      wCfg.apiUrl.includes("{number}") ||
      wCfg.apiUrl.includes("{userid}");

    let targetUrl = wCfg.apiUrl
      .replace(/\{amount\}/gi, encodeURIComponent(amtStr))
      .replace(/\{token\}/gi, encodeURIComponent(finalToken))
      .replace(/\{key\}/gi, encodeURIComponent(finalKey))
      .replace(/\{number\}/gi, encodeURIComponent(finalNumber))
      .replace(/\{account\}/gi, encodeURIComponent(finalNumber))
      .replace(/\{userid\}/gi, encodeURIComponent(String(p.id)))
      .replace(/\{comment\}/gi, encodeURIComponent(finalComment));

    let res;
    if (wCfg.httpMethod === "POST" || (!hasPlaceholdersInUrl && wCfg.httpMethod !== "GET")) {
      res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          amount: Number(amount),
          token: finalToken,
          key: finalKey,
          number: finalNumber,
          userid: String(p.id),
          comment: finalComment,
          orderId: reqId
        })
      });
    } else {
      res = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
    }

    const rawText = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {}

    // Intelligent Success / Failure Detection
    let isSuccess = false;
    let apiMessage = "";
    let txnId = "";

    if (parsed && typeof parsed === "object") {
      const statusLower = String(parsed.status || parsed.result || "").toLowerCase();
      txnId = String(parsed.txnid || parsed.txn_id || parsed.order_id || parsed.reference || parsed.id || "");
      apiMessage = String(parsed.message || parsed.msg || parsed.reply || parsed.error || "");

      const explicitFail =
        parsed.ok === false ||
        parsed.success === false ||
        parsed.error === true ||
        (typeof parsed.error === "string" && parsed.error.length > 0) ||
        statusLower === "failed" ||
        statusLower === "fail" ||
        statusLower === "error" ||
        statusLower === "denied" ||
        statusLower === "rejected";

      const explicitPass =
        parsed.ok === true ||
        parsed.success === true ||
        statusLower === "success" ||
        statusLower === "ok" ||
        statusLower === "paid" ||
        statusLower === "completed" ||
        statusLower === "accepted" ||
        Number(parsed.code) === 200;

      if (explicitFail) {
        isSuccess = false;
      } else if (explicitPass) {
        isSuccess = true;
      } else {
        isSuccess = res.ok;
      }
    } else {
      const lowerRaw = rawText.toLowerCase();
      const looksLikeFail =
        !res.ok ||
        lowerRaw.includes("error") ||
        lowerRaw.includes("fail") ||
        lowerRaw.includes("invalid") ||
        lowerRaw.includes("insufficient") ||
        lowerRaw.includes("denied");
      isSuccess = !looksLikeFail && (lowerRaw.includes("success") || lowerRaw.includes("ok") || lowerRaw.includes("paid") || res.status === 200);
      apiMessage = rawText.slice(0, 180);
    }

    return {
      success: isSuccess,
      httpStatus: res.status,
      txnId: txnId || reqId,
      message: apiMessage || (isSuccess ? "Payout completed via Wallet API!" : "Wallet API rejected payout!"),
      rawSnippet: rawText.slice(0, 200)
    };
  } catch (err) {
    return {
      success: false,
      httpStatus: 0,
      txnId: "",
      message: "Wallet API Network Error: " + err.message,
      rawSnippet: err.message
    };
  }
}

// ============================================================================
// 4. FIREBASE REALTIME DATABASE LAYER
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

async function saveWithdrawal(dbUrl, basePath, reqId, reqObj) {
  await fbRequest(dbUrl, `${basePath}/withdrawals/${reqId}`, "PUT", reqObj);
}

async function saveBotConfig(dbUrl, basePath, botConfigObj) {
  await fbRequest(dbUrl, `${basePath}/botConfig`, "PUT", botConfigObj);
}

// ============================================================================
// 5. TELEGRAM BOT API HELPERS
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
// 6. KEYBOARD DECKS (STRICT OWNER vs NORMAL USER SEPARATION!)
// ============================================================================
/**
 * Normal Users DO NOT get "Create Dice Giveaway"!
 * Only the Bot Owner sees "👑 Admin Panel" (which contains Create Dice Giveaway & Wallet API Setup).
 */
function buildUserMainKeyboard(isOwner) {
  const rows = [
    [{ text: "💰 My Wallet" }, { text: "💸 Withdraw" }],
    [{ text: "🎁 Active Giveaways" }, { text: "🏆 Past Winners" }],
    [{ text: "🛡️ Verify My Device" }, { text: "📜 My History" }],
    [{ text: "🎟️ Redeem Code" }, { text: "🥇 Hall of Fame" }],
    [{ text: "ℹ️ How It Works" }]
  ];
  if (isOwner) {
    rows.unshift([{ text: "🎲 Create Dice Giveaway" }, { text: "👑 Admin Panel" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}

function buildOwnerAdminKeyboard(b) {
  const wCfg = getWalletApiConfig(b);
  const wdMode = String(b.withdrawMode || "BOTH").toUpperCase();
  return {
    keyboard: [
      [{ text: "🎲 Create Dice Giveaway" }, { text: "📋 Manage Giveaways" }],
      [{ text: "💳 Setup Custom Wallet API" }, { text: "⚙️ Wallet Auth Mode" }],
      [{ text: `💸 Withdraw Mode: ${wdMode}` }, { text: "📉 Set Min / Max Withdraw" }],
      [{ text: "➕ Add / Cut User Balance" }, { text: "🎟️ Create Gift Code" }],
      [{ text: "🚫 Ban / Unban User" }, { text: "📢 Broadcast All Users" }],
      [{ text: "📊 Full Bot Statistics" }, { text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
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

function buildPrizeAmountKeyboard() {
  return {
    keyboard: [
      [{ text: "5" }, { text: "10" }, { text: "20" }, { text: "50" }],
      [{ text: "100" }, { text: "200" }, { text: "500" }, { text: "❌ Cancel" }]
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

function buildWalletAuthModeKeyboard() {
  return {
    keyboard: [
      [{ text: "🔑 TOKEN ONLY ({token})" }, { text: "🗝️ KEY ONLY ({key})" }],
      [{ text: "🔐 BOTH TOKEN & KEY ({token} + {key})" }],
      [{ text: "📱 USER NUMBER + ADMIN MERCHANT TOKEN" }],
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
// 7. REAL TELEGRAM REACTION SUMMARY & GIVEAWAY POST RENDERERS
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
 * STAGE 1: Automatic Real Reaction Gate Post (Zero Refresh Button!)
 */
function renderStage1ReactionGatePost(gw, countdownSecondsLeft = null) {
  const { total, breakdownLine } = getRealReactionSummary(gw);
  const target = numOrDef(gw.targetReactions, 10);
  const { percent, bar, remaining } = buildReactionProgressStats(total, target);

  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");
  const prizeCash = numOrDef(gw.prizeAmount, 0);
  const isPrivateBotChat =
    !String(gw.targetChatId).startsWith("@") && !String(gw.targetChatId).startsWith("-100");

  let statusSection = "";
  if (countdownSecondsLeft !== null || (target > 0 && total >= target)) {
    const secLabel = countdownSecondsLeft !== null ? countdownSecondsLeft : 10;
    statusSection =
      `🎉 <b>100% REACTIONS COMPLETED! (${total} / ${target})</b>\n` +
      `🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢 <b>100%</b>\n\n` +
      `⏱️ <b>AUTO-STARTING NUMBER SELECTION IN ${secLabel} SECONDS...</b>\n` +
      `⚡ <i>Get ready to pick your Lucky Number (${diceCfg.minNumber} to ${diceCfg.maxNumber})!</i>`;
  } else {
    statusSection =
      `Complete <b>${target} Real Reactions</b> on this post to automatically unlock Number Selection!\n\n` +
      `📊 <b>Progress: ${percent}% Complete (${total} / ${target})</b>\n` +
      `${bar}\n` +
      `🔥 <b>${remaining} More Reaction(s) Needed • Auto-Updating Live</b>`;
  }

  const text =
    `🎁 <b>DICE GIVEAWAY — AUTOMATIC REACTION GATE</b> 🎁\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `💰 <b>Wallet Cash Prize:</b> <code>₹${fmtRs(prizeCash)}</code> (Auto-Credited to Winner Wallet!)\n` +
    `🏆 <b>Title:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Official Bot:</b> @${escHtml(botUname)}\n` +
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
 * STAGE 2: Smart Number Selection Board (Owner-Only Dice Roll!)
 */
function renderStage2NumberSelectionPost(gw) {
  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const botUname = String(gw.botUsername || "Kumar_api_bot").replace(/^@/, "");
  const participants = gw.participants || {};
  const pIds = Object.keys(participants);
  const { total, breakdownLine } = getRealReactionSummary(gw);
  const target = numOrDef(gw.targetReactions, 0);
  const prizeCash = numOrDef(gw.prizeAmount, 0);
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
    boardStatusBanner = `\n🔥 <b>ALL ${diceCfg.totalNumbers} SLOTS ARE FULL! Waiting for Bot Owner (${escHtml(gw.creatorName)}) to Roll the Dice!</b>\n`;
  } else if (isBoardLocked) {
    boardStatusBanner = `\n🔒 <b>ENTRIES LOCKED BY OWNER! Ready for Dice Roll!</b>\n`;
  }

  const text =
    `🎲 <b>DICE GIVEAWAY IS LIVE — PICK YOUR NUMBER!</b> 🎲\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `💰 <b>Cash Prize:</b> <code>₹${fmtRs(prizeCash)}</code> (Instant Wallet Credit!)\n` +
    `🏆 <b>Title:</b> ${escHtml(gw.prize)}\n` +
    `🤖 <b>Official Bot:</b> @${escHtml(botUname)}\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.diceEmojis})</code>\n` +
    `🔢 <b>Smart Range (${diceCfg.totalNumbers} Slots):</b> <code>${diceCfg.minNumber} to ${diceCfg.maxNumber}</code>\n` +
    (target > 0
      ? `✅ <b>Reactions:</b> <code>100% Complete (${total}/${target})</code>\n   ${breakdownLine}\n`
      : `⏭️ <b>Reactions:</b> Skipped (Instant Start)\n`) +
    `🛡️ <b>Security:</b> <code>1 User = 1 Device Mini-App Shield ⚡</code>\n` +
    `👥 <b>Verified Players Joined:</b> <code>${pIds.length} / ${diceCfg.totalNumbers}</code>\n` +
    `${boardStatusBanner}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Verified Players (Name | Username | ID | Number):</b>\n` +
    `${pListStr}\n` +
    `👇 <b>Step 1: Verify Device (@${escHtml(botUname)}) • Step 2: Select Number (${diceCfg.minNumber} to ${diceCfg.maxNumber}):</b>`;

  const inline_keyboard = [];

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

  // Smart Number Selection Grid
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

  inline_keyboard.push([
    { text: "🚪 Release My Number", callback_data: `GW_LEAVE|${gw.id}` },
    {
      text: isBoardLocked ? "🔓 Unlock Entries (Owner)" : "🔒 Lock Entries (Owner)",
      callback_data: `GW_LOCK|${gw.id}`
    }
  ]);

  inline_keyboard.push([
    {
      text: `🎲 ROLL ${diceCfg.diceCount} DICE NOW (Owner Only)`,
      callback_data: `GW_ROLL|${gw.id}`
    }
  ]);

  return { text, reply_markup: { inline_keyboard } };
}

async function sendOwnerControlDeckDM(token, gw, headerMessage) {
  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const pCount = Object.keys(gw.participants || {}).length;

  const msg =
    `${headerMessage}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `📢 <b>Target Chat:</b> <code>${escHtml(gw.targetChatId)}</code>\n` +
    `💰 <b>Wallet Prize:</b> <code>₹${fmtRs(gw.prizeAmount)}</code> (${escHtml(gw.prize)})\n` +
    `🎲 <b>Dice Mode:</b> <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber} to ${diceCfg.maxNumber})</code>\n` +
    `👥 <b>Joined Verified Players:</b> <code>${pCount} / ${diceCfg.totalNumbers}</code>\n\n` +
    `👑 <i>Only YOU (the Bot Owner) can trigger the Dice Roll below whenever ready:</i>`;

  await sendBotMsg(
    token,
    gw.creatorId,
    msg,
    {
      inline_keyboard: [
        [
          {
            text: `🎲 ROLL ${diceCfg.diceCount} DICE NOW & PAY WINNER`,
            callback_data: `GW_ROLL|${gw.id}`
          }
        ],
        [
          {
            text: gw.entriesLocked ? "🔓 Unlock Board" : "🔒 Lock Board",
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
// 8. AUTO 10-SECOND REACTION COUNTDOWN -> OPEN NUMBER BOARD
// ============================================================================
async function trigger10SecondAutoStartGiveaway(dbUrl, basePath, token, gw) {
  if (!gw || gw.status !== "WAITING_GATE" || gw.autoStarting) return;

  gw.autoStarting = true;
  await patchGiveaway(dbUrl, basePath, gw.id, { autoStarting: true });

  const render10 = renderStage1ReactionGatePost(gw, 10);
  await editBotMsg(token, gw.targetChatId, gw.postMessageId, render10.text, render10.reply_markup);
  await sleepMs(4800);

  const render5 = renderStage1ReactionGatePost(gw, 5);
  await editBotMsg(token, gw.targetChatId, gw.postMessageId, render5.text, render5.reply_markup);
  await sleepMs(4700);

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

  await sendOwnerControlDeckDM(
    token,
    gw,
    `🔥 <b>100% REACTIONS COMPLETED — NUMBER SELECTION IS NOW LIVE!</b>`
  );
}

// ============================================================================
// 9. OWNER-ONLY DICE ROLL + AUTOMATIC WALLET PRIZE CREDIT TO WINNER(S)
// ============================================================================
async function executeOwnerDiceRollAndPayWinner(dbUrl, basePath, token, b, gw, playersMap = {}) {
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

  gw.status = "ROLLING";
  await patchGiveaway(dbUrl, basePath, gw.id, { status: "ROLLING" });

  const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
  const targetChatId = gw.targetChatId || gw.creatorId;
  const botUname = String(gw.botUsername || b.username || "Kumar_api_bot").replace(/^@/, "");
  const prizeCash = numOrDef(gw.prizeAmount, 0);

  await editBotMsg(
    token,
    targetChatId,
    gw.postMessageId,
    `🎲 <b>OWNER TRIGGERED THE ROLL! ROLLING ${diceCfg.diceCount} OFFICIAL TELEGRAM DICE (${diceCfg.diceEmojis})...</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
      `💰 <b>Cash Prize:</b> <code>₹${fmtRs(prizeCash)}</code>\n` +
      `👥 <b>Locked Players:</b> <code>${pIds.length}</code>\n\n` +
      `⏳ <i>Watch the animated dice below... Winner will receive ₹${fmtRs(prizeCash)} directly in their Wallet!</i>`,
    null
  );

  // Roll N Animated Telegram Dice (🎲)
  const rolledValues = [];
  let sumTotal = 0;
  for (let i = 0; i < diceCfg.diceCount; i++) {
    const val = await sendAnimatedDice(token, targetChatId);
    rolledValues.push(val);
    sumTotal += val;
  }

  await sleepMs(3500);

  // Determine exact match winners
  let winners = [];
  for (const uid of pIds) {
    if (Number(participants[uid].number) === sumTotal) {
      winners.push(participants[uid]);
    }
  }

  // Tie-breaker: closest selected number if nobody hit exact sumTotal
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
  const perWinnerPrize =
    winners.length > 0 && prizeCash > 0
      ? Number((prizeCash / winners.length).toFixed(2))
      : 0;

  gw.status = "FINISHED";
  gw.rolledValues = rolledValues;
  gw.winningNumber = sumTotal;
  gw.winners = winners;
  gw.perWinnerPrize = perWinnerPrize;
  gw.claimCode = secretClaimCode;
  gw.finishedAt = formatIstFullTime(Date.now());
  await saveGiveaway(dbUrl, basePath, gw.id, gw);

  // AUTOMATICALLY CREDIT PRIZE ₹ TO EACH WINNER'S BOT WALLET!
  for (const w of winners) {
    const wp = getOrInitUser(playersMap, w.id, w.name, w.username);
    wp.wonGiveaways = numOrDef(wp.wonGiveaways, 0) + 1;
    if (perWinnerPrize > 0) {
      wp.balance = Number((numOrDef(wp.balance, 0) + perWinnerPrize).toFixed(2));
      wp.totalWon = Number((numOrDef(wp.totalWon, 0) + perWinnerPrize).toFixed(2));
      addHistory(wp, `🏆 Won Dice Giveaway #${gw.id}: +₹${fmtRs(perWinnerPrize)}`);
    }
    await savePlayerState(dbUrl, basePath, w.id, wp);
  }

  const diceBreakdown = rolledValues
    .map((v, i) => `🎲 Dice #${i + 1}: <b>${v}</b>`)
    .join("  +  ");

  let winnerSection = "";
  winners.forEach((w, idx) => {
    const wUname = w.username ? `@${escHtml(w.username)}` : "None";
    winnerSection +=
      `🏆 <b>OFFICIAL WINNER #${idx + 1}:</b>\n` +
      ` ┣ 👤 <b>Name:</b> ${escHtml(w.name)}\n` +
      ` ┣ 🌐 <b>Username:</b> ${wUname}\n` +
      ` ┣ 🆔 <b>User ID:</b> <code>${w.id}</code>\n` +
      ` ┣ 🛡️ <b>Verified Device:</b> <code>${escHtml(w.deviceId || "VERIFIED")}</code>\n` +
      ` ┣ 💰 <b>Wallet Credited:</b> <code>+₹${fmtRs(perWinnerPrize)}</code> ✅\n` +
      ` ┗ 🎯 <b>Selected Number:</b> <code>#${w.number}</code> ${matchedByClosest ? `(Closest to #${sumTotal})` : "(Exact Match! 🎯)"}\n\n`;
  });

  let allUsersSection = "";
  pIds.forEach((uid, idx) => {
    const u = participants[uid];
    const uNameStr = u.username ? `@${escHtml(u.username)}` : "None";
    allUsersSection +=
      `${idx + 1}. 👤 <b>${escHtml(u.name)}</b> | 🌐 ${uNameStr} | 🆔 <code>${u.id}</code> | 🎯 <b>#${u.number}</b>\n`;
  });

  const finalResultHtml =
    `🎉 <b>DICE GIVEAWAY COMPLETED — PRIZE CREDITED!</b> 🎉\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `💰 <b>Total Cash Prize:</b> <code>₹${fmtRs(prizeCash)}</code> (${escHtml(gw.prize)})\n` +
    `🤖 <b>Official Bot:</b> @${escHtml(botUname)}\n` +
    `🎲 <b>Dice Rolled (${diceCfg.diceCount}x):</b> ${diceBreakdown}\n` +
    `🎯 <b>Final Winning Total:</b> <code>#${sumTotal}</code>\n` +
    `🕒 <b>Rolled At:</b> <code>${escHtml(gw.finishedAt)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>ALL VERIFIED PARTICIPANTS (${pIds.length}):</b>\n` +
    `${allUsersSection}`;

  // 1. Update Original Post, Unpin Old Post, Send & Pin Winner Announcement
  if (gw.postMessageId) {
    await editBotMsg(token, targetChatId, gw.postMessageId, finalResultHtml, null);
    await autoUnpinGiveawayMessage(token, targetChatId, gw.postMessageId);
  }
  const winMsgRes = await sendBotMsg(token, targetChatId, finalResultHtml, null, TG_EFFECTS.PARTY);
  if (winMsgRes && winMsgRes.ok && winMsgRes.result) {
    await autoPinGiveawayMessage(token, targetChatId, winMsgRes.result.message_id);
  }

  // 2. SEND COMPLETE WINNER REPORT + CLAIM CODE + 1-CLICK CLONE TO BOT OWNER IN DM
  const ownerAlertHtml =
    `👑 <b>WINNER REPORT — GIVEAWAY #${gw.id}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📢 <b>Target Chat:</b> <code>${escHtml(targetChatId)}</code>\n` +
    `💰 <b>Credited to Winner Wallet:</b> <code>₹${fmtRs(perWinnerPrize)}</code>\n` +
    `🎲 <b>Dice Result:</b> ${diceBreakdown} = <b>#${sumTotal}</b>\n` +
    `🔐 <b>Secret Claim Code:</b> <code>${secretClaimCode}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>All Verified Players (${pIds.length}):</b>\n${allUsersSection}`;

  await sendBotMsg(
    token,
    gw.creatorId,
    ownerAlertHtml,
    {
      inline_keyboard: [
        [{ text: "🔄 Clone & Re-Run This Giveaway", callback_data: `GW_CLONE|${gw.id}` }]
      ]
    },
    TG_EFFECTS.PARTY
  );

  // 3. DM EACH WINNER THAT ₹ HAS BEEN CREDITED TO THEIR WALLET + WITHDRAW BUTTON!
  for (const w of winners) {
    const wp = playersMap[w.id];
    const newBal = wp ? wp.balance : perWinnerPrize;
    await sendBotMsg(
      token,
      w.id,
      `🎉 <b>CONGRATULATIONS! YOU WON ₹${fmtRs(perWinnerPrize)}!</b> 🎉\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
        `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
        `🎲 <b>Winning Dice Total:</b> <code>#${sumTotal}</code>\n` +
        `💰 <b>Credited to Your Wallet:</b> <code>+₹${fmtRs(perWinnerPrize)}</code> ✅\n` +
        `🏦 <b>Updated Wallet Balance:</b> <code>₹${fmtRs(newBal)}</code>\n` +
        `🔐 <b>Secret Claim Code:</b> <code>${secretClaimCode}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👇 <b>Tap '💸 Withdraw' in the bot menu to withdraw via UPI or Instant Wallet!</b>`,
      null,
      TG_EFFECTS.PARTY
    );
  }

  return { ok: true };
}

// ============================================================================
// 10. WALLET & WITHDRAWAL MENU SCREENS
// ============================================================================
async function sendUserWalletScreen(token, chatId, b, p) {
  const wCfg = getWalletApiConfig(b);
  const wName = wCfg.walletName;
  const minW = numOrDef(b.minWithdraw, 1);
  const maxW = numOrDef(b.maxWithdraw, 5000);

  let linkedWalletLine = "";
  if (wCfg.authMode === "TOKEN") {
    linkedWalletLine = `🔑 <b>${escHtml(wName)} Token:</b> <code>${p.userWalletToken ? "LINKED ✅" : "Not Set"}</code>\n`;
  } else if (wCfg.authMode === "KEY") {
    linkedWalletLine = `🗝️ <b>${escHtml(wName)} Key:</b> <code>${p.userWalletKey ? "LINKED ✅" : "Not Set"}</code>\n`;
  } else if (wCfg.authMode === "BOTH") {
    linkedWalletLine =
      `🔑 <b>${escHtml(wName)} Token:</b> <code>${p.userWalletToken ? "LINKED ✅" : "Not Set"}</code>\n` +
      `🗝️ <b>${escHtml(wName)} Key:</b> <code>${p.userWalletKey ? "LINKED ✅" : "Not Set"}</code>\n`;
  } else {
    linkedWalletLine = `📱 <b>${escHtml(wName)} Account/No:</b> <code>${escHtml(p.userWalletNumber || "Not Set")}</code>\n`;
  }

  const text =
    `💰 <b>MY GIVEAWAY WALLET & PROFILE</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Name:</b> ${escHtml(p.name)}\n` +
    `🌐 <b>Username:</b> ${p.username ? "@" + escHtml(p.username) : "None"}\n` +
    `🆔 <b>User ID:</b> <code>${p.id}</code>\n` +
    `🛡️ <b>Device Shield:</b> ${p.banned ? "🚫 <b>BANNED (403)</b>" : p.verified ? `✅ <b>VERIFIED (${escHtml(p.deviceId)})</b>` : "⏳ <b>Unverified</b>"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 <b>Available Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
    `🏆 <b>Total Won:</b> <code>₹${fmtRs(p.totalWon)}</code> (${numOrDef(p.wonGiveaways, 0)} Wins)\n` +
    `📤 <b>Total Withdrawn:</b> <code>₹${fmtRs(p.totalWithdrawn)}</code>\n` +
    `📉 <b>Withdraw Limits:</b> <code>₹${fmtRs(minW)} – ₹${fmtRs(maxW)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏦 <b>Linked UPI ID:</b> <code>${escHtml(p.upiId || "Not Set")}</code>\n` +
    `${wCfg.enabled ? linkedWalletLine : ""}`;

  const inline_keyboard = [
    [
      { text: "🏦 Set / Edit UPI ID", callback_data: "WAL_SET_UPI" },
      { text: "💸 Withdraw Now", callback_data: "WAL_OPEN_WD" }
    ]
  ];

  if (wCfg.enabled) {
    inline_keyboard.push([
      { text: `💳 Link ${wName} Credentials`, callback_data: "WAL_SET_CUSTOM" }
    ]);
  }

  await sendBotMsg(token, chatId, text, { inline_keyboard });
}

async function sendWithdrawOptionsScreen(token, chatId, b, p) {
  const wCfg = getWalletApiConfig(b);
  const wdMode = String(b.withdrawMode || "BOTH").toUpperCase();
  const minW = numOrDef(b.minWithdraw, 1);
  const maxW = numOrDef(b.maxWithdraw, 5000);

  const text =
    `💸 <b>INSTANT WITHDRAWAL CENTER</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
    `📉 <b>Min Withdraw:</b> <code>₹${fmtRs(minW)}</code> | 📈 <b>Max:</b> <code>₹${fmtRs(maxW)}</code>\n` +
    `🏦 <b>Saved UPI ID:</b> <code>${escHtml(p.upiId || "Not Set")}</code>\n` +
    (wCfg.enabled
      ? `💳 <b>Instant Wallet:</b> <code>${escHtml(wCfg.walletName)}</code> (${getMissingUserWalletField(wCfg, p) ? "⚠️ Link Required" : "✅ Ready for Instant Auto-Pay"})\n`
      : "") +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👇 <b>Select your preferred withdrawal method below:</b>`;

  const inline_keyboard = [];

  if ((wdMode === "BOTH" || wdMode === "WALLET") && wCfg.enabled) {
    inline_keyboard.push([
      {
        text: `⚡ Instant Withdraw to ${wCfg.walletName} (Auto API)`,
        callback_data: "WD_START_WALLET"
      }
    ]);
  }

  if (wdMode === "BOTH" || wdMode === "UPI") {
    inline_keyboard.push([
      { text: "🏦 Withdraw to UPI ID", callback_data: "WD_START_UPI" }
    ]);
  }

  const editRow = [{ text: "✏️ Edit UPI ID", callback_data: "WAL_SET_UPI" }];
  if (wCfg.enabled) {
    editRow.push({ text: `🔑 Link ${wCfg.walletName}`, callback_data: "WAL_SET_CUSTOM" });
  }
  inline_keyboard.push(editRow);

  await sendBotMsg(token, chatId, text, { inline_keyboard });
}

// ============================================================================
// 11. AUTO-PUBLISH SCHEDULED GIVEAWAYS & REAL REACTION LISTENER
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
      await sendOwnerControlDeckDM(
        token,
        gw,
        `⏰ <b>SCHEDULED GIVEAWAY #${gw.id} UPLOADED & NUMBERS ARE LIVE!</b>`
      );
    } else {
      await sendBotMsg(
        token,
        gw.creatorId,
        `⏰ <b>SCHEDULED GIVEAWAY #${gw.id} UPLOADED & PINNED LIVE!</b>\n` +
          `📢 <b>Chat:</b> <code>${escHtml(gw.targetChatId)}</code>\n` +
          `💰 <b>Cash Prize:</b> <code>₹${fmtRs(gw.prizeAmount)}</code>\n` +
          `❤️ <b>Reaction Target:</b> <code>${targetReactions} Real Reactions</code>\n\n` +
          `⚡ <i>When 100% reactions complete, Number Selection opens automatically in 10 seconds!</i>`,
        null,
        TG_EFFECTS.FIRE
      );
    }
    return true;
  }
  return false;
}

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

async function handleRealTelegramReactionUpdate(dbUrl, basePath, token, node, upd) {
  const giveaways = node.giveaways || {};
  const gwIds = Object.keys(giveaways);
  if (gwIds.length === 0) return;

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
// 12. USER PROFILE INITIALIZER (WITH FULL WALLET FIELDS)
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
      balance: 0,
      totalWon: 0,
      totalWithdrawn: 0,
      wonGiveaways: 0,
      verified: false,
      banned: false,
      deviceId: "",
      upiId: "",
      userWalletToken: "",
      userWalletKey: "",
      userWalletNumber: "",
      savedChannel: "",
      history: []
    };
    players[sUid] = p;
  } else {
    if (name && name !== "User") p.name = name;
    if (uname !== undefined) p.username = uname;
    if (typeof p.balance !== "number" || isNaN(p.balance)) p.balance = Number(p.balance) || 0;
    if (!Array.isArray(p.history)) p.history = [];
    if (!p.state) p.state = "IDLE";
  }
  return p;
}

// ============================================================================
// 13. MAIN VERCEL SERVERLESS HANDLER (api/bot1.js)
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
      engine: "Kurmurya 24/7 Owner-Only Dice Giveaway + Smart Custom Wallet API Engine",
      status: "24/7_ONLINE"
    });
  }

  const botId = req.query?.botId ? String(req.query.botId).trim() : "";
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // --------------------------------------------------------------------------
  // A. MAKER BOT / APP -> WEBSITE CONNECT API (`action: "connect_bot"`)
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
        ownerWalletWebhookV5: true,
        webhookUrl: whUrl,
        withdrawMode: (existing.botConfig && existing.botConfig.withdrawMode) || "BOTH",
        minWithdraw: (existing.botConfig && existing.botConfig.minWithdraw) || 1,
        maxWithdraw: (existing.botConfig && existing.botConfig.maxWithdraw) || 5000,
        walletApi: (existing.botConfig && existing.botConfig.walletApi) || {
          enabled: false,
          walletName: "Custom Wallet",
          apiUrl: "",
          httpMethod: "GET",
          authMode: "BOTH",
          merchantToken: "",
          merchantKey: ""
        }
      };

      const nodeToSave = {
        ...existing,
        botConfig: cfg,
        playersMap: existing.playersMap || {},
        giveaways: existing.giveaways || {},
        withdrawals: existing.withdrawals || {},
        giftCodes: existing.giftCodes || {}
      };

      await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);
      await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);

      await sendBotMsg(
        token,
        owner,
        `👑 <b>YOUR 24/7 DICE GIVEAWAY + WALLET BOT IS LIVE!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏷️ <b>Bot Name:</b> ${escHtml(bName)}\n` +
          `🤖 <b>Username:</b> @${escHtml(uname)}\n` +
          `👑 <b>Owner ID:</b> <code>${owner}</code> (Only YOU can create giveaways & roll dice!)\n` +
          `💳 <b>Wallet & Auto-API Payouts:</b> <code>READY ⚡</code>\n` +
          `🛡️ <b>Mini-App 1-Device Shield:</b> <code>ACTIVE ⚡</code>\n\n` +
          `👇 Send <b>/start</b> to open your <b>👑 Admin Panel</b> & setup your Custom Wallet API!`,
        buildUserMainKeyboard(true),
        TG_EFFECTS.PARTY
      );

      return res.status(200).json({
        success: true,
        botId: bId,
        botName: bName,
        botUsername: uname,
        webhookUrl: whUrl
      });
    } catch (e) {
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // Handle Bot Removal API from Maker Bot
  if (!botId && body.action === "delete_bot" && body.botId) {
    const delId = String(body.botId);
    await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${delId}`, "DELETE");
    await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${delId}`, "DELETE");
    return res.status(200).json({ success: true });
  }

  // --------------------------------------------------------------------------
  // B. 24/7 TELEGRAM WEBHOOK HANDLER (`?botId=...`)
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

    if (!b.ownerWalletWebhookV5) {
      b.ownerWalletWebhookV5 = true;
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

    // Auto-publish any scheduled giveaways whose upload time arrived
    await checkAndPublishScheduledGiveaways(dbUrl, basePath, token, node);

    // Handle Real Telegram Post Reactions Automatically
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
    const withdrawals = node.withdrawals || {};
    const giftCodes = node.giftCodes || {};
    const wCfg = getWalletApiConfig(b);

    const isCb = Boolean(upd.callback_query);
    const fromObj = isCb ? upd.callback_query.from : upd.message?.from;
    if (!fromObj) return res.status(200).send("OK");

    const cUid = String(fromObj.id);
    const cName =
      ((fromObj.first_name || "") + (fromObj.last_name ? " " + fromObj.last_name : ""))
        .trim()
        .replace(/[<>]/g, "") || "User";
    const cUname = fromObj.username || "";
    const isOwner = isBotOwner(b, cUid);

    const p = getOrInitUser(players, cUid, cName, cUname);
    const mainKb = buildUserMainKeyboard(isOwner);

    if (p.banned && !isOwner) {
      if (isCb) {
        await answerCb(token, upd.callback_query.id, "🚫 BANNED: You are restricted from using this bot.", true);
      } else {
        await sendBotMsg(token, cUid, "🚫 <b>ACCESS DENIED: Your account is banned from this bot.</b>");
      }
      return res.status(200).send("BANNED");
    }

    // ========================================================================
    // C. HANDLE INLINE BUTTON CALLBACKS
    // ========================================================================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;
      const msgId = cbq.message ? cbq.message.message_id : null;

      // ---- WALLET & WITHDRAWAL CALLBACKS ----
      if (data === "WAL_OPEN_WD") {
        await answerCb(token, cbId, "Opening Withdrawal Center...", false);
        await sendWithdrawOptionsScreen(token, cUid, b, p);
        return res.status(200).send("OK");
      }

      if (data === "WAL_SET_UPI") {
        p.state = "WAIT_USER_UPI_ID";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await answerCb(token, cbId, "Enter your UPI ID", false);
        await sendBotMsg(
          token,
          cUid,
          `🏦 <b>LINK YOUR UPI ID</b>\n━━━━━━━━━━━━━━━━━━━━\n👇 <b>Send your valid UPI ID (e.g. <code>yourname@upi</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (data === "WAL_SET_CUSTOM") {
        await answerCb(token, cbId, `Setup ${wCfg.walletName}`, false);
        if (wCfg.authMode === "TOKEN" || wCfg.authMode === "BOTH") {
          p.state = "WAIT_USER_WALLET_TOKEN";
          await savePlayerState(dbUrl, basePath, cUid, p);
          await sendBotMsg(
            token,
            cUid,
            `🔑 <b>LINK ${escHtml(wCfg.walletName.toUpperCase())} — ${wCfg.authMode === "BOTH" ? "STEP 1 OF 2" : "TOKEN"}</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `👇 <b>Send your ${escHtml(wCfg.walletName)} Account Token (<code>{token}</code>):</b>`,
            buildCancelKeyboard()
          );
        } else if (wCfg.authMode === "KEY") {
          p.state = "WAIT_USER_WALLET_KEY";
          await savePlayerState(dbUrl, basePath, cUid, p);
          await sendBotMsg(
            token,
            cUid,
            `🗝️ <b>LINK ${escHtml(wCfg.walletName.toUpperCase())} KEY</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `👇 <b>Send your ${escHtml(wCfg.walletName)} Secret Key (<code>{key}</code>):</b>`,
            buildCancelKeyboard()
          );
        } else {
          p.state = "WAIT_USER_WALLET_NUMBER";
          await savePlayerState(dbUrl, basePath, cUid, p);
          await sendBotMsg(
            token,
            cUid,
            `📱 <b>LINK ${escHtml(wCfg.walletName.toUpperCase())} ACCOUNT NUMBER / ID</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `👇 <b>Send your ${escHtml(wCfg.walletName)} Number or Account ID (<code>{number}</code>):</b>`,
            buildCancelKeyboard()
          );
        }
        return res.status(200).send("OK");
      }

      if (data === "WD_START_UPI") {
        if (!p.upiId) {
          p.state = "WAIT_USER_UPI_ID";
          await savePlayerState(dbUrl, basePath, cUid, p);
          await answerCb(token, cbId, "Please link your UPI ID first!", true);
          await sendBotMsg(
            token,
            cUid,
            `🏦 <b>LINK UPI ID FIRST</b>\n👇 <b>Send your UPI ID (e.g. <code>name@ybl</code>):</b>`,
            buildCancelKeyboard()
          );
          return res.status(200).send("OK");
        }
        p.state = "WAIT_WD_AMOUNT_UPI";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await answerCb(token, cbId, "Enter UPI withdrawal amount", false);
        await sendBotMsg(
          token,
          cUid,
          `🏦 <b>WITHDRAW TO UPI (<code>${escHtml(p.upiId)}</code>)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 <b>Available Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
            `📉 <b>Min:</b> <code>₹${fmtRs(numOrDef(b.minWithdraw, 1))}</code> | 📈 <b>Max:</b> <code>₹${fmtRs(numOrDef(b.maxWithdraw, 5000))}</code>\n\n` +
            `👇 <b>Enter the ₹ amount you want to withdraw:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (data === "WD_START_WALLET") {
        if (!wCfg.enabled) {
          await answerCb(token, cbId, "⚠️ Custom Wallet API is not configured by Admin yet!", true);
          return res.status(200).send("OK");
        }
        const missingField = getMissingUserWalletField(wCfg, p);
        if (missingField) {
          await answerCb(token, cbId, `Link your ${wCfg.walletName} ${missingField} first!`, true);
          if (missingField === "TOKEN") {
            p.state = "WAIT_USER_WALLET_TOKEN";
            await savePlayerState(dbUrl, basePath, cUid, p);
            await sendBotMsg(
              token,
              cUid,
              `🔑 <b>LINK YOUR ${escHtml(wCfg.walletName.toUpperCase())} TOKEN FIRST</b>\n👇 <b>Send your Wallet Token:</b>`,
              buildCancelKeyboard()
            );
          } else if (missingField === "KEY") {
            p.state = "WAIT_USER_WALLET_KEY";
            await savePlayerState(dbUrl, basePath, cUid, p);
            await sendBotMsg(
              token,
              cUid,
              `🗝️ <b>LINK YOUR ${escHtml(wCfg.walletName.toUpperCase())} KEY FIRST</b>\n👇 <b>Send your Wallet Key:</b>`,
              buildCancelKeyboard()
            );
          } else {
            p.state = "WAIT_USER_WALLET_NUMBER";
            await savePlayerState(dbUrl, basePath, cUid, p);
            await sendBotMsg(
              token,
              cUid,
              `📱 <b>LINK YOUR ${escHtml(wCfg.walletName.toUpperCase())} NUMBER / ACCOUNT FIRST</b>\n👇 <b>Send your Wallet Number / ID:</b>`,
              buildCancelKeyboard()
            );
          }
          return res.status(200).send("OK");
        }

        p.state = "WAIT_WD_AMOUNT_WALLET";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await answerCb(token, cbId, `Enter ${wCfg.walletName} payout amount`, false);
        await sendBotMsg(
          token,
          cUid,
          `⚡ <b>INSTANT AUTO-PAYOUT TO ${escHtml(wCfg.walletName.toUpperCase())}</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 <b>Available Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
            `📉 <b>Min:</b> <code>₹${fmtRs(numOrDef(b.minWithdraw, 1))}</code> | 📈 <b>Max:</b> <code>₹${fmtRs(numOrDef(b.maxWithdraw, 5000))}</code>\n\n` +
            `👇 <b>Enter the ₹ amount to withdraw instantly via ${escHtml(wCfg.walletName)} API:</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      // ---- OWNER APPROVE / REJECT UPI WITHDRAWAL ----
      if ((data.startsWith("WD_APPROVE|") || data.startsWith("WD_REJECT|")) && isOwner) {
        const approve = data.startsWith("WD_APPROVE|");
        const reqId = data.split("|")[1];
        const wReq = withdrawals[reqId];

        if (!wReq || wReq.status !== "PENDING") {
          await answerCb(token, cbId, "⚠️ Already processed!", true);
          return res.status(200).send("OK");
        }

        const targetUid = String(wReq.userId);
        const amt = numOrDef(wReq.amount, 0);
        const tp = getOrInitUser(players, targetUid, wReq.userName, wReq.username);

        if (approve) {
          wReq.status = "PAID";
          tp.totalWithdrawn = Number((numOrDef(tp.totalWithdrawn, 0) + amt).toFixed(2));
          addHistory(tp, `✅ UPI Withdrawal Paid (#${reqId}): ₹${fmtRs(amt)}`);
          await saveWithdrawal(dbUrl, basePath, reqId, wReq);
          await savePlayerState(dbUrl, basePath, targetUid, tp);

          await answerCb(token, cbId, "✅ Marked as PAID!", true);
          await editBotMsg(
            token,
            cUid,
            msgId,
            `✅ <b>UPI WITHDRAWAL PAID (#${reqId})</b>\n👤 User: ${escHtml(wReq.userName)} (<code>${targetUid}</code>)\n💰 Paid: <code>₹${fmtRs(amt)}</code> ➔ <code>${escHtml(wReq.upiId)}</code>`
          );
          await sendBotMsg(
            token,
            targetUid,
            `🎉 <b>UPI WITHDRAWAL PAID!</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>ID:</b> <code>${reqId}</code>\n💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n🏦 <b>UPI:</b> <code>${escHtml(wReq.upiId)}</code>\n✅ <b>Status:</b> PAID`,
            null,
            TG_EFFECTS.PARTY
          );
        } else {
          wReq.status = "REJECTED";
          tp.balance = Number((numOrDef(tp.balance, 0) + amt).toFixed(2));
          addHistory(tp, `🔄 UPI Withdrawal Refunded (#${reqId}): +₹${fmtRs(amt)}`);
          await saveWithdrawal(dbUrl, basePath, reqId, wReq);
          await savePlayerState(dbUrl, basePath, targetUid, tp);

          await answerCb(token, cbId, "❌ Rejected & Refunded!", true);
          await editBotMsg(
            token,
            cUid,
            msgId,
            `❌ <b>UPI WITHDRAWAL REJECTED & REFUNDED (#${reqId})</b>\n👤 User: <code>${targetUid}</code> (+₹${fmtRs(amt)} refunded)`
          );
          await sendBotMsg(
            token,
            targetUid,
            `❌ <b>UPI WITHDRAWAL REJECTED & REFUNDED</b>\n🆔 <b>ID:</b> <code>${reqId}</code>\n🔄 <b>Refunded to Wallet:</b> <code>+₹${fmtRs(amt)}</code>\n💰 <b>Balance:</b> <code>₹${fmtRs(tp.balance)}</code>`
          );
        }
        return res.status(200).send("OK");
      }

      // ---- OWNER GIVEAWAY CONTROL CALLBACKS ----
      if (data.startsWith("GW_PUB_NOW|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || !isOwner) {
          await answerCb(token, cbId, "🔒 Owner-only action!", true);
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

      if (data.startsWith("GW_LOCK|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || gw.status !== "OPEN_NUMBERS") {
          await answerCb(token, cbId, "⚠️ Giveaway is not open for picks.", true);
          return res.status(200).send("OK");
        }
        if (!isOwner) {
          await answerCb(token, cbId, "🔒 Only the Bot Owner can lock/unlock entries!", true);
          return res.status(200).send("OK");
        }
        gw.entriesLocked = !gw.entriesLocked;
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(
          token,
          cbId,
          gw.entriesLocked ? "🔒 Board Locked! Ready to Roll." : "🔓 Board Unlocked!",
          true
        );
        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      if (data.startsWith("GW_CANCEL|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || !isOwner) {
          await answerCb(token, cbId, "🔒 Only the Bot Owner can cancel!", true);
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
            `❌ <b>GIVEAWAY #${gw.id} CANCELLED BY OWNER</b>`,
            null
          );
          await autoUnpinGiveawayMessage(token, gw.targetChatId, gw.postMessageId);
        }
        await answerCb(token, cbId, "❌ Giveaway Cancelled.", true);
        return res.status(200).send("OK");
      }

      if (data.startsWith("GW_CLONE|")) {
        const oldGwId = data.split("|")[1];
        const oldGw = giveaways[oldGwId];
        if (!oldGw || !isOwner) {
          await answerCb(token, cbId, "🔒 Only the Bot Owner can clone giveaways!", true);
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
          prizeAmount: numOrDef(oldGw.prizeAmount, 10),
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
          await sendOwnerControlDeckDM(token, newGw, `🔄 <b>CLONED GIVEAWAY #${newGwId} IS LIVE!</b>`);
        } else {
          await answerCb(token, cbId, "❌ Could not post to target chat!", true);
        }
        return res.status(200).send("OK");
      }

      if (data.startsWith("GW_LEAVE|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw || gw.status !== "OPEN_NUMBERS" || gw.entriesLocked) {
          await answerCb(token, cbId, "🔒 Board is closed or locked.", true);
          return res.status(200).send("OK");
        }
        if (!gw.participants || !gw.participants[cUid]) {
          await answerCb(token, cbId, "ℹ️ You have not picked a number yet.", true);
          return res.status(200).send("OK");
        }
        const freed = gw.participants[cUid].number;
        delete gw.participants[cUid];
        gw.fullNotified = false;
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(token, cbId, `🚪 Released Number #${freed}!`, true);
        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      // ---- USER NUMBER SELECTION WITH MINI-APP DEVICE SHIELD ----
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
          await answerCb(token, cbId, "⚠️ Wait until 100% reactions are completed!", true);
          return res.status(200).send("OK");
        }
        if (gw.entriesLocked) {
          await answerCb(token, cbId, "🔒 Entries are locked by the Owner!", true);
          return res.status(200).send("OK");
        }

        // LIVE 1-USER 1-DEVICE VERIFICATION CHECK
        const verifyCheck = await checkUserDeviceVerification(cUid, botUsername);
        if (verifyCheck.banned) {
          p.banned = true;
          p.verified = false;
          p.deviceId = verifyCheck.deviceId || "DEV-BANNED";
          await savePlayerState(dbUrl, basePath, cUid, p);

          await answerCb(
            token,
            cbId,
            `🚫 DIRECT BANNED (403)!\nReason: ${verifyCheck.reason}\nDevice: ${verifyCheck.deviceId}\nBanned users cannot pick a number!`,
            true
          );
          return res.status(200).send("OK");
        }

        if (!verifyCheck.allowed || !verifyCheck.verified) {
          await answerCb(
            token,
            cbId,
            `🔒 DEVICE VERIFICATION REQUIRED!\nTap '🛡️ Step 1: Verify Device (@${botUsername})' on the post to verify via Mini App!`,
            true
          );
          await sendBotMsg(
            token,
            cUid,
            `🛡️ <b>1-USER 1-DEVICE MINI-APP VERIFICATION</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
              `🆔 <b>Your ID:</b> <code>${cUid}</code>\n\n` +
              `⚠️ Verify your device inside the private Mini App below before locking Lucky Number <b>#${pickedNum}</b>:`,
            buildPrivateMiniAppVerifyKeyboard(cUid, botUsername, gwId)
          );
          return res.status(200).send("OK");
        }

        p.verified = true;
        p.banned = false;
        p.deviceId = verifyCheck.deviceId;
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (!gw.participants) gw.participants = {};
        for (const existingUid of Object.keys(gw.participants)) {
          if (existingUid !== cUid && Number(gw.participants[existingUid].number) === pickedNum) {
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
        if (boardJustFilled) gw.fullNotified = true;

        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(
          token,
          cbId,
          prevPick && prevPick !== pickedNum
            ? `🔄 Switched from #${prevPick} to Lucky Number #${pickedNum}!`
            : `✅ Verified (${verifyCheck.deviceId})! Locked Lucky Number #${pickedNum}!`,
          true
        );

        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);

        if (boardJustFilled) {
          await sendOwnerControlDeckDM(
            token,
            gw,
            `🔥 <b>ALL ${diceCfg.totalNumbers} SLOTS ARE FULL! TAP BELOW TO ROLL THE DICE!</b>`
          );
        }
        return res.status(200).send("OK");
      }

      // ---- STRICT OWNER-ONLY DICE ROLL BUTTON ----
      if (data.startsWith("GW_ROLL|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];

        if (!gw || gw.status === "FINISHED" || gw.status === "ROLLING") {
          await answerCb(token, cbId, "⚠️ Dice has already been rolled!", true);
          return res.status(200).send("OK");
        }

        if (!isOwner && String(cUid) !== String(gw.creatorId)) {
          await answerCb(
            token,
            cbId,
            `🔒 OWNER-ONLY ACTION! Only the Bot Owner (${gw.creatorName}) can roll the Dice!`,
            true
          );
          return res.status(200).send("OK");
        }

        const diceCfg = getSmartDiceConfig(gw.diceCount || 1);
        await answerCb(token, cbId, `🎲 Rolling ${diceCfg.diceCount} Official Telegram Dice...`, false);
        const rollRes = await executeOwnerDiceRollAndPayWinner(dbUrl, basePath, token, b, gw, players);
        if (!rollRes.ok) {
          await sendBotMsg(token, cUid, rollRes.error, mainKb);
        }
        return res.status(200).send("OK");
      }

      // ---- VERIFY STATUS CHECK ----
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
            `🚫 <b>DIRECT BANNED (403)</b>\n❌ Reason: <code>${escHtml(vCheck.reason)}</code>\n📱 Device: <code>${escHtml(vCheck.deviceId)}</code>`
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
            `✅ <b>DEVICE VERIFIED (200 OK)!</b>\n📱 Device ID: <code>${escHtml(vCheck.deviceId)}</code>\n🎯 You can now pick numbers in Giveaways!`,
            null,
            TG_EFFECTS.PARTY
          );
          return res.status(200).send("OK");
        }

        await answerCb(token, cbId, "❌ Not verified yet! Open the Mini App first.", true);
        await sendBotMsg(
          token,
          cUid,
          `⚠️ <b>Still Not Verified!</b> Tap below to open the private Verification Mini App:`,
          buildPrivateMiniAppVerifyKeyboard(cUid, botUsername, gwId)
        );
        return res.status(200).send("OK");
      }

      await answerCb(token, cbId, "Done", false);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // D. HANDLE TEXT MESSAGES (USER WALLET + OWNER-ONLY GIVEAWAY & ADMIN PANEL)
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

    if (text === "🔙 Back to Main Menu") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, "⚡ <b>Returned to Main Menu:</b>", mainKb);
      return res.status(200).send("OK");
    }

    // Private Mini-App Verification Entry (`/start VERIFY_...` or `🛡️ Verify My Device`)
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
          `🚫 <b>DIRECT BANNED (403 BANNED)</b>\n━━━━━━━━━━━━━━━━━━━━\n⚠️ Reason: <code>${escHtml(vCheck.reason)}</code>\n📱 Device: <code>${escHtml(vCheck.deviceId)}</code>\n🆔 First Account: <code>${escHtml(vCheck.firstUserId)}</code>`,
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
          `✅ <b>DEVICE VERIFIED (200 OK)!</b>\n📱 Device ID: <code>${escHtml(vCheck.deviceId)}</code>\n🎯 You are 100% eligible to join Giveaways!`,
          mainKb,
          TG_EFFECTS.PARTY
        );
        return res.status(200).send("OK");
      }

      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `🛡️ <b>1-USER 1-DEVICE MINI-APP VERIFICATION</b>\n━━━━━━━━━━━━━━━━━━━━\n🤖 <b>Bot:</b> @${escHtml(botUsername)}\n👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n\n👇 Tap below to open the private Verification Mini App:`,
        buildPrivateMiniAppVerifyKeyboard(cUid, botUsername, gwId)
      );
      return res.status(200).send("OK");
    }

    if (text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const welcomeHtml =
        `🎲 <b>WELCOME TO @${escHtml(botUsername.toUpperCase())} — GIVEAWAY & WALLET BOT!</b> 🎁\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
        `💰 <b>Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
        `🏆 <b>Giveaways Won:</b> <code>${numOrDef(p.wonGiveaways, 0)}</code>\n` +
        `🛡️ <b>Device Status:</b> ${p.verified ? `✅ <b>VERIFIED (${escHtml(p.deviceId)})</b>` : "⏳ <b>Tap Verify My Device</b>"}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ <b>Win Giveaways ➔ Cash Credits Automatically to Your Wallet ➔ Instant Withdraw via UPI or ${escHtml(wCfg.walletName)}!</b>\n\n` +
        `👇 <b>Select an option below:</b>`;

      await sendBotMsg(token, chatId, welcomeHtml, mainKb, TG_EFFECTS.PARTY);
      return res.status(200).send("OK");
    }

    // ------------------------------------------------------------------------
    // USER MENU BUTTONS
    // ------------------------------------------------------------------------
    if (text === "💰 My Wallet") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendUserWalletScreen(token, chatId, b, p);
      return res.status(200).send("OK");
    }

    if (text === "💸 Withdraw") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendWithdrawOptionsScreen(token, chatId, b, p);
      return res.status(200).send("OK");
    }

    if (text === "🎁 Active Giveaways") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const activeList = Object.values(giveaways).filter((g) => g && g.status !== "FINISHED");
      let sb = `🎁 <b>ACTIVE GIVEAWAYS (${activeList.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (activeList.length === 0) {
        sb += `📭 No active giveaways right now. Stay tuned for the Owner's next giveaway!`;
      } else {
        activeList.slice(0, 10).forEach((g, idx) => {
          const { total } = getRealReactionSummary(g);
          const { percent } = buildReactionProgressStats(total, g.targetReactions);
          const dCfg = getSmartDiceConfig(g.diceCount || 1);
          const pCount = Object.keys(g.participants || {}).length;
          sb +=
            `<b>[${idx + 1}] ₹${fmtRs(g.prizeAmount)} — ${escHtml(g.prize)} (<code>${g.id}</code>)</b>\n` +
            ` ┣ 📢 Chat: <code>${escHtml(g.targetChatId)}</code>\n` +
            ` ┣ 🎲 Mode: <code>${dCfg.diceCount} Dice (${dCfg.minNumber}-${dCfg.maxNumber})</code>\n` +
            ` ┗ ❤️ Reactions: <code>${percent}%</code> | 👥 Joined: <code>${pCount}/${dCfg.totalNumbers}</code>\n\n`;
        });
      }
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🏆 Past Winners") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const finished = Object.values(giveaways).filter((g) => g && g.status === "FINISHED" && !g.cancelled);
      let sb = `🏆 <b>RECENT GIVEAWAY WINNERS (${finished.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (finished.length === 0) sb += `📭 No completed giveaways yet.`;
      else {
        finished.slice(0, 10).forEach((g, idx) => {
          const wNames = (g.winners || [])
            .map((w) => `${escHtml(w.name)} (${w.username ? "@" + escHtml(w.username) : "None"} | <code>${w.id}</code>)`)
            .join(", ");
          sb +=
            `<b>[${idx + 1}] ₹${fmtRs(g.prizeAmount)} — ${escHtml(g.prize)}</b>\n` +
            ` ┣ 🎲 Roll: <code>#${g.winningNumber}</code>\n` +
            ` ┗ 🏆 Winner: ${wNames || "None"}\n\n`;
        });
      }
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "📜 My History") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const hist = Array.isArray(p.history) ? p.history : [];
      let sb = `📜 <b>MY WALLET & PAYOUT HISTORY</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (hist.length === 0) sb += `<i>No transactions recorded yet.</i>`;
      else hist.slice(0, 15).forEach((h) => { sb += `• ${escHtml(h)}\n`; });
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🎟️ Redeem Code") {
      p.state = "WAIT_USER_GIFT_CODE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, `🎟️ <b>REDEEM GIFT CODE</b>\n👇 <b>Send your Gift / Promo Code below:</b>`, buildCancelKeyboard());
      return res.status(200).send("OK");
    }

    if (text === "🥇 Hall of Fame") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      const topWinners = Object.values(players)
        .filter((u) => numOrDef(u.totalWon, 0) > 0)
        .sort((a, b) => numOrDef(b.totalWon, 0) - numOrDef(a.totalWon, 0))
        .slice(0, 10);

      let sb = `🥇 <b>TOP GIVEAWAY WINNERS HALL OF FAME</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (topWinners.length === 0) sb += `<i>No winners recorded yet.</i>`;
      else {
        topWinners.forEach((u, i) => {
          sb += `${i + 1}. <b>${escHtml(u.name)}</b> (<code>${u.id}</code>) — 💰 <b>₹${fmtRs(u.totalWon)}</b> (🏆 ${u.wonGiveaways} Wins)\n`;
        });
      }
      await sendBotMsg(token, chatId, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "ℹ️ How It Works") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `ℹ️ <b>HOW THIS GIVEAWAY & WALLET BOT WORKS</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `1️⃣ <b>Verify Device:</b> Tap <b>🛡️ Verify My Device</b> to pass the private 1-User 1-Device Mini-App check.\n` +
          `2️⃣ <b>Complete Post Reactions:</b> React directly on the Owner's Giveaway post. Once reactions reach <b>100%</b>, Number Selection unlocks automatically in <b>10 seconds</b>!\n` +
          `3️⃣ <b>Pick Lucky Number:</b> Choose an open number (<code>1-6</code> for 1 Dice, <code>2-12</code> for 2 Dice).\n` +
          `4️⃣ <b>Instant Wallet Credit:</b> When the Owner rolls the Dice, the Winner's Wallet is credited automatically with the ₹ Cash Prize!\n` +
          `5️⃣ <b>Withdraw Anytime:</b> Tap <b>💸 Withdraw</b> to cash out via UPI or <b>${escHtml(wCfg.walletName)}</b>!`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    // ------------------------------------------------------------------------
    // STRICT OWNER-ONLY ADMIN PANEL & GIVEAWAY CREATION TRIGGERS
    // ------------------------------------------------------------------------
    if (text === "🎲 Create Dice Giveaway") {
      if (!isOwner) {
        await sendBotMsg(
          token,
          chatId,
          `🔒 <b>OWNER-ONLY FEATURE!</b>\n\nOnly the Owner of <b>@${escHtml(botUsername)}</b> can create Giveaways here. Create your own bot in our Maker Bot to host giveaways!`,
          mainKb
        );
        return res.status(200).send("OK");
      }
      p.state = "GW_STEP1_TARGET_CHAT";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `🎲 <b>CREATE DICE GIVEAWAY (STEP 1 OF 6)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Where should the Giveaway Post be uploaded?</b>\n` +
          `Tap below or send your Channel / Group <code>@username</code> or Chat ID (<code>-100...</code>):`,
        buildTargetChatKeyboard(p.savedChannel)
      );
      return res.status(200).send("OK");
    }

    if (isOwner) {
      if (text === "👑 Admin Panel" || text === "/admin") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const wApiStatus = wCfg.enabled
          ? `🟢 ACTIVE (${escHtml(wCfg.walletName)} | Mode: ${wCfg.authMode})`
          : "🔴 NOT CONFIGURED";
        await sendBotMsg(
          token,
          chatId,
          `👑 <b>BOT OWNER MASTER ADMIN PANEL</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🤖 <b>Bot:</b> @${escHtml(botUsername)}\n` +
            `👥 <b>Users:</b> <code>${Object.keys(players).length}</code> | 🎁 <b>Giveaways:</b> <code>${Object.keys(giveaways).length}</code>\n` +
            `💳 <b>Custom Wallet API:</b> ${wApiStatus}\n` +
            `💸 <b>Withdraw Mode:</b> <code>${String(b.withdrawMode || "BOTH").toUpperCase()}</code> (<code>₹${fmtRs(numOrDef(b.minWithdraw, 1))} - ₹${fmtRs(numOrDef(b.maxWithdraw, 5000))}</code>)\n\n` +
            `👇 <b>Select an Admin tool below:</b>`,
          buildOwnerAdminKeyboard(b),
          TG_EFFECTS.FIRE
        );
        return res.status(200).send("OK");
      }

      if (text === "💳 Setup Custom Wallet API") {
        p.state = "ADM_WAPI_NAME";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `💳 <b>SETUP CUSTOM WALLET API (STEP 1 OF 4)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Current Wallet Name: <code>${escHtml(wCfg.walletName)}</code>\n\n` +
            `👇 <b>Enter the Custom Wallet Name</b> (shown to users on the Withdraw button):\n` +
            `• Example: <code>Payzy Wallet</code> or <code>SMARTU Wallet</code>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "⚙️ Wallet Auth Mode") {
        p.state = "ADM_WAPI_AUTH_MODE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `⚙️ <b>CONFIGURE WALLET API CREDENTIAL MODE</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Current Mode: <code>${wCfg.authMode}</code>\n\n` +
            `Select what your Wallet API requires from the user:\n` +
            `• <b>🔑 TOKEN ONLY:</b> User links their <code>{token}</code>\n` +
            `• <b>🗝️ KEY ONLY:</b> User links their <code>{key}</code>\n` +
            `• <b>🔐 BOTH TOKEN & KEY:</b> User links both <code>{token}</code> & <code>{key}</code>\n` +
            `• <b>📱 USER NUMBER + ADMIN MERCHANT TOKEN:</b> User links <code>{number}</code> & Admin's token/key is sent!`,
          buildWalletAuthModeKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text.startsWith("💸 Withdraw Mode:")) {
        const curM = String(b.withdrawMode || "BOTH").toUpperCase();
        b.withdrawMode = curM === "BOTH" ? "UPI" : curM === "UPI" ? "WALLET" : "BOTH";
        await saveBotConfig(dbUrl, basePath, b);
        await sendBotMsg(
          token,
          chatId,
          `✅ <b>Withdrawal Mode switched to:</b> <code>${b.withdrawMode}</code>!`,
          buildOwnerAdminKeyboard(b)
        );
        return res.status(200).send("OK");
      }

      if (text === "📉 Set Min / Max Withdraw") {
        p.state = "ADM_SET_WD_LIMITS";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `📉 <b>SET WITHDRAWAL LIMITS</b>\nCurrent: Min <code>₹${fmtRs(numOrDef(b.minWithdraw, 1))}</code> | Max <code>₹${fmtRs(numOrDef(b.maxWithdraw, 5000))}</code>\n\n👇 <b>Send <code>MIN MAX</code> (e.g. <code>5 2000</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "📋 Manage Giveaways") {
        const list = Object.values(giveaways).filter((g) => g && g.status !== "FINISHED");
        if (list.length === 0) {
          await sendBotMsg(token, chatId, `📭 <b>No active giveaways right now.</b>`, buildOwnerAdminKeyboard(b));
          return res.status(200).send("OK");
        }
        for (const g of list.slice(0, 5)) {
          await sendOwnerControlDeckDM(token, g, `📋 <b>ACTIVE GIVEAWAY CONTROL (#${g.id})</b>`);
        }
        return res.status(200).send("OK");
      }

      if (text === "➕ Add / Cut User Balance") {
        p.state = "ADM_MOD_BAL";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `💰 <b>ADD / CUT USER WALLET BALANCE</b>\n👇 <b>Send <code>USER_ID AMOUNT</code></b> (e.g. <code>7335163273 50</code> or <code>7335163273 -10</code>):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "🎟️ Create Gift Code") {
        p.state = "ADM_MAKE_GIFT";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `🎟️ <b>CREATE WALLET GIFT CODE</b>\n👇 <b>Send <code>CODE AMOUNT_RS MAX_USES</code></b> (e.g. <code>WIN20 20 10</code>):`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (text === "🚫 Ban / Unban User") {
        p.state = "ADM_BAN_USER";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, chatId, `🚫 <b>Send Target User ID to Ban or Unban:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "📢 Broadcast All Users") {
        p.state = "ADM_BCAST";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, chatId, `📢 <b>Send Broadcast Message for all ${Object.keys(players).length} users:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "📊 Full Bot Statistics") {
        const wList = Object.values(withdrawals);
        const totalPaidCount = wList.filter((x) => x && x.status === "PAID").length;
        await sendBotMsg(
          token,
          chatId,
          `📊 <b>FULL BOT STATISTICS</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 <b>Total Users:</b> <code>${Object.keys(players).length}</code>\n` +
            `🎁 <b>Total Giveaways:</b> <code>${Object.keys(giveaways).length}</code>\n` +
            `💸 <b>Completed Payouts:</b> <code>${totalPaidCount}</code>\n` +
            `💳 <b>Wallet API:</b> <code>${wCfg.enabled ? wCfg.walletName + " (ON)" : "OFF"}</code>\n` +
            `🔗 <b>API Template:</b> <code>${escHtml(wCfg.apiUrl || "Not Set")}</code>`,
          buildOwnerAdminKeyboard(b)
        );
        return res.status(200).send("OK");
      }
    }

    // ========================================================================
    // E. MULTI-STEP WORKFLOWS (USER WALLET + OWNER ADMIN + GIVEAWAY WIZARD)
    // ========================================================================
    const st = String(p.state || "IDLE").toUpperCase();

    // ---- USER: LINK UPI ID ----
    if (st === "WAIT_USER_UPI_ID") {
      if (!text.includes("@")) {
        await sendBotMsg(token, chatId, `⚠️ Invalid UPI ID! Must contain <code>@</code> (e.g. <code>name@ybl</code>):`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }
      p.upiId = text.trim();
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, `✅ <b>UPI ID Saved:</b> <code>${escHtml(p.upiId)}</code>`, mainKb);
      await sendWithdrawOptionsScreen(token, chatId, b, p);
      return res.status(200).send("OK");
    }

    // ---- USER: LINK CUSTOM WALLET TOKEN / KEY / NUMBER ----
    if (st === "WAIT_USER_WALLET_TOKEN") {
      p.userWalletToken = text.trim();
      if (wCfg.authMode === "BOTH") {
        p.state = "WAIT_USER_WALLET_KEY";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `✅ <b>${escHtml(wCfg.walletName)} Token Saved!</b>\n\n🗝️ <b>STEP 2 OF 2: Now send your ${escHtml(wCfg.walletName)} Secret Key (<code>{key}</code>):</b>`,
          buildCancelKeyboard()
        );
      } else {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, chatId, `✅ <b>${escHtml(wCfg.walletName)} Token Linked Successfully!</b>`, mainKb);
        await sendWithdrawOptionsScreen(token, chatId, b, p);
      }
      return res.status(200).send("OK");
    }

    if (st === "WAIT_USER_WALLET_KEY") {
      p.userWalletKey = text.trim();
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, `✅ <b>${escHtml(wCfg.walletName)} Credentials Linked Successfully!</b>`, mainKb);
      await sendWithdrawOptionsScreen(token, chatId, b, p);
      return res.status(200).send("OK");
    }

    if (st === "WAIT_USER_WALLET_NUMBER") {
      p.userWalletNumber = text.trim();
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, `✅ <b>${escHtml(wCfg.walletName)} Account/Number Saved:</b> <code>${escHtml(p.userWalletNumber)}</code>`, mainKb);
      await sendWithdrawOptionsScreen(token, chatId, b, p);
      return res.status(200).send("OK");
    }

    // ---- USER: WITHDRAW VIA UPI ----
    if (st === "WAIT_WD_AMOUNT_UPI") {
      const amt = parseFloat(text);
      const minW = numOrDef(b.minWithdraw, 1);
      const maxW = numOrDef(b.maxWithdraw, 5000);
      if (isNaN(amt) || amt < minW || amt > maxW || amt > p.balance) {
        await sendBotMsg(
          token,
          chatId,
          `❌ <b>Invalid Amount or Insufficient Balance!</b>\nAllowed: <code>₹${fmtRs(minW)} – ₹${fmtRs(maxW)}</code> | Your Balance: <code>₹${fmtRs(p.balance)}</code>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      p.balance = Number((p.balance - amt).toFixed(2));
      p.state = "IDLE";
      const reqId = "UPI-" + Math.floor(100000 + Math.random() * 900000);
      const wReq = {
        id: reqId,
        method: "UPI",
        userId: cUid,
        userName: cName,
        username: cUname,
        upiId: p.upiId,
        amount: amt,
        status: "PENDING",
        createdAt: formatIstShortTime(Date.now())
      };
      addHistory(p, `⏳ UPI Withdrawal Submitted (#${reqId}): -₹${fmtRs(amt)}`);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await saveWithdrawal(dbUrl, basePath, reqId, wReq);

      await sendBotMsg(
        token,
        chatId,
        `✅ <b>UPI WITHDRAWAL REQUEST SUBMITTED!</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>ID:</b> <code>${reqId}</code>\n💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n🏦 <b>UPI ID:</b> <code>${escHtml(p.upiId)}</code>\n⏳ <i>Sent to Bot Owner for quick approval!</i>`,
        mainKb
      );

      await sendBotMsg(
        token,
        ownerId,
        `🔔 <b>NEW UPI WITHDRAWAL REQUEST</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 <b>Request ID:</b> <code>${reqId}</code>\n` +
          `👤 <b>User:</b> ${escHtml(cName)} (${cUname ? "@" + escHtml(cUname) : "None"} | <code>${cUid}</code>)\n` +
          `💰 <b>Amount:</b> <code>₹${fmtRs(amt)}</code>\n` +
          `🏦 <b>Pay To UPI:</b> <code>${escHtml(p.upiId)}</code>`,
        {
          inline_keyboard: [
            [
              { text: `✅ Approve & Mark Paid (₹${fmtRs(amt)})`, callback_data: `WD_APPROVE|${reqId}` },
              { text: "❌ Reject & Refund", callback_data: `WD_REJECT|${reqId}` }
            ]
          ]
        },
        TG_EFFECTS.FIRE
      );
      return res.status(200).send("OK");
    }

    // ---- USER: INSTANT AUTO-PAYOUT VIA CUSTOM WALLET API! ----
    if (st === "WAIT_WD_AMOUNT_WALLET") {
      const amt = parseFloat(text);
      const minW = numOrDef(b.minWithdraw, 1);
      const maxW = numOrDef(b.maxWithdraw, 5000);
      if (isNaN(amt) || amt < minW || amt > maxW || amt > p.balance) {
        await sendBotMsg(
          token,
          chatId,
          `❌ <b>Invalid Amount or Insufficient Balance!</b>\nAllowed: <code>₹${fmtRs(minW)} – ₹${fmtRs(maxW)}</code> | Your Balance: <code>₹${fmtRs(p.balance)}</code>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      // Deduct upfront before API call (auto-refunded immediately if API fails!)
      p.balance = Number((p.balance - amt).toFixed(2));
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const reqId = "WAL-" + Math.floor(100000 + Math.random() * 900000);
      await sendBotMsg(
        token,
        chatId,
        `⏳ <b>PROCESSING INSTANT ${escHtml(wCfg.walletName.toUpperCase())} API PAYOUT...</b>\n💰 Amount: <code>₹${fmtRs(amt)}</code>`,
        mainKb
      );

      // Call Custom Wallet API with {amount}, {token}, {key}, {number}
      const apiResult = await executeCustomWalletApiWithdrawal(wCfg, p, amt, reqId, botUsername);

      if (apiResult.success) {
        p.totalWithdrawn = Number((numOrDef(p.totalWithdrawn, 0) + amt).toFixed(2));
        addHistory(p, `✅ ${wCfg.walletName} Auto-Payout (#${reqId}): ₹${fmtRs(amt)}`);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await saveWithdrawal(dbUrl, basePath, reqId, {
          id: reqId,
          method: wCfg.walletName,
          userId: cUid,
          userName: cName,
          amount: amt,
          status: "PAID",
          txnId: apiResult.txnId,
          apiMessage: apiResult.message,
          createdAt: formatIstShortTime(Date.now())
        });

        await sendBotMsg(
          token,
          chatId,
          `🎉 <b>WITHDRAWAL SUCCESSFUL VIA ${escHtml(wCfg.walletName.toUpperCase())}!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 <b>Txn ID:</b> <code>${escHtml(apiResult.txnId)}</code>\n` +
            `💰 <b>Paid Amount:</b> <code>₹${fmtRs(amt)}</code>\n` +
            `🏦 <b>Remaining Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
            `📡 <b>Wallet API Reply:</b> <i>${escHtml(apiResult.message)}</i>`,
          mainKb,
          TG_EFFECTS.PARTY
        );

        await sendBotMsg(
          token,
          ownerId,
          `⚡ <b>AUTO ${escHtml(wCfg.walletName.toUpperCase())} PAYOUT COMPLETED!</b>\n👤 User: ${escHtml(cName)} (<code>${cUid}</code>)\n💰 Amount: <code>₹${fmtRs(amt)}</code>\n🆔 Txn: <code>${escHtml(apiResult.txnId)}</code>`
        );
      } else {
        // AUTO-REFUND ON WALLET API FAILURE!
        p.balance = Number((p.balance + amt).toFixed(2));
        addHistory(p, `🔄 ${wCfg.walletName} Payout Failed & Refunded (#${reqId}): +₹${fmtRs(amt)}`);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await saveWithdrawal(dbUrl, basePath, reqId, {
          id: reqId,
          method: wCfg.walletName,
          userId: cUid,
          userName: cName,
          amount: amt,
          status: "FAILED_REFUNDED",
          apiMessage: apiResult.message,
          createdAt: formatIstShortTime(Date.now())
        });

        await sendBotMsg(
          token,
          chatId,
          `❌ <b>${escHtml(wCfg.walletName.toUpperCase())} WITHDRAWAL FAILED — AUTO REFUNDED!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ <b>API Reason:</b> <code>${escHtml(apiResult.message)}</code>\n` +
            `🔄 <b>Refunded to Wallet:</b> <code>+₹${fmtRs(amt)}</code>\n` +
            `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n\n` +
            `👉 Check your linked ${escHtml(wCfg.walletName)} Token/Key or try withdrawing via UPI!`,
          mainKb
        );

        await sendBotMsg(
          token,
          ownerId,
          `⚠️ <b>${escHtml(wCfg.walletName.toUpperCase())} API PAYOUT FAILED (AUTO REFUNDED)</b>\n👤 User: ${escHtml(cName)} (<code>${cUid}</code>)\n💰 Amount: <code>₹${fmtRs(amt)}</code>\n❌ Reason: <code>${escHtml(apiResult.message)}</code>`
        );
      }
      return res.status(200).send("OK");
    }

    // ---- USER: REDEEM GIFT CODE ----
    if (st === "WAIT_USER_GIFT_CODE") {
      const codeKey = text.toUpperCase().trim();
      p.state = "IDLE";
      const g = giftCodes[codeKey];
      if (!g || (Array.isArray(g.used) && g.used.length >= numOrDef(g.max, 1))) {
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, chatId, `❌ <b>Invalid or Expired Gift Code!</b>`, mainKb);
        return res.status(200).send("OK");
      }
      if (!Array.isArray(g.used)) g.used = [];
      if (g.used.map(String).includes(cUid)) {
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, chatId, `⚠️ <b>You already claimed this Gift Code!</b>`, mainKb);
        return res.status(200).send("OK");
      }
      g.used.push(cUid);
      const amt = numOrDef(g.amount, 1);
      p.balance = Number((p.balance + amt).toFixed(2));
      addHistory(p, `🎟️ Gift Code (${codeKey}): +₹${fmtRs(amt)}`);
      await fbRequest(dbUrl, `${basePath}/giftCodes/${codeKey}`, "PUT", g);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        chatId,
        `🎉 <b>GIFT CODE REDEEMED!</b>\n💎 Added: <code>+₹${fmtRs(amt)}</code>\n💰 New Balance: <code>₹${fmtRs(p.balance)}</code>`,
        mainKb,
        TG_EFFECTS.PARTY
      );
      return res.status(200).send("OK");
    }

    // ========================================================================
    // F. OWNER-ONLY ADMIN MULTI-STEP FLOWS (CUSTOM WALLET API + GIVEAWAY WIZARD)
    // ========================================================================
    if (isOwner) {
      // ---- CUSTOM WALLET API SETUP (4 STEPS) ----
      if (st === "ADM_WAPI_NAME") {
        b.walletApi = { ...(b.walletApi || {}), walletName: text.trim() || "Custom Wallet" };
        p.state = "ADM_WAPI_URL";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `🔗 <b>SETUP ${escHtml(b.walletApi.walletName.toUpperCase())} API (STEP 2 OF 4)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Send your Wallet Payout API URL using placeholders:\n` +
            `<code>{amount}</code> • <code>{token}</code> • <code>{key}</code> • <code>{number}</code> • <code>{userid}</code> • <code>{comment}</code>\n\n` +
            `• Example:\n<code>https://mywallet.com/api/pay?token={token}&amp;key={key}&amp;amount={amount}</code>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_WAPI_URL") {
        if (!text.startsWith("http://") && !text.startsWith("https://")) {
          await sendBotMsg(token, chatId, `⚠️ URL must start with <code>https://</code>! Send valid API URL:`, buildCancelKeyboard());
          return res.status(200).send("OK");
        }
        b.walletApi = { ...(b.walletApi || {}), apiUrl: text.trim(), enabled: true };
        p.state = "ADM_WAPI_AUTH_MODE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `⚙️ <b>STEP 3 OF 4: SELECT WALLET CREDENTIAL MODE</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `What does a user need to provide when withdrawing to <b>${escHtml(b.walletApi.walletName)}</b>?`,
          buildWalletAuthModeKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_WAPI_AUTH_MODE") {
        let mode = "BOTH";
        if (text.includes("TOKEN ONLY")) mode = "TOKEN";
        else if (text.includes("KEY ONLY")) mode = "KEY";
        else if (text.includes("NUMBER")) mode = "NUMBER";

        b.walletApi = { ...(b.walletApi || {}), authMode: mode };
        await saveBotConfig(dbUrl, basePath, b);

        if (mode === "NUMBER") {
          p.state = "ADM_WAPI_MERCHANT_CREDS";
          await savePlayerState(dbUrl, basePath, cUid, p);
          await sendBotMsg(
            token,
            chatId,
            `🔑 <b>STEP 4 OF 4: ADMIN MERCHANT TOKEN & KEY (OPTIONAL)</b>\n` +
              `Send <code>MERCHANT_TOKEN | MERCHANT_KEY</code> (used to fill <code>{token}</code> and <code>{key}</code> when user enters their <code>{number}</code>), or send <code>SKIP</code>:`,
            buildCancelKeyboard()
          );
        } else {
          p.state = "IDLE";
          await savePlayerState(dbUrl, basePath, cUid, p);
          await sendBotMsg(
            token,
            chatId,
            `✅ <b>CUSTOM WALLET API CONFIGURED & LIVE!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `💳 <b>Wallet Name:</b> ${escHtml(b.walletApi.walletName)}\n` +
              `⚙️ <b>Auth Mode:</b> <code>${mode}</code>\n` +
              `🔗 <b>API Template:</b> <code>${escHtml(b.walletApi.apiUrl)}</code>\n\n` +
              `⚡ <i>Users can now withdraw directly to ${escHtml(b.walletApi.walletName)} with instant auto-payout & auto-refund on failure!</i>`,
            buildOwnerAdminKeyboard(b),
            TG_EFFECTS.PARTY
          );
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_WAPI_MERCHANT_CREDS") {
        if (text.toUpperCase() !== "SKIP") {
          const parts = text.split("|");
          b.walletApi.merchantToken = (parts[0] || "").trim();
          b.walletApi.merchantKey = (parts[1] || "").trim();
          await saveBotConfig(dbUrl, basePath, b);
        }
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `✅ <b>${escHtml(b.walletApi.walletName)} API & MERCHANT CREDENTIALS SAVED!</b>`,
          buildOwnerAdminKeyboard(b),
          TG_EFFECTS.PARTY
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_WD_LIMITS") {
        const parts = text.split(/\s+/);
        if (parts.length >= 2) {
          b.minWithdraw = Math.max(1, parseFloat(parts[0]) || 1);
          b.maxWithdraw = Math.max(b.minWithdraw, parseFloat(parts[1]) || 5000);
          await saveBotConfig(dbUrl, basePath, b);
        }
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `✅ <b>Withdraw Limits Updated:</b> <code>₹${fmtRs(b.minWithdraw)} – ₹${fmtRs(b.maxWithdraw)}</code>`,
          buildOwnerAdminKeyboard(b)
        );
        return res.status(200).send("OK");
      }

      if (st === "ADM_MOD_BAL") {
        const parts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (parts.length >= 2) {
          const tUid = parts[0].replace(/\D/g, "");
          const delta = parseFloat(parts[1]) || 0;
          const tp = getOrInitUser(players, tUid, "User " + tUid, "");
          tp.balance = Math.max(0, Number((tp.balance + delta).toFixed(2)));
          addHistory(tp, `👑 Admin Balance Update: ${delta >= 0 ? "+" : ""}₹${fmtRs(delta)}`);
          await savePlayerState(dbUrl, basePath, tUid, tp);
          await sendBotMsg(token, chatId, `✅ Updated <code>${tUid}</code> Wallet Balance to <code>₹${fmtRs(tp.balance)}</code>!`, buildOwnerAdminKeyboard(b));
          await sendBotMsg(token, tUid, `💰 <b>Admin Updated Your Wallet!</b>\nNew Balance: <code>₹${fmtRs(tp.balance)}</code>`);
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_MAKE_GIFT") {
        const parts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (parts.length >= 3) {
          const code = parts[0].toUpperCase();
          const amt = parseFloat(parts[1]) || 10;
          const max = parseInt(parts[2], 10) || 10;
          await fbRequest(dbUrl, `${basePath}/giftCodes/${code}`, "PUT", { code, amount: amt, max, used: [] });
          await sendBotMsg(token, chatId, `🎟️ <b>Gift Code Created:</b> <code>${code}</code> (₹${fmtRs(amt)} | Max ${max})`, buildOwnerAdminKeyboard(b), TG_EFFECTS.PARTY);
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_BAN_USER") {
        const tUid = text.replace(/\D/g, "");
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (tUid) {
          const tp = getOrInitUser(players, tUid, "User " + tUid, "");
          tp.banned = !tp.banned;
          await savePlayerState(dbUrl, basePath, tUid, tp);
          await sendBotMsg(token, chatId, `✅ User <code>${tUid}</code> is now <b>${tp.banned ? "🚫 BANNED" : "🟢 UNBANNED"}</b>!`, buildOwnerAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_BCAST") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const ids = Object.keys(players);
        for (const uId of ids) {
          await sendBotMsg(token, uId, `📢 <b>OFFICIAL ANNOUNCEMENT</b>\n━━━━━━━━━━━━━━━━━━━━\n${text}`);
        }
        await sendBotMsg(token, chatId, `✅ <b>Broadcast sent to ${ids.length} users!</b>`, buildOwnerAdminKeyboard(b));
        return res.status(200).send("OK");
      }

      // ---- OWNER 6-STEP DICE GIVEAWAY WIZARD ----
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
        p.state = "GW_STEP2_PRIZE_AMOUNT";
        await savePlayerState(dbUrl, basePath, cUid, p);

        await sendBotMsg(
          token,
          chatId,
          `💰 <b>STEP 2 OF 6: SET CASH PRIZE AMOUNT (₹)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📢 <b>Target Chat:</b> <code>${escHtml(targetChat)}</code>\n\n` +
            `👇 <b>How many ₹ will be auto-credited to the Winner's Bot Wallet?</b>\n` +
            `Tap a value below or type any ₹ amount (e.g. <code>25</code>):`,
          buildPrizeAmountKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "GW_STEP2_PRIZE_AMOUNT") {
        const prizeAmt = parseFloat(text);
        if (isNaN(prizeAmt) || prizeAmt < 0) {
          await sendBotMsg(token, chatId, `⚠️ Enter a valid numeric ₹ amount (e.g. <code>10</code>):`, buildPrizeAmountKeyboard());
          return res.status(200).send("OK");
        }
        p.tempPrizeAmount = prizeAmt;
        p.state = "GW_STEP3_PRIZE_TITLE";
        await savePlayerState(dbUrl, basePath, cUid, p);

        await sendBotMsg(
          token,
          chatId,
          `🏆 <b>STEP 3 OF 6: ENTER GIVEAWAY TITLE</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 <b>Wallet Prize:</b> <code>₹${fmtRs(prizeAmt)}</code>\n\n` +
            `👇 <b>Type a short Title (e.g. <code>Mega Night Cash Giveaway</code>):</b>`,
          buildCancelKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "GW_STEP3_PRIZE_TITLE") {
        p.tempPrize = text || `₹${fmtRs(p.tempPrizeAmount)} Cash Giveaway`;
        p.state = "GW_STEP4_REACTIONS";
        await savePlayerState(dbUrl, basePath, cUid, p);

        await sendBotMsg(
          token,
          chatId,
          `❤️ <b>STEP 4 OF 6: SET REAL REACTION TARGET OR SKIP</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🏆 <b>Giveaway:</b> ${escHtml(p.tempPrize)} (<code>₹${fmtRs(p.tempPrizeAmount)}</code>)\n\n` +
            `📌 <b>How many Real Telegram Reactions are needed before the 10-second Auto-Start?</b>`,
          buildReactionTargetKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "GW_STEP4_REACTIONS") {
        let rTarget = 0;
        if (!text.toLowerCase().includes("skip")) {
          const parsed = parseInt(text.replace(/\D/g, ""), 10);
          if (isNaN(parsed) || parsed < 0) {
            await sendBotMsg(token, chatId, `⚠️ Enter a valid reaction count (e.g. <code>10</code>) or Skip:`, buildReactionTargetKeyboard());
            return res.status(200).send("OK");
          }
          rTarget = parsed;
        }
        p.tempReactionTarget = rTarget;
        p.state = "GW_STEP5_TIME";
        await savePlayerState(dbUrl, basePath, cUid, p);

        await sendBotMsg(
          token,
          chatId,
          `⏰ <b>STEP 5 OF 6: SET POST UPLOAD TIME (IST)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Real Reactions" : "Skipped (0)"}</code>\n\n` +
            `👇 <b>Type upload time (e.g. <code>8.09 pm</code>) or tap Upload Immediately:</b>`,
          buildPostUploadTimeKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "GW_STEP5_TIME") {
        const parsedTime = parseUserTimeInputToEpoch(text);
        if (!parsedTime.ok) {
          await sendBotMsg(token, chatId, `❌ <b>${escHtml(parsedTime.error)}</b>`, buildPostUploadTimeKeyboard());
          return res.status(200).send("OK");
        }
        p.tempScheduledEpoch = parsedTime.epochMs;
        p.tempScheduledLabel = parsedTime.label;
        p.state = "GW_STEP6_DICE_COUNT";
        await savePlayerState(dbUrl, basePath, cUid, p);

        await sendBotMsg(
          token,
          chatId,
          `🎲 <b>STEP 6 OF 6: SELECT SMART DICE COUNT</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `⏰ <b>Post Upload Time:</b> <code>${escHtml(parsedTime.label)}</code>\n\n` +
            `• <b>1 Dice (🎲):</b> <code>6 Numbers (1 to 6)</code>\n` +
            `• <b>2 Dice (🎲🎲):</b> <code>11 Numbers (2 to 12)</code>\n` +
            `• <b>3 Dice (🎲🎲🎲):</b> <code>16 Numbers (3 to 18)</code>\n` +
            `👇 <b>Select below:</b>`,
          buildSmartDiceCountKeyboard()
        );
        return res.status(200).send("OK");
      }

      if (st === "GW_STEP6_DICE_COUNT") {
        let chosenDiceCount = 1;
        const lower = text.toLowerCase();
        if (lower.includes("2 dice") || lower === "2" || lower === "11" || lower === "12") chosenDiceCount = 2;
        else if (lower.includes("3 dice") || lower === "3" || lower === "16" || lower === "18") chosenDiceCount = 3;
        else if (lower.includes("4 dice") || lower === "4" || lower === "21" || lower === "24") chosenDiceCount = 4;
        else if (lower.includes("5 dice") || lower === "5" || lower === "26" || lower === "30") chosenDiceCount = 5;
        else if (lower.includes("6 dice") || lower === "31" || lower === "36") chosenDiceCount = 6;
        else {
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
          prize: p.tempPrize || "Cash Giveaway",
          prizeAmount: numOrDef(p.tempPrizeAmount, 10),
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
        await savePlayerState(dbUrl, basePath, cUid, p);

        if (waitMs > 0) {
          await saveGiveaway(dbUrl, basePath, gwId, gwObj);
          if (waitMs <= 25000) {
            await sendBotMsg(token, chatId, `⏳ <b>Auto-uploading Giveaway #${gwId} in ${Math.ceil(waitMs / 1000)}s...</b>`, mainKb);
            await sleepMs(waitMs);
            await publishScheduledGiveawayPostNow(dbUrl, basePath, token, gwObj);
            return res.status(200).send("OK");
          }
          await sendBotMsg(
            token,
            chatId,
            `⏰ <b>GIVEAWAY #${gwId} SCHEDULED FOR AUTO-UPLOAD!</b>\n` +
              `📢 Chat: <code>${escHtml(targetChat)}</code> | 💰 Prize: <code>₹${fmtRs(gwObj.prizeAmount)}</code>\n` +
              `🕒 Upload Time: <code>${escHtml(gwObj.scheduledLabel)}</code>\n` +
              `❤️ Reactions: <code>${rTarget > 0 ? rTarget + " Real Reactions" : "Skipped"}</code>\n` +
              `🎲 Mode: <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber}-${diceCfg.maxNumber})</code>`,
            {
              inline_keyboard: [[{ text: "⚡ Upload Post Right Now", callback_data: `GW_PUB_NOW|${gwId}` }]]
            }
          );
          return res.status(200).send("OK");
        }

        gwObj.uploadedAtLabel = formatIstShortTime(Date.now());
        const rendered =
          rTarget > 0 ? renderStage1ReactionGatePost(gwObj, null) : renderStage2NumberSelectionPost(gwObj);

        const postRes = await sendBotMsg(token, targetChat, rendered.text, rendered.reply_markup);
        if (!postRes || !postRes.ok) {
          await sendBotMsg(
            token,
            chatId,
            `❌ <b>Could not post to <code>${escHtml(targetChat)}</code>!</b>\nMake sure <b>@${escHtml(botUsername)}</b> is Admin in that channel/group.`,
            mainKb
          );
          return res.status(200).send("OK");
        }

        gwObj.postMessageId = postRes.result.message_id;
        await saveGiveaway(dbUrl, basePath, gwId, gwObj);
        await autoPinGiveawayMessage(token, targetChat, gwObj.postMessageId);

        if (rTarget === 0) {
          await sendOwnerControlDeckDM(token, gwObj, `🎉 <b>GIVEAWAY #${gwId} UPLOADED & NUMBERS ARE LIVE!</b>`);
        } else {
          await sendBotMsg(
            token,
            chatId,
            `🎉 <b>GIVEAWAY #${gwId} UPLOADED & PINNED LIVE!</b>\n` +
              `📢 Chat: <code>${escHtml(targetChat)}</code>\n` +
              `💰 Wallet Cash Prize: <code>₹${fmtRs(gwObj.prizeAmount)}</code>\n` +
              `❤️ Reactions: <code>${rTarget} Real Reactions (Auto-starts 10s after 100%!)</code>\n` +
              `🎲 Dice: <code>${diceCfg.diceCount} Dice (${diceCfg.minNumber}-${diceCfg.maxNumber})</code> | 🔒 Roll: Owner Only`,
            mainKb,
            TG_EFFECTS.FIRE
          );
        }
        return res.status(200).send("OK");
      }
    }

    // Default Fallback
    await sendBotMsg(
      token,
      chatId,
      `⚡ <b>Select an option from the menu below or send /start:</b>`,
      mainKb
    );
  } catch (err) {}

  return res.status(200).send("OK");
}