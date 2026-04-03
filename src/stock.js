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
      currentStock = (data.stock || []).map(c => ({ ...c, quantity: c.quantity || (Math.floor(Math.random() * 5) + 1) }));
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
  // Select 5 random different crews
  const shuffled = [...crews].sort(() => 0.5 - Math.random());
  // initialize quantity per crew (random 1-5 packs each)
  currentStock = shuffled.slice(0, 5).map(c => ({ ...c, quantity: Math.floor(Math.random() * 5) + 1 }));
  lastStockReset = Date.now();
  saveStock();
  console.log('Stock reset:', currentStock.map(c => `${c.name} (${c.quantity})`));
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
  const now = new Date();
  const anchor = new Date(now);
  anchor.setHours(6, 0, 0, 0);

  if (now < anchor) {
    return anchor;
  }

  const elapsedMinutes = Math.floor((now - anchor) / (1000 * 60));
  const step = Math.floor(elapsedMinutes / 20) + 1;
  const nextReset = new Date(anchor.getTime() + step * 20 * 60 * 1000);
  return nextReset;
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
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function getPullCountdownString() {
  const ms = getTimeUntilNextPullReset();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
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
    }
  }, 60 * 1000); // check every minute
}

module.exports = {
  initStockSystem,
  getCurrentStock: () => currentStock,
  getPricing: () => PRICING,
  getCountdownString,
  getStockCountdownString,
  getPullCountdownString,
  getTimeUntilNextPullReset,
  resetStock,
  resetPullCounter,
  decrementStock
};