// ============================================================================
// 👑 FILE: api/bot2.js — 24/7 GIFT CARD & REDEEM CODE SELLING BOT ENGINE 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot2
// Features:
// 1. Sell 10+ Gift Cards (Play Store, Amazon, Flipkart, Zomato, Swiggy, Myntra,
//    BookMyShow, Steam, Free Fire/BGMI, Other) with Live % Payout Calculator
// 2. Owner Real/Fake Verification (Approve -> Auto Credit Wallet | Reject -> Fake)
// 3. Built-in Wallet, Balance, History, Daily Bonus, Refer & Earn, Promo Codes
// 4. Dual Withdrawal: UPI ID (Admin Approve/Reject+Refund) + Custom Wallet API
// 5. Live Force-Join Channel Gate (Public @username & Private -100... Channels)
// 6. Private Mini-App 1-User 1-Device Verification (`web_app`, Blocks 403 BANNED)
// 7. 2-Way Help / Support Desk with Admin Direct Reply Button
// 8. 100% Compatible with Maker Bot (`connect_bot` & `delete_bot`)
// ============================================================================

const PRIMARY_FIREBASE_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const MIRROR_FIREBASE_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const VERIFY_WEB_BASE = "https://verification-sigma-flax.vercel.app/";
const VERIFY_API_BASE = "https://verification-sigma-flax.vercel.app/api/verify";
const MASTER_ADMIN = "7335163273";

const TG_EFFECTS = {
  FIRE: "5104841245755180586",
  PARTY: "5046509860389126442",
  HEART: "5159385139981059251",
  LIKE: "5107584321108051014"
};

const DEFAULT_CARD_RATES = {
  "Google Play Store": 85,
  "Amazon Pay": 90,
  "Flipkart": 88,
  "Zomato": 80,
  "Swiggy": 80,
  "Myntra": 82,
  "BookMyShow": 78,
  "Steam Wallet": 85,
  "Free Fire / BGMI": 82,
  "Other Gift Card": 75
};

// ============================================================================
// 1. CORE FORMATTING & HELPERS
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

function formatIstShortTime(epochMs) {
  const istDate = new Date(Number(epochMs || Date.now()) + 5.5 * 60 * 60 * 1000);
  let hrs = istDate.getUTCHours();
  const mins = String(istDate.getUTCMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  return `${String(hrs).padStart(2, "0")}:${mins} ${ampm}`;
}

function addHistory(p, entry) {
  if (!Array.isArray(p.history)) p.history = [];
  p.history.unshift(`[${formatIstShortTime(Date.now())}] ${entry}`);
  if (p.history.length > 25) p.history = p.history.slice(0, 25);
}

function isBotOwner(b, uid) {
  const sUid = String(uid);
  const owner = String(b.owner || b.adminId || MASTER_ADMIN);
  return sUid === owner || sUid === MASTER_ADMIN;
}

function getCardRates(b) {
  return { ...DEFAULT_CARD_RATES, ...(b.cardRates || {}) };
}

function calcPayoutAmount(faceValue, ratePct) {
  const raw = (Number(faceValue) * Number(ratePct)) / 100;
  return Number(raw.toFixed(2));
}

// ============================================================================
// 2. 1-USER 1-DEVICE PRIVATE MINI-APP VERIFICATION (`web_app`)
// ============================================================================
function getVerificationMiniAppUrl(userId, botUsername) {
  const cleanBot = String(botUsername || "Kumar_api_bot").replace(/^@/, "").trim();
  return `${VERIFY_WEB_BASE}?userid=${encodeURIComponent(String(userId))}&bot=${encodeURIComponent(cleanBot)}`;
}

function buildPrivateMiniAppVerifyKeyboard(userId, botUsername) {
  const url = getVerificationMiniAppUrl(userId, botUsername);
  return {
    inline_keyboard: [
      [{ text: "🛡️ Open Device Verification Mini App", web_app: { url } }],
      [{ text: "✅ I Have Verified — Check Status", callback_data: "VERIFY_CHECK_ME" }]
    ]
  };
}

async function checkUserDeviceVerification(userId, botUsername) {
  try {
    const cleanBot = String(botUsername || "Kumar_api_bot").replace(/^@/, "").trim();
    const apiUrl = `${VERIFY_API_BASE}?userid=${encodeURIComponent(String(userId))}&bot=${encodeURIComponent(cleanBot)}`;
    const res = await fetch(apiUrl, { method: "GET", headers: { Accept: "application/json" } });
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
        deviceId: data.deviceId || "DEV-BANNED",
        firstUserId: data.first_userid || "",
        reason: data.reason || "MULTIPLE_ACCOUNTS_SAME_DEVICE"
      };
    }

    if (
      data.ok === true &&
      (data.verified === true || data.status === "verified" || data.status === "already_verified")
    ) {
      return {
        allowed: true,
        banned: false,
        verified: true,
        status: data.status || "verified",
        deviceId: data.deviceId || "DEV-VERIFIED"
      };
    }

    return { allowed: false, banned: false, verified: false, deviceId: "" };
  } catch (e) {
    return { allowed: false, banned: false, verified: false, deviceId: "" };
  }
}

// ============================================================================
// 3. FIREBASE REALTIME DATABASE LAYER
// ============================================================================
async function fbRequest(baseUrl, path, method = "GET", data = null) {
  try {
    const cleanPath = String(path).replace(/^\/+|\/+$/g, "");
    const opts = { method, headers: { "Content-Type": "application/json" } };
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
  return null;
}

async function savePlayerState(dbUrl, basePath, uid, pObj) {
  await fbRequest(dbUrl, `${basePath}/playersMap/${uid}`, "PUT", pObj);
}

async function saveBotConfig(dbUrl, basePath, cfg) {
  await fbRequest(dbUrl, `${basePath}/botConfig`, "PUT", cfg);
}

// ============================================================================
// 4. TELEGRAM API HELPERS
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

async function answerCb(token, cbId, text, showAlert = false) {
  if (!token || !cbId) return;
  return await tgPost(token, "answerCallbackQuery", {
    callback_query_id: String(cbId),
    text: text || "Done",
    show_alert: Boolean(showAlert)
  });
}

// ============================================================================
// 5. LIVE FORCE-JOIN CHANNEL VERIFIER
// ============================================================================
async function verifyForceJoinLive(token, b, uid) {
  if (isBotOwner(b, uid)) return true;
  const chs = Array.isArray(b.channels) ? b.channels : [];
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
        const ok =
          st === "creator" ||
          st === "administrator" ||
          st === "member" ||
          (st === "restricted" && res.result.is_member === true);
        if (!ok) missing.push(ch);
      }
    } catch (e) {}
  }

  if (missing.length > 0) {
    const ikb = missing.map((c, idx) => [
      { text: c.title || `📢 Join Channel #${idx + 1}`, url: c.link || "https://t.me/" }
    ]);
    ikb.push([{ text: "✅ Joined / Verify Now", callback_data: "VERIFY_FORCE_JOIN" }]);

    await sendBotMsg(
      token,
      uid,
      `⚠️ <b>MANDATORY CHANNEL JOIN REQUIRED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `To sell Gift Cards & withdraw balance, you must stay joined in all official channels below!\n\n` +
        `👇 <b>Join all channels & tap '✅ Joined / Verify Now':</b>`,
      { inline_keyboard: ikb }
    );
    return false;
  }
  return true;
}

// ============================================================================
// 6. KEYBOARD DECKS
// ============================================================================
function buildMainKeyboard(isOwner) {
  const rows = [
    [{ text: "💳 Sell Gift Card" }, { text: "💰 My Balance" }],
    [{ text: "💸 Withdraw" }, { text: "📊 Live Card Rates" }],
    [{ text: "📜 My Orders & History" }, { text: "🛡️ Verify Device" }],
    [{ text: "🎁 Daily Bonus" }, { text: "👥 Refer & Earn" }],
    [{ text: "🎟️ Redeem Code" }, { text: "🆘 Help / Support" }]
  ];
  if (isOwner) {
    rows.push([{ text: "👑 Admin Panel" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}

function buildSellCardsKeyboard(b) {
  const rates = getCardRates(b);
  return {
    keyboard: [
      [
        { text: `🎮 Google Play Store (${rates["Google Play Store"]}%)` },
        { text: `🛒 Amazon Pay (${rates["Amazon Pay"]}%)` }
      ],
      [
        { text: `🛍️ Flipkart (${rates["Flipkart"]}%)` },
        { text: `🍔 Zomato (${rates["Zomato"]}%)` }
      ],
      [
        { text: `🍕 Swiggy (${rates["Swiggy"]}%)` },
        { text: `👗 Myntra (${rates["Myntra"]}%)` }
      ],
      [
        { text: `🎬 BookMyShow (${rates["BookMyShow"]}%)` },
        { text: `🎮 Steam Wallet (${rates["Steam Wallet"]}%)` }
      ],
      [
        { text: `🔥 Free Fire / BGMI (${rates["Free Fire / BGMI"]}%)` },
        { text: `🎁 Other Gift Card (${rates["Other Gift Card"]}%)` }
      ],
      [{ text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function buildAdminKeyboard(b) {
  const vOn = b.deviceVerifyEnabled !== false;
  return {
    keyboard: [
      [{ text: "📊 Edit Card Rates (%)" }, { text: "📋 Pending Sell Orders" }],
      [{ text: "📢 Add Public Channel" }, { text: "🔒 Add Private Channel" }],
      [{ text: "🗑️ Remove Force Channel" }, { text: `🛡️ Device Verify: ${vOn ? "ON 🟢" : "OFF 🔴"}` }],
      [{ text: "📉 Set Min/Max Withdraw" }, { text: "💰 Add / Cut User ₹" }],
      [{ text: "🎁 Set Daily & Refer ₹" }, { text: "🎟️ Create Promo Code" }],
      [{ text: "🚫 Ban / Unban User" }, { text: "📢 Broadcast All" }],
      [{ text: "📈 Bot Statistics" }, { text: "🔙 Back to Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function buildCancelKeyboard() {
  return { keyboard: [[{ text: "❌ Cancel" }]], resize_keyboard: true };
}

// ============================================================================
// 7. PLAYER INITIALIZER
// ============================================================================
function getOrInitPlayer(players, b, uid, name, uname) {
  const sUid = String(uid);
  let p = players[sUid];
  if (!p) {
    p = {
      id: sUid,
      name: name || "User " + sUid,
      username: uname || "",
      balance: 0,
      totalSoldRs: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      cardsSoldCount: 0,
      referrals: 0,
      referredBy: "",
      refCredited: false,
      lastDaily: 0,
      verified: false,
      banned: false,
      deviceId: "",
      upiId: "",
      state: "IDLE",
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
// 8. MAIN VERCEL SERVERLESS HANDLER (api/bot2.js)
// ============================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const host = req.headers?.host || "kumartelegrambot.vercel.app";
  const pathOnly = (req.url || "/api/bot2").split("?")[0];
  const dynamicWebhookBase = `https://${host}${pathOnly}`;

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: dynamicWebhookBase,
      engine: "Kurmurya 24/7 Gift Card & Redeem Code Selling Bot (api/bot2.js)",
      status: "24/7_ONLINE"
    });
  }

  const botId = req.query?.botId ? String(req.query.botId).trim() : "";
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // --------------------------------------------------------------------------
  // A. MAKER BOT CONNECT / DELETE API
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
      const uname = meRes.result.username || "GiftCardBot";
      const bName = meRes.result.first_name || "Gift Card Sell Bot";

      const whUrl = `${dynamicWebhookBase}?botId=${encodeURIComponent(bId)}`;
      await tgPost(token, "setWebhook", { url: whUrl, drop_pending_updates: false });

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
        webhookUrl: whUrl,
        deviceVerifyEnabled: true,
        minWithdraw: 10,
        maxWithdraw: 10000,
        dailyBonus: 1,
        referBonus: 2,
        channels: (existing.botConfig && existing.botConfig.channels) || [],
        cardRates: (existing.botConfig && existing.botConfig.cardRates) || DEFAULT_CARD_RATES
      };

      const nodeToSave = {
        ...existing,
        botConfig: cfg,
        playersMap: existing.playersMap || {},
        sellOrders: existing.sellOrders || {},
        withdrawals: existing.withdrawals || {},
        giftCodes: existing.giftCodes || {}
      };

      await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);
      await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${bId}`, "PUT", nodeToSave);

      await sendBotMsg(
        token,
        owner,
        `💳 <b>YOUR 24/7 GIFT CARD SELLING BOT IS LIVE!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏷️ <b>Bot Name:</b> ${escHtml(bName)}\n` +
          `🤖 <b>Username:</b> @${escHtml(uname)}\n` +
          `👑 <b>Owner ID:</b> <code>${owner}</code>\n` +
          `🛡️ <b>Mini-App 1-Device Shield:</b> <code>ACTIVE ⚡</code>\n\n` +
          `👇 Send <b>/start</b> to open your <b>👑 Admin Panel</b>!`,
        buildMainKeyboard(true),
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

  if (!botId && body.action === "delete_bot" && body.botId) {
    const delId = String(body.botId);
    await fbRequest(PRIMARY_FIREBASE_URL, `kumar_cloud/bots/${delId}`, "DELETE");
    await fbRequest(MIRROR_FIREBASE_URL, `kumar_cloud/bots/${delId}`, "DELETE");
    return res.status(200).json({ success: true });
  }

  // --------------------------------------------------------------------------
  // B. 24/7 TELEGRAM WEBHOOK HANDLER
  // --------------------------------------------------------------------------
  const upd = body;
  if (!botId || (!upd.message && !upd.callback_query)) return res.status(200).send("OK");

  try {
    const cloudData = await loadBotNodeFromCloud(botId);
    if (!cloudData || !cloudData.node) return res.status(200).send("NO_BOT");

    const { dbUrl, basePath, node } = cloudData;
    const b = node.botConfig || node;
    const token = b.token;
    if (!token) return res.status(200).send("NO_TOKEN");
    const botUsername = String(b.username || "GiftCardBot").replace(/^@/, "");
    const ownerId = String(b.owner || b.adminId || MASTER_ADMIN);

    const incomingUpdateId = Number(upd.update_id || 0);
    if (incomingUpdateId > 0 && incomingUpdateId === Number(node.lastWebhookUpdateId || 0)) {
      return res.status(200).send("DUPLICATE_IGNORED");
    }
    if (incomingUpdateId > 0) {
      await fbRequest(dbUrl, `${basePath}/lastWebhookUpdateId`, "PUT", incomingUpdateId);
    }

    const players = node.playersMap || {};
    const sellOrders = node.sellOrders || {};
    const withdrawals = node.withdrawals || {};
    const giftCodes = node.giftCodes || {};

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
    const isBrandNew = !players[cUid];

    const p = getOrInitPlayer(players, b, cUid, cName, cUname);
    const mainKb = buildMainKeyboard(isOwner);

    if (p.banned && !isOwner) {
      if (isCb) await answerCb(token, upd.callback_query.id, "🚫 You are BANNED from this bot!", true);
      else await sendBotMsg(token, cUid, "🚫 <b>ACCESS DENIED: Your account is banned.</b>");
      return res.status(200).send("BANNED");
    }

    // ========================================================================
    // C. INLINE BUTTON CALLBACKS (APPROVE/REJECT CARDS, WITHDRAWALS, VERIFY)
    // ========================================================================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;
      const msgId = cbq.message ? cbq.message.message_id : null;

      if (data === "VERIFY_FORCE_JOIN") {
        const okJoin = await verifyForceJoinLive(token, b, cUid);
        if (okJoin) {
          await answerCb(token, cbId, "✅ Channel Join Verified!", true);
          await sendBotMsg(token, cUid, `✅ <b>Verified! Welcome, ${escHtml(cName)}!</b>`, mainKb, TG_EFFECTS.PARTY);
        } else {
          await answerCb(token, cbId, "❌ Please join all required channels first!", true);
        }
        return res.status(200).send("OK");
      }

      if (data === "VERIFY_CHECK_ME") {
        const vCheck = await checkUserDeviceVerification(cUid, botUsername);
        if (vCheck.banned) {
          p.banned = true;
          p.deviceId = vCheck.deviceId;
          await savePlayerState(dbUrl, basePath, cUid, p);
          await answerCb(token, cbId, "🚫 403 BANNED: Multiple accounts on same device!", true);
          await sendBotMsg(token, cUid, `🚫 <b>DIRECT BANNED (403)</b>\nReason: <code>${escHtml(vCheck.reason)}</code>`);
          return res.status(200).send("OK");
        }
        if (vCheck.allowed && vCheck.verified) {
          p.verified = true;
          p.banned = false;
          p.deviceId = vCheck.deviceId;
          await savePlayerState(dbUrl, basePath, cUid, p);
          await answerCb(token, cbId, `✅ Device Verified (${vCheck.deviceId})!`, true);
          await sendBotMsg(token, cUid, `✅ <b>DEVICE VERIFIED (200 OK)!</b>\n📱 Device ID: <code>${escHtml(vCheck.deviceId)}</code>`, mainKb, TG_EFFECTS.PARTY);
          return res.status(200).send("OK");
        }
        await answerCb(token, cbId, "❌ Not verified yet! Open Mini App first.", true);
        return res.status(200).send("OK");
      }

      // ---- OWNER APPROVE (REAL) OR REJECT (FAKE) GIFT CARD SELL ORDER ----
      if ((data.startsWith("SELL_REAL|") || data.startsWith("SELL_FAKE|")) && isOwner) {
        const isReal = data.startsWith("SELL_REAL|");
        const orderId = data.split("|")[1];
        const ord = sellOrders[orderId];

        if (!ord || ord.status !== "PENDING") {
          await answerCb(token, cbId, "⚠️ Order already processed!", true);
          return res.status(200).send("OK");
        }

        const sellerId = String(ord.userId);
        const sellerP = getOrInitPlayer(players, b, sellerId, ord.userName, ord.username);

        if (isReal) {
          ord.status = "APPROVED";
          const payout = numOrDef(ord.payoutAmount, 0);
          sellerP.balance = Number((sellerP.balance + payout).toFixed(2));
          sellerP.totalEarned = Number((numOrDef(sellerP.totalEarned, 0) + payout).toFixed(2));
          sellerP.totalSoldRs = Number((numOrDef(sellerP.totalSoldRs, 0) + numOrDef(ord.faceValue, 0)).toFixed(2));
          sellerP.cardsSoldCount = numOrDef(sellerP.cardsSoldCount, 0) + 1;
          addHistory(sellerP, `✅ Sold ${ord.cardType} (₹${fmtRs(ord.faceValue)}): +₹${fmtRs(payout)}`);

          await fbRequest(dbUrl, `${basePath}/sellOrders/${orderId}`, "PUT", ord);
          await savePlayerState(dbUrl, basePath, sellerId, sellerP);

          await answerCb(token, cbId, `✅ Approved! Credited +₹${fmtRs(payout)}`, true);
          await editBotMsg(
            token,
            cUid,
            msgId,
            `✅ <b>CARD APPROVED AS REAL (#${orderId})</b>\n` +
              `💳 <b>Card:</b> ${escHtml(ord.cardType)} (₹${fmtRs(ord.faceValue)})\n` +
              `👤 <b>Seller:</b> ${escHtml(ord.userName)} (<code>${sellerId}</code>)\n` +
              `💰 <b>Credited to Wallet:</b> <code>+₹${fmtRs(payout)}</code>`
          );

          await sendBotMsg(
            token,
            sellerId,
            `🎉 <b>GIFT CARD VERIFIED AS REAL & APPROVED!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🆔 <b>Order ID:</b> <code>${orderId}</code>\n` +
              `💳 <b>Card:</b> ${escHtml(ord.cardType)} (₹${fmtRs(ord.faceValue)})\n` +
              `💰 <b>Credited to Wallet:</b> <code>+₹${fmtRs(payout)}</code> ✅\n` +
              `🏦 <b>New Balance:</b> <code>₹${fmtRs(sellerP.balance)}</code>\n\n` +
              `👇 <i>Tap '💸 Withdraw' anytime to cash out to UPI!</i>`,
            mainKb,
            TG_EFFECTS.PARTY
          );
        } else {
          ord.status = "REJECTED_FAKE";
          addHistory(sellerP, `❌ Rejected ${ord.cardType} (#${orderId}): Fake / Already Used`);
          await fbRequest(dbUrl, `${basePath}/sellOrders/${orderId}`, "PUT", ord);
          await savePlayerState(dbUrl, basePath, sellerId, sellerP);

          await answerCb(token, cbId, "❌ Marked as FAKE / USED!", true);
          await editBotMsg(
            token,
            cUid,
            msgId,
            `❌ <b>CARD REJECTED AS FAKE / USED (#${orderId})</b>\n` +
              `💳 <b>Card:</b> ${escHtml(ord.cardType)} | 👤 <code>${sellerId}</code>`
          );

          await sendBotMsg(
            token,
            sellerId,
            `❌ <b>GIFT CARD REJECTED (FAKE / ALREADY USED)</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🆔 <b>Order ID:</b> <code>${orderId}</code>\n` +
              `💳 <b>Card:</b> ${escHtml(ord.cardType)} (₹${fmtRs(ord.faceValue)})\n` +
              `⚠️ <b>Reason:</b> Code was invalid, fake, or already redeemed.\n` +
              `<i>Repeated fake submissions may result in a permanent ban.</i>`,
            mainKb
          );
        }
        return res.status(200).send("OK");
      }

      // ---- OWNER APPROVE / REJECT UPI WITHDRAWAL ----
      if ((data.startsWith("WD_OK|") || data.startsWith("WD_NO|")) && isOwner) {
        const isOk = data.startsWith("WD_OK|");
        const wdId = data.split("|")[1];
        const wReq = withdrawals[wdId];

        if (!wReq || wReq.status !== "PENDING") {
          await answerCb(token, cbId, "⚠️ Already processed!", true);
          return res.status(200).send("OK");
        }

        const tUid = String(wReq.userId);
        const amt = numOrDef(wReq.amount, 0);
        const tp = getOrInitPlayer(players, b, tUid, wReq.userName, wReq.username);

        if (isOk) {
          wReq.status = "PAID";
          tp.totalWithdrawn = Number((numOrDef(tp.totalWithdrawn, 0) + amt).toFixed(2));
          addHistory(tp, `✅ UPI Withdraw Paid (#${wdId}): ₹${fmtRs(amt)}`);
          await fbRequest(dbUrl, `${basePath}/withdrawals/${wdId}`, "PUT", wReq);
          await savePlayerState(dbUrl, basePath, tUid, tp);

          await answerCb(token, cbId, "✅ Withdrawal Paid!", true);
          await editBotMsg(token, cUid, msgId, `✅ <b>UPI WITHDRAWAL PAID (#${wdId})</b>\n👤 <code>${tUid}</code> | ₹${fmtRs(amt)} ➔ <code>${escHtml(wReq.upiId)}</code>`);
          await sendBotMsg(token, tUid, `🎉 <b>WITHDRAWAL PAID!</b>\n🆔 <code>${wdId}</code>\n💰 Amount: <code>₹${fmtRs(amt)}</code>\n🏦 UPI: <code>${escHtml(wReq.upiId)}</code>`, mainKb, TG_EFFECTS.PARTY);
        } else {
          wReq.status = "REJECTED";
          tp.balance = Number((tp.balance + amt).toFixed(2));
          addHistory(tp, `🔄 Withdraw Refunded (#${wdId}): +₹${fmtRs(amt)}`);
          await fbRequest(dbUrl, `${basePath}/withdrawals/${wdId}`, "PUT", wReq);
          await savePlayerState(dbUrl, basePath, tUid, tp);

          await answerCb(token, cbId, "❌ Rejected & Refunded!", true);
          await editBotMsg(token, cUid, msgId, `❌ <b>WITHDRAWAL REJECTED & REFUNDED (#${wdId})</b>\n👤 <code>${tUid}</code> (+₹${fmtRs(amt)})`);
          await sendBotMsg(token, tUid, `❌ <b>WITHDRAWAL REJECTED & REFUNDED</b>\n🔄 Refunded: <code>+₹${fmtRs(amt)}</code>\n💰 Balance: <code>₹${fmtRs(tp.balance)}</code>`, mainKb);
        }
        return res.status(200).send("OK");
      }

      if (data.startsWith("REPLY_USR|") && isOwner) {
        p.tempSupportUid = data.split("|")[1];
        p.state = "ADM_REPLY_SUPPORT";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await answerCb(token, cbId, "Type your reply now", false);
        await sendBotMsg(token, cUid, `↩️ <b>Type your reply for User <code>${p.tempSupportUid}</code>:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (data === "SET_UPI_NOW") {
        p.state = "WAIT_USER_UPI";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await answerCb(token, cbId, "Send UPI ID", false);
        await sendBotMsg(token, cUid, `🏦 <b>Send your valid UPI ID (e.g. <code>name@ybl</code>):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      await answerCb(token, cbId, "Done", false);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // D. HANDLE TEXT MESSAGES
    // ========================================================================
    const text = String(upd.message.text || "").trim();

    if (isBrandNew && text.startsWith("/start ")) {
      const parts = text.split(/\s+/);
      if (parts.length > 1 && parts[1].toUpperCase().startsWith("REF_")) {
        const invId = parts[1].substring(4).trim();
        if (invId && invId !== cUid) p.referredBy = invId;
      }
    }

    // Live Force-Join Check
    const joinedOk = await verifyForceJoinLive(token, b, cUid);
    if (!joinedOk) {
      await savePlayerState(dbUrl, basePath, cUid, p);
      return res.status(200).send("FORCE_JOIN");
    }

    // Credit Referral after Force-Join verified
    if (p.referredBy && !p.refCredited) {
      p.refCredited = true;
      const invId = String(p.referredBy);
      const refBon = numOrDef(b.referBonus, 2);
      if (players[invId]) {
        const invP = getOrInitPlayer(players, b, invId, "Inviter", "");
        invP.balance = Number((invP.balance + refBon).toFixed(2));
        invP.referrals = numOrDef(invP.referrals, 0) + 1;
        addHistory(invP, `👥 Referral Bonus (${cName}): +₹${fmtRs(refBon)}`);
        await savePlayerState(dbUrl, basePath, invId, invP);
        await sendBotMsg(token, invId, `🎉 <b>New Referral Verified!</b>\n👤 ${escHtml(cName)}\n💰 Bonus: <code>+₹${fmtRs(refBon)}</code>`);
      }
    }

    if (text.toLowerCase() === "❌ cancel" || text.toLowerCase() === "/cancel") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, "❌ <b>Operation Cancelled.</b>", mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🔙 Back to Main Menu" || text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        cUid,
        `💳 <b>WELCOME TO @${escHtml(botUsername.toUpperCase())} — GIFT CARD EXCHANGE!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
          `💰 <b>Wallet Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
          `🛡️ <b>Device Status:</b> ${p.verified ? `✅ <b>VERIFIED (${escHtml(p.deviceId)})</b>` : "⏳ <b>Tap Verify Device</b>"}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔥 <b>Sell Play Store, Amazon, Flipkart, Zomato, Swiggy & more Gift Cards for instant UPI Cash!</b>\n\n` +
          `👇 <b>Select an option below:</b>`,
        mainKb,
        TG_EFFECTS.PARTY
      );
      return res.status(200).send("OK");
    }

    // ---- USER MENU BUTTONS ----
    if (text === "💳 Sell Gift Card") {
      if (b.deviceVerifyEnabled !== false && !isOwner && !p.verified) {
        const vCheck = await checkUserDeviceVerification(cUid, botUsername);
        if (vCheck.banned) {
          p.banned = true;
          await savePlayerState(dbUrl, basePath, cUid, p);
          await sendBotMsg(token, cUid, `🚫 <b>403 BANNED: Multiple accounts detected on this device!</b>`);
          return res.status(200).send("OK");
        }
        if (!vCheck.verified) {
          await sendBotMsg(
            token,
            cUid,
            `🛡️ <b>DEVICE VERIFICATION REQUIRED BEFORE SELLING!</b>\nVerify your device inside the private Mini App below first:`,
            buildPrivateMiniAppVerifyKeyboard(cUid, botUsername)
          );
          return res.status(200).send("OK");
        }
        p.verified = true;
        p.deviceId = vCheck.deviceId;
      }

      p.state = "WAIT_SELL_CARD_TYPE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        cUid,
        `💳 <b>SELL GIFT CARD / REDEEM CODE (STEP 1 OF 3)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👇 <b>Select which Gift Card you want to sell below:</b>`,
        buildSellCardsKeyboard(b)
      );
      return res.status(200).send("OK");
    }

    if (text === "📊 Live Card Rates") {
      const rates = getCardRates(b);
      let sb = `📊 <b>LIVE GIFT CARD BUYING RATES</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      for (const [card, pct] of Object.entries(rates)) {
        sb += `• <b>${escHtml(card)}:</b> <code>${pct}%</code> (₹100 ➔ <b>₹${pct}</b>)\n`;
      }
      sb += `\n👇 <i>Tap '💳 Sell Gift Card' to sell now!</i>`;
      await sendBotMsg(token, cUid, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "💰 My Balance") {
      await sendBotMsg(
        token,
        cUid,
        `💰 <b>MY WALLET & ACCOUNT</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>Name:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
          `💵 <b>Available Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
          `💳 <b>Cards Sold:</b> <code>${numOrDef(p.cardsSoldCount, 0)}</code> (Total Value: ₹${fmtRs(p.totalSoldRs)})\n` +
          `📤 <b>Total Withdrawn:</b> <code>₹${fmtRs(p.totalWithdrawn)}</code>\n` +
          `🏦 <b>Saved UPI ID:</b> <code>${escHtml(p.upiId || "Not Set")}</code>`,
        {
          inline_keyboard: [[{ text: "🏦 Set / Change UPI ID", callback_data: "SET_UPI_NOW" }]]
        }
      );
      return res.status(200).send("OK");
    }

    if (text === "💸 Withdraw") {
      if (!p.upiId) {
        p.state = "WAIT_USER_UPI";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `🏦 <b>LINK YOUR UPI ID FIRST</b>\n👇 <b>Send your valid UPI ID (e.g. <code>name@ybl</code>):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }
      p.state = "WAIT_WD_AMT";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(
        token,
        cUid,
        `💸 <b>WITHDRAW TO UPI (<code>${escHtml(p.upiId)}</code>)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 <b>Your Balance:</b> <code>₹${fmtRs(p.balance)}</code>\n` +
          `📉 <b>Min:</b> <code>₹${fmtRs(numOrDef(b.minWithdraw, 10))}</code> | 📈 <b>Max:</b> <code>₹${fmtRs(numOrDef(b.maxWithdraw, 10000))}</code>\n\n` +
          `👇 <b>Enter the ₹ amount you want to withdraw:</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (text === "🛡️ Verify Device") {
      await sendBotMsg(
        token,
        cUid,
        `🛡️ <b>1-USER 1-DEVICE MINI-APP VERIFICATION</b>\nTap below to verify your device securely inside the Mini App:`,
        buildPrivateMiniAppVerifyKeyboard(cUid, botUsername)
      );
      return res.status(200).send("OK");
    }

    if (text === "📜 My Orders & History") {
      const h = Array.isArray(p.history) ? p.history : [];
      let sb = `📜 <b>MY ORDERS & WALLET HISTORY</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (h.length === 0) sb += `<i>No records yet.</i>`;
      else h.slice(0, 15).forEach((line) => { sb += `• ${escHtml(line)}\n`; });
      await sendBotMsg(token, cUid, sb, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "🎁 Daily Bonus") {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      if (now - numOrDef(p.lastDaily, 0) < dayMs) {
        await sendBotMsg(token, cUid, `⏳ <b>Daily Bonus already claimed today! Come back tomorrow.</b>`, mainKb);
        return res.status(200).send("OK");
      }
      const dBon = numOrDef(b.dailyBonus, 1);
      p.lastDaily = now;
      p.balance = Number((p.balance + dBon).toFixed(2));
      addHistory(p, `🎁 Daily Bonus: +₹${fmtRs(dBon)}`);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, `🎁 <b>Daily Bonus Claimed: +₹${fmtRs(dBon)}!</b>\n💰 Balance: <code>₹${fmtRs(p.balance)}</code>`, mainKb, TG_EFFECTS.PARTY);
      return res.status(200).send("OK");
    }

    if (text === "👥 Refer & Earn") {
      const link = `https://t.me/${botUsername}?start=REF_${cUid}`;
      await sendBotMsg(
        token,
        cUid,
        `👥 <b>REFER & EARN</b>\n━━━━━━━━━━━━━━━━━━━━\n🔗 <b>Your Link:</b>\n<code>${link}</code>\n\n🎁 <b>Per Referral:</b> <code>₹${fmtRs(numOrDef(b.referBonus, 2))}</code>\n👥 <b>Total Referrals:</b> <code>${numOrDef(p.referrals, 0)}</code>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    if (text === "🎟️ Redeem Code") {
      p.state = "WAIT_PROMO_CODE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, `🎟️ <b>Send your Promo / Gift Code below:</b>`, buildCancelKeyboard());
      return res.status(200).send("OK");
    }

    if (text === "🆘 Help / Support") {
      p.state = "WAIT_SUPPORT_MSG";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, `🆘 <b>HELP & SUPPORT</b>\n👇 <b>Type your message below and Admin will reply directly:</b>`, buildCancelKeyboard());
      return res.status(200).send("OK");
    }

    // ---- OWNER ADMIN PANEL BUTTONS ----
    if (isOwner) {
      if (text === "👑 Admin Panel" || text === "/admin") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const pendSells = Object.values(sellOrders).filter((o) => o && o.status === "PENDING").length;
        await sendBotMsg(
          token,
          cUid,
          `👑 <b>GIFT CARD BOT ADMIN PANEL</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 <b>Users:</b> <code>${Object.keys(players).length}</code>\n` +
            `⏳ <b>Pending Card Checks:</b> <code>${pendSells}</code>\n` +
            `📢 <b>Force Channels:</b> <code>${(b.channels || []).length}</code>`,
          buildAdminKeyboard(b),
          TG_EFFECTS.FIRE
        );
        return res.status(200).send("OK");
      }

      if (text === "📊 Edit Card Rates (%)") {
        p.state = "ADM_EDIT_RATE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const rates = getCardRates(b);
        let rTxt = `📊 <b>EDIT CARD PAYOUT RATE (%)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        Object.keys(rates).forEach((k, i) => { rTxt += `${i + 1}. <b>${k}</b>: <code>${rates[k]}%</code>\n`; });
        rTxt += `\n👇 <b>Send <code>CARD_NUMBER NEW_PERCENT</code> (e.g. <code>1 90</code> for Google Play 90%):</b>`;
        await sendBotMsg(token, cUid, rTxt, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "📋 Pending Sell Orders") {
        const pend = Object.values(sellOrders).filter((o) => o && o.status === "PENDING");
        if (pend.length === 0) {
          await sendBotMsg(token, cUid, `✅ <b>No pending Gift Card submissions!</b>`, buildAdminKeyboard(b));
          return res.status(200).send("OK");
        }
        for (const o of pend.slice(0, 5)) {
          await sendBotMsg(
            token,
            cUid,
            `💳 <b>PENDING CARD (#${o.id})</b>\nCard: <b>${escHtml(o.cardType)}</b>\nValue: <code>₹${fmtRs(o.faceValue)}</code> ➔ Payout: <code>₹${fmtRs(o.payoutAmount)}</code>\n🔑 Code: <code>${escHtml(o.redeemCode)}</code>\n👤 Seller: ${escHtml(o.userName)} (<code>${o.userId}</code>)`,
            {
              inline_keyboard: [
                [
                  { text: `✅ Real (+₹${fmtRs(o.payoutAmount)})`, callback_data: `SELL_REAL|${o.id}` },
                  { text: "❌ Fake / Used", callback_data: `SELL_FAKE|${o.id}` }
                ]
              ]
            }
          );
        }
        return res.status(200).send("OK");
      }

      if (text === "📢 Add Public Channel") {
        p.state = "ADM_ADD_PUB_CH";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `📢 <b>Send Public Channel <code>@username</code> (Bot must be Admin):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🔒 Add Private Channel") {
        p.state = "ADM_ADD_PRIV_CH";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `🔒 <b>Send <code>-100CHAT_ID https://t.me/+INVITE_LINK</code>:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🗑️ Remove Force Channel") {
        b.channels = [];
        await saveBotConfig(dbUrl, basePath, b);
        await sendBotMsg(token, cUid, `🗑️ <b>All Force-Join Channels Cleared!</b>`, buildAdminKeyboard(b));
        return res.status(200).send("OK");
      }

      if (text.startsWith("🛡️ Device Verify:")) {
        b.deviceVerifyEnabled = b.deviceVerifyEnabled === false ? true : false;
        await saveBotConfig(dbUrl, basePath, b);
        await sendBotMsg(token, cUid, `🛡️ <b>Device Verification is now:</b> ${b.deviceVerifyEnabled ? "🟢 ON" : "🔴 OFF"}`, buildAdminKeyboard(b));
        return res.status(200).send("OK");
      }

      if (text === "📉 Set Min/Max Withdraw") {
        p.state = "ADM_SET_WD";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `📉 <b>Send <code>MIN MAX</code> (e.g. <code>10 5000</code>):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "💰 Add / Cut User ₹") {
        p.state = "ADM_MOD_BAL";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `💰 <b>Send <code>USER_ID AMOUNT</code> (e.g. <code>7335163273 50</code>):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🎁 Set Daily & Refer ₹") {
        p.state = "ADM_SET_BON";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `🎁 <b>Send <code>DAILY_RS REFER_RS</code> (e.g. <code>1 2</code>):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🎟️ Create Promo Code") {
        p.state = "ADM_MAKE_PROMO";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `🎟️ <b>Send <code>CODE AMOUNT_RS MAX_USES</code> (e.g. <code>BONUS10 10 20</code>):</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "🚫 Ban / Unban User") {
        p.state = "ADM_BAN";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `🚫 <b>Send Target User ID to Ban/Unban:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "📢 Broadcast All") {
        p.state = "ADM_BCAST";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `📢 <b>Send Broadcast Message:</b>`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }

      if (text === "📈 Bot Statistics") {
        await sendBotMsg(
          token,
          cUid,
          `📈 <b>BOT STATISTICS</b>\n👥 Users: <code>${Object.keys(players).length}</code>\n💳 Total Sell Orders: <code>${Object.keys(sellOrders).length}</code>\n💸 Total Withdrawals: <code>${Object.keys(withdrawals).length}</code>`,
          buildAdminKeyboard(b)
        );
        return res.status(200).send("OK");
      }
    }

    // ========================================================================
    // E. MULTI-STEP WORKFLOWS (SELL GIFT CARD, WITHDRAW, SUPPORT & ADMIN)
    // ========================================================================
    const st = String(p.state || "IDLE").toUpperCase();

    // ---- SELL GIFT CARD FLOW (3 STEPS: CARD TYPE -> VALUE ₹ -> REDEEM CODE) ----
    if (st === "WAIT_SELL_CARD_TYPE") {
      const rates = getCardRates(b);
      let matchedCard = "";
      for (const cardName of Object.keys(rates)) {
        if (text.toLowerCase().includes(cardName.toLowerCase())) {
          matchedCard = cardName;
          break;
        }
      }
      if (!matchedCard) {
        await sendBotMsg(token, cUid, `⚠️ Please select a Gift Card from the buttons below:`, buildSellCardsKeyboard(b));
        return res.status(200).send("OK");
      }

      p.tempSellCard = matchedCard;
      p.tempSellRate = rates[matchedCard];
      p.state = "WAIT_SELL_VALUE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `💰 <b>STEP 2 OF 3: ENTER CARD VALUE (₹)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 <b>Selected Card:</b> ${escHtml(matchedCard)}\n` +
          `📊 <b>Live Buying Rate:</b> <code>${rates[matchedCard]}%</code>\n\n` +
          `👇 <b>Send the Gift Card Amount in ₹ (e.g. <code>100</code>, <code>500</code>):</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_SELL_VALUE") {
      const val = parseFloat(text);
      if (isNaN(val) || val < 10) {
        await sendBotMsg(token, cUid, `⚠️ Enter a valid card amount (Min ₹10):`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }
      const payout = calcPayoutAmount(val, p.tempSellRate || 80);
      p.tempSellValue = val;
      p.tempSellPayout = payout;
      p.state = "WAIT_SELL_CODE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        cUid,
        `🔑 <b>STEP 3 OF 3: SEND REDEEM CODE</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 <b>Card:</b> ${escHtml(p.tempSellCard)}\n` +
          `🏷️ <b>Face Value:</b> <code>₹${fmtRs(val)}</code>\n` +
          `💰 <b>You Will Receive:</b> <code>₹${fmtRs(payout)}</code> (${p.tempSellRate}%)\n\n` +
          `👇 <b>Paste your exact Redeem Code / Gift Voucher Code below:</b>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_SELL_CODE") {
      if (text.length < 6) {
        await sendBotMsg(token, cUid, `⚠️ Code looks too short! Paste your exact Redeem Code:`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }
      const orderId = "SELL-" + Math.floor(100000 + Math.random() * 900000);
      const ordObj = {
        id: orderId,
        userId: cUid,
        userName: cName,
        username: cUname,
        cardType: p.tempSellCard || "Gift Card",
        faceValue: numOrDef(p.tempSellValue, 10),
        ratePct: numOrDef(p.tempSellRate, 80),
        payoutAmount: numOrDef(p.tempSellPayout, 8),
        redeemCode: text.trim(),
        status: "PENDING",
        createdAt: formatIstShortTime(Date.now())
      };

      p.state = "IDLE";
      addHistory(p, `⏳ Submitted ${ordObj.cardType} (₹${fmtRs(ordObj.faceValue)}) [#${orderId}]`);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await fbRequest(dbUrl, `${basePath}/sellOrders/${orderId}`, "PUT", ordObj);

      await sendBotMsg(
        token,
        cUid,
        `✅ <b>GIFT CARD SUBMITTED FOR VERIFICATION!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 <b>Order ID:</b> <code>${orderId}</code>\n` +
          `💳 <b>Card:</b> ${escHtml(ordObj.cardType)} (₹${fmtRs(ordObj.faceValue)})\n` +
          `💰 <b>Expected Payout:</b> <code>₹${fmtRs(ordObj.payoutAmount)}</code>\n\n` +
          `⏳ <i>Owner is checking if the code is Real or Fake. Once approved, ₹${fmtRs(ordObj.payoutAmount)} will be credited to your Wallet instantly!</i>`,
        mainKb
      );

      // Alert Owner with Real/Fake Approve & Reject Buttons!
      await sendBotMsg(
        token,
        ownerId,
        `🔔 <b>NEW GIFT CARD SELL SUBMISSION!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 <b>Order ID:</b> <code>${orderId}</code>\n` +
          `👤 <b>Seller:</b> ${escHtml(cName)} (${cUname ? "@" + escHtml(cUname) : "None"} | <code>${cUid}</code>)\n` +
          `💳 <b>Card Type:</b> <b>${escHtml(ordObj.cardType)}</b>\n` +
          `🏷️ <b>Face Value:</b> <code>₹${fmtRs(ordObj.faceValue)}</code> (${ordObj.ratePct}%)\n` +
          `💰 <b>Payout to Credit:</b> <code>₹${fmtRs(ordObj.payoutAmount)}</code>\n` +
          `🔑 <b>Redeem Code:</b> <code>${escHtml(ordObj.redeemCode)}</code>\n\n` +
          `👇 <b>Check if Real or Fake & tap below:</b>`,
        {
          inline_keyboard: [
            [
              { text: `✅ Real — Credit +₹${fmtRs(ordObj.payoutAmount)}`, callback_data: `SELL_REAL|${orderId}` },
              { text: "❌ Fake / Used", callback_data: `SELL_FAKE|${orderId}` }
            ]
          ]
        },
        TG_EFFECTS.FIRE
      );
      return res.status(200).send("OK");
    }

    // ---- USER UPI & WITHDRAWAL ----
    if (st === "WAIT_USER_UPI") {
      if (!text.includes("@")) {
        await sendBotMsg(token, cUid, `⚠️ Invalid UPI ID! Example: <code>name@ybl</code>:`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }
      p.upiId = text.trim();
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, `✅ <b>UPI ID Saved:</b> <code>${escHtml(p.upiId)}</code>\nTap <b>💸 Withdraw</b> to cash out!`, mainKb);
      return res.status(200).send("OK");
    }

    if (st === "WAIT_WD_AMT") {
      const amt = parseFloat(text);
      const minW = numOrDef(b.minWithdraw, 10);
      const maxW = numOrDef(b.maxWithdraw, 10000);
      if (isNaN(amt) || amt < minW || amt > maxW || amt > p.balance) {
        await sendBotMsg(token, cUid, `❌ Invalid amount or insufficient balance! (Min ₹${fmtRs(minW)} | Balance ₹${fmtRs(p.balance)})`, buildCancelKeyboard());
        return res.status(200).send("OK");
      }
      p.balance = Number((p.balance - amt).toFixed(2));
      p.state = "IDLE";
      const wdId = "WD-" + Math.floor(100000 + Math.random() * 900000);
      const wObj = {
        id: wdId,
        userId: cUid,
        userName: cName,
        username: cUname,
        upiId: p.upiId,
        amount: amt,
        status: "PENDING",
        createdAt: formatIstShortTime(Date.now())
      };
      addHistory(p, `⏳ UPI Withdraw (#${wdId}): -₹${fmtRs(amt)}`);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await fbRequest(dbUrl, `${basePath}/withdrawals/${wdId}`, "PUT", wObj);

      await sendBotMsg(token, cUid, `✅ <b>WITHDRAWAL REQUEST SUBMITTED (#${wdId})!</b>\n💰 Amount: <code>₹${fmtRs(amt)}</code>\n🏦 UPI: <code>${escHtml(p.upiId)}</code>`, mainKb);
      await sendBotMsg(
        token,
        ownerId,
        `💸 <b>NEW UPI WITHDRAWAL REQUEST</b>\n🆔 <code>${wdId}</code>\n👤 ${escHtml(cName)} (<code>${cUid}</code>)\n💰 Amount: <code>₹${fmtRs(amt)}</code>\n🏦 UPI: <code>${escHtml(p.upiId)}</code>`,
        {
          inline_keyboard: [
            [
              { text: `✅ Approve Paid (₹${fmtRs(amt)})`, callback_data: `WD_OK|${wdId}` },
              { text: "❌ Reject & Refund", callback_data: `WD_NO|${wdId}` }
            ]
          ]
        },
        TG_EFFECTS.FIRE
      );
      return res.status(200).send("OK");
    }

    if (st === "WAIT_PROMO_CODE") {
      const code = text.toUpperCase();
      p.state = "IDLE";
      const g = giftCodes[code];
      if (!g || (Array.isArray(g.used) && g.used.length >= numOrDef(g.max, 1))) {
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `❌ <b>Invalid or Expired Promo Code!</b>`, mainKb);
        return res.status(200).send("OK");
      }
      if (!Array.isArray(g.used)) g.used = [];
      if (g.used.map(String).includes(cUid)) {
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `⚠️ <b>Already claimed!</b>`, mainKb);
        return res.status(200).send("OK");
      }
      g.used.push(cUid);
      const amt = numOrDef(g.amount, 1);
      p.balance = Number((p.balance + amt).toFixed(2));
      addHistory(p, `🎟️ Promo (${code}): +₹${fmtRs(amt)}`);
      await fbRequest(dbUrl, `${basePath}/giftCodes/${code}`, "PUT", g);
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, `🎉 <b>Promo Redeemed: +₹${fmtRs(amt)}!</b>`, mainKb, TG_EFFECTS.PARTY);
      return res.status(200).send("OK");
    }

    if (st === "WAIT_SUPPORT_MSG") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, cUid, `✅ <b>Message sent to Admin!</b>`, mainKb);
      await sendBotMsg(
        token,
        ownerId,
        `🆘 <b>SUPPORT MESSAGE</b>\n👤 ${escHtml(cName)} (${cUname ? "@" + escHtml(cUname) : "None"} | <code>${cUid}</code>)\n💬 ${escHtml(text)}`,
        { inline_keyboard: [[{ text: `↩️ Reply to ${cName}`, callback_data: `REPLY_USR|${cUid}` }]] }
      );
      return res.status(200).send("OK");
    }

    // ---- OWNER ADMIN MULTI-STEP HANDLERS ----
    if (isOwner) {
      if (st === "ADM_REPLY_SUPPORT") {
        const target = p.tempSupportUid || "";
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (target) {
          await sendBotMsg(token, target, `👨‍💻 <b>ADMIN SUPPORT REPLY:</b>\n\n${escHtml(text)}`);
          await sendBotMsg(token, cUid, `✅ <b>Reply sent to <code>${target}</code>!</b>`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_EDIT_RATE") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const pts = text.split(/\s+/);
        const rates = getCardRates(b);
        const keys = Object.keys(rates);
        const idx = parseInt(pts[0], 10) - 1;
        const newPct = parseFloat(pts[1]);
        if (idx >= 0 && idx < keys.length && !isNaN(newPct) && newPct > 0 && newPct <= 100) {
          rates[keys[idx]] = newPct;
          b.cardRates = rates;
          await saveBotConfig(dbUrl, basePath, b);
          await sendBotMsg(token, cUid, `✅ Updated <b>${keys[idx]}</b> rate to <code>${newPct}%</code>!`, buildAdminKeyboard(b));
        } else {
          await sendBotMsg(token, cUid, `⚠️ Invalid format! Example: <code>1 90</code>`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_ADD_PUB_CH") {
        let ch = text.trim();
        if (!ch.startsWith("@")) ch = "@" + ch.replace("https://t.me/", "").replace("/", "");
        if (!Array.isArray(b.channels)) b.channels = [];
        b.channels.push({ chatId: ch, link: "https://t.me/" + ch.replace("@", ""), title: "📢 Join " + ch });
        p.state = "IDLE";
        await saveBotConfig(dbUrl, basePath, b);
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(token, cUid, `✅ <b>Public Channel Added:</b> <code>${escHtml(ch)}</code>`, buildAdminKeyboard(b));
        return res.status(200).send("OK");
      }

      if (st === "ADM_ADD_PRIV_CH") {
        const pts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (pts.length >= 2) {
          if (!Array.isArray(b.channels)) b.channels = [];
          b.channels.push({ chatId: pts[0], link: pts[1], title: "🔒 Join Private Channel" });
          await saveBotConfig(dbUrl, basePath, b);
          await sendBotMsg(token, cUid, `✅ <b>Private Channel Added!</b>`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_WD") {
        const pts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (pts.length >= 2) {
          b.minWithdraw = Math.max(1, parseFloat(pts[0]) || 10);
          b.maxWithdraw = Math.max(b.minWithdraw, parseFloat(pts[1]) || 10000);
          await saveBotConfig(dbUrl, basePath, b);
          await sendBotMsg(token, cUid, `✅ <b>Withdraw Limits:</b> ₹${fmtRs(b.minWithdraw)} – ₹${fmtRs(b.maxWithdraw)}`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_MOD_BAL") {
        const pts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (pts.length >= 2) {
          const tId = pts[0].replace(/\D/g, "");
          const d = parseFloat(pts[1]) || 0;
          const tp = getOrInitPlayer(players, b, tId, "User " + tId, "");
          tp.balance = Math.max(0, Number((tp.balance + d).toFixed(2)));
          await savePlayerState(dbUrl, basePath, tId, tp);
          await sendBotMsg(token, cUid, `✅ Updated <code>${tId}</code> balance to <code>₹${fmtRs(tp.balance)}</code>`, buildAdminKeyboard(b));
          await sendBotMsg(token, tId, `💰 <b>Admin Updated Your Wallet!</b>\nNew Balance: <code>₹${fmtRs(tp.balance)}</code>`);
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_SET_BON") {
        const pts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (pts.length >= 2) {
          b.dailyBonus = Math.max(0, parseFloat(pts[0]) || 1);
          b.referBonus = Math.max(0, parseFloat(pts[1]) || 2);
          await saveBotConfig(dbUrl, basePath, b);
          await sendBotMsg(token, cUid, `✅ Daily: ₹${fmtRs(b.dailyBonus)} | Refer: ₹${fmtRs(b.referBonus)}`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_MAKE_PROMO") {
        const pts = text.split(/\s+/);
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (pts.length >= 3) {
          const code = pts[0].toUpperCase();
          await fbRequest(dbUrl, `${basePath}/giftCodes/${code}`, "PUT", {
            code,
            amount: parseFloat(pts[1]) || 5,
            max: parseInt(pts[2], 10) || 10,
            used: []
          });
          await sendBotMsg(token, cUid, `🎟️ <b>Promo Code Created:</b> <code>${code}</code>`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_BAN") {
        const tId = text.replace(/\D/g, "");
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        if (tId) {
          const tp = getOrInitPlayer(players, b, tId, "User " + tId, "");
          tp.banned = !tp.banned;
          await savePlayerState(dbUrl, basePath, tId, tp);
          await sendBotMsg(token, cUid, `✅ User <code>${tId}</code> is now <b>${tp.banned ? "🚫 BANNED" : "🟢 UNBANNED"}</b>`, buildAdminKeyboard(b));
        }
        return res.status(200).send("OK");
      }

      if (st === "ADM_BCAST") {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        const ids = Object.keys(players);
        for (const uId of ids) {
          await sendBotMsg(token, uId, `📢 <b>ANNOUNCEMENT</b>\n━━━━━━━━━━━━━━━━━━━━\n${text}`);
        }
        await sendBotMsg(token, cUid, `✅ <b>Broadcast sent to ${ids.length} users!</b>`, buildAdminKeyboard(b));
        return res.status(200).send("OK");
      }
    }

    await sendBotMsg(token, cUid, `⚡ <b>Select an option from the menu below or send /start:</b>`, mainKb);
  } catch (err) {}

  return res.status(200).send("OK");
}
