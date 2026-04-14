import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);

test('server.js parses', () => {
  const src = readFileSync(resolve(root, 'server.js'), 'utf8');
  assert.ok(src.length > 0);
  assert.ok(src.includes('/api/bootstrap'));
  assert.ok(src.includes('requireAuth'));
});

test('config.js has required top-level sections', () => {
  const cfg = require(resolve(root, 'config.js'));
  assert.ok(cfg.event, 'event missing');
  assert.ok(Array.isArray(cfg.events), 'events array missing');
  assert.ok(cfg.rsvp && cfg.rsvp.fields, 'rsvp.fields missing');
  assert.ok(cfg.features, 'features missing');
  assert.ok(cfg.copy, 'copy missing');
  assert.ok(cfg.theme, 'theme missing');
});

test('config golden rule: empty arrays are allowed', () => {
  const cfg = require(resolve(root, 'config.js'));
  assert.ok(Array.isArray(cfg.hosts || []));
  assert.ok(Array.isArray(cfg.guestSegments || []));
});

test('public HTML files exist', () => {
  assert.ok(existsSync(resolve(root, 'public/invite.html')));
  assert.ok(existsSync(resolve(root, 'public/admin.html')));
});

test('invite.html has no hardcoded event copy', () => {
  const html = readFileSync(resolve(root, 'public/invite.html'), 'utf8');
  assert.ok(!/wedding|bride|groom/i.test(html.replace(/data-copy-key="[^"]*"/g, '')),
    'invite.html should not contain wedding-specific copy outside data-copy-key attrs');
});
