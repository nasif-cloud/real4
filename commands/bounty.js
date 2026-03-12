const User = require('../models/User');
const { EmbedBuilder } = require('discord.js');
const duelCmd = require('./duel');

module.exports = {
  name: 'bounty',
  description: 'Find a random player to duel for bounty',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;

    let requester = await User.findOne({ userId });
    if (!requester) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const requesterBounty = requester.bounty || 100;

    // Find all users with bounty in range (±50% of requester's bounty)
    const minBounty = Math.floor(requesterBounty * 0.5);
    const maxBounty = Math.ceil(requesterBounty * 1.5);

    const candidates = await User.find({
      userId: { $ne: userId },
      bounty: { $gte: minBounty, $lte: maxBounty }
    });

    if (candidates.length === 0) {
      const reply = `No players found with bounty between **${minBounty}** and **${maxBounty}**. Try again later!`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Pick a random opponent
    const opponent = candidates[Math.floor(Math.random() * candidates.length)];

    // Create a bounty challenge embed
    const embed = new EmbedBuilder()
      .setColor('#FF6B00')
      .setTitle('Bounty Challenge!')
      .setDescription(`**${username}** challenges a player with Bounty: **${opponent.bounty || 100}**`);

    if (message) return message.reply({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};
