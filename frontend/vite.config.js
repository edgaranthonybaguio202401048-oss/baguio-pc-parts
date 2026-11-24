import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Service worker + manifest via vite-plugin-pwa / Workbox.
// Caching rules:
//   - App shell (HTML/JS/CSS/icons/images in /public) precached at install
//   - GET /api/v1/products* and /categories  -> StaleWhileRevalidate (offline catalog browsing)
//   - product images                          -> CacheFirst (30 days)
//   - NEVER cached: POST/PATCH/DELETE (Workbox only caches GET), /auth, /orders, /checkout, /cart,
//     /webhooks, /admin, /ai – they are not matched by any runtime rule.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered manually in main.jsx
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'offline.html', 'robots.txt'],
      manifest: {
        name: 'Baguio PC Parts',
        short_name: 'BaguioPC',
        description: 'Shop PC parts in Baguio City – compatibility-checked builds, Maya checkout and an AI build advisor.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f3d2e',
        background_color: '#f4f7f5',
        lang: 'en-PH',
        categories: ['shopping', 'technology'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,txt}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && /\/api\/v1\/(products|categories|shipping-options)(\/|\?|$)/.test(url.pathname + url.search),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-catalog',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'product-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
