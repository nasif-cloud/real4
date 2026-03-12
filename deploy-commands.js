require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');

const commands = [];
// core commands
commands.push({ name: 'start', description: 'Register an account with the One Piece bot' });
commands.push({ name: 'pull', description: 'Pull a random card (uses 1 pull)' });
commands.push({
  name: 'info',
  description: 'Show ownership info for a card',
  options: [{ name: 'query', type: 3, description: 'Partial or full card name', required: true }]
});
commands.push({
  name: 'upgrade',
  description: 'Upgrade one of your cards to the next mastery',
  options: [{ name: 'query', type: 3, description: 'Card you own (name)', required: true }]
});

// balance command
commands.push({ name: 'balance', description: "Show your current Beli and reset tokens" });

// team management (view/add/remove) - active team limited to 3 cards
commands.push({
  name: 'team',
  description: 'Manage your active team',
  options: [
    { name: 'view', type: 1, description: 'View your current team' },
    { name: 'add', type: 1, description: 'Add a card to your team', options: [{ name: 'query', type: 3, description: 'Card name', required: true }] },
    { name: 'remove', type: 1, description: 'Remove a card from your team', options: [{ name: 'query', type: 3, description: 'Card name', required: true }] }
  ]
});

// inventory lookup
commands.push({ name: 'inventory', description: 'Show your items and packs' });

// autoteam command
commands.push({ name: 'autoteam', description: 'Automatically set your team to top 3 cards' });

// sell command
commands.push({
  name: 'sell',
  description: 'Sell a card for currency based on its rank',
  options: [{ name: 'query', type: 3, description: 'Card name', required: true }]
});

// infinite sail battle
commands.push({ name: 'isail', description: 'Challenge the Infinite Sail' });

// shop & economy
commands.push({ name: 'shop', description: 'View the shop' });
commands.push({
  name: 'buy',
  description: 'Buy an item from the shop',
  options: [{ name: 'item', type: 3, description: 'Item name', required: true }]
});

// bounty system
commands.push({ name: 'bounty', description: 'Find a random player to duel for bounty' });

// profile & leaderboards
commands.push({
  name: 'user',
  description: 'View a user\'s profile',
  options: [{ name: 'target', type: 6, description: 'User to view (optional)', required: false }]
});
commands.push({ name: 'leaderboard', description: 'View global leaderboards' });

// pack system
commands.push({ name: 'stock', description: 'View current pack stock' });
commands.push({
  name: 'open',
  description: 'Open a pack to get cards',
  options: [{ name: 'pack', type: 3, description: 'Pack name', required: true }]
});

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // dev guild

async function deploy() {
  try {
    if (!clientId || !guildId) return console.log('CLIENT_ID and GUILD_ID must be set in .env');
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

deploy();
