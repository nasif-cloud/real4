const User = require('../models/User');
const { cards } = require('../data/cards');
const { getCardById, formatCardId } = require('../utils/cards');
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
      { name: 'op owner give <type> <amount> <@user>', value: 'Types: beli, gems, bounty, resettoken, card, pack, memerod, item\n- card uses cardId as amount\n- pack syntax: op owner give pack <crew name> <amount> <@user>\n- memerod syntax: op owner give memerod <@user>', inline: false },
      { name: 'op owner removecard <cardId> <@user>', value: 'Remove all copies of a card from a user', inline: false },
      { name: 'op owner setresets <#channel>', value: 'Configure a channel to receive pull reset notifications', inline: false },
      { name: 'op owner resetdata <@user>', value: 'Deletes the user record so they must /start again', inline: false },
      { name: 'op owner setdrops <#channel> <value>', value: 'Enable card drops in a channel and set messages needed per drop (default 100)', inline: false },
      { name: 'op owner unsetdrops <#channel>', value: 'Disable card drops in the specified channel', inline: false },
      { name: 'op owner activedrops', value: 'List active drops and per-channel progress (e.g., 37/100)', inline: false },
      { name: 'op owner dropparty <#channel> <amount>', value: 'Spawn <amount> drops immediately in the specified channel', inline: false },
      { name: 'op owner ship <@user>', value: 'View the user\'s active ship info', inline: false },
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
    return message.reply('Usage: op owner <give|resetdata|setdrops> ...');
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

      if (type === 'masscards') {
        // syntax: op owner give masscards <faculty> <@user>
        const facultyQuery = args[2];
        const mention = args[3];
        targetId = parseMention(mention);
        if (!facultyQuery || !targetId) return message.reply('Usage: op owner give masscards <faculty> <@user>');
        const facultyKey = facultyQuery.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const { cards } = require('../data/cards');
        const matches = cards.filter(c => c.faculty && c.faculty.toLowerCase().replace(/[^a-z0-9]+/g, '') === facultyKey);
        if (!matches.length) return message.reply(`No cards found for faculty ${facultyQuery}`);
        let target = await User.findOne({ userId: targetId });
        if (!target) return message.reply('Target user does not have an account.');
        target.ownedCards = target.ownedCards || [];
        for (const def of matches) {
          if (!target.ownedCards.some(e => e.cardId === def.id)) {
            target.ownedCards.push({ cardId: def.id, level: 1, xp: 0 });
          }
          if (!target.history.includes(def.id)) target.history.push(def.id);
        }
        await target.save();
        // run achievement checks for the target
        try {
          const { checkAndAwardAll } = require('../utils/achievements');
          await checkAndAwardAll(target, message.client, { event: 'masscards', faculty: facultyKey });
        } catch (err) {
          console.error('Achievement check after masscards failed', err);
        }
        return message.reply(`Added ${matches.length} cards from faculty ${facultyQuery} to <@${targetId}>`);
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

      if (type === 'chest' || type === 'chests') {
        // syntax: op owner give chest <chest name|id> <amount> <@user>
        const chestQuery = args[2];
        const amtParsed = parseInt(args[3], 10);
        const mentionChest = args[4];
        targetId = parseMention(mentionChest);
        if (!chestQuery || isNaN(amtParsed) || !targetId) return message.reply('Usage: op owner give chest <chest> <amount> <@user>');
        const { getChestByQuery, getChestById } = require('../data/chests');
        const chestDef = getChestByQuery(chestQuery) || getChestById(chestQuery);
        if (!chestDef) return message.reply(`Chest type "${chestQuery}" not recognized.`);
        let tgt = await User.findOne({ userId: targetId });
        if (!tgt) return message.reply('Target user does not have an account.');
        tgt.items = tgt.items || [];
        const existing = tgt.items.find(it => it.itemId === chestDef.id);
        if (existing) existing.quantity += amtParsed;
        else tgt.items.push({ itemId: chestDef.id, quantity: amtParsed });
        await tgt.save();
        return message.reply(`Given ${amtParsed} ${chestDef.name}(s) to <@${targetId}>`);
      }

      if (type === 'item') {
        // syntax: op owner give item <itemId> <amount> <@user>
        const itemId = args[2];
        const amtParsed = parseInt(args[3], 10);
        const mention = args[4];
        targetId = parseMention(mention);
        if (!itemId || isNaN(amtParsed) || !targetId) return message.reply('Usage: op owner give item <itemId> <amount> <@user>');
        let tgt = await User.findOne({ userId: targetId });
        if (!tgt) return message.reply('Target user does not have an account.');
        tgt.items = tgt.items || [];
        const existing = tgt.items.find(it => it.itemId === itemId);
        if (existing) existing.quantity += amtParsed;
        else tgt.items.push({ itemId, quantity: amtParsed });
        await tgt.save();
        return message.reply(`Given ${amtParsed} ${itemId}(s) to <@${targetId}>`);
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

      // Give bounty amount directly
      if (type === 'bounty') {
        const amtParsed = parseInt(amountArg, 10);
        if (isNaN(amtParsed)) return message.reply('Amount must be a number');
        await User.findOneAndUpdate({ userId: targetId }, { $inc: { bounty: amtParsed } });
        return message.reply(`Given ${amtParsed} bounty to <@${targetId}>`);
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
        const cardDef = getCardById(cardId);
        if (!cardDef) return message.reply(`No card with id ${formatCardId(cardId)} exists`);
        // check ownership first
        if (target.ownedCards.some(e => e.cardId === cardDef.id)) {
          return message.reply('User already owns that card, gift cancelled.');
        }
        const actualCardId = cardDef.id;
        target.ownedCards.push({ cardId: actualCardId, level: 1, xp: 0 });
        if (!target.history.includes(actualCardId)) target.history.push(actualCardId);
        await target.save();
        // check achievements for the receiver (e.g., UR card / faculty completion)
        try {
          const { checkAndAwardAll } = require('../utils/achievements');
          await checkAndAwardAll(target, message.client, { event: 'owner_give_card', cardId: actualCardId });
        } catch (err) {
          console.error('Achievement check after owner give card failed', err);
        }
        return message.reply(`Added card ${formatCardId(actualCardId)} to <@${targetId}>'s collection`);
      }

      return message.reply('Unknown give type; valid types are beli, gems, resettoken, card, pack');
    }
  if (sub === 'resetdata') {
    const subArg = args[1];
    if (!subArg) return message.reply('Usage: op owner resetdata <@user> | op owner resetdata all');

    // Handle global reset request with confirmation
    if (subArg === 'all') {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const count = await User.countDocuments();
      const embed = new EmbedBuilder()
        .setTitle('Confirm: Reset All User Data')
        .setColor(0xFF0000)
        .setDescription(`This will DELETE all user data (${count} user records). This action is irreversible. Are you sure you want to proceed?`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('owner_reset_all:confirm')
          .setLabel('Confirm Reset All')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('owner_reset_all:cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return message.channel.send({ embeds: [embed], components: [row] });
    }

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

  if (sub === 'setlevel') {
    // syntax: op owner setlevel <cardId> <level> <@user>
    const cardId = args[1];
    const levelArg = args[2];
    const mention = args[3];
    const targetId = parseMention(mention);
    if (!cardId || !levelArg || !targetId) return message.reply('Usage: op owner setlevel <cardId> <level> <@user>');
    const level = parseInt(levelArg, 10);
    if (isNaN(level) || level < 1) return message.reply('Level must be a positive number');
    const target = await User.findOne({ userId: targetId });
    if (!target) return message.reply('Target user does not have an account.');
    target.ownedCards = target.ownedCards || [];
    let entry = target.ownedCards.find(e => e.cardId === cardId);
    if (!entry) {
      target.ownedCards.push({ cardId, level, xp: 0 });
    } else {
      entry.level = level;
      entry.xp = entry.xp || 0;
    }
    await target.save();
    // check achievements (level 100)
    try {
      const { checkAndAwardAll } = require('../utils/achievements');
      await checkAndAwardAll(target, message.client, { event: 'setlevel', cardId, level });
    } catch (err) {
      console.error('Achievement check after setlevel failed', err);
    }
    return message.reply(`Set level of ${cardId} to ${level} for <@${targetId}>`);
  }

  if (sub === 'removecard') {
    // syntax: op owner removecard <cardId> <@user>
    const cardId = args[1];
    const mention = args[2];
    const targetId = parseMention(mention);
    if (!cardId || !targetId) return message.reply('Usage: op owner removecard <cardId> <@user>');
    const cardDef = getCardById(cardId);
    if (!cardDef) return message.reply(`No card with id ${formatCardId(cardId)} exists`);
    const target = await User.findOne({ userId: targetId });
    if (!target) return message.reply('Target user does not have an account.');
    const before = (target.ownedCards || []).length;
    target.ownedCards = (target.ownedCards || []).filter(e => e.cardId !== cardDef.id);
    target.team = (target.team || []).filter(t => t !== cardDef.id);
    target.favoriteCards = (target.favoriteCards || []).filter(c => c !== cardDef.id);
    target.wishlistCards = (target.wishlistCards || []).filter(c => c !== cardDef.id);
    target.history = (target.history || []).filter(h => h !== cardDef.id);
    await target.save();
    const removed = before - (target.ownedCards.length || 0);
    return message.reply(`Removed ${removed} copies of ${formatCardId(cardDef.id)} from <@${targetId}>`);
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
    const valueArg = args[2];
    let threshold = 100;
    if (valueArg) {
      const parsed = parseInt(valueArg, 10);
      if (isNaN(parsed) || parsed < 1) return message.reply('Invalid drop value. Must be a positive integer.');
      threshold = parsed;
    }
    const dropsModule = require('./drops');
    
    try {
      await dropsModule.startDropTimer(message.client, channelId, threshold);
      return message.reply(`✅ Card drops enabled in <#${channelId}> (threshold: ${threshold})!`);
    } catch (err) {
      console.error('Error setting up drops:', err);
      return message.reply('Failed to set up drops. Make sure the bot can access that channel and that it is a text channel.');
    }
  }

  if (sub === 'setresets') {
    // syntax: op owner setresets <#channel>
    const channelMention = args[1];
    if (!channelMention) return message.reply('Usage: op owner setresets <#channel>');
    const channelMatch = channelMention.match(/<#(\d+)>/);
    if (!channelMatch) return message.reply('Invalid channel format. Use: op owner setresets <#channel>');
    const channelId = channelMatch[1];
    const fs = require('fs');
    const path = require('path');
    const PULL_FILE = path.join(__dirname, '..', 'pull.json');
    let data = {};
    try {
      if (fs.existsSync(PULL_FILE)) data = JSON.parse(fs.readFileSync(PULL_FILE, 'utf8')) || {};
    } catch (e) {
      data = {};
    }
    data.resetsChannel = channelId;
    try {
      fs.writeFileSync(PULL_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error writing pull.json for setresets:', err);
      return message.reply('Failed to save reset channel. Check server logs.');
    }
    return message.reply(`Reset notifications will be sent to <#${channelId}>`);
  }

  if (sub === 'dropparty') {
    const channelMention = args[1];
    const amountArg = args[2];
    if (!channelMention || !amountArg) return message.reply('Usage: op owner dropparty <#channel> <amount>');
    const channelMatch2 = channelMention.match(/<#(\d+)>/);
    if (!channelMatch2) return message.reply('Invalid channel format. Use: op owner dropparty <#channel> <amount>');
    const channelId = channelMatch2[1];
    const amount = parseInt(amountArg, 10);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Amount must be a positive number (max 100)');
    const dropsModule = require('./drops');
    try {
      await dropsModule.spawnDrops(message.client, channelId, amount);
      return message.reply(`✅ Dropped ${amount} cards in <#${channelId}>.`);
    } catch (err) {
      console.error('Error during dropparty:', err);
      return message.reply('Failed to perform dropparty.');
    }
  }

  if (sub === 'unsetdrops') {
    const channelMention = args[1];
    if (!channelMention) return message.reply('Usage: op owner unsetdrops <#channel>');
    const channelMatch = channelMention.match(/<#(\d+)>/);
    if (!channelMatch) return message.reply('Invalid channel format. Use: op owner unsetdrops <#channel>');
    const channelId = channelMatch[1];
    const dropsModule = require('./drops');
    try {
      dropsModule.stopDropTimer(channelId);
      return message.reply(`✅ Card drops disabled in <#${channelId}>.`);
    } catch (err) {
      console.error('Error disabling drops for channel:', err);
      return message.reply('Failed to disable drops for that channel.');
    }
  }

  if (sub === 'activedrops') {
    const dropsModule = require('./drops');
    try {
      const status = dropsModule.getDropStatus();
      const lines = [];
      if (status.configured && status.configured.length) {
        lines.push('Configured drop channels:');
        for (const ch of status.configured) {
          const prog = ch.progress || 0;
          const thresh = ch.threshold || 100;
          lines.push(`<#${ch.channelId}> — ${prog}/${thresh}`);
        }
      } else {
        lines.push('No configured drop channels.');
      }

      if (status.actives && status.actives.length) {
        lines.push('');
        lines.push('Active drops:');
        for (const a of status.actives) {
          const secs = Math.ceil((a.expiresIn || 0) / 1000);
          const mm = Math.floor(secs / 60).toString().padStart(2, '0');
          const ss = (secs % 60).toString().padStart(2, '0');
          let link = '';
          try {
            const chObj = await message.client.channels.fetch(a.channelId);
            const guildId = chObj && (chObj.guildId || (chObj.guild && chObj.guild.id));
            if (guildId) link = ` | message: https://discord.com/channels/${guildId}/${a.channelId}/${a.messageId}`;
          } catch (e) {}
          lines.push(`<#${a.channelId}> — ${a.cardName || 'unknown'} (${a.rank || ''}) — expires in ${mm}:${ss}${link}`);
        }
      }

      return message.channel.send(lines.join('\n'));
    } catch (err) {
      console.error('Error fetching active drops:', err);
      return message.reply('Failed to fetch active drops.');
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

  if (sub === 'ship') {
    const mention = args[1];
    const targetId = parseMention(mention);
    if (!targetId) return message.reply('Usage: op owner ship <@user>');

    const target = await User.findOne({ userId: targetId });
    if (!target) return message.reply('Target user does not have an account.');

    if (!target.activeShip) {
      return message.reply(`<@${targetId}> does not have an active ship.`);
    }

    const { getShipById, updateShipBalance } = require('../utils/cards');
    const ship = getShipById(target.activeShip);
    if (!ship) {
      return message.reply(`<@${targetId}>'s active ship is invalid.`);
    }

    updateShipBalance(target);
    await target.save();

    const embed = new EmbedBuilder()
      .setTitle(`${ship.character}`)
      .setDescription(`**Owner:** <@${targetId}>\n**Balance:** ${target.shipBalance} <:beri:1490738445319016651>`)
      .setColor('#2b2d31');

    return message.channel.send({ embeds: [embed] });
  }

  return message.reply('Unrecognized owner subcommand.');
}

async function handleButton(interaction, customId) {
  const parts = customId.split(':');
  const key = parts[0];
  const action = parts[1];

  if (key !== 'owner_reset_all') return;

  // Permission guard
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: 'You are not permitted to run owner commands.', ephemeral: true });
  }

  if (action === 'confirm') {
    await interaction.update({ content: 'Resetting all user data... This may take a moment.', embeds: [], components: [] });

    // Perform destructive action
    let res;
    try {
      res = await User.deleteMany({});
    } catch (err) {
      console.error('Error deleting all users:', err);
      return interaction.followUp({ content: 'Failed to delete user data. Check server logs.', ephemeral: true });
    }

    // Try clearing in-memory state where possible
    try {
      if (duelCmd && typeof duelCmd.clearAllStates === 'function') duelCmd.clearAllStates();
    } catch (err) {
      console.warn('duelCmd.clearAllStates failed', err);
    }
    if (global.badgeSessions && typeof global.badgeSessions.clear === 'function') global.badgeSessions.clear();
    if (global.packSessions && typeof global.packSessions.clear === 'function') global.packSessions.clear();
    if (global.packInfoSessions && typeof global.packInfoSessions.clear === 'function') global.packInfoSessions.clear();
    if (global.duelStates && typeof global.duelStates.clear === 'function') global.duelStates.clear();
    if (global.pendingDuelRequests && typeof global.pendingDuelRequests.clear === 'function') global.pendingDuelRequests.clear();

    return interaction.followUp({ content: `Deleted ${res.deletedCount || 'all'} user records.` });
  }

  // cancel
  return interaction.update({ content: 'Reset cancelled.', embeds: [], components: [] });
}

module.exports = { list, execute, handleButton };
