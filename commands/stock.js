const { EmbedBuilder } = require('discord.js');
const { getCurrentStock, getCountdownString, getPricing } = require('../src/stock');

module.exports = {
  name: 'stock',
  description: 'View current pack stock',
  async execute({ message, interaction }) {
    const stock = getCurrentStock();
    const countdown = getCountdownString();

    const embed = new EmbedBuilder()
      .setTitle('Pack Stock')
      .setDescription(`Current available packs. Resets in: ${countdown}`)
      .setColor('#FFFFFF');

    stock.forEach(crew => {
      const price = getPricing()[crew.rank];
      embed.addFields({
        name: `${crew.icon} ${crew.name}`,
        value: `Rank: ${crew.rank} | Price: ${price} Gems | Stock: ${crew.quantity}x`,
        inline: false
      });
    });

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};