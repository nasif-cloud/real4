const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { simulatePull, buildPullEmbed } = require('../utils/cards');

// Store active drops: drop ID -> { messageId, channelId, userId, expiresAt, card }
const activeDrops = new Map();

// Global drop interval timer
let dropIntervalTimer = null;
let dropsChannelId = null;
let dropsClient = null; // Discord client reference

/**
 * Initialize drops system - call this from index.js with client
 */
function initializeDrops(client) {
  dropsClient = client;
}

/**
 * Spawn a single drop card in the configured channel
 */
async function _spawnDrop() {
  if (!dropsClient || !dropsChannelId) return;

  try {
    const channel = await dropsClient.channels.fetch(dropsChannelId);
    if (!channel) return;

    // Simulate a pull (U1 cards only)
    const card = simulatePull(0, null); // pityCount=0, no faculty filter

    if (!card) return;

    // Create embed for the drop
    const color = card.rank === 'D' ? '#B87333' : card.rank === 'C' ? '#f9a53f' : '#2b2d31';
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('Card Drop!')
      .setDescription(`A wild **${card.character}** appeared!`)
      .setImage(card.image_url || null)
      .setFooter({ text: `Rank: ${card.rank} | Expires in 10 minutes` });

    const dropId = `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const claimButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`drop_claim:${dropId}`)
        .setLabel('Claim Card')
        .setStyle(ButtonStyle.Success)
    );

    const msg = await channel.send({ embeds: [embed], components: [claimButton] });

    // Store drop info with 10-minute expiration
    const expiresAt = Date.now() + 600000; // 10 minutes
    activeDrops.set(dropId, {
      messageId: msg.id,
      channelId: channel.id,
      card,
      expiresAt
    });

    // Auto-cleanup after 10 minutes
    setTimeout(() => {
      const drop = activeDrops.get(dropId);
      if (drop) {
        try {
          msg.edit({ components: [] }).catch(() => {}); // Remove button
        } catch {}
        activeDrops.delete(dropId);
      }
    }, 600000);
  } catch (err) {
    console.error('Error spawning drop:', err);
  }
}

/**
 * Start the drop spawning timer
 */
function startDropTimer(client, channelId) {
  dropsClient = client;
  dropsChannelId = channelId;
  
  // Cancel existing timer
  if (dropIntervalTimer) {
    clearInterval(dropIntervalTimer);
  }

  // Spawn first drop immediately
  _spawnDrop();

  // Spawn drops every 5 minutes (300,000 ms)
  dropIntervalTimer = setInterval(_spawnDrop, 300000);

  return true;
}

/**
 * Stop the drop spawning timer
 */
function stopDropTimer() {
  if (dropIntervalTimer) {
    clearInterval(dropIntervalTimer);
    dropIntervalTimer = null;
  }
  dropsChannelId = null;
}

/**
 * Handle drop claim button
 */
async function handleDropClaim(interaction, dropId) {
  const drop = activeDrops.get(dropId);

  if (!drop) {
    return interaction.reply({
      content: 'This drop has expired or was already claimed.',
      ephemeral: true
    });
  }

  // Check if drop has expired
  if (Date.now() > drop.expiresAt) {
    activeDrops.delete(dropId);
    return interaction.reply({
      content: 'This drop has expired.',
      ephemeral: true
    });
  }

  try {
    const user = await User.findOne({ userId: interaction.user.id });

    if (!user) {
      return interaction.reply({
        content: 'You need an account first. Run `/start` to register.',
        ephemeral: true
      });
    }

    const { card } = drop;

    // Check if user already owns this card at u1
    const existingEntry = user.ownedCards.find(e => e.cardId === card.id);

    if (existingEntry) {
      // Add XP as duplicate
      existingEntry.xp = (existingEntry.xp || 0) + 100;
      const gained = Math.floor(existingEntry.xp / 100);
      if (gained > 0) {
        existingEntry.level = (existingEntry.level || 1) + gained;
        existingEntry.xp = existingEntry.xp % 100;
      }

      await user.save();

      const dupeEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('Card Claimed (Duplicate)')
        .setDescription(`**${card.character}** was already in your collection.\n\n+100 XP gained${gained ? ` (+${gained} lvl)` : ''}`)
        .setImage(card.image_url || null);

      return interaction.reply({ embeds: [dupeEmbed], ephemeral: true });
    } else {
      // Add new card
      user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
      if (!user.history.includes(card.id)) {
        user.history.push(card.id);
      }

      await user.save();

      const newEmbed = new EmbedBuilder()
        .setColor('#00AA00')
        .setTitle('Card Claimed!')
        .setDescription(`You got **${card.character}**!\n\n**Rank:** ${card.rank}\n**Type:** ${card.type}`)
        .setImage(card.image_url || null);

      return interaction.reply({ embeds: [newEmbed], ephemeral: true });
    }
  } catch (err) {
    console.error('Error claiming drop:', err);
    return interaction.reply({
      content: 'An error occurred while claiming the drop.',
      ephemeral: true
    });
  } finally {
    // Remove drop and button
    activeDrops.delete(dropId);
    try {
      const channel = await dropsClient.channels.fetch(drop.channelId);
      const msg = await channel.messages.fetch(drop.messageId);
      await msg.edit({ components: [] });
    } catch {}
  }
}

module.exports = {
  initializeDrops,
  startDropTimer,
  stopDropTimer,
  handleDropClaim,
  activeDrops
};
