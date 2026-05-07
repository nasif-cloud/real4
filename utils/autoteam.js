const { cards } = require('../data/cards');
const { getCardFinalStats } = require('./cards');

// Select the best `count` cards for a user's auto-team. This function was
// previously doing repeated, expensive score computations inside the sort
// comparator which resulted in O(N log N) heavy computations. Cache the
// computed final-stats per card so each card is evaluated exactly once.
function selectAutoTeam(user, count = 3) {
  if (!user) return [];

  const ownedEntries = Array.isArray(user.ownedCards) ? user.ownedCards : [];
  if (ownedEntries.length === 0) return [];

  // Build a quick map of owned entries for O(1) lookup
  const ownedMap = new Map();
  for (const e of ownedEntries) ownedMap.set(e.cardId, e);

  // Resolve card defs for owned entries
  const ownedDefs = ownedEntries
    .map(e => cards.find(c => c.id === e.cardId))
    .filter(Boolean);

  // Exclude artifacts, ships and boost-type cards (attackers only)
  const eligibles = ownedDefs.filter(c => !c.artifact && !c.ship && !c.boost && !(c.type && String(c.type).toLowerCase() === 'boost'));
  if (eligibles.length === 0) return [];

  // Compute a score for each eligible card once
  const scored = eligibles.map(def => {
    const entry = ownedMap.get(def.id) || { level: 1 };
    const stats = getCardFinalStats(def, entry.level || 1, user);
    // Primary metric: scaled power. Other heuristics could be added later.
    const score = (stats && stats.scaled && typeof stats.scaled.power === 'number') ? stats.scaled.power : 0;
    return { id: def.id, score };
  });

  // Sort by score descending and take top `count` ids
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(s => s.id);
}

module.exports = {
  selectAutoTeam
};
