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

// ── GRAB API base ─────────────────────────────────────────────
const API_BASE = 'https://api.slin.dev/grab/v1';

// ── Helpers ───────────────────────────────────────────────────

function parseLevelUrl(raw) {
  const str = raw.trim();
  if (!str) return null;

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
// api.slin.dev blocks cross-origin fetch() calls via CORS, so we cannot use
// fetch() from a different domain. CORS only restricts fetch/XHR — it does NOT
// restrict the browser from loading a URL directly via an <a> click.
//
// The server returns the raw .level binary with Content-Disposition: attachment,
// so the browser treats it as a file download automatically.
//
// Endpoint: https://api.slin.dev/grab/v1/get_level/<userid>/<levelid>

function downloadLevel(userId, levelId) {
  const apiUrl = buildApiUrl(userId, levelId);
  const filename = `${levelId}.level`;

  setConfirmLoading(true);

  // Point a hidden <a> directly at the API URL and click it.
  // No fetch, no CORS — the browser handles it as a direct download.
  const a = document.createElement('a');
  a.href = apiUrl;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showStatus('success', 'Download started!',
    `Fetching "${filename}" — check your Downloads folder in a moment.`);

  setTimeout(() => setConfirmLoading(false), 1500);
}

// ── Event: Parse & Preview ────────────────────────────────────
function handleDownloadClick() {
  const raw = urlInput.value;

  if (!raw.trim()) {
    showStatus('error', 'No URL entered', 'Paste a grabvr.quest level viewer URL into the field above.');
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
      if (!raw.includes('grabvr.quest')) {
        showStatus('error', 'Invalid domain',
          'The URL must be from grabvr.quest. Example: https://grabvr.quest/levels/viewer/?level=userid:levelid');
      } else if (!raw.includes('?level=') && !raw.includes('&level=')) {
        showStatus('error', 'Missing level parameter',
          'The URL is missing the "?level=" query parameter. Copy it directly from the level viewer page.');
      } else if (raw.includes('?level=') && !raw.split('level=')[1]?.includes(':')) {
        showStatus('error', 'Invalid level ID format',
          'The level parameter must be in the format "userid:levelid" (with a colon separating them).');
      } else {
        showStatus('error', 'Could not parse URL',
          "This doesn't look like a valid GRAB level URL. Expected format: https://grabvr.quest/levels/viewer/?level=userid:levelid");
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
confirmBtn.addEventListener('click', () => {
  if (!parsedLevel) return;
  downloadLevel(parsedLevel.userId, parsedLevel.levelId);
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

// Auto-paste from clipboard on load if it looks like a GRAB URL
(async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text.includes('grabvr.quest') && text.includes('level=')) {
        urlInput.value = text.trim();
        clearBtn.classList.add('visible');
      }
    }
  } catch {
    // Clipboard read permission denied — silently ignore
  }
})();
