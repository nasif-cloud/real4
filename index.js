require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const { PREFIX } = require('./config');

const startCmd = require('./commands/start');
const pullCmd = require('./commands/pull');
const resetCmd = require('./commands/reset');
const teamCmd = require('./commands/team');
const teamBackgroundCmd = require('./commands/teambackground');
const inventoryCmd = require('./commands/inventory');
const balanceCmd = require('./commands/balance');
const autoTeamCmd = require('./commands/autoteam');
const duelCmd = require('./commands/duel');
const sellCmd = require('./commands/sell');
const shopCmd = require('./commands/shop');
const buyCmd = require('./commands/buy');
const bountyCmd = require('./commands/bounty');
const userCmd = require('./commands/user');
const leaderboardCmd = require('./commands/leaderboard');
const dailyCmd = require('./commands/daily');
const stockCmd = require('./commands/stock');
const openCmd = require('./commands/open');
const timersCmd = require('./commands/timers');
const User = require('./models/User');

async function main() {
  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) return console.error('Please set DISCORD_TOKEN or TOKEN in .env');
  // support either name in runtime
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  if (!process.env.MONGODB_URI) console.warn('MONGODB_URI not set; bot will run without DB');

  // Connect mongoose
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI).then(() => console.log('Connected to MongoDB')).catch(err => console.error('MongoDB error', err));
  }

  // Initialize stock system
  const { initStockSystem } = require('./src/stock');
  initStockSystem();

  // Initialize drops system
  const dropsModule = require('./commands/drops');
  dropsModule.initializeDrops(null); // Will be set by client once ready

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], partials: [] });

  client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
    dropsModule.initializeDrops(client); // Initialize with client reference
  });

  // simple lock to prevent rapid button spam causing race conditions
  const processingInteractions = new Set();

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        // guard against multiple button presses while we are handling one
        if (processingInteractions.has(interaction.user.id)) {
          return interaction.reply({ content: 'Please wait for the previous action to finish.', ephemeral: true });
        }
        processingInteractions.add(interaction.user.id);
      }

      if (interaction.isStringSelectMenu()) {
        const [action] = interaction.customId.split(':');
        if (action === 'collection_sort_select') {
          return require('./commands/collection').handleButton(interaction, interaction.customId);
        }
      }

      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'start') return startCmd.execute({ interaction });
        if (commandName === 'pull') return pullCmd.execute({ interaction });
        if (commandName === 'reset') return resetCmd.execute({ interaction });
        if (commandName === 'autoteam') return autoTeamCmd.execute({ interaction });
        if (commandName === 'team') return teamCmd.execute({ interaction });
        if (commandName === 'teambackground') return teamBackgroundCmd.execute({ interaction });
        if (commandName === 'inventory') return inventoryCmd.execute({ interaction });
        if (commandName === 'duel') return duelCmd.execute({ interaction });
        if (commandName === 'sell') return sellCmd.execute({ interaction });
        if (commandName === 'shop') return shopCmd.execute({ interaction });
        if (commandName === 'buy') return buyCmd.execute({ interaction });
        if (commandName === 'bounty') return bountyCmd.execute({ interaction });
        if (commandName === 'user') return userCmd.execute({ interaction });
        if (commandName === 'leaderboard') return leaderboardCmd.execute({ interaction });
        if (commandName === 'daily') return dailyCmd.execute({ interaction });
        if (commandName === 'stock') return stockCmd.execute({ interaction });
        if (commandName === 'open') return openCmd.execute({ interaction });
        if (commandName === 'timers') return timersCmd.execute({ interaction });
        if (commandName === 'info') return require('./commands/info').execute({ interaction });
        if (commandName === 'upgrade') return require('./commands/upgrade').execute({ interaction });
        if (commandName === 'balance') return require('./commands/balance').execute({ interaction });
        if (commandName === 'isail') return require('./commands/isail').execute({ interaction });
        if (commandName === 'fish') return require('./commands/fish').execute({ interaction });
        if (commandName === 'feed') return require('./commands/feed').execute({ interaction });
      }

      if (interaction.isButton()) {
        const [action, cardId] = interaction.customId.split(':');
        // existing card pager buttons
        if (action === 'mastery_prev' || action === 'mastery_next') {
          const { cards } = require('./data/cards');
          const cardDef = cards.find(c => c.id === cardId);
          if (!cardDef) return;
          const direction = action === 'mastery_prev' ? -1 : 1;
          const newMastery = cardDef.mastery + direction;
          const newDef = cards.find(c => c.character === cardDef.character && c.mastery === newMastery);
          if (!newDef) return;

          // compute user entry if possible
          let userEntry = null;
          let userDoc = null;
          try {
            const user = await User.findOne({ userId: interaction.user.id });
            if (user) {
              userDoc = user;
              userEntry = user.ownedCards.find(e => e.cardId === newDef.id) || null;
            }
          } catch {}
          const { buildCardEmbed } = require('./utils/cards');
          const avatarUrl = interaction.user.displayAvatarURL();
          const embed = buildCardEmbed(newDef, userEntry, avatarUrl, userDoc);
          // rebuild components
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const prevAvailable = newDef.mastery > 1;
          const nextAvailable = newDef.mastery < newDef.mastery_total;
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`mastery_prev:${newDef.id}`)
              .setLabel('Previous')
              .setStyle(prevAvailable ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(!prevAvailable),
            new ButtonBuilder()
              .setCustomId(`mastery_next:${newDef.id}`)
              .setLabel('Next')
              .setStyle(nextAvailable ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(!nextAvailable)
          );
          return interaction.update({ embeds: [embed], components: [row] });
        }

        // handle reset token confirmation
        if (action === 'reset_confirm') {
          return resetCmd.handleButton(interaction, cardId);
        }

        // handle infinite sail interactions
        if (action && action.startsWith('isail')) {
          return require('./commands/isail').handleButton(interaction, action, cardId);
        }

        if (action === 'fish_catch') {
          return require('./commands/fish').handleCatch(interaction, cardId);
        }

        // handle duel interactions
        if (action && action.startsWith('duel')) {
          return duelCmd.handleButton(interaction, action, cardId);
        }

        // handle pack opening interactions
        if (action && action.startsWith('open_next')) {
          return openCmd.handleButton(interaction, interaction.customId);
        }

        // handle stock button purchases
        if (action === 'stock_buy') {
          return stockCmd.handleButton(interaction, cardId);
        }

        // handle stock page navigation
        if (action === 'stock_page') {
          return stockCmd.handleButton(interaction, cardId);
        }

        // handle collection navigation
        if (action && (action.startsWith('collection_next') || action.startsWith('collection_prev') || action === 'collection_sort' || action === 'collection_sort_select')) {
          return require('./commands/collection').handleButton(interaction, interaction.customId);
        }

        // handle info card navigation
        if (action && action.startsWith('info_')) {
          return require('./commands/info').handleButton(interaction, action, cardId);
        }

        // handle inventory pagination
        if (action && (action.startsWith('inv_prev') || action.startsWith('inv_next'))) {
          return require('./commands/inventory').handleButton(interaction, interaction.customId);
        }

        // handle upgrade payment interactions
        if (action && action.startsWith('upgrade_')) {
          return require('./commands/upgrade').handleUpgradeButton(interaction);
        }

        // handle card drop claims
        if (action && action.startsWith('drop_claim')) {
          const dropId = interaction.customId.split(':')[1];
          return require('./commands/drops').handleDropClaim(interaction, dropId);
        }

        // handle balance interactions
        if (action === 'balance') {
          return require('./commands/balance').handleButton(interaction, cardId);
        }

        // handle bounty interactions
        if (action === 'bounty') {
          return require('./commands/bounty').handleButton(interaction, cardId);
        }

        // handle team autoteam
        if (action === 'team_autoteam') {
          return require('./commands/team').handleButton(interaction, action, cardId);
        }
      }
    } catch (err) {
      console.error(err);
      if (interaction.replied || interaction.deferred) interaction.followUp({ content: 'Error running command', ephemeral: true });
      else interaction.reply({ content: 'Error processing interaction', ephemeral: true });
    } finally {
      // release processing lock if we acquired one
      if (interaction.isButton()) processingInteractions.delete(interaction.user.id);
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Support both prefix `op` and bot mention as prefix
    const content = message.content || '';
    const lower = content.toLowerCase();

    // allow: "op pull", "oppull" (not recommended), or mention prefix
    let invoked = null;
    let payload = '';

    if (lower.startsWith(PREFIX)) {
      payload = content.slice(PREFIX.length).trim();
      invoked = 'prefix';
    } else if (message.mentions.users.has(client.user?.id)) {
      // strip mention
      const mentionRegex = new RegExp(`<@!?(?:${client.user.id})>`);
      payload = content.replace(mentionRegex, '').trim();
      invoked = 'mention';
    } else {
      return; // not a command for us
    }

    if (!payload) return; // nothing after prefix
    const args = payload.split(/ +/g);
    let cmd = args.shift().toLowerCase();
    // alias shortcuts
    if (cmd === 'opp') cmd = 'pull';
    if (cmd === 'inv') cmd = 'inventory';
    if (cmd === 't') cmd = 'timers';
    if (cmd === 'col') cmd = 'collection';
    try {
      if (cmd === 'start') return await startCmd.execute({ message });
      if (cmd === 'pull') return await pullCmd.execute({ message });
      if (cmd === 'reset') return await resetCmd.execute({ message });
      if (cmd === 'team') return await teamCmd.execute({ message, args });
      if (cmd === 'teambg' || cmd === 'teambackground') return await teamBackgroundCmd.execute({ message, args });
      if (cmd === 'autoteam') return await require('./commands/autoteam').execute({ message });
      if (cmd === 'inventory') return await inventoryCmd.execute({ message, args });
      if (cmd === 'balance' || cmd === 'bal') return await balanceCmd.execute({ message, args });
      if (cmd === 'duel') return await duelCmd.execute({ message, args });
      if (cmd === 'sell') return await sellCmd.execute({ message, args });
      if (cmd === 'shop') return await shopCmd.execute({ message });
      if (cmd === 'buy') return await buyCmd.execute({ message, args });
      if (cmd === 'bounty') return await bountyCmd.execute({ message });
      if (cmd === 'user') return await userCmd.execute({ message, args });
      if (cmd === 'leaderboard' || cmd === 'lb') return await leaderboardCmd.execute({ message, args });
      if (cmd === 'daily') return await dailyCmd.execute({ message });
      if (cmd === 'stock') return await stockCmd.execute({ message });
      if (cmd === 'open') return await openCmd.execute({ message, args });
      if (cmd === 'timers') return await timersCmd.execute({ message });
      if (cmd === 'collection') return await require('./commands/collection').execute({ message });
      if (cmd === 'info') return await require('./commands/info').execute({ message, args });
      if (cmd === 'upgrade') return await require('./commands/upgrade').execute({ message, args });
      if (cmd === 'isail') return await require('./commands/isail').execute({ message });
      if (cmd === 'fish') return await require('./commands/fish').execute({ message });
      if (cmd === 'feed') return await require('./commands/feed').execute({ message, args });
      if (cmd === 'ownerlist') return await require('./commands/owner').list({ message });
      if (cmd === 'owner') return await require('./commands/owner').execute({ message, args });
      return; // unknown command - don't respond
    } catch (err) {
      console.error(err);
      message.reply('Error running command.');
    }
  });

  client.login(token);
}

main();
