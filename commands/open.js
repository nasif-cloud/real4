const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { simulatePull, buildPullEmbed, getAllCardVersions, getCardById } = require('../utils/cards');
const { cards } = require('../data/cards');
const crews = require('../data/crews');
const { levelers } = require('../data/levelers');
const { getChestByQuery, getChestById } = require('../data/chests');

function normalizeName(name) {
  return name ? name.toLowerCase().replace(/\s+/g, '') : '';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseChestItem(rank) {
  const candidates = levelers.filter(l => l.rank === rank);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function addChestItemToUser(user, chestItem) {
  if (!chestItem) return;
  user.items = user.items || [];
  const existingItem = user.items.find(it => it.itemId === chestItem.id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    user.items.push({ itemId: chestItem.id, quantity: 1 });
  }
}

function getRandomCrewByRank(rank) {
  const matching = crews.filter(c => c.rank === rank && c.name !== 'Marines');
  if (matching.length === 0) return null;
  return matching[Math.floor(Math.random() * matching.length)];
}

module.exports = {
  name: 'open',
  description: 'Open a pack or chest to get cards or rewards',
  options: [
    { name: 'pack', type: 3, description: 'Pack or chest name (e.g., Strawhat Pirates, B Chest)', required: true },
    { name: 'amount', type: 4, description: 'Amount to open (only supported for chests)', required: false }
  ],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    let packQuery = message ? args.join(' ') : interaction.options.getString('pack');
    const amountOption = interaction ? interaction.options.getInteger('amount') : null;
    let quantity = 1;

    if (message && args.length > 1) {
      const lastArg = args[args.length - 1];
      const parsed = parseInt(lastArg, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        quantity = parsed;
        packQuery = args.slice(0, -1).join(' ');
      }
    }

    if (!message && amountOption && amountOption > 1) {
      quantity = amountOption;
    }

    const normalizedQuery = (packQuery || '').trim();

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const chest = normalizedQuery ? getChestByQuery(normalizedQuery) : null;
    if (chest) {
      user.items = user.items || [];
      const chestEntry = user.items.find(it => it.itemId === chest.id);
      if (!chestEntry || chestEntry.quantity <= 0) {
        const reply = `You have no **${chest.name}** to open.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }

      if (chestEntry.quantity < quantity) {
        const reply = `You only have ${chestEntry.quantity}x **${chest.name}**.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }

      chestEntry.quantity -= quantity;
      if (chestEntry.quantity <= 0) {
        user.items = user.items.filter(it => it.itemId !== chest.id);
      }

      const rewardTotals = {};
      const contents = chest.contents || {};

      for (let i = 0; i < quantity; i += 1) {
        if (contents.beli) {
          const amount = randomInt(contents.beli[0], contents.beli[1]);
          user.balance = (user.balance || 0) + amount;
          rewardTotals['Beli'] = (rewardTotals['Beli'] || 0) + amount;
        }

        if (contents.gems && Math.random() < (contents.gems.chance || 1)) {
          const gemAmount = randomInt(contents.gems.count[0], contents.gems.count[1]);
          user.gems = (user.gems || 0) + gemAmount;
          rewardTotals['Gems'] = (rewardTotals['Gems'] || 0) + gemAmount;
        }

        if (contents.resetTokens && Math.random() < (contents.resetTokens.chance || 0)) {
          const resetCount = randomInt(contents.resetTokens.count[0], contents.resetTokens.count[1]);
          user.resetTokens = (user.resetTokens || 0) + resetCount;
          rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] = (rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] || 0) + resetCount;
        }
      }

      await user.save();

      const rewardLines = Object.entries(rewardTotals).map(([key, value]) => {
        if (key === 'Beli') return `<:beri:1490738445319016651> ${value} Beli`;
        if (key === 'Gems') return `<:gem:1490741488081043577> ${value}x gem${value > 1 ? 's' : ''}`;
        return `${key} x${value}`;
      });

      const reply = `You opened ${chest.emoji} **${chest.name}** x${quantity} and received:\n${rewardLines.join('\n')}`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply });
    }

    // Fuzzy match pack
    const availablePacks = Object.keys(user.packInventory || {}).filter(p => (user.packInventory[p] || 0) > 0);
    if (availablePacks.length === 0) {
      const reply = 'You have no packs to open.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const matchedPack = availablePacks.find(p => p.toLowerCase().includes(normalizedQuery.toLowerCase())) || null;
    if (!matchedPack) {
      const reply = `**${packQuery}** not found.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if ((user.packInventory[matchedPack] || 0) <= 0) {
      const reply = `You have no ${matchedPack} packs.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Open pack: pull 5 cards along with duplicate info
    // Detect if this pack has any available cards for the pack's faculty.
    const packCheck = simulatePull(user.pityCount, matchedPack);
    if (!packCheck) {
      const reply = `The ${matchedPack} pack cannot be opened because it has no available cards.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const normalizeName = name => name ? name.toLowerCase().replace(/\s+/g, '') : '';
    const isStrawhatPack = name => {
      const normalized = normalizeName(name);
      return normalized.includes('strawhat') && normalized.includes('pirates');
    };
    const normalizedPack = normalizeName(matchedPack);
    let strawhatArtifact = cards.find(c => c.artifact && normalizeName(c.faculty) === normalizedPack);
    if (!strawhatArtifact && isStrawhatPack(matchedPack)) {
      strawhatArtifact = cards.find(c => c.artifact && normalizeName(c.faculty).includes('strawhat'));
    }

    const shipCandidates = cards.filter(c => c.ship && c.pullable && normalizeName(c.faculty) === normalizedPack);
    let shipCard = null;
    let shipSlot = -1;
    if (shipCandidates.length > 0 && Math.random() < 0.10) {
      shipCard = shipCandidates[Math.floor(Math.random() * shipCandidates.length)];
      shipSlot = Math.floor(Math.random() * 5);
      if (isStrawhatPack(matchedPack) && shipSlot === 0 && strawhatArtifact) {
        shipSlot = 1;
      }
    }

    const pulledCards = [];
    for (let i = 0; i < 5; i++) {
      let card;
      if (isStrawhatPack(matchedPack) && i === 0 && strawhatArtifact) {
        card = strawhatArtifact;
      } else if (shipCard && i === shipSlot) {
        card = shipCard;
      } else {
        card = simulatePull(user.pityCount, matchedPack);
        if (!card) {
          const reply = `The ${matchedPack} pack cannot be opened because it has no available cards.`;
          if (message) return message.reply(reply);
          return interaction.reply({ content: reply, ephemeral: true });
        }
      }
      // compute duplicate text same as pull.js logic
      let duplicateText = '';
      const allVersions = getAllCardVersions(card);
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
        if (card.ship) {
          duplicateText = 'Duplicate ship already owned';
        } else if (card.mastery < bestOwnedCard.mastery) {
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

    // Preserve the pack draw order so the first pulled card remains the guaranteed artifact
    // and the final card retains the upgrade/chance logic.
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