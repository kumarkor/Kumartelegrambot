const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

// ============================================================================
// 1. CONFIGURATION & SHARED FIREBASE REALTIME DATABASE ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";

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
        sleepMs(1200)
      ]);
    }
  } catch (e) {}
}

// ============================================================================
// 2. TELEGRAM CLIENT FACTORY & PARSING HELPERS
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
    throw new Error("Missing session/API credentials for " + (acc.phone || "account"));
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
  return u.indexOf("t.me/+") !== -1 || u.indexOf("t.me/joinchat/") !== -1 || u.indexOf("telegram.me/+") !== -1 || u.indexOf("telegram.me/joinchat/") !== -1;
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
  if (url && !url.includes("t.me/") && (txt.includes("verify") || txt.includes("open") || txt.includes("app") || txt.includes("start") || txt.includes("claim"))) {
    return true;
  }
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

      // Check Reply Keyboard Contact Share button
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

  // Also detect plain @channel or t.me/ links inside message text if no URL buttons found
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
// 3. OLDEST 50 CHANNELS CLEANER (LEAVES BOTTOM / OLDEST INACTIVE CHANNELS)
// ============================================================================
async function leaveOldestChannels(client, countToLeave) {
  const limitTarget = Math.max(1, Math.min(80, parseInt(countToLeave, 10) || 50));
  const dialogs = await client.getDialogs({ limit: 450 });

  const candidates = [];
  for (let i = 0; i < dialogs.length; i++) {
    const d = dialogs[i];
    if (!d || !d.entity) continue;
    const isChanOrGroup = Boolean(d.isChannel || d.isGroup);
    if (!isChanOrGroup) continue;
    // Protect channels/groups owned/created by the account itself
    if (d.entity.creator === true) continue;
    const msgDate = Number(d.date || (d.message && d.message.date) || 0);
    candidates.push({
      dialog: d,
      title: d.title || d.name || "Channel",
      date: msgDate
    });
  }

  // Sort oldest first (smallest Unix timestamp = lay aadhi message aalele / bottom of list)
  candidates.sort(function (a, b) {
    return a.date - b.date;
  });

  const toLeave = candidates.slice(0, limitTarget);
  let leftCount = 0;
  let failedCount = 0;
  const leftNames = [];

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
      if (leftNames.length < 8) leftNames.push(item.title);
      await sleepMs(120);
    } catch (e) {
      failedCount++;
    }
  }

  return {
    totalScanned: candidates.length,
    requested: limitTarget,
    leftCount: leftCount,
    failedCount: failedCount,
    sampleNames: leftNames
  };
}

// ============================================================================
// 4. SINGLE CHANNEL JOINER (WITH AUTO-CLEAN OLDEST 50 ON CHANNELS_TOO_MUCH)
// ============================================================================
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
        if (msg.indexOf("INVITE_REQUEST_SENT") !== -1) {
          return { joined: true, status: "REQUEST_SENT" };
        }
        if (msg.indexOf("USER_ALREADY_PARTICIPANT") !== -1) {
          return { joined: true, status: "ALREADY_MEMBER" };
        }
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
        if (msg.indexOf("USER_ALREADY_PARTICIPANT") !== -1) {
          return { joined: true, status: "ALREADY_MEMBER" };
        }
        if (msg.indexOf("INVITE_REQUEST_SENT") !== -1) {
          return { joined: true, status: "REQUEST_SENT" };
        }
        throw e;
      }
    }
  }

  try {
    return await attemptJoin();
  } catch (err) {
    const errMsg = String(err.message || "");
    if (errMsg.indexOf("CHANNELS_TOO_MUCH") !== -1) {
      // Auto-leave oldest 50 channels and retry immediately!
      const cleanRes = await leaveOldestChannels(client, 50);
      const retryRes = await attemptJoin();
      retryRes.autoCleaned = cleanRes.leftCount;
      return retryRes;
    }
    throw err;
  }
}

// ============================================================================
// 5. DIRECT TELEGRAM BOT API HELPER (NO BOTS.BUSINESS NEEDED!)
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

const BOT_MAIN_KB = {
  keyboard: [
    [{ text: "🚀 ADVANCED REFER BOT" }, { text: "⏰ TIMED DM SNIPER" }],
    [{ text: "🧹 LEAVE OLDEST 50 CHANNELS" }, { text: "🎯 SELECT ACCOUNTS" }],
    [{ text: "📱 MY CONNECTED IDs" }, { text: "🌐 OPEN WEB PANEL" }],
    [{ text: "🔒 LOCK BOT" }]
  ],
  resize_keyboard: true
};

const BOT_CANCEL_KB = {
  keyboard: [[{ text: "❌ CANCEL" }]],
  resize_keyboard: true
};

async function handleTelegramBotWebhook(req, res) {
  const botCfg = (await fbGet("panel2/bot_config")) || {};
  const token = botCfg.token;
  if (!token) {
    return res.status(200).json({ ok: true, note: "No bot token configured" });
  }

  const update = parseReqBody(req);
  const msgObj = update.message;
  if (!msgObj || !msgObj.chat) {
    return res.status(200).json({ ok: true });
  }

  const chatId = String(msgObj.chat.id);
  const text = String(msgObj.text || "").trim();
  const statePath = "panel2/bot_states/" + chatId;
  let uState = (await fbGet(statePath)) || { unlocked: false, step: "", selectedPhones: ["ALL"] };

  async function replyBot(htmlText, kb) {
    await tgBotCall(token, "sendMessage", {
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: kb || (uState.unlocked ? BOT_MAIN_KB : { remove_keyboard: true })
    });
  }

  // Handle /start or Lock Check
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
      await replyBot(
        "🔓 <b>PANEL 2 BOT UNLOCKED!</b>\n\n" +
        "Choose a module below:\n" +
        "• <b>🚀 ADVANCED REFER BOT</b> (Auto Join Public/Private + Claim + Contact + Mini-App)\n" +
        "• <b>⏰ TIMED DM SNIPER</b> (Exact-Second First-DM Giveaway Sniper)\n" +
        "• <b>🧹 LEAVE OLDEST 50 CHANNELS</b>",
        BOT_MAIN_KB
      );
      return res.status(200).json({ ok: true });
    }
    await replyBot(
      "🔐 <b>PANEL 2 DIRECT BOT LOCKED</b>\n\n👇 Send your 6-Digit Master PIN to unlock:",
      { remove_keyboard: true }
    );
    return res.status(200).json({ ok: true });
  }

  if (text === "/start" || text === "❌ CANCEL") {
    uState.step = "";
    await fbSet(statePath, uState);
    await replyBot(
      "👑 <b>PANEL 2 DIRECT CONTROLLER READY</b>\n" +
      "🎯 <b>Target IDs:</b> <code>" + (uState.selectedPhones && uState.selectedPhones.indexOf("ALL") === -1 ? uState.selectedPhones.length + " Selected" : "ALL IDs") + "</code>",
      BOT_MAIN_KB
    );
    return res.status(200).json({ ok: true });
  }

  // Menu Commands
  if (text === "🌐 OPEN WEB PANEL") {
    const hostUrl = "https://" + (req.headers.host || "kumartelegrambot.vercel.app") + "/api/panel2";
    await replyBot("🌐 <b>Open Panel 2 Website:</b>\n" + hostUrl + "\n🔑 <b>PIN:</b> <code>252010</code>", BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  if (text === "📱 MY CONNECTED IDs") {
    const accs = await loadAllAccounts();
    if (!accs.length) {
      await replyBot("📭 No connected accounts found in Firebase.", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    let out = "📱 <b>CONNECTED ACCOUNTS (" + accs.length + " IDs)</b>\n\n";
    for (let i = 0; i < accs.length; i++) {
      out += "<b>[" + (i + 1) + "]</b> " + (accs[i].name || "User") + " — <code>" + accs[i].phone + "</code>\n";
    }
    await replyBot(out, BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  if (text === "🎯 SELECT ACCOUNTS") {
    uState.step = "bot_select_accs";
    await fbSet(statePath, uState);
    await replyBot(
      "🎯 Send <b>ALL</b> to select all IDs, OR send specific phone numbers separated by comma:\nExample: <code>+919584967727, +919035114756</code>",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  if (text === "🧹 LEAVE OLDEST 50 CHANNELS") {
    const accs = await loadAllAccounts();
    const defApi = (await fbGet("panel/api_config")) || {};
    const pool = uState.selectedPhones && uState.selectedPhones.indexOf("ALL") === -1
      ? accs.filter(function (a) { return uState.selectedPhones.indexOf(a.phone) !== -1; })
      : accs.slice(0, 3);

    await replyBot("🧹 <b>Leaving oldest 50 inactive channels on " + pool.length + " ID(s)...</b>", BOT_MAIN_KB);
    const reports = [];
    await Promise.allSettled(
      pool.map(function (acc) {
        return withTimeout(
          (async function () {
            const client = await connectAccount(acc, defApi);
            try {
              const c = await leaveOldestChannels(client, 50);
              reports.push("🟢 <b>" + (acc.name || acc.phone) + ":</b> Left " + c.leftCount + " oldest channels");
            } finally {
              await safeDisconnect(client);
            }
          })(),
          12000
        );
      })
    );
    await replyBot("🧹 <b>OLDEST CHANNEL CLEANUP DONE:</b>\n\n" + (reports.join("\n") || "Completed."), BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  if (text === "🚀 ADVANCED REFER BOT") {
    uState.step = "bot_refer_link";
    await fbSet(statePath, uState);
    await replyBot(
      "🚀 <b>ADVANCED REFER BOT</b>\n\n👇 Send the Bot Referral Link:\nExample: <code>https://t.me/EarningBot?start=123456</code>\n\n<i>Note: For full 10s private channel delays + 60s Mini-App hold without Vercel timeout, run from Website Panel 2 or send link here to run quick auto-refer!</i>",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  if (text === "⏰ TIMED DM SNIPER") {
    uState.step = "bot_dm_target";
    await fbSet(statePath, uState);
    await replyBot(
      "⏰ <b>TIMED FIRST-DM GIVEAWAY SNIPER</b>\n\n👇 <b>STEP 1 OF 3:</b> Send Target <code>@username</code> or Phone Number to DM:",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  // ---- BOT MULTI-STEP FLOWS ----
  if (uState.step === "bot_select_accs") {
    uState.step = "";
    if (text.toUpperCase() === "ALL") {
      uState.selectedPhones = ["ALL"];
    } else {
      const list = text.split(/,|\s+/).map(function (s) {
        const d = s.replace(/\D/g, "");
        return d.length >= 10 ? "+" + d : "";
      }).filter(Boolean);
      uState.selectedPhones = list.length ? list : ["ALL"];
    }
    await fbSet(statePath, uState);
    await replyBot("✅ <b>Target IDs Updated:</b> <code>" + uState.selectedPhones.join(", ") + "</code>", BOT_MAIN_KB);
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "bot_refer_link") {
    uState.step = "";
    await fbSet(statePath, uState);
    const parsed = parseReferBotLink(text);
    if (!parsed.botUser) {
      await replyBot("❌ Invalid Bot Referral Link!", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    const accs = await loadAllAccounts();
    const defApi = (await fbGet("panel/api_config")) || {};
    const pool = uState.selectedPhones && uState.selectedPhones.indexOf("ALL") === -1
      ? accs.filter(function (a) { return uState.selectedPhones.indexOf(a.phone) !== -1; })
      : accs;

    await replyBot("⏳ <b>Running Advanced Refer Pipeline on " + pool.length + " ID(s)...</b>", BOT_MAIN_KB);
    const logs = [];

    await Promise.allSettled(
      pool.map(function (acc) {
        return withTimeout(
          (async function () {
            const client = await connectAccount(acc, defApi);
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
              await sleepMs(1400);
              const msgs = await client.getMessages(botEntity, { limit: 3 });
              let joinedPub = 0;
              let joinedPriv = 0;
              let claimed = false;

              if (msgs && msgs[0]) {
                const ctrl = extractMessageControls(msgs[0]);
                for (let p = 0; p < ctrl.publicChannels.length; p++) {
                  try {
                    await joinSingleChannelWithAutoClean(client, ctrl.publicChannels[p].url, false);
                    joinedPub++;
                  } catch (e) {}
                }
                if (ctrl.privateChannels.length > 0) {
                  try {
                    await joinSingleChannelWithAutoClean(client, ctrl.privateChannels[0].url, true);
                    joinedPriv++;
                  } catch (e) {}
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
                      claimed = true;
                    } catch (e) {}
                  }
                }
              }
              logs.push("🟢 <b>" + (acc.name || acc.phone) + ":</b> Started • Pub:" + joinedPub + " Priv:" + joinedPriv + (claimed ? " • Claimed" : ""));
            } catch (e) {
              logs.push("🔴 <b>" + (acc.name || acc.phone) + ":</b> " + (e.message || "Error"));
            } finally {
              await safeDisconnect(client);
            }
          })(),
          9500
        );
      })
    );

    await replyBot(
      "🚀 <b>REFER BOT EXECUTION REPORT:</b>\n\n" +
      logs.join("\n") +
      "\n\n💡 <i>Tip: For full 10s private gaps + 1-min Mini-App verification hold, keep Panel 2 Website open!</i>",
      BOT_MAIN_KB
    );
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "bot_dm_target") {
    uState.dmTarget = text;
    uState.step = "bot_dm_msg";
    await fbSet(statePath, uState);
    await replyBot("📝 <b>STEP 2 OF 3:</b> Send the exact DM message to fire:", BOT_CANCEL_KB);
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "bot_dm_msg") {
    uState.dmMsg = text;
    uState.step = "bot_dm_time";
    await fbSet(statePath, uState);
    await replyBot(
      "⏰ <b>STEP 3 OF 3:</b> Send <b>NOW</b> for instant DM, OR send exact IST time in <b>HH:MM:SS</b> format (24-hour):\nExample: <code>22:30:00</code>",
      BOT_CANCEL_KB
    );
    return res.status(200).json({ ok: true });
  }

  if (uState.step === "bot_dm_time") {
    const dmTarget = uState.dmTarget;
    const dmMsg = uState.dmMsg;
    uState.step = "";
    await fbSet(statePath, uState);

    const accs = await loadAllAccounts();
    const defApi = (await fbGet("panel/api_config")) || {};
    const pool = uState.selectedPhones && uState.selectedPhones.indexOf("ALL") === -1
      ? accs.filter(function (a) { return uState.selectedPhones.indexOf(a.phone) !== -1; })
      : accs.slice(0, 1);

    if (text.toUpperCase() === "NOW") {
      let sent = 0;
      await Promise.allSettled(
        pool.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccount(acc, defApi);
              try {
                const ent = await client.getInputEntity(dmTarget);
                await client.sendMessage(ent, { message: dmMsg });
                sent++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8000
          );
        })
      );
      await replyBot("✅ <b>Instant DM Sent!</b> (" + sent + "/" + pool.length + " IDs) -> <code>" + dmTarget + "</code>", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }

    // Parse HH:MM:SS in IST (UTC+5:30)
    const tm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!tm) {
      await replyBot("❌ Invalid Time Format! Use <code>HH:MM:SS</code> (e.g. <code>22:30:00</code>) or <code>NOW</code>.", BOT_MAIN_KB);
      return res.status(200).json({ ok: true });
    }
    const hh = parseInt(tm[1], 10);
    const mm = parseInt(tm[2], 10);
    const ss = parseInt(tm[3] || "0", 10);

    const nowUtc = Date.now();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(nowUtc + istOffsetMs);
    const targetIst = new Date(Date.UTC(
      nowIst.getUTCFullYear(),
      nowIst.getUTCMonth(),
      nowIst.getUTCDate(),
      hh, mm, ss, 0
    ));
    let fireEpochMs = targetIst.getTime() - istOffsetMs;
    if (fireEpochMs <= nowUtc - 1000) {
      fireEpochMs += 24 * 60 * 60 * 1000;
    }

    const schedId = "DM_" + Date.now();
    await fbSet("panel2/scheduled_dms/" + schedId, {
      id: schedId,
      target: dmTarget,
      message: dmMsg,
      phones: pool.map(function (a) { return a.phone; }),
      fireEpochMs: fireEpochMs,
      istTimeStr: text,
      status: "SCHEDULED"
    });

    await replyBot(
      "⏰ <b>EXACT-SECOND DM SNIPER ARMED!</b>\n\n" +
      "🎯 <b>Target:</b> <code>" + dmTarget + "</code>\n" +
      "🕒 <b>Exact Fire Time (IST):</b> <code>" + text + "</code>\n" +
      "📱 <b>IDs Armed:</b> <code>" + pool.length + "</code>\n\n" +
      "⚡ <i>Keep Panel 2 Website open in browser so it pre-connects 4 seconds early and fires at exact 000ms!</i>",
      BOT_MAIN_KB
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ============================================================================
// 6. PANEL 2 MASTER WEB UI (ONLY 2 MODULES + DIRECT BOT TOKEN SETUP + PIN 252010)
// ============================================================================
function renderPanel2UI() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>⚡ PANEL 2 • ADVANCED REFER BOT &amp; EXACT-TIME DM SNIPER ⚡</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #040611;
      --bg-card: rgba(13, 19, 39, 0.93);
      --bg-input: #060916;
      --accent: #00f0ff;
      --accent-glow: rgba(0, 240, 255, 0.38);
      --accent-2: #a855f7;
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

    /* VAULT LOCK SCREEN (PIN: 252010) */
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
    .vault-title {
      font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900;
      color: #fff; margin-bottom: 6px;
    }

    .shell { max-width: 1200px; margin: 0 auto; padding: 16px 14px 90px; }

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
    .header-left h1 { font-family: 'Orbitron', sans-serif; font-size: 18px; color: var(--accent); }
    .header-left p { font-size: 12px; color: var(--text-sub); margin-top: 3px; }

    .clock-sync-box {
      background: #050a18; border: 1px solid var(--success); border-radius: 12px;
      padding: 8px 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: #34d399; font-weight: 800;
    }

    /* ACCOUNT SELECTOR BAR */
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

    /* 3 CLEAN NAVIGATION TABS (2 CORE MODULES + DIRECT BOT TOKEN SETUP) */
    .nav-tabs {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px; margin-bottom: 16px;
    }
    .nav-btn {
      background: var(--bg-card); border: 1px solid var(--border-glass);
      border-radius: 14px; padding: 14px 12px; color: var(--text-sub);
      font-size: 12.5px; font-weight: 800; cursor: pointer; text-align: center;
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

    /* LIVE STATUS / TIMER CARDS */
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
      <p style="font-size:13px;color:var(--text-sub);margin-bottom:18px;">Enter 6-Digit Password to Unlock Panel 2 Automation Engine</p>
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
          <h1>KUMAR PANEL 2 • REFER &amp; EXACT-TIME DM ENGINE</h1>
          <p>Shared Firebase Accounts • Smart 10s Private Join • Auto Contact &amp; 1-Min Mini-App • 0ms First-DM Sniper • Direct Bot Token</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div class="clock-sync-box" id="live-ist-clock">🕒 SYNCING ATOMIC TIME...</div>
        <button type="button" class="btn btn-red btn-sm" id="btn-lock-now">🔒 LOCK</button>
      </div>
    </header>

    <!-- SHARED ACCOUNT SELECTOR BAR (FROM SAME FIREBASE panel/accounts) -->
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

    <!-- 3 FOCUSED TABS (ONLY THE 2 REQUESTED MODULES + DIRECT BOT TOKEN CONTROLLER) -->
    <div class="nav-tabs">
      <button type="button" class="nav-btn active" data-pane="pane-refer">
        🚀 1. ADVANCED REFER BOT ENGINE
      </button>
      <button type="button" class="nav-btn" data-pane="pane-dm">
        ⏰ 2. EXACT-TIME DM &amp; GIVEAWAY SNIPER
      </button>
      <button type="button" class="nav-btn" data-pane="pane-bot">
        🤖 3. DIRECT BOT TOKEN CONTROLLER
      </button>
    </div>

    <!-- LIVE EXECUTION LOG TERMINAL -->
    <div class="card">
      <div class="card-head">
        <div class="card-title">🖥️ LIVE AUTOMATION EXECUTION TERMINAL</div>
        <button type="button" class="btn btn-outline btn-sm" id="btn-clear-term">🧹 CLEAR LOG</button>
      </div>
      <div class="pipeline-monitor" id="term-box">⚡ [PANEL 2 ONLINE]: Shared Firebase accounts loaded. Ready for Advanced Refer Bot &amp; Exact-Time First-DM Sniper!</div>
    </div>

    <!-- ====================================================================
         MODULE 1: ADVANCED REFER BOT ENGINE
         ==================================================================== -->
    <div id="pane-refer" class="pane active">
      <div class="info-banner">
        🤖 <b>SMART REFER PIPELINE:</b> <b>1)</b> Sends <code>/start</code> with refer payload ➔ <b>2)</b> Joins Public Channels instantly (0s wait) &amp; Private/Request Channels with <b>10s Gap</b> (Zero <code>TOO_MANY_ATTEMPTS</code>!) ➔ <b>3)</b> Auto-leaves <b>Oldest 50 Channels</b> if channel limit hits ➔ <b>4)</b> Clicks <b>LAST Claim Inline Button</b> ➔ <b>5)</b> Auto-shares <b>Phone Contact</b> if menu button appears ➔ <b>6)</b> Opens Verification <b>Mini-App for exact 60 Seconds</b> &amp; auto-closes!
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div class="card-title">🚀 LAUNCH ADVANCED REFER PIPELINE</div>
            <span class="tag">FULL AUTO FLOW</span>
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
            <label>4. HOW MANY SELECTED IDs TO RUN? (LEAVE BLANK = ALL SELECTED)</label>
            <input type="number" id="inp-refer-limit" class="inp" placeholder="e.g. 1, 5, 7 or leave blank for ALL" min="1" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button type="button" class="btn btn-green" id="btn-start-refer">🚀 START ADVANCED REFER</button>
            <button type="button" class="btn btn-red" id="btn-stop-refer">⏹️ STOP PIPELINE</button>
          </div>

          <!-- LIVE 60-SECOND MINI-APP & 10-SECOND DELAY TIMER -->
          <div class="miniapp-timer-box" id="refer-timer-box">
            <div style="font-size:12px;color:#cbd5e1;" id="refer-timer-label">⏳ MINI-APP VERIFICATION ACTIVE</div>
            <div class="miniapp-timer-num" id="refer-timer-num">60s</div>
            <div style="font-size:11px;color:#94a3b8;" id="refer-timer-sub">Will automatically close &amp; continue when timer hits 0s</div>
          </div>
        </div>

        <!-- OLDEST 50 CHANNELS AUTO CLEANER -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">🧹 CHANNEL LIMIT CLEANER (OLDEST 50 CHANNELS)</div>
            <span class="tag">ANTI-LIMIT SHIELD</span>
          </div>

          <div class="info-banner" style="border-color:var(--gold);">
            ⚠️ Telegram allows max 500 channels per account. If an account hits the limit, this tool finds the <b>Oldest Inactive Channels at the bottom of your chat list</b> (where messages arrived longest ago) and leaves them automatically! Your own created channels are protected.
          </div>

          <div class="field">
            <label>HOW MANY OLDEST CHANNELS TO LEAVE PER SELECTED ID?</label>
            <input type="number" id="inp-clean-count" class="inp" value="50" min="1" max="80" />
          </div>

          <button type="button" class="btn btn-gold" id="btn-clean-old-channels">
            🧹 LEAVE OLDEST 50 CHANNELS ON SELECTED IDs
          </button>

          <div style="margin-top:12px;font-size:12px;color:var(--text-dim);line-height:1.6;">
            ✅ <b>Automatic Protection:</b> Even during Advanced Refer Bot, if any account returns <code>CHANNELS_TOO_MUCH</code>, the server automatically leaves the oldest 50 channels and retries joining immediately!
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         MODULE 2: EXACT-TIME DM & FIRST-DM GIVEAWAY SNIPER
         ==================================================================== -->
    <div id="pane-dm" class="pane">
      <div class="info-banner" style="border-color:var(--gold);">
        🎯 <b>ZERO-DRIFT FIRST-DM GIVEAWAY SNIPER:</b> Select which Telegram number(s) should send the DM, enter the target username/ID, and set the exact Giveaway Time (<code>HH:MM:SS</code>). Our Sniper syncs with Server Atomic Time, <b>pre-connects Telegram 4 seconds early</b>, and fires the message at the <b>exact millisecond (000ms)</b> — zero 1-2 second lag!
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div class="card-title">⏰ ARM EXACT-TIME FIRST-DM SNIPER</div>
            <span class="tag">±50MS PRECISION</span>
          </div>

          <div class="field">
            <label>1. SELECT SENDER NUMBER (OR USE SELECTED CHIPS ABOVE)</label>
            <select id="sel-dm-sender" class="sel">
              <option value="SELECTED">🎯 USE SELECTED ACCOUNT CHIPS FROM TOP BAR</option>
            </select>
          </div>

          <div class="field">
            <label>2. TARGET USER TO DM (@USERNAME, USER ID OR PHONE)</label>
            <input type="text" id="inp-dm-target" class="inp" placeholder="e.g. @GiveawayAdmin or +919876543210" />
          </div>

          <div class="field">
            <label>3. DM MESSAGE TO SEND</label>
            <textarea id="inp-dm-message" class="txtarea" placeholder="e.g. First DM! My UPI: example@upi"></textarea>
          </div>

          <div class="field">
            <label>4. EXACT FIRE TIME (HH:MM:SS — 24-HOUR IST TIME)</label>
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
            <div style="font-size:11px;color:#cbd5e1;margin-top:4px;" id="sniper-phase">⏳ Waiting for T-4.0s Pre-Connect Window...</div>
          </div>
        </div>

        <!-- ARMED SNIPER QUEUE (INCLUDES BOTH WEB & DIRECT BOT SCHEDULED DMs) -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">📋 ACTIVE SCHEDULED DM SNIPER QUEUE</div>
            <button type="button" class="btn btn-outline btn-sm" id="btn-sync-queue">🔄 SYNC QUEUE</button>
          </div>
          <div id="dm-queue-list">
            <div style="font-size:12px;color:var(--text-dim);text-align:center;padding:24px;">
              📭 No timed DMs armed yet. Set a time on the left or schedule from your Direct Telegram Bot!
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         MODULE 3: DIRECT WEBSITE-CONTROLLED TELEGRAM BOT (NO BOTS.BUSINESS)
         ==================================================================== -->
    <div id="pane-bot" class="pane">
      <div class="info-banner" style="border-color:var(--success);">
        🤖 <b>DIRECT TELEGRAM BOT CONTROLLER (NO BOTS.BUSINESS NEEDED!):</b> Paste your BotFather Token below and click <b>🔗 SAVE TOKEN &amp; ACTIVATE WEBHOOK</b>. Your bot will run directly from <code>https://kumartelegrambot.vercel.app/api/panel2?webhook=1</code> with Master PIN <code>252010</code> lock!
      </div>

      <div class="card" style="max-width:650px;margin:0 auto;">
        <div class="card-head">
          <div class="card-title">🤖 CONNECT &amp; CONTROL YOUR TELEGRAM BOT DIRECTLY</div>
          <span class="tag" id="bot-status-tag">CHECKING...</span>
        </div>

        <div class="field">
          <label>1. TELEGRAM BOT TOKEN (FROM @BOTFATHER)</label>
          <input type="text" id="inp-bot-token" class="inp" placeholder="e.g. 7482910384:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
        </div>

        <div class="field">
          <label>2. MASTER BOT SECURITY PIN (LOCKED TO 252010)</label>
          <input type="text" class="inp" value="252010" readonly />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button type="button" class="btn btn-green" id="btn-activate-bot">🔗 SAVE TOKEN &amp; ACTIVATE WEBHOOK</button>
          <button type="button" class="btn btn-red" id="btn-remove-webhook">⏹️ DISABLE BOT WEBHOOK</button>
        </div>

        <div id="bot-setup-result" style="margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#34d399;"></div>
      </div>
    </div>
  </div>

  <div id="toast-box"></div>

  <script>
    (function () {
      var PIN = "252010";
      var accounts = [];
      var selectedPhones = [];
      var clockOffsetMs = 0; // serverTime - localTime for 0ms drift!
      var stopReferFlag = false;
      var activeSnipers = {}; // id -> job object

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

      function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
      }

      async function apiCall(action, data) {
        var payload = Object.assign({ action: action, webPin: PIN }, data || {});
        var r = await fetch("/api/panel2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        return await r.json();
      }

      // ====================================================================
      // 1. ATOMIC SERVER CLOCK SYNC (PREVENTS 1-2 SEC PHONE CLOCK DRIFT!)
      // ====================================================================
      async function syncServerClock() {
        try {
          var t0 = Date.now();
          var res = await apiCall("server_time", {});
          var t1 = Date.now();
          if (res && res.serverEpochMs) {
            var rttHalf = Math.floor((t1 - t0) / 2);
            clockOffsetMs = (res.serverEpochMs + rttHalf) - t1;
          }
        } catch (e) {}
      }

      function getAccurateNowMs() {
        return Date.now() + clockOffsetMs;
      }

      setInterval(function () {
        var nowMs = getAccurateNowMs();
        var d = new Date(nowMs);
        var hh = String(d.getHours()).padStart(2, "0");
        var mm = String(d.getMinutes()).padStart(2, "0");
        var ss = String(d.getSeconds()).padStart(2, "0");
        document.getElementById("live-ist-clock").textContent = "🕒 SYNCED: " + hh + ":" + mm + ":" + ss + " (Drift: " + clockOffsetMs + "ms)";
        tickSniperCountdown();
      }, 100);

      // ====================================================================
      // 2. PIN LOCK SCREEN (252010)
      // ====================================================================
      function unlockPanel() {
        var v = document.getElementById("inp-pin").value.trim();
        if (v === PIN) {
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

      // ====================================================================
      // 3. LOAD SHARED FIREBASE ACCOUNTS & BOT STATUS
      // ====================================================================
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
            ? "✅ Connected Bot: @" + botInfo.botUsername + " (PIN: 252010)"
            : "✅ Bot Token Saved";
        } else {
          document.getElementById("bot-status-tag").textContent = "⚪ NOT CONFIGURED";
        }
      }

      function renderChips() {
        var wrap = document.getElementById("chips-wrap");
        var dmSel = document.getElementById("sel-dm-sender");
        wrap.innerHTML = "";
        dmSel.innerHTML = '<option value="SELECTED">🎯 USE SELECTED CHIPS FROM TOP BAR (' + selectedPhones.length + ' IDs)</option>';

        if (!accounts.length) {
          wrap.innerHTML = '<span style="font-size:12px;color:#fda4af;">📭 No accounts found in Firebase (panel/accounts). Add IDs in Panel 1 first!</span>';
          document.getElementById("lbl-sel-count").textContent = "0/0";
          return;
        }

        for (var i = 0; i < accounts.length; i++) {
          (function (idx, acc) {
            var opt = document.createElement("option");
            opt.value = acc.phone;
            opt.textContent = "📱 #" + (idx + 1) + " " + (acc.name || "User") + " (" + acc.phone + ")";
            dmSel.appendChild(opt);

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

      // ====================================================================
      // 4. MODULE 1: ADVANCED REFER BOT PIPELINE (ZERO VERCEL TIMEOUT!)
      // ====================================================================
      async function runCountdown(seconds, titleText, subText) {
        var box = document.getElementById("refer-timer-box");
        var lbl = document.getElementById("refer-timer-label");
        var num = document.getElementById("refer-timer-num");
        var sub = document.getElementById("refer-timer-sub");
        box.style.display = "block";
        lbl.textContent = titleText;
        sub.textContent = subText;
        for (var s = seconds; s > 0; s--) {
          if (stopReferFlag) break;
          num.textContent = s + "s";
          await sleep(1000);
        }
        box.style.display = "none";
      }

      document.getElementById("btn-stop-refer").addEventListener("click", function () {
        stopReferFlag = true;
        logTerm("⏹️ <b style='color:#f43f5e;'>STOP REQUESTED! Pipeline will halt immediately.</b>");
        toast("⏹️ Refer Pipeline Stopped.", "#f43f5e");
      });

      document.getElementById("btn-start-refer").addEventListener("click", async function () {
        var link = document.getElementById("inp-refer-link").value.trim();
        var privDelay = Math.max(5, parseInt(document.getElementById("inp-priv-delay").value, 10) || 10);
        var miniHold = Math.max(10, parseInt(document.getElementById("inp-miniapp-hold").value, 10) || 60);
        var limitVal = parseInt(document.getElementById("inp-refer-limit").value, 10);

        if (!link) return toast("⚠️ Paste a Bot Referral Link first!", "#f43f5e");
        if (selectedPhones.length === 0) return toast("⚠️ Select at least 1 Telegram ID!", "#f43f5e");

        var pool = selectedPhones.slice();
        if (!isNaN(limitVal) && limitVal > 0 && limitVal < pool.length) {
          pool = pool.slice(0, limitVal);
        }

        stopReferFlag = false;
        var btn = document.getElementById("btn-start-refer");
        btn.disabled = true;
        logTerm("🚀 <b>ADVANCED REFER PIPELINE STARTED</b> for <b>" + pool.length + " ID(s)</b> -> <code>" + link + "</code>");

        for (var idx = 0; idx < pool.length; idx++) {
          if (stopReferFlag) break;
          var phone = pool[idx];
          logTerm("━━━━━━━━━━ <b>[ID " + (idx + 1) + "/" + pool.length + "] " + phone + "</b> ━━━━━━━━━━");

          // STEP 1: /start Bot & Extract Channels + Claim Button + Contact + Mini-App
          logTerm("1️⃣ Sending <code>/start</code> & scanning bot inline buttons...");
          var step1 = await apiCall("refer_step_start", { phone: phone, referLink: link });
          if (!step1 || !step1.success) {
            logTerm("🔴 <b>" + phone + " Failed Step 1:</b> " + (step1 ? step1.error : "Server error"));
            continue;
          }

          logTerm(
            "🟢 <b>Bot Replied!</b> Public Channels: <b>" + step1.publicChannels.length +
            "</b> | Private/Request Channels: <b>" + step1.privateChannels.length +
            "</b> | Inline Buttons: <b>" + step1.inlineButtons.length + "</b>"
          );

          // STEP 2A: Join ALL Public Channels Immediately (0s Delay!)
          if (step1.publicChannels.length > 0) {
            logTerm("2️⃣ Joining " + step1.publicChannels.length + " Public Channel(s) instantly (no delay)...");
            var pubRes = await apiCall("refer_step_join_public_batch", {
              phone: phone,
              channels: step1.publicChannels
            });
            logTerm("📢 <b>Public Channels:</b> " + (pubRes.summary || "Done"));
          }

          // STEP 2B: Join Private / Request Channels with EXACT 10-Second Delay Between Each!
          if (step1.privateChannels.length > 0) {
            for (var p = 0; p < step1.privateChannels.length; p++) {
              if (stopReferFlag) break;
              var privCh = step1.privateChannels[p];
              logTerm("🔐 Sending Private/Request Join (" + (p + 1) + "/" + step1.privateChannels.length + "): <code>" + privCh.url + "</code>");
              var privRes = await apiCall("refer_step_join_private_one", {
                phone: phone,
                channelUrl: privCh.url
              });
              logTerm("   ↳ " + (privRes.summary || "Done"));

              // Wait 10 seconds before next private channel request to prevent TOO_MANY_ATTEMPTS
              if (p < step1.privateChannels.length - 1 && !stopReferFlag) {
                logTerm("⏳ Waiting <b>" + privDelay + " seconds</b> before next private channel request (Anti-Flood)...");
                await runCountdown(privDelay, "⏳ PRIVATE CHANNEL ANTI-FLOOD DELAY", "Waiting " + privDelay + "s before next private join request...");
              }
            }
          }

          if (stopReferFlag) break;

          // STEP 3: Click LAST Inline Button (Claim / Joined) + Auto-Detect Contact Share & Mini-App
          var claimTargetMsgId = step1.botMsgId;
          var lastInlineBtn = step1.inlineButtons.length > 0 ? step1.inlineButtons[step1.inlineButtons.length - 1] : null;
          var detectedContact = step1.hasContactShareButton;
          var detectedMiniApp = step1.miniAppButtons.length > 0 ? step1.miniAppButtons[step1.miniAppButtons.length - 1] : null;

          if (lastInlineBtn && (lastInlineBtn.hasData || lastInlineBtn.isMiniApp)) {
            logTerm("3️⃣ Clicking LAST Inline Button (Claim/Verify): <b>[" + lastInlineBtn.text + "]</b>...");
            var step3 = await apiCall("refer_step_claim_and_check", {
              phone: phone,
              botUser: step1.botUser,
              msgId: claimTargetMsgId,
              button: lastInlineBtn
            });
            logTerm("   ↳ " + (step3.summary || "Clicked"));
            if (step3.hasContactShareButton) detectedContact = true;
            if (step3.miniAppButton) detectedMiniApp = step3.miniAppButton;
          }

          // STEP 4: Auto Contact Share (If Bot Asked for Phone Contact in Main Menu!)
          if (detectedContact && !stopReferFlag) {
            logTerm("4️⃣ Bot requested <b>Contact Share</b> in Main Menu! Sharing account contact automatically...");
            var step4 = await apiCall("refer_step_share_contact", {
              phone: phone,
              botUser: step1.botUser
            });
            logTerm("   ↳ " + (step4.summary || "Contact shared"));
            if (step4.miniAppButton) detectedMiniApp = step4.miniAppButton;
          } else {
            logTerm("4️⃣ Contact Share not requested by this bot — skipping smoothly.");
          }

          // STEP 5: Verification Mini-App -> Start, Keep Open for 1 Minute (60s), Auto-Close!
          if ((detectedMiniApp || step1.appShortName) && !stopReferFlag) {
            logTerm("5️⃣ Opening Verification <b>Mini-App</b> & holding active for <b>" + miniHold + " seconds</b>...");
            var step5Open = await apiCall("refer_step_open_miniapp", {
              phone: phone,
              botUser: step1.botUser,
              appShortName: step1.appShortName || "",
              startParam: step1.startParam || "",
              miniAppButton: detectedMiniApp || null
            });
            logTerm("   ↳ " + (step5Open.summary || "Mini-App Started"));

            if (step5Open && step5Open.success) {
              // Hold for 1 minute (60s) with mid-point keepalive ping at 30s, then auto-close!
              var half = Math.floor(miniHold / 2);
              await runCountdown(half, "🎮 MINI-APP VERIFICATION OPEN (PHASE 1/2)", "Keeping Mini-App active for " + phone + "...");
              if (!stopReferFlag) {
                await apiCall("refer_step_open_miniapp", {
                  phone: phone,
                  botUser: step1.botUser,
                  appShortName: step1.appShortName || "",
                  startParam: step1.startParam || "",
                  miniAppButton: detectedMiniApp || null,
                  isHeartbeat: true
                });
                await runCountdown(miniHold - half, "🎮 MINI-APP VERIFICATION OPEN (PHASE 2/2)", "Auto-closing Mini-App when timer hits 0s...");
              }
              logTerm("✅ <b>Mini-App " + miniHold + "s Verification Complete & Auto-Closed</b> for " + phone + "!");
            }
          } else {
            logTerm("5️⃣ No Verification Mini-App detected for this bot — Refer Complete!");
          }

          logTerm("🎉 <b style='color:#10b981;'>FINISHED REFER FLOW FOR " + phone + "!</b>");
        }

        btn.disabled = false;
        toast("🎉 Advanced Refer Pipeline Completed!", "#10b981");
      });

      // MANUAL OLDEST 50 CHANNELS CLEANER
      document.getElementById("btn-clean-old-channels").addEventListener("click", async function () {
        if (selectedPhones.length === 0) return toast("⚠️ Select at least 1 ID!", "#f43f5e");
        var cnt = parseInt(document.getElementById("inp-clean-count").value, 10) || 50;
        if (!confirm("Leave the oldest " + cnt + " inactive channels on " + selectedPhones.length + " selected ID(s)?")) return;

        for (var i = 0; i < selectedPhones.length; i++) {
          var ph = selectedPhones[i];
          logTerm("🧹 Cleaning oldest <b>" + cnt + "</b> channels on <code>" + ph + "</code>...");
          var r = await apiCall("clean_oldest_channels", { phone: ph, count: cnt });
          logTerm(r.summary || r.error || "Done");
        }
        toast("🧹 Channel Cleanup Finished!", "#10b981");
      });

      // ====================================================================
      // 5. MODULE 2: EXACT-TIME FIRST-DM GIVEAWAY SNIPER (PRE-CONNECT 4s EARLY!)
      // ====================================================================
      function setTimeInputOffset(addSeconds) {
        var target = new Date(getAccurateNowMs() + addSeconds * 1000);
        var hh = String(target.getHours()).padStart(2, "0");
        var mm = String(target.getMinutes()).padStart(2, "0");
        var ss = String(target.getSeconds()).padStart(2, "0");
        document.getElementById("inp-dm-time").value = hh + ":" + mm + ":" + ss;
      }

      document.getElementById("btn-set-plus-30s").addEventListener("click", function () { setTimeInputOffset(30); });
      document.getElementById("btn-set-next-min").addEventListener("click", function () {
        var now = new Date(getAccurateNowMs());
        var rem = 60 - now.getSeconds();
        setTimeInputOffset(rem < 10 ? rem + 60 : rem);
      });
      setTimeInputOffset(60);

      function getDmTargetPhones() {
        var pick = document.getElementById("sel-dm-sender").value;
        if (pick && pick !== "SELECTED") return [pick];
        return selectedPhones.slice();
      }

      document.getElementById("btn-send-instant-dm").addEventListener("click", async function () {
        var phones = getDmTargetPhones();
        var target = document.getElementById("inp-dm-target").value.trim();
        var msg = document.getElementById("inp-dm-message").value.trim();
        if (!phones.length || !target || !msg) return toast("⚠️ Select ID, Target & Message!", "#f43f5e");

        logTerm("⚡ Firing Instant DM from <b>" + phones.length + " ID(s)</b> to <code>" + target + "</code>...");
        var r = await apiCall("sniper_fire_dm", {
          phones: phones,
          target: target,
          message: msg,
          fireEpochMs: 0
        });
        logTerm(r.summary || r.error || "Done");
        toast("⚡ Instant DM Executed!", "#10b981");
      });

      document.getElementById("btn-arm-sniper").addEventListener("click", async function () {
        var phones = getDmTargetPhones();
        var target = document.getElementById("inp-dm-target").value.trim();
        var msg = document.getElementById("inp-dm-message").value.trim();
        var timeVal = document.getElementById("inp-dm-time").value.trim();
        if (!phones.length || !target || !msg || !timeVal) {
          return toast("⚠️ Fill Sender ID, Target, Message & Exact Time!", "#f43f5e");
        }

        await syncServerClock();
        var parts = timeVal.split(":");
        var hh = parseInt(parts[0], 10);
        var mm = parseInt(parts[1], 10);
        var ss = parseInt(parts[2] || "0", 10);

        var nowMs = getAccurateNowMs();
        var targetDate = new Date(nowMs);
        targetDate.setHours(hh, mm, ss, 0);
        var fireEpochMs = targetDate.getTime();
        if (fireEpochMs <= nowMs + 2000) {
          fireEpochMs += 24 * 60 * 60 * 1000;
        }

        var jobId = "DM_" + Date.now();
        var job = {
          id: jobId,
          phones: phones,
          target: target,
          message: msg,
          fireEpochMs: fireEpochMs,
          istTimeStr: timeVal,
          status: "ARMED",
          triggered: false
        };

        await apiCall("save_scheduled_dm", { job: job });
        activeSnipers[jobId] = job;
        renderSniperQueue();
        logTerm("⏰ <b style='color:#f59e0b;'>EXACT-TIME SNIPER ARMED!</b> Target: <code>" + target + "</code> at <b>" + timeVal + "</b> (Pre-connects at T-4.0s!)");
        toast("⏰ First-DM Sniper Armed for " + timeVal + "!", "#f59e0b");
      });

      async function syncScheduledDms() {
        var res = await apiCall("list_scheduled_dms", {});
        var list = Array.isArray(res.jobs) ? res.jobs : [];
        for (var i = 0; i < list.length; i++) {
          var j = list[i];
          if (j && j.status !== "FIRED" && !activeSnipers[j.id]) {
            j.triggered = false;
            activeSnipers[j.id] = j;
          }
        }
        renderSniperQueue();
      }

      document.getElementById("btn-sync-queue").addEventListener("click", syncScheduledDms);

      function renderSniperQueue() {
        var box = document.getElementById("dm-queue-list");
        var keys = Object.keys(activeSnipers);
        if (keys.length === 0) {
          box.innerHTML = '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:24px;">📭 No timed DMs armed.</div>';
          document.getElementById("sniper-box").style.display = "none";
          return;
        }
        box.innerHTML = "";
        for (var i = 0; i < keys.length; i++) {
          (function (job) {
            var div = document.createElement("div");
            div.className = "queue-item";
            div.innerHTML =
              "<div><b>⏰ " + job.istTimeStr + "</b> ➔ <code>" + job.target + "</code><br>" +
              "<span style='color:#94a3b8;'>IDs: " + (job.phones ? job.phones.length : 1) + " • Status: <b style='color:#34d399;'>" + job.status + "</b></span></div>";
            var btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.className = "btn btn-red btn-sm";
            btnDel.textContent = "✖ CANCEL";
            btnDel.addEventListener("click", async function () {
              delete activeSnipers[job.id];
              await apiCall("delete_scheduled_dm", { jobId: job.id });
              renderSniperQueue();
            });
            div.appendChild(btnDel);
            box.appendChild(div);
          })(activeSnipers[keys[i]]);
        }
      }

      // HIGH-PRECISION 100MS SNIPER WATCHDOG (PRE-CONNECTS AT T-4.0 SECONDS!)
      function tickSniperCountdown() {
        var keys = Object.keys(activeSnipers);
        if (!keys.length) return;
        var nowMs = getAccurateNowMs();
        var nextJob = null;

        for (var i = 0; i < keys.length; i++) {
          var job = activeSnipers[keys[i]];
          if (!job || job.triggered) continue;
          var diffMs = job.fireEpochMs - nowMs;

          if (!nextJob || job.fireEpochMs < nextJob.fireEpochMs) {
            nextJob = job;
          }

          // FIRE REQUEST 4.0 SECONDS EARLY SO SERVER CONNECTS & HOLDS UNTIL EXACT 000MS!
          if (diffMs <= 4000) {
            job.triggered = true;
            job.status = "PRE-CONNECTED & FIRING...";
            renderSniperQueue();
            executePreConnectedSniper(job);
          }
        }

        var sBox = document.getElementById("sniper-box");
        if (nextJob) {
          sBox.style.display = "block";
          var rem = Math.max(0, nextJob.fireEpochMs - nowMs);
          var hrs = Math.floor(rem / 3600000);
          var mins = Math.floor((rem % 3600000) / 60000);
          var secs = Math.floor((rem % 60000) / 1000);
          var ms = Math.floor(rem % 1000);
          document.getElementById("sniper-target-label").textContent = "🎯 ARMED: " + nextJob.target + " (" + nextJob.istTimeStr + ")";
          document.getElementById("sniper-clock").textContent =
            String(hrs).padStart(2, "0") + ":" +
            String(mins).padStart(2, "0") + ":" +
            String(secs).padStart(2, "0") + "." +
            String(ms).padStart(3, "0");
          document.getElementById("sniper-phase").textContent =
            rem <= 5000 ? "🔥 PRE-CONNECTING TELEGRAM NOW FOR EXACT 000MS FIRE!" : "⏳ Armed & waiting for T-4.0s Pre-Connect Window...";
        }
      }

      async function executePreConnectedSniper(job) {
        logTerm("🔥 <b>[T-4s PRE-CONNECT]</b> Connecting Telegram IDs & locking target <code>" + job.target + "</code> for exact 000ms release...");
        var res = await apiCall("sniper_fire_dm", {
          jobId: job.id,
          phones: job.phones,
          target: job.target,
          message: job.message,
          fireEpochMs: job.fireEpochMs
        });
        logTerm("🎯 <b style='color:#10b981;'>EXACT-TIME DM FIRED!</b> " + (res.summary || res.error || "Done"));
        toast("🎯 First-DM Sniper Fired at Exact Second!", "#10b981");
        delete activeSnipers[job.id];
        renderSniperQueue();
      }

      // Periodically check Firebase for DMs scheduled via Direct Telegram Bot
      setInterval(function () {
        if (document.getElementById("vault-lock").classList.contains("unlocked")) {
          syncScheduledDms();
        }
      }, 15000);

      // ====================================================================
      // 6. MODULE 3: DIRECT TELEGRAM BOT TOKEN & WEBHOOK ACTIVATION
      // ====================================================================
      document.getElementById("btn-activate-bot").addEventListener("click", async function () {
        var tok = document.getElementById("inp-bot-token").value.trim();
        if (!tok || tok.indexOf(":") === -1) return toast("⚠️ Enter a valid BotFather Token!", "#f43f5e");
        document.getElementById("bot-setup-result").textContent = "⏳ Connecting BotFather Webhook to Panel 2...";
        var res = await apiCall("setup_direct_bot", { token: tok });
        if (res && res.success) {
          document.getElementById("bot-status-tag").textContent = "🟢 WEBHOOK LIVE";
          document.getElementById("bot-setup-result").innerHTML =
            "✅ <b>BOT LIVE WITHOUT BOTS.BUSINESS!</b><br>🤖 Bot: @" + res.botUsername + "<br>🔐 Send <code>252010</code> to your bot to unlock!";
          logTerm("🤖 <b>Direct Telegram Bot Activated:</b> @" + res.botUsername);
          toast("🤖 Direct Bot Webhook Live!", "#10b981");
        } else {
          document.getElementById("bot-setup-result").textContent = "❌ " + (res ? res.error : "Failed");
          toast("❌ Webhook Setup Failed!", "#f43f5e");
        }
      });

      document.getElementById("btn-remove-webhook").addEventListener("click", async function () {
        var res = await apiCall("disable_direct_bot", {});
        document.getElementById("bot-status-tag").textContent = "🔴 DISABLED";
        document.getElementById("bot-setup-result").textContent = res.summary || "Webhook Disabled.";
        toast("⏹️ Direct Bot Disabled.", "#f59e0b");
      });

      // Navigation Tabs
      var navBtns = document.querySelectorAll(".nav-btn[data-pane]");
      for (var n = 0; n < navBtns.length; n++) {
        navBtns[n].addEventListener("click", function () {
          var target = this.getAttribute("data-pane");
          var panes = document.querySelectorAll(".pane");
          for (var p = 0; p < panes.length; p++) panes[p].classList.remove("active");
          for (var b = 0; b < navBtns.length; b++) navBtns[b].classList.remove("active");
          document.getElementById(target).classList.add("active");
          this.classList.add("active");
        });
      }

      document.getElementById("btn-clear-term").addEventListener("click", function () {
        document.getElementById("term-box").innerHTML = "⚡ [TERMINAL CLEARED]: Ready.";
      });

      // Auto-unlock if already unlocked in this session
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
// 7. MAIN SERVERLESS API HANDLER (/api/panel2)
// ============================================================================
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ---- DIRECT TELEGRAM BOT WEBHOOK ROUTE (?webhook=1) ----
  if (req.query && req.query.webhook === "1") {
    return await handleTelegramBotWebhook(req, res);
  }

  // ---- RENDER PANEL 2 WEBSITE ON BROWSER GET ----
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
    // ================= 0. ATOMIC SERVER TIME SYNC =================
    if (action === "server_time") {
      return res.status(200).json({ success: true, serverEpochMs: Date.now() });
    }

    // ================= 1. INIT STATE (SHARED FIREBASE panel/accounts + BOT CONFIG) =================
    if (action === "init_state") {
      const accounts = await loadAllAccounts();
      const safeAccs = accounts.map(function (a) {
        return { phone: a.phone, name: a.name || "User", username: a.username || "None" };
      });
      const botConfig = (await fbGet("panel2/bot_config")) || {};
      return res.status(200).json({ success: true, accounts: safeAccs, botConfig: botConfig });
    }

    // ================= 2. DIRECT BOT TOKEN & WEBHOOK SETUP =================
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
      await fbSet("panel2/bot_config", {
        token: token,
        botUsername: me.result.username,
        webhookUrl: webhookUrl,
        webhookActive: true
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

    function findAcc(phone) {
      return allAccounts.find(function (a) { return a.phone === phone; });
    }

    // ================= 3. REFER STEP 1: /start & INSPECT BOT BUTTONS =================
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
        let combined = {
          inlineButtons: [],
          publicChannels: [],
          privateChannels: [],
          miniAppButtons: [],
          hasContactShareButton: false,
          contactShareText: ""
        };

        if (msgs && msgs.length) {
          for (let i = 0; i < msgs.length; i++) {
            const c = extractMessageControls(msgs[i]);
            if (c.hasContactShareButton) {
              combined.hasContactShareButton = true;
              combined.contactShareText = c.contactShareText;
            }
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

    // ================= 4. REFER STEP 2A: JOIN PUBLIC CHANNELS BATCH (INSTANT, NO DELAY) =================
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
          summary: "Joined " + joined + "/" + channels.length + " Public Channels" + (autoCleaned ? " (Auto-cleaned " + autoCleaned + " old channels!)" : "")
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ================= 5. REFER STEP 2B: JOIN ONE PRIVATE / REQUEST CHANNEL =================
    if (action === "refer_step_join_private_one") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });

      const client = await connectAccount(acc, defaultApi);
      try {
        const r = await joinSingleChannelWithAutoClean(client, body.channelUrl, true);
        const note = r.status === "REQUEST_SENT" ? "Join Request Sent" : r.status;
        return res.status(200).json({
          success: true,
          summary: "🟢 " + note + (r.autoCleaned ? " (Auto-cleaned " + r.autoCleaned + " old channels!)" : "")
        });
      } catch (e) {
        return res.status(200).json({ success: false, summary: "⚠️ " + (e.message || "Join failed") });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ================= 6. REFER STEP 3: CLICK LAST CLAIM INLINE BUTTON + CHECK CONTACT / MINI-APP =================
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
            summary = "🟢 Clicked [" + btn.text + "]" + (cb && cb.message ? " ➔ Bot: " + cb.message : "");
          } catch (cbErr) {
            summary = "👆 Pressed [" + btn.text + "]";
          }
        } else {
          summary = "👆 Triggered [" + (btn.text || "Claim") + "]";
        }

        await sleepMs(1600);
        const newMsgs = await client.getMessages(botEntity, { limit: 3 });
        let hasContact = false;
        let miniAppBtn = null;

        if (newMsgs && newMsgs.length) {
          for (let i = 0; i < newMsgs.length; i++) {
            const c = extractMessageControls(newMsgs[i]);
            if (c.hasContactShareButton) hasContact = true;
            if (c.miniAppButtons.length > 0 && !miniAppBtn) {
              miniAppBtn = c.miniAppButtons[c.miniAppButtons.length - 1];
            }
          }
        }

        return res.status(200).json({
          success: true,
          summary: summary,
          hasContactShareButton: hasContact,
          miniAppButton: miniAppBtn
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ================= 7. REFER STEP 4: AUTO SHARE CONTACT =================
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

        return res.status(200).json({
          success: true,
          summary: "📱 Contact Shared (" + acc.phone + ")" + (miniAppBtn ? " ➔ Verification Mini-App Found!" : ""),
          miniAppButton: miniAppBtn
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ================= 8. REFER STEP 5: OPEN VERIFICATION MINI-APP (FOR 1-MINUTE HOLD) =================
    if (action === "refer_step_open_miniapp") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, summary: "Account missing" });

      const client = await connectAccount(acc, defaultApi);
      try {
        const botEntity = await client.getInputEntity(body.botUser);
        const maBtn = body.miniAppButton || null;
        let openedUrl = "";

        // 1. Try RequestAppWebView if shortName exists
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

        // 2. Try RequestWebView with Mini-App button URL
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

        // 3. Fallback: RequestMainWebView
        if (!openedUrl && Api.messages.RequestMainWebView) {
          try {
            const r3 = await client.invoke(new Api.messages.RequestMainWebView({
              peer: botEntity,
              bot: botEntity,
              platform: "android",
              startParam: body.startParam || undefined
            }));
            if (r3 && r3.url) openedUrl = r3.url;
          } catch (e) {}
        }

        // Ping opened WebView URL so verification server registers the visit!
        if (openedUrl && openedUrl.startsWith("http")) {
          try {
            await fetch(openedUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36" }
            });
          } catch (e) {}
        }

        return res.status(200).json({
          success: true,
          summary: body.isHeartbeat
            ? "💓 Mini-App Verification Keep-Alive Ping Sent!"
            : "🎮 Mini-App Verification Started!" + (openedUrl ? " (WebView Session Active)" : "")
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ================= 9. MANUAL OLDEST 50 CHANNELS CLEANER =================
    if (action === "clean_oldest_channels") {
      const acc = findAcc(body.phone);
      if (!acc) return res.status(200).json({ success: false, error: "Account not found" });
      const client = await connectAccount(acc, defaultApi);
      try {
        const resClean = await leaveOldestChannels(client, body.count || 50);
        return res.status(200).json({
          success: true,
          summary: "🧹 <b>" + (acc.name || acc.phone) + ":</b> Left <b>" + resClean.leftCount + "</b> oldest channels (Scanned: " + resClean.totalScanned + ")"
        });
      } finally {
        await safeDisconnect(client);
      }
    }

    // ================= 10. EXACT-TIME FIRST-DM SNIPER (PRE-CONNECTED 0MS FIRE) =================
    if (action === "save_scheduled_dm") {
      const job = body.job;
      if (job && job.id) {
        await fbSet("panel2/scheduled_dms/" + job.id, job);
      }
      return res.status(200).json({ success: true });
    }

    if (action === "delete_scheduled_dm") {
      if (body.jobId) {
        await fbSet("panel2/scheduled_dms/" + body.jobId, null);
      }
      return res.status(200).json({ success: true });
    }

    if (action === "list_scheduled_dms") {
      const raw = (await fbGet("panel2/scheduled_dms")) || {};
      const jobs = Object.values(raw).filter(Boolean);
      return res.status(200).json({ success: true, jobs: jobs });
    }

    if (action === "sniper_fire_dm") {
      const target = String(body.target || "").trim();
      const message = String(body.message || "").trim();
      const fireEpochMs = Number(body.fireEpochMs || 0);
      const reqPhones = Array.isArray(body.phones) ? body.phones : [];

      const pool = allAccounts.filter(function (a) { return reqPhones.indexOf(a.phone) !== -1; });
      if (!pool.length || !target || !message) {
        return res.status(200).json({ success: false, error: "Missing Sender ID, Target or Message" });
      }

      // STEP 1: Pre-connect ALL selected accounts & resolve target peer BEFORE target time!
      const readyClients = [];
      await Promise.allSettled(
        pool.map(async function (acc) {
          const client = await connectAccount(acc, defaultApi);
          try {
            const peer = await client.getInputEntity(target);
            readyClients.push({ acc: acc, client: client, peer: peer });
          } catch (e) {
            await safeDisconnect(client);
          }
        })
      );

      if (!readyClients.length) {
        return res.status(200).json({ success: false, error: "Could not resolve target or connect account." });
      }

      // STEP 2: High-precision wait until EXACT target millisecond (max 7s guard inside serverless)
      if (fireEpochMs > Date.now()) {
        const waitMs = Math.min(7000, fireEpochMs - Date.now());
        if (waitMs > 15) {
          await sleepMs(waitMs - 10);
        }
        while (Date.now() < fireEpochMs && (fireEpochMs - Date.now()) < 50) {
          // Precision spin for final 10ms so DM fires at exact 000ms!
        }
      }

      // STEP 3: Fire all DMs simultaneously at exact millisecond!
      const actualFireMs = Date.now();
      let sent = 0;
      await Promise.allSettled(
        readyClients.map(async function (item) {
          try {
            await item.client.sendMessage(item.peer, { message: message });
            sent++;
          } finally {
            await safeDisconnect(item.client);
          }
        })
      );

      if (body.jobId) {
        await fbSet("panel2/scheduled_dms/" + body.jobId, null);
      }

      const driftMs = fireEpochMs > 0 ? (actualFireMs - fireEpochMs) : 0;
      return res.status(200).json({
        success: true,
        summary:
          "🎯 Delivered from <b>" + sent + "/" + pool.length + " ID(s)</b> to <code>" + target + "</code>" +
          (fireEpochMs > 0 ? " (Precision Drift: <b>" + (driftMs >= 0 ? "+" : "") + driftMs + "ms</b>)" : "")
      });
    }

    return res.status(200).json({ success: false, error: "Unknown action" });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message || "Server Error" });
  }
};