const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  name: 'inventory',
  description: 'Show your items and packs',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const username = message ? message.author.username : interaction.user.username;
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const items = (user.items || []).map(i => `${i.itemId} x${i.quantity}`).join('\n') || 'None';
    const packsObj = user.packInventory || {};
    const packs = Object.keys(packsObj).length
      ? Object.entries(packsObj).map(([name, qty]) => `${name} x${qty}`).join('\n')
      : 'None';

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`${username}'s Inventory`)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: 'Items', value: items, inline: false },
        { name: 'Packs', value: packs, inline: false }
      );

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};
