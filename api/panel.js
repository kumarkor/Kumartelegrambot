const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set, update } = require("firebase/database");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

// ====================================================
// 1. इथे तुमचा मिळालेला API_ID आणि API_HASH टाका
// ====================================================
const API_ID = 12345678; // <-- इथे तुमचा api_id आकडा टाका (कोट्स नको)
const API_HASH = "a1b2c3d4e5f6..."; // <-- इथे तुमचा api_hash टाका

// ====================================================
// 2. तुमचा Firebase Configuration (जोडलेला आहे)
// ====================================================
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
    return res.status(200).json({ reply: "✅ Telegram Control Panel API Active!" });
  }

  const { action, input } = req.body;

  try {
    // ================= 1. SEND OTP (ACCOUNT LOGIN) =================
    if (action === "send_code") {
      const phone = input.trim();
      const client = new TelegramClient(new StringSession(""), Number(API_ID), API_HASH, {
        connectionRetries: 3,
      });
      await client.connect();

      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: Number(API_ID),
          apiHash: API_HASH,
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
        reply: "📩 <b>OTP पाठवला आहे!</b>\n\nतुमच्या Telegram वर आलेला ५ अंकी OTP पाठवा.\n⚠️ <b>महत्त्वाचे:</b> OTP पाठवताना अंकांमध्ये स्पेस द्या (उदा. OTP <code>12345</code> असेल तर <code>1 2 3 4 5</code> असा पाठवा, नाहीतर Telegram कोड ब्लॉक करतो)."
      });
    }

    // ================= 2. VERIFY OTP & SAVE SESSION =================
    if (action === "verify_code") {
      const code = input.replace(/\D/g, "");
      const snap = await get(ref(db, "panel/auth_temp"));
      if (!snap.exists()) {
        return res.status(200).json({
          nextStep: "",
          reply: "❌ सेशन सापडले नाही. पुन्हा <b>🔐 ACCOUNT LOGIN</b> वर क्लिक करा."
        });
      }

      const { phone, phoneCodeHash, tempSession } = snap.val();
      const client = new TelegramClient(new StringSession(tempSession), Number(API_ID), API_HASH, {
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

      await set(ref(db, "panel/account"), {
        phone: phone,
        name: me.firstName || "User",
        username: me.username || "",
        session: finalSession,
        loginTime: new Date().toLocaleString("en-IN")
      });

      await client.disconnect();
      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>Account Successfully Connected!</b>\n\n👤 <b>Name:</b> " + (me.firstName || "User") + "\n📱 <b>Phone:</b> <code>" + phone + "</code>\n\nआता तुम्ही चॅनेल ऑटोमॅटिक Join आणि Leave करू शकता!"
      });
    }

    // ================= CHECK LOGGED IN SESSION =================
    const accSnap = await get(ref(db, "panel/account"));
    if (!accSnap.exists() || !accSnap.val().session) {
      return res.status(200).json({
        nextStep: "",
        reply: "⚠️ <b>अकाउंट लॉगिन नाही!</b>\nआधी खालील <b>🔐 ACCOUNT LOGIN</b> बटनावर दाबून तुमचे Telegram अकाउंट कनेक्ट करा."
      });
    }
    const accountData = accSnap.val();

    // ================= 3. AUTO JOIN CHANNEL =================
    if (action === "join") {
      const channelInput = input.trim();
      const client = new TelegramClient(new StringSession(accountData.session), Number(API_ID), API_HASH, {
        connectionRetries: 3,
      });
      await client.connect();

      let title = channelInput;
      let targetId = channelInput;

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

      await client.disconnect();

      // Save to Firebase
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let found = false;
      for (let i = 0; i < channels.length; i++) {
        if (channels[i].input === channelInput || channels[i].targetId === targetId) {
          channels[i].status = "🟢 Joined";
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
          status: "🟢 Joined",
          date: new Date().toLocaleDateString("en-IN")
        });
      }

      await set(ref(db, "panel/channels"), channels);

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>CHANNEL JOINED AUTOMATICALLY!</b>\n\n📢 <b>Name:</b> " + title + "\n🔗 <b>Link:</b> <code>" + channelInput + "</code>\n📊 <b>Status:</b> 🟢 Joined"
      });
    }

    // ================= 4. SHOW LEAVE MENU =================
    if (action === "leave_menu") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      let msg = "<b>📤 LEAVE CHANNEL</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n";
      let activeCount = 0;

      for (let i = 0; i < channels.length; i++) {
        if (channels[i].status === "🟢 Joined") {
          activeCount++;
          msg += "<b>" + (i + 1) + ".</b> " + channels[i].title + " (<code>" + channels[i].input + "</code>)\n";
        }
      }

      if (activeCount === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "📭 <b>सध्या कोणतेही Active Joined चॅनेल नाही!</b>"
        });
      }

      msg += "\n━━━━━━━━━━━━━━━━━━━━━━\n👉 ज्या चॅनेलमधून बाहेर पडायचे आहे त्याचा <b>नंबर (उदा. 1, 2)</b> पाठवा:";
      return res.status(200).json({
        nextStep: "wait_leave",
        reply: msg
      });
    }

    // ================= 5. AUTO LEAVE CHANNEL =================
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
      const client = new TelegramClient(new StringSession(accountData.session), Number(API_ID), API_HASH, {
        connectionRetries: 3,
      });
      await client.connect();

      let cleanTarget = targetChannel.targetId.replace("https://t.me/", "").trim();
      await client.invoke(new Api.channels.LeaveChannel({ channel: cleanTarget }));
      await client.disconnect();

      channels[index].status = "🔴 Left";
      await set(ref(db, "panel/channels"), channels);

      return res.status(200).json({
        nextStep: "",
        reply: "✅ <b>CHANNEL LEFT AUTOMATICALLY!</b>\n\n📢 <b>Name:</b> " + targetChannel.title + "\n🔗 <b>Link:</b> <code>" + targetChannel.input + "</code>\n📊 <b>Status:</b> 🔴 Left"
      });
    }

    // ================= 6. CHANNEL LIST =================
    if (action === "list") {
      const listSnap = await get(ref(db, "panel/channels"));
      let channels = listSnap.exists() ? listSnap.val() : [];
      if (!Array.isArray(channels)) channels = Object.values(channels);

      if (channels.length === 0) {
        return res.status(200).json({
          nextStep: "",
          reply: "<b>📋 CHANNEL LIST</b>\n\nसध्या Firebase मध्ये कोणतेही चॅनेल नोंदवलेले नाही."
        });
      }

      let msg = "<b>📋 REGISTERED CHANNELS & STATUS</b>\n" +
                "👤 <b>Active Account:</b> " + accountData.name + " (<code>" + accountData.phone + "</code>)\n" +
                "━━━━━━━━━━━━━━━━━━━━━━\n\n";

      for (let i = 0; i < channels.length; i++) {
        msg += "<b>" + (i + 1) + ". " + channels[i].title + "</b>\n" +
               "   🔗 Link: <code>" + channels[i].input + "</code>\n" +
               "   📌 Status: <b>" + channels[i].status + "</b>\n\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━━━\n📊 <b>Total Channels:</b> " + channels.length;

      return res.status(200).json({
        nextStep: "",
        reply: msg
      });
    }

    return res.status(200).json({ nextStep: "", reply: "⚠️ Unknown command action." });

  } catch (err) {
    return res.status(200).json({
      nextStep: "",
      reply: "❌ <b>Error:</b> <code>" + (err.message || "Operation Failed") + "</code>"
    });
  }
};
