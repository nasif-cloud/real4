const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'shop',
  description: 'View the shop',
  async execute({ message, interaction }) {
    const embed = new EmbedBuilder()
      .setTitle('Shop')
      .setImage('https://files.catbox.moe/canva-shop-menu.png'); // Replace with actual Canva menu image URL

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};
