const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getCurrentStock, getStockCountdownString, getPricing, ensureStockUpToDate, getNextStockResetDate } = require('../src/stock');
const User = require('../models/User');

const RANK_COLORS = {
  D: '#F7FBFF',
  C: '#EBF3FF',
  B: '#D6E5FF',
  A: '#B8D0FF',
  S: '#8AA6FF',
  SS: '#5E7CFF',
  UR: '#2B4EBF'
};

function formatStockDescription(stock) {
  const lines = stock.map((pack, index) => {
    const price = getPricing()[pack.rank] || 0;
    return `**${index + 1}.** ${pack.quantity}x **${pack.icon} ${pack.name}** · \`${price} gems\``;
  });

  return `Click a button below to buy one pack!\n\n${lines.join('\n')}`;
}

function buildStockEmbed(stock, countdown, resetTimestamp, hasImage = true) {
  const color = stock.length ? RANK_COLORS[stock[0].rank] || '#1E40AF' : '#1E40AF';
  const description = formatStockDescription(stock);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setFooter({ text: `Resets in ${countdown}` });

  if (hasImage) {
    embed.setImage('attachment://stock.png');
  }

  if (resetTimestamp) {
    embed.setTimestamp(resetTimestamp);
  }

  return embed;
}

function buildStockRow(stock) {
  const row = new ActionRowBuilder();
  stock.forEach((pack, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`stock_buy:${index}`)
        .setLabel(`${index + 1}`)
        .setStyle(pack.quantity > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(pack.quantity <= 0)
    );
  });
  return row;
}

async function createStockImage(stock) {
  // Dimensions for the full landscape canvas
  const imageWidth = 200; // width of each pack image in pixels
  const imageHeight = 300; // height of each pack image in pixels
  const padding = 0; // padding around the edges and between pack images in pixels
  const packCount = Math.min(stock.length, 3); // number of packs to render

  // Canvas width = left padding + pack widths + spaces between packs + right padding
  const width = padding + packCount * imageWidth + (packCount - 1) * padding + padding;
  // Canvas height = top padding + pack height + bottom padding
  const height = padding + imageHeight + padding;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background rectangle covers the full canvas from (0, 0) to (width, height)
  ctx.fillStyle = '#2f3136';
  ctx.fillRect(0, 0, width, height);

  // Load images in parallel
  const imagePromises = stock.slice(0, packCount).map(async (pack) => {
    if (pack.packImage && pack.packImage.trim()) {
      try {
        const controller = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? null
          : new AbortController();
        const response = await fetch(pack.packImage, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller ? controller.signal : AbortSignal.timeout(10000)
        });
        if (controller) {
          setTimeout(() => controller.abort(), 10000);
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return await loadImage(buffer);
      } catch (err) {
        console.warn(`Stock pack image unavailable for ${pack.name}: ${err?.message || err}`);
        return null;
      }
    }
    return null;
  });

  const images = await Promise.all(imagePromises);

  // Draw each pack image side by side
  for (let index = 0; index < packCount; index++) {
    const pack = stock[index];
    const image = images[index];

    // X, Y position for the current pack image
    const x = padding + index * (imageWidth + padding); // pack X position
    const y = padding; // pack Y position (same for all packs)

    if (image) {
      // Draw the booster pack image at the specified position and size
      ctx.drawImage(image, x, y, imageWidth, imageHeight);
    } else {
      // Fallback placeholder if image fails to load
      ctx.fillStyle = '#4b4f57';
      ctx.fillRect(x, y, imageWidth, imageHeight);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.fillText(pack.name, x + 10, y + 20);
    }
  }

  return canvas.toBuffer('image/png');
}

function getStockResetTimestamp() {
  return getNextStockResetDate();
}

module.exports = {
  name: 'stock',
  description: 'View current pack stock',
  async execute({ message, interaction }) {
    ensureStockUpToDate();
    const globalStock = getCurrentStock().slice(0, 3);
    let stock = globalStock;
    // show per-user local stock when possible (do not decrement global stock on buy)
    let user = null;
    try {
      user = await User.findOne({ userId: message ? message.author.id : interaction.user.id });
    } catch (err) {
      user = null;
    }
    if (user && user.localStock) {
      stock = globalStock.map(p => {
        const qty = typeof user.localStock[p.name] !== 'undefined' ? user.localStock[p.name] : p.quantity;
        return { ...p, quantity: qty };
      });
    }

    if (!stock.length) {
      const reply = 'No stock is available right now.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const countdown = getStockCountdownString();
    const resetTimestamp = getStockResetTimestamp();
    const imageBuffer = await createStockImage(stock);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'stock.png' });
    const embed = buildStockEmbed(stock, countdown, resetTimestamp, true);
    const row = buildStockRow(stock);
    const content = 'here is the current pack stock!';

    if (message) {
      return message.channel.send({ content, embeds: [embed], components: [row], files: [attachment] });
    }

    return interaction.reply({ content, embeds: [embed], components: [row], files: [attachment] });
  },

  async handleButton(interaction, buttonIndex) {
    ensureStockUpToDate();
    const globalStock = getCurrentStock().slice(0, 3);
    const index = Number(buttonIndex);
    if (Number.isNaN(index) || index < 0 || index >= globalStock.length) {
      return interaction.reply({ content: 'Invalid pack selection.', ephemeral: true });
    }

    const pack = globalStock[index];
    if (pack.quantity <= 0) {
      return interaction.reply({ content: 'That pack is sold out.', ephemeral: true });
    }

    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      return interaction.reply({ content: 'You need an account first – run `op start` or /start.', ephemeral: true });
    }

    const price = getPricing()[pack.rank] || 0;
    if ((user.gems || 0) < price) {
      return interaction.reply({ content: `You need **${price}** Gems to buy ${pack.icon} **${pack.name}**.`, ephemeral: true });
    }

    // Per-user stock: initialize local stock on first interaction and decrement only for this user
    user.localStock = user.localStock || {};
    if (typeof user.localStock[pack.name] === 'undefined') {
      const match = globalStock.find(s => s.name === pack.name);
      user.localStock[pack.name] = match ? (match.quantity || 0) : (pack.quantity || 0);
    }
    if (user.localStock[pack.name] < 1) {
      return interaction.reply({ content: `Not enough stock remaining for ${pack.name} packs.`, ephemeral: true });
    }

    user.localStock[pack.name] -= 1;
    user.gems -= price;
    user.packInventory = user.packInventory || {};
    user.packInventory[pack.name] = (user.packInventory[pack.name] || 0) + 1;
    user.markModified('packInventory');
    user.markModified('localStock');
    await user.save();

    const updatedGlobal = getCurrentStock().slice(0, 3);
    const updatedStock = (user && user.localStock) ? updatedGlobal.map(p => {
      const qty = typeof user.localStock[p.name] !== 'undefined' ? user.localStock[p.name] : p.quantity;
      return { ...p, quantity: qty };
    }) : updatedGlobal;

    const countdown = getStockCountdownString();
    const resetTimestamp = getStockResetTimestamp();
    const imageBuffer = await createStockImage(updatedStock);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'stock.png' });
    const embed = buildStockEmbed(updatedStock, countdown, resetTimestamp, true);
    const row = buildStockRow(updatedStock);

    await interaction.update({
      content: 'here is the current pack stock!',
      embeds: [embed],
      components: [row],
      files: [attachment]
    });

    return interaction.followUp({ content: `You bought 1x ${pack.icon} **${pack.name}** for **${price} gems**!`, ephemeral: true });
  }
};