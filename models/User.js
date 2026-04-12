const mongoose = require('mongoose');
const { Schema } = mongoose;

// schema for an owned card entry (mastery level is implied by the cardId)
const UserCardSchema = new Schema({
  cardId: { type: String, required: true },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  equippedTo: { type: String, default: null }
}, { _id: false });

const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  pullsRemaining: { type: Number, default: 8 },
  lastReset: { type: Date, default: Date.now },
  pityCount: { type: Number, default: 0 },
  ownedCards: { type: [UserCardSchema], default: [] },
  history: { type: [String], default: [] },
  balance: { type: Number, default: 500 },
  gems: { type: Number, default: 0 },
  bounty: { type: Number, default: 100 },
  activeBountyTarget: { type: String, default: null },
  bountyCooldownUntil: { type: Date, default: null },
  robCooldownUntil: { type: Date, default: null },
  lootCooldownUntil: { type: Date, default: null },
  betCooldownUntil: { type: Date, default: null },
  triviaCooldownUntil: { type: Date, default: null },
  isailProgress: { type: Number, default: 1 },
  lastIsailFail: { type: Date, default: null },
  lastIsailEnemies: { type: [String], default: [] },
  totalPulls: { type: Number, default: 0 },
  resetTokens: { type: Number, default: 5 },
  // inventory for future shop/consumables
  items: { type: [{ itemId: String, quantity: Number, durability: Number }], default: [] },
  packs: { type: [{ packType: String, quantity: Number }], default: [] },
  // active team (up to 3 cardIds)
  team: { type: [String], default: [] },
  // custom team background image URL
  teamBackgroundUrl: { type: String, default: null },
  // active ship set for passive income
  activeShip: { type: String, default: null },
  shipBalance: { type: Number, default: 0 },
  shipLastUpdated: { type: Date, default: Date.now },
  // pack inventory for global stock system
  packInventory: { type: Object, default: {} },
  // daily rewards
  lastDaily: { type: Date, default: null },
  dailyStreak: { type: Number, default: 0 },
  // fishing
  lastFishFail: { type: Date, default: null },
  // rods for fishing
  currentRod: { type: String, default: 'basic_rod' },
});

module.exports = mongoose.model('User', UserSchema);
