const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheckPassword } = require("telegram/Password");

// ============================================================================
// CONFIGURATION & FIREBASE REALTIME DATABASE REST ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";

async function fbGet(path) {
  try {
    const response = await fetch(`${DB_URL}/${path}.json`);
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
    await fetch(`${DB_URL}/${path}.json`, {
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
      client.destroy().catch(() => {});
    }
  } catch (e) {
    // Ignore disconnect cleanup errors
  }
}

// ============================================================================
// HTML MASTER TEMPLATE (1000+ LINES SUPER STYLISH CYBERPUNK UI)
// ============================================================================
function renderMasterWebPanel() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>⚡ TELEGRAM MASTER CONTROL PANEL • SECURITY LOCKED ⚡</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-deep: #030712;
      --bg-panel: #0b1120;
      --bg-card: rgba(15, 23, 42, 0.85);
      --bg-input: #070b14;
      --primary: #00f0ff;
      --primary-glow: rgba(0, 240, 255, 0.35);
      --secondary: #7c3aed;
      --secondary-glow: rgba(124, 58, 237, 0.35);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.35);
      --danger: #ef4444;
      --danger-glow: rgba(239, 68, 68, 0.35);
      --warning: #f59e0b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-color: rgba(56, 189, 248, 0.22);
      --border-bright: rgba(0, 240, 255, 0.6);
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
    }

    /* PARTICLE BACKGROUND CANVAS */
    #cyber-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 0;
      pointer-events: none;
      opacity: 0.45;
    }

    /* ========================================================================
       SECURITY LOCK SCREEN OVERLAY (PASSWORD: 252010)
       ======================================================================== */
    #security-lock-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      transition: opacity 0.5s ease, transform 0.5s ease;
    }

    #security-lock-screen.unlocked {
      opacity: 0;
      pointer-events: none;
      transform: scale(1.08);
    }

    .lock-card {
      width: 100%;
      max-width: 420px;
      background: rgba(11, 17, 32, 0.92);
      border: 1px solid var(--border-bright);
      border-radius: 24px;
      padding: 28px 22px;
      box-shadow: 0 0 50px rgba(0, 240, 255, 0.18), inset 0 0 25px rgba(0, 240, 255, 0.05);
      text-align: center;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(16px);
    }

    .lock-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: -100%;
      width: 200%;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--primary), var(--secondary), transparent);
      animation: scanline 3s linear infinite;
    }

    @keyframes scanline {
      0% { transform: translateX(-50%); }
      100% { transform: translateX(50%); }
    }

    .shield-icon {
      width: 72px;
      height: 72px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: rgba(0, 240, 255, 0.08);
      border: 2px solid var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      box-shadow: 0 0 25px var(--primary-glow);
      animation: pulseGlow 2s infinite alternate;
    }

    @keyframes pulseGlow {
      0% { box-shadow: 0 0 12px var(--primary-glow); transform: scale(0.98); }
      100% { box-shadow: 0 0 30px var(--primary-glow); transform: scale(1.03); }
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
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 20px;
      font-weight: 600;
    }

    .pin-dots-container {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
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
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
    }

    .numpad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .num-btn {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(56, 189, 248, 0.25);
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
      background: rgba(0, 240, 255, 0.15);
      border-color: var(--primary);
      color: var(--primary);
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
      transform: translateY(-2px);
    }

    .num-btn.action-clear {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.3);
      font-size: 15px;
    }

    .num-btn.action-enter {
      color: var(--success);
      border-color: rgba(16, 185, 129, 0.3);
      font-size: 15px;
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
      max-width: 1100px;
      margin: 0 auto;
      padding: 18px 14px 80px;
    }

    /* TOP CYBER HEADER */
    .cyber-header {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(11, 17, 32, 0.95));
      border: 1px solid var(--border-bright);
      border-radius: 20px;
      padding: 22px 24px;
      margin-bottom: 20px;
      box-shadow: 0 0 35px rgba(0, 240, 255, 0.12);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: relative;
      overflow: hidden;
    }

    .brand-zone {
      display: flex;
      align-items: center;
      gap: 16px;
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
      box-shadow: 0 0 20px var(--primary-glow);
    }

    .brand-text h1 {
      font-family: 'Orbitron', sans-serif;
      font-size: 22px;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: 1.5px;
      text-shadow: 0 0 10px var(--primary-glow);
    }

    .brand-text p {
      font-size: 14px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .header-badges {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .cyber-badge {
      background: rgba(0, 240, 255, 0.08);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 8px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
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
       LIVE TELEMETRY STATS GRID
       ======================================================================== */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
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
      font-size: 13px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .stat-value {
      font-family: 'Orbitron', sans-serif;
      font-size: 28px;
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
      margin-bottom: 20px;
      scrollbar-width: none;
    }

    .tabs-bar::-webkit-scrollbar {
      display: none;
    }

    .tab-btn {
      background: rgba(15, 23, 42, 0.8);
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
      background: linear-gradient(90deg, rgba(0, 240, 255, 0.18), rgba(124, 58, 237, 0.18));
      border-color: var(--primary);
      color: var(--primary);
      box-shadow: 0 0 18px rgba(0, 240, 255, 0.2);
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
       PANEL CARDS & FORMS
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
      border-radius: 18px;
      padding: 22px;
      margin-bottom: 18px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(56, 189, 248, 0.15);
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

    .form-group {
      margin-bottom: 14px;
    }

    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .cyber-input {
      width: 100%;
      padding: 13px 15px;
      background: var(--bg-input);
      border: 1px solid rgba(56, 189, 248, 0.28);
      border-radius: 12px;
      color: var(--text-main);
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
    }

    .cyber-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 16px rgba(0, 240, 255, 0.22);
    }

    .cyber-btn {
      width: 100%;
      padding: 13px 18px;
      border: none;
      border-radius: 12px;
      font-family: 'Orbitron', sans-serif;
      font-size: 13px;
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
      background: linear-gradient(90deg, #0284c7, #00f0ff);
      color: #020617;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.25);
    }

    .btn-cyan:hover {
      box-shadow: 0 0 30px rgba(0, 240, 255, 0.5);
      transform: translateY(-2px);
    }

    .btn-green {
      background: linear-gradient(90deg, #059669, #10b981);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
    }

    .btn-green:hover {
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.5);
      transform: translateY(-2px);
    }

    .btn-red {
      background: linear-gradient(90deg, #dc2626, #ef4444);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.25);
    }

    .btn-red:hover {
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.5);
      transform: translateY(-2px);
    }

    .btn-purple {
      background: linear-gradient(90deg, #6d28d9, #9333ea);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(147, 51, 234, 0.25);
    }

    .btn-outline {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--primary);
      color: var(--primary);
    }

    .btn-sm {
      width: auto;
      padding: 8px 14px;
      font-size: 11px;
      margin-bottom: 0;
    }

    /* ========================================================================
       DATA TABLES (ACCOUNTS & CHANNELS)
       ======================================================================== */
    .table-responsive {
      width: 100%;
      overflow-x: auto;
    }

    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .cyber-table th {
      background: rgba(0, 240, 255, 0.08);
      color: var(--primary);
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-color);
      letter-spacing: 1px;
    }

    .cyber-table td {
      padding: 13px 14px;
      border-bottom: 1px solid rgba(56, 189, 248, 0.1);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--text-main);
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

    /* ========================================================================
       LIVE CYBER TERMINAL LOG CONSOLE
       ======================================================================== */
    .terminal-box {
      background: #020617;
      border: 1px solid var(--border-bright);
      border-radius: 16px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #38bdf8;
      max-height: 280px;
      overflow-y: auto;
      line-height: 1.65;
      box-shadow: inset 0 0 20px rgba(0, 240, 255, 0.08);
      white-space: pre-wrap;
    }

    .terminal-line {
      margin-bottom: 8px;
      border-left: 2px solid var(--primary);
      padding-left: 10px;
    }

    /* TOAST ALERT */
    #toast-container {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cyber-toast {
      background: rgba(11, 17, 32, 0.96);
      border-left: 4px solid var(--primary);
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 14px 18px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      animation: slideIn 0.25s ease;
      max-width: 340px;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @media (max-width: 640px) {
      .brand-text h1 { font-size: 17px; }
      .stat-value { font-size: 22px; }
      .cyber-header { padding: 16px; }
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

      <div id="lock-status-msg">🛡️ PROTECTED BY KUMAR CYBER-FIREWALL V4.0</div>
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
          <p>Multi-Account (11+ IDs) • Auto Channel Join & Leave Engine</p>
        </div>
      </div>
      <div class="header-badges">
        <div class="cyber-badge">
          <span class="status-dot"></span>
          <span>FIREBASE CLOUD SYNC</span>
        </div>
        <div class="cyber-badge" id="live-clock">00:00:00</div>
        <button class="btn-lock-now" onclick="lockPanelNow()">🔒 LOCK PANEL</button>
      </div>
    </header>

    <!-- TELEMETRY STATS -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">📱 Connected Accounts</div>
        <div class="stat-value" id="stat-accounts">0</div>
        <div class="stat-sub">🟢 Ready for Multi-Join</div>
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
      <button class="tab-btn active" onclick="switchTab('tab-channels', this)">📢 CHANNEL CONTROL</button>
      <button class="tab-btn" onclick="switchTab('tab-accounts', this)">➕ ADD / MANAGE IDs</button>
      <button class="tab-btn" onclick="switchTab('tab-database', this)">📋 CHANNEL LIST</button>
      <button class="tab-btn" onclick="switchTab('tab-api', this)">⚙️ API CONFIG</button>
    </nav>

    <!-- LIVE OUTPUT CONSOLE (VISIBLE ACROSS ALL TABS) -->
    <div class="cyber-card">
      <div class="card-header">
        <div class="card-title">🖥️ LIVE EXECUTION TERMINAL</div>
        <button class="cyber-btn btn-outline btn-sm" onclick="refreshDashboardData()">🔄 REFRESH DATA</button>
      </div>
      <div class="terminal-box" id="terminal-output">⚡ [SYSTEM READY]: Welcome Kumar! Master Control Panel unlocked. Select any action below...</div>
    </div>

    <!-- ====================================================================
         TAB 1: CHANNEL AUTO JOIN & AUTO LEAVE
         ==================================================================== -->
    <div id="tab-channels" class="tab-section active">
      <div class="grid-2col">
        <!-- AUTO JOIN CARD -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">📥 AUTO JOIN CHANNEL (ALL IDs)</div>
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
            ⚡ Supports both Public Channels (<code>@username</code>) and Private Invite Links (<code>https://t.me/+...</code>).
          </p>
        </div>

        <!-- AUTO LEAVE CARD -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">📤 AUTO LEAVE CHANNEL (ALL IDs)</div>
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
            💡 Tip: You can also leave any channel with 1-Click from the table below!
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
         TAB 2: ADD & MANAGE 11+ TELEGRAM ACCOUNTS (ZERO OTP BLOCK)
         ==================================================================== -->
    <div id="tab-accounts" class="tab-section">
      <div class="grid-2col">
        <!-- STEP 1 & 2: PHONE + OTP -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">➕ CONNECT TELEGRAM ACCOUNT (NO OTP BLOCK)</div>
          </div>

          <div class="form-group">
            <label class="form-label">1. PHONE NUMBER (WITH COUNTRY CODE)</label>
            <input
              type="text"
              id="login-phone"
              class="cyber-input"
              placeholder="+918879628170"
            />
          </div>
          <button class="cyber-btn btn-cyan" onclick="triggerSendOtp()">
            📩 1. SEND LOGIN OTP CODE
          </button>

          <hr style="border: none; border-top: 1px solid rgba(56,189,248,0.15); margin: 16px 0;" />

          <div class="form-group">
            <label class="form-label">2. ENTER 5-DIGIT TELEGRAM OTP</label>
            <input
              type="text"
              id="login-otp"
              class="cyber-input"
              placeholder="Enter 5-digit OTP (e.g. 58765)"
            />
          </div>
          <button class="cyber-btn btn-green" onclick="triggerVerifyOtp()">
            ✅ 2. VERIFY OTP & SAVE ACCOUNT
          </button>
        </div>

        <!-- STEP 3: 2FA CLOUD PASSWORD -->
        <div class="cyber-card">
          <div class="card-header">
            <div class="card-title">🔐 TWO-STEP VERIFICATION (2FA PASSWORD)</div>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
            🛡️ If your Telegram account has a <b>2FA Cloud Password</b> enabled, enter it below after verifying your OTP:
          </p>
          <div class="form-group">
            <label class="form-label">TELEGRAM CLOUD PASSWORD</label>
            <input
              type="password"
              id="login-2fa"
              class="cyber-input"
              placeholder="Enter your 2FA Cloud Password"
            />
          </div>
          <button class="cyber-btn btn-purple" onclick="triggerVerify2FA()">
            🔐 3. VERIFY 2FA PASSWORD & CONNECT
          </button>
        </div>
      </div>

      <!-- CONNECTED ACCOUNTS TABLE -->
      <div class="cyber-card">
        <div class="card-header">
          <div class="card-title">📱 CONNECTED TELEGRAM ACCOUNTS (11+ IDs HUB)</div>
        </div>
        <div class="table-responsive">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ACCOUNT NAME</th>
                <th>USERNAME</th>
                <th>PHONE NUMBER</th>
                <th>ADDED DATE</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody id="accounts-table-body">
              <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted);">Loading connected accounts...</td>
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
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
          All channels joined or left via either the Web Panel or Telegram Bot are synced here in real time.
        </p>
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

    <!-- ====================================================================
         TAB 4: API CREDENTIALS CONFIGURATION
         ==================================================================== -->
    <div id="tab-api" class="tab-section">
      <div class="cyber-card">
        <div class="card-header">
          <div class="card-title">⚙️ TELEGRAM MTPROTO API CONFIGURATION</div>
        </div>
        <div class="form-group">
          <label class="form-label">APP API_ID (NUMERIC)</label>
          <input
            type="text"
            id="config-api-id"
            class="cyber-input"
            placeholder="e.g. 35204350"
          />
        </div>
        <div class="form-group">
          <label class="form-label">APP API_HASH (32 CHARACTERS)</label>
          <input
            type="text"
            id="config-api-hash"
            class="cyber-input"
            placeholder="e.g. 94b559230940e2c73bd1cfffa714ea11"
          />
        </div>
        <button class="cyber-btn btn-cyan" onclick="triggerSaveApi()">
          💾 SAVE API ID & HASH TO FIREBASE
        </button>
      </div>
    </div>
  </div>

  <!-- TOAST CONTAINER -->
  <div id="toast-container"></div>

  <!-- ======================================================================
       3. FRONTEND JAVASCRIPT ENGINE (SOUND FX, SECURITY PIN, AJAX, CANVAS)
       ====================================================================== -->
  <script>
    const REQUIRED_PIN = "252010";
    let currentPin = "";
    let cachedAccounts = [];
    let cachedChannels = [];

    // WEB AUDIO SYNTH SOUND EFFECTS
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playTone(freq, type, duration) {
      try {
        if (audioCtx.state === "suspended") audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
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

    function showToast(msg, border = "#00f0ff") {
      const container = document.getElementById("toast-container");
      const toast = document.createElement("div");
      toast.className = "cyber-toast";
      toast.style.borderLeftColor = border;
      toast.innerHTML = msg;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    function logToTerminal(htmlContent) {
      const term = document.getElementById("terminal-output");
      const time = new Date().toLocaleTimeString();
      term.innerHTML =
        '<div class="terminal-line"><span style="color:#94a3b8;">[' +
        time +
        ']</span>\\n' +
        htmlContent +
        "</div>" +
        term.innerHTML;
    }

    // ======================================================================
    // SECURITY LOCK CONTROLLER (PIN: 252010)
    // ======================================================================
    function updatePinDots() {
      const dots = document.querySelectorAll("#pin-dots .pin-dot");
      dots.forEach((dot, idx) => {
        dot.classList.remove("error");
        if (idx < currentPin.length) {
          dot.classList.add("filled");
        } else {
          dot.classList.remove("filled");
        }
      });
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
      currentPin = val.replace(/\\D/g, "").slice(0, 6);
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
        setTimeout(() => playTone(1200, "triangle", 0.22), 120);
        sessionStorage.setItem("kumar_panel_unlocked", "true");
        document.getElementById("security-lock-screen").classList.add("unlocked");
        showToast("🔓 ACCESS GRANTED! Welcome Kumar.", "#10b981");
        refreshDashboardData();
      } else {
        playTone(180, "sawtooth", 0.3);
        const dots = document.querySelectorAll("#pin-dots .pin-dot");
        dots.forEach((d) => d.classList.add("error"));
        document.getElementById("lock-status-msg").innerHTML =
          '<span style="color:#ef4444;">❌ ACCESS DENIED! INVALID MASTER PIN!</span>';
        showToast("❌ Invalid Password! Access Denied.", "#ef4444");
        setTimeout(() => {
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

    // Check if already unlocked in current browser tab
    window.addEventListener("DOMContentLoaded", () => {
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
      document.querySelectorAll(".tab-section").forEach((s) => s.classList.remove("active"));
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.getElementById(tabId).classList.add("active");
      btnEl.classList.add("active");
    }

    setInterval(() => {
      const el = document.getElementById("live-clock");
      if (el) el.textContent = "🕒 " + new Date().toLocaleTimeString();
    }, 1000);

    // ======================================================================
    // BACKEND API COMMUNICATOR
    // ======================================================================
    async function callBackend(action, payload = {}) {
      logToTerminal("⏳ <b>Executing [" + action.toUpperCase() + "]... Please wait...</b>");
      try {
        const res = await fetch("/api/panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            webPin: REQUIRED_PIN,
            ...payload
          })
        });
        const data = await res.json();
        if (data.reply) {
          logToTerminal(data.reply);
        }
        if (data.accounts || data.channels) {
          updateTablesAndStats(data.accounts, data.channels);
        } else {
          refreshDashboardData(true);
        }
        return data;
      } catch (err) {
        logToTerminal("❌ <b>Network Error:</b> " + err.message);
        showToast("❌ Request Failed: " + err.message, "#ef4444");
      }
    }

    async function refreshDashboardData(silent = false) {
      try {
        const res = await fetch("/api/panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dashboard_stats", webPin: REQUIRED_PIN })
        });
        const data = await res.json();
        if (data.accounts || data.channels) {
          updateTablesAndStats(data.accounts || [], data.channels || []);
          if (!silent) showToast("⚡ Synced with Firebase Realtime DB", "#00f0ff");
        }
      } catch (e) {}
    }

    function updateTablesAndStats(accounts, channels) {
      cachedAccounts = Array.isArray(accounts) ? accounts : [];
      cachedChannels = Array.isArray(channels) ? channels : [];

      document.getElementById("stat-accounts").textContent = cachedAccounts.length;
      document.getElementById("stat-channels").textContent = cachedChannels.length;

      const activeJoined = cachedChannels.filter((c) => c && String(c.status).includes("🟢")).length;
      document.getElementById("stat-joined").textContent = activeJoined;

      renderAccountsTable();
      renderChannelsTable();
    }

    function renderAccountsTable() {
      const tbody = document.getElementById("accounts-table-body");
      if (!cachedAccounts.length) {
        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">📭 No Telegram accounts connected yet. Add your 11 IDs above!</td></tr>';
        return;
      }
      tbody.innerHTML = cachedAccounts
        .map(
          (acc, i) => \`
        <tr>
          <td><b>#\${i + 1}</b></td>
          <td>\${acc.name || "User"}</td>
          <td>@\${acc.username || "None"}</td>
          <td><code>\${acc.phone}</code></td>
          <td>\${acc.addedOn || "Active"}</td>
          <td>
            <button class="cyber-btn btn-red btn-sm" onclick="removeAccount('\${acc.phone}')">🗑️ REMOVE</button>
          </td>
        </tr>\`
        )
        .join("");
    }

    function renderChannelsTable() {
      const q = (document.getElementById("channel-search")?.value || "").toLowerCase();
      const tbody1 = document.getElementById("channels-table-body");
      const tbody2 = document.getElementById("database-table-body");

      if (!cachedChannels.length) {
        const emptyRow =
          '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">📭 No channels registered in Firebase yet.</td></tr>';
        tbody1.innerHTML = emptyRow;
        tbody2.innerHTML = emptyRow;
        return;
      }

      const rowsHtml = cachedChannels
        .map((ch, idx) => ({ ch, num: idx + 1 }))
        .filter(
          (item) =>
            !q ||
            String(item.ch.title).toLowerCase().includes(q) ||
            String(item.ch.input).toLowerCase().includes(q)
        )
        .map((item) => {
          const isJoined = String(item.ch.status).includes("🟢");
          const badgeClass = isJoined ? "pill-joined" : "pill-left";
          return \`
          <tr>
            <td><b>[\${item.num}]</b></td>
            <td><b>\${item.ch.title || item.ch.input}</b></td>
            <td><code>\${item.ch.input}</code></td>
            <td><span class="\${badgeClass}">\${item.ch.status}</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="cyber-btn btn-red btn-sm" onclick="leaveChannelDirect(\${item.num})">📤 LEAVE ALL IDs</button>
              <button class="cyber-btn btn-outline btn-sm" onclick="rejoinChannelDirect('\${item.ch.input}')">📥 RE-JOIN</button>
            </td>
          </tr>\`;
        })
        .join("");

      tbody1.innerHTML = rowsHtml;
      tbody2.innerHTML = rowsHtml;
    }

    // ======================================================================
    // ACTION HANDLERS
    // ======================================================================
    function triggerSendOtp() {
      const phone = document.getElementById("login-phone").value.trim();
      if (!phone) return showToast("⚠️ Enter a valid phone number!", "#f59e0b");
      callBackend("send_code", { input: phone });
    }

    function triggerVerifyOtp() {
      const otp = document.getElementById("login-otp").value.trim();
      if (!otp) return showToast("⚠️ Enter the 5-digit OTP!", "#f59e0b");
      callBackend("verify_code", { input: otp });
    }

    function triggerVerify2FA() {
      const pwd = document.getElementById("login-2fa").value.trim();
      if (!pwd) return showToast("⚠️ Enter your 2FA Cloud Password!", "#f59e0b");
      callBackend("verify_2fa", { input: pwd });
    }

    function triggerJoinChannel() {
      const ch = document.getElementById("join-channel-input").value.trim();
      if (!ch) return showToast("⚠️ Enter a channel link or @username!", "#f59e0b");
      callBackend("join", { input: ch });
    }

    function triggerLeaveByNumber() {
      const num = document.getElementById("leave-channel-number").value.trim();
      if (!num) return showToast("⚠️ Enter a valid channel number!", "#f59e0b");
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

    function triggerSaveApi() {
      const apiId = document.getElementById("config-api-id").value.trim();
      const apiHash = document.getElementById("config-api-hash").value.trim();
      if (!apiId || !apiHash) return showToast("⚠️ Enter both API ID & Hash!", "#f59e0b");
      callBackend("save_api", { apiId, apiHash });
    }

    // ======================================================================
    // CYBER PARTICLE NETWORK BACKGROUND ANIMATION
    // ======================================================================
    const canvas = document.getElementById("cyber-canvas");
    const ctx = canvas.getContext("2d");
    let particles = [];

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    for (let i = 0; i < 55; i++) {
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
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "#00f0ff";
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          let p2 = particles[j];
          let dist = Math.hypot(p.x - p2.x, p.y - p2.y);
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
// MAIN SERVERLESS API HANDLER (SUPPORTS BOTH WEB DASHBOARD & TELEGRAM BOT)
// ============================================================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderMasterWebPanel());
  }

  const { action, input, apiId, apiHash, webPin } = req.body || {};

  // If request comes from Web Dashboard stats/remove, verify Master PIN 252010
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
      const safeAccounts = accounts.map((a) => ({
        phone: a.phone,
        name: a.name,
        username: a.username,
        addedOn: a.addedOn
      }));

      let channels = (await fbGet("panel/channels")) || [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      return res.status(200).json({
        accounts: safeAccounts,
        channels: channels
      });
    }

    // ================= 1. SAVE API ID & HASH =================
    if (action === "save_api") {
      const cleanId = parseInt(String(apiId).replace(/\D/g, ""), 10);
      const cleanHash = String(apiHash).replace(/[^a-zA-Z0-9]/g, "").trim();

      if (!cleanId || cleanHash.length < 20) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔════════════════════════════╗\n" +
            "   ❌ <b>INVALID API CREDENTIALS</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "⚠️ Please provide a valid numeric <b>API ID</b> and 32-char <b>API Hash</b>."
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
          "🔑 <b>API HASH:</b> <code>" + cleanHash.substring(0, 10) + "••••••••••</code>\n" +
          "🗄️ <b>Cloud Sync:</b> <code>🟢 Firebase Active</code>"
      });
    }

    // ================= LOAD SAVED API CONFIG =================
    const apiConfig = await fbGet("panel/api_config");
    if (!apiConfig || !apiConfig.apiId) {
      return res.status(200).json({
        nextStep: "",
        reply:
          "╔════════════════════════════╗\n" +
          "   ⚠️ <b>API SETUP REQUIRED FIRST</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "Please configure your Telegram API ID and API Hash first."
      });
    }
    const SAVED_API_ID = Number(apiConfig.apiId);
    const SAVED_API_HASH = String(apiConfig.apiHash);

    // ================= 2. SEND OTP CODE =================
    if (action === "send_code") {
      const phone = "+" + String(input).replace(/\D/g, "");
      if (phone.length < 10) {
        return res.status(200).json({
          nextStep: "add_phone",
          reply: "❌ <b>Invalid Phone Number!</b> Example: <code>+918879628170</code>"
        });
      }

      const client = new TelegramClient(
        new StringSession(""),
        SAVED_API_ID,
        SAVED_API_HASH,
        { connectionRetries: 2 }
      );

      await client.connect();

      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: SAVED_API_ID,
          apiHash: SAVED_API_HASH,
          settings: new Api.CodeSettings({})
        })
      );

      const tempSession = client.session.save();
      fastDisconnect(client);

      await fbSet("panel/auth_temp", {
        phone: phone,
        phoneCodeHash: result.phoneCodeHash,
        tempSession: tempSession,
        time: Date.now()
      });

      return res.status(200).json({
        nextStep: "wait_otp",
        reply:
          "╔════════════════════════════╗\n" +
          "   📩 <b>LOGIN OTP DISPATCHED!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "📱 <b>Target Account:</b> <code>" + phone + "</code>\n" +
          "📡 <b>OTP Status:</b> <code>🟢 Sent to Telegram App</code>\n\n" +
          "👉 Enter the 5-digit OTP in Step 2 and click <b>VERIFY OTP</b>!"
      });
    }

    // ================= 3. VERIFY OTP CODE =================
    if (action === "verify_code") {
      const code = String(input).replace(/\D/g, "");
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>No Active OTP Session!</b> Please request OTP first."
        });
      }

      const { phone, phoneCodeHash, tempSession } = tempAuth;
      const client = new TelegramClient(
        new StringSession(tempSession),
        SAVED_API_ID,
        SAVED_API_HASH,
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
        if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
          const updatedSession = client.session.save();
          fastDisconnect(client);
          await fbSet("panel/auth_temp", {
            phone: phone,
            phoneCodeHash: phoneCodeHash,
            tempSession: updatedSession,
            time: Date.now()
          });

          return res.status(200).json({
            nextStep: "wait_2fa",
            reply:
              "╔════════════════════════════╗\n" +
              "   🔐 <b>2FA PASSWORD REQUIRED</b>\n" +
              "╚════════════════════════════╝\n\n" +
              "🛡️ Two-Step Verification is active on <code>" + phone + "</code>.\n" +
              "👇 <b>Enter your Cloud Password in the 2FA box and click VERIFY 2FA PASSWORD!</b>"
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
          accounts[i].name = me.firstName || "User";
          accounts[i].username = me.username || "None";
          exists = true;
          break;
        }
      }

      if (!exists) {
        accounts.push({
          phone: phone,
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
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= 4. VERIFY 2FA PASSWORD (OFFICIAL GRAMJS) =================
    if (action === "verify_2fa") {
      const password = String(input).trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Session Expired!</b> Please send OTP again."
        });
      }

      const { phone, tempSession } = tempAuth;
      const client = new TelegramClient(
        new StringSession(tempSession),
        SAVED_API_ID,
        SAVED_API_HASH,
        { connectionRetries: 2 }
      );

      await client.connect();

      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheckPassword(passwordInfo, password);
      await client.invoke(
        new Api.auth.CheckPassword({
          password: passwordCheck
        })
      );

      const finalSession = client.session.save();
      const me = await client.getMe();
      fastDisconnect(client);

      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      let exists = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].phone === phone) {
          accounts[i].session = finalSession;
          accounts[i].name = me.firstName || "User";
          accounts[i].username = me.username || "None";
          exists = true;
          break;
        }
      }

      if (!exists) {
        accounts.push({
          phone: phone,
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
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= LOAD CONNECTED ACCOUNTS =================
    let accounts = (await fbGet("panel/accounts")) || [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    // ================= REMOVE ACCOUNT =================
    if (action === "remove_account") {
      const targetPhone = String(input).trim();
      accounts = accounts.filter((a) => a.phone !== targetPhone);
      await fbSet("panel/accounts", accounts);
      return res.status(200).json({
        nextStep: "",
        reply: "🗑️ <b>Account Removed:</b> <code>" + targetPhone + "</code>"
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

    // ================= 6. AUTO JOIN CHANNEL (ALL IDs) =================
    if (action === "join") {
      const channelInput = String(input).trim();
      let title = channelInput;
      let targetId = channelInput;
      let successCount = 0;
      let failCount = 0;

      await Promise.allSettled(
        accounts.map(async (acc) => {
          const client = new TelegramClient(
            new StringSession(acc.session),
            SAVED_API_ID,
            SAVED_API_HASH,
            { connectionRetries: 2 }
          );
          try {
            await client.connect();
            if (channelInput.indexOf("+") !== -1 || channelInput.indexOf("joinchat/") !== -1) {
              let hash = channelInput.split("+").pop().split("joinchat/").pop().replace("/", "").trim();
              const result = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
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
            if (e.message && e.message.includes("USER_ALREADY_PARTICIPANT")) {
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

    // ================= 8. AUTO LEAVE CHANNEL (ALL IDs) =================
    if (action === "leave") {
      const index = parseInt(String(input).trim(), 10) - 1;
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
        accounts.map(async (acc) => {
          const client = new TelegramClient(
            new StringSession(acc.session),
            SAVED_API_ID,
            SAVED_API_HASH,
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
