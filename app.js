/**
 * GRAB Level Downloader – app.js
 * Parses grabvr.quest level URLs, validates them, then downloads the level file.
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

// ── GRAB API ──────────────────────────────────────────────────
// grab-api-dev.slindev.workers.dev is Slin's own Cloudflare Worker that
// proxies api.slin.dev with Access-Control-Allow-Origin: * headers.
// This is the exact endpoint the official grabvr.quest level browser uses,
// so it supports any level — not just your own — and never needs a third-party proxy.
const API_BASE = 'https://grab-api-dev.slindev.workers.dev/grab/v1';

// ── Helpers ───────────────────────────────────────────────────

function parseLevelUrl(raw) {
  const str = raw.trim();
  if (!str) return null;

  // Also accept bare "userid:levelid" without a full URL
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

function buildApiUrl(userId, levelId) {
  return `${API_BASE}/get_level/${encodeURIComponent(userId)}/${encodeURIComponent(levelId)}`;
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
  const apiUrl = buildApiUrl(userId, levelId);
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

// ── Core Download Logic ───────────────────────────────────────
//
// Slin's Cloudflare Worker (grab-api-dev.slindev.workers.dev) proxies
// api.slin.dev and adds Access-Control-Allow-Origin: * so browser fetch()
// works for ANY level — yours or anyone else's.
//
// Flow:
//   1. fetch() the binary from the worker endpoint
//   2. Pull the response as a Blob
//   3. Create a local objectURL and click a named <a download> against it
//   4. Revoke the objectURL after 5 s to free memory
//
// Endpoint: https://grab-api-dev.slindev.workers.dev/grab/v1/get_level/<userid>/<levelid>

async function downloadLevel(userId, levelId) {
  const apiUrl   = buildApiUrl(userId, levelId);
  const filename = `${levelId}.level`;

  setConfirmLoading(true);
  showStatus('info', 'Fetching level…', `Connecting to GRAB servers for "${filename}"`);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Accept': '*/*' },
    });

    if (response.status === 404) {
      throw new Error('Level not found — double-check the URL and try again.');
    }
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();

    if (blob.size === 0) {
      throw new Error('Server returned an empty file — the level may not exist.');
    }

    const objectUrl = URL.createObjectURL(
      new Blob([blob], { type: 'application/octet-stream' })
    );

    // Trigger download via a temporary <a> pointing at the local blob URL
    const a = document.createElement('a');
    a.href     = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Free the object URL after the download has had time to start
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

    showStatus('success', 'Download complete!',
      `"${filename}" saved — check your Downloads folder.`);

  } catch (err) {
    console.error('Download failed:', err);
    showStatus('error', 'Download failed', err.message);
  } finally {
    setConfirmLoading(false);
  }
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
