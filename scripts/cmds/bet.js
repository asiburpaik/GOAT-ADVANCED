const Database = require("better-sqlite3");
const path = require("path");

// === DATABASE SETUP ===
const db = new Database(path.join(__dirname, "balance.db"));
db.prepare(`
  CREATE TABLE IF NOT EXISTS balances (
    userID TEXT PRIMARY KEY,
    balance INTEGER
  )
`).run();

// === BALANCE FUNCTIONS ===
function getBalance(userID) {
  const row = db.prepare("SELECT balance FROM balances WHERE userID=?").get(userID);
  return row ? row.balance : 1000; // default balance
}

function setBalance(userID, balance) {
  db.prepare(`
    INSERT INTO balances (userID, balance)
    VALUES (?, ?)
    ON CONFLICT(userID) DO UPDATE SET balance=excluded.balance
  `).run(userID, balance);
}

// === MODULE CONFIG ===
module.exports = {
  config: {
    name: "bet",
    version: "2.0",
    author: "MOHAMMAD AKASH",
    role: 0,
    shortDescription: "Place a bet and win money",
    category: "economy",
    guide: { en: "{p}bet <amount>" }
  },

  onStart: async function({ api, event, args }) {
    const { senderID, threadID, messageID } = event;

    if (!args[0])
      return api.sendMessage("🎰 Usage: bet <amount>", threadID, messageID);

    const betAmount = parseInt(args[0].replace(/\D/g, ''));
    if (isNaN(betAmount) || betAmount <= 0)
      return api.sendMessage("❌ Invalid amount!", threadID, messageID);

    let balance = getBalance(senderID);
    if (betAmount > balance)
      return api.sendMessage(`❌ Not enough balance!\n🏦 Balance: ${balance}$`, threadID, messageID);

    // === CASINO OUTCOMES ===
    const outcomes = [
      { text: "💥 You lost everything!", multiplier: 0 },
      { text: "😞 You got back half.", multiplier: 0.5 },
      { text: "🟡 You broke even.", multiplier: 1 },
      { text: "🟢 You doubled your money!", multiplier: 2 },
      { text: "🔥 You tripled your bet!", multiplier: 3 },
      { text: "🎉 JACKPOT! 10x reward!", multiplier: 10 }
    ];

    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    const reward = Math.floor(betAmount * result.multiplier);
    balance = balance - betAmount + reward;

    setBalance(senderID, balance);

    // === SEND CASINO STYLE OUTPUT ===
    const msg = `${result.text}
🎰 You bet: ${betAmount}$
💸 You won: ${reward}$
💰 New balance: ${balance}$`;

    api.sendMessage(msg, threadID, messageID);
  }
};
