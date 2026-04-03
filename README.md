# GRAB Level Downloader

A clean, dark-themed web app to download levels from [grabvr.quest](https://grabvr.quest/levels).

![screenshot](screenshot.png)

---

## Features

- 🎮 Paste any GRAB level viewer URL and download the level file
- ✅ Smart URL validation with clear, specific error messages
- ⚡ Instant URL parsing with level preview before downloading
- 🌑 Dark, smooth UI with animated background
- 📋 Auto-detects GRAB URLs from clipboard on page load
- 📱 Fully responsive (mobile-friendly)

---

## Expected URL Format

The URL must come from the GRAB level viewer and look like this:

```
https://grabvr.quest/levels/viewer/?level=<userid>:<levelid>
```

**Example:**
```
https://grabvr.quest/levels/viewer/?level=abc123:xyz789
```

---

## Setup & Deployment

### Option 1 — GitHub Pages (Recommended, Free)

1. **Fork or clone this repo:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/grab-level-downloader.git
   cd grab-level-downloader
   ```

2. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repo on GitHub
   - Click **Settings → Pages**
   - Under **Source**, select `Deploy from a branch`
   - Choose **main** branch, `/ (root)` folder
   - Click **Save**

4. **Your site is live at:**
   ```
   https://YOUR_USERNAME.github.io/grab-level-downloader/
   ```

---

### Option 2 — Run Locally

Just open `index.html` in your browser — no build step needed.

> **Note:** If you run from `file://`, the clipboard auto-paste feature won't work (browser security). Use a local dev server for the full experience:

```bash
# With Python 3:
python -m http.server 8080
# Then visit http://localhost:8080

# With Node.js (npx):
npx serve .
# Then visit the URL it shows
```

---

### Option 3 — Deploy to Netlify / Vercel (Free)

Both support drag-and-drop deploys:

- **Netlify:** Go to [netlify.com](https://netlify.com), drag the entire folder onto the deploy zone.
- **Vercel:** Run `npx vercel` in the project folder and follow the prompts.

---

## CORS Note

Because this is a static frontend app, download requests go directly from the browser to `grabvr.quest`. If the GRAB API does not include CORS headers, the browser may block the request. In that case:

- The app will show a friendly warning with the direct API URL
- You can open that URL in a new tab to download the file manually
- Or host the app on the same domain if you control a server

---

## File Structure

```
grab-level-downloader/
├── index.html   ← Main page
├── style.css    ← All styles
├── app.js       ← All logic (URL parsing, validation, download)
└── README.md    ← This file
```

---

## License

MIT — free to use, modify, and redistribute.
