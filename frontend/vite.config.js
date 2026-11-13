import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Vendor chunk groups (#30). Higher priority groups capture their modules first, so the
// shared React/router runtime is never pulled into a feature chunk (recharts depends on react).
// Libraries not listed here (and only used by lazy pages) are chunked automatically.
// Matches modules inside node_modules/<one of the packages>/ (any path separator).
const SEP = String.raw`[\\/]`
const pkgs = (...names) => new RegExp(`node_modules${SEP}(${names.join('|')})${SEP}`)

const vendorGroups = [
  // Vite's dynamic-import preload helper is used by the entry (lazy routes) and by jspdf's own
  // dynamic imports. Without this group it was captured into vendor-pdf as a jspdf dependency,
  // which made the entry import (and modulepreload) the whole ~800 kB PDF chunk on first load.
  { name: 'vite-preload', priority: 40, test: /vite[\\/]preload-helper/ },
  { name: 'vendor-react', priority: 30, test: pkgs('react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', 'cookie', 'set-cookie-parser') },
  { name: 'vendor-i18n', priority: 20, test: pkgs('i18next', 'react-i18next', 'html-parse-stringify', 'void-elements') },
  { name: 'vendor-icons', priority: 20, test: pkgs('lucide-react') },
  {
    name: 'vendor-charts',
    priority: 10,
    test: pkgs('recharts', String.raw`d3-[^\\/]+`, 'victory-vendor', 'internmap', String.raw`decimal\.js-light`, 'es-toolkit', 'eventemitter3',
      'immer', 'redux', '@reduxjs', 'reselect', 'react-redux', 'use-sync-external-store', 'tiny-invariant', 'react-is'),
  },
  {
    name: 'vendor-pdf',
    priority: 10,
    test: pkgs('jspdf', 'jspdf-autotable', 'fflate', 'fast-png', 'iobuffer', 'pako', 'html2canvas', 'canvg', 'dompurify', 'core-js',
      'raf', 'rgbcolor', 'stackblur-canvas', 'svg-pathdata', String.raw`@babel${SEP}runtime`),
  },
  { name: 'vendor-barcode', priority: 10, test: pkgs('jsbarcode') },
  { name: 'vendor-idb', priority: 10, test: pkgs('idb') },
]

// A production build without VITE_API_URL would talk to the wrong API (src/api/axios.js only
// falls back to localhost in dev), so it fails here instead. Checked in configResolved so the
// value can come from a .env file or the process environment (CI / Vercel project settings).
// Dev server (incl. the Playwright run, E2E=1) and non-production modes are not affected.
const requireApiUrl = () => ({
  name: 'require-vite-api-url',
  configResolved(config) {
    if (config.command !== 'build' || config.mode !== 'production' || process.env.E2E) return;
    if (!String(config.env.VITE_API_URL || '').trim()) {
      throw new Error(
        'VITE_API_URL is not set. A production build needs the backend API URL, e.g. '
          + 'VITE_API_URL=https://your-backend.onrender.com/api (set it in the Vercel project '
          + 'environment variables or frontend/.env.production).'
      );
    }
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    requireApiUrl(),
    react(),
    tailwindcss(),
    // PWA groundwork for the Wave 3 offline POS: app-shell precache only.
    // API traffic is never cached by the service worker.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Pharmacy ERP',
        short_name: 'Pharmacy ERP',
        description: 'Pharmacy management: POS, inventory, procurement and reports',
        theme_color: '#059669',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Fonts are self-hosted (@fontsource, see main.jsx). The subsets the app always needs
        // are precached so the offline POS has them from the first visit: Latin Inter and
        // JetBrains Mono, and Ethiopic Noto Sans Ethiopic (Amharic). The other unicode-range
        // subsets (cyrillic, greek, vietnamese, latin-ext, ...) and the woff fallbacks are
        // cached at runtime the first time a page needs them.
        globPatterns: [
          '**/*.{js,css,html,svg,ico,png}',
          'assets/inter-latin-[0-9]*.woff2',
          'assets/jetbrains-mono-latin-[0-9]*.woff2',
          'assets/noto-sans-ethiopic-ethiopic-*.woff2',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // /api requests are never cached: they always go to the network.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/.+\.woff2?$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-fonts',
              // File names are content-hashed, so a cached font never goes stale.
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: vendorGroups,
        },
      },
    },
  },
})
