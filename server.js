'use strict';

const express = require('express');
const multer  = require('multer');
const crypto  = require('node:crypto');
const path    = require('node:path');
const fs      = require('node:fs');
const fsp     = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

const CONFIG = require('./config');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const UPLOAD_DIR = path.resolve(CONFIG.uploads.dir);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Database ────────────────────────────────────────────────────────────────
const pg = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
}) : null;

// node:sqlite is experimental on Node 22 and requires --experimental-sqlite.
// Only load it when Postgres isn't configured (local dev fallback).
let sqlite = null;
if (!pg) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    sqlite = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'invite.db'));
  } catch (err) {
    console.error('SQLite unavailable and no DATABASE_URL set. Configure Postgres on Railway.', err.message);
    process.exit(1);
  }
}

function sqlParam(i) { return pg ? `$${i}` : '?'; }

async function dbRun(sqliteSql, pgSql = sqliteSql, params = []) {
  if (pg) return pg.query(pgSql, params);
  return sqlite.prepare(sqliteSql).run(...params);
}

async function dbGet(sqliteSql, pgSql = sqliteSql, params = []) {
  if (pg) {
    const result = await pg.query(pgSql, params);
    return result.rows[0];
  }
  return sqlite.prepare(sqliteSql).get(...params);
}

async function dbAll(sqliteSql, pgSql = sqliteSql, params = []) {
  if (pg) {
    const result = await pg.query(pgSql, params);
    return result.rows;
  }
  return sqlite.prepare(sqliteSql).all(...params);
}

// Idempotent column add. PG has native ADD COLUMN IF NOT EXISTS; SQLite
// needs to introspect via PRAGMA table_info. Safe to call at every boot.
async function ensureColumn(table, column, sqliteType, pgType = sqliteType) {
  if (pg) {
    await pg.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${pgType}`);
    return;
  }
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (rows.some(r => r.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqliteType}`);
}

async function initDb() {
  if (pg) {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS guests (
        id                   SERIAL PRIMARY KEY,
        guest_group          TEXT    NOT NULL DEFAULT '',
        guest_name           TEXT    NOT NULL,
        mobile_number        TEXT    NOT NULL DEFAULT '',
        email_address        TEXT    NOT NULL DEFAULT '',
        added_by_name        TEXT    NOT NULL DEFAULT '',
        added_by_initials    TEXT    NOT NULL DEFAULT '',
        party_size           INTEGER NOT NULL DEFAULT 1,
        segment              TEXT    NOT NULL DEFAULT '',
        invite_status        TEXT    NOT NULL DEFAULT 'Not Sent',
        invite_sent_date     TEXT,
        rsvp                 TEXT    NOT NULL DEFAULT 'Pending',
        confirmed_party_size INTEGER,
        follow_up            INTEGER NOT NULL DEFAULT 0,
        notes                TEXT    NOT NULL DEFAULT '',
        dietary              TEXT    NOT NULL DEFAULT '',
        event_selections     TEXT    NOT NULL DEFAULT '',
        party_members        TEXT    NOT NULL DEFAULT '',
        source               TEXT    NOT NULL DEFAULT 'manual',
        invite_token         TEXT    NOT NULL DEFAULT '',
        std_status           TEXT    NOT NULL DEFAULT 'Not Sent',
        std_variant          TEXT    NOT NULL DEFAULT '',
        created_at           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pg.query(`CREATE UNIQUE INDEX IF NOT EXISTS guests_invite_token_idx ON guests(invite_token) WHERE invite_token <> ''`);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id                SERIAL PRIMARY KEY,
        role              TEXT    NOT NULL DEFAULT '',
        host_slug         TEXT    NOT NULL DEFAULT '',
        original_filename TEXT    NOT NULL DEFAULT '',
        mime              TEXT    NOT NULL DEFAULT '',
        size_bytes        BIGINT  NOT NULL DEFAULT 0,
        page_count        INTEGER NOT NULL DEFAULT 1,
        storage_key       TEXT    NOT NULL DEFAULT '',
        variants_json     TEXT    NOT NULL DEFAULT '{}',
        sort_order        INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS rsvp_events (
        id         SERIAL PRIMARY KEY,
        guest_id   INTEGER,
        action     TEXT    NOT NULL DEFAULT '',
        ip_hash    TEXT    NOT NULL DEFAULT '',
        ua_hash    TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS config_overrides (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await ensureColumn('guests', 'party_members', "TEXT NOT NULL DEFAULT ''");
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS guests (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_group          TEXT    NOT NULL DEFAULT '',
      guest_name           TEXT    NOT NULL,
      mobile_number        TEXT    NOT NULL DEFAULT '',
      email_address        TEXT    NOT NULL DEFAULT '',
      added_by_name        TEXT    NOT NULL DEFAULT '',
      added_by_initials    TEXT    NOT NULL DEFAULT '',
      party_size           INTEGER NOT NULL DEFAULT 1,
      segment              TEXT    NOT NULL DEFAULT '',
      invite_status        TEXT    NOT NULL DEFAULT 'Not Sent',
      invite_sent_date     TEXT,
      rsvp                 TEXT    NOT NULL DEFAULT 'Pending',
      confirmed_party_size INTEGER,
      follow_up            INTEGER NOT NULL DEFAULT 0,
      notes                TEXT    NOT NULL DEFAULT '',
      dietary              TEXT    NOT NULL DEFAULT '',
      event_selections     TEXT    NOT NULL DEFAULT '',
      party_members        TEXT    NOT NULL DEFAULT '',
      source               TEXT    NOT NULL DEFAULT 'manual',
      invite_token         TEXT    NOT NULL DEFAULT '',
      std_status           TEXT    NOT NULL DEFAULT 'Not Sent',
      std_variant          TEXT    NOT NULL DEFAULT '',
      created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS guests_invite_token_idx ON guests(invite_token) WHERE invite_token <> ''`);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      role              TEXT    NOT NULL DEFAULT '',
      host_slug         TEXT    NOT NULL DEFAULT '',
      original_filename TEXT    NOT NULL DEFAULT '',
      mime              TEXT    NOT NULL DEFAULT '',
      size_bytes        INTEGER NOT NULL DEFAULT 0,
      page_count        INTEGER NOT NULL DEFAULT 1,
      storage_key       TEXT    NOT NULL DEFAULT '',
      variants_json     TEXT    NOT NULL DEFAULT '{}',
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id   INTEGER,
      action     TEXT    NOT NULL DEFAULT '',
      ip_hash    TEXT    NOT NULL DEFAULT '',
      ua_hash    TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config_overrides (
      key        TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Idempotent column backfills for long-lived databases.
  await ensureColumn('guests', 'party_members', "TEXT NOT NULL DEFAULT ''");
}

// ── Tokens & helpers ────────────────────────────────────────────────────────
function makeInviteToken() { return crypto.randomBytes(12).toString('hex'); }

async function ensureInviteTokenForGuest(id) {
  const existing = await dbGet(
    `SELECT invite_token FROM guests WHERE id=?`,
    `SELECT invite_token FROM guests WHERE id=$1`,
    [id]
  );
  if (existing?.invite_token) return existing.invite_token;
  let token = makeInviteToken();
  for (let i = 0; i < 5; i++) {
    const dupe = await dbGet(
      `SELECT id FROM guests WHERE invite_token=?`,
      `SELECT id FROM guests WHERE invite_token=$1`,
      [token]
    );
    if (!dupe) break;
    token = makeInviteToken();
  }
  await dbRun(
    `UPDATE guests SET invite_token=? WHERE id=?`,
    `UPDATE guests SET invite_token=$1 WHERE id=$2`,
    [token, id]
  );
  return token;
}

async function backfillInviteTokens() {
  const rows = await dbAll(
    `SELECT id FROM guests WHERE invite_token IS NULL OR TRIM(invite_token)=''`,
    `SELECT id FROM guests WHERE invite_token IS NULL OR BTRIM(invite_token)=''`
  );
  for (const row of rows) await ensureInviteTokenForGuest(row.id);
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 16);
}

async function logRsvpEvent(guestId, action, req) {
  const ipHash = hashIp(req.ip || req.headers['x-forwarded-for'] || '');
  const uaHash = hashIp(req.headers['user-agent'] || '');
  await dbRun(
    `INSERT INTO rsvp_events (guest_id, action, ip_hash, ua_hash) VALUES (?,?,?,?)`,
    `INSERT INTO rsvp_events (guest_id, action, ip_hash, ua_hash) VALUES ($1,$2,$3,$4)`,
    [guestId || null, action, ipHash, uaHash]
  );
}

// ── Auth (DB-backed sessions, persist across restarts) ──────────────────────
async function isValidSession(token) {
  if (!token) return false;
  const row = await dbGet(
    `SELECT token FROM sessions WHERE token=?`,
    `SELECT token FROM sessions WHERE token=$1`,
    [token]
  );
  return Boolean(row);
}

async function requireAuth(req, res, next) {
  if (!CONFIG.pin) return next();
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token && await isValidSession(token)) return next();
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// ── Rate limiting (in-memory token bucket, IP-keyed) ────────────────────────
const rlBuckets = new Map();
function rateLimit(perMinute) {
  const windowMs = 60_000;
  return (req, res, next) => {
    const key = `${req.path}:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`;
    const now = Date.now();
    const bucket = rlBuckets.get(key) || { count: 0, windowStart: now };
    if (now - bucket.windowStart > windowMs) { bucket.count = 0; bucket.windowStart = now; }
    bucket.count += 1;
    rlBuckets.set(key, bucket);
    if (bucket.count > perMinute) {
      return res.status(429).json({ ok: false, error: 'Too many requests — try again in a minute.' });
    }
    next();
  };
}
// Lightweight cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rlBuckets) if (now - v.windowStart > 300_000) rlBuckets.delete(k);
}, 120_000).unref();

// PIN lockout: after PIN_LOCKOUT_THRESHOLD consecutive bad PINs from one IP,
// reject for PIN_LOCKOUT_MS regardless of bucket. Cleared on success.
const PIN_LOCKOUT_THRESHOLD = 5;
const PIN_LOCKOUT_MS = 60 * 60 * 1000;
const pinFailures = new Map(); // ipKey → { count, lockedUntil }

function pinClientKey(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

function pinLockState(req) {
  const rec = pinFailures.get(pinClientKey(req));
  if (!rec) return { locked: false, retryAfterMs: 0 };
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: rec.lockedUntil - Date.now() };
  }
  return { locked: false, retryAfterMs: 0 };
}

function recordPinFailure(req) {
  const key = pinClientKey(req);
  const rec = pinFailures.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= PIN_LOCKOUT_THRESHOLD) rec.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
  pinFailures.set(key, rec);
}

function clearPinFailures(req) {
  pinFailures.delete(pinClientKey(req));
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pinFailures) {
    if (v.lockedUntil && v.lockedUntil < now) pinFailures.delete(k);
  }
}, 5 * 60_000).unref();

// ── App setup ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

app.get('/', (_req, res) => res.redirect('/invite.html'));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ── Asset pipeline ──────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename:    (_req, file, cb) => {
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname || '').toLowerCase() || '';
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: CONFIG.uploads.maxBytes },
  fileFilter: (req, file, cb) => {
    const allowed = req._allowedMime || CONFIG.uploads.allowedMime;
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// sharp is a heavy dep — lazy-load so `npm start` still works if it fails to install
let _sharp = null;
function getSharp() {
  if (_sharp) return _sharp;
  try { _sharp = require('sharp'); } catch { _sharp = null; }
  return _sharp;
}

// Render a PDF's first page to JPG. Returns absolute path to rendered image, or null.
async function rasterizePdfFirstPage(pdfPath, outBase) {
  const backend = CONFIG.uploads.pdfBackend;
  if (backend === 'none') return null;

  if (backend === 'poppler' || backend === 'auto') {
    const outPrefix = outBase; // pdftoppm appends -1.jpg
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('pdftoppm', ['-jpeg', '-r', '150', '-f', '1', '-l', '1', pdfPath, outPrefix], { stdio: 'ignore' });
        proc.on('error', reject);
        proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`pdftoppm exit ${code}`)));
      });
      const candidates = [`${outPrefix}-1.jpg`, `${outPrefix}-01.jpg`];
      for (const c of candidates) if (fs.existsSync(c)) return c;
    } catch (err) {
      if (backend === 'poppler') { console.warn('[pdf] poppler failed:', err.message); return null; }
    }
  }

  if (backend === 'pdfjs' || backend === 'auto') {
    try {
      const sharpMod = getSharp();
      if (!sharpMod) return null;
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
      const data = new Uint8Array(await fsp.readFile(pdfPath));
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      const canvasFactory = {
        create(w, h) {
          return { canvas: { width: w, height: h }, context: { fillStyle: '#fff', fillRect() {} } };
        },
        reset(c, w, h) { c.canvas.width = w; c.canvas.height = h; },
        destroy() {},
      };
      // pdfjs-dist can render via node-canvas; if unavailable, fall back to a light-weight placeholder.
      try {
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
        const out = `${outBase}-1.jpg`;
        await fsp.writeFile(out, canvas.toBuffer('image/jpeg'));
        return out;
      } catch {
        // node-canvas not installed — skip. Admin can retry after installing it.
        return null;
      } finally { if (canvasFactory.destroy) canvasFactory.destroy(); }
    } catch (err) {
      console.warn('[pdf] pdfjs fallback failed:', err.message);
    }
  }
  return null;
}

async function buildImageVariants(srcPath, outBase) {
  const sharpMod = getSharp();
  if (!sharpMod) return { full: path.basename(srcPath) };
  const variants = {};
  try {
    await sharpMod(srcPath).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${outBase}-full.webp`);
    variants.full = path.basename(`${outBase}-full.webp`);
  } catch (e) { console.warn('[img] full variant failed:', e.message); }
  try {
    await sharpMod(srcPath).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 70 }).toFile(`${outBase}-thumb.webp`);
    variants.thumb = path.basename(`${outBase}-thumb.webp`);
  } catch (e) { console.warn('[img] thumb variant failed:', e.message); }
  try {
    await sharpMod(srcPath).resize({ width: 1200, height: 630, fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toFile(`${outBase}-og.jpg`);
    variants.og = path.basename(`${outBase}-og.jpg`);
  } catch (e) { console.warn('[img] og variant failed:', e.message); }
  return variants;
}

function storageKeyFor(file) { return path.basename(file.path); }

function variantFilePath(variantName) {
  if (!variantName) return null;
  const p = path.join(UPLOAD_DIR, variantName);
  return p.startsWith(UPLOAD_DIR) ? p : null;
}

function safeJson(str, fallback) {
  if (!str) return fallback;
  try { return typeof str === 'string' ? JSON.parse(str) : str; }
  catch { return fallback; }
}

// ── Config overrides: DB-backed edits layered on top of config.js ───────────
const CONFIG_KEY_ALLOWLIST = new Set([
  'event', 'events', 'hosts', 'guestSegments', 'groups',
  'copy', 'features', 'rsvp', 'theme', 'messaging', 'defaults', 'assetRoles',
  'themePresetActive',
]);

function isPlainObject(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

function deepMerge(base, override) {
  if (Array.isArray(override)) return override.slice();
  if (!isPlainObject(override)) return override;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : deepMerge(out[k], v);
  }
  return out;
}

async function loadOverrides() {
  const rows = await dbAll(`SELECT key, value_json FROM config_overrides`);
  const overrides = {};
  for (const row of rows) {
    if (!CONFIG_KEY_ALLOWLIST.has(row.key)) continue;
    overrides[row.key] = safeJson(row.value_json, null);
  }
  return overrides;
}

async function mergedConfig() {
  const overrides = await loadOverrides();
  const merged = { ...CONFIG };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] == null) continue;
    merged[key] = deepMerge(CONFIG[key], overrides[key]);
  }
  // Legacy shim: if registries[] is empty but the old single giftRegistry
  // string is set, wrap it so the new multi-registry renderer still shows
  // it. Never written back — just synthesized on read.
  if (merged.event && (!Array.isArray(merged.event.registries) || !merged.event.registries.length)
      && merged.event.giftRegistry) {
    const label = (merged.copy && merged.copy.giftRegistryLink) || 'Gift Registry';
    merged.event = { ...merged.event, registries: [{ label, url: merged.event.giftRegistry, note: '' }] };
  }
  return merged;
}

// Resolve the active preset + custom token overlay into a single bundle the
// client applies as CSS custom properties. The "Custom" overlay is the
// legacy `cfg.theme` block — any non-empty field overrides the preset token.
function resolveTheme(cfg) {
  const presets  = Array.isArray(cfg.themePresets) ? cfg.themePresets : [];
  const wantedId = cfg.themePresetActive || (presets[0] && presets[0].id);
  const preset   = presets.find((p) => p.id === wantedId) || presets[0] || null;

  // Compact picker metadata — never leaks the full token bundle for inactive
  // presets (small, JSON-serializable, safe to ship to public clients).
  const choices = presets.map((p) => ({
    id:     p.id,
    label:  p.label,
    hint:   p.hint || '',
    swatch: Array.isArray(p.swatch) ? p.swatch.slice(0, 3) : [],
  }));

  if (!preset) {
    return { active: null, choices, tokens: {}, fontHref: '' };
  }

  const baseTokens = { ...(preset.tokens || {}) };
  const overlay    = cfg.theme || {};
  for (const [k, v] of Object.entries(overlay)) {
    if (v != null && v !== '') baseTokens[k] = v;
  }

  return {
    active:   preset.id,
    label:    preset.label,
    fontHref: preset.fontHref || '',
    tokens:   baseTokens,
    choices,
  };
}

// Accept date-only (YYYY-MM-DD), date+time (YYYY-MM-DDTHH:MM[:SS]),
// or full ISO 8601 with Z / offset. Empty string is allowed (means "unset").
const ISO_DATE_RE = /^(?:\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
function isValidIsoDate(value) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  if (!ISO_DATE_RE.test(value)) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

// Resolve the deadline timestamp the RSVP lock is measured against:
// rsvpDeadlineISO wins, then dateISO. Returns null if neither parses.
function resolveDeadlineMs(event) {
  const candidate = (event && (event.rsvpDeadlineISO || event.dateISO)) || '';
  if (!candidate) return null;
  const t = Date.parse(candidate);
  return Number.isFinite(t) ? t : null;
}

function isRsvpClosed(cfg) {
  if (!cfg || !cfg.rsvp || !cfg.rsvp.lockAfterDeadline) return false;
  const deadline = resolveDeadlineMs(cfg.event || {});
  return deadline != null && Date.now() > deadline;
}

function assetToPublic(row) {
  const variants = safeJson(row.variants_json, {});
  const variantNames = Object.keys(variants);
  return {
    id:         row.id,
    role:       row.role || '',
    hostSlug:   row.host_slug || '',
    filename:   row.original_filename,
    mime:       row.mime,
    size:       Number(row.size_bytes || 0),
    pageCount:  Number(row.page_count || 1),
    variants:   variantNames,
    url:        `/api/asset/${row.id}/full`,
    thumbUrl:   variants.thumb ? `/api/asset/${row.id}/thumb` : `/api/asset/${row.id}/full`,
    ogUrl:      variants.og    ? `/api/asset/${row.id}/og`    : `/api/asset/${row.id}/full`,
    createdAt:  row.created_at,
  };
}

// ── Routes: public ──────────────────────────────────────────────────────────
app.get('/api/bootstrap', async (_req, res) => {
  try {
    const cfg   = await mergedConfig();
    const theme = resolveTheme(cfg);
    res.json({
      ok: true,
      appVersion: cfg.appVersion,
      copy:       cfg.copy,
      features:   cfg.features,
      theme,
      requiresPin: Boolean(cfg.pin),
      assetRoles: cfg.assetRoles,
      defaults:   cfg.defaults,
      rsvpFields: cfg.rsvp.fields,
      rsvpStatusOptions: cfg.rsvp.statusOptions,
      groups:     cfg.groups,
      segments:   cfg.guestSegments,
      hosts:      cfg.hosts,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/i/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.redirect('/invite.html');
  res.redirect(`/invite.html?token=${encodeURIComponent(token)}`);
});

app.get('/admin', (_req, res) => res.redirect('/admin.html'));

// Asset binary serve (public — assets are referenced by invite token holders)
app.get('/api/asset/:id/:variant', async (req, res) => {
  const id = Number(req.params.id);
  const variant = String(req.params.variant || 'full');
  if (!Number.isFinite(id)) return res.status(400).end();
  const row = await dbGet(
    `SELECT * FROM assets WHERE id=?`,
    `SELECT * FROM assets WHERE id=$1`,
    [id]
  );
  if (!row) return res.status(404).end();

  const variants = safeJson(row.variants_json, {});
  const filename = variants[variant] || (variant === 'full' ? row.storage_key : variants.full) || row.storage_key;
  const filePath = variantFilePath(filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).end();

  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  return res.sendFile(filePath);
});

// Public invite payload — zero hardcoded strings in the HTML, everything here.
app.get('/api/public-invite', async (req, res) => {
  const token = String(req.query.token || '').trim();
  try {
    let guest = null;
    if (token) {
      const row = await dbGet(
        `SELECT * FROM guests WHERE invite_token=?`,
        `SELECT * FROM guests WHERE invite_token=$1`,
        [token]
      );
      if (row) {
        guest = guestToFrontend(row);
        await logRsvpEvent(row.id, 'viewed', req);
      }
    }

    const assets = await loadAssetsByRole();
    const cfg = await mergedConfig();
    const theme = resolveTheme(cfg);
    res.json({
      ok: true,
      event:      cfg.event,
      events:     cfg.events,
      hosts:      cfg.hosts,
      segments:   cfg.guestSegments,
      features:   cfg.features,
      copy:       cfg.copy,
      theme,
      rsvp:       { fields: cfg.rsvp.fields, statusOptions: cfg.rsvp.statusOptions, allowSelfEdit: cfg.rsvp.allowSelfEdit, submittedCopy: cfg.rsvp.submittedCopy, lockAfterDeadline: cfg.rsvp.lockAfterDeadline },
      assets,
      guest,
      guestFound: Boolean(guest),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function loadAssetsByRole() {
  const rows = await dbAll(`SELECT * FROM assets ORDER BY sort_order ASC, id ASC`);
  const byRole = {};
  const byHost = {};
  for (const row of rows) {
    const pub = assetToPublic(row);
    if (row.role) (byRole[row.role] ||= []).push(pub);
    if (row.host_slug) (byHost[row.host_slug] ||= []).push(pub);
  }
  return { byRole, byHost, all: rows.map(assetToPublic) };
}

// Public RSVP (rate-limited). Accepts new or existing invite token.
app.post('/api/rsvp', rateLimit(CONFIG.rateLimits.publicRsvpPerMin), async (req, res) => {
  let cfg;
  try { cfg = await mergedConfig(); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }

  const closedCopy = (cfg.copy && cfg.copy.rsvpClosed) || CONFIG.copy.rsvpClosed;
  if (!cfg.features || !cfg.features.publicRsvp) {
    return res.status(403).json({ ok: false, error: closedCopy });
  }
  if (isRsvpClosed(cfg)) {
    return res.status(403).json({ ok: false, error: closedCopy });
  }

  const { token = '', name, phone = '', email = '', partySize = 1, segment = '',
          rsvp = 'Attending', notes = '', dietary = '', eventSelections = [],
          partyMembers = [] } = req.body || {};

  if (!String(name || '').trim()) return res.status(400).json({ ok: false, error: 'Name required' });

  try {
    const trimmedToken = String(token || '').trim();
    const normalized = normalizeEventSelections(eventSelections);
    const nextPartySize = String(rsvp) === 'Declined' ? 0 : Math.max(0, Number(partySize) || 0);
    // Plus-one names: keep only non-empty trimmed strings, cap at partySize-1
    // so we never outnumber the declared party.
    const cleanedPartyMembers = Array.isArray(partyMembers)
      ? partyMembers.map(s => String(s || '').trim()).filter(Boolean).slice(0, Math.max(0, nextPartySize - 1))
      : [];
    const partyMembersJson = JSON.stringify(cleanedPartyMembers);
    const allowSelfEdit = cfg.rsvp && cfg.rsvp.allowSelfEdit !== false;

    if (trimmedToken) {
      const guest = await dbGet(
        `SELECT * FROM guests WHERE invite_token=?`,
        `SELECT * FROM guests WHERE invite_token=$1`,
        [trimmedToken]
      );
      if (guest) {
        if (!allowSelfEdit && guest.rsvp && guest.rsvp !== 'Pending') {
          return res.status(403).json({ ok: false, error: 'Your response is locked. Contact the host to make changes.' });
        }
        await dbRun(
          `UPDATE guests SET guest_name=?, mobile_number=?, email_address=?, segment=?, rsvp=?, confirmed_party_size=?, notes=?, dietary=?, event_selections=?, party_members=?, invite_status='Sent' WHERE invite_token=?`,
          `UPDATE guests SET guest_name=$1, mobile_number=$2, email_address=$3, segment=$4, rsvp=$5, confirmed_party_size=$6, notes=$7, dietary=$8, event_selections=$9, party_members=$10, invite_status='Sent' WHERE invite_token=$11`,
          [String(name).trim(), String(phone || guest.mobile_number).trim(), String(email || guest.email_address).trim(),
           String(segment || guest.segment).trim(), rsvp, nextPartySize, String(notes).trim(), String(dietary).trim(),
           JSON.stringify(normalized), partyMembersJson, trimmedToken]
        );
        await logRsvpEvent(guest.id, 'submitted', req);
        const updated = await dbGet(
          `SELECT * FROM guests WHERE invite_token=?`,
          `SELECT * FROM guests WHERE invite_token=$1`,
          [trimmedToken]
        );
        return res.json({ ok: true, guest: guestToFrontend(updated) });
      }
    }

    // Fallback: new public RSVP (no pre-existing token)
    const fallbackToken = makeInviteToken();
    await dbRun(
      `INSERT INTO guests (guest_group, guest_name, mobile_number, email_address, added_by_name, added_by_initials, party_size, segment, rsvp, confirmed_party_size, notes, dietary, event_selections, party_members, invite_status, source, invite_token) VALUES ('', ?, ?, ?, 'Public RSVP', 'PR', ?, ?, ?, ?, ?, ?, ?, ?, 'Sent', 'website', ?)`,
      `INSERT INTO guests (guest_group, guest_name, mobile_number, email_address, added_by_name, added_by_initials, party_size, segment, rsvp, confirmed_party_size, notes, dietary, event_selections, party_members, invite_status, source, invite_token) VALUES ('', $1, $2, $3, 'Public RSVP', 'PR', $4, $5, $6, $7, $8, $9, $10, $11, 'Sent', 'website', $12)`,
      [String(name).trim(), String(phone).trim(), String(email).trim(),
       Math.max(1, Number(partySize) || 1), String(segment).trim(), rsvp, nextPartySize,
       String(notes).trim(), String(dietary).trim(), JSON.stringify(normalized), partyMembersJson, fallbackToken]
    );
    const inserted = await dbGet(
      `SELECT * FROM guests WHERE invite_token=?`,
      `SELECT * FROM guests WHERE invite_token=$1`,
      [fallbackToken]
    );
    await logRsvpEvent(inserted?.id, 'submitted', req);
    res.json({ ok: true, guest: guestToFrontend(inserted) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Routes: admin ───────────────────────────────────────────────────────────
app.post('/api/validate-pin', rateLimit(CONFIG.rateLimits.validatePinPerMin), async (req, res) => {
  const { pin } = req.body || {};
  if (!CONFIG.pin) return res.json({ ok: true, token: 'no-pin-needed' });

  const lock = pinLockState(req);
  if (lock.locked) {
    const minutes = Math.ceil(lock.retryAfterMs / 60_000);
    res.setHeader('Retry-After', String(Math.ceil(lock.retryAfterMs / 1000)));
    return res.status(429).json({
      ok: false,
      error: `Too many failed attempts. Locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
    });
  }

  if (String(pin) !== String(CONFIG.pin)) {
    recordPinFailure(req);
    return res.status(401).json({ ok: false, error: 'Wrong PIN' });
  }

  clearPinFailures(req);
  const token = crypto.randomBytes(32).toString('hex');
  await dbRun(
    `INSERT INTO sessions (token) VALUES (?)`,
    `INSERT INTO sessions (token) VALUES ($1)`,
    [token]
  );
  res.json({ ok: true, token });
});

app.post('/api/logout', requireAuth, async (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token) {
    await dbRun(
      `DELETE FROM sessions WHERE token=?`,
      `DELETE FROM sessions WHERE token=$1`,
      [token]
    );
  }
  res.json({ ok: true });
});

// Config: read merged config for the admin form
app.get('/api/config', requireAuth, async (_req, res) => {
  try {
    const cfg   = await mergedConfig();
    const theme = resolveTheme(cfg);
    res.json({ ok: true, config: {
      event: cfg.event, events: cfg.events, hosts: cfg.hosts,
      guestSegments: cfg.guestSegments, groups: cfg.groups,
      copy: cfg.copy, features: cfg.features, rsvp: cfg.rsvp,
      theme: cfg.theme, messaging: cfg.messaging, defaults: cfg.defaults,
      themePresetActive: cfg.themePresetActive,
      themePresets:      theme.choices,
      themePresetsFull: (cfg.themePresets || []).map((p) => ({
        id: p.id, label: p.label, hint: p.hint || '',
        swatch: Array.isArray(p.swatch) ? p.swatch.slice(0, 3) : [],
        fontHref: p.fontHref || '', tokens: p.tokens || {},
      })),
    }});
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Config: upsert overrides (whitelist of keys)
app.put('/api/config', requireAuth, async (req, res) => {
  try {
    const patch = (req.body && req.body.config) || req.body || {};
    if (!isPlainObject(patch)) return res.status(400).json({ ok: false, error: 'config must be an object' });

    if (isPlainObject(patch.event)) {
      if (!isValidIsoDate(patch.event.dateISO)) {
        return res.status(400).json({ ok: false, error: 'event.dateISO must be ISO 8601 (e.g. 2026-09-12 or 2026-09-12T18:00:00Z)' });
      }
      if (!isValidIsoDate(patch.event.rsvpDeadlineISO)) {
        return res.status(400).json({ ok: false, error: 'event.rsvpDeadlineISO must be ISO 8601 (e.g. 2026-08-15)' });
      }
    }

    const accepted = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!CONFIG_KEY_ALLOWLIST.has(key)) continue;
      const json = JSON.stringify(value ?? null);
      await dbRun(
        `INSERT INTO config_overrides (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=CURRENT_TIMESTAMP`,
        `INSERT INTO config_overrides (key, value_json, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=CURRENT_TIMESTAMP`,
        [key, json]
      );
      accepted.push(key);
    }
    const cfg = await mergedConfig();
    res.json({ ok: true, accepted, config: cfg });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Assets: list
app.get('/api/assets', requireAuth, async (_req, res) => {
  const rows = await dbAll(`SELECT * FROM assets ORDER BY sort_order ASC, id ASC`);
  res.json({ ok: true, assets: rows.map(assetToPublic) });
});

// Assets: upload
app.post('/api/assets', requireAuth, async (req, res) => {
  if (!CONFIG.features.assetUpload) return res.status(403).json({ ok: false, error: 'Asset upload disabled' });
  // Honour the runtime videoUpload flag so admins can disable video without
  // restarting. Static `CONFIG.uploads.allowedMime` stays the upper bound.
  let videoAllowed = CONFIG.features.videoUpload !== false;
  try {
    const cfg = await mergedConfig();
    if (cfg && cfg.features && Object.prototype.hasOwnProperty.call(cfg.features, 'videoUpload')) {
      videoAllowed = cfg.features.videoUpload !== false;
    }
  } catch { /* fall back to static CONFIG */ }
  req._allowedMime = videoAllowed
    ? CONFIG.uploads.allowedMime
    : CONFIG.uploads.allowedMime.filter((m) => !m.startsWith('video/'));

  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });

    const role     = String(req.body.role || '').trim();
    const hostSlug = String(req.body.hostSlug || '').trim().toLowerCase();
    if (role && !CONFIG.assetRoles.includes(role)) {
      return res.status(400).json({ ok: false, error: `Unknown role: ${role}. Allowed: ${CONFIG.assetRoles.join(', ')}` });
    }

    const mime = req.file.mimetype;
    const storageKey = storageKeyFor(req.file);
    const outBase = path.join(UPLOAD_DIR, path.parse(storageKey).name);
    let variants = {};
    let pageCount = 1;

    try {
      if (mime === 'application/pdf') {
        const rendered = await rasterizePdfFirstPage(req.file.path, outBase);
        if (rendered) {
          const renderedVariants = await buildImageVariants(rendered, `${outBase}-page1`);
          variants = { original: storageKey, ...renderedVariants };
          try { await fsp.unlink(rendered); } catch {}
        } else {
          variants = { original: storageKey };
        }
        pageCount = await countPdfPages(req.file.path).catch(() => 1);
      } else if (mime.startsWith('image/')) {
        variants = await buildImageVariants(req.file.path, outBase);
        if (!variants.full) variants = { full: storageKey };
      } else if (mime.startsWith('video/')) {
        variants = { full: storageKey };
      } else {
        variants = { full: storageKey };
      }

      // Enforce singleton roles (one 'hero', etc.) by replacing.
      if (role === 'hero' || role === 'background') {
        await dbRun(
          `DELETE FROM assets WHERE role=?`,
          `DELETE FROM assets WHERE role=$1`,
          [role]
        );
      }
      // Enforce one asset per host slug (if provided)
      if (hostSlug) {
        await dbRun(
          `DELETE FROM assets WHERE host_slug=?`,
          `DELETE FROM assets WHERE host_slug=$1`,
          [hostSlug]
        );
      }

      const result = pg
        ? await pg.query(
            `INSERT INTO assets (role, host_slug, original_filename, mime, size_bytes, page_count, storage_key, variants_json)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [role, hostSlug, req.file.originalname, mime, req.file.size, pageCount, storageKey, JSON.stringify(variants)]
          )
        : sqlite.prepare(
            `INSERT INTO assets (role, host_slug, original_filename, mime, size_bytes, page_count, storage_key, variants_json) VALUES (?,?,?,?,?,?,?,?)`
          ).run(role, hostSlug, req.file.originalname, mime, req.file.size, pageCount, storageKey, JSON.stringify(variants));
      const id = pg ? result.rows[0].id : result.lastInsertRowid;

      const row = await dbGet(`SELECT * FROM assets WHERE id=?`, `SELECT * FROM assets WHERE id=$1`, [id]);
      res.json({ ok: true, asset: assetToPublic(row) });
    } catch (e) {
      try { await fsp.unlink(req.file.path); } catch {}
      res.status(500).json({ ok: false, error: e.message });
    }
  });
});

async function countPdfPages(pdfPath) {
  try {
    const buf = await fsp.readFile(pdfPath);
    const matches = buf.toString('latin1').match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 1;
  } catch { return 1; }
}

// Assets: re-tag role (singleton roles get the same delete-then-set treatment
// as upload time so there is always at most one `hero` / `background`).
app.patch('/api/assets/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
  const { role } = req.body || {};
  const nextRole = String(role ?? '').trim();
  if (nextRole && !CONFIG.assetRoles.includes(nextRole)) {
    return res.status(400).json({ ok: false, error: `Unknown role: ${nextRole}. Allowed: ${CONFIG.assetRoles.concat(['']).join(', ')}` });
  }
  const row = await dbGet(`SELECT * FROM assets WHERE id=?`, `SELECT * FROM assets WHERE id=$1`, [id]);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found' });

  try {
    if (nextRole === 'hero' || nextRole === 'background') {
      await dbRun(
        `DELETE FROM assets WHERE role=? AND id<>?`,
        `DELETE FROM assets WHERE role=$1 AND id<>$2`,
        [nextRole, id]
      );
    }
    await dbRun(
      `UPDATE assets SET role=? WHERE id=?`,
      `UPDATE assets SET role=$1 WHERE id=$2`,
      [nextRole, id]
    );
    const updated = await dbGet(`SELECT * FROM assets WHERE id=?`, `SELECT * FROM assets WHERE id=$1`, [id]);
    res.json({ ok: true, asset: assetToPublic(updated) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Assets: delete
app.delete('/api/assets/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
  const row = await dbGet(`SELECT * FROM assets WHERE id=?`, `SELECT * FROM assets WHERE id=$1`, [id]);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
  const variants = safeJson(row.variants_json, {});
  const files = [row.storage_key, ...Object.values(variants)].filter(Boolean);
  for (const f of files) {
    const p = variantFilePath(f);
    if (p && fs.existsSync(p)) { try { await fsp.unlink(p); } catch {} }
  }
  await dbRun(`DELETE FROM assets WHERE id=?`, `DELETE FROM assets WHERE id=$1`, [id]);
  res.json({ ok: true });
});

// Guests CRUD
app.post('/api/guests', requireAuth, async (req, res) => {
  if (!CONFIG.features.guestManager) return res.status(403).json({ ok: false, error: 'Guest manager disabled' });
  const {
    guestGroup = '', guestName, mobileNumber = '', emailAddress = '',
    addedByName = '', addedByInitials = '', partySize = 1,
    segment = '', notes = '',
  } = req.body || {};
  if (!String(guestName || '').trim()) return res.status(400).json({ ok: false, error: 'Guest name required' });
  try {
    const inviteToken = makeInviteToken();
    const result = pg
      ? await pg.query(
          `INSERT INTO guests (guest_group, guest_name, mobile_number, email_address, added_by_name, added_by_initials, party_size, segment, notes, invite_token)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, invite_token`,
          [String(guestGroup).trim(), String(guestName).trim(), String(mobileNumber).trim(), String(emailAddress).trim(),
           String(addedByName).trim(), String(addedByInitials).trim(), Math.max(1, Number(partySize) || 1),
           String(segment).trim(), String(notes).trim(), inviteToken]
        )
      : sqlite.prepare(
          `INSERT INTO guests (guest_group, guest_name, mobile_number, email_address, added_by_name, added_by_initials, party_size, segment, notes, invite_token) VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).run(String(guestGroup).trim(), String(guestName).trim(), String(mobileNumber).trim(), String(emailAddress).trim(),
              String(addedByName).trim(), String(addedByInitials).trim(), Math.max(1, Number(partySize) || 1),
              String(segment).trim(), String(notes).trim(), inviteToken);
    const id = pg ? result.rows[0].id : result.lastInsertRowid;
    res.json({ ok: true, id, inviteToken });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/guests', requireAuth, async (req, res) => {
  const { search, guestGroup, segment, inviteStatus, rsvp, followUpOnly, source, addedByName } = req.query;
  let q = 'SELECT * FROM guests WHERE 1=1';
  let pgQ = q;
  const p = [];
  const and = (sqliteClause, pgClause, value) => { q += ' ' + sqliteClause; pgQ += ' ' + pgClause; if (value !== undefined) p.push(value); };
  if (search) {
    const s = `%${search}%`;
    const n = () => sqlParam(p.length + 1);
    const a = n(); p.push(s);
    const b = n(); p.push(s);
    const c = n(); p.push(s);
    const d = n(); p.push(s);
    q   += ` AND (guest_name LIKE ${a} OR guest_group LIKE ${b} OR notes LIKE ${c} OR mobile_number LIKE ${d})`;
    pgQ += ` AND (guest_name ILIKE ${a} OR guest_group ILIKE ${b} OR notes ILIKE ${c} OR mobile_number ILIKE ${d})`;
  }
  if (guestGroup)   and(`AND guest_group=${sqlParam(p.length+1)}`, `AND guest_group=${sqlParam(p.length+1)}`, guestGroup);
  if (segment)      and(`AND segment=${sqlParam(p.length+1)}`,     `AND segment=${sqlParam(p.length+1)}`,     segment);
  if (inviteStatus) and(`AND invite_status=${sqlParam(p.length+1)}`, `AND invite_status=${sqlParam(p.length+1)}`, inviteStatus);
  if (rsvp)         and(`AND rsvp=${sqlParam(p.length+1)}`,         `AND rsvp=${sqlParam(p.length+1)}`,         rsvp);
  if (source)       and(`AND source=${sqlParam(p.length+1)}`,       `AND source=${sqlParam(p.length+1)}`,       source);
  if (addedByName)  and(`AND added_by_name=${sqlParam(p.length+1)}`, `AND added_by_name=${sqlParam(p.length+1)}`, addedByName);
  if (followUpOnly === 'true') and('AND follow_up=1', 'AND follow_up=1');
  q += ' ORDER BY id ASC';
  pgQ += ' ORDER BY id ASC';
  try {
    const rows = await dbAll(q, pgQ, p);
    res.json({ ok: true, rows: rows.map(guestToFrontend), appVersion: CONFIG.appVersion });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const FIELD_MAP = {
  guestGroup:         'guest_group',
  guestName:          'guest_name',
  mobileNumber:       'mobile_number',
  emailAddress:       'email_address',
  addedByName:        'added_by_name',
  addedByInitials:    'added_by_initials',
  partySize:          'party_size',
  segment:            'segment',
  inviteStatus:       'invite_status',
  rsvp:               'rsvp',
  confirmedPartySize: 'confirmed_party_size',
  followUp:           'follow_up',
  notes:              'notes',
  dietary:            'dietary',
};

app.put('/api/guests/:id', requireAuth, async (req, res) => {
  const { field, value } = req.body || {};
  const col = FIELD_MAP[field];
  if (!col) return res.status(400).json({ ok: false, error: `Unknown field: ${field}` });
  const val = field === 'followUp' ? (value ? 1 : 0) : value;
  let extra = '', extraVals = [];
  if (field === 'inviteStatus' && value && value !== 'Not Sent') {
    extra = `, invite_sent_date=${sqlParam(2)}`;
    extraVals = [new Date().toISOString()];
  }
  try {
    const params = [val, ...extraVals, req.params.id];
    const idParam = sqlParam(params.length);
    const sql = `UPDATE guests SET ${col}=${sqlParam(1)}${extra} WHERE id=${idParam}`;
    await dbRun(sql, sql, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/guests/:id', requireAuth, async (req, res) => {
  try {
    await dbRun(
      `DELETE FROM guests WHERE id=?`,
      `DELETE FROM guests WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Stats
app.get('/api/stats', requireAuth, async (_req, res) => {
  try {
    const total     = await dbGet(`SELECT COUNT(*) as c FROM guests`);
    const attending = await dbGet(`SELECT COUNT(*) as c FROM guests WHERE rsvp='Attending'`);
    const declined  = await dbGet(`SELECT COUNT(*) as c FROM guests WHERE rsvp='Declined'`);
    const pending   = await dbGet(`SELECT COUNT(*) as c FROM guests WHERE rsvp='Pending'`);
    const notSent   = await dbGet(`SELECT COUNT(*) as c FROM guests WHERE invite_status='Not Sent'`);
    const totalSeats = await dbGet(`SELECT SUM(party_size) as c FROM guests`);
    const attendingSeats = await dbGet(`SELECT SUM(COALESCE(confirmed_party_size, party_size)) as c FROM guests WHERE rsvp='Attending'`);
    let views = 0, submissions = 0;
    if (CONFIG.features.viewAnalytics) {
      const v = await dbGet(`SELECT COUNT(*) as c FROM rsvp_events WHERE action='viewed'`);
      const s = await dbGet(`SELECT COUNT(*) as c FROM rsvp_events WHERE action='submitted'`);
      views = Number(v?.c || 0);
      submissions = Number(s?.c || 0);
    }
    res.json({
      ok: true,
      total: Number(total?.c || 0),
      attending: Number(attending?.c || 0),
      declined: Number(declined?.c || 0),
      pending: Number(pending?.c || 0),
      notSent: Number(notSent?.c || 0),
      totalSeats: Number(totalSeats?.c || 0),
      attendingSeats: Number(attendingSeats?.c || 0),
      views,
      submissions,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// CSV export
app.get('/api/export.csv', requireAuth, async (_req, res) => {
  if (!CONFIG.features.csvExport) return res.status(403).send('CSV export disabled');
  try {
    const rows = await dbAll('SELECT * FROM guests ORDER BY id');
    const header = ['ID','Name','Group','Segment','Party','Mobile','Email','Invite','Invite Sent','RSVP','Confirmed','Dietary','Notes','Attending Events','Maybe Events','Declined Events','Follow Up','Source','Invite Token','Created'];
    const lines = [header.map(csvQ).join(',')];
    for (const r of rows) {
      const sel = parseEventSelections(r.event_selections);
      const pick = (s) => sel.filter(x => x.status === s).map(x => x.name).join('; ');
      lines.push([
        r.id, csvQ(r.guest_name), csvQ(r.guest_group), csvQ(r.segment), r.party_size,
        csvQ(r.mobile_number), csvQ(r.email_address),
        csvQ(r.invite_status), csvQ(r.invite_sent_date || ''),
        csvQ(r.rsvp), r.confirmed_party_size ?? '',
        csvQ(r.dietary), csvQ(r.notes),
        csvQ(pick('attending')), csvQ(pick('maybe')), csvQ(pick('declined')),
        r.follow_up ? 'Yes' : 'No',
        csvQ(r.source), csvQ(r.invite_token), csvQ(r.created_at),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="guests-${Date.now()}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (e) { res.status(500).send(`Error: ${e.message}`); }
});

// JSON backup (full snapshot — guests + assets + rsvp_events)
app.get('/api/export.json', requireAuth, async (_req, res) => {
  if (!CONFIG.features.jsonBackup) return res.status(403).json({ ok: false, error: 'JSON backup disabled' });
  try {
    const guests = await dbAll('SELECT * FROM guests ORDER BY id');
    const assets = await dbAll('SELECT * FROM assets ORDER BY id');
    const events = await dbAll('SELECT * FROM rsvp_events ORDER BY id');
    res.json({ ok: true, exportedAt: new Date().toISOString(), appVersion: CONFIG.appVersion, guests, assets, events });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// JSON restore (replace guests + assets; does not touch files on disk)
app.post('/api/import.json', requireAuth, async (req, res) => {
  if (!CONFIG.features.jsonBackup) return res.status(403).json({ ok: false, error: 'JSON restore disabled' });
  const { guests = [], wipeFirst = false } = req.body || {};
  if (!Array.isArray(guests)) return res.status(400).json({ ok: false, error: 'guests[] required' });
  try {
    if (wipeFirst) await dbRun(`DELETE FROM guests`);
    let imported = 0;
    for (const g of guests) {
      await dbRun(
        `INSERT INTO guests (guest_group, guest_name, mobile_number, email_address, added_by_name, added_by_initials, party_size, segment, invite_status, rsvp, confirmed_party_size, follow_up, notes, dietary, event_selections, source, invite_token)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `INSERT INTO guests (guest_group, guest_name, mobile_number, email_address, added_by_name, added_by_initials, party_size, segment, invite_status, rsvp, confirmed_party_size, follow_up, notes, dietary, event_selections, source, invite_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [g.guest_group || g.guestGroup || '', g.guest_name || g.guestName || 'Unnamed',
         g.mobile_number || g.mobileNumber || '', g.email_address || g.emailAddress || '',
         g.added_by_name || g.addedByName || '', g.added_by_initials || g.addedByInitials || '',
         Number(g.party_size || g.partySize || 1),
         g.segment || '',
         g.invite_status || g.inviteStatus || 'Not Sent',
         g.rsvp || 'Pending',
         g.confirmed_party_size ?? g.confirmedPartySize ?? null,
         (g.follow_up || g.followUp) ? 1 : 0,
         g.notes || '', g.dietary || '',
         typeof g.event_selections === 'string' ? g.event_selections : JSON.stringify(g.event_selections || g.eventSelections || []),
         g.source || 'import',
         g.invite_token || g.inviteToken || makeInviteToken()]
      );
      imported += 1;
    }
    await backfillInviteTokens();
    res.json({ ok: true, imported });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function guestToFrontend(r) {
  if (!r) return null;
  return {
    id:                 r.id,
    guestGroup:         r.guest_group,
    guestName:          r.guest_name,
    mobileNumber:       r.mobile_number,
    emailAddress:       r.email_address,
    addedByName:        r.added_by_name,
    addedByInitials:    r.added_by_initials,
    partySize:          r.party_size,
    segment:            r.segment,
    inviteStatus:       r.invite_status,
    inviteSentDate:     r.invite_sent_date,
    rsvp:               r.rsvp,
    confirmedPartySize: r.confirmed_party_size,
    followUp:           Boolean(r.follow_up),
    notes:              r.notes,
    dietary:            r.dietary,
    eventSelections:    parseEventSelections(r.event_selections),
    partyMembers:       parsePartyMembers(r.party_members),
    source:             r.source,
    inviteToken:        r.invite_token,
    createdAt:          r.created_at,
  };
}

function parseEventSelections(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeEventSelections(parsed);
  } catch { return []; }
}

function parsePartyMembers(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(s => String(s || '').trim()).filter(Boolean);
  } catch { return []; }
}

function normalizeEventSelections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: String(item?.id || item?.name || '').trim(),
      name: String(item?.name || item?.id || '').trim(),
      status: String(item?.status || '').trim().toLowerCase(),
    }))
    .filter((item) => item.name && ['attending', 'maybe', 'declined'].includes(item.status));
}

function csvQ(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Start ───────────────────────────────────────────────────────────────────
function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nInvite App listening on :${PORT}`);
    console.log(`  Database  →  ${pg ? 'Postgres' : 'SQLite'}`);
    console.log(`  Uploads   →  ${UPLOAD_DIR}\n`);
  });

  initDb()
    .then(() => backfillInviteTokens())
    .then(() => console.log('DB ready'))
    .catch((err) => console.error('DB init failed:', err));
}

if (require.main === module) {
  start();
}

module.exports = { app, start, CONFIG };
