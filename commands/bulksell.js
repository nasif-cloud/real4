const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { searchCards, getCardById } = require('../utils/cards');
const { levelers } = require('../data/levelers');

const pendingBulkSell = new Map();

function randomKey() {
  return `bulk_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function normalizeQuery(query) {
  return query ? query.trim().toLowerCase() : '';
}

function splitList(raw) {
  const items = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function parseSegment(segment) {
  const amountMatch = segment.match(/^(?:"([^"]+)"|([^\-]+?))\s*-\s*(\d+)$/i);
  if (amountMatch) {
    const query = (amountMatch[1] || amountMatch[2] || '').trim();
    return { type: 'item', query, amount: parseInt(amountMatch[3], 10) };
  }
  const allMatch = segment.match(/^all(?:\s+(.+))?$/i);
  if (allMatch) {
    const query = (allMatch[1] || '').trim();
    return { type: 'all', query };
  }
  return { type: 'item', query: segment.trim(), amount: 1 };
}

function searchLevelers(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const matches = levelers.filter(l => {
    if (l.id.toLowerCase() === q) return true;
    if (l.name.toLowerCase() === q) return true;
    if (l.name.toLowerCase().includes(q)) return true;
    if (l.attribute.toLowerCase() === q) return true;
    return false;
  });
  return matches;
}

function findLeveler(query) {
  const q = normalizeQuery(query);
  if (!q) return null;
  return levelers.find(l => l.id.toLowerCase() === q || l.name.toLowerCase() === q) || null;
}

function findMatchingLevelers(query, user) {
  const q = normalizeQuery(query).replace(/levelers?$/, '').trim();
  if (!q) {
    return levelers.filter(l => user.items.some(item => item.itemId === l.id && item.quantity > 0));
  }
  return levelers.filter(l => {
    if (l.name.toLowerCase().includes(q)) return true;
    if (l.attribute.toLowerCase().includes(q)) return true;
    return false;
  }).filter(l => user.items.some(item => item.itemId === l.id && item.quantity > 0));
}

function findMatchingOwnedCards(query, user) {
  const q = normalizeQuery(query);
  const matched = q ? searchCards(q) : [];
  const ownedIds = user.ownedCards.map(e => e.cardId);
  const candidates = matched.length ? matched.filter(c => ownedIds.includes(c.id)) : [];
  if (candidates.length) {
    return candidates.filter(c => !c.artifact && !c.ship && !(user.team || []).includes(c.id));
  }
  // fallback to all owned cards if query is empty
  if (!q) {
    return user.ownedCards
      .map(entry => getCardById(entry.cardId))
      .filter(c => c && !c.artifact && !c.ship && !(user.team || []).includes(c.id));
  }
  return [];
}

const MAX_CARD_SELL = 20;

function buildSellPlan(user, requests) {
  const actions = [];
  let total = 0;
  const lines = [];

  for (const request of requests) {
    if (request.type === 'all') {
      const matches = findMatchingLevelers(request.query, user);
      if (matches.length) {
        for (const leveler of matches) {
          const item = user.items.find(i => i.itemId === leveler.id);
          if (!item || item.quantity <= 0) continue;
          actions.push({ type: 'leveler', leveler, quantity: item.quantity });
          total += leveler.beli * item.quantity;
          lines.push(`${leveler.emoji || ''} **${leveler.name}** x${item.quantity}`);
        }
        continue;
      }
      const cardMatches = findMatchingOwnedCards(request.query, user).slice(0, MAX_CARD_SELL);
      for (const card of cardMatches) {
        const price = (card.rank === 'D' ? 10 : card.rank === 'C' ? 10 : card.rank === 'B' ? 25 : card.rank === 'A' ? 50 : card.rank === 'S' ? 200 : card.rank === 'SS' ? 750 : card.rank === 'UR' ? 2500 : 0);
        if (price <= 0) continue;
        actions.push({ type: 'card', card, price });
        total += price;
        lines.push(`${card.emoji || ''} **${card.character}** (${card.rank})`);
      }
      continue;
    }

    const leveler = findLeveler(request.query);
    if (leveler) {
      const item = user.items.find(i => i.itemId === leveler.id);
      if (!item || item.quantity <= 0) continue;
      // Default to selling all of a leveler when no explicit amount provided
      const quantity = (request.amount === 1) ? item.quantity : Math.min(item.quantity, request.amount);
      actions.push({ type: 'leveler', leveler, quantity });
      total += leveler.beli * quantity;
      lines.push(`${leveler.emoji || ''} **${leveler.name}** x${quantity}`);
      continue;
    }

    const broadLevelers = findMatchingLevelers(request.query, user);
    if (broadLevelers.length) {
      for (const levelerMatch of broadLevelers) {
        const item = user.items.find(i => i.itemId === levelerMatch.id);
        if (!item || item.quantity <= 0) continue;
        const quantity = Math.min(item.quantity, request.amount === 'all' ? item.quantity : request.amount);
        actions.push({ type: 'leveler', leveler: levelerMatch, quantity });
        total += levelerMatch.beli * quantity;
        lines.push(`${levelerMatch.emoji || ''} **${levelerMatch.name}** x${quantity}`);
      }
      continue;
    }

    const cardMatches = findMatchingOwnedCards(request.query, user);
    if (!cardMatches.length) continue;
    let remaining = request.amount === 'all' ? MAX_CARD_SELL : Math.min(request.amount, MAX_CARD_SELL);
    for (const card of cardMatches) {
      if (remaining <= 0) break;
      const price = (card.rank === 'D' ? 10 : card.rank === 'C' ? 10 : card.rank === 'B' ? 25 : card.rank === 'A' ? 50 : card.rank === 'S' ? 200 : card.rank === 'SS' ? 750 : card.rank === 'UR' ? 2500 : 0);
      if (price <= 0) continue;
      actions.push({ type: 'card', card, price });
      total += price;
      lines.push(`${card.emoji || ''} **${card.character}** (${card.rank})`);
      remaining -= 1;
    }
  }

  return { actions, total, lines };
}

async function performSell(user, actions) {
  let total = 0;
  const soldLines = [];

  for (const action of actions) {
    if (action.type === 'leveler') {
      const item = user.items.find(i => i.itemId === action.leveler.id);
      if (!item || item.quantity < action.quantity) continue;
      item.quantity -= action.quantity;
      if (item.quantity <= 0) {
        user.items = user.items.filter(i => i.itemId !== action.leveler.id);
      }
      total += action.leveler.beli * action.quantity;
      soldLines.push(`${action.leveler.emoji || ''} **${action.leveler.name}** x${action.quantity}`);
    } else if (action.type === 'card') {
      const ownedIndex = user.ownedCards.findIndex(e => e.cardId === action.card.id);
      if (ownedIndex < 0) continue;
      user.ownedCards.splice(ownedIndex, 1);
      total += action.price;
      soldLines.push(`${action.card.emoji || ''} **${action.card.character}** (${action.card.rank})`);
    }
  }

  user.balance = (user.balance || 0) + total;
  await user.save();
  return { total, soldLines };
}

module.exports = {
  name: 'bulksell',
  description: 'Sell multiple cards or levelers at once',
  options: [{ name: 'query', type: 3, description: 'Items to sell', required: true }],
  async execute({ message, interaction, args }) {
    const raw = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (!raw || !raw.trim()) {
      const reply = 'Please specify what you want to sell.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const segments = splitList(raw);
    const requests = segments.map(parseSegment);
    const plan = buildSellPlan(user, requests);

    if (!plan.actions.length) {
      const reply = 'No sellable items or cards were found for that query.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const token = randomKey();
    pendingBulkSell.set(token, { userId, requests, createdAt: Date.now() });

    const description = `Are you sure you want to sell the following items for **${plan.total}** ¥?\n\n${plan.lines.join('\n')}`;
    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Confirm Bulk Sell')
      .setDescription(description);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bulksell_confirm:${token}:yes`)
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`bulksell_confirm:${token}:no`)
        .setLabel('No')
        .setStyle(ButtonStyle.Secondary)
    );

    if (message) return message.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleButton(interaction, action, token) {
    const session = pendingBulkSell.get(token);
    if (!session) {
      return interaction.reply({ content: 'That sell confirmation has expired.', ephemeral: true });
    }
    if (interaction.user.id !== session.userId) {
      return interaction.reply({ content: 'Only the original user can confirm this sell.', ephemeral: true });
    }

    if (action === 'no') {
      pendingBulkSell.delete(token);
      return interaction.update({ content: 'Bulk sell cancelled.', embeds: [], components: [] });
    }

    const user = await User.findOne({ userId: session.userId });
    if (!user) {
      pendingBulkSell.delete(token);
      return interaction.update({ content: 'Your account could not be found.', embeds: [], components: [] });
    }

    const plan = buildSellPlan(user, session.requests);
    if (!plan.actions.length) {
      pendingBulkSell.delete(token);
      return interaction.update({ content: 'Nothing could be sold. Your inventory may have changed.', embeds: [], components: [] });
    }

    const result = await performSell(user, plan.actions);
    pendingBulkSell.delete(token);

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Bulk Sell Completed')
      .setDescription(`Sold ${result.soldLines.length} item(s) for **${result.total}** ¥.\n\n${result.soldLines.join('\n')}`);

    return interaction.update({ embeds: [embed], components: [] });
  }
};
