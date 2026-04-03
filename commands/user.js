const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { cards: cardDefs } = require('../data/cards');

module.exports = {
  name: 'user',
  description: 'View a user\'s profile',
  options: [{ name: 'target', type: 6, description: 'User to view (optional)', required: false }],
  async execute({ message, interaction }) {
    const targetId = message ? (message.mentions.users.first()?.id || message.author.id) : (interaction.options.getUser('target')?.id || interaction.user.id);
    const targetUser = message ? (message.mentions.users.first() || message.author) : (interaction.options.getUser('target') || interaction.user);
    const username = targetUser.username;
    const avatarUrl = targetUser.displayAvatarURL();

    let user = await User.findOne({ userId: targetId });
    if (!user) {
      const reply = `**${username}** doesn't have an account.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Calculate unique cards count
    const uniqueCardsCount = user.ownedCards ? user.ownedCards.length : 0;
    const totalCardsCount = cardDefs.filter(c => c.pullable).length;

    // Calculate ranks
    const allUsers = await User.find({});
    
    // Wealth rank (by balance)
    const wealthRank = allUsers
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .findIndex(u => u.userId === targetId) + 1;
    
    // Bounty rank (by bounty)
    const bountyRank = allUsers
      .sort((a, b) => (b.bounty || 100) - (a.bounty || 100))
      .findIndex(u => u.userId === targetId) + 1;
    
    // Dex rank (by unique cards)
    const dexRank = allUsers
      .sort((a, b) => (b.ownedCards?.length || 0) - (a.ownedCards?.length || 0))
      .findIndex(u => u.userId === targetId) + 1;

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`${username}'s Profile`)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: 'Bounty', value: `¥${user.bounty || 100}`, inline: true },
        { name: '**Rankings**', value: `Wealth: #${wealthRank}\nBounty: #${bountyRank}\nDex: #${dexRank}`, inline: false },
        { name: '**Statistics**', value: `Total Pulls: **${user.totalPulls || 0}**\nUnique Cards: **${uniqueCardsCount}** / ${totalCardsCount}`, inline: false }
      );

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};

module.exports.buildUserProfileEmbed = async function (targetId, discordUser) {
  const user = await User.findOne({ userId: targetId });
  if (!user) return null;

  const username = discordUser.username;
  const avatarUrl = discordUser.displayAvatarURL();

  const uniqueCardsCount = user.ownedCards ? user.ownedCards.length : 0;
  const totalCardsCount = cardDefs.filter(c => c.pullable).length;

  const allUsers = await User.find({});
  const wealthRank = allUsers
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .findIndex(u => u.userId === targetId) + 1;
  const bountyRank = allUsers
    .sort((a, b) => (b.bounty || 100) - (a.bounty || 100))
    .findIndex(u => u.userId === targetId) + 1;
  const dexRank = allUsers
    .sort((a, b) => (b.ownedCards?.length || 0) - (a.ownedCards?.length || 0))
    .findIndex(u => u.userId === targetId) + 1;

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setTitle(`${username}'s Profile`)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: 'Bounty', value: `¥${user.bounty || 100}`, inline: true },
      { name: '**Rankings**', value: `Wealth: #${wealthRank}\nBounty: #${bountyRank}\nDex: #${dexRank}`, inline: false },
      { name: '**Statistics**', value: `Total Pulls: **${user.totalPulls || 0}**\nUnique Cards: **${uniqueCardsCount}** / ${totalCardsCount}`, inline: false }
    );

  return embed;
};
