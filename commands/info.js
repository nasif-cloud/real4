const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { findBestOwnedCard, buildCardEmbed, getCardFinalStats } = require('../utils/cards');
const { sortedOwnedCards } = require('./collection');
const User = require('../models/User');

function makeInfoRow(index, total, cardDef) {
  const prevDisabled = index <= 0;
  const nextDisabled = index >= total - 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`info_prev:${index}`)
      .setLabel('Previous')
      .setEmoji({ id: '1489374714379112449' })
      .setStyle(prevDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(`info_next:${index}`)
      .setLabel('Next')
      .setEmoji({ id: '1489374606916714706' })
      .setStyle(nextDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(nextDisabled),
    new ButtonBuilder()
      .setCustomId(`info_boost:boost`)
      .setLabel('Boosts')
      .setEmoji('<:boosticon:1490506833344073768>')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildBoostEmbed(cardDef, userEntry, user) {
  const lvl = userEntry ? userEntry.level : 1;
  const stats = getCardFinalStats(cardDef, lvl, user);
  const boostEntries = stats.boostEntries || [];
  const statBoosts = stats.statBoosts || {};
  // Calculate level boost percent
  const levelBoostPct = Math.ceil(lvl / 10); // +1% per 10 levels, rounded up

  // Always define cardEmoji at the top
  const cardEmoji = cardDef.emoji ? cardDef.emoji + ' ' : '';

  // Compose boost lines with correct emoji and format
  const lines = [];
  // Show all character/crew boosts first, with emoji
  if (boostEntries.length) {
    const { cards } = require('../data/cards');
    boostEntries.forEach(b => {
      if (b.source === 'Levels') return; // skip, will add at end
      // Find the booster card by character name (case-insensitive)
      let emoji = '';
      const boosterCard = cards.find(c => c.character.toLowerCase() === b.source.toLowerCase());
      if (boosterCard && boosterCard.emoji) {
        emoji = boosterCard.emoji + ' ';
      }
      if (b.stat) {
        lines.push(`${emoji}**${b.source}**: boosts ${b.stat} by \`${b.pct}%\``);
      } else {
        lines.push(`${emoji}**${b.source}**: boosts all stats by \`${b.pct}%\``);
      }
    });
  }
  // Always show level boost last, no emoji
  lines.push(`**Levels**: boosts all stats by \`${levelBoostPct}%\``);

  // Compose summary
  const baseStats = `**Base stats:** ${cardDef.power} Power, ${cardDef.health} Health, ${cardDef.speed} Speed, ${cardDef.attack_min} - ${cardDef.attack_max} Attack`;
  // Compose total boost summary in requested format
  let totalParts = [];
  // Add all stats (levels + other all stats boosts)
  let allStatsTotal = levelBoostPct + (stats.totalBoostPct || 0);
  if (allStatsTotal > 0) totalParts.push(`\`${allStatsTotal}%\` all stats`);
  // Add stat-specific boosts
  Object.entries(statBoosts).forEach(([stat, pct]) => {
    totalParts.push(`\`${pct}%\` ${stat}`);
  });
  const totalBoostLine = `**Total boost:** ${totalParts.join(' + ')}`;

  const embed = new EmbedBuilder()
    .setTitle(`${cardEmoji}${cardDef.character} active boosts`)
    .setColor('#2b2d31')
    .setDescription(`${baseStats}\n${totalBoostLine}`)
    .addFields({ name: 'Active boosts', value: lines.join('\n'), inline: false });

  return embed;
}

async function renderInfoCard(interaction, session, user, index) {
  const cardDef = session.cards[index];
  const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;
  const avatarUrl = interaction.user.displayAvatarURL();
  const embed = buildCardEmbed(cardDef, userEntry, avatarUrl, user);
  const row = makeInfoRow(index, session.cards.length, cardDef);
  session.currentIndex = index;
  return interaction.update({ embeds: [embed], components: [row] });
}

module.exports = {
  name: 'info',
  description: 'Show ownership and history of a card',
  options: [{ name: 'query', type: 3, description: 'Card name', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    const cardDef = await findBestOwnedCard(userId, query);
    if (!cardDef) {
      const reply = `No card found called **${query}**.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const user = await User.findOne({ userId });
    const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;

    // Only show all mastery versions of this character for navigation
    const allVersions = require('../utils/cards').getAllCardVersions(cardDef.character);
    const sessionCards = allVersions.map(id => require('../utils/cards').getCardById(id)).filter(Boolean);
    const currentIndex = sessionCards.findIndex(c => c.id === cardDef.id);
    const session = { userId, cards: sessionCards, currentIndex: currentIndex >= 0 ? currentIndex : 0 };
    if (!global.infoSessions) global.infoSessions = new Map();
    global.infoSessions.set(`${userId}_info`, session);

    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const embed = buildCardEmbed(cardDef, userEntry, avatarUrl, user);
    const row = makeInfoRow(session.currentIndex, session.cards.length, cardDef);

    if (message) return message.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleButton(interaction, action, indexPart) {
    const session = global.infoSessions?.get(`${interaction.user.id}_info`);
    if (!session || session.userId !== interaction.user.id) {
      return interaction.reply({ content: 'Info session expired or not your session.', ephemeral: true });
    }

    const user = await User.findOne({ userId: interaction.user.id });
    const currentIndex = parseInt(session.currentIndex ?? 0, 10) || 0;

    if (action === 'info_prev' || action === 'info_next') {
      let nextIndex = currentIndex;
      if (action === 'info_prev') nextIndex = Math.max(0, currentIndex - 1);
      if (action === 'info_next') nextIndex = Math.min(session.cards.length - 1, currentIndex + 1);
      return renderInfoCard(interaction, session, user, nextIndex);
    }

    if (action === 'info_boost') {
      const cardDef = session.cards[currentIndex];
      const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;
      const embed = buildBoostEmbed(cardDef, userEntry, user);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: 'Unknown action.', ephemeral: true });
  }
};