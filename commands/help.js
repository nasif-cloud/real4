const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { applyDefaultEmbedStyle } = require('../utils/embedStyle');

const COMMAND_CATEGORIES = {
  account: {
    name: 'Account',
    emoji: '<:user:1490731587564736643>',
    commands: [
      { name: 'start', desc: 'Register an account and receive a starter card' },
      { name: 'user [username]', desc: 'View a player\'s profile and stats' },
      { name: 'balance / bal', desc: 'Check your balance (beli & gems)' }
    ]
  },
  cards: {
    name: 'Cards',
    emoji: '<:bag:1490732030458331348>',
    commands: [
      { name: 'pull', desc: 'Perform a card pull (costs one pull, limited per reset)' },
      { name: 'info <query>', desc: 'View card info with ownership history' },
      { name: 'collection', desc: 'Browse your card collection with filters' },
      { name: 'stock', desc: 'Check stock market prices' },
      { name: 'open <pack>', desc: 'Open a card pack to get crews' },
      { name: 'equip <artifact> <card>', desc: 'Equip an artifact to a card' },
      { name: 'unequip <artifact>', desc: 'Unequip an artifact from its card' },
      { name: 'bulkfeed <format>', desc: 'Bulk feed items to multiple cards' },
      { name: 'badges', desc: 'View or equip badges for your profile' },
      { name: 'removebadge', desc: 'Remove a badge from your profile' },
      { name: 'reset', desc: 'Reset pulls using a reset token' }
    ]
  },
  team: {
    name: 'Team',
    emoji: '<:sword:1490732251107819530>',
    commands: [
      { name: 'team [slot] <query>', desc: 'View or set your team composition' },
      { name: 'autoteam', desc: 'Automatically set your team to your top 3 cards' },
      { name: 'teambackground / teambg <bg>', desc: 'Set your team background' }
    ]
  },
  battle: {
    name: 'Battle',
    emoji: '<:energy:1478051414558118052>',
    commands: [
      { name: 'duel [@user]', desc: 'Challenge another player to a 1v1 team battle' },
      { name: 'sail', desc: 'Sail through story stages and battle NPC marines' },
      { name: 'forfeit', desc: 'Forfeit your current story battle' },
      { name: 'bounty', desc: 'Check active bounties or fight for rewards' },
      { name: 'fuel [ship]', desc: 'Use Cola to refill your ship\'s Cola' },
      { name: 'wanted', desc: 'Create a wanted poster for another player' }
    ]
  },
  economy: {
    name: 'Economy',
    emoji: '<:dollar:1490732561792500062>',
    commands: [
      { name: 'daily', desc: 'Claim your daily rewards (streak & packs)' },
      { name: 'shop', desc: 'View the shop' },
      { name: 'buy <item> [quantity]', desc: 'Purchase items from the shop' },
      { name: 'sell <query>', desc: 'Sell cards from your collection' },
      { name: 'bulksell <format>', desc: 'Bulk sell multiple cards' },
      { name: 'inventory / inv', desc: 'View your inventory of items' },
      { name: 'setship <ship>', desc: 'Set your active ship for passive income' },
      { name: 'deposit <amount>', desc: 'Deposit Beli into your active ship' },
      { name: 'claim [amount]', desc: 'Claim earnings from your active ship' },
      { name: 'rob [@user]', desc: 'Attempt to rob another player\'s Beli' },
      { name: 'stoprob', desc: 'Stop an active robbery against you' },
      { name: 'loot', desc: 'Attempt to loot a random guild ship' },
      { name: 'bet <amount> <guess>', desc: 'Bet Beli on a coin flip (heads or tails)' }
    ]
  },
  activities: {
    name: 'Fun',
    emoji: '<:paintbrush:1490733392860287088>',
    commands: [
      { name: 'fish', desc: 'Go fishing for levelers and cards (3% gem chance!)' },
      { name: 'feed <query> <item>', desc: 'Feed items to a card to level it up' },
      { name: 'trivia [difficulty]', desc: 'Play a trivia quiz to earn rewards' },
      { name: 'drops', desc: 'View active card drops in the server' }
    ]
  },
  info: {
    name: 'Info',
    emoji: '<:help:1490733477057007716>',
    commands: [
      { name: 'leaderboard / lb [page]', desc: 'View the global leaderboard' },
      { name: 'timers / t', desc: 'Check your pull timer & reset timer' },
      { name: 'help / h', desc: 'Show this help menu' }
    ]
  }
};

function createCategoryEmbed(categoryKey, discordUser) {
  const category = COMMAND_CATEGORIES[categoryKey];
  if (!category) return null;

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setTitle(`${category.emoji} ${category.name}`)
    .setDescription(category.commands.map(cmd => `\`${cmd.name}\` - ${cmd.desc}`).join('\n'))
    .setFooter({ text: 'Use `/` for slash commands or `op` prefix for text commands' });

  applyDefaultEmbedStyle(embed, discordUser);
  return embed;
}

function createMainHelpEmbed(discordUser) {
  const categoryList = Object.entries(COMMAND_CATEGORIES)
    .map(([key, cat]) => `${cat.emoji} **${cat.name}** - ${cat.commands.length} commands`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setDescription('**Select a category below to view commands.**')
    .addFields({ name: 'Categories', value: categoryList })
    .setFooter({ text: 'Select a category from the dropdown menu below' });

  applyDefaultEmbedStyle(embed, discordUser);
  return embed;
}

function createSelectMenu() {
  const options = Object.entries(COMMAND_CATEGORIES).map(([key, cat]) => ({
    label: cat.name,
    value: key,
    emoji: cat.emoji,
    description: `${cat.commands.length} commands`
  }));

  return new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Choose a category...')
    .addOptions(options);
}

module.exports = {
  name: 'help',
  description: 'View all available commands',
  async execute({ message, interaction }) {
    const discordUser = message ? message.author : interaction.user;
    const mainEmbed = createMainHelpEmbed(discordUser);
    const row = new ActionRowBuilder().addComponents(createSelectMenu());

    if (message) {
      return message.channel.send({ embeds: [mainEmbed], components: [row] });
    }
    return interaction.reply({ embeds: [mainEmbed], components: [row] });
  },

  // Handle category selection
  async handleCategorySelect(interaction) {
    const categoryKey = interaction.values[0];
    const embed = createCategoryEmbed(categoryKey, interaction.user);
    
    if (!embed) {
      return interaction.update({ content: 'Category not found.', components: [] });
    }

    const backButton = new ActionRowBuilder().addComponents(
      new (require('discord.js')).ButtonBuilder()
        .setCustomId('help_back')
        .setLabel('Back')
        .setStyle(require('discord.js').ButtonStyle.Secondary)
    );

    return interaction.update({ embeds: [embed], components: [backButton] });
  },

  // Handle back button
  async handleBack(interaction) {
    const discordUser = interaction.user;
    const mainEmbed = createMainHelpEmbed(discordUser);
    const row = new ActionRowBuilder().addComponents(createSelectMenu());
    
    return interaction.update({ embeds: [mainEmbed], components: [row] });
  }
};
