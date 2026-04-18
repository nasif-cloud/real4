const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { ACHIEVEMENTS } = require('../utils/achievements');

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildEmbedForPage(user, pageItems, pageIndex, totalPages) {
  const avatarUrl = user.discordAvatar || '';
  const lines = pageItems.map(a => `${a.icon} **${a.title}** — ${a.reason || 'No description'}`);
  const ownedSet = new Set(user.badgesOwned || []);
  const ownedList = ACHIEVEMENTS.filter(a => ownedSet.has(a.id)).map(a => `${a.icon} ${a.title}`);

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setTitle('Badge list')
    .setThumbnail(avatarUrl)
    .setDescription(`**Badges (page ${pageIndex + 1}/${totalPages})**\n${lines.join('\n')}\n\n**Owned badges**\n${ownedList.length ? ownedList.join('\n') : 'None'}`);

  return embed;
}

module.exports = {
  name: 'badges',
  description: 'List available badges and equip via menu',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` to register.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Prepare pages (10 badges per page)
    const pages = chunkArray(ACHIEVEMENTS, 10);
    const totalPages = pages.length || 1;

    // Save session for navigation
    const session = { userId, pages, currentPage: 0 };
    if (!global.badgeSessions) global.badgeSessions = new Map();
    global.badgeSessions.set(`${userId}_badges`, session);

    // Build embed for first page
    const avatarUrl = (message ? message.author : interaction.user).displayAvatarURL();
    user.discordAvatar = avatarUrl;
    const embed = buildEmbedForPage(user, pages[0], 0, totalPages);

    const components = [];

    // Navigation row if multiple pages
    if (totalPages > 1) {
      const prev = new ButtonBuilder()
        .setCustomId(`badges_nav:${0}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
      const next = new ButtonBuilder()
        .setCustomId(`badges_nav:${1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(totalPages <= 1);
      components.push(new ActionRowBuilder().addComponents(prev, next));
    }

    // Owned-only dropdown
    const ownedSet = new Set(user.badgesOwned || []);
    const ownedOptions = ACHIEVEMENTS.filter(a => ownedSet.has(a.id)).map(a => ({ label: a.title, value: a.id, description: a.reason?.slice(0, 90) }));
    if (ownedOptions.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('badge_equip')
        .setPlaceholder('equip a badge')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(ownedOptions);
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    if (message) return message.channel.send({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: false });
  },

  async handleSelect(interaction) {
    const userId = interaction.user.id;
    const selected = interaction.values && interaction.values[0];
    if (!selected) return interaction.reply({ content: 'No badge selected.', ephemeral: true });
    const def = ACHIEVEMENTS.find(a => a.id === selected);
    if (!def) return interaction.reply({ content: 'Badge not found.', ephemeral: true });
    const user = await User.findOne({ userId });
    if (!user) return interaction.reply({ content: 'You don\'t have an account.', ephemeral: true });
    user.badgesOwned = user.badgesOwned || [];
    user.badgesEquipped = user.badgesEquipped || [];
    if (!user.badgesOwned.includes(def.id)) return interaction.reply({ content: `You don't own that badge.`, ephemeral: true });
    if (user.badgesEquipped.includes(def.id)) return interaction.reply({ content: `Badge already equipped.`, ephemeral: true });
    if (user.badgesEquipped.length >= 3) return interaction.reply({ content: `You can only equip up to 3 badges.`, ephemeral: true });
    user.badgesEquipped.push(def.id);
    await user.save();
    return interaction.update({ content: `Equipped badge ${def.icon} ${def.title}`, embeds: [], components: [] });
  },

  async handleButton(interaction, customId) {
    // customId format: badges_nav:<targetPage>
    const parts = customId.split(':');
    const action = parts[0];
    const target = parseInt(parts[1], 10);
    const session = global.badgeSessions?.get(`${interaction.user.id}_badges`);
    if (!session || session.userId !== interaction.user.id) {
      return interaction.reply({ content: 'Badge session expired or not your session.', ephemeral: true });
    }
    let newPage = isNaN(target) ? session.currentPage : target;
    // clamp
    newPage = Math.max(0, Math.min(session.pages.length - 1, newPage));
    session.currentPage = newPage;
    global.badgeSessions.set(`${interaction.user.id}_badges`, session);

    const user = await User.findOne({ userId: interaction.user.id });
    user.discordAvatar = interaction.user.displayAvatarURL();
    const embed = buildEmbedForPage(user, session.pages[newPage], newPage, session.pages.length);

    const components = [];
    if (session.pages.length > 1) {
      const prevDisabled = newPage <= 0;
      const nextDisabled = newPage >= session.pages.length - 1;
      const prev = new ButtonBuilder()
        .setCustomId(`badges_nav:${newPage - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(prevDisabled);
      const next = new ButtonBuilder()
        .setCustomId(`badges_nav:${newPage + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(nextDisabled);
      components.push(new ActionRowBuilder().addComponents(prev, next));
    }

    // Owned-only dropdown on update
    const ownedSet = new Set(user.badgesOwned || []);
    const ownedOptions = ACHIEVEMENTS.filter(a => ownedSet.has(a.id)).map(a => ({ label: a.title, value: a.id, description: a.reason?.slice(0, 90) }));
    if (ownedOptions.length) components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('badge_equip')
        .setPlaceholder('equip a badge')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(ownedOptions)
    ));

    return interaction.update({ embeds: [embed], components });
  }
};
