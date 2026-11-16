// ============================================================================
// 👑 FILE: api/bot1.js — 24/7 TELEGRAM DICE GIVEAWAY CLOUD ENGINE 👑
// Endpoint: https://kumartelegrambot.vercel.app/api/bot1
// Features (100% Complete - No SMM Panel):
// - Any User Can Create a Dice Giveaway (In Bot, Group, or Channel)
// - Reaction Target Gate (e.g. 10 Reactions with Live Progress Bar 7/10) OR Skip
// - Supports BOTH Native Telegram Reactions (❤️ 👍 🔥) & Inline Reaction Buttons
// - Custom Start Time in IST (e.g. "8.10 pm", "8:10 PM") OR Instant Start
// - Strict Rule: Even after 8.10 PM, Number Selection & Dice Roll will NOT start
//   until the required Reaction Target is 100% completed!
// - Smart Multi-Dice Logic:
//   * Max 6  -> 1 Real Telegram Dice Roll (🎲)
//   * Max 12 -> 2 Real Telegram Dice Rolls (🎲 + 🎲)
//   * Max 18 -> 3 Real Telegram Dice Rolls (🎲 + 🎲 + 🎲)
//   * Max N  -> Math.ceil(N / 6) Real Telegram Dice Rolls!
// - Final Result displays Winner(s) + Full Participant List with:
//   Name, @Username, User ID, and Selected Lucky Number!
// ============================================================================

const PRIMARY_FIREBASE_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const MIRROR_FIREBASE_URL = "https://kurmuryatelegrambot-default-rtdb.firebaseio.com";
const MASTER_ADMIN = "7335163273";

// ============================================================================
// 1. UTILITIES, HTML ESCAPING & IST TIME PARSER (e.g. "8.10 pm")
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

/**
 * Returns current Date object shifted to Indian Standard Time (IST: UTC + 5:30)
 */
function getIstNowDate() {
  const nowUtc = Date.now();
  return new Date(nowUtc + 5.5 * 60 * 60 * 1000);
}

/**
 * Formats an epoch timestamp (ms) into readable IST time string (e.g. "08:10 PM IST")
 */
function formatIstTime(epochMs) {
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
 * Parses user time input like "8.10 pm", "8:10 PM", "20:10", "9 pm", or "NOW"
 * into an exact UTC epoch timestamp (ms) corresponding to that IST time.
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

  // Match patterns like "8.10 pm", "8:10pm", "20.10", "8 pm"
  const m = str.match(/^(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?$/i);
  if (!m) {
    return { ok: false, error: "Invalid time format! Example: 8.10 pm or 9:30 pm" };
  }

  let hours = parseInt(m[1], 10);
  const minutes = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  const mer = m[3] ? m[3].toLowerCase() : "";

  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) {
    return { ok: false, error: "Invalid hours or minutes! Example: 8.10 pm" };
  }

  if (mer === "pm" && hours < 12) hours += 12;
  if (mer === "am" && hours === 12) hours = 0;

  const istNow = getIstNowDate();
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();

  // Construct target time in IST, then subtract 5.5 hours to get true UTC epoch ms
  const targetIstAsUtc = Date.UTC(year, month, day, hours, minutes, 0, 0);
  let targetEpochMs = targetIstAsUtc - 5.5 * 60 * 60 * 1000;

  // If the time is more than 10 minutes in the past today, schedule for tomorrow
  if (targetEpochMs < Date.now() - 10 * 60 * 1000) {
    targetEpochMs += 24 * 60 * 60 * 1000;
  }

  return {
    ok: true,
    epochMs: targetEpochMs,
    label: formatIstTime(targetEpochMs)
  };
}

/**
 * Builds visual green/white progress bar matching screenshot 40911.png
 */
function buildReactionProgressBar(current, target) {
  if (!target || target <= 0) return "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢";
  const totalSlots = 10;
  const filled = Math.min(totalSlots, Math.max(0, Math.round((current / target) * totalSlots)));
  const empty = totalSlots - filled;
  return "🟢".repeat(filled) + "⚪".repeat(empty);
}

// ============================================================================
// 2. FIREBASE REALTIME DATABASE HELPERS
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

async function saveBotConfig(dbUrl, basePath, botConfigObj) {
  await fbRequest(dbUrl, `${basePath}/botConfig`, "PUT", botConfigObj);
}

// ============================================================================
// 3. TELEGRAM BOT API HELPERS (INCLUDING REAL ANIMATED sendDice!)
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
// 4. KEYBOARD BUILDERS FOR DICE GIVEAWAY BOT
// ============================================================================
function buildMainGiveawayKeyboard(isAdminUser) {
  const rows = [
    [{ text: "🎲 Create Dice Giveaway" }, { text: "🎁 Active Giveaways" }],
    [{ text: "📜 My Created Giveaways" }, { text: "🏆 Past Winners" }],
    [{ text: "👤 My Profile" }, { text: "ℹ️ How Giveaway Works" }]
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

function buildScheduleTimeKeyboard() {
  return {
    keyboard: [
      [{ text: "⚡ Start Immediately (NOW)" }],
      [{ text: "8.10 pm" }, { text: "8.30 pm" }, { text: "9.00 pm" }],
      [{ text: "9.30 pm" }, { text: "10.00 pm" }, { text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildDiceMaxNumberKeyboard() {
  return {
    keyboard: [
      [{ text: "6 (1 Dice Roll 🎲)" }, { text: "12 (2 Dice Rolls 🎲🎲)" }],
      [{ text: "18 (3 Dice Rolls 🎲x3)" }, { text: "24 (4 Dice Rolls 🎲x4)" }],
      [{ text: "30 (5 Dice Rolls 🎲x5)" }, { text: "36 (6 Dice Rolls 🎲x6)" }],
      [{ text: "❌ Cancel" }]
    ],
    resize_keyboard: true
  };
}

function buildTargetChatKeyboard(savedChannel) {
  const rows = [
    [{ text: "🤖 Start Here in Bot Chat" }]
  ];
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
// 5. GIVEAWAY STAGE RENDERERS (STAGE 1: REACTION GATE -> STAGE 2: NUMBERS -> STAGE 3: DICE ROLL)
// ============================================================================
function getReactionCountsSummary(gw) {
  const rMap = gw.reactionsMap || {};
  let heart = 0;
  let like = 0;
  let fire = 0;
  for (const u of Object.keys(rMap)) {
    const em = rMap[u];
    if (em === "❤️") heart++;
    else if (em === "👍") like++;
    else if (em === "🔥") fire++;
  }
  const nativeCount = numOrDef(gw.nativeReactionCount, 0);
  const buttonTotal = heart + like + fire;
  const total = Math.max(buttonTotal, nativeCount);

  if (nativeCount > buttonTotal && gw.nativeBreakdown) {
    heart = Math.max(heart, numOrDef(gw.nativeBreakdown.heart, 0));
    like = Math.max(like, numOrDef(gw.nativeBreakdown.like, 0));
    fire = Math.max(fire, numOrDef(gw.nativeBreakdown.fire, 0));
  }
  return { total, heart, like, fire };
}

/**
 * Checks if BOTH conditions (Start Time AND Reaction Target) are satisfied!
 */
function canUnlockNumberSelection(gw) {
  const { total } = getReactionCountsSummary(gw);
  const targetReactions = numOrDef(gw.targetReactions, 0);
  const scheduledEpoch = numOrDef(gw.scheduledEpoch, 0);

  // Rule 1: If reaction target > 0, it MUST be completed first!
  if (targetReactions > 0 && total < targetReactions) {
    return {
      ready: false,
      reason: `🔥 Need ${targetReactions - total} more reaction(s) (${total}/${targetReactions}) to start!`
    };
  }

  // Rule 2: If a start time (e.g. 8.10 pm) was set, current time must be >= scheduled time!
  if (scheduledEpoch > 0 && Date.now() < scheduledEpoch) {
    return {
      ready: false,
      reason: `⏰ Giveaway starts at ${gw.scheduledLabel || formatIstTime(scheduledEpoch)}! Please wait.`
    };
  }

  return { ready: true, reason: "Unlocked!" };
}

/**
 * Renders STAGE 1: "🎁 GIVEAWAY COMING SOON!" (Exact match with photo 40911.png)
 */
function renderStage1ReactionGatePost(gw) {
  const { total, heart, like, fire } = getReactionCountsSummary(gw);
  const target = numOrDef(gw.targetReactions, 10);
  const remaining = Math.max(0, target - total);
  const bar = buildReactionProgressBar(total, target);
  const maxNum = numOrDef(gw.maxNumber, 6);
  const diceCount = Math.max(1, Math.ceil(maxNum / 6));

  let statusLine = "";
  if (target > 0 && remaining > 0) {
    statusLine = `🔥 <b>${remaining} More Reactions Needed!</b>`;
  } else if (gw.scheduledEpoch > Date.now()) {
    statusLine = `⏰ <b>Reactions Complete! Waiting for ${escHtml(gw.scheduledLabel)}...</b>`;
  } else {
    statusLine = `✅ <b>Target Reached! Tap Unlock below to pick numbers!</b>`;
  }

  const text =
    `🎁 <b>GIVEAWAY COMING SOON!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🎲 <b>Mode:</b> Dice Giveaway (Numbers <code>1 to ${maxNum}</code> • <code>${diceCount} Dice Roll${diceCount > 1 ? "s" : ""}</code>)\n` +
    `⏰ <b>Start Time:</b> <code>${escHtml(gw.scheduledLabel || "Instant")}</code>\n` +
    `👑 <b>Hosted By:</b> ${escHtml(gw.creatorName)} (${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"})\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    (target > 0
      ? `${target} Reactions पूर्ण करा आणि Giveaway सुरू करा!\n\n` +
        `<b>${total} / ${target}</b>\n` +
        `${bar}\n` +
        `${statusLine}\n\n` +
        `❤️ ${heart}   👍 ${like}   🔥 ${fire}`
      : `⏰ <b>Scheduled for ${escHtml(gw.scheduledLabel)}</b>\n${statusLine}`);

  const inline_keyboard = [
    [
      { text: `❤️ ${heart}`, callback_data: `GW_REACT|${gw.id}|❤️` },
      { text: `👍 ${like}`, callback_data: `GW_REACT|${gw.id}|👍` },
      { text: `🔥 ${fire}`, callback_data: `GW_REACT|${gw.id}|🔥` }
    ],
    [
      { text: "🔓 Check Time & Unlock Numbers", callback_data: `GW_CHECK|${gw.id}` }
    ],
    [
      { text: "⚡ Creator: Force Start / Roll", callback_data: `GW_FORCE_UNLOCK|${gw.id}` }
    ]
  ];

  return { text, reply_markup: { inline_keyboard } };
}

/**
 * Renders STAGE 2: Number Selection Grid (1..6 for 1 Dice, 1..12 for 2 Dice, etc.)
 */
function renderStage2NumberSelectionPost(gw) {
  const maxNum = numOrDef(gw.maxNumber, 6);
  const diceCount = Math.max(1, Math.ceil(maxNum / 6));
  const participants = gw.participants || {};
  const pIds = Object.keys(participants);
  const { total, heart, like, fire } = getReactionCountsSummary(gw);
  const target = numOrDef(gw.targetReactions, 0);

  // Map which numbers have been selected
  const numberToUsers = {};
  for (const uid of pIds) {
    const pObj = participants[uid];
    const num = Number(pObj.number);
    if (!numberToUsers[num]) numberToUsers[num] = [];
    numberToUsers[num].push(pObj);
  }

  let pListStr = "";
  if (pIds.length === 0) {
    pListStr = `<i>No one has selected a number yet. Be the first!</i>\n`;
  } else {
    pIds.slice(0, 25).forEach((uid, idx) => {
      const u = participants[uid];
      const unameStr = u.username ? `@${escHtml(u.username)}` : "None";
      pListStr += `${idx + 1}. <b>${escHtml(u.name)}</b> (${unameStr} | <code>${u.id}</code>) ➔ 🎯 <b>#${u.number}</b>\n`;
    });
  }

  const text =
    `🎲 <b>DICE GIVEAWAY IS NOW LIVE!</b> 🎲\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🎲 <b>Dice to Roll:</b> <code>${diceCount} Dice (${"🎲".repeat(Math.min(6, diceCount))})</code> | <b>Range:</b> <code>1 to ${maxNum}</code>\n` +
    (target > 0
      ? `✅ <b>Reactions Completed:</b> <code>${total} / ${target}</code> (❤️ ${heart} 👍 ${like} 🔥 ${fire})\n`
      : `⏭️ <b>Reactions:</b> Skipped (Instant Start)\n`) +
    `👥 <b>Joined Users:</b> <code>${pIds.length} Player(s)</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Joined Users (Name | Username | ID | Number):</b>\n` +
    `${pListStr}\n` +
    `👇 <b>Select your Lucky Number (1 to ${maxNum}) below:</b>`;

  // Build Number Buttons Grid (up to 36 numbers in clean rows of 6)
  const inline_keyboard = [];
  const cap = Math.min(36, Math.max(6, maxNum));
  let currentRow = [];

  for (let n = 1; n <= cap; n++) {
    const pickedList = numberToUsers[n] || [];
    const label = pickedList.length > 0 ? `✅ ${n} (${pickedList.length})` : `${n}`;
    currentRow.push({
      text: label,
      callback_data: `GW_PICK|${gw.id}|${n}`
    });
    if (currentRow.length === 6) {
      inline_keyboard.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) inline_keyboard.push(currentRow);

  // Action row to Roll the Dice!
  inline_keyboard.push([
    { text: `🎲 ROLL ${diceCount} DICE NOW & PICK WINNER!`, callback_data: `GW_ROLL|${gw.id}` }
  ]);

  return { text, reply_markup: { inline_keyboard } };
}

/**
 * Executes Stage 3: Rolls N Real Telegram Animated Dice (🎲), calculates the winning number,
 * and announces the Winner(s) + Full User List with Name, Username & User ID!
 */
async function executeDiceRollAndFinishGiveaway(dbUrl, basePath, token, gw) {
  const check = canUnlockNumberSelection(gw);
  if (!check.ready && !gw.forceUnlocked) {
    return { ok: false, error: check.reason };
  }

  const participants = gw.participants || {};
  const pIds = Object.keys(participants);
  if (pIds.length === 0) {
    return { ok: false, error: "⚠️ At least 1 user must select a number before rolling the Dice!" };
  }

  gw.status = "ROLLING";
  await saveGiveaway(dbUrl, basePath, gw.id, gw);

  const maxNum = numOrDef(gw.maxNumber, 6);
  const diceCount = Math.max(1, Math.ceil(maxNum / 6));
  const targetChatId = gw.targetChatId || gw.creatorId;

  // Roll N real animated Telegram Dice (🎲)!
  const rolledValues = [];
  let sumTotal = 0;
  for (let i = 0; i < diceCount; i++) {
    const val = await sendAnimatedDice(token, targetChatId);
    rolledValues.push(val);
    sumTotal += val;
  }

  // Determine exact winners who picked sumTotal
  let winningNumber = sumTotal;
  let winners = [];
  for (const uid of pIds) {
    if (Number(participants[uid].number) === winningNumber) {
      winners.push(participants[uid]);
    }
  }

  // If no one picked the exact sumTotal, find the closest number picked by a participant
  // so that every completed giveaway has a guaranteed Winner!
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

  // Build Dice Roll Breakdown String
  const diceBreakdown = rolledValues
    .map((v, i) => `🎲 Dice #${i + 1}: <b>${v}</b>`)
    .join("  |  ");

  // Build Winner Details Section (Name, Username, User ID)
  let winnerSection = "";
  winners.forEach((w, idx) => {
    const wUname = w.username ? `@${escHtml(w.username)}` : "None";
    winnerSection +=
      `🏅 <b>WINNER #${idx + 1}:</b>\n` +
      ` ┣ 👤 <b>Name:</b> ${escHtml(w.name)}\n` +
      ` ┣ 🌐 <b>Username:</b> ${wUname}\n` +
      ` ┣ 🆔 <b>User ID:</b> <code>${w.id}</code>\n` +
      ` ┗ 🎯 <b>Selected Number:</b> <code>#${w.number}</code>${matchedByClosest ? ` (Closest to ${sumTotal})` : " (Exact Match!)"}\n\n`;
  });

  // Build All Users List Section (Name, Username, User ID)
  let allUsersSection = "";
  pIds.forEach((uid, idx) => {
    const u = participants[uid];
    const uNameStr = u.username ? `@${escHtml(u.username)}` : "None";
    allUsersSection +=
      `${idx + 1}. 👤 <b>Name:</b> ${escHtml(u.name)} | 🌐 <b>Username:</b> ${uNameStr} | 🆔 <b>ID:</b> <code>${u.id}</code> | 🎯 <b>No:</b> <code>#${u.number}</code>\n`;
  });

  const finalAnnouncementHtml =
    `🎉 <b>DICE GIVEAWAY RESULT & WINNER!</b> 🎉\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Giveaway ID:</b> <code>${gw.id}</code>\n` +
    `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
    `🎲 <b>Dice Rolled (${diceCount}x):</b> ${diceBreakdown}\n` +
    `🎯 <b>Final Dice Total:</b> <code>${sumTotal}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${winnerSection}` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>ALL PARTICIPANTS (${pIds.length}):</b>\n` +
    `${allUsersSection}`;

  // Update the Giveaway Message & Send Final Winner Card
  if (gw.postMessageId) {
    await editBotMsg(token, targetChatId, gw.postMessageId, finalAnnouncementHtml, null);
  }
  await sendBotMsg(token, targetChatId, finalAnnouncementHtml, null);

  // Also DM the Giveaway Creator if giveaway was hosted in a Channel/Group
  if (String(targetChatId) !== String(gw.creatorId)) {
    await sendBotMsg(token, gw.creatorId, finalAnnouncementHtml, null);
  }

  // Also DM each Winner directly!
  for (const w of winners) {
    if (String(w.id) !== String(targetChatId) && String(w.id) !== String(gw.creatorId)) {
      await sendBotMsg(
        token,
        w.id,
        `🎉 <b>CONGRATULATIONS! YOU WON THE DICE GIVEAWAY!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏆 <b>Prize:</b> ${escHtml(gw.prize)}\n` +
          `🎲 <b>Dice Result:</b> <code>${sumTotal}</code>\n` +
          `👤 <b>Your Name:</b> ${escHtml(w.name)}\n` +
          `🌐 <b>Your Username:</b> ${w.username ? "@" + escHtml(w.username) : "None"}\n` +
          `🆔 <b>Your User ID:</b> <code>${w.id}</code>\n\n` +
          `👑 Contact Giveaway Host: ${gw.creatorUsername ? "@" + escHtml(gw.creatorUsername) : "<code>" + gw.creatorId + "</code>"}`
      );
    }
  }

  return { ok: true };
}

// ============================================================================
// 6. HANDLE NATIVE TELEGRAM POST REACTIONS (message_reaction & message_reaction_count)
// ============================================================================
async function handleNativeTelegramReactionUpdate(dbUrl, basePath, token, node, upd) {
  const giveaways = node.giveaways || {};
  const gwIds = Object.keys(giveaways);
  if (gwIds.length === 0) return;

  // 1. Anonymous Channel Reaction Counts (message_reaction_count)
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
        let heart = 0;
        let like = 0;
        let fire = 0;
        const rArr = Array.isArray(mrc.reactions) ? mrc.reactions : [];
        for (const item of rArr) {
          const cnt = numOrDef(item.total_count, 0);
          total += cnt;
          const em = item.type?.emoji || "";
          if (em === "❤️" || em === "❤") heart += cnt;
          else if (em === "👍") like += cnt;
          else if (em === "🔥") fire += cnt;
        }
        gw.nativeReactionCount = total;
        gw.nativeBreakdown = { heart, like, fire };

        const check = canUnlockNumberSelection(gw);
        if (check.ready) {
          gw.status = "OPEN_NUMBERS";
          await saveGiveaway(dbUrl, basePath, gw.id, gw);
          const rendered = renderStage2NumberSelectionPost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        } else {
          await saveGiveaway(dbUrl, basePath, gw.id, gw);
          const rendered = renderStage1ReactionGatePost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        }
      }
    }
  }

  // 2. Group / Chat Per-User Reaction (message_reaction)
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
        if (!gw.reactionsMap) gw.reactionsMap = {};
        const newR = Array.isArray(mr.new_reaction) ? mr.new_reaction : [];
        if (newR.length === 0) {
          delete gw.reactionsMap[reactorId];
        } else {
          const em = newR[newR.length - 1].emoji || "❤️";
          gw.reactionsMap[reactorId] = em === "❤" ? "❤️" : em;
        }

        const check = canUnlockNumberSelection(gw);
        if (check.ready) {
          gw.status = "OPEN_NUMBERS";
          await saveGiveaway(dbUrl, basePath, gw.id, gw);
          const rendered = renderStage2NumberSelectionPost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        } else {
          await saveGiveaway(dbUrl, basePath, gw.id, gw);
          const rendered = renderStage1ReactionGatePost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        }
      }
    }
  }
}

// ============================================================================
// 7. PLAYER / USER PROFILE INITIALIZER
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
      savedChannel: "",
      tempTargetChat: "",
      tempPrize: "",
      tempReactionTarget: 0,
      tempScheduledEpoch: 0,
      tempScheduledLabel: "Instant (NOW)",
      tempMaxNumber: 6,
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
// 8. MAIN VERCEL SERVERLESS HANDLER (api/bot1.js)
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
      engine: "Kurmurya 24/7 Telegram Dice Giveaway Bot (api/bot1.js)",
      status: "24/7_ONLINE"
    });
  }

  const botId = req.query?.botId ? String(req.query.botId).trim() : "";
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // --------------------------------------------------------------------------
  // A. DIRECT API CONNECT CALL (IF APP CALLS /api/bot1 DIRECTLY)
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
      const uname = meRes.result.username || "Bot";
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
        giveawayWebhookFixed: true,
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
        `🎲 <b>24/7 DICE GIVEAWAY BOT CONNECTED!</b>\n\n` +
          `🤖 <b>Bot:</b> @${escHtml(uname)}\n` +
          `👑 <b>Owner ID:</b> <code>${owner}</code>\n\n` +
          `👇 Send <b>/start</b> to create your first <b>🎲 Dice Giveaway</b>!`,
        buildMainGiveawayKeyboard(true)
      );

      return res.status(200).json({ success: true, botId: bId, botUsername: uname, webhookUrl: whUrl });
    } catch (e) {
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // --------------------------------------------------------------------------
  // B. 24/7 TELEGRAM WEBHOOK UPDATE HANDLER (?botId=...)
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

    // Ensure native Telegram reaction updates are enabled on Webhook
    if (!b.giveawayWebhookFixed) {
      b.giveawayWebhookFixed = true;
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

    // Handle Native Telegram Post Reactions (❤️ 👍 🔥)
    if (upd.message_reaction || upd.message_reaction_count) {
      await handleNativeTelegramReactionUpdate(dbUrl, basePath, token, node, upd);
      return res.status(200).send("REACTION_OK");
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
    // C. HANDLE INLINE BUTTON CALLBACKS (REACTIONS, UNLOCK, PICK NUMBER, ROLL DICE)
    // ========================================================================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;

      // 1. User clicked Inline Reaction Button: "GW_REACT|<gwId>|<emoji>"
      if (data.startsWith("GW_REACT|")) {
        const parts = data.split("|");
        const gwId = parts[1];
        const emoji = parts[2] || "❤️";
        const gw = giveaways[gwId];

        if (!gw) {
          await answerCb(token, cbId, "⚠️ Giveaway not found!", true);
          return res.status(200).send("OK");
        }
        if (gw.status !== "WAITING_GATE") {
          await answerCb(token, cbId, "✅ Giveaway is already unlocked!", false);
          return res.status(200).send("OK");
        }

        if (!gw.reactionsMap) gw.reactionsMap = {};
        gw.reactionsMap[cUid] = emoji;

        const check = canUnlockNumberSelection(gw);
        if (check.ready) {
          gw.status = "OPEN_NUMBERS";
          await saveGiveaway(dbUrl, basePath, gwId, gw);
          await answerCb(token, cbId, "🎉 Reactions Complete! Select your Lucky Number now!", true);
          const rendered = renderStage2NumberSelectionPost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        } else {
          await saveGiveaway(dbUrl, basePath, gwId, gw);
          const { total } = getReactionCountsSummary(gw);
          await answerCb(
            token,
            cbId,
            `${emoji} Reaction Counted! (${total}/${gw.targetReactions})`,
            false
          );
          const rendered = renderStage1ReactionGatePost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        }
        return res.status(200).send("OK");
      }

      // 2. User clicked "🔓 Check Time & Unlock Numbers": "GW_CHECK|<gwId>"
      if (data.startsWith("GW_CHECK|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw) {
          await answerCb(token, cbId, "⚠️ Giveaway not found!", true);
          return res.status(200).send("OK");
        }

        const check = canUnlockNumberSelection(gw);
        if (!check.ready) {
          await answerCb(token, cbId, check.reason, true);
          const rendered = renderStage1ReactionGatePost(gw);
          await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
          return res.status(200).send("OK");
        }

        gw.status = "OPEN_NUMBERS";
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(token, cbId, "🎉 Giveaway Unlocked! Pick your Lucky Number!", true);
        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      // 3. Creator clicked "⚡ Creator: Force Start / Roll": "GW_FORCE_UNLOCK|<gwId>"
      if (data.startsWith("GW_FORCE_UNLOCK|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];
        if (!gw) {
          await answerCb(token, cbId, "⚠️ Giveaway not found!", true);
          return res.status(200).send("OK");
        }
        if (cUid !== String(gw.creatorId) && !isAdm) {
          await answerCb(token, cbId, "⚠️ Only the Giveaway Creator can force unlock!", true);
          return res.status(200).send("OK");
        }

        // Strict Check: If reaction target > 0 and not completed yet, remind creator OR add +1 test reaction
        const { total } = getReactionCountsSummary(gw);
        if (numOrDef(gw.targetReactions, 0) > 0 && total < numOrDef(gw.targetReactions, 0)) {
          await answerCb(
            token,
            cbId,
            `⚠️ ${total}/${gw.targetReactions} Reactions completed! Complete all ${gw.targetReactions} reactions first!`,
            true
          );
          return res.status(200).send("OK");
        }

        gw.forceUnlocked = true;
        gw.status = "OPEN_NUMBERS";
        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(token, cbId, "✅ Number Selection Unlocked!", false);
        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      // 4. User clicked a Lucky Number (1..6, 1..12, etc.): "GW_PICK|<gwId>|<num>"
      if (data.startsWith("GW_PICK|")) {
        const parts = data.split("|");
        const gwId = parts[1];
        const pickedNum = parseInt(parts[2], 10);
        const gw = giveaways[gwId];

        if (!gw || gw.status === "FINISHED" || gw.status === "ROLLING") {
          await answerCb(token, cbId, "⚠️ This Giveaway has already ended!", true);
          return res.status(200).send("OK");
        }

        const check = canUnlockNumberSelection(gw);
        if (!check.ready && !gw.forceUnlocked) {
          await answerCb(token, cbId, check.reason, true);
          return res.status(200).send("OK");
        }

        if (!gw.participants) gw.participants = {};
        gw.participants[cUid] = {
          id: cUid,
          name: cName,
          username: cUname,
          number: pickedNum,
          joinedAt: formatIstTime(Date.now())
        };

        await saveGiveaway(dbUrl, basePath, gwId, gw);
        await answerCb(
          token,
          cbId,
          `🎯 You locked Lucky Number #${pickedNum}!`,
          true
        );

        const rendered = renderStage2NumberSelectionPost(gw);
        await editBotMsg(token, gw.targetChatId, gw.postMessageId, rendered.text, rendered.reply_markup);
        return res.status(200).send("OK");
      }

      // 5. Creator / User clicked "🎲 ROLL DICE NOW & PICK WINNER!": "GW_ROLL|<gwId>"
      if (data.startsWith("GW_ROLL|")) {
        const gwId = data.split("|")[1];
        const gw = giveaways[gwId];

        if (!gw || gw.status === "FINISHED" || gw.status === "ROLLING") {
          await answerCb(token, cbId, "⚠️ Dice already rolled for this giveaway!", true);
          return res.status(200).send("OK");
        }

        // Enforce that reactions AND start time are met before rolling dice!
        const check = canUnlockNumberSelection(gw);
        if (!check.ready) {
          await answerCb(token, cbId, check.reason, true);
          return res.status(200).send("OK");
        }

        const pCount = Object.keys(gw.participants || {}).length;
        const maxNum = numOrDef(gw.maxNumber, 6);
        // Creator/Admin can roll anytime once >=1 player joined; participants can trigger roll if all numbers filled
        if (cUid !== String(gw.creatorId) && !isAdm && pCount < maxNum) {
          await answerCb(
            token,
            cbId,
            `⏳ Waiting for Host (${gw.creatorName}) to roll the dice (or ${maxNum} players to join)!`,
            true
          );
          return res.status(200).send("OK");
        }

        await answerCb(token, cbId, "🎲 Rolling Official Telegram Dice...", false);
        const rollRes = await executeDiceRollAndFinishGiveaway(dbUrl, basePath, token, gw);
        if (!rollRes.ok) {
          await sendBotMsg(token, cUid, rollRes.error, mainKb);
        }
        return res.status(200).send("OK");
      }

      await answerCb(token, cbId, "Done", false);
      return res.status(200).send("OK");
    }

    // ========================================================================
    // D. HANDLE TEXT MESSAGES & GIVEAWAY CREATION WIZARD
    // ========================================================================
    const msgObj = upd.message;
    const chatId = String(msgObj.chat?.id || cUid);
    const text = String(msgObj.text || "").trim();

    // Global Cancel / Start
    if (text.toLowerCase() === "❌ cancel" || text.toLowerCase() === "/cancel") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);
      await sendBotMsg(token, chatId, "❌ <b>Operation Cancelled.</b>", mainKb);
      return res.status(200).send("OK");
    }

    if (text.startsWith("/start")) {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const welcomeHtml =
        `🎲 <b>WELCOME TO 24/7 DICE GIVEAWAY BOT!</b> 🎁\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${escHtml(cName)} (<code>${cUid}</code>)\n` +
        `🌐 <b>Username:</b> ${cUname ? "@" + escHtml(cUname) : "None"}\n\n` +
        `🔥 <b>Features Available for Everyone:</b>\n` +
        `• <b>🎲 Create Dice Giveaway:</b> Host in your Channel, Group, or right here!\n` +
        `• <b>❤️ Reaction Target Gate:</b> Set <code>10</code> reactions (or <code>Skip</code>). Giveaway won't roll until reactions complete!\n` +
        `• <b>⏰ Schedule Start Time:</b> Set any time (e.g. <code>8.10 pm</code>) or start <code>NOW</code>!\n` +
        `• <b>🎲 Multi-Dice Roll:</b> <code>6</code> = 1 Dice, <code>12</code> = 2 Dice, <code>18</code> = 3 Dice...\n` +
        `• <b>🏆 Full Winner Info:</b> Shows Winner's Name, @Username & User ID!\n\n` +
        `👇 <b>Tap '🎲 Create Dice Giveaway' below to start:</b>`;

      await sendBotMsg(token, chatId, welcomeHtml, mainKb);
      return res.status(200).send("OK");
    }

    // ------------------------------------------------------------------------
    // TOP-LEVEL MENU BUTTONS
    // ------------------------------------------------------------------------
    if (text === "🎲 Create Dice Giveaway") {
      p.state = "GW_STEP1_TARGET_CHAT";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `🎲 <b>CREATE DICE GIVEAWAY (STEP 1 OF 5)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 <b>Where do you want to post this Giveaway?</b>\n\n` +
          `• Tap <b>🤖 Start Here in Bot Chat</b> to run it right here.\n` +
          `• OR send your Channel / Group <code>@username</code> or Chat ID (<code>-100...</code>) where this Bot is an Admin:`,
        buildTargetChatKeyboard(p.savedChannel)
      );
      return res.status(200).send("OK");
    }

    if (text === "🎁 Active Giveaways") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const gIds = Object.keys(giveaways);
      const activeList = gIds
        .map((id) => giveaways[id])
        .filter((g) => g && g.status !== "FINISHED");

      let sb = `🎁 <b>ACTIVE DICE GIVEAWAYS (${activeList.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (activeList.length === 0) {
        sb += `📭 No active giveaways right now.\nTap <b>🎲 Create Dice Giveaway</b> to launch one!`;
      } else {
        activeList.slice(0, 10).forEach((g, idx) => {
          const { total } = getReactionCountsSummary(g);
          const pCount = Object.keys(g.participants || {}).length;
          sb +=
            `<b>[${idx + 1}] ${escHtml(g.prize)} (<code>${g.id}</code>)</b>\n` +
            ` ┣ 🎲 Range: <code>1 to ${g.maxNumber}</code> (${Math.ceil(g.maxNumber / 6)} Dice)\n` +
            ` ┣ ❤️ Reactions: <code>${total} / ${g.targetReactions}</code> | 👥 Joined: <code>${pCount}</code>\n` +
            ` ┗ ⏰ Time: <code>${escHtml(g.scheduledLabel)}</code> (${g.status})\n\n`;
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
            .map((w) => `${escHtml(w.name)} (${w.username ? "@" + escHtml(w.username) : "None"} | <code>${w.id}</code>)`)
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
        `📢 <b>Saved Channel:</b> <code>${escHtml(p.savedChannel || "Not Set")}</code>\n` +
        `🎁 <b>Giveaways Hosted:</b> <code>${numOrDef(p.createdGiveaways, 0)}</code>`;

      await sendBotMsg(token, chatId, profHtml, mainKb);
      return res.status(200).send("OK");
    }

    if (text === "ℹ️ How Giveaway Works") {
      p.state = "IDLE";
      await savePlayerState(dbUrl, basePath, cUid, p);

      const helpHtml =
        `ℹ️ <b>HOW DICE GIVEAWAY WORKS</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `1️⃣ <b>Create Giveaway:</b> Tap <b>🎲 Create Dice Giveaway</b> & choose your Channel/Group or Bot chat.\n` +
        `2️⃣ <b>Reaction Target or Skip:</b> Set a reaction target (e.g. <code>10</code> Reactions) or tap <b>⏭️ Skip Reaction</b>.\n` +
        `3️⃣ <b>Schedule Time:</b> Set a start time (e.g. <code>8.10 pm</code>) or start <b>Immediately</b>.\n` +
        `4️⃣ <b>Dice Roll Math:</b>\n` +
        `   • Choose <code>6</code> ➔ <b>1 Dice Roll (🎲)</b>\n` +
        `   • Choose <code>12</code> ➔ <b>2 Dice Rolls (🎲 + 🎲)</b>\n` +
        `   • Choose <code>18</code> ➔ <b>3 Dice Rolls (🎲 + 🎲 + 🎲)</b>\n` +
        `5️⃣ <b>Strict Rule:</b> Until the Reaction Target AND Start Time are completed, Dice Roll will NOT start!\n` +
        `6️⃣ <b>Winner Details:</b> At the end, the bot announces the Winner's <b>Name, @Username & User ID</b>!`;

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
          `👥 <b>Total Bot Users:</b> <code>${Object.keys(players).length}</code>\n` +
          `🎁 <b>Total Giveaways Created:</b> <code>${Object.keys(giveaways).length}</code>\n` +
          `🟢 <b>24/7 Cloud Engine:</b> <code>ONLINE (api/bot1.js)</code>`,
        mainKb
      );
      return res.status(200).send("OK");
    }

    // ========================================================================
    // E. 5-STEP DICE GIVEAWAY CREATION WIZARD
    // ========================================================================
    const st = String(p.state || "IDLE").toUpperCase();

    // ---- STEP 1: SELECT TARGET CHAT / CHANNEL ----
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
          `• Example: <code>₹100 UPI Cash</code> or <code>Free Fire Special Airdrop</code>`,
        buildCancelKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 2: ENTER PRIZE -> ASK REACTION TARGET OR SKIP ----
    if (st === "GW_STEP2_PRIZE") {
      p.tempPrize = text || "Special Mystery Prize";
      p.state = "GW_STEP3_REACTIONS";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `❤️ <b>STEP 3 OF 5: SET REACTION TARGET OR SKIP</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏆 <b>Prize:</b> ${escHtml(p.tempPrize)}\n\n` +
          `📌 <b>How many Reactions are required to start this Giveaway?</b>\n` +
          `• Example: Send <code>10</code> (Until 10 reactions are completed, the Giveaway & Dice Roll will NOT start!)\n` +
          `• OR tap <b>⏭️ Skip Reaction (0)</b> to start without requiring reactions:`,
        buildReactionTargetKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 3: REACTION TARGET -> ASK START TIME (e.g. 8.10 pm or NOW) ----
    if (st === "GW_STEP3_REACTIONS") {
      let rTarget = 0;
      if (!text.toLowerCase().includes("skip")) {
        const parsed = parseInt(text.replace(/\D/g, ""), 10);
        if (isNaN(parsed) || parsed < 0) {
          await sendBotMsg(
            token,
            chatId,
            `⚠️ Please enter a valid number of reactions (e.g. <code>10</code>) or tap <b>⏭️ Skip Reaction (0)</b>:`,
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
        `⏰ <b>STEP 4 OF 5: SET GIVEAWAY START TIME (IST)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Reactions" : "Skipped (0)"}</code>\n\n` +
          `📌 <b>When should the Giveaway start?</b>\n` +
          `• Type any time like <code>8.10 pm</code>, <code>8:30 pm</code>, <code>9.15 pm</code>\n` +
          `• OR tap <b>⚡ Start Immediately (NOW)</b> below:\n` +
          `<i>(Note: Even when ${"8.10 pm"} arrives, Dice Roll will NOT start until all ${rTarget} reactions are completed!)</i>`,
        buildScheduleTimeKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 4: START TIME -> ASK DICE MAX NUMBER (6 = 1 Dice, 12 = 2 Dice...) ----
    if (st === "GW_STEP4_TIME") {
      const parsedTime = parseUserTimeInputToEpoch(text);
      if (!parsedTime.ok) {
        await sendBotMsg(
          token,
          chatId,
          `❌ <b>${escHtml(parsedTime.error)}</b>\nTap <b>⚡ Start Immediately (NOW)</b> or type time like <code>8.10 pm</code>:`,
          buildScheduleTimeKeyboard()
        );
        return res.status(200).send("OK");
      }

      p.tempScheduledEpoch = parsedTime.epochMs;
      p.tempScheduledLabel = parsedTime.label;
      p.state = "GW_STEP5_DICE_MAX";
      await savePlayerState(dbUrl, basePath, cUid, p);

      await sendBotMsg(
        token,
        chatId,
        `🎲 <b>STEP 5 OF 5: SELECT DICE MAX NUMBER (DICE COUNT)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⏰ <b>Start Time:</b> <code>${escHtml(parsedTime.label)}</code>\n\n` +
          `📌 <b>How many numbers / Dice Rolls do you want?</b>\n` +
          `• Send <code>6</code> ➔ <b>1 Dice Roll (🎲)</b> (Numbers 1 to 6)\n` +
          `• Send <code>12</code> ➔ <b>2 Dice Rolls (🎲🎲)</b> (Numbers 1 to 12)\n` +
          `• Send <code>18</code> ➔ <b>3 Dice Rolls (🎲🎲🎲)</b> (Numbers 1 to 18)\n` +
          `• Or type any number below:`,
        buildDiceMaxNumberKeyboard()
      );
      return res.status(200).send("OK");
    }

    // ---- STEP 5: LAUNCH DICE GIVEAWAY POST! ----
    if (st === "GW_STEP5_DICE_MAX") {
      const numMatch = text.match(/(\d+)/);
      const maxNum = numMatch ? parseInt(numMatch[1], 10) : 6;
      if (isNaN(maxNum) || maxNum < 2 || maxNum > 60) {
        await sendBotMsg(
          token,
          chatId,
          `⚠️ Please select <code>6</code>, <code>12</code>, <code>18</code>, <code>24</code>, <code>30</code>, or <code>36</code>:`,
          buildDiceMaxNumberKeyboard()
        );
        return res.status(200).send("OK");
      }

      const gwId = "GW" + Math.floor(10000 + Math.random() * 90000);
      const targetChat = p.tempTargetChat || chatId;
      const rTarget = numOrDef(p.tempReactionTarget, 0);
      const schedEpoch = numOrDef(p.tempScheduledEpoch, 0);

      // Determine if Giveaway starts in Stage 1 (Reaction/Time Gate) or Stage 2 (Immediate Number Selection)
      const needsGate = rTarget > 0 || (schedEpoch > 0 && schedEpoch > Date.now());

      const gwObj = {
        id: gwId,
        creatorId: cUid,
        creatorName: cName,
        creatorUsername: cUname,
        targetChatId: targetChat,
        prize: p.tempPrize || "Special Prize",
        targetReactions: rTarget,
        scheduledEpoch: schedEpoch,
        scheduledLabel: p.tempScheduledLabel || "Instant (NOW)",
        maxNumber: maxNum,
        diceCount: Math.max(1, Math.ceil(maxNum / 6)),
        status: needsGate ? "WAITING_GATE" : "OPEN_NUMBERS",
        reactionsMap: {},
        nativeReactionCount: 0,
        participants: {},
        createdAt: formatIstTime(Date.now())
      };

      const rendered = needsGate
        ? renderStage1ReactionGatePost(gwObj)
        : renderStage2NumberSelectionPost(gwObj);

      const postRes = await sendBotMsg(token, targetChat, rendered.text, rendered.reply_markup);
      if (!postRes || !postRes.ok) {
        p.state = "IDLE";
        await savePlayerState(dbUrl, basePath, cUid, p);
        await sendBotMsg(
          token,
          chatId,
          `❌ <b>Could not post to <code>${escHtml(targetChat)}</code>!</b>\n` +
            `Make sure this Bot is added as an <b>Admin</b> in <code>${escHtml(targetChat)}</code>, or choose <b>🤖 Start Here in Bot Chat</b>.`,
          mainKb
        );
        return res.status(200).send("OK");
      }

      gwObj.postMessageId = postRes.result.message_id;
      p.state = "IDLE";
      p.createdGiveaways = numOrDef(p.createdGiveaways, 0) + 1;

      await saveGiveaway(dbUrl, basePath, gwId, gwObj);
      await savePlayerState(dbUrl, basePath, cUid, p);

      if (String(targetChat) !== String(chatId)) {
        await sendBotMsg(
          token,
          chatId,
          `🎉 <b>DICE GIVEAWAY PUBLISHED IN <code>${escHtml(targetChat)}</code>!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 <b>Giveaway ID:</b> <code>${gwId}</code>\n` +
            `🏆 <b>Prize:</b> ${escHtml(gwObj.prize)}\n` +
            `❤️ <b>Reaction Target:</b> <code>${rTarget > 0 ? rTarget + " Reactions" : "Skipped (0)"}</code>\n` +
            `⏰ <b>Start Time:</b> <code>${escHtml(gwObj.scheduledLabel)}</code>\n` +
            `🎲 <b>Mode:</b> <code>1 to ${maxNum} (${gwObj.diceCount} Dice Roll${gwObj.diceCount > 1 ? "s" : ""})</code>`,
          mainKb
        );
      } else {
        await sendBotMsg(
          token,
          chatId,
          `✅ <b>Giveaway <code>${gwId}</code> is Live above!</b>`,
          mainKb
        );
      }
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
