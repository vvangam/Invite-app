'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Invite App configuration — the ONE file that controls everything.
//
// Golden rule: if a feature is `enabled: false` or an array is empty, the
// corresponding UI must not render. No placeholders, no empty headers, no
// dead buttons. The app should look like that feature simply doesn't exist.
//
// Every user-facing string lives under `copy.*`. Never hardcode text in HTML.
// ─────────────────────────────────────────────────────────────────────────────

const envList = (value) =>
  String(value || '').split('|').map((s) => s.trim()).filter(Boolean);

module.exports = {
  appVersion: '0.1.0',

  // PIN-gated admin. Set to '' (or unset) to disable the gate (dev only).
  pin: process.env.PIN || '1234',

  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,

  // ── Event identity ───────────────────────────────────────────────────────
  // Single-event mode if `events[]` below is empty. All strings optional.
  event: {
    title:        process.env.EVENT_TITLE        || 'Our Celebration',
    subtitle:     process.env.EVENT_SUBTITLE     || '',
    hostedBy:     process.env.EVENT_HOSTED_BY    || '',
    dateLabel:    process.env.EVENT_DATE_LABEL   || '',
    dateISO:      process.env.EVENT_DATE_ISO     || '',
    timeLabel:    process.env.EVENT_TIME_LABEL   || '',
    venue:        process.env.EVENT_VENUE        || '',
    address:      process.env.EVENT_ADDRESS      || '',
    city:         process.env.EVENT_CITY         || '',
    mapsUrl:      process.env.EVENT_MAPS_URL     || '',
    rsvpDeadline: process.env.RSVP_DEADLINE      || '',
    dressCode:    process.env.DRESS_CODE         || '',
    giftRegistry: process.env.GIFT_REGISTRY_URL  || '',
    contactEmail: process.env.CONTACT_EMAIL      || '',
    contactPhone: process.env.CONTACT_PHONE      || '',
  },

  // ── Sub-events (0 or many) ───────────────────────────────────────────────
  // Leave empty for single-event mode. UI collapses automatically.
  // Format:
  //   { id, name, dateLabel, dateISO, timeLabel, venue, address, city,
  //     mapsUrl, description, dressCode }
  events: [],

  // ── Hosts / sides (0 or many) ─────────────────────────────────────────────
  // Used for "hosted by" strip and for save-the-date variants.
  // Empty = no host UI.
  //   { id, label, slug, stdAssetSlug? }
  hosts: [],

  // ── Guest segments ────────────────────────────────────────────────────────
  // Groups of sub-events a guest is invited to. Empty = no segment picker.
  //   { id, label, includesEventIds: ['e1','e2'] }
  guestSegments: [],

  // ── Arbitrary group tags for admin filtering (e.g. Family / Friends) ─────
  groups: envList(process.env.GUEST_GROUPS),

  // ── RSVP form fields — every field toggleable ─────────────────────────────
  rsvp: {
    fields: {
      name:      { enabled: true,  required: true,  label: 'Your Name' },
      partySize: { enabled: true,  required: true,  label: 'Number Attending', max: 10 },
      perEvent:  { enabled: true,  required: false, label: 'Which events?' },
      dietary:   { enabled: false, required: false, label: 'Dietary preferences' },
      notes:     { enabled: false, required: false, label: 'Anything else?' },
    },
    statusOptions: ['Attending', 'Maybe', 'Declined'],
    submittedCopy: 'Thank you — we can\u2019t wait to celebrate with you.',
    allowSelfEdit: true,
    lockAfterDeadline: false,
  },

  // ── Feature flags. If false, UI / routes for that feature don't render. ──
  features: {
    assetUpload:    true,
    publicRsvp:     true,
    guestManager:   true,
    bulkMessaging:  true,
    saveTheDate:    false,
    pdfItinerary:   false,
    calendarExport: true,
    csvExport:      true,
    jsonBackup:     true,
    viewAnalytics:  true,
    darkMode:       true,
    videoUpload:    true,
  },

  // ── Copy overrides (every user-facing string) ────────────────────────────
  copy: {
    appName:            'Invite',
    inviteHeaderCta:    'You\u2019re Invited',
    rsvpHeader:         'RSVP',
    rsvpButton:         'Send RSVP',
    rsvpUpdateButton:   'Update Response',
    detailsHeader:      'Details',
    eventsHeader:       'Events',
    hostsHeader:        'Hosted By',
    contactHeader:      'Questions?',
    downloadItinerary:  'Download Itinerary',
    downloadCalendar:   'Add to Calendar',
    giftRegistryLink:   'Gift Registry',
    adminTitle:         'Event Admin',
    adminTabAssets:     'Assets',
    adminTabGuests:     'Guests',
    adminTabSend:       'Send',
    adminTabExports:    'Exports',
    heroFallback:       'We can\u2019t wait to celebrate with you.',
    rsvpClosed:         'RSVP is currently closed.',
    rsvpSubmitted:      'Your response has been recorded.',
    inviteNotFound:     'We couldn\u2019t find that invitation.',
  },

  // ── Theme (CSS custom properties, overridable via env) ───────────────────
  theme: {
    colorBg:     process.env.THEME_BG      || '#faf7f2',
    colorFg:     process.env.THEME_FG      || '#1a1a1a',
    colorAccent: process.env.THEME_ACCENT  || '#8b6f47',
    colorMuted:  process.env.THEME_MUTED   || '#6b6b6b',
    colorCard:   process.env.THEME_CARD    || 'rgba(255,255,255,0.7)',
    fontHeading: process.env.THEME_FONT_HEADING || '"Playfair Display", Georgia, serif',
    fontBody:    process.env.THEME_FONT_BODY    || '"Inter", system-ui, sans-serif',
    radius:      process.env.THEME_RADIUS  || '14px',
    maxWidth:    process.env.THEME_MAX_W   || '680px',
  },

  // ── Upload constraints ───────────────────────────────────────────────────
  uploads: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxBytes: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
    allowedMime: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
    ],
    pdfBackend: process.env.PDF_BACKEND || 'auto', // 'poppler' | 'pdfjs' | 'auto' | 'none'
  },

  // Asset "roles" — admin picks one of these when uploading.
  assetRoles: [
    'hero',
    'background',
    'std-default',
  ],

  // ── Messaging templates ──────────────────────────────────────────────────
  messaging: {
    inviteTemplate:
      'Hi {{name}}, you\u2019re invited to {{eventTitle}}{{eventDate}}. Details & RSVP: {{inviteUrl}}',
    stdTemplate:
      'Save the date for {{eventTitle}}{{eventDate}}. {{stdUrl}}',
    reminderTemplate:
      'Hi {{name}}, reminder to RSVP for {{eventTitle}} by {{rsvpDeadline}}: {{inviteUrl}}',
  },

  // ── Rate limits (public endpoints) ──────────────────────────────────────
  rateLimits: {
    publicRsvpPerMin: 20,
    validatePinPerMin: 5,
  },

  // ── Defaults ─────────────────────────────────────────────────────────────
  defaults: {
    partySize: 1,
    segment:   '',
    group:     '',
  },
};
