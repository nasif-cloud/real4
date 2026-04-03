const { EmbedBuilder } = require('discord.js');
const { searchCards, findBestOwnedCard } = require('../utils/cards');
const User = require('../models/User');



module.exports = {
  name: 'team',
  description: 'Manage your active team (max 3 cards)',
  options: [
    { name: 'add', type: 1, description: 'Add a card to your active team',
      options: [{ name: 'query', type: 3, description: 'Card name', required: true }] },
    { name: 'remove', type: 1, description: 'Remove a card from your active team',
      options: [{ name: 'query', type: 3, description: 'Card name', required: true }] }
  ],
  async execute({ message, interaction, args }) {
    let sub = null;
    if (interaction) {
      try {
        sub = interaction.options.getSubcommand();
      } catch (e) {
        sub = null;
      }
    } else {
      sub = args[0] && args[0].toLowerCase();
    }
    // if prefix and no subcommand provided OR slash "view"/no sub, we want to list team
    const query = interaction ? interaction.options.getString('query') : args.slice(1).join(' ');
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // ensure team is array
    user.team = user.team || [];

    // show team if using prefix without args or slash with no subcommand or explicit view
    if ((!interaction && !sub) || (interaction && (!sub || sub === 'view'))) {
      const lines = user.team.map(id => {
        const def = require('../data/cards').cards.find(c => c.id === id);
        if (!def) return id;
        return `${def.emoji || '•'} ${def.character} (${def.rank})`;
      });
      const nameList = lines.length ? lines.join('\n') : 'None';
      const embed = new EmbedBuilder()
        .setTitle(`${message ? message.author.username : interaction.user.username}'s Team`)
        .setDescription(nameList);
      const { applyDefaultEmbedStyle } = require('../utils/embedStyle');
      const discordUser = message ? message.author : interaction.user;
      applyDefaultEmbedStyle(embed, discordUser);
      if (message) return message.channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }

    if (!query && (sub === 'add' || sub === 'remove')) {
      const reply = 'Please specify a card name.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const card = await findBestOwnedCard(userId, query);
    if (!card) {
      const reply = `That isnt a card bruh`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }


    // Removed boost type restriction - any card can now be on team

    const owned = user.ownedCards.some(e => e.cardId === card.id);
    if (!owned) {
      const reply = `You don't own that card.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    let reply;
    if (sub === 'add') {
      if (user.team.includes(card.id)) {
        reply = 'That card is already on your team.';
      } else if (user.team.length >= 3) {
        reply = 'Your team is full!';
      } else {
        user.team.push(card.id);
        await user.save();
        reply = `Added **${card.character}** to your team.`;
      }
    } else if (sub === 'remove') {
      if (!user.team.includes(card.id)) {
        reply = 'That card is not on your team.';
      } else {
        user.team = user.team.filter(id => id !== card.id);
        await user.save();
        reply = `Removed **${card.character}** from your team.`;
      }
    } else {
      // show current team as embed
      const lines = user.team.map(id => {
        const def = require('../data/cards').cards.find(c => c.id === id);
        if (!def) return id;
        return `${def.emoji || '•'} ${def.character} (${def.rank})`;
      });
      const nameList = lines.length ? lines.join('\n') : 'None';
      const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`${message ? message.author.username : interaction.user.username}'s Team`)
        .setDescription(nameList)
        .setThumbnail(avatarUrl);
      if (message) return message.channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }

    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};
