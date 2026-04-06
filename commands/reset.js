const User = require('../models/User');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'reset',
  description: 'Reset pulls using a reset token (max 7 pulls)',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    let user = await User.findOne({ userId });
    
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (user.resetTokens <= 0) {
      const reply = 'You don\'t have any **reset tokens**.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // If pulls remaining, show confirmation with buttons
    if (user.pullsRemaining > 0) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('reset_confirm:yes')
          .setLabel('Yes, Use Token')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('reset_confirm:no')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      const confirmMsg = `You have ${user.pullsRemaining} Pulls left. Are you sure you want to use a **Reset Token**?`;
      if (message) {
        return message.reply({ content: confirmMsg, components: [row] });
      }
      return interaction.reply({ content: confirmMsg, components: [row] });
    }

    // If no pulls left, use token directly
    user.resetTokens -= 1;
    user.pullsRemaining = 7;
    user.gems = (user.gems || 0) + 1;
    user.lastReset = new Date();
    await user.save();

    const reply = `Successfully used a **Reset Token**! Pull count has been reset. You gained **1 Gem**.`;
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  },

  async handleButton(interaction, action) {
    const userId = interaction.user.id;
    const confirmed = action === 'yes';

    if (confirmed) {
      let user = await User.findOne({ userId });
      if (!user || user.resetTokens <= 0) {
        return interaction.reply({ content: 'Could not use reset token.', ephemeral: true });
      }

      user.resetTokens -= 1;
      user.pullsRemaining = 7;
      user.gems = (user.gems || 0) + 1;
      user.lastReset = new Date();
      await user.save();

      return interaction.update({ content: `Successfully used a **Reset Token**! Pull count has been reset. You gained **1 Gem**.`, components: [] });
    } else {
      return interaction.update({ content: 'Reset token use cancelled.', components: [] });
    }
  }
};
