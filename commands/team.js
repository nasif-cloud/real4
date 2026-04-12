const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { searchCards, findBestOwnedCard, getCardFinalStats } = require('../utils/cards');
const { generateTeamImage } = require('../utils/teamImage');
const User = require('../models/User');

function parseTargetIdFromArgs(args) {
  if (!args || args.length === 0) return null;
  const first = args[0];
  const mentionMatch = first.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d{17,19}$/.test(first)) return first;
  return null;
}


module.exports = {
  name: 'team',
  description: 'Manage your active team (max 3 cards)',
  options: [
    { name: 'view', type: 1, description: 'View your current team', options: [{ name: 'target', type: 6, description: 'User to view (optional)', required: false }] },
    { name: 'add', type: 1, description: 'Add a card to your active team',
      options: [{ name: 'query', type: 3, description: 'Card name', required: true }] },
    { name: 'remove', type: 1, description: 'Remove a card from your active team',
      options: [{ name: 'query', type: 3, description: 'Card name', required: true }] }
  ],
  async execute({ message, interaction, args }) {
    const currentUserId = message ? message.author.id : interaction.user.id;
    let sub = null;
    let query = '';
    let targetId = currentUserId;
    let targetUser = message ? message.author : interaction.user;

    if (interaction) {
      try {
        sub = interaction.options.getSubcommand();
      } catch (e) {
        sub = null;
      }
      query = interaction.options.getString('query');
      if (sub === 'view') {
        const targetOption = interaction.options.getUser('target');
        if (targetOption) {
          targetId = targetOption.id;
          targetUser = targetOption;
        }
      }
    } else {
      sub = args[0] && args[0].toLowerCase();
      if (sub === 'add' || sub === 'remove') {
        query = args.slice(1).join(' ');
      } else {
        const parsedTarget = parseTargetIdFromArgs(args);
        if (parsedTarget) {
          targetId = parsedTarget;
          targetUser = await message.client.users.fetch(parsedTarget).catch(() => message.author) || targetUser;
          sub = null;
        }
      }
    }

    const userId = (sub === 'add' || sub === 'remove') ? currentUserId : targetId;
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
      const cardDefs = user.team.map(id => require('../data/cards').cards.find(c => c.id === id)).filter(Boolean);
      const totalPower = cardDefs.reduce((sum, card) => {
        const entry = user.ownedCards.find(e => e.cardId === card.id);
        const stats = getCardFinalStats(card, entry?.level || 1, user);
        return sum + (stats.scaled.power || 0);
      }, 0);
      const username = targetUser.username || (message ? message.author.username : interaction.user.username);
      const imageBuffer = await generateTeamImage({
        username,
        totalPower,
        cards: cardDefs,
        backgroundUrl: user.teamBackgroundUrl
      });
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'team.png' });
      let components = [];
      if (targetId === currentUserId) {
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('team_autoteam')
              .setLabel('Auto team')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('<:autoteam:1489632891188019342>')
          );
        components = [row];
      }
      if (message) {
        return message.channel.send({ content: `${username}'s team`, files: [attachment], components });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
      return interaction.editReply({ content: `${username}'s team`, files: [attachment], components });
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

    if (card.artifact || card.ship) {
      const reply = card.artifact ? 'Artifacts cannot be added to your active team.' : 'Ships cannot be added to your active team.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

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
  },

  async handleButton(interaction, rawAction, cardId) {
    if (rawAction === 'team_autoteam') {
      // Trigger autoteam logic
      const userId = interaction.user.id;
      let user = await User.findOne({ userId });
      if (!user) {
        return interaction.reply({ content: 'You don\'t have an account.', ephemeral: true });
      }

      const { cards } = require('../data/cards');
      const ownedDefs = (user.ownedCards || [])
        .map(e => cards.find(c => c.id === e.cardId))
        .filter(c => c);

      // Exclude boost cards - assuming boost cards have special_attack with 'boost' or low power
      // Sort by boosted power so team strength accounts for stat boosts.
      let eligibles = ownedDefs.filter(c => !c.artifact && !c.ship && (!c.special_attack || !c.special_attack.name.toLowerCase().includes('boost')));

      if (eligibles.length === 0) {
        return interaction.reply({ content: 'You don\'t have any eligible cards to form a team.', ephemeral: true });
      }

      eligibles.sort((a, b) => {
        const aEntry = user.ownedCards.find(e => e.cardId === a.id);
        const bEntry = user.ownedCards.find(e => e.cardId === b.id);
        const aStats = getCardFinalStats(a, aEntry?.level || 1, user);
        const bStats = getCardFinalStats(b, bEntry?.level || 1, user);
        return (bStats.scaled.power || 0) - (aStats.scaled.power || 0);
      });

      const selected = eligibles.slice(0, 3);
      user.team = selected.map(c => c.id);
      await user.save();

      const cardDefs = user.team.map(id => cards.find(c => c.id === id)).filter(Boolean);
      const totalPower = cardDefs.reduce((sum, card) => {
        const entry = user.ownedCards.find(e => e.cardId === card.id);
        const stats = getCardFinalStats(card, entry?.level || 1, user);
        return sum + (stats.scaled.power || 0);
      }, 0);
      const imageBuffer = await generateTeamImage({
        username: interaction.user.username,
        totalPower,
        cards: cardDefs,
        backgroundUrl: user.teamBackgroundUrl
      });
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'team.png' });
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('team_autoteam')
            .setLabel('Auto team')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:autoteam:1489632891188019342>')
        );

      await interaction.update({ content: `${interaction.user.username}'s team`, files: [attachment], components: [row] });
      return interaction.followUp({ content: 'Your team has been set to the strongest possible cards!', ephemeral: true });
    }
  }
};
