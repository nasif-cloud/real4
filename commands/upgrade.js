const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCardById, getAllCardVersions, searchCards, findBestOwnedCard } = require('../utils/cards');
const { cards } = require('../data/cards');

// Upgrade requirements: cardId -> array of required card IDs
// Characters from main cards.js can have requirements; morecards.js only have currency costs
const UPGRADE_REQUIREMENTS = {
  'luffy-u2': ['zoro-u1', 'nami-u1', 'usopp-u1', 'sanji-u1'],
  'luffy-u3': ['chopper-u1', 'robin-u1', 'franky-u1', 'brook-u1'],
  'luffy-u4': ['jinbe-u1'],
  // Add more as needed
};

// Upgrade costs
const UPGRADE_COSTS = {
  'D': { beli: 50, gems: 0 },
  'C': { beli: 100, gems: 1 },
  'B': { beli: 500, gems: 3 },
  'A': { beli: 1125, gems: 5 },
  'S': { beli: 2015, gems: 8 },
  'SS': { beli: 3700, gems: 15 },
  'UR': { beli: 5000, gems: 27 }
};

module.exports = {
  name: 'upgrade',
  description: 'Upgrade one of your cards to next mastery',
  options: [{ name: 'query', type: 3, description: 'Card you own', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const username = message ? message.author.username : interaction.user.username;
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account to upgrade cards.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const base = await findBestOwnedCard(userId, query);
    if (!base) {
      const reply = `No card found matching "${query}".`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const ownedEntry = user.ownedCards.find(e => e.cardId === base.id);
    if (!ownedEntry) {
      const reply = `You don't own **${base.character}** mastery ${base.mastery}.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (base.mastery >= base.mastery_total) {
      const reply = `**${base.character}** is already at maximum mastery.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // find next mastery card definition
    const next = cards.find(c => c.character === base.character && c.mastery === base.mastery + 1);
    if (!next) {
      const reply = `No higher mastery found for **${base.character}**.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check if requirements are enabled
    const requirementsEnabled = !user.upgradeRequirementsDisabled; // true by default

    // Check requirements if enabled - read from card's upgradeRequirements field if it exists
    let missingRequirements = [];
    if (requirementsEnabled) {
      // First check if card has upgradeRequirements field
      const cardRequirements = next.upgradeRequirements || UPGRADE_REQUIREMENTS[next.id];
      if (cardRequirements) {
        missingRequirements = cardRequirements.filter(cardId =>
          !user.ownedCards.some(e => e.cardId === cardId)
        );
      }
    }

    if (missingRequirements.length > 0) {
      const missingNames = missingRequirements.map(id => {
        const card = cards.find(c => c.id === id);
        return card ? card.character : id;
      }).join(', ');
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`Cannot Upgrade ${base.character}`)
        .setDescription(`You're missing the following required cards:\n\n${missingNames}`)
        .setFooter({ text: `Next version: ${next.title || next.character}` })
        .setAuthor({ name: username, iconURL: avatarUrl });

      if (message) return message.reply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Check level requirement based on target rank
    const LEVEL_REQUIREMENTS = { C: 5, B: 10, A: 25, S: 30, SS: 50, UR: 75 };
    const requiredLevel = LEVEL_REQUIREMENTS[next.rank] || 1;
    if ((ownedEntry.level || 1) < requiredLevel) {
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`Cannot Upgrade ${base.character}`)
        .setDescription(`Your card is not high enough level.\n\n**Required Level:** ${requiredLevel}\n**Your Level:** ${ownedEntry.level || 1}`)
        .setFooter({ text: `Next version: ${next.title || next.character}` })
        .setAuthor({ name: username, iconURL: avatarUrl });

      if (message) return message.reply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Get upgrade costs
    const nextRank = next.rank;
    const costs = UPGRADE_COSTS[nextRank] || { beli: 1000, gems: 5 };

    // Check currency - user.balance is beli, user.gems is gems
    const userBeli = user.balance || 0;
    const userGems = user.gems || 0;
    const canAffordBeli = userBeli >= costs.beli;
    const canAffordGems = userGems >= costs.gems;

    if (!canAffordBeli && !canAffordGems) {
      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle(`Cannot Upgrade ${base.character}`)
        .setDescription(`You don't have enough currency.\n\nRequired:\n• **Beli:** ${costs.beli} (you have ${userBeli})\n• **Gems:** ${costs.gems} (you have ${userGems})`)
        .setFooter({ text: `New Version: ${next.title || next.character}` })
        .setAuthor({ name: username, iconURL: avatarUrl });

      if (message) return message.reply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Show upgrade confirmation with payment options
    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`Upgrade ${base.character}?`)
      .setDescription(`**Current:** Mastery ${base.mastery}\n**Next:** Mastery ${next.mastery}\n\nSelect a payment method:`)
      .setAuthor({ name: username, iconURL: avatarUrl })
      .addFields(
        { name: 'Beli', value: `${costs.beli} Beli ${canAffordBeli ? '✓' : '✗ (insufficient)'}`, inline: true },
        { name: 'Gems', value: `${costs.gems} Gems ${canAffordGems ? '✓' : '✗ (insufficient)'}`, inline: true }
      );

    const buttons = new ActionRowBuilder();
    if (canAffordBeli) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`upgrade_beli_${base.id}_${next.id}`)
          .setLabel(`Pay with Beli (${costs.beli})`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    if (canAffordGems) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`upgrade_gems_${base.id}_${next.id}`)
          .setLabel(`Pay with Gems (${costs.gems})`)
          .setStyle(ButtonStyle.Success)
      );
    }
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('upgrade_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    let msg;
    if (message) {
      msg = await message.reply({ embeds: [embed], components: [buttons] });
    } else {
      msg = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });
    }

    setTimeout(() => {
      embed.setFooter({ text: 'Expired' });
      msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }, 180000);
  },
  
  // Export button handler for use in main index.js
  handleUpgradeButton: async (interaction) => {
    const [action, paymentType, currentCardId, nextCardId] = interaction.customId.split('_');

    if (action !== 'upgrade') return;

    if (paymentType === 'cancel') {
      return interaction.update({ content: 'Upgrade cancelled.', embeds: [], components: [] });
    }

    const userId = interaction.user.id;
    let user = await User.findOne({ userId });

    if (!user) {
      return interaction.reply({ content: 'User not found.', ephemeral: true });
    }

    const currentCard = cards.find(c => c.id === currentCardId);
    const nextCard = cards.find(c => c.id === nextCardId);
    const ownedEntry = user.ownedCards.find(e => e.cardId === currentCardId);

    if (!ownedEntry || !currentCard || !nextCard) {
      return interaction.update({ content: 'Card not found in inventory.', embeds: [], components: [] });
    }

    // Get upgrade costs
    const costs = UPGRADE_COSTS[nextCard.rank] || { beli: 1000, gems: 5 };
    const userBeli = user.balance || 0;
    const userGems = user.gems || 0;

    // Process payment
    if (paymentType === 'beli') {
      if (userBeli < costs.beli) {
        return interaction.update({
          content: `Insufficient Beli. You have ${userBeli}, need ${costs.beli}.`,
          embeds: [],
          components: []
        });
      }
      user.balance = (user.balance || 0) - costs.beli;
    } else if (paymentType === 'gems') {
      if (userGems < costs.gems) {
        return interaction.update({
          content: `Insufficient Gems. You have ${userGems}, need ${costs.gems}.`,
          embeds: [],
          components: []
        });
      }
      user.gems = (user.gems || 0) - costs.gems;
    } else {
      return;
    }

    // Add new card version to inventory or update existing
    const existingEntry = user.ownedCards.find(e => e.cardId === nextCardId);
    if (existingEntry) {
      existingEntry.level = 1;
      existingEntry.xp = 0;
    } else {
      user.ownedCards.push({ cardId: nextCardId, level: 1, xp: 0 });
    }

    // Add to history if not already there
    if (!user.history.includes(nextCardId)) user.history.push(nextCardId);

    await user.save();

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Upgrade Complete!')
      .setDescription(`**${currentCard.character}** upgraded to mastery ${nextCard.mastery}`)
      .addFields(
        { name: 'Payment', value: `${paymentType === 'beli' ? costs.beli + ' Beli' : costs.gems + ' Gems'}` },
        { name: 'New Stats', value: `Health: ${nextCard.health}, Power: ${nextCard.power}, Speed: ${nextCard.speed}` }
      )
      .setImage(nextCard.image_url || null);

    return interaction.update({ content: '', embeds: [embed], components: [] });
  }
};