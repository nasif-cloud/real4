const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { findBestOwnedCard, buildCardEmbed, getCardFinalStats, getAttributeEmoji } = require('../utils/cards');
const { sortedOwnedCards } = require('./collection');
const User = require('../models/User');
const { cards } = require('../data/cards');
const { rods } = require('../data/rods');
const { levelers } = require('../data/levelers');
const crews = require('../data/crews');

function makeInfoRow(index, total, cardDef, isOwned) {
  const prevDisabled = index <= 0;
  const nextDisabled = index >= total - 1;
  const components = [
    new ButtonBuilder()
      .setCustomId(`info_prev:${index}`)
      .setLabel('Previous')
      .setEmoji({ id: '1489374714379112449' })
      .setStyle(prevDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(`info_next:${index}`)
      .setLabel('Next')
      .setEmoji({ id: '1489374606916714706' })
      .setStyle(nextDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(nextDisabled)
  ];
  
  // Only add boost button if card is owned
  if (isOwned) {
    components.push(
      new ButtonBuilder()
        .setCustomId(`info_boost:boost`)
        .setLabel('Boosts')
        .setEmoji('<:boosticon:1490506833344073768>')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  
  return new ActionRowBuilder().addComponents(...components);
}

function buildBoostEmbed(cardDef, userEntry, user) {
  const lvl = userEntry ? userEntry.level : 1;
  const stats = getCardFinalStats(cardDef, lvl, user);
  const boostEntries = stats.boostEntries || [];
  const statBoosts = stats.statBoosts || {};
  // Calculate level boost percent
  const levelBoostPct = Math.ceil(lvl / 10); // +1% per 10 levels, rounded up

  // Always define cardEmoji at the top
  const cardEmoji = cardDef.emoji ? cardDef.emoji + ' ' : '';

  // Compose boost lines with correct emoji and format
  const lines = [];
  // Show all character/crew boosts first, with emoji
  if (boostEntries.length) {
    const { cards } = require('../data/cards');
    boostEntries.forEach(b => {
      if (b.source === 'Levels') return; // skip, will add at end
      // Find the booster card by character name (case-insensitive)
      let emoji = '';
      const boosterCard = cards.find(c => c.character.toLowerCase() === b.source.toLowerCase());
      if (boosterCard && boosterCard.emoji) {
        emoji = boosterCard.emoji + ' ';
      }
      if (b.stat) {
        lines.push(`${emoji}**${b.source}**: boosts ${b.stat} by \`${b.pct}%\``);
      } else {
        lines.push(`${emoji}**${b.source}**: boosts all stats by \`${b.pct}%\``);
      }
    });
  }
  // Always show level boost last, no emoji
  lines.push(`**Levels**: boosts all stats by \`${levelBoostPct}%\``);

  // Compose summary
  const baseStats = `**Base stats:** ${cardDef.power} Power, ${cardDef.health} Health, ${cardDef.speed} Speed, ${cardDef.attack_min} - ${cardDef.attack_max} Attack`;
  // Compose total boost summary in requested format
  let totalParts = [];
  // Add all stats (levels + other all stats boosts)
  let allStatsTotal = levelBoostPct + (stats.totalBoostPct || 0);
  if (allStatsTotal > 0) totalParts.push(`\`${allStatsTotal}%\` all stats`);
  // Add stat-specific boosts
  Object.entries(statBoosts).forEach(([stat, pct]) => {
    totalParts.push(`\`${pct}%\` ${stat}`);
  });
  const totalBoostLine = `**Total boost:** ${totalParts.join(' + ')}`;

  const embed = new EmbedBuilder()
    .setTitle(`${cardEmoji}${cardDef.character} active boosts`)
    .setColor('#2b2d31')
    .setDescription(`${baseStats}\n${totalBoostLine}`)
    .addFields({ name: 'Active boosts', value: lines.join('\n'), inline: false });

  return embed;
}

async function renderInfoCard(interaction, session, user, index) {
  const cardDef = session.cards[index];
  const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;
  const avatarUrl = interaction.user.displayAvatarURL();
  const embed = buildCardEmbed(cardDef, userEntry, avatarUrl, user);
  const isOwned = userEntry !== null;
  const row = makeInfoRow(index, session.cards.length, cardDef, isOwned);
  session.currentIndex = index;
  return interaction.update({ embeds: [embed], components: [row] });
}

function getCrewByName(query) {
  if (!query) return null;
  const queryLower = query.toLowerCase().trim();
  return crews.find(crew => crew.name.toLowerCase() === queryLower);
}

function parseEmojiUrl(emoji) {
  if (!emoji || typeof emoji !== 'string') return null;
  const match = emoji.match(/<a?:[^:]+:(\d+)>/);
  return match ? `https://cdn.discordapp.com/emojis/${match[1]}.png` : null;
}

const attributeColors = {
  STR: '#ff4b4b',
  DEX: '#33cc33',
  QCK: '#3498ff',
  PSY: '#f5df4d',
  INT: '#9b59b6',
  ALL: '#9fa8da'
};

function getRodByName(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  return rods.find(r => r.name.toLowerCase() === q || r.id.toLowerCase() === q) || null;
}

function getLevelerByName(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  return levelers.find(l => l.name.toLowerCase() === q || l.id.toLowerCase() === q) || null;
}

function getRodColor(rodId) {
  switch (rodId) {
    case 'basic_rod': return '#8B4513'; // brown
    case 'gold_rod': return '#FFD700'; // golden
    case 'white_rod': return '#F8F8FF'; // shiny white
    default: return '#FFFFFF';
  }
}

function buildDurabilityBar(current, max) {
  if (max <= 0) return '';
  if (current <= 0) {
    return '<:Healthemptyleft:1481750325151928391>' +
           '<:Healthemptymiddle:1481750341489004596>'.repeat(6) +
           '<:healthemptyright:1481750363286667334>';
  }
  
  const healthPercent = Math.max(0, Math.min(1, current / max));
  const totalSections = 8;
  const filledSections = Math.floor(healthPercent * totalSections);
  const emptySections = totalSections - filledSections;
  
  const icons = [
    emptySections > 0 ? '<:Healthemptyleft:1481750325151928391>' : '<:durabilltyleftfull:1491513785570033734>',
    emptySections > 1 ? '<:Healthemptymiddle:1481750341489004596>' : '<:durabilitymiddlefulll:1491513816654155838>',
    emptySections > 2 ? '<:Healthemptymiddle:1481750341489004596>' : '<:durabilitymiddlefulll:1491513816654155838>',
    emptySections > 3 ? '<:Healthemptymiddle:1481750341489004596>' : '<:durabilitymiddlefulll:1491513816654155838>',
    emptySections > 4 ? '<:Healthemptymiddle:1481750341489004596>' : '<:durabilitymiddlefulll:1491513816654155838>',
    emptySections > 5 ? '<:Healthemptymiddle:1481750341489004596>' : '<:durabilitymiddlefulll:1491513816654155838>',
    emptySections > 6 ? '<:Healthemptymiddle:1481750341489004596>' : '<:durabilitymiddlefulll:1491513816654155838>',
    emptySections > 7 ? '<:healthemptyright:1481750363286667334>' : '<:durabilityrightfull:1491513801089093923>'
  ];
  
  return icons.join('');
}

function buildRodEmbed(rodDef, discordUser, user) {
  const rodItem = user && user.items?.find(it => it.itemId === rodDef.id);
  const durabilityLabel = rodItem && rodItem.durability !== undefined
    ? `\`${rodItem.durability}/${rodDef.durability}\` uses`
    : `\`${rodDef.durability}\` uses`;

  const embed = new EmbedBuilder()
    .setTitle(rodDef.name)
    .setColor(getRodColor(rodDef.id))
    .setThumbnail(parseEmojiUrl(rodDef.emoji))
    .setDescription(`${rodDef.emoji}`)
    .addFields(
      { name: 'Multiplier', value: `\`${rodDef.multiplier}x\``, inline: true },
      { name: 'Fishing speed', value: `\`${rodDef.multiplier}x\` faster nibble wait`, inline: true },
      { name: 'Rarity bonus', value: `\`${rodDef.multiplier}x\` reward and rarity scaling`, inline: false },
      { name: 'Luck bonus', value: `\`${Math.round((rodDef.luckBonus || 0) * 100)}%\``, inline: true },
      { name: 'Durability', value: durabilityLabel, inline: true },
      { name: 'Cost', value: `${rodDef.cost.toLocaleString()} <:beri:1490738445319016651>`, inline: true }
    );
  
  if (rodItem && rodItem.durability !== undefined) {
    const durabilityBar = buildDurabilityBar(rodItem.durability, rodDef.durability);
    embed.addFields({ name: 'Durability Bar', value: `${durabilityBar} (${rodItem.durability}/${rodDef.durability})`, inline: false });
  }
  
  if (discordUser) embed.setAuthor({ name: discordUser.username, iconURL: discordUser.displayAvatarURL() });
  return embed;
}

function buildLevelerEmbed(levelerDef, discordUser, user) {
  const xpValue = typeof levelerDef.xp === 'object'
    ? Object.entries(levelerDef.xp).map(([attr, value]) => `**${attr}**: ${value}`).join('\n')
    : `\`${levelerDef.xp}\``;
  const ownedCount = user && Array.isArray(user.items)
    ? user.items.reduce((sum, item) => item.itemId === levelerDef.id ? sum + (item.quantity || 0) : sum, 0)
    : 0;
  const descLines = [
    `**Owned:** ${ownedCount}x`,
    `**Rank:** ${levelerDef.rank}`,
    `**Attribute:** ${getAttributeEmoji(levelerDef.attribute)}`,
    `**Sell price:** <:beri:1490738445319016651> ${levelerDef.beli}`
  ];
  const embed = new EmbedBuilder()
    .setTitle(levelerDef.name)
    .setColor(attributeColors[levelerDef.attribute] || '#2b2d31')
    .setThumbnail(parseEmojiUrl(levelerDef.emoji))
    .setDescription(descLines.join('\n'))
    .addFields({ name: 'XP awarded', value: xpValue, inline: false });
  if (discordUser) embed.setAuthor({ name: discordUser.username, iconURL: discordUser.displayAvatarURL() });
  return embed;
}

function buildPackEmbed(crewDef, discordUser) {
  // Get all cards from this crew
  const crewCards = cards.filter(c => c.faculty === crewDef.name);
  
  // Get unique cards by character, sorted by attribute then name
  const uniqueByCharacter = new Map();
  crewCards.forEach(c => {
    if (!uniqueByCharacter.has(c.character)) {
      uniqueByCharacter.set(c.character, c);
    }
  });
  
  // Attribute order: STR, DEX, QCK, PSY, INT
  const attributeOrder = ['STR', 'DEX', 'QCK', 'PSY', 'INT'];
  
  // Sort by attribute, then by character name
  const sortedCharacters = Array.from(uniqueByCharacter.values())
    .sort((a, b) => {
      const aAttrIdx = attributeOrder.indexOf(a.attribute || 'STR');
      const bAttrIdx = attributeOrder.indexOf(b.attribute || 'STR');
      if (aAttrIdx !== bAttrIdx) return aAttrIdx - bAttrIdx;
      return a.character.localeCompare(b.character);
    });
  
  const cardCount = uniqueByCharacter.size;
  
  // Define rank colors.
  const rankColors = {
    'D': '#f6efe9',    // Gray
    'C': '#fff6ec',    // Green
    'B': '#c6c6c7',    // Blue
    'A': '#ecf5ff',    // Gold
    'S': '#fff2f0',    // Tomato/Red
    'SS': '#fce6fb',   // Purple
    'UR': '#f1ffff'    // Turquoise
  };
  
  const rankEmojis = {
    'D': '<:D:1489355343262310401>',
    'C': '<:C:1489355299844235395>',
    'B': '<:B:1489355220848816198>',
    'A': '<:A:1489355161318232093>',
    'S': '<:S:1489355105388261446>',
    'SS': '<:SS:1489355033819054121>',
    'UR': '<:UR:1489354976039927869>'
  };
  
  const rankColor = rankColors[crewDef.rank] || '#FFFFFF';
  const rankEmoji = rankEmojis[crewDef.rank] || '';
  
  // Build character list with emojis, one per line
  const characterLines = sortedCharacters.map(card => {
    const emoji = card.emoji || '';
    return `${emoji} ${card.character}`;
  });
  
  // Join all characters (no limit)
  const characterList = characterLines.join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`${crewDef.icon} ${crewDef.name}`)
    .setColor(rankColor)
    .setDescription(`**Rank:** ${crewDef.rank}\n**Cards:** ${cardCount}`)
    .setImage(crewDef.packImage || '')
    .setAuthor({ name: discordUser.username, iconURL: discordUser.displayAvatarURL() });
  
  if (characterList) {
    embed.addFields({ name: 'Characters', value: characterList, inline: false });
  }
  
  return embed;
}

module.exports = {
  name: 'info',
  description: 'Show ownership and history of a card or pack info',
  options: [{ name: 'query', type: 3, description: 'Card name or pack name', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    
    // First, check if query matches a crew/pack name
    const crewDef = getCrewByName(query);
    if (crewDef) {
      const packEmbed = buildPackEmbed(crewDef, discordUser);
      if (message) return message.channel.send({ embeds: [packEmbed] });
      return interaction.reply({ embeds: [packEmbed] });
    }

    // Then check exact rod and leveler names only
    const rodDef = getRodByName(query);
    if (rodDef) {
      const user = await User.findOne({ userId });
      const rodEmbed = buildRodEmbed(rodDef, discordUser, user);
      if (message) return message.channel.send({ embeds: [rodEmbed] });
      return interaction.reply({ embeds: [rodEmbed] });
    }

    const levelerDef = getLevelerByName(query);
    if (levelerDef) {
      const user = await User.findOne({ userId });
      const levelerEmbed = buildLevelerEmbed(levelerDef, discordUser, user);
      if (message) return message.channel.send({ embeds: [levelerEmbed] });
      return interaction.reply({ embeds: [levelerEmbed] });
    }

    // Otherwise, fall back to card lookup
    const cardDef = await findBestOwnedCard(userId, query);
    if (!cardDef) {
      const reply = `No card found matching **${query}**.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const user = await User.findOne({ userId });
    const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;

    // Only show all mastery versions of this character for navigation
    const allVersions = require('../utils/cards').getAllCardVersions(cardDef.character);
    const sessionCards = allVersions.map(id => require('../utils/cards').getCardById(id)).filter(Boolean);
    const currentIndex = sessionCards.findIndex(c => c.id === cardDef.id);
    const session = { userId, cards: sessionCards, currentIndex: currentIndex >= 0 ? currentIndex : 0 };
    if (!global.infoSessions) global.infoSessions = new Map();
    global.infoSessions.set(`${userId}_info`, session);

    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const embed = buildCardEmbed(cardDef, userEntry, avatarUrl, user);
    const isOwned = userEntry !== null;
    const row = makeInfoRow(session.currentIndex, session.cards.length, cardDef, isOwned);

    if (message) return message.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleButton(interaction, action, indexPart) {
    const session = global.infoSessions?.get(`${interaction.user.id}_info`);
    if (!session || session.userId !== interaction.user.id) {
      return interaction.reply({ content: 'Info session expired or not your session.', ephemeral: true });
    }

    const user = await User.findOne({ userId: interaction.user.id });
    const currentIndex = parseInt(session.currentIndex ?? 0, 10) || 0;

    if (action === 'info_prev' || action === 'info_next') {
      let nextIndex = currentIndex;
      if (action === 'info_prev') nextIndex = Math.max(0, currentIndex - 1);
      if (action === 'info_next') nextIndex = Math.min(session.cards.length - 1, currentIndex + 1);
      return renderInfoCard(interaction, session, user, nextIndex);
    }

    if (action === 'info_boost') {
      const cardDef = session.cards[currentIndex];
      const userEntry = user?.ownedCards?.find(e => e.cardId === cardDef.id) || null;
      const embed = buildBoostEmbed(cardDef, userEntry, user);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: 'Unknown action.', ephemeral: true });
  }
};