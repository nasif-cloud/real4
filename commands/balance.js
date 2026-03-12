const User = require('../models/User');

module.exports = {
  name: 'balance',
  description: "Show your current Beli and reset tokens",
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const balance = user.balance || 0;
    const resetTokens = user.resetTokens || 0;

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`${username}'s Balance`)
      .setThumbnail(message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL())
      .addFields(
        { name: '**Balance**', value: `¥ ${balance}\n<:gem:1479922885161128017> ${user.gems || 0}`, inline: false },
        { name: '**Reset Tokens**', value: `${resetTokens}`, inline: false }
      );

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};