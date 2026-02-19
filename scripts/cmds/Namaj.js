const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs-extra");
const path = require("path");
const schedule = require("node-schedule"); // cron scheduler

const cacheDir = path.resolve(process.cwd(), "cache");

// =========================
// TIME CONVERSION
// =========================
function to12Hour(time24) {
  let [h, m] = time24.split(":");
  h = parseInt(h);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// =========================
// IMAGE CARD
// =========================
async function createCard(city, date, hijri, sehri, iftar) {
  const width = 850;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  try {
    const bg = await loadImage(path.join(__dirname, "mosque_bg.png"));
    ctx.drawImage(bg, 0, 0, width, height);
  } catch {
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.strokeStyle = "#f1c40f";
  ctx.lineWidth = 8;
  ctx.strokeRect(15, 15, width - 30, height - 30);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText("🌙 RAMADAN KAREEM", width / 2, 80);

  ctx.fillStyle = "#fff";
  ctx.font = "26px sans-serif";
  ctx.fillText(`${city} | ${date}`, width / 2, 130);
  ctx.fillStyle = "#ccc";
  ctx.font = "22px sans-serif";
  ctx.fillText(`Hijri: ${hijri}`, width / 2, 165);

  ctx.fillStyle = "rgba(52,152,219,0.15)";
  ctx.fillRect(110, 230, 260, 160);
  ctx.fillStyle = "#3498db";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`সেহরি: ${sehri}`, 240, 300);

  ctx.fillStyle = "rgba(230,126,34,0.15)";
  ctx.fillRect(480, 230, 260, 160);
  ctx.fillStyle = "#e67e22";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`ইফতার: ${iftar}`, 610, 300);

  ctx.fillStyle = "#f1c40f";
  ctx.font = "italic 20px sans-serif";
  ctx.fillText('"Allahumma laka sumtu wa ala rizqika aftartu"', width / 2, 440);
  ctx.fillStyle = "#aaa";
  ctx.font = "18px sans-serif";
  ctx.fillText("May Allah accept your fast 🤲", width / 2, 475);

  return canvas.toBuffer();
}

// =========================
// SCHEDULE REMINDER
// =========================
async function scheduleDaily(api, threadID, city = "Kolkata") {
  try {
    const res = await axios.get("http://api.aladhan.com/v1/timingsByCity", {
      params: { city, country: "India", method: 1 }
    });

    const { timings, date } = res.data.data;
    const sehri = to12Hour(timings.Fajr);
    const iftar = to12Hour(timings.Maghrib);

    // Schedule Sehri Reminder 10 min before Fajr
    const [fh, fm] = timings.Fajr.split(":");
    const fajrDate = new Date();
    fajrDate.setHours(parseInt(fh), parseInt(fm) - 10, 0, 0);
    schedule.scheduleJob(fajrDate, async () => {
      const buffer = await createCard(city, date.readable, date.hijri.date, sehri, iftar);
      await fs.ensureDir(cacheDir);
      const imgPath = path.join(cacheDir, `sehri_${Date.now()}.png`);
      await fs.writeFile(imgPath, buffer);
      api.sendMessage({ body: "⏰ সেহরি 10 মিনিটে শেষ!", attachment: fs.createReadStream(imgPath) }, threadID, () => fs.unlinkSync(imgPath));
    });

    // Schedule Iftar Reminder 10 min before Maghrib
    const [ih, im] = timings.Maghrib.split(":");
    const iftarDate = new Date();
    iftarDate.setHours(parseInt(ih), parseInt(im) - 10, 0, 0);
    schedule.scheduleJob(iftarDate, async () => {
      const buffer = await createCard(city, date.readable, date.hijri.date, sehri, iftar);
      await fs.ensureDir(cacheDir);
      const imgPath = path.join(cacheDir, `iftar_${Date.now()}.png`);
      await fs.writeFile(imgPath, buffer);
      api.sendMessage({ body: "⏰ ইফতার 10 মিনিটে!", attachment: fs.createReadStream(imgPath) }, threadID, () => fs.unlinkSync(imgPath));
    });

  } catch (e) {
    console.log("Error scheduling daily reminders:", e);
  }
}

// =========================
// COMMAND MODULE
// =========================
module.exports = {
  config: {
    name: "ramadan",
    aliases: ["roza", "ifter"],
    version: "10.0",
    author: "Ultimate Cron Scheduler",
    countDown: 5,
    role: 0,
    category: "Islamic",
    guide: "{pn} [city] | {pn} month"
  },

  onStart: async function({ api, event, args }) {
    const { threadID, messageID } = event;

    let city = args.join(" ") || "Kolkata";
    if (city.toLowerCase().includes("hooghly")) city = "Kolkata";
    const isMonth = city.toLowerCase() === "month";

    try {
      if (isMonth) {
        const res = await axios.get("http://api.aladhan.com/v1/calendarByCity", {
          params: { city: "Kolkata", country: "India", method: 1, month: new Date().getMonth() + 1, year: new Date().getFullYear() }
        });
        let msg = "📅 Kolkata Ramadan Monthly Timetable\n\n";
        res.data.data.slice(0, 30).forEach((d, i) => {
          msg += `${i + 1}. সেহরি: ${to12Hour(d.timings.Fajr)} | ইফতার: ${to12Hour(d.timings.Maghrib)}\n`;
        });
        return api.sendMessage(msg, threadID, messageID);
      }

      // Schedule auto reminders
      scheduleDaily(api, threadID, city);

      api.sendMessage(`✅ Daily Ramadan reminders scheduled for ${city}`, threadID, messageID);

    } catch (e) {
      console.log(e);
      api.sendMessage("❌ সময় পাওয়া যায়নি!", threadID, messageID);
    }
  }
};
