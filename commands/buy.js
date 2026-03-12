const User = require('../models/User');
const { EmbedBuilder } = require('discord.js');
const { getCurrentStock, getPricing, decrementStock } = require('../src/stock');
const crews = require('../data/crews');

// Simple fuzzy matching function
function fuzzyMatch(query, candidates) {
  const q = query.toLowerCase();
  let best = null;
  let bestScore = -Infinity;

  candidates.forEach(candidate => {
    const c = candidate.toLowerCase();
    let score = 0;

    // Exact match gets highest score
    if (c === q) {
      score = 1000;
    } else if (c.includes(q)) {
      // Substring match
      score = 100;
    } else {
      // Fuzzy match: count matching characters in order
      let qIdx = 0;
      for (let i = 0; i < c.length && qIdx < q.length; i++) {
        if (c[i] === q[qIdx]) {
          score += 10;
          qIdx++;
        }
      }
      // Only consider if we matched at least half the query
      if (qIdx < q.length / 2) {
        score = -1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return bestScore > 0 ? best : null;
}

const SHOP_ITEMS = {
  'reset token': { name: 'Reset Token', cost: 250, type: 'item' }
};

module.exports = {
  name: 'buy',
  description: 'Buy an item or pack from the shop',
  options: [{ name: 'item', type: 3, description: 'Item or pack name', required: true }, { name: 'amount', type: 4, description: 'Amount (default 1)', required: false }],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    let amount = 1;
    let itemQuery;
    if (message) {
      // check if last arg is a number
      const last = args[args.length - 1];
      const parsed = parseInt(last, 10);
      if (!isNaN(parsed)) {
        amount = parsed;
        itemQuery = args.slice(0, -1).join(' ');
      } else {
        itemQuery = args.join(' ');
      }
    } else {
      itemQuery = interaction.options.getString('item');
      amount = interaction.options.getInteger('amount') || 1;
    }

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check for shop items first
    let item = null;
    let itemKey = fuzzyMatch(itemQuery, Object.keys(SHOP_ITEMS));
    if (itemKey) {
      item = SHOP_ITEMS[itemKey];
    } else {
      // Check for crew packs
      const stock = getCurrentStock();
      const crewNames = stock.map(c => c.name);
      const matchedCrew = fuzzyMatch(itemQuery, crewNames);
      if (matchedCrew) {
        const crew = stock.find(c => c.name === matchedCrew);
        item = {
          name: `${crew.name} Pack`,
          cost: getPricing()[crew.rank],
          type: 'pack',
          crew: crew
        };
      }
    }

    if (!item) {
      const available = Object.keys(SHOP_ITEMS).concat(getCurrentStock().map(c => c.name));
      const reply = `Item "${itemQuery}" not found. Available: ${available.join(', ')}`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const totalCost = item.cost * amount;

    // ensure packInventory exists
    user.packInventory = user.packInventory || {};

    // Currency check / deduction
    let costCurrency = 'Gems';
    if (item.type === 'pack') {
      // gem purchase
      if ((user.gems || 0) < totalCost) {
        const reply = `You need **${totalCost}** Gems to buy ${amount}x ${item.name}. You only have **${user.gems || 0}** Gems.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
      // For packs, check limit on user
      const currentCount = user.packInventory[item.crew.name] || 0;
      if (currentCount + amount > 5) {
        const reply = `You can only buy up to 5 ${item.crew.name} packs per stock cycle. You already have ${currentCount}.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
      // check global stock
      const { decrementStock } = require('../src/stock');
      if (!decrementStock(item.crew.name, amount)) {
        const reply = `Not enough stock remaining for ${item.crew.name} packs.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
      // deduct user gems and add packs
      user.gems -= totalCost;
      user.packInventory[item.crew.name] = (user.packInventory[item.crew.name] || 0) + amount;
      user.markModified('packInventory');
    } else {
      // non-pack items are beli
      costCurrency = 'Beli';
      if ((user.balance || 0) < totalCost) {
        const reply = `You need **${totalCost}** Beli to buy ${amount}x ${item.name}. You only have **${user.balance || 0}** Beli.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
      user.balance -= totalCost;
      if (itemKey === 'reset token') {
        user.resetTokens = (user.resetTokens || 0) + amount;
      }
    }
    await user.save();

    const reply = `Successfully purchased **${amount}x ${item.name}** for **${totalCost}** ${costCurrency}!`;
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};
