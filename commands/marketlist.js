const User = require('../models/User');
const MarketListing = require('../models/MarketListing');
const { searchCards, formatCardId, getCardById } = require('../utils/cards');

const BELI_EMOJI = '<:beri:1490738445319016651>';
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function formatPrice(price) {
  return price.toLocaleString('en-US').replace(/,/g, "'");
}

async function execute({ message, interaction, args }) {
  const userId = message ? message.author.id : interaction.user.id;
  const username = message ? message.author.username : interaction.user.username;
  const reply = (content) => message ? message.reply(content) : interaction.reply({ content, ephemeral: true });

  const rawArgs = args || [];
  const cardQuery = rawArgs[0];
  const priceArg = rawArgs[1];

  if (!cardQuery || !priceArg) {
    return reply('Usage: `op marketlist <card ID or name> <price>`\nExample: `op marketlist 0001 5000`');
  }

  const price = parseInt(priceArg.replace(/[',]/g, ''), 10);
  if (isNaN(price) || price < 1) {
    return reply('Invalid price. Please enter a positive number.');
  }
  if (price > 999_999_999) {
    return reply('Price cannot exceed 999,999,999 Beli.');
  }

  const user = await User.findOne({ userId });
  if (!user) return reply('You need to start first. Use `op start`');

  const results = searchCards(cardQuery);
  if (!results || !results.length) {
    return reply(`No cards found matching **"${cardQuery}"**.`);
  }

  let cardDef = null;
  let ownedEntry = null;

  for (const match of results) {
    const entry = user.ownedCards.find(e => e.cardId === match.id);
    if (entry) {
      cardDef = match;
      ownedEntry = entry;
      break;
    }
  }

  if (!cardDef || !ownedEntry) {
    return reply(`You don't own any card matching **"${cardQuery}"**.`);
  }

  const alreadyListed = await MarketListing.findOne({
    sellerId: userId,
    cardId: cardDef.id,
    expiresAt: { $gt: new Date() },
  });
  if (alreadyListed) {
    return reply(`You already have a listing for **${cardDef.character}** on the market! Cancel it first by using \`op marketlistings\`.`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TWO_WEEKS_MS);

  await MarketListing.create({
    sellerId: userId,
    sellerName: username,
    cardId: cardDef.id,
    cardName: cardDef.character,
    cardEmoji: cardDef.emoji || '',
    cardRank: cardDef.rank || 'D',
    cardAttribute: cardDef.attribute || '',
    price,
    level: ownedEntry.level || 1,
    starLevel: ownedEntry.starLevel || 0,
    createdAt: now,
    expiresAt,
  });

  const starStr = (ownedEntry.starLevel || 0) > 0 ? ` ${'⭐'.repeat(ownedEntry.starLevel)}` : '';
  return reply(
    `✅ Listed **${cardDef.emoji ? cardDef.emoji + ' ' : ''}${cardDef.character}**${starStr} (Lvl. ${ownedEntry.level || 1}) for **${formatPrice(price)}** ${BELI_EMOJI}!\nListing expires in 2 weeks. Use \`op market\` to view all listings.`
  );
}

module.exports = { execute };
