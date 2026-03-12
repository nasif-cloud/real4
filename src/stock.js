const fs = require('fs');
const path = require('path');
const crews = require('../data/crews');

const STOCK_FILE = path.join(__dirname, '..', 'stock.json');

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
let lastReset = Date.now();

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
      lastReset = data.lastReset || Date.now();
    }
  } catch (err) {
    console.error('Error loading stock:', err);
  }
}

function saveStock() {
  try {
    fs.writeFileSync(STOCK_FILE, JSON.stringify({ stock: currentStock, lastReset }, null, 2));
  } catch (err) {
    console.error('Error saving stock:', err);
  }
}

function resetStock() {
  // Select 5 random different crews
  const shuffled = [...crews].sort(() => 0.5 - Math.random());
  // initialize quantity per crew (random 1-5 packs each)
  currentStock = shuffled.slice(0, 5).map(c => ({ ...c, quantity: Math.floor(Math.random() * 5) + 1 }));
  lastReset = Date.now();
  saveStock();
  console.log('Stock reset:', currentStock.map(c => `${c.name} (${c.quantity})`));
}

function getTimeUntilNextReset() {
  const now = new Date();
  const currentHour = now.getHours();
  const nextEvenHour = currentHour % 2 === 0 ? currentHour + 2 : currentHour + (2 - (currentHour % 2));
  const nextReset = new Date(now);
  nextReset.setHours(nextEvenHour, 0, 0, 0);
  if (nextReset <= now) nextReset.setHours(nextEvenHour + 2, 0, 0, 0);
  return nextReset - now;
}

function getCountdownString() {
  const ms = getTimeUntilNextReset();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function initStockSystem() {
  loadStock();
  if (currentStock.length === 0) {
    resetStock();
  }

  // Check if we need to reset based on time
  const timeSinceLastReset = Date.now() - lastReset;
  const twoHours = 2 * 60 * 60 * 1000;
  if (timeSinceLastReset >= twoHours) {
    resetStock();
  }

  // Set interval to check every minute for reset
  setInterval(() => {
    const timeSinceLastReset = Date.now() - lastReset;
    if (timeSinceLastReset >= twoHours) {
      resetStock();
    }
  }, 60 * 1000); // check every minute
}

module.exports = {
  initStockSystem,
  getCurrentStock: () => currentStock,
  getPricing: () => PRICING,
  getCountdownString,
  resetStock, // for testing
  decrementStock
};