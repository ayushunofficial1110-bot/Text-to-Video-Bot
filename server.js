/**
 * Creative Reel Maker Bot
 * Modern Instagram News/Editorial Reel Generator
 * Plain JavaScript (Node.js) - Telegram Bot & FFmpeg Creative Media Engine
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, execSync } = require('child_process');
const express = require('express');
const multer = require('multer');

// Resilient TelegramBot import
let TelegramBotPkg = require('node-telegram-bot-api');
const TelegramBot = typeof TelegramBotPkg === 'function'
  ? TelegramBotPkg
  : (TelegramBotPkg.default || TelegramBotPkg.TelegramBot || TelegramBotPkg);

// Canvas Implementations ('node-canvas' with resilient fallback)
let nodeCanvas = null;
try {
  nodeCanvas = require('canvas');
} catch (e) {
  console.warn('[Canvas] Note on node-canvas load:', e.message);
}

let napiCanvas = null;
try {
  napiCanvas = require('@napi-rs/canvas');
} catch (e) {
  console.warn('[Canvas] Note on @napi-rs/canvas load:', e.message);
}

// Unified Canvas API (createCanvas, loadImage, registerFont)
const createCanvas = (w, h) => {
  if (nodeCanvas && typeof nodeCanvas.createCanvas === 'function') {
    return nodeCanvas.createCanvas(w, h);
  }
  if (napiCanvas && typeof napiCanvas.createCanvas === 'function') {
    return napiCanvas.createCanvas(w, h);
  }
  throw new Error('No canvas implementation available');
};

const loadImage = async (src) => {
  if (nodeCanvas && typeof nodeCanvas.loadImage === 'function') {
    return nodeCanvas.loadImage(src);
  }
  if (napiCanvas && typeof napiCanvas.loadImage === 'function') {
    return napiCanvas.loadImage(src);
  }
  throw new Error('No loadImage implementation available');
};

const registerFontNodeCanvas = (fontPath, config) => {
  if (nodeCanvas && typeof nodeCanvas.registerFont === 'function') {
    try {
      nodeCanvas.registerFont(fontPath, config);
    } catch (e) {
      console.warn('[node-canvas] registerFont notice:', e.message);
    }
  }
};

const GlobalFonts = napiCanvas ? napiCanvas.GlobalFonts : null;

// --- 1. CONFIGURATION & PATHS ---
const PORT = process.env.RENDER
  ? (process.env.PORT || 3000)
  : (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000);

const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : '';

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const ASSETS_DIR = path.join(__dirname, 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const EMOJIS_DIR = path.join(ASSETS_DIR, 'emojis');

if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });
if (!fs.existsSync(EMOJIS_DIR)) fs.mkdirSync(EMOJIS_DIR, { recursive: true });

// Startup cleanup of temporary files
try {
  const existingFiles = fs.readdirSync(TEMP_DIR);
  for (const file of existingFiles) {
    try {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    } catch (_) {}
  }
} catch (e) {
  console.warn('[Startup] Temp cleanup notice:', e.message);
}

// --- 2. FONT DETECTION & REGISTRATION ENGINE ---
const detectedFonts = {
  emoji: { name: 'Noto Color Emoji', family: 'Noto Color Emoji', registered: false, path: null, category: 'Color Emoji & Flags' },
  sansPrimary: { name: 'Inter', family: 'Inter', registered: false, path: null, category: 'Editorial Clean Sans' },
  sansGeometric: { name: 'Montserrat', family: 'Montserrat', registered: false, path: null, category: 'Bold High-Impact Sans' },
  serif: { name: 'Playfair Display', family: 'PlayfairDisplay', registered: false, path: null, category: 'Refined Classic Serif' }
};

function detectAndRegisterFonts() {
  const fontSearchPaths = [
    FONTS_DIR,
    path.resolve('./assets/fonts'),
    '/usr/share/fonts/truetype/noto',
    '/usr/share/fonts/truetype/montserrat',
    '/usr/share/fonts/truetype/inter',
    '/usr/share/fonts/truetype',
    '/usr/share/fonts/opentype',
    '/usr/local/share/fonts'
  ];

  const findFontFile = (fileNames) => {
    for (const dir of fontSearchPaths) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fileNames) {
        const fullPath = path.join(dir, name);
        if (fs.existsSync(fullPath)) return fullPath;
      }
    }
    return null;
  };

  // 1. Noto Color Emoji (vibrant color flags & symbols)
  const notoPath = findFontFile(['NotoColorEmoji.ttf', 'NotoColorEmoji.otf', 'Noto-Color-Emoji.ttf', 'noto-color-emoji.ttf']);
  if (notoPath) {
    try {
      registerFontNodeCanvas(notoPath, { family: 'Noto Color Emoji' });
      registerFontNodeCanvas(notoPath, { family: 'NotoColorEmoji' });
      if (GlobalFonts) {
        GlobalFonts.registerFromPath(notoPath, 'Noto Color Emoji');
        GlobalFonts.registerFromPath(notoPath, 'NotoColorEmoji');
      }
      detectedFonts.emoji.registered = true;
      detectedFonts.emoji.path = notoPath;
      console.log(`[Fonts] ✅ Detected & Registered Noto Color Emoji (${notoPath})`);
    } catch (e) {
      console.warn('[Fonts] Noto Color Emoji registration note:', e.message);
    }
  } else {
    console.warn('[Fonts] ⚠️ Noto Color Emoji not found in assets or system paths');
  }

  // 2. Inter (modern clean editorial sans-serif)
  const interPath = findFontFile(['Inter.ttf', 'Inter-VariableFont_opsz,wght.ttf', 'Inter-Bold.ttf', 'Inter-Regular.ttf']);
  if (interPath) {
    try {
      registerFontNodeCanvas(interPath, { family: 'Inter', weight: 'bold' });
      registerFontNodeCanvas(interPath, { family: 'Inter', weight: 'normal' });
      if (GlobalFonts) {
        GlobalFonts.registerFromPath(interPath, 'Inter');
      }
      detectedFonts.sansPrimary.registered = true;
      detectedFonts.sansPrimary.path = interPath;
      console.log(`[Fonts] ✅ Detected & Registered Inter font (${interPath})`);
    } catch (e) {
      console.warn('[Fonts] Inter registration note:', e.message);
    }
  }

  // 3. Montserrat (bold high-impact geometric headline typeface)
  const montPath = findFontFile(['Montserrat.ttf', 'Montserrat-VariableFont_wght.ttf', 'Montserrat-Bold.ttf', 'Montserrat-Regular.ttf']);
  if (montPath) {
    try {
      registerFontNodeCanvas(montPath, { family: 'Montserrat', weight: 'bold' });
      registerFontNodeCanvas(montPath, { family: 'Montserrat', weight: 'normal' });
      if (GlobalFonts) {
        GlobalFonts.registerFromPath(montPath, 'Montserrat');
      }
      detectedFonts.sansGeometric.registered = true;
      detectedFonts.sansGeometric.path = montPath;
      console.log(`[Fonts] ✅ Detected & Registered Montserrat font (${montPath})`);
    } catch (e) {
      console.warn('[Fonts] Montserrat registration note:', e.message);
    }
  }

  // 4. Playfair Display (refined classical serif)
  const playfairPath = findFontFile(['PlayfairDisplay.ttf', 'PlayfairDisplay-Bold.ttf', 'PlayfairDisplay-Regular.ttf']);
  if (playfairPath) {
    try {
      registerFontNodeCanvas(playfairPath, { family: 'PlayfairDisplay', weight: 'bold' });
      registerFontNodeCanvas(playfairPath, { family: 'Playfair Display', weight: 'bold' });
      if (GlobalFonts) {
        GlobalFonts.registerFromPath(playfairPath, 'PlayfairDisplay');
        GlobalFonts.registerFromPath(playfairPath, 'Playfair Display');
      }
      detectedFonts.serif.registered = true;
      detectedFonts.serif.path = playfairPath;
      console.log(`[Fonts] ✅ Detected & Registered Playfair Display font (${playfairPath})`);
    } catch (e) {
      console.warn('[Fonts] Playfair Display registration note:', e.message);
    }
  }
}

try {
  detectAndRegisterFonts();
} catch (fontErr) {
  console.warn('[Fonts] Font registration error:', fontErr.message);
}

// --- 3. FFMPEG & FFPROBE RESOLUTION ---
function resolveBinary(cmdName, installerPkg) {
  try {
    execSync(`${cmdName} -version`, { stdio: 'ignore' });
    return cmdName;
  } catch (_) {
    try {
      const installer = require(installerPkg);
      if (installer && installer.path) {
        return installer.path;
      }
    } catch (_) {}
  }
  return cmdName;
}

const FFMPEG_BIN = resolveBinary('ffmpeg', '@ffmpeg-installer/ffmpeg');
const FFPROBE_BIN = resolveBinary('ffprobe', '@ffprobe-installer/ffprobe');

let ffmpegVersion = 'Unknown';
try {
  const out = execSync(`"${FFMPEG_BIN}" -version`).toString();
  const match = out.match(/ffmpeg version ([^\s]+)/i);
  ffmpegVersion = match ? match[1] : 'Detected';
  console.log(`[Media Engine] FFmpeg ready (${ffmpegVersion})`);
} catch (err) {
  console.warn('[Media Engine] FFmpeg detection warning:', err.message);
}

// --- 4. EMOJI AND GRAPHIC ASSET ENGINE ---

// Unicode regex matching single emojis, composite emojis, and 2-letter country flags
const EMOJI_REGEX = /(?:\p{Regional_Indicator}{2}|[\p{Extended_Pictographic}\uFE0F\u200D]+)/gu;

function emojiToCodePoints(str) {
  return [...str]
    .map((c) => c.codePointAt(0).toString(16))
    .filter((c) => c !== 'fe0f')
    .join('-');
}

const emojiImageCache = new Map();

async function getEmojiImage(emojiChar) {
  if (emojiImageCache.has(emojiChar)) {
    return emojiImageCache.get(emojiChar);
  }

  const code = emojiToCodePoints(emojiChar);
  const localPath = path.join(EMOJIS_DIR, `${code}.png`);

  if (fs.existsSync(localPath)) {
    try {
      const img = await loadImage(localPath);
      emojiImageCache.set(emojiChar, img);
      return img;
    } catch (_) {}
  }

  // Fetch from Twemoji CDN if not present locally
  try {
    const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`;
    const buffer = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });

    fs.writeFileSync(localPath, buffer);
    const img = await loadImage(buffer);
    emojiImageCache.set(emojiChar, img);
    return img;
  } catch (err) {
    // Return null if network failed or emoji doesn't exist
    return null;
  }
}

/**
 * Renders an emoji/flag character with colorful Unicode font (Noto Color Emoji)
 * with graceful fallback to cached image/Twemoji or system text.
 */
async function drawEmoji(ctx, emojiChar, x, y, size, isTopBaseline = false) {
  // 1. Prioritize vibrant Twemoji PNG first for guaranteed full-color rendering
  try {
    const img = await getEmojiImage(emojiChar);
    if (img) {
      const drawY = isTopBaseline ? y : y - size * 0.85;
      ctx.drawImage(img, x, drawY, size, size);
      return true;
    }
  } catch (_) {}

  // 2. Fallback to Noto Color Emoji / font
  try {
    ctx.save();
    ctx.font = `${size}px "Noto Color Emoji", "NotoColorEmoji", sans-serif`;
    if (isTopBaseline) {
      ctx.textBaseline = 'top';
    }
    ctx.fillText(emojiChar, x, y);
    ctx.restore();
    return true;
  } catch (err) {
    try {
      ctx.save();
      ctx.font = `${size}px sans-serif`;
      if (isTopBaseline) ctx.textBaseline = 'top';
      ctx.fillText(emojiChar, x, y);
      ctx.restore();
      return false;
    } catch (_) {
      return false;
    }
  }
}

function cleanFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`[Cleanup] Could not delete ${filePath}:`, err.message);
  }
}

function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    const cmd = `"${FFPROBE_BIN}" -v error -show_entries format=duration -show_streams -of json "${filePath}"`;
    exec(cmd, (error, stdout) => {
      if (error) return reject(error);
      try {
        const data = JSON.parse(stdout);
        const duration = parseFloat(data.format?.duration || 0);
        const streams = data.streams || [];
        const hasAudio = streams.some((s) => s.codec_type === 'audio');
        const hasVideo = streams.some((s) => s.codec_type === 'video');
        resolve({ duration, hasAudio, hasVideo, streams });
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

// --- 5. EDITORIAL TEXT & OVERLAY GENERATOR ---

/**
 * Tokenizes text into words, whitespace, and emoji sequences
 */
function tokenizeText(text) {
  const tokens = [];
  let lastIndex = 0;
  let match;
  while ((match = EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textPart = text.substring(lastIndex, match.index);
      tokens.push(...textPart.split(/(\s+)/).filter(Boolean).map((t) => ({ type: 'text', value: t })));
    }
    tokens.push({ type: 'emoji', value: match[0] });
    lastIndex = EMOJI_REGEX.lastIndex;
  }
  if (lastIndex < text.length) {
    const textPart = text.substring(lastIndex);
    tokens.push(...textPart.split(/(\s+)/).filter(Boolean).map((t) => ({ type: 'text', value: t })));
  }
  return tokens;
}

/**
 * Word wraps tokens within a maxWidth budget
 */
/**
 * Resolves typeface based on explicit user preference or automatic style matching
 */
function resolveFontFamily(requestedFont, style = 'editorial') {
  if (requestedFont) {
    const lower = requestedFont.toLowerCase();
    if (lower.includes('montserrat')) return 'Montserrat';
    if (lower.includes('inter')) return 'Inter';
    if (lower.includes('playfair')) return 'PlayfairDisplay';
  }

  // Automatic style-matched typography pairing:
  // - Breaking news & split news cards use bold geometric Montserrat for high punch
  // - Classic editorial & minimal briefing use clean Inter for balanced legibility
  if (style === 'breaking' || style === 'split') {
    return detectedFonts.sansGeometric.registered ? 'Montserrat' : 'Inter';
  }
  return detectedFonts.sansPrimary.registered ? 'Inter' : (detectedFonts.sansGeometric.registered ? 'Montserrat' : 'sans-serif');
}

/**
 * Constructs a robust cross-platform font CSS string with primary family, fallbacks, and Noto Color Emoji
 */
function getFontStyleString(weight = 'bold', size = 50, preferredFamily = 'Inter') {
  return `${weight} ${size}px "${preferredFamily}", "Montserrat", "Inter", "PlayfairDisplay", "Noto Color Emoji", "NotoColorEmoji", sans-serif`;
}

/**
 * Tokenizes text and measures glyph widths with full Noto Color Emoji & typography awareness
 */
function wrapTokens(tokens, ctx, maxWidth, fontSize, preferredFamily = 'Inter') {
  const lines = [];
  let currentLine = [];
  let currentLineWidth = 0;

  for (const token of tokens) {
    if (token.type === 'text' && token.value.includes('\n')) {
      // Handle explicit line breaks
      const parts = token.value.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          ctx.save();
          ctx.font = getFontStyleString('bold', fontSize, preferredFamily);
          const w = ctx.measureText(parts[i]).width;
          ctx.restore();
          currentLine.push({ type: 'text', value: parts[i], width: w });
          currentLineWidth += w;
        }
        if (i < parts.length - 1) {
          lines.push({ tokens: currentLine, width: currentLineWidth });
          currentLine = [];
          currentLineWidth = 0;
        }
      }
      continue;
    }

    let tokenWidth = 0;
    if (token.type === 'emoji') {
      ctx.save();
      ctx.font = `${fontSize}px "Noto Color Emoji", "NotoColorEmoji", sans-serif`;
      tokenWidth = ctx.measureText(token.value).width || (fontSize * 1.15);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = getFontStyleString('bold', fontSize, preferredFamily);
      tokenWidth = ctx.measureText(token.value).width;
      ctx.restore();
    }

    if (currentLineWidth + tokenWidth > maxWidth && currentLine.length > 0) {
      lines.push({ tokens: currentLine, width: currentLineWidth });
      // If leading token on next line is pure whitespace, skip it
      if (token.type === 'text' && token.value.trim() === '') {
        currentLine = [];
        currentLineWidth = 0;
      } else {
        currentLine = [{ ...token, width: tokenWidth }];
        currentLineWidth = tokenWidth;
      }
    } else {
      currentLine.push({ ...token, width: tokenWidth });
      currentLineWidth += tokenWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push({ tokens: currentLine, width: currentLineWidth });
  }

  return lines;
}

/**
 * Determines appropriate editorial style based on text content
 */
function detectStyle(text) {
  const upper = (text || '').toUpperCase();

  // STYLE 2: BREAKING NEWS
  if (
    upper.includes('JUST IN') ||
    upper.includes('BREAKING') ||
    upper.includes('ALERT') ||
    upper.includes('URGENT') ||
    text.includes('🔴') ||
    text.includes('🚨')
  ) {
    return 'breaking';
  }

  // Check leading emojis for flags (e.g. 🇿🇦 🇮🇳)
  const { flags } = extractLeadingBadges(text);
  if (flags.length >= 2) {
    // Two flags indicate international diplomacy, summit, meeting, or sports
    return 'split';
  }

  // STYLE 4: SPLIT EDITORIAL
  if (
    upper.includes('SUMMIT') ||
    upper.includes('MEETING') ||
    upper.includes('VS') ||
    upper.includes('DISPATCH') ||
    upper.includes('AGREEMENT')
  ) {
    return 'split';
  }

  const length = (text || '').trim().length;

  // STYLE 5: MINIMAL NEWS
  if (length < 65 && flags.length === 0) {
    return 'minimal';
  }

  // STYLE 1: EDITORIAL
  if (length <= 130) {
    return 'editorial';
  }

  // STYLE 3: FULL SCREEN
  return 'fullscreen';
}

/**
 * Extracts leading flags or badges from text (e.g. "🇿🇦 🇮🇳\n\nPresident Cyril Ramaphosa...")
 */
function extractLeadingBadges(rawText) {
  const lines = rawText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { flags: [], headline: '' };

  const firstLine = lines[0];
  const emojis = firstLine.match(EMOJI_REGEX) || [];
  const textOnly = firstLine.replace(EMOJI_REGEX, '').trim();

  if (emojis.length > 0 && textOnly.length <= 4) {
    return {
      flags: emojis,
      headline: lines.slice(1).join('\n').trim() || lines[0]
    };
  }

  return {
    flags: [],
    headline: lines.join('\n').trim()
  };
}

const ACCENT_COLORS = {
  blue: '#38bdf8',
  red: '#ef4444',
  green: '#10b981',
  orange: '#f59e0b',
  purple: '#a855f7',
  white: '#ffffff'
};

function resolveAccentColor(choice, style) {
  if (choice && typeof choice === 'string') {
    const lower = choice.toLowerCase().trim();
    if (ACCENT_COLORS[lower]) return ACCENT_COLORS[lower];
    if (lower.startsWith('#')) return lower;
  }
  if (style === 'breaking') return '#ef4444';
  if (style === 'split') return '#f43f5e';
  return '#38bdf8';
}

function resolveFontSize(choice, textLength) {
  if (choice === 'small') return 40;
  if (choice === 'medium') return 48;
  if (choice === 'large') return 58;
  if (typeof choice === 'number') return choice;
  if (textLength > 110) return 40;
  if (textLength > 65) return 48;
  return 54;
}

function smartAutoDetect(text) {
  const upper = (text || '').toUpperCase();
  const detectedBadges = [];

  // News / Alert Badges
  if (upper.includes('JUST IN') || text.includes('🔴')) {
    detectedBadges.push('🔴 JUST IN');
  } else if (upper.includes('BREAKING') || text.includes('🚨')) {
    detectedBadges.push('🚨 BREAKING');
  }
  if (upper.includes('TRENDING') || upper.includes('VIRAL') || text.includes('🔥')) {
    detectedBadges.push('🔥 TRENDING');
  }
  if (upper.includes('UPDATE') || text.includes('⚡')) {
    detectedBadges.push('⚡ UPDATE');
  }
  if (upper.includes('EXCLUSIVE') || text.includes('👑')) {
    detectedBadges.push('👑 EXCLUSIVE');
  }
  if (upper.includes('GLOBAL') || upper.includes('WORLD') || text.includes('🌍')) {
    detectedBadges.push('🌍 GLOBAL');
  }

  // Country flags
  if (upper.includes('SOUTH AFRICA') || upper.includes('RAMAPHOSA') || text.includes('🇿🇦')) {
    detectedBadges.push('🇿🇦');
  }
  if (upper.includes('INDIA') || upper.includes('MODI') || upper.includes('DELHI') || text.includes('🇮🇳')) {
    detectedBadges.push('🇮🇳');
  }
  if (upper.includes('USA') || upper.includes('AMERICA') || upper.includes('BIDEN') || upper.includes('TRUMP') || upper.includes('WASHINGTON') || text.includes('🇺🇸')) {
    detectedBadges.push('🇺🇸');
  }
  if (upper.includes('UK') || upper.includes('BRITAIN') || upper.includes('LONDON') || text.includes('🇬🇧')) {
    detectedBadges.push('🇬🇧');
  }
  if (upper.includes('EU') || upper.includes('EUROPE') || upper.includes('BRUSSELS') || text.includes('🇪🇺')) {
    detectedBadges.push('🇪🇺');
  }
  if (upper.includes('JAPAN') || upper.includes('TOKYO') || text.includes('🇯🇵')) {
    detectedBadges.push('🇯🇵');
  }

  // Any other leading emoji flags in the text itself
  const leading = extractLeadingBadges(text);
  for (const flag of leading.flags) {
    if (!detectedBadges.includes(flag)) {
      detectedBadges.unshift(flag);
    }
  }

  const style = detectStyle(text);
  return {
    style,
    badges: detectedBadges
  };
}

/**
 * Renders badges or flags row at startY with alignment
 */
async function renderBadgesRow(ctx, badges, startY, align = 'left', accentColor = '#38bdf8') {
  if (!badges || badges.length === 0) return 0;

  const items = [];
  let totalWidth = 0;
  for (const b of badges.slice(0, 4)) {
    const isSingleEmoji = /^\p{Emoji}$/u.test(b) || (b.length <= 4 && !b.includes(' '));
    if (isSingleEmoji) {
      items.push({ type: 'emoji', value: b, width: 68 });
      totalWidth += 68 + 12;
    } else {
      ctx.save();
      ctx.font = getFontStyleString('bold', 20, 'Montserrat');
      const textW = ctx.measureText(b).width;
      ctx.restore();
      const pillW = Math.round(textW + 36);
      items.push({ type: 'pill', value: b, width: pillW });
      totalWidth += pillW + 12;
    }
  }
  if (items.length > 0) totalWidth -= 12;

  let curX = align === 'center' ? Math.round((1080 - totalWidth) / 2) : 90;
  for (const item of items) {
    if (item.type === 'emoji') {
      await drawEmoji(ctx, item.value, curX, startY, 56, true);
      curX += item.width + 12;
    } else {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(curX, startY + 4, item.width, 46, 23);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = getFontStyleString('bold', 20, 'Montserrat');
      ctx.fillText(item.value, curX + 18, startY + 34);
      curX += item.width + 12;
    }
  }
  return 60;
}

/**
 * Creates a high-end 1080x1920 transparent PNG overlay with creative editorial styling
 */
async function generateCreativeOverlay(rawText, styleHint = null, options = {}) {
  if (!rawText || !rawText.trim()) return null;

  let style = styleHint || options.style || 'auto';
  if (style === 'auto') {
    style = detectStyle(rawText);
  }

  const { flags, headline } = extractLeadingBadges(rawText);
  const contentText = headline || rawText;

  const requestedFont = options.font || options.fontFamily || null;
  const headlineFont = resolveFontFamily(requestedFont, style);

  const accentColor = resolveAccentColor(options.accent, style);
  const fontSize = resolveFontSize(options.size, contentText.length);
  const align = options.align === 'center' ? 'center' : 'left';

  let activeBadges = [];
  if (options.badges && Array.isArray(options.badges) && options.badges.length > 0) {
    activeBadges = [...options.badges];
  } else if (flags.length > 0) {
    activeBadges = [...flags];
  }

  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext('2d');

  if (style === 'editorial') {
    // --- STYLE 1: EDITORIAL (CLASSIC NEWS HEADLINE) ---
    const grad = ctx.createLinearGradient(0, 0, 0, 780);
    grad.addColorStop(0, 'rgba(8, 12, 22, 0.95)');
    grad.addColorStop(0.55, 'rgba(8, 12, 22, 0.84)');
    grad.addColorStop(0.85, 'rgba(8, 12, 22, 0.40)');
    grad.addColorStop(1, 'rgba(8, 12, 22, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 780);

    const topY = 135;
    if (activeBadges.length > 0) {
      await renderBadgesRow(ctx, activeBadges, topY, align, accentColor);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.beginPath();
      ctx.roundRect(810, topY + 8, 180, 44, 22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = getFontStyleString('bold', 18, 'Montserrat');
      ctx.fillText('GLOBAL DESK', 835, topY + 36);
    }

    const lineHeight = fontSize * 1.25;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);

    const tokens = tokenizeText(contentText);
    const wrappedLines = wrapTokens(tokens, ctx, 900, fontSize, headlineFont);

    let textY = topY + (activeBadges.length > 0 ? 110 : 90);

    for (const line of wrappedLines.slice(0, 6)) {
      const lineWidth = line.width;
      let curX = align === 'center' ? Math.round(90 + (900 - lineWidth) / 2) : 90;

      for (const tok of line.tokens) {
        if (tok.type === 'emoji') {
          await drawEmoji(ctx, tok.value, curX, textY, fontSize, false);
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;
          ctx.fillStyle = '#ffffff';
          ctx.font = getFontStyleString('bold', fontSize, headlineFont);
          ctx.fillText(tok.value, curX, textY);
          ctx.shadowColor = 'transparent';
        }
        curX += tok.width;
      }
      textY += lineHeight;
    }

    ctx.fillStyle = accentColor;
    const barW = 85;
    const barX = align === 'center' ? Math.round((1080 - barW) / 2) : 90;
    ctx.beginPath();
    ctx.roundRect(barX, textY + 14, barW, 6, 3);
    ctx.fill();

  } else if (style === 'breaking') {
    // --- STYLE 2: BREAKING NEWS ---
    const grad = ctx.createLinearGradient(0, 0, 0, 820);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.78)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 820);

    const startY = 140;

    if (activeBadges.length > 0) {
      await renderBadgesRow(ctx, activeBadges, startY, align, accentColor);
    } else {
      const badgeW = 220;
      const badgeX = align === 'center' ? Math.round((1080 - badgeW) / 2) : 90;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(badgeX, startY, badgeW, 50, 25);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(badgeX + 30, startY + 25, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = getFontStyleString('bold', 22, 'Montserrat');
      ctx.fillStyle = '#ffffff';
      ctx.fillText('BREAKING', badgeX + 50, startY + 33);
    }

    const lineHeight = fontSize * 1.25;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);

    const tokens = tokenizeText(contentText);
    const wrappedLines = wrapTokens(tokens, ctx, 900, fontSize, headlineFont);

    let textY = startY + 115;

    for (const line of wrappedLines.slice(0, 7)) {
      const lineWidth = line.width;
      let curX = align === 'center' ? Math.round(90 + (900 - lineWidth) / 2) : 90;

      for (const tok of line.tokens) {
        if (tok.type === 'emoji') {
          await drawEmoji(ctx, tok.value, curX, textY, fontSize, false);
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;
          ctx.fillStyle = '#ffffff';
          ctx.font = getFontStyleString('bold', fontSize, headlineFont);
          ctx.fillText(tok.value, curX, textY);
          ctx.shadowColor = 'transparent';
        }
        curX += tok.width;
      }
      textY += lineHeight;
    }

    ctx.fillStyle = accentColor;
    const barW = 95;
    const barX = align === 'center' ? Math.round((1080 - barW) / 2) : 90;
    ctx.beginPath();
    ctx.roundRect(barX, textY + 14, barW, 6, 3);
    ctx.fill();

  } else if (style === 'split') {
    // --- STYLE 4: SPLIT EDITORIAL (NEWS CARD CONTAINER) ---
    const cardY = 110;
    const cardWidth = 920;
    const cardX = (1080 - cardWidth) / 2;

    const lineHeight = fontSize * 1.26;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);

    const tokens = tokenizeText(contentText);
    const wrappedLines = wrapTokens(tokens, ctx, 840, fontSize, headlineFont);

    const totalLines = Math.min(wrappedLines.length, 6);
    const cardHeight = 120 + (totalLines * lineHeight) + 60;

    ctx.fillStyle = 'rgba(12, 17, 29, 0.96)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 26);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let headerY = cardY + 36;
    let curFlagX = cardX + 40;

    if (activeBadges.length > 0) {
      for (const badge of activeBadges.slice(0, 3)) {
        await drawEmoji(ctx, badge, curFlagX, headerY, 52, true);
        curFlagX += 68;
      }
    } else {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(curFlagX, headerY + 6, 110, 36, 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = getFontStyleString('bold', 16, 'Montserrat');
      ctx.fillText('DISPATCH', curFlagX + 18, headerY + 30);
      curFlagX += 130;
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(cardX + cardWidth - 180, headerY + 6, 140, 38, 19);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = getFontStyleString('bold', 16, 'Montserrat');
    ctx.fillText('EDITION', cardX + cardWidth - 146, headerY + 31);

    let curY = headerY + 95;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);
    ctx.fillStyle = '#ffffff';

    for (const line of wrappedLines.slice(0, 6)) {
      const lineWidth = line.width;
      let curX = align === 'center' ? Math.round(cardX + 40 + (840 - lineWidth) / 2) : cardX + 40;

      for (const tok of line.tokens) {
        if (tok.type === 'emoji') {
          await drawEmoji(ctx, tok.value, curX, curY, fontSize, false);
        } else {
          ctx.font = getFontStyleString('bold', fontSize, headlineFont);
          ctx.fillText(tok.value, curX, curY);
        }
        curX += tok.width;
      }
      curY += lineHeight;
    }

    ctx.fillStyle = accentColor;
    const barW = 80;
    const barX = align === 'center' ? Math.round(cardX + (cardWidth - barW) / 2) : cardX + 40;
    ctx.beginPath();
    ctx.roundRect(barX, curY + 6, barW, 6, 3);
    ctx.fill();

  } else if (style === 'minimal') {
    // --- STYLE 5: MINIMAL NEWS ---
    const cardY = 140;
    const cardWidth = 920;
    const cardX = 80;

    const lineHeight = fontSize * 1.30;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);

    const tokens = tokenizeText(contentText);
    const wrappedLines = wrapTokens(tokens, ctx, 840, fontSize, headlineFont);
    const totalLines = Math.min(wrappedLines.length, 5);
    const cardHeight = 90 + (totalLines * lineHeight) + 50;

    ctx.fillStyle = 'rgba(10, 15, 26, 0.92)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 22);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(cardX + 46, cardY + 44, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = getFontStyleString('bold', 16, 'Montserrat');
    const badgeLabel = activeBadges.length > 0 ? activeBadges.join(' ') : 'NEWS REEL • BRIEFING';
    ctx.fillText(badgeLabel, cardX + 60, cardY + 50);

    let curY = cardY + 105;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);
    ctx.fillStyle = '#f8fafc';

    for (const line of wrappedLines.slice(0, 5)) {
      const lineWidth = line.width;
      let curX = align === 'center' ? Math.round(cardX + 40 + (840 - lineWidth) / 2) : cardX + 40;

      for (const tok of line.tokens) {
        if (tok.type === 'emoji') {
          await drawEmoji(ctx, tok.value, curX, curY, fontSize, false);
        } else {
          ctx.font = getFontStyleString('bold', fontSize, headlineFont);
          ctx.fillText(tok.value, curX, curY);
        }
        curX += tok.width;
      }
      curY += lineHeight;
    }

  } else {
    // --- STYLE 3: FULL SCREEN (CINEMATIC LOWER-THIRD SCRIM) ---
    const scrimHeight = 940;
    const scrimStartY = 1920 - scrimHeight;

    const grad = ctx.createLinearGradient(0, scrimStartY, 0, 1920);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.35, 'rgba(6, 10, 20, 0.72)');
    grad.addColorStop(0.70, 'rgba(6, 10, 20, 0.92)');
    grad.addColorStop(1, 'rgba(6, 10, 20, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scrimStartY, 1080, scrimHeight);

    let textStartY = 1380;

    if (activeBadges.length > 0) {
      await renderBadgesRow(ctx, activeBadges, textStartY - 90, align, accentColor);
    } else {
      const pillW = 160;
      const pillX = align === 'center' ? Math.round((1080 - pillW) / 2) : 90;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.roundRect(pillX, textStartY - 80, pillW, 40, 20);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.font = getFontStyleString('bold', 18, 'Montserrat');
      ctx.fillText('TOP STORY', pillX + 25, textStartY - 54);
    }

    const lineHeight = fontSize * 1.28;
    ctx.font = getFontStyleString('bold', fontSize, headlineFont);

    const tokens = tokenizeText(contentText);
    const wrappedLines = wrapTokens(tokens, ctx, 900, fontSize, headlineFont);

    let textY = textStartY;
    ctx.fillStyle = '#ffffff';

    for (const line of wrappedLines.slice(0, 5)) {
      const lineWidth = line.width;
      let curX = align === 'center' ? Math.round(90 + (900 - lineWidth) / 2) : 90;

      for (const tok of line.tokens) {
        if (tok.type === 'emoji') {
          await drawEmoji(ctx, tok.value, curX, textY, fontSize, false);
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;
          ctx.fillStyle = '#ffffff';
          ctx.font = getFontStyleString('bold', fontSize, headlineFont);
          ctx.fillText(tok.value, curX, textY);
          ctx.shadowColor = 'transparent';
        }
        curX += tok.width;
      }
      textY += lineHeight;
    }
  }

  const overlayPath = path.join(TEMP_DIR, `overlay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(overlayPath, buf);
  return overlayPath;
}

// --- 6. NODE-CANVAS TEXT OVERLAY MODULE & FFMPEG OVERLAY PIPELINE ---

/**
 * NodeCanvasOverlayModule
 * Dedicated module using 'node-canvas' to generate PNG text overlays from user text,
 * incorporating Noto Color Emoji for unicode support and professional fonts like Inter & Montserrat.
 * Builds and executes the FFmpeg filter_complex that overlays this generated PNG onto the source video
 * stream using the 'overlay' filter to ensure it remains visible throughout the entire duration.
 */
const NodeCanvasOverlayModule = {
  name: 'node-canvas-overlay',
  canvasEngine: nodeCanvas ? 'node-canvas' : '@napi-rs/canvas',
  detectedFonts,

  /**
   * Generates a 1080x1920 PNG text overlay from user text using 'node-canvas'.
   * Incorporates Noto Color Emoji for unicode support and professional fonts like Inter.
   *
   * @param {string} text - User text or headline with emojis
   * @param {Object} [options={}] - Custom options { style, font, outputPath }
   * @returns {Promise<{ filePath: string, buffer: Buffer, width: number, height: number, style: string, font: string }>}
   */
  async generateTextOverlayPNG(text, options = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Valid text string is required to generate text overlay');
    }

    const overlayPath = await generateCreativeOverlay(text.trim(), options.style || null, {
      font: options.font || null
    });

    const buffer = fs.readFileSync(overlayPath);

    return {
      filePath: overlayPath,
      buffer,
      width: 1080,
      height: 1920,
      style: options.style || detectStyle(text),
      font: options.font || 'auto'
    };
  },

  /**
   * Constructs the FFmpeg filter_complex that overlays the generated PNG onto the
   * source video stream using the 'overlay' filter to ensure it remains visible throughout
   * the entire duration of the video.
   *
   * Architecture & Visibility Guarantee:
   * - '-loop 1 -i <overlay.png>': Streams the static PNG continuously as an infinite video stream.
   * - '[0:v]scale=...crop=...setsar=1[bg]': Standardizes source video to 9:16 vertical (1080x1920).
   * - '[1:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1[ov]': Ensures alpha channel compositing with subtle fade.
   * - '[bg][ov]overlay=0:0:shortest=1:repeatlast=1:format=auto[v]':
   *     * 'shortest=1': Video output terminates when the primary video finishes.
   *     * 'repeatlast=1': Forces FFmpeg to repeat the last frame of the overlay image continuously,
   *       guaranteeing the graphic text overlay remains visible across the entire duration of the video.
   *     * 'format=auto': Preserves accurate RGBA transparency without color clipping.
   *
   * @param {Object} [options={}]
   * @param {number} [options.videoInputIndex=0] - Video stream input index
   * @param {number} [options.overlayInputIndex=1] - PNG overlay input index
   * @param {number} [options.width=1080] - Output width
   * @param {number} [options.height=1920] - Output height
   * @param {number} [options.fadeInDuration=0.4] - Fade-in duration in seconds
   * @param {number|string} [options.x=0] - Overlay x position
   * @param {number|string} [options.y=0] - Overlay y position
   * @returns {string} The FFmpeg filter_complex string
   */
  buildFFmpegOverlayFilter(options = {}) {
    const {
      videoInputIndex = 0,
      overlayInputIndex = 1,
      width = 1080,
      height = 1920,
      fadeInDuration = 0.4,
      x = 0,
      y = 0
    } = options;

    const baseVideoFilter = `[${videoInputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[bg]`;
    const overlayPrep = fadeInDuration > 0
      ? `[${overlayInputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeInDuration}:alpha=1[ov]`
      : `[${overlayInputIndex}:v]format=rgba[ov]`;
    const composite = `[bg][ov]overlay=${x}:${y}:shortest=1:repeatlast=1:format=auto[v]`;

    return `${baseVideoFilter};${overlayPrep};${composite}`;
  },

  /**
   * High-level helper to render video with text overlay directly
   */
  async renderVideoWithOverlay({ videoPath, outputPath, text, style, font }) {
    return renderVideoReel({ videoPath, outputPath, text, styleHint: style, fontHint: font });
  }
};

const generateTextOverlayPNG = NodeCanvasOverlayModule.generateTextOverlayPNG;
const buildFFmpegOverlayFilter = NodeCanvasOverlayModule.buildFFmpegOverlayFilter;

/**
 * Creates procedural backdrop composites for Photo Reels (Studio, City, Cyber)
 */
async function createBackdropComposite(photoPath, backdrop, outputPath) {
  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext('2d');

  if (backdrop === 'studio') {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGrad.addColorStop(0, '#0a1128');
    bgGrad.addColorStop(0.5, '#050914');
    bgGrad.addColorStop(1, '#020408');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    const radGrad = ctx.createRadialGradient(540, 700, 40, 540, 700, 650);
    radGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    radGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.12)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(200 + i * 160, 650 + (i % 2) * 100, 60 + i * 15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (backdrop === 'city') {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGrad.addColorStop(0, '#0f0c29');
    bgGrad.addColorStop(0.6, '#302b63');
    bgGrad.addColorStop(1, '#24243e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    const amberGrad = ctx.createRadialGradient(540, 1600, 100, 540, 1600, 800);
    amberGrad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
    amberGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = amberGrad;
    ctx.fillRect(0, 1000, 1080, 920);
  } else {
    // Cyber Grid
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGrad.addColorStop(0, '#060b19');
    bgGrad.addColorStop(1, '#111827');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 2;
    const gridSpacing = 80;
    for (let x = 0; x <= 1080; x += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1920); ctx.stroke();
    }
    for (let y = 0; y <= 1920; y += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke();
    }
  }

  // Draw user photo in central broadcast card
  const img = await loadImage(photoPath);
  const targetX = 70;
  const targetY = 460;
  const targetW = 940;
  const targetH = 1040;
  const radius = 24;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 16;
  ctx.beginPath();
  ctx.roundRect(targetX, targetY, targetW, targetH, radius);
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(targetX, targetY, targetW, targetH, radius);
  ctx.clip();

  const imgRatio = img.width / img.height;
  const boxRatio = targetW / targetH;
  let drawW, drawH, drawX, drawY;
  if (imgRatio > boxRatio) {
    drawH = targetH;
    drawW = targetH * imgRatio;
    drawX = targetX - (drawW - targetW) / 2;
    drawY = targetY;
  } else {
    drawW = targetW;
    drawH = targetW / imgRatio;
    drawX = targetX;
    drawY = targetY - (drawH - targetH) / 2;
  }
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(targetX, targetY, targetW, targetH, radius);
  ctx.stroke();
  ctx.restore();

  fs.writeFileSync(outputPath, canvas.toBuffer('image/jpeg'));
  return outputPath;
}

/**
 * Creates an exactly 5-second 1080x1920 MP4 from a Photo with Ken Burns motion
 */
async function renderPhotoReel({ photoPath, outputPath, text, styleHint, fontHint, options = {} }) {
  let overlayPath = null;
  if (text && text.trim()) {
    overlayPath = await generateCreativeOverlay(text.trim(), styleHint, {
      font: fontHint,
      ...options
    });
  }

  let finalPhotoInput = photoPath;
  let tempBackdropComposite = null;

  const backdrop = options.backdrop || 'original';
  if (backdrop && backdrop !== 'original') {
    tempBackdropComposite = path.join(TEMP_DIR, `comp_bg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`);
    await createBackdropComposite(photoPath, backdrop, tempBackdropComposite);
    finalPhotoInput = tempBackdropComposite;
  }

  return new Promise((resolve, reject) => {
    // 5-second Ken Burns zoom-in animation (150 frames @ 30 FPS)
    const kenBurnsFilter =
      "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='min(zoom+0.0008,1.12)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30";

    let command = '';

    if (overlayPath) {
      const filterComplex = `[0:v]${kenBurnsFilter}[bg];[1:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1[ov];[bg][ov]overlay=0:0:shortest=1:repeatlast=1:format=auto[v]`;
      command = `"${FFMPEG_BIN}" -y -loop 1 -i "${finalPhotoInput}" -loop 1 -i "${overlayPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -filter_complex "${filterComplex}" -map "[v]" -map 2:a -c:v libx264 -pix_fmt yuv420p -r 30 -t 5 -c:a aac -b:a 128k -shortest -movflags +faststart "${outputPath}"`;
    } else {
      command = `"${FFMPEG_BIN}" -y -loop 1 -i "${finalPhotoInput}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -vf "${kenBurnsFilter}" -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 30 -t 5 -c:a aac -b:a 128k -shortest -movflags +faststart "${outputPath}"`;
    }

    console.log('[Media Engine] Rendering Photo -> 5-Second Reel...');
    exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
      cleanFile(overlayPath);
      if (tempBackdropComposite) cleanFile(tempBackdropComposite);
      if (error) {
        console.error('[Render Photo Error]:', error.message, stderr);
        return reject(new Error('Photo rendering failed'));
      }
      resolve(outputPath);
    });
  });
}

/**
 * Creates a 1080x1920 MP4 from Video preserving ORIGINAL DURATION and audio
 */
async function renderVideoReel({ videoPath, outputPath, text, styleHint, fontHint, options = {} }) {
  const probe = await probeMedia(videoPath);
  console.log(`[Media Engine] Video input: duration=${probe.duration}s, audio=${probe.hasAudio}`);

  let overlayPath = null;
  if (text && text.trim()) {
    overlayPath = await generateCreativeOverlay(text.trim(), styleHint, {
      font: fontHint,
      ...options
    });
  }

  return new Promise((resolve, reject) => {
    const baseVideoFilter = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';
    let command = '';

    if (overlayPath) {
      const filterComplex = NodeCanvasOverlayModule.buildFFmpegOverlayFilter();

      if (probe.hasAudio) {
        command = `"${FFMPEG_BIN}" -y -i "${videoPath}" -loop 1 -i "${overlayPath}" -filter_complex "${filterComplex}" -map "[v]" -map 0:a:0 -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest -movflags +faststart "${outputPath}"`;
      } else {
        const durationArg = probe.duration > 0 ? `-t ${probe.duration}` : '';
        command = `"${FFMPEG_BIN}" -y -i "${videoPath}" -loop 1 -i "${overlayPath}" -f lavfi ${durationArg} -i anullsrc=channel_layout=stereo:sample_rate=44100 -filter_complex "${filterComplex}" -map "[v]" -map 2:a -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest -movflags +faststart "${outputPath}"`;
      }
    } else {
      if (probe.hasAudio) {
        command = `"${FFMPEG_BIN}" -y -i "${videoPath}" -vf "${baseVideoFilter}" -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;
      } else {
        command = `"${FFMPEG_BIN}" -y -i "${videoPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -vf "${baseVideoFilter}" -map 0:v:0 -map 1:a:0 -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest -movflags +faststart "${outputPath}"`;
      }
    }

    console.log('[Media Engine] Rendering Video -> Reel (Preserving Duration)...');
    exec(command, { timeout: 180000 }, (error, stdout, stderr) => {
      cleanFile(overlayPath);
      if (error) {
        console.error('[Render Video Error]:', error.message, stderr);
        return reject(new Error('Video rendering failed'));
      }
      resolve(outputPath);
    });
  });
}

// --- 7. TELEGRAM BOT MULTI-USER STATE & HANDLERS ---

const userSessions = new Map();

function clearUserSession(chatId) {
  const session = userSessions.get(chatId);
  if (session) {
    if (session.mediaPath) cleanFile(session.mediaPath);
    if (session.outputPath) cleanFile(session.outputPath);
    userSessions.delete(chatId);
  }
}

// Periodic cleanup of stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [chatId, session] of userSessions.entries()) {
    if (session.updatedAt && now - session.updatedAt > 30 * 60 * 1000) {
      clearUserSession(chatId);
    }
  }
}, 5 * 60 * 1000);

let bot = null;
let botInfo = null;

const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: '🎬 Create Reel' }, { text: 'ℹ️ How It Works' }]
    ],
    resize_keyboard: true
  }
};

const TEXT_STAGE_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '⏭️ No Text', callback_data: 'NO_TEXT' },
        { text: '❌ Cancel', callback_data: 'CANCEL' }
      ]
    ]
  }
};

function sendMainMenu(chatId, message = '🎬 *Creative Reel Maker*\n\nWelcome! Create stylish, Instagram-ready news & social reels in seconds.') {
  if (!bot) return;
  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    ...MAIN_KEYBOARD
  });
}

function sendHelp(chatId) {
  if (!bot) return;
  const helpText =
`🎬 *Editorial Typography Studio (Telegram Bot)*

Create an Instagram-ready news & social reel in seconds.

1️⃣ Click *Create Reel*
2️⃣ Send a photo or video
3️⃣ Send your text (supports emojis & flags: 🇿🇦 🇮🇳 🔥 ⚡)
4️⃣ Choose your *Design Style* (Editorial, Breaking, Full Screen, Split, Minimal, or Auto)
5️⃣ Customize typography, badges, headline size, alignment, accent color, and backdrops
6️⃣ Review confirmation screen and click *Generate Reel*
7️⃣ Receive the 1080x1920 MP4 ready for Instagram! 🚀

🖼️ *Photo* → 5-second reel with smooth cinematic motion & backdrops
🎥 *Video* → Original duration & audio preserved with full text overlay

🔤 *Typography & Badges Engine:*
• *Noto Color Emoji & Twemoji*: High-resolution color flags & symbols
• *Inter* & *Montserrat*: High-impact editorial typography
• *Playfair Display*: Refined classical serif
• Type \`/fonts\` to inspect font status
• Type \`/font [montserrat|inter|playfair|auto]\` to set default typeface`;

  bot.sendMessage(chatId, helpText, {
    parse_mode: 'Markdown',
    ...MAIN_KEYBOARD
  });
}

async function safeSendOrEdit(chatId, text, replyMarkup, messageId = null) {
  if (!bot) return;
  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });
      return;
    } catch (_) {}
  }
  return bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: replyMarkup
  });
}

const STYLE_LABELS = {
  editorial: 'Editorial',
  breaking: 'Breaking News',
  fullscreen: 'Full Screen Scrim',
  split: 'Split News Card',
  minimal: 'Minimal Briefing',
  auto: 'Auto (Style-Matched)'
};

const FONT_LABELS = {
  auto: 'Auto (Style-Matched)',
  montserrat: 'Montserrat',
  inter: 'Inter',
  playfair: 'Playfair Display'
};

const SIZE_LABELS = {
  auto: 'Auto (Dynamic)',
  small: 'Small (40px)',
  medium: 'Medium (48px)',
  large: 'Large (58px)'
};

const ALIGN_LABELS = {
  left: 'Left',
  center: 'Center'
};

const ACCENT_LABELS = {
  auto: 'Auto',
  blue: '🔵 Cyan / Blue',
  red: '🔴 Red',
  green: '🟢 Green',
  orange: '🟠 Orange',
  purple: '🟣 Purple',
  white: '⚪ White'
};

const BACKDROP_LABELS = {
  original: 'Original',
  studio: 'News Studio',
  city: 'Night City',
  cyber: 'Cyber Grid'
};

function sendStyleMenu(chatId, messageId = null) {
  const text = '🎨 *Choose your reel style:*';
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📰 Editorial', callback_data: 'STYLE_editorial' },
        { text: '🚨 Breaking News', callback_data: 'STYLE_breaking' }
      ],
      [
        { text: '🎬 Full Screen', callback_data: 'STYLE_fullscreen' },
        { text: '🧾 Split News', callback_data: 'STYLE_split' }
      ],
      [
        { text: '⚡ Minimal', callback_data: 'STYLE_minimal' },
        { text: '🎲 Auto Detect', callback_data: 'STYLE_auto' }
      ],
      [
        { text: '✨ Auto Settings', callback_data: 'AUTO_SETTINGS' },
        { text: '❌ Cancel', callback_data: 'CANCEL' }
      ]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendCustomizeMenu(chatId, messageId = null) {
  const session = userSessions.get(chatId);
  if (!session) return sendMainMenu(chatId);

  const styleDisplay = STYLE_LABELS[session.style] || 'Editorial';
  const fontDisplay = FONT_LABELS[session.font] || 'Auto';
  const sizeDisplay = SIZE_LABELS[session.size] || 'Auto';
  const alignDisplay = ALIGN_LABELS[session.align] || 'Left';
  const badgesDisplay = (session.badges && session.badges.length > 0) ? session.badges.join(' ') : 'None';
  const accentDisplay = ACCENT_LABELS[session.accent] || 'Auto';
  const backdropDisplay = BACKDROP_LABELS[session.backdrop] || 'Original';

  let text = `🎨 *Reel Customization*\n\n` +
    `• *Style:* ${styleDisplay}\n` +
    `• *Font:* ${fontDisplay}\n` +
    `• *Headline Size:* ${sizeDisplay}\n` +
    `• *Alignment:* ${alignDisplay}\n` +
    `• *Badges:* ${badgesDisplay}\n` +
    `• *Accent Color:* ${accentDisplay}\n` +
    (session.mediaType === 'photo' ? `• *Backdrop:* ${backdropDisplay}\n` : '') +
    `\nFine-tune any option below, or click *Review & Generate*:`;

  const rows = [
    [
      { text: '🔤 Typography', callback_data: 'MENU_TYPO' },
      { text: '🏷️ Badges', callback_data: 'MENU_BADGES' }
    ],
    [
      { text: '📏 Size', callback_data: 'MENU_SIZE' },
      { text: '↔️ Alignment', callback_data: 'MENU_ALIGN' }
    ],
    [
      { text: '🎨 Accent Color', callback_data: 'MENU_ACCENT' },
      ...(session.mediaType === 'photo' ? [{ text: '🖼️ Backdrop', callback_data: 'MENU_BACKDROP' }] : [])
    ],
    [
      { text: '🎬 Review & Generate', callback_data: 'CONFIRM_SCREEN' }
    ],
    [
      { text: '✨ Auto Settings', callback_data: 'AUTO_SETTINGS' },
      { text: '❌ Cancel', callback_data: 'CANCEL' }
    ]
  ];

  return safeSendOrEdit(chatId, text, { inline_keyboard: rows }, messageId);
}

function sendTypographyMenu(chatId, messageId = null) {
  const text = '🔤 *Choose Headline Typography:*';
  const keyboard = {
    inline_keyboard: [
      [{ text: '✨ Auto (Style-Matched)', callback_data: 'SET_FONT_auto' }],
      [
        { text: 'Montserrat (Bold)', callback_data: 'SET_FONT_montserrat' },
        { text: 'Inter (Clean)', callback_data: 'SET_FONT_inter' }
      ],
      [{ text: 'Playfair Display (Serif)', callback_data: 'SET_FONT_playfair' }],
      [{ text: '⬅️ Back to Menu', callback_data: 'BACK_CUSTOMIZE' }]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendBadgesMenu(chatId, messageId = null) {
  const session = userSessions.get(chatId);
  if (!session) return sendMainMenu(chatId);

  const currentBadges = (session.badges && session.badges.length > 0) ? session.badges.join(' ') : 'None';
  const text = `🏷️ *Quick Badges & Flags*\n\nActive: *${currentBadges}*\n\nTap any badge to add/remove:`;
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🇮🇳 India', callback_data: 'BADGE_🇮🇳' },
        { text: '🇺🇸 USA', callback_data: 'BADGE_🇺🇸' },
        { text: '🇬🇧 UK', callback_data: 'BADGE_🇬🇧' }
      ],
      [
        { text: '🇿🇦 S. Africa', callback_data: 'BADGE_🇿🇦' },
        { text: '🇪🇺 EU', callback_data: 'BADGE_🇪🇺' },
        { text: '🇯🇵 Japan', callback_data: 'BADGE_🇯🇵' }
      ],
      [
        { text: '🔴 JUST IN', callback_data: 'BADGE_🔴 JUST IN' },
        { text: '🚨 BREAKING', callback_data: 'BADGE_🚨 BREAKING' }
      ],
      [
        { text: '🔥 TRENDING', callback_data: 'BADGE_🔥 TRENDING' },
        { text: '⚡ UPDATE', callback_data: 'BADGE_⚡ UPDATE' }
      ],
      [
        { text: '👑 EXCLUSIVE', callback_data: 'BADGE_👑 EXCLUSIVE' },
        { text: '🌍 GLOBAL', callback_data: 'BADGE_🌍 GLOBAL' }
      ],
      [
        { text: '🤖 Auto Detect', callback_data: 'BADGE_AUTODETECT' },
        { text: '🗑️ Clear Badges', callback_data: 'BADGE_CLEAR' }
      ],
      [
        { text: '✅ Done with Badges', callback_data: 'BACK_CUSTOMIZE' }
      ]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendSizeMenu(chatId, messageId = null) {
  const text = '📏 *Choose Headline Size:*';
  const keyboard = {
    inline_keyboard: [
      [{ text: '✨ Auto (Dynamic Scale)', callback_data: 'SET_SIZE_auto' }],
      [
        { text: 'Small (40px)', callback_data: 'SET_SIZE_small' },
        { text: 'Medium (48px)', callback_data: 'SET_SIZE_medium' }
      ],
      [{ text: 'Large (58px)', callback_data: 'SET_SIZE_large' }],
      [{ text: '⬅️ Back to Menu', callback_data: 'BACK_CUSTOMIZE' }]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendAlignMenu(chatId, messageId = null) {
  const text = '↔️ *Choose Headline Alignment:*';
  const keyboard = {
    inline_keyboard: [
      [
        { text: '⬅️ Left Align', callback_data: 'SET_ALIGN_left' },
        { text: '↔️ Center Align', callback_data: 'SET_ALIGN_center' }
      ],
      [{ text: '⬅️ Back to Menu', callback_data: 'BACK_CUSTOMIZE' }]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendAccentMenu(chatId, messageId = null) {
  const text = '🎨 *Choose Accent Highlight Color:*';
  const keyboard = {
    inline_keyboard: [
      [{ text: '✨ Auto (Style Default)', callback_data: 'SET_ACCENT_auto' }],
      [
        { text: '🔵 Cyan / Blue', callback_data: 'SET_ACCENT_blue' },
        { text: '🔴 Red', callback_data: 'SET_ACCENT_red' }
      ],
      [
        { text: '🟢 Green', callback_data: 'SET_ACCENT_green' },
        { text: '🟠 Orange', callback_data: 'SET_ACCENT_orange' }
      ],
      [
        { text: '🟣 Purple', callback_data: 'SET_ACCENT_purple' },
        { text: '⚪ White', callback_data: 'SET_ACCENT_white' }
      ],
      [{ text: '⬅️ Back to Menu', callback_data: 'BACK_CUSTOMIZE' }]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendBackdropMenu(chatId, messageId = null) {
  const text = '🖼️ *Choose Video Backdrop Source (Photo Reels):*';
  const keyboard = {
    inline_keyboard: [
      [{ text: '📷 Original Photo', callback_data: 'SET_BACKDROP_original' }],
      [{ text: '🎙️ News Studio', callback_data: 'SET_BACKDROP_studio' }],
      [
        { text: '🌃 Night City', callback_data: 'SET_BACKDROP_city' },
        { text: '🌐 Cyber Grid', callback_data: 'SET_BACKDROP_cyber' }
      ],
      [{ text: '⬅️ Back to Menu', callback_data: 'BACK_CUSTOMIZE' }]
    ]
  };
  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

function sendConfirmationScreen(chatId, messageId = null) {
  const session = userSessions.get(chatId);
  if (!session) return sendMainMenu(chatId);

  const styleDisplay = (session.style && session.style !== 'auto') ? (STYLE_LABELS[session.style] || 'Editorial') : 'Editorial';
  const fontDisplay = (session.font && session.font !== 'auto') ? (FONT_LABELS[session.font] || 'Auto') : 'Auto';
  const sizeDisplay = (session.size && session.size !== 'auto') ? (session.size.charAt(0).toUpperCase() + session.size.slice(1)) : 'Auto';
  const alignDisplay = session.align === 'center' ? 'Center' : 'Left';
  const badgeDisplay = (session.badges && session.badges.length > 0) ? session.badges.join(' ') : 'None';
  const accentDisplay = (session.accent && session.accent !== 'auto') ? (session.accent.charAt(0).toUpperCase() + session.accent.slice(1)) : 'Auto';
  const backdropDisplay = session.mediaType === 'photo'
    ? (BACKDROP_LABELS[session.backdrop] || 'Original')
    : 'Original';
  const durationDisplay = session.mediaType === 'photo'
    ? '5 sec'
    : `${Math.round(session.mediaDuration || 5)} sec`;

  const text =
`🎬 *Reel Settings*

*Style:* ${styleDisplay}
*Font:* ${fontDisplay}
*Size:* ${sizeDisplay}
*Alignment:* ${alignDisplay}
*Badge:* ${badgeDisplay}
*Accent:* ${accentDisplay}
*Backdrop:* ${backdropDisplay}
*Duration:* ${durationDisplay}

Ready?`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎬 Generate Reel', callback_data: 'GENERATE_REEL' }],
      [
        { text: '⚙️ Change Settings', callback_data: 'CHANGE_SETTINGS' },
        { text: '❌ Cancel', callback_data: 'CANCEL' }
      ]
    ]
  };

  return safeSendOrEdit(chatId, text, keyboard, messageId);
}

async function downloadTelegramFile(fileId, extension) {
  const fileLink = await bot.getFileLink(fileId);
  const targetPath = path.join(
    TEMP_DIR,
    `tg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`
  );

  const res = await fetch(fileLink);
  if (!res.ok) {
    throw new Error(`Telegram download failed: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
  return targetPath;
}

async function processUserReel(chatId) {
  const session = userSessions.get(chatId);
  if (!session || !session.mediaPath) {
    sendMainMenu(chatId, '🎬 *Creative Reel Maker*\nPlease click *Create Reel* first.');
    return;
  }

  session.state = 'PROCESSING';
  session.updatedAt = Date.now();

  const text = session.rawText || '';
  const styleHint = session.style && session.style !== 'auto' ? session.style : null;
  const fontHint = session.font && session.font !== 'auto' ? session.font : (session.preferredFont || null);
  const renderOptions = {
    font: fontHint,
    style: styleHint,
    size: session.size || 'auto',
    align: session.align || 'left',
    accent: session.accent || 'auto',
    backdrop: session.backdrop || 'original',
    badges: session.badges || []
  };

  try {
    await bot.sendMessage(chatId, '⏳ *Generating your reel...*', { parse_mode: 'Markdown' });

    const outputPath = path.join(
      TEMP_DIR,
      `reel_${chatId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`
    );
    session.outputPath = outputPath;

    if (session.mediaType === 'photo') {
      await renderPhotoReel({
        photoPath: session.mediaPath,
        outputPath,
        text,
        styleHint,
        fontHint,
        options: renderOptions
      });
    } else if (session.mediaType === 'video') {
      await renderVideoReel({
        videoPath: session.mediaPath,
        outputPath,
        text,
        styleHint,
        fontHint,
        options: renderOptions
      });
    } else {
      throw new Error('Unsupported media type');
    }

    await bot.sendVideo(
      chatId,
      outputPath,
      {
        caption: '✅ *Your reel is ready for Instagram. 🚀*',
        parse_mode: 'Markdown',
        width: 1080,
        height: 1920,
        supports_streaming: true
      },
      {
        filename: 'creative-reel.mp4',
        contentType: 'video/mp4'
      }
    );

    sendMainMenu(chatId, '🎬 *Create another reel anytime!*');
  } catch (err) {
    console.error(`[Reel Error for chat ${chatId}]:`, err);
    bot.sendMessage(
      chatId,
      '❌ *Couldn\'t create the reel. Please try another photo or video.*',
      { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
    );
  } finally {
    clearUserSession(chatId);
  }
}

function initTelegramBot() {
  if (process.env.DISABLE_BOT === 'true' || process.env.ENABLE_BOT === 'false') {
    console.log('[Telegram Bot] ⏸️ Bot polling is disabled via DISABLE_BOT=true. Only web preview is active.');
    return;
  }

  if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.log('[Telegram Bot] ⚠️ No BOT_TOKEN detected. Waiting for token in environment variables.');
    return;
  }

  if (bot) {
    try {
      if (typeof bot.stopPolling === 'function') {
        bot.stopPolling();
      }
    } catch (_) {}
  }

  try {
    bot = new TelegramBot(BOT_TOKEN, {
      polling: {
        interval: 500,
        autoStart: true,
        params: {
          timeout: 10
        }
      }
    });

    // Ensure any stale webhook is removed so polling operates reliably
    if (typeof bot.deleteWebHook === 'function') {
      bot.deleteWebHook().catch(() => {});
    }

    bot.getMe().then((me) => {
      botInfo = me;
      console.log(`[Telegram Bot] 🚀 Connected as @${me.username} (${me.first_name})`);
    }).catch((err) => {
      console.warn('[Telegram Bot] Connection notice:', err.message);
    });

    bot.on('polling_error', (error) => {
      const errorMsg = (error.response && error.response.body && (error.response.body.description || JSON.stringify(error.response.body)))
        || error.message
        || 'Polling event';
      const statusCode = (error.response && error.response.statusCode) || error.code || 'STATUS_OK';

      if (typeof errorMsg === 'string' && (errorMsg.includes('409 Conflict') || errorMsg.includes('terminated by other getUpdates'))) {
        console.warn('[Telegram Bot] Polling conflict detected (overlapping connection). Re-aligning polling loop in 3s...');
        if (bot && typeof bot.isPolling === 'function' && bot.isPolling()) {
          bot.stopPolling().then(() => {
            setTimeout(() => {
              if (bot && typeof bot.isPolling === 'function' && !bot.isPolling()) {
                bot.startPolling().catch(() => {});
              }
            }, 3000);
          }).catch(() => {});
        }
        return;
      }

      console.warn(`[Telegram Bot Polling Notice] [${statusCode}]:`, errorMsg);
    });

    bot.on('error', (err) => {
      console.warn('[Telegram Bot Notice]:', err.message);
    });

    // --- Command Handlers ---
    bot.onText(/\/start/i, (msg) => {
      clearUserSession(msg.chat.id);
      sendMainMenu(msg.chat.id);
    });

    bot.onText(/\/help/i, (msg) => {
      sendHelp(msg.chat.id);
    });

    bot.onText(/\/cancel/i, (msg) => {
      clearUserSession(msg.chat.id);
      bot.sendMessage(msg.chat.id, '❌ Action cancelled.', MAIN_KEYBOARD);
    });

    bot.onText(/\/fonts/i, (msg) => {
      const emojiStatus = detectedFonts.emoji.registered ? '🟢 Detected & Active' : '🟡 System Fallback';
      const interStatus = detectedFonts.sansPrimary.registered ? '🟢 Detected & Active' : '🔴 Not Found';
      const montStatus = detectedFonts.sansGeometric.registered ? '🟢 Detected & Active' : '🔴 Not Found';
      const serifStatus = detectedFonts.serif.registered ? '🟢 Detected & Active' : '⚪ Optional';

      const fontsMsg =
`🔤 *Typography & Emoji Engine Status*

• ${emojiStatus} *Noto Color Emoji*: High-res color flags & Unicode symbols
• ${interStatus} *Inter*: Modern, clean editorial sans-serif
• ${montStatus} *Montserrat*: Bold, geometric high-impact headline typeface
• ${serifStatus} *Playfair Display*: Refined classical serif

🎨 *Typography Pairing:*
• *Breaking News* & *Split Cards* → *Montserrat* for bold headline impact
• *Editorial* & *Minimal* → *Inter* for crisp readability

⚙️ *Custom Font Selection:*
• \`/font auto\` - Automatic style-matched pairing (default)
• \`/font montserrat\` - Use Montserrat for headlines
• \`/font inter\` - Use Inter for headlines
• \`/font playfair\` - Use Playfair Display for headlines`;

      bot.sendMessage(msg.chat.id, fontsMsg, { parse_mode: 'Markdown', ...MAIN_KEYBOARD });
    });

    bot.onText(/\/font(?:\s+(.+))?/i, (msg, match) => {
      const choice = (match[1] || '').trim().toLowerCase();
      const chatId = msg.chat.id;

      if (!choice) {
        const session = userSessions.get(chatId);
        const current = (session && session.preferredFont) ? session.preferredFont : 'auto (style-matched)';
        return bot.sendMessage(
          chatId,
          `🔤 *Current Font Preference:* \`${current}\`\n\nTo change, send:\n• \`/font auto\`\n• \`/font montserrat\`\n• \`/font inter\`\n• \`/font playfair\``,
          { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
        );
      }

      let session = userSessions.get(chatId);
      if (!session) {
        session = { state: 'IDLE', updatedAt: Date.now() };
        userSessions.set(chatId, session);
      }

      if (['auto', 'montserrat', 'inter', 'playfair'].includes(choice)) {
        session.preferredFont = choice === 'auto' ? null : choice;
        session.updatedAt = Date.now();
        const displayFont = choice === 'auto' ? 'Auto (Style-Matched Montserrat / Inter)' : choice.toUpperCase();
        bot.sendMessage(chatId, `✅ *Headline typeface set to:* ${displayFont}`, { parse_mode: 'Markdown', ...MAIN_KEYBOARD });
      } else {
        bot.sendMessage(chatId, '⚠️ Please specify a valid font: \`/font auto\`, \`/font montserrat\`, \`/font inter\`, or \`/font playfair\`', { parse_mode: 'Markdown' });
      }
    });

    // --- Message Processing ---
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text ? msg.text.trim() : '';

      if (text.startsWith('/')) return;

      if (text === '🎬 Create Reel') {
        clearUserSession(chatId);
        userSessions.set(chatId, {
          state: 'AWAITING_MEDIA',
          updatedAt: Date.now()
        });
        return bot.sendMessage(chatId, '*Send me a photo or video.*', {
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true }
        });
      }

      if (text === 'ℹ️ How It Works') {
        return sendHelp(chatId);
      }

      const session = userSessions.get(chatId);

      // Photo upload
      if (msg.photo && msg.photo.length > 0) {
        try {
          if (session && session.mediaPath) cleanFile(session.mediaPath);

          const photo = msg.photo[msg.photo.length - 1];
          const downloadedPath = await downloadTelegramFile(photo.file_id, 'jpg');

          userSessions.set(chatId, {
            state: 'AWAITING_TEXT',
            mediaType: 'photo',
            mediaPath: downloadedPath,
            mediaDuration: 5,
            rawText: '',
            style: 'auto',
            font: session?.preferredFont || 'auto',
            size: 'auto',
            align: 'left',
            accent: 'auto',
            backdrop: 'original',
            badges: [],
            preferredFont: session?.preferredFont || null,
            updatedAt: Date.now()
          });

          return bot.sendMessage(
            chatId,
            '*Now send the text for your reel.*',
            {
              parse_mode: 'Markdown',
              ...TEXT_STAGE_KEYBOARD
            }
          );
        } catch (err) {
          console.error('[Photo Download Failed]:', err);
          clearUserSession(chatId);
          return bot.sendMessage(
            chatId,
            '❌ *Couldn\'t create the reel. Please try another photo or video.*',
            { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
          );
        }
      }

      // Video upload
      if (msg.video || (msg.document && (msg.document.mime_type || '').startsWith('video/'))) {
        try {
          if (session && session.mediaPath) cleanFile(session.mediaPath);

          const fileId = msg.video ? msg.video.file_id : msg.document.file_id;
          const downloadedPath = await downloadTelegramFile(fileId, 'mp4');
          const probe = await probeMedia(downloadedPath);

          userSessions.set(chatId, {
            state: 'AWAITING_TEXT',
            mediaType: 'video',
            mediaPath: downloadedPath,
            mediaDuration: probe.duration || 5,
            rawText: '',
            style: 'auto',
            font: session?.preferredFont || 'auto',
            size: 'auto',
            align: 'left',
            accent: 'auto',
            backdrop: 'original',
            badges: [],
            preferredFont: session?.preferredFont || null,
            updatedAt: Date.now()
          });

          return bot.sendMessage(
            chatId,
            '*Now send the text for your reel.*',
            {
              parse_mode: 'Markdown',
              ...TEXT_STAGE_KEYBOARD
            }
          );
        } catch (err) {
          console.error('[Video Download Failed]:', err);
          clearUserSession(chatId);
          return bot.sendMessage(
            chatId,
            '❌ *Couldn\'t create the reel. Please try another photo or video.*',
            { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
          );
        }
      }

      // Text input stage
      if (session && session.state === 'AWAITING_TEXT') {
        if (text === '⏭️ No Text' || text.toLowerCase() === 'no text') {
          session.rawText = '';
          session.state = 'CONFIRM_SCREEN';
          return sendConfirmationScreen(chatId);
        }
        if (text === '❌ Cancel' || text.toLowerCase() === 'cancel') {
          clearUserSession(chatId);
          return bot.sendMessage(chatId, '❌ Action cancelled.', MAIN_KEYBOARD);
        }

        const autoDetected = smartAutoDetect(text);
        session.rawText = text;
        session.style = autoDetected.style;
        session.badges = autoDetected.badges;
        session.state = 'CHOOSE_STYLE';
        session.updatedAt = Date.now();

        return sendStyleMenu(chatId);
      }

      if (!session) {
        sendMainMenu(chatId);
      }
    });

    // --- Inline Button Callbacks ---
    bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat?.id;
      const messageId = query.message?.message_id;
      if (!chatId) return;

      try {
        await bot.answerCallbackQuery(query.id);
      } catch (_) {}

      const data = query.data || '';
      let session = userSessions.get(chatId);

      if (data === 'CANCEL') {
        clearUserSession(chatId);
        return bot.sendMessage(chatId, '❌ Action cancelled.', MAIN_KEYBOARD);
      }

      if (data === 'NO_TEXT') {
        if (session && session.state === 'AWAITING_TEXT') {
          session.rawText = '';
          session.state = 'CONFIRM_SCREEN';
          return sendConfirmationScreen(chatId, messageId);
        }
        return sendMainMenu(chatId);
      }

      if (!session) {
        return sendMainMenu(chatId);
      }

      session.updatedAt = Date.now();

      // Style choices
      if (data.startsWith('STYLE_')) {
        const style = data.replace('STYLE_', '');
        session.style = style;
        session.state = 'CUSTOMIZE';
        return sendCustomizeMenu(chatId, messageId);
      }

      if (data === 'AUTO_SETTINGS') {
        session.style = 'auto';
        session.state = 'CONFIRM_SCREEN';
        return sendConfirmationScreen(chatId, messageId);
      }

      if (data === 'CONFIRM_SCREEN') {
        session.state = 'CONFIRM_SCREEN';
        return sendConfirmationScreen(chatId, messageId);
      }

      if (data === 'CHANGE_SETTINGS' || data === 'BACK_CUSTOMIZE') {
        session.state = 'CUSTOMIZE';
        return sendCustomizeMenu(chatId, messageId);
      }

      // Menus
      if (data === 'MENU_TYPO') return sendTypographyMenu(chatId, messageId);
      if (data === 'MENU_BADGES') return sendBadgesMenu(chatId, messageId);
      if (data === 'MENU_SIZE') return sendSizeMenu(chatId, messageId);
      if (data === 'MENU_ALIGN') return sendAlignMenu(chatId, messageId);
      if (data === 'MENU_ACCENT') return sendAccentMenu(chatId, messageId);
      if (data === 'MENU_BACKDROP') return sendBackdropMenu(chatId, messageId);

      // Set Typography
      if (data.startsWith('SET_FONT_')) {
        session.font = data.replace('SET_FONT_', '');
        return sendCustomizeMenu(chatId, messageId);
      }

      // Set Size
      if (data.startsWith('SET_SIZE_')) {
        session.size = data.replace('SET_SIZE_', '');
        return sendCustomizeMenu(chatId, messageId);
      }

      // Set Align
      if (data.startsWith('SET_ALIGN_')) {
        session.align = data.replace('SET_ALIGN_', '');
        return sendCustomizeMenu(chatId, messageId);
      }

      // Set Accent
      if (data.startsWith('SET_ACCENT_')) {
        session.accent = data.replace('SET_ACCENT_', '');
        return sendCustomizeMenu(chatId, messageId);
      }

      // Set Backdrop
      if (data.startsWith('SET_BACKDROP_')) {
        session.backdrop = data.replace('SET_BACKDROP_', '');
        return sendCustomizeMenu(chatId, messageId);
      }

      // Badge toggling
      if (data === 'BADGE_CLEAR') {
        session.badges = [];
        return sendBadgesMenu(chatId, messageId);
      }

      if (data === 'BADGE_AUTODETECT') {
        const detected = smartAutoDetect(session.rawText || '');
        session.badges = detected.badges;
        return sendBadgesMenu(chatId, messageId);
      }

      if (data.startsWith('BADGE_')) {
        const badgeVal = data.replace('BADGE_', '');
        if (!session.badges) session.badges = [];
        const idx = session.badges.indexOf(badgeVal);
        if (idx >= 0) {
          session.badges.splice(idx, 1);
        } else {
          session.badges.push(badgeVal);
        }
        return sendBadgesMenu(chatId, messageId);
      }

      // Generation
      if (data === 'GENERATE_REEL') {
        return processUserReel(chatId);
      }
    });

  } catch (err) {
    console.error('[Telegram Bot Init Error]:', err.message);
  }
}

if (require.main === module) {
  initTelegramBot();
}

// --- 8. EXPRESS SERVICE & BROWSER PLAYGROUND ---

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '');
    if (!ext) {
      ext = (file.mimetype || '').startsWith('video') ? '.mp4' : '.jpg';
    }
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Health check endpoint for Render and uptime monitoring
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    ffmpeg: ffmpegVersion,
    botActive: !!botInfo,
    botUsername: botInfo ? botInfo.username : null,
    activeSessions: userSessions.size
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    bot: {
      configured: !!BOT_TOKEN,
      connected: !!botInfo,
      username: botInfo ? botInfo.username : null,
      firstName: botInfo ? botInfo.first_name : null
    },
    fonts: detectedFonts,
    system: {
      node: process.version,
      ffmpeg: ffmpegVersion,
      ffmpegBinary: FFMPEG_BIN,
      tempDir: TEMP_DIR,
      cachedEmojis: fs.existsSync(EMOJIS_DIR) ? fs.readdirSync(EMOJIS_DIR).length : 0
    },
    sessions: userSessions.size
  });
});

// Direct test endpoint for testing video generation via browser or curl
app.post('/api/test-generate', upload.single('media'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a photo or video file' });
  }

  const inputPath = req.file.path;
  const mime = req.file.mimetype || '';
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const isVideo = mime.startsWith('video/') || ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.m4v', '.3gp'].includes(ext);
  const text = req.body.text || '';
  const style = req.body.style || null;
  const font = req.body.font || null;
  const size = req.body.size || 'auto';
  const align = req.body.align || 'left';
  const accent = req.body.accent || 'auto';
  const backdrop = req.body.backdrop || 'original';
  let badges = [];
  if (req.body.badges) {
    badges = Array.isArray(req.body.badges) ? req.body.badges : (typeof req.body.badges === 'string' ? req.body.badges.split(',').map(s => s.trim()).filter(Boolean) : []);
  }
  const renderOptions = { font, style, size, align, accent, backdrop, badges };
  const outputPath = path.join(TEMP_DIR, `test_reel_${Date.now()}.mp4`);

  try {
    if (isVideo) {
      await renderVideoReel({ videoPath: inputPath, outputPath, text, styleHint: style, fontHint: font, options: renderOptions });
    } else {
      await renderPhotoReel({ photoPath: inputPath, outputPath, text, styleHint: style, fontHint: font, options: renderOptions });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="creative-reel.mp4"');

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);

    stream.on('close', () => {
      cleanFile(inputPath);
      cleanFile(outputPath);
    });
  } catch (err) {
    cleanFile(inputPath);
    cleanFile(outputPath);
    res.status(500).json({ error: 'Couldn\'t create the reel', details: err.message });
  }
});

// Styles metadata endpoint
app.get('/api/styles', (req, res) => {
  res.json({
    styles: [
      {
        id: 'editorial',
        name: 'Classic Editorial',
        kicker: 'GLOBAL DESK',
        description: 'Top-anchored headline vignette with country flags and cyan accent kicker.',
        badge: 'NEWS',
        accentColor: '#38bdf8',
        defaultFont: 'Inter',
        bestFor: 'Diplomacy, summits, policy announcements, world news'
      },
      {
        id: 'breaking',
        name: 'Breaking News',
        kicker: 'JUST IN',
        description: 'High-impact red alert badge with bold Montserrat typography and red accent bars.',
        badge: '🔴 JUST IN',
        accentColor: '#ef4444',
        defaultFont: 'Montserrat',
        bestFor: 'Urgent dispatches, breaking alerts, market swings, emergency updates'
      },
      {
        id: 'fullscreen',
        name: 'Full Screen Cinematic',
        kicker: 'TOP STORY',
        description: 'Atmospheric lower-third gradient scrim with balanced safe margins for Instagram Reels.',
        badge: 'TOP STORY',
        accentColor: '#38bdf8',
        defaultFont: 'Inter',
        bestFor: 'Documentary clips, scenic reels, high-drama video backdrops'
      },
      {
        id: 'split',
        name: 'Split Editorial Card',
        kicker: 'DISPATCH',
        description: 'Refined dark slate card with dual country flags, NEWS pill badge, and dispatch kicker.',
        badge: 'NEWS',
        accentColor: '#6366f1',
        defaultFont: 'Montserrat',
        bestFor: 'International summits, bilateral trade, bilateral sports, executive interviews'
      },
      {
        id: 'minimal',
        name: 'Minimal News Briefing',
        kicker: 'BRIEFING',
        description: 'Sleek frosted card with cyan indicator dot and concise editorial typography.',
        badge: 'NEWS REEL',
        accentColor: '#38bdf8',
        defaultFont: 'Inter',
        bestFor: 'Bite-sized statistics, quick daily summaries, succinct quotes'
      }
    ],
    fonts: [
      { id: 'auto', name: 'Auto (Style-Matched)', description: 'Montserrat for Breaking/Split, Inter for Editorial' },
      { id: 'montserrat', name: 'Montserrat', description: 'Bold geometric display sans with commanding punch' },
      { id: 'inter', name: 'Inter', description: 'Clean modern editorial typeface with superior legibility' },
      { id: 'playfair', name: 'Playfair Display', description: 'Refined classic serif for prestigious reporting' }
    ]
  });
});

// Real-time overlay preview generator using server-side canvas engine
app.post('/api/preview-overlay', async (req, res) => {
  try {
    const text = req.body.text || '';
    const style = req.body.style || null;
    const font = req.body.font || null;
    const size = req.body.size || 'auto';
    const align = req.body.align || 'left';
    const accent = req.body.accent || 'auto';
    let badges = [];
    if (req.body.badges) {
      badges = Array.isArray(req.body.badges) ? req.body.badges : (typeof req.body.badges === 'string' ? req.body.badges.split(',').map(s => s.trim()).filter(Boolean) : []);
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    const overlayPath = await generateCreativeOverlay(text.trim(), style || null, {
      font: font || null,
      size,
      align,
      accent,
      badges
    });
    if (!overlayPath || !fs.existsSync(overlayPath)) {
      return res.status(500).json({ error: 'Failed to generate overlay' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    const stream = fs.createReadStream(overlayPath);
    stream.pipe(res);
    stream.on('close', () => {
      cleanFile(overlayPath);
    });
  } catch (err) {
    res.status(500).json({ error: 'Overlay generation error', details: err.message });
  }
});

// Interactive Web Dashboard with Editorial Typography Control Panel & Real-time Live Preview
app.get('/', (req, res) => {
  const botConnected = !!botInfo;
  const botUsername = botInfo ? `@${botInfo.username}` : 'Not connected';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Creative Reel Maker Bot — Editorial Typography Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Montserrat:wght@500;600;700;800;900&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f293d;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --accent-cyan: #38bdf8;
      --accent-red: #ef4444;
      --success: #10b981;
      --warning: #f59e0b;
      --text: #f9fafb;
      --text-muted: #94a3b8;
      --surface-hover: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px 16px 40px;
    }
    .container { max-width: 1320px; margin: 0 auto; }
    header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid #1e293b; }
    .header-titles h1 { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.025em; display: flex; align-items: center; gap: 10px; }
    .header-titles p { color: var(--text-muted); font-size: 0.95rem; margin-top: 3px; }
    .header-badges { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; }
    .badge-online { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-waiting { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-engine { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); }

    /* Studio Main Layout */
    .studio-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    @media (min-width: 980px) {
      .studio-layout {
        grid-template-columns: 580px 1fr;
        align-items: start;
      }
    }
    @media (min-width: 1200px) {
      .studio-layout {
        grid-template-columns: 660px 1fr;
      }
    }

    /* Control Panel Cards */
    .control-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .section-header h2 {
      font-size: 1.05rem;
      font-weight: 700;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-desc {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-top: -8px;
      margin-bottom: 12px;
    }

    /* Style Selector Cards Grid */
    .styles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }
    .style-card {
      background: #0f172a;
      border: 1.5px solid #1e293b;
      border-radius: 12px;
      padding: 12px 14px;
      cursor: pointer;
      transition: all 0.18s ease;
      text-align: left;
      position: relative;
    }
    .style-card:hover {
      border-color: #334155;
      background: #131d33;
    }
    .style-card.active {
      border-color: var(--accent);
      background: rgba(99, 102, 241, 0.12);
      box-shadow: 0 0 0 1px var(--accent), 0 4px 14px rgba(99, 102, 241, 0.2);
    }
    .style-card .style-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .style-badge-tag {
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .tag-editorial { background: rgba(56, 189, 248, 0.18); color: #38bdf8; }
    .tag-breaking { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .tag-fullscreen { background: rgba(14, 165, 233, 0.2); color: #38bdf8; }
    .tag-split { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; }
    .tag-minimal { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .style-card-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 3px;
    }
    .style-card-desc {
      font-size: 0.72rem;
      color: #94a3b8;
      line-height: 1.35;
    }

    /* Auto-detect toggle */
    .auto-toggle-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      font-size: 0.82rem;
      margin-top: 6px;
    }
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
    }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155;
      transition: .2s;
      border-radius: 22px;
    }
    .toggle-slider:before {
      position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .toggle-slider { background-color: var(--accent); }
    input:checked + .toggle-slider:before { transform: translateX(18px); }

    /* Typography controls */
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group label {
      font-size: 0.82rem;
      font-weight: 600;
      color: #cbd5e1;
      display: flex;
      justify-content: space-between;
    }
    textarea, select, input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 10px;
      color: #fff;
      font-size: 0.92rem;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    textarea:focus, select:focus, input[type="text"]:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }
    textarea {
      height: 95px;
      resize: vertical;
      line-height: 1.45;
    }

    /* Quick Flag / Emoji Ribbon */
    .emoji-ribbon {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-top: 4px;
    }
    .emoji-btn {
      background: #0f172a;
      border: 1px solid #1e293b;
      color: #f1f5f9;
      font-size: 1rem;
      padding: 4px 9px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      line-height: 1;
    }
    .emoji-btn:hover {
      background: #1e293b;
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .preset-pill {
      background: #0f172a;
      border: 1px solid #1e293b;
      color: #94a3b8;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .preset-pill:hover {
      color: #f1f5f9;
      border-color: #38bdf8;
      background: #131d33;
    }

    /* Typeface Selector Tabs */
    .type-tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      background: #090d16;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid #1e293b;
    }
    .type-tab {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 7px 4px;
      border-radius: 7px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
    }
    .type-tab.active {
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }

    /* Slider & Multi-controls */
    .controls-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .range-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    input[type="range"] {
      flex: 1;
      accent-color: var(--accent);
    }
    .range-val {
      font-size: 0.8rem;
      font-weight: 700;
      color: #38bdf8;
      width: 38px;
    }

    /* Accent color dots */
    .color-swatches {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .color-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.15s;
    }
    .color-dot.active {
      border-color: #fff;
      transform: scale(1.15);
    }

    /* Media Switcher */
    .media-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .media-tab {
      flex: 1;
      padding: 6px 10px;
      font-size: 0.78rem;
      font-weight: 600;
      background: #090d16;
      border: 1px solid #1e293b;
      color: var(--text-muted);
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
    }
    .media-tab.active {
      background: #1e293b;
      color: #fff;
      border-color: var(--accent);
    }

    /* Action Buttons */
    .action-row {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 4px;
    }
    @media (min-width: 500px) {
      .action-row {
        flex-direction: row;
      }
    }
    .btn-primary {
      flex: 2;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      border: none;
      padding: 13px 20px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
      transition: all 0.18s;
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      transform: translateY(-1px);
    }
    .btn-secondary {
      flex: 1;
      background: #1e293b;
      color: #f1f5f9;
      border: 1px solid #334155;
      padding: 13px 16px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .btn-secondary:hover {
      background: #27354a;
      border-color: #475569;
    }
    .btn-primary:disabled, .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Right Column: Live Phone Preview */
    .preview-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: sticky;
      top: 24px;
    }

    .phone-container {
      width: 100%;
      max-width: 360px;
      background: #000;
      border: 3px solid #273549;
      border-radius: 36px;
      padding: 10px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
      position: relative;
    }

    .phone-notch {
      width: 110px;
      height: 18px;
      background: #111827;
      border-radius: 0 0 12px 12px;
      margin: 0 auto 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .notch-camera {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #090d16;
      border: 1px solid #1f293d;
    }

    .viewport-9-16 {
      position: relative;
      width: 100%;
      aspect-ratio: 9 / 16;
      border-radius: 26px;
      overflow: hidden;
      background: #000;
    }

    /* Hidden background video element used for drawing onto preview canvas */
    #bgVideo {
      display: none;
    }

    /* Live Preview Canvas */
    #livePreviewCanvas {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    /* VideoPreview Component Container */
    .video-preview-component {
      position: relative;
    }

    /* VideoPreview Text Overlay with smooth CSS fade and scale transitions */
    .video-preview-text-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 8;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      /* CSS Transitions for smooth fade and scale animations */
      opacity: 1;
      transform: scale(1);
      filter: blur(0px);
      transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  filter 0.28s ease;
      will-change: opacity, transform, filter;
      transform-origin: center center;
    }

    /* Transitioning state applied on typography/style changes: smooth fade and scale */
    .video-preview-text-overlay.typography-changing {
      opacity: 0.12;
      transform: scale(0.965);
      filter: blur(1.8px);
    }

    /* Inner wrapper with smooth layout transitions */
    .text-overlay-inner {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Style-specific layout classes */
    .overlay-layout-editorial {
      justify-content: flex-start;
      padding: 15% 7.5% 8%;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.90) 0%, rgba(0, 0, 0, 0.65) 65%, rgba(0, 0, 0, 0) 100%);
      transition: background 0.35s ease, padding 0.35s ease;
    }

    .overlay-layout-breaking {
      justify-content: flex-start;
      padding: 14% 7.5% 8%;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.94) 0%, rgba(0, 0, 0, 0.72) 70%, rgba(0, 0, 0, 0) 100%);
      transition: background 0.35s ease, padding 0.35s ease;
    }

    .overlay-layout-fullscreen {
      justify-content: flex-end;
      padding: 8% 7.5% 16%;
      background: linear-gradient(0deg, rgba(0, 0, 0, 0.96) 0%, rgba(0, 0, 0, 0.70) 55%, rgba(0, 0, 0, 0) 100%);
      transition: background 0.35s ease, padding 0.35s ease;
    }

    .overlay-layout-split {
      justify-content: flex-start;
      padding: 16% 7% 8%;
      background: transparent;
      transition: background 0.35s ease, padding 0.35s ease;
    }

    .overlay-layout-minimal {
      justify-content: flex-start;
      padding: 16% 7% 8%;
      background: transparent;
      transition: background 0.35s ease, padding 0.35s ease;
    }

    /* Individual typography elements with smooth transitions */
    .overlay-kicker-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
    }

    .overlay-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .overlay-headline {
      color: #ffffff;
      font-weight: 800;
      line-height: 1.32;
      text-shadow: 0 3px 12px rgba(0, 0, 0, 0.85);
      transition: font-size 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  font-family 0.25s ease,
                  text-align 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  color 0.25s ease,
                  letter-spacing 0.25s ease;
      word-break: break-word;
    }

    .overlay-card {
      background: rgba(15, 23, 42, 0.94);
      border: 1.5px solid #334155;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }

    .pulse-indicator {
      animation: pulse-dot 1.2s infinite ease-in-out;
    }

    /* Instagram Reels UI Simulation Overlay */
    .reels-ui-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 18px 14px;
      z-index: 10;
      transition: opacity 0.2s;
    }
    .reels-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: white;
      font-size: 0.82rem;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0,0,0,0.6);
    }
    .reels-right-actions {
      position: absolute;
      right: 12px;
      bottom: 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .action-icon-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      color: white;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8);
      font-size: 1.1rem;
    }
    .action-icon-item span {
      font-size: 0.65rem;
      font-weight: 600;
    }
    .reels-bottom-account {
      display: flex;
      align-items: center;
      gap: 8px;
      color: white;
      font-size: 0.78rem;
      font-weight: 600;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8);
    }
    .account-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #6366f1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      border: 1.5px solid white;
    }

    /* Safe Area Guidelines */
    .safe-guide-top {
      position: absolute;
      top: 14%;
      left: 0;
      right: 0;
      border-bottom: 1.5px dashed rgba(239, 68, 68, 0.7);
      pointer-events: none;
      z-index: 15;
    }
    .safe-guide-top:after {
      content: '14% Top Bar Safe Zone';
      position: absolute;
      left: 10px;
      top: 2px;
      font-size: 0.6rem;
      font-weight: 700;
      color: #ef4444;
      background: rgba(0,0,0,0.65);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .safe-guide-bottom {
      position: absolute;
      bottom: 20%;
      left: 0;
      right: 0;
      border-top: 1.5px dashed rgba(239, 68, 68, 0.7);
      pointer-events: none;
      z-index: 15;
    }
    .safe-guide-bottom:after {
      content: '20% Bottom Caption & Audio Safe Zone';
      position: absolute;
      left: 10px;
      bottom: 2px;
      font-size: 0.6rem;
      font-weight: 700;
      color: #ef4444;
      background: rgba(0,0,0,0.65);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .safe-guide-right {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 18%;
      border-left: 1.5px dashed rgba(239, 68, 68, 0.7);
      pointer-events: none;
      z-index: 15;
    }

    /* Preview toolbar under phone */
    .preview-toolbar {
      display: flex;
      justify-content: space-between;
      width: 100%;
      max-width: 360px;
      margin-top: 12px;
      gap: 8px;
    }
    .preview-tool-btn {
      flex: 1;
      background: #111827;
      border: 1px solid #1f2937;
      color: #94a3b8;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .preview-tool-btn.active {
      background: #1e293b;
      color: #fff;
      border-color: #38bdf8;
    }

    /* Output Result Section */
    #exportResult {
      margin-top: 16px;
      width: 100%;
      max-width: 360px;
      display: none;
    }
    #exportResult video {
      width: 100%;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6);
    }

    /* Status Grid */
    .status-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      margin-top: 16px;
    }
    @media (min-width: 768px) {
      .status-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    .info-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
    }
    .info-card h3 {
      font-size: 1.05rem;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stats-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
      font-size: 0.88rem;
    }
    .stats-row:last-child { border-bottom: none; }
    .stats-lbl { color: var(--text-muted); }
    .stats-val { font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-titles">
        <h1>🎬 Editorial Typography Studio</h1>
        <p>Real-Time Instagram News & Social Caption Generator (1080×1920 MP4)</p>
      </div>
      <div class="header-badges">
        ${
          botConnected
            ? `<div class="badge badge-online">🟢 Bot Connected (${botUsername})</div>`
            : `<div class="badge badge-waiting">🟡 Awaiting BOT_TOKEN in .env</div>`
        }
        <div class="badge badge-engine">🔤 Noto Color Emoji + Twemoji</div>
        <div class="badge badge-engine">⚡ 60fps Live Preview</div>
      </div>
    </header>

    <div class="studio-layout">
      <!-- LEFT: Editorial Typography Control Panel -->
      <div class="control-panel">
        <!-- Style Presets Grid -->
        <div>
          <div class="section-header">
            <h2>🎨 Editorial Style Presets</h2>
            <span id="currentStyleLabel" style="font-size: 0.8rem; font-weight: 700; color: #38bdf8;">STYLE 1: EDITORIAL</span>
          </div>
          <p class="section-desc">Click any style card to instantly switch typographic layout and visual hierarchy.</p>
          <div class="styles-grid" id="stylesGrid">
            <button type="button" class="style-card active" data-style="editorial">
              <div class="style-top">
                <span class="style-badge-tag tag-editorial">STYLE 1</span>
                <span>📰</span>
              </div>
              <div class="style-card-title">Editorial Headline</div>
              <div class="style-card-desc">Top vignette, flag chips, cyan kicker bar & high-contrast serif/sans.</div>
            </button>

            <button type="button" class="style-card" data-style="breaking">
              <div class="style-top">
                <span class="style-badge-tag tag-breaking">STYLE 2</span>
                <span>🔴</span>
              </div>
              <div class="style-card-title">Breaking News</div>
              <div class="style-card-desc">Pulsing red JUST IN badge, red accent line, bold Montserrat title.</div>
            </button>

            <button type="button" class="style-card" data-style="fullscreen">
              <div class="style-top">
                <span class="style-badge-tag tag-fullscreen">STYLE 3</span>
                <span>🎬</span>
              </div>
              <div class="style-card-title">Full Screen Scrim</div>
              <div class="style-card-desc">Atmospheric lower-third gradient with TOP STORY tag and safe margins.</div>
            </button>

            <button type="button" class="style-card" data-style="split">
              <div class="style-top">
                <span class="style-badge-tag tag-split">STYLE 4</span>
                <span>📑</span>
              </div>
              <div class="style-card-title">Split News Card</div>
              <div class="style-card-desc">Refined dark slate card with dual flags, NEWS pill & dispatch kicker.</div>
            </button>

            <button type="button" class="style-card" data-style="minimal">
              <div class="style-top">
                <span class="style-badge-tag tag-minimal">STYLE 5</span>
                <span>⚡</span>
              </div>
              <div class="style-card-title">Minimal Briefing</div>
              <div class="style-card-desc">Translucent compact card with glowing cyan dot & concise typography.</div>
            </button>
          </div>

          <div class="auto-toggle-wrap">
            <span style="color: #cbd5e1; font-weight: 500;">✨ Smart Auto-Detect from Text (Breaking, Flags, Length)</span>
            <label class="toggle-switch">
              <input type="checkbox" id="autoDetectToggle">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Caption Input & Emoji Ribbon -->
        <div class="form-group">
          <label>
            <span>Headline & Caption Text</span>
            <span id="charCount" style="color: var(--text-muted); font-weight: normal;">0 chars</span>
          </label>
          <textarea id="captionText" placeholder="🇿🇦 🇮🇳&#10;&#10;South African President Cyril Ramaphosa arrives in New Delhi for BRICS Summit.">🇿🇦 🇮🇳

South African President Cyril Ramaphosa arrives in New Delhi for BRICS Summit.</textarea>

          <!-- Quick Emoji & Flag Bar -->
          <div class="emoji-ribbon">
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Quick Badges:</span>
            <button type="button" class="emoji-btn" data-emoji="🇿🇦">🇿🇦</button>
            <button type="button" class="emoji-btn" data-emoji="🇮🇳">🇮🇳</button>
            <button type="button" class="emoji-btn" data-emoji="🇺🇸">🇺🇸</button>
            <button type="button" class="emoji-btn" data-emoji="🇬🇧">🇬🇧</button>
            <button type="button" class="emoji-btn" data-emoji="🇪🇺">🇪🇺</button>
            <button type="button" class="emoji-btn" data-emoji="🇯🇵">🇯🇵</button>
            <button type="button" class="emoji-btn" data-emoji="🔴">🔴</button>
            <button type="button" class="emoji-btn" data-emoji="🔥">🔥</button>
            <button type="button" class="emoji-btn" data-emoji="⚡">⚡</button>
            <button type="button" class="emoji-btn" data-emoji="🚨">🚨</button>
            <button type="button" class="emoji-btn" data-emoji="🌍">🌍</button>
          </div>

          <!-- Quick News Presets -->
          <div class="emoji-ribbon" style="margin-top: 4px;">
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Presets:</span>
            <button type="button" class="preset-pill" data-preset="summit">🇿🇦 🇮🇳 BRICS Summit</button>
            <button type="button" class="preset-pill" data-preset="breaking">🔴 JUST IN: Energy Pact</button>
            <button type="button" class="preset-pill" data-preset="tech">⚡ Quantum Computing Leap</button>
            <button type="button" class="preset-pill" data-preset="economy">🌍 Global Trade Accord</button>
          </div>
        </div>

        <!-- Typography Customization Controls -->
        <div>
          <div class="section-header">
            <h2>🔤 Typography & Fine-Tuning</h2>
          </div>

          <div class="form-group" style="margin-bottom: 12px;">
            <label>Primary Headline Typeface</label>
            <div class="type-tabs" id="fontTabs">
              <button type="button" class="type-tab active" data-font="auto">✨ Auto</button>
              <button type="button" class="type-tab" data-font="montserrat">Montserrat</button>
              <button type="button" class="type-tab" data-font="inter">Inter</button>
              <button type="button" class="type-tab" data-font="playfair">Playfair</button>
            </div>
          </div>

          <div class="controls-row">
            <div class="form-group">
              <label>Headline Size: <span id="sizeVal" class="range-val">46px</span></label>
              <div class="range-wrap">
                <input type="range" id="sizeRange" min="34" max="64" value="46" step="2">
              </div>
            </div>

            <div class="form-group">
              <label>Text Alignment</label>
              <div class="type-tabs" id="alignTabs" style="grid-template-columns: 1fr 1fr;">
                <button type="button" class="type-tab active" data-align="left">⬅️ Left</button>
                <button type="button" class="type-tab" data-align="center">↔️ Center</button>
              </div>
            </div>
          </div>

          <div class="controls-row" style="margin-top: 10px;">
            <div class="form-group">
              <label>Accent Highlight Color</label>
              <div class="color-swatches" id="colorSwatches">
                <div class="color-dot active" style="background: #38bdf8;" data-color="#38bdf8" title="Cyan"></div>
                <div class="color-dot" style="background: #ef4444;" data-color="#ef4444" title="Crimson"></div>
                <div class="color-dot" style="background: #10b981;" data-color="#10b981" title="Emerald"></div>
                <div class="color-dot" style="background: #f59e0b;" data-color="#f59e0b" title="Amber"></div>
                <div class="color-dot" style="background: #818cf8;" data-color="#818cf8" title="Indigo"></div>
              </div>
            </div>

            <div class="form-group">
              <label>Reels Safe Guides</label>
              <div class="type-tabs" id="guideTabs" style="grid-template-columns: 1fr 1fr;">
                <button type="button" class="type-tab active" data-guide="on">👁️ Shown</button>
                <button type="button" class="type-tab" data-guide="off">Hide</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Backdrop Media Source -->
        <div>
          <div class="section-header">
            <h2>📹 Video Backdrop Source</h2>
          </div>
          <div class="media-tabs" id="backdropTabs">
            <button type="button" class="media-tab active" data-backdrop="studio">🎙️ News Studio</button>
            <button type="button" class="media-tab" data-backdrop="city">🌃 Night City</button>
            <button type="button" class="media-tab" data-backdrop="cyber">🌐 Cyber Grid</button>
            <button type="button" class="media-tab" data-backdrop="custom">📁 Upload Media</button>
          </div>
          <div id="uploadInputWrap" style="display: none; margin-top: 8px;">
            <input type="file" id="customMediaInput" accept="image/*,video/*" />
            <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Upload any photo or video to preview with your live editorial typography.</p>
          </div>
        </div>

        <!-- Action Row -->
        <div class="action-row">
          <button type="button" class="btn-primary" id="generateReelBtn">
            <span>🎬 Render 1080×1920 Reel MP4</span>
          </button>
          <button type="button" class="btn-secondary" id="downloadOverlayBtn">
            <span>⬇️ Overlay PNG</span>
          </button>
        </div>
        <div id="renderStatus" style="font-size: 0.85rem; text-align: center; color: #a5b4fc; min-height: 20px;"></div>
      </div>

      <!-- RIGHT: Live 9:16 Real-Time Video Preview -->
      <div class="preview-column">
        <div class="phone-container">
          <div class="phone-notch">
            <div class="notch-camera"></div>
          </div>

          <div class="viewport-9-16 video-preview-component" id="viewportContainer">
            <!-- Canvas where real-time video + typography is drawn -->
            <canvas id="livePreviewCanvas" width="1080" height="1920"></canvas>

            <!-- VideoPreview Typography Text Overlay with CSS Transitions -->
            <div id="videoPreviewTextOverlay" class="video-preview-text-overlay" aria-live="polite"></div>

            <!-- Instagram Safe Zone Guides -->
            <div id="safeGuideTop" class="safe-guide-top"></div>
            <div id="safeGuideBottom" class="safe-guide-bottom"></div>
            <div id="safeGuideRight" class="safe-guide-right"></div>

            <!-- Instagram Reels UI Overlay Simulation -->
            <div class="reels-ui-overlay" id="reelsUiOverlay">
              <div class="reels-top-bar">
                <span>Reels</span>
                <span style="font-size: 0.9rem;">📷</span>
              </div>
              <div class="reels-right-actions">
                <div class="action-icon-item">❤️<span>42.9K</span></div>
                <div class="action-icon-item">💬<span>1,280</span></div>
                <div class="action-icon-item">↗️<span>Share</span></div>
                <div class="action-icon-item">🔖<span>Save</span></div>
                <div class="action-icon-item">🎵<span>Audio</span></div>
              </div>
              <div class="reels-bottom-account">
                <div class="account-avatar">G</div>
                <div>
                  <div>@globaldesk.news • Follow</div>
                  <div style="font-size: 0.68rem; opacity: 0.85;">Original Audio • Editorial Dispatch</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Preview Toolbar -->
        <div class="preview-toolbar">
          <button type="button" class="preview-tool-btn active" id="toggleReelsUiBtn">
            <span>📱 Reels UI</span>
          </button>
          <button type="button" class="preview-tool-btn active" id="toggleSafeZoneBtn">
            <span>📐 Safe Zones</span>
          </button>
          <button type="button" class="preview-tool-btn" id="syncServerOverlayBtn">
            <span>🔄 Sync Engine</span>
          </button>
        </div>

        <!-- Rendered Video Result -->
        <div id="exportResult">
          <div style="background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 14px; margin-top: 14px; text-align: center;">
            <p style="color: #34d399; font-weight: 700; margin-bottom: 8px;">✅ Final 1080×1920 Reel Ready!</p>
            <video id="resultVideo" controls autoplay loop playsinline></video>
            <div style="margin-top: 10px;">
              <a id="downloadReelLink" href="#" download="creative-reel.mp4" style="color: #818cf8; text-decoration: underline; font-weight: 600; font-size: 0.9rem;">⬇️ Download MP4 File</a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Engine & Typography Status Cards -->
    <div class="status-grid">
      <div class="info-card">
        <h3>📊 Typography & Engine Status</h3>
        <div class="stats-row">
          <span class="stats-lbl">Primary Typeface</span>
          <span class="stats-val">Inter • Montserrat • Playfair</span>
        </div>
        <div class="stats-row">
          <span class="stats-lbl">Emoji Unicode</span>
          <span class="stats-val">Noto Color Emoji + Twemoji</span>
        </div>
        <div class="stats-row">
          <span class="stats-lbl">Rendering Engine</span>
          <span class="stats-val">${ffmpegVersion} • @napi-rs/canvas</span>
        </div>
        <div class="stats-row">
          <span class="stats-lbl">Reels Aspect Ratio</span>
          <span class="stats-val">9:16 Vertical (1080×1920)</span>
        </div>
      </div>

      <div class="info-card">
        <h3>🤖 Telegram Bot Commands</h3>
        <div class="stats-row">
          <span class="stats-lbl">/start</span>
          <span class="stats-val">Show interactive main menu</span>
        </div>
        <div class="stats-row">
          <span class="stats-lbl">/fonts</span>
          <span class="stats-val">Check active font & emoji engine</span>
        </div>
        <div class="stats-row">
          <span class="stats-lbl">/font &lt;family&gt;</span>
          <span class="stats-val">Set user typeface (montserrat/inter)</span>
        </div>
        <div class="stats-row">
          <span class="stats-lbl">Auto-formatting</span>
          <span class="stats-val">Smart layout detection by headline</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    // --- REAL-TIME EDITORIAL TYPOGRAPHY PREVIEW ENGINE ---
    const canvas = document.getElementById('livePreviewCanvas');
    const ctx = canvas.getContext('2d');

    // State
    const state = {
      style: 'editorial',
      font: 'auto',
      size: 46,
      align: 'left',
      accentColor: '#38bdf8',
      text: document.getElementById('captionText').value,
      backdrop: 'studio',
      customMedia: null,
      customMediaType: null, // 'image' or 'video'
      showSafeZones: true,
      showReelsUi: true,
      autoDetect: false,
      serverOverlayImg: null
    };

    // Pre-created sample backdrop generators
    let animFrameId = null;
    let animTime = 0;
    let customMediaEl = null;

    // Presets content
    const PRESETS = {
      summit: "🇿🇦 🇮🇳\\n\\nSouth African President Cyril Ramaphosa arrives in New Delhi for BRICS Summit.",
      breaking: "🔴 JUST IN\\n\\nInternational Clean Energy & Nuclear Accord Officially Signed by 42 Nations.",
      tech: "⚡ BREAKING\\n\\nQuantum Neural Processor Achieves Room-Temperature Coherence Milestone. 🚀",
      economy: "🌍 DISPATCH\\n\\nGlobal Economic Forum Adopts Comprehensive Multilateral AI Framework."
    };

    // Style titles mapping
    const STYLE_LABELS = {
      editorial: 'STYLE 1: EDITORIAL HEADLINE',
      breaking: 'STYLE 2: BREAKING NEWS (🔴 JUST IN)',
      fullscreen: 'STYLE 3: FULL SCREEN CINEMATIC',
      split: 'STYLE 4: SPLIT EDITORIAL CARD',
      minimal: 'STYLE 5: MINIMAL NEWS BRIEFING'
    };

    // Extract flags and headline text
    function parseHeadline(raw) {
      const trimmed = (raw || '').trim();
      const lines = trimmed.split('\\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return { flags: [], headline: '' };

      const emojiRegex = /(\\p{Regional_Indicator}{2}|[\\u{1F300}-\\u{1F5FF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}])/gu;
      const firstLine = lines[0];
      const emojis = firstLine.match(emojiRegex) || [];
      const textOnly = firstLine.replace(emojiRegex, '').trim();

      if (emojis.length > 0 && textOnly.length <= 4) {
        return {
          flags: emojis,
          headline: lines.slice(1).join('\\n').trim() || lines[0]
        };
      }
      return { flags: [], headline: lines.join('\\n').trim() };
    }

    // Auto-detect style
    function detectStyleClient(text) {
      const upper = (text || '').toUpperCase();
      if (upper.includes('JUST IN') || upper.includes('BREAKING') || upper.includes('ALERT') || text.includes('🔴') || text.includes('🚨')) {
        return 'breaking';
      }
      const { flags } = parseHeadline(text);
      if (flags.length >= 2 || upper.includes('SUMMIT') || upper.includes('MEETING') || upper.includes('DISPATCH')) {
        return 'split';
      }
      if (text.length < 65 && flags.length === 0) {
        return 'minimal';
      }
      if (text.length <= 130) {
        return 'editorial';
      }
      return 'fullscreen';
    }

    // Resolve font family
    function getEffectiveFont() {
      if (state.font !== 'auto') {
        if (state.font === 'montserrat') return "'Montserrat', sans-serif";
        if (state.font === 'inter') return "'Inter', sans-serif";
        if (state.font === 'playfair') return "'Playfair Display', serif";
      }
      // Auto-matched
      if (state.style === 'breaking' || state.style === 'split') {
        return "'Montserrat', sans-serif";
      }
      return "'Inter', sans-serif";
    }

    // Text wrapping utility for HTML5 canvas
    function wrapText(context, text, maxWidth) {
      const words = text.split(/\\s+/);
      const lines = [];
      let currentLine = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine ? currentLine + ' ' + words[n] : words[n];
        const metrics = context.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(currentLine);
          currentLine = words[n];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    }

    // Render simulated background
    function drawBackground() {
      if (state.customMedia && state.customMediaType === 'image' && customMediaEl) {
        ctx.drawImage(customMediaEl, 0, 0, 1080, 1920);
        return;
      }

      if (state.customMedia && state.customMediaType === 'video' && customMediaEl) {
        ctx.drawImage(customMediaEl, 0, 0, 1080, 1920);
        return;
      }

      // Procedural cinematic backdrops
      animTime += 0.015;

      if (state.backdrop === 'studio') {
        // Broadcast Studio Backdrop: Deep navy with shifting studio spotlights
        const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
        bgGrad.addColorStop(0, '#0a1128');
        bgGrad.addColorStop(0.5, '#050914');
        bgGrad.addColorStop(1, '#020408');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Ambient lights
        const xLight = 540 + Math.sin(animTime * 0.7) * 260;
        const yLight = 600 + Math.cos(animTime * 0.5) * 180;
        const radGrad = ctx.createRadialGradient(xLight, yLight, 40, xLight, yLight, 650);
        radGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
        radGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.12)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Soft bokeh orbs
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let i = 0; i < 5; i++) {
          const bx = (200 * i + animTime * 30) % 1080;
          const by = 800 + Math.sin(animTime + i) * 200;
          ctx.beginPath();
          ctx.arc(bx, by, 70 + i * 20, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (state.backdrop === 'city') {
        // Night City Skyline Palette
        const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
        bgGrad.addColorStop(0, '#0f0c29');
        bgGrad.addColorStop(0.6, '#302b63');
        bgGrad.addColorStop(1, '#24243e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Amber road reflections
        const amberGrad = ctx.createRadialGradient(540, 1600, 100, 540, 1600, 800);
        amberGrad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
        amberGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = amberGrad;
        ctx.fillRect(0, 1000, 1080, 920);
      } else {
        // Cyber Grid Backdrop
        const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
        bgGrad.addColorStop(0, '#060b19');
        bgGrad.addColorStop(1, '#111827');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Cyan cyber glow
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 2;
        const gridSpacing = 80;
        const offset = (animTime * 20) % gridSpacing;
        for (let x = 0; x <= 1080; x += gridSpacing) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 1920);
          ctx.stroke();
        }
        for (let y = offset; y <= 1920; y += gridSpacing) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(1080, y);
          ctx.stroke();
        }
      }
    }

    // Draw typography overlay
    function drawTypographyOverlay() {
      const { flags, headline } = parseHeadline(state.text);
      const textToDisplay = headline || state.text || 'Editorial Headline';
      const fontName = getEffectiveFont();
      const fontSize = state.size;
      const lineHeight = fontSize * 1.35;
      const accent = state.accentColor;

      ctx.save();

      // STYLE 1: EDITORIAL HEADLINE
      if (state.style === 'editorial') {
        const topGrad = ctx.createLinearGradient(0, 0, 0, 720);
        topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.90)');
        topGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.70)');
        topGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, 1080, 750);

        const startY = 270;
        // Accent bar
        ctx.fillStyle = accent;
        ctx.fillRect(90, startY, 45, 6);

        // Flags & Kicker
        if (flags.length > 0) {
          ctx.font = '40px sans-serif';
          ctx.fillText(flags.join(' '), 150, startY + 8);
        }

        ctx.font = 'bold 24px ' + fontName;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.letterSpacing = '1px';
        ctx.fillText('GLOBAL DESK', 990, startY + 6);
        ctx.letterSpacing = '0px';

        // Headline
        ctx.textAlign = state.align;
        ctx.font = 'bold ' + fontSize + 'px ' + fontName;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 16;

        const maxW = 900;
        const textX = state.align === 'center' ? 540 : 90;
        const lines = wrapText(ctx, textToDisplay, maxW);
        let curY = startY + 70;
        lines.forEach(l => {
          ctx.fillText(l, textX, curY);
          curY += lineHeight;
        });
      }

      // STYLE 2: BREAKING NEWS
      else if (state.style === 'breaking') {
        const topGrad = ctx.createLinearGradient(0, 0, 0, 780);
        topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
        topGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.72)');
        topGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, 1080, 800);

        const startY = 265;
        // Red badge
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(90, startY, 195, 52, 26);
        ctx.fill();

        // Pulsing white dot
        const pulse = 0.85 + Math.sin(animTime * 6) * 0.15;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(122, startY + 26, 7 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // JUST IN text
        ctx.font = 'bold 24px ' + fontName;
        ctx.textAlign = 'left';
        ctx.fillText('JUST IN', 142, startY + 34);

        if (flags.length > 0) {
          ctx.font = '38px sans-serif';
          ctx.fillText(flags.join(' '), 310, startY + 38);
        }

        // Red vertical accent bar
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(90, startY + 74, 8, 48);

        // Headline
        ctx.textAlign = state.align;
        ctx.font = '800 ' + fontSize + 'px ' + fontName;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 18;

        const maxW = 890;
        const textX = state.align === 'center' ? 540 : 115;
        const lines = wrapText(ctx, textToDisplay, maxW);
        let curY = startY + 120;
        lines.forEach(l => {
          ctx.fillText(l, textX, curY);
          curY += lineHeight;
        });
      }

      // STYLE 3: FULL SCREEN CINEMATIC
      else if (state.style === 'fullscreen') {
        const botGrad = ctx.createLinearGradient(0, 1050, 0, 1920);
        botGrad.addColorStop(0, 'transparent');
        botGrad.addColorStop(0.35, 'rgba(0, 0, 0, 0.72)');
        botGrad.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, 1050, 1080, 870);

        const startY = 1360;
        // Pill tag
        ctx.fillStyle = 'rgba(2, 132, 199, 0.25)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(90, startY - 75, 175, 42, 21);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 20px ' + fontName;
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText('TOP STORY', 120, startY - 47);

        if (flags.length > 0) {
          ctx.font = '36px sans-serif';
          ctx.fillText(flags.join(' '), 285, startY - 44);
        }

        // Headline
        ctx.textAlign = state.align;
        ctx.font = 'bold ' + fontSize + 'px ' + fontName;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 14;

        const maxW = 900;
        const textX = state.align === 'center' ? 540 : 90;
        const lines = wrapText(ctx, textToDisplay, maxW);
        let curY = startY;
        lines.forEach(l => {
          ctx.fillText(l, textX, curY);
          curY += lineHeight;
        });
      }

      // STYLE 4: SPLIT EDITORIAL CARD
      else if (state.style === 'split') {
        const cardW = 920;
        const cardX = 80;
        const cardY = 320;

        ctx.font = 'bold ' + fontSize + 'px ' + fontName;
        const lines = wrapText(ctx, textToDisplay, cardW - 70);
        const cardH = 140 + lines.length * lineHeight;

        // Card Container
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 20);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Top bar in card
        let flagOffsetX = cardX + 32;
        if (flags.length > 0) {
          ctx.font = '38px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(flags.join(' '), flagOffsetX, cardY + 54);
          flagOffsetX += flags.length * 44 + 8;
        }

        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.roundRect(flagOffsetX, cardY + 28, 90, 34, 17);
        ctx.fill();

        ctx.font = 'bold 18px ' + fontName;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('NEWS', flagOffsetX + 45, cardY + 51);

        ctx.font = 'bold 20px ' + fontName;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText('DISPATCH', cardX + cardW - 32, cardY + 52);

        // Headline in card
        ctx.textAlign = state.align;
        ctx.font = 'bold ' + fontSize + 'px ' + fontName;
        ctx.fillStyle = '#f8fafc';

        const textX = state.align === 'center' ? cardX + cardW / 2 : cardX + 35;
        let curY = cardY + 115;
        lines.forEach(l => {
          ctx.fillText(l, textX, curY);
          curY += lineHeight;
        });
      }

      // STYLE 5: MINIMAL NEWS BRIEFING
      else if (state.style === 'minimal') {
        const cardW = 920;
        const cardX = 80;
        const cardY = 320;

        ctx.font = '600 ' + fontSize + 'px ' + fontName;
        const lines = wrapText(ctx, textToDisplay, cardW - 80);
        const cardH = 110 + lines.length * lineHeight;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Glowing dot
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(cardX + 40, cardY + 42, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 20px ' + fontName;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'left';
        ctx.fillText('NEWS REEL • BRIEFING', cardX + 60, cardY + 48);

        // Headline
        ctx.textAlign = state.align;
        ctx.font = '600 ' + fontSize + 'px ' + fontName;
        ctx.fillStyle = '#ffffff';

        const textX = state.align === 'center' ? cardX + cardW / 2 : cardX + 40;
        let curY = cardY + 98;
        lines.forEach(l => {
          ctx.fillText(l, textX, curY);
          curY += lineHeight;
        });
      }

      ctx.restore();
    }

    // Main render loop
    function renderFrame() {
      ctx.clearRect(0, 0, 1080, 1920);
      drawBackground();
      animFrameId = requestAnimationFrame(renderFrame);
    }

    // Start loop
    renderFrame();

    // Utility to escape HTML strings safely
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatHeadlineHtml(str) {
      return escapeHtml(str).split('\\n').join('<br/>');
    }

    // VideoPreview typography overlay updater with smooth CSS fade and scale transitions
    let overlayAnimTimeout = null;
    function updateTypographyOverlay(animated = true) {
      const overlay = document.getElementById('videoPreviewTextOverlay');
      if (!overlay) return;

      if (animated) {
        overlay.classList.add('typography-changing');
      }

      const { flags, headline } = parseHeadline(state.text);
      const textToDisplay = headline || state.text || 'Editorial Headline';
      const effectiveFont = getEffectiveFont();
      const align = state.align;
      const accent = state.accentColor;
      // Responsive font-size scaling for the preview viewport
      const previewFontSize = (state.size * 0.0245).toFixed(2) + 'rem';

      let markup = '';

      if (state.style === 'editorial') {
        markup = '<div class="text-overlay-inner overlay-layout-editorial">' +
          '<div class="overlay-kicker-bar">' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
              '<div style="width: 28px; height: 4px; background: ' + accent + '; border-radius: 2px; transition: background 0.3s;"></div>' +
              (flags.length ? '<span class="overlay-flags">' + flags.join(' ') + '</span>' : '') +
            '</div>' +
            '<span style="font-family: ' + effectiveFont + '; font-size: 0.68rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em;">GLOBAL DESK</span>' +
          '</div>' +
          '<h2 class="overlay-headline" style="font-family: ' + effectiveFont + '; font-size: ' + previewFontSize + '; text-align: ' + align + ';">' +
            formatHeadlineHtml(textToDisplay) +
          '</h2>' +
        '</div>';
      } else if (state.style === 'breaking') {
        markup = '<div class="text-overlay-inner overlay-layout-breaking">' +
          '<div class="overlay-kicker-bar" style="justify-content: flex-start; gap: 8px;">' +
            '<div class="overlay-badge" style="background: #ef4444; color: #ffffff;">' +
              '<span style="display: inline-block; width: 6px; height: 6px; background: #ffffff; border-radius: 50%;" class="pulse-indicator"></span>' +
              '<span>JUST IN</span>' +
            '</div>' +
            (flags.length ? '<span class="overlay-flags">' + flags.join(' ') + '</span>' : '') +
            '<div style="flex: 1; height: 2px; background: rgba(239, 68, 68, 0.4);"></div>' +
          '</div>' +
          '<h2 class="overlay-headline" style="font-family: ' + effectiveFont + '; font-size: ' + previewFontSize + '; text-align: ' + align + '; color: #ffffff; text-transform: uppercase; letter-spacing: -0.01em;">' +
            formatHeadlineHtml(textToDisplay) +
          '</h2>' +
        '</div>';
      } else if (state.style === 'fullscreen') {
        markup = '<div class="text-overlay-inner overlay-layout-fullscreen">' +
          '<div class="overlay-kicker-bar" style="justify-content: flex-start; gap: 8px; margin-bottom: 6px;">' +
            '<div class="overlay-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.5);">' +
              '<span>TOP STORY</span>' +
            '</div>' +
            (flags.length ? '<span class="overlay-flags">' + flags.join(' ') + '</span>' : '') +
          '</div>' +
          '<h2 class="overlay-headline" style="font-family: ' + effectiveFont + '; font-size: ' + previewFontSize + '; text-align: ' + align + '; font-weight: 900;">' +
            formatHeadlineHtml(textToDisplay) +
          '</h2>' +
        '</div>';
      } else if (state.style === 'split') {
        markup = '<div class="text-overlay-inner overlay-layout-split">' +
          '<div class="overlay-card">' +
            '<div class="overlay-kicker-bar" style="margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                (flags.length ? '<span class="overlay-flags" style="font-size: 1.25rem;">' + flags.join(' ') + '</span>' : '') +
                '<div class="overlay-badge" style="background: ' + accent + '; color: #ffffff; padding: 2px 8px; font-size: 0.65rem;">NEWS</div>' +
              '</div>' +
              '<span style="font-family: ' + effectiveFont + '; font-size: 0.65rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em;">DISPATCH</span>' +
            '</div>' +
            '<h2 class="overlay-headline" style="font-family: ' + effectiveFont + '; font-size: ' + previewFontSize + '; text-align: ' + align + ';">' +
              formatHeadlineHtml(textToDisplay) +
            '</h2>' +
          '</div>' +
        '</div>';
      } else if (state.style === 'minimal') {
        markup = '<div class="text-overlay-inner overlay-layout-minimal">' +
          '<div class="overlay-card" style="background: rgba(15, 23, 42, 0.88); border-color: rgba(56, 189, 248, 0.35);">' +
            '<div class="overlay-kicker-bar" style="margin-bottom: 8px;">' +
              '<div style="display: flex; align-items: center; gap: 6px;">' +
                '<span style="display: inline-block; width: 6px; height: 6px; background: #38bdf8; border-radius: 50%;" class="pulse-indicator"></span>' +
                '<span style="font-family: ' + effectiveFont + '; font-size: 0.62rem; font-weight: 800; color: #38bdf8; letter-spacing: 0.08em;">NEWS REEL</span>' +
              '</div>' +
              (flags.length ? '<span class="overlay-flags" style="font-size: 1.05rem;">' + flags.join(' ') + '</span>' : '') +
            '</div>' +
            '<h2 class="overlay-headline" style="font-family: ' + effectiveFont + '; font-size: ' + previewFontSize + '; text-align: ' + align + ';">' +
              formatHeadlineHtml(textToDisplay) +
            '</h2>' +
          '</div>' +
        '</div>';
      }

      overlay.innerHTML = markup;

      if (animated) {
        if (overlayAnimTimeout) clearTimeout(overlayAnimTimeout);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            overlay.classList.remove('typography-changing');
          });
        });
      } else {
        overlay.classList.remove('typography-changing');
      }
    }

    // --- DOM EVENT HANDLERS ---
    const captionTextEl = document.getElementById('captionText');
    const charCountEl = document.getElementById('charCount');
    const currentStyleLabelEl = document.getElementById('currentStyleLabel');

    function updateCharCount() {
      const len = captionTextEl.value.length;
      charCountEl.textContent = len + ' chars';
    }
    updateCharCount();
    // Initial typography overlay render
    updateTypographyOverlay(false);

    // Input text listener
    captionTextEl.addEventListener('input', (e) => {
      state.text = e.target.value;
      updateCharCount();

      if (state.autoDetect) {
        const detected = detectStyleClient(state.text);
        setActiveStyle(detected, false);
      } else {
        updateTypographyOverlay(false);
      }
    });

    // Style Card Selection
    function setActiveStyle(styleId, manualClick = true) {
      state.style = styleId;
      document.querySelectorAll('.style-card').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === styleId);
      });
      currentStyleLabelEl.textContent = STYLE_LABELS[styleId] || styleId.toUpperCase();

      if (manualClick && state.autoDetect) {
        state.autoDetect = false;
        document.getElementById('autoDetectToggle').checked = false;
      }

      // Trigger smooth fade & scale typography transition
      updateTypographyOverlay(true);
    }

    document.querySelectorAll('.style-card').forEach(card => {
      card.addEventListener('click', () => {
        setActiveStyle(card.dataset.style);
      });
    });

    // Auto-detect toggle
    document.getElementById('autoDetectToggle').addEventListener('change', (e) => {
      state.autoDetect = e.target.checked;
      if (state.autoDetect) {
        setActiveStyle(detectStyleClient(state.text), false);
      }
    });

    // Quick emoji insertion
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        const start = captionTextEl.selectionStart;
        const end = captionTextEl.selectionEnd;
        const val = captionTextEl.value;
        captionTextEl.value = val.substring(0, start) + emoji + ' ' + val.substring(end);
        state.text = captionTextEl.value;
        captionTextEl.focus();
        captionTextEl.selectionStart = captionTextEl.selectionEnd = start + emoji.length + 1;
        updateCharCount();
        updateTypographyOverlay(true);
      });
    });

    // Quick News Presets
    document.querySelectorAll('.preset-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.preset;
        if (PRESETS[pKey]) {
          captionTextEl.value = PRESETS[pKey];
          state.text = captionTextEl.value;
          updateCharCount();
          if (pKey === 'breaking') setActiveStyle('breaking');
          else if (pKey === 'summit') setActiveStyle('split');
          else if (pKey === 'tech') setActiveStyle('fullscreen');
          else setActiveStyle('editorial');
        }
      });
    });

    // Font tab switching
    document.querySelectorAll('#fontTabs .type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#fontTabs .type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.font = tab.dataset.font;
        updateTypographyOverlay(true);
      });
    });

    // Font size slider
    const sizeRangeEl = document.getElementById('sizeRange');
    const sizeValEl = document.getElementById('sizeVal');
    sizeRangeEl.addEventListener('input', (e) => {
      state.size = parseInt(e.target.value, 10);
      sizeValEl.textContent = state.size + 'px';
      updateTypographyOverlay(false);
    });

    // Alignment tabs
    document.querySelectorAll('#alignTabs .type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#alignTabs .type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.align = tab.dataset.align;
        updateTypographyOverlay(true);
      });
    });

    // Accent color dots
    document.querySelectorAll('#colorSwatches .color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('#colorSwatches .color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.accentColor = dot.dataset.color;
        updateTypographyOverlay(true);
      });
    });

    // Reels safe guides toggle
    document.querySelectorAll('#guideTabs .type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#guideTabs .type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const show = tab.dataset.guide === 'on';
        state.showSafeZones = show;
        document.getElementById('safeGuideTop').style.display = show ? 'block' : 'none';
        document.getElementById('safeGuideBottom').style.display = show ? 'block' : 'none';
        document.getElementById('safeGuideRight').style.display = show ? 'block' : 'none';
        document.getElementById('toggleSafeZoneBtn').classList.toggle('active', show);
      });
    });

    // Preview toolbar toggles
    const toggleReelsUiBtn = document.getElementById('toggleReelsUiBtn');
    const reelsUiOverlay = document.getElementById('reelsUiOverlay');
    toggleReelsUiBtn.addEventListener('click', () => {
      state.showReelsUi = !state.showReelsUi;
      reelsUiOverlay.style.display = state.showReelsUi ? 'flex' : 'none';
      toggleReelsUiBtn.classList.toggle('active', state.showReelsUi);
    });

    const toggleSafeZoneBtn = document.getElementById('toggleSafeZoneBtn');
    toggleSafeZoneBtn.addEventListener('click', () => {
      state.showSafeZones = !state.showSafeZones;
      document.getElementById('safeGuideTop').style.display = state.showSafeZones ? 'block' : 'none';
      document.getElementById('safeGuideBottom').style.display = state.showSafeZones ? 'block' : 'none';
      document.getElementById('safeGuideRight').style.display = state.showSafeZones ? 'block' : 'none';
      toggleSafeZoneBtn.classList.toggle('active', state.showSafeZones);
      document.querySelectorAll('#guideTabs .type-tab').forEach(t => {
        t.classList.toggle('active', (t.dataset.guide === 'on') === state.showSafeZones);
      });
    });

    // Sync with Server Engine button (fetches exact server canvas overlay)
    const syncServerOverlayBtn = document.getElementById('syncServerOverlayBtn');
    syncServerOverlayBtn.addEventListener('click', async () => {
      syncServerOverlayBtn.textContent = '⏳ Syncing...';
      try {
        const resp = await fetch('/api/preview-overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: state.text,
            style: state.style,
            font: state.font,
            size: state.size,
            align: state.align,
            accent: state.accentColor
          })
        });
        if (!resp.ok) throw new Error('Server overlay failed');
        const blob = await resp.blob();
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = () => {
          syncServerOverlayBtn.textContent = '🟢 Synced 100%';
          setTimeout(() => { syncServerOverlayBtn.textContent = '🔄 Sync Engine'; }, 2500);
        };
      } catch (err) {
        syncServerOverlayBtn.textContent = '❌ Sync Error';
        setTimeout(() => { syncServerOverlayBtn.textContent = '🔄 Sync Engine'; }, 2500);
      }
    });

    // Backdrop Tabs
    const uploadInputWrap = document.getElementById('uploadInputWrap');
    document.querySelectorAll('#backdropTabs .media-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#backdropTabs .media-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.backdrop = tab.dataset.backdrop;

        if (state.backdrop === 'custom') {
          uploadInputWrap.style.display = 'block';
        } else {
          uploadInputWrap.style.display = 'none';
          state.customMedia = null;
          state.customMediaType = null;
          customMediaEl = null;
        }
      });
    });

    // Custom media input listener
    const customMediaInput = document.getElementById('customMediaInput');
    customMediaInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const isVideo = file.type.startsWith('video');
      state.customMedia = file;
      state.customMediaType = isVideo ? 'video' : 'image';

      if (isVideo) {
        const vid = document.createElement('video');
        vid.src = URL.createObjectURL(file);
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.play();
        customMediaEl = vid;
      } else {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          customMediaEl = img;
        };
      }
    });

    // Download Overlay PNG (1080x1920)
    document.getElementById('downloadOverlayBtn').addEventListener('click', () => {
      // Create offscreen canvas for purely the transparent text overlay
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 1080;
      offCanvas.height = 1920;
      const offCtx = offCanvas.getContext('2d');

      // Temporarily draw on offscreen context
      const origCtx = ctx;
      window.ctx = offCtx;
      drawTypographyOverlay();
      window.ctx = origCtx;

      offCanvas.toBlob((blob) => {
        const link = document.createElement('a');
        link.download = 'editorial-overlay-1080x1920.png';
        link.href = URL.createObjectURL(blob);
        link.click();
      }, 'image/png');
    });

    // Generate Full Reel MP4
    const generateReelBtn = document.getElementById('generateReelBtn');
    const renderStatus = document.getElementById('renderStatus');
    const exportResult = document.getElementById('exportResult');
    const resultVideo = document.getElementById('resultVideo');
    const downloadReelLink = document.getElementById('downloadReelLink');

    generateReelBtn.addEventListener('click', async () => {
      generateReelBtn.disabled = true;
      generateReelBtn.innerHTML = '<span>⏳ Rendering Reel MP4 (FFmpeg)...</span>';
      renderStatus.textContent = 'Rendering 1080×1920 MP4 with Ken Burns & Noto Color Emoji...';

      try {
        let mediaFile = customMediaInput.files[0];
        // If no custom media uploaded, create an animated sample photo frame from canvas
        if (!mediaFile) {
          const sampleBlob = await new Promise((res) => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 1080;
            tempCanvas.height = 1920;
            const tCtx = tempCanvas.getContext('2d');
            // Draw gradient
            const g = tCtx.createLinearGradient(0, 0, 1080, 1920);
            g.addColorStop(0, '#0a1128');
            g.addColorStop(0.5, '#1e293b');
            g.addColorStop(1, '#020408');
            tCtx.fillStyle = g;
            tCtx.fillRect(0, 0, 1080, 1920);
            tempCanvas.toBlob(res, 'image/jpeg', 0.95);
          });
          mediaFile = new File([sampleBlob], 'sample_backdrop.jpg', { type: 'image/jpeg' });
        }

        const formData = new FormData();
        formData.append('media', mediaFile);
        formData.append('text', state.text);
        formData.append('style', state.style);
        formData.append('font', state.font);
        formData.append('size', state.size);
        formData.append('align', state.align);
        formData.append('accent', state.accentColor);
        formData.append('backdrop', state.backdrop);

        const response = await fetch('/api/test-generate', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Reel generation failed');
        }

        const videoBlob = await response.blob();
        const videoUrl = URL.createObjectURL(videoBlob);

        resultVideo.src = videoUrl;
        downloadReelLink.href = videoUrl;
        exportResult.style.display = 'block';
        exportResult.scrollIntoView({ behavior: 'smooth' });

        renderStatus.textContent = '✅ Instagram Reel Generated Successfully!';
      } catch (err) {
        renderStatus.textContent = '❌ ' + err.message;
      } finally {
        generateReelBtn.disabled = false;
        generateReelBtn.innerHTML = '<span>🎬 Render 1080×1920 Reel MP4</span>';
      }
    });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Export module for external programmatic usage, test suites, and background media jobs
module.exports = {
  NodeCanvasOverlayModule,
  generateTextOverlayPNG,
  buildFFmpegOverlayFilter,
  generateCreativeOverlay,
  renderVideoReel,
  renderPhotoReel,
  detectStyle,
  tokenizeText,
  wrapTokens,
  detectedFonts,
  app
};

let server = null;

if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Creative Reel Bot] Service running on port ${PORT}`);
    console.log(`[Creative Reel Bot] Health check at http://0.0.0.0:${PORT}/health`);
  });
}

function shutdown() {
  console.log('[Server] Shutting down gracefully...');
  if (bot) {
    try { bot.stopPolling(); } catch (_) {}
  }
  if (server) {
    server.close(() => {
      console.log('[Server] Closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
