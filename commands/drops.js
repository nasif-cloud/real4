const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { simulatePull, isArtifactCard, formatCardId } = require('../utils/cards');
const { cards } = require('../data/cards');

const DROP_CONFIG_FILE = path.join(__dirname, '..', 'drop.json');

// Store active drops: drop ID -> { messageId, channelId, userId, expiresAt, card }
const activeDrops = new Map();
const messageCounts = new Map(); // channelId -> current message count towards next drop
let messageListener = null;

// Global decay timer (reduces message count each minute)
let dropIntervalTimer = null;
let dropsChannelId = null;
let dropsClient = null; // Discord client reference

function loadDropChannelId() {
  try {
    if (fs.existsSync(DROP_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(DROP_CONFIG_FILE, 'utf8'));
      return data.channelId || null;
    }
  } catch (err) {
    console.error('Error loading drop config:', err);
  }
  return null;
}

function saveDropChannelId(channelId) {
  try {
    fs.writeFileSync(DROP_CONFIG_FILE, JSON.stringify({ channelId }, null, 2));
  } catch (err) {
    console.error('Error saving drop config:', err);
  }
}

async function createAttachmentFromUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let fileName;
    try {
      fileName = path.basename(new URL(url).pathname) || 'image.png';
    } catch {
      fileName = 'image.png';
    }
    if (!path.extname(fileName)) {
      const contentType = response.headers.get('content-type');
      if (contentType) {
        if (contentType.includes('png')) fileName += '.png';
        else if (contentType.includes('gif')) fileName += '.gif';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) fileName += '.jpg';
      }
    }
    return new AttachmentBuilder(buffer, { name: fileName });
  } catch (err) {
    return null;
  }
}

function clearDropChannelId() {
  try {
    if (fs.existsSync(DROP_CONFIG_FILE)) {
      fs.unlinkSync(DROP_CONFIG_FILE);
    }
  } catch (err) {
    console.error('Error clearing drop config:', err);
  }
}

/**
 * Initialize drops system - call this from index.js with client
 */
async function initializeDrops(client) {
  dropsClient = client;
  if (!client) return;

  const savedChannelId = loadDropChannelId();
  if (savedChannelId) {
    try {
      await startDropTimer(client, savedChannelId);
      console.log(`Resumed card drops in channel ${savedChannelId}`);
    } catch (err) {
      console.error('Unable to resume saved drop channel:', err.message || err);
    }
  }
}

/**
 * Validate a configured drops channel before starting the timer.
 */
async function validateDropsChannel(client, channelId) {
  if (!client || !channelId) return null;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || (typeof channel.isTextBased === 'function' && !channel.isTextBased())) return null;
    return channel;
  } catch {
    return null;
  }
}

/**
 * Spawn a single drop card in the configured channel
 */
async function _spawnDrop() {
  if (!dropsClient || !dropsChannelId) return;

  try {
    const channel = await validateDropsChannel(dropsClient, dropsChannelId);
    if (!channel) {
      console.error('Error spawning drop: drops channel is inaccessible or not a text channel. Stopping drop timer.');
      stopDropTimer();
      return;
    }

    // Choose rank using drop-specific distribution (DROP-only rates)
    const dropRates = [
      ['D', 20],
      ['C', 20],
      ['B', 20],
      ['A', 20],
      ['S', 18],
      ['SS', 1.9],
      ['UR', 0.1]
    ];
    const totalRate = dropRates.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * totalRate;
    let chosenRank = dropRates[dropRates.length - 1][0];
    for (const [rk, wt] of dropRates) {
      r -= wt;
      if (r <= 0) {
        chosenRank = rk;
        break;
      }
    }

    // Prefer non-artifact, non-ship pullable cards of the chosen rank
    let pool = cards.filter(c => c.pullable && !c.artifact && !c.ship && c.rank === chosenRank);
    if (!pool.length) {
      // fallback to any non-artifact non-ship pullable card
      pool = cards.filter(c => c.pullable && !c.artifact && !c.ship);
    }
    if (!pool.length) {
      // ultimate fallback: any non-artifact pullable card
      pool = cards.filter(c => c.pullable && !c.artifact);
    }
    if (!pool.length) return;
    const card = pool[Math.floor(Math.random() * pool.length)];

    const dropId = `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const claimButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`drop_claim:${dropId}`)
        .setLabel('Claim Card')
        .setStyle(ButtonStyle.Secondary)
    );

    const displayEmoji = card && card.ship ? '' : (card && card.emoji ? `${card.emoji} ` : '');
    const dropContent = `A wild **${displayEmoji}${card.character} (${card.rank})** appeared! \`${formatCardId(card.id)}\``;
    const imageUrl = card.image_url;
    let msg;

    if (imageUrl) {
      // Check if URL is from catbox.moe or wikia - send as embed since they don't work as attachments
      if (imageUrl.includes('catbox.moe') || imageUrl.includes('wikia.nocookie.net')) {
        const dropEmbed = new EmbedBuilder()
          .setDescription(dropContent)
          .setImage(imageUrl);
        msg = await channel.send({ embeds: [dropEmbed], components: [claimButton] });
      } else {
        // For other URLs, send as attachment
        const imageAttachment = await createAttachmentFromUrl(imageUrl);
        if (imageAttachment) {
          msg = await channel.send({ content: dropContent, components: [claimButton], files: [imageAttachment] });
        } else {
          // Fallback to embed if attachment creation fails
          const dropEmbed = new EmbedBuilder()
            .setDescription(dropContent)
            .setImage(imageUrl || null);
          msg = await channel.send({ embeds: [dropEmbed], components: [claimButton] });
        }
      }
    } else {
      msg = await channel.send({ content: dropContent, components: [claimButton] });
    }

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
async function startDropTimer(client, channelId) {
  const channel = await validateDropsChannel(client, channelId);
  if (!channel) {
    throw new Error('Unable to access drops channel. Make sure the bot has view/send permission in that channel.');
  }

  dropsClient = client;
  dropsChannelId = channelId;
  saveDropChannelId(channelId);
  
  // Cancel existing timer
  if (dropIntervalTimer) {
    clearInterval(dropIntervalTimer);
  }

  // Spawn first drop immediately
  // Prepare message counting for drop spawns
  // ensure previous listener cleared
  try {
    if (messageListener && dropsClient && typeof dropsClient.off === 'function') {
      dropsClient.off('messageCreate', messageListener);
    }
  } catch (err) {}

  // initialize counter for this channel
  messageCounts.set(channelId, messageCounts.get(channelId) || 0);

  messageListener = (message) => {
    try {
      if (!message || !message.channel) return;
      if (message.channel.id !== dropsChannelId) return;
      if (message.author && message.author.bot) return;
      const cur = messageCounts.get(dropsChannelId) || 0;
      const next = cur + 1;
      // Update counter
      messageCounts.set(dropsChannelId, next);
      // For every 100 messages, spawn a drop
      if (next >= 100) {
        const times = Math.floor(next / 100);
        messageCounts.set(dropsChannelId, next - (times * 100));
        for (let i = 0; i < times; i++) {
          // fire-and-forget
          _spawnDrop().catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error in drop message listener:', err);
    }
  };

  if (dropsClient && typeof dropsClient.on === 'function') {
    dropsClient.on('messageCreate', messageListener);
  }

  // Decay timer: every minute, reduce the channel's count by 1 (min 0)
  if (dropIntervalTimer) clearInterval(dropIntervalTimer);
  dropIntervalTimer = setInterval(() => {
    try {
      const cur = messageCounts.get(dropsChannelId) || 0;
      if (cur > 0) messageCounts.set(dropsChannelId, cur - 1);
    } catch (err) {
      // ignore
    }
  }, 60000);

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
  clearDropChannelId();
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

      const text = `**${card.character}** was already in your collection.\n\n+100 XP gained${gained ? ` (+${gained} lvl)` : ''}`;
      return interaction.reply({ content: text, ephemeral: true });
    } else {
      // Add new card
      user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
      if (!user.history.includes(card.id)) {
        user.history.push(card.id);
      }

      await user.save();

      const text = `You got **${card.character}**!\n\nRank: ${card.rank}`;
      return interaction.reply({ content: text, ephemeral: true });
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
