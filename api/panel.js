const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const PasswordHelper = require("telegram/Password");

// ============================================================================
// 1. CONFIGURATION & FIREBASE REALTIME DATABASE REST ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";

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

function fastDisconnect(client) {
  try {
    if (client) {
      client.destroy().catch(function () {});
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
  if (slashParts.length >= 2 && !isNaN(parseInt(slashParts[1], 10))) {
    return {
      peer: slashParts[0],
      msgId: parseInt(slashParts[1], 10)
    };
  }
  return null;
}

// Parses https://t.me/BotName?start=PARAM or @BotName
function parseBotReferralInput(rawInput, explicitParam) {
  const str = String(rawInput || "").trim();
  let botUser = str;
  let startParam = String(explicitParam || "").trim();

  if (str.indexOf("t.me/") !== -1) {
    const afterTme = str.split("t.me/")[1];
    const qParts = afterTme.split("?");
    botUser = qParts[0].replace("/", "").trim();
    if (qParts[1]) {
      const urlParams = new URLSearchParams(qParts[1]);
      if (urlParams.get("start")) startParam = urlParams.get("start");
      else if (urlParams.get("startapp")) startParam = urlParams.get("startapp");
    }
  } else if (str.indexOf(" ") !== -1 && !startParam) {
    const sp = str.split(/\s+/);
    botUser = sp[0];
    startParam = sp[1] || "";
  }

  botUser = botUser.replace("@", "").trim();
  return { botUser: botUser, startParam: startParam };
}

// Filter accounts based on UI checkboxes
function filterTargetAccounts(allAccounts, selectedPhones) {
  if (!Array.isArray(selectedPhones) || selectedPhones.length === 0) {
    return allAccounts;
  }
  if (selectedPhones.indexOf("ALL") !== -1) {
    return allAccounts;
  }
  return allAccounts.filter(function (acc) {
    return selectedPhones.indexOf(acc.phone) !== -1;
  });
}

// ============================================================================
// 3. MASTER QUANTUM WEB CONTROL PANEL UI (String.raw = ZERO ESCAPE BUGS)
// ============================================================================
function renderMasterWebPanel() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>👑 KUMAR QUANTUM SMM & MULTI-ID AUTOMATION SUITE 👑</title>
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
       1. SECURITY VAULT LOCK SCREEN (PIN: 252010)
       ======================================================================== */
    #vault-overlay {
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

    #vault-overlay.vault-open {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .vault-container {
      width: 100%;
      max-width: 420px;
      background: rgba(16, 8, 36, 0.96);
      border: 2px solid var(--border-strong);
      border-radius: 28px;
      padding: 26px 20px;
      box-shadow: 0 0 65px var(--accent-glow), inset 0 0 30px rgba(245, 158, 11, 0.08);
      text-align: center;
      position: relative;
      overflow: hidden;
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
      font-size: 23px;
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
      max-width: 1240px;
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
       GLASS PANELS, INPUTS & BUTTONS
       ======================================================================== */
    .two-col-layout {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .three-col-layout {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
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

    .emoji-picker-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .emoji-btn {
      background: var(--bg-input);
      border: 1px solid var(--border-glass);
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 18px;
      cursor: pointer;
      transition: 0.15s;
    }

    .emoji-btn.active-emoji, .emoji-btn:hover {
      border-color: var(--accent-main);
      background: rgba(245, 158, 11, 0.2);
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
      line-height: 1.6;
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
       2. MAIN ROYAL COMMAND CENTER DASHBOARD
       ====================================================================== -->
  <div class="master-shell">
    <!-- TOP HEADER -->
    <header class="royal-header">
      <div class="royal-brand">
        <div class="royal-emblem">👑</div>
        <div class="royal-title-block">
          <h1>TELEGRAM MASTER SMM & AUTOMATION SUITE</h1>
          <p>11+ IDs • Auto Join/Leave • Views • Reactions • Comments • Polls • Referrals • OTP Reader • Bulk DM</p>
        </div>
      </div>
      <div class="header-actions">
        <select class="theme-pill" id="theme-switcher">
          <option value="">👑 ROYAL GOLD & PLASMA</option>
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
        <div class="metric-foot">🟢 Dedicated API_ID Engine</div>
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
        <div class="metric-foot" id="metric-online-sub">🔄 Toggle in Tab 5</div>
      </div>
    </section>

    <!-- GLOBAL ACCOUNT SELECTOR BAR -->
    <div class="selector-bar">
      <div class="selector-top">
        <div class="selector-title">
          🎯 TARGET ACCOUNT SELECTOR (CLICK TO SELECT / DESELECT ACCOUNTS FOR ANY ACTION)
        </div>
        <div style="display: flex; gap: 8px;">
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
        🛒 1. SMM PANEL (VIEWS/REACT/POLL/COMMENT)
      </button>
      <button type="button" class="cmd-tab" data-target="pane-bots">
        🤖 2. BOT REFERRAL & BLOCK BOT
      </button>
      <button type="button" class="cmd-tab" data-target="pane-otp-online">
        📩 3. LIVE OTP READER & ONLINE
      </button>
      <button type="button" class="cmd-tab" data-target="pane-dm-group">
        📢 4. BULK DM & GROUP POSTER
      </button>
      <button type="button" class="cmd-tab" data-target="pane-channels">
        📥 5. CHANNEL JOIN / LEAVE
      </button>
      <button type="button" class="cmd-tab" data-target="pane-accounts">
        ➕ 6. ADD ID (API_ID & HASH)
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
      <div class="console-screen" id="console-box">👑 [QUANTUM SMM SUITE READY]: All 11+ Automation Modules Loaded! Select accounts above and launch any tool below.</div>
    </div>

    <!-- ====================================================================
         PANE 1: SMM PANEL SERVICE SUITE (VIEWS, REACTIONS, COMMENTS, POLLS, COMBO)
         ==================================================================== -->
    <div id="pane-smm" class="view-pane active-pane">
      <div class="helper-alert">
        🛒 <b>SMM PANEL SERVICE SUITE:</b> Boost any Telegram Channel or Group post using your selected accounts! Paste the Post Link (e.g. <code>https://t.me/channelname/123</code>) in any module below.
      </div>

      <div class="two-col-layout">
        <!-- MODULE A: AUTO POST VIEWS BOOSTER -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">👀 AUTO POST VIEWS BOOSTER</div>
            <span class="badge-chip">ALL SELECTED IDs</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>TELEGRAM POST LINK</label>
              <span>PUBLIC / PRIVATE</span>
            </div>
            <input
              type="text"
              id="inp-views-link"
              class="royal-input"
              placeholder="e.g. https://t.me/mychannel/105"
            />
          </div>
          <button type="button" class="action-btn btn-cyan" id="btn-boost-views">
            👀 BOOST POST VIEWS NOW (SELECTED IDs)
          </button>
          <p style="font-size: 11.5px; color: var(--text-dim);">
            ⚡ Increments the official eye counter (👁️) on the target post from every selected account.
          </p>
        </div>

        <!-- MODULE B: AUTO POST EMOJI REACTIONS -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">❤️ AUTO POST EMOJI REACTIONS</div>
            <span class="badge-chip">INSTANT REACTION</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>TELEGRAM POST LINK</label>
              <span>REQUIRED</span>
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
              <label>SELECT EMOJI REACTION (OR RANDOM MIX)</label>
              <span id="selected-emoji-label">🔥</span>
            </div>
            <div class="emoji-picker-row" id="emoji-picker">
              <button type="button" class="emoji-btn active-emoji" data-emoji="🔥">🔥</button>
              <button type="button" class="emoji-btn" data-emoji="❤️">❤️</button>
              <button type="button" class="emoji-btn" data-emoji="🎉">🎉</button>
              <button type="button" class="emoji-btn" data-emoji="👍">👍</button>
              <button type="button" class="emoji-btn" data-emoji="⚡">⚡</button>
              <button type="button" class="emoji-btn" data-emoji="💯">💯</button>
              <button type="button" class="emoji-btn" data-emoji="🤩">🤩</button>
              <button type="button" class="emoji-btn" data-emoji="👏">👏</button>
              <button type="button" class="emoji-btn" data-emoji="RANDOM">🎲 MIX</button>
            </div>
          </div>
          <button type="button" class="action-btn btn-royal-purple" id="btn-send-reactions">
            ❤️ SEND EMOJI REACTIONS (SELECTED IDs)
          </button>
        </div>
      </div>

      <div class="two-col-layout">
        <!-- MODULE C: AUTO CHANNEL COMMENTER -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">💬 AUTO CHANNEL COMMENTER</div>
            <span class="badge-chip">MULTI-COMMENT</span>
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
          <button type="button" class="action-btn btn-emerald" id="btn-post-comments">
            💬 AUTO POST COMMENTS ACROSS SELECTED IDs
          </button>
        </div>

        <!-- MODULE D: AUTO POLL VOTER & SMM COMBO -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📊 AUTO POLL VOTER</div>
            <span class="badge-chip">VOTE BOOSTER</span>
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
          <button type="button" class="action-btn btn-gold" id="btn-vote-poll">
            📊 AUTO VOTE POLL OPTION (SELECTED IDs)
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
          <button type="button" class="action-btn btn-royal-purple" id="btn-smm-combo">
            🚀 LAUNCH SMM MEGA COMBO (JOIN + VIEWS + 🔥 REACT)
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 2: AUTO BOT REFERRAL (/start) & BLOCK / UNBLOCK BOT
         ==================================================================== -->
    <div id="pane-bots" class="view-pane">
      <div class="two-col-layout">
        <!-- AUTO BOT REFERRAL BOOSTER -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🤖 AUTO BOT REFERRAL BOOSTER (/start)</div>
            <span class="badge-chip">SELECTED IDs</span>
          </div>
          <div class="helper-alert">
            🔗 Paste your full referral link (e.g. <code>https://t.me/EarningBot?start=123456</code>) OR enter the Bot <code>@username</code> and Referral Code separately. All selected accounts above will trigger <code>/start</code> with your referral payload!
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
          <button type="button" class="action-btn btn-emerald" id="btn-start-bot-ref">
            🤖 AUTO /START BOT FROM SELECTED ACCOUNTS
          </button>
        </div>

        <!-- BLOCK / UNBLOCK BOT (ALL IDs) -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🚫 BLOCK / UNBLOCK BOT (ALL SELECTED IDs)</div>
            <span class="badge-chip">ANTI-SPAM</span>
          </div>
          <div class="helper-alert" style="border-color: var(--danger);">
            🚫 Stop unwanted bots from spamming your accounts! Enter the Bot's <code>@username</code> below to instantly <b>Block & Delete Chat History</b> or <b>Unblock</b> across all selected accounts.
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>TARGET BOT @USERNAME</label>
              <span>*REQUIRED</span>
            </div>
            <input
              type="text"
              id="inp-block-bot-user"
              class="royal-input"
              placeholder="e.g. @SpammerBot"
            />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px;">
            <button type="button" class="action-btn btn-crimson" id="btn-block-bot">
              🚫 BLOCK & DELETE CHAT
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
            <span class="badge-chip">INSTANT OTP</span>
          </div>
          <div class="helper-alert">
            🔑 Select any connected Telegram account from the dropdown below (or choose <b>SCAN ALL SELECTED ACCOUNTS</b>) to read incoming Telegram login verification codes from <code>777000</code>!
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>SELECT ACCOUNT TO READ OTP</label>
              <span>DROPDOWN</span>
            </div>
            <select id="sel-otp-account" class="royal-select">
              <option value="SELECTED">🔍 SCAN ALL SELECTED ACCOUNTS</option>
            </select>
          </div>
          <button type="button" class="action-btn btn-gold" id="btn-read-otp">
            📩 FETCH LATEST LOGIN OTP CODE NOW
          </button>

          <div class="otp-highlight-box" id="otp-reader-result">
            📭 Select an account and click <b>FETCH LATEST LOGIN OTP CODE NOW</b> to view the 5-digit Telegram code here.
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
              <span>AUTO-JOINS & POSTS</span>
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
              <span>SUPPORTS TEXT & LINKS</span>
            </div>
            <textarea
              id="inp-group-ad-msg"
              class="royal-textarea"
              placeholder="🔥 Join our official channel for daily giveaways & tricks! 👉 @MyChannel"
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
            <span class="badge-chip">SELECTED IDs</span>
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
          <button type="button" class="action-btn btn-emerald" id="btn-join-channel">
            📥 AUTO JOIN CHANNEL (SELECTED IDs)
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
          <div class="panel-heading">📋 REGISTERED CHANNELS & 1-CLICK AUTO LEAVE</div>
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
         PANE 6: ADD TELEGRAM ID (PER-ACCOUNT API_ID + API_HASH + OTP + 2FA)
         ==================================================================== -->
    <div id="pane-accounts" class="view-pane">
      <div class="helper-alert">
        ⚡ <b>DEDICATED API_ID & API_HASH SYSTEM:</b> Enter each Telegram account's unique <code>API_ID</code>, <code>API_HASH</code>, and <code>Phone Number</code> below.
      </div>

      <div class="two-col-layout">
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">➕ ADD TELEGRAM ACCOUNT</div>
            <span class="badge-chip">STEP 1 & 2</span>
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
              <label>2. ACCOUNT APP API_HASH</label>
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
              placeholder="e.g. +919584967727"
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
            ✅ STEP 2: VERIFY OTP & CONNECT ID
          </button>
        </div>

        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">🔐 2FA CLOUD PASSWORD</div>
            <span class="badge-chip">100% FIXED</span>
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
            🔐 STEP 3: VERIFY 2FA & SAVE ACCOUNT
          </button>

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;" />

          <div class="panel-heading" style="font-size: 13px; margin-bottom: 10px;">
            📡 ACTIVE LOGIN SESSION TRACKER
          </div>
          <div
            id="active-session-banner"
            style="background: var(--bg-input); border: 1px solid var(--border-glass); border-radius: 14px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-secondary);"
          >
            No pending OTP session. Enter API_ID, API_HASH, and Phone on the left to start!
          </div>
        </div>
      </div>

      <div class="glass-panel">
        <div class="panel-top">
          <div class="panel-heading">📱 CONNECTED TELEGRAM ACCOUNTS (11+ IDs HUB)</div>
        </div>
        <div class="table-scroll">
          <table class="royal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>NAME</th>
                <th>USERNAME</th>
                <th>PHONE</th>
                <th>DEDICATED API_ID</th>
                <th>DEDICATED API_HASH</th>
                <th>ADDED ON</th>
                <th>ACTION</th>
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
    (function () {
      var MASTER_PIN_CODE = "252010";
      var enteredPin = "";
      var accountsList = [];
      var channelsList = [];
      var selectedPhones = [];
      var chosenEmoji = "🔥";
      var onlineHeartbeatTimer = null;
      var groupAdLoopTimer = null;

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
      // TABS, EMOJI PICKER, THEME & CLOCK
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

      var emojiBtns = document.querySelectorAll("#emoji-picker .emoji-btn");
      for (var eIdx = 0; eIdx < emojiBtns.length; eIdx++) {
        emojiBtns[eIdx].addEventListener("click", function () {
          for (var j = 0; j < emojiBtns.length; j++) {
            emojiBtns[j].classList.remove("active-emoji");
          }
          this.classList.add("active-emoji");
          chosenEmoji = this.getAttribute("data-emoji");
          document.getElementById("selected-emoji-label").textContent = chosenEmoji;
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
        if (!wrap) return;

        if (!accountsList.length) {
          wrap.innerHTML = '<span style="font-size:12px;color:#94a3b8;">📭 No accounts connected yet. Open Tab 6 (➕ ADD ID) to connect your accounts!</span>';
          document.getElementById("metric-selected").textContent = "0";
          return;
        }

        // Default select all if empty on first load
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

        for (var i = 0; i < accountsList.length; i++) {
          (function (idx, acc) {
            var isSel = selectedPhones.indexOf(acc.phone) !== -1;
            var chip = document.createElement("div");
            chip.className = "acc-chip" + (isSel ? " selected" : "");
            chip.innerHTML =
              '<span class="dot-ind"></span>' +
              "<span>#" + (idx + 1) + " " + (acc.name || "ID") + " (" + acc.phone.slice(-4) + ")</span>";
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
        writeConsole("⏳ <b>Executing [" + action.toUpperCase() + "] on " + (selectedPhones.length || "ALL") + " IDs...</b>");
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
            var maskedHash = acc.apiHash ? String(acc.apiHash).substring(0, 8) + "••••" : "Saved";
            tr.innerHTML =
              "<td><b>#" + (idx + 1) + "</b></td>" +
              "<td><b>" + (acc.name || "User") + "</b></td>" +
              "<td>@" + (acc.username || "None") + "</td>" +
              "<td><code>" + acc.phone + "</code></td>" +
              '<td><span class="api-tag">' + (acc.apiId || "Set") + "</span></td>" +
              "<td><code>" + maskedHash + "</code></td>" +
              "<td>" + (acc.addedOn || "Active") + "</td>" +
              "<td></td>";

            var btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.className = "action-btn btn-crimson btn-mini";
            btnDel.textContent = "🗑️ REMOVE";
            btnDel.addEventListener("click", function () {
              if (confirm("Remove account " + acc.phone + "?")) {
                sendApiRequest("remove_account", { input: acc.phone });
              }
            });
            tr.lastChild.appendChild(btnDel);
            tbody.appendChild(tr);
          })(i, accountsList[i]);
        }
      }

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
      // BIND ALL 11+ FEATURE BUTTONS
      // ====================================================================

      // 1. SMM: Boost Post Views
      document.getElementById("btn-boost-views").addEventListener("click", function () {
        var link = document.getElementById("inp-views-link").value.trim();
        if (!link) return toast("⚠️ Enter a valid Post Link!", "#f43f5e");
        sendApiRequest("boost_views", { postLink: link });
      });

      // 2. SMM: Auto Post Emoji Reactions
      document.getElementById("btn-send-reactions").addEventListener("click", function () {
        var link = document.getElementById("inp-react-link").value.trim();
        if (!link) return toast("⚠️ Enter a valid Post Link!", "#f43f5e");
        sendApiRequest("send_reaction", { postLink: link, emoji: chosenEmoji });
      });

      // 3. SMM: Auto Channel Commenter
      document.getElementById("btn-post-comments").addEventListener("click", function () {
        var link = document.getElementById("inp-comment-link").value.trim();
        var commentsRaw = document.getElementById("inp-comment-list").value.trim();
        if (!link || !commentsRaw) return toast("⚠️ Enter Post Link and Comments!", "#f43f5e");
        sendApiRequest("post_comments", { postLink: link, comments: commentsRaw });
      });

      // 4. SMM: Auto Poll Voter
      document.getElementById("btn-vote-poll").addEventListener("click", function () {
        var link = document.getElementById("inp-poll-link").value.trim();
        var optNum = document.getElementById("inp-poll-option").value.trim();
        if (!link) return toast("⚠️ Enter Poll Post Link!", "#f43f5e");
        sendApiRequest("vote_poll", { postLink: link, optionNumber: optNum });
      });

      // 5. SMM: 1-Click Mega Combo (Join + Views + Reaction)
      document.getElementById("btn-smm-combo").addEventListener("click", function () {
        var link = document.getElementById("inp-smm-combo-link").value.trim();
        if (!link) return toast("⚠️ Enter Post Link for SMM Combo!", "#f43f5e");
        sendApiRequest("smm_combo", { postLink: link, emoji: chosenEmoji });
      });

      // 6. Bot Referral Booster (/start)
      document.getElementById("btn-start-bot-ref").addEventListener("click", function () {
        var refLink = document.getElementById("inp-bot-ref-link").value.trim();
        var refParam = document.getElementById("inp-bot-ref-param").value.trim();
        if (!refLink) return toast("⚠️ Enter Bot Referral Link or @username!", "#f43f5e");
        sendApiRequest("bot_referral", { botInput: refLink, startParam: refParam });
      });

      // 7. Block / Unblock Bot
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

      // 8. Live OTP Reader (777000)
      document.getElementById("btn-read-otp").addEventListener("click", function () {
        var targetAcc = document.getElementById("sel-otp-account").value;
        document.getElementById("otp-reader-result").innerHTML = "⏳ <b>Scanning Telegram Service (777000) for login codes...</b>";
        sendApiRequest("read_otp", { targetPhone: targetAcc });
      });

      // 9. Always Online Status (ON / OFF + 24/7 Heartbeat Loop)
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

      // 10. Group Auto Poster (Ad Spammer) + Auto Loop Timer
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

      // 11. Bulk DM Sender
      document.getElementById("btn-send-bulk-dm").addEventListener("click", function () {
        var targets = document.getElementById("inp-dm-targets").value.trim();
        var dmText = document.getElementById("inp-dm-text").value.trim();
        var mode = document.getElementById("sel-dm-mode").value;
        if (!targets || !dmText) return toast("⚠️ Enter Target Usernames and Message!", "#f43f5e");
        sendApiRequest("bulk_dm", { targets: targets, messageText: dmText, dmMode: mode });
      });

      // 12. Channel Join / Leave & Account Add
      document.getElementById("btn-join-channel").addEventListener("click", function () {
        var chan = document.getElementById("inp-join-channel").value.trim();
        if (!chan) return toast("⚠️ Enter a Channel Link or @username!", "#f43f5e");
        sendApiRequest("join", { input: chan });
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
        if (!otp) return toast("⚠️ Enter the 5-digit OTP!", "#f43f5e");
        sendApiRequest("verify_code", { input: otp });
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
// 4. MAIN SERVERLESS API HANDLER (ALL 11+ AUTOMATION ENGINES + ZERO HANG)
// ============================================================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderMasterWebPanel());
  }

  const body = req.body || {};
  const { action, input, apiId, apiHash, webPin, selectedPhones } = body;

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

    // ================= 2. SEND OTP (PER-ACCOUNT API_ID & API_HASH) =================
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
        { connectionRetries: 2 }
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

      const tempSession = client.session.save();
      fastDisconnect(client);

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
          "📩 <b>OTP SENT TO:</b> <code>" + phone + "</code> (API_ID: <code>" + accApiId + "</code>)\n" +
          "👉 Enter the 5-digit OTP in Step 2!"
      });
    }

    // ================= 3. VERIFY OTP & SAVE ACCOUNT =================
    if (action === "verify_code") {
      const code = String(input || "").replace(/\D/g, "");
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({ nextStep: "", reply: "❌ <b>No Active OTP Session!</b>" });
      }

      const phone = tempAuth.phone;
      const accApiId = Number(tempAuth.apiId || defaultApiConfig.apiId);
      const accApiHash = String(tempAuth.apiHash || defaultApiConfig.apiHash);

      const client = new TelegramClient(
        new StringSession(tempAuth.tempSession),
        accApiId,
        accApiHash,
        { connectionRetries: 2 }
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
          const updatedSession = client.session.save();
          fastDisconnect(client);
          await fbSet("panel/auth_temp", {
            phone: phone,
            apiId: accApiId,
            apiHash: accApiHash,
            phoneCodeHash: tempAuth.phoneCodeHash,
            tempSession: updatedSession,
            time: Date.now()
          });

          return res.status(200).json({
            nextStep: "wait_2fa",
            pendingPhone: phone,
            pendingApiId: accApiId,
            reply: "🔐 <b>2FA PASSWORD REQUIRED FOR:</b> <code>" + phone + "</code>\n👉 Enter your 2FA Cloud Password in Step 3!"
          });
        }
        fastDisconnect(client);
        throw err;
      }

      const finalSession = client.session.save();
      const me = await client.getMe();
      fastDisconnect(client);

      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      let exists = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].phone === phone) {
          accounts[i].session = finalSession;
          accounts[i].apiId = accApiId;
          accounts[i].apiHash = accApiHash;
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

    // ================= 4. VERIFY 2FA PASSWORD =================
    if (action === "verify_2fa") {
      const password = String(input || "").trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({ nextStep: "", reply: "❌ <b>Session Expired!</b> Request OTP again." });
      }

      const phone = tempAuth.phone;
      const accApiId = Number(tempAuth.apiId || defaultApiConfig.apiId);
      const accApiHash = String(tempAuth.apiHash || defaultApiConfig.apiHash);

      const client = new TelegramClient(
        new StringSession(tempAuth.tempSession),
        accApiId,
        accApiHash,
        { connectionRetries: 2 }
      );

      await client.connect();
      await verifyTelegram2FAPassword(client, accApiId, accApiHash, password);

      const finalSession = client.session.save();
      const me = await client.getMe();
      fastDisconnect(client);

      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      let exists = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].phone === phone) {
          accounts[i].session = finalSession;
          accounts[i].apiId = accApiId;
          accounts[i].apiHash = accApiHash;
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

    // ================= LOAD ALL & TARGET ACCOUNTS =================
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
        msg += "<b>[" + (i + 1) + "] " + allAccounts[i].name + "</b> — <code>" + allAccounts[i].phone + "</code> (API: <code>" + (allAccounts[i].apiId || "Set") + "</code>)\n";
      }
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (allAccounts.length === 0) {
      return res.status(200).json({ nextStep: "", reply: "⚠️ <b>No Active Accounts!</b> Connect at least 1 Telegram ID first." });
    }

    const targetAccounts = filterTargetAccounts(allAccounts, selectedPhones);
    if (targetAccounts.length === 0) {
      return res.status(200).json({ nextStep: "", reply: "⚠️ <b>No Accounts Selected!</b> Select at least 1 account in the Target Selector Bar." });
    }

    // Helper to connect a single account with its dedicated API_ID/HASH
    async function connectAccountClient(acc) {
      const useApiId = Number(acc.apiId || defaultApiConfig.apiId);
      const useApiHash = String(acc.apiHash || defaultApiConfig.apiHash);
      const client = new TelegramClient(new StringSession(acc.session), useApiId, useApiHash, {
        connectionRetries: 1
      });
      await client.connect();
      return client;
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

    // ================= 5. AUTO POST VIEWS BOOSTER (ALL SELECTED IDs) =================
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
                fastDisconnect(client);
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
          "👁️ <b>Views Added:</b> <code>+" + boosted + " / " + targetAccounts.length + " IDs</code>"
      });
    }

    // ================= 6. AUTO POST EMOJI REACTIONS (ALL SELECTED IDs) =================
    if (action === "send_reaction") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Post Link!</b> Example: <code>https://t.me/channelname/123</code>" });
      }

      const emojiPool = ["🔥", "❤️", "🎉", "👍", "⚡", "💯", "🤩", "👏"];
      const reqEmoji = body.emoji || "🔥";
      let reacted = 0;

      await Promise.allSettled(
        targetAccounts.map(function (acc, idx) {
          return withTimeout(
            (async function () {
              const client = await connectAccountClient(acc);
              try {
                const peerEntity = await client.getInputEntity(parsed.peer);
                const useEmoji = reqEmoji === "RANDOM" ? emojiPool[idx % emojiPool.length] : reqEmoji;
                await client.invoke(
                  new Api.messages.SendReaction({
                    peer: peerEntity,
                    msgId: Number(parsed.msgId),
                    reaction: [new Api.ReactionEmoji({ emoticon: useEmoji })]
                  })
                );
                reacted++;
              } finally {
                fastDisconnect(client);
              }
            })(),
            8000
          );
        })
      );

      return res.status(200).json({
        reply:
          "╔════════════════════════════╗\n" +
          "   ❤️ <b>EMOJI REACTIONS SENT!</b>\n" +
          "╚════════════════════════════╝\n" +
          "🔗 <b>Post:</b> <code>" + parsed.peer + "/" + parsed.msgId + "</code>\n" +
          "✨ <b>Reaction:</b> " + reqEmoji + "\n" +
          "🟢 <b>Reacted Accounts:</b> <code>" + reacted + " / " + targetAccounts.length + " IDs</code>"
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
                fastDisconnect(client);
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
          "🟢 <b>Comments Delivered:</b> <code>" + commented + " / " + targetAccounts.length + " IDs</code>"
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
                fastDisconnect(client);
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
          "🟢 <b>Total Votes Cast:</b> <code>" + voted + " / " + targetAccounts.length + " IDs</code>"
      });
    }

    // ================= 9. SMM MEGA COMBO (JOIN + VIEWS + REACTION) =================
    if (action === "smm_combo") {
      const parsed = parseTelegramPostLink(body.postLink);
      if (!parsed) {
        return res.status(200).json({ reply: "❌ <b>Invalid Post Link!</b>" });
      }

      const emojiPool = ["🔥", "❤️", "🎉", "👍", "⚡", "💯"];
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
                await client.invoke(
                  new Api.messages.SendReaction({
                    peer: peerEntity,
                    msgId: Number(parsed.msgId),
                    reaction: [new Api.ReactionEmoji({ emoticon: emojiPool[idx % emojiPool.length] })]
                  })
                );
                completed++;
              } finally {
                fastDisconnect(client);
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
          "🟢 <b>Completed By:</b> <code>" + completed + " / " + targetAccounts.length + " IDs</code>"
      });
    }

    // ================= 10. AUTO BOT REFERRAL BOOSTER (/start) =================
    if (action === "bot_referral") {
      const parsedBot = parseBotReferralInput(body.botInput, body.startParam);
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
                fastDisconnect(client);
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
          "🟢 <b>Triggered From:</b> <code>" + startedCount + " / " + targetAccounts.length + " Selected IDs</code>"
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
                fastDisconnect(client);
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

    // ================= 12. LIVE OTP / LOGIN CODE READER (777000) =================
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
              const client = await connectAccountClient(acc);
              try {
                const msgs = await client.getMessages(777000, { limit: 3 });
                let foundCode = "No recent OTP";
                let latestText = "No service notifications found from 777000.";
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
                  if (foundCode === "No recent OTP" && msgs[0].message) {
                    latestText = String(msgs[0].message);
                  }
                }

                otpCards.push(
                  "📱 <b>" + (acc.name || "Account") + " (<code>" + acc.phone + "</code>)</b> " + (msgDate ? "[" + msgDate + "]" : "") + "\n" +
                  "🔑 <b>EXTRACTED OTP CODE:</b> <span style='color:#10b981;font-size:18px;font-weight:800;'>" + foundCode + "</span>\n" +
                  "📩 <i>" + latestText.replace(/</g, "&lt;").substring(0, 220) + "</i>"
                );
              } finally {
                fastDisconnect(client);
              }
            })(),
            8500
          );
        })
      );

      const finalOtpHtml = otpCards.length
        ? otpCards.join("\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n")
        : "⚠️ Could not read messages from selected account(s).";

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
                fastDisconnect(client);
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
                fastDisconnect(client);
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
                  fastDisconnect(client);
                }
              })(),
              9500
            );
          })
        );
      } else {
        // Smart Round-Robin distribution across selected accounts
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
                  fastDisconnect(client);
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

    // ================= 16. AUTO JOIN CHANNEL (SELECTED IDs) =================
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
                fastDisconnect(client);
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
          "🟢 <b>Joined Accounts:</b> <code>" + successCount + " / " + targetAccounts.length + " IDs</code>\n" +
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
                fastDisconnect(client);
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
