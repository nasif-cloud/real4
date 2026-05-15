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

    // Reply immediately — achievement check runs in background so there's no delay
    const reply = 'Your team has been set to the strongest possible cards!';
    const replyPromise = message ? message.reply(reply) : interaction.reply({ content: reply });

    // Fire-and-forget achievement check (do not await)
    try {
      const { checkAndAwardAll } = require('../utils/achievements');
      const client = message ? message.client : interaction.client;
      checkAndAwardAll(user, client, { event: 'team' }).catch(err =>
        console.error('Error checking achievements after autoteam', err)
      );
    } catch (err) {
      console.error('Error initiating achievement check after autoteam', err);
    }

    return replyPromise;
  }
};
