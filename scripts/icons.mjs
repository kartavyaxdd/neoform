import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage();
for (const size of [192, 512]) {
  const data = await page.evaluate((size) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.scale(size / 512, size / 512);
    ctx.fillStyle = "#1b201f";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#bddac0";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(130, 370);
    ctx.lineTo(130, 142);
    ctx.lineTo(185, 142);
    ctx.lineTo(327, 370);
    ctx.lineTo(382, 370);
    ctx.lineTo(382, 142);
    ctx.lineTo(327, 142);
    ctx.lineTo(327, 301);
    ctx.lineTo(185, 142);
    ctx.lineTo(185, 370);
    ctx.closePath();
    ctx.stroke();
    return canvas.toDataURL("image/png").split(",")[1];
  }, size);
  fs.writeFileSync(`public/icon-${size}.png`, Buffer.from(data, "base64"));
}
await browser.close();
