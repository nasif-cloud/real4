const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { levelers } = require('../data/levelers');
const { rods } = require('../data/rods');

const ITEMS_PER_PAGE = 25;

function parseTargetIdFromArgs(args) {
  if (!args || args.length === 0) return null;
  const first = args[0];
  const mentionMatch = first.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d{17,19}$/.test(first)) return first;
  return null;
}

function buildInventoryEmbed(user, username, avatarUrl, pageIndex = 0) {
  // Get current rod for items display
  const currentRod = rods.find(r => r.id === user.currentRod);
  const rodDisplay = currentRod ? `${currentRod.emoji} ${currentRod.name}` : '❓ Unknown Rod';
  
  // Build items list with rod at top
  let itemsList = currentRod ? `${currentRod.emoji} ${currentRod.name}` : '';
  const levelerItems = (user.items || []).map(i => {
    const leveler = levelers.find(l => l.id === i.itemId);
    return leveler ? `${leveler.emoji} ${leveler.name} x${i.quantity}` : `${i.itemId} x${i.quantity}`;
  });
  
  // Combine all items (rod + levelers)
  const allItems = (itemsList ? [itemsList] : []).concat(levelerItems);
  
  // Pagination for items
  const totalItems = allItems.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const clampedPage = Math.min(pageIndex, Math.max(0, totalPages - 1));
  
  const startIdx = clampedPage * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const pageItems = allItems.slice(startIdx, endIdx).join('\n') || 'None';
  
  // Packs display
  const packsObj = user.packInventory || {};
  const packs = Object.keys(packsObj).length
    ? Object.entries(packsObj).map(([name, qty]) => `${name} x${qty}`).join('\n')
    : 'None';

  const embed = new EmbedBuilder()
    .setColor('#FFFFFF')
    .setTitle(`${username}'s Inventory`)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: 'Items', value: pageItems, inline: false },
      { name: 'Packs', value: packs, inline: false }
    );
  
  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${clampedPage + 1}/${totalPages}` });
  }
  
  return { embed, totalPages, currentPage: clampedPage };
}

module.exports = {
  name: 'inventory',
  description: 'Show your items and packs',
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const targetId = message ? parseTargetIdFromArgs(args) || userId : interaction.options.getUser('target')?.id || userId;
    let targetUser = discordUser;
    let username = discordUser.username;
    let avatarUrl = discordUser.displayAvatarURL();
    if (message && targetId !== userId) {
      targetUser = await message.client.users.fetch(targetId).catch(() => null) || targetUser;
      username = targetUser.username || username;
      avatarUrl = targetUser.displayAvatarURL ? targetUser.displayAvatarURL() : avatarUrl;
    } else if (!message && targetId !== userId) {
      const targetOption = interaction.options.getUser('target');
      if (targetOption) {
        targetUser = targetOption;
        username = targetUser.username;
        avatarUrl = targetUser.displayAvatarURL();
      }
    }

    let user = await User.findOne({ userId: targetId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const { embed, totalPages } = buildInventoryEmbed(user, username, avatarUrl, 0);
    
    if (totalPages <= 1) {
      if (message) return message.channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }
    
    // Add pagination buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv_prev_${message ? message.author.id : interaction.user.id}_${targetId}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`inv_next_${message ? message.author.id : interaction.user.id}_${targetId}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
    );
    
    if (message) {
      return message.channel.send({ embeds: [embed], components: [row] });
    } else {
      return interaction.reply({ embeds: [embed], components: [row] });
    }
  },

  async handleButton(interaction, customId) {
    const parts = customId.split('_');
    const action = parts[0];
    const direction = parts[1];
    const viewerId = parts[2];
    const targetId = parts[3] || viewerId;
    
    if (action !== 'inv' || interaction.user.id !== viewerId) {
      return interaction.reply({ content: 'This is not your inventory.', ephemeral: true });
    }

    const user = await User.findOne({ userId: targetId });
    if (!user) {
      return interaction.reply({ content: 'User not found.', ephemeral: true });
    }

    // Get current page from footer
    const currentEmbed = interaction.message.embeds[0];
    const footerText = currentEmbed?.footer?.text || 'Page 1/1';
    const match = footerText.match(/Page (\d+)\/(\d+)/);
    const currentPage = match ? parseInt(match[1]) - 1 : 0;
    const totalPages = match ? parseInt(match[2]) : 1;

    let newPage = currentPage;
    if (direction === 'prev') newPage = Math.max(0, currentPage - 1);
    if (direction === 'next') newPage = Math.min(totalPages - 1, currentPage + 1);

    const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
    const username = targetUser ? targetUser.username : userId;
    const avatarUrl = targetUser ? targetUser.displayAvatarURL() : interaction.user.displayAvatarURL();
    const { embed } = buildInventoryEmbed(user, username, avatarUrl, newPage);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv_prev_${viewerId}_${targetId}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newPage === 0),
      new ButtonBuilder()
        .setCustomId(`inv_next_${viewerId}_${targetId}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newPage === totalPages - 1)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }
};

