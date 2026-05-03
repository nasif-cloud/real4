const User = require('../models/User');
const duelCmd = require('./duel');
const isailCmd = require('./isail');

module.exports = {
  name: 'forfeit',
  description: 'Forfeit your currentbattle',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const user = await User.findOne({ userId });
    const displayName = message ? message.author.username : (interaction ? interaction.user.username : `<@${userId}>`);
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check for active duel
    let state = null;
    let isDuel = false;
    if (duelCmd && duelCmd.duelStates) {
      for (const [msgId, s] of duelCmd.duelStates) {
        // duel state stores player1Id/player2Id
        if ((s.player1Id && s.player1Id === userId) || (s.player2Id && s.player2Id === userId)) {
          state = s;
          isDuel = true;
          break;
        }
      }
    }

    // Check for active isail
    if (!state && isailCmd && isailCmd.battleStates) {
      for (const [msgId, s] of isailCmd.battleStates) {
        // older states may have s.player, newer use s.userId
        if ((s.player && s.player.id === userId) || s.userId === userId) {
          state = s;
          isDuel = false;
          break;
        }
      }
    }

    if (!state) {
      const reply = 'You are not in an active battle.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Forfeit logic
    if (isDuel) {
      // Use player1Id/player2Id to determine winner/loser
      if (!state.player1Id || !state.player2Id) {
        const reply = 'Invalid duel state.';
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
      const winnerId = state.player1Id === userId ? state.player2Id : state.player1Id;
      const loserId = state.player1Id === userId ? state.player1Id : state.player2Id;

      // Load user documents for bounty updates
      const winnerUser = await User.findOne({ userId: winnerId });
      const loserUser = await User.findOne({ userId: loserId });

      state.finished = true;
      state.winnerId = winnerId;
      state.loserId = loserId;

      // resolve display names from discord users if available
      const winnerName = (state.discordUser1 && state.discordUser1.id === winnerId) ? state.discordUser1.username : (state.discordUser2 && state.discordUser2.id === winnerId) ? state.discordUser2.username : `<@${winnerId}>`;
      const loserName = (state.discordUser1 && state.discordUser1.id === loserId) ? state.discordUser1.username : (state.discordUser2 && state.discordUser2.id === loserId) ? state.discordUser2.username : `<@${loserId}>`;
      state.lastAction = `${loserName} forfeited. ${winnerName} wins!`;

      // Update bounty if applicable (mirror duel logic)
      if (winnerUser && loserUser) {
        const winnerBounty = winnerUser.bounty || 100;
        const loserBounty = loserUser.bounty || 100;
        let bountyGain = 0;
        if (loserBounty > winnerBounty) {
          if (loserBounty > winnerBounty * 3) {
            bountyGain = 0;
          } else {
            bountyGain = Math.floor(loserBounty * 0.03);
          }
        }
        if (bountyGain > 0) {
          winnerUser.bounty = (winnerUser.bounty || 100) + bountyGain;
          await winnerUser.save();
          try {
            const { checkAndAwardAll } = require('../utils/achievements');
            await checkAndAwardAll(winnerUser, message ? message.client : interaction.client, { event: 'bounty_gain', amount: bountyGain });
          } catch (err) {
            console.error('Achievement check after bounty gain failed', err);
          }
        }
        // Clear cooldowns on winner
        winnerUser.bountyCooldownUntil = null;
        await winnerUser.save();
      }

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('Duel Forfeited')
        .setDescription(`${loserName} forfeited.\n${winnerName} wins!`)
        .setColor('#ff0000');

      if (message) return message.channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    } else {
      // Isail forfeit
      state.finished = true;
      state.lastUserAction = `${displayName} forfeited.`;

      // Clean up battle state from the map to prevent blocking future sails
      for (const [msgId, s] of isailCmd.battleStates) {
        if (s && s.userId === userId) {
          isailCmd.battleStates.delete(msgId);
        }
      }

      // Clear any inactivity timeout
      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('Sail forfeited')
        .setDescription(`${displayName} forfeited the sail battle.`)
        .setColor('#ff8686');

      if (message) return message.channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }
  }
};