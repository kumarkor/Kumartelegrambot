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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).json({ reply: "✅ Multi-Account Control Panel API Active!" });
  }

  const { action, input, apiId, apiHash } = req.body;

  try {
    if (action === "save_api") {
      const cleanId = parseInt(String(apiId).replace(/\D/g, ""), 10);
      const cleanHash = String(apiHash).replace(/[^a-zA-Z0-9]/g, "").trim();

      if (!cleanId || cleanHash.length < 20) {
        return res.status(200).json({ nextStep: "", reply: "❌ Shukicha API ID kinva API Hash!" });
      }

      await set(ref(db, "panel/api_config"), { apiId: cleanId, apiHash: cleanHash });
      return res.status(200).json({ nextStep: "", reply: "✅ API ID aani API Hash save zale! Aata ADD ACCOUNT daba." });
    }

    const apiSnap = await get(ref(db, "panel/api_config"));
    if (!apiSnap.exists()) {
      return res.status(200).json({ nextStep: "", reply: "⚠️ Aadhi SET API ID/HASH daban API set kara!" });
    }
    const { apiId: SAVED_API_ID, apiHash: SAVED_API_HASH } = apiSnap.val();

    if (action === "send_code") {
      const phone = input.replace(/\s+/g, "").trim();
      const client = new TelegramClient(new StringSession(""), Number(SAVED_API_ID), SAVED_API_HASH, { connectionRetries: 3 });
      await client.connect();

      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: Number(SAVED_API_ID),
          apiHash: SAVED_API_HASH,
          settings: new Api.CodeSettings({}),
        })
      );

      const tempSession = client.session.save();
      await set(ref(db, "panel/auth_temp"), {
        phone: phone,
        phoneCodeHash: result.phoneCodeHash,
        tempSession: tempSession,
      });

      await client.disconnect();
      return res.status(200).json({
        nextStep: "wait_otp",
        reply: "📩 <b>OTP pathavla ahe!</b> (" + phone + ")\n\nAata Telegram var aलेला 5 anki OTP pathva:"
      });
    }

    if (action === "verify_code") {
      const code = input.trim();
      const snap = await get(ref(db, "panel/auth_temp"));
      if (!snap.exists()) {
        return res.status(200).json({ nextStep: "", reply: "❌ Session sampale ahe. Punha ADD ACCOUNT kara." });
      }

      const { phone, phoneCodeHash, tempSession } = snap.val();
      const client = new TelegramClient(new StringSession(tempSession), Number(SAVED_API_ID), SAVED_API_HASH, { connectionRetries: 3 });
      await client.connect();

      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: phoneCodeHash,
            phoneCode: code,
          })
        );
      } catch (err) {
        if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
          await client.disconnect();
          return res.status(200).json({
            nextStep: "wait_2fa",
            reply: "🔒 <b>2FA Password Pahije!</b>\n\nTumchya account la Two-Step Verification password ahe. Krupaya tumcha **Cloud Password** pathva:"
          });
        }
        throw err;
      }

      const finalSession = client.session.save();
      const me = await client.getMe();
      await client.disconnect();

      const accSnap = await get(ref(db, "panel/accounts"));
      let accounts = accSnap.exists() ? accSnap.val() : [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      let exists = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].phone === phone) {
          accounts[i].session = finalSession;
          accounts[i].name = me.firstName || "User";
          exists = true;
          break;
        }
      }

      if (!exists) {
        accounts.push({
          phone: phone,
          name: me.firstName || "User",
          username: me.username || "",
          session: finalSession,
          addedOn: new Date().toLocaleDateString("en-IN")
        });
      }

      await set(ref(db, "panel/accounts"), accounts);
      await set(ref(db, "panel/auth_temp"), null);

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>Account Successfully Connected!</b>\n\n👤 <b>Name:</b> " + (me.firstName || "User") + "\n📱 <b>Phone:</b> <code>" + phone + "</code>\n📊 <b>Total IDs:</b> " + accounts.length
      });
    }

    if (action === "verify_2fa") {
      const password = input.trim();
      const snap = await get(ref(db, "panel/auth_temp"));
      if (!snap.exists()) {
        return res.status(200).json({ nextStep: "", reply: "❌ Session sampale ahe. Punha ADD ACCOUNT kara." });
      }

      const { phone, tempSession } = snap.val();
      const client = new TelegramClient(new StringSession(tempSession), Number(SAVED_API_ID), SAVED_API_HASH, { connectionRetries: 3 });
      await client.connect();

      const passwordInfo = await client.invoke(new Api.account.GetPassword({}));
      const passwordHash = await client.computeCheckPassword(passwordInfo, password);

      await client.invoke(new Api.auth.CheckPassword({ password: passwordHash }));

      const finalSession = client.session.save();
      const me = await client.getMe();
      await client.disconnect();

      const accSnap = await get(ref(db, "panel/accounts"));
      let accounts = accSnap.exists() ? accSnap.val() : [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      accounts.push({
        phone: phone,
        name: me.firstName || "User",
        username: me.username || "",
        session: finalSession,
        addedOn: new Date().toLocaleDateString("en-IN")
      });

      await set(ref(db, "panel/accounts"), accounts);
      await set(ref(db, "panel/auth_temp"), null);

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>2FA Verified & Account Added!</b>\n\n👤 <b>Name:</b> " + (me.firstName || "User") + "\n📱 <b>Phone:</b> <code>" + phone + "</code>"
      });
    }

    const accSnap = await get(ref(db, "panel/accounts"));
    let accounts = accSnap.exists() ? accSnap.val() : [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    if (action === "my_accounts") {
      if (accounts.length === 0) return res.status(200).json({ nextStep: "", reply: "📭 Kontelehi account jodlele nahi." });
      let msg = "<b>📱 CONNECTED ACCOUNTS (" + accounts.length + ")</b>\n\n";
      for (let i = 0; i < accounts.length; i++) {
        msg += (i + 1) + ". " + accounts[i].name + " (`" + accounts[i].phone + "`)\n";
      }
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (accounts.length === 0) {
      return res.status(200).json({ nextStep: "", reply: "⚠️ Aadhi ADD ACCOUNT dabun ID joda." });
    }

    if (action === "join") {
      const channelInput = input.trim();
      let title = channelInput;
      let targetId = channelInput;
      let successCount = 0;

      await Promise.allSettled(
        accounts.map(async (acc) => {
          const client = new TelegramClient(new StringSession(acc.session), Number(SAVED_API_ID), SAVED_API_HASH, { connectionRetries: 2 });
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
            if (e.message && e.message.includes("USER_ALREADY_PARTICIPANT")) successCount++;
          } finally {
            await client.disconnect();
          }
        })
      );

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>AUTO JOIN COMPLETED!</b>\n\n📢 <b>Channel:</b> " + title + "\n🟢 <b>Joined IDs:</b> " + successCount + " / " + accounts.length
      });
    }

    if (action === "leave_menu") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let msg = "<b>📤 LEAVE CHANNEL</b>\n\n";
      for (let i = 0; i < channels.length; i++) {
        msg += (i + 1) + ". " + channels[i].title + " (`" + channels[i].input + "`)\n";
      }
      msg += "\n👉 Baher padnyasathi channel cha number pathva:";
      return res.status(200).json({ nextStep: "wait_leave", reply: msg });
    }

    if (action === "leave") {
      const index = parseInt(input.trim()) - 1;
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (isNaN(index) || !channels[index]) return res.status(200).json({ nextStep: "", reply: "❌ Chukicha number!" });
      const targetChannel = channels[index];
      let leftCount = 0;

      await Promise.allSettled(
        accounts.map(async (acc) => {
          const client = new TelegramClient(new StringSession(acc.session), Number(SAVED_API_ID), SAVED_API_HASH, { connectionRetries: 2 });
          try {
            await client.connect();
            let cleanTarget = targetChannel.targetId.replace("https://t.me/", "").trim();
            await client.invoke(new Api.channels.LeaveChannel({ channel: cleanTarget }));
            leftCount++;
          } catch (e) {} finally {
            await client.disconnect();
          }
        })
      );

      return res.status(200).json({ nextStep: "", reply: "✅ <b>AUTO LEAVE COMPLETED!</b>\n\nLeft from IDs: " + leftCount + " / " + accounts.length });
    }

    if (action === "list") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let msg = "<b>📋 CHANNEL LIST</b>\n\n";
      for (let i = 0; i < channels.length; i++) {
        msg += (i + 1) + ". " + channels[i].title + " (" + channels[i].status + ")\n";
      }
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    return res.status(200).json({ nextStep: "", reply: "⚠️ Unknown action." });

  } catch (err) {
    return res.status(200).json({ nextStep: "", reply: "❌ <b>Error:</b> <code>" + (err.message || "Failed") + "</code>" });
  }
};
