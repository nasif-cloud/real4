const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const User = require('../models/User');
const { getCardById, buildCardEmbed } = require('../utils/cards');

const RANK_ORDER = { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6, UR: 7 };

function compareCards(a, b, mode) {
  const levelA = a.entry?.level || 1;
  const levelB = b.entry?.level || 1;
  const rankA = RANK_ORDER[a.card.rank] || 0;
  const rankB = RANK_ORDER[b.card.rank] || 0;

  switch (mode) {
    case 'strongest-weakest':
      if (rankA !== rankB) return rankB - rankA;
      if (a.card.mastery !== b.card.mastery) return b.card.mastery - a.card.mastery;
      if (levelA !== levelB) return levelB - levelA;
      return a.card.character.localeCompare(b.card.character);
    case 'weakest-strongest':
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
      return compareCards(a, b, 'strongest-weakest');
  }
}

function sortAndFilter(items, mode) {
  let filtered = Array.isArray(items) ? [...items] : [];
  const attrMap = { dex: 'DEX', str: 'STR', qck: 'QCK', psy: 'PSY', int: 'INT' };

  if (mode && mode.endsWith('-only')) {
    const key = mode.split('-')[0];
    const attr = attrMap[key] || '';
    filtered = filtered.filter(x => (x.card.attribute || '').toUpperCase() === attr);
    mode = 'strongest-weakest';
  }

  if (['strongest-weakest', 'weakest-strongest', 'highest-level', 'lowest-level'].includes(mode)) {
    filtered.sort((a, b) => compareCards(a, b, mode));
  }

  return filtered;
}

function sortedOwnedCards(user) {
  if (!user || !Array.isArray(user.ownedCards) || !user.ownedCards.length) return [];

  const cardsWithDef = user.ownedCards
    .map(entry => {
      const cardDef = getCardById(entry.cardId);
      if (!cardDef) return null;
      return { card: cardDef, entry };
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

async function renderCard(interaction, user, session, index) {
  const item = session.cards[index];
  if (!item) {
    return interaction.reply({ content: 'No collection card found.', ephemeral: true });
  }

  const avatarUrl = interaction.user.displayAvatarURL();
  const embed = buildCardEmbed(item.card, item.entry, avatarUrl, user);

  const rowNav = makeNavRow(interaction.user.id, index, session.cards.length);
  const rowSort = makeSortButton(interaction.user.id);

  return interaction.update({ embeds: [embed], components: [rowNav, rowSort] });
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

    if (message) {
      return message.channel.send({ embeds: [embed], components: [rowNav, rowSort] });
    }

    return interaction.reply({ embeds: [embed], components: [rowNav, rowSort] });
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
      const filtered = sortAndFilter(session.original, mode);
      session.cards = filtered;
      session.currentIndex = 0;
      session.mode = mode;

      if (!filtered.length) {
        return interaction.update({ content: 'No cards match that filter.', embeds: [], components: [] });
      }

      return renderCard(interaction, await User.findOne({ userId: interaction.user.id }), session, 0);
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