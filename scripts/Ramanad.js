const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');

const cacheDir = path.resolve(process.cwd(), 'cache');

function to12Hour(time24) {
  if (!time24) return "N/A";
  let [hour, minute] = time24.split(":");
  hour = parseInt(hour);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

async function createRamadanCard(city, date, hijri, sehri, iftar) {
    const width = 800;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background - Dark Islamic Theme
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, width, height);

    // Glowing Border
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 10;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#f39c12';
    ctx.strokeRect(15, 15, width - 30, height - 30);
    ctx.shadowBlur = 0;

    // Title
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌙 RAMADAN KAREEM', width / 2, 80);

    // City & Date
    ctx.fillStyle = '#ffffff';
    ctx.font = '30px sans-serif';
    ctx.fillText(`${city.toUpperCase()} | ${date}`, width / 2, 130);
    ctx.fillStyle = '#bdc3c7';
    ctx.font = '25px sans-serif';
    ctx.fillText(`Hijri: ${hijri}`, width / 2, 170);

    // Sehri Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(100, 220, 250, 150);
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 3;
    ctx.strokeRect(100, 220, 250, 150);

    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('SEHRI ENDS', 225, 270);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(sehri, 225, 330);

    // Iftar Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(450, 220, 250, 150);
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 3;
    ctx.strokeRect(450, 220, 250, 150);

    ctx.fillStyle = '#e67e22';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('IFTAR TIME', 575, 270);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(iftar, 575, 330);

    // Dua Text
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'italic 22px sans-serif';
    ctx.fillText('"Allahumma laka sumtu wa ala rizqika aftartu"', width / 2, 430);

    ctx.fillStyle = '#bdc3c7';
    ctx.font = '18px sans-serif';
    ctx.fillText('May Allah accept your fasts', width / 2, 470);

    return canvas.toBuffer('image/png');
}

module.exports = {
  config: {
    name: "ramadan",
    aliases: ["roza", "ifter"],
    version: "3.0",
    author: "Zihad Ahmed",
    countDown: 5,
    role: 0,
    category: "Islamic",
    guide: "{pn} [city_name]"
  },

  onStart: async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const city = args.join(" ") || "kolkata";

    try {
      const res = await axios.get(`http://api.aladhan.com/v1/timingsByCity`, {
        params: {
          city: city,
          country: "India",
          method: 1
        }
      });

      const { timings, date } = res.data.data;
      const sehriTime = to12Hour(timings.Fajr);
      const iftarTime = to12Hour(timings.Maghrib);

      const buffer = await createRamadanCard(city, date.readable, date.hijri.date, sehriTime, iftarTime);
      const imagePath = path.join(cacheDir, `ramadan_${threadID}.png`);

      await fs.ensureDir(cacheDir);
      await fs.writeFile(imagePath, buffer);

      const infoMsg = `🌙 Ramadan Timings for ${city}\n📅 Date: ${date.readable}\n🕋 Hijri: ${date.hijri.date}\n\n⚪ Sehri Ends: ${sehriTime}\n🟠 Iftar Time: ${iftarTime}`;

      await api.sendMessage({
        body: infoMsg,
        attachment: fs.createReadStream(imagePath)
      }, threadID, () => fs.unlinkSync(imagePath), messageID);

    } catch (error) {
      console.log(error);
      return api.sendMessage(`❌ Sorry, timings for "${city}" not found.`, threadID, messageID);
    }
  }
};
