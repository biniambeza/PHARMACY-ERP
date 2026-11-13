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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // /api requests are never cached: they always go to the network.
        // Google Fonts (Inter, JetBrains Mono, Noto Sans Ethiopic) are cached so the offline
        // POS keeps its fonts (Amharic included).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
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
