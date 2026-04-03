const { cards: cardDefs } = require('../data/cards');
const { computeScaledStats } = require('./cards');

// Resolve final stats for a user's specific owned card entry.  Instead of
// reimplementing the scaling math we simply reuse the central
// `computeScaledStats` helper used by the info command, guaranteeing the
// two displays stay in sync.
//
// userCard: { cardId, level, xp }
// ownedCards: array of user's owned card entries (needed for boost lookup)
function resolveStats(userCard, ownedCards) {
  if (!userCard || !userCard.cardId) return null;
  const def = cardDefs.find(c => c.id === userCard.cardId);
  if (!def) return null;

  const level = userCard.level || 1;

  // calculate total percentage from boost cards (exact same logic as
  // buildCardEmbed in utils/cards.js)
  let boostPct = 0;
  if (Array.isArray(ownedCards)) {
    ownedCards.forEach(entry => {
      const bdef = cardDefs.find(c => c.id === entry.cardId);
      // any card with a `boost` property counts as a boost source
      if (bdef && bdef.boost) {
        const regex = new RegExp(`${def.character.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\((\\d+)%\\)`, 'i');
        const m = bdef.boost.match(regex);
        if (m) boostPct += parseInt(m[1], 10);
      }
    });
  }

  // delegate to computeScaledStats which already handles level and boost
  // multiplication with the exact rounding rules the info command uses.
  return computeScaledStats(def, level, boostPct);
}

module.exports = { resolveStats };
