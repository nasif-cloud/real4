const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { levelers } = require('../data/levelers');
const { cards } = require('../data/cards');
const { rods } = require('../data/rods');
const { applyDefaultEmbedStyle } = require('../utils/embedStyle');
const { simulatePull } = require('../utils/cards');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getLevelerWeight(leveler) {
  if (leveler.id.startsWith('all_')) return 3;
  if (leveler.name.toLowerCase().includes('crab')) return 2;
  return 1;
}

function chooseLeveler(levelers, qualityModifier) {
  const weighted = levelers.map(leveler => {
    let weight = getLevelerWeight(leveler);
    if (weight > 1) weight *= qualityModifier;
    return { leveler, weight };
  });
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = Math.random() * totalWeight;
  for (const entry of weighted) {
    pick -= entry.weight;
    if (pick <= 0) return entry.leveler;
  }
  return weighted[weighted.length - 1].leveler;
}

// Map to store fishing state per user
const fishingStates = new Map();

module.exports = {
  name: 'fish',
  description: 'Go fishing for levelers and cards',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `/start` to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check cooldown
    if (user.lastFishFail && Date.now() - user.lastFishFail.getTime() < 10000) {
      const remaining = Math.ceil((10000 - (Date.now() - user.lastFishFail.getTime())) / 1000);
      const reply = `You scared the fish away! Wait ${remaining} seconds before fishing again.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Interactive version for both message and slash commands
    const currentRodData = rods.find(r => r.id === user.currentRod);
    const embed = new EmbedBuilder()
      .setTitle(null)
      .setDescription('**Waiting for a nibble...**');
    if (currentRodData && currentRodData.thumbnail) {
      embed.setThumbnail(currentRodData.thumbnail);
    }
    applyDefaultEmbedStyle(embed, discordUser);

    let replyMsg;
    if (message) {
      replyMsg = await message.reply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed], components: [] });
      replyMsg = null;
    }

    // Random delay 1-10 seconds
    const delay = Math.random() * 9000 + 1000;
    setTimeout(async () => {
      // Check if still valid
      if (!message && !interaction.replied) return;

      // Start the progress bar with a random target position
      let position = 0;
      const barLength = 8;
      const targetIndex = randomInt(1, barLength - 2);
      const updateBar = () => {
        const bar = Array(barLength).fill('□');
        bar[position] = '■';
        bar[targetIndex] = position === targetIndex ? '◉' : '◯';
        return bar.join('');
      };

      const embed2 = new EmbedBuilder()
        .setTitle(null)
        .setDescription(`**Catch it!**\n\nProgress: ${updateBar()}\n\nAim for the target (◉)! Click the button when the ■ is on the ◉ for the best catch!`);
      
      // Get user's rod and set thumbnail
      const currentRodData2 = rods.find(r => r.id === user.currentRod);
      if (currentRodData2 && currentRodData2.thumbnail) {
        embed2.setThumbnail(currentRodData2.thumbnail);
      }
      applyDefaultEmbedStyle(embed2, discordUser);

      const button = new ButtonBuilder()
        .setCustomId(`fish_catch:${userId}`)
        .setLabel('Reel In!')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      if (message) {
        await replyMsg.edit({ embeds: [embed2], components: [row] });
      } else {
        await interaction.editReply({ embeds: [embed2], components: [row] });
      }

      // Start moving the tick
      const interval = setInterval(async () => {
        position = (position + 1) % barLength;
        const newBar = Array(barLength).fill('□');
        newBar[position] = '■';
        newBar[targetIndex] = position === targetIndex ? '◉' : '◯';
        embed2.setDescription(`Progress: ${newBar.join('')}\n\nAim for the target (◉)! Click the button when the ■ is on the ◉ for the best catch!`);
        try {
          if (message) {
            await replyMsg.edit({ embeds: [embed2], components: [row] });
          } else {
            await interaction.editReply({ embeds: [embed2], components: [row] });
          }
        } catch (e) {
          // Message might be deleted or something
          clearInterval(interval);
          fishingStates.delete(userId);
        }
      }, Math.random() * 1500 + 1500); // 1.5 to 3 seconds

      // Store additional info for message-based commands
      fishingStates.set(userId, { 
        interval, 
        position: () => position, 
        targetIndex,
        clear: () => clearInterval(interval),
        message: replyMsg,
        interaction: interaction
      });
    }, delay);
  },

  // Function to handle the catch
  async handleCatch(interaction, userId) {
    const state = fishingStates.get(userId);
    if (!state) return;

    state.clear();
    fishingStates.delete(userId);

    // Fetch user once for the whole function
    const user = await User.findOne({ userId });

    const position = state.position();
    const targetIndex = state.targetIndex ?? 3;
    const distance = Math.abs(position - targetIndex);

    let outcome;
    if (distance === 0) {
      outcome = 'Perfect catch!';
    } else if (distance === 1) {
      outcome = 'Good catch!';
    } else {
      outcome = 'The fish got away!';
      // Set cooldown
      await User.findOneAndUpdate({ userId }, { lastFishFail: new Date() });
    }

    const embed = new EmbedBuilder()
      .setTitle(null)
      .setDescription(`${outcome}`);
    applyDefaultEmbedStyle(embed, interaction.user);

    // Get user's rod and set thumbnail
    const currentRodData = rods.find(r => r.id === user.currentRod);
    if (currentRodData && currentRodData.thumbnail) {
      embed.setThumbnail(currentRodData.thumbnail);
    }

    if (outcome === 'The fish got away!') {
      return interaction.update({ embeds: [embed], components: [] });
    }

    // Determine number of items based on rod and catch quality
    let itemCount = 1;
    const rodMultiplier = currentRodData?.betterRankMultiplier || 1;
    const qualityPenalty = distance === 1 ? 0.75 : 1;
    if (currentRodData && currentRodData.id === 'gold_rod') {
      // Gold rod: 50% of 2 items, 10% of 3 items
      const rand = Math.random();
      if (rand < 0.1) itemCount = 3;
      else if (rand < 0.6) itemCount = 2;
    } else if (currentRodData && currentRodData.id === 'white_rod') {
      // White rod: 100% of 2 items, 30% of 3 items
      const rand = Math.random();
      if (rand < 0.3) itemCount = 3;
      else itemCount = 2;
    }

    // Determine loot
    const isCard = Math.random() < 0.1; // 10% chance for card
    const lootLines = [];
    const cardRankModifier = rodMultiplier * qualityPenalty;
    const levelerQualityModifier = rodMultiplier * qualityPenalty;

    if (isCard) {
      const card = simulatePull(0, null, { rodMultiplier: cardRankModifier, mastery: 1 });
      if (card) {
        // Check if user owns U2 or U3/U4
        let targetCardId = card.id;
        let targetMastery = 1;
        for (let i = 2; i <= 4; i++) {
          const higherCard = cards.find(c => c.character === card.character && c.mastery === i);
          if (higherCard && user.ownedCards.some(oc => oc.cardId === higherCard.id)) {
            targetCardId = higherCard.id;
            targetMastery = i;
          }
        }

        const targetCard = cards.find(c => c.id === targetCardId);
        const emoji = targetCard.emoji || '🃏';
        lootLines.push(`${emoji} ${targetCard.character} (U${targetMastery})`);

        const existing = user.ownedCards.find(c => c.cardId === targetCardId);
        if (existing) {
          existing.level = Math.max(existing.level, 1);
        } else {
          user.ownedCards.push({ cardId: targetCardId, level: 1, xp: 0 });
        }
      }
    } else {
      // Add multiple levelers based on rod quality
      for (let i = 0; i < itemCount; i++) {
        const randomLeveler = chooseLeveler(levelers, levelerQualityModifier);
        lootLines.push(`${randomLeveler.emoji} ${randomLeveler.name}`);

        const existingItem = user.items.find(it => it.itemId === randomLeveler.id);
        if (existingItem) {
          existingItem.quantity += 1;
        } else {
          user.items.push({ itemId: randomLeveler.id, quantity: 1 });
        }
      }
    }

    embed.addFields({ name: 'Loot', value: lootLines.join('\n') });
    await user.save();

    return interaction.update({ embeds: [embed], components: [] });
  }
};