const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set } = require("firebase/database");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const firebaseConfig = {
  apiKey: "AIzaSyBEADAZC32ZbDyg3Fhl73KMZgQJ2meDHXs",
  authDomain: "kumartelegrambot.firebaseapp.com",
  databaseURL: "https://kumartelegrambot-default-rtdb.firebaseio.com",
  projectId: "kumartelegrambot",
  storageBucket: "kumartelegrambot.firebasestorage.app",
  messagingSenderId: "1010297894672",
  appId: "1:1010297894672:web:e7a9b2dc8b702587215795"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getDatabase(app);

// Non-blocking disconnect so Vercel never hangs
async function safeDisconnect(client) {
  try {
    await Promise.race([
      client.destroy(),
      new Promise((resolve) => setTimeout(resolve, 400))
    ]);
  } catch (e) {}
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).json({ reply: "⚡ TELEGRAM CONTROL PANEL API IS ONLINE ⚡" });
  }

  const { action, input, apiId, apiHash } = req.body;

  try {
    // ================= 1. SAVE API ID & HASH =================
    if (action === "save_api") {
      const cleanId = parseInt(String(apiId).replace(/\D/g, ""), 10);
      const cleanHash = String(apiHash).replace(/[^a-zA-Z0-9]/g, "").trim();

      if (!cleanId || cleanHash.length < 20) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔══════════════════════════╗\n" +
            "   ❌ <b>INVALID API CREDENTIALS</b>\n" +
            "╚══════════════════════════╝\n\n" +
            "⚠️ Please enter a valid <b>App api_id</b> and <b>App api_hash</b> from <code>my.telegram.org</code>."
        });
      }

      await set(ref(db, "panel/api_config"), { apiId: cleanId, apiHash: cleanHash });

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔══════════════════════════╗\n" +
          "   ✅ <b>API CONFIGURED SUCCESSFULLY</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "🔢 <b>API ID:</b> <code>" + cleanId + "</code>\n" +
          "🔑 <b>API HASH:</b> <code>" + cleanHash.substring(0, 10) + "••••••••••</code>\n" +
          "🗄️ <b>Database:</b> <code>Firebase Connected</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "👉 Now tap <b>➕ ADD ACCOUNT</b> to connect your Telegram accounts!"
      });
    }

    // ================= CHECK API CONFIG =================
    const apiSnap = await get(ref(db, "panel/api_config"));
    if (!apiSnap.exists()) {
      return res.status(200).json({
        nextStep: "",
        reply:
          "╔══════════════════════════╗\n" +
          "   ⚠️ <b>API CONFIGURATION REQUIRED</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "Please tap <b>⚙️ SET API ID/HASH</b> first to configure your Telegram API credentials."
      });
    }
    const { apiId: SAVED_API_ID, apiHash: SAVED_API_HASH } = apiSnap.val();

    // ================= 2. SEND OTP CODE =================
    if (action === "send_code") {
      const phone = "+" + String(input).replace(/\D/g, "");
      const client = new TelegramClient(
        new StringSession(""),
        Number(SAVED_API_ID),
        SAVED_API_HASH,
        { connectionRetries: 3 }
      );

      await client.connect();

      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: Number(SAVED_API_ID),
          apiHash: SAVED_API_HASH,
          settings: new Api.CodeSettings({})
        })
      );

      const tempSession = client.session.save();

      await set(ref(db, "panel/auth_temp"), {
        phone: phone,
        phoneCodeHash: result.phoneCodeHash,
        tempSession: tempSession,
        timestamp: Date.now()
      });

      await safeDisconnect(client);

      return res.status(200).json({
        nextStep: "wait_otp",
        reply:
          "╔══════════════════════════╗\n" +
          "   📩 <b>VERIFICATION CODE SENT</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "📱 <b>Target Phone:</b> <code>" + phone + "</code>\n" +
          "📡 <b>Status:</b> <code>Waiting for OTP...</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "⚠️ <b>CRITICAL SECURITY RULE:</b>\n" +
          "Do <b>NOT</b> send the 5-digit code directly! Always put <b>SPACES</b> between digits so Telegram does not expire it:\n\n" +
          "✅ <b>Correct Format:</b> <code>1 2 3 4 5</code>\n" +
          "❌ <b>Wrong Format:</b> <code>12345</code>\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "👇 <i>Send your spaced 5-digit OTP now:</i>"
      });
    }

    // ================= 3. VERIFY OTP & LOGIN =================
    if (action === "verify_code") {
      const code = String(input).replace(/\D/g, "");
      const snap = await get(ref(db, "panel/auth_temp"));

      if (!snap.exists()) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔══════════════════════════╗\n" +
            "   ❌ <b>LOGIN SESSION NOT FOUND</b>\n" +
            "╚══════════════════════════╝\n\n" +
            "⚠️ Please tap <b>➕ ADD ACCOUNT</b> and send your phone number again."
        });
      }

      const { phone, phoneCodeHash, tempSession } = snap.val();
      const client = new TelegramClient(
        new StringSession(tempSession),
        Number(SAVED_API_ID),
        SAVED_API_HASH,
        { connectionRetries: 3 }
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
          await set(ref(db, "panel/auth_temp"), {
            phone: phone,
            phoneCodeHash: phoneCodeHash,
            tempSession: updatedSession,
            timestamp: Date.now()
          });
          await safeDisconnect(client);

          return res.status(200).json({
            nextStep: "wait_2fa",
            reply:
              "╔══════════════════════════╗\n" +
              "   🔐 <b>2FA PASSWORD REQUIRED</b>\n" +
              "╚══════════════════════════╝\n\n" +
              "🛡️ Two-Step Verification is enabled on <code>" + phone + "</code>.\n\n" +
              "👇 <i>Please send your Telegram Cloud Password now:</i>"
          });
        }
        await safeDisconnect(client);
        throw err;
      }

      const finalSession = client.session.save();
      const me = await client.getMe();
      await safeDisconnect(client);

      const accSnap = await get(ref(db, "panel/accounts"));
      let accounts = accSnap.exists() ? accSnap.val() : [];
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

      await set(ref(db, "panel/accounts"), accounts);
      await set(ref(db, "panel/auth_temp"), null);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔══════════════════════════╗\n" +
          "   🎉 <b>ACCOUNT CONNECTED!</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "👤 <b>Account Name:</b> " + (me.firstName || "User") + "\n" +
          "🌐 <b>Username:</b> @" + (me.username || "None") + "\n" +
          "📱 <b>Phone Number:</b> <code>" + phone + "</code>\n" +
          "🔋 <b>Session Status:</b> <code>🟢 ACTIVE</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "⚡ <i>Tap <b>➕ ADD ACCOUNT</b> to add more IDs or <b>📥 JOIN CHANNEL</b> to start!</i>"
      });
    }

    // ================= 4. VERIFY 2FA PASSWORD =================
    if (action === "verify_2fa") {
      const password = String(input).trim();
      const snap = await get(ref(db, "panel/auth_temp"));

      if (!snap.exists()) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Session Expired!</b> Please tap <b>➕ ADD ACCOUNT</b> again."
        });
      }

      const { phone, tempSession } = snap.val();
      const client = new TelegramClient(
        new StringSession(tempSession),
        Number(SAVED_API_ID),
        SAVED_API_HASH,
        { connectionRetries: 3 }
      );

      await client.connect();
      await client.signInWithPassword(
        { apiId: Number(SAVED_API_ID), apiHash: SAVED_API_HASH },
        {
          password: async () => password,
          onError: (err) => {
            throw err;
          }
        }
      );

      const finalSession = client.session.save();
      const me = await client.getMe();
      await safeDisconnect(client);

      const accSnap = await get(ref(db, "panel/accounts"));
      let accounts = accSnap.exists() ? accSnap.val() : [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      accounts.push({
        phone: phone,
        name: me.firstName || "User",
        username: me.username || "None",
        session: finalSession,
        addedOn: new Date().toLocaleDateString("en-IN")
      });

      await set(ref(db, "panel/accounts"), accounts);
      await set(ref(db, "panel/auth_temp"), null);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔══════════════════════════╗\n" +
          "   🎉 <b>2FA VERIFIED & CONNECTED!</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "👤 <b>Name:</b> " + (me.firstName || "User") + "\n" +
          "📱 <b>Phone:</b> <code>" + phone + "</code>\n" +
          "📊 <b>Total Connected IDs:</b> <code>" + accounts.length + " Accounts</code>"
      });
    }

    // ================= LOAD CONNECTED ACCOUNTS =================
    const accSnap = await get(ref(db, "panel/accounts"));
    let accounts = accSnap.exists() ? accSnap.val() : [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    // ================= 5. MY ACCOUNTS LIST =================
    if (action === "my_accounts") {
      if (accounts.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔══════════════════════════╗\n" +
            "   📭 <b>NO ACCOUNTS CONNECTED</b>\n" +
            "╚══════════════════════════╝\n\n" +
            "⚠️ You have <b>0</b> connected Telegram accounts.\n" +
            "👉 Tap <b>➕ ADD ACCOUNT</b> below to connect your 11 IDs!"
        });
      }

      let msg =
        "╔══════════════════════════╗\n" +
        "   📱 <b>CONNECTED ACCOUNTS MANAGER</b>\n" +
        "╚══════════════════════════╝\n" +
        "🔋 <b>Total Active IDs:</b> <code>" + accounts.length + " Accounts</code>\n" +
        "━━━━━━━━━━━━━━━━━━━━━━\n\n";

      for (let i = 0; i < accounts.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + accounts[i].name + "</b>\n" +
          " ┣ 📱 <b>Phone:</b> <code>" + accounts[i].phone + "</code>\n" +
          " ┗ 🟢 <b>Status:</b> <code>Ready for Auto-Action</code>\n\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━━━\n⚡ <i>All accounts are synced with Firebase Realtime DB.</i>";
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (accounts.length === 0) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>No Active Accounts!</b> Please tap <b>➕ ADD ACCOUNT</b> first."
      });
    }

    // ================= 6. AUTO JOIN CHANNEL (ALL ACCOUNTS) =================
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
            Number(SAVED_API_ID),
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
            await safeDisconnect(client);
          }
        })
      );

      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
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

      await set(ref(db, "panel/channels"), channels);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔══════════════════════════╗\n" +
          "   📥 <b>AUTO-JOIN EXECUTED!</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "📢 <b>Channel Name:</b> " + title + "\n" +
          "🔗 <b>Target Link:</b> <code>" + channelInput + "</code>\n" +
          "🟢 <b>Successfully Joined:</b> <code>" + successCount + " / " + accounts.length + " IDs</code>\n" +
          "🔴 <b>Failed / Restricted:</b> <code>" + failCount + " IDs</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "✅ <i>Channel saved to Firebase Channel List!</i>"
      });
    }

    // ================= 7. LEAVE CHANNEL MENU =================
    if (action === "leave_menu") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔══════════════════════════╗\n" +
            "   📭 <b>NO CHANNELS FOUND</b>\n" +
            "╚══════════════════════════╝\n\n" +
            "⚠️ Your channel database is currently empty."
        });
      }

      let msg =
        "╔══════════════════════════╗\n" +
        "   📤 <b>SELECT CHANNEL TO LEAVE</b>\n" +
        "╚══════════════════════════╝\n\n";

      for (let i = 0; i < channels.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + channels[i].title + "</b>\n" +
          " ┣ 🔗 <code>" + channels[i].input + "</code>\n" +
          " ┗ 📊 <b>Status:</b> " + channels[i].status + "\n\n";
      }

      msg +=
        "━━━━━━━━━━━━━━━━━━━━━━\n" +
        "👇 <i>Send the <b>Channel Number</b> (e.g., <code>1</code> or <code>2</code>) to leave from all accounts:</i>";

      return res.status(200).json({ nextStep: "wait_leave", reply: msg });
    }

    // ================= 8. AUTO LEAVE CHANNEL (ALL ACCOUNTS) =================
    if (action === "leave") {
      const index = parseInt(String(input).trim(), 10) - 1;
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (isNaN(index) || !channels[index]) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>Invalid Channel Number!</b> Please tap <b>📤 LEAVE CHANNEL</b> and select a valid number."
        });
      }

      const targetChannel = channels[index];
      let leftCount = 0;

      await Promise.allSettled(
        accounts.map(async (acc) => {
          const client = new TelegramClient(
            new StringSession(acc.session),
            Number(SAVED_API_ID),
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
            await safeDisconnect(client);
          }
        })
      );

      channels[index].status = "🔴 LEFT (" + leftCount + "/" + accounts.length + " IDs)";
      await set(ref(db, "panel/channels"), channels);

      return res.status(200).json({
        nextStep: "",
        reply:
          "╔══════════════════════════╗\n" +
          "   📤 <b>AUTO-LEAVE COMPLETED!</b>\n" +
          "╚══════════════════════════╝\n\n" +
          "📢 <b>Channel Name:</b> " + targetChannel.title + "\n" +
          "🔗 <b>Channel Link:</b> <code>" + targetChannel.input + "</code>\n" +
          "🔴 <b>Accounts Left:</b> <code>" + leftCount + " / " + accounts.length + " IDs</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "✅ <i>Channel status updated in Firebase!</i>"
      });
    }

    // ================= 9. CHANNEL LIST & STATUS =================
    if (action === "list") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply:
            "╔══════════════════════════╗\n" +
            "   📋 <b>REGISTERED CHANNEL LIST</b>\n" +
            "╚══════════════════════════╝\n\n" +
            "📭 No channels have been joined yet.\n" +
            "👉 Tap <b>📥 JOIN CHANNEL</b> to add your first channel!"
        });
      }

      let msg =
        "╔══════════════════════════╗\n" +
        "   📋 <b>CHANNEL DATABASE & STATUS</b>\n" +
        "╚══════════════════════════╝\n" +
        "📱 <b>Connected Accounts:</b> <code>" + accounts.length + " IDs</code>\n" +
        "📢 <b>Total Tracked Channels:</b> <code>" + channels.length + "</code>\n" +
        "━━━━━━━━━━━━━━━━━━━━━━\n\n";

      for (let i = 0; i < channels.length; i++) {
        msg +=
          "<b>[" + (i + 1) + "] " + channels[i].title + "</b>\n" +
          " ┣ 🔗 <b>Link:</b> <code>" + channels[i].input + "</code>\n" +
          " ┗ 📌 <b>Status:</b> <b>" + channels[i].status + "</b>\n\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━━━\n⚡ <i>Powered by Kumar Multi-Account Engine</i>";
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    return res.status(200).json({ nextStep: "", reply: "⚠️ Unknown Command Action." });
  } catch (err) {
    return res.status(200).json({
      nextStep: "",
      reply:
        "╔══════════════════════════╗\n" +
        "   ❌ <b>SYSTEM EXECUTION ERROR</b>\n" +
        "╚══════════════════════════╝\n\n" +
        "🔍 <b>Reason:</b> <code>" + (err.message || "Operation Failed") + "</code>\n\n" +
        "💡 <i>Tip: If you got PHONE_CODE_EXPIRED, always send the OTP with spaces (e.g. 1 2 3 4 5)!</i>"
    });
  }
};
