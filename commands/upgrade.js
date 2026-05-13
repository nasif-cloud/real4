const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { cards, getCardById, getAllCardVersions, searchCards, findBestOwnedCard, getShardItemIdForAttribute } = require('../utils/cards');

const STAR_UPGRADE_REQUIREMENTS = {
  1: { level: 5, gemCost: 1 },
  2: { level: 15, shardCost: 2 },
  3: { level: 25, shardCost: 3 },
  4: { level: 35, shardCost: 4 },
  5: { level: 45, shardCost: 5 },
  6: { level: 55, shardCost: 6 },
  7: { level: 65, shardCost: 7 }
};

function getShardCount(user, shardItemId) {
  if (!user || !Array.isArray(user.items) || !shardItemId) return 0;
  return user.items.reduce((total, item) => item.itemId === shardItemId ? total + (item.quantity || 0) : total, 0);
}

function consumeItems(user, itemId, amount) {
  let remaining = amount;
  if (!user || !Array.isArray(user.items) || !itemId || amount <= 0) return 0;
  user.items = user.items.map(item => {
    if (remaining <= 0 || item.itemId !== itemId) return item;
    const used = Math.min(item.quantity || 0, remaining);
    remaining -= used;
    return { ...item, quantity: (item.quantity || 0) - used };
  }).filter(item => item.quantity > 0);
  return amount - remaining;
}

function getNextStarRequirement(starLevel) {
  return STAR_UPGRADE_REQUIREMENTS[starLevel + 1] || null;
}

function buildUpgradeEmbed(cardDef, ownedEntry, user, username, avatarUrl) {
  const nextStar = (ownedEntry.starLevel || 0) + 1;
  const maxStar = getCardById(cardDef.id) ? cardDef.mastery_total + 1 : 7;
  const requirement = getNextStarRequirement(ownedEntry.starLevel || 0);
  const shardItemId = getShardItemIdForAttribute(cardDef.attribute);
  const shardCount = getShardCount(user, shardItemId);
  const hasGem = (user.gems || 0) >= (requirement?.gemCost || 0);
  const hasShards = shardCount >= (requirement?.shardCost || 0);
  const buttons = new ActionRowBuilder();

  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(`upgrade_star_gem_${cardDef.id}`)
      .setLabel(`Use Gems (${requirement?.gemCost || 0})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!requirement || !hasGem),
    new ButtonBuilder()
      .setCustomId(`upgrade_star_shard_${cardDef.id}`)
      .setLabel(`Use ${requirement?.shardCost || 0} ${cardDef.attribute} Shards`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!requirement || !hasShards),
    new ButtonBuilder()
      .setCustomId('upgrade_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setTitle(`${cardDef.emoji || ''} Star Upgrade — ${cardDef.character}`)
    .setDescription([`**Current Level:** ${ownedEntry.level || 1}`,
      `**Current Stars:** ${ownedEntry.starLevel || 0}/${maxStar}`,
      `**Next Star Unlock:** ${nextStar}`,
      requirement ? `**Required Level:** ${requirement.level}` : 'No further star upgrades available.',
      requirement && requirement.shardCost ? `**Shard Cost:** ${requirement.shardCost}x ${cardDef.attribute} Shards` : '',
      requirement && requirement.gemCost ? `**Gem Cost:** ${requirement.gemCost} Gems` : '',
      '',
      `**Your Gems:** ${user.gems || 0}`,
      `**Your ${cardDef.attribute} Shards:** ${shardCount}`
    ].filter(Boolean).join('\n'))
    .setAuthor({ name: username, iconURL: avatarUrl });

  return { embed, buttons };
}

module.exports = {
  name: 'upgrade',
  description: 'Upgrade a card with star progression',
  options: [{ name: 'query', type: 3, description: 'Card you own', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You do not have an account to upgrade cards.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const cardDef = await findBestOwnedCard(userId, query);
    if (!cardDef) {
      const reply = `No card found matching **${query}**.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const ownedEntry = (user.ownedCards || []).find(e => e.cardId === cardDef.id);
    if (!ownedEntry) {
      const reply = `You don't own **${cardDef.character}**.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const nextStar = (ownedEntry.starLevel || 0) + 1;
    const requirement = getNextStarRequirement(ownedEntry.starLevel || 0);
    if (!requirement) {
      const reply = `**${cardDef.character}** is already at maximum star level.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if ((ownedEntry.level || 1) < requirement.level) {
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle('Star Upgrade Locked')
        .setDescription(`This card must reach level ${requirement.level} before it can gain star ${nextStar}.`)
        .setAuthor({ name: username, iconURL: avatarUrl });
      if (message) return message.channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const { embed, buttons } = buildUpgradeEmbed(cardDef, ownedEntry, user, username, avatarUrl);
    if (message) {
      await message.channel.send({ embeds: [embed], components: [buttons] });
    } else {
      await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });
    }
  },

  handleUpgradeButton: async (interaction) => {
    if (interaction.customId === 'upgrade_cancel') {
      return interaction.update({ content: 'Star upgrade cancelled.', embeds: [], components: [] });
    }

    const match = interaction.customId.match(/^upgrade_star_(gem|shard)_(.+)$/);
    if (!match) return interaction.reply({ content: 'Unknown upgrade action.', ephemeral: true });

    const [, method, cardId] = match;
    const userId = interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) return interaction.reply({ content: 'User not found.', ephemeral: true });

    const cardDef = cards.find(c => c.id === cardId);
    if (!cardDef) return interaction.update({ content: 'Card not found.', embeds: [], components: [] });

    const ownedEntry = (user.ownedCards || []).find(e => e.cardId === cardId);
    if (!ownedEntry) return interaction.update({ content: 'You no longer own that card.', embeds: [], components: [] });

    const requirement = getNextStarRequirement(ownedEntry.starLevel || 0);
    if (!requirement) return interaction.update({ content: 'This card is already at maximum star level.', embeds: [], components: [] });
    if ((ownedEntry.level || 1) < requirement.level) {
      return interaction.update({ content: `This card must reach level ${requirement.level} before it can gain the next star.`, embeds: [], components: [] });
    }

    if (method === 'gem') {
      if ((user.gems || 0) < requirement.gemCost) {
        return interaction.update({ content: `You need ${requirement.gemCost} Gems to upgrade this star.`, embeds: [], components: [] });
      }
      user.gems -= requirement.gemCost;
    } else {
      const shardItemId = getShardItemIdForAttribute(cardDef.attribute);
      const shardCount = getShardCount(user, shardItemId);
      if (shardCount < requirement.shardCost) {
        return interaction.update({ content: `You need ${requirement.shardCost} ${cardDef.attribute} Shards to upgrade this star.`, embeds: [], components: [] });
      }
      consumeItems(user, shardItemId, requirement.shardCost);
    }

    ownedEntry.starLevel = (ownedEntry.starLevel || 0) + 1;
    await user.save();

    const newEmbed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Star Upgrade Successful')
      .setDescription(`**${cardDef.character}** gained star level ${ownedEntry.starLevel}.`)
      .addFields(
        { name: 'Remaining Gems', value: `${user.gems || 0}`, inline: true },
        { name: `${cardDef.attribute} Shards`, value: `${getShardCount(user, getShardItemIdForAttribute(cardDef.attribute))}`, inline: true }
      );

    return interaction.update({ content: '', embeds: [newEmbed], components: [] });
  }
};
