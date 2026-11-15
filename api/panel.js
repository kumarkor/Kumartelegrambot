const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const PasswordHelper = require("telegram/Password");

// ============================================================================
// 1. CONFIGURATION & FIREBASE REALTIME DATABASE REST ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";

const ALL_TELEGRAM_REACTIONS = [
  "👍", "👎", "❤️", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱",
  "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊️", "🤡",
  "🥱", "🥴", "😍", "🐳", "❤️‍🔥", "🌚", "🌭", "💯", "🤣", "⚡",
  "🍌", "🏆", "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈",
  "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈", "😇", "😨",
  "🤝", "✍️", "🤗", "🫡", "🎅", "🎄", "☃️", "💅", "🤪", "🗿",
  "🆒", "💘", "🙉", "🦄", "😘", "💊", "🙊", "😎", "👾", "🤷‍♂️",
  "🤷", "🤷‍♀️", "😡"
];

async function fbGet(path) {
  try {
    const response = await fetch(DB_URL + "/" + path + ".json");
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
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
  } catch (err) {
    return false;
  }
}

// SAFE DISCONNECT: Uses disconnect() instead of abrupt destroy() so Telegram NEVER logs out the session!
async function safeDisconnect(client) {
  try {
    if (client) {
      await Promise.race([
        client.disconnect(),
        new Promise(function (resolve) {
          setTimeout(resolve, 1200);
        })
      ]);
    }
  } catch (e) {}
}

// Per-account timeout guard so Vercel NEVER hangs or glitches
function withTimeout(promise, ms, timeoutMsg) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error(timeoutMsg || "Account operation timed out"));
      }, ms);
    })
  ]);
}

// ============================================================================
// 2. BULLETPROOF 2FA PASSWORD VERIFIER & PARSING HELPERS
// ============================================================================
async function verifyTelegram2FAPassword(client, apiId, apiHash, password) {
  if (PasswordHelper && typeof PasswordHelper.computeCheck === "function") {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordSrp = await PasswordHelper.computeCheck(passwordInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));
    return true;
  }
  if (PasswordHelper && typeof PasswordHelper.computeCheckPassword === "function") {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordSrp = await PasswordHelper.computeCheckPassword(passwordInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));
    return true;
  }
  if (typeof client.signInWithPassword === "function") {
    await client.signInWithPassword(
      { apiId: Number(apiId), apiHash: String(apiHash) },
      {
        password: async function () {
          return String(password);
        },
        onError: function (err) {
          throw err;
        }
      }
    );
    return true;
  }
  throw new Error("2FA verification helper unavailable.");
}

// Parses https://t.me/channel/123 or https://t.me/c/1234567/89
function parseTelegramPostLink(rawLink) {
  const clean = String(rawLink || "").trim();
  const cMatch = clean.match(/t\.me\/c\/(\d+)\/(\d+)/i);
  if (cMatch) {
    return {
      peer: "-100" + cMatch[1],
      msgId: parseInt(cMatch[2], 10)
    };
  }
  const pubMatch = clean.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/i);
  if (pubMatch) {
    return {
      peer: pubMatch[1],
      msgId: parseInt(pubMatch[2], 10)
    };
  }
  const slashParts = clean.replace("@", "").split("/");
  if (slashParts.length >= 2 && /^\d+$/.test(slashParts[1].split("?")[0])) {
    return {
      peer: slashParts[0],
      msgId: parseInt(slashParts[1], 10)
    };
  }
  return null;
}

// Parses Bot Links, Mini-App Links (t.me/Bot/app?startapp=123), or @BotName
function parseBotAndMiniAppInput(rawInput, explicitParam) {
  const str = String(rawInput || "").trim();
  let botUser = str;
  let appShortName = "";
  let startParam = String(explicitParam || "").trim();
  let isDirectUrl = false;

  if (str.indexOf("t.me/") !== -1) {
    const afterTme = str.split("t.me/")[1];
    const qParts = afterTme.split("?");
    const pathSegments = qParts[0].split("/").filter(Boolean);

    botUser = (pathSegments[0] || "").trim();
    if (pathSegments.length >= 2 && !/^\d+$/.test(pathSegments[1])) {
      appShortName = pathSegments[1].trim();
    }

    if (qParts[1]) {
      const urlParams = new URLSearchParams(qParts[1]);
      if (urlParams.get("startapp")) startParam = urlParams.get("startapp");
      else if (urlParams.get("start")) startParam = urlParams.get("start");
    }
  } else if (str.startsWith("http://") || str.startsWith("https://")) {
    isDirectUrl = true;
  } else if (str.indexOf(" ") !== -1 && !startParam) {
    const sp = str.split(/\s+/);
    botUser = sp[0];
    startParam = sp[1] || "";
  }

  botUser = botUser.replace("@", "").trim();
  return {
    botUser: botUser,
    appShortName: appShortName,
    startParam: startParam,
    isDirectUrl: isDirectUrl,
    rawUrl: str
  };
}

// Filter accounts based on UI checkboxes AND apply user's requested quantity limit (e.g. 1, 5, 7, ALL)
function filterTargetAccounts(allAccounts, selectedPhones, limitCount) {
  let filtered = allAccounts;
  if (Array.isArray(selectedPhones) && selectedPhones.length > 0 && selectedPhones.indexOf("ALL") === -1) {
    filtered = allAccounts.filter(function (acc) {
      return selectedPhones.indexOf(acc.phone) !== -1;
    });
  }
  const numLimit = parseInt(String(limitCount || "").trim(), 10);
  if (!isNaN(numLimit) && numLimit > 0 && numLimit < filtered.length) {
    return filtered.slice(0, numLimit);
  }
  return filtered;
}

// Extract flat array of inline buttons from a Telegram Message
function extractInlineButtonsFromMessage(msg) {
  const buttons = [];
  if (!msg || !msg.replyMarkup || !Array.isArray(msg.replyMarkup.rows)) {
    return buttons;
  }
  let flatIndex = 0;
  for (let r = 0; r < msg.replyMarkup.rows.length; r++) {
    const row = msg.replyMarkup.rows[r];
    if (!row || !Array.isArray(row.buttons)) continue;
    for (let b = 0; b < row.buttons.length; b++) {
      const btn = row.buttons[b];
      if (!btn) continue;
      flatIndex++;
      let btnType = "UNKNOWN";
      const cls = String(btn.className || "");
      if (cls.indexOf("WebView") !== -1) btnType = "MINI_APP_WEBVIEW";
      else if (btn.url && (btn.url.indexOf("startapp=") !== -1 || /t\.me\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+/.test(btn.url))) btnType = "MINI_APP_LINK";
      else if (btn.url) btnType = "URL_BUTTON";
      else if (btn.data) btnType = "CALLBACK_BUTTON";

      buttons.push({
        index: flatIndex,
        row: r + 1,
        col: b + 1,
        text: btn.text || ("Button #" + flatIndex),
        type: btnType,
        className: cls,
        url: btn.url || "",
        data: btn.data || null,
        buttonId: btn.buttonId || null,
        rawButton: btn
      });
    }
  }
  return buttons;
}

// Helper to open a Mini-App or execute an Inline Button on a message
async function executeInlineButtonOrMiniApp(client, peerEntity, msgId, targetBtn, fallbackBotEntity, startParam) {
  let actionSummary = "";
  const rawBtn = targetBtn.rawButton;
  const cls = String(targetBtn.className || "");

  // 1. Direct WebView / Mini-App Button (KeyboardButtonWebView / KeyboardButtonSimpleWebView)
  if (cls.indexOf("WebView") !== -1 || (targetBtn.url && targetBtn.type === "MINI_APP_WEBVIEW")) {
    const botPeer = fallbackBotEntity || peerEntity;
    try {
      await client.invoke(
        new Api.messages.RequestWebView({
          peer: peerEntity,
          bot: botPeer,
          platform: "android",
          fromBotMenu: false,
          url: targetBtn.url || undefined,
          startParam: startParam || undefined
        })
      );
      return "🎮 Opened Mini-App WebView [" + targetBtn.text + "]";
    } catch (wvErr) {
      if (Api.messages.RequestSimpleWebView && targetBtn.url) {
        await client.invoke(
          new Api.messages.RequestSimpleWebView({
            bot: botPeer,
            url: targetBtn.url,
            platform: "android"
          })
        );
        return "🎮 Opened Simple Mini-App [" + targetBtn.text + "]";
      }
      throw wvErr;
    }
  }

  // 2. Callback Inline Button (KeyboardButtonCallback)
  if (targetBtn.data) {
    let cbResult = null;
    try {
      cbResult = await client.invoke(
        new Api.messages.GetBotCallbackAnswer({
          peer: peerEntity,
          msgId: Number(msgId),
          data: targetBtn.data
        })
      );
    } catch (cbErr) {
      if (cbErr.message && cbErr.message.indexOf("TIMEOUT") !== -1) {
        return "👆 Clicked Callback Button [" + targetBtn.text + "]";
      }
      throw cbErr;
    }

    actionSummary = "👆 Clicked Inline Button [" + targetBtn.text + "]";
    if (cbResult && cbResult.message) {
      actionSummary += " (Bot Alert: " + cbResult.message + ")";
    }
    if (cbResult && cbResult.url) {
      // If callback returned a Mini-App URL or game URL, open it!
      try {
        await openMiniAppByUrl(client, peerEntity, fallbackBotEntity, cbResult.url, startParam);
        actionSummary += " + 🎮 Opened Mini-App URL";
      } catch (e) {}
    }
    return actionSummary;
  }

  // 3. URLAuth Button (KeyboardButtonUrlAuth)
  if (cls.indexOf("UrlAuth") !== -1 || targetBtn.buttonId !== null) {
    try {
      const authReq = await client.invoke(
        new Api.messages.RequestUrlAuth({
          peer: peerEntity,
          msgId: Number(msgId),
          buttonId: Number(targetBtn.buttonId || 0),
          url: targetBtn.url || undefined
        })
      );
      if (authReq && authReq.className === "UrlAuthResultRequest") {
        await client.invoke(
          new Api.messages.AcceptUrlAuth({
            writeAllowed: true,
            peer: peerEntity,
            msgId: Number(msgId),
            buttonId: Number(targetBtn.buttonId || 0),
            url: targetBtn.url || undefined
          })
        );
      }
      return "🔐 Authorized & Opened Button [" + targetBtn.text + "]";
    } catch (e) {}
  }

  // 4. URL Button (t.me Mini-App Link, Bot Link, or External WebView URL)
  if (targetBtn.url) {
    const openedInfo = await openMiniAppByUrl(client, peerEntity, fallbackBotEntity, targetBtn.url, startParam);
    return "🔗 [" + targetBtn.text + "] -> " + openedInfo;
  }

  return "✅ Triggered Button [" + targetBtn.text + "]";
}

// Helper to open any Telegram Mini-App URL (t.me/bot/app?startapp=... or https://...)
async function openMiniAppByUrl(client, peerEntity, fallbackBotEntity, rawUrl, extraStartParam) {
  const parsed = parseBotAndMiniAppInput(rawUrl, extraStartParam);

  // Case A: It is a t.me/BotUser/app?startapp=... or t.me/BotUser?start=... link
  if (parsed.botUser && !parsed.isDirectUrl) {
    const botEntity = await client.getInputEntity(parsed.botUser);

    // 1. Try RequestAppWebView if shortName is present (e.g. t.me/BotUser/appname)
    if (parsed.appShortName && Api.messages.RequestAppWebView && Api.InputBotAppShortName) {
      try {
        await client.invoke(
          new Api.messages.RequestAppWebView({
            peer: botEntity,
            app: new Api.InputBotAppShortName({
              botId: botEntity,
              shortName: parsed.appShortName
            }),
            startParam: parsed.startParam || undefined,
            platform: "android",
            writeAllowed: true
          })
        );
        return "🎮 Opened Mini-App (@" + parsed.botUser + "/" + parsed.appShortName + ")";
      } catch (e1) {}
    }

    // 2. Try RequestMainWebView
    if (Api.messages.RequestMainWebView) {
      try {
        await client.invoke(
          new Api.messages.RequestMainWebView({
            peer: botEntity,
            bot: botEntity,
            startParam: parsed.startParam || undefined,
            platform: "android"
          })
        );
        return "🎮 Opened Main Mini-App (@" + parsed.botUser + ")";
      } catch (e2) {}
    }

    // 3. Try RequestWebView
    try {
      await client.invoke(
        new Api.messages.RequestWebView({
          peer: botEntity,
          bot: botEntity,
          platform: "android",
          fromBotMenu: true,
          startParam: parsed.startParam || undefined
        })
      );
      return "🎮 Opened Bot WebView (@" + parsed.botUser + ")";
    } catch (e3) {}

    // 4. Fallback: Start the bot with startParam
    if (parsed.startParam) {
      await client.invoke(
        new Api.messages.StartBot({
          bot: botEntity,
          peer: botEntity,
          startParam: String(parsed.startParam),
          randomId: BigInt(Math.floor(Math.random() * 1000000000000))
        })
      );
      return "🤖 Started Bot @" + parsed.botUser + " (" + parsed.startParam + ")";
    } else {
      await client.sendMessage(botEntity, { message: "/start" });
      return "🤖 Sent /start to @" + parsed.botUser;
    }
  }

  // Case B: Direct HTTPS WebApp URL
  const botTarget = fallbackBotEntity || peerEntity;
  try {
    await client.invoke(
      new Api.messages.RequestWebView({
        peer: peerEntity,
        bot: botTarget,
        url: rawUrl,
        platform: "android",
        fromBotMenu: false
      })
    );
    return "🌐 Opened WebView URL (" + rawUrl.substring(0, 35) + "...)";
  } catch (e) {
    return "🔗 Processed URL (" + rawUrl.substring(0, 35) + "...)";
  }
}

// ============================================================================
// 3. MASTER QUANTUM WEB CONTROL PANEL UI (100% SYNTAX VERIFIED)
// ============================================================================
function renderMasterWebPanel() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>👑 KUMAR QUANTUM SMM &amp; MULTI-ID AUTOMATION SUITE 👑</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #060210;
      --bg-surface: #110826;
      --bg-card: rgba(20, 11, 44, 0.88);
      --bg-input: #080316;
      --accent-main: #f59e0b;
      --accent-glow: rgba(245, 158, 11, 0.42);
      --accent-sec: #ec4899;
      --accent-sec-glow: rgba(236, 72, 153, 0.38);
      --accent-tert: #8b5cf6;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.4);
      --danger: #f43f5e;
      --danger-glow: rgba(244, 63, 94, 0.4);
      --cyan: #00f0ff;
      --text-primary: #ffffff;
      --text-secondary: #cbd5e1;
      --text-dim: #94a3b8;
      --border-glass: rgba(245, 158, 11, 0.28);
      --border-strong: rgba(245, 158, 11, 0.78);
      --gradient-royal: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%);
      --gradient-btn: linear-gradient(90deg, #f59e0b, #d97706);
    }

    body.theme-emerald {
      --bg-base: #020f09;
      --bg-surface: #062115;
      --bg-card: rgba(7, 34, 22, 0.9);
      --bg-input: #03130b;
      --accent-main: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.42);
      --accent-sec: #06b6d4;
      --accent-tert: #3b82f6;
      --border-glass: rgba(16, 185, 129, 0.3);
      --border-strong: rgba(16, 185, 129, 0.8);
      --gradient-royal: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
      --gradient-btn: linear-gradient(90deg, #10b981, #059669);
    }

    body.theme-crimson {
      --bg-base: #120206;
      --bg-surface: #240610;
      --bg-card: rgba(40, 8, 18, 0.9);
      --bg-input: #170309;
      --accent-main: #ff2a5f;
      --accent-glow: rgba(255, 42, 95, 0.45);
      --accent-sec: #f97316;
      --accent-tert: #eab308;
      --border-glass: rgba(255, 42, 95, 0.3);
      --border-strong: rgba(255, 42, 95, 0.8);
      --gradient-royal: linear-gradient(135deg, #ff2a5f 0%, #f97316 50%, #eab308 100%);
      --gradient-btn: linear-gradient(90deg, #ff2a5f, #e11d48);
    }

    body.theme-cyber {
      --bg-base: #020813;
      --bg-surface: #07152b;
      --bg-card: rgba(10, 25, 50, 0.9);
      --bg-input: #040d1a;
      --accent-main: #00f0ff;
      --accent-glow: rgba(0, 240, 255, 0.45);
      --accent-sec: #3b82f6;
      --accent-tert: #a855f7;
      --border-glass: rgba(0, 240, 255, 0.3);
      --border-strong: rgba(0, 240, 255, 0.8);
      --gradient-royal: linear-gradient(135deg, #00f0ff 0%, #3b82f6 50%, #a855f7 100%);
      --gradient-btn: linear-gradient(90deg, #00f0ff, #0284c7);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      background-image:
        radial-gradient(circle at 10% 10%, var(--accent-glow) 0%, transparent 35%),
        radial-gradient(circle at 90% 90%, var(--accent-sec-glow) 0%, transparent 35%);
      background-attachment: fixed;
    }

    .quantum-grid-bg {
      position: fixed;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
      background-size: 36px 36px;
      pointer-events: none;
      z-index: 0;
    }

    /* ========================================================================
       1. SECURITY VAULT LOCK SCREEN & REJOIN PIN MODAL (PIN: 252010)
       ======================================================================== */
    #vault-overlay, #rejoin-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: radial-gradient(circle at top, #1e0b3b 0%, #05010d 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      transition: opacity 0.35s ease, visibility 0.35s ease;
    }

    #vault-overlay.vault-open, #rejoin-modal-overlay.vault-open {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .vault-container {
      width: 100%;
      max-width: 440px;
      background: rgba(16, 8, 36, 0.96);
      border: 2px solid var(--border-strong);
      border-radius: 28px;
      padding: 26px 20px;
      box-shadow: 0 0 65px var(--accent-glow), inset 0 0 30px rgba(245, 158, 11, 0.08);
      text-align: center;
      position: relative;
      overflow: hidden;
      max-height: 92vh;
      overflow-y: auto;
    }

    .vault-crown-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.14);
      border: 1px solid var(--accent-main);
      color: var(--accent-main);
      padding: 6px 16px;
      border-radius: 999px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      margin-bottom: 12px;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .vault-heading {
      font-family: 'Cinzel', serif;
      font-size: 22px;
      font-weight: 900;
      background: var(--gradient-royal);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 2px;
      margin-bottom: 6px;
    }

    .vault-subtext {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 16px;
      font-weight: 600;
    }

    .led-pin-boxes {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .led-box {
      height: 48px;
      background: #06020f;
      border: 1.5px solid rgba(245, 158, 11, 0.35);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 22px;
      font-weight: 800;
      color: var(--accent-main);
      transition: all 0.15s ease;
    }

    .led-box.active-digit {
      border-color: var(--accent-main);
      background: rgba(245, 158, 11, 0.16);
      box-shadow: 0 0 15px var(--accent-glow);
      transform: translateY(-2px);
    }

    .led-box.error-shake {
      border-color: var(--danger);
      color: var(--danger);
      background: rgba(244, 63, 94, 0.16);
      animation: shakeBox 0.35s ease;
    }

    @keyframes shakeBox {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-7px); }
      75% { transform: translateX(7px); }
    }

    .direct-pin-row {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }

    .direct-pin-field {
      flex: 1;
      padding: 12px 14px;
      background: #06020f;
      border: 1.5px solid var(--border-glass);
      border-radius: 12px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 5px;
      outline: none;
    }

    .direct-unlock-btn {
      background: var(--gradient-btn);
      color: #05010d;
      border: none;
      border-radius: 12px;
      padding: 0 18px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .tactile-keypad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }

    .key-tile {
      background: linear-gradient(180deg, rgba(38, 20, 74, 0.9), rgba(18, 9, 38, 0.95));
      border: 1px solid rgba(245, 158, 11, 0.32);
      border-bottom: 3px solid rgba(245, 158, 11, 0.6);
      border-radius: 14px;
      padding: 12px 0;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 800;
      cursor: pointer;
      user-select: none;
    }

    .key-tile:active {
      transform: translateY(2px);
      background: var(--accent-main);
      color: #000000;
    }

    .key-tile.key-clr {
      color: #fda4af;
      border-color: rgba(244, 63, 94, 0.45);
      border-bottom-color: var(--danger);
      font-size: 13px;
    }

    .key-tile.key-ok {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #ffffff;
      border-color: #34d399;
      border-bottom-color: #047857;
      font-size: 13px;
    }

    #vault-feedback {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--accent-main);
      min-height: 18px;
    }

    /* ========================================================================
       2. MAIN ROYAL COMMAND CENTER LAYOUT
       ======================================================================== */
    .master-shell {
      position: relative;
      z-index: 1;
      max-width: 1260px;
      margin: 0 auto;
      padding: 16px 14px 100px;
    }

    .royal-header {
      background: linear-gradient(135deg, rgba(26, 13, 54, 0.95), rgba(11, 5, 24, 0.96));
      border: 1.5px solid var(--border-strong);
      border-radius: 24px;
      padding: 18px 22px;
      margin-bottom: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 30px var(--accent-glow);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .royal-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .royal-emblem {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--gradient-royal);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 0 25px var(--accent-glow);
      flex-shrink: 0;
    }

    .royal-title-block h1 {
      font-family: 'Cinzel', serif;
      font-size: 20px;
      font-weight: 900;
      color: var(--accent-main);
      letter-spacing: 1.2px;
      text-shadow: 0 0 14px var(--accent-glow);
    }

    .royal-title-block p {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 600;
      margin-top: 2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .theme-pill {
      background: var(--bg-input);
      border: 1px solid var(--border-glass);
      color: var(--accent-main);
      padding: 8px 12px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      cursor: pointer;
    }

    .clock-pill {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid var(--border-glass);
      padding: 8px 12px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #ffffff;
    }

    .lock-btn-top {
      background: rgba(244, 63, 94, 0.18);
      border: 1px solid var(--danger);
      color: #fda4af;
      padding: 8px 14px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }

    /* ========================================================================
       4 HOLOGRAPHIC METRIC CARDS
       ======================================================================== */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .metric-box {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 18px;
      padding: 15px 16px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(14px);
    }

    .metric-tag {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      margin-bottom: 4px;
    }

    .metric-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 25px;
      font-weight: 800;
      color: var(--accent-main);
    }

    .metric-foot {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 4px;
      font-weight: 600;
    }

    /* ========================================================================
       GLOBAL ACCOUNT SELECTOR BAR (CHOOSE 1, MULTIPLE, OR ALL IDs)
       ======================================================================== */
    .selector-bar {
      background: var(--bg-card);
      border: 1.5px solid var(--border-strong);
      border-radius: 20px;
      padding: 14px 18px;
      margin-bottom: 16px;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.45);
    }

    .selector-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 10px;
    }

    .selector-title {
      font-size: 13px;
      font-weight: 800;
      color: var(--accent-main);
      letter-spacing: 0.6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .account-chips-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .acc-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-glass);
      color: var(--text-secondary);
      padding: 7px 12px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    .acc-chip.selected {
      background: rgba(16, 185, 129, 0.16);
      border-color: var(--success);
      color: #ffffff;
      box-shadow: 0 0 14px rgba(16, 185, 129, 0.3);
    }

    .acc-chip .dot-ind {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
    }

    .acc-chip.selected .dot-ind {
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }

    /* ========================================================================
       6 MASTER NAVIGATION TABS
       ======================================================================== */
    .command-tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    }

    .cmd-tab {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 14px;
      padding: 13px 10px;
      color: var(--text-secondary);
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .cmd-tab.active-tab {
      background: var(--gradient-royal);
      color: #ffffff;
      border-color: #ffffff;
      box-shadow: 0 0 22px var(--accent-glow);
      transform: translateY(-2px);
    }

    .view-pane {
      display: none;
      animation: paneAppear 0.22s ease;
    }

    .view-pane.active-pane {
      display: block;
    }

    @keyframes paneAppear {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ========================================================================
       GLASS PANELS, INPUTS, QUANTITY PICKERS & FULL 73+ EMOJI GRID
       ======================================================================== */
    .two-col-layout {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .glass-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 22px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(16px);
    }

    .panel-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding-bottom: 12px;
      margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .panel-heading {
      font-size: 14.5px;
      font-weight: 800;
      color: var(--accent-main);
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge-chip {
      background: rgba(245, 158, 11, 0.16);
      border: 1px solid var(--accent-main);
      color: var(--accent-main);
      padding: 3px 10px;
      border-radius: 999px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 800;
    }

    .field-block {
      margin-bottom: 12px;
    }

    .field-title {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 800;
      color: var(--text-secondary);
      margin-bottom: 5px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .field-title span {
      color: var(--accent-main);
      font-family: 'JetBrains Mono', monospace;
    }

    .royal-input, .royal-textarea, .royal-select {
      width: 100%;
      padding: 12px 14px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-glass);
      border-radius: 13px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13.5px;
      outline: none;
      transition: all 0.2s ease;
    }

    .royal-textarea {
      min-height: 92px;
      resize: vertical;
      line-height: 1.5;
    }

    .royal-input:focus, .royal-textarea:focus, .royal-select:focus {
      border-color: var(--accent-main);
      box-shadow: 0 0 16px var(--accent-glow);
    }

    /* QUANTITY SELECTOR BAR (1, 5, 7, 10, ALL + CUSTOM INPUT) */
    .qty-control-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      background: rgba(8, 3, 22, 0.75);
      border: 1px solid var(--border-glass);
      padding: 8px 10px;
      border-radius: 12px;
    }

    .qty-label {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-secondary);
      margin-right: 4px;
    }

    .qty-preset-btn {
      background: var(--bg-input);
      border: 1px solid var(--border-glass);
      color: var(--accent-main);
      padding: 5px 10px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      font-weight: 800;
      cursor: pointer;
      transition: 0.15s;
    }

    .qty-preset-btn:hover, .qty-preset-btn.active-qty {
      background: var(--accent-main);
      color: #05010d;
      box-shadow: 0 0 10px var(--accent-glow);
    }

    .qty-custom-inp {
      width: 78px;
      padding: 5px 8px;
      background: #04010a;
      border: 1.5px solid var(--accent-main);
      border-radius: 8px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      outline: none;
    }

    /* ALL 73+ TELEGRAM EMOJI REACTIONS GRID */
    .emoji-picker-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
      gap: 6px;
      max-height: 185px;
      overflow-y: auto;
      padding: 8px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-glass);
      border-radius: 14px;
      margin-bottom: 10px;
    }

    .emoji-btn {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 6px 0;
      font-size: 19px;
      cursor: pointer;
      transition: 0.15s;
      text-align: center;
      user-select: none;
    }

    .emoji-btn.active-emoji {
      border-color: var(--success);
      background: rgba(16, 185, 129, 0.25);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.45);
      transform: scale(1.08);
    }

    .emoji-btn:hover {
      border-color: var(--accent-main);
      transform: scale(1.08);
    }

    .action-btn {
      width: 100%;
      padding: 13px 16px;
      border: none;
      border-radius: 13px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .btn-gold {
      background: var(--gradient-btn);
      color: #05010d;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .btn-emerald {
      background: linear-gradient(90deg, #10b981, #059669);
      color: #ffffff;
      box-shadow: 0 0 20px var(--success-glow);
    }

    .btn-crimson {
      background: linear-gradient(90deg, #f43f5e, #e11d48);
      color: #ffffff;
      box-shadow: 0 0 20px var(--danger-glow);
    }

    .btn-royal-purple {
      background: linear-gradient(90deg, #8b5cf6, #ec4899);
      color: #ffffff;
      box-shadow: 0 0 20px var(--accent-sec-glow);
    }

    .btn-cyan {
      background: linear-gradient(90deg, #06b6d4, #2563eb);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(6, 182, 212, 0.35);
    }

    .btn-ghost {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-glass);
      color: var(--accent-main);
    }

    .btn-mini {
      width: auto;
      padding: 6px 12px;
      font-size: 11px;
      margin-bottom: 0;
      border-radius: 9px;
    }

    /* ========================================================================
       LIVE CONSOLE & OTP DISPLAY CARD
       ======================================================================== */
    .console-screen {
      background: #04010a;
      border: 1.5px solid var(--border-strong);
      border-radius: 16px;
      padding: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #fde68a;
      max-height: 240px;
      overflow-y: auto;
      line-height: 1.6;
      white-space: pre-wrap;
      box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.9);
    }

    .log-entry {
      padding-left: 10px;
      border-left: 3px solid var(--accent-main);
      margin-bottom: 10px;
    }

    .otp-highlight-box {
      background: #05020d;
      border: 2px dashed var(--success);
      border-radius: 16px;
      padding: 16px;
      margin-top: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #ffffff;
      line-height: 1.65;
      white-space: pre-wrap;
    }

    /* ========================================================================
       TABLES
       ======================================================================== */
    .table-scroll {
      width: 100%;
      overflow-x: auto;
    }

    .royal-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }

    .royal-table th {
      background: rgba(245, 158, 11, 0.1);
      color: var(--accent-main);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-align: left;
      padding: 11px 13px;
      border-bottom: 1px solid var(--border-glass);
      white-space: nowrap;
    }

    .royal-table td {
      padding: 12px 13px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #ffffff;
      vertical-align: middle;
    }

    .status-joined {
      background: rgba(16, 185, 129, 0.18);
      border: 1px solid var(--success);
      color: #34d399;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 800;
      display: inline-block;
    }

    .status-left {
      background: rgba(244, 63, 94, 0.18);
      border: 1px solid var(--danger);
      color: #fda4af;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 800;
      display: inline-block;
    }

    .api-tag {
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid #a78bfa;
      color: #ddd6fe;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
    }

    .helper-alert {
      background: rgba(245, 158, 11, 0.08);
      border: 1px dashed var(--accent-main);
      border-radius: 14px;
      padding: 11px 14px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 14px;
      line-height: 1.5;
    }

    #toast-zone {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 100000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .royal-toast {
      background: #140a29;
      border-left: 4px solid var(--accent-main);
      border-top: 1px solid var(--border-glass);
      border-right: 1px solid var(--border-glass);
      border-bottom: 1px solid var(--border-glass);
      color: #ffffff;
      padding: 12px 16px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.8);
    }

    @media (max-width: 640px) {
      .royal-title-block h1 { font-size: 16px; }
    }
  </style>
</head>
<body>

  <div class="quantum-grid-bg"></div>

  <!-- ======================================================================
       1. ROYAL QUANTUM VAULT LOCK SCREEN (PIN: 252010)
       ====================================================================== -->
  <div id="vault-overlay">
    <div class="vault-container">
      <div class="vault-crown-badge">👑 QUANTUM SECURITY VAULT 👑</div>
      <div class="vault-heading">MASTER ACCESS LOCK</div>
      <div class="vault-subtext">Enter 6-Digit Security PIN to Unlock Control Deck</div>

      <div class="led-pin-boxes" id="led-boxes">
        <div class="led-box" id="led-0">-</div>
        <div class="led-box" id="led-1">-</div>
        <div class="led-box" id="led-2">-</div>
        <div class="led-box" id="led-3">-</div>
        <div class="led-box" id="led-4">-</div>
        <div class="led-box" id="led-5">-</div>
      </div>

      <div class="direct-pin-row">
        <input
          type="tel"
          id="direct-pin-input"
          class="direct-pin-field"
          maxlength="6"
          placeholder="Type PIN Here"
          autocomplete="off"
        />
        <button type="button" class="direct-unlock-btn" id="btn-direct-unlock">UNLOCK ⚡</button>
      </div>

      <div class="tactile-keypad">
        <button type="button" class="key-tile" data-digit="1">1</button>
        <button type="button" class="key-tile" data-digit="2">2</button>
        <button type="button" class="key-tile" data-digit="3">3</button>
        <button type="button" class="key-tile" data-digit="4">4</button>
        <button type="button" class="key-tile" data-digit="5">5</button>
        <button type="button" class="key-tile" data-digit="6">6</button>
        <button type="button" class="key-tile" data-digit="7">7</button>
        <button type="button" class="key-tile" data-digit="8">8</button>
        <button type="button" class="key-tile" data-digit="9">9</button>
        <button type="button" class="key-tile key-clr" id="btn-key-clr">CLEAR</button>
        <button type="button" class="key-tile" data-digit="0">0</button>
        <button type="button" class="key-tile key-ok" id="btn-key-enter">OPEN 🔓</button>
      </div>

      <div id="vault-feedback">🛡️ PROTECTED BY KUMAR ROYAL FIREWALL</div>
    </div>
  </div>

  <!-- ======================================================================
       1B. 1-CLICK REJOIN / RE-LOGIN MODAL (AUTO-FILLS API_ID + API_HASH + PHONE)
       ====================================================================== -->
  <div id="rejoin-modal-overlay" class="vault-open">
    <div class="vault-container" style="text-align:left;">
      <div style="text-align:center;">
        <div class="vault-crown-badge">🔄 QUICK REJOIN / RE-LOGIN ID 🔄</div>
        <div class="vault-heading" style="font-size:19px;">RECONNECT TELEGRAM ID</div>
        <div class="vault-subtext" id="rejoin-sub-label">API_ID &amp; API_HASH Auto-Loaded!</div>
      </div>

      <div class="field-block">
        <div class="field-title"><label>PHONE NUMBER</label><span>SAVED</span></div>
        <input type="text" id="rejoin-phone" class="royal-input" readonly />
      </div>

      <div class="field-block">
        <div class="field-title"><label>DEDICATED API_ID</label><span>SAVED</span></div>
        <input type="text" id="rejoin-api-id" class="royal-input" />
      </div>

      <div class="field-block">
        <div class="field-title"><label>DEDICATED 32-CHAR API_HASH</label><span>FULL VISIBLE</span></div>
        <input type="text" id="rejoin-api-hash" class="royal-input" />
      </div>

      <button type="button" class="action-btn btn-gold" id="btn-rejoin-send-otp">
        📩 1. SEND LOGIN OTP TO THIS ID NOW
      </button>

      <div class="field-block" style="margin-top:10px;">
        <div class="field-title"><label>ENTER 5-DIGIT TELEGRAM OTP</label><span>STEP 2</span></div>
        <input type="tel" id="rejoin-otp-code" class="royal-input" placeholder="Enter 5-digit OTP code" />
      </div>

      <button type="button" class="action-btn btn-emerald" id="btn-rejoin-verify-otp">
        ✅ 2. VERIFY OTP &amp; REJOIN ID
      </button>

      <div class="field-block" style="margin-top:10px;">
        <div class="field-title"><label>2FA CLOUD PASSWORD (IF ENABLED)</label><span>STEP 3</span></div>
        <input type="text" id="rejoin-2fa-pass" class="royal-input" placeholder="Enter 2FA Password (if required)" />
      </div>

      <button type="button" class="action-btn btn-royal-purple" id="btn-rejoin-verify-2fa">
        🔐 3. VERIFY 2FA PASSWORD &amp; SAVE
      </button>

      <button type="button" class="action-btn btn-ghost" id="btn-close-rejoin-modal" style="margin-top:6px;">
        ✖ CLOSE REJOIN WINDOW
      </button>
    </div>
  </div>

  <!-- ======================================================================
       2. MAIN ROYAL COMMAND CENTER DASHBOARD
       ====================================================================== -->
  <div class="master-shell">
    <!-- TOP HEADER -->
    <header class="royal-header">
      <div class="royal-brand">
        <div class="royal-emblem">👑</div>
        <div class="royal-title-block">
          <h1>TELEGRAM MASTER SMM &amp; MINI-APP AUTOMATION SUITE</h1>
          <p>All 73+ Reactions • Quantity Control (1/5/7/ALL) • Mini-App Opener • Last Button Clicker • Channel Button Clicker</p>
        </div>
      </div>
      <div class="header-actions">
        <select class="theme-pill" id="theme-switcher">
          <option value="">👑 ROYAL GOLD &amp; PLASMA</option>
          <option value="theme-emerald">🟢 EMERALD MATRIX</option>
          <option value="theme-crimson">🔴 CRIMSON BLAZE</option>
          <option value="theme-cyber">🔵 CYBER NEON BLUE</option>
        </select>
        <div class="clock-pill" id="header-clock">🕒 00:00:00</div>
        <button type="button" class="lock-btn-top" id="btn-lock-panel">🔒 LOCK VAULT</button>
      </div>
    </header>

    <!-- METRICS ROW -->
    <section class="metrics-row">
      <div class="metric-box">
        <div class="metric-tag">📱 Connected IDs</div>
        <div class="metric-num" id="metric-accounts">0</div>
        <div class="metric-foot">🛡️ Anti-Logout Fingerprint</div>
      </div>
      <div class="metric-box">
        <div class="metric-tag">🎯 Selected IDs</div>
        <div class="metric-num" id="metric-selected">0</div>
        <div class="metric-foot">⚡ Active for Next Action</div>
      </div>
      <div class="metric-box">
        <div class="metric-tag">📢 Tracked Channels</div>
        <div class="metric-num" id="metric-channels">0</div>
        <div class="metric-foot">📥 Synced in Firebase DB</div>
      </div>
      <div class="metric-box">
        <div class="metric-tag">🟢 Online Heartbeat</div>
        <div class="metric-num" id="metric-online-state" style="color: var(--text-dim); font-size: 20px;">STANDBY</div>
        <div class="metric-foot" id="metric-online-sub">🔄 Toggle in Tab 3</div>
      </div>
    </section>

    <!-- GLOBAL ACCOUNT SELECTOR BAR -->
    <div class="selector-bar">
      <div class="selector-top">
        <div class="selector-title">
          🎯 TARGET ACCOUNT SELECTOR (CLICK ANY ID TO SELECT / DESELECT FOR MINI-APP, BUTTON CLICK OR REACTIONS)
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="action-btn btn-cyan btn-mini" id="btn-check-health">🩺 CHECK ALL IDs HEALTH</button>
          <button type="button" class="action-btn btn-emerald btn-mini" id="btn-select-all-accs">✅ SELECT ALL IDs</button>
          <button type="button" class="action-btn btn-ghost btn-mini" id="btn-deselect-all-accs">❌ CLEAR SELECTION</button>
        </div>
      </div>
      <div class="account-chips-wrap" id="account-selector-chips">
        <span style="font-size: 12px; color: var(--text-dim);">Loading connected accounts...</span>
      </div>
    </div>

    <!-- 6 MASTER NAVIGATION TABS -->
    <div class="command-tabs">
      <button type="button" class="cmd-tab active-tab" data-target="pane-smm">
        🛒 1. ALL REACTIONS, VIEWS &amp; POST BUTTONS
      </button>
      <button type="button" class="cmd-tab" data-target="pane-bots">
        🎮 2. BOT MINI-APP &amp; LAST BUTTON OPENER
      </button>
      <button type="button" class="cmd-tab" data-target="pane-otp-online">
        📩 3. LIVE OTP READER &amp; ONLINE
      </button>
      <button type="button" class="cmd-tab" data-target="pane-dm-group">
        📢 4. BULK DM &amp; GROUP POSTER
      </button>
      <button type="button" class="cmd-tab" data-target="pane-channels">
        📥 5. CHANNEL JOIN / LEAVE
      </button>
      <button type="button" class="cmd-tab" data-target="pane-accounts">
        ➕ 6. ADD / REJOIN ID (API_ID &amp; HASH)
      </button>
    </div>

    <!-- LIVE OUTPUT CONSOLE -->
    <div class="glass-panel">
      <div class="panel-top">
        <div class="panel-heading">🖥️ LIVE EXECUTION TERMINAL (ZERO-HANG CLOUD LOG)</div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="action-btn btn-ghost btn-mini" id="btn-clear-log">🧹 CLEAR</button>
          <button type="button" class="action-btn btn-ghost btn-mini" id="btn-sync-now">🔄 REFRESH</button>
        </div>
      </div>
      <div class="console-screen" id="console-box">👑 [QUANTUM SMM &amp; MINI-APP SUITE READY]: All 73+ Reactions, Quantity Limiters (1/5/7/ALL), Mini-App Opener &amp; Inline Button Clicker Active!</div>
    </div>

    <!-- ====================================================================
         PANE 1: SMM PANEL SERVICE SUITE (ALL 73+ REACTIONS, VIEWS, INLINE BUTTON CLICKER, COMMENTS, POLLS)
         ==================================================================== -->
    <div id="pane-smm" class="view-pane active-pane">
      <div class="helper-alert">
        🛒 <b>SMM PANEL + QUANTITY CONTROL + CHANNEL INLINE BUTTON CLICKER:</b> Choose how many reactions/views/clicks you want (<b>1, 5, 7, 10, ALL</b> or type any number!), select from <b>All 73+ Official Telegram Reactions</b> (or <b>🎲 Random Mix</b>), or click any inline button on a Channel Post!
      </div>

      <div class="two-col-layout">
        <!-- MODULE A: ALL 73+ EMOJI REACTIONS + QUANTITY SELECTOR -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">❤️ ALL 73+ POST EMOJI REACTIONS</div>
            <span class="badge-chip">MULTI-SELECT + RANDOM</span>
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>TELEGRAM POST LINK</label>
              <span>PUBLIC / PRIVATE</span>
            </div>
            <input
              type="text"
              id="inp-react-link"
              class="royal-input"
              placeholder="e.g. https://t.me/mychannel/105"
            />
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>HOW MANY REACTIONS DO YOU WANT? (QUANTITY)</label>
              <span>1 / 5 / 7 / ALL</span>
            </div>
            <div class="qty-control-row" data-for="inp-react-count">
              <span class="qty-label">🔢 COUNT:</span>
              <button type="button" class="qty-preset-btn" data-val="1">1</button>
              <button type="button" class="qty-preset-btn" data-val="5">5</button>
              <button type="button" class="qty-preset-btn" data-val="7">7</button>
              <button type="button" class="qty-preset-btn" data-val="10">10</button>
              <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
              <input type="number" id="inp-react-count" class="qty-custom-inp" placeholder="ALL" min="1" />
            </div>
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>SELECT 1, MULTIPLE, OR RANDOM EMOJIS (73+ REACTIONS)</label>
              <span id="selected-emoji-label">🔥</span>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
              <button type="button" class="action-btn btn-royal-purple btn-mini" id="btn-emoji-random">🎲 RANDOM MIX (ALL POPULAR)</button>
              <button type="button" class="action-btn btn-emerald btn-mini" id="btn-emoji-select-top">🔥 TOP 8 VIRAL MIX</button>
              <button type="button" class="action-btn btn-ghost btn-mini" id="btn-emoji-clear">🔄 RESET TO 🔥</button>
            </div>
            <div class="emoji-picker-grid" id="emoji-picker-grid"></div>
          </div>

          <button type="button" class="action-btn btn-royal-purple" id="btn-send-reactions">
            ❤️ SEND EMOJI REACTIONS NOW
          </button>
        </div>

        <!-- MODULE B: CHANNEL POST INLINE BUTTON CLICKER + AUTO POST VIEWS -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🔘 CHANNEL POST INLINE BUTTON CLICKER</div>
            <span class="badge-chip">CLICK ANY / LAST BUTTON</span>
          </div>

          <div class="helper-alert" style="margin-bottom:10px;">
            👆 Paste any Channel or Group Post Link below. Your selected IDs will press the <b>Inline Button</b> (Callback, URL, or Mini-App button) on that post!
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>CHANNEL / GROUP POST LINK</label>
              <span>WITH INLINE BUTTONS</span>
            </div>
            <input
              type="text"
              id="inp-post-btn-link"
              class="royal-input"
              placeholder="e.g. https://t.me/mychannel/105"
            />
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>WHICH INLINE BUTTON TO PRESS ON POST?</label>
              <span>SELECT TARGET</span>
            </div>
            <div style="display:flex;gap:8px;">
              <select id="sel-post-btn-target" class="royal-select" style="flex:1;">
                <option value="LAST">🎯 LAST INLINE BUTTON (Saglyat Shevatcha Button)</option>
                <option value="FIRST">1️⃣ FIRST INLINE BUTTON (1st Button)</option>
                <option value="ALL_MINIAPPS">🎮 OPEN MINI-APP / WEBVIEW BUTTON ON POST</option>
                <option value="CUSTOM">🔢 SPECIFIC BUTTON NUMBER (Enter # on right)</option>
              </select>
              <input type="number" id="inp-post-btn-custom-num" class="royal-input" style="max-width:85px;text-align:center;" value="1" min="1" title="Button Number" />
            </div>
          </div>

          <div class="qty-control-row" data-for="inp-post-btn-count">
            <span class="qty-label">🔢 HOW MANY IDs:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-post-btn-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
            <button type="button" class="action-btn btn-ghost" id="btn-scan-post-btns">
              🔍 SCAN POST BUTTONS
            </button>
            <button type="button" class="action-btn btn-emerald" id="btn-click-post-btn">
              👆 PRESS POST BUTTON NOW
            </button>
          </div>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 14px 0;" />

          <!-- AUTO POST VIEWS BOOSTER WITH QUANTITY -->
          <div class="panel-top" style="margin-bottom:10px;padding-bottom:8px;">
            <div class="panel-heading">👀 AUTO POST VIEWS BOOSTER</div>
            <span class="badge-chip">CUSTOM COUNT</span>
          </div>
          <div class="field-block">
            <input
              type="text"
              id="inp-views-link"
              class="royal-input"
              placeholder="Paste Post Link for Views (e.g. https://t.me/mychannel/105)"
            />
          </div>
          <div class="qty-control-row" data-for="inp-views-count">
            <span class="qty-label">👁️ VIEWS COUNT:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-views-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>
          <button type="button" class="action-btn btn-cyan" id="btn-boost-views">
            👀 BOOST POST VIEWS NOW
          </button>
        </div>
      </div>

      <div class="two-col-layout">
        <!-- MODULE C: AUTO CHANNEL COMMENTER WITH QUANTITY -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">💬 AUTO CHANNEL COMMENTER</div>
            <span class="badge-chip">CUSTOM COUNT</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>CHANNEL POST LINK (WITH DISCUSSION ENABLED)</label>
              <span>REQUIRED</span>
            </div>
            <input
              type="text"
              id="inp-comment-link"
              class="royal-input"
              placeholder="e.g. https://t.me/mychannel/105"
            />
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>COMMENTS LIST (1 COMMENT PER LINE — ROTATES PER ID)</label>
              <span>UNLIMITED LINES</span>
            </div>
            <textarea
              id="inp-comment-list"
              class="royal-textarea"
              placeholder="Superb post bro 🔥&#10;100% Trusted channel 💯&#10;Awesome update! ❤️&#10;Best service ever 🚀"
            ></textarea>
          </div>
          <div class="qty-control-row" data-for="inp-comment-count">
            <span class="qty-label">💬 COMMENTS COUNT:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-comment-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>
          <button type="button" class="action-btn btn-emerald" id="btn-post-comments">
            💬 AUTO POST COMMENTS NOW
          </button>
        </div>

        <!-- MODULE D: AUTO POLL VOTER & SMM COMBO WITH QUANTITY -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📊 AUTO POLL VOTER</div>
            <span class="badge-chip">CUSTOM COUNT</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>POLL POST LINK</label>
              <span>REQUIRED</span>
            </div>
            <input
              type="text"
              id="inp-poll-link"
              class="royal-input"
              placeholder="e.g. https://t.me/mychannel/108"
            />
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>OPTION NUMBER TO VOTE (1 = 1st Option, 2 = 2nd Option...)</label>
              <span>1 TO 10</span>
            </div>
            <input
              type="number"
              id="inp-poll-option"
              class="royal-input"
              value="1"
              min="1"
              max="10"
            />
          </div>
          <div class="qty-control-row" data-for="inp-poll-count">
            <span class="qty-label">📊 VOTES COUNT:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-poll-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>
          <button type="button" class="action-btn btn-gold" id="btn-vote-poll">
            📊 AUTO VOTE POLL OPTION NOW
          </button>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 14px 0;" />

          <div class="panel-heading" style="font-size: 13.5px; margin-bottom: 10px;">
            ⚡ 1-CLICK SMM MEGA COMBO (JOIN + VIEW + REACT)
          </div>
          <div class="field-block">
            <input
              type="text"
              id="inp-smm-combo-link"
              class="royal-input"
              placeholder="Paste Post Link (e.g. https://t.me/channel/105)"
            />
          </div>
          <div class="qty-control-row" data-for="inp-combo-count">
            <span class="qty-label">🚀 COMBO COUNT:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-combo-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>
          <button type="button" class="action-btn btn-royal-purple" id="btn-smm-combo">
            🚀 LAUNCH SMM MEGA COMBO
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 2: BOT MINI-APP OPENER + LAST INLINE BUTTON CLICKER + REFERRAL & BLOCK
         ==================================================================== -->
    <div id="pane-bots" class="view-pane">
      <div class="helper-alert">
        🎮 <b>BOT MINI-APP AUTO OPENER &amp; LAST INLINE BUTTON CLICKER:</b> Paste any Bot Link, Mini-App Link (e.g. <code>https://t.me/BotName/app?startapp=...</code> or <code>https://t.me/BotName?start=...</code>) below! The selected accounts will start the bot, check if there is a <b>Mini-App</b> or <b>Inline Buttons</b>, automatically open the <b>Mini-App</b>, and press the <b>LAST Inline Button</b>!
      </div>

      <div class="two-col-layout">
        <!-- NEW MODULE: BOT MINI-APP & LAST INLINE BUTTON AUTO-OPENER -->
        <div class="glass-panel" style="border-color: var(--success);">
          <div class="panel-top">
            <div class="panel-heading">🎮 BOT MINI-APP &amp; LAST INLINE BUTTON OPENER</div>
            <span class="badge-chip">AUTO MINI-APP + LAST BTN</span>
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>PASTE ANY BOT LINK / MINI-APP LINK / @BOTUSERNAME</label>
              <span>*REQUIRED</span>
            </div>
            <input
              type="text"
              id="inp-miniapp-link"
              class="royal-input"
              placeholder="e.g. https://t.me/SomeBot?start=123 or https://t.me/SomeBot/app?startapp=123"
            />
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>INLINE BUTTON &amp; MINI-APP ACTION MODE</label>
              <span>DEFAULT: LAST BUTTON</span>
            </div>
            <select id="sel-miniapp-btn-mode" class="royal-select">
              <option value="LAST">🎯 OPEN MINI-APP + CLICK LAST INLINE BUTTON (Saglyat Shevatcha Button)</option>
              <option value="MINIAPP_ONLY">🎮 ONLY OPEN MINI-APP (RequestWebView / RequestAppWebView)</option>
              <option value="FIRST">1️⃣ OPEN MINI-APP + CLICK 1st INLINE BUTTON</option>
              <option value="ALL_BUTTONS">💥 CLICK ALL INLINE BUTTONS + OPEN MINI-APP</option>
            </select>
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>SELECT SPECIFIC ID OR USE SELECTED IDs ABOVE</label>
              <span>ACCOUNT PICKER</span>
            </div>
            <select id="sel-miniapp-account" class="royal-select">
              <option value="SELECTED">🎯 USE SELECTED IDs FROM TOP BAR</option>
            </select>
          </div>

          <div class="qty-control-row" data-for="inp-miniapp-count">
            <span class="qty-label">🔢 HOW MANY IDs TO OPEN:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-miniapp-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>

          <button type="button" class="action-btn btn-emerald" id="btn-open-miniapp-now">
            🎮 CHECK BOT, OPEN MINI-APP &amp; CLICK LAST BUTTON NOW
          </button>
        </div>

        <!-- AUTO BOT REFERRAL BOOSTER & BLOCK BOT -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🤖 AUTO BOT REFERRAL BOOSTER (/start)</div>
            <span class="badge-chip">CUSTOM COUNT</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>BOT REFERRAL LINK OR @BOTUSERNAME</label>
              <span>*REQUIRED</span>
            </div>
            <input
              type="text"
              id="inp-bot-ref-link"
              class="royal-input"
              placeholder="e.g. https://t.me/SomeBot?start=REF9988 or @SomeBot"
            />
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>OPTIONAL START PARAMETER (IF NOT IN LINK)</label>
              <span>OPTIONAL</span>
            </div>
            <input
              type="text"
              id="inp-bot-ref-param"
              class="royal-input"
              placeholder="e.g. 8879628170 (leave blank if full link pasted)"
            />
          </div>
          <div class="qty-control-row" data-for="inp-bot-ref-count">
            <span class="qty-label">🤖 REFERRALS COUNT:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-bot-ref-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>
          <button type="button" class="action-btn btn-gold" id="btn-start-bot-ref">
            🤖 AUTO /START BOT FROM ACCOUNTS
          </button>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 14px 0;" />

          <div class="panel-top" style="margin-bottom:8px;padding-bottom:6px;">
            <div class="panel-heading">🚫 BLOCK / UNBLOCK BOT</div>
            <span class="badge-chip">ANTI-SPAM</span>
          </div>
          <div class="field-block">
            <input
              type="text"
              id="inp-block-bot-user"
              class="royal-input"
              placeholder="Enter Target Bot @username (e.g. @SpammerBot)"
            />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button type="button" class="action-btn btn-crimson" id="btn-block-bot">
              🚫 BLOCK &amp; DELETE CHAT
            </button>
            <button type="button" class="action-btn btn-cyan" id="btn-unblock-bot">
              🟢 UNBLOCK BOT
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 3: LIVE OTP / LOGIN CODE READER (777000) & ALWAYS ONLINE STATUS
         ==================================================================== -->
    <div id="pane-otp-online" class="view-pane">
      <div class="two-col-layout">
        <!-- LIVE OTP / LOGIN CODE READER -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📩 LIVE OTP / LOGIN CODE READER (777000)</div>
            <span class="badge-chip">TRIPLE-FALLBACK FIXED</span>
          </div>
          <div class="helper-alert">
            🔑 Select any connected Telegram account below to read incoming Telegram login codes (<code>777000</code>). If an account is logged out, click <b>🔄 REJOIN / RE-LOGIN THIS ID</b> right below to reconnect it with its saved <code>API_ID</code> &amp; <code>API_HASH</code>!
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>SELECT ACCOUNT TO READ OTP OR REJOIN</label>
              <span>DROPDOWN</span>
            </div>
            <select id="sel-otp-account" class="royal-select">
              <option value="SELECTED">🔍 SCAN ALL SELECTED ACCOUNTS</option>
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button type="button" class="action-btn btn-gold" id="btn-read-otp">
              📩 FETCH LATEST OTP CODE
            </button>
            <button type="button" class="action-btn btn-emerald" id="btn-rejoin-from-otp">
              🔄 REJOIN / RE-LOGIN THIS ID
            </button>
          </div>

          <div class="otp-highlight-box" id="otp-reader-result">
            📭 Select an account and click <b>📩 FETCH LATEST OTP CODE</b> to read the 5-digit Telegram code, or click <b>🔄 REJOIN / RE-LOGIN THIS ID</b> if the session logged out.
          </div>
        </div>

        <!-- ALWAYS ONLINE STATUS (ON / OFF CONTROLLER) -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🟢 ALWAYS ONLINE STATUS CONTROLLER</div>
            <span class="badge-chip">ON / OFF</span>
          </div>
          <div class="helper-alert" style="border-color: var(--success);">
            🟢 Control the online presence of your selected Telegram accounts. You can push an instant <b>ONLINE / OFFLINE</b> status or turn on the <b>24/7 Auto-Online Heartbeat Loop</b>!
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <button type="button" class="action-btn btn-emerald" id="btn-set-online">
              🟢 SET SELECTED IDs ONLINE
            </button>
            <button type="button" class="action-btn btn-crimson" id="btn-set-offline">
              🔴 SET SELECTED IDs OFFLINE
            </button>
          </div>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;" />

          <div class="panel-heading" style="font-size: 13.5px; margin-bottom: 8px;">
            🔄 24/7 AUTO-ONLINE HEARTBEAT LOOP (KEEP ALIVE)
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            When enabled, this panel automatically pings Telegram every 45 seconds in the background so your selected accounts stay <b>🟢 Online</b> continuously without hanging!
          </p>
          <button type="button" class="action-btn btn-cyan" id="btn-toggle-heartbeat">
            ▶️ START 24/7 ALWAYS-ONLINE HEARTBEAT
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 4: BULK DM SENDER & GROUP AUTO POSTER (AD SPAMMER)
         ==================================================================== -->
    <div id="pane-dm-group" class="view-pane">
      <div class="two-col-layout">
        <!-- GROUP AUTO POSTER (AD SPAMMER) -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📢 GROUP AUTO POSTER (AD SPAMMER)</div>
            <span class="badge-chip">MULTI-GROUP</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>TARGET GROUP LINKS OR @USERNAMES (1 PER LINE OR COMMA SEPARATED)</label>
              <span>AUTO-JOINS &amp; POSTS</span>
            </div>
            <textarea
              id="inp-group-targets"
              class="royal-textarea"
              placeholder="@publicgroup1&#10;@publicgroup2&#10;https://t.me/+PrivateGroupInvite"
            ></textarea>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>PROMOTIONAL AD MESSAGE TO POST</label>
              <span>SUPPORTS TEXT &amp; LINKS</span>
            </div>
            <textarea
              id="inp-group-ad-msg"
              class="royal-textarea"
              placeholder="🔥 Join our official channel for daily giveaways &amp; tricks! 👉 @MyChannel"
            ></textarea>
          </div>
          <button type="button" class="action-btn btn-gold" id="btn-post-group-ads">
            📢 SEND AD TO ALL GROUPS NOW (SELECTED IDs)
          </button>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 8px;">
            <input
              type="number"
              id="inp-spam-interval"
              class="royal-input"
              style="max-width: 130px; padding: 9px;"
              value="5"
              min="1"
              placeholder="Mins"
            />
            <button type="button" class="action-btn btn-ghost" style="margin-bottom: 0;" id="btn-toggle-group-loop">
              ⏱️ START AUTO-REPEAT AD TIMER (MINS)
            </button>
          </div>
        </div>

        <!-- BULK DM / AUTO MESSAGE SENDER -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📩 BULK DM / AUTO MESSAGE SENDER</div>
            <span class="badge-chip">SELECTED IDs</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>TARGET RECIPIENTS (@USERNAME OR PHONE, 1 PER LINE)</label>
              <span>MULTI-TARGET</span>
            </div>
            <textarea
              id="inp-dm-targets"
              class="royal-textarea"
              placeholder="@username1&#10;@username2&#10;+919876543210"
            ></textarea>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>DIRECT MESSAGE (DM) CONTENT</label>
              <span>REQUIRED</span>
            </div>
            <textarea
              id="inp-dm-text"
              class="royal-textarea"
              placeholder="Hello! Check out our exclusive Telegram service 🚀"
            ></textarea>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>DELIVERY MODE</label>
              <span>SMART ROUTING</span>
            </div>
            <select id="sel-dm-mode" class="royal-select">
              <option value="round_robin">🔄 Smart Distribute (Each ID messages different targets)</option>
              <option value="all_to_all">💥 Blast Mode (Every selected ID messages every target)</option>
            </select>
          </div>
          <button type="button" class="action-btn btn-royal-purple" id="btn-send-bulk-dm">
            📩 LAUNCH BULK DM CAMPAIGN NOW
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 5: CHANNEL AUTO JOIN, AUTO LEAVE & REGISTERED CHANNEL LIST
         ==================================================================== -->
    <div id="pane-channels" class="view-pane">
      <div class="two-col-layout">
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📥 JOIN CHANNEL (AUTOMATIC)</div>
            <span class="badge-chip">CUSTOM COUNT</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>CHANNEL LINK OR @USERNAME</label>
              <span>PUBLIC / PRIVATE</span>
            </div>
            <input
              type="text"
              id="inp-join-channel"
              class="royal-input"
              placeholder="e.g. @mychannel or https://t.me/+AbCdEfG"
            />
          </div>
          <div class="qty-control-row" data-for="inp-join-count">
            <span class="qty-label">📥 JOIN COUNT:</span>
            <button type="button" class="qty-preset-btn" data-val="1">1</button>
            <button type="button" class="qty-preset-btn" data-val="5">5</button>
            <button type="button" class="qty-preset-btn" data-val="7">7</button>
            <button type="button" class="qty-preset-btn" data-val="10">10</button>
            <button type="button" class="qty-preset-btn active-qty" data-val="ALL">ALL IDs</button>
            <input type="number" id="inp-join-count" class="qty-custom-inp" placeholder="ALL" min="1" />
          </div>
          <button type="button" class="action-btn btn-emerald" id="btn-join-channel">
            📥 AUTO JOIN CHANNEL NOW
          </button>
        </div>

        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📤 LEAVE CHANNEL (AUTOMATIC)</div>
            <span class="badge-chip">SELECTED IDs</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>CHANNEL NUMBER FROM LIST BELOW</label>
              <span>OR 1-CLICK BELOW</span>
            </div>
            <input
              type="number"
              id="inp-leave-number"
              class="royal-input"
              placeholder="Enter Channel Number (e.g. 1, 2)"
            />
          </div>
          <button type="button" class="action-btn btn-crimson" id="btn-leave-number">
            📤 AUTO LEAVE SELECTED CHANNEL
          </button>
        </div>
      </div>

      <div class="glass-panel">
        <div class="panel-top">
          <div class="panel-heading">📋 REGISTERED CHANNELS &amp; 1-CLICK AUTO LEAVE</div>
        </div>
        <div class="table-scroll">
          <table class="royal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CHANNEL TITLE</th>
                <th>CHANNEL LINK / USERNAME</th>
                <th>CURRENT STATUS</th>
                <th>INSTANT ACTION</th>
              </tr>
            </thead>
            <tbody id="tbody-channels-main"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 6: ADD / REJOIN TELEGRAM ID (FULL API_ID + API_HASH + OTP + 2FA)
         ==================================================================== -->
    <div id="pane-accounts" class="view-pane">
      <div class="helper-alert">
        ⚡ <b>DEDICATED API_ID &amp; API_HASH + 1-CLICK REJOIN SYSTEM:</b> Every account's <code>API_ID</code> and <code>API_HASH</code> is saved in Firebase. If any ID ever logs out, simply click <b>🔄 REJOIN / RE-LOGIN</b> next to that account in the table below!
      </div>

      <div class="two-col-layout">
        <div class="glass-panel" id="add-account-form-panel">
          <div class="panel-top">
            <div class="panel-heading">➕ ADD OR RE-LOGIN TELEGRAM ID</div>
            <span class="badge-chip">STEP 1 &amp; 2</span>
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>QUICK SELECT SAVED ID TO AUTO-FILL API_ID &amp; HASH</label>
              <span>OPTIONAL</span>
            </div>
            <select id="sel-quick-relogin" class="royal-select">
              <option value="">-- Choose Saved Account to Re-Login or Type New Below --</option>
            </select>
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>1. ACCOUNT APP API_ID</label>
              <span>*REQUIRED</span>
            </div>
            <input
              type="tel"
              id="inp-api-id"
              class="royal-input"
              placeholder="Enter Account API_ID (e.g. 35204350)"
            />
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>2. ACCOUNT APP API_HASH (FULL 32-CHAR)</label>
              <span>*REQUIRED</span>
            </div>
            <input
              type="text"
              id="inp-api-hash"
              class="royal-input"
              placeholder="Enter 32-char API_HASH (e.g. 94b55923094...)"
            />
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>3. PHONE NUMBER (WITH +91)</label>
              <span>*REQUIRED</span>
            </div>
            <input
              type="tel"
              id="inp-phone"
              class="royal-input"
              placeholder="e.g. +919035114756"
            />
          </div>

          <button type="button" class="action-btn btn-gold" id="btn-send-otp">
            📩 STEP 1: SEND OTP CODE TO ACCOUNT
          </button>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 14px 0;" />

          <div class="field-block">
            <div class="field-title">
              <label>4. ENTER 5-DIGIT TELEGRAM OTP</label>
              <span>NO OTP BLOCK</span>
            </div>
            <input
              type="tel"
              id="inp-otp"
              class="royal-input"
              placeholder="Enter 5-Digit OTP (e.g. 58765)"
            />
          </div>

          <button type="button" class="action-btn btn-emerald" id="btn-verify-otp">
            ✅ STEP 2: VERIFY OTP &amp; CONNECT ID
          </button>
        </div>

        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🔐 2FA CLOUD PASSWORD</div>
            <span class="badge-chip">AUTO-SAVED FOR REJOIN</span>
          </div>

          <div class="helper-alert" style="border-color: var(--accent-sec);">
            🛡️ If your account asks for a <b>Two-Step Verification (2FA) Password</b> after verifying the OTP, enter your Cloud Password below and click Verify!
          </div>

          <div class="field-block">
            <div class="field-title">
              <label>TELEGRAM 2FA CLOUD PASSWORD</label>
              <span>IF ENABLED</span>
            </div>
            <input
              type="text"
              id="inp-2fa"
              class="royal-input"
              placeholder="Enter 2FA Cloud Password"
            />
          </div>

          <button type="button" class="action-btn btn-royal-purple" id="btn-verify-2fa">
            🔐 STEP 3: VERIFY 2FA &amp; SAVE ACCOUNT
          </button>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;" />

          <div class="panel-heading" style="font-size: 13px; margin-bottom: 10px;">
            📡 ACTIVE LOGIN SESSION TRACKER
          </div>
          <div
            id="active-session-banner"
            style="background: var(--bg-input); border: 1px solid var(--border-glass); border-radius: 14px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-secondary);"
          >
            No pending OTP session. Select an account from Quick Select or click 🔄 REJOIN in the table below!
          </div>
        </div>
      </div>

      <div class="glass-panel">
        <div class="panel-top">
          <div class="panel-heading">📱 CONNECTED TELEGRAM ACCOUNTS (FULL API_ID &amp; API_HASH + 1-CLICK REJOIN)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="action-btn btn-gold btn-mini" id="btn-unlock-api-hashes">
              🔐 SHOW FULL API_HASH &amp; 2FA (PIN: 252010)
            </button>
            <button type="button" class="action-btn btn-cyan btn-mini" id="btn-check-health-table">
              🩺 SCAN ALL IDs STATUS
            </button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="royal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>NAME &amp; STATUS</th>
                <th>USERNAME</th>
                <th>PHONE</th>
                <th>DEDICATED API_ID</th>
                <th>DEDICATED API_HASH</th>
                <th>SAVED 2FA PASS</th>
                <th>REJOIN / ACTION</th>
              </tr>
            </thead>
            <tbody id="tbody-accounts"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-zone"></div>

  <!-- ======================================================================
       3. FRONTEND JAVASCRIPT ENGINE (GLITCH-FREE, NO HANG, MULTI-SELECTOR)
       ====================================================================== -->
  <script>
    var globalAccountsList = [];

    window.triggerAccountRejoin = function (phoneStr) {
      var found = null;
      for (var i = 0; i < globalAccountsList.length; i++) {
        if (globalAccountsList[i].phone === phoneStr) {
          found = globalAccountsList[i];
          break;
        }
      }
      if (!found) {
        alert("Account not found: " + phoneStr);
        return;
      }
      var askPin = prompt("🔐 Enter Master Password (252010) to view API_ID/API_HASH & Rejoin " + found.phone + ":", "252010");
      if (askPin !== "252010") {
        alert("❌ Invalid Password!");
        return;
      }

      document.getElementById("rejoin-phone").value = found.phone || "";
      document.getElementById("rejoin-api-id").value = found.apiId || "";
      document.getElementById("rejoin-api-hash").value = found.apiHash || "";
      document.getElementById("rejoin-2fa-pass").value = found.twoFaPassword || "";
      document.getElementById("rejoin-otp-code").value = "";
      document.getElementById("rejoin-sub-label").textContent =
        "Reconnecting " + (found.name || "ID") + " (" + found.phone + ")";

      document.getElementById("inp-api-id").value = found.apiId || "";
      document.getElementById("inp-api-hash").value = found.apiHash || "";
      document.getElementById("inp-phone").value = found.phone || "";
      document.getElementById("inp-2fa").value = found.twoFaPassword || "";

      document.getElementById("rejoin-modal-overlay").classList.remove("vault-open");
    };

    (function () {
      var MASTER_PIN_CODE = "252010";
      var enteredPin = "";
      var accountsList = [];
      var channelsList = [];
      var selectedPhones = [];
      var selectedEmojis = ["🔥"];
      var isRandomEmojiMode = false;
      var showFullApiHashes = false;
      var accountHealthMap = {};
      var onlineHeartbeatTimer = null;
      var groupAdLoopTimer = null;

      var ALL_EMOJIS = [
        "👍", "👎", "❤️", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱",
        "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊️", "🤡",
        "🥱", "🥴", "😍", "🐳", "❤️‍🔥", "🌚", "🌭", "💯", "🤣", "⚡",
        "🍌", "🏆", "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈",
        "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈", "😇", "😨",
        "🤝", "✍️", "🤗", "🫡", "🎅", "🎄", "☃️", "💅", "🤪", "🗿",
        "🆒", "💘", "🙉", "🦄", "😘", "💊", "🙊", "😎", "👾", "🤷‍♂️",
        "🤷", "🤷‍♀️", "😡"
      ];

      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      var soundCtx = AudioCtx ? new AudioCtx() : null;

      function beep(freq, type, dur) {
        try {
          if (!soundCtx) return;
          if (soundCtx.state === "suspended") soundCtx.resume();
          var o = soundCtx.createOscillator();
          var g = soundCtx.createGain();
          o.type = type || "sine";
          o.frequency.setValueAtTime(freq || 600, soundCtx.currentTime);
          g.gain.setValueAtTime(0.06, soundCtx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + (dur || 0.08));
          o.connect(g);
          g.connect(soundCtx.destination);
          o.start();
          o.stop(soundCtx.currentTime + (dur || 0.08));
        } catch (e) {}
      }

      function toast(text, color) {
        var zone = document.getElementById("toast-zone");
        if (!zone) return;
        var item = document.createElement("div");
        item.className = "royal-toast";
        item.style.borderLeftColor = color || "#f59e0b";
        item.innerHTML = text;
        zone.appendChild(item);
        setTimeout(function () {
          if (item.parentNode) item.parentNode.removeChild(item);
        }, 3800);
      }

      function writeConsole(msgHtml) {
        var box = document.getElementById("console-box");
        if (!box) return;
        var now = new Date().toLocaleTimeString();
        box.innerHTML =
          '<div class="log-entry"><span style="color:#94a3b8;">[' +
          now +
          "]</span>\n" +
          msgHtml +
          "</div>" +
          box.innerHTML;
      }

      // ====================================================================
      // RENDER ALL 73+ TELEGRAM EMOJI REACTIONS GRID & QUANTITY PRESETS
      // ====================================================================
      function renderEmojiGrid() {
        var grid = document.getElementById("emoji-picker-grid");
        var lbl = document.getElementById("selected-emoji-label");
        if (!grid) return;
        grid.innerHTML = "";

        for (var i = 0; i < ALL_EMOJIS.length; i++) {
          (function (em) {
            var btn = document.createElement("button");
            btn.type = "button";
            var isAct = !isRandomEmojiMode && selectedEmojis.indexOf(em) !== -1;
            btn.className = "emoji-btn" + (isAct ? " active-emoji" : "");
            btn.textContent = em;
            btn.addEventListener("click", function () {
              beep(680, "sine", 0.04);
              isRandomEmojiMode = false;
              var idx = selectedEmojis.indexOf(em);
              if (idx !== -1) {
                if (selectedEmojis.length > 1) selectedEmojis.splice(idx, 1);
              } else {
                selectedEmojis.push(em);
              }
              renderEmojiGrid();
            });
            grid.appendChild(btn);
          })(ALL_EMOJIS[i]);
        }

        if (lbl) {
          lbl.textContent = isRandomEmojiMode
            ? "🎲 RANDOM MIX (ALL REACTIONS)"
            : selectedEmojis.join(" ");
        }
      }

      renderEmojiGrid();

      document.getElementById("btn-emoji-random").addEventListener("click", function () {
        isRandomEmojiMode = true;
        renderEmojiGrid();
        toast("🎲 Random Reaction Mode Activated!", "#ec4899");
      });

      document.getElementById("btn-emoji-select-top").addEventListener("click", function () {
        isRandomEmojiMode = false;
        selectedEmojis = ["🔥", "❤️", "🎉", "👍", "⚡", "💯", "🤩", "👏"];
        renderEmojiGrid();
        toast("🔥 Top 8 Viral Reactions Selected!", "#10b981");
      });

      document.getElementById("btn-emoji-clear").addEventListener("click", function () {
        isRandomEmojiMode = false;
        selectedEmojis = ["🔥"];
        renderEmojiGrid();
      });

      // Bind all Quantity Preset Bars (1, 5, 7, 10, ALL)
      var qtyRows = document.querySelectorAll(".qty-control-row[data-for]");
      for (var qIdx = 0; qIdx < qtyRows.length; qIdx++) {
        (function (rowEl) {
          var targetInpId = rowEl.getAttribute("data-for");
          var targetInp = document.getElementById(targetInpId);
          var btns = rowEl.querySelectorAll(".qty-preset-btn");
          for (var b = 0; b < btns.length; b++) {
            btns[b].addEventListener("click", function () {
              beep(620, "sine", 0.04);
              for (var k = 0; k < btns.length; k++) btns[k].classList.remove("active-qty");
              this.classList.add("active-qty");
              var v = this.getAttribute("data-val");
              if (targetInp) {
                targetInp.value = v === "ALL" ? "" : v;
              }
            });
          }
          if (targetInp) {
            targetInp.addEventListener("input", function () {
              for (var k = 0; k < btns.length; k++) btns[k].classList.remove("active-qty");
            });
          }
        })(qtyRows[qIdx]);
      }

      // ====================================================================
      // VAULT LOCK SCREEN (PIN: 252010)
      // ====================================================================
      function renderLedBoxes() {
        for (var i = 0; i < 6; i++) {
          var box = document.getElementById("led-" + i);
          if (!box) continue;
          box.classList.remove("error-shake");
          if (i < enteredPin.length) {
            box.textContent = "★";
            box.classList.add("active-digit");
          } else {
            box.textContent = "-";
            box.classList.remove("active-digit");
          }
        }
        var directInp = document.getElementById("direct-pin-input");
        if (directInp && directInp.value !== enteredPin) {
          directInp.value = enteredPin;
        }
      }

      function unlockVaultNow() {
        beep(920, "triangle", 0.14);
        setTimeout(function () {
          beep(1320, "triangle", 0.2);
        }, 110);
        try {
          sessionStorage.setItem("kumar_vault_unlocked", "yes");
        } catch (e) {}
        var overlay = document.getElementById("vault-overlay");
        if (overlay) overlay.classList.add("vault-open");
        toast("🔓 VAULT UNLOCKED! Welcome Kumar.", "#10b981");
        loadDashboardState(true);
      }

      function checkPinNow() {
        var directInp = document.getElementById("direct-pin-input");
        var candidate = enteredPin || (directInp ? directInp.value.trim() : "");
        if (candidate === MASTER_PIN_CODE) {
          unlockVaultNow();
        } else {
          beep(190, "sawtooth", 0.28);
          var fb = document.getElementById("vault-feedback");
          if (fb) {
            fb.innerHTML = '<span style="color:#f43f5e;">❌ INVALID PIN! ENTER 252010 TO UNLOCK!</span>';
          }
          for (var i = 0; i < 6; i++) {
            var box = document.getElementById("led-" + i);
            if (box) box.classList.add("error-shake");
          }
          toast("❌ Wrong Password! Access Denied.", "#f43f5e");
          setTimeout(function () {
            enteredPin = "";
            if (directInp) directInp.value = "";
            renderLedBoxes();
          }, 480);
        }
      }

      var digitButtons = document.querySelectorAll(".key-tile[data-digit]");
      for (var b = 0; b < digitButtons.length; b++) {
        digitButtons[b].addEventListener("click", function () {
          beep(700, "sine", 0.06);
          var dg = this.getAttribute("data-digit");
          if (enteredPin.length < 6) {
            enteredPin += String(dg);
            renderLedBoxes();
            if (enteredPin.length === 6) {
              setTimeout(checkPinNow, 100);
            }
          }
        });
      }

      document.getElementById("btn-key-clr").addEventListener("click", function () {
        beep(320, "sawtooth", 0.09);
        enteredPin = "";
        document.getElementById("direct-pin-input").value = "";
        renderLedBoxes();
      });

      document.getElementById("btn-key-enter").addEventListener("click", checkPinNow);
      document.getElementById("btn-direct-unlock").addEventListener("click", checkPinNow);

      var directPinInput = document.getElementById("direct-pin-input");
      directPinInput.addEventListener("input", function () {
        enteredPin = this.value.replace(/\D/g, "").slice(0, 6);
        renderLedBoxes();
        if (enteredPin.length === 6) {
          setTimeout(checkPinNow, 100);
        }
      });
      directPinInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") checkPinNow();
      });

      document.getElementById("btn-lock-panel").addEventListener("click", function () {
        try {
          sessionStorage.removeItem("kumar_vault_unlocked");
        } catch (e) {}
        enteredPin = "";
        renderLedBoxes();
        document.getElementById("vault-overlay").classList.remove("vault-open");
        toast("🔒 Vault Locked.", "#f59e0b");
      });

      try {
        if (sessionStorage.getItem("kumar_vault_unlocked") === "yes") {
          document.getElementById("vault-overlay").classList.add("vault-open");
          loadDashboardState(true);
        }
      } catch (e) {}

      // ====================================================================
      // TABS, THEME & CLOCK
      // ====================================================================
      var tabBtns = document.querySelectorAll(".cmd-tab[data-target]");
      for (var t = 0; t < tabBtns.length; t++) {
        tabBtns[t].addEventListener("click", function () {
          beep(580, "sine", 0.05);
          var targetId = this.getAttribute("data-target");
          var allPanes = document.querySelectorAll(".view-pane");
          for (var p = 0; p < allPanes.length; p++) {
            allPanes[p].classList.remove("active-pane");
          }
          for (var k = 0; k < tabBtns.length; k++) {
            tabBtns[k].classList.remove("active-tab");
          }
          document.getElementById(targetId).classList.add("active-pane");
          this.classList.add("active-tab");
        });
      }

      document.getElementById("theme-switcher").addEventListener("change", function () {
        document.body.className = this.value;
        toast("🎨 Visual Theme Updated!", "#f59e0b");
      });

      setInterval(function () {
        var clk = document.getElementById("header-clock");
        if (clk) clk.textContent = "🕒 " + new Date().toLocaleTimeString();
      }, 1000);

      // ====================================================================
      // ACCOUNT SELECTOR CHIPS LOGIC
      // ====================================================================
      function renderAccountSelectorChips() {
        var wrap = document.getElementById("account-selector-chips");
        var otpSel = document.getElementById("sel-otp-account");
        var miniAppSel = document.getElementById("sel-miniapp-account");
        var quickReloginSel = document.getElementById("sel-quick-relogin");
        if (!wrap) return;

        if (!accountsList.length) {
          wrap.innerHTML = '<span style="font-size:12px;color:#94a3b8;">📭 No accounts connected yet. Open Tab 6 (➕ ADD ID) to connect your accounts!</span>';
          document.getElementById("metric-selected").textContent = "0";
          return;
        }

        if (selectedPhones.length === 0) {
          for (var s = 0; s < accountsList.length; s++) {
            selectedPhones.push(accountsList[s].phone);
          }
        }

        wrap.innerHTML = "";
        if (otpSel) {
          var currentOtpVal = otpSel.value;
          otpSel.innerHTML = '<option value="SELECTED">🔍 SCAN ALL SELECTED ACCOUNTS (' + selectedPhones.length + ' IDs)</option>';
          for (var m = 0; m < accountsList.length; m++) {
            var opt = document.createElement("option");
            opt.value = accountsList[m].phone;
            opt.textContent = "#" + (m + 1) + " " + (accountsList[m].name || "User") + " (" + accountsList[m].phone + ")";
            otpSel.appendChild(opt);
          }
          if (currentOtpVal) otpSel.value = currentOtpVal;
        }

        if (miniAppSel) {
          var curMiniVal = miniAppSel.value;
          miniAppSel.innerHTML = '<option value="SELECTED">🎯 USE SELECTED IDs FROM TOP BAR (' + selectedPhones.length + ' IDs)</option>';
          for (var ma = 0; ma < accountsList.length; ma++) {
            var optMa = document.createElement("option");
            optMa.value = accountsList[ma].phone;
            optMa.textContent = "👤 ONLY #" + (ma + 1) + " " + (accountsList[ma].name || "User") + " (" + accountsList[ma].phone + ")";
            miniAppSel.appendChild(optMa);
          }
          if (curMiniVal) miniAppSel.value = curMiniVal;
        }

        if (quickReloginSel) {
          quickReloginSel.innerHTML = '<option value="">-- Choose Saved Account to Auto-Fill API_ID & API_HASH --</option>';
          for (var q = 0; q < accountsList.length; q++) {
            var optQ = document.createElement("option");
            optQ.value = accountsList[q].phone;
            optQ.textContent = "#" + (q + 1) + " " + (accountsList[q].name || "User") + " (" + accountsList[q].phone + ") — API_ID: " + (accountsList[q].apiId || "Saved");
            quickReloginSel.appendChild(optQ);
          }
        }

        for (var i = 0; i < accountsList.length; i++) {
          (function (idx, acc) {
            var isSel = selectedPhones.indexOf(acc.phone) !== -1;
            var hState = accountHealthMap[acc.phone];
            var chip = document.createElement("div");
            chip.className = "acc-chip" + (isSel ? " selected" : "");
            if (hState === "LOGGED_OUT") {
              chip.style.borderColor = "#f43f5e";
              chip.style.background = "rgba(244,63,94,0.18)";
            }
            chip.innerHTML =
              '<span class="dot-ind" style="' + (hState === "LOGGED_OUT" ? "background:#f43f5e;" : "") + '"></span>' +
              "<span>#" + (idx + 1) + " " + (acc.name || "ID") + " (" + acc.phone.slice(-4) + ")" + (hState === "LOGGED_OUT" ? " 🔴 LOGGED OUT" : "") + "</span>";
            chip.addEventListener("click", function () {
              beep(640, "sine", 0.04);
              var pos = selectedPhones.indexOf(acc.phone);
              if (pos !== -1) {
                selectedPhones.splice(pos, 1);
              } else {
                selectedPhones.push(acc.phone);
              }
              renderAccountSelectorChips();
            });
            wrap.appendChild(chip);
          })(i, accountsList[i]);
        }

        document.getElementById("metric-selected").textContent =
          selectedPhones.length + " / " + accountsList.length;
      }

      document.getElementById("sel-quick-relogin").addEventListener("change", function () {
        var ph = this.value;
        if (!ph) return;
        for (var i = 0; i < accountsList.length; i++) {
          if (accountsList[i].phone === ph) {
            document.getElementById("inp-api-id").value = accountsList[i].apiId || "";
            document.getElementById("inp-api-hash").value = accountsList[i].apiHash || "";
            document.getElementById("inp-phone").value = accountsList[i].phone || "";
            document.getElementById("inp-2fa").value = accountsList[i].twoFaPassword || "";
            toast("⚡ Auto-Filled API_ID, API_HASH & Phone for " + ph, "#10b981");
            break;
          }
        }
      });

      document.getElementById("btn-select-all-accs").addEventListener("click", function () {
        selectedPhones = accountsList.map(function (a) {
          return a.phone;
        });
        renderAccountSelectorChips();
        toast("✅ All " + selectedPhones.length + " Accounts Selected!", "#10b981");
      });

      document.getElementById("btn-deselect-all-accs").addEventListener("click", function () {
        selectedPhones = [];
        renderAccountSelectorChips();
        toast("❌ Account Selection Cleared.", "#f43f5e");
      });

      // ====================================================================
      // BACKEND API COMMUNICATOR
      // ====================================================================
      async function sendApiRequest(action, extraData) {
        extraData = extraData || {};
        var countLabel = extraData.limitCount ? (extraData.limitCount + " IDs") : ((selectedPhones.length || "ALL") + " IDs");
        writeConsole("⏳ <b>Executing [" + action.toUpperCase() + "] on " + countLabel + "...</b>");
        try {
          var payload = {
            action: action,
            webPin: MASTER_PIN_CODE,
            selectedPhones: selectedPhones
          };
          for (var key in extraData) {
            payload[key] = extraData[key];
          }
          var response = await fetch("/api/panel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          var result = await response.json();
          if (result.reply) {
            writeConsole(result.reply);
          }
          if (result.otpHtml) {
            document.getElementById("otp-reader-result").innerHTML = result.otpHtml;
          }
          if (result.healthMap) {
            accountHealthMap = result.healthMap;
          }
          if (result.pendingPhone) {
            var banner = document.getElementById("active-session-banner");
            if (banner) {
              banner.innerHTML =
                "🟢 <b>Pending Phone:</b> <code>" +
                result.pendingPhone +
                "</code><br>🔢 <b>Dedicated API_ID:</b> <code>" +
                (result.pendingApiId || "Saved") +
                "</code>";
            }
          }
          loadDashboardState(true);
          return result;
        } catch (err) {
          writeConsole("❌ <b>Connection Error:</b> " + err.message);
          toast("❌ Error: " + err.message, "#f43f5e");
        }
      }

      async function loadDashboardState(silent) {
        try {
          var response = await fetch("/api/panel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "dashboard_stats",
              webPin: MASTER_PIN_CODE
            })
          });
          var data = await response.json();
          accountsList = Array.isArray(data.accounts) ? data.accounts : [];
          globalAccountsList = accountsList;
          channelsList = Array.isArray(data.channels) ? data.channels : [];

          document.getElementById("metric-accounts").textContent = accountsList.length;
          document.getElementById("metric-channels").textContent = channelsList.length;

          renderAccountSelectorChips();
          drawAccountsTable();
          drawChannelsTables();
          if (!silent) toast("⚡ Synced with Firebase DB!", "#10b981");
        } catch (e) {}
      }

      function drawAccountsTable() {
        var tbody = document.getElementById("tbody-accounts");
        if (!tbody) return;
        if (!accountsList.length) {
          tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">📭 No accounts connected yet. Enter API_ID, API_HASH & Phone above!</td></tr>';
          return;
        }
        tbody.innerHTML = "";
        for (var i = 0; i < accountsList.length; i++) {
          (function (idx, acc) {
            var tr = document.createElement("tr");
            var fullHash = acc.apiHash || "Not Set";
            var displayHash = showFullApiHashes
              ? fullHash
              : (acc.apiHash ? String(acc.apiHash).substring(0, 8) + "••••••••" : "Saved");
            var display2FA = showFullApiHashes
              ? (acc.twoFaPassword || "None")
              : (acc.twoFaPassword ? "•••••• (Saved)" : "None");

            var hState = accountHealthMap[acc.phone] || "ACTIVE";
            var statusBadge =
              hState === "LOGGED_OUT"
                ? '<span class="status-left">🔴 LOGGED OUT</span>'
                : '<span class="status-joined">🟢 ACTIVE</span>';

            tr.innerHTML =
              "<td><b>#" + (idx + 1) + "</b></td>" +
              "<td><b>" + (acc.name || "User") + "</b><br>" + statusBadge + "</td>" +
              "<td>@" + (acc.username || "None") + "</td>" +
              "<td><code>" + acc.phone + "</code></td>" +
              '<td><span class="api-tag">' + (acc.apiId || "Set") + "</span></td>" +
              "<td><code style='color:#34d399;user-select:all;'>" + displayHash + "</code></td>" +
              "<td><code style='color:#fde68a;user-select:all;'>" + display2FA + "</code></td>" +
              '<td style="display:flex;gap:6px;flex-wrap:wrap;"></td>';

            var actionCell = tr.lastChild;

            var btnRejoin = document.createElement("button");
            btnRejoin.type = "button";
            btnRejoin.className = "action-btn btn-emerald btn-mini";
            btnRejoin.textContent = "🔄 REJOIN / RE-LOGIN";
            btnRejoin.addEventListener("click", function () {
              window.triggerAccountRejoin(acc.phone);
            });

            var btnCopyApi = document.createElement("button");
            btnCopyApi.type = "button";
            btnCopyApi.className = "action-btn btn-ghost btn-mini";
            btnCopyApi.textContent = "📋 COPY API";
            btnCopyApi.addEventListener("click", function () {
              var p = prompt("🔐 Enter PIN (252010) to copy full API_ID & API_HASH:", "252010");
              if (p !== "252010") return toast("❌ Invalid PIN!", "#f43f5e");
              var copyStr = "Phone: " + acc.phone + "\nAPI_ID: " + acc.apiId + "\nAPI_HASH: " + acc.apiHash + "\n2FA: " + (acc.twoFaPassword || "None");
              navigator.clipboard.writeText(copyStr);
              toast("📋 Copied API_ID, API_HASH & Phone!", "#10b981");
            });

            var btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.className = "action-btn btn-crimson btn-mini";
            btnDel.textContent = "🗑️";
            btnDel.addEventListener("click", function () {
              if (confirm("Remove account " + acc.phone + "?")) {
                sendApiRequest("remove_account", { input: acc.phone });
              }
            });

            actionCell.appendChild(btnRejoin);
            actionCell.appendChild(btnCopyApi);
            actionCell.appendChild(btnDel);
            tbody.appendChild(tr);
          })(i, accountsList[i]);
        }
      }

      document.getElementById("btn-unlock-api-hashes").addEventListener("click", function () {
        if (showFullApiHashes) {
          showFullApiHashes = false;
          this.textContent = "🔐 SHOW FULL API_HASH & 2FA (PIN: 252010)";
          drawAccountsTable();
          return;
        }
        var pin = prompt("🔐 Enter Master Password (252010) to reveal full API_HASH & 2FA Passwords:", "");
        if (pin === MASTER_PIN_CODE) {
          showFullApiHashes = true;
          this.textContent = "🙈 HIDE FULL API_HASH & 2FA";
          drawAccountsTable();
          toast("🔓 Full API_ID, API_HASH & 2FA Revealed!", "#10b981");
        } else {
          toast("❌ Wrong Password!", "#f43f5e");
        }
      });

      function runHealthCheck() {
        toast("🩺 Checking session status of all connected IDs...", "#00f0ff");
        sendApiRequest("check_accounts_health", {});
      }

      document.getElementById("btn-check-health").addEventListener("click", runHealthCheck);
      document.getElementById("btn-check-health-table").addEventListener("click", runHealthCheck);

      // Rejoin Modal Buttons
      document.getElementById("btn-close-rejoin-modal").addEventListener("click", function () {
        document.getElementById("rejoin-modal-overlay").classList.add("vault-open");
      });

      document.getElementById("btn-rejoin-send-otp").addEventListener("click", function () {
        var ph = document.getElementById("rejoin-phone").value.trim();
        var aid = document.getElementById("rejoin-api-id").value.trim();
        var ahash = document.getElementById("rejoin-api-hash").value.trim();
        if (!ph || !aid || !ahash) return toast("⚠️ Missing API_ID, API_HASH or Phone!", "#f43f5e");
        toast("📩 Sending Login OTP to " + ph + "...", "#f59e0b");
        sendApiRequest("send_code", { apiId: aid, apiHash: ahash, input: ph });
      });

      document.getElementById("btn-rejoin-verify-otp").addEventListener("click", function () {
        var code = document.getElementById("rejoin-otp-code").value.trim();
        var twoFa = document.getElementById("rejoin-2fa-pass").value.trim();
        if (!code) return toast("⚠️ Enter the 5-digit OTP!", "#f43f5e");
        sendApiRequest("verify_code", { input: code, twoFaPassword: twoFa }).then(function (res) {
          if (res && res.nextStep !== "wait_2fa" && res.reply && res.reply.indexOf("CONNECTED") !== -1) {
            document.getElementById("rejoin-modal-overlay").classList.add("vault-open");
            toast("🎉 ID Reconnected Successfully!", "#10b981");
          } else if (res && res.nextStep === "wait_2fa") {
            toast("🔐 Now click Step 3 (Verify 2FA Password)!", "#ec4899");
          }
        });
      });

      document.getElementById("btn-rejoin-verify-2fa").addEventListener("click", function () {
        var pwd = document.getElementById("rejoin-2fa-pass").value.trim();
        if (!pwd) return toast("⚠️ Enter your 2FA Password!", "#f43f5e");
        sendApiRequest("verify_2fa", { input: pwd }).then(function (res) {
          if (res && res.reply && res.reply.indexOf("CONNECTED") !== -1) {
            document.getElementById("rejoin-modal-overlay").classList.add("vault-open");
            toast("🎉 2FA Verified & ID Rejoined!", "#10b981");
          }
        });
      });

      document.getElementById("btn-rejoin-from-otp").addEventListener("click", function () {
        var targetAcc = document.getElementById("sel-otp-account").value;
        if (!targetAcc || targetAcc === "SELECTED") {
          return toast("⚠️ Select a specific account from the dropdown first!", "#f43f5e");
        }
        window.triggerAccountRejoin(targetAcc);
      });

      function drawChannelsTables() {
        var tbMain = document.getElementById("tbody-channels-main");
        if (!tbMain) return;

        if (!channelsList.length) {
          tbMain.innerHTML =
            '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">📭 No channels registered in Firebase yet.</td></tr>';
          return;
        }

        tbMain.innerHTML = "";
        for (var i = 0; i < channelsList.length; i++) {
          (function (idx, ch) {
            var num = idx + 1;
            var isJoined = String(ch.status).indexOf("🟢") !== -1;
            var statusClass = isJoined ? "status-joined" : "status-left";

            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td><b>[" + num + "]</b></td>" +
              "<td><b>" + (ch.title || ch.input) + "</b></td>" +
              "<td><code>" + ch.input + "</code></td>" +
              '<td><span class="' + statusClass + '">' + ch.status + "</span></td>" +
              '<td style="display:flex;gap:6px;flex-wrap:wrap;"></td>';

            var btnLeave = document.createElement("button");
            btnLeave.type = "button";
            btnLeave.className = "action-btn btn-crimson btn-mini";
            btnLeave.textContent = "📤 LEAVE SELECTED IDs";
            btnLeave.addEventListener("click", function () {
              sendApiRequest("leave", { input: String(num) });
            });

            var btnRejoin = document.createElement("button");
            btnRejoin.type = "button";
            btnRejoin.className = "action-btn btn-ghost btn-mini";
            btnRejoin.textContent = "📥 RE-JOIN";
            btnRejoin.addEventListener("click", function () {
              sendApiRequest("join", { input: ch.input });
            });

            tr.lastChild.appendChild(btnLeave);
            tr.lastChild.appendChild(btnRejoin);
            tbMain.appendChild(tr);
          })(i, channelsList[i]);
        }
      }

      // ====================================================================
      // BIND ALL SMM, MINI-APP & INLINE BUTTON CLICKER ACTIONS
      // ====================================================================

      // 1. SMM: Boost Post Views (With Quantity Limit)
      document.getElementById("btn-boost-views").addEventListener("click", function () {
        var link = document.getElementById("inp-views-link").value.trim();
        var cnt = document.getElementById("inp-views-count").value.trim();
        if (!link) return toast("⚠️ Enter a valid Post Link!", "#f43f5e");
        sendApiRequest("boost_views", { postLink: link, limitCount: cnt });
      });

      // 2. SMM: Auto Post Emoji Reactions (All 73+ Reactions + Multi-Select + Random + Quantity)
      document.getElementById("btn-send-reactions").addEventListener("click", function () {
        var link = document.getElementById("inp-react-link").value.trim();
        var cnt = document.getElementById("inp-react-count").value.trim();
        if (!link) return toast("⚠️ Enter a valid Post Link!", "#f43f5e");
        sendApiRequest("send_reaction", {
          postLink: link,
          emoji: isRandomEmojiMode ? "RANDOM" : selectedEmojis[0],
          emojiList: isRandomEmojiMode ? [] : selectedEmojis,
          limitCount: cnt
        });
      });

      // 3. SMM: Channel Post Inline Button Scanner & Clicker
      document.getElementById("btn-scan-post-btns").addEventListener("click", function () {
        var link = document.getElementById("inp-post-btn-link").value.trim();
        if (!link) return toast("⚠️ Enter Channel Post Link first!", "#f43f5e");
        sendApiRequest("inspect_post_buttons", { postLink: link });
      });

      document.getElementById("btn-click-post-btn").addEventListener("click", function () {
        var link = document.getElementById("inp-post-btn-link").value.trim();
        var targetMode = document.getElementById("sel-post-btn-target").value;
        var customNum = document.getElementById("inp-post-btn-custom-num").value.trim();
        var cnt = document.getElementById("inp-post-btn-count").value.trim();
        if (!link) return toast("⚠️ Enter Channel Post Link first!", "#f43f5e");
        sendApiRequest("click_post_button", {
          postLink: link,
          buttonTarget: targetMode === "CUSTOM" ? customNum : targetMode,
          limitCount: cnt
        });
      });

      // 4. SMM: Auto Channel Commenter (With Quantity Limit)
      document.getElementById("btn-post-comments").addEventListener("click", function () {
        var link = document.getElementById("inp-comment-link").value.trim();
        var commentsRaw = document.getElementById("inp-comment-list").value.trim();
        var cnt = document.getElementById("inp-comment-count").value.trim();
        if (!link || !commentsRaw) return toast("⚠️ Enter Post Link and Comments!", "#f43f5e");
        sendApiRequest("post_comments", { postLink: link, comments: commentsRaw, limitCount: cnt });
      });

      // 5. SMM: Auto Poll Voter (With Quantity Limit)
      document.getElementById("btn-vote-poll").addEventListener("click", function () {
        var link = document.getElementById("inp-poll-link").value.trim();
        var optNum = document.getElementById("inp-poll-option").value.trim();
        var cnt = document.getElementById("inp-poll-count").value.trim();
        if (!link) return toast("⚠️ Enter Poll Post Link!", "#f43f5e");
        sendApiRequest("vote_poll", { postLink: link, optionNumber: optNum, limitCount: cnt });
      });

      // 6. SMM: 1-Click Mega Combo (Join + Views + Reaction + Quantity Limit)
      document.getElementById("btn-smm-combo").addEventListener("click", function () {
        var link = document.getElementById("inp-smm-combo-link").value.trim();
        var cnt = document.getElementById("inp-combo-count").value.trim();
        if (!link) return toast("⚠️ Enter Post Link for SMM Combo!", "#f43f5e");
        sendApiRequest("smm_combo", {
          postLink: link,
          emoji: isRandomEmojiMode ? "RANDOM" : selectedEmojis[0],
          emojiList: isRandomEmojiMode ? [] : selectedEmojis,
          limitCount: cnt
        });
      });

      // 7. NEW: Bot Mini-App Opener & Last Inline Button Clicker
      document.getElementById("btn-open-miniapp-now").addEventListener("click", function () {
        var link = document.getElementById("inp-miniapp-link").value.trim();
        var btnMode = document.getElementById("sel-miniapp-btn-mode").value;
        var specificAcc = document.getElementById("sel-miniapp-account").value;
        var cnt = document.getElementById("inp-miniapp-count").value.trim();
        if (!link) return toast("⚠️ Paste a Bot or Mini-App Link first!", "#f43f5e");
        sendApiRequest("bot_miniapp_opener", {
          botInput: link,
          buttonMode: btnMode,
          targetPhone: specificAcc,
          limitCount: cnt
        });
      });

      // 8. Bot Referral Booster (/start) (With Quantity Limit)
      document.getElementById("btn-start-bot-ref").addEventListener("click", function () {
        var refLink = document.getElementById("inp-bot-ref-link").value.trim();
        var refParam = document.getElementById("inp-bot-ref-param").value.trim();
        var cnt = document.getElementById("inp-bot-ref-count").value.trim();
        if (!refLink) return toast("⚠️ Enter Bot Referral Link or @username!", "#f43f5e");
        sendApiRequest("bot_referral", { botInput: refLink, startParam: refParam, limitCount: cnt });
      });

      // 9. Block / Unblock Bot
      document.getElementById("btn-block-bot").addEventListener("click", function () {
        var botU = document.getElementById("inp-block-bot-user").value.trim();
        if (!botU) return toast("⚠️ Enter Target Bot @username!", "#f43f5e");
        sendApiRequest("block_bot", { botUsername: botU, blockMode: "block" });
      });

      document.getElementById("btn-unblock-bot").addEventListener("click", function () {
        var botU = document.getElementById("inp-block-bot-user").value.trim();
        if (!botU) return toast("⚠️ Enter Target Bot @username!", "#f43f5e");
        sendApiRequest("block_bot", { botUsername: botU, blockMode: "unblock" });
      });

      // 10. Live OTP Reader (777000)
      document.getElementById("btn-read-otp").addEventListener("click", function () {
        var targetAcc = document.getElementById("sel-otp-account").value;
        document.getElementById("otp-reader-result").innerHTML = "⏳ <b>Scanning Telegram Service (777000) via Triple-Fallback Engine...</b>";
        sendApiRequest("read_otp", { targetPhone: targetAcc });
      });

      // 11. Always Online Status (ON / OFF + 24/7 Heartbeat Loop)
      document.getElementById("btn-set-online").addEventListener("click", function () {
        sendApiRequest("set_online", { online: true }).then(function () {
          document.getElementById("metric-online-state").textContent = "🟢 ONLINE";
          document.getElementById("metric-online-state").style.color = "#10b981";
        });
      });

      document.getElementById("btn-set-offline").addEventListener("click", function () {
        if (onlineHeartbeatTimer) {
          clearInterval(onlineHeartbeatTimer);
          onlineHeartbeatTimer = null;
          document.getElementById("btn-toggle-heartbeat").textContent = "▶️ START 24/7 ALWAYS-ONLINE HEARTBEAT";
        }
        sendApiRequest("set_online", { online: false }).then(function () {
          document.getElementById("metric-online-state").textContent = "🔴 OFFLINE";
          document.getElementById("metric-online-state").style.color = "#f43f5e";
        });
      });

      document.getElementById("btn-toggle-heartbeat").addEventListener("click", function () {
        if (onlineHeartbeatTimer) {
          clearInterval(onlineHeartbeatTimer);
          onlineHeartbeatTimer = null;
          this.textContent = "▶️ START 24/7 ALWAYS-ONLINE HEARTBEAT";
          document.getElementById("metric-online-sub").textContent = "⏹️ Heartbeat Stopped";
          toast("⏹️ 24/7 Online Heartbeat Stopped.", "#f59e0b");
        } else {
          sendApiRequest("set_online", { online: true });
          onlineHeartbeatTimer = setInterval(function () {
            sendApiRequest("set_online", { online: true });
          }, 45000);
          this.textContent = "⏹️ STOP 24/7 ALWAYS-ONLINE HEARTBEAT (ACTIVE)";
          document.getElementById("metric-online-state").textContent = "🟢 24/7 LIVE";
          document.getElementById("metric-online-state").style.color = "#10b981";
          document.getElementById("metric-online-sub").textContent = "⚡ Pinging every 45s";
          toast("🟢 24/7 Always-Online Heartbeat Activated!", "#10b981");
        }
      });

      // 12. Group Auto Poster (Ad Spammer) + Auto Loop Timer
      function runGroupPosterOnce() {
        var groups = document.getElementById("inp-group-targets").value.trim();
        var adMsg = document.getElementById("inp-group-ad-msg").value.trim();
        if (!groups || !adMsg) {
          toast("⚠️ Enter Group Links and Ad Message!", "#f43f5e");
          return false;
        }
        sendApiRequest("group_poster", { groups: groups, messageText: adMsg });
        return true;
      }

      document.getElementById("btn-post-group-ads").addEventListener("click", runGroupPosterOnce);

      document.getElementById("btn-toggle-group-loop").addEventListener("click", function () {
        if (groupAdLoopTimer) {
          clearInterval(groupAdLoopTimer);
          groupAdLoopTimer = null;
          this.textContent = "⏱️ START AUTO-REPEAT AD TIMER (MINS)";
          toast("⏹️ Auto Group Ad Timer Stopped.", "#f59e0b");
        } else {
          var mins = parseInt(document.getElementById("inp-spam-interval").value, 10) || 5;
          if (!runGroupPosterOnce()) return;
          groupAdLoopTimer = setInterval(runGroupPosterOnce, mins * 60 * 1000);
          this.textContent = "⏹️ STOP AUTO-AD TIMER (EVERY " + mins + "M)";
          toast("📢 Auto Group Poster scheduled every " + mins + " mins!", "#10b981");
        }
      });

      // 13. Bulk DM Sender
      document.getElementById("btn-send-bulk-dm").addEventListener("click", function () {
        var targets = document.getElementById("inp-dm-targets").value.trim();
        var dmText = document.getElementById("inp-dm-text").value.trim();
        var mode = document.getElementById("sel-dm-mode").value;
        if (!targets || !dmText) return toast("⚠️ Enter Target Usernames and Message!", "#f43f5e");
        sendApiRequest("bulk_dm", { targets: targets, messageText: dmText, dmMode: mode });
      });

      // 14. Channel Join / Leave & Account Add
      document.getElementById("btn-join-channel").addEventListener("click", function () {
        var chan = document.getElementById("inp-join-channel").value.trim();
        var cnt = document.getElementById("inp-join-count").value.trim();
        if (!chan) return toast("⚠️ Enter a Channel Link or @username!", "#f43f5e");
        sendApiRequest("join", { input: chan, limitCount: cnt });
      });

      document.getElementById("btn-leave-number").addEventListener("click", function () {
        var num = document.getElementById("inp-leave-number").value.trim();
        if (!num) return toast("⚠️ Enter a Channel Number!", "#f43f5e");
        sendApiRequest("leave", { input: num });
      });

      document.getElementById("btn-send-otp").addEventListener("click", function () {
        var apiId = document.getElementById("inp-api-id").value.trim();
        var apiHash = document.getElementById("inp-api-hash").value.trim();
        var phone = document.getElementById("inp-phone").value.trim();
        if (!apiId || !apiHash || !phone) {
          return toast("⚠️ Enter API_ID, API_HASH & Phone Number!", "#f43f5e");
        }
        sendApiRequest("send_code", { apiId: apiId, apiHash: apiHash, input: phone });
      });

      document.getElementById("btn-verify-otp").addEventListener("click", function () {
        var otp = document.getElementById("inp-otp").value.trim();
        var twoFa = document.getElementById("inp-2fa").value.trim();
        if (!otp) return toast("⚠️ Enter the 5-digit OTP!", "#f43f5e");
        sendApiRequest("verify_code", { input: otp, twoFaPassword: twoFa });
      });

      document.getElementById("btn-verify-2fa").addEventListener("click", function () {
        var pwd = document.getElementById("inp-2fa").value.trim();
        if (!pwd) return toast("⚠️ Enter your 2FA Cloud Password!", "#f43f5e");
        sendApiRequest("verify_2fa", { input: pwd });
      });

      document.getElementById("btn-clear-log").addEventListener("click", function () {
        document.getElementById("console-box").innerHTML = "👑 [CONSOLE CLEARED]: Ready for next operation...";
      });

      document.getElementById("btn-sync-now").addEventListener("click", function () {
        loadDashboardState(false);
      });
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// 4. MAIN SERVERLESS API HANDLER (ALL AUTOMATION ENGINES + ZERO HANG)
// ============================================================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderMasterWebPanel());
  }

  const body = req.body || {};
  const { action, input, apiId, apiHash, webPin, selectedPhones, limitCount } = body;

  if (webPin !== undefined && String(webPin) !== MASTER_PIN) {
    return res.status(403).json({
      nextStep: "",
      reply: "❌ <b>SECURITY ALERT:</b> Invalid Master Password (252010 Required)!"
    });
  }

  try {
    // ================= 0. DASHBOARD STATS =================
    if (action === "dashboard_stats") {
      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      const safeAccounts = accounts.map(function (a) {
        return {
          phone: a.phone,
          name: a.name,
          username: a.username,
          apiId: a.apiId || "",
          apiHash: a.apiHash || "",
          twoFaPassword: a.twoFaPassword || "",
          addedOn: a.addedOn
        };
      });

      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      const tempAuth = await fbGet("panel/auth_temp");
      const pendingAuth =
        tempAuth && tempAuth.phone
          ? { phone: tempAuth.phone, apiId: tempAuth.apiId }
          : null;

      return res.status(200).json({
        accounts: safeAccounts,
        channels: channels,
        pendingAuth: pendingAuth
      });
    }

    // ================= 1. SAVE DEFAULT API CONFIG =================
    if (action === "save_api") {
      const cleanId = parseInt(String(apiId).replace(/\D/g, ""), 10);
      const cleanHash = String(apiHash).replace(/[^a-zA-Z0-9]/g, "").trim();

      if (!cleanId || cleanHash.length < 20) {
        return res.status(200).json({ nextStep: "", reply: "❌ <b>Invalid API Credentials!</b>" });
      }
      await fbSet("panel/api_config", { apiId: cleanId, apiHash: cleanHash });
      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>API Credentials Saved!</b> (<code>" + cleanId + "</code>)"
      });
    }

    const defaultApiConfig = (await fbGet("panel/api_config")) || {};

    // ================= 2. SEND OTP (SHOWS EXACT DELIVERY TYPE + ANTI-LOGOUT PARAMS) =================
    if (action === "send_code") {
      const phone = "+" + String(input || "").replace(/\D/g, "");
      const accApiId = parseInt(String(apiId || defaultApiConfig.apiId || "").replace(/\D/g, ""), 10);
      const accApiHash = String(apiHash || defaultApiConfig.apiHash || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .trim();

      if (!accApiId || accApiHash.length < 20) {
        return res.status(200).json({
          nextStep: "",
          reply: "⚠️ <b>Missing Account API_ID or API_HASH!</b> Please fill Boxes 1 & 2."
        });
      }

      const client = new TelegramClient(
        new StringSession(""),
        Number(accApiId),
        String(accApiHash),
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
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: Number(accApiId),
          apiHash: String(accApiHash),
          settings: new Api.CodeSettings({})
        })
      );

      let deliveryType = "📲 Telegram App (777000 Service Chat)";
      if (result.type && result.type.className) {
        if (result.type.className.indexOf("Sms") !== -1) deliveryType = "📩 SIM Card SMS";
        else if (result.type.className.indexOf("Call") !== -1) deliveryType = "📞 Phone Call";
      }

      const tempSession = client.session.save();
      await safeDisconnect(client);

      await fbSet("panel/auth_temp", {
        phone: phone,
        apiId: Number(accApiId),
        apiHash: String(accApiHash),
        phoneCodeHash: result.phoneCodeHash,
        tempSession: tempSession,
        time: Date.now()
      });

      return res.status(200).json({
        nextStep: "wait_otp",
        pendingPhone: phone,
        pendingApiId: accApiId,
        reply:
          "📩 <b>OTP SENT TO:</b> <code>" + phone + "</code>\n" +
          "📡 <b>Delivery Method:</b> <code>" + deliveryType + "</code>\n" +
          "🔢 <b>API_ID:</b> <code>" + accApiId + "</code> | 🔑 <b>API_HASH:</b> <code>" + accApiHash + "</code>\n" +
          "👉 Enter the 5-digit OTP in Step 2!"
      });
    }

    // ================= 3. VERIFY OTP (+ AUTO 2FA IN 1 STEP TO PREVENT 401 ERROR) =================
    if (action === "verify_code") {
      const code = String(input || "").replace(/\D/g, "");
      const optional2FA = String(body.twoFaPassword || "").trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({ nextStep: "", reply: "❌ <b>No Active OTP Session!</b> First click Step 1 (Send OTP)." });
      }

      const phone = tempAuth.phone;
      const accApiId = Number(tempAuth.apiId || defaultApiConfig.apiId);
      const accApiHash = String(tempAuth.apiHash || defaultApiConfig.apiHash);

      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);
      const existingAcc = accounts.find(function (a) {
        return a && a.phone === phone;
      });
      const auto2FAPassword = optional2FA || (existingAcc && existingAcc.twoFaPassword) || "";

      const client = new TelegramClient(
        new StringSession(tempAuth.tempSession),
        accApiId,
        accApiHash,
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

      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: tempAuth.phoneCodeHash,
            phoneCode: code
          })
        );
      } catch (err) {
        if (err.message && err.message.indexOf("SESSION_PASSWORD_NEEDED") !== -1) {
          if (auto2FAPassword) {
            try {
              await verifyTelegram2FAPassword(client, accApiId, accApiHash, auto2FAPassword);
            } catch (twoFaErr) {
              const updatedSession = client.session.save();
              await safeDisconnect(client);
              await fbSet("panel/auth_temp", {
                phone: phone,
                apiId: accApiId,
                apiHash: accApiHash,
                phoneCodeHash: tempAuth.phoneCodeHash,
                tempSession: updatedSession,
                otpVerified: true,
                time: Date.now()
              });
              return res.status(200).json({
                nextStep: "wait_2fa",
                pendingPhone: phone,
                pendingApiId: accApiId,
                reply: "🔐 <b>OTP Verified! Please enter your current 2FA Cloud Password in Step 3.</b>"
              });
            }
          } else {
            const updatedSession = client.session.save();
            await safeDisconnect(client);
            await fbSet("panel/auth_temp", {
              phone: phone,
              apiId: accApiId,
              apiHash: accApiHash,
              phoneCodeHash: tempAuth.phoneCodeHash,
              tempSession: updatedSession,
              otpVerified: true,
              time: Date.now()
            });

            return res.status(200).json({
              nextStep: "wait_2fa",
              pendingPhone: phone,
              pendingApiId: accApiId,
              reply: "🔐 <b>OTP VERIFIED! 2FA PASSWORD REQUIRED FOR:</b> <code>" + phone + "</code>\n👉 Enter your 2FA Cloud Password in Step 3!"
            });
          }
        } else {
          await safeDisconnect(client);
          throw err;
        }
      }

      const finalSession = client.session.save();
      const me = await client.getMe();
      await safeDisconnect(client);

      let exists = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].phone === phone) {
          accounts[i].session = finalSession;
          accounts[i].apiId = accApiId;
          accounts[i].apiHash = accApiHash;
          if (auto2FAPassword) accounts[i].twoFaPassword = auto2FAPassword;
          accounts[i].name = me.firstName || "User";
          accounts[i].username = me.username || "None";
          exists = true;
          break;
        }
      }

      if (!exists) {
        accounts.push({
          phone: phone,
          apiId: accApiId,
          apiHash: accApiHash,
          twoFaPassword: auto2FAPassword || "",
          name: me.firstName || "User",
          username: me.username || "None",
          session: finalSession,
          addedOn: new Date().toLocaleDateString("en-IN")
        });
      }

      await fbSet("panel/accounts", accounts);
      await fbSet("panel/auth_temp", null);

      return res.status(200).json({
        nextStep: "",
        reply: "🎉 <b>ACCOUNT CONNECTED:</b> " + (me.firstName || "User") + " (<code>" + phone + "</code>) • Total IDs: " + accounts.length
      });
    }

    // ================= 4. VERIFY 2FA PASSWORD (SAFE GUARD AGAINST 401 ERROR) =================
    if (action === "verify_2fa") {
      const password = String(input || "").trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({ nextStep: "", reply: "❌ <b>Session Expired!</b> Request OTP again." });
      }

      if (!tempAuth.otpVerified) {
        return res.status(200).json({
          nextStep: "wait_otp",
          reply: "⚠️ <b>STOP! First verify the 5-Digit OTP in Step 2!</b> Only click Verify 2FA after Step 2 succeeds."
        });
      }

      const phone = tempAuth.phone;
      const accApiId = Number(tempAuth.apiId || defaultApiConfig.apiId);
      const accApiHash = String(tempAuth.apiHash || defaultApiConfig.apiHash);

      const client = new TelegramClient(
        new StringSession(tempAuth.tempSession),
        accApiId,
        accApiHash,
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
      await verifyTelegram2FAPassword(client, accApiId, accApiHash, password);

      const finalSession = client.session.save();
      const me = await client.getMe();
      await safeDisconnect(client);

      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      let exists = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].phone === phone) {
          accounts[i].session = finalSession;
          accounts[i].apiId = accApiId;
          accounts[i].apiHash = accApiHash;
          accounts[i].twoFaPassword = password;
          accounts[i].name = me.firstName || "User";
          accounts[i].username = me.username || "None";
          exists = true;
          break;
        }
      }

      if (!exists) {
        accounts.push({
          phone: phone,
          apiId: accApiId,
          apiHash: accApiHash,
          twoFaPassword: password,
          name: me.firstName || "User",
          username: me.username || "None",
          session: finalSession,
          addedOn: new Date().toLocaleDateString("en-IN")
        });
      }

      await fbSet("panel/accounts", accounts);
      await fbSet("panel/auth_temp", null);

      return res.status(200).json({
        nextStep: "",
        reply: "🎉 <b>2FA VERIFIED & CONNECTED:</b> " + (me.firstName || "User") + " (<code>" + phone + "</code>) • Total IDs: " + accounts.length
      });
    }

    // ================= LOAD ALL & TARGET ACCOUNTS (WITH QUANTITY LIMITER) =================
    let allAccounts = (await fbGet("panel/accounts")) || [];
    if (!Array.isArray(allAccounts)) allAccounts = Object.values(allAccounts);

    if (action === "remove_account") {
      const targetPhone = String(input || "").trim();
      allAccounts = allAccounts.filter(function (a) {
        return a.phone !== targetPhone;
      });
      await fbSet("panel/accounts", allAccounts);
      return res.status(200).json({ nextStep: "", reply: "🗑️ <b>Account Removed:</b> <code>" + targetPhone + "</code>" });
    }

    if (action === "my_accounts") {
      if (allAccounts.length === 0) return res.status(200).json({ nextStep: "", reply: "📭 <b>No Connected Accounts!</b>" });
      let msg = "📱 <b>CONNECTED ACCOUNTS (" + allAccounts.length + " IDs)</b>\n\n";
      for (let i = 0; i < allAccounts.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + allAccounts[i].name + "</b> — <code>" + allAccounts[i].phone + "</code>\n" +
          " ┣ 🔢 API_ID: <code>" + (allAccounts[i].apiId || "Set") + "</code>\n" +
          " ┗ 🔑 API_HASH: <code>" + (allAccounts[i].apiHash || "Set") + "</code>\n\n";
      }
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (allAccounts.length === 0) {
      return res.status(200).json({ nextStep: "", reply: "⚠️ <b>No Active Accounts!</b> Connect at least 1 Telegram ID first." });
    }

    const targetAccounts = filterTargetAccounts(allAccounts, selectedPhones, limitCount);
    if (targetAccounts.length === 0) {
      return res.status(200).json({ nextStep: "", reply: "⚠️ <b>No Accounts Selected!</b> Select at least 1 account in the Target Selector Bar." });
    }

    // Helper to connect a single account with Anti-Logout Device Fingerprint
    async function connectAccountClient(acc) {
      const useApiId = Number(acc.apiId || defaultApiConfig.apiId);
      const useApiHash = String(acc.apiHash || defaultApiConfig.apiHash);
      const client = new TelegramClient(
        new StringSession(acc.session),
        useApiId,
        useApiHash,
        {
          connectionRetries: 1,
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

    // ================= 4B. CHECK ALL ACCOUNTS HEALTH (DETECT LOGGED-OUT IDs) =================
    if (action === "check_accounts_health") {
      const healthMap = {};
      let activeCount = 0;
      let loggedOutList = [];

      await Promise.allSettled(
        allAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                const me = await client.getMe();
                if (me && me.id) {
                  healthMap[acc.phone] = "ACTIVE";
                  activeCount++;
                } else {
                  healthMap[acc.phone] = "LOGGED_OUT";
                  loggedOutList.push(acc);
                }
              } catch (err) {
                healthMap[acc.phone] = "LOGGED_OUT";
                loggedOutList.push(acc);
              } finally {
                await safeDisconnect(client);
              }
            })(),
            7500
          );
        })
      );

      let report =
        "╔════════════════════════════╗\n" +
        "   🩺 <b>ID HEALTH SCAN COMPLETED!</b>\n" +
        "╚════════════════════════════╝\n" +
        "🟢 <b>Active IDs:</b> <code>" + activeCount + " / " + allAccounts.length + "</code>\n" +
        "🔴 <b>Logged-Out IDs:</b> <code>" + loggedOutList.length + "</code>\n";

      if (loggedOutList.length > 0) {
        report += "\n⚠️ <b>Click [🔄 REJOIN / RE-LOGIN] on these IDs:</b>\n";
        for (let k = 0; k < loggedOutList.length; k++) {
          report +=
            "• <b>" + (loggedOutList[k].name || "ID") + "</b> (<code>" + loggedOutList[k].phone + "</code>) — API_ID: <code>" + loggedOutList[k].apiId + "</code>\n";
        }
      }

      return res.status(200).json({
        healthMap: healthMap,
        reply: report
      });
    }

    // Helper to join a public/private channel or group if not already a member
    async function joinPeerIfNeeded(client, rawPeer) {
      const str = String(rawPeer || "").trim();
      if (str.indexOf("+") !== -1 || str.indexOf("joinchat/") !== -1) {
        const hash = str.split("+").pop().split("joinchat/").pop().replace("/", "").trim();
        try {
          const r = await client.invoke(new Api.messages.ImportChatInvite({ hash: hash }));
          if (r.chats && r.chats[0]) return "-100" + r.chats[0].id.toString();
        } catch (e) {}
        return str;
      } else {
        const cleanU = str.replace("https://t.me/", "").replace("@", "").split("/")[0].trim();
        try {
          await client.invoke(new Api.channels.JoinChannel({ channel: cleanU }));
        } catch (e) {}
        return cleanU;
      }
    }

    // ================= 5. AUTO POST VIEWS BOOSTER (SUPPORTS EXACT QUANTITY LIMIT) =================
    if (action === "boost_views") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Post Link!</b> Example: <code>https://t.me/channelname/123</code>" });
      }

      let boosted = 0;
      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                try {
                  await client.invoke(new Api.channels.JoinChannel({ channel: parsed.peer }));
                } catch (e) {}
                const peerEntity = await client.getInputEntity(parsed.peer);
                await client.invoke(
                  new Api.messages.GetMessagesViews({
                    peer: peerEntity,
                    id: [Number(parsed.msgId)],
                    increment: true
                  })
                );
                boosted++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8000
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   👀 <b>POST VIEWS BOOSTED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🔗 <b>Post:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "👁️ <b>Views Delivered:</b> <code>+" + boosted + " / " + targetAccounts.length + " Requested IDs</code>"
      });
    }

    // ================= 6. ALL 73+ EMOJI REACTIONS (SINGLE / MULTI-MIX / RANDOM + EXACT QUANTITY) =================
    if (action === "send_reaction") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Post Link!</b> Example: <code>https://t.me/channelname/123</code>" });
      }

      const reqEmoji = body.emoji || "🔥";
      const customEmojiList = Array.isArray(body.emojiList) && body.emojiList.length > 0 ? body.emojiList : null;
      let reacted = 0;
      let usedEmojisLog = [];

      await Promise.allSettled(
        targetAccounts.map(function (acc, idx) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                try {
                  await client.invoke(new Api.channels.JoinChannel({ channel: parsed.peer }));
                } catch (e) {}

                const peerEntity = await client.getInputEntity(parsed.peer);
                let useEmoji = "🔥";

                if (reqEmoji === "RANDOM") {
                  const randomIndex = Math.floor(Math.random() * ALL_TELEGRAM_REACTIONS.length);
                  useEmoji = ALL_TELEGRAM_REACTIONS[randomIndex];
                } else if (customEmojiList && customEmojiList.length > 0) {
                  useEmoji = customEmojiList[idx % customEmojiList.length];
                } else {
                  useEmoji = reqEmoji;
                }

                try {
                  await client.invoke(
                    new Api.messages.SendReaction({
                      peer: peerEntity,
                      msgId: Number(parsed.msgId),
                      reaction: [new Api.ReactionEmoji({ emoticon: useEmoji })]
                    })
                  );
                } catch (reactErr) {
                  // If channel restricts rare emojis, fallback to classic ❤️ or 👍 or 🔥
                  const safeFallbacks = ["🔥", "❤️", "👍", "🎉", "👏"];
                  useEmoji = safeFallbacks[idx % safeFallbacks.length];
                  await client.invoke(
                    new Api.messages.SendReaction({
                      peer: peerEntity,
                      msgId: Number(parsed.msgId),
                      reaction: [new Api.ReactionEmoji({ emoticon: useEmoji })]
                    })
                  );
                }

                usedEmojisLog.push(useEmoji);
                reacted++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8500
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   ❤️ <b>EMOJI REACTIONS SENT!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🔗 <b>Post:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "✨ <b>Reactions Used:</b> " + (usedEmojisLog.join(" ") || reqEmoji) + "\n" +
          "🟢 <b>Reacted Accounts:</b> <code>" + reacted + " / " + targetAccounts.length + " Requested IDs</code>"
      });
    }

    // ================= 6B. CHANNEL POST INLINE BUTTON SCANNER & CLICKER =================
    if (action === "inspect_post_buttons") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Channel Post Link!</b> Example: <code>https://t.me/channelname/123</code>" });
      }

      const scannerAcc = targetAccounts[0];
      const client = await connectAccountClient(scannerAcc);
      try {
        try {
          await client.invoke(new Api.channels.JoinChannel({ channel: parsed.peer }));
        } catch (e) {}
        const peerEntity = await client.getInputEntity(parsed.peer);
        const msgs = await client.getMessages(peerEntity, { ids: [Number(parsed.msgId)] });
        if (!msgs || !msgs[0]) {
          return res.status(200).json({ reply: "❌ <b>Post not found!</b> Make sure the channel/post link is valid." });
        }
        const btns = extractInlineButtonsFromMessage(msgs[0]);
        if (btns.length === 0) {
          return res.status(200).json({ reply: "📭 <b>No Inline Buttons found on this post!</b>" });
        }

        let report = "🔍 <b>INLINE BUTTONS FOUND ON POST (" + btns.length + " Buttons):</b>\n\n";
        for (let i = 0; i < btns.length; i++) {
          const b = btns[i];
          const isLastTag = i === btns.length - 1 ? " 👈 <b>[LAST BUTTON]</b>" : "";
          report +=
            "<b>[" + b.index + "] " + b.text + "</b> (" + b.type + ")" + isLastTag + "\n" +
            (b.url ? " ┗ 🔗 <code>" + b.url + "</code>\n" : "");
        }
        return res.status(200).json({ reply: report });
      } finally {
        await safeDisconnect(client);
      }
    }

    if (action === "click_post_button") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Channel Post Link!</b> Example: <code>https://t.me/channelname/123</code>" });
      }

      const btnTarget = String(body.buttonTarget || "LAST").trim().toUpperCase();
      let clickedCount = 0;
      let clickedBtnLabel = "";
      let actionDetails = [];

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                try {
                  await client.invoke(new Api.channels.JoinChannel({ channel: parsed.peer }));
                } catch (e) {}

                const peerEntity = await client.getInputEntity(parsed.peer);
                const msgs = await client.getMessages(peerEntity, { ids: [Number(parsed.msgId)] });
                if (!msgs || !msgs[0]) throw new Error("Post not found");

                const btns = extractInlineButtonsFromMessage(msgs[0]);
                if (btns.length === 0) throw new Error("No inline buttons on post");

                let chosenBtn = btns[btns.length - 1]; // Default: LAST button
                if (btnTarget === "FIRST") {
                  chosenBtn = btns[0];
                } else if (btnTarget === "ALL_MINIAPPS") {
                  const foundMa = btns.find(function (b) {
                    return b.type === "MINI_APP_WEBVIEW" || b.type === "MINI_APP_LINK" || b.url;
                  });
                  chosenBtn = foundMa || btns[btns.length - 1];
                } else if (!isNaN(parseInt(btnTarget, 10))) {
                  const idx = Math.max(0, Math.min(btns.length - 1, parseInt(btnTarget, 10) - 1));
                  chosenBtn = btns[idx];
                }

                clickedBtnLabel = chosenBtn.text;
                const resInfo = await executeInlineButtonOrMiniApp(client, peerEntity, parsed.msgId, chosenBtn, null, "");
                actionDetails.push("🟢 <b>" + (acc.name || acc.phone) + ":</b> " + resInfo);
                clickedCount++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            9000
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   🔘 <b>POST INLINE BUTTON CLICKED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🔗 <b>Post:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "👆 <b>Button Pressed:</b> <code>" + (clickedBtnLabel || btnTarget) + "</code>\n" +
          "🟢 <b>Clicked By:</b> <code>" + clickedCount + " / " + targetAccounts.length + " Requested IDs</code>\n\n" +
          actionDetails.slice(0, 8).join("\n")
      });
    }

    // ================= 6C. BOT MINI-APP OPENER & LAST INLINE BUTTON AUTO-CLICKER =================
    if (action === "bot_miniapp_opener") {
      const rawBotInput = String(body.botInput || "").trim();
      const buttonMode = String(body.buttonMode || "LAST").toUpperCase();
      const targetPhone = body.targetPhone;

      // Determine which accounts to use (Specific ID or Selected IDs) + apply limitCount
      let basePool =
        targetPhone && targetPhone !== "SELECTED"
          ? allAccounts.filter(function (a) {
              return a.phone === targetPhone;
            })
          : filterTargetAccounts(allAccounts, selectedPhones, limitCount);

      const numLimit = parseInt(String(limitCount || "").trim(), 10);
      if (!isNaN(numLimit) && numLimit > 0 && numLimit < basePool.length) {
        basePool = basePool.slice(0, numLimit);
      }

      if (basePool.length === 0) {
        return res.status(200).json({ reply: "⚠️ <b>No Accounts Selected for Mini-App Opener!</b>" });
      }

      // Check if user pasted a Channel Post link directly in the Mini-App box
      const asPostLink = parseTelegramPostLink(rawBotInput);
      const parsedBot = parseBotAndMiniAppInput(rawBotInput, body.startParam);

      let openedCount = 0;
      let logs = [];

      await Promise.allSettled(
        basePool.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                // CASE 1: User pasted a Channel/Group Post Link -> Click its Last Button & Open Mini-App
                if (asPostLink) {
                  try {
                    await client.invoke(new Api.channels.JoinChannel({ channel: asPostLink.peer }));
                  } catch (e) {}
                  const peerEntity = await client.getInputEntity(asPostLink.peer);
                  const msgs = await client.getMessages(peerEntity, { ids: [Number(asPostLink.msgId)] });
                  if (msgs && msgs[0]) {
                    const btns = extractInlineButtonsFromMessage(msgs[0]);
                    if (btns.length > 0) {
                      const targetBtn = buttonMode === "FIRST" ? btns[0] : btns[btns.length - 1];
                      const info = await executeInlineButtonOrMiniApp(client, peerEntity, asPostLink.msgId, targetBtn, null, "");
                      logs.push("🟢 <b>" + (acc.name || acc.phone) + ":</b> " + info);
                      openedCount++;
                      return;
                    }
                  }
                }

                // CASE 2: User pasted a Bot Link / Mini-App Link / @BotUsername
                if (!parsedBot.botUser) throw new Error("Invalid Bot/Mini-App Link");
                const botEntity = await client.getInputEntity(parsedBot.botUser);
                let stepNotes = [];

                // Step A: If it is a direct Mini-App link (t.me/Bot/app?startapp=...) or MINIAPP_ONLY mode, open Mini-App immediately
                if (parsedBot.appShortName && Api.messages.RequestAppWebView && Api.InputBotAppShortName) {
                  try {
                    await client.invoke(
                      new Api.messages.RequestAppWebView({
                        peer: botEntity,
                        app: new Api.InputBotAppShortName({
                          botId: botEntity,
                          shortName: parsedBot.appShortName
                        }),
                        startParam: parsedBot.startParam || undefined,
                        platform: "android",
                        writeAllowed: true
                      })
                    );
                    stepNotes.push("🎮 Mini-App Opened (@" + parsedBot.botUser + "/" + parsedBot.appShortName + ")");
                  } catch (e) {}
                }

                // Step B: Send /start (or StartBot with referral payload) so the bot sends its inline buttons / Mini-App menu
                try {
                  if (parsedBot.startParam) {
                    await client.invoke(
                      new Api.messages.StartBot({
                        bot: botEntity,
                        peer: botEntity,
                        startParam: String(parsedBot.startParam),
                        randomId: BigInt(Math.floor(Math.random() * 1000000000000))
                      })
                    );
                  } else {
                    await client.sendMessage(botEntity, { message: "/start" });
                  }
                } catch (startErr) {}

                // Wait 1.2s for bot reply with inline buttons
                await new Promise(function (r) {
                  setTimeout(r, 1200);
                });

                // Step C: Fetch latest bot messages and inspect inline buttons
                const botMsgs = await client.getMessages(botEntity, { limit: 4 });
                let clickedButtonInfo = "";

                if (botMsgs && botMsgs.length > 0) {
                  for (let m = 0; m < botMsgs.length; m++) {
                    const btns = extractInlineButtonsFromMessage(botMsgs[m]);
                    if (btns.length > 0) {
                      if (buttonMode === "ALL_BUTTONS") {
                        for (let bIdx = 0; bIdx < btns.length; bIdx++) {
                          try {
                            const inf = await executeInlineButtonOrMiniApp(client, botEntity, botMsgs[m].id, btns[bIdx], botEntity, parsedBot.startParam);
                            clickedButtonInfo = inf;
                          } catch (e) {}
                        }
                      } else {
                        // Pick LAST button (or FIRST if selected)
                        const chosenBtn = buttonMode === "FIRST" ? btns[0] : btns[btns.length - 1];
                        clickedButtonInfo = await executeInlineButtonOrMiniApp(
                          client,
                          botEntity,
                          botMsgs[m].id,
                          chosenBtn,
                          botEntity,
                          parsedBot.startParam
                        );
                      }
                      break;
                    }
                  }
                }

                if (clickedButtonInfo) {
                  stepNotes.push(clickedButtonInfo);
                }

                // Step D: Also trigger Main WebView / Bot Menu WebView if not already opened
                if (stepNotes.length === 0 || buttonMode === "MINIAPP_ONLY") {
                  try {
                    if (Api.messages.RequestMainWebView) {
                      await client.invoke(
                        new Api.messages.RequestMainWebView({
                          peer: botEntity,
                          bot: botEntity,
                          startParam: parsedBot.startParam || undefined,
                          platform: "android"
                        })
                      );
                      stepNotes.push("🎮 Main Mini-App Opened");
                    } else {
                      await client.invoke(
                        new Api.messages.RequestWebView({
                          peer: botEntity,
                          bot: botEntity,
                          fromBotMenu: true,
                          startParam: parsedBot.startParam || undefined,
                          platform: "android"
                        })
                      );
                      stepNotes.push("🎮 Bot Menu Mini-App Opened");
                    }
                  } catch (e) {
                    if (stepNotes.length === 0) {
                      stepNotes.push("🤖 Bot Started (/start)");
                    }
                  }
                }

                logs.push("🟢 <b>" + (acc.name || acc.phone) + ":</b> " + stepNotes.join(" + "));
                openedCount++;
              } catch (err) {
                logs.push("🔴 <b>" + (acc.name || acc.phone) + ":</b> " + (err.message || "Failed"));
              } finally {
                await safeDisconnect(client);
              }
            })(),
            9500
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   🎮 <b>MINI-APP &amp; LAST BUTTON EXECUTED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🤖 <b>Target:</b> <code>" + rawBotInput + "</code>\n" +
          "🎯 <b>Button Mode:</b> <code>" + buttonMode + "</code>\n" +
          "🟢 <b>Completed By:</b> <code>" + openedCount + " / " + basePool.length + " Requested IDs</code>\n\n" +
          logs.slice(0, 10).join("\n")
      });
    }

    // ================= 7. AUTO CHANNEL COMMENTER =================
    if (action === "post_comments") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Post Link!</b> Example: <code>https://t.me/channelname/123</code>" });
      }

      const commentLines = String(body.comments || "")
        .split(/\r?\n|\|/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);

      if (commentLines.length === 0) {
        return res.status(200).json({ reply: "⚠️ <b>Please enter at least 1 comment!</b>" });
      }

      let commented = 0;
      await Promise.allSettled(
        targetAccounts.map(function (acc, idx) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                const peerEntity = await client.getInputEntity(parsed.peer);
                const textToPost = commentLines[idx % commentLines.length];

                try {
                  const disc = await client.invoke(
                    new Api.messages.GetDiscussionMessage({
                      peer: peerEntity,
                      msgId: Number(parsed.msgId)
                    })
                  );
                  if (disc && disc.messages && disc.messages[0]) {
                    const topMsg = disc.messages[0];
                    await client.sendMessage(topMsg.peerId, {
                      message: textToPost,
                      replyTo: topMsg.id
                    });
                    commented++;
                    return;
                  }
                } catch (innerErr) {
                  await client.sendMessage(peerEntity, {
                    message: textToPost,
                    commentTo: Number(parsed.msgId)
                  });
                  commented++;
                }
              } finally {
                await safeDisconnect(client);
              }
            })(),
            9000
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   💬 <b>AUTO COMMENTS POSTED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🔗 <b>Target Post:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "🟢 <b>Comments Delivered:</b> <code>" + commented + " / " + targetAccounts.length + " Requested IDs</code>"
      });
    }

    // ================= 8. AUTO POLL VOTER =================
    if (action === "vote_poll") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Poll Post Link!</b>" });
      }

      const optIndex = Math.max(0, (parseInt(body.optionNumber, 10) || 1) - 1);
      let voted = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                const peerEntity = await client.getInputEntity(parsed.peer);
                const msgs = await client.getMessages(peerEntity, { ids: [Number(parsed.msgId)] });
                let optionBuffer = Buffer.from([String(optIndex).charCodeAt(0)]);

                if (
                  msgs &&
                  msgs[0] &&
                  msgs[0].media &&
                  msgs[0].media.poll &&
                  msgs[0].media.poll.answers &&
                  msgs[0].media.poll.answers[optIndex]
                ) {
                  optionBuffer = msgs[0].media.poll.answers[optIndex].option;
                }

                await client.invoke(
                  new Api.messages.SendVote({
                    peer: peerEntity,
                    msgId: Number(parsed.msgId),
                    options: [optionBuffer]
                  })
                );
                voted++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8500
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   📊 <b>POLL VOTES DELIVERED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🔗 <b>Poll Post:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "🎯 <b>Voted Option:</b> <code>Option #" + (optIndex + 1) + "</code>\n" +
          "🟢 <b>Total Votes Cast:</b> <code>" + voted + " / " + targetAccounts.length + " Requested IDs</code>"
      });
    }

    // ================= 9. SMM MEGA COMBO (JOIN + VIEWS + REACTION) =================
    if (action === "smm_combo") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Post Link!</b>" });
      }

      const customList = Array.isArray(body.emojiList) && body.emojiList.length > 0 ? body.emojiList : ALL_TELEGRAM_REACTIONS;
      let completed = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc, idx) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                try {
                  await client.invoke(new Api.channels.JoinChannel({ channel: parsed.peer }));
                } catch (e) {}

                const peerEntity = await client.getInputEntity(parsed.peer);
                await client.invoke(
                  new Api.messages.GetMessagesViews({
                    peer: peerEntity,
                    id: [Number(parsed.msgId)],
                    increment: true
                  })
                );
                const useEm = customList[idx % customList.length] || "🔥";
                try {
                  await client.invoke(
                    new Api.messages.SendReaction({
                      peer: peerEntity,
                      msgId: Number(parsed.msgId),
                      reaction: [new Api.ReactionEmoji({ emoticon: useEm })]
                    })
                  );
                } catch (e) {}
                completed++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            9000
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   🚀 <b>SMM MEGA COMBO EXECUTED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "📢 <b>Target:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "✅ <b>Actions:</b> <code>Auto-Join + View + Reaction</code>\n" +
          "🟢 <b>Completed By:</b> <code>" + completed + " / " + targetAccounts.length + " Requested IDs</code>"
      });
    }

    // ================= 10. AUTO BOT REFERRAL BOOSTER (/start) =================
    if (action === "bot_referral") {
      const parsedBot = parseBotAndMiniAppInput(body.botInput, body.startParam);
      if (!parsedBot.botUser) {
        return res.status(200).json({ reply: "❌ <b>Invalid Bot Link or @username!</b>" });
      }

      let startedCount = 0;
      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                const botEntity = await client.getInputEntity(parsedBot.botUser);
                if (parsedBot.startParam) {
                  await client.invoke(
                    new Api.messages.StartBot({
                      bot: botEntity,
                      peer: botEntity,
                      startParam: String(parsedBot.startParam),
                      randomId: BigInt(Math.floor(Math.random() * 1000000000000))
                    })
                  );
                } else {
                  await client.sendMessage(botEntity, { message: "/start" });
                }
                startedCount++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8500
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   🤖 <b>BOT REFERRAL /START DONE!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🤖 <b>Target Bot:</b> <code>@" + parsedBot.botUser + "</code>\n" +
          "🔗 <b>Referral Payload:</b> <code>" + (parsedBot.startParam || "Standard /start") + "</code>\n" +
          "🟢 <b>Triggered From:</b> <code>" + startedCount + " / " + targetAccounts.length + " Requested IDs</code>"
      });
    }

    // ================= 11. BLOCK / UNBLOCK BOT (ALL SELECTED IDs) =================
    if (action === "block_bot") {
      const cleanBot = String(body.botUsername || "")
        .replace("https://t.me/", "")
        .replace("@", "")
        .split("?")[0]
        .trim();
      const isUnblock = body.blockMode === "unblock";
      let doneCount = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                const peerEntity = await client.getInputEntity(cleanBot);
                if (isUnblock) {
                  await client.invoke(new Api.contacts.Unblock({ id: peerEntity }));
                } else {
                  await client.invoke(new Api.contacts.Block({ id: peerEntity }));
                  try {
                    await client.invoke(
                      new Api.messages.DeleteHistory({
                        peer: peerEntity,
                        maxId: 0,
                        revoke: true
                      })
                    );
                  } catch (e) {}
                }
                doneCount++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8000
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   " + (isUnblock ? "🟢 <b>BOT UNBLOCKED!</b>" : "🚫 <b>BOT BLOCKED & CLEANED!</b>") + "\n" +
          "╚════════════════════════════╝\n" +
          "🤖 <b>Target Bot:</b> <code>@" + cleanBot + "</code>\n" +
          "📊 <b>Processed IDs:</b> <code>" + doneCount + " / " + targetAccounts.length + " Accounts</code>"
      });
    }

    // ================= 12. LIVE OTP / LOGIN CODE READER (777000 - TRIPLE FALLBACK + REJOIN BUTTON) =================
    if (action === "read_otp") {
      const targetPhone = body.targetPhone;
      const scanPool =
        targetPhone && targetPhone !== "SELECTED"
          ? allAccounts.filter(function (a) {
              return a.phone === targetPhone;
            })
          : targetAccounts;

      let otpCards = [];

      await Promise.allSettled(
        scanPool.map(function (acc) {
          return withTimeout(
            (async function () {
              let client = null;
              try {
                client = await connectAccountClient(acc);

                const me = await client.getMe();
                if (!me) {
                  throw new Error("AUTH_KEY_UNREGISTERED");
                }

                let msgs = [];

                try {
                  const dialogs = await client.getDialogs({ limit: 20 });
                  for (let d = 0; d < dialogs.length; d++) {
                    const dlg = dialogs[d];
                    if (
                      (dlg.id && String(dlg.id) === "777000") ||
                      (dlg.entity && dlg.entity.id && String(dlg.entity.id) === "777000")
                    ) {
                      msgs = await client.getMessages(dlg.inputEntity || dlg.entity, { limit: 5 });
                      break;
                    }
                  }
                } catch (e1) {}

                if (!msgs || msgs.length === 0) {
                  try {
                    msgs = await client.getMessages(777000, { limit: 5 });
                  } catch (e2) {}
                }

                if (!msgs || msgs.length === 0) {
                  try {
                    const historyRes = await client.invoke(
                      new Api.messages.GetHistory({
                        peer: new Api.InputPeerUser({
                          userId: BigInt(777000),
                          accessHash: BigInt(0)
                        }),
                        limit: 5
                      })
                    );
                    if (historyRes && historyRes.messages) {
                      msgs = historyRes.messages;
                    }
                  } catch (e3) {}
                }

                let foundCode = "No recent OTP";
                let latestText = "Account is ACTIVE (🟢), but no recent login code message from 777000 was found.";
                let msgDate = "";

                if (msgs && msgs.length > 0) {
                  for (let m = 0; m < msgs.length; m++) {
                    const txt = String(msgs[m].message || "");
                    const codeMatch = txt.match(/\b(\d{5,6})\b/);
                    if (codeMatch) {
                      foundCode = codeMatch[1];
                      latestText = txt;
                      msgDate = msgs[m].date
                        ? new Date(msgs[m].date * 1000).toLocaleTimeString()
                        : "";
                      break;
                    }
                  }
                  if (foundCode === "No recent OTP" && msgs[0] && msgs[0].message) {
                    latestText = String(msgs[0].message);
                  }
                }

                otpCards.push(
                  "🟢 <b>" + (acc.name || "Account") + " (<code>" + acc.phone + "</code>)</b> " + (msgDate ? "[" + msgDate + "]" : "[ONLINE]") + "\n" +
                  "🔢 <b>API_ID:</b> <code>" + (acc.apiId || "Saved") + "</code>\n" +
                  "🔑 <b>EXTRACTED OTP CODE:</b> <span style='color:#10b981;font-size:19px;font-weight:900;'>" + foundCode + "</span>\n" +
                  "📩 <i>" + latestText.replace(/</g, "&lt;").substring(0, 240) + "</i>"
                );
              } catch (accErr) {
                const errStr = String(accErr.message || "Session Error");
                otpCards.push(
                  "🔴 <b>" + (acc.name || "Account") + " (<code>" + acc.phone + "</code>) — SESSION LOGGED OUT!</b>\n" +
                  "⚠️ <b>Reason:</b> <code>" + errStr + "</code>\n" +
                  "🔢 <b>Saved API_ID:</b> <code>" + (acc.apiId || "None") + "</code>\n" +
                  "🔑 <b>Saved API_HASH:</b> <code>" + (acc.apiHash || "None") + "</code>\n" +
                  "<button type='button' class='action-btn btn-emerald btn-mini' style='margin-top:8px;' onclick='window.triggerAccountRejoin(\"" + acc.phone + "\")'>🔄 REJOIN / RE-LOGIN THIS ID NOW</button>"
                );
              } finally {
                await safeDisconnect(client);
              }
            })(),
            9000
          ).catch(function () {
            otpCards.push(
              "⚠️ <b>" + (acc.name || "Account") + " (<code>" + acc.phone + "</code>) — CONNECTION TIMEOUT</b>\n" +
              "🔢 <b>API_ID:</b> <code>" + (acc.apiId || "Saved") + "</code>\n" +
              "<button type='button' class='action-btn btn-gold btn-mini' style='margin-top:8px;' onclick='window.triggerAccountRejoin(\"" + acc.phone + "\")'>🔄 REJOIN / RE-LOGIN THIS ID</button>"
            );
          });
        })
      );

      const finalOtpHtml = otpCards.length
        ? otpCards.join("\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n")
        : "⚠️ No accounts selected.";

      return res.status(200).json({
        otpHtml: finalOtpHtml,
        reply: "📩 <b>LIVE OTP SCAN COMPLETED FOR " + scanPool.length + " ACCOUNT(S)!</b>\n\n" + finalOtpHtml
      });
    }

    // ================= 13. ALWAYS ONLINE STATUS (ON / OFF) =================
    if (action === "set_online") {
      const goOnline = Boolean(body.online);
      let updated = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                await client.invoke(
                  new Api.account.UpdateStatus({
                    offline: !goOnline
                  })
                );
                updated++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            7500
          );
        })
      );

      return res.status(200).json({
        reply:
          (goOnline ? "🟢 <b>ONLINE STATUS ACTIVATED</b>" : "🔴 <b>OFFLINE STATUS SET</b>") +
          " across <code>" + updated + " / " + targetAccounts.length + " Selected IDs</code>!"
      });
    }

    // ================= 14. GROUP AUTO POSTER (AD SPAMMER) =================
    if (action === "group_poster") {
      const groupList = String(body.groups || "")
        .split(/\r?\n|,/)
        .map(function (g) {
          return g.trim();
        })
        .filter(Boolean);
      const adMessage = String(body.messageText || "").trim();

      if (groupList.length === 0 || !adMessage) {
        return res.status(200).json({ reply: "⚠️ <b>Enter both Group Links and Ad Message!</b>" });
      }

      let sentMessages = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                for (let g = 0; g < groupList.length; g++) {
                  try {
                    const resolvedPeer = await joinPeerIfNeeded(client, groupList[g]);
                    await client.sendMessage(resolvedPeer, { message: adMessage });
                    sentMessages++;
                  } catch (innerErr) {}
                }
              } finally {
                await safeDisconnect(client);
              }
            })(),
            9500
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   📢 <b>GROUP AD BROADCAST DONE!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🎯 <b>Target Groups:</b> <code>" + groupList.length + " Groups</code>\n" +
          "📱 <b>Selected Accounts:</b> <code>" + targetAccounts.length + " IDs</code>\n" +
          "🟢 <b>Total Ad Posts Sent:</b> <code>" + sentMessages + " Messages</code>"
      });
    }

    // ================= 15. BULK DM / AUTO MESSAGE SENDER =================
    if (action === "bulk_dm") {
      const recipientList = String(body.targets || "")
        .split(/\r?\n|,/)
        .map(function (u) {
          return u.trim();
        })
        .filter(Boolean);
      const dmText = String(body.messageText || "").trim();
      const dmMode = body.dmMode || "round_robin";

      if (recipientList.length === 0 || !dmText) {
        return res.status(200).json({ reply: "⚠️ <b>Enter Target Recipients and DM Message!</b>" });
      }

      let dmSent = 0;
      let dmFailed = 0;

      if (dmMode === "all_to_all") {
        await Promise.allSettled(
          targetAccounts.map(function (acc) {
            return withTimeout(
              (async function () {
                const client = await connectAccountClient(acc);
                try {
                  for (let r = 0; r < recipientList.length; r++) {
                    try {
                      await client.sendMessage(recipientList[r], { message: dmText });
                      dmSent++;
                    } catch (e) {
                      dmFailed++;
                    }
                  }
                } finally {
                  await safeDisconnect(client);
                }
              })(),
              9500
            );
          })
        );
      } else {
        await Promise.allSettled(
          targetAccounts.map(function (acc, accIdx) {
            return withTimeout(
              (async function () {
                const myTargets = recipientList.filter(function (_, rIdx) {
                  return rIdx % targetAccounts.length === accIdx;
                });
                if (myTargets.length === 0) return;

                const client = await connectAccountClient(acc);
                try {
                  for (let r = 0; r < myTargets.length; r++) {
                    try {
                      await client.sendMessage(myTargets[r], { message: dmText });
                      dmSent++;
                    } catch (e) {
                      dmFailed++;
                    }
                  }
                } finally {
                  await safeDisconnect(client);
                }
              })(),
              9500
            );
          })
        );
      }

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   📩 <b>BULK DM CAMPAIGN COMPLETED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "👥 <b>Target Users:</b> <code>" + recipientList.length + "</code>\n" +
          "🟢 <b>DMs Delivered:</b> <code>" + dmSent + " Messages</code>\n" +
          "🔴 <b>Failed / Privacy Restricted:</b> <code>" + dmFailed + "</code>"
      });
    }

    // ================= 16. AUTO JOIN CHANNEL (SELECTED IDs + QUANTITY LIMIT) =================
    if (action === "join") {
      const channelInput = String(input || "").trim();
      let title = channelInput;
      let targetId = channelInput;
      let successCount = 0;
      let failCount = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                if (channelInput.indexOf("+") !== -1 || channelInput.indexOf("joinchat/") !== -1) {
                  let hash = channelInput.split("+").pop().split("joinchat/").pop().replace("/", "").trim();
                  const result = await client.invoke(new Api.messages.ImportChatInvite({ hash: hash }));
                  if (result.chats && result.chats[0]) {
                    title = result.chats[0].title;
                    targetId = "-100" + result.chats[0].id.toString();
                  }
                } else {
                  let cleanUsername = channelInput.replace("https://t.me/", "").replace("@", "").split("/")[0].trim();
                  const result = await client.invoke(new Api.channels.JoinChannel({ channel: cleanUsername }));
                  if (result.chats && result.chats[0]) {
                    title = result.chats[0].title;
                    targetId = result.chats[0].username ? "@" + result.chats[0].username : "-100" + result.chats[0].id.toString();
                  }
                }
                successCount++;
              } catch (e) {
                if (e.message && e.message.indexOf("USER_ALREADY_PARTICIPANT") !== -1) {
                  successCount++;
                } else {
                  failCount++;
                }
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8500
          );
        })
      );

      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let found = false;
      for (let i = 0; i < channels.length; i++) {
        if (channels[i].input === channelInput || channels[i].targetId === targetId) {
          channels[i].status = "🟢 JOINED (" + successCount + "/" + targetAccounts.length + " IDs)";
          channels[i].title = title;
          found = true;
          break;
        }
      }

      if (!found) {
        channels.push({
          title: title,
          input: channelInput,
          targetId: targetId,
          status: "🟢 JOINED (" + successCount + "/" + targetAccounts.length + " IDs)",
          date: new Date().toLocaleDateString("en-IN")
        });
      }

      await fbSet("panel/channels", channels);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔════════════════════════════╗\n" +
          "   📥 <b>MULTI-ID AUTO JOIN DONE!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "📢 <b>Channel Name:</b> " + title + "\n" +
          "🔗 <b>Channel Link:</b> <code>" + channelInput + "</code>\n" +
          "🟢 <b>Joined Accounts:</b> <code>" + successCount + " / " + targetAccounts.length + " Requested IDs</code>\n" +
          "🔴 <b>Failed Accounts:</b> <code>" + failCount + " IDs</code>"
      });
    }

    // ================= 17. LEAVE MENU & AUTO LEAVE CHANNEL =================
    if (action === "leave_menu") {
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);
      if (channels.length === 0) return res.status(200).json({ nextStep: "", reply: "📭 <b>No Channels Found!</b>" });

      let msg = "📤 <b>SELECT CHANNEL TO LEAVE</b>\n\n";
      for (let i = 0; i < channels.length; i++) {
        msg += "<b>[" + (i + 1) + "] " + channels[i].title + "</b> (<code>" + channels[i].input + "</code>)\n";
      }
      msg += "\n👇 Send the Channel Number to leave:";
      return res.status(200).json({ nextStep: "wait_leave", reply: msg });
    }

    if (action === "leave") {
      const index = parseInt(String(input || "").trim(), 10) - 1;
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (isNaN(index) || !channels[index]) {
        return res.status(200).json({ nextStep: "", reply: "❌ <b>Invalid Channel Number!</b>" });
      }

      const targetChannel = channels[index];
      let leftCount = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                let cleanTarget = targetChannel.targetId.replace("https://t.me/", "").trim();
                await client.invoke(new Api.channels.LeaveChannel({ channel: cleanTarget }));
                leftCount++;
              } finally {
                await safeDisconnect(client);
              }
            })(),
            8000
          );
        })
      );

      channels[index].status = "🔴 LEFT (" + leftCount + "/" + targetAccounts.length + " IDs)";
      await fbSet("panel/channels", channels);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔════════════════════════════╗\n" +
          "   📤 <b>MULTI-ID AUTO LEAVE DONE!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "📢 <b>Channel Name:</b> " + targetChannel.title + "\n" +
          "🔴 <b>Left Accounts:</b> <code>" + leftCount + " / " + targetAccounts.length + " IDs</code>"
      });
    }

    // ================= 18. CHANNEL LIST =================
    if (action === "list") {
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);
      if (channels.length === 0) return res.status(200).json({ nextStep: "", reply: "📭 <b>No channels tracked yet!</b>" });

      let msg = "📋 <b>REGISTERED CHANNELS & STATUS</b>\n\n";
      for (let i = 0; i < channels.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + channels[i].title + "</b>\n" +
          " ┣ 🔗 <code>" + channels[i].input + "</code>\n" +
          " ┗ 📌 <b>" + channels[i].status + "</b>\n\n";
      }
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    return res.status(200).json({ nextStep: "", reply: "⚠️ Unknown Action." });
  } catch (err) {
    return res.status(200).json({
      nextStep: "",
      reply:
        "╔════════════════════════════╗\n" +
        "   ❌ <b>TELEGRAM EXECUTION ERROR</b>\n" +
        "╚════════════════════════════╝\n\n" +
        "🔍 <b>Details:</b> <code>" + (err.message || "Execution Failed") + "</code>"
    });
  }
};
