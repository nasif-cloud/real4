const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');

function parseTargetIdFromArgs(args) {
  if (!args || args.length === 0) return null;
  const first = args[0];
  const mentionMatch = first.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d{17,19}$/.test(first)) return first;
  return null;
}

module.exports = {
  name: 'balance',
  description: "Show your current Beli and reset tokens",
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const targetId = message ? parseTargetIdFromArgs(args) || userId : interaction.options.getUser('target')?.id || userId;
    const discordUser = message ? message.author : interaction.user;
    let targetUser = discordUser;
    let username = discordUser.username;
    let avatarUrl = discordUser.displayAvatarURL();
    if (message && targetId !== userId) {
      targetUser = await message.client.users.fetch(targetId).catch(() => null) || targetUser;
      username = targetUser.username || username;
      avatarUrl = targetUser.displayAvatarURL ? targetUser.displayAvatarURL() : avatarUrl;
    } else if (!message && targetId !== userId) {
      const targetOption = interaction.options.getUser('target');
      if (targetOption) {
        targetUser = targetOption;
        username = targetUser.username;
        avatarUrl = targetUser.displayAvatarURL();
      }
    }
    let user = await User.findOne({ userId: targetId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.channel.send(reply);
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
        .setCustomId(`balance:shop:${userId}`)
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
    const [action, userId] = rawAction.split(':');
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: 'This is not your embed.', ephemeral: true });
    }
    if (action === 'shop') {
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