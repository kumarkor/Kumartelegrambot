const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set } = require("firebase/database");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

// तुमचा Firebase Configuration
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
    // ================= 1. SAVE API_ID & API_HASH FROM BOT =================
    if (action === "save_api") {
      const cleanId = parseInt(String(apiId).replace(/\D/g, ""), 10);
      const cleanHash = String(apiHash).replace(/[^a-zA-Z0-9]/g, "").trim();

      if (!cleanId || cleanHash.length < 20) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ <b>चुकीचा API ID किंवा API Hash!</b>\nकृपया my.telegram.org वरील बरोबर माहिती टाका."
        });
      }

      await set(ref(db, "panel/api_config"), {
        apiId: cleanId,
        apiHash: cleanHash
      });

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>API ID आणि API HASH सेव्ह झाले!</b>\n\n🔢 <b>API ID:</b> <code>" + cleanId + "</code>\n🔑 <b>API Hash:</b> <code>" + cleanHash + "</code>\n\nआता तुम्ही <b>➕ ADD ACCOUNT</b> दाबून तुमचे ११ Telegram IDs एक-एक करून जोडू शकता!"
      });
    }

    // ================= CHECK API CONFIG IN FIREBASE =================
    const apiSnap = await get(ref(db, "panel/api_config"));
    if (!apiSnap.exists()) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>आधी API सेट करा!</b>\nखालील <b>⚙️ SET API ID/HASH</b> बटनावर क्लिक करून तुमचा API ID आणि API Hash टाका."
      });
    }
    const { apiId: SAVED_API_ID, apiHash: SAVED_API_HASH } = apiSnap.val();

    // ================= 2. SEND OTP (ADD NEW ACCOUNT) =================
    if (action === "send_code") {
      const phone = input.replace(/\s+/g, "").trim();
      const client = new TelegramClient(new StringSession(""), Number(SAVED_API_ID), SAVED_API_HASH, {
        connectionRetries: 3,
      });
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
        reply: "📩 <b>OTP पाठवला आहे!</b> (<code>" + phone + "</code>)\n\nतुमच्या Telegram वर आलेला ५ अंकी OTP <b>स्पेस देऊन</b> पाठवा:\nउदा. <code>1 2 3 4 5</code>"
      });
    }

    // ================= 3. VERIFY OTP & SAVE TO MULTI-ACCOUNT LIST =================
    if (action === "verify_code") {
      const code = input.replace(/\D/g, "");
      const snap = await get(ref(db, "panel/auth_temp"));
      if (!snap.exists()) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ सेशन संपले आहे. पुन्हा <b>➕ ADD ACCOUNT</b> वर क्लिक करा."
        });
      }

      const { phone, phoneCodeHash, tempSession } = snap.val();
      const client = new TelegramClient(new StringSession(tempSession), Number(SAVED_API_ID), SAVED_API_HASH, {
        connectionRetries: 3,
      });
      await client.connect();

      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash: phoneCodeHash,
          phoneCode: code,
        })
      );

      const finalSession = client.session.save();
      const me = await client.getMe();
      await client.disconnect();

      // Save in accounts list
      const accSnap = await get(ref(db, "panel/accounts"));
      let accounts = accSnap.exists() ? accSnap.val() : [];
      if (!Array.isArray(accounts)) accounts = Object.values(accounts);

      // Update if phone already exists, else push new
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

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>Account Successfully Added!</b>\n\n👤 <b>Name:</b> " + (me.firstName || "User") + "\n📱 <b>Phone:</b> <code>" + phone + "</code>\n📊 <b>Total Connected IDs:</b> " + accounts.length + "\n\nदुसरा ID जोडण्यासाठी पुन्हा <b>➕ ADD ACCOUNT</b> दाबा!"
      });
    }

    // ================= LOAD ALL CONNECTED ACCOUNTS =================
    const accSnap = await get(ref(db, "panel/accounts"));
    let accounts = accSnap.exists() ? accSnap.val() : [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    // ================= 4. MY ACCOUNTS LIST =================
    if (action === "my_accounts") {
      if (accounts.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>कोणतेही Telegram Account जोडलेले नाही!</b>\n<b>➕ ADD ACCOUNT</b> दाबून तुमचे ११ अकाउंट्स जोडा."
        });
      }

      let msg = "<b>📱 CONNECTED TELEGRAM ACCOUNTS (" + accounts.length + ")</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n";
      for (let i = 0; i < accounts.length; i++) {
        msg += "<b>" + (i + 1) + ". " + accounts[i].name + "</b> — <code>" + accounts[i].phone + "</code>\n";
      }
      msg += "\n━━━━━━━━━━━━━━━━━━━━━━\n✅ हे सर्व IDs एकाच क्लिकवर चॅनेल Join आणि Leave करतील.";
      return res.status(200).json({ nextStep: "", reply: msg });
    }

    if (accounts.length === 0) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>कोणताही ID लॉगिन नाही!</b>\nआधी <b>➕ ADD ACCOUNT</b> दाबून किमान १ Telegram ID जोडा."
      });
    }

    // ================= 5. AUTO JOIN FROM ALL ACCOUNTS =================
    if (action === "join") {
      const channelInput = input.trim();
      let title = channelInput;
      let targetId = channelInput;
      let successCount = 0;
      let failCount = 0;

      // Join across all accounts in parallel
      await Promise.allSettled(
        accounts.map(async (acc) => {
          const client = new TelegramClient(new StringSession(acc.session), Number(SAVED_API_ID), SAVED_API_HASH, {
            connectionRetries: 2,
          });
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
            // जर आधीच मेंबर असेल तरी सक्सेस धरा
            if (e.message && e.message.indexOf("USER_ALREADY_PARTICIPANT") !== -1) {
              successCount++;
            } else {
              failCount++;
            }
          } finally {
            await client.disconnect();
          }
        })
      );

      // Save channel to Firebase
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let found = false;
      for (let i = 0; i < channels.length; i++) {
        if (channels[i].input === channelInput || channels[i].targetId === targetId) {
          channels[i].status = "🟢 Joined (" + successCount + "/" + accounts.length + " IDs)";
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
          status: "🟢 Joined (" + successCount + "/" + accounts.length + " IDs)",
          active: true
        });
      }

      await set(ref(db, "panel/channels"), channels);

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>AUTO JOIN COMPLETED!</b>\n\n📢 <b>Channel:</b> " + title + "\n🔗 <b>Link:</b> <code>" + channelInput + "</code>\n🟢 <b>Joined IDs:</b> " + successCount + " / " + accounts.length + "\n🔴 <b>Failed IDs:</b> " + failCount
      });
    }

    // ================= 6. LEAVE MENU =================
    if (action === "leave_menu") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let msg = "<b>📤 LEAVE CHANNEL (ALL IDs)</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n";
      let count = 0;

      for (let i = 0; i < channels.length; i++) {
        if (channels[i].status.indexOf("🟢") !== -1) {
          count++;
          msg += "<b>" + (i + 1) + ".</b> " + channels[i].title + " (<code>" + channels[i].input + "</code>)\n";
        }
      }

      if (count === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>सध्या कोणतेही Joined चॅनेल नाही!</b>"
        });
      }

      msg += "\n━━━━━━━━━━━━━━━━━━━━━━\n👉 सर्व अकाउंट्समधून बाहेर पडण्यासाठी चॅनेलचा <b>नंबर (उदा. 1, 2)</b> पाठवा:";
      return res.status(200).json({ nextStep: "wait_leave", reply: msg });
    }

    // ================= 7. AUTO LEAVE FROM ALL ACCOUNTS =================
    if (action === "leave") {
      const index = parseInt(input.trim()) - 1;
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (isNaN(index) || !channels[index]) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ चुकीचा नंबर! कृपया यादीतील योग्य नंबर टाका."
        });
      }

      const targetChannel = channels[index];
      let leftCount = 0;

      await Promise.allSettled(
        accounts.map(async (acc) => {
          const client = new TelegramClient(new StringSession(acc.session), Number(SAVED_API_ID), SAVED_API_HASH, {
            connectionRetries: 2,
          });
          try {
            await client.connect();
            let cleanTarget = targetChannel.targetId.replace("https://t.me/", "").trim();
            await client.invoke(new Api.channels.LeaveChannel({ channel: cleanTarget }));
            leftCount++;
          } catch (e) {
            // ignore error if already left
          } finally {
            await client.disconnect();
          }
        })
      );

      channels[index].status = "🔴 Left (" + leftCount + "/" + accounts.length + " IDs)";
      await set(ref(db, "panel/channels"), channels);

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>AUTO LEAVE COMPLETED!</b>\n\n📢 <b>Channel:</b> " + targetChannel.title + "\n📤 <b>Left from IDs:</b> " + leftCount + " / " + accounts.length
      });
    }

    // ================= 8. CHANNEL LIST =================
    if (action === "list") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "<b>📋 CHANNEL LIST</b>\n\nसध्या कोणतेही चॅनेल नोंदवलेले नाही."
        });
      }

      let msg = "<b>📋 REGISTERED CHANNELS & STATUS</b>\n" +
                "📱 <b>Total Connected IDs:</b> " + accounts.length + "\n" +
                "━━━━━━━━━━━━━━━━━━━━━━\n\n";

      for (let i = 0; i < channels.length; i++) {
        msg += "<b>" + (i + 1) + ". " + channels[i].title + "</b>\n" +
               "   🔗 Link: <code>" + channels[i].input + "</code>\n" +
               "   📌 Status: <b>" + channels[i].status + "</b>\n\n";
      }

      return res.status(200).json({ nextStep: "", reply: msg });
    }

    return res.status(200).json({ nextStep: "", reply: "⚠️ Unknown action." });

  } catch (err) {
    return res.status(200).json({
      nextStep: "",
      reply: "❌ <b>Error:</b> <code>" + (err.message || "Operation Failed") + "</code>"
    });
  }
};
