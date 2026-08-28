/**
 * Century Garden poster v3
 * Strategy: listing image already contains the marketing design —
 * use it full-bleed, add only a clean contact footer (no duplicate overlays).
 */
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const PROPERTY = {
  phone: "6383434499",
  phoneFormatted: "+91 63834 34499",
  company: "POWER GROUP REAL ESTATE TRICHY",
  subtitle: "Real Estate | Construction | Marketing",
  instagram: "@power_group_real_estate_trichy",
  imageUrl:
    "https://scontent-bru2-1.cdninstagram.com/v/t39.30808-6/778972764_122177849960618840_2290725658842056582_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=104&ig_cache_key=Mzk3MDYzNjA1MzM5Njg4NTkzMg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTA4MC9zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=JQUHf3eqFWcQ7kNvwHtn4L3&_nc_oc=AdoROyXkv5qHEeIN_5BvkVkICiQDKd_YqJN-2Kthc_R2bLZVd8yDKNRvqSPaMmYz_zA&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&se=7&_nc_ht=scontent-bru2-1.cdninstagram.com&_nc_gid=QVeK-Yci9ANh0CKBcu-OwQ&_nc_ss=7a3ba&oh=00_AQGb0abtZ5TkTUdCSEQjW1rbTwWfp4bjgGvaS92HkwD19g&oe=6A94A802",
};

const W = 1080;
const H = 1350;
const GREEN = "#064a32";
const GOLD = "#c9a227";
const LIGHT_GOLD = "#f5d76e";
const FONT = "Segoe UI";

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Fit image inside box preserving aspect ratio (contain) */
function drawImageContain(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const dr = w / h;
  let dw, dh, dx, dy;
  if (ir > dr) {
    dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2;
  } else {
    dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const FOOTER_H = 220;
  const MAIN_H = H - FOOTER_H;

  // White canvas background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Gold border
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  let propertyImg = null;
  try {
    propertyImg = await loadImage(await fetchBuffer(PROPERTY.imageUrl));
  } catch (e) {
    console.warn("Image load failed:", e.message);
  }

  // Main area: show original marketing image full width (no extra overlays)
  if (propertyImg) {
    drawImageContain(ctx, propertyImg, 10, 10, W - 20, MAIN_H - 10);
  } else {
    ctx.fillStyle = GREEN;
    ctx.fillRect(10, 10, W - 20, MAIN_H - 10);
  }

  // Thin gold separator
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, MAIN_H);
  ctx.lineTo(W - 10, MAIN_H);
  ctx.stroke();

  // ── FOOTER: company + phone + instagram ──
  const fy = MAIN_H;
  ctx.fillStyle = GREEN;
  ctx.fillRect(10, fy, W - 20, FOOTER_H - 10);

  // Gold top accent line inside footer
  ctx.fillStyle = GOLD;
  ctx.fillRect(10, fy, W - 20, 5);

  // Company
  const cg = ctx.createLinearGradient(0, fy, 0, fy + 50);
  cg.addColorStop(0, LIGHT_GOLD);
  cg.addColorStop(1, GOLD);
  ctx.fillStyle = cg;
  ctx.font = `bold 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(PROPERTY.company, W / 2, fy + 48);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `14px ${FONT}`;
  ctx.fillText(PROPERTY.subtitle, W / 2, fy + 72);

  // Phone row
  ctx.fillStyle = WHITE;
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText("📞 Call / WhatsApp", W / 2 - 200, fy + 115);
  ctx.fillStyle = LIGHT_GOLD;
  ctx.font = `bold 46px ${FONT}`;
  ctx.fillText(PROPERTY.phone, W / 2 - 200, fy + 165);

  // Vertical divider
  ctx.strokeStyle = "rgba(201,162,39,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, fy + 95);
  ctx.lineTo(W / 2, fy + FOOTER_H - 25);
  ctx.stroke();

  // Instagram
  ctx.fillStyle = WHITE;
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText("Instagram", W / 2 + 200, fy + 115);
  ctx.fillStyle = GOLD;
  const igW = 360;
  roundRect(ctx, W / 2 + 200 - igW / 2, fy + 130, igW, 44, 22);
  ctx.fill();
  ctx.fillStyle = GREEN;
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(PROPERTY.instagram, W / 2 + 200, fy + 160);

  const outPath = path.join(__dirname, "..", "uploads", "poster_preview_1059.png");
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log("Saved:", outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
