const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder } = require('discord.js');
const isail = require('./isail');
const { getShipById, getCardById } = require('../utils/cards');
const { getMapImageBuffer } = require('../utils/mapImage');

// map images are chosen from static assets (see utils/mapImage)

const ISLANDS = [
  { id: 'fusha_village', name: 'Fusha Village', image: 'https://files.catbox.moe/3e2yh0.webp', defaultUnlocked: true },
  { id: 'alvidas_hideout', name: 'Alvidas Hideout', image: 'https://files.catbox.moe/oqujkr.webp' },
  { id: 'shells_town', name: "Shell's Town", image: 'https://files.catbox.moe/oqujkr.webp' },
  { id: 'orange_town', name: 'Orange Town', image: 'https://files.catbox.moe/cnu1po.webp' },
  { id: 'syrup_village', name: 'Syrup Village', image: 'https://files.catbox.moe/ppzl5v.webp' },
  { id: 'baratie', name: 'Baratie', image: 'https://files.catbox.moe/mx2i0t.webp' },
  { id: 'arlong_park', name: 'Arlong Park', image: 'https://files.catbox.moe/1zvxl6.webp' },
  { id: 'loguetown', name: 'Loguetown', image: 'https://files.catbox.moe/2uqofa.webp' }
];

const LOCK_ICON = 'https://files.catbox.moe/9zwl6i.webp';

function isIslandUnlocked(user, idx) {
  if (idx === 0) return true; // Fusha Village unlocked by default
  const prev = ISLANDS[idx - 1];
  if (!prev) return false;
  if (!user.storyProgress) return false;
  const prevProg = user.storyProgress[prev.id];
  if (!Array.isArray(prevProg)) return false;
  // unlock next island when boss (stage 3) of previous island completed
  return prevProg.includes(3);
}

async function renderMapImage(user) {
  // Return a map image buffer chosen by user progress
  return getMapImageBuffer(user);
}

module.exports = {
  name: 'sail',
  description: 'Begin the Story Mode sailing adventure',
  options: [],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (!Array.isArray(user.team) || user.team.length === 0) {
      const reply = 'Please set your team first.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (!user.activeShip) {
      const reply = 'Please set a ship first.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    user.ships = user.ships || {};
    const shipDef = getShipById(user.activeShip) || getCardById(user.activeShip) || null;
    const defaultCola = shipDef ? (shipDef.cola !== undefined ? shipDef.cola : (shipDef.maxCola !== undefined ? shipDef.maxCola : 0)) : 0;
    if (!user.ships[user.activeShip]) {
      user.ships[user.activeShip] = { cola: defaultCola, maxCola: (shipDef && shipDef.maxCola !== undefined) ? shipDef.maxCola : defaultCola };
      await user.save();
    }
    const shipState = user.ships[user.activeShip] || { cola: 0 };
    if ((shipState.cola || 0) <= 0) {
      const reply = 'Your ship is out of cola! Fuel it up using /fuel ship.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

      // Directly send the checkpoint map image with island select (no intro)
      const buffer = await renderMapImage(user);
      const attachment = new AttachmentBuilder(buffer, { name: 'eastblue.png' });

      // build select options for unlocked islands
      const options = [];
      ISLANDS.forEach((isl, idx) => {
        if (isIslandUnlocked(user, idx)) {
          options.push({ label: isl.name, value: isl.id });
        }
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`sail_select:${userId}`)
        .setPlaceholder('Choose an unlocked island')
        .addOptions(options);
      const row = new ActionRowBuilder().addComponents(menu);

      if (message) {
        return message.channel.send({ components: [row], files: [attachment] });
      }
      return interaction.reply({ components: [row], files: [attachment] });
  },

  // handle button interactions (sail_ready and sail_stage)
  async handleButton(interaction, action, cardId) {
    try {
      if (action === 'sail_ready') {
        const ownerId = cardId;
        if (interaction.user.id !== ownerId) return interaction.reply({ content: 'This is not your sail session.', ephemeral: true });
        const user = await User.findOne({ userId: interaction.user.id });
        if (!user) return interaction.reply({ content: 'No profile found.', ephemeral: true });

        await interaction.deferUpdate();
        const buffer = await renderMapImage(user);
        const attachment = new AttachmentBuilder(buffer, { name: 'eastblue.png' });

        // build select options for unlocked islands
        const options = [];
        ISLANDS.forEach((isl, idx) => {
          if (isIslandUnlocked(user, idx)) {
            options.push({ label: isl.name, value: isl.id });
          }
        });

        const menu = new StringSelectMenuBuilder()
          .setCustomId(`sail_select:${interaction.user.id}`)
          .setPlaceholder('Choose an unlocked island')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);
        // Edit reply to include the map image file and keep the dropdown (no embed)
        return interaction.editReply({ components: [row], files: [attachment] });
      }

      if (action === 'sail_stage') {
        // cardId will be of form 'island|stage|ownerId'
        const parts = (cardId || '').split('|');
        const islandId = parts[0];
        const stageNum = parseInt(parts[1], 10) || 0;
        const ownerId = parts[2];
        if (!islandId || !stageNum) return interaction.reply({ content: 'Invalid stage selection.', ephemeral: true });
        if (interaction.user.id !== ownerId) return interaction.reply({ content: 'This stage selection is not for you.', ephemeral: true });

        const user = await User.findOne({ userId: interaction.user.id });
        if (!user) return interaction.reply({ content: 'User not found.', ephemeral: true });

        if (!Array.isArray(user.team) || user.team.length === 0) return interaction.reply({ content: 'Please set your team first.', ephemeral: true });
        if (!user.activeShip) return interaction.reply({ content: 'Please set a ship first.', ephemeral: true });
        user.ships = user.ships || {};
        const shipDef2 = getShipById(user.activeShip) || getCardById(user.activeShip) || null;
        const defaultCola2 = shipDef2 ? (shipDef2.cola !== undefined ? shipDef2.cola : (shipDef2.maxCola !== undefined ? shipDef2.maxCola : 0)) : 0;
        if (!user.ships[user.activeShip]) {
          user.ships[user.activeShip] = { cola: defaultCola2, maxCola: (shipDef2 && shipDef2.maxCola !== undefined) ? shipDef2.maxCola : defaultCola2 };
        }
        const shipState2 = user.ships[user.activeShip];
        if (!shipState2 || (shipState2.cola || 0) <= 0) return interaction.reply({ content: 'Your ship is out of cola! Fuel it up using /fuel ship.', ephemeral: true });

        // consume 1 cola
        user.ships[user.activeShip].cola = Math.max(0, (user.ships[user.activeShip].cola || 0) - 1);
        await user.save();

        // build marines array for stage
        let marines = [];
        if (islandId === 'fusha_village') {
          if (stageNum === 1) {
            marines = [{ rank: 'Pistol Bandit', speed: 3, atk: 4, maxHP: 5, attribute: 'STR', emoji: '<:F0120:1494099609067323442>', image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/100/0120.png' }];
          } else if (stageNum === 2) {
            marines = [{ rank: 'Higuma', speed: 4, atk: 8, maxHP: 10, attribute: 'QCK', emoji: '<:0027:1494100987856556204>', image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0027.png' }];
          } else if (stageNum === 3) {
            marines = [{ rank: 'Master of the Near Sea', speed: 5, atk: 10, maxHP: 15, attribute: 'STR', emoji: '<:0028:1494101589550563338>', image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0028.png' }];
          }
        }

        // Start battle via isail engine in story mode
        try {
          await isail.startBattleWithMarines({ interaction, user, discordUser: interaction.user, marines, storyMode: true, storyKey: islandId, storyStage: stageNum });
          return;
        } catch (e) {
          console.error('Failed to start stage battle', e);
          return interaction.reply({ content: 'Failed to start battle.', ephemeral: true });
        }
      }

      return interaction.reply({ content: 'Unknown sail action.', ephemeral: true });
    } catch (err) {
      console.error('sail.handleButton error', err);
      try {
        if (!interaction.replied) interaction.reply({ content: 'Error handling sail action.', ephemeral: true });
      } catch (e) {}
    }
  },

  // handle select menu for island selection
  async handleSelect(interaction) {
    const [action, ownerId] = interaction.customId.split(':');
    if (action !== 'sail_select') return interaction.reply({ content: 'Unknown select.', ephemeral: true });
    if (interaction.user.id !== ownerId) return interaction.reply({ content: 'This selection is not for you.', ephemeral: true });

    const islandId = interaction.values && interaction.values[0];
    if (!islandId) return interaction.reply({ content: 'No island selected.', ephemeral: true });

    const island = ISLANDS.find(i => i.id === islandId);
    if (!island) return interaction.reply({ content: 'Island not found.', ephemeral: true });

    // auto-start the stage the user is currently on (no manual stage choice)
    await interaction.deferUpdate();
    const user = await User.findOne({ userId: interaction.user.id });
    if (!user) return interaction.followUp({ content: 'User not found.', ephemeral: true });

    // consume 1 cola for starting the stage (same rules as sail_stage)
    user.ships = user.ships || {};
    const shipDef2 = getShipById(user.activeShip) || getCardById(user.activeShip) || null;
    const defaultCola2 = shipDef2 ? (shipDef2.cola !== undefined ? shipDef2.cola : (shipDef2.maxCola !== undefined ? shipDef2.maxCola : 0)) : 0;
    if (!user.ships[user.activeShip]) {
      user.ships[user.activeShip] = { cola: defaultCola2, maxCola: (shipDef2 && shipDef2.maxCola !== undefined) ? shipDef2.maxCola : defaultCola2 };
    }
    const shipState2 = user.ships[user.activeShip];
    if (!shipState2 || (shipState2.cola || 0) <= 0) return interaction.followUp({ content: 'Your ship is out of cola! Fuel it up using /fuel ship.', ephemeral: true });

    // consume 1 cola
    user.ships[user.activeShip].cola = Math.max(0, (user.ships[user.activeShip].cola || 0) - 1);
    await user.save();
    const islandProg = (user.storyProgress && Array.isArray(user.storyProgress[island.id])) ? user.storyProgress[island.id] : [];
    let stageToStart = 1;
    for (let s = 1; s <= 3; s++) {
      if (!islandProg.includes(s)) { stageToStart = s; break; }
    }
    if (!stageToStart) stageToStart = 3;

    // build marines for the chosen island/stage (currently supports Fusha Village)
    let marines = [];
    if (island.id === 'fusha_village') {
      if (stageToStart === 1) {
        marines = [{ rank: 'Pistol Bandit', speed: 3, atk: 4, maxHP: 5, attribute: 'STR', emoji: '<:F0120:1494099609067323442>', image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/100/0120.png' }];
      } else if (stageToStart === 2) {
        marines = [{ rank: 'Higuma', speed: 4, atk: 8, maxHP: 10, attribute: 'QCK', emoji: '<:0027:1494100987856556204>', image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0027.png' }];
      } else if (stageToStart === 3) {
        marines = [{ rank: 'Master of the Near Sea', speed: 5, atk: 10, maxHP: 15, attribute: 'STR', emoji: '<:0028:1494101589550563338>', image: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0028.png' }];
      }
    }

    try {
      await isail.startBattleWithMarines({ interaction, user, discordUser: interaction.user, marines, storyMode: true, storyKey: island.id, storyStage: stageToStart });
      return;
    } catch (e) {
      console.error('Failed to start stage battle', e);
      return interaction.followUp({ content: 'Failed to start battle.', ephemeral: true });
    }
  }
};
