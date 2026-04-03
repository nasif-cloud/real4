const { EmbedBuilder } = require('discord.js');
const { getStockCountdownString, getPullCountdownString } = require('../src/stock');

module.exports = {
  name: 'timers',
  description: 'View all global timers',
  async execute({ message, interaction }) {
    const stockTimer = getStockCountdownString();
    const pullTimer = getPullCountdownString();

    const text = `**<:timer:1489385667858268301> Global timers**\n• **stock reset:** ${stockTimer}\n• **pull reset:** ${pullTimer}`;

    if (message) return message.channel.send(text);
    return interaction.reply(text);
  }
};
