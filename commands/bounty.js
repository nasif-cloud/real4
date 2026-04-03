const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const duelCmd = require('./duel');
const { OWNER_ID } = require('../config');

function formatRelativeTime(futureDate) {
  const now = new Date();
  const diff = futureDate - now;
  if (diff <= 0) return 'now';
  
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

module.exports = {
  name: 'bounty',
  description: 'Claim a bounty on a random player',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const username = message ? message.author.username : interaction.user.username;
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();

    // Owner is immune to cooldowns
    if (userId === OWNER_ID) {
      let requester = await User.findOne({ userId });
      if (!requester) {
        const reply = 'You don\'t have an account. Run `op start` or /start to register.';
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
      requester.activeBountyTarget = null;
      requester.bountyCooldownUntil = null;
      await requester.save();
    }

    let requester = await User.findOne({ userId });
    if (!requester) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check if user has active bounty or cooldown
    if (requester.activeBountyTarget) {
      const targetDiscord = await (message ? message.client.users.fetch(requester.activeBountyTarget) : interaction.client.users.fetch(requester.activeBountyTarget)).catch(() => null);
      const targetName = targetDiscord ? targetDiscord.username : 'Unknown';
      const reply = `You can not claim a new bounty until you defeat **${targetName}**.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }
    if (requester.bountyCooldownUntil && requester.bountyCooldownUntil > new Date()) {
      const timeLeft = formatRelativeTime(requester.bountyCooldownUntil);
      const reply = `You can not claim a new bounty until your cooldown of ${timeLeft} resets.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const requesterBounty = requester.bounty || 100;

    // Find opponents with bounty between 0.5x and 2x, but not exactly half or double
    const minBounty = Math.floor(requesterBounty / 2) + 1;
    const maxBounty = Math.ceil(requesterBounty * 2) - 1;

    const candidates = await User.find({
      userId: { $ne: userId },
      bounty: { $gte: minBounty, $lte: maxBounty }
    });

    if (candidates.length === 0) {
      const reply = `No suitable bounty targets found. Targets must have bounty between **${minBounty}** and **${maxBounty}**.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Pick a random opponent
    const opponent = candidates[Math.floor(Math.random() * candidates.length)];

    // Fetch the opponent's Discord profile for proper username/avatar display
    const opponentDiscord = await (message ? message.client.users.fetch(opponent.userId) : interaction.client.users.fetch(opponent.userId)).catch(() => null);
    const opponentName = opponentDiscord ? opponentDiscord.username : 'Unknown';
    const opponentAvatar = opponentDiscord ? opponentDiscord.displayAvatarURL() : avatarUrl;

    // Set active bounty / cooldown
    requester.activeBountyTarget = opponent.userId;
    requester.bountyCooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await requester.save();

    // Reward preview (based on target bounty)
    const targetBounty = opponent.bounty || 100;
    const rewardXP = Math.floor(targetBounty / 10);
    const rewardBeli = Math.floor(targetBounty / 2);

    // Create bounty embed (matches provided screenshot style)
    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Bounty Challenge')
      .setDescription(`Defeat **${opponentName}** in a duel to claim 2x the reward!`)
      .addFields(
        { name: 'Rewards', value: `• Bounty: ¥${targetBounty}\n• Beli: ¥${rewardBeli}\n• XP: ${rewardXP}`, inline: false }
      )
      .setImage('https://i.pinimg.com/1200x/65/7c/06/657c066ce2b36625b6d56398128150fb.jpg')
      .setFooter({ text: 'Expires in a day' })
      .setAuthor({ name: username, iconURL: avatarUrl });

    const infoButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bounty:info')
        .setLabel('View Target Info')
        .setStyle(ButtonStyle.Primary)
    );

    let msg;
    if (message) {
      msg = await message.reply({ embeds: [embed], components: [infoButton] });
    } else {
      msg = await interaction.reply({ embeds: [embed], components: [infoButton], fetchReply: true });
    }

    // Disable buttons after 24 hours
    setTimeout(() => {
      embed.setFooter({ text: 'Expired' });
      msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }, 24 * 60 * 60 * 1000);
  },

  async handleButton(interaction, rawAction) {
    if (rawAction === 'info') {
      const userId = interaction.user.id;
      const requester = await User.findOne({ userId });
      if (!requester || !requester.activeBountyTarget) {
        return interaction.reply({ content: 'No active bounty found.', ephemeral: true });
      }

      const targetDiscord = await interaction.client.users.fetch(requester.activeBountyTarget).catch(() => null);
      if (!targetDiscord) {
        return interaction.reply({ content: 'Could not fetch target user.', ephemeral: true });
      }

      const { buildUserProfileEmbed } = require('./user');
      const profileEmbed = await buildUserProfileEmbed(requester.activeBountyTarget, targetDiscord);
      if (!profileEmbed) {
        return interaction.reply({ content: 'Target does not have an account.', ephemeral: true });
      }

      await interaction.deferUpdate();
      await interaction.followUp({ embeds: [profileEmbed] });
    }
  }
};
