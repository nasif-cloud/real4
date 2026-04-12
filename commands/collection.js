const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const User = require('../models/User');
const { getCardById, buildCardEmbed, getCardFinalStats } = require('../utils/cards');

const RANK_ORDER = { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6, UR: 7 };

function compareCards(a, b, mode, user) {
  const levelA = a.entry?.level || 1;
  const levelB = b.entry?.level || 1;
  const rankA = RANK_ORDER[a.card.rank] || 0;
  const rankB = RANK_ORDER[b.card.rank] || 0;
  const powerA = typeof a.scaledPower === 'number' ? a.scaledPower : getCardFinalStats(a.card, levelA, user).scaled.power;
  const powerB = typeof b.scaledPower === 'number' ? b.scaledPower : getCardFinalStats(b.card, levelB, user).scaled.power;

  switch (mode) {
    case 'strongest-weakest':
      if (powerA !== powerB) return powerB - powerA;
      if (rankA !== rankB) return rankB - rankA;
      if (a.card.mastery !== b.card.mastery) return b.card.mastery - a.card.mastery;
      if (levelA !== levelB) return levelB - levelA;
      return a.card.character.localeCompare(b.card.character);
    case 'weakest-strongest':
      if (powerA !== powerB) return powerA - powerB;
      if (rankA !== rankB) return rankA - rankB;
      if (a.card.mastery !== b.card.mastery) return a.card.mastery - b.card.mastery;
      if (levelA !== levelB) return levelA - levelB;
      return a.card.character.localeCompare(b.card.character);
    case 'highest-level':
      if (levelA !== levelB) return levelB - levelA;
      if (rankA !== rankB) return rankB - rankA;
      return a.card.character.localeCompare(b.card.character);
    case 'lowest-level':
      if (levelA !== levelB) return levelA - levelB;
      if (rankA !== rankB) return rankA - rankB;
      return a.card.character.localeCompare(b.card.character);
    default:
      return compareCards(a, b, 'strongest-weakest', user);
  }
}

function sortAndFilter(items, mode, user) {
  let filtered = Array.isArray(items) ? [...items] : [];
  const attrMap = { dex: 'DEX', str: 'STR', qck: 'QCK', psy: 'PSY', int: 'INT' };

  if (mode && mode.endsWith('-only')) {
    const key = mode.split('-')[0];
    const attr = attrMap[key] || '';
    filtered = filtered.filter(x => (x.card.attribute || '').toUpperCase() === attr);
    mode = 'strongest-weakest';
  }

  if (['strongest-weakest', 'weakest-strongest', 'highest-level', 'lowest-level'].includes(mode)) {
    filtered.sort((a, b) => compareCards(a, b, mode, user));
  }

  return filtered;
}

function sortedOwnedCards(user) {
  if (!user || !Array.isArray(user.ownedCards) || !user.ownedCards.length) return [];

  const cardsWithDef = user.ownedCards
    .map(entry => {
      const cardDef = getCardById(entry.cardId);
      if (!cardDef) return null;
      const finalStats = getCardFinalStats(cardDef, entry.level || 1, user);
      return { card: cardDef, entry, scaledPower: finalStats.scaled.power };
    })
    .filter(Boolean);

  return sortAndFilter(cardsWithDef, 'strongest-weakest');
}

function makeNavRow(userId, index, total) {
  const prevDisabled = index <= 0;
  const nextDisabled = index >= total - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`collection_prev:${userId}:${index}`)
      .setLabel('Previous')
      .setEmoji({ id: '1489374714379112449' })
      .setStyle(prevDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(`collection_next:${userId}:${index}`)
      .setLabel('Next')
      .setEmoji({ id: '1489374606916714706' })
      .setStyle(nextDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(nextDisabled)
  );
}

function makeSortButton(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`collection_sort:${userId}`)
      .setLabel('Sort/Filter')
      .setEmoji({ id: '1489377118637916270' })
      .setStyle(ButtonStyle.Secondary)
  );
}

function makeSortMenu(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`collection_sort_select:${userId}`)
      .setPlaceholder('Choose sort / filter option...')
      .addOptions([
        { label: 'Strongest to weakest', value: 'strongest-weakest' },
        { label: 'Weakest to strongest', value: 'weakest-strongest' },
        { label: 'Highest level to lowest', value: 'highest-level' },
        { label: 'Lowest level to highest', value: 'lowest-level' },
        { label: 'Only DEX', value: 'dex-only' },
        { label: 'Only STR', value: 'str-only' },
        { label: 'Only QCK', value: 'qck-only' },
        { label: 'Only PSY', value: 'psy-only' },
        { label: 'Only INT', value: 'int-only' }
      ])
  );
}

function makeCollectionBoostRow(userId, cardDef, owned) {
  if (!owned || cardDef.ship) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`collection_boost:${userId}`)
      .setLabel('Boosts')
      .setEmoji({ id: '1490506833344073768' })
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildCollectionBoostEmbed(cardDef, user, entry) {
  const stats = getCardFinalStats(cardDef, entry?.level || 1, user);
  const lines = [];

  if (!stats.boostEntries || !stats.boostEntries.length) {
    lines.push('This card currently has no active boosts.');
  } else {
    lines.push('**Active boosts**');
    for (const boost of stats.boostEntries) {
      const statLabel = boost.stat ? ` (${boost.stat})` : '';
      lines.push(`• ${boost.source}: +${boost.pct}%${statLabel}`);
    }
  }
  lines.push(`\n**Final power:** ${stats.scaled.power}`);
  if (stats.totalBoostPct) {
    lines.push(`**Total boost:** +${stats.totalBoostPct}%`);
  }

  return new EmbedBuilder()
    .setTitle(`${cardDef.character} boosts`)
    .setDescription(lines.join('\n'))
    .setColor('#2b2d31');
}

async function renderCard(interaction, user, session, index) {
  const item = session.cards[index];
  if (!item) {
    return interaction.reply({ content: 'No collection card found.', ephemeral: true });
  }

  const avatarUrl = interaction.user.displayAvatarURL();
  const embed = buildCardEmbed(item.card, item.entry, avatarUrl, user);

  const rowNav = makeNavRow(interaction.user.id, index, session.cards.length);
  const rowSort = makeSortButton(interaction.user.id);
  const rowBoost = makeCollectionBoostRow(interaction.user.id, item.card, !!item.entry);
  const components = [rowNav, rowSort];
  if (rowBoost) components.push(rowBoost);

  return interaction.update({ embeds: [embed], components });
}

module.exports = {
  name: 'collection',
  description: 'View your owned card collection (best to worst)',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = "You don't have an account. Run `op start` or /start to register.";
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const sorted = sortedOwnedCards(user);
    if (!sorted.length) {
      const reply = 'Your collection is empty.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const session = { userId, cards: sorted, original: sorted, currentIndex: 0, mode: 'strongest-weakest' };
    if (!global.collectionSessions) global.collectionSessions = new Map();
    global.collectionSessions.set(`${userId}_collection`, session);

    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const embed = buildCardEmbed(sorted[0].card, sorted[0].entry, avatarUrl, user);
    const rowNav = makeNavRow(userId, 0, sorted.length);
    const rowSort = makeSortButton(userId);
    const rowBoost = makeCollectionBoostRow(userId, sorted[0].card, !!sorted[0].entry);
    const components = [rowNav, rowSort];
    if (rowBoost) components.push(rowBoost);

    if (message) {
      return message.channel.send({ embeds: [embed], components });
    }

    return interaction.reply({ embeds: [embed], components });
  },

  async handleButton(interaction, customId) {
    const [action, uid, indexPart] = customId.split(':');
    const session = global.collectionSessions?.get(`${interaction.user.id}_collection`);
    if (!session || session.userId !== interaction.user.id) {
      return interaction.reply({ content: 'Collection session expired or not your session.', ephemeral: true });
    }

    if (action === 'collection_sort') {
      return interaction.update({ content: 'Choose sort/filter option:', components: [makeSortMenu(uid)] });
    }

    if (action === 'collection_sort_select') {
      const mode = interaction.values?.[0] || 'strongest-weakest';
      const filtered = sortAndFilter(session.original, mode, await User.findOne({ userId: interaction.user.id }));
      session.cards = filtered;
      session.currentIndex = 0;
      session.mode = mode;

      if (!filtered.length) {
        return interaction.update({ content: 'No cards match that filter.', embeds: [], components: [] });
      }

      return renderCard(interaction, await User.findOne({ userId: interaction.user.id }), session, 0);
    }

    if (action === 'collection_boost') {
      const user = await User.findOne({ userId: interaction.user.id });
      const cardDef = session.cards[session.currentIndex];
      const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;
      const embed = buildCollectionBoostEmbed(cardDef, user, userEntry);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const currentIndex = parseInt(indexPart, 10) || 0;
    let nextIndex = currentIndex;
    if (action === 'collection_next') nextIndex = Math.min(session.cards.length - 1, currentIndex + 1);
    if (action === 'collection_prev') nextIndex = Math.max(0, currentIndex - 1);

    session.currentIndex = nextIndex;

    return renderCard(interaction, await User.findOne({ userId: interaction.user.id }), session, nextIndex);
  },
  sortedOwnedCards
};