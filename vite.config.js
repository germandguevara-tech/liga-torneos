import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, readFileSync, existsSync } from 'fs'

function buildManifest(env) {
  const nombre  = env.VITE_LIGA_NOMBRE   || 'Liga'
  const color   = env.VITE_LIGA_COLOR    || '#1a3a2a'
  const iconUrl = env.VITE_LIGA_ICON_URL || ''

  const icons = iconUrl
    ? [{ src: iconUrl, sizes: 'any', type: 'image/png', purpose: 'any maskable' }]
    : [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]

  writeFileSync('public/manifest.json', JSON.stringify({
    name:             `${nombre} - Liga de Fútbol`,
    short_name:       nombre,
    description:      'Seguimiento de torneos, posiciones y estadísticas',
    start_url:        '/',
    scope:            '/',
    display:          'standalone',
    orientation:      'portrait',
    theme_color:      color,
    background_color: color,
    icons,
  }, null, 2))
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'generate-manifest',
        buildStart()    { buildManifest(env) },
        configureServer() { buildManifest(env) },
      },
      {
        name: 'inject-sw-version',
        closeBundle() {
          const swPath = 'dist/sw.js';
          if (existsSync(swPath)) {
            const content = readFileSync(swPath, 'utf-8');
            writeFileSync(swPath, content.replace("'__BUILD_TIME__'", Date.now().toString()));
          }
        },
      },
    ],
    server: {
      hmr: { port: 5173 },
    },
  }
})
