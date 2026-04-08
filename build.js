const esbuild = require('esbuild');
const path = require('path');
const { builtinModules } = require('module');

const emptyPlugin = {
  name: 'empty-modules',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'empty',
    }));
    build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
};

esbuild.build({
  entryPoints: ['tui/index.jsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/tui.mjs',
  external: [
    ...builtinModules,
    ...builtinModules.map(m => `node:${m}`),
    'canvas',
    'sqlite3',
    'mineflayer',
    'mineflayer-pathfinder',
    'prismarine-viewer',
    'express',
    'axios',
    'dotenv',
    'ws',
    'vec3',
  ],
  jsx: 'automatic',
  plugins: [emptyPlugin],
  banner: {
    js: `import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);\n`,
  },
  logLevel: 'info',
}).catch(() => process.exit(1));