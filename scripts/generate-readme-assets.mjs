import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = path.join(ROOT_DIR, "docs", "assets");
const SCREENSHOT_PATH = path.join(ROOT_DIR, "docs", "mobile-screenshot-v5.jpg");
const ICON_PATH = path.join(
  ROOT_DIR,
  "public",
  "assets",
  "panda-drama-assistant-icon.png",
);

const WIDTH = 1280;
const HEIGHT = 640;
const SCREEN = {
  x: 946,
  y: 40,
  width: 262,
  height: 568,
  radius: 32,
};

const PALETTES = {
  light: {
    backgroundStart: "#fffdf9",
    backgroundEnd: "#f2efea",
    panel: "#fffdfb",
    phoneFrame: "#17181b",
    phoneStroke: "#2d2f34",
    text: "#17181b",
    muted: "#655f5c",
    subtle: "#958d89",
    accent: "#dc1f32",
    accentStrong: "#bd1023",
    accentSoft: "#fee8ea",
    warm: "#f3bd3e",
    grid: "#5f554f",
    chip: "#ffffff",
    chipStroke: "#ddd7d1",
  },
  dark: {
    backgroundStart: "#101114",
    backgroundEnd: "#191b20",
    panel: "#1d1f24",
    phoneFrame: "#090a0c",
    phoneStroke: "#3a3d44",
    text: "#faf7f1",
    muted: "#b4ada9",
    subtle: "#807a77",
    accent: "#f04455",
    accentStrong: "#ff6472",
    accentSoft: "#3b2025",
    warm: "#f3c653",
    grid: "#b9b1aa",
    chip: "#24262c",
    chipStroke: "#3a3d44",
  },
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function roundedMask(width, height, radius) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>` +
      "</svg>",
  );
}

function chipGroup(x, y, label, palette) {
  const width = 28 + label.length * 17;
  return {
    width,
    markup:
      `<g>` +
      `<rect x="${x}" y="${y}" width="${width}" height="38" rx="19" ` +
      `fill="${palette.chip}" stroke="${palette.chipStroke}"/>` +
      `<text x="${x + width / 2}" y="${y + 25}" text-anchor="middle" ` +
      `font-size="16" font-weight="600" fill="${palette.text}">` +
      `${escapeXml(label)}</text>` +
      `</g>`,
  };
}

function buildBackground(palette, iconMarkup) {
  const chips = ["分享链接", "截图导入", "账号同步", "PWA"];
  let chipX = 68;
  let chipsMarkup = "";

  for (const label of chips) {
    const chip = chipGroup(chipX, 470, label, palette);
    chipsMarkup += chip.markup;
    chipX += chip.width + 12;
  }

  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.backgroundStart}"/>
          <stop offset="1" stop-color="${palette.backgroundEnd}"/>
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.accent}" stop-opacity="0.16"/>
          <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
        </linearGradient>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none"
            stroke="${palette.grid}" stroke-opacity="0.055" stroke-width="1"/>
        </pattern>
        <filter id="phone-shadow" x="-40%" y="-30%" width="190%" height="180%">
          <feGaussianBlur stdDeviation="24"/>
        </filter>
      </defs>

      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
      <path d="M 742 0 L 1280 0 L 1280 ${HEIGHT} L 938 ${HEIGHT} Z"
        fill="url(#beam)"/>
      <path d="M 808 -40 L 870 -40 L 690 ${HEIGHT + 40} L 628 ${HEIGHT + 40} Z"
        fill="${palette.accent}" opacity="0.055"/>

      <rect x="914" y="23" width="310" height="619" rx="54"
        fill="#000000" opacity="0.24" filter="url(#phone-shadow)"/>
      <rect x="934" y="20" width="286" height="600" rx="46"
        fill="${palette.phoneFrame}" stroke="${palette.phoneStroke}" stroke-width="2"/>
      <rect x="946" y="40" width="${SCREEN.width}" height="${SCREEN.height}"
        rx="${SCREEN.radius}" fill="${palette.panel}"/>
      <rect x="1021" y="49" width="112" height="8" rx="4"
        fill="${palette.phoneFrame}" opacity="0.96"/>

      <rect x="68" y="122" width="34" height="4" rx="2"
        fill="${palette.accent}"/>
      <text x="68" y="165" font-family="Noto Sans CJK SC, sans-serif"
        font-size="14" font-weight="700" letter-spacing="2.4"
        fill="${palette.accent}">LOCAL FIRST · DRAMA TRACKER</text>

      <text x="68" y="247" font-family="Noto Sans CJK SC, sans-serif"
        font-size="66" font-weight="800" letter-spacing="0"
        fill="${palette.text}">追新季，</text>
      <text x="68" y="323" font-family="Noto Sans CJK SC, sans-serif"
        font-size="66" font-weight="800" letter-spacing="0"
        fill="${palette.text}">也不漏新集。</text>

      <text x="68" y="385" font-family="Noto Sans CJK SC, sans-serif"
        font-size="21" font-weight="500" fill="${palette.muted}">
        把分享链接、账号收藏、预约和榜单里的短剧放进一个地方。
      </text>
      <text x="68" y="420" font-family="Noto Sans CJK SC, sans-serif"
        font-size="21" font-weight="500" fill="${palette.muted}">
        自动检查更新，按你的节奏提醒。
      </text>

      ${chipsMarkup}

      <text x="68" y="565" font-family="Noto Sans CJK SC, sans-serif"
        font-size="16" font-weight="600" fill="${palette.subtle}">
        SQLite 持久化　·　Docker amd64 / arm64　·　Node.js 24+
      </text>

      ${iconMarkup}
    </svg>
  `);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const icon = await sharp(ICON_PATH)
    .resize(68, 68, { fit: "cover" })
    .composite([
      {
        input: roundedMask(68, 68, 18),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const screen = await sharp(SCREENSHOT_PATH)
    .resize(SCREEN.width, SCREEN.height, {
      fit: "cover",
      position: "top",
    })
    .composite([
      {
        input: roundedMask(SCREEN.width, SCREEN.height, SCREEN.radius),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  for (const [theme, palette] of Object.entries(PALETTES)) {
    const iconMarkup = `
      <g>
        <rect x="64" y="44" width="76" height="76" rx="22"
          fill="${palette.accentSoft}"/>
        <text x="155" y="75" font-family="Noto Sans CJK SC, sans-serif"
          font-size="29" font-weight="800" fill="${palette.text}">
          熊猫 · 短剧助手
        </text>
        <text x="156" y="101" font-family="Noto Sans CJK SC, sans-serif"
          font-size="12" font-weight="700" letter-spacing="1.7"
          fill="${palette.subtle}">PANDA DRAMA ASSISTANT</text>
      </g>
    `;
    const background = buildBackground(palette, iconMarkup);
    const outputPath = path.join(
      OUTPUT_DIR,
      `readme-hero-${theme}.webp`,
    );

    await sharp(background)
      .composite([
        {
          input: icon,
          left: 68,
          top: 48,
        },
        {
          input: screen,
          left: SCREEN.x,
          top: SCREEN.y,
        },
      ])
      .webp({
        quality: 92,
        effort: 6,
        smartSubsample: true,
      })
      .toFile(outputPath);

    const metadata = await sharp(outputPath).metadata();
    const stats = await fs.stat(outputPath);
    console.log(
      `${path.relative(ROOT_DIR, outputPath)}: ` +
        `${metadata.width}x${metadata.height}, ${Math.round(stats.size / 1024)} KB`,
    );
  }
}

await main();
