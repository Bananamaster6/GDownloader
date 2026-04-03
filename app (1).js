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
// The public level JSON endpoint used by grabvr.quest
const API_BASE = 'https://grabvr.quest/levels';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parse a grabvr.quest level viewer URL.
 * Expected format: https://grabvr.quest/levels/viewer/?level=USERID:LEVELID
 * Returns { userId, levelId } or null if invalid.
 */
function parseLevelUrl(raw) {
  const str = raw.trim();
  if (!str) return null;

  let url;
  try {
    // Prepend protocol if missing so URL() doesn't throw
    url = new URL(str.startsWith('http') ? str : 'https://' + str);
  } catch {
    return null;
  }

  // Must be grabvr.quest
  if (!url.hostname.includes('grabvr.quest')) return null;

  // Must contain the levels/viewer path
  if (!url.pathname.includes('/levels')) return null;

  // The level param in the query string
  const levelParam = url.searchParams.get('level');
  if (!levelParam) return null;

  // Must be in the form USERID:LEVELID
  const parts = levelParam.split(':');
  if (parts.length !== 2) return null;

  const [userId, levelId] = parts.map(p => p.trim());
  if (!userId || !levelId) return null;

  return { userId, levelId };
}

/**
 * Build the API URL for a given level.
 * grabvr.quest serves level JSON at:
 *   https://grabvr.quest/levels/[userid]/[levelid]
 */
function buildApiUrl(userId, levelId) {
  return `${API_BASE}/${encodeURIComponent(userId)}/${encodeURIComponent(levelId)}`;
}

/** Display a status message in the status area */
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

/** Show/hide level preview card */
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

/** Set download button to loading state */
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

/**
 * Attempt to fetch a level from the GRAB API and trigger a file download.
 * The level data (JSON) is saved as <levelid>.json
 */
async function downloadLevel(userId, levelId) {
  const apiUrl = buildApiUrl(userId, levelId);
  setConfirmLoading(true);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json, */*' },
    });

    if (response.status === 404) {
      showStatus('error', 'Level not found',
        `No level exists for user "${userId}" with ID "${levelId}". Double-check the URL.`);
      setConfirmLoading(false);
      return;
    }

    if (response.status === 403) {
      showStatus('error', 'Access denied',
        'The server refused access to this level (403). It may be private or deleted.');
      setConfirmLoading(false);
      return;
    }

    if (!response.ok) {
      showStatus('error', `Server error (${response.status})`,
        'GrabVR returned an unexpected error. Try again in a moment.');
      setConfirmLoading(false);
      return;
    }

    // Read raw bytes and save as .level file
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const filename = `${levelId}.level`;

    // Trigger browser download
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

    showStatus('success', 'Level downloaded!',
      `Saved as "${filename}" — check your Downloads folder.`);
    setConfirmLoading(false);

  } catch (err) {
    console.error('[GrabDownloader] Fetch failed:', err);

    // CORS / network errors are common when hitting external APIs from a static page
    if (err instanceof TypeError && err.message.includes('fetch')) {
      showStatus('warn', 'Network or CORS error',
        'The request was blocked. Try opening this page via a local server, or check your network. ' +
        'You can also open the API URL below directly in your browser to download the file.');
    } else {
      showStatus('error', 'Download failed', err.message || 'Unknown error occurred.');
    }
    setConfirmLoading(false);
  }
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

  // Small delay for UX feel
  setTimeout(() => {
    const result = parseLevelUrl(raw);
    setLoading(false);

    if (!result) {
      // Provide specific error guidance
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
          'This doesn\'t look like a valid GRAB level URL. Expected format: https://grabvr.quest/levels/viewer/?level=userid:levelid');
      }
      return;
    }

    parsedLevel = result;
    showStatus('info', 'Level URL parsed successfully',
      'Review the details below, then click "Download Level File".');
    showPreview(result.userId, result.levelId);

  }, 350);
}

// ── Event: Confirm Download ───────────────────────────────────
confirmBtn.addEventListener('click', () => {
  if (!parsedLevel) return;
  downloadLevel(parsedLevel.userId, parsedLevel.levelId);
});

// ── Event: Download button ────────────────────────────────────
downloadBtn.addEventListener('click', handleDownloadClick);

// ── Event: Enter key ──────────────────────────────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleDownloadClick();
});

// ── Event: Input changes ──────────────────────────────────────
urlInput.addEventListener('input', () => {
  const hasValue = urlInput.value.length > 0;
  clearBtn.classList.toggle('visible', hasValue);

  // Reset state when user edits
  if (parsedLevel) {
    hidePreview();
    clearStatus();
  }
});

// ── Event: Clear button ───────────────────────────────────────
clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.classList.remove('visible');
  hidePreview();
  clearStatus();
  urlInput.focus();
});

// ── Paste shortcut: focus input on Ctrl/Cmd+V if not already focused
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement !== urlInput) {
    urlInput.focus();
  }
});

// ── Optional: auto-paste from clipboard on load if it looks like a GRAB URL
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
