const User = require('../models/User');
const { cards } = require('../data/cards');

module.exports = {
  name: 'autoteam',
  description: 'Automatically choose your best active team (max 3 cards)',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const ownedDefs = (user.ownedCards || [])
      .map(e => cards.find(c => c.id === e.cardId))
      .filter(c => c);

    // start with full list of owned definitions (all cards are allowed)
    let eligibles = ownedDefs.slice();

    // sort by raw power descending
    eligibles.sort((a, b) => b.power - a.power);

    // if the user has no cards at all we can't form a team
    if (eligibles.length === 0) {
      const reply = 'You don\'t have any cards to form a team.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const selected = eligibles.slice(0, 3);
    user.team = selected.map(c => c.id);
    await user.save();

    const reply = 'Your team has been set to the strongest possible cards!';
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};
