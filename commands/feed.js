const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { levelers } = require('../data/levelers');
const { findBestOwnedCard } = require('../utils/cards');
const { applyDefaultEmbedStyle } = require('../utils/embedStyle');

// Fuzzy search for levelers - find exact name match first, then partial
function searchLevelers(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const matches = levelers.filter(l => {
    if (l.id.toLowerCase() === q) return true;
    if (l.name.toLowerCase() === q) return true; // exact match first
    if (l.name.toLowerCase().includes(q)) return true; // partial match
    return false;
  });
  return matches;
}

function findFirstLeveler(query) {
  const results = searchLevelers(query);
  return results.length ? results[0] : null;
}

// Find leveler by multi-word matching from remaining args
function findLevelerFromArgs(args) {
  // Try progressively longer combinations
  for (let len = Math.min(3, args.length - 1); len >= 1; len--) {
    const query = args.slice(0, len).join(' ');
    const leveler = findFirstLeveler(query);
    if (leveler) {
      return { leveler, cardArgs: args.slice(len) };
    }
  }
  return null;
}

module.exports = {
  name: 'feed',
  description: 'Feed a leveler to a card to level it up',
  options: [
    { name: 'leveler', type: 3, description: 'Leveler item name', required: true },
    { name: 'card', type: 3, description: 'Card name', required: true },
    { name: 'amount', type: 4, description: 'Amount to feed (default 1)', required: false }
  ],
  async execute({ message, interaction, args }) {
    let leveler, cardQuery, amount = 1;
    const userId = message ? message.author.id : interaction.user.id;
    
    if (message) {
      if (args.length < 2) {
        return message.reply('Usage: `op feed <leveler> <card> [amount]`');
      }
      
      // Find leveler from multi-word args
      const result = findLevelerFromArgs(args);
      if (!result) {
        return message.reply('No leveler found matching those keywords.');
      }
      leveler = result.leveler;
      const cardArgs = result.cardArgs;
      if (cardArgs.length < 1) {
        return message.reply('Please specify a card name.');
      }
      cardQuery = cardArgs.join(' ');
      if (cardArgs[cardArgs.length - 1] && !isNaN(parseInt(cardArgs[cardArgs.length - 1]))) {
        amount = parseInt(cardArgs[cardArgs.length - 1]);
        cardQuery = cardArgs.slice(0, -1).join(' ');
      }
    } else {
      const levelerQuery = interaction.options.getString('leveler');
      leveler = findFirstLeveler(levelerQuery);
      cardQuery = interaction.options.getString('card');
      amount = interaction.options.getInteger('amount') || 1;
    }

    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `/start` to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    if (amount < 1) {
      const reply = 'Amount must be at least 1.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    if (!leveler) {
      const reply = `No leveler found.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    // Check if user has enough
    const item = user.items.find(i => i.itemId === leveler.id);
    if (!item || item.quantity < amount) {
      const reply = `You don't have enough ${leveler.name}. You have ${item ? item.quantity : 0}.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    // Find card
    const card = await findBestOwnedCard(userId, cardQuery);
    if (!card) {
      const reply = `No card found matching "${cardQuery}".`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    // Check if owned
    const ownedCard = user.ownedCards.find(c => c.cardId === card.id);
    if (!ownedCard) {
      const reply = `You don't own ${card.character}.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    // Validate attribute compatibility
    if (typeof leveler.xp !== 'object' && leveler.attribute !== 'ALL' && leveler.attribute !== card.attribute) {
      const reply = `${leveler.emoji} **${leveler.name}** (${leveler.attribute}) cannot be fed to **${card.character}** (${card.attribute}). Only ${leveler.attribute} cards can use this leveler!`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, flags: 64 });
    }

    // Calculate XP from the leveler exactly as defined in data/levelers.js
    let xpGain = 0;
    if (typeof leveler.xp === 'object') {
      xpGain = (leveler.xp[card.attribute] || 0) * amount;
    } else {
      xpGain = Number(leveler.xp || 0) * amount;
    }

    // Add XP
    const currentXp = Number(ownedCard.xp) || 0;
    const currentLevel = Number(ownedCard.level) || 1;
    const normalizedXpGain = Number(xpGain) || 0;
    const totalXp = currentXp + normalizedXpGain;
    const levels = Math.floor(totalXp / 100);
    ownedCard.level = currentLevel + levels;
    ownedCard.xp = totalXp % 100;

    // Remove items
    item.quantity -= amount;
    if (item.quantity <= 0) {
      user.items = user.items.filter(i => i.itemId !== leveler.id);
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setDescription(`**XP Awarded**\nFed ${amount}x  ${leveler.emoji} **${leveler.name}** to **${card.character}**.\n\n-# Gained ${xpGain} XP!\n-# Current Level: ${ownedCard.level} (${ownedCard.xp} XP)`);
    applyDefaultEmbedStyle(embed, message ? message.author : interaction.user);

    if (message) return message.reply({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};