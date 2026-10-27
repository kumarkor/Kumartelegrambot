const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const PasswordHelper = require("telegram/Password");

// ============================================================================
// FIREBASE REALTIME DATABASE CONFIGURATION & REST ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";

async function fbGet(path) {
  try {
    const response = await fetch(DB_URL + "/" + path + ".json");
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (err) {
    return null;
  }
}

async function fbSet(path, data) {
  try {
    await fetch(DB_URL + "/" + path + ".json", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
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

// ============================================================================
// BULLETPROOF 2FA CLOUD PASSWORD VERIFIER
// ============================================================================
async function verifyTelegram2FAPassword(client, apiId, apiHash, password) {
  if (PasswordHelper && typeof PasswordHelper.computeCheck === "function") {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordSrp = await PasswordHelper.computeCheck(passwordInfo, password);
    await client.invoke(
      new Api.auth.CheckPassword({
        password: passwordSrp
      })
    );
    return true;
  }

  if (PasswordHelper && typeof PasswordHelper.computeCheckPassword === "function") {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordSrp = await PasswordHelper.computeCheckPassword(passwordInfo, password);
    await client.invoke(
      new Api.auth.CheckPassword({
        password: passwordSrp
      })
    );
    return true;
  }

  if (typeof client.signInWithPassword === "function") {
    await client.signInWithPassword(
      {
        apiId: Number(apiId),
        apiHash: String(apiHash)
      },
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

  throw new Error("2FA verification module unavailable on server.");
}

// ============================================================================
// SUPER STYLISH ROYAL QUANTUM COMMAND CENTER UI (USING String.raw FOR 0 BUGS)
// ============================================================================
function renderMasterWebPanel() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>👑 KUMAR QUANTUM OS • TELEGRAM CONTROL PANEL 👑</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #070312;
      --bg-surface: #110926;
      --bg-card: rgba(22, 12, 46, 0.86);
      --bg-input: #0a0518;
      --accent-main: #f59e0b;
      --accent-glow: rgba(245, 158, 11, 0.42);
      --accent-sec: #ec4899;
      --accent-sec-glow: rgba(236, 72, 153, 0.38);
      --accent-tert: #8b5cf6;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.4);
      --danger: #f43f5e;
      --danger-glow: rgba(244, 63, 94, 0.4);
      --text-primary: #ffffff;
      --text-secondary: #cbd5e1;
      --text-dim: #94a3b8;
      --border-glass: rgba(245, 158, 11, 0.28);
      --border-strong: rgba(245, 158, 11, 0.75);
      --gradient-royal: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%);
      --gradient-btn: linear-gradient(90deg, #f59e0b, #d97706);
    }

    body.theme-emerald {
      --bg-base: #02100a;
      --bg-surface: #062115;
      --bg-card: rgba(8, 36, 24, 0.88);
      --bg-input: #03140c;
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
      --bg-card: rgba(40, 8, 18, 0.88);
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
      --bg-card: rgba(10, 25, 50, 0.88);
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

    /* ANIMATED GRID FLOOR */
    .quantum-grid-bg {
      position: fixed;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 36px 36px;
      pointer-events: none;
      z-index: 0;
    }

    /* ========================================================================
       1. NEW ROYAL QUANTUM VAULT LOCK SCREEN (PIN: 252010)
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
      transition: opacity 0.4s ease, visibility 0.4s ease;
    }

    #vault-overlay.vault-open {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .vault-container {
      width: 100%;
      max-width: 420px;
      background: rgba(16, 8, 36, 0.94);
      border: 2px solid var(--border-strong);
      border-radius: 28px;
      padding: 26px 20px;
      box-shadow: 0 0 65px var(--accent-glow), inset 0 0 30px rgba(245, 158, 11, 0.08);
      text-align: center;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(20px);
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
      margin-bottom: 14px;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .vault-heading {
      font-family: 'Cinzel', serif;
      font-size: 24px;
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
      margin-bottom: 18px;
      font-weight: 600;
    }

    /* 6 DIGITAL LED DISPLAY BOXES */
    .led-pin-boxes {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }

    .led-box {
      height: 50px;
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
      box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.9);
      transition: all 0.18s ease;
    }

    .led-box.active-digit {
      border-color: var(--accent-main);
      background: rgba(245, 158, 11, 0.14);
      box-shadow: 0 0 16px var(--accent-glow);
      transform: translateY(-2px);
    }

    .led-box.error-shake {
      border-color: var(--danger);
      color: var(--danger);
      background: rgba(244, 63, 94, 0.15);
      animation: shakeBox 0.35s ease;
    }

    @keyframes shakeBox {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-7px); }
      75% { transform: translateX(7px); }
    }

    /* DIRECT KEYBOARD INPUT BAR + INSTANT UNLOCK */
    .direct-pin-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
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

    .direct-pin-field:focus {
      border-color: var(--accent-main);
      box-shadow: 0 0 15px var(--accent-glow);
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

    /* 3D TACTILE KEYPAD */
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
      padding: 13px 0;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 800;
      cursor: pointer;
      user-select: none;
      transition: transform 0.1s ease, background 0.15s ease;
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
      font-size: 14px;
    }

    .key-tile.key-ok {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #ffffff;
      border-color: #34d399;
      border-bottom-color: #047857;
      font-size: 14px;
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
      max-width: 1180px;
      margin: 0 auto;
      padding: 16px 14px 100px;
    }

    /* ROYAL TOP COMMAND HEADER */
    .royal-header {
      background: linear-gradient(135deg, rgba(26, 13, 54, 0.95), rgba(11, 5, 24, 0.96));
      border: 1.5px solid var(--border-strong);
      border-radius: 24px;
      padding: 20px 22px;
      margin-bottom: 18px;
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
      width: 58px;
      height: 58px;
      border-radius: 18px;
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
      font-size: 21px;
      font-weight: 900;
      color: var(--accent-main);
      letter-spacing: 1.2px;
      text-shadow: 0 0 14px var(--accent-glow);
    }

    .royal-title-block p {
      font-size: 12.5px;
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
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }

    .metric-box {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 20px;
      padding: 18px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(14px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
    }

    .metric-box::after {
      content: "";
      position: absolute;
      top: 0;
      right: 0;
      width: 70px;
      height: 70px;
      background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
      pointer-events: none;
    }

    .metric-tag {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-dim);
      margin-bottom: 6px;
    }

    .metric-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 800;
      color: var(--accent-main);
    }

    .metric-foot {
      font-size: 11.5px;
      color: var(--text-secondary);
      margin-top: 6px;
      font-weight: 600;
    }

    /* ========================================================================
       NAVIGATION TABS BAR
       ======================================================================== */
    .command-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }

    .cmd-tab {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 16px;
      padding: 14px 10px;
      color: var(--text-secondary);
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 13px;
      font-weight: 800;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .cmd-tab.active-tab {
      background: var(--gradient-royal);
      color: #ffffff;
      border-color: #ffffff;
      box-shadow: 0 0 25px var(--accent-glow);
      transform: translateY(-2px);
    }

    .view-pane {
      display: none;
      animation: paneAppear 0.25s ease;
    }

    .view-pane.active-pane {
      display: block;
    }

    @keyframes paneAppear {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ========================================================================
       GLASS PANELS, INPUTS & ROYAL BUTTONS
       ======================================================================== */
    .two-col-layout {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      margin-bottom: 18px;
    }

    .glass-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 22px;
      padding: 22px;
      margin-bottom: 18px;
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
      margin-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .panel-heading {
      font-size: 15px;
      font-weight: 800;
      color: var(--accent-main);
      letter-spacing: 0.6px;
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
      margin-bottom: 14px;
    }

    .field-title {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      font-weight: 800;
      color: var(--text-secondary);
      margin-bottom: 6px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .field-title span {
      color: var(--accent-main);
      font-family: 'JetBrains Mono', monospace;
    }

    .royal-input {
      width: 100%;
      padding: 13px 15px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-glass);
      border-radius: 14px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
    }

    .royal-input:focus {
      border-color: var(--accent-main);
      box-shadow: 0 0 18px var(--accent-glow);
    }

    .action-btn {
      width: 100%;
      padding: 14px 18px;
      border: none;
      border-radius: 14px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.8px;
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
      box-shadow: 0 0 22px var(--accent-glow);
    }

    .btn-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 32px var(--accent-glow);
    }

    .btn-emerald {
      background: linear-gradient(90deg, #10b981, #059669);
      color: #ffffff;
      box-shadow: 0 0 22px var(--success-glow);
    }

    .btn-emerald:hover {
      transform: translateY(-2px);
    }

    .btn-crimson {
      background: linear-gradient(90deg, #f43f5e, #e11d48);
      color: #ffffff;
      box-shadow: 0 0 22px var(--danger-glow);
    }

    .btn-royal-purple {
      background: linear-gradient(90deg, #8b5cf6, #ec4899);
      color: #ffffff;
      box-shadow: 0 0 22px var(--accent-sec-glow);
    }

    .btn-ghost {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-glass);
      color: var(--accent-main);
    }

    .btn-mini {
      width: auto;
      padding: 7px 13px;
      font-size: 11px;
      margin-bottom: 0;
      border-radius: 10px;
    }

    /* ========================================================================
       LIVE HOLOGRAPHIC CONSOLE
       ======================================================================== */
    .console-screen {
      background: #04010a;
      border: 1.5px solid var(--border-strong);
      border-radius: 16px;
      padding: 15px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      color: #fde68a;
      max-height: 250px;
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

    /* ========================================================================
       TABLES & STATUS PILLS
       ======================================================================== */
    .table-scroll {
      width: 100%;
      overflow-x: auto;
    }

    .royal-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .royal-table th {
      background: rgba(245, 158, 11, 0.1);
      color: var(--accent-main);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-glass);
      white-space: nowrap;
    }

    .royal-table td {
      padding: 13px 14px;
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
      font-size: 11px;
      font-weight: 800;
      display: inline-block;
    }

    .status-left {
      background: rgba(244, 63, 94, 0.18);
      border: 1px solid var(--danger);
      color: #fda4af;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
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
      padding: 12px 15px;
      font-size: 12.5px;
      color: var(--text-secondary);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    /* TOAST POPUP */
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
      .command-tabs {
        grid-template-columns: 1fr;
      }
      .royal-title-block h1 {
        font-size: 17px;
      }
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

      <!-- 6 LED DISPLAY BOXES -->
      <div class="led-pin-boxes" id="led-boxes">
        <div class="led-box" id="led-0">-</div>
        <div class="led-box" id="led-1">-</div>
        <div class="led-box" id="led-2">-</div>
        <div class="led-box" id="led-3">-</div>
        <div class="led-box" id="led-4">-</div>
        <div class="led-box" id="led-5">-</div>
      </div>

      <!-- DIRECT INPUT + UNLOCK BUTTON (100% FALLBACK PROOF) -->
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

      <!-- 3D TACTILE KEYPAD -->
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
          <h1>TELEGRAM MASTER CONTROL PANEL</h1>
          <p>Per-Account API_ID & API_HASH • Multi-Account Auto Join & Leave</p>
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
        <div class="metric-foot">🟢 Each with Dedicated API_ID</div>
      </div>
      <div class="metric-box">
        <div class="metric-tag">📢 Total Channels</div>
        <div class="metric-num" id="metric-channels">0</div>
        <div class="metric-foot">⚡ Synced in Firebase DB</div>
      </div>
      <div class="metric-box">
        <div class="metric-tag">🟢 Active Joined</div>
        <div class="metric-num" id="metric-joined">0</div>
        <div class="metric-foot">📥 Ready for Instant Control</div>
      </div>
      <div class="metric-box">
        <div class="metric-tag">🔐 Vault Security</div>
        <div class="metric-num" style="color: var(--success); font-size: 22px;">UNLOCKED</div>
        <div class="metric-foot">🔑 Master PIN Verified</div>
      </div>
    </section>

    <!-- NAVIGATION TABS -->
    <div class="command-tabs">
      <button type="button" class="cmd-tab active-tab" data-target="pane-accounts">
        ➕ 1. ADD ID (WITH API_ID & HASH)
      </button>
      <button type="button" class="cmd-tab" data-target="pane-channels">
        📥 2. JOIN / LEAVE CHANNEL
      </button>
      <button type="button" class="cmd-tab" data-target="pane-list">
        📋 3. CHANNEL LIST & STATUS
      </button>
    </div>

    <!-- LIVE OUTPUT CONSOLE -->
    <div class="glass-panel">
      <div class="panel-top">
        <div class="panel-heading">🖥️ LIVE COMMAND OUTPUT CONSOLE</div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="action-btn btn-ghost btn-mini" id="btn-clear-log">🧹 CLEAR</button>
          <button type="button" class="action-btn btn-ghost btn-mini" id="btn-sync-now">🔄 REFRESH</button>
        </div>
      </div>
      <div class="console-screen" id="console-box">👑 [QUANTUM OS ONLINE]: Vault unlocked! Enter each account's API_ID, API_HASH, and Phone Number below.</div>
    </div>

    <!-- ====================================================================
         PANE 1: ADD TELEGRAM ID (PER-ACCOUNT API_ID + API_HASH + OTP + 2FA)
         ==================================================================== -->
    <div id="pane-accounts" class="view-pane active-pane">
      <div class="helper-alert">
        ⚡ <b>DEDICATED API_ID & API_HASH SYSTEM:</b> Every Telegram account has its own <code>API_ID</code> and <code>API_HASH</code>. Enter the account's API ID, API Hash, and Phone Number below. They will be permanently saved with that account in Firebase!
      </div>

      <div class="two-col-layout">
        <!-- LEFT CARD: API_ID + API_HASH + PHONE + OTP -->
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

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;" />

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

        <!-- RIGHT CARD: 2FA CLOUD PASSWORD -->
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

          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 18px 0;" />

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

      <!-- CONNECTED ACCOUNTS TABLE -->
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
            <tbody id="tbody-accounts">
              <tr>
                <td colspan="8" style="text-align: center; color: var(--text-dim);">Loading accounts...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 2: AUTO JOIN & AUTO LEAVE CHANNELS
         ==================================================================== -->
    <div id="pane-channels" class="view-pane">
      <div class="two-col-layout">
        <!-- JOIN CHANNEL CARD -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📥 JOIN CHANNEL (AUTOMATIC)</div>
            <span class="badge-chip">ALL IDs</span>
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
            📥 AUTO JOIN CHANNEL FROM ALL IDs
          </button>
          <p style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">
            ⚡ Every connected account will automatically join this channel using its own saved <code>API_ID</code> & <code>API_HASH</code>.
          </p>
        </div>

        <!-- LEAVE CHANNEL CARD -->
        <div class="glass-panel">
          <div class="panel-top">
            <div class="panel-heading">📤 LEAVE CHANNEL (AUTOMATIC)</div>
            <span class="badge-chip">ALL IDs</span>
          </div>
          <div class="field-block">
            <div class="field-title">
              <label>CHANNEL NUMBER FROM LIST</label>
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
            📤 AUTO LEAVE SELECTED CHANNEL (ALL IDs)
          </button>
          <p style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">
            💡 You can also click the red <b>📤 LEAVE ALL IDs</b> button on any channel in the table below!
          </p>
        </div>
      </div>

      <!-- INTERACTIVE CHANNEL LIST -->
      <div class="glass-panel">
        <div class="panel-top">
          <div class="panel-heading">📋 REGISTERED CHANNELS & 1-CLICK LEAVE</div>
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
         PANE 3: COMPLETE CHANNEL LIST & STATUS
         ==================================================================== -->
    <div id="pane-list" class="view-pane">
      <div class="glass-panel">
        <div class="panel-top">
          <div class="panel-heading">📋 REGISTERED CHANNELS & LIVE STATUS</div>
        </div>
        <div class="table-scroll">
          <table class="royal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CHANNEL TITLE</th>
                <th>LINK / USERNAME</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody id="tbody-channels-full"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-zone"></div>

  <!-- ======================================================================
       3. BULLETPROOF FRONTEND JAVASCRIPT (ZERO ESCAPING BUGS)
       ====================================================================== -->
  <script>
    (function () {
      var MASTER_PIN_CODE = "252010";
      var enteredPin = "";
      var accountsList = [];
      var channelsList = [];

      // Web Audio Synthesizer for Tactile Feedback
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
          g.gain.setValueAtTime(0.07, soundCtx.currentTime);
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
      // VAULT LOCK SCREEN LOGIC (PIN: 252010)
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
        beep(920, "triangle", 0.15);
        setTimeout(function () {
          beep(1320, "triangle", 0.22);
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

      function handleDigitPress(d) {
        beep(700, "sine", 0.06);
        if (enteredPin.length < 6) {
          enteredPin += String(d);
          renderLedBoxes();
          if (enteredPin.length === 6) {
            setTimeout(checkPinNow, 100);
          }
        }
      }

      // Bind Keypad Tiles
      var digitButtons = document.querySelectorAll(".key-tile[data-digit]");
      for (var b = 0; b < digitButtons.length; b++) {
        digitButtons[b].addEventListener("click", function () {
          var dg = this.getAttribute("data-digit");
          handleDigitPress(dg);
        });
      }

      // Bind Clear & Open Buttons
      var btnClr = document.getElementById("btn-key-clr");
      if (btnClr) {
        btnClr.addEventListener("click", function () {
          beep(320, "sawtooth", 0.09);
          enteredPin = "";
          var directInp = document.getElementById("direct-pin-input");
          if (directInp) directInp.value = "";
          renderLedBoxes();
          var fb = document.getElementById("vault-feedback");
          if (fb) fb.textContent = "🛡️ PIN CLEARED • ENTER 6-DIGIT PIN";
        });
      }

      var btnEnter = document.getElementById("btn-key-enter");
      if (btnEnter) {
        btnEnter.addEventListener("click", checkPinNow);
      }

      var btnDirectUnlock = document.getElementById("btn-direct-unlock");
      if (btnDirectUnlock) {
        btnDirectUnlock.addEventListener("click", checkPinNow);
      }

      var directPinInput = document.getElementById("direct-pin-input");
      if (directPinInput) {
        directPinInput.addEventListener("input", function () {
          enteredPin = this.value.replace(/\D/g, "").slice(0, 6);
          renderLedBoxes();
          if (enteredPin.length === 6) {
            setTimeout(checkPinNow, 100);
          }
        });
        directPinInput.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            checkPinNow();
          }
        });
      }

      var btnLockPanel = document.getElementById("btn-lock-panel");
      if (btnLockPanel) {
        btnLockPanel.addEventListener("click", function () {
          try {
            sessionStorage.removeItem("kumar_vault_unlocked");
          } catch (e) {}
          enteredPin = "";
          renderLedBoxes();
          var overlay = document.getElementById("vault-overlay");
          if (overlay) overlay.classList.remove("vault-open");
          toast("🔒 Vault Locked.", "#f59e0b");
        });
      }

      // Auto-unlock if already verified in current session
      try {
        if (sessionStorage.getItem("kumar_vault_unlocked") === "yes") {
          var overlayEl = document.getElementById("vault-overlay");
          if (overlayEl) overlayEl.classList.add("vault-open");
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
          var targetPane = document.getElementById(targetId);
          if (targetPane) targetPane.classList.add("active-pane");
          this.classList.add("active-tab");
        });
      }

      var themeSelect = document.getElementById("theme-switcher");
      if (themeSelect) {
        themeSelect.addEventListener("change", function () {
          document.body.className = this.value;
          toast("🎨 Visual Theme Updated!", "#f59e0b");
        });
      }

      setInterval(function () {
        var clk = document.getElementById("header-clock");
        if (clk) clk.textContent = "🕒 " + new Date().toLocaleTimeString();
      }, 1000);

      // ====================================================================
      // BACKEND API ENGINE
      // ====================================================================
      async function sendApiRequest(action, extraData) {
        extraData = extraData || {};
        writeConsole("⏳ <b>Executing [" + action.toUpperCase() + "]... Please wait...</b>");
        try {
          var payload = {
            action: action,
            webPin: MASTER_PIN_CODE
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

          var joinedCnt = 0;
          for (var i = 0; i < channelsList.length; i++) {
            if (channelsList[i] && String(channelsList[i].status).indexOf("🟢") !== -1) {
              joinedCnt++;
            }
          }
          document.getElementById("metric-joined").textContent = joinedCnt;

          var banner = document.getElementById("active-session-banner");
          if (banner) {
            if (data.pendingAuth && data.pendingAuth.phone) {
              banner.innerHTML =
                "🟢 <b>Waiting OTP / 2FA For:</b> <code>" +
                data.pendingAuth.phone +
                "</code><br>🔢 <b>Account API_ID:</b> <code>" +
                data.pendingAuth.apiId +
                "</code>";
            } else {
              banner.innerHTML =
                "No pending OTP session. Enter API_ID, API_HASH, and Phone on the left to start!";
            }
          }

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
        var tbFull = document.getElementById("tbody-channels-full");
        if (!tbMain || !tbFull) return;

        if (!channelsList.length) {
          var emptyHtml =
            '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">📭 No channels registered in Firebase yet.</td></tr>';
          tbMain.innerHTML = emptyHtml;
          tbFull.innerHTML = emptyHtml;
          return;
        }

        tbMain.innerHTML = "";
        tbFull.innerHTML = "";

        for (var i = 0; i < channelsList.length; i++) {
          (function (idx, ch) {
            var num = idx + 1;
            var isJoined = String(ch.status).indexOf("🟢") !== -1;
            var statusClass = isJoined ? "status-joined" : "status-left";

            function createChannelRow() {
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
              btnLeave.textContent = "📤 LEAVE ALL IDs";
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
              return tr;
            }

            tbMain.appendChild(createChannelRow());
            tbFull.appendChild(createChannelRow());
          })(i, channelsList[i]);
        }
      }

      // ====================================================================
      // FORM BUTTON BINDINGS
      // ====================================================================
      document.getElementById("btn-send-otp").addEventListener("click", function () {
        var apiId = document.getElementById("inp-api-id").value.trim();
        var apiHash = document.getElementById("inp-api-hash").value.trim();
        var phone = document.getElementById("inp-phone").value.trim();

        if (!apiId || !apiHash) {
          toast("⚠️ Enter both Account API_ID & API_HASH!", "#f43f5e");
          return;
        }
        if (!phone) {
          toast("⚠️ Enter the Phone Number (+91...)!", "#f43f5e");
          return;
        }
        sendApiRequest("send_code", {
          apiId: apiId,
          apiHash: apiHash,
          input: phone
        });
      });

      document.getElementById("btn-verify-otp").addEventListener("click", function () {
        var otp = document.getElementById("inp-otp").value.trim();
        if (!otp) {
          toast("⚠️ Enter the 5-digit OTP!", "#f43f5e");
          return;
        }
        sendApiRequest("verify_code", { input: otp });
      });

      document.getElementById("btn-verify-2fa").addEventListener("click", function () {
        var pwd = document.getElementById("inp-2fa").value.trim();
        if (!pwd) {
          toast("⚠️ Enter your 2FA Cloud Password!", "#f43f5e");
          return;
        }
        sendApiRequest("verify_2fa", { input: pwd });
      });

      document.getElementById("btn-join-channel").addEventListener("click", function () {
        var chan = document.getElementById("inp-join-channel").value.trim();
        if (!chan) {
          toast("⚠️ Enter a Channel Link or @username!", "#f43f5e");
          return;
        }
        sendApiRequest("join", { input: chan });
      });

      document.getElementById("btn-leave-number").addEventListener("click", function () {
        var num = document.getElementById("inp-leave-number").value.trim();
        if (!num) {
          toast("⚠️ Enter a Channel Number from the list!", "#f43f5e");
          return;
        }
        sendApiRequest("leave", { input: num });
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
// MAIN SERVERLESS API HANDLER (PER-ACCOUNT API_ID & API_HASH + FIXED 2FA)
// ============================================================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderMasterWebPanel());
  }

  const { action, input, apiId, apiHash, webPin } = req.body || {};

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
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Invalid API Credentials!</b>"
        });
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
          reply:
            "╔════════════════════════════╗\n" +
            "   ⚠️ <b>MISSING ACCOUNT API ID/HASH</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "❌ Please enter this account's <b>API_ID</b> and <b>API_HASH</b> in Boxes 1 & 2!"
        });
      }

      if (phone.length < 10) {
        return res.status(200).json({
          nextStep: "add_phone",
          reply: "❌ <b>Invalid Phone Number!</b> Example: <code>+919584967727</code>"
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
          "╔════════════════════════════╗\n" +
          "   📩 <b>LOGIN OTP DISPATCHED!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "📱 <b>Target Account:</b> <code>" + phone + "</code>\n" +
          "🔢 <b>Dedicated API_ID:</b> <code>" + accApiId + "</code>\n" +
          "📡 <b>OTP Status:</b> <code>🟢 Sent to Telegram App</code>\n\n" +
          "👉 Enter the 5-digit OTP in Box 4 and click <b>STEP 2: VERIFY OTP</b>!"
      });
    }

    // ================= 3. VERIFY OTP & SAVE ACCOUNT =================
    if (action === "verify_code") {
      const code = String(input || "").replace(/\D/g, "");
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>No Active OTP Session!</b> Please send OTP first."
        });
      }

      const phone = tempAuth.phone;
      const accApiId = Number(tempAuth.apiId || defaultApiConfig.apiId);
      const accApiHash = String(tempAuth.apiHash || defaultApiConfig.apiHash);
      const phoneCodeHash = tempAuth.phoneCodeHash;
      const tempSession = tempAuth.tempSession;

      const client = new TelegramClient(
        new StringSession(tempSession),
        accApiId,
        accApiHash,
        { connectionRetries: 2 }
      );

      await client.connect();

      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: phoneCodeHash,
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
            phoneCodeHash: phoneCodeHash,
            tempSession: updatedSession,
            time: Date.now()
          });

          return res.status(200).json({
            nextStep: "wait_2fa",
            pendingPhone: phone,
            pendingApiId: accApiId,
            reply:
              "╔════════════════════════════╗\n" +
              "   🔐 <b>2FA PASSWORD REQUIRED</b>\n" +
              "╚════════════════════════════╝\n\n" +
              "✅ <b>OTP Verified for:</b> <code>" + phone + "</code>\n" +
              "🔢 <b>Dedicated API_ID:</b> <code>" + accApiId + "</code>\n" +
              "👇 <b>Now enter your 2FA Cloud Password on the right card and click STEP 3: VERIFY 2FA!</b>"
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
        reply:
          "╔════════════════════════════╗\n" +
          "   🎉 <b>ACCOUNT CONNECTED!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "👤 <b>Account Name:</b> " + (me.firstName || "User") + "\n" +
          "📱 <b>Phone Number:</b> <code>" + phone + "</code>\n" +
          "🔢 <b>Saved API_ID:</b> <code>" + accApiId + "</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= 4. VERIFY 2FA PASSWORD =================
    if (action === "verify_2fa") {
      const password = String(input || "").trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Session Expired!</b> Please request OTP again."
        });
      }

      const phone = tempAuth.phone;
      const accApiId = Number(tempAuth.apiId || defaultApiConfig.apiId);
      const accApiHash = String(tempAuth.apiHash || defaultApiConfig.apiHash);
      const tempSession = tempAuth.tempSession;

      const client = new TelegramClient(
        new StringSession(tempSession),
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
        reply:
          "╔════════════════════════════╗\n" +
          "   🎉 <b>2FA VERIFIED & CONNECTED!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "👤 <b>Account Name:</b> " + (me.firstName || "User") + "\n" +
          "📱 <b>Phone Number:</b> <code>" + phone + "</code>\n" +
          "🔢 <b>Dedicated API_ID:</b> <code>" + accApiId + "</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= LOAD ACCOUNTS =================
    let accounts = (await fbGet("panel/accounts")) || [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    if (action === "remove_account") {
      const targetPhone = String(input || "").trim();
      accounts = accounts.filter(function (a) {
        return a.phone !== targetPhone;
      });
      await fbSet("panel/accounts", accounts);
      return res.status(200).json({
        nextStep: "",
        reply: "🗑️ <b>Account Removed:</b> <code>" + targetPhone + "</code>"
      });
    }

    if (action === "my_accounts") {
      if (accounts.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>No Connected Accounts!</b>"
        });
      }
      let msg = "📱 <b>CONNECTED ACCOUNTS (" + accounts.length + " IDs)</b>\n\n";
      for (let i = 0; i < accounts.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + accounts[i].name + "</b> — <code>" + accounts[i].phone + "</code> (API: <code>" + (accounts[i].apiId || "Set") + "</code>)\n";
      }
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (accounts.length === 0) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>No Active Accounts!</b> Connect at least 1 Telegram ID first."
      });
    }

    // ================= 5. AUTO JOIN CHANNEL (EACH ID USES ITS OWN API) =================
    if (action === "join") {
      const channelInput = String(input || "").trim();
      let title = channelInput;
      let targetId = channelInput;
      let successCount = 0;
      let failCount = 0;

      await Promise.allSettled(
        accounts.map(async function (acc) {
          const useApiId = Number(acc.apiId || defaultApiConfig.apiId);
          const useApiHash = String(acc.apiHash || defaultApiConfig.apiHash);

          const client = new TelegramClient(
            new StringSession(acc.session),
            useApiId,
            useApiHash,
            { connectionRetries: 2 }
          );
          try {
            await client.connect();
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
        })
      );

      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let found = false;
      for (let i = 0; i < channels.length; i++) {
        if (channels[i].input === channelInput || channels[i].targetId === targetId) {
          channels[i].status = "🟢 JOINED (" + successCount + "/" + accounts.length + " IDs)";
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
          status: "🟢 JOINED (" + successCount + "/" + accounts.length + " IDs)",
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
          "🟢 <b>Joined Accounts:</b> <code>" + successCount + " / " + accounts.length + " IDs</code>\n" +
          "🔴 <b>Failed Accounts:</b> <code>" + failCount + " IDs</code>"
      });
    }

    // ================= 6. LEAVE MENU =================
    if (action === "leave_menu") {
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>No Channels Found!</b>"
        });
      }

      let msg = "📤 <b>SELECT CHANNEL TO LEAVE</b>\n\n";
      for (let i = 0; i < channels.length; i++) {
        msg += "<b>[" + (i + 1) + "] " + channels[i].title + "</b> (<code>" + channels[i].input + "</code>)\n";
      }
      msg += "\n👇 Send the Channel Number to leave:";
      return res.status(200).json({ nextStep: "wait_leave", reply: msg });
    }

    // ================= 7. AUTO LEAVE CHANNEL =================
    if (action === "leave") {
      const index = parseInt(String(input || "").trim(), 10) - 1;
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (isNaN(index) || !channels[index]) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Invalid Channel Number!</b>"
        });
      }

      const targetChannel = channels[index];
      let leftCount = 0;

      await Promise.allSettled(
        accounts.map(async function (acc) {
          const useApiId = Number(acc.apiId || defaultApiConfig.apiId);
          const useApiHash = String(acc.apiHash || defaultApiConfig.apiHash);

          const client = new TelegramClient(
            new StringSession(acc.session),
            useApiId,
            useApiHash,
            { connectionRetries: 2 }
          );
          try {
            await client.connect();
            let cleanTarget = targetChannel.targetId.replace("https://t.me/", "").trim();
            await client.invoke(new Api.channels.LeaveChannel({ channel: cleanTarget }));
            leftCount++;
          } catch (e) {
          } finally {
            fastDisconnect(client);
          }
        })
      );

      channels[index].status = "🔴 LEFT (" + leftCount + "/" + accounts.length + " IDs)";
      await fbSet("panel/channels", channels);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔════════════════════════════╗\n" +
          "   📤 <b>MULTI-ID AUTO LEAVE DONE!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "📢 <b>Channel Name:</b> " + targetChannel.title + "\n" +
          "🔴 <b>Left Accounts:</b> <code>" + leftCount + " / " + accounts.length + " IDs</code>"
      });
    }

    // ================= 8. CHANNEL LIST =================
    if (action === "list") {
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>No channels tracked yet!</b>"
        });
      }

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
