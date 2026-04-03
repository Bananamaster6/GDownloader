/**
 * GRAB Level Downloader – app.js
 * Parses grabvr.quest level URLs, validates them, then downloads the level file.
 *
 * Download strategy (tried in order until one works):
 *   1. Direct fetch from api.slin.dev — works if the server sends CORS headers
 *   2. Slin's own Cloudflare Worker (grab-api-dev.slindev.workers.dev) — CORS-enabled mirror
 *   3. allorigins.win raw proxy — reliable binary pass-through, no file size limit
 *   4. Plain <a href> navigation to api.slin.dev — last resort, browser handles it natively
 *      (CORS doesn't apply to navigations, so the file will open/download in a new tab)
 */

// ── DOM refs ──────────────────────────────────────────────────
const urlInput       = document.getElementById('level-url');
const downloadBtn    = document.getElementById('download-btn');
const clearBtn       = document.getElementById('clear-btn');
const statusArea     = document.getElementById('status-area');
const levelPreview   = document.getElementById('level-preview');
const previewUserid  = document.getElementById('preview-userid');
const previewLevelid = document.getElementById('preview-levelid');
const previewApi     = document.getElementById('preview-api');
const confirmBtn     = document.getElementById('confirm-download-btn');

// ── State ─────────────────────────────────────────────────────
let parsedLevel = null; // { userId, levelId }

// ── GRAB API endpoints ────────────────────────────────────────
const DIRECT_BASE = 'https://api.slin.dev/grab/v1';
const WORKER_BASE = 'https://grab-api-dev.slindev.workers.dev/grab/v1';

function buildDirectUrl(userId, levelId) {
  return `${DIRECT_BASE}/get_level/${encodeURIComponent(userId)}/${encodeURIComponent(levelId)}`;
}

function buildWorkerUrl(userId, levelId) {
  return `${WORKER_BASE}/get_level/${encodeURIComponent(userId)}/${encodeURIComponent(levelId)}`;
}

function buildAllOriginsUrl(userId, levelId) {
  const target = buildDirectUrl(userId, levelId);
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
}

// ── Helpers ───────────────────────────────────────────────────

function parseLevelUrl(raw) {
  const str = raw.trim();
  if (!str) return null;

  // Accept bare "userid:levelid" without a full URL
  if (!str.includes('/') && str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2) {
      const [userId, levelId] = parts.map(p => p.trim());
      if (userId && levelId) return { userId, levelId };
    }
  }

  let url;
  try {
    url = new URL(str.startsWith('http') ? str : 'https://' + str);
  } catch {
    return null;
  }

  if (!url.hostname.includes('grabvr.quest')) return null;
  if (!url.pathname.includes('/levels')) return null;

  const levelParam = url.searchParams.get('level');
  if (!levelParam) return null;

  const parts = levelParam.split(':');
  if (parts.length !== 2) return null;

  const [userId, levelId] = parts.map(p => p.trim());
  if (!userId || !levelId) return null;

  return { userId, levelId };
}

function showStatus(type, title, detail = '') {
  const icons = { error: '✕', success: '✓', warn: '⚠', info: '◈' };
  statusArea.innerHTML = `
    <div class="status-msg ${type}">
      <span class="status-icon">${icons[type] ?? '◈'}</span>
      <div class="status-text">
        <strong>${title}</strong>
        ${detail ? `<span>${detail}</span>` : ''}
      </div>
    </div>
  `;
}

function clearStatus() {
  statusArea.innerHTML = '';
}

function showPreview(userId, levelId) {
  const apiUrl = buildDirectUrl(userId, levelId);
  previewUserid.textContent  = userId;
  previewLevelid.textContent = levelId;
  previewApi.textContent     = apiUrl;
  levelPreview.hidden = false;
}

function hidePreview() {
  levelPreview.hidden = true;
  parsedLevel = null;
}

function setLoading(loading) {
  if (loading) {
    downloadBtn.classList.add('loading');
    downloadBtn.innerHTML = `<span class="spinner"></span><span class="btn-text">Parsing…</span>`;
    downloadBtn.disabled = true;
  } else {
    downloadBtn.classList.remove('loading');
    downloadBtn.innerHTML = `<span class="btn-icon">↓</span><span class="btn-text">Download</span>`;
    downloadBtn.disabled = false;
  }
}

function setConfirmLoading(loading) {
  if (loading) {
    confirmBtn.innerHTML = `<span class="spinner" style="border-top-color:#fff;border-color:rgba(255,255,255,.2)"></span><span>Downloading…</span>`;
    confirmBtn.disabled = true;
  } else {
    confirmBtn.innerHTML = `<span>Download Level File</span><span class="btn-arrow">→</span>`;
    confirmBtn.disabled = false;
  }
}

// ── Fetch-and-save helper ─────────────────────────────────────
// Tries a single URL with fetch(), returns the Blob on success or throws on failure.
async function fetchBlob(url) {
  const response = await fetch(url, { method: 'GET', headers: { 'Accept': '*/*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('empty response');
  return blob;
}

// Triggers a browser save-file dialog from a Blob.
function saveBlobAs(blob, filename) {
  const objectUrl = URL.createObjectURL(
    new Blob([blob], { type: 'application/octet-stream' })
  );
  const a = document.createElement('a');
  a.href     = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

// ── Core Download Logic ───────────────────────────────────────
async function downloadLevel(userId, levelId) {
  const filename  = `${levelId}.level`;
  const directUrl = buildDirectUrl(userId, levelId);
  const workerUrl = buildWorkerUrl(userId, levelId);
  const proxyUrl  = buildAllOriginsUrl(userId, levelId);

  setConfirmLoading(true);
  showStatus('info', 'Fetching level…', 'Connecting to GRAB servers…');

  // ── Strategy 1: direct fetch from api.slin.dev ──────────────
  try {
    showStatus('info', 'Fetching level…', 'Trying direct connection…');
    const blob = await fetchBlob(directUrl);
    saveBlobAs(blob, filename);
    showStatus('success', 'Download complete!', `"${filename}" saved — check your Downloads folder.`);
    setConfirmLoading(false);
    return;
  } catch (e) {
    console.warn('Strategy 1 (direct) failed:', e.message);
  }

  // ── Strategy 2: Slin's Cloudflare Worker (CORS-enabled mirror) ──
  try {
    showStatus('info', 'Fetching level…', 'Trying GRAB API worker…');
    const blob = await fetchBlob(workerUrl);
    saveBlobAs(blob, filename);
    showStatus('success', 'Download complete!', `"${filename}" saved — check your Downloads folder.`);
    setConfirmLoading(false);
    return;
  } catch (e) {
    console.warn('Strategy 2 (worker) failed:', e.message);
  }

  // ── Strategy 3: allorigins.win raw proxy ─────────────────────
  try {
    showStatus('info', 'Fetching level…', 'Trying proxy fallback…');
    const blob = await fetchBlob(proxyUrl);
    saveBlobAs(blob, filename);
    showStatus('success', 'Download complete!', `"${filename}" saved — check your Downloads folder.`);
    setConfirmLoading(false);
    return;
  } catch (e) {
    console.warn('Strategy 3 (allorigins) failed:', e.message);
  }

  // ── Strategy 4: plain navigation (last resort) ───────────────
  // CORS doesn't restrict <a href> navigations — the browser opens/downloads the file directly.
  // The filename won't be set, but the file will download.
  console.warn('All fetch strategies failed — falling back to direct navigation.');
  showStatus('warn', 'Opening direct link…',
    'Fetch blocked by browser — opening the file URL directly. Your browser should download it automatically.');

  const a = document.createElement('a');
  a.href   = directUrl;
  a.target = '_blank';
  a.rel    = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setConfirmLoading(false);
}

// ── Event: Parse & Preview ────────────────────────────────────
function handleDownloadClick() {
  const raw = urlInput.value;

  if (!raw.trim()) {
    showStatus('error', 'No URL entered',
      'Paste a grabvr.quest level URL or a userid:levelid pair into the field above.');
    hidePreview();
    return;
  }

  setLoading(true);
  clearStatus();
  hidePreview();

  setTimeout(() => {
    const result = parseLevelUrl(raw);
    setLoading(false);

    if (!result) {
      if (!raw.includes('grabvr.quest') && !raw.includes(':')) {
        showStatus('error', 'Invalid input',
          'Paste a grabvr.quest level URL or a "userid:levelid" pair. Example: https://grabvr.quest/levels/viewer/?level=userid:levelid');
      } else if (raw.includes('grabvr.quest') && !raw.includes('?level=') && !raw.includes('&level=')) {
        showStatus('error', 'Missing level parameter',
          'The URL is missing the "?level=" query parameter. Copy it directly from the level viewer page.');
      } else if (raw.includes('?level=') && !raw.split('level=')[1]?.includes(':')) {
        showStatus('error', 'Invalid level ID format',
          'The level parameter must be in the format "userid:levelid" (with a colon separating them).');
      } else {
        showStatus('error', 'Could not parse URL',
          'Expected: https://grabvr.quest/levels/viewer/?level=userid:levelid');
      }
      return;
    }

    parsedLevel = result;
    showStatus('info', 'Level URL parsed successfully',
      'Review the details below, then click "Download Level File".');
    showPreview(result.userId, result.levelId);

  }, 350);
}

// ── Event listeners ───────────────────────────────────────────
confirmBtn.addEventListener('click', async () => {
  if (!parsedLevel) return;
  await downloadLevel(parsedLevel.userId, parsedLevel.levelId);
});

downloadBtn.addEventListener('click', handleDownloadClick);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleDownloadClick();
});

urlInput.addEventListener('input', () => {
  const hasValue = urlInput.value.length > 0;
  clearBtn.classList.toggle('visible', hasValue);
  if (parsedLevel) {
    hidePreview();
    clearStatus();
  }
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.classList.remove('visible');
  hidePreview();
  clearStatus();
  urlInput.focus();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement !== urlInput) {
    urlInput.focus();
  }
});

// Auto-paste from clipboard on load if it looks like a GRAB URL or id pair
(async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      const looksLikeLevel =
        (text.includes('grabvr.quest') && text.includes('level=')) ||
        /^[a-z0-9]+:[0-9]+$/.test(text.trim());
      if (looksLikeLevel) {
        urlInput.value = text.trim();
        clearBtn.classList.add('visible');
      }
    }
  } catch {
    // Clipboard read permission denied — silently ignore
  }
})();
