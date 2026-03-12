const { EmbedBuilder } = require('discord.js');
const { findBestOwnedCard, getCardById } = require('../utils/cards');
const User = require('../models/User');

const SELL_PRICES = {
  D: 10,
  C: 10,
  B: 25,
  A: 50,
  S: 200,
  SS: 750,
  UR: 2500
};

module.exports = {
  name: 'sell',
  description: 'Sell a card for currency based on its rank',
  options: [
    { name: 'query', type: 3, description: 'Card name', required: true }
  ],
  async execute({ message, interaction, args }) {
    const query = interaction ? interaction.options.getString('query') : args.join(' ');
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (!query) {
      const reply = 'Please specify a card name.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const card = await findBestOwnedCard(userId, query);
    if (!card) {
      const reply = `That isn't a card.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check if card is on team
    if (user.team && user.team.includes(card.id)) {
      const reply = `You can't sell **${card.character}** while they're on your team.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Find the owned entry
    const ownedEntry = user.ownedCards.find(e => e.cardId === card.id);
    if (!ownedEntry) {
      const reply = `You don't own that card.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const price = SELL_PRICES[card.rank] || 0;
    user.ownedCards = user.ownedCards.filter(e => e.cardId !== card.id);
    user.balance = (user.balance || 0) + price;
    await user.save();

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Card Sold!')
      .setDescription(`Sold **${card.character}** (${card.rank}) for **${price}** currency`)
      .setThumbnail(card.image_url);

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};
