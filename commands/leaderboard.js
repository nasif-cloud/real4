const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');

module.exports = {
  name: 'leaderboard',
  description: 'View global leaderboards',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const channel = message ? message.channel : interaction.channel;

    // Fetch all users
    const allUsers = await User.find({});

    // Page 1: Wealth (by balance)
    const wealthRanked = allUsers
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 10);

    // Page 2: Bounty
    const bountyRanked = allUsers
      .sort((a, b) => (b.bounty || 100) - (a.bounty || 100))
      .slice(0, 10);

    // Page 3: Dex (unique cards)
    const dexRanked = allUsers
      .sort((a, b) => (b.ownedCards?.length || 0) - (a.ownedCards?.length || 0))
      .slice(0, 10);

    // prefetch usernames for the top lists
    const client = message ? message.client : interaction.client;
    const idsToFetch = new Set();
    wealthRanked.forEach(u => idsToFetch.add(u.userId));
    bountyRanked.forEach(u => idsToFetch.add(u.userId));
    dexRanked.forEach(u => idsToFetch.add(u.userId));
    const userMap = {};
    await Promise.all(Array.from(idsToFetch).map(id =>
      client.users.fetch(id)
        .then(u => { userMap[id] = u.username; })
        .catch(() => { userMap[id] = id; })
    ));

    // Calculate requester's ranks
    const requesterWealthRank = allUsers
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .findIndex(u => u.userId === userId) + 1;

    const requesterBountyRank = allUsers
      .sort((a, b) => (b.bounty || 100) - (a.bounty || 100))
      .findIndex(u => u.userId === userId) + 1;

    const requesterDexRank = allUsers
      .sort((a, b) => (b.ownedCards?.length || 0) - (a.ownedCards?.length || 0))
      .findIndex(u => u.userId === userId) + 1;

    function buildWealthEmbed() {
      const embed = new EmbedBuilder()
        .setColor('#DDDDDD')
        .setTitle('Global Leaderboard - Wealth')
        .setDescription('Top 10 richest players');

      wealthRanked.forEach((user, index) => {
        const name = userMap[user.userId] || user.userId;
        embed.addFields({
          name: `#${index + 1} - ${name}`,
          value: `**${user.balance || 0}** Beli`,
          inline: false
        });
      });

      embed.setFooter({ text: `Your Rank: #${requesterWealthRank}` });
      return embed;
    }

    function buildBountyEmbed() {
      const embed = new EmbedBuilder()
        .setColor('#CCCCCC')
        .setTitle('Global Leaderboard - Bounty')
        .setDescription('Top 10 most wanted');

      bountyRanked.forEach((user, index) => {
        const name = userMap[user.userId] || user.userId;
        embed.addFields({
          name: `#${index + 1} - ${name}`,
          value: `Bounty: **${user.bounty || 100}**`,
          inline: false
        });
      });

      embed.setFooter({ text: `Your Rank: #${requesterBountyRank}` });
      return embed;
    }

    function buildDexEmbed() {
      const embed = new EmbedBuilder()
        .setColor('#BBBBBB')
        .setTitle('Global Leaderboard - Dex')
        .setDescription('Top 10 card collectors');

      dexRanked.forEach((user, index) => {
        const uniqueCards = user.ownedCards?.length || 0;
        const name = userMap[user.userId] || user.userId;
        embed.addFields({
          name: `#${index + 1} - ${name}`,
          value: `**${uniqueCards}** unique cards`,
          inline: false
        });
      });

      embed.setFooter({ text: `Your Rank: #${requesterDexRank}` });
      return embed;
    }

    let currentPage = 0;
    const embeds = [buildWealthEmbed(), buildBountyEmbed(), buildDexEmbed()];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('leaderboard_prev')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('leaderboard_next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 2)
    );

    let sentMessage;
    if (message) {
      sentMessage = await message.channel.send({ embeds: [embeds[0]], components: [row] });
    } else {
      await interaction.reply({ embeds: [embeds[0]], components: [row] });
      sentMessage = await interaction.fetchReply();
    }

    // Handle button interactions
    const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== userId) {
        return buttonInteraction.reply({ content: 'You can\'t use this button.', ephemeral: true });
      }

      if (buttonInteraction.customId === 'leaderboard_prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (buttonInteraction.customId === 'leaderboard_next') {
        currentPage = Math.min(2, currentPage + 1);
      }

      const newRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('leaderboard_prev')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId('leaderboard_next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 2)
      );

      await buttonInteraction.update({ embeds: [embeds[currentPage]], components: [newRow] });
    });

    collector.on('end', () => {
      // Disable buttons when collector ends
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('leaderboard_prev')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('leaderboard_next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true)
      );
      sentMessage.edit({ components: [disabledRow] }).catch(() => {});
    });
  }
};
