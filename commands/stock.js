const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCurrentStock, getCountdownString, getPricing } = require('../src/stock');
const { cards: allCards } = require('../data/cards');
const { getAllCardVersions, getCardById } = require('../utils/cards');

const RANK_COLORS = {
  D: '#F7FBFF',
  C: '#EBF3FF',
  B: '#D6E5FF',
  A: '#B8D0FF',
  S: '#8AA6FF',
  SS: '#5E7CFF',
  UR: '#2B4EBF'
};

function getPackCardNames(packName) {
  if (!packName) return [];
  const normalized = packName.trim().toLowerCase();
  const names = new Set();

  allCards.forEach(card => {
    if (card.pullable === false || card.mastery !== 1) return;

    const faculty = String(card.faculty || '').trim().toLowerCase();
    let matches = faculty === normalized;
    if (!matches) {
      const versionIds = getAllCardVersions(card.character);
      matches = versionIds.some(versionId => {
        const versionCard = getCardById(versionId);
        return versionCard && String(versionCard.faculty || '').trim().toLowerCase() === normalized;
      });
    }

    if (matches) {
      const name = card.character || card.title || card.name;
      if (name) names.add(name);
    }
  });

  return Array.from(names);
}

function buildStockEmbed(pack, pageIndex, totalPages, countdown) {
  const price = getPricing()[pack.rank] || 0;
  const packCards = getPackCardNames(pack.name);
  const cardPreview = packCards.length
    ? packCards.slice(0, 10).join(', ') + (packCards.length > 10 ? `... (+${packCards.length - 10} more)` : '')
    : 'No pull pool available.';
  const color = RANK_COLORS[pack.rank] || '#1E40AF';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(pack.name)
    .setDescription(`${pack.icon}

**Stock:** ${pack.quantity}x
**Rank:** ${pack.rank}
**Price:** ${price} Gems
**Resets in:** ${countdown}`)
    .addFields(
      { name: 'Pull Pool', value: cardPreview, inline: false },
      { name: 'Total Unique Cards', value: `${packCards.length}`, inline: true },
      { name: 'Page', value: `${pageIndex + 1}/${totalPages}`, inline: true }
    );
}

function buildNavigationRow(pageIndex, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stock_page:${pageIndex - 1}`)
      .setLabel('Back')
      .setEmoji({ id: '1488681505017434284' })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`stock_page:${pageIndex + 1}`)
      .setLabel('next')
      .setEmoji({ id: '1432010265234247772' })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= totalPages - 1)
  );
}

module.exports = {
  name: 'stock',
  description: 'View current pack stock',
  async execute({ message, interaction }) {
    const stock = getCurrentStock();
    if (!stock.length) {
      const reply = 'No stock is available right now.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const countdown = getCountdownString();
    const embed = buildStockEmbed(stock[0], 0, stock.length, countdown);
    const row = buildNavigationRow(0, stock.length);

    if (message) return message.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleButton(interaction, pageIndex) {
    const stock = getCurrentStock();
    if (!stock.length) {
      return interaction.reply({ content: 'No stock is available right now.', ephemeral: true });
    }

    const index = Math.max(0, Math.min(stock.length - 1, Number(pageIndex) || 0));
    const countdown = getCountdownString();
    const embed = buildStockEmbed(stock[index], index, stock.length, countdown);
    const row = buildNavigationRow(index, stock.length);

    return interaction.update({ embeds: [embed], components: [row] });
  }
};