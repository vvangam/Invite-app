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
    adminTabSettings:   'Settings',
    adminTabAssets:     'Assets',
    adminTabGuests:     'Guests',
    adminTabSend:       'Send',
    adminTabExports:    'Exports',
    heroFallback:       'We can\u2019t wait to celebrate with you.',
    rsvpClosed:         'RSVP is currently closed.',
    rsvpSubmitted:      'Your response has been recorded.',
    inviteNotFound:     'We couldn\u2019t find that invitation.',
  },

  // ── Theme presets (modular — admin picks one in Settings) ────────────────
  // Each preset ships a complete token bundle (color + type + surface +
  // motion). Switching presets re-skins the entire app live, no reload.
  // The active preset id is stored in `config_overrides.themePresetActive`
  // and is overridable via env `THEME_PRESET`.
  themePresetActive: process.env.THEME_PRESET || 'editorial',

  themePresets: [
    {
      id: 'editorial',
      label: 'Editorial',
      hint: 'Refined serif + airy whitespace. Magazine feel.',
      swatch: ['#faf7f2', '#1a1a1a', '#8b6f47'],
      fontHref: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap',
      tokens: {
        bg:           '#faf7f2',
        surface:      'rgba(255,255,255,0.72)',
        surface2:     '#ffffff',
        fg:           '#1a1a1a',
        fgMuted:      '#5d5a55',
        fgSubtle:     '#8a857d',
        accent:       '#8b6f47',
        accentFg:     '#ffffff',
        border:       'rgba(20,20,20,0.10)',
        success:      '#3f7a5a',
        warn:         '#b87333',
        danger:       '#a83838',
        fontDisplay:  '"Fraunces", Georgia, serif',
        fontBody:     '"Inter", system-ui, sans-serif',
        fontMono:     'ui-monospace, "SF Mono", Menlo, monospace',
        trackingTight:'-0.02em',
        trackingBase: '0',
        trackingLoose:'0.18em',
        radiusSm:     '8px',
        radius:       '14px',
        radiusLg:     '20px',
        shadow1:      '0 1px 0 rgba(0,0,0,0.04)',
        shadow2:      '0 12px 32px -16px rgba(40,30,15,0.18)',
        maxWidth:     '680px',
        motionFast:   '120ms',
        motionBase:   '240ms',
        motionSlow:   '420ms',
        heroSurface:  'translucent',
      },
    },
    {
      id: 'midnight',
      label: 'Midnight',
      hint: 'Dark, expensive, warm gold accents.',
      swatch: ['#0e0d0c', '#f4ede1', '#d4a857'],
      fontHref: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap',
      tokens: {
        bg:           '#0e0d0c',
        surface:      'rgba(28,24,20,0.70)',
        surface2:     '#1a1714',
        fg:           '#f4ede1',
        fgMuted:      '#a8a195',
        fgSubtle:     '#6b675f',
        accent:       '#d4a857',
        accentFg:     '#1a140a',
        border:       'rgba(244,237,225,0.12)',
        success:      '#7fb89a',
        warn:         '#e0a96d',
        danger:       '#e07878',
        fontDisplay:  '"Instrument Serif", Georgia, serif',
        fontBody:     '"Inter", system-ui, sans-serif',
        fontMono:     'ui-monospace, "SF Mono", Menlo, monospace',
        trackingTight:'-0.015em',
        trackingBase: '0',
        trackingLoose:'0.20em',
        radiusSm:     '6px',
        radius:       '12px',
        radiusLg:     '18px',
        shadow1:      '0 1px 0 rgba(255,255,255,0.04)',
        shadow2:      '0 24px 48px -20px rgba(0,0,0,0.55)',
        maxWidth:     '700px',
        motionFast:   '140ms',
        motionBase:   '280ms',
        motionSlow:   '480ms',
        heroSurface:  'flat',
      },
    },
    {
      id: 'bloom',
      label: 'Bloom',
      hint: 'Warm dusty pinks, playful, celebratory.',
      swatch: ['#fdf0ee', '#2d1f3d', '#e8765a'],
      fontHref: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500;1,9..144,600&family=Inter:wght@400;500;600&display=swap',
      tokens: {
        bg:           '#fdf0ee',
        surface:      'rgba(255,255,255,0.85)',
        surface2:     '#ffffff',
        fg:           '#2d1f3d',
        fgMuted:      '#6b5a78',
        fgSubtle:     '#9a8caa',
        accent:       '#e8765a',
        accentFg:     '#ffffff',
        border:       'rgba(45,31,61,0.10)',
        success:      '#4a8a6a',
        warn:         '#d68a3a',
        danger:       '#c14a4a',
        fontDisplay:  '"Fraunces", Georgia, serif',
        fontBody:     '"Inter", system-ui, sans-serif',
        fontMono:     'ui-monospace, "SF Mono", Menlo, monospace',
        trackingTight:'-0.025em',
        trackingBase: '0',
        trackingLoose:'0.16em',
        radiusSm:     '12px',
        radius:       '24px',
        radiusLg:     '36px',
        shadow1:      '0 2px 0 rgba(232,118,90,0.06)',
        shadow2:      '0 20px 40px -16px rgba(232,118,90,0.22)',
        maxWidth:     '680px',
        motionFast:   '120ms',
        motionBase:   '260ms',
        motionSlow:   '460ms',
        heroSurface:  'card',
      },
    },
    {
      id: 'monochrome',
      label: 'Monochrome',
      hint: 'High contrast, sharp corners, architectural.',
      swatch: ['#ffffff', '#0a0a0a', '#0a0a0a'],
      fontHref: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      tokens: {
        bg:           '#ffffff',
        surface:      '#ffffff',
        surface2:     '#fafafa',
        fg:           '#0a0a0a',
        fgMuted:      '#525252',
        fgSubtle:     '#a3a3a3',
        accent:       '#0a0a0a',
        accentFg:     '#ffffff',
        border:       '#0a0a0a',
        success:      '#0a0a0a',
        warn:         '#0a0a0a',
        danger:       '#c11a1a',
        fontDisplay:  '"Inter Tight", system-ui, sans-serif',
        fontBody:     '"Inter Tight", system-ui, sans-serif',
        fontMono:     '"JetBrains Mono", ui-monospace, Menlo, monospace',
        trackingTight:'-0.03em',
        trackingBase: '-0.005em',
        trackingLoose:'0.24em',
        radiusSm:     '0',
        radius:       '0',
        radiusLg:     '0',
        shadow1:      '0 0 0 1px #0a0a0a',
        shadow2:      'none',
        maxWidth:     '720px',
        motionFast:   '80ms',
        motionBase:   '160ms',
        motionSlow:   '240ms',
        heroSurface:  'edge',
      },
    },
    {
      id: 'garden',
      label: 'Garden',
      hint: 'Sage + terracotta, soft and tactile.',
      swatch: ['#f0f4ee', '#1f3329', '#b86b4a'],
      fontHref: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Lora:wght@400;500;600&display=swap',
      tokens: {
        bg:           '#f0f4ee',
        surface:      'rgba(255,253,247,0.80)',
        surface2:     '#fbf9f3',
        fg:           '#1f3329',
        fgMuted:      '#5a6e63',
        fgSubtle:     '#8a9a90',
        accent:       '#b86b4a',
        accentFg:     '#ffffff',
        border:       'rgba(31,51,41,0.12)',
        success:      '#3d7a5a',
        warn:         '#b87333',
        danger:       '#a83838',
        fontDisplay:  '"Cormorant Garamond", Georgia, serif',
        fontBody:     '"Lora", Georgia, serif',
        fontMono:     'ui-monospace, "SF Mono", Menlo, monospace',
        trackingTight:'-0.01em',
        trackingBase: '0.005em',
        trackingLoose:'0.18em',
        radiusSm:     '10px',
        radius:       '18px',
        radiusLg:     '28px',
        shadow1:      '0 1px 0 rgba(31,51,41,0.04)',
        shadow2:      '0 16px 36px -18px rgba(31,51,41,0.20)',
        maxWidth:     '680px',
        motionFast:   '160ms',
        motionBase:   '320ms',
        motionSlow:   '520ms',
        heroSurface:  'translucent',
      },
    },
  ],

  // Legacy `theme` block kept as the env-overridable "Custom" overlay
  // applied on top of the active preset. Leave fields blank to inherit.
  theme: {
    bg:           process.env.THEME_BG          || '',
    fg:           process.env.THEME_FG          || '',
    accent:       process.env.THEME_ACCENT      || '',
    fgMuted:      process.env.THEME_MUTED       || '',
    surface:      process.env.THEME_CARD        || '',
    fontDisplay:  process.env.THEME_FONT_HEADING|| '',
    fontBody:     process.env.THEME_FONT_BODY   || '',
    radius:       process.env.THEME_RADIUS      || '',
    maxWidth:     process.env.THEME_MAX_W       || '',
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
