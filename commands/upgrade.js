const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCardById, getAllCardVersions, searchCards, findBestOwnedCard } = require('../utils/cards');
const { cards } = require('../data/cards');
const { levelers } = require('../data/levelers');

const LEVELER_REQUIREMENT_MAP = {
  C: { count: 5, rank: 'C' },
  B: { count: 5, rank: 'B' },
  A: { count: 5, rank: 'A' },
  S: { count: 5, rank: 'S' },
  SS: { count: 10, rank: 'S' },
  UR: { count: 20, rank: 'S' }
};

function getRequiredLevelerInfo(nextRank) {
  return LEVELER_REQUIREMENT_MAP[nextRank] || null;
}

function getEligibleLevelers(attribute, requiredRank) {
  return levelers.filter(l => (l.attribute === attribute || l.attribute === 'ALL') && l.rank === requiredRank);
}

function getUserLevelerCount(user, eligibleIds) {
  return (user.items || []).reduce((sum, item) => {
    if (eligibleIds.includes(item.itemId)) return sum + item.quantity;
    return sum;
  }, 0);
}

function consumeLevelers(user, eligibleIds, amountNeeded) {
  let remaining = amountNeeded;
  // Prefer matching attribute-specific levelers before wildcards
  const orderedIds = eligibleIds.slice();
  const items = user.items || [];
  items.sort((a, b) => {
    const aLeveler = levelers.find(l => l.id === a.itemId);
    const bLeveler = levelers.find(l => l.id === b.itemId);
    if (!aLeveler || !bLeveler) return 0;
    if (aLeveler.attribute === 'ALL' && bLeveler.attribute !== 'ALL') return 1;
    if (bLeveler.attribute === 'ALL' && aLeveler.attribute !== 'ALL') return -1;
    return 0;
  });

  const consumed = [];
  for (const item of items) {
    if (remaining <= 0) break;
    if (!eligibleIds.includes(item.itemId)) continue;
    const used = Math.min(item.quantity, remaining);
    if (used <= 0) continue;
    item.quantity -= used;
    remaining -= used;
    const leveler = levelers.find(l => l.id === item.itemId);
    if (leveler) consumed.push({ emoji: leveler.emoji, name: leveler.name, quantity: used });
  }
  user.items = (user.items || []).filter(i => i.quantity > 0);
  return { remaining, consumed };
}

module.exports = {
  name: 'upgrade',
  description: 'Upgrade one of your cards to next mastery',
  options: [{ name: 'query', type: 3, description: 'Card you own', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const username = message ? message.author.username : interaction.user.username;
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account to upgrade cards.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const base = await findBestOwnedCard(userId, query);
    if (!base) {
      const reply = `No card found matching "${query}".`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const ownedEntry = user.ownedCards.find(e => e.cardId === base.id);
    if (!ownedEntry) {
      const reply = `You don't own **${base.character}** mastery ${base.mastery}.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (base.mastery >= base.mastery_total) {
      const reply = `**${base.character}** is already at maximum mastery.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // find next mastery card definition
    const next = cards.find(c => c.character === base.character && c.mastery === base.mastery + 1);
    if (!next) {
      const reply = `No higher mastery found for **${base.character}**.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check level requirement based on target rank
    const LEVEL_REQUIREMENTS = { C: 5, B: 10, A: 25, S: 30, SS: 50, UR: 75 };
    const requiredLevel = LEVEL_REQUIREMENTS[next.rank] || 1;
    if ((ownedEntry.level || 1) < requiredLevel) {
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`Cannot Upgrade ${base.character}`)
        .setDescription(`Your card is not high enough level.\n\n**Required Level:** ${requiredLevel}\n**Your Level:** ${ownedEntry.level || 1}`)
        .setFooter({ text: `Next version: ${next.title || next.character}` })
        .setAuthor({ name: username, iconURL: avatarUrl });

      if (message) return message.reply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const requiredInfo = getRequiredLevelerInfo(next.rank);
    if (!requiredInfo) {
      const reply = `Upgrade requirements not defined for ${next.rank} mastery.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const eligibleLevelers = getEligibleLevelers(base.attribute, requiredInfo.rank);
    const eligibleIds = eligibleLevelers.map(l => l.id);
    const userCount = getUserLevelerCount(user, eligibleIds);
    const remaining = Math.max(0, requiredInfo.count - userCount);

    const eligibleList = eligibleLevelers.map(l => `${l.emoji} ${l.name}`).join('\n') || 'None';
    const ownedLines = (user.items || [])
      .filter(item => eligibleIds.includes(item.itemId))
      .map(item => {
        const leveler = eligibleLevelers.find(l => l.id === item.itemId);
        return leveler ? `${leveler.emoji} ${leveler.name} x${item.quantity}` : null;
      })
      .filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`Upgrade ${base.character}`)
      .setDescription(`**Current:** Mastery ${base.mastery}\n**Next:** Mastery ${next.mastery}\n\nYou need levelers matching the card's attribute to upgrade.`)
      .setAuthor({ name: username, iconURL: avatarUrl })
      .addFields(
        { name: 'Requirement', value: `• ${requiredInfo.count}x ${requiredInfo.rank} rank ${base.attribute} levelers\n• Rainbow levelers count as any attribute`, inline: false },
        { name: 'Eligible Levelers', value: eligibleList, inline: false },
        { name: 'Your Available Levelers', value: ownedLines.length ? ownedLines.join('\n') : 'None', inline: false }
      );

    const buttons = new ActionRowBuilder();
    if (remaining === 0) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`upgrade_confirm_${base.id}_${next.id}`)
          .setLabel('Confirm Upgrade')
          .setStyle(ButtonStyle.Success)
      );
    }
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('upgrade_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    if (remaining > 0) {
      embed.addFields({ name: 'Missing', value: `You need ${remaining} more eligible leveler(s) to upgrade.`, inline: false });
    }

    let msg;
    if (message) {
      msg = await message.reply({ embeds: [embed], components: [buttons] });
    } else {
      msg = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });
    }

    setTimeout(() => {
      embed.setFooter({ text: 'Expired' });
      msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }, 180000);
  },
  
  // Export button handler for use in main index.js
  handleUpgradeButton: async (interaction) => {
    if (interaction.customId === 'upgrade_cancel') {
      return interaction.update({ content: 'Upgrade cancelled.', embeds: [], components: [] });
    }

    const match = interaction.customId.match(/^upgrade_confirm_(.+)_(.+)$/);
    if (!match) return;

    const [, currentCardId, nextCardId] = match;

    const userId = interaction.user.id;
    let user = await User.findOne({ userId });

    if (!user) {
      return interaction.reply({ content: 'User not found.', ephemeral: true });
    }

    const currentCard = cards.find(c => c.id === currentCardId);
    const nextCard = cards.find(c => c.id === nextCardId);
    const ownedEntry = user.ownedCards.find(e => e.cardId === currentCardId);

    if (!ownedEntry || !currentCard || !nextCard) {
      return interaction.update({ content: 'Card not found in inventory.', embeds: [], components: [] });
    }

    const requiredInfo = getRequiredLevelerInfo(nextCard.rank);
    if (!requiredInfo) {
      return interaction.update({ content: `Upgrade requirements not defined for ${nextCard.rank} mastery.`, embeds: [], components: [] });
    }

    const eligibleLevelers = getEligibleLevelers(currentCard.attribute, requiredInfo.rank);
    const eligibleIds = eligibleLevelers.map(l => l.id);
    const userCount = getUserLevelerCount(user, eligibleIds);

    if (userCount < requiredInfo.count) {
      return interaction.update({
        content: `You do not have enough eligible levelers to upgrade. Required ${requiredInfo.count}, found ${userCount}.`,
        embeds: [],
        components: []
      });
    }

    const { remaining, consumed } = consumeLevelers(user, eligibleIds, requiredInfo.count);
    if (remaining > 0) {
      return interaction.update({
        content: `Unable to consume enough levelers for the upgrade. ${remaining} remaining.`,
        embeds: [],
        components: []
      });
    }

    // Remove the old card version to prevent duplicates
    user.ownedCards = user.ownedCards.filter(e => e.cardId !== currentCardId);
    
    const existingEntry = user.ownedCards.find(e => e.cardId === nextCardId);
    if (existingEntry) {
      existingEntry.level = 1;
      existingEntry.xp = 0;
    } else {
      user.ownedCards.push({ cardId: nextCardId, level: 1, xp: 0 });
    }

    if (!user.history.includes(nextCardId)) user.history.push(nextCardId);

    await user.save();

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Upgrade Complete!')
      .setDescription(`**${currentCard.character}** upgraded to mastery ${nextCard.mastery}`)
      .addFields(
        { name: 'Consumed Levelers', value: consumed.map(c => `${c.emoji} ${c.name} x${c.quantity}`).join('\n') || 'None' },
        { name: 'New Stats', value: `Health: ${nextCard.health}, Power: ${nextCard.power}, Speed: ${nextCard.speed}` }
      )
      .setImage(nextCard.image_url || null);

    return interaction.update({ content: '', embeds: [embed], components: [] });
  }
};