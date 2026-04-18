const User = require('../models/User');
const { cards } = require('../data/cards');
const { PULL_LIMIT, PULL_RESET_HOURS, PULL_RATES, PITY_TARGET, PITY_DISTRIBUTION } = require('../config');
const { buildPullEmbed, getAllCardVersions, getCardById } = require('../utils/cards');
const stockUtils = require('../src/stock');
const getPreviousPullResetDate = stockUtils.getPreviousPullResetDate;
const getTimeUntilNextPullReset = stockUtils.getTimeUntilNextPullReset;

module.exports = {
  name: 'pull',
  description: 'Pull a random card',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Reset logic using global pull timer
    const now = new Date();
    if (typeof user.pullsRemaining !== 'number' || isNaN(user.pullsRemaining)) {
      user.pullsRemaining = PULL_LIMIT;
    }
    if (!user.lastReset || !(user.lastReset instanceof Date)) {
      user.lastReset = now;
    }

    const lastResetBoundary = getPreviousPullResetDate();
    if (user.lastReset < lastResetBoundary) {
      user.pullsRemaining = PULL_LIMIT;
      user.lastReset = lastResetBoundary;
      await user.save(); // Save immediately to avoid race conditions
    }

    if (user.pullsRemaining <= 0) {
      const diffMs = getTimeUntilNextPullReset();
      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      const timeStr = `${hrs}h ${mins}m ${secs}s`;
      const reply = `you've used all ${PULL_LIMIT} pulls. Next reset in \`${timeStr}\``;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // determine rank with pity logic (only for prefix pulls)
    let rank;
    let pityTriggered = false;
    if (message && user.pityCount >= PITY_TARGET) {
      // pity guaranteed SS drop for prefix pulls
      rank = 'SS';
      user.pityCount = 0;
      pityTriggered = true;
    } else {
      const r = Math.random() * 100;
      let running = 0;
      for (const [rk, pct] of Object.entries(PULL_RATES)) {
        running += pct;
        if (r <= running) {
          rank = rk;
          break;
        }
      }
      if (message) {
        user.pityCount += 1;
      }
    }

    const pityProgress = message ? `Pity: ${user.pityCount}/${PITY_TARGET}` : '';

    // select card
    const pullable = cards.filter(c => c.pullable);
    let pool = pullable.filter(c => c.rank === rank);
    if (pool.length === 0) pool = pullable;
    const card = pool[Math.floor(Math.random() * pool.length)];

    // Get all versions in this card group
    const allVersionIds = getAllCardVersions(card);
    
    // Find if user owns any version in this card group
    let bestOwnedEntry = null;
    let bestOwnedId = null;
    for (const versionId of allVersionIds) {
      const entry = user.ownedCards.find(e => e.cardId === versionId);
      if (entry) {
        bestOwnedEntry = entry;
        bestOwnedId = versionId;
      }
    }

    let duplicateText = '';
    
    if (bestOwnedEntry && bestOwnedId) {
      // User owns some version of this character
      const bestOwnedCard = getCardById(bestOwnedId);
      const pulledCard = getCardById(card.id);
      
      if (pulledCard.mastery < bestOwnedCard.mastery) {
        bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
        const gained = Math.floor(bestOwnedEntry.xp / 100);
        if (gained > 0) {
          bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
          bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
        }
        duplicateText = `+100 XP`;
      } else if (pulledCard.mastery === bestOwnedCard.mastery) {
        bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
        const gained = Math.floor(bestOwnedEntry.xp / 100);
        if (gained > 0) {
          bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
          bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
        }
        duplicateText = `+100 XP`;
      } else {
        // Pulled a higher version than what they own
        const bestOwnedIdVal = bestOwnedId; // id of version they currently have
        // check if the card on team prevents upgrade
        if (user.team && user.team.includes(bestOwnedIdVal)) {
          bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
          const gained = Math.floor(bestOwnedEntry.xp / 100);
          if (gained > 0) {
            bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
            bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
          }
          duplicateText = `+100 XP`;
        } else {
          // normal upgrade: add new version and remove lower ones
          user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
          // Remove all lower versions of this character
          user.ownedCards = user.ownedCards.filter(e => {
            const eCard = getCardById(e.cardId);
            if (!eCard || eCard.character !== card.character) return true;
            return eCard.mastery >= card.mastery;
          });
          if (!user.history.includes(card.id)) user.history.push(card.id);
          duplicateText = `Upgraded! Higher version acquired. Lower versions removed.`;
        }
      }
    } else {
      // Don't own any version - add this one
      user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
      if (!user.history.includes(card.id)) user.history.push(card.id);
    }

    user.pullsRemaining -= 1;
    user.totalPulls = (user.totalPulls || 0) + 1;
    await user.save();

    // Check achievements after changes
    try {
      const { checkAndAwardAll } = require('../utils/achievements');
      await checkAndAwardAll(user, message ? message.client : interaction.client, { event: 'pull', cardId: card.id });
    } catch (err) {
      console.error('Error checking achievements after pull', err);
    }

    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const embed = buildPullEmbed(card, username, avatarUrl, pityProgress, duplicateText);
    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};
