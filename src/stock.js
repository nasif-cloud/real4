const fs = require('fs');
const path = require('path');
const crews = require('../data/crews');

const STOCK_FILE = path.join(__dirname, '..', 'stock.json');
const PULL_FILE = path.join(__dirname, '..', 'pull.json');


// Pricing based on rank
const PRICING = {
  'D': 1,
  'C': 2,
  'B': 3,
  'A': 5,
  'S': 7,
  'SS': 10,
  'UR': 25
};

let currentStock = [];
let lastStockReset = Date.now();
let lastPullReset = Date.now();


// decrement stock count for crew name, return false if insufficient
function decrementStock(crewName, amt) {
  const entry = currentStock.find(e => e.name === crewName);
  if (!entry) return false;
  if (entry.quantity < amt) return false;
  entry.quantity -= amt;
  saveStock();
  return true;
}

function loadStock() {
  try {
    if (fs.existsSync(STOCK_FILE)) {
      const data = JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8'));
      // Only keep crews that still exist in crews.js
      currentStock = (data.stock || []).filter(c => crews.some(crew => crew.name === c.name)).map(c => {
        const crewDef = crews.find(crew => crew.name === c.name);
        return { ...crewDef, quantity: Math.min(c.quantity || (Math.floor(Math.random() * 3) + 1), 3) };
      });
      lastStockReset = data.lastReset || Date.now();
    }
  } catch (err) {
    console.error('Error loading stock:', err);
  }
}

function saveStock() {
  try {
    fs.writeFileSync(STOCK_FILE, JSON.stringify({ stock: currentStock, lastReset: lastStockReset }, null, 2));
  } catch (err) {
    console.error('Error saving stock:', err);
  }
}

function resetStock() {
  // Select 3 random crews from all available crews with equal probability
  const shuffled = [...crews].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);
  currentStock = selected.map(c => ({ ...c, quantity: Math.floor(Math.random() * 3) + 1 }));
  lastStockReset = Date.now();
  saveStock();
  console.log('Stock reset:', currentStock.map(c => `${c.name} (${c.quantity})`));
}

function getCurrentStockNames() {
  return currentStock.map(c => c.name);
}

function loadPullReset() {
  try {
    if (fs.existsSync(PULL_FILE)) {
      const data = JSON.parse(fs.readFileSync(PULL_FILE, 'utf8'));
      lastPullReset = data.lastReset || Date.now();
    }
  } catch (err) {
    console.error('Error loading pull reset:', err);
  }
}

function savePullReset() {
  try {
    fs.writeFileSync(PULL_FILE, JSON.stringify({ lastReset: lastPullReset }, null, 2));
  } catch (err) {
    console.error('Error saving pull reset:', err);
  }
}

function resetPullCounter() {
  lastPullReset = Date.now();
  savePullReset();
  console.log('Global pull counter reset');
}

function getNextStockResetDate() {
  // Always reset every 20 minutes from the last reset
  const last = lastStockReset || Date.now();
  return new Date(last + 20 * 60 * 1000);
}

function getTimeUntilNextStockReset() {
  const now = new Date();
  const nextReset = getNextStockResetDate();
  return Math.max(0, nextReset - now);
}

function getNextPullResetDate() {
  const now = new Date();
  const anchor = new Date(now);
  anchor.setHours(6, 0, 0, 0);

  if (now < anchor) {
    anchor.setDate(anchor.getDate() - 1);
  }

  const elapsed = now - anchor;
  const eightHours = 8 * 60 * 60 * 1000;
  const step = Math.floor(elapsed / eightHours) + 1;
  const nextReset = new Date(anchor.getTime() + step * eightHours);
  return nextReset;
}

function getTimeUntilNextPullReset() {
  const now = Date.now();
  const nextReset = getNextPullResetDate();
  return Math.max(0, nextReset - now);
}

function getCountdownString() {
  const ms = getTimeUntilNextStockReset();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function getStockCountdownString() {
  const ms = getTimeUntilNextStockReset();
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  let out = '';
  if (minutes > 0) out += `${minutes} min`;
  if (minutes > 0 && seconds > 0) out += ' ';
  if (seconds > 0) out += `${seconds} sec`;
  if (!out) out = '0 sec';
  return out;
}

function ensureStockUpToDate() {
  const timeToStock = getTimeUntilNextStockReset();
  if (timeToStock <= 0) {
    resetStock();
    return true;
  }
  return false;
}

function getPullCountdownString() {
  const ms = getTimeUntilNextPullReset();
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  let out = '';
  if (minutes > 0) out += `${minutes} min`;
  if (minutes > 0 && seconds > 0) out += ' ';
  if (seconds > 0) out += `${seconds} sec`;
  if (!out) out = '0 sec';
  return out;
}

function initStockSystem() {
  const hasStockFile = fs.existsSync(STOCK_FILE);
  loadStock();
  loadPullReset();

  const eightHours = 8 * 60 * 60 * 1000;

  // If stock file is missing, initialize for the first time.
  if (!hasStockFile) {
    resetStock();
  } else {
    // Check if stock needs reset based on time
    const timeToStock = getTimeUntilNextStockReset();
    if (timeToStock <= 0) {
      resetStock();
    }
  }

  // Check if we need to reset pull counter based on time
  const timeToPull = getTimeUntilNextPullReset();
  if (timeToPull <= 0) {
    resetPullCounter();
  }

  // Set interval to check every minute for resets
  setInterval(() => {
    const timeToStock = getTimeUntilNextStockReset();
    if (timeToStock <= 0) {
      resetStock();
    }

    const timeToPull = getTimeUntilNextPullReset();
    if (timeToPull <= 0) {
      resetPullCounter();
      resetStock(); // Also reset stock when pulls reset
    }
  }, 5000); // check every 5 seconds
}

module.exports = {
  initStockSystem,
  getCurrentStock: () => currentStock,
  getPricing: () => PRICING,
  getCountdownString,
  getStockCountdownString,
  getPullCountdownString,
  getNextStockResetDate,
  getTimeUntilNextPullReset,
  ensureStockUpToDate,
  resetStock,
  resetPullCounter,
  decrementStock
};