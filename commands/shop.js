const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'shop',
  description: 'View the shop',
  async execute({ message, interaction }) {
    const discordUser = message ? message.author : interaction.user;
    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Shop')
      .setImage('https://files.catbox.moe/canva-shop-menu.png') // Replace with actual Canva menu image URL
      .setAuthor({ name: discordUser.username, iconURL: discordUser.displayAvatarURL() });

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};
