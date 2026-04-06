const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { simulatePull, buildPullEmbed, getAllCardVersions, getCardById } = require('../utils/cards');
const crews = require('../data/crews');

module.exports = {
  name: 'open',
  description: 'Open a pack to get cards',
  options: [{ name: 'pack', type: 3, description: 'Pack name (e.g., Strawhat Pirates)', required: true }],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    const packQuery = message ? args.join(' ') : interaction.options.getString('pack');

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Fuzzy match pack
    const availablePacks = Object.keys(user.packInventory || {}).filter(p => (user.packInventory[p] || 0) > 0);
    if (availablePacks.length === 0) {
      const reply = 'You have no packs to open.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const matchedPack = availablePacks.find(p => p.toLowerCase().includes(packQuery.toLowerCase())) || null;
    if (!matchedPack) {
      const reply = `Pack "${packQuery}" not found. Available: ${availablePacks.join(', ')}`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if ((user.packInventory[matchedPack] || 0) <= 0) {
      const reply = `You have no ${matchedPack} packs.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Open pack: pull 5 cards along with duplicate info
    const pulledCards = [];
    for (let i = 0; i < 5; i++) {
      let card = simulatePull(user.pityCount, matchedPack);
      if (!card) continue;
      // On 5th pull, 20% chance for a mastery 2 card instead, using the same rank probability system for M2s.
      if (i === 4 && Math.random() < 0.2) {
        const upgradeCard = simulatePull(user.pityCount, matchedPack, { mastery: 2 });
        if (upgradeCard) card = upgradeCard;
      }
      // compute duplicate text same as pull.js logic
      let duplicateText = '';
      const allVersions = getAllCardVersions(card.character);
      let bestOwnedEntry = null;
      let bestOwnedId = null;
      for (const versionId of allVersions) {
        const entry = user.ownedCards.find(e => e.cardId === versionId);
        if (entry) {
          bestOwnedEntry = entry;
          bestOwnedId = versionId;
        }
      }
      if (bestOwnedEntry && bestOwnedId) {
        const bestOwnedCard = getCardById(bestOwnedId);
        if (card.mastery < bestOwnedCard.mastery) {
          bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
          const gained = Math.floor(bestOwnedEntry.xp / 100);
          if (gained > 0) {
            bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
            bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
          }
          duplicateText = `Duplicate +100 XP${gained ? ` (+${gained} lvl)` : ''}`;
        } else if (card.mastery === bestOwnedCard.mastery) {
          bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
          const gained = Math.floor(bestOwnedEntry.xp / 100);
          if (gained > 0) {
            bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
            bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
          }
          duplicateText = `Duplicate +100 XP${gained ? ` (+${gained} lvl)` : ''}`;
        } else {
          // Higher version - add new and remove lower ones
          if (!user.team || !user.team.includes(bestOwnedId)) {
            user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
            user.ownedCards = user.ownedCards.filter(e => {
              const eCard = getCardById(e.cardId);
              if (!eCard || eCard.character !== card.character) return true;
              return eCard.mastery >= card.mastery;
            });
            if (!user.history.includes(card.id)) user.history.push(card.id);
            duplicateText = `Upgraded!`;
          } else {
            bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
            const gained = Math.floor(bestOwnedEntry.xp / 100);
            if (gained > 0) {
              bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
              bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
            }
            duplicateText = `Duplicate +100 XP${gained ? ` (+${gained} lvl)` : ''} (upgrade blocked while on team)`;
          }
        }
      } else {
        user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
        if (!user.history.includes(card.id)) user.history.push(card.id);
      }
      pulledCards.push({ card, dup: duplicateText });
      // Update pity
      user.pityCount += 1;
      if (user.pityCount >= require('../config').PITY_TARGET) {
        user.pityCount = 0;
      }
    }

    // Sort objects by card rank
    const rankOrder = { 'D': 1, 'C': 2, 'B': 3, 'A': 4, 'S': 5, 'SS': 6, 'UR': 7 };
    pulledCards.sort((a, b) => rankOrder[a.card.rank] - rankOrder[b.card.rank]);

    // add cards to inventory already done above while building dup texts
    // (no additional loop needed)


    // Decrement pack count
    user.packInventory[matchedPack] -= 1;
    if (user.packInventory[matchedPack] <= 0) {
      delete user.packInventory[matchedPack];
    }
    user.markModified('packInventory');

    // Update total pulls
    user.totalPulls = (user.totalPulls || 0) + 5;

    await user.save();

    // Send first card embed with next button
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const firstEmbed = buildPullEmbed(pulledCards[0].card, username, avatarUrl, '', pulledCards[0].dup);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_next:${userId}:0`)
        .setLabel('Next Card')
        .setStyle(ButtonStyle.Primary)
    );

    // Store the pulled cards in a map for the session
    if (!global.packSessions) global.packSessions = new Map();
    global.packSessions.set(`${userId}_pack`, { cards: pulledCards, pack: matchedPack });

    if (message) {
      const sent = await message.channel.send({ embeds: [firstEmbed], components: [row] });
    } else {
      await interaction.reply({ embeds: [firstEmbed], components: [row] });
    }
  },

  async handleButton(interaction, customId) {
    const [cmd, userId, indexStr] = customId.split(':');
    const index = parseInt(indexStr);

    const session = global.packSessions.get(`${interaction.user.id}_pack`);
    if (!session) {
      return interaction.reply({ content: 'Pack session expired or not your session.', ephemeral: true });
    }

    const pulledCards = session.cards;
    const matchedPack = session.pack;

    const nextIndex = index + 1;
    if (nextIndex > pulledCards.length || !pulledCards[nextIndex]) {
      return interaction.reply({ content: 'No more cards in this pack.', ephemeral: true });
    }

    const username = interaction.user.username;
    const avatarUrl = interaction.user.displayAvatarURL();
    const embed = buildPullEmbed(pulledCards[nextIndex].card, username, avatarUrl, '', pulledCards[nextIndex].dup);

    const row = (nextIndex + 1 >= pulledCards.length) ? [] : [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_next:${userId}:${nextIndex}`)
        .setLabel('Next Card')
        .setStyle(ButtonStyle.Primary)
    )];

    await interaction.update({ embeds: [embed], components: row });
  }
};