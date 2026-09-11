# 🎬 Creative Reel Maker Bot

A modern Node.js Telegram bot that turns photos and videos into **editorial, Instagram-ready social news reels** in 1080×1920 (9:16 vertical MP4 format).

Designed specifically for publishers, journalists, content creators, and social media managers who need to turn breaking news, event photos, or footage into professionally styled Instagram Reels in seconds.

---

## 🌟 Key Highlights

### 1. Photo to 5-Second Reel
- Uploading a photo produces an **exactly 5-second** vertical MP4 reel.
- Applies subtle, cinematic **Ken Burns motion** (slow zoom and pan) to keep the photo active and dynamic.
- Never distorts or stretches photos.
- Synthesizes a clean stereo AAC audio track so Instagram accepts the reel without errors.

### 2. Video with Original Duration Preserved
- **Videos are NOT trimmed to 5 seconds!**
- A 7-second video outputs a 7-second reel; a 20-second video outputs a 20-second reel; a 60-second video outputs a 60-second reel.
- Intelligently formats videos into 9:16 vertical (1080×1920) without stretching or distortion.
- Preserves the original audio track in high-fidelity AAC.

### 3. Modern Creative Editorial News Design
No plain images with ugly Arial text inside giant black rectangles! The bot automatically generates editorial graphics matching high-end Instagram news publishers:
- **Style A — Split Editorial**: Clean dark slate header card with prominent country flags, source badge (`GLOBAL NEWS`), bold headline, and vibrant accent bar, with footage displayed below.
- **Style B — Breaking News**: Glowing red `🔴 JUST IN` pill tag, dynamic high-impact headline, and filmic vignette.
- **Style C — Full Screen Scrim**: Footage fills the 1080×1920 frame with a smooth dark gradient scrim rising from the lower third, bold typography, and safe area margins.
- **Style D — Floating News Card**: Frosted dark glass container with 28px rounded corners, delicate border, badges, and pristine typography.

### 4. Full Color Emoji & Flag Rendering
- Linux servers often render emojis as missing empty boxes (`□ □`) or monochrome symbols.
- **Creative Reel Maker Bot** includes an integrated emoji engine that renders **colorful, modern iOS/Twemoji emojis and country flags** (e.g. 🇿🇦 🇮🇳 🇺🇸 🇬🇧 🔥 🚨 📰 ⚡ 🏆 🏏 🌍).
- Standalone flag lines are rendered as prominent header emblems; inline emojis are sized and aligned seamlessly alongside headline text.

### 5. Smooth Text Entrance Animation
- Overlays fade into the video smoothly over the first 0.5 seconds, creating an engaging, professional broadcast transition.

### 6. No Text Option
- Includes a **⏭️ No Text** button to render clean 9:16 vertical reels without graphic overlays.

### 7. Zero Database & Multi-User Isolation
- Pure in-memory session management. No MongoDB or external database required.
- Multiple users can generate reels simultaneously without mixing files or text.
- Automatically cleans up temporary media and output files immediately after delivering the finished MP4 to Telegram.

---

## 📁 Project Structure

```text
creative-reel-bot/
│
├── server.js          # Main engine: Telegram bot + Canvas overlay engine + FFmpeg pipelines + HTTP health service
├── package.json       # Dependencies and npm scripts (starts with node server.js)
├── .env.example       # Template for environment variables
├── .gitignore         # Git ignore rules (temp directory, secrets, node_modules)
├── README.md          # Complete documentation and setup guide
├── assets/
│   ├── fonts/         # Professional typography (Inter, Playfair Display)
│   └── emojis/        # Pre-cached colorful Twemoji assets (flags, symbols)
└── temp/              # Temporary media processing directory (auto-cleaned)
```

---

## 🛠️ Technology Stack

- **Runtime**: Node.js (v18+)
- **Language**: Plain JavaScript (no TypeScript, Vite, React, or build steps required)
- **Telegram Bot API**: `node-telegram-bot-api`
- **Graphic & Typography Engine**: `@napi-rs/canvas` (hardware-accelerated native 2D canvas with variable font support)
- **Video Rendering**: FFmpeg with `libx264`, `aac`, `scale`, `crop`, `zoompan`, and `overlay` filters
- **Web Framework**: Express (health check and browser test playground on port 3000)

---

## 🤖 Telegram BotFather Setup

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Enter a display name (e.g., `Creative Reel Maker`).
4. Enter a unique username ending in `bot` (e.g., `MyCreativeReelBot`).
5. Copy the generated **HTTP API Token** (e.g., `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
6. Set this token as `BOT_TOKEN` in your `.env` file or hosting environment variables.

---

## 💻 Local Installation & Setup

### 1. Prerequisites
- **Node.js**: v18 or higher (`node -v`)
- **FFmpeg**: System FFmpeg or npm fallback (the project includes `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` as automatic fallbacks).

### 2. Clone and Install
```bash
git clone <repository-url>
cd creative-reel-bot
npm install
```

### 3. Configure Environment
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Edit `.env` and add your Telegram bot token:
```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
PORT=3000
```

### 4. Start the Application
```bash
node server.js
```
or:
```bash
npm start
```

You should see:
```text
[Media Engine] FFmpeg ready (4.4.2)
[Fonts] Registered Inter font
[Telegram Bot] 🚀 Connected as @MyCreativeReelBot
[Creative Reel Bot] Service running on port 3000
[Creative Reel Bot] Health check at http://0.0.0.0:3000/health
```

---

## ☁️ Render Deployment Instructions

This project is 100% compatible with **Render** as a Web Service.

### Step-by-Step Render Setup:

1. Push this repository to **GitHub** or **GitLab**.
2. Log in to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Web Service**.
4. Connect your repository.
5. Configure the service settings:
   - **Name**: `creative-reel-bot`
   - **Region**: Choose the region closest to you
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free or Starter
6. In **Advanced** → **Environment Variables**, add:
   - `BOT_TOKEN`: `YOUR_TELEGRAM_BOT_TOKEN`
   - `NODE_ENV`: `production`
7. Click **Create Web Service**.

Render will automatically run `npm install` and start the bot with `node server.js`. The built-in `/health` endpoint serves as an automatic health check!

---

## 🎬 How the Creative Video Rendering Engine Works

The rendering engine combines native Canvas graphic generation with FFmpeg hardware compositing:

```text
User Media (Photo / Video)
       ↓
Extract text & analyze content (detect breaking news, flags, length)
       ↓
Render 1080×1920 RGBA transparent overlay using @napi-rs/canvas:
  - Font scaling, line wrapping, and safe margin calculations
  - Full-color Twemoji compositing (resolves flags 🇿🇦 🇮🇳 and symbols 🔥 ⚡)
  - Editorial styling (Split card, Breaking badge, Full screen scrim, Floating card)
       ↓
FFmpeg Pipeline:
  - Photo: zoompan (Ken Burns 5s @ 30 FPS) + silent AAC audio
  - Video: 1080×1920 vertical scale & crop + duration & audio preservation
  - Overlay: fade=t=in:st=0:d=0.5:alpha=1 (smooth broadcast entrance)
       ↓
Final 1080×1920 H.264 MP4 with faststart
       ↓
Sent directly to user in Telegram
       ↓
All temporary files automatically deleted from disk
```

---

## 📋 Bot Commands & Interactions

| Command | Action |
|---|---|
| `/start` | Displays the main menu with **🎬 Create Reel** and **ℹ️ How It Works** buttons |
| `/help` | Displays step-by-step instructions and duration rules |
| `/cancel` | Cancels any active creation session and clears temporary storage |
| **🎬 Create Reel** | Prompts for photo or video upload |
| **⏭️ No Text** | Creates a clean 9:16 vertical reel without text overlay |

---

## 📄 License
MIT License. Free for personal and commercial use.
