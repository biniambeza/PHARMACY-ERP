// Vite config for the Playwright run: the normal app config plus
//  - envDir pointing here, so frontend/.env (real URLs / demo credentials) is never loaded;
//    VITE_API_URL comes from the environment set in playwright.config.js
//  - all source files pre-scanned for dependency optimisation, so Vite does not discover a
//    new dependency mid-test and force a full page reload.
import { mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import baseConfig from '../vite.config.js';

export default mergeConfig(baseConfig, {
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  clearScreen: false,
  server: { strictPort: true },
  optimizeDeps: { entries: ['index.html', 'src/**/*.{js,jsx}'] },
});
