const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const axios = require("axios");
const Database = require("better-sqlite3");

// === DATABASE SETUP ===
const dbPath = path.join(__dirname, "balance.db");
const db = new Database(dbPath);
db.prepare(`
  CREATE TABLE IF NOT EXISTS balances (
    userID TEXT PRIMARY KEY,
    balance INTEGER
  )
`).run();

// === BALANCE FUNCTIONS ===
function getBalance(userID) {
  const row = db.prepare("SELECT balance FROM balances WHERE userID = ?").get(userID);
  if (row) return row.balance;
  return userID === "100078049308655" ? 10000 : 100; // default
}

function setBalance(userID, balance) {
  db.prepare(`
    INSERT INTO balances (userID, balance)
    VALUES (?, ?)
    ON CONFLICT(userID) DO UPDATE SET balance=excluded.balance
  `).run(userID, balance);
}

// === FORMAT BALANCE ===
function formatBalance(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(2).replace(/\.00$/, '') + "T$";
  if (num >= 1e9) return (num / 1e9).toFixed(2).replace(/\.00$/, '') + "B$";
  if (num >= 1e6) return (num / 1e6).toFixed(2).replace(/\.00$/, '') + "M$";
  if (num >= 1e3) return (num / 1e3).toFixed(2).replace(/\.00$/, '') + "k$";
  return num + "$";
}

// === PARSE AMOUNT (FOR BET) ===
function parseAmount(str) {
  str = str.toLowerCase().replace(/\s+/g, '');
  const match = str.match(/^([\d.]+)([kmbt]?)$/);
  if (!match) return NaN;
  let num = parseFloat(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'k': num *= 1e3; break;
    case 'm': num *= 1e6; break;
    case 'b': num *= 1e9; break;
    case 't': num *= 1e12; break;
  }
  return Math.floor(num);
}

// === MODULE CONFIG ===
module.exports.config = {
  name: "balance",
  aliases: ["bal", "bet"],
  version: "2.0",
  author: "MOHAMMAD AKASH",
  countDown: 5,
  role: 0,
  shortDescription: "Bank card & casino-style balance",
  category: "game",
  guide: { en: "{p}balance\n{p}balance transfer @mention <amount>\n{p}bet <amount>" }
};

// === MAIN HANDLER ===
module.exports.onStart = async function({ api, event, args, usersData }) {
  const { threadID, senderID, messageID, mentions } = event;

  try {
    // ===== TRANSFER =====
    if (args[0] && args[0].toLowerCase() === "transfer") {
      if (!mentions || Object.keys(mentions).length === 0)
        return api.sendMessage("Please mention someone.", threadID, messageID);

      const targetID = Object.keys(mentions)[0];
      const amount = parseInt(args[1]);
      if (isNaN(amount) || amount <= 0)
        return api.sendMessage("Invalid amount.", threadID, messageID);

      let senderBal = getBalance(senderID);
      if (senderBal < amount) return api.sendMessage("Not enough balance.", threadID, messageID);

      let receiverBal = getBalance(targetID);
      senderBal -= amount;
      receiverBal += amount;

      setBalance(senderID, senderBal);
      setBalance(targetID, receiverBal);

      const senderName = await usersData.getName(senderID);
      const receiverName = await usersData.getName(targetID);

      return api.sendMessage(
        `Transfer Successful!\n${senderName} → ${receiverName}: ${formatBalance(amount)}\nYour balance: ${formatBalance(senderBal)}`,
        threadID, messageID
      );
    }

    // ===== BET =====
    if (args[0] && args[0].toLowerCase() === "bet") {
      let balance = getBalance(senderID);
      if (!args[1]) return api.sendMessage("Enter amount: bet 500 / bet 1k", threadID, messageID);

      const betAmount = parseAmount(args[1]);
      if (isNaN(betAmount) || betAmount <= 0) return api.sendMessage("Invalid amount!", threadID, messageID);
      if (betAmount > balance) return api.sendMessage(`Not enough coins!\nBalance: ${formatBalance(balance)}`, threadID, messageID);

      const multipliers = [3, 4, 8, 20, 50];
      const chosenMultiplier = multipliers[Math.floor(Math.random() * multipliers.length)];
      const win = Math.random() < 0.5;

      let newBalance = balance;
      let resultText = "", profit = 0;

      if (win) {
        profit = betAmount * chosenMultiplier;
        newBalance += profit;
        resultText = `JACKPOT! ${chosenMultiplier}x`;
      } else {
        newBalance -= betAmount;
        resultText = "TRY AGAIN";
      }

      setBalance(senderID, newBalance);

      const userName = await usersData.getName(senderID);
      const avatarUrl = `https://graph.facebook.com/${senderID}/picture?height=500&width=500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
      let avatar = null;
      try { avatar = await loadImage((await axios.get(avatarUrl, { responseType: 'arraybuffer' })).data); } catch(e){}

      const filePath = await generateCasinoCard({
        userName, avatar, betAmount, resultText,
        multiplier: win ? chosenMultiplier : null,
        profit: win ? profit : betAmount,
        oldBalance: balance, newBalance, win
      });

      await api.sendMessage({ body:"", attachment: fs.createReadStream(filePath) }, threadID, messageID);
      setTimeout(() => fs.existsSync(filePath) && fs.unlinkSync(filePath), 10000);
      return;
    }

    // ===== BALANCE CARD =====
    const balance = getBalance(senderID);
    const userName = await usersData.getName(senderID);
    const formatted = formatBalance(balance);

    const picUrl = `https://graph.facebook.com/${senderID}/picture?height=500&width=500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
    let avatar = null;
    try { avatar = await loadImage((await axios.get(picUrl, { responseType: 'arraybuffer' })).data); } catch(e){}

    const filePath = await generateBalanceCard(userName, formatted, avatar);
    await api.sendMessage({ body:"", attachment: fs.createReadStream(filePath) }, threadID, messageID);
    setTimeout(() => fs.existsSync(filePath) && fs.unlinkSync(filePath), 10000);

  } catch (err) {
    console.error(err);
    api.sendMessage("Error executing command!", threadID, messageID);
  }
};

// ===== GENERATE BALANCE CARD =====
async function generateBalanceCard(userName, formatted, avatar){
  const width = 850, height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0,0,width,height);
  grad.addColorStop(0,'#0f0c29'); grad.addColorStop(0.5,'#302b63'); grad.addColorStop(1,'#24243e');
  ctx.fillStyle = grad; roundRect(ctx,0,0,width,height,35,true);

  ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(ctx,20,20,width-40,height-40,30,true);

  if(avatar){
    const size=110,x=width-size-50,y=50;
    ctx.save(); ctx.beginPath(); ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2); ctx.clip();
    ctx.drawImage(avatar,x,y,size,size); ctx.restore();
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth=4; ctx.beginPath();
    ctx.arc(x+size/2,y+size/2,size/2+2,0,Math.PI*2); ctx.stroke();
  }

  ctx.font='bold 38px "Segoe UI"'; ctx.fillStyle='#00d4ff'; ctx.fillText('GOAT BANK',60,100);
  ctx.font='32px monospace'; ctx.fillStyle='#fff'; ctx.fillText('•••• •••• •••• 8456',60,180);
  ctx.font='bold 30px "Segoe UI"'; ctx.fillStyle='#fff'; ctx.fillText(userName.toUpperCase(),60,250);
  ctx.font='22px "Segoe UI"'; ctx.fillStyle='#ccc'; ctx.fillText('VALID THRU',60,310);
  ctx.font='28px "Segoe UI"'; ctx.fillStyle='#fff'; ctx.fillText('12/28',60,350);

  ctx.fillStyle='rgba(0,212,255,0.15)'; roundRect(ctx,450,180,330,180,25,true);
  ctx.fillStyle='#00d4ff'; ctx.font='bold 26px "Segoe UI"'; ctx.textAlign='center';
  ctx.fillText('AVAILABLE BALANCE',615,230);
  ctx.font='bold 56px "Segoe UI"'; ctx.fillStyle='#fff'; ctx.fillText(formatted,615,310);
  ctx.textAlign='left';

  ctx.fillStyle='#f4d03f'; roundRect(ctx,60,400,90,65,10,true);
  const chipPattern=[[15,15],[45,15],[75,15],[15,35],[45,35],[75,35],[15,55],[45,55],[75,55]];
  ctx.fillStyle='#b7950b'; chipPattern.forEach(([px,py])=>ctx.fillRect(60+px,400+py,15,15));
  ctx.font='bold 48px Arial'; ctx.fillStyle='#fff'; ctx.fillText('VISA',180,450);
  drawContactless(ctx,300,430);

  const cacheDir = path.join(__dirname,'cache'); if(!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir,{recursive:true});
  const filePath = path.join(cacheDir,`balance_${Date.now()}.png`);
  fs.writeFileSync(filePath,canvas.toBuffer());
  return filePath;
}

// ===== GENERATE CASINO CARD =====
async function generateCasinoCard(data){
  const width=900,height=600,canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
  const bgGrad=ctx.createLinearGradient(0,0,width,height); bgGrad.addColorStop(0,'#0f0f23'); bgGrad.addColorStop(1,'#1a1a2e');
  ctx.fillStyle=bgGrad; ctx.fillRect(0,0,width,height);

  ctx.strokeStyle='#00ff88'; ctx.lineWidth=8; roundRect(ctx,20,20,width-40,height-40,30,false,true);
  ctx.font='bold 60px "Arial Black"'; ctx.fillStyle='#ffd700'; ctx.textAlign='center';
  ctx.shadowColor='#ff4500'; ctx.shadowBlur=20; ctx.fillText('GOAT CASINO',width/2,100); ctx.shadowColor='transparent';

  if(data.avatar){
    ctx.save(); ctx.beginPath(); ctx.arc(120,200,70,0,Math.PI*2); ctx.clip();
    ctx.drawImage(data.avatar,50,130,140,140); ctx.restore();
    ctx.strokeStyle='#ffd700'; ctx.lineWidth=5; ctx.stroke();
  }

  ctx.font='bold 36px Arial'; ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.fillText(data.userName,230,190);
  ctx.font='bold 32px Arial'; ctx.fillStyle='#00ffcc'; ctx.fillText(`Bet: ${formatBalance(data.betAmount)}`,230,240);
  ctx.fillStyle=data.win?'rgba(0,255,0,0.2)':'rgba(255,0,0,0.2)'; roundRect(ctx,230,280,430,180,25,true);

  ctx.font='bold 56px Arial'; ctx.fillStyle=data.win?'#00ff00':'#ff0000'; ctx.textAlign='center';
  ctx.fillText(data.resultText,width/2,360);

  if(data.win){ ctx.font='bold 42px Arial'; ctx.fillStyle='#ffd700'; ctx.fillText(`${data.multiplier}x MULTIPLIER`,width/2,420); }
  ctx.font='bold 36px Arial'; ctx.fillStyle=data.win?'#00ff00':'#ff4444';
  ctx.fillText(data.win?`+${formatBalance(data.profit)}`:`-${formatBalance(data.betAmount)}`,width/2,500);
  ctx.font='28px Arial'; ctx.fillStyle='#ccc'; ctx.fillText(`Balance: ${formatBalance(data.newBalance)}`,width/2,550);

  drawChips(ctx,700,150,data.win?'#ffd700':'#888');

  const cacheDir = path.join(__dirname,'cache'); if(!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir,{recursive:true});
  const filePath = path.join(cacheDir,`bet_${Date.now()}.png`);
  fs.writeFileSync(filePath,canvas.toBuffer());
  return filePath;
}

// ===== HELPERS =====
function roundRect(ctx,x,y,w,h,r,fill=false,stroke=false){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();if(fill)ctx.fill();if(stroke)ctx.stroke();}
function drawChips(ctx,x,y,color){const chips=[{x:0,y:0,r:30},{x:40,y:-20,r:25},{x:-30,y:15,r:28}];chips.forEach(chip=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x+chip.x,y+chip.y,chip.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText('$',x+chip.x,y+chip.y+6);});}
function drawContactless(ctx,x,y){ctx.strokeStyle='#fff';ctx.lineWidth=3;for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(x,y,15*i,-Math.PI/3,Math.PI/3);ctx.stroke();}
}
