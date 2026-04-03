/**
 * GRAB Level Downloader – app.js
 * Parses grabvr.quest level URLs, previews metadata, then downloads the level file.
 *
 * The GRAB ecosystem uses API endpoints such as /details/... and /list?... for metadata,
 * while the actual downloadable level file may be exposed directly by the API response.
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
const previewHero    = document.getElementById('preview-hero');
const previewThumb   = document.getElementById('preview-thumb');
const previewTitle   = document.getElementById('preview-title');
const previewCreator = document.getElementById('preview-creator');
const previewTags    = document.getElementById('preview-tags');
const previewLoading = document.getElementById('preview-loading');

// ── State ─────────────────────────────────────────────────────
let parsedLevel = null; // { userId, levelId }
let lastPreviewData = null;

// ── GRAB API endpoints ────────────────────────────────────────
const DIRECT_BASE = 'https://api.slin.dev/grab/v1';
const WORKER_BASE = 'https://grab-api-dev.slindev.workers.dev/grab/v1';
const PLACEHOLDER_THUMB = 'https://grabvr.quest/assets/preview_image_placeholder-80597aa6.png';

function buildLevelKey(userId, levelId) {
  return `${String(userId).trim()}:${String(levelId).trim()}`;
}

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

function buildDetailsUrl(userId, levelId) {
  return `${DIRECT_BASE}/details/${encodeURIComponent(userId)}/${encodeURIComponent(levelId)}`;
}

function buildListUrl(userId) {
  return `${DIRECT_BASE}/list?max_format_version=100&user_id=${encodeURIComponent(userId)}`;
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
        <strong>${escapeHtml(title)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      </div>
    </div>
  `;
}

function clearStatus() {
  statusArea.innerHTML = '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function normalizeArrayLike(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.includes(',')) return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    return [trimmed];
  }
  return [];
}

function pickFirstString(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickFirstHttpUrl(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (isHttpUrl(value)) return value.trim();
  }
  return '';
}

function normalizeLevelData(data, fallbackUserId = '', fallbackLevelId = '') {
  if (!data) return null;

  const item = Array.isArray(data)
    ? data.find(entry => String(entry?.id ?? entry?.level_id ?? entry?.levelId ?? '') === fallbackLevelId || buildLevelKey(entry?.user_id ?? entry?.userId ?? entry?.creator_id ?? entry?.creatorId ?? fallbackUserId, entry?.level_id ?? entry?.levelId ?? fallbackLevelId) === buildLevelKey(fallbackUserId, fallbackLevelId))
      || data[0]
    : data;

  if (!item || typeof item !== 'object') return null;

  const thumbnail = pickFirstHttpUrl(item, [
    'thumbnail', 'thumbnail_url', 'thumbnailUrl', 'preview', 'preview_url', 'previewUrl',
    'image', 'image_url', 'imageUrl', 'cover', 'cover_url', 'coverUrl', 'thumbnailImage'
  ]);

  const downloadUrl = pickFirstHttpUrl(item, [
    'file', 'file_url', 'fileUrl', 'download', 'download_url', 'downloadUrl',
    'level_file', 'levelFile', 'url'
  ]);

  const title = pickFirstString(item, ['title', 'name', 'level_name', 'levelName']);
  const creators = pickFirstString(item, ['creators', 'creator', 'author', 'owner']);

  const tags = normalizeArrayLike(item.tags ?? item.tag ?? item.labels ?? item.label);

  const resolvedUserId = String(
    item.user_id ?? item.userId ?? item.creator_id ?? item.creatorId ?? fallbackUserId ?? ''
  ).trim();
  const resolvedLevelId = String(
    item.level_id ?? item.levelId ?? item.id ?? fallbackLevelId ?? ''
  ).trim();

  return {
    raw: item,
    userId: resolvedUserId,
    levelId: resolvedLevelId,
    title: title || resolvedLevelId || fallbackLevelId || 'Untitled',
    creators: creators || resolvedUserId || fallbackUserId || 'Unknown',
    tags,
    thumbnail: thumbnail || PLACEHOLDER_THUMB,
    downloadUrl,
  };
}

async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBlob(url, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size === 0) throw new Error('empty response');
    return blob;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function saveBlobAs(blob, filename) {
  const objectUrl = URL.createObjectURL(
    new Blob([blob], { type: 'application/octet-stream' })
  );
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

// Thumbnail URL + metadata are returned by the API when available; otherwise we fall back.
async function fetchLevelDetails(userId, levelId) {
  const detailsUrl = buildDetailsUrl(userId, levelId);
  const listUrl = buildListUrl(userId);
  const workerDetailsUrl = `${WORKER_BASE}/details/${encodeURIComponent(userId)}/${encodeURIComponent(levelId)}`;

  const candidates = [
    detailsUrl,
    workerDetailsUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(detailsUrl)}`,
  ];

  for (const url of candidates) {
    const data = await fetchJson(url);
    const normalized = normalizeLevelData(data, userId, levelId);
    if (normalized) return normalized;
  }

  const listData = await fetchJson(listUrl);
  if (Array.isArray(listData)) {
    const normalized = normalizeLevelData(listData, userId, levelId);
    if (normalized) return normalized;
  }

  return normalizeLevelData({
    userId,
    levelId,
    title: levelId,
    creators: userId,
    tags: [],
    thumbnail: PLACEHOLDER_THUMB,
  }, userId, levelId);
}

function renderPreviewTags(tags) {
  if (!tags || !tags.length) {
    previewTags.innerHTML = '';
    return;
  }

  previewTags.innerHTML = tags.map(tag => {
    const value = String(tag).trim();
    const isOk = value.toLowerCase() === 'ok';
    const label = isOk ? '✓ Verified' : value;
    return `<span class="preview-tag-pill${isOk ? ' ok' : ''}">${escapeHtml(label)}</span>`;
  }).join('');
}

async function showPreview(userId, levelId) {
  const apiUrl = buildDirectUrl(userId, levelId);
  previewUserid.textContent  = userId;
  previewLevelid.textContent = levelId;
  previewApi.textContent     = apiUrl;

  previewHero.hidden    = true;
  previewLoading.hidden = false;
  previewTitle.textContent   = '—';
  previewCreator.textContent = '—';
  previewTags.innerHTML      = '';
  previewThumb.style.display = '';
  previewThumb.src           = PLACEHOLDER_THUMB;

  levelPreview.hidden = false;

  const details = await fetchLevelDetails(userId, levelId);
  lastPreviewData = details;
  previewLoading.hidden = true;

  if (details) {
    previewTitle.textContent = details.title || levelId || 'Untitled';
    previewCreator.textContent = details.creators || userId || 'Unknown';
    renderPreviewTags(details.tags || []);
    previewThumb.src = details.thumbnail || PLACEHOLDER_THUMB;
    previewThumb.onerror = () => {
      previewThumb.src = PLACEHOLDER_THUMB;
    };
    previewHero.hidden = false;
  } else {
    previewTitle.textContent = levelId;
    previewCreator.textContent = userId;
    previewThumb.src = PLACEHOLDER_THUMB;
    previewHero.hidden = false;
  }
}

function hidePreview() {
  levelPreview.hidden = true;
  previewHero.hidden  = true;
  previewLoading.hidden = true;
  previewThumb.src    = PLACEHOLDER_THUMB;
  previewThumb.style.display = '';
  parsedLevel = null;
  lastPreviewData = null;
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

async function resolveDownloadUrl(userId, levelId) {
  const details = lastPreviewData && lastPreviewData.userId === userId && lastPreviewData.levelId === levelId
    ? lastPreviewData
    : await fetchLevelDetails(userId, levelId);

  if (details?.downloadUrl) return details.downloadUrl;

  const fallbackCandidates = [
    buildDirectUrl(userId, levelId),
    buildWorkerUrl(userId, levelId),
    buildAllOriginsUrl(userId, levelId),
  ];

  for (const url of fallbackCandidates) {
    try {
      const blob = await fetchBlob(url);
      return { blob, filename: `${sanitizeFilename(details?.title || levelId)}.level` };
    } catch {
      // try next
    }
  }

  return null;
}

// ── Core Download Logic ───────────────────────────────────────
async function downloadLevel(userId, levelId) {
  const details = lastPreviewData && lastPreviewData.userId === userId && lastPreviewData.levelId === levelId
    ? lastPreviewData
    : await fetchLevelDetails(userId, levelId);

  const filenameBase = sanitizeFilename(details?.title || levelId || `${userId}_${levelId}`);
  const filename  = `${filenameBase}.level`;
  const directUrl = buildDirectUrl(userId, levelId);
  const workerUrl = buildWorkerUrl(userId, levelId);
  const proxyUrl  = buildAllOriginsUrl(userId, levelId);

  setConfirmLoading(true);
  showStatus('info', 'Fetching level…', 'Connecting to GRAB servers…');

  // If the API already gave us a downloadable URL, use that first.
  if (details?.downloadUrl) {
    try {
      showStatus('info', 'Fetching level…', 'Downloading from level file URL…');
      const blob = await fetchBlob(details.downloadUrl);
      saveBlobAs(blob, filename);
      showStatus('success', 'Download complete!', `"${filename}" saved — check your Downloads folder.`);
      setConfirmLoading(false);
      return;
    } catch (e) {
      console.warn('Direct file URL failed:', e?.message || e);
    }
  }

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
        /^[a-z0-9]+:[a-z0-9]+$/i.test(text.trim());
      if (looksLikeLevel) {
        urlInput.value = text.trim();
        clearBtn.classList.add('visible');
      }
    }
  } catch {
    // Clipboard read permission denied — silently ignore
  }
})();
