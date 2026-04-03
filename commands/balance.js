const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');

module.exports = {
  name: 'balance',
  description: "Show your current Beli and reset tokens",
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

    const balance = user.balance || 0;
    const resetTokens = user.resetTokens || 0;

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`${username}'s Balance`)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: '**Balance**', value: `¥ ${balance}\n<:gem:1479922885161128017> ${user.gems || 0}`, inline: false },
        { name: '**Reset Tokens**', value: `<:reset:1483825882341703692> ${resetTokens}`, inline: false }
      );

    const shopButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('balance:shop')
        .setLabel('Shop')
        .setEmoji('<:shop:1483823263091265777>')
        .setStyle(ButtonStyle.Primary)
    );

    let msg;
    if (message) {
      msg = await message.channel.send({ embeds: [embed], components: [shopButton] });
    } else {
      msg = await interaction.reply({ embeds: [embed], components: [shopButton], fetchReply: true });
    }

    setTimeout(() => {
      embed.setFooter({ text: 'Expired' });
      msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }, 180000);
  },

  async handleButton(interaction, rawAction) {
    if (rawAction === 'shop') {
      const discordUser = interaction.user;
      const shopEmbed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle('Shop')
        .setImage('https://files.catbox.moe/canva-shop-menu.png')
        .setAuthor({ name: discordUser.username, iconURL: discordUser.displayAvatarURL() });
      await interaction.deferUpdate();
      await interaction.followUp({ embeds: [shopEmbed] });
    }
  }
};