const { cards } = require('../data/cards');
const { getCardFinalStats } = require('./cards');

function selectAutoTeam(user, count = 3) {
  if (!user) return [];
  const ownedDefs = (user.ownedCards || [])
    .map(e => cards.find(c => c.id === e.cardId))
    .filter(c => c);

  // Exclude artifacts, ships and boost-type cards (attackers only)
  let eligibles = ownedDefs.filter(c => !c.artifact && !c.ship && !c.boost && !(c.type && String(c.type).toLowerCase() === 'boost'));

  if (eligibles.length === 0) return [];

  eligibles.sort((a, b) => {
    const aEntry = user.ownedCards.find(e => e.cardId === a.id);
    const bEntry = user.ownedCards.find(e => e.cardId === b.id);
    const aStats = getCardFinalStats(a, aEntry?.level || 1, user);
    const bStats = getCardFinalStats(b, bEntry?.level || 1, user);
    return (bStats.scaled.power || 0) - (aStats.scaled.power || 0);
  });

  return eligibles.slice(0, count).map(c => c.id);
}

module.exports = {
  selectAutoTeam
};
