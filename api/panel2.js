const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

// ============================================================================
// 1. CONFIGURATION & SHARED FIREBASE REALTIME DATABASE ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";
const NETWORK_LEAD_MS = 120; // Fires 120ms early to compensate Telegram API latency for 0.0s hit

async function fbGet(path) {
  try {
    const res = await fetch(DB_URL + "/" + path + ".json");
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fbSet(path, data) {
  try {
    await fetch(DB_URL + "/" + path + ".json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return true;
  } catch (e) {
    return false;
  }
}

function parseReqBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return req.body;
}

function sleepMs(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error(msg || "Operation timed out"));
      }, ms);
    })
  ]);
}

async function safeDisconnect(client) {
  try {
    if (client) {
      await Promise.race([
        client.disconnect(),
        sleepMs(1000)
      ]);
    }
  } catch (e) {}
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// 2. TELEGRAM CLIENT FACTORY & TARGET RESOLVERS
// ============================================================================
async function loadAllAccounts() {
  let accounts = (await fbGet("panel/accounts")) || [];
  if (!Array.isArray(accounts)) accounts = Object.values(accounts);
  return accounts.filter(Boolean);
}

async function connectAccount(acc, defaultApiConfig) {
  const apiId = Number(acc.apiId || (defaultApiConfig && defaultApiConfig.apiId));
  const apiHash = String(acc.apiHash || (defaultApiConfig && defaultApiConfig.apiHash) || "");
  if (!apiId || !apiHash || !acc.session) {
    throw new Error("Missing session or API_ID/API_HASH for " + (acc.phone || "ID"));
  }
  const client = new TelegramClient(
    new StringSession(acc.session),
    apiId,
    apiHash,
    {
      connectionRetries: 2,
      deviceModel: "Samsung SM-S928B",
      systemVersion: "Android 14",
      appVersion: "10.14.5",
      langCode: "en",
      systemLangCode: "en-US"
    }
  );
  await client.connect();
  return client;
}

// Resolves @username, https://t.me/username, +phone, or numeric User ID cleanly
async function resolveDmTarget(client, rawTarget) {
  let clean = String(rawTarget || "").trim();
  if (clean.indexOf("t.me/") !== -1) {
    clean = clean.split("t.me/")[1].split("?")[0].split("/")[0].trim();
  }

  // Case 1: Pure numeric User ID (e.g. 7335163273)
  if (/^\d{5,15}$/.test(clean)) {
    const numId = Number(clean);
    try {
      return await client.getInputEntity(numId);
    } catch (e1) {
      // Load recent dialogs to populate entity cache for numeric ID
      const dialogs = await client.getDialogs({ limit: 120 });
      for (let i = 0; i < dialogs.length; i++) {
        const d = dialogs[i];
        const entId = d && d.entity && d.entity.id ? String(d.entity.id) : "";
        if (entId === clean) {
          return d.inputEntity || d.entity;
        }
      }
      throw new Error("Numeric User ID " + clean + " not in recent chats. Use @username or message them once first.");
    }
  }

  // Case 2: @username or plain username or phone
  const lookup = clean.startsWith("+") ? clean : clean.replace(/^@/, "");
  return await client.getInputEntity(lookup);
}

function parseReferBotLink(rawInput) {
  const str = String(rawInput || "").trim();
  let botUser = str;
  let appShortName = "";
  let startParam = "";

  if (str.indexOf("t.me/") !== -1) {
    const afterTme = str.split("t.me/")[1];
    const qParts = afterTme.split("?");
    const segs = qParts[0].split("/").filter(Boolean);
    botUser = (segs[0] || "").trim();
    if (segs.length >= 2 && !/^\d+$/.test(segs[1])) {
      appShortName = segs[1].trim();
    }
    if (qParts[1]) {
      const p = new URLSearchParams(qParts[1]);
      if (p.get("start")) startParam = p.get("start");
      else if (p.get("startapp")) startParam = p.get("startapp");
    }
  } else if (str.indexOf(" ") !== -1) {
    const sp = str.split(/\s+/);
    botUser = sp[0];
    startParam = sp[1] || "";
  }

  botUser = botUser.replace("@", "").trim();
  return { botUser: botUser, appShortName: appShortName, startParam: startParam };
}

function isPrivateInviteUrl(url) {
  const u = String(url || "").trim();
  return (
    u.indexOf("t.me/+") !== -1 ||
    u.indexOf("t.me/joinchat/") !== -1 ||
    u.indexOf("telegram.me/+") !== -1 ||
    u.indexOf("telegram.me/joinchat/") !== -1
  );
}

function isPublicChannelUrl(url) {
  const u = String(url || "").trim();
  if (isPrivateInviteUrl(u)) return false;
  const m = u.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})(?:\/?\?.*|\/)?$/i);
  if (!m) return false;
  const uname = m[1].toLowerCase();
  if (uname === "addlist" || uname === "share" || uname === "proxy" || uname === "socks") return false;
  if (uname.endsWith("bot")) return false;
  return true;
}

function isMiniAppButton(btn) {
  if (!btn) return false;
  const cls = String(btn.className || "");
  const url = String(btn.url || "");
  const txt = String(btn.text || "").toLowerCase();
  if (cls.indexOf("WebView") !== -1) return true;
  if (url.indexOf("startapp=") !== -1) return true;
  if (/t\.me\/[A-Za-z0-9_]+bot\/[A-Za-z0-9_]+/i.test(url)) return true;
  if (url && !url.includes("t.me/") && /verify|open|app|start|claim/i.test(txt)) return true;
  return false;
}

function extractMessageControls(msg) {
  const inlineButtons = [];
  const publicChannels = [];
  const privateChannels = [];
  const miniAppButtons = [];
  let hasContactShareButton = false;
  let contactShareText = "";

  if (!msg || !msg.replyMarkup) {
    return {
      inlineButtons: inlineButtons,
      publicChannels: publicChannels,
      privateChannels: privateChannels,
      miniAppButtons: miniAppButtons,
      hasContactShareButton: false,
      contactShareText: ""
    };
  }

  const rmClass = String(msg.replyMarkup.className || "");
  const rows = Array.isArray(msg.replyMarkup.rows) ? msg.replyMarkup.rows : [];
  let flatIdx = 0;

  for (let r = 0; r < rows.length; r++) {
    const btns = Array.isArray(rows[r].buttons) ? rows[r].buttons : [];
    for (let b = 0; b < btns.length; b++) {
      const btn = btns[b];
      if (!btn) continue;
      const cls = String(btn.className || "");
      const txt = String(btn.text || "");
      const url = String(btn.url || "");

      if (
        cls === "KeyboardButtonRequestPhone" ||
        (rmClass === "ReplyKeyboardMarkup" && /contact|phone|number|share.*mobile/i.test(txt))
      ) {
        hasContactShareButton = true;
        contactShareText = txt || "Share Contact";
        continue;
      }

      if (rmClass === "ReplyInlineMarkup" || url || btn.data || cls.indexOf("WebView") !== -1) {
        flatIdx++;
        const info = {
          index: flatIdx,
          text: txt || ("Button #" + flatIdx),
          url: url,
          hasData: Boolean(btn.data),
          dataHex: btn.data ? Buffer.from(btn.data).toString("hex") : "",
          className: cls,
          isMiniApp: isMiniAppButton(btn)
        };
        inlineButtons.push(info);

        if (isPrivateInviteUrl(url)) {
          privateChannels.push({ text: info.text, url: url, type: "PRIVATE" });
        } else if (isPublicChannelUrl(url)) {
          publicChannels.push({ text: info.text, url: url, type: "PUBLIC" });
        } else if (info.isMiniApp) {
          miniAppButtons.push(info);
        }
      }
    }
  }

  const msgTxt = String(msg.message || "");
  const linkMatches = msgTxt.match(/https?:\/\/t\.me\/[^\s<>"')]+/gi) || [];
  for (let i = 0; i < linkMatches.length; i++) {
    const u = linkMatches[i];
    if (isPrivateInviteUrl(u) && !privateChannels.some(function (x) { return x.url === u; })) {
      privateChannels.push({ text: "Text Link", url: u, type: "PRIVATE" });
    } else if (isPublicChannelUrl(u) && !publicChannels.some(function (x) { return x.url === u; })) {
      publicChannels.push({ text: "Text Link", url: u, type: "PUBLIC" });
    }
  }

  return {
    inlineButtons: inlineButtons,
    publicChannels: publicChannels,
    privateChannels: privateChannels,
    miniAppButtons: miniAppButtons,
    hasContactShareButton: hasContactShareButton,
    contactShareText: contactShareText
  };
}

// ============================================================================
// 3. CORE AUTOMATION ENGINES (OLDEST 50 CLEANER, BLOCK ALL BOTS, SUPER FOLDERS, 0MS SNIPER)
// ============================================================================

// A. Leave Oldest 50 Inactive Channels
async function leaveOldestChannels(client, countToLeave) {
  const limitTarget = Math.max(1, Math.min(80, parseInt(countToLeave, 10) || 50));
  const dialogs = await client.getDialogs({ limit: 450 });

  const candidates = [];
  for (let i = 0; i < dialogs.length; i++) {
    const d = dialogs[i];
    if (!d || !d.entity) continue;
    if (!(d.isChannel || d.isGroup)) continue;
    if (d.entity.creator === true) continue;
    const msgDate = Number(d.date || (d.message && d.message.date) || 0);
    candidates.push({ dialog: d, title: d.title || d.name || "Channel", date: msgDate });
  }

  candidates.sort(function (a, b) {
    return a.date - b.date;
  });

  const toLeave = candidates.slice(0, limitTarget);
  let leftCount = 0;
  let failedCount = 0;

  for (let j = 0; j < toLeave.length; j++) {
    const item = toLeave[j];
    try {
      const entity = item.dialog.inputEntity || item.dialog.entity;
      if (item.dialog.isChannel) {
        await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
      } else if (item.dialog.entity && item.dialog.entity.id) {
        await client.invoke(
          new Api.messages.DeleteChatUser({
            chatId: item.dialog.entity.id,
            userId: new Api.InputUserSelf()
          })
        );
      }
      leftCount++;
      await sleepMs(100);
    } catch (e) {
      failedCount++;
    }
  }

  return { totalScanned: candidates.length, leftCount: leftCount, failedCount: failedCount };
}

// B. Join Single Channel with Auto-Clean Oldest 50 on CHANNELS_TOO_MUCH
async function joinSingleChannelWithAutoClean(client, rawUrl, isPrivate) {
  const url = String(rawUrl || "").trim();

  async function attemptJoin() {
    if (isPrivate || isPrivateInviteUrl(url)) {
      const hash = url
        .split("joinchat/").pop()
        .split("+").pop()
        .split("?")[0]
        .replace(/\//g, "")
        .trim();
      try {
        await client.invoke(new Api.messages.ImportChatInvite({ hash: hash }));
        return { joined: true, status: "JOINED_PRIVATE" };
      } catch (e) {
        const msg = String(e.message || "");
        if (msg.indexOf("INVITE_REQUEST_SENT") !== -1) return { joined: true, status: "REQUEST_SENT" };
        if (msg.indexOf("USER_ALREADY_PARTICIPANT") !== -1) return { joined: true, status: "ALREADY_MEMBER" };
        throw e;
      }
    } else {
      const cleanUser = url
        .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "")
        .replace("@", "")
        .split("?")[0]
        .split("/")[0]
        .trim();
      try {
        await client.invoke(new Api.channels.JoinChannel({ channel: cleanUser }));
        return { joined: true, status: "JOINED_PUBLIC" };
      } catch (e) {
        const msg = String(e.message || "");
        if (msg.indexOf("USER_ALREADY_PARTICIPANT") !== -1) return { joined: true, status: "ALREADY_MEMBER" };
        if (msg.indexOf("INVITE_REQUEST_SENT") !== -1) return { joined: true, status: "REQUEST_SENT" };
        throw e;
      }
    }
  }

  try {
    return await attemptJoin();
  } catch (err) {
    if (String(err.message || "").indexOf("CHANNELS_TOO_MUCH") !== -1) {
      const cleanRes = await leaveOldestChannels(client, 50);
      const retryRes = await attemptJoin();
      retryRes.autoCleaned = cleanRes.leftCount;
      return retryRes;
    }
    throw err;
  }
}

// C. NEW: BLOCK ALL BOTS IN AN ACCOUNT (LEAVES 0 BOTS UNBLOCKED!)
async function blockAllBotsOnAccount(client) {
  const dialogs = await client.getDialogs({ limit: 500 });
  const botDialogs = [];

  for (let i = 0; i < dialogs.length; i++) {
    const d = dialogs[i];
    if (d && d.entity && d.entity.className === "User" && d.entity.bot === true) {
      botDialogs.push(d);
    }
  }

  let blockedCount = 0;
  let failedCount = 0;
  const blockedNames = [];
  const errors = [];

  for (let j = 0; j < botDialogs.length; j++) {
    const bd = botDialogs[j];
    const peer = bd.inputEntity || bd.entity;
    const bName = bd.entity.username ? "@" + bd.entity.username : (bd.title || "Bot");

    try {
      await client.invoke(new Api.contacts.Block({ id: peer }));
      try {
        await client.invoke(
          new Api.messages.DeleteHistory({
            peer: peer,
            maxId: 0,
            revoke: true
          })
        );
      } catch (delErr) {}
      blockedCount++;
      if (blockedNames.length < 10) blockedNames.push(bName);
      await sleepMs(120);
    } catch (e) {
      failedCount++;
      if (errors.length < 4) errors.push(bName + ": " + (e.message || "Error"));
    }
  }

  return {
    totalBotsFound: botDialogs.length,
    blockedCount: blockedCount,
    failedCount: failedCount,
    blockedNames: blockedNames,
    errors: errors
  };
}

// D. NEW: DELETE ALL OLD FOLDERS & CREATE 4 SUPER STYLISH FOLDERS (PERSON, CHANNEL, GROUP, BOT)
async function buildSuperStylishFoldersOnAccount(client) {
  let deletedCount = 0;
  let createdCount = 0;
  const createdNames = [];
  const errors = [];

  // 1. Fetch & Delete ALL existing custom folders
  try {
    const filtersRes = await client.invoke(new Api.messages.GetDialogFilters());
    const filtersArr = Array.isArray(filtersRes)
      ? filtersRes
      : (filtersRes && Array.isArray(filtersRes.filters) ? filtersRes.filters : []);

    for (let i = 0; i < filtersArr.length; i++) {
      const f = filtersArr[i];
      if (!f || f.className === "DialogFilterDefault" || !f.id) continue;
      try {
        await client.invoke(new Api.messages.UpdateDialogFilter({ id: Number(f.id) }));
        deletedCount++;
        await sleepMs(150);
      } catch (delErr) {
        errors.push("Delete #" + f.id + ": " + (delErr.message || "Error"));
      }
    }
  } catch (getErr) {
    errors.push("GetFilters: " + (getErr.message || "Error"));
  }

  // 2. Create 4 Super Stylish Folders (Strictly <= 12 chars for Telegram limit!)
  const stylishFolders = [
    {
      id: 2,
      title: "★ ᴘᴇʀꜱᴏɴ",
      emoticon: "👤",
      contacts: true,
      nonContacts: true,
      groups: false,
      broadcasts: false,
      bots: false
    },
    {
      id: 3,
      title: "★ ᴄʜᴀɴɴᴇʟ",
      emoticon: "📢",
      contacts: false,
      nonContacts: false,
      groups: false,
      broadcasts: true,
      bots: false
    },
    {
      id: 4,
      title: "★ ɢʀᴏᴜᴘꜱ",
      emoticon: "👥",
      contacts: false,
      nonContacts: false,
      groups: true,
      broadcasts: false,
      bots: false
    },
    {
      id: 5,
      title: "★ ʙᴏᴛꜱ",
      emoticon: "🤖",
      contacts: false,
      nonContacts: false,
      groups: false,
      broadcasts: false,
      bots: true
    }
  ];

  for (let k = 0; k < stylishFolders.length; k++) {
    const cfg = stylishFolders[k];
    let saved = false;

    // Try standard string title first (GramJS 2.22.2), fallback to TextWithEntities if newer layer
    try {
      const filterObj = new Api.DialogFilter({
        id: cfg.id,
        title: cfg.title,
        emoticon: cfg.emoticon,
        contacts: cfg.contacts,
        nonContacts: cfg.nonContacts,
        groups: cfg.groups,
        broadcasts: cfg.broadcasts,
        bots: cfg.bots,
        excludeMuted: false,
        excludeRead: false,
        excludeArchived: false,
        pinnedPeers: [],
        includePeers: [],
        excludePeers: []
      });
      await client.invoke(new Api.messages.UpdateDialogFilter({ id: cfg.id, filter: filterObj }));
      saved = true;
    } catch (e1) {
      if (Api.TextWithEntities) {
        try {
          const filterObj2 = new Api.DialogFilter({
            id: cfg.id,
            title: new Api.TextWithEntities({ text: cfg.title, entities: [] }),
            emoticon: cfg.emoticon,
            contacts: cfg.contacts,
            nonContacts: cfg.nonContacts,
            groups: cfg.groups,
            broadcasts: cfg.broadcasts,
            bots: cfg.bots,
            excludeMuted: false,
            excludeRead: false,
            excludeArchived: false,
            pinnedPeers: [],
            includePeers: [],
            excludePeers: []
          });
          await client.invoke(new Api.messages.UpdateDialogFilter({ id: cfg.id, filter: filterObj2 }));
          saved = true;
        } catch (e2) {
          errors.push(cfg.title + ": " + (e2.message || e1.message));
        }
      } else {
        errors.push(cfg.title + ": " + (e1.message || "Create failed"));
      }
    }

    if (saved) {
      createdCount++;
      createdNames.push(cfg.emoticon + " " + cfg.title);
    }
    await sleepMs(180);
  }

  return {
    deletedCount: deletedCount,
    createdCount: createdCount,
    createdNames: createdNames,
    errors: errors
  };
}

// E. 0-SECOND PRECISION FIRST-DM SNIPER EXECUTOR (WORKS FROM BOT, CRON & WEBSITE!)
async function executePrecisionFirstDm(allAccounts, defaultApi, job) {
  const target = String(job.target || "").trim();
  const messageText = String(job.message || "").trim();
  const fireEpochMs = Number(job.fireEpochMs || 0);
  const reqPhones = Array.isArray(job.phones) ? job.phones : [];

  const pool = reqPhones.indexOf("ALL") !== -1 || reqPhones.length === 0
    ? allAccounts
    : allAccounts.filter(function (a) { return reqPhones.indexOf(a.phone) !== -1; });

  if (!pool.length || !target || !messageText) {
    return { success: false, sent: 0, total: 0, logs: ["❌ Missing Account, Target or Message!"] };
  }

  // Wait if fire time is > 6 seconds away (safe for up to 50s server hold)
  if (fireEpochMs > 0) {
    const preConnectAt = fireEpochMs - 4500;
    const initialWait = preConnectAt - Date.now();
    if (initialWait > 0 && initialWait <= 48000) {
      await sleepMs(initialWait);
    }
  }

  // STEP 1: Pre-Connect ALL target accounts & resolve target entity BEFORE exact second!
  const readyClients = [];
  const connectErrors = [];

  await Promise.allSettled(
    pool.map(async function (acc) {
      try {
        const client = await connectAccount(acc, defaultApi);
        try {
          const peer = await resolveDmTarget(client, target);
          readyClients.push({ acc: acc, client: client, peer: peer });
        } catch (resolveErr) {
          await safeDisconnect(client);
          connectErrors.push("🔴 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> " + escapeHtml(resolveErr.message));
        }
      } catch (connErr) {
        connectErrors.push("🔴 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> " + escapeHtml(connErr.message));
      }
    })
  );

  if (!readyClients.length) {
    return {
      success: false,
      sent: 0,
      total: pool.length,
      logs: connectErrors.length ? connectErrors : ["❌ Could not connect any selected account!"]
    };
  }

  // STEP 2: Precision wait down to exact millisecond (with -120ms lead compensation)
  const releaseEpochMs = fireEpochMs > 0 ? (fireEpochMs - NETWORK_LEAD_MS) : 0;
  if (releaseEpochMs > Date.now()) {
    const remMs = Math.min(10000, releaseEpochMs - Date.now());
    if (remMs > 18) {
      await sleepMs(remMs - 15);
    }
    while (Date.now() < releaseEpochMs && (releaseEpochMs - Date.now()) < 30) {
      // Exact millisecond spin-lock
    }
  }

  // STEP 3: Fire all DMs simultaneously!
  const sentAtMs = Date.now();
  let sentCount = 0;
  const deliveryLogs = connectErrors.slice();

  await Promise.allSettled(
    readyClients.map(async function (item) {
      try {
        await item.client.sendMessage(item.peer, { message: messageText });
        const ackMs = Date.now();
        const driftFromTarget = fireEpochMs > 0 ? (ackMs - fireEpochMs) : 0;
        sentCount++;
        deliveryLogs.push(
          "🟢 <b>" + escapeHtml(item.acc.name || item.acc.phone) + "</b> ➔ <code>" + escapeHtml(target) + "</code>" +
          (fireEpochMs > 0 ? " (Hit: <b>" + (driftFromTarget >= 0 ? "+" : "") + driftFromTarget + "ms</b>)" : " (Instant)")
        );
      } catch (sendErr) {
        deliveryLogs.push("🔴 <b>" + escapeHtml(item.acc.name || item.acc.phone) + ":</b> " + escapeHtml(sendErr.message || "Send Failed"));
      } finally {
        await safeDisconnect(item.client);
      }
    })
  );

  const actualDrift = fireEpochMs > 0 ? (sentAtMs - fireEpochMs) : 0;
  return {
    success: sentCount > 0,
    sent: sentCount,
    total: pool.length,
    driftMs: actualDrift,
    logs: deliveryLogs
  };
}

// ============================================================================
// 4. DIRECT TELEGRAM BOT API ENGINE & NOTIFIER
// ============================================================================
async function tgBotCall(token, method, payload) {
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

async function notifyAdminBot(htmlText, customChatId) {
  const botCfg = (await fbGet("panel2/bot_config")) || {};
  const token = botCfg.token;
  const targetChat = customChatId || botCfg.adminChatId;
  if (!token || !targetChat) return;
  await tgBotCall(token, "sendMessage", {
    chat_id: targetChat,
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

const BOT_MAIN_KB = {
  keyboard: [
    [{ text: "⏰ FIRST DM SNIPER" }, { text: "🚀 ADVANCED REFER BOT" }],
    [{ text: "🚫 BLOCK ALL BOTS" }, { text: "📂 SUPER STYLISH FOLDERS" }],
    [{ text: "🧹 LEAVE OLDEST 50 CHANNELS" }, { text: "📋 SCHEDULED DM QUEUE" }],
    [{ text: "📱 CONNECTED IDs" }, { text: "🌐 OPEN WEB PANEL" }],
    [{ text: "🔒 LOCK BOT" }]
  ],
  resize_keyboard: true
};

const BOT_CANCEL_KB = {
  keyboard: [[{ text: "❌ CANCEL" }]],
  resize_keyboard: true
};

// Build Main Menu Keyboard listing EVERY connected ID as tappable buttons!
function buildAccountPickerKeyboard(accounts, includeAllButton) {
  const rows = [];
  if (includeAllButton) {
    rows.push([{ text: "✅ ALL CONNECTED IDs (" + accounts.length + ")" }]);
  }
  let row = [];
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i];
    const label = "📱 #" + (i + 1) + " " + String(a.name || "ID").substring(0, 12) + " (" + String(a.phone || "").slice(-4) + ")";
    row.push({ text: label });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) rows.push(row);
  rows.push([{ text: "❌ CANCEL" }]);
  return { keyboard: rows, resize_keyboard: true };
}

function matchPickedAccount(text, accounts) {
  const t = String(text || "").trim();
  if (t.indexOf("ALL CONNECTED") !== -1 || t.toUpperCase() === "ALL") {
    return { isAll: true, phones: ["ALL"], label: "ALL (" + accounts.length + " IDs)" };
  }
  const m = t.match(/#(\d+)/);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    if (accounts[idx]) {
      return { isAll: false, phones: [accounts[idx].phone], label: (accounts[idx].name || "ID") + " (" + accounts[idx].phone + ")" };
    }
  }
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 4) {
    for (let i = 0; i < accounts.length; i++) {
      if (String(accounts[i].phone || "").endsWith(digits)) {
        return { isAll: false, phones: [accounts[i].phone], label: (accounts[i].name || "ID") + " (" + accounts[i].phone + ")" };
      }
    }
  }
  return null;
}

// ============================================================================
// 5. BACKGROUND CRON WORKER (/api/panel2?cron=1) — FIRES TIMED DMs EVEN WHEN WEBSITE IS CLOSED!
// ============================================================================
async function handleCronSniperSweep(req, res) {
  const rawJobs = (await fbGet("panel2/scheduled_dms")) || {};
  const jobs = Object.values(rawJobs).filter(Boolean);
  const nowMs = Date.now();

  // Pick any ARMED/SCHEDULED DM due within the next 52 seconds (or missed by up to 8s)
  const dueJobs = jobs.filter(function (j) {
    if (!j || j.status === "FIRING" || j.status === "FIRED") return false;
    const diff = Number(j.fireEpochMs || 0) - nowMs;
    return diff <= 52000 && diff >= -8000;
  });

  if (dueJobs.length === 0) {
    return res.status(200).json({ ok: true, checked: jobs.length, fired: 0, serverTime: nowMs });
  }

  const allAccounts = await loadAllAccounts();
  const defaultApi = (await fbGet("panel/api_config")) || {};
  const results = [];

  await Promise.allSettled(
    dueJobs.map(async function (job) {
      // Atomic Firebase lock so Website + Cron NEVER double-send!
      job.status = "FIRING";
      await fbSet("panel2/scheduled_dms/" + job.id, job);

      const execRes = await executePrecisionFirstDm(allAccounts, defaultApi, job);
      await fbSet("panel2/scheduled_dms/" + job.id, null);

      const reportHtml =
        (execRes.success ? "🎯 <b>EXACT-TIME FIRST-DM FIRED!</b>" : "❌ <b>TIMED DM FAILED!</b>") + "\n\n" +
        "👤 <b>Target:</b> <code>" + escapeHtml(job.target) + "</code>\n" +
        "⏰ <b>Scheduled (IST):</b> <code>" + escapeHtml(job.istTimeStr || "Exact") + "</code>\n" +
        "📊 <b>Delivered:</b> <code>" + execRes.sent + " / " + execRes.total + " ID(s)</code>\n\n" +
        execRes.logs.join("\n");

      await notifyAdminBot(reportHtml, job.adminChatId);
      results.push({ id: job.id, sent: execRes.sent, success: execRes.success });
    })
  );

  return res.status(200).json({ ok: true, fired: results.length, results: results });
}

// ============================================================================
// 6. DIRECT TELEGRAM BOT WEBHOOK HANDLER (?webhook=1)
// ============================================================================
async function handleTelegramBotWebhook(req, res) {
  const botCfg = (await fbGet("panel2/bot_config")) || {};
  const token = botCfg.token;
  if (!token) return res.status(200).json({ ok: true });

  const update = parseReqBody(req);
  const msgObj = update.message;
  if (!msgObj || !msgObj.chat) return res.status(200).json({ ok: true });

  const chatId = String(msgObj.chat.id);
  const text = String(msgObj.text || "").trim();
  const statePath = "panel2/bot_states/" + chatId;
  let uState = (await fbGet(statePath)) || { unlocked: false, step: "" };

  async function replyBot(htmlText, kb) {
    await tgBotCall(token, "sendMessage", {
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: kb || (uState.unlocked ? BOT_MAIN_KB : { remove_keyboard: true })
    });
  }

  if (text === "🔒 LOCK BOT") {
    uState.unlocked = false;
    uState.step = "";
    await fbSet(statePath, uState);
    await replyBot("🔒 <b>Bot Locked!</b> Send Master PIN (<code>252010</code>) to unlock.", { remove_keyboard: true });
    return res.status(200).json({ ok: true });
  }

  if (!uState.unlocked) {
    if (text === MASTER_PIN) {
      uState.unlocked = true;
      uState.step = "";
      await fbSet(statePath, uState);
      // Save adminChatId so Cron & Website can send live reports straight to this chat!
      botCfg.adminChatId = chatId;
      await fbSet("panel2/bot_config", botCfg);

      await replyBot(
        "🔓 <b>PANEL 2 BOT UNLOCKED!</b>\n\n" +
        "✅ Live Success &amp; Error Alerts Enabled for this Chat!\n\n" +
        "👇 <b>Choose a module below:</b>\n" +
        "• <b>⏰ FIRST DM SNIPER</b> (Select ID ➔ Target ➔ Exact 0s Time)\n" +
        "• <b>🚀 ADVANCED REFER BOT</b> (Direct Link ➔ Auto Join + Claim + Contact + Mini-App)\n" +
        "• <b>🚫 BLOCK ALL BOTS</b> (Select ID ➔ Blocks 100% Bots)\n" +
        "• <b>📂 SUPER STYLISH FOLDERS</b> (Deletes Old ➔ Creates Person/Channel/Group/Bot)",
        BOT_MAIN_KB
      );
      return res.status(200).json({ ok: true });
    }
    await replyBot("🔐 <b>PANEL 2 DIRECT BOT LOCKED</b>\n\n👇 Send 6-Digit Master PIN to unlock:", { remove_keyboard: true });
    return res.status(200).json({ ok: true });
  }

  if (text === "/start" || text === "❌ CANCEL") {
    uState.step = "";
    await fbSet(statePath, uState);
    await replyBot("👑 <b>PANEL 2 COMMAND MENU READY</b>\nChoose any tool below:", BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  const allAccounts = await loadAllAccounts();
  const defaultApi = (await fbGet("panel/api_config")) || {};

  // ---- MAIN MENU TRIGGERS ----
  if (text === "🌐 OPEN WEB PANEL") {
    const hostUrl = "https://" + (req.headers.host || "kumartelegrambot.vercel.app") + "/api/panel2";
    await replyBot("🌐 <b>Panel 2 Website:</b>\n" + hostUrl + "\n🔑 <b>PIN:</b> <code>252010</code>", BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  if (text === "📱 CONNECTED IDs") {
    if (!allAccounts.length) {
      await replyBot("📭 No connected IDs found in Firebase.", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    let out = "📱 <b>CONNECTED ACCOUNTS (" + allAccounts.length + " IDs)</b>\n\n";
    for (let i = 0; i < allAccounts.length; i++) {
      out += "<b>[" + (i + 1) + "]</b> " + escapeHtml(allAccounts[i].name || "User") + " — <code>" + escapeHtml(allAccounts[i].phone) + "</code>\n";
    }
    await replyBot(out, BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  if (text === "📋 SCHEDULED DM QUEUE") {
    const raw = (await fbGet("panel2/scheduled_dms")) || {};
    const list = Object.values(raw).filter(Boolean);
    if (!list.length) {
      await replyBot("📭 <b>No Scheduled First-DMs in Queue!</b>", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    let qTxt = "📋 <b>ARMED FIRST-DM SNIPER QUEUE (" + list.length + ")</b>\n\n";
    for (let i = 0; i < list.length; i++) {
      qTxt +=
        "<b>[" + (i + 1) + "] ⏰ " + escapeHtml(list[i].istTimeStr) + " IST</b>\n" +
        " ┣ 🎯 Target: <code>" + escapeHtml(list[i].target) + "</code>\n" +
        " ┣ 💬 Msg: <i>" + escapeHtml(String(list[i].message || "").substring(0, 50)) + "</i>\n" +
        " ┗ 📌 Status: <b>" + escapeHtml(list[i].status) + "</b>\n\n";
    }
    await replyBot(qTxt, BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  // 1. FIRST DM SNIPER -> SHOW ALL IDs AS MAIN MENU BUTTONS FIRST!
  if (text === "⏰ FIRST DM SNIPER") {
    if (!allAccounts.length) {
      await replyBot("❌ No connected IDs found in Firebase!", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    uState.step = "dm_pick_id";
    await fbSet(statePath, uState);
    await replyBot(
      "⏰ <b>FIRST DM GIVEAWAY SNIPER (STEP 1 OF 4)</b>\n\n👇 <b>Tap the Telegram ID button below that will send the First DM:</b>",
      buildAccountPickerKeyboard(allAccounts, true)
    );
    return res.status(200).json({ ok: true });
  }

  // 2. ADVANCED REFER BOT -> NO ID SELECTION! DIRECTLY ASKS FOR REFER LINK!
  if (text === "🚀 ADVANCED REFER BOT") {
    uState.step = "refer_direct_link";
    await fbSet(statePath, uState);
    await replyBot(
      "🚀 <b>ADVANCED REFER BOT</b>\n\n👇 <b>Send the Bot Referral Link directly:</b>\nExample: <code>https://t.me/EarningBot?start=123456</code>\n\n⚡ <i>Runs automatically on your connected IDs!</i>",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  // 3. BLOCK ALL BOTS -> SHOW ALL IDs AS MAIN MENU BUTTONS FIRST!
  if (text === "🚫 BLOCK ALL BOTS") {
    if (!allAccounts.length) {
      await replyBot("❌ No connected IDs found!", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    uState.step = "blockbots_pick_id";
    await fbSet(statePath, uState);
    await replyBot(
      "🚫 <b>BLOCK ALL BOTS CLEANER</b>\n\n👇 <b>Select the ID where you want to BLOCK &amp; DELETE 100% of all bots (0 bots left):</b>",
      buildAccountPickerKeyboard(allAccounts, true)
    );
    return res.status(200).json({ ok: true });
  }

  // 4. SUPER STYLISH FOLDERS -> SHOW ALL IDs AS MAIN MENU BUTTONS FIRST!
  if (text === "📂 SUPER STYLISH FOLDERS") {
    if (!allAccounts.length) {
      await replyBot("❌ No connected IDs found!", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    uState.step = "folders_pick_id";
    await fbSet(statePath, uState);
    await replyBot(
      "📂 <b>SUPER STYLISH TELEGRAM FOLDERS</b>\n\nDeletes all old folders &amp; creates:\n• 👤 <b>★ ᴘᴇʀꜱᴏɴ</b>\n• 📢 <b>★ ᴄʜᴀɴɴᴇʟ</b>\n• 👥 <b>★ ɢʀᴏᴜᴘꜱ</b>\n• 🤖 <b>★ ʙᴏᴛꜱ</b>\n\n👇 <b>Select 1 ID or ALL IDs below:</b>",
      buildAccountPickerKeyboard(allAccounts, true)
    );
    return res.status(200).json({ ok: true });
  }

  // 5. LEAVE OLDEST 50 CHANNELS -> SHOW ALL IDs AS MAIN MENU BUTTONS!
  if (text === "🧹 LEAVE OLDEST 50 CHANNELS") {
    if (!allAccounts.length) {
      await replyBot("❌ No connected IDs found!", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    uState.step = "clean50_pick_id";
    await fbSet(statePath, uState);
    await replyBot(
      "🧹 <b>LEAVE OLDEST 50 INACTIVE CHANNELS</b>\n\n👇 <b>Select the ID to clean its bottom 50 oldest channels:</b>",
      buildAccountPickerKeyboard(allAccounts, true)
    );
    return res.status(200).json({ ok: true });
  }

  // ==========================================================================
  // MULTI-STEP HANDLERS INSIDE DIRECT TELEGRAM BOT
  // ==========================================================================

  // ---- STEP A: FIRST DM SNIPER FLOW ----
  if (uState.step === "dm_pick_id") {
    const picked = matchPickedAccount(text, allAccounts);
    if (!picked) {
      await replyBot("⚠️ Tap one of the ID buttons below!", buildAccountPickerKeyboard(allAccounts, true));
      return res.status(200).json({ ok: true });
    }
    uState.dmPhones = picked.phones;
    uState.dmPickedLabel = picked.label;
    uState.step = "dm_enter_target";
    await fbSet(statePath, uState);
    await replyBot(
      "✅ <b>Selected ID:</b> " + escapeHtml(picked.label) + "\n\n" +
      "🎯 <b>STEP 2 OF 4:</b> Send the Target <code>@username</code> or numeric <code>User ID</code> to DM:",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "dm_enter_target") {
    uState.dmTarget = text;
    uState.step = "dm_enter_msg";
    await fbSet(statePath, uState);
    await replyBot(
      "🎯 <b>Target Locked:</b> <code>" + escapeHtml(text) + "</code>\n\n" +
      "💬 <b>STEP 3 OF 4:</b> Send the exact DM Message to fire:",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "dm_enter_msg") {
    uState.dmMsg = text;
    uState.step = "dm_enter_time";
    await fbSet(statePath, uState);

    const istNow = new Date(Date.now() + 5.5 * 3600000);
    const curStr =
      String(istNow.getUTCHours()).padStart(2, "0") + ":" +
      String(istNow.getUTCMinutes()).padStart(2, "0") + ":" +
      String(istNow.getUTCSeconds()).padStart(2, "0");

    const nextMin = new Date(Date.now() + 5.5 * 3600000 + 60000);
    const nextMinStr =
      String(nextMin.getUTCHours()).padStart(2, "0") + ":" +
      String(nextMin.getUTCMinutes()).padStart(2, "0") + ":00";

    const timeKb = {
      keyboard: [
        [{ text: "⚡ NOW (INSTANT)" }, { text: nextMinStr }],
        [{ text: "❌ CANCEL" }]
      ],
      resize_keyboard: true
    };

    await replyBot(
      "⏰ <b>STEP 4 OF 4: SET EXACT FIRE TIME (IST)</b>\n\n" +
      "🕒 <b>Current Atomic IST Time:</b> <code>" + curStr + "</code>\n" +
      "👇 Send exact 24-hour time as <code>HH:MM:SS</code> (e.g. <code>23:45:00</code>) OR tap <b>⚡ NOW</b>:",
      timeKb
    );
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "dm_enter_time") {
    const dmPhones = uState.dmPhones || ["ALL"];
    const dmTarget = uState.dmTarget;
    const dmMsg = uState.dmMsg;
    uState.step = "";
    await fbSet(statePath, uState);

    // Instant DM
    if (text.toUpperCase().indexOf("NOW") !== -1) {
      await replyBot("⚡ <b>Firing Instant DM now...</b>", BOT_MAIN_KB);
      const resDm = await executePrecisionFirstDm(allAccounts, defaultApi, {
        phones: dmPhones,
        target: dmTarget,
        message: dmMsg,
        fireEpochMs: 0
      });
      await replyBot(
        (resDm.success ? "✅ <b>INSTANT DM SENT!</b>" : "❌ <b>DM FAILED!</b>") + "\n\n" + resDm.logs.join("\n"),
        BOT_MAIN_KB
      );
      return res.status(200).json({ ok: true });
    }

    // Parse HH:MM:SS in IST
    const tm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!tm) {
      await replyBot("❌ Invalid Time! Use <code>HH:MM:SS</code> (e.g. <code>23:45:00</code>).", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    const hh = parseInt(tm[1], 10);
    const mm = parseInt(tm[2], 10);
    const ss = parseInt(tm[3] || "0", 10);

    const nowUtc = Date.now();
    const istOffsetMs = 5.5 * 3600000;
    const nowIst = new Date(nowUtc + istOffsetMs);
    const targetIst = new Date(Date.UTC(
      nowIst.getUTCFullYear(),
      nowIst.getUTCMonth(),
      nowIst.getUTCDate(),
      hh, mm, ss, 0
    ));
    let fireEpochMs = targetIst.getTime() - istOffsetMs;
    if (fireEpochMs <= nowUtc - 1000) {
      fireEpochMs += 24 * 3600000;
    }

    const diffMs = fireEpochMs - nowUtc;
    const job = {
      id: "DM_" + Date.now(),
      phones: dmPhones,
      target: dmTarget,
      message: dmMsg,
      fireEpochMs: fireEpochMs,
      istTimeStr: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0"),
      adminChatId: chatId,
      status: "ARMED"
    };

    // ENGINE A: If <= 50 seconds away, hold & fire DIRECTLY inside server right now (0 website needed!)
    if (diffMs <= 50000) {
      await replyBot(
        "🔥 <b>SNIPER ARMED — DIRECT SERVER HOLD!</b>\n" +
        "🎯 <b>Target:</b> <code>" + escapeHtml(dmTarget) + "</code>\n" +
        "⏰ <b>Firing in:</b> <code>" + (diffMs / 1000).toFixed(1) + "s</code> at exact <code>" + job.istTimeStr + ".000 IST</code>\n" +
        "⚡ <i>Pre-connecting 4s early... Website open karaychi garaj nahi!</i>",
        BOT_MAIN_KB
      );
      const execRes = await executePrecisionFirstDm(allAccounts, defaultApi, job);
      await replyBot(
        (execRes.success ? "🎯 <b>EXACT-TIME FIRST-DM FIRED!</b>" : "❌ <b>TIMED DM FAILED!</b>") + "\n\n" +
        "👤 <b>Target:</b> <code>" + escapeHtml(dmTarget) + "</code>\n" +
        "⏰ <b>Target Time:</b> <code>" + job.istTimeStr + " IST</code>\n" +
        "📊 <b>Delivered:</b> <code>" + execRes.sent + " / " + execRes.total + " ID(s)</code>\n\n" +
        execRes.logs.join("\n"),
        BOT_MAIN_KB
      );
      return res.status(200).json({ ok: true });
    }

    // ENGINE B: > 50 seconds away -> Save to Firebase for 24/7 Background Cron (/api/panel2?cron=1)
    await fbSet("panel2/scheduled_dms/" + job.id, job);
    await replyBot(
      "⏰ <b>EXACT-TIME FIRST-DM SCHEDULED!</b>\n\n" +
      "🎯 <b>Target:</b> <code>" + escapeHtml(dmTarget) + "</code>\n" +
      "🕒 <b>Exact Time (IST):</b> <code>" + job.istTimeStr + ".000</code>\n" +
      "📱 <b>Sender:</b> " + escapeHtml(uState.dmPickedLabel || "Selected ID") + "\n\n" +
      "✅ <b>Auto-Fire Ready:</b> Your 1-min Cron (<code>/api/panel2?cron=1</code>) will pre-connect 4s early &amp; fire at exact <code>000ms</code> even when website is CLOSED! Live result will arrive here.",
      BOT_MAIN_KB
    );
    return res.status(200).json({ ok: true });
  }

  // ---- STEP B: DIRECT REFER BOT (NO ID SELECTION) ----
  if (uState.step === "refer_direct_link") {
    uState.step = "";
    await fbSet(statePath, uState);
    const parsed = parseReferBotLink(text);
    if (!parsed.botUser) {
      await replyBot("❌ Invalid Bot Referral Link!", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    await replyBot("🚀 <b>Running Advanced Refer Bot on " + allAccounts.length + " ID(s)...</b>", BOT_MAIN_KB);
    const logs = [];

    await Promise.allSettled(
      allAccounts.map(function (acc) {
        return withTimeout(
          (async function () {
            const client = await connectAccount(acc, defaultApi);
            try {
              const botEntity = await client.getInputEntity(parsed.botUser);
              if (parsed.startParam) {
                await client.invoke(new Api.messages.StartBot({
                  bot: botEntity,
                  peer: botEntity,
                  startParam: parsed.startParam,
                  randomId: BigInt(Math.floor(Math.random() * 1e12))
                }));
              } else {
                await client.sendMessage(botEntity, { message: "/start" });
              }
              await sleepMs(1500);
              const msgs = await client.getMessages(botEntity, { limit: 3 });
              let pubJoined = 0;
              let privJoined = 0;
              let notes = [];

              if (msgs && msgs[0]) {
                const ctrl = extractMessageControls(msgs[0]);
                for (let p = 0; p < ctrl.publicChannels.length; p++) {
                  try {
                    await joinSingleChannelWithAutoClean(client, ctrl.publicChannels[p].url, false);
                    pubJoined++;
                  } catch (e) {}
                }
                for (let pr = 0; pr < ctrl.privateChannels.length; pr++) {
                  try {
                    await joinSingleChannelWithAutoClean(client, ctrl.privateChannels[pr].url, true);
                    privJoined++;
                    if (pr < ctrl.privateChannels.length - 1) await sleepMs(10000);
                  } catch (e) {
                    notes.push("PrivErr:" + (e.message || "Fail"));
                  }
                }
                if (ctrl.inlineButtons.length > 0) {
                  const lastBtn = ctrl.inlineButtons[ctrl.inlineButtons.length - 1];
                  if (lastBtn.hasData) {
                    try {
                      await client.invoke(new Api.messages.GetBotCallbackAnswer({
                        peer: botEntity,
                        msgId: msgs[0].id,
                        data: Buffer.from(lastBtn.dataHex, "hex")
                      }));
                      notes.push("Claimed:" + lastBtn.text);
                    } catch (e) {}
                  }
                }
                await sleepMs(1200);
                const afterMsgs = await client.getMessages(botEntity, { limit: 2 });
                if (afterMsgs && afterMsgs[0]) {
                  const c2 = extractMessageControls(afterMsgs[0]);
                  if (c2.hasContactShareButton) {
                    const me = await client.getMe();
                    await client.invoke(new Api.messages.SendMedia({
                      peer: botEntity,
                      media: new Api.InputMediaContact({
                        phoneNumber: String(me.phone || acc.phone).replace("+", ""),
                        firstName: me.firstName || acc.name || "User",
                        lastName: me.lastName || "",
                        vcard: ""
                      }),
                      message: "",
                      randomId: BigInt(Math.floor(Math.random() * 1e12))
                    }));
                    notes.push("ContactShared");
                  }
                }
              }
              logs.push("🟢 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Pub:" + pubJoined + " Priv:" + privJoined + (notes.length ? " (" + escapeHtml(notes.join(", ")) + ")" : ""));
            } catch (err) {
              logs.push("🔴 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> " + escapeHtml(err.message || "Error"));
            } finally {
              await safeDisconnect(client);
            }
          })(),
          45000
        );
      })
    );

    await replyBot("🚀 <b>ADVANCED REFER REPORT:</b>\n\n" + logs.join("\n"), BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  // ---- STEP C: BLOCK ALL BOTS ----
  if (uState.step === "blockbots_pick_id") {
    const picked = matchPickedAccount(text, allAccounts);
    if (!picked) {
      await replyBot("⚠️ Tap one of the ID buttons below!", buildAccountPickerKeyboard(allAccounts, true));
      return res.status(200).json({ ok: true });
    }
    uState.step = "";
    await fbSet(statePath, uState);

    const pool = picked.isAll
      ? allAccounts
      : allAccounts.filter(function (a) { return picked.phones.indexOf(a.phone) !== -1; });

    await replyBot("🚫 <b>Scanning &amp; Blocking ALL Bots on " + escapeHtml(picked.label) + "...</b>", BOT_MAIN_KB);
    const reportLines = [];

    await Promise.allSettled(
      pool.map(function (acc) {
        return withTimeout(
          (async function () {
            const client = await connectAccount(acc, defaultApi);
            try {
              const r = await blockAllBotsOnAccount(client);
              reportLines.push(
                "🟢 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Found <code>" + r.totalBotsFound +
                "</code> bots ➔ Blocked &amp; Deleted <code>" + r.blockedCount + "</code>" +
                (r.failedCount ? " | ⚠️ Failed: " + r.failedCount : "") +
                (r.errors.length ? "\n   ↳ Err: <code>" + escapeHtml(r.errors.join("; ")) + "</code>" : "")
              );
            } catch (err) {
              reportLines.push("🔴 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> " + escapeHtml(err.message || "Failed"));
            } finally {
              await safeDisconnect(client);
            }
          })(),
          45000
        );
      })
    );

    await replyBot("🚫 <b>BLOCK ALL BOTS REPORT (0 BOTS LEFT):</b>\n\n" + reportLines.join("\n"), BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  // ---- STEP D: SUPER STYLISH FOLDERS ----
  if (uState.step === "folders_pick_id") {
    const picked = matchPickedAccount(text, allAccounts);
    if (!picked) {
      await replyBot("⚠️ Tap one of the ID buttons below!", buildAccountPickerKeyboard(allAccounts, true));
      return res.status(200).json({ ok: true });
    }
    uState.step = "";
    await fbSet(statePath, uState);

    const pool = picked.isAll
      ? allAccounts
      : allAccounts.filter(function (a) { return picked.phones.indexOf(a.phone) !== -1; });

    await replyBot("📂 <b>Deleting Old Folders &amp; Creating Super Stylish Folders on " + escapeHtml(picked.label) + "...</b>", BOT_MAIN_KB);
    const reportLines = [];

    await Promise.allSettled(
      pool.map(function (acc) {
        return withTimeout(
          (async function () {
            const client = await connectAccount(acc, defaultApi);
            try {
              const r = await buildSuperStylishFoldersOnAccount(client);
              reportLines.push(
                "🟢 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Deleted <code>" + r.deletedCount +
                "</code> old ➔ Created <code>" + r.createdCount + "/4</code> (" + escapeHtml(r.createdNames.join(", ")) + ")" +
                (r.errors.length ? "\n   ↳ ⚠️ Err: <code>" + escapeHtml(r.errors.join("; ")) + "</code>" : "")
              );
            } catch (err) {
              reportLines.push("🔴 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> " + escapeHtml(err.message || "Failed"));
            } finally {
              await safeDisconnect(client);
            }
          })(),
          35000
        );
      })
    );

    await replyBot("📂 <b>SUPER STYLISH FOLDERS REPORT:</b>\n\n" + reportLines.join("\n"), BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  // ---- STEP E: LEAVE OLDEST 50 CHANNELS ----
  if (uState.step === "clean50_pick_id") {
    const picked = matchPickedAccount(text, allAccounts);
    if (!picked) {
      await replyBot("⚠️ Tap one of the ID buttons below!", buildAccountPickerKeyboard(allAccounts, true));
      return res.status(200).json({ ok: true });
    }
    uState.step = "";
    await fbSet(statePath, uState);

    const pool = picked.isAll
      ? allAccounts
      : allAccounts.filter(function (a) { return picked.phones.indexOf(a.phone) !== -1; });

    await replyBot("🧹 <b>Leaving Oldest 50 Channels on " + escapeHtml(picked.label) + "...</b>", BOT_MAIN_KB);
    const reportLines = [];

    await Promise.allSettled(
      pool.map(function (acc) {
        return withTimeout(
          (async function () {
            const client = await connectAccount(acc, defaultApi);
            try {
              const r = await leaveOldestChannels(client, 50);
              reportLines.push("🟢 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Left <code>" + r.leftCount + "</code> oldest channels (Scanned: " + r.totalScanned + ")");
            } catch (err) {
              reportLines.push("🔴 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> " + escapeHtml(err.message || "Failed"));
            } finally {
              await safeDisconnect(client);
            }
          })(),
          40000
        );
      })
    );

    await replyBot("🧹 <b>OLDEST 50 CHANNELS CLEANUP REPORT:</b>\n\n" + reportLines.join("\n"), BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  await replyBot("⚡ Select an option from the menu below:", BOT_MAIN_KB);
  return res.status(200).json({ ok: true });
}

// ============================================================================
// 7. PANEL 2 MASTER WEB UI (REFER, 0MS SNIPER, BLOCK ALL BOTS, SUPER FOLDERS, DIRECT BOT)
// ============================================================================
function renderPanel2UI() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>⚡ PANEL 2 • REFER, 0MS DM SNIPER, BLOCK BOTS &amp; STYLISH FOLDERS ⚡</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #040611;
      --bg-card: rgba(13, 19, 39, 0.94);
      --bg-input: #060916;
      --accent: #00f0ff;
      --accent-glow: rgba(0, 240, 255, 0.38);
      --gold: #f59e0b;
      --success: #10b981;
      --danger: #f43f5e;
      --text-main: #ffffff;
      --text-sub: #cbd5e1;
      --text-dim: #94a3b8;
      --border-glass: rgba(0, 240, 255, 0.25);
      --border-strong: rgba(0, 240, 255, 0.78);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      background-image:
        radial-gradient(circle at 12% 10%, rgba(0, 240, 255, 0.14) 0%, transparent 35%),
        radial-gradient(circle at 88% 85%, rgba(168, 85, 247, 0.16) 0%, transparent 35%);
      background-attachment: fixed;
    }

    #vault-lock {
      position: fixed; inset: 0; z-index: 99999;
      background: radial-gradient(circle at top, #121c3c 0%, #03050d 100%);
      display: flex; align-items: center; justify-content: center; padding: 16px;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }
    #vault-lock.unlocked { opacity: 0; visibility: hidden; pointer-events: none; }

    .vault-card {
      width: 100%; max-width: 410px;
      background: rgba(11, 16, 34, 0.96);
      border: 2px solid var(--border-strong);
      border-radius: 26px; padding: 28px 22px; text-align: center;
      box-shadow: 0 0 60px var(--accent-glow);
    }
    .vault-badge {
      display: inline-block; padding: 6px 14px; border-radius: 99px;
      background: rgba(0, 240, 255, 0.14); border: 1px solid var(--accent);
      color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 800;
      margin-bottom: 12px;
    }
    .vault-title { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 6px; }

    .shell { max-width: 1220px; margin: 0 auto; padding: 16px 14px 90px; }

    .header-bar {
      background: linear-gradient(135deg, rgba(16, 24, 48, 0.96), rgba(7, 11, 24, 0.96));
      border: 1.5px solid var(--border-strong); border-radius: 22px; padding: 18px 22px;
      margin-bottom: 16px; display: flex; flex-wrap: wrap; align-items: center;
      justify-content: space-between; gap: 14px;
      box-shadow: 0 10px 34px rgba(0, 0, 0, 0.6), 0 0 24px var(--accent-glow);
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .logo-box {
      width: 54px; height: 54px; border-radius: 16px;
      background: linear-gradient(135deg, #00f0ff, #a855f7);
      display: flex; align-items: center; justify-content: center; font-size: 26px;
    }
    .header-left h1 { font-family: 'Orbitron', sans-serif; font-size: 17px; color: var(--accent); }
    .header-left p { font-size: 12px; color: var(--text-sub); margin-top: 3px; }

    .clock-sync-box {
      background: #050a18; border: 1px solid var(--success); border-radius: 12px;
      padding: 8px 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: #34d399; font-weight: 800;
    }

    .selector-bar {
      background: var(--bg-card); border: 1.5px solid var(--border-strong);
      border-radius: 20px; padding: 14px 18px; margin-bottom: 16px;
    }
    .selector-head {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 10px; margin-bottom: 10px;
    }
    .selector-head span { font-size: 13px; font-weight: 800; color: var(--accent); }
    .chips-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
    .acc-chip {
      display: inline-flex; align-items: center; gap: 7px;
      background: var(--bg-input); border: 1.5px solid var(--border-glass);
      color: var(--text-sub); padding: 7px 12px; border-radius: 11px;
      font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 700;
      cursor: pointer; user-select: none;
    }
    .acc-chip.selected {
      background: rgba(16, 185, 129, 0.18); border-color: var(--success);
      color: #fff; box-shadow: 0 0 14px rgba(16, 185, 129, 0.35);
    }
    .acc-chip .dot { width: 8px; height: 8px; border-radius: 50%; background: #64748b; }
    .acc-chip.selected .dot { background: var(--success); }

    .nav-tabs {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
      gap: 9px; margin-bottom: 16px;
    }
    .nav-btn {
      background: var(--bg-card); border: 1px solid var(--border-glass);
      border-radius: 14px; padding: 13px 10px; color: var(--text-sub);
      font-size: 12px; font-weight: 800; cursor: pointer; text-align: center;
    }
    .nav-btn.active {
      background: linear-gradient(135deg, #00f0ff, #8b5cf6);
      color: #030712; border-color: #fff; box-shadow: 0 0 22px var(--accent-glow);
    }

    .pane { display: none; }
    .pane.active { display: block; }

    .grid-2 {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 16px; margin-bottom: 16px;
    }

    .card {
      background: var(--bg-card); border: 1px solid var(--border-glass);
      border-radius: 22px; padding: 20px; margin-bottom: 16px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    }
    .card-head {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 10px; padding-bottom: 12px; margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .card-title { font-size: 15px; font-weight: 800; color: var(--accent); }
    .tag {
      background: rgba(0, 240, 255, 0.14); border: 1px solid var(--accent);
      color: var(--accent); padding: 3px 10px; border-radius: 99px;
      font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 800;
    }

    .field { margin-bottom: 13px; }
    .field label {
      display: block; font-size: 11px; font-weight: 800; color: var(--text-sub);
      margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;
    }

    .inp, .txtarea, .sel {
      width: 100%; padding: 13px 15px; background: var(--bg-input);
      border: 1.5px solid var(--border-glass); border-radius: 13px;
      color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; outline: none;
    }
    .inp:focus, .txtarea:focus, .sel:focus { border-color: var(--accent); box-shadow: 0 0 16px var(--accent-glow); }
    .txtarea { min-height: 95px; resize: vertical; }

    .btn {
      width: 100%; padding: 13px 16px; border: none; border-radius: 13px;
      font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 800;
      text-transform: uppercase; cursor: pointer; display: inline-flex;
      align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;
    }
    .btn-cyan { background: linear-gradient(90deg, #00f0ff, #0284c7); color: #020617; }
    .btn-green { background: linear-gradient(90deg, #10b981, #059669); color: #fff; }
    .btn-gold { background: linear-gradient(90deg, #f59e0b, #d97706); color: #020617; }
    .btn-red { background: linear-gradient(90deg, #f43f5e, #e11d48); color: #fff; }
    .btn-purple { background: linear-gradient(90deg, #8b5cf6, #ec4899); color: #fff; }
    .btn-outline { background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); color: var(--accent); }
    .btn-sm { width: auto; padding: 7px 13px; font-size: 11px; margin-bottom: 0; border-radius: 9px; }

    .pipeline-monitor {
      background: #03060f; border: 1.5px solid var(--border-strong);
      border-radius: 16px; padding: 14px; font-family: 'JetBrains Mono', monospace;
      font-size: 12px; color: #bae6fd; max-height: 290px; overflow-y: auto;
      line-height: 1.65; white-space: pre-wrap;
    }
    .log-line { padding-left: 8px; border-left: 3px solid var(--accent); margin-bottom: 7px; }

    .miniapp-timer-box {
      display: none; margin-top: 12px; padding: 16px; border-radius: 16px;
      background: rgba(16, 185, 129, 0.14); border: 2px solid var(--success);
      text-align: center; font-family: 'JetBrains Mono', monospace;
    }
    .miniapp-timer-num { font-size: 32px; font-weight: 900; color: #34d399; margin: 4px 0; }

    .sniper-countdown-box {
      background: rgba(245, 158, 11, 0.12); border: 2px solid var(--gold);
      border-radius: 16px; padding: 16px; text-align: center; margin-top: 12px;
      font-family: 'JetBrains Mono', monospace;
    }
    .sniper-clock { font-size: 28px; font-weight: 900; color: #fde68a; letter-spacing: 2px; }

    .queue-item {
      background: #050a18; border: 1px solid var(--border-glass); border-radius: 12px;
      padding: 12px; margin-bottom: 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    }

    .info-banner {
      background: rgba(0, 240, 255, 0.08); border: 1px dashed var(--accent);
      border-radius: 13px; padding: 11px 14px; font-size: 12px; color: var(--text-sub);
      margin-bottom: 14px; line-height: 1.55;
    }

    #toast-box { position: fixed; bottom: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; gap: 8px; }
    .toast {
      background: #0e162e; border-left: 4px solid var(--accent); border: 1px solid var(--border-glass);
      color: #fff; padding: 11px 15px; border-radius: 11px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
    }
  </style>
</head>
<body>

  <!-- 1. MASTER PIN LOCK (252010) -->
  <div id="vault-lock">
    <div class="vault-card">
      <div class="vault-badge">🔐 PANEL 2 SECURITY VAULT</div>
      <div class="vault-title">ENTER MASTER PIN</div>
      <p style="font-size:13px;color:var(--text-sub);margin-bottom:18px;">Enter 6-Digit Password to Unlock Panel 2 Automation Suite</p>
      <input type="password" id="inp-pin" class="inp" style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:14px;" maxlength="6" placeholder="••••••" />
      <button type="button" class="btn btn-cyan" id="btn-unlock">🔓 UNLOCK PANEL 2</button>
      <div id="pin-msg" style="font-size:12px;color:#fda4af;margin-top:8px;min-height:18px;"></div>
    </div>
  </div>

  <!-- 2. MAIN DASHBOARD -->
  <div class="shell">
    <header class="header-bar">
      <div class="header-left">
        <div class="logo-box">⚡</div>
        <div>
          <h1>KUMAR PANEL 2 • REFER, 0MS DM, BLOCK BOTS &amp; FOLDERS</h1>
          <p>24/7 Cron First-DM Sniper • Advanced Refer • 100% Block All Bots • Super Stylish Folders • Direct Bot Controller</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div class="clock-sync-box" id="live-ist-clock">🕒 SYNCING ATOMIC TIME...</div>
        <button type="button" class="btn btn-red btn-sm" id="btn-lock-now">🔒 LOCK</button>
      </div>
    </header>

    <!-- SHARED ACCOUNT SELECTOR BAR -->
    <div class="selector-bar">
      <div class="selector-head">
        <span>📱 SHARED FIREBASE TELEGRAM IDs (<b id="lbl-sel-count">0/0</b> SELECTED)</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-green btn-sm" id="btn-sel-all">✅ SELECT ALL</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-sel-none">❌ CLEAR</button>
          <button type="button" class="btn btn-gold btn-sm" id="btn-refresh-accs">🔄 SYNC FIREBASE</button>
        </div>
      </div>
      <div class="chips-wrap" id="chips-wrap">
        <span style="font-size:12px;color:var(--text-dim);">Loading accounts from Firebase...</span>
      </div>
    </div>

    <!-- 4 FOCUSED NAVIGATION TABS -->
    <div class="nav-tabs">
      <button type="button" class="nav-btn active" data-pane="pane-dm">
        ⏰ 1. FIRST-DM SNIPER (0MS)
      </button>
      <button type="button" class="nav-btn" data-pane="pane-refer">
        🚀 2. ADVANCED REFER BOT
      </button>
      <button type="button" class="nav-btn" data-pane="pane-clean-folder">
        🚫 3. BLOCK BOTS &amp; STYLISH FOLDERS
      </button>
      <button type="button" class="nav-btn" data-pane="pane-bot">
        🤖 4. DIRECT BOT &amp; 24/7 CRON
      </button>
    </div>

    <!-- LIVE EXECUTION LOG TERMINAL -->
    <div class="card">
      <div class="card-head">
        <div class="card-title">🖥️ LIVE AUTOMATION EXECUTION TERMINAL</div>
        <button type="button" class="btn btn-outline btn-sm" id="btn-clear-term">🧹 CLEAR LOG</button>
      </div>
      <div class="pipeline-monitor" id="term-box">⚡ [PANEL 2 ONLINE]: All engines ready! Results &amp; errors also notify your Direct Telegram Bot automatically.</div>
    </div>

    <!-- ====================================================================
         TAB 1: EXACT-TIME FIRST-DM GIVEAWAY SNIPER (0-SECOND DRIFT)
         ==================================================================== -->
    <div id="pane-dm" class="pane active">
      <div class="info-banner" style="border-color:var(--gold);">
        🎯 <b>0-SECOND GIVEAWAY FIRST-DM SNIPER:</b> Works even when this website is CLOSED once you add the 1-minute Cron URL (Tab 4) to <code>cron-job.org</code>! Pre-connects 4.5s early and compensates network latency by <code>-120ms</code> so your DM lands right on <code>HH:MM:SS.000</code>!
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div class="card-title">⏰ ARM EXACT-TIME FIRST-DM SNIPER</div>
            <span class="tag">0-SEC PRECISION</span>
          </div>

          <div class="field">
            <label>1. SELECT SENDER NUMBER (OR USE TOP CHIPS)</label>
            <select id="sel-dm-sender" class="sel">
              <option value="SELECTED">🎯 USE SELECTED CHIPS FROM TOP BAR</option>
            </select>
          </div>

          <div class="field">
            <label>2. TARGET USER (@USERNAME OR NUMERIC USER ID)</label>
            <input type="text" id="inp-dm-target" class="inp" placeholder="e.g. @GiveawayAdmin or 7335163273" />
          </div>

          <div class="field">
            <label>3. DM MESSAGE TO FIRE</label>
            <textarea id="inp-dm-message" class="txtarea" placeholder="e.g. First DM! My UPI: example@upi"></textarea>
          </div>

          <div class="field">
            <label>4. EXACT FIRE TIME (HH:MM:SS — 24-HOUR IST)</label>
            <div style="display:flex;gap:8px;">
              <input type="time" id="inp-dm-time" class="inp" step="1" style="flex:1;" />
              <button type="button" class="btn btn-outline btn-sm" id="btn-set-plus-30s">+30 SEC</button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-set-next-min">NEXT MIN</button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button type="button" class="btn btn-gold" id="btn-arm-sniper">⏰ ARM TIMED DM SNIPER</button>
            <button type="button" class="btn btn-purple" id="btn-send-instant-dm">⚡ SEND INSTANT DM NOW</button>
          </div>

          <div class="sniper-countdown-box" id="sniper-box" style="display:none;">
            <div style="font-size:11.5px;color:#fde68a;" id="sniper-target-label">🎯 ARMED FOR TARGET</div>
            <div class="sniper-clock" id="sniper-clock">00:00:00.000</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:4px;" id="sniper-phase">⏳ Armed in Firebase (Cron + Browser Ready)</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">📋 ARMED SCHEDULED DM QUEUE</div>
            <button type="button" class="btn btn-outline btn-sm" id="btn-sync-queue">🔄 SYNC QUEUE</button>
          </div>
          <div id="dm-queue-list">
            <div style="font-size:12px;color:var(--text-dim);text-align:center;padding:24px;">
              📭 No timed DMs armed yet.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         TAB 2: ADVANCED REFER BOT ENGINE
         ==================================================================== -->
    <div id="pane-refer" class="pane">
      <div class="info-banner">
        🤖 <b>SMART REFER PIPELINE:</b> <b>1)</b> <code>/start</code> with refer payload ➔ <b>2)</b> Joins Public Channels instantly &amp; Private/Request Channels with <b>10s Gap</b> ➔ <b>3)</b> Auto-leaves <b>Oldest 50 Channels</b> on limit ➔ <b>4)</b> Clicks <b>LAST Claim Inline Button</b> ➔ <b>5)</b> Auto-shares <b>Phone Contact</b> if menu button appears ➔ <b>6)</b> Opens Verification <b>Mini-App for 60s</b> &amp; auto-closes!
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div class="card-title">🚀 LAUNCH ADVANCED REFER PIPELINE</div>
            <span class="tag">AUTO ALL IDs</span>
          </div>

          <div class="field">
            <label>1. BOT REFERRAL LINK</label>
            <input type="text" id="inp-refer-link" class="inp" placeholder="https://t.me/SomeEarningBot?start=REF12345" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="field">
              <label>2. PRIVATE CHANNEL DELAY (SEC)</label>
              <input type="number" id="inp-priv-delay" class="inp" value="10" min="5" max="60" />
            </div>
            <div class="field">
              <label>3. MINI-APP OPEN HOLD (SEC)</label>
              <input type="number" id="inp-miniapp-hold" class="inp" value="60" min="10" max="180" />
            </div>
          </div>

          <div class="field">
            <label>4. HOW MANY IDs TO RUN? (BLANK = ALL CONNECTED IDs)</label>
            <input type="number" id="inp-refer-limit" class="inp" placeholder="Leave blank for ALL connected IDs" min="1" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button type="button" class="btn btn-green" id="btn-start-refer">🚀 START ADVANCED REFER</button>
            <button type="button" class="btn btn-red" id="btn-stop-refer">⏹️ STOP PIPELINE</button>
          </div>

          <div class="miniapp-timer-box" id="refer-timer-box">
            <div style="font-size:12px;color:#cbd5e1;" id="refer-timer-label">⏳ ACTIVE</div>
            <div class="miniapp-timer-num" id="refer-timer-num">60s</div>
            <div style="font-size:11px;color:#94a3b8;" id="refer-timer-sub">Auto-closing when timer hits 0s</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">🧹 OLDEST 50 CHANNELS CLEANER</div>
            <span class="tag">LIMIT FIX</span>
          </div>
          <div class="info-banner" style="border-color:var(--gold);">
            Leaves the bottom/oldest inactive channels (lay aadhi message aalele) on your selected IDs while protecting your own created channels.
          </div>
          <div class="field">
            <label>OLDEST CHANNELS COUNT TO LEAVE</label>
            <input type="number" id="inp-clean-count" class="inp" value="50" min="1" max="80" />
          </div>
          <button type="button" class="btn btn-gold" id="btn-clean-old-channels">
            🧹 LEAVE OLDEST 50 CHANNELS ON SELECTED IDs
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         TAB 3: BLOCK ALL BOTS (0 BOTS LEFT) & SUPER STYLISH FOLDERS
         ==================================================================== -->
    <div id="pane-clean-folder" class="pane">
      <div class="grid-2">
        <!-- BLOCK ALL BOTS -->
        <div class="card" style="border-color:var(--danger);">
          <div class="card-head">
            <div class="card-title" style="color:#fda4af;">🚫 BLOCK ALL BOTS (100% WIPE)</div>
            <span class="tag" style="border-color:var(--danger);color:#fda4af;">0 BOTS LEFT</span>
          </div>
          <div class="info-banner" style="border-color:var(--danger);">
            Scans every chat in the selected Telegram ID(s), finds <b>EVERY SINGLE BOT</b>, blocks them all and deletes their chat history. Not even 1 bot remains unblocked!
          </div>
          <div class="field">
            <label>CHOOSE SPECIFIC ID (OR USE SELECTED TOP CHIPS)</label>
            <select id="sel-blockbot-id" class="sel">
              <option value="SELECTED">🎯 USE SELECTED CHIPS FROM TOP BAR</option>
            </select>
          </div>
          <button type="button" class="btn btn-red" id="btn-block-all-bots">
            🚫 BLOCK &amp; DELETE ALL BOTS NOW
          </button>
        </div>

        <!-- SUPER STYLISH FOLDERS -->
        <div class="card" style="border-color:var(--success);">
          <div class="card-head">
            <div class="card-title" style="color:#34d399;">📂 SUPER STYLISH FOLDERS MAKER</div>
            <span class="tag" style="border-color:var(--success);color:#34d399;">DELETE OLD + CREATE 4</span>
          </div>
          <div class="info-banner" style="border-color:var(--success);">
            Deletes <b>ALL existing folders</b> on the selected ID(s) and creates 4 Super Stylish Telegram Folders:<br>
            <b>👤 ★ ᴘᴇʀꜱᴏɴ</b> • <b>📢 ★ ᴄʜᴀɴɴᴇʟ</b> • <b>👥 ★ ɢʀᴏᴜᴘꜱ</b> • <b>🤖 ★ ʙᴏᴛꜱ</b>
          </div>
          <div class="field">
            <label>CHOOSE SPECIFIC ID (OR USE SELECTED TOP CHIPS)</label>
            <select id="sel-folder-id" class="sel">
              <option value="SELECTED">🎯 USE SELECTED CHIPS FROM TOP BAR</option>
            </select>
          </div>
          <button type="button" class="btn btn-green" id="btn-make-stylish-folders">
            📂 DELETE OLD &amp; CREATE SUPER STYLISH FOLDERS
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         TAB 4: DIRECT TELEGRAM BOT TOKEN & 24/7 CRON URL (FOR CLOSED WEBSITE!)
         ==================================================================== -->
    <div id="pane-bot" class="pane">
      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div class="card-title">🤖 DIRECT TELEGRAM BOT CONTROLLER</div>
            <span class="tag" id="bot-status-tag">CHECKING...</span>
          </div>
          <div class="field">
            <label>1. BOTFATHER TOKEN</label>
            <input type="text" id="inp-bot-token" class="inp" placeholder="e.g. 7482910384:AAHxxxx..." />
          </div>
          <div class="field">
            <label>2. MASTER BOT SECURITY PIN</label>
            <input type="text" class="inp" value="252010" readonly />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button type="button" class="btn btn-green" id="btn-activate-bot">🔗 SAVE &amp; ACTIVATE WEBHOOK</button>
            <button type="button" class="btn btn-red" id="btn-remove-webhook">⏹️ DISABLE WEBHOOK</button>
          </div>
          <div id="bot-setup-result" style="margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#34d399;"></div>
        </div>

        <div class="card" style="border-color:var(--gold);">
          <div class="card-head">
            <div class="card-title" style="color:#fde68a;">⏰ 24/7 BACKGROUND CRON URL (CLOSED WEBSITE FIX)</div>
            <span class="tag" style="border-color:var(--gold);color:#fde68a;">FREE CRON-JOB.ORG</span>
          </div>
          <div class="info-banner" style="border-color:var(--gold);">
            To fire Timed First-DMs automatically <b>even when your phone &amp; website are completely closed</b>, paste this URL into <b>cron-job.org</b> (free) and set schedule to <b>Every 1 Minute</b>:
          </div>
          <div class="field">
            <label>COPY THIS 24/7 AUTO-SNIPER CRON URL</label>
            <input type="text" id="inp-cron-url" class="inp" readonly />
          </div>
          <button type="button" class="btn btn-gold" id="btn-copy-cron">📋 COPY 24/7 CRON URL</button>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-box"></div>

  <script>
    (function () {
      var PIN = "252010";
      var accounts = [];
      var selectedPhones = [];
      var clockOffsetMs = 0;
      var stopReferFlag = false;
      var activeSnipers = {};

      var cronFullUrl = window.location.origin + "/api/panel2?cron=1";
      document.getElementById("inp-cron-url").value = cronFullUrl;
      document.getElementById("btn-copy-cron").addEventListener("click", function () {
        navigator.clipboard.writeText(cronFullUrl);
        toast("📋 Cron URL Copied! Add it to cron-job.org (Every 1 Min).", "#10b981");
      });

      function toast(msg, color) {
        var box = document.getElementById("toast-box");
        var el = document.createElement("div");
        el.className = "toast";
        el.style.borderLeftColor = color || "#00f0ff";
        el.innerHTML = msg;
        box.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3800);
      }

      function logTerm(html) {
        var box = document.getElementById("term-box");
        var t = new Date(Date.now() + clockOffsetMs).toLocaleTimeString("en-GB", { hour12: false });
        box.innerHTML = '<div class="log-line"><span style="color:#94a3b8;">[' + t + ']</span> ' + html + '</div>' + box.innerHTML;
      }

      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

      async function apiCall(action, data) {
        var payload = Object.assign({ action: action, webPin: PIN }, data || {});
        var r = await fetch("/api/panel2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        return await r.json();
      }

      async function syncServerClock() {
        try {
          var t0 = Date.now();
          var res = await apiCall("server_time", {});
          var t1 = Date.now();
          if (res && res.serverEpochMs) {
            clockOffsetMs = (res.serverEpochMs + Math.floor((t1 - t0) / 2)) - t1;
          }
        } catch (e) {}
      }

      function getAccurateNowMs() { return Date.now() + clockOffsetMs; }

      setInterval(function () {
        var d = new Date(getAccurateNowMs());
        document.getElementById("live-ist-clock").textContent =
          "🕒 SYNCED: " +
          String(d.getHours()).padStart(2, "0") + ":" +
          String(d.getMinutes()).padStart(2, "0") + ":" +
          String(d.getSeconds()).padStart(2, "0");
        tickSniperCountdown();
      }, 100);

      function unlockPanel() {
        if (document.getElementById("inp-pin").value.trim() === PIN) {
          try { sessionStorage.setItem("panel2_unlocked", "yes"); } catch (e) {}
          document.getElementById("vault-lock").classList.add("unlocked");
          toast("🔓 Panel 2 Unlocked!", "#10b981");
          bootDashboard();
        } else {
          document.getElementById("pin-msg").textContent = "❌ Wrong PIN! Enter 252010.";
        }
      }

      document.getElementById("btn-unlock").addEventListener("click", unlockPanel);
      document.getElementById("inp-pin").addEventListener("keydown", function (e) { if (e.key === "Enter") unlockPanel(); });
      document.getElementById("btn-lock-now").addEventListener("click", function () {
        try { sessionStorage.removeItem("panel2_unlocked"); } catch (e) {}
        document.getElementById("inp-pin").value = "";
        document.getElementById("vault-lock").classList.remove("unlocked");
      });

      async function bootDashboard() {
        await syncServerClock();
        await loadAccountsAndConfig();
        await syncScheduledDms();
      }

      async function loadAccountsAndConfig() {
        var data = await apiCall("init_state", {});
        accounts = Array.isArray(data.accounts) ? data.accounts : [];
        if (selectedPhones.length === 0 && accounts.length > 0) {
          selectedPhones = accounts.map(function (a) { return a.phone; });
        }
        renderChips();

        var botInfo = data.botConfig || {};
        if (botInfo.token) {
          document.getElementById("inp-bot-token").value = botInfo.token;
          document.getElementById("bot-status-tag").textContent = botInfo.webhookActive ? "🟢 WEBHOOK LIVE" : "🟡 TOKEN SAVED";
          document.getElementById("bot-setup-result").textContent = botInfo.botUsername
            ? "✅ Bot: @" + botInfo.botUsername + (botInfo.adminChatId ? " | Alerts Linked!" : " | Send 252010 to bot to link alerts")
            : "✅ Token Saved";
        } else {
          document.getElementById("bot-status-tag").textContent = "⚪ NOT CONFIGURED";
        }
      }

      function fillSelectDropdown(selId) {
        var sel = document.getElementById(selId);
        if (!sel) return;
        var cur = sel.value;
        sel.innerHTML = '<option value="SELECTED">🎯 USE SELECTED CHIPS FROM TOP BAR (' + selectedPhones.length + ' IDs)</option>';
        for (var i = 0; i < accounts.length; i++) {
          var opt = document.createElement("option");
          opt.value = accounts[i].phone;
          opt.textContent = "📱 #" + (i + 1) + " " + (accounts[i].name || "User") + " (" + accounts[i].phone + ")";
          sel.appendChild(opt);
        }
        if (cur) sel.value = cur;
      }

      function renderChips() {
        var wrap = document.getElementById("chips-wrap");
        wrap.innerHTML = "";
        fillSelectDropdown("sel-dm-sender");
        fillSelectDropdown("sel-blockbot-id");
        fillSelectDropdown("sel-folder-id");

        if (!accounts.length) {
          wrap.innerHTML = '<span style="font-size:12px;color:#fda4af;">📭 No accounts found in Firebase (panel/accounts).</span>';
          document.getElementById("lbl-sel-count").textContent = "0/0";
          return;
        }

        for (var i = 0; i < accounts.length; i++) {
          (function (idx, acc) {
            var isSel = selectedPhones.indexOf(acc.phone) !== -1;
            var chip = document.createElement("div");
            chip.className = "acc-chip" + (isSel ? " selected" : "");
            chip.innerHTML = '<span class="dot"></span><span>#' + (idx + 1) + ' ' + (acc.name || "ID") + ' (' + acc.phone.slice(-4) + ')</span>';
            chip.addEventListener("click", function () {
              var pos = selectedPhones.indexOf(acc.phone);
              if (pos !== -1) selectedPhones.splice(pos, 1);
              else selectedPhones.push(acc.phone);
              renderChips();
            });
            wrap.appendChild(chip);
          })(i, accounts[i]);
        }
        document.getElementById("lbl-sel-count").textContent = selectedPhones.length + "/" + accounts.length;
      }

      document.getElementById("btn-sel-all").addEventListener("click", function () {
        selectedPhones = accounts.map(function (a) { return a.phone; });
        renderChips();
      });
      document.getElementById("btn-sel-none").addEventListener("click", function () {
        selectedPhones = [];
        renderChips();
      });
      document.getElementById("btn-refresh-accs").addEventListener("click", function () {
        loadAccountsAndConfig();
        toast("🔄 Synced Firebase Accounts!", "#10b981");
      });

      function getDropdownOrChips(selId) {
        var v = document.getElementById(selId).value;
        if (v && v !== "SELECTED") return [v];
        return selectedPhones.slice();
      }

      // ---- TAB 1: FIRST-DM SNIPER ----
      function setTimeInputOffset(addSeconds) {
        var target = new Date(getAccurateNowMs() + addSeconds * 1000);
        document.getElementById("inp-dm-time").value =
          String(target.getHours()).padStart(2, "0") + ":" +
          String(target.getMinutes()).padStart(2, "0") + ":" +
          String(target.getSeconds()).padStart(2, "0");
      }
      document.getElementById("btn-set-plus-30s").addEventListener("click", function () { setTimeInputOffset(30); });
      document.getElementById("btn-set-next-min").addEventListener("click", function () {
        var rem = 60 - new Date(getAccurateNowMs()).getSeconds();
        setTimeInputOffset(rem < 10 ? rem + 60 : rem);
      });
      setTimeInputOffset(60);

      document.getElementById("btn-send-instant-dm").addEventListener("click", async function () {
        var phones = getDropdownOrChips("sel-dm-sender");
        var target = document.getElementById("inp-dm-target").value.trim();
        var msg = document.getElementById("inp-dm-message").value.trim();
        if (!phones.length || !target || !msg) return toast("⚠️ Select ID, Target & Message!", "#f43f5e");

        logTerm("⚡ Firing Instant DM from <b>" + phones.length + " ID(s)</b> to <code>" + target + "</code>...");
        var r = await apiCall("sniper_fire_dm", { phones: phones, target: target, message: msg, fireEpochMs: 0 });
        logTerm(r.summary || r.error || "Done");
        toast(r.success ? "⚡ Instant DM Sent!" : "❌ DM Failed!", r.success ? "#10b981" : "#f43f5e");
      });

      document.getElementById("btn-arm-sniper").addEventListener("click", async function () {
        var phones = getDropdownOrChips("sel-dm-sender");
        var target = document.getElementById("inp-dm-target").value.trim();
        var msg = document.getElementById("inp-dm-message").value.trim();
        var timeVal = document.getElementById("inp-dm-time").value.trim();
        if (!phones.length || !target || !msg || !timeVal) return toast("⚠️ Fill all fields!", "#f43f5e");

        await syncServerClock();
        var parts = timeVal.split(":");
        var nowMs = getAccurateNowMs();
        var tDate = new Date(nowMs);
        tDate.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || "0", 10), 0);
        var fireEpochMs = tDate.getTime();
        if (fireEpochMs <= nowMs + 1500) fireEpochMs += 86400000;

        var job = {
          id: "DM_" + Date.now(),
          phones: phones,
          target: target,
          message: msg,
          fireEpochMs: fireEpochMs,
          istTimeStr: timeVal,
          status: "ARMED",
          triggered: false
        };

        await apiCall("save_scheduled_dm", { job: job });
        activeSnipers[job.id] = job;
        renderSniperQueue();
        logTerm("⏰ <b style='color:#f59e0b;'>EXACT-TIME SNIPER ARMED!</b> <code>" + target + "</code> at <b>" + timeVal + ".000</b>");
        toast("⏰ First-DM Sniper Armed!", "#f59e0b");
      });

      async function syncScheduledDms() {
        var res = await apiCall("list_scheduled_dms", {});
        var list = Array.isArray(res.jobs) ? res.jobs : [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
          var j = list[i];
          if (j && j.status !== "FIRED") {
            seen[j.id] = true;
            if (!activeSnipers[j.id]) {
              j.triggered = (j.status === "FIRING");
              activeSnipers[j.id] = j;
            }
          }
        }
        for (var k in activeSnipers) {
          if (!seen[k] && !activeSnipers[k].triggered) delete activeSnipers[k];
        }
        renderSniperQueue();
      }
      document.getElementById("btn-sync-queue").addEventListener("click", syncScheduledDms);

      function renderSniperQueue() {
        var box = document.getElementById("dm-queue-list");
        var keys = Object.keys(activeSnipers);
        if (!keys.length) {
          box.innerHTML = '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:24px;">📭 No timed DMs armed.</div>';
          document.getElementById("sniper-box").style.display = "none";
          return;
        }
        box.innerHTML = "";
        for (var i = 0; i < keys.length; i++) {
          (function (job) {
            var div = document.createElement("div");
            div.className = "queue-item";
            div.innerHTML = "<div><b>⏰ " + job.istTimeStr + "</b> ➔ <code>" + job.target + "</code><br><span style='color:#94a3b8;'>Status: <b style='color:#34d399;'>" + job.status + "</b></span></div>";
            var b = document.createElement("button");
            b.type = "button";
            b.className = "btn btn-red btn-sm";
            b.textContent = "✖ CANCEL";
            b.addEventListener("click", async function () {
              delete activeSnipers[job.id];
              await apiCall("delete_scheduled_dm", { jobId: job.id });
              renderSniperQueue();
            });
            div.appendChild(b);
            box.appendChild(div);
          })(activeSnipers[keys[i]]);
        }
      }

      function tickSniperCountdown() {
        var keys = Object.keys(activeSnipers);
        if (!keys.length) return;
        var nowMs = getAccurateNowMs();
        var nextJob = null;

        for (var i = 0; i < keys.length; i++) {
          var job = activeSnipers[keys[i]];
          if (!job || job.triggered) continue;
          var diffMs = job.fireEpochMs - nowMs;
          if (!nextJob || job.fireEpochMs < nextJob.fireEpochMs) nextJob = job;

          if (diffMs <= 4500) {
            job.triggered = true;
            job.status = "PRE-CONNECTING...";
            renderSniperQueue();
            (async function (j) {
              logTerm("🔥 <b>[T-4.5s PRE-CONNECT]</b> Locking <code>" + j.target + "</code> for exact 000ms release...");
              var r = await apiCall("sniper_fire_dm", {
                jobId: j.id,
                phones: j.phones,
                target: j.target,
                message: j.message,
                fireEpochMs: j.fireEpochMs
              });
              logTerm(r.summary || r.error || "Done");
              delete activeSnipers[j.id];
              renderSniperQueue();
            })(job);
          }
        }

        if (nextJob) {
          document.getElementById("sniper-box").style.display = "block";
          var rem = Math.max(0, nextJob.fireEpochMs - nowMs);
          document.getElementById("sniper-target-label").textContent = "🎯 ARMED: " + nextJob.target + " (" + nextJob.istTimeStr + ")";
          document.getElementById("sniper-clock").textContent =
            String(Math.floor(rem / 3600000)).padStart(2, "0") + ":" +
            String(Math.floor((rem % 3600000) / 60000)).padStart(2, "0") + ":" +
            String(Math.floor((rem % 60000) / 1000)).padStart(2, "0") + "." +
            String(Math.floor(rem % 1000)).padStart(3, "0");
        }
      }

      // ---- TAB 2: ADVANCED REFER BOT ----
      async function runCountdown(seconds, titleText, subText) {
        var box = document.getElementById("refer-timer-box");
        box.style.display = "block";
        document.getElementById("refer-timer-label").textContent = titleText;
        document.getElementById("refer-timer-sub").textContent = subText;
        for (var s = seconds; s > 0; s--) {
          if (stopReferFlag) break;
          document.getElementById("refer-timer-num").textContent = s + "s";
          await sleep(1000);
        }
        box.style.display = "none";
      }

      document.getElementById("btn-stop-refer").addEventListener("click", function () {
        stopReferFlag = true;
        logTerm("⏹️ <b style='color:#f43f5e;'>Refer Pipeline Stopped.</b>");
      });

      document.getElementById("btn-start-refer").addEventListener("click", async function () {
        var link = document.getElementById("inp-refer-link").value.trim();
        var privDelay = Math.max(5, parseInt(document.getElementById("inp-priv-delay").value, 10) || 10);
        var miniHold = Math.max(10, parseInt(document.getElementById("inp-miniapp-hold").value, 10) || 60);
        var limitVal = parseInt(document.getElementById("inp-refer-limit").value, 10);

        if (!link) return toast("⚠️ Paste a Bot Referral Link!", "#f43f5e");
        var pool = accounts.map(function (a) { return a.phone; });
        if (!isNaN(limitVal) && limitVal > 0 && limitVal < pool.length) pool = pool.slice(0, limitVal);
        if (!pool.length) return toast("⚠️ No connected IDs!", "#f43f5e");

        stopReferFlag = false;
        this.disabled = true;
        logTerm("🚀 <b>ADVANCED REFER STARTED</b> on <b>" + pool.length + " ID(s)</b> -> <code>" + link + "</code>");

        for (var idx = 0; idx < pool.length; idx++) {
          if (stopReferFlag) break;
          var phone = pool[idx];
          logTerm("━━━━ <b>[ID " + (idx + 1) + "/" + pool.length + "] " + phone + "</b> ━━━━");

          var s1 = await apiCall("refer_step_start", { phone: phone, referLink: link });
          if (!s1 || !s1.success) {
            logTerm("🔴 <b>" + phone + " Error:</b> " + (s1 ? s1.error : "Failed"));
            continue;
          }
          logTerm("🟢 Bot Replied | Public: <b>" + s1.publicChannels.length + "</b> | Private: <b>" + s1.privateChannels.length + "</b>");

          if (s1.publicChannels.length > 0) {
            var pubR = await apiCall("refer_step_join_public_batch", { phone: phone, channels: s1.publicChannels });
            logTerm("📢 Public: " + (pubR.summary || "Done"));
          }

          for (var p = 0; p < s1.privateChannels.length; p++) {
            if (stopReferFlag) break;
            var prR = await apiCall("refer_step_join_private_one", { phone: phone, channelUrl: s1.privateChannels[p].url });
            logTerm("🔐 Private (" + (p + 1) + "/" + s1.privateChannels.length + "): " + (prR.summary || "Done"));
            if (p < s1.privateChannels.length - 1 && !stopReferFlag) {
              await runCountdown(privDelay, "⏳ PRIVATE REQUEST ANTI-FLOOD", "Waiting " + privDelay + "s before next private join...");
            }
          }

          if (stopReferFlag) break;

          var lastBtn = s1.inlineButtons.length ? s1.inlineButtons[s1.inlineButtons.length - 1] : null;
          var needContact = s1.hasContactShareButton;
          var miniBtn = s1.miniAppButtons.length ? s1.miniAppButtons[s1.miniAppButtons.length - 1] : null;

          if (lastBtn && (lastBtn.hasData || lastBtn.isMiniApp)) {
            var s3 = await apiCall("refer_step_claim_and_check", { phone: phone, botUser: s1.botUser, msgId: s1.botMsgId, button: lastBtn });
            logTerm("👆 Claim: " + (s3.summary || "Clicked"));
            if (s3.hasContactShareButton) needContact = true;
            if (s3.miniAppButton) miniBtn = s3.miniAppButton;
          }

          if (needContact && !stopReferFlag) {
            var s4 = await apiCall("refer_step_share_contact", { phone: phone, botUser: s1.botUser });
            logTerm("📱 Contact: " + (s4.summary || "Shared"));
            if (s4.miniAppButton) miniBtn = s4.miniAppButton;
          }

          if ((miniBtn || s1.appShortName) && !stopReferFlag) {
            var s5 = await apiCall("refer_step_open_miniapp", {
              phone: phone,
              botUser: s1.botUser,
              appShortName: s1.appShortName || "",
              startParam: s1.startParam || "",
              miniAppButton: miniBtn || null
            });
            logTerm("🎮 Mini-App: " + (s5.summary || "Started"));
            if (s5 && s5.success) {
              var half = Math.floor(miniHold / 2);
              await runCountdown(half, "🎮 MINI-APP OPEN (1/2)", "Keeping verification active...");
              if (!stopReferFlag) {
                await apiCall("refer_step_open_miniapp", {
                  phone: phone,
                  botUser: s1.botUser,
                  appShortName: s1.appShortName || "",
                  startParam: s1.startParam || "",
                  miniAppButton: miniBtn || null,
                  isHeartbeat: true
                });
                await runCountdown(miniHold - half, "🎮 MINI-APP OPEN (2/2)", "Auto-closing at 0s...");
              }
              logTerm("✅ Mini-App 60s Completed &amp; Auto-Closed!");
            }
          }
        }
        this.disabled = false;
        toast("🎉 Advanced Refer Pipeline Done!", "#10b981");
      });

      document.getElementById("btn-clean-old-channels").addEventListener("click", async function () {
        if (!selectedPhones.length) return toast("⚠️ Select at least 1 ID!", "#f43f5e");
        var cnt = parseInt(document.getElementById("inp-clean-count").value, 10) || 50;
        for (var i = 0; i < selectedPhones.length; i++) {
          var r = await apiCall("clean_oldest_channels", { phone: selectedPhones[i], count: cnt });
          logTerm(r.summary || r.error || "Done");
        }
      });

      // ---- TAB 3: BLOCK ALL BOTS & SUPER STYLISH FOLDERS ----
      document.getElementById("btn-block-all-bots").addEventListener("click", async function () {
        var phones = getDropdownOrChips("sel-blockbot-id");
        if (!phones.length) return toast("⚠️ Select at least 1 ID!", "#f43f5e");
        if (!confirm("Block & Delete 100% of ALL Bots on " + phones.length + " selected ID(s)?")) return;

        for (var i = 0; i < phones.length; i++) {
          logTerm("🚫 Blocking ALL Bots on <code>" + phones[i] + "</code>...");
          var r = await apiCall("block_all_bots", { phone: phones[i] });
          logTerm(r.summary || r.error || "Done");
        }
        toast("🚫 All Bots Blocked & Deleted!", "#10b981");
      });

      document.getElementById("btn-make-stylish-folders").addEventListener("click", async function () {
        var phones = getDropdownOrChips("sel-folder-id");
        if (!phones.length) return toast("⚠️ Select at least 1 ID!", "#f43f5e");
        if (!confirm("Delete ALL old folders and create Super Stylish Folders on " + phones.length + " ID(s)?")) return;

        for (var i = 0; i < phones.length; i++) {
          logTerm("📂 Resetting &amp; creating Super Stylish Folders on <code>" + phones[i] + "</code>...");
          var r = await apiCall("make_stylish_folders", { phone: phones[i] });
          logTerm(r.summary || r.error || "Done");
        }
        toast("📂 Super Stylish Folders Ready!", "#10b981");
      });

      // ---- TAB 4: DIRECT BOT WEBHOOK ----
      document.getElementById("btn-activate-bot").addEventListener("click", async function () {
        var tok = document.getElementById("inp-bot-token").value.trim();
        if (!tok || tok.indexOf(":") === -1) return toast("⚠️ Enter valid BotFather Token!", "#f43f5e");
        var r = await apiCall("setup_direct_bot", { token: tok });
        if (r && r.success) {
          document.getElementById("bot-status-tag").textContent = "🟢 WEBHOOK LIVE";
          document.getElementById("bot-setup-result").innerHTML = "✅ Live: @" + r.botUsername + " (Send 252010 to bot!)";
          toast("🤖 Direct Bot Activated!", "#10b981");
        } else {
          document.getElementById("bot-setup-result").textContent = "❌ " + (r ? r.error : "Failed");
        }
      });

      document.getElementById("btn-remove-webhook").addEventListener("click", async function () {
        var r = await apiCall("disable_direct_bot", {});
        document.getElementById("bot-status-tag").textContent = "🔴 DISABLED";
        document.getElementById("bot-setup-result").textContent = r.summary || "Disabled";
      });

      var navBtns = document.querySelectorAll(".nav-btn[data-pane]");
      for (var n = 0; n < navBtns.length; n++) {
        navBtns[n].addEventListener("click", function () {
          var t = this.getAttribute("data-pane");
          var panes = document.querySelectorAll(".pane");
          for (var p = 0; p < panes.length; p++) panes[p].classList.remove("active");
          for (var b = 0; b < navBtns.length; b++) navBtns[b].classList.remove("active");
          document.getElementById(t).classList.add("active");
          this.classList.add("active");
        });
      }

      document.getElementById("btn-clear-term").addEventListener("click", function () {
        document.getElementById("term-box").innerHTML = "⚡ [TERMINAL CLEARED]";
      });

      setInterval(function () {
        if (document.getElementById("vault-lock").classList.contains("unlocked")) syncScheduledDms();
      }, 15000);

      try {
        if (sessionStorage.getItem("panel2_unlocked") === "yes") {
          document.getElementById("vault-lock").classList.add("unlocked");
          bootDashboard();
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// 8. MAIN VERCEL SERVERLESS HANDLER (/api/panel2)
// ============================================================================
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // 1. 24/7 BACKGROUND CRON SWEEP (?cron=1) — Fires Timed DMs even when website is CLOSED!
  if (req.query && req.query.cron === "1") {
    return await handleCronSniperSweep(req, res);
  }

  // 2. DIRECT TELEGRAM BOT WEBHOOK (?webhook=1)
  if (req.query && req.query.webhook === "1") {
    return await handleTelegramBotWebhook(req, res);
  }

  // 3. WEBSITE UI ON BROWSER GET
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderPanel2UI());
  }

  const body = parseReqBody(req);
  const { action, webPin } = body;

  if (String(webPin) !== MASTER_PIN) {
    return res.status(403).json({ success: false, error: "Invalid Master PIN (252010 Required)" });
  }

  try {
    if (action === "server_time") {
      return res.status(200).json({ success: true, serverEpochMs: Date.now() });
    }

    if (action === "init_state") {
      const accounts = await loadAllAccounts();
      const safeAccs = accounts.map(function (a) {
        return { phone: a.phone, name: a.name || "User", username: a.username || "None" };
      });
      const botConfig = (await fbGet("panel2/bot_config")) || {};
      return res.status(200).json({ success: true, accounts: safeAccs, botConfig: botConfig });
    }

    if (action === "setup_direct_bot") {
      const token = String(body.token || "").trim();
      const me = await tgBotCall(token, "getMe", {});
      if (!me || !me.ok) {
        return res.status(200).json({ success: false, error: "Invalid Bot Token! " + (me ? me.description : "") });
      }
      const host = req.headers.host || "kumartelegrambot.vercel.app";
      const webhookUrl = "https://" + host + "/api/panel2?webhook=1";
      const wh = await tgBotCall(token, "setWebhook", { url: webhookUrl, drop_pending_updates: true });
      if (!wh || !wh.ok) {
        return res.status(200).json({ success: false, error: "Webhook failed: " + (wh ? wh.description : "") });
      }
      const existing = (await fbGet("panel2/bot_config")) || {};
      await fbSet("panel2/bot_config", {
        token: token,
        botUsername: me.result.username,
        webhookUrl: webhookUrl,
        webhookActive: true,
        adminChatId: existing.adminChatId || ""
      });
      return res.status(200).json({ success: true, botUsername: me.result.username, webhookUrl: webhookUrl });
    }

    if (action === "disable_direct_bot") {
      const botCfg = (await fbGet("panel2/bot_config")) || {};
      if (botCfg.token) {
        await tgBotCall(botCfg.token, "deleteWebhook", { drop_pending_updates: true });
        botCfg.webhookActive = false;
        await fbSet("panel2/bot_config", botCfg);
      }
      return res.status(200).json({ success: true, summary: "⏹️ Direct Bot Webhook Disabled." });
    }

    const allAccounts = await loadAllAccounts();
    const defaultApi = (await fbGet("panel/api_config")) || {};
    function findAcc(phone) { return allAccounts.find(function (a) { return a.phone === phone; }); }

    // ---- NEW: BLOCK ALL BOTS API ----
    if (action === "block_all_bots") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, error: "Account not found" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const r = await blockAllBotsOnAccount(client);
        const summary =
          "🚫 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Found <b>" + r.totalBotsFound +
          "</b> bots ➔ Blocked &amp; Deleted <b>" + r.blockedCount + "</b>" +
          (r.errors.length ? " | ⚠️ Errors: " + escapeHtml(r.errors.join("; ")) : " (0 Bots Left!)");
        await notifyAdminBot(summary);
        return res.status(200).json({ success: true, summary: summary });
      } catch (e) {
        const errTxt = "🔴 <b>Block All Bots Error (" + escapeHtml(acc.phone) + "):</b> " + escapeHtml(e.message);
        await notifyAdminBot(errTxt);
        return res.status(200).json({ success: false, error: errTxt });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ---- NEW: SUPER STYLISH FOLDERS API ----
    if (action === "make_stylish_folders") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, error: "Account not found" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const r = await buildSuperStylishFoldersOnAccount(client);
        const summary =
          "📂 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Deleted <b>" + r.deletedCount +
          "</b> old ➔ Created <b>" + r.createdCount + "/4</b> (" + escapeHtml(r.createdNames.join(", ")) + ")" +
          (r.errors.length ? " | ⚠️ " + escapeHtml(r.errors.join("; ")) : "");
        await notifyAdminBot(summary);
        return res.status(200).json({ success: true, summary: summary });
      } catch (e) {
        const errTxt = "🔴 <b>Folders Error (" + escapeHtml(acc.phone) + "):</b> " + escapeHtml(e.message);
        await notifyAdminBot(errTxt);
        return res.status(200).json({ success: false, error: errTxt });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ---- REFER BOT STEPS ----
    if (action === "refer_step_start") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, error: "Account not found" });
      const parsed = parseReferBotLink(body.referLink);
      if (!parsed.botUser) return res.status(200).json({ success: false, error: "Invalid Refer Link" });

      const client = await connectAccount(acc, defaultApi);
      try {
        const botEntity = await client.getInputEntity(parsed.botUser);
        if (parsed.startParam) {
          await client.invoke(new Api.messages.StartBot({
            bot: botEntity,
            peer: botEntity,
            startParam: parsed.startParam,
            randomId: BigInt(Math.floor(Math.random() * 1e12))
          }));
        } else {
          await client.sendMessage(botEntity, { message: "/start" });
        }
        await sleepMs(1600);
        const msgs = await client.getMessages(botEntity, { limit: 4 });

        let bestMsg = msgs && msgs[0] ? msgs[0] : null;
        let combined = { inlineButtons: [], publicChannels: [], privateChannels: [], miniAppButtons: [], hasContactShareButton: false };

        if (msgs && msgs.length) {
          for (let i = 0; i < msgs.length; i++) {
            const c = extractMessageControls(msgs[i]);
            if (c.hasContactShareButton) combined.hasContactShareButton = true;
            if (c.inlineButtons.length > 0 && combined.inlineButtons.length === 0) {
              bestMsg = msgs[i];
              combined.inlineButtons = c.inlineButtons;
              combined.publicChannels = c.publicChannels;
              combined.privateChannels = c.privateChannels;
              combined.miniAppButtons = c.miniAppButtons;
            }
          }
        }

        return res.status(200).json({
          success: true,
          botUser: parsed.botUser,
          appShortName: parsed.appShortName,
          startParam: parsed.startParam,
          botMsgId: bestMsg ? bestMsg.id : 0,
          inlineButtons: combined.inlineButtons,
          publicChannels: combined.publicChannels,
          privateChannels: combined.privateChannels,
          miniAppButtons: combined.miniAppButtons,
          hasContactShareButton: combined.hasContactShareButton
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "refer_step_join_public_batch") {
      const acc = findAcc(body.phone);
      const channels = Array.isArray(body.channels) ? body.channels : [];
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });
      const client = await connectAccount(acc, defaultApi);
      let joined = 0;
      let autoCleaned = 0;
      try {
        for (let i = 0; i < channels.length; i++) {
          try {
            const r = await joinSingleChannelWithAutoClean(client, channels[i].url, false);
            if (r.joined) joined++;
            if (r.autoCleaned) autoCleaned += r.autoCleaned;
          } catch (e) {}
        }
        return res.status(200).json({
          success: true,
          summary: "Joined " + joined + "/" + channels.length + " Public" + (autoCleaned ? " (Cleaned " + autoCleaned + " old)" : "")
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "refer_step_join_private_one") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const r = await joinSingleChannelWithAutoClean(client, body.channelUrl, true);
        return res.status(200).json({
          success: true,
          summary: "🟢 " + r.status + (r.autoCleaned ? " (Cleaned " + r.autoCleaned + " old)" : "")
        });
      } catch (e) {
        return res.status(200).json({ success: false, summary: "⚠️ " + (e.message || "Join failed") });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "refer_step_claim_and_check") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const botEntity = await client.getInputEntity(body.botUser);
        const btn = body.button || {};
        let summary = "";
        if (btn.hasData && btn.dataHex) {
          try {
            const cb = await client.invoke(new Api.messages.GetBotCallbackAnswer({
              peer: botEntity,
              msgId: Number(body.msgId),
              data: Buffer.from(btn.dataHex, "hex")
            }));
            summary = "🟢 Clicked [" + btn.text + "]" + (cb && cb.message ? " ➔ " + cb.message : "");
          } catch (cbErr) {
            summary = "👆 Pressed [" + btn.text + "]";
          }
        }
        await sleepMs(1600);
        const newMsgs = await client.getMessages(botEntity, { limit: 3 });
        let hasContact = false;
        let miniAppBtn = null;
        if (newMsgs && newMsgs.length) {
          for (let i = 0; i < newMsgs.length; i++) {
            const c = extractMessageControls(newMsgs[i]);
            if (c.hasContactShareButton) hasContact = true;
            if (c.miniAppButtons.length > 0 && !miniAppBtn) miniAppBtn = c.miniAppButtons[c.miniAppButtons.length - 1];
          }
        }
        return res.status(200).json({ success: true, summary: summary, hasContactShareButton: hasContact, miniAppButton: miniAppBtn });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "refer_step_share_contact") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const me = await client.getMe();
        const botEntity = await client.getInputEntity(body.botUser);
        await client.invoke(new Api.messages.SendMedia({
          peer: botEntity,
          media: new Api.InputMediaContact({
            phoneNumber: String(me.phone || acc.phone).replace("+", ""),
            firstName: me.firstName || acc.name || "User",
            lastName: me.lastName || "",
            vcard: ""
          }),
          message: "",
          randomId: BigInt(Math.floor(Math.random() * 1e12))
        }));
        await sleepMs(1600);
        const newMsgs = await client.getMessages(botEntity, { limit: 3 });
        let miniAppBtn = null;
        if (newMsgs && newMsgs.length) {
          for (let i = 0; i < newMsgs.length; i++) {
            const c = extractMessageControls(newMsgs[i]);
            if (c.miniAppButtons.length > 0) {
              miniAppBtn = c.miniAppButtons[c.miniAppButtons.length - 1];
              break;
            }
          }
        }
        return res.status(200).json({ success: true, summary: "📱 Contact Shared (" + acc.phone + ")", miniAppButton: miniAppBtn });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "refer_step_open_miniapp") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const botEntity = await client.getInputEntity(body.botUser);
        const maBtn = body.miniAppButton || null;
        let openedUrl = "";
        if (body.appShortName && Api.messages.RequestAppWebView && Api.InputBotAppShortName) {
          try {
            const r1 = await client.invoke(new Api.messages.RequestAppWebView({
              peer: botEntity,
              app: new Api.InputBotAppShortName({ botId: botEntity, shortName: body.appShortName }),
              startParam: body.startParam || undefined,
              platform: "android",
              writeAllowed: true
            }));
            if (r1 && r1.url) openedUrl = r1.url;
          } catch (e) {}
        }
        if (!openedUrl) {
          try {
            const r2 = await client.invoke(new Api.messages.RequestWebView({
              peer: botEntity,
              bot: botEntity,
              platform: "android",
              fromBotMenu: !maBtn || !maBtn.url,
              url: (maBtn && maBtn.url) ? maBtn.url : undefined,
              startParam: body.startParam || undefined
            }));
            if (r2 && r2.url) openedUrl = r2.url;
          } catch (e) {}
        }
        if (openedUrl && openedUrl.startsWith("http")) {
          try { await fetch(openedUrl, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-S928B)" } }); } catch (e) {}
        }
        return res.status(200).json({
          success: true,
          summary: body.isHeartbeat ? "💓 Mini-App Keep-Alive Sent!" : "🎮 Mini-App Started!"
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "clean_oldest_channels") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, error: "Account not found" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const r = await leaveOldestChannels(client, body.count || 50);
        const summary = "🧹 <b>" + escapeHtml(acc.name || acc.phone) + ":</b> Left <b>" + r.leftCount + "</b> oldest channels";
        await notifyAdminBot(summary);
        return res.status(200).json({ success: true, summary: summary });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ---- SCHEDULED DM & SNIPER FIRE ----
    if (action === "save_scheduled_dm") {
      const job = body.job;
      if (job && job.id) {
        const botCfg = (await fbGet("panel2/bot_config")) || {};
        job.adminChatId = botCfg.adminChatId || "";
        await fbSet("panel2/scheduled_dms/" + job.id, job);
      }
      return res.status(200).json({ success: true });
    }

    if (action === "delete_scheduled_dm") {
      if (body.jobId) await fbSet("panel2/scheduled_dms/" + body.jobId, null);
      return res.status(200).json({ success: true });
    }

    if (action === "list_scheduled_dms") {
      const raw = (await fbGet("panel2/scheduled_dms")) || {};
      return res.status(200).json({ success: true, jobs: Object.values(raw).filter(Boolean) });
    }

    if (action === "sniper_fire_dm") {
      // Check atomic Firebase lock so Website + Cron never double-fire
      if (body.jobId) {
        const existing = await fbGet("panel2/scheduled_dms/" + body.jobId);
        if (existing && existing.status === "FIRING") {
          return res.status(200).json({ success: true, summary: "✅ Already fired by 24/7 Server Cron!" });
        }
        if (existing) {
          existing.status = "FIRING";
          await fbSet("panel2/scheduled_dms/" + body.jobId, existing);
        }
      }

      const execRes = await executePrecisionFirstDm(allAccounts, defaultApi, {
        phones: body.phones,
        target: body.target,
        message: body.message,
        fireEpochMs: body.fireEpochMs
      });

      if (body.jobId) await fbSet("panel2/scheduled_dms/" + body.jobId, null);

      const summary =
        (execRes.success ? "🎯 <b>DM DELIVERED (" + execRes.sent + "/" + execRes.total + ")</b>\n" : "❌ <b>DM FAILED!</b>\n") +
        execRes.logs.join("\n");

      await notifyAdminBot(summary);
      return res.status(200).json({ success: execRes.success, summary: summary });
    }

    return res.status(200).json({ success: false, error: "Unknown action" });
  } catch (err) {
    const errMsg = "🔴 <b>Panel 2 Server Error:</b> " + escapeHtml(err.message || "Error");
    await notifyAdminBot(errMsg);
    return res.status(200).json({ success: false, error: errMsg });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };