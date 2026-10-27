const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const PasswordHelper = require("telegram/Password");

// ============================================================================
// CONFIGURATION & FIREBASE REALTIME DATABASE REST ENGINE
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
// BULLETPROOF 2FA PASSWORD VERIFICATION ENGINE (FIXES computeCheckPassword)
// ============================================================================
async function verifyTelegram2FAPassword(client, apiId, apiHash, password) {
  // Method 1: Official GramJS PasswordHelper.computeCheck
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

  // Method 2: Fallback if computeCheckPassword exists in another build
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

  // Method 3: Built-in TelegramClient signInWithPassword method
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

  throw new Error("2FA module could not be initialized on server.");
}

// ============================================================================
// SUPER STYLISH CYBERPUNK WEB CONTROL PANEL UI
// ============================================================================
function renderMasterWebPanel() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>⚡ TELEGRAM MASTER CONTROL PANEL • MULTI-API EDITION ⚡</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-deep: #02050d;
      --bg-panel: #080f1e;
      --bg-card: rgba(12, 20, 38, 0.88);
      --bg-card-hover: rgba(18, 29, 54, 0.95);
      --bg-input: #050914;
      --primary: #00f0ff;
      --primary-glow: rgba(0, 240, 255, 0.38);
      --secondary: #7c3aed;
      --secondary-glow: rgba(124, 58, 237, 0.35);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.38);
      --danger: #ef4444;
      --danger-glow: rgba(239, 68, 68, 0.38);
      --warning: #f59e0b;
      --warning-glow: rgba(245, 158, 11, 0.35);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-color: rgba(0, 240, 255, 0.22);
      --border-bright: rgba(0, 240, 255, 0.65);
    }

    body.theme-matrix {
      --primary: #00ff66;
      --primary-glow: rgba(0, 255, 102, 0.38);
      --secondary: #059669;
      --border-color: rgba(0, 255, 102, 0.25);
      --border-bright: rgba(0, 255, 102, 0.65);
    }

    body.theme-crimson {
      --primary: #ff2a5f;
      --primary-glow: rgba(255, 42, 95, 0.38);
      --secondary: #991b1b;
      --border-color: rgba(255, 42, 95, 0.25);
      --border-bright: rgba(255, 42, 95, 0.65);
    }

    body.theme-gold {
      --primary: #fbbf24;
      --primary-glow: rgba(251, 191, 36, 0.38);
      --secondary: #d97706;
      --border-color: rgba(251, 191, 36, 0.25);
      --border-bright: rgba(251, 191, 36, 0.65);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-deep);
      color: var(--text-main);
      font-family: 'Rajdhani', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
      background-image: 
        radial-gradient(circle at 15% 20%, rgba(0, 240, 255, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(124, 58, 237, 0.06) 0%, transparent 40%);
    }

    #cyber-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 0;
      pointer-events: none;
      opacity: 0.42;
    }

    /* ========================================================================
       SECURITY LOCK SCREEN OVERLAY (PIN: 252010)
       ======================================================================== */
    #security-lock-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: radial-gradient(circle at center, #0b1329 0%, #02040a 100%);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      transition: opacity 0.45s ease, transform 0.45s ease;
    }

    #security-lock-screen.unlocked {
      opacity: 0;
      pointer-events: none;
      transform: scale(1.08);
    }

    .lock-card {
      width: 100%;
      max-width: 430px;
      background: rgba(8, 14, 28, 0.94);
      border: 1px solid var(--border-bright);
      border-radius: 26px;
      padding: 28px 22px;
      box-shadow: 0 0 60px var(--primary-glow), inset 0 0 30px rgba(0, 240, 255, 0.05);
      text-align: center;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(20px);
    }

    .lock-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: -100%;
      width: 200%;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--primary), var(--secondary), transparent);
      animation: scanline 2.8s linear infinite;
    }

    @keyframes scanline {
      0% { transform: translateX(-50%); }
      100% { transform: translateX(50%); }
    }

    .shield-icon {
      width: 74px;
      height: 74px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: rgba(0, 240, 255, 0.08);
      border: 2px solid var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      box-shadow: 0 0 28px var(--primary-glow);
      animation: pulseGlow 2s infinite alternate;
    }

    @keyframes pulseGlow {
      0% { box-shadow: 0 0 12px var(--primary-glow); transform: scale(0.97); }
      100% { box-shadow: 0 0 32px var(--primary-glow); transform: scale(1.04); }
    }

    .lock-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 20px;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: 2px;
      margin-bottom: 6px;
      text-shadow: 0 0 12px var(--primary-glow);
    }

    .lock-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 18px;
      font-weight: 600;
      letter-spacing: 0.6px;
    }

    .pin-dots-container {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 18px;
    }

    .pin-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--primary);
      background: transparent;
      transition: all 0.2s ease;
    }

    .pin-dot.filled {
      background: var(--primary);
      box-shadow: 0 0 14px var(--primary);
      transform: scale(1.15);
    }

    .pin-dot.error {
      border-color: var(--danger);
      background: var(--danger);
      box-shadow: 0 0 14px var(--danger);
      animation: shake 0.35s ease;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }

    .pin-direct-input {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      color: var(--primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      text-align: center;
      letter-spacing: 6px;
      margin-bottom: 16px;
      outline: none;
    }

    .pin-direct-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 16px var(--primary-glow);
    }

    .numpad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 11px;
      margin-bottom: 16px;
    }

    .num-btn {
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 14px 0;
      color: var(--text-main);
      font-family: 'Orbitron', sans-serif;
      font-size: 19px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .num-btn:hover, .num-btn:active {
      background: rgba(0, 240, 255, 0.16);
      border-color: var(--primary);
      color: var(--primary);
      box-shadow: 0 0 16px var(--primary-glow);
      transform: translateY(-2px);
    }

    .num-btn.action-clear {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.35);
      font-size: 14px;
    }

    .num-btn.action-enter {
      color: var(--success);
      border-color: rgba(16, 185, 129, 0.35);
      font-size: 14px;
    }

    #lock-status-msg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      min-height: 18px;
    }

    /* ========================================================================
       MAIN DASHBOARD CONTAINER
       ======================================================================== */
    .app-wrapper {
      position: relative;
      z-index: 1;
      max-width: 1180px;
      margin: 0 auto;
      padding: 16px 14px 90px;
    }

    .cyber-header {
      background: linear-gradient(135deg, rgba(12, 20, 38, 0.95), rgba(7, 12, 24, 0.95));
      border: 1px solid var(--border-bright);
      border-radius: 22px;
      padding: 20px 24px;
      margin-bottom: 18px;
      box-shadow: 0 0 35px rgba(0, 240, 255, 0.12);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .brand-zone {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .brand-logo {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 0 22px var(--primary-glow);
    }

    .brand-text h1 {
      font-family: 'Orbitron', sans-serif;
      font-size: 21px;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: 1.5px;
      text-shadow: 0 0 10px var(--primary-glow);
    }

    .brand-text p {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .cyber-badge {
      background: rgba(0, 240, 255, 0.08);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 8px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: blink 1.5s infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .theme-selector {
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      color: var(--primary);
      border-radius: 10px;
      padding: 7px 10px;
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      outline: none;
    }

    .btn-lock-now {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--danger);
      color: #fca5a5;
      border-radius: 10px;
      padding: 8px 14px;
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: 0.2s;
    }

    .btn-lock-now:hover {
      background: var(--danger);
      color: #fff;
      box-shadow: 0 0 15px var(--danger-glow);
    }

    /* ========================================================================
       TELEMETRY STATS GRID
       ======================================================================== */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 18px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-3px);
      border-color: var(--primary);
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .stat-value {
      font-family: 'Orbitron', sans-serif;
      font-size: 26px;
      font-weight: 900;
      color: var(--text-main);
    }

    .stat-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--primary);
      margin-top: 6px;
    }

    /* ========================================================================
       NAVIGATION TABS
       ======================================================================== */
    .tabs-bar {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 6px;
      margin-bottom: 18px;
      scrollbar-width: none;
    }

    .tabs-bar::-webkit-scrollbar {
      display: none;
    }

    .tab-btn {
      background: rgba(12, 20, 38, 0.85);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 12px 18px;
      border-radius: 12px;
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab-btn.active, .tab-btn:hover {
      background: linear-gradient(90deg, rgba(0, 240, 255, 0.2), rgba(124, 58, 237, 0.2));
      border-color: var(--primary);
      color: var(--primary);
      box-shadow: 0 0 18px var(--primary-glow);
    }

    .tab-section {
      display: none;
      animation: fadeIn 0.25s ease;
    }

    .tab-section.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ========================================================================
       CARDS, INPUTS & BUTTONS
       ======================================================================== */
    .grid-2col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      margin-bottom: 18px;
    }

    .cyber-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 22px;
      margin-bottom: 18px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(12px);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      border-bottom: 1px solid rgba(0, 240, 255, 0.15);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .card-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--primary);
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .step-badge {
      background: rgba(0, 240, 255, 0.14);
      border: 1px solid var(--primary);
      color: var(--primary);
      font-family: 'Orbitron', sans-serif;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
    }

    .form-group {
      margin-bottom: 14px;
    }

    .form-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 6px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    .form-label span.req {
      color: var(--primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }

    .input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .cyber-input {
      width: 100%;
      padding: 13px 15px;
      background: var(--bg-input);
      border: 1px solid rgba(0, 240, 255, 0.28);
      border-radius: 12px;
      color: var(--text-main);
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
    }

    .cyber-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 16px var(--primary-glow);
    }

    .pwd-toggle-btn {
      position: absolute;
      right: 10px;
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid var(--border-color);
      color: var(--primary);
      border-radius: 8px;
      padding: 5px 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      cursor: pointer;
    }

    .cyber-btn {
      width: 100%;
      padding: 13px 18px;
      border: none;
      border-radius: 12px;
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .btn-cyan {
      background: linear-gradient(90deg, #0284c7, var(--primary));
      color: #020617;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.25);
    }

    .btn-cyan:hover {
      box-shadow: 0 0 30px var(--primary-glow);
      transform: translateY(-2px);
    }

    .btn-green {
      background: linear-gradient(90deg, #059669, #10b981);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
    }

    .btn-green:hover {
      box-shadow: 0 0 30px var(--success-glow);
      transform: translateY(-2px);
    }

    .btn-red {
      background: linear-gradient(90deg, #dc2626, #ef4444);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.25);
    }

    .btn-red:hover {
      box-shadow: 0 0 30px var(--danger-glow);
      transform: translateY(-2px);
    }

    .btn-purple {
      background: linear-gradient(90deg, #6d28d9, #9333ea);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(147, 51, 234, 0.25);
    }

    .btn-purple:hover {
      box-shadow: 0 0 30px var(--secondary-glow);
      transform: translateY(-2px);
    }

    .btn-outline {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--primary);
      color: var(--primary);
    }

    .btn-sm {
      width: auto;
      padding: 7px 13px;
      font-size: 11px;
      margin-bottom: 0;
    }

    /* ========================================================================
       DATA TABLES
       ======================================================================== */
    .table-responsive {
      width: 100%;
      overflow-x: auto;
    }

    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .cyber-table th {
      background: rgba(0, 240, 255, 0.08);
      color: var(--primary);
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-color);
      letter-spacing: 0.8px;
      white-space: nowrap;
    }

    .cyber-table td {
      padding: 13px 14px;
      border-bottom: 1px solid rgba(56, 189, 248, 0.1);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-main);
      vertical-align: middle;
    }

    .cyber-table tr:hover td {
      background: rgba(0, 240, 255, 0.04);
    }

    .pill-joined {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--success);
      color: #34d399;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      display: inline-block;
    }

    .pill-left {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--danger);
      color: #f87171;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      display: inline-block;
    }

    .pill-api {
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid var(--border-color);
      color: var(--primary);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      display: inline-block;
    }

    /* ========================================================================
       LIVE CYBER TERMINAL LOG CONSOLE
       ======================================================================== */
    .terminal-box {
      background: #02050c;
      border: 1px solid var(--border-bright);
      border-radius: 16px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      color: var(--primary);
      max-height: 270px;
      overflow-y: auto;
      line-height: 1.65;
      box-shadow: inset 0 0 25px rgba(0, 240, 255, 0.07);
      white-space: pre-wrap;
    }

    .terminal-line {
      margin-bottom: 10px;
      border-left: 2px solid var(--primary);
      padding-left: 10px;
    }

    #toast-container {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cyber-toast {
      background: rgba(8, 14, 28, 0.96);
      border-left: 4px solid var(--primary);
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 13px 18px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
      animation: slideIn 0.25s ease;
      max-width: 340px;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .info-banner {
      background: rgba(0, 240, 255, 0.06);
      border: 1px dashed var(--border-bright);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 13px;
      color: #cbd5e1;
      margin-bottom: 16px;
      line-height: 1.5;
    }

    @media (max-width: 640px) {
      .brand-text h1 { font-size: 17px; }
      .stat-value { font-size: 22px; }
      .cyber-header { padding: 15px; }
    }
  </style>
</head>
<body>

  <!-- ANIMATED MATRIX / PARTICLE NETWORK CANVAS -->
  <canvas id="cyber-canvas"></canvas>

  <!-- ======================================================================
       1. SECURITY LOCK SCREEN MODAL (PASSWORD: 252010)
       ====================================================================== -->
  <div id="security-lock-screen">
    <div class="lock-card">
      <div class="shield-icon">🔐</div>
      <div class="lock-title">SECURITY CLEARANCE</div>
      <div class="lock-subtitle">ENTER 6-DIGIT MASTER PIN TO UNLOCK PANEL</div>

      <div class="pin-dots-container" id="pin-dots">
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
      </div>

      <input
        type="password"
        id="pin-input"
        class="pin-direct-input"
        maxlength="6"
        placeholder="••••••"
        inputmode="numeric"
        oninput="syncPinFromInput(this.value)"
        onkeydown="if(event.key==='Enter') verifyMasterPin()"
      />

      <div class="numpad-grid">
        <button class="num-btn" onclick="pressPinDigit('1')">1</button>
        <button class="num-btn" onclick="pressPinDigit('2')">2</button>
        <button class="num-btn" onclick="pressPinDigit('3')">3</button>
        <button class="num-btn" onclick="pressPinDigit('4')">4</button>
        <button class="num-btn" onclick="pressPinDigit('5')">5</button>
        <button class="num-btn" onclick="pressPinDigit('6')">6</button>
        <button class="num-btn" onclick="pressPinDigit('7')">7</button>
        <button class="num-btn" onclick="pressPinDigit('8')">8</button>
        <button class="num-btn" onclick="pressPinDigit('9')">9</button>
        <button class="num-btn action-clear" onclick="clearPin()">CLR</button>
        <button class="num-btn" onclick="pressPinDigit('0')">0</button>
        <button class="num-btn action-enter" onclick="verifyMasterPin()">UNLOCK</button>
      </div>

      <div id="lock-status-msg">🛡️ PROTECTED BY KUMAR CYBER-FIREWALL V5.0</div>
    </div>
  </div>

  <!-- ======================================================================
       2. MAIN MASTER CONTROL PANEL DASHBOARD
       ====================================================================== -->
  <div class="app-wrapper">
    <!-- HEADER -->
    <header class="cyber-header">
      <div class="brand-zone">
        <div class="brand-logo">⚡</div>
        <div class="brand-text">
          <h1>TELEGRAM CONTROL PANEL</h1>
          <p>Per-Account API_ID & API_HASH • Multi-ID Auto Channel Manager</p>
        </div>
      </div>
      <div class="header-controls">
        <select class="theme-selector" onchange="changeTheme(this.value)">
          <option value="">🎨 THEME: CYBER CYAN</option>
          <option value="theme-matrix">🟢 THEME: MATRIX GREEN</option>
          <option value="theme-crimson">🔴 THEME: CRIMSON RED</option>
          <option value="theme-gold">🟡 THEME: ROYAL GOLD</option>
        </select>
        <div class="cyber-badge">
          <span class="status-dot"></span>
          <span>FIREBASE SYNC</span>
        </div>
        <div class="cyber-badge" id="live-clock">00:00:00</div>
        <button class="btn-lock-now" onclick="lockPanelNow()">🔒 LOCK</button>
      </div>
    </header>

    <!-- TELEMETRY STATS -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">📱 Connected Accounts</div>
        <div class="stat-value" id="stat-accounts">0</div>
        <div class="stat-sub">🟢 Each with Dedicated API_ID</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">📢 Tracked Channels</div>
        <div class="stat-value" id="stat-channels">0</div>
        <div class="stat-sub">⚡ Synced in Realtime DB</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🟢 Active Joined</div>
        <div class="stat-value" id="stat-joined">0</div>
        <div class="stat-sub">📥 Currently Participating</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🛡️ Security Status</div>
        <div class="stat-value" style="color: var(--success); font-size: 20px;">ENCRYPTED</div>
        <div class="stat-sub">🔑 PIN: 252010 VERIFIED</div>
      </div>
    </section>

    <!-- NAVIGATION TABS -->
    <nav class="tabs-bar">
      <button class="tab-btn active" id="btn-tab-accounts" onclick="switchTab('tab-accounts', this)">➕ ADD / MANAGE IDs (WITH API)</button>
      <button class="tab-btn" id="btn-tab-channels" onclick="switchTab('tab-channels', this)">📢 CHANNEL AUTO JOIN / LEAVE</button>
      <button class="tab-btn" id="btn-tab-database" onclick="switchTab('tab-database', this)">📋 CHANNEL LIST</button>
    </nav>

    <!-- LIVE OUTPUT CONSOLE -->
    <div class="cyber-card">
      <div class="card-header">
        <div class="card-title">🖥️ LIVE EXECUTION TERMINAL</div>
        <div style="display:flex; gap:8px;">
          <button class="cyber-btn btn-outline btn-sm" onclick="clearTerminal()">🧹 CLEAR LOG</button>
          <button class="cyber-btn btn-outline btn-sm" onclick="refreshDashboardData()">🔄 REFRESH DATA</button>
        </div>
      </div>
      <div class="terminal-box" id="terminal-output">⚡ [SYSTEM READY]: Per-Account API_ID & API_HASH Engine loaded. 2FA verification fixed!</div>
    </div>

    <!-- ====================================================================
         TAB 1: ADD & MANAGE 11+ TELEGRAM ACCOUNTS (EACH WITH OWN API_ID/HASH)
         ==================================================================== -->
    <div id="tab-accounts" class="tab-section active">
      <div class="info-banner">
        💡 <b>MULTI-API SYSTEM ACTIVE:</b> Every Telegram account has its own unique <code>API_ID</code> and <code>API_HASH</code> from <code>my.telegram.org</code>. Enter the account's specific API ID, API Hash, and Phone Number below to connect it!
      </div>

      <div class="grid-2col">
        <!-- STEP 1 & 2: API_ID + API_HASH + PHONE + OTP -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">➕ CONNECT TELEGRAM ACCOUNT</div>
            <span class="step-badge">PER-ID API CONFIG</span>
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>1. ACCOUNT APP API_ID</span>
              <span class="req">*REQUIRED</span>
            </label>
            <input
              type="text"
              id="login-api-id"
              class="cyber-input"
              inputmode="numeric"
              placeholder="Enter this account's API_ID (e.g. 35204350)"
            />
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>2. ACCOUNT APP API_HASH</span>
              <span class="req">*REQUIRED</span>
            </label>
            <input
              type="text"
              id="login-api-hash"
              class="cyber-input"
              placeholder="Enter 32-char API_HASH (e.g. 94b55923094...)"
            />
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>3. PHONE NUMBER (WITH COUNTRY CODE)</span>
              <span class="req">*REQUIRED</span>
            </label>
            <input
              type="text"
              id="login-phone"
              class="cyber-input"
              placeholder="e.g. +919584967727"
            />
          </div>

          <button class="cyber-btn btn-cyan" onclick="triggerSendOtp()">
            📩 STEP 1: SEND LOGIN OTP CODE
          </button>

          <hr style="border: none; border-top: 1px solid rgba(0,240,255,0.15); margin: 16px 0;" />

          <div class="form-group">
            <label class="form-label">
              <span>4. ENTER 5-DIGIT TELEGRAM OTP</span>
              <span class="req">FROM TELEGRAM APP</span>
            </label>
            <input
              type="text"
              id="login-otp"
              class="cyber-input"
              inputmode="numeric"
              placeholder="Enter 5-digit OTP (e.g. 58765)"
            />
          </div>

          <button class="cyber-btn btn-green" onclick="triggerVerifyOtp()">
            ✅ STEP 2: VERIFY OTP & SAVE ACCOUNT
          </button>
        </div>

        <!-- STEP 3: 2FA CLOUD PASSWORD (FIXED) -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">🔐 TWO-STEP VERIFICATION (2FA)</div>
            <span class="step-badge">100% FIXED</span>
          </div>

          <div class="info-banner" style="border-color: var(--secondary);">
            🛡️ If your account shows <b>2FA PASSWORD REQUIRED</b> after entering the OTP, type your Telegram Cloud Password below and click Verify. It will automatically save your account with its dedicated <code>API_ID</code> & <code>API_HASH</code>!
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>TELEGRAM 2FA CLOUD PASSWORD</span>
              <span class="req">IF ENABLED</span>
            </label>
            <div class="input-wrap">
              <input
                type="password"
                id="login-2fa"
                class="cyber-input"
                placeholder="Enter your 2FA Cloud Password"
              />
              <button type="button" class="pwd-toggle-btn" onclick="toggle2faVisibility()">SHOW</button>
            </div>
          </div>

          <button class="cyber-btn btn-purple" onclick="triggerVerify2FA()">
            🔐 STEP 3: VERIFY 2FA PASSWORD & SAVE ID
          </button>

          <hr style="border: none; border-top: 1px solid rgba(0,240,255,0.15); margin: 18px 0;" />

          <div class="card-title" style="font-size: 13px; margin-bottom: 10px;">⚡ CURRENT PENDING LOGIN SESSION</div>
          <div id="pending-session-box" style="font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--text-muted); background:var(--bg-input); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
            No active OTP session in progress. Fill Steps 1-3 on the left to start!
          </div>
        </div>
      </div>

      <!-- CONNECTED ACCOUNTS TABLE -->
      <div class="cyber-card">
        <div class="card-header">
          <div class="card-title">📱 CONNECTED TELEGRAM ACCOUNTS & DEDICATED APIs</div>
          <button class="cyber-btn btn-outline btn-sm" onclick="refreshDashboardData()">🔄 SYNC ACCOUNTS</button>
        </div>
        <div class="table-responsive">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ACCOUNT NAME</th>
                <th>USERNAME</th>
                <th>PHONE NUMBER</th>
                <th>DEDICATED API_ID</th>
                <th>DEDICATED API_HASH</th>
                <th>ADDED ON</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody id="accounts-table-body">
              <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted);">Loading connected accounts...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         TAB 2: CHANNEL AUTO JOIN & AUTO LEAVE
         ==================================================================== -->
    <div id="tab-channels" class="tab-section">
      <div class="grid-2col">
        <!-- AUTO JOIN CARD -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">📥 AUTO JOIN CHANNEL (ALL IDs)</div>
            <span class="step-badge">MULTI-API ENGINE</span>
          </div>
          <div class="form-group">
            <label class="form-label">CHANNEL @USERNAME OR PRIVATE INVITE LINK</label>
            <input
              type="text"
              id="join-channel-input"
              class="cyber-input"
              placeholder="e.g. @mychannel or https://t.me/+AbCdEfGh"
            />
          </div>
          <button class="cyber-btn btn-green" onclick="triggerJoinChannel()">
            📥 AUTO JOIN FROM ALL CONNECTED ACCOUNTS
          </button>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
            ⚡ Each account will use its own saved <code>API_ID</code> and <code>API_HASH</code> to join automatically!
          </p>
        </div>

        <!-- AUTO LEAVE CARD -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">📤 AUTO LEAVE CHANNEL (ALL IDs)</div>
            <span class="step-badge">INSTANT LEAVE</span>
          </div>
          <div class="form-group">
            <label class="form-label">ENTER CHANNEL NUMBER FROM LIST (OR USE 1-CLICK BELOW)</label>
            <input
              type="number"
              id="leave-channel-number"
              class="cyber-input"
              placeholder="Enter Channel # (e.g. 1, 2, 3)"
            />
          </div>
          <button class="cyber-btn btn-red" onclick="triggerLeaveByNumber()">
            📤 AUTO LEAVE SELECTED CHANNEL (ALL IDs)
          </button>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
            💡 You can also click the red <b>LEAVE ALL IDs</b> button directly on any channel row below!
          </p>
        </div>
      </div>

      <!-- QUICK INTERACTIVE CHANNEL TABLE -->
      <div class="cyber-card">
        <div class="card-header">
          <div class="card-title">📋 REGISTERED CHANNELS & 1-CLICK AUTO LEAVE</div>
          <input
            type="text"
            id="channel-search"
            class="cyber-input"
            style="max-width: 240px; padding: 8px 12px; font-size: 12px;"
            placeholder="🔍 Search channel..."
            oninput="renderChannelsTable()"
          />
        </div>
        <div class="table-responsive">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CHANNEL TITLE</th>
                <th>LINK / USERNAME</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody id="channels-table-body">
              <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted);">Loading channels from Firebase...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         TAB 3: FULL CHANNEL DATABASE
         ==================================================================== -->
    <div id="tab-database" class="tab-section">
      <div class="cyber-card">
        <div class="card-header">
          <div class="card-title">📋 COMPLETE CHANNEL HISTORY & STATUS</div>
          <button class="cyber-btn btn-outline btn-sm" onclick="callBackend('list', {})">🔄 SYNC LIST</button>
        </div>
        <div class="table-responsive">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CHANNEL NAME</th>
                <th>INVITE LINK / ID</th>
                <th>CURRENT STATUS</th>
                <th>QUICK ACTION</th>
              </tr>
            </thead>
            <tbody id="database-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- TOAST CONTAINER -->
  <div id="toast-container"></div>

  <!-- ======================================================================
       3. FRONTEND JAVASCRIPT ENGINE
       ====================================================================== -->
  <script>
    var REQUIRED_PIN = "252010";
    var currentPin = "";
    var cachedAccounts = [];
    var cachedChannels = [];

    // SOUND SYNTHESIZER
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    var audioCtx = AudioContextClass ? new AudioContextClass() : null;

    function playTone(freq, type, duration) {
      try {
        if (!audioCtx) return;
        if (audioCtx.state === "suspended") audioCtx.resume();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {}
    }

    function changeTheme(themeName) {
      document.body.className = themeName;
      showToast("🎨 Theme Updated!", "#00f0ff");
    }

    function toggle2faVisibility() {
      var inp = document.getElementById("login-2fa");
      var btn = document.querySelector(".pwd-toggle-btn");
      if (inp.type === "password") {
        inp.type = "text";
        btn.textContent = "HIDE";
      } else {
        inp.type = "password";
        btn.textContent = "SHOW";
      }
    }

    function showToast(msg, border) {
      var container = document.getElementById("toast-container");
      var toast = document.createElement("div");
      toast.className = "cyber-toast";
      toast.style.borderLeftColor = border || "#00f0ff";
      toast.innerHTML = msg;
      container.appendChild(toast);
      setTimeout(function () {
        toast.remove();
      }, 4000);
    }

    function logToTerminal(htmlContent) {
      var term = document.getElementById("terminal-output");
      var time = new Date().toLocaleTimeString();
      term.innerHTML =
        '<div class="terminal-line"><span style="color:#94a3b8;">[' +
        time +
        "]</span>\\n" +
        htmlContent +
        "</div>" +
        term.innerHTML;
    }

    function clearTerminal() {
      document.getElementById("terminal-output").innerHTML = "⚡ [TERMINAL CLEARED]: Ready for commands...";
    }

    // ======================================================================
    // SECURITY LOCK CONTROLLER (PIN: 252010)
    // ======================================================================
    function updatePinDots() {
      var dots = document.querySelectorAll("#pin-dots .pin-dot");
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.remove("error");
        if (i < currentPin.length) {
          dots[i].classList.add("filled");
        } else {
          dots[i].classList.remove("filled");
        }
      }
      document.getElementById("pin-input").value = currentPin;
    }

    function pressPinDigit(digit) {
      playTone(680, "sine", 0.07);
      if (currentPin.length < 6) {
        currentPin += digit;
        updatePinDots();
        if (currentPin.length === 6) {
          setTimeout(verifyMasterPin, 120);
        }
      }
    }

    function syncPinFromInput(val) {
      currentPin = String(val).replace(/\\D/g, "").slice(0, 6);
      updatePinDots();
      if (currentPin.length === 6) {
        verifyMasterPin();
      }
    }

    function clearPin() {
      playTone(300, "sawtooth", 0.1);
      currentPin = "";
      updatePinDots();
      document.getElementById("lock-status-msg").innerHTML = "🛡️ ENTER 6-DIGIT MASTER PIN";
    }

    function verifyMasterPin() {
      if (currentPin === REQUIRED_PIN) {
        playTone(880, "triangle", 0.15);
        setTimeout(function () {
          playTone(1200, "triangle", 0.22);
        }, 120);
        sessionStorage.setItem("kumar_panel_unlocked", "true");
        document.getElementById("security-lock-screen").classList.add("unlocked");
        showToast("🔓 ACCESS GRANTED! Welcome Kumar.", "#10b981");
        refreshDashboardData();
      } else {
        playTone(180, "sawtooth", 0.3);
        var dots = document.querySelectorAll("#pin-dots .pin-dot");
        for (var i = 0; i < dots.length; i++) {
          dots[i].classList.add("error");
        }
        document.getElementById("lock-status-msg").innerHTML =
          '<span style="color:#ef4444;">❌ ACCESS DENIED! INVALID MASTER PIN!</span>';
        showToast("❌ Invalid Password! Access Denied.", "#ef4444");
        setTimeout(function () {
          currentPin = "";
          updatePinDots();
        }, 500);
      }
    }

    function lockPanelNow() {
      playTone(260, "sine", 0.18);
      sessionStorage.removeItem("kumar_panel_unlocked");
      currentPin = "";
      updatePinDots();
      document.getElementById("security-lock-screen").classList.remove("unlocked");
      showToast("🔒 Control Panel Locked.", "#f59e0b");
    }

    window.addEventListener("DOMContentLoaded", function () {
      if (sessionStorage.getItem("kumar_panel_unlocked") === "true") {
        currentPin = REQUIRED_PIN;
        document.getElementById("security-lock-screen").classList.add("unlocked");
        refreshDashboardData();
      }
    });

    // ======================================================================
    // TAB SWITCHER & CLOCK
    // ======================================================================
    function switchTab(tabId, btnEl) {
      playTone(540, "sine", 0.06);
      var sections = document.querySelectorAll(".tab-section");
      for (var i = 0; i < sections.length; i++) {
        sections[i].classList.remove("active");
      }
      var btns = document.querySelectorAll(".tab-btn");
      for (var j = 0; j < btns.length; j++) {
        btns[j].classList.remove("active");
      }
      document.getElementById(tabId).classList.add("active");
      if (btnEl) btnEl.classList.add("active");
    }

    setInterval(function () {
      var el = document.getElementById("live-clock");
      if (el) el.textContent = "🕒 " + new Date().toLocaleTimeString();
    }, 1000);

    // ======================================================================
    // BACKEND API COMMUNICATOR
    // ======================================================================
    async function callBackend(action, payload) {
      payload = payload || {};
      logToTerminal("⏳ <b>Executing [" + action.toUpperCase() + "]... Please wait...</b>");
      try {
        var bodyObj = {
          action: action,
          webPin: REQUIRED_PIN
        };
        for (var k in payload) {
          bodyObj[k] = payload[k];
        }

        var res = await fetch("/api/panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj)
        });
        var data = await res.json();
        if (data.reply) {
          logToTerminal(data.reply);
        }
        if (data.pendingPhone) {
          document.getElementById("pending-session-box").innerHTML =
            "🟢 <b>Active Session Phone:</b> <code>" +
            data.pendingPhone +
            "</code><br>🔢 <b>API_ID:</b> <code>" +
            (data.pendingApiId || "Set") +
            "</code>";
        }
        refreshDashboardData(true);
        return data;
      } catch (err) {
        logToTerminal("❌ <b>Network Error:</b> " + err.message);
        showToast("❌ Request Failed: " + err.message, "#ef4444");
      }
    }

    async function refreshDashboardData(silent) {
      try {
        var res = await fetch("/api/panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dashboard_stats", webPin: REQUIRED_PIN })
        });
        var data = await res.json();
        if (data.accounts || data.channels) {
          updateTablesAndStats(data.accounts || [], data.channels || [], data.pendingAuth || null);
          if (!silent) showToast("⚡ Synced with Firebase Realtime DB", "#00f0ff");
        }
      } catch (e) {}
    }

    function updateTablesAndStats(accounts, channels, pendingAuth) {
      cachedAccounts = Array.isArray(accounts) ? accounts : [];
      cachedChannels = Array.isArray(channels) ? channels : [];

      document.getElementById("stat-accounts").textContent = cachedAccounts.length;
      document.getElementById("stat-channels").textContent = cachedChannels.length;

      var activeJoined = 0;
      for (var i = 0; i < cachedChannels.length; i++) {
        if (cachedChannels[i] && String(cachedChannels[i].status).indexOf("🟢") !== -1) {
          activeJoined++;
        }
      }
      document.getElementById("stat-joined").textContent = activeJoined;

      var pendingBox = document.getElementById("pending-session-box");
      if (pendingAuth && pendingAuth.phone) {
        pendingBox.innerHTML =
          "🟢 <b>Waiting Verification For:</b> <code>" +
          pendingAuth.phone +
          "</code><br>🔢 <b>Account API_ID:</b> <code>" +
          pendingAuth.apiId +
          "</code>";
      } else {
        pendingBox.innerHTML = "No active OTP session in progress. Fill Steps 1-3 on the left to start!";
      }

      renderAccountsTable();
      renderChannelsTable();
    }

    function renderAccountsTable() {
      var tbody = document.getElementById("accounts-table-body");
      if (!cachedAccounts.length) {
        tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">📭 No Telegram accounts connected yet. Enter API_ID, API_HASH & Phone above!</td></tr>';
        return;
      }
      var html = "";
      for (var i = 0; i < cachedAccounts.length; i++) {
        var acc = cachedAccounts[i];
        var shortHash = acc.apiHash ? String(acc.apiHash).substring(0, 8) + "••••" : "Default";
        html +=
          "<tr>" +
          "<td><b>#" + (i + 1) + "</b></td>" +
          "<td><b>" + (acc.name || "User") + "</b></td>" +
          "<td>@" + (acc.username || "None") + "</td>" +
          "<td><code>" + acc.phone + "</code></td>" +
          '<td><span class="pill-api">' + (acc.apiId || "Default") + "</span></td>" +
          "<td><code>" + shortHash + "</code></td>" +
          "<td>" + (acc.addedOn || "Active") + "</td>" +
          "<td>" +
          '<button class="cyber-btn btn-red btn-sm" onclick="removeAccount(\'' + acc.phone + '\')">🗑️ REMOVE</button>' +
          "</td>" +
          "</tr>";
      }
      tbody.innerHTML = html;
    }

    function renderChannelsTable() {
      var searchEl = document.getElementById("channel-search");
      var q = searchEl ? searchEl.value.toLowerCase() : "";
      var tbody1 = document.getElementById("channels-table-body");
      var tbody2 = document.getElementById("database-table-body");

      if (!cachedChannels.length) {
        var emptyRow =
          '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">📭 No channels registered in Firebase yet.</td></tr>';
        tbody1.innerHTML = emptyRow;
        tbody2.innerHTML = emptyRow;
        return;
      }

      var html = "";
      for (var i = 0; i < cachedChannels.length; i++) {
        var ch = cachedChannels[i];
        var num = i + 1;
        var titleStr = String(ch.title || ch.input);
        var inputStr = String(ch.input || "");
        if (q && titleStr.toLowerCase().indexOf(q) === -1 && inputStr.toLowerCase().indexOf(q) === -1) {
          continue;
        }
        var isJoined = String(ch.status).indexOf("🟢") !== -1;
        var badgeClass = isJoined ? "pill-joined" : "pill-left";

        html +=
          "<tr>" +
          "<td><b>[" + num + "]</b></td>" +
          "<td><b>" + titleStr + "</b></td>" +
          "<td><code>" + inputStr + "</code></td>" +
          '<td><span class="' + badgeClass + '">' + ch.status + "</span></td>" +
          '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button class="cyber-btn btn-red btn-sm" onclick="leaveChannelDirect(' + num + ')">📤 LEAVE ALL IDs</button>' +
          '<button class="cyber-btn btn-outline btn-sm" onclick="rejoinChannelDirect(\'' + inputStr.replace(/'/g, "") + '\')">📥 RE-JOIN</button>' +
          "</td>" +
          "</tr>";
      }

      tbody1.innerHTML = html;
      tbody2.innerHTML = html;
    }

    // ======================================================================
    // ACTION HANDLERS (WITH PER-ACCOUNT API_ID & API_HASH)
    // ======================================================================
    function triggerSendOtp() {
      var apiId = document.getElementById("login-api-id").value.trim();
      var apiHash = document.getElementById("login-api-hash").value.trim();
      var phone = document.getElementById("login-phone").value.trim();

      if (!apiId || !apiHash) {
        showToast("⚠️ Please enter both Account API_ID & API_HASH!", "#f59e0b");
        return;
      }
      if (!phone) {
        showToast("⚠️ Please enter the Phone Number (+91...)!", "#f59e0b");
        return;
      }

      callBackend("send_code", {
        apiId: apiId,
        apiHash: apiHash,
        input: phone
      });
    }

    function triggerVerifyOtp() {
      var otp = document.getElementById("login-otp").value.trim();
      if (!otp) {
        showToast("⚠️ Enter the 5-digit OTP!", "#f59e0b");
        return;
      }
      callBackend("verify_code", { input: otp });
    }

    function triggerVerify2FA() {
      var pwd = document.getElementById("login-2fa").value.trim();
      if (!pwd) {
        showToast("⚠️ Enter your 2FA Cloud Password!", "#f59e0b");
        return;
      }
      callBackend("verify_2fa", { input: pwd });
    }

    function triggerJoinChannel() {
      var ch = document.getElementById("join-channel-input").value.trim();
      if (!ch) {
        showToast("⚠️ Enter a channel link or @username!", "#f59e0b");
        return;
      }
      callBackend("join", { input: ch });
    }

    function triggerLeaveByNumber() {
      var num = document.getElementById("leave-channel-number").value.trim();
      if (!num) {
        showToast("⚠️ Enter a valid channel number!", "#f59e0b");
        return;
      }
      callBackend("leave", { input: num });
    }

    function leaveChannelDirect(channelNumber) {
      callBackend("leave", { input: String(channelNumber) });
    }

    function rejoinChannelDirect(channelLink) {
      callBackend("join", { input: channelLink });
    }

    function removeAccount(phone) {
      if (!confirm("Remove account " + phone + " from panel?")) return;
      callBackend("remove_account", { input: phone });
    }

    // ======================================================================
    // CYBER PARTICLE NETWORK BACKGROUND ANIMATION
    // ======================================================================
    var canvas = document.getElementById("cyber-canvas");
    var ctx = canvas.getContext("2d");
    var particles = [];

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    for (var i = 0; i < 55; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 2 + 1
      });
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "#00f0ff";
        ctx.fill();

        for (var j = i + 1; j < particles.length; j++) {
          var p2 = particles[j];
          var dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = "rgba(0, 240, 255, " + (1 - dist / 130) * 0.25 + ")";
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(drawParticles);
    }
    drawParticles();
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

  // Verify Master PIN 252010 if coming from Web Panel
  if (webPin !== undefined && String(webPin) !== MASTER_PIN) {
    return res.status(403).json({
      nextStep: "",
      reply: "❌ <b>SECURITY ALERT:</b> Invalid Master Password (252010 Required)!"
    });
  }

  try {
    // ================= 0. DASHBOARD STATS & INITIAL LOAD =================
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

    // ================= 1. SAVE DEFAULT/FALLBACK API ID & HASH =================
    if (action === "save_api") {
      const cleanId = parseInt(String(apiId).replace(/\D/g, ""), 10);
      const cleanHash = String(apiHash).replace(/[^a-zA-Z0-9]/g, "").trim();

      if (!cleanId || cleanHash.length < 20) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Invalid API Credentials!</b> Please enter a valid numeric API_ID and 32-character API_HASH."
        });
      }

      await fbSet("panel/api_config", { apiId: cleanId, apiHash: cleanHash });

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔════════════════════════════╗\n" +
          "   ✅ <b>API CREDENTIALS SAVED!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "🔢 <b>API ID:</b> <code>" + cleanId + "</code>\n" +
          "🔑 <b>API HASH:</b> <code>" + cleanHash.substring(0, 10) + "••••••••••</code>"
      });
    }

    // Load Default API Config (used only if an older account or bot call doesn't pass apiId)
    const defaultApiConfig = (await fbGet("panel/api_config")) || {};

    // ================= 2. SEND OTP CODE (USES THIS ACCOUNT'S API_ID & HASH) =================
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
            "❌ Please enter this account's <b>API_ID</b> and <b>API_HASH</b> in boxes 1 & 2 before sending OTP!"
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
          "👉 Now enter the 5-digit OTP in Box 4 and click <b>STEP 2: VERIFY OTP</b>!"
      });
    }

    // ================= 3. VERIFY OTP CODE (SAVES DEDICATED API_ID & HASH) =================
    if (action === "verify_code") {
      const code = String(input || "").replace(/\D/g, "");
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>No Active OTP Session!</b> Please enter API_ID, API_HASH, and Phone Number, then click Send OTP first."
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
              "🛡️ Two-Step Verification is active on this account.\n\n" +
              "👇 <b>Now enter your Cloud Password in the 2FA box on the right and click STEP 3: VERIFY 2FA PASSWORD!</b>"
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
          "🌐 <b>Username:</b> @" + (me.username || "None") + "\n" +
          "📱 <b>Phone Number:</b> <code>" + phone + "</code>\n" +
          "🔢 <b>Saved API_ID:</b> <code>" + accApiId + "</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= 4. VERIFY 2FA PASSWORD (100% FIXED ENGINE) =================
    if (action === "verify_2fa") {
      const password = String(input || "").trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Session Expired!</b> Please send OTP again for this account."
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
          "🌐 <b>Username:</b> @" + (me.username || "None") + "\n" +
          "📱 <b>Phone Number:</b> <code>" + phone + "</code>\n" +
          "🔢 <b>Dedicated API_ID:</b> <code>" + accApiId + "</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= LOAD ALL CONNECTED ACCOUNTS =================
    let accounts = (await fbGet("panel/accounts")) || [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    // ================= REMOVE ACCOUNT =================
    if (action === "remove_account") {
      const targetPhone = String(input || "").trim();
      accounts = accounts.filter(function (a) {
        return a.phone !== targetPhone;
      });
      await fbSet("panel/accounts", accounts);
      return res.status(200).json({
        nextStep: "",
        reply: "🗑️ <b>Account Removed Successfully:</b> <code>" + targetPhone + "</code>"
      });
    }

    // ================= 5. MY ACCOUNTS LIST =================
    if (action === "my_accounts") {
      if (accounts.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>No Connected Accounts!</b> Add your Telegram IDs first."
        });
      }

      let msg =
        "╔════════════════════════════╗\n" +
        "   📱 <b>CONNECTED ACCOUNTS HUB</b>\n" +
        "╚════════════════════════════╝\n" +
        "🔋 <b>Total Active Sessions:</b> <code>" + accounts.length + " IDs</code>\n" +
        "━━━━━━━━━━━━━━━━━━━━━━\n\n";

      for (let i = 0; i < accounts.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + accounts[i].name + "</b>\n" +
          " ┣ 📱 <b>Phone:</b> <code>" + accounts[i].phone + "</code>\n" +
          " ┣ 🔢 <b>API_ID:</b> <code>" + (accounts[i].apiId || defaultApiConfig.apiId || "Set") + "</code>\n" +
          " ┗ 🟢 <b>Status:</b> <code>Online & Ready</code>\n\n";
      }

      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (accounts.length === 0) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>No Active Accounts!</b> Connect at least 1 Telegram ID first."
      });
    }

    // ================= 6. AUTO JOIN CHANNEL (EACH ID USES ITS OWN API_ID/HASH) =================
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

    // ================= 7. LEAVE CHANNEL MENU =================
    if (action === "leave_menu") {
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>No Channels Found!</b> Join a channel first."
        });
      }

      let msg =
        "╔════════════════════════════╗\n" +
        "   📤 <b>SELECT CHANNEL TO LEAVE</b>\n" +
        "╚════════════════════════════╝\n\n";

      for (let i = 0; i < channels.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + channels[i].title + "</b>\n" +
          " ┣ 🔗 <code>" + channels[i].input + "</code>\n" +
          " ┗ 📊 " + channels[i].status + "\n\n";
      }

      msg += "👇 <b>Send the Channel Number (e.g. <code>1</code>) to auto-leave:</b>";
      return res.status(200).json({ nextStep: "wait_leave", reply: msg });
    }

    // ================= 8. AUTO LEAVE CHANNEL (EACH ID USES ITS OWN API_ID/HASH) =================
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
          "🔗 <b>Channel Link:</b> <code>" + targetChannel.input + "</code>\n" +
          "🔴 <b>Left Accounts:</b> <code>" + leftCount + " / " + accounts.length + " IDs</code>"
      });
    }

    // ================= 9. CHANNEL LIST =================
    if (action === "list") {
      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>No channels tracked yet!</b>"
        });
      }

      let msg =
        "╔════════════════════════════╗\n" +
        "   📋 <b>REGISTERED CHANNELS & STATUS</b>\n" +
        "╚════════════════════════════╝\n" +
        "📱 <b>Connected IDs:</b> <code>" + accounts.length + " Accounts</code>\n" +
        "📢 <b>Total Channels:</b> <code>" + channels.length + "</code>\n" +
        "━━━━━━━━━━━━━━━━━━━━━━\n\n";

      for (let i = 0; i < channels.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + channels[i].title + "</b>\n" +
          " ┣ 🔗 <b>Link:</b> <code>" + channels[i].input + "</code>\n" +
          " ┗ 📌 <b>Status:</b> <b>" + channels[i].status + "</b>\n\n";
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
