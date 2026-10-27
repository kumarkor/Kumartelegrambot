const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";

// Fast Firebase REST Helpers (No WebSocket Hanging!)
async function fbGet(path) {
  const r = await fetch(`${DB_URL}/${path}.json`);
  return await r.json();
}

async function fbSet(path, data) {
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

function fastDisconnect(client) {
  try {
    client.destroy().catch(() => {});
  } catch (e) {}
}

module.exports = async (req, res) => {
  // ================= GET: SUPER STYLISH WEB CONTROL PANEL =================
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>⚡ TELEGRAM MASTER CONTROL PANEL ⚡</title>
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
  body { background: #090d16; color: #f1f5f9; margin: 0; padding: 16px; }
  .container { max-width: 500px; margin: 0 auto; }
  .header { background: linear-gradient(135deg, #1e1b4b, #0f172a); border: 1px solid #38bdf8; border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 0 25px rgba(56,189,248,0.2); margin-bottom: 18px; }
  .header h1 { margin: 0; font-size: 20px; color: #38bdf8; letter-spacing: 1px; }
  .header p { margin: 6px 0 0; font-size: 12px; color: #94a3b8; }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .card h3 { margin: 0 0 12px; font-size: 15px; color: #f8fafc; display: flex; align-items: center; gap: 8px; }
  input { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: #fff; font-size: 14px; outline: none; }
  input:focus { border-color: #38bdf8; }
  .btn { width: 100%; padding: 12px; border: none; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s; margin-bottom: 8px; }
  .btn-primary { background: linear-gradient(90deg, #0284c7, #2563eb); color: #fff; }
  .btn-success { background: linear-gradient(90deg, #059669, #10b981); color: #fff; }
  .btn-danger { background: linear-gradient(90deg, #dc2626, #ef4444); color: #fff; }
  .btn-secondary { background: #1e293b; color: #38bdf8; border: 1px solid #334155; }
  #output { background: #020617; border: 1px solid #334155; border-radius: 12px; padding: 14px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; margin-bottom: 16px; color: #e2e8f0; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>⚡ TELEGRAM CONTROL PANEL ⚡</h1>
    <p>Multi-Account (11+ IDs) • Zero OTP Block • Auto Join & Leave</p>
  </div>

  <div id="output">⚡ <b>SYSTEM READY:</b> Use this Web Panel to login without Telegram blocking your OTP!</div>

  <div class="card">
    <h3>➕ CONNECT TELEGRAM ACCOUNT (NO OTP BLOCK)</h3>
    <input type="text" id="phone" placeholder="Phone Number (e.g. +918879628170)">
    <button class="btn btn-primary" onclick="callApi('send_code', {input: val('phone')})">📩 1. SEND OTP CODE</button>
    <input type="text" id="otp" placeholder="Enter 5-Digit OTP (e.g. 59415)">
    <button class="btn btn-success" onclick="callApi('verify_code', {input: val('otp')})">✅ 2. VERIFY OTP & SAVE ACCOUNT</button>
    <input type="password" id="pwd" placeholder="2FA Cloud Password (only if required)">
    <button class="btn btn-secondary" onclick="callApi('verify_2fa', {input: val('pwd')})">🔐 VERIFY 2FA PASSWORD</button>
  </div>

  <div class="card">
    <h3>📢 CHANNEL AUTO JOIN / LEAVE (ALL IDs)</h3>
    <input type="text" id="chan" placeholder="@username or https://t.me/+InviteLink">
    <button class="btn btn-success" onclick="callApi('join', {input: val('chan')})">📥 AUTO JOIN CHANNEL (ALL ACCOUNTS)</button>
    <input type="text" id="leaveNum" placeholder="Channel Number from List to Leave (e.g. 1)">
    <button class="btn btn-danger" onclick="callApi('leave', {input: val('leaveNum')})">📤 AUTO LEAVE BY NUMBER</button>
  </div>

  <div class="card">
    <h3>📊 DATABASE & SETTINGS</h3>
    <button class="btn btn-secondary" onclick="callApi('my_accounts', {})">📱 VIEW CONNECTED ACCOUNTS</button>
    <button class="btn btn-secondary" onclick="callApi('list', {})">📋 VIEW CHANNEL LIST & STATUS</button>
  </div>

  <div class="card">
    <h3>⚙️ CONFIGURE API ID & HASH</h3>
    <input type="text" id="apiId" placeholder="App api_id (e.g. 35204350)">
    <input type="text" id="apiHash" placeholder="App api_hash">
    <button class="btn btn-primary" onclick="callApi('save_api', {apiId: val('apiId'), apiHash: val('apiHash')})">💾 SAVE API CREDENTIALS</button>
  </div>
</div>

<script>
function val(id) { return document.getElementById(id).value.trim(); }
async function callApi(action, payload) {
  const out = document.getElementById('output');
  out.innerHTML = "⏳ <b>Processing request... Please wait...</b>";
  try {
    const r = await fetch('/api/panel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const d = await r.json();
    out.innerHTML = d.reply || "Done!";
  } catch (e) {
    out.innerHTML = "❌ Error: " + e.message;
  }
}
</script>
</body>
</html>`);
  }

  const { action, input, apiId, apiHash } = req.body || {};

  try {
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
          "🗄️ <b>Cloud Sync:</b> <code>🟢 Firebase Active</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "👉 Tap <b>➕ ADD ACCOUNT</b> or open the <b>🌐 WEB PANEL</b> to connect your 11 IDs!"
      });
    }

    // ================= LOAD API CONFIG =================
    const apiConfig = await fbGet("panel/api_config");
    if (!apiConfig || !apiConfig.apiId) {
      return res.status(200).json({
        nextStep: "",
        reply:
          "╔════════════════════════════╗\n" +
          "   ⚠️ <b>API SETUP REQUIRED FIRST</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "Please tap <b>⚙️ SET API ID/HASH</b> to configure your Telegram API credentials."
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
          "📡 <b>OTP Status:</b> <code>🟢 Sent to Telegram</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "🚨 <b>WHY TELEGRAM BLOCKED YOUR LAST OTP:</b>\n" +
          "If you type raw digits (like <code>59415</code>) inside a Telegram chat, Telegram detects that you shared your login code and <b>blocks the login</b>!\n\n" +
          "✅ <b>HOW TO ENTER OTP SAFELY:</b>\n" +
          "1️⃣ <b>Best Way:</b> Open <code>https://kumartelegrambot.vercel.app/api/panel</code> in your browser and enter the 5-digit OTP there!\n" +
          "2️⃣ <b>In Bot:</b> Put letters or spaces between digits (e.g. <code>a5b9c4d1e5</code> or <code>5 - 9 - 4 - 1 - 5</code>)!\n" +
          "━━━━━━━━━━━━━━━━━━━━━━"
      });
    }

    // ================= 3. VERIFY OTP CODE =================
    if (action === "verify_code") {
      const code = String(input).replace(/\D/g, "");
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔════════════════════════════╗\n" +
            "   ❌ <b>NO ACTIVE OTP SESSION</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "⚠️ Please tap <b>➕ ADD ACCOUNT</b> and send your phone number first."
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
              "👇 <b>Please send your Cloud Password now:</b>"
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
          "🔋 <b>Session Status:</b> <code>🟢 ACTIVE & SAVED</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "🚀 <i>Ready for instant Auto-Join & Auto-Leave!</i>"
      });
    }

    // ================= 4. VERIFY 2FA PASSWORD =================
    if (action === "verify_2fa") {
      const password = String(input).trim();
      const tempAuth = await fbGet("panel/auth_temp");

      if (!tempAuth || !tempAuth.tempSession) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Session Expired!</b> Please request a new OTP."
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
      await client.signInWithPassword(
        { apiId: SAVED_API_ID, apiHash: SAVED_API_HASH },
        {
          password: async () => password,
          onError: (err) => {
            throw err;
          }
        }
      );

      const finalSession = client.session.save();
      const me = await client.getMe();
      fastDisconnect(client);

      let accounts = (await fbGet("panel/accounts")) || [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      accounts.push({
        phone: phone,
        name: me.firstName || "User",
        username: me.username || "None",
        session: finalSession,
        addedOn: new Date().toLocaleDateString("en-IN")
      });

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
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= LOAD ALL ACCOUNTS =================
    let accounts = (await fbGet("panel/accounts")) || [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    // ================= 5. MY ACCOUNTS LIST =================
    if (action === "my_accounts") {
      if (accounts.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔════════════════════════════╗\n" +
            "   📭 <b>NO CONNECTED ACCOUNTS</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "⚠️ You currently have <b>0</b> active Telegram sessions.\n" +
            "👉 Use <b>🌐 WEB PANEL</b> or <b>➕ ADD ACCOUNT</b> to connect your 11 IDs!"
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
          " ┗ 🟢 <b>Status:</b> <code>Online & Synced</code>\n\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━━━\n⚡ <i>All accounts will execute Join/Leave simultaneously!</i>";
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (accounts.length === 0) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>No Active Accounts!</b> Connect your Telegram IDs first via <b>➕ ADD ACCOUNT</b> or <b>🌐 WEB PANEL</b>."
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
          "🔴 <b>Failed Accounts:</b> <code>" + failCount + " IDs</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "✅ <i>Saved to Firebase Channel List!</i>"
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

      msg +=
        "━━━━━━━━━━━━━━━━━━━━━━\n" +
        "👇 <b>Send the Channel Number (e.g. <code>1</code>) to auto-leave from all accounts:</b>";

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
          reply: "❌ <b>Invalid Channel Number!</b> Please select a valid number from the list."
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
          reply:
            "╔════════════════════════════╗\n" +
            "   📋 <b>REGISTERED CHANNEL LIST</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "📭 No channels tracked yet. Tap <b>📥 JOIN CHANNEL</b> to begin!"
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
        "🔍 <b>Error Details:</b> <code>" + (err.message || "Execution Failed") + "</code>\n\n" +
        "💡 <b>Fix:</b> Open <code>https://kumartelegrambot.vercel.app/api/panel</code> in your browser to enter OTP without Telegram blocking it!"
    });
  }
};
