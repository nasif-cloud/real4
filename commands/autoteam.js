const User = require('../models/User');
const { selectAutoTeam } = require('../utils/autoteam');

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

    const selectedIds = selectAutoTeam(user, 3);
    if (!selectedIds || selectedIds.length === 0) {
      const reply = 'You don\'t have any eligible cards to form a team.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    user.team = selectedIds;
    await user.save();

    // check achievements for team power after auto-team set
    try {
      const { checkAndAwardAll } = require('../utils/achievements');
      await checkAndAwardAll(user, message ? message.client : interaction.client, { event: 'team' });
    } catch (err) {
      console.error('Error checking achievements after autoteam', err);
    }

    const reply = 'Your team has been set to the strongest possible cards!';
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};
