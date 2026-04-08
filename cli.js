#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist', 'tui.mjs');

if (!fs.existsSync(distPath)) {
  console.error('Error: TUI bundle not found at dist/tui.mjs');
  console.error('');
  console.error('Please build first:');
  console.error('  npm run build');
  console.error('');
  console.error('Or run the full setup:');
  console.error('  npm install && npm run build && ./minebot');
  process.exit(1);
}

import('./dist/tui.mjs')
  .then((module) => {
    const startAdminTUI = module.startAdminTUI || module.default;
    if (typeof startAdminTUI === 'function') {
      startAdminTUI();
    } else {
      console.error('Error: startAdminTUI function not found in module');
      console.error('Available exports:', Object.keys(module));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Failed to start TUI:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  });
