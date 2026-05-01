const fs = require('fs');
const path = require('path');

// Dynamically load any status effect modules present in this directory.
// This avoids runtime crashes if some effect files (e.g. freeze) were removed.
const effects = {};
try {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'index.js');
  for (const file of files) {
    const name = path.basename(file, '.js');
    try {
      // Use relative require to preserve module caching semantics
      effects[name] = require(path.join(__dirname, file));
    } catch (err) {
      // Don't throw - log and continue so the bot can run without optional effects
      // eslint-disable-next-line no-console
      console.error(`[status-effects] failed to load ${file}:`, err && err.message ? err.message : err);
    }
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[status-effects] failed to read effects directory:', err && err.message ? err.message : err);
}

module.exports = effects;
