const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { cards, getCardById, findBestOwnedCard } = require('../utils/cards');
const { getMaxStarForRank, getMaxLevelForRank, getStarUpgradeRequirement, buildStarDisplay } = require('../utils/starLevel');

const ATTRIBUTE_SHARD_MAP = {
  STR: 'red_shard',
  QCK: 'blue_shard',
  DEX: 'green_shard',
  PSY: 'yellow_shard',
  INT: 'purple_shard'
};

function getShardItemIdForAttribute(attribute) {
  return ATTRIBUTE_SHARD_MAP[attribute] || null;
}

const STAR_PERKS = {
  1: '+1% All Stats',
  2: '+1% All Stats',
  3: '+1% All Stats',
  4: 'Special Attack Unlocked + 1% All Stats',
  5: 'Status Effect Unlocked + 1% All Stats',
  6: 'Signature Weapon Unlocked + 1% All Stats',
  7: '+1% All Stats'
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

function buildUpgradeEmbed(cardDef, ownedEntry, user, username, avatarUrl) {
  const currentStar = ownedEntry.starLevel || 0;
  const nextStar = currentStar + 1;
  const maxStar = getMaxStarForRank(cardDef.rank);
  const maxLevel = getMaxLevelForRank(cardDef.rank);
  const requirement = getStarUpgradeRequirement(nextStar);
  const shardItemId = getShardItemIdForAttribute(cardDef.attribute);
  const shardCount = getShardCount(user, shardItemId);
  const hasGem = (user.gems || 0) >= 1;
  const hasShards = shardCount >= (requirement?.shardCost || 0);
  const meetsLevel = (ownedEntry.level || 1) >= (requirement?.level || 0);
  const canUpgrade = !!requirement && meetsLevel && nextStar <= maxStar;

  const buttons = new ActionRowBuilder();
  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(`upgrade_star_gem_${cardDef.id}`)
      .setLabel(`Use Gems (Cost: 1 Gem)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canUpgrade || !hasGem),
    new ButtonBuilder()
      .setCustomId(`upgrade_star_shard_${cardDef.id}`)
      .setLabel(`Use Shards (Cost: ${requirement?.shardCost || 0} ${cardDef.attribute} Shards)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canUpgrade || !hasShards)
  );

  const starDisplay = buildStarDisplay(cardDef.attribute, currentStar, cardDef.rank);

  const lines = [
    `**Current Level:** ${ownedEntry.level || 1} / ${maxLevel}`,
    `**Stars:** ${starDisplay} (${currentStar}/${maxStar})`,
    ''
  ];

  if (requirement && nextStar <= maxStar) {
    lines.push(`**Next Star:** ${nextStar} — ${STAR_PERKS[nextStar] || '+1% All Stats'}`);
    lines.push(`**Required Level:** ${requirement.level}`);
    lines.push(`**Gem Cost:** 1 Gem`);
    lines.push(`**Shard Cost:** ${requirement.shardCost} ${cardDef.attribute} Shards`);
  } else {
    lines.push('No further star upgrades available for this rank.');
  }

  lines.push('');
  lines.push(`**Your Gems:** ${user.gems || 0}`);
  lines.push(`**Your ${cardDef.attribute} Shards:** ${shardCount}`);

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setTitle(`${cardDef.emoji || ''} Star Upgrade — ${cardDef.character}`)
    .setDescription(lines.join('\n'))
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

    const currentStar = ownedEntry.starLevel || 0;
    const maxStar = getMaxStarForRank(cardDef.rank);

    if (currentStar >= maxStar) {
      const starDisplay = buildStarDisplay(cardDef.attribute, currentStar, cardDef.rank);
      const reply = `**${cardDef.character}** is already at the maximum star level for its rank.\n${starDisplay}`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const nextStar = currentStar + 1;
    const requirement = getStarUpgradeRequirement(nextStar);
    if (!requirement) {
      const reply = `**${cardDef.character}** cannot be upgraded further.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if ((ownedEntry.level || 1) < requirement.level) {
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle('Star Upgrade Locked')
        .setDescription(`**${cardDef.character}** must reach **Level ${requirement.level}** before gaining Star ${nextStar}.\n\nCurrent level: **${ownedEntry.level || 1}**`)
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

    const currentStar = ownedEntry.starLevel || 0;
    const maxStar = getMaxStarForRank(cardDef.rank);
    const nextStar = currentStar + 1;

    if (currentStar >= maxStar) {
      return interaction.update({ content: `This card is already at the maximum star level for its rank (${maxStar}★).`, embeds: [], components: [] });
    }

    const requirement = getStarUpgradeRequirement(nextStar);
    if (!requirement) return interaction.update({ content: 'This card cannot be upgraded further.', embeds: [], components: [] });

    if ((ownedEntry.level || 1) < requirement.level) {
      return interaction.update({ content: `This card must reach level ${requirement.level} before it can gain Star ${nextStar}.`, embeds: [], components: [] });
    }

    const shardItemId = getShardItemIdForAttribute(cardDef.attribute);

    if (method === 'gem') {
      if ((user.gems || 0) < 1) {
        return interaction.update({ content: 'You need 1 Gem to upgrade this star.', embeds: [], components: [] });
      }
      user.gems -= 1;
    } else {
      const shardCount = getShardCount(user, shardItemId);
      if (shardCount < requirement.shardCost) {
        return interaction.update({ content: `You need ${requirement.shardCost} ${cardDef.attribute} Shards to upgrade this star.`, embeds: [], components: [] });
      }
      consumeItems(user, shardItemId, requirement.shardCost);
    }

    ownedEntry.starLevel = nextStar;
    await user.save();

    const starDisplay = buildStarDisplay(cardDef.attribute, nextStar, cardDef.rank);

    const newEmbed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Star Upgrade Successful!')
      .setDescription([
        `**${cardDef.emoji || ''} ${cardDef.character}** reached **Star ${nextStar}**!`,
        '',
        starDisplay,
        '',
        `**Perk Unlocked:** ${STAR_PERKS[nextStar] || '+1% All Stats'}`,
        '',
        `**Remaining Gems:** ${user.gems || 0}`,
        `**${cardDef.attribute} Shards:** ${getShardCount(user, shardItemId)}`
      ].join('\n'))
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

    return interaction.update({ content: '', embeds: [newEmbed], components: [] });
  }
};
