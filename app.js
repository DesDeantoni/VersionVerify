/**
 * app.js — Local Document Versioner MVP
 * IndexedDB storage, DOCX/PDF/TXT import, version history, diff
 */

'use strict';

// ─── STATE ──────────────────────────────────────────────────────────────────
const App = {
  db: null,
  currentDocId: null,
  currentDoc: null,      // { id, title, versions: [] }
  compareA: null,        // version index for diff
  compareB: null,
};

// ─── DB INIT ─────────────────────────────────────────────────────────────────
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('localVersionerDB', 1);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = (e) => { App.db = e.target.result; resolve(); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
function dbGetAll() {
  return new Promise((resolve, reject) => {
    const tx = App.db.transaction('documents', 'readonly');
    const req = tx.objectStore('documents').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbGet(id) {
  return new Promise((resolve, reject) => {
    const tx = App.db.transaction('documents', 'readonly');
    const req = tx.objectStore('documents').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbPut(doc) {
  return new Promise((resolve, reject) => {
    const tx = App.db.transaction('documents', 'readwrite');
    const req = tx.objectStore('documents').put(doc);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx = App.db.transaction('documents', 'readwrite');
    const req = tx.objectStore('documents').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ─── SCREEN NAVIGATION ───────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const screen = document.getElementById('screen-' + name);
  if (screen) screen.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-screen="${name}"]`);
  if (navItem) navItem.classList.add('active');
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── UPDATE SIDEBAR DOC TITLE ─────────────────────────────────────────────────
function updateSidebarTitle() {
  const el = document.getElementById('sidebar-doc-title');
  el.textContent = App.currentDoc ? App.currentDoc.title || 'Untitled' : '—';
}

// ─── LANDING SCREEN ───────────────────────────────────────────────────────────
function landingInit() {
  showScreen('landing');
  updateSidebarTitle();
}

document.getElementById('btn-new-doc').addEventListener('click', () => {
  App.currentDocId = null;
  App.currentDoc   = { title: '', versions: [] };
  document.getElementById('doc-title').value = '';
  document.getElementById('editor-textarea').value = '';
  updateSidebarTitle();
  updateEditorStats();
  showScreen('editor');
});

document.getElementById('btn-open-doc').addEventListener('click', async () => {
  await openModalShow();
});

// ─── OPEN DOCUMENT MODAL ──────────────────────────────────────────────────────
async function openModalShow() {
  const modal = document.getElementById('modal-open');
  const list  = document.getElementById('doc-list');
  list.innerHTML = '';

  const docs = await dbGetAll();

  if (docs.length === 0) {
    list.innerHTML = '<div class="modal-empty">NO SAVED DOCUMENTS</div>';
  } else {
    docs.slice().reverse().forEach(doc => {
      const vCount = doc.versions.length;
      const lastTs = vCount > 0
        ? new Date(doc.versions[vCount - 1].timestamp).toLocaleString()
        : 'No versions';

      const item = document.createElement('div');
      item.className = 'doc-list-item';
      item.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="doc-item-title">${esc(doc.title || 'Untitled')}</div>
          <div class="doc-item-meta">${vCount} version${vCount !== 1 ? 's' : ''} &bull; ${esc(lastTs)}</div>
        </div>
        <button class="doc-item-del" data-id="${doc.id}" title="Delete document">✕</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.doc-item-del')) return;
        openDocument(doc.id);
        modal.classList.remove('open');
      });

      item.querySelector('.doc-item-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${doc.title || 'Untitled'}"? This cannot be undone.`)) return;
        await dbDelete(doc.id);
        if (App.currentDocId === doc.id) {
          App.currentDocId = null;
          App.currentDoc   = null;
          updateSidebarTitle();
        }
        item.remove();
        if (list.children.length === 0) {
          list.innerHTML = '<div class="modal-empty">NO SAVED DOCUMENTS</div>';
        }
        toast('Document deleted', 'info');
      });

      list.appendChild(item);
    });
  }

  modal.classList.add('open');
}

document.getElementById('modal-open-close').addEventListener('click', () => {
  document.getElementById('modal-open').classList.remove('open');
});

document.getElementById('modal-open').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

async function openDocument(id) {
  const doc = await dbGet(id);
  if (!doc) { toast('Document not found', 'error'); return; }

  App.currentDocId = id;
  App.currentDoc   = doc;

  const lastVersion = doc.versions[doc.versions.length - 1];
  document.getElementById('doc-title').value       = doc.title || '';
  document.getElementById('editor-textarea').value = lastVersion ? lastVersion.text : '';
  updateSidebarTitle();
  updateEditorStats();
  showScreen('editor');
}

// ─── EDITOR SCREEN ────────────────────────────────────────────────────────────
document.getElementById('doc-title').addEventListener('input', () => {
  if (App.currentDoc) {
    App.currentDoc.title = document.getElementById('doc-title').value;
    updateSidebarTitle();
  }
});

function updateEditorStats() {
  const text = document.getElementById('editor-textarea').value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  document.getElementById('editor-stats').textContent = `${words} words  ·  ${chars} chars`;
}

document.getElementById('editor-textarea').addEventListener('input', updateEditorStats);

// Import file
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ''; // reset so same file can re-import

  const ext = file.name.split('.').pop().toLowerCase();
  let text = '';

  try {
    if (ext === 'txt' || ext === 'md') {
      text = await file.text();
    } else if (ext === 'docx') {
      text = await importDocx(file);
    } else if (ext === 'pdf') {
      text = await importPdf(file);
    } else {
      toast('Unsupported file type. Use TXT, DOCX, or PDF.', 'error');
      return;
    }
  } catch (err) {
    toast('Import failed: ' + err.message, 'error');
    return;
  }

  document.getElementById('editor-textarea').value = text;
  updateEditorStats();
  toast(`Imported: ${file.name}`, 'success');
});

async function importDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function importPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText.trim();
}

// Save Version
document.getElementById('btn-save-version').addEventListener('click', () => {
  const title = document.getElementById('doc-title').value.trim();
  if (!title) {
    toast('Please enter a document title first.', 'error');
    document.getElementById('doc-title').focus();
    return;
  }
  // Open label modal
  document.getElementById('version-label-input').value = '';
  document.getElementById('modal-label').classList.add('open');
  document.getElementById('version-label-input').focus();
});

document.getElementById('btn-label-save').addEventListener('click', () => saveVersion());
document.getElementById('btn-label-skip').addEventListener('click', () => saveVersion(true));

document.getElementById('version-label-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveVersion();
  if (e.key === 'Escape') document.getElementById('modal-label').classList.remove('open');
});

async function saveVersion(skipLabel = false) {
  const label = skipLabel ? null : (document.getElementById('version-label-input').value.trim() || null);
  document.getElementById('modal-label').classList.remove('open');

  if (!App.currentDoc) App.currentDoc = { title: '', versions: [] };

  const text  = document.getElementById('editor-textarea').value;
  const title = document.getElementById('doc-title').value.trim();

  App.currentDoc.title = title;

  const newVersion = {
    id:        Date.now(),
    timestamp: Date.now(),
    label:     label,
    text:      text,
  };

  App.currentDoc.versions.push(newVersion);

  const savedId = await dbPut(App.currentDoc);
  if (!App.currentDocId) {
    App.currentDocId  = savedId;
    App.currentDoc.id = savedId;
  }

  updateSidebarTitle();
  toast(`Version ${App.currentDoc.versions.length} saved${label ? ': ' + label : ''}`, 'success');
}

// Nav to history from editor
document.getElementById('btn-view-history').addEventListener('click', () => {
  if (!App.currentDoc || App.currentDoc.versions.length === 0) {
    toast('No versions saved yet.', 'info');
    return;
  }
  renderHistory();
  showScreen('history');
});

// ─── VERSION HISTORY SCREEN ───────────────────────────────────────────────────
function renderHistory() {
  App.compareA = null;
  App.compareB = null;

  const container = document.getElementById('history-list');
  container.innerHTML = '';

  const versions = App.currentDoc.versions;

  if (versions.length === 0) {
    container.innerHTML = '<p style="color:#555;font-family:var(--mono);font-size:11px;padding:20px 0">No versions yet.</p>';
    return;
  }

  versions.slice().reverse().forEach((v, revIdx) => {
    const realIdx = versions.length - 1 - revIdx;
    const num     = realIdx + 1;
    const ts      = new Date(v.timestamp).toLocaleString();
    const preview = v.text.replace(/\s+/g, ' ').substring(0, 80);

    const card = document.createElement('div');
    card.className = 'version-card';
    card.dataset.idx = realIdx;
    card.innerHTML = `
      <div class="version-card-header">
        <div class="version-num">v${num}</div>
        <div class="version-info">
          <div class="version-timestamp">${esc(ts)}</div>
          ${v.label ? `<div class="version-label">${esc(v.label)}</div>` : ''}
          <div class="version-preview">${esc(preview)}${v.text.length > 80 ? '…' : ''}</div>
        </div>
        <div class="version-select-badges">
          <span class="badge-select badge-a" data-idx="${realIdx}">A</span>
          <span class="badge-select badge-b" data-idx="${realIdx}">B</span>
        </div>
        <div class="version-actions">
          <button class="btn btn-ghost btn-sm btn-revert" data-idx="${realIdx}">Revert</button>
        </div>
      </div>
    `;

    card.querySelector('.badge-a').addEventListener('click', () => selectCompare('a', realIdx));
    card.querySelector('.badge-b').addEventListener('click', () => selectCompare('b', realIdx));
    card.querySelector('.btn-revert').addEventListener('click', () => revertToVersion(realIdx));

    container.appendChild(card);
  });

  updateCompareBar();
}

function selectCompare(slot, idx) {
  App['compare' + slot.toUpperCase()] = idx;
  // Re-render badge states
  document.querySelectorAll('.badge-select.badge-a').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.badge-select.badge-b').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.version-card').forEach(c => {
    c.classList.remove('selected-a', 'selected-b');
  });

  if (App.compareA !== null) {
    const aCard = document.querySelector(`.version-card[data-idx="${App.compareA}"]`);
    if (aCard) {
      aCard.classList.add('selected-a');
      aCard.querySelector('.badge-a').classList.add('active');
    }
  }
  if (App.compareB !== null) {
    const bCard = document.querySelector(`.version-card[data-idx="${App.compareB}"]`);
    if (bCard) {
      bCard.classList.add('selected-b');
      bCard.querySelector('.badge-b').classList.add('active');
    }
  }
  updateCompareBar();
}

function updateCompareBar() {
  const btn  = document.getElementById('btn-compare');
  const info = document.getElementById('compare-info');
  const a    = App.compareA;
  const b    = App.compareB;

  if (a === null && b === null) {
    info.textContent = 'Select version A and version B to compare';
    btn.disabled = true;
  } else if (a !== null && b === null) {
    info.textContent = `A = v${a + 1} selected — now select B`;
    btn.disabled = true;
  } else if (a === null && b !== null) {
    info.textContent = `B = v${b + 1} selected — now select A`;
    btn.disabled = true;
  } else if (a === b) {
    info.textContent = 'A and B must be different versions';
    btn.disabled = true;
  } else {
    info.textContent = `Comparing v${a + 1} (A) → v${b + 1} (B)`;
    btn.disabled = false;
  }
}

document.getElementById('btn-compare').addEventListener('click', () => {
  runDiff(App.compareA, App.compareB);
});

async function revertToVersion(idx) {
  const version = App.currentDoc.versions[idx];
  if (!confirm(`Revert to version ${idx + 1}? This will load that text and save it as a new version.`)) return;

  document.getElementById('editor-textarea').value = version.text;
  updateEditorStats();
  showScreen('editor');

  // Auto-save as new version with revert label
  App.currentDoc.versions.push({
    id:        Date.now(),
    timestamp: Date.now(),
    label:     `Reverted to v${idx + 1}`,
    text:      version.text,
  });

  await dbPut(App.currentDoc);
  toast(`Reverted to version ${idx + 1} and saved as new version`, 'success');
}

// ─── DIFF SCREEN ─────────────────────────────────────────────────────────────
function runDiff(idxA, idxB) {
  const vA = App.currentDoc.versions[idxA];
  const vB = App.currentDoc.versions[idxB];

  document.getElementById('diff-va-label').textContent = `v${idxA + 1}${vA.label ? ' — ' + vA.label : ''}`;
  document.getElementById('diff-vb-label').textContent = `v${idxB + 1}${vB.label ? ' — ' + vB.label : ''}`;
  document.getElementById('diff-va-ts').textContent    = new Date(vA.timestamp).toLocaleString();
  document.getElementById('diff-vb-ts').textContent    = new Date(vB.timestamp).toLocaleString();

  const ops    = Diff.diff(vA.text, vB.text);
  const html   = Diff.renderDiff(ops);
  document.getElementById('diff-output').innerHTML = html;

  // Count stats
  const adds = ops.filter(o => o.type === 'insert').reduce((s, o) => s + o.value.length, 0);
  const dels = ops.filter(o => o.type === 'delete').reduce((s, o) => s + o.value.length, 0);
  document.getElementById('diff-stat-adds').textContent = `+${adds} chars added`;
  document.getElementById('diff-stat-dels').textContent = `−${dels} chars removed`;

  showScreen('diff');
}

document.getElementById('btn-back-from-diff').addEventListener('click', () => {
  showScreen('history');
});

// ─── NAV ─────────────────────────────────────────────────────────────────────
document.getElementById('nav-editor').addEventListener('click', () => {
  if (!App.currentDoc) { toast('Open or create a document first.', 'info'); return; }
  showScreen('editor');
});

document.getElementById('nav-history').addEventListener('click', () => {
  if (!App.currentDoc) { toast('Open or create a document first.', 'info'); return; }
  if (App.currentDoc.versions.length === 0) { toast('No versions saved yet.', 'info'); return; }
  renderHistory();
  showScreen('history');
});

document.getElementById('nav-home').addEventListener('click', () => {
  showScreen('landing');
});

// Back buttons
document.getElementById('btn-back-to-editor').addEventListener('click', () => showScreen('editor'));
document.getElementById('btn-back-from-history').addEventListener('click', () => showScreen('editor'));

// ─── UTILS ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await initDB();
    showScreen('landing');
  } catch (err) {
    document.body.innerHTML = `<div style="padding:40px;font-family:monospace;color:#c04040;">
      Failed to initialize local database: ${err.message}
    </div>`;
  }
})();
