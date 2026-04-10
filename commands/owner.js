const User = require('../models/User');
const { cards } = require('../data/cards');
const { OWNER_ID } = require('../config');
const duelCmd = require('./duel');

function parseMention(mention) {
  if (!mention) return null;
  const m = mention.match(/^<@!?(\d+)>$/);
  return m ? m[1] : null;
}

async function list({ message }) {
  if (message.author.id !== OWNER_ID) {
    return message.reply('You are not permitted to run owner commands.');
  }

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setTitle('Owner Commands')
    .setColor(0xFF0000)
    .setDescription('Available prefix commands for the bot owner/developer')
    .addFields(
      { name: 'op owner give <type> <amount> <@user>', value: 'Types: beli, gems, resettoken, card, pack, memerod\n- card uses cardId as amount\n- pack syntax: op owner give pack <crew name> <amount> <@user>\n- memerod syntax: op owner give memerod <@user>', inline: false },
      { name: 'op owner resetdata <@user>', value: 'Deletes the user record so they must /start again', inline: false },
      { name: 'op owner setdrops <#channel>', value: 'Enable card drops in a channel (spawns every 5 min, expires in 10 min)', inline: false },
      { name: 'op owner unsetdrops', value: 'Disable card drops globally', inline: false },
      { name: 'op owner toggleupgrade <on|off>', value: 'Enable/disable upgrade requirements system globally', inline: false },
      { name: 'op owner time <duration>', value: 'Simulate time passing (e.g., op owner time 8h triggers pull reset)', inline: false },
      { name: 'op ownerlist', value: 'Show this list', inline: false }
    );
  return message.channel.send({ embeds: [embed] });
}

async function execute({ message, args }) {
  if (message.author.id !== OWNER_ID) {
    return message.reply('You are not permitted to run owner commands.');
  }

  const sub = args[0];
  if (!sub) {
    return message.reply('Usage: op owner <give|resetdata|toggleupgrade|setdrops> ...');
  }

  if (sub === 'give') {
      const type = args[1];
      if (!type) return message.reply('Usage: op owner give <type> ...');

      let targetId;
      let amt;

      if (type === 'pack') {
        // syntax: give pack <crew> <amount> <@user>
        const crewQuery = args[2];
        amt = parseInt(args[3], 10);
        const mention = args[4];
        targetId = parseMention(mention);
        if (!crewQuery || isNaN(amt) || !targetId) {
          return message.reply('Usage: op owner give pack <crew name> <amount> <@user>');
        }
        // fuzzy match crew name from full list
        const crewList = require('../data/crews').map(c => c.name);
        const match = crewList.find(c => c.toLowerCase().includes(crewQuery.toLowerCase()));
        if (!match) {
          return message.reply(`Crew "${crewQuery}" not recognized.`);
        }
        const crewName = match;
        let target = await User.findOne({ userId: targetId });
        if (!target) return message.reply('Target user does not have an account.');
        target.packInventory = target.packInventory || {};
        target.packInventory[crewName] = (target.packInventory[crewName] || 0) + amt;
        target.markModified('packInventory');
        await target.save();
        return message.reply(`Given ${amt} ${crewName} pack(s) to <@${targetId}>`);
      }

      if (type === 'memerod') {
        const mention = args[2];
        targetId = parseMention(mention);
        if (!targetId) {
          return message.reply('Usage: op owner give memerod <@user>');
        }
        const targetUser = await User.findOne({ userId: targetId });
        if (!targetUser) {
          return message.reply('Target user does not have an account.');
        }
        if (!Array.isArray(targetUser.items)) targetUser.items = [];
        if (targetUser.items.some(i => i.itemId === 'meme_rod')) {
          return message.reply('Target user already has the Meme Rod.');
        }
        targetUser.items.push({ itemId: 'meme_rod', quantity: 1, durability: 3 });
        targetUser.currentRod = 'meme_rod';
        await targetUser.save();
        return message.reply(`Given Meme Rod to <@${targetId}>`);
      }

      // fallback for simple two-arg give
      const amountArg = args[2];
      const mention = args[3];
      targetId = parseMention(mention);
      if (!amountArg || !targetId) {
        return message.reply('Usage: op owner give <type> <amount> <@user>');
      }

      let target = await User.findOne({ userId: targetId });
      if (!target) {
        return message.reply('Target user does not have an account.');
      }

      if (type === 'beli' || type === 'gems') {
        const amtParsed = parseInt(amountArg, 10);
        if (isNaN(amtParsed)) return message.reply('Amount must be a number');
        if (type === 'beli') {
          await User.findOneAndUpdate({ userId: targetId }, { $inc: { balance: amtParsed } });
          return message.reply(`Given ¥${amtParsed} to <@${targetId}>`);
        } else {
          await User.findOneAndUpdate({ userId: targetId }, { $inc: { gems: amtParsed } });
          return message.reply(`Given ${amtParsed} gem(s) to <@${targetId}>`);
        }
      }

      if (type === 'resettoken') {
        const amtParsed = parseInt(amountArg, 10);
        if (isNaN(amtParsed)) return message.reply('Amount must be a number');
        await User.findOneAndUpdate({ userId: targetId }, { $inc: { resetTokens: amtParsed } });
        return message.reply(`Given ${amtParsed} reset token(s) to <@${targetId}>`);
      }

      if (type === 'card') {
        const cardId = amountArg;
        // check existence
        const cardDef = cards.find(c => c.id === cardId);
        if (!cardDef) return message.reply(`No card with id ${cardId} exists`);
        // check ownership first
        if (target.ownedCards.some(e => e.cardId === cardId)) {
          return message.reply('User already owns that card, gift cancelled.');
        }
        target.ownedCards.push({ cardId, level: 1, xp: 0 });
        if (!target.history.includes(cardId)) target.history.push(cardId);
        await target.save();
        return message.reply(`Added card ${cardId} to <@${targetId}>'s collection`);
      }

      return message.reply('Unknown give type; valid types are beli, gems, resettoken, card, pack');
    }
  if (sub === 'resetdata') {
    const mention = args[1];
    const targetId = parseMention(mention);
    if (!targetId) return message.reply('Usage: op owner resetdata <@user>');

    await User.deleteOne({ userId: targetId });
    // Clear any in-memory duel state for this user (pending/active duels)
    if (duelCmd && typeof duelCmd.clearUserState === 'function') {
      duelCmd.clearUserState(targetId);
    }
    return message.reply(`Deleted data for <@${targetId}>`);
  }

  if (sub === 'toggleupgrade') {
    const state = args[1];
    if (!state || !['on', 'off'].includes(state.toLowerCase())) {
      return message.reply('Usage: op owner toggleupgrade <on|off>');
    }

    const enabled = state.toLowerCase() === 'on';
    // Store in a global setting or database; for simplicity, we'll use environment/config
    // For now, store as a flag that can be checked
    const config = require('../config');
    config.upgradeRequirementsEnabled = enabled;
    
    // Also update all existing users; if enabling, set flag to false (not disabled)
    // If disabling, set flag to true (disabled)
    const updateOp = enabled ? { upgradeRequirementsDisabled: false } : { upgradeRequirementsDisabled: true };
    await User.updateMany({}, updateOp);

    const status = enabled ? 'enabled' : 'disabled';
    return message.reply(`Upgrade requirements system ${status} for all users.`);
  }

  if (sub === 'setdrops') {
    const channelMention = args[1];
    if (!channelMention) {
      return message.reply('Usage: op owner setdrops <#channel>');
    }

    // Parse channel mention (e.g., <#1234567890>)
    const channelMatch = channelMention.match(/<#(\d+)>/);
    if (!channelMatch) {
      return message.reply('Invalid channel format. Use: op owner setdrops <#channel>');
    }

    const channelId = channelMatch[1];
    const dropsModule = require('./drops');
    
    try {
      await dropsModule.startDropTimer(message.client, channelId);
      return message.reply(`✅ Card drops enabled in <#${channelId}>! Drops will spawn every 5 minutes and expire after 10 minutes.`);
    } catch (err) {
      console.error('Error setting up drops:', err);
      return message.reply('Failed to set up drops. Make sure the bot can access that channel and that it is a text channel.');
    }
  }

  if (sub === 'unsetdrops') {
    const dropsModule = require('./drops');
    try {
      dropsModule.stopDropTimer();
      return message.reply('✅ Card drops disabled.');
    } catch (err) {
      console.error('Error disabling drops:', err);
      return message.reply('Failed to disable drops.');
    }
  }

  if (sub === 'time') {
    const durationStr = args[1];
    if (!durationStr) {
      return message.reply('Usage: op owner time <duration> (e.g., 8h, 30m, 2d)');
    }

    // Parse duration string (e.g., "8h", "30m", "2d")
    const match = durationStr.match(/^(\d+)([hdm])$/i);
    if (!match) {
      return message.reply('Invalid duration format. Use: <number><h|m|d> (e.g., 8h, 30m, 2d)');
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let milliseconds = 0;
    if (unit === 'h') {
      milliseconds = amount * 60 * 60 * 1000;
    } else if (unit === 'm') {
      milliseconds = amount * 60 * 1000;
    } else if (unit === 'd') {
      milliseconds = amount * 24 * 60 * 60 * 1000;
    }

    // Update pull reset time in file to simulate time passing
    const fs = require('fs');
    const path = require('path');
    const PULL_FILE = path.join(__dirname, '..', 'pull.json');

    try {
      const newTime = Date.now() - milliseconds;
      fs.writeFileSync(PULL_FILE, JSON.stringify({ lastReset: newTime }, null, 2));
      
      // Reset pulls via direct function call
      const User = require('../models/User');
      const { PULL_LIMIT } = require('../config');
      
      await User.updateMany({}, { pullsRemaining: PULL_LIMIT });
      console.log('Pulls reset');
      
      return message.reply(`⏰ Simulated ${amount}${unit.toUpperCase()} passing. Pulls reset!`);
    } catch (err) {
      console.error('Error simulating time:', err);
      return message.reply('Failed to simulate time passing.');
    }
  }

  return message.reply('Unrecognized owner subcommand.');
}

module.exports = { list, execute };
