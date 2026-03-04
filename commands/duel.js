const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { cards: cardDefs } = require('../data/cards');
const { resolveStats } = require('../utils/statResolver');

const statusManager = require('../src/battle/statusManager');
const STATUS_EMOJIS = statusManager.STATUS_EMOJIS;
const {
  addStatus,
  hasStatusLock,
  getStatusLockReason,
  applyStartOfTurnEffects: applyStatusesForTurn,
  applyCardEffect: applyCardEffectShared,
  calculateUserDamage: calculateUserDamageShared,
  applyBleedOnEnergyUse
} = statusManager;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const calculateUserDamage = calculateUserDamageShared;

const TYPE_EMOJIS = {
  Combat: '<:combat:1478019288668438528>',
  Tank: '<:tank:1478019541580648539>',
  Special: '<:special:1478020172496506932>'
};

const duelStates = new Map();

// global cut damage helper
function applyGlobalCut(state) {
  const logs = [];
  logs.push(...applyStatusesForTurn(state.player1Cards));
  logs.push(...applyStatusesForTurn(state.player2Cards));
  logs.forEach(l => appendLog(state, l));
}

// refresh the duel embed by deleting old message and sending a new one
async function refreshDuelMessage(oldMsg, state, user1, user2) {
  try { await oldMsg.delete(); } catch {}
  const embed = buildEmbed(state, user1, user2);
  const row = makeSelectionRow(state, state.turn === 'player1');
  const components = [row];
  if (state.awaitingTarget) {
    const targetRow = makeTargetRow(state);
    if (targetRow) components.push(targetRow);
  }
  if (state.finished) {
    components.forEach(r => r.components.forEach(b => b.setDisabled(true)));
  }
  const newMsg = await oldMsg.channel.send({ embeds: [embed], components });
  duelStates.delete(oldMsg.id);
  duelStates.set(newMsg.id, state);
  return newMsg;
}


function hpBar(current, max) {
  if (max <= 0) return '';
  const segments = 10;
  const filled = Math.round((current / max) * segments);
  const empty = segments - filled;
  return '▬'.repeat(filled) + '▭'.repeat(empty);
}

function energyDisplay(energy) {
  if (energy <= 0) return '0';
  return '<:energy:1478051414558118052>'.repeat(energy);
}

function buildEmbed(state, user1, user2) {
  const p1HeaderEmojis = Array.from(new Set(state.player1Cards.flatMap(c => (c.status || []).map(st => STATUS_EMOJIS[st.type] || '')))).join('');
  const p2HeaderEmojis = Array.from(new Set(state.player2Cards.flatMap(c => (c.status || []).map(st => STATUS_EMOJIS[st.type] || '')))).join('');

  const embed = new EmbedBuilder()
    .setColor('#EEEEEE')
    .setTitle('Duel: Interactive Battle')
    .setDescription(`${user1.username} ${p1HeaderEmojis} vs ${user2.username} ${p2HeaderEmojis}`);
  // attach any queued gif image
  if (state.embedImage) {
    embed.setImage(state.embedImage);
  }

  // Player 1 team - filter out KO, use stacked layout
  const p1Alive = state.player1Cards.filter(c => c.currentHP > 0);
  const p1Lines = p1Alive.map((c, i) => {
    const statusEmojis = (c.status || []).map(st => STATUS_EMOJIS[st.type] || '').join('');
    const prefix = statusEmojis || (TYPE_EMOJIS[c.def.type] || '');
    let line = `${i + 1}. ${prefix} **${c.def.character}** ${energyDisplay(c.energy)}\n${hpBar(c.currentHP, c.maxHP)} ${c.currentHP}/${c.maxHP}`;
    if (state.selected !== null && state.player1Cards.indexOf(c) === state.selected && state.turn === 'player1') line = `**> ${line}**`;
    return line;
  });
  const p1FieldValue = p1Lines.length > 0 ? p1Lines.join('\n') : 'All cards defeated!';
  embed.addFields({ name: `${user1.username} ${p1HeaderEmojis}`, value: p1FieldValue });

  // Player 2 team - filter out KO, use stacked layout
  const p2Alive = state.player2Cards.filter(c => c.currentHP > 0);
  const p2Lines = p2Alive.map((c, i) => {
    const statusEmojis = (c.status || []).map(st => STATUS_EMOJIS[st.type] || '').join('');
    const prefix = statusEmojis || (TYPE_EMOJIS[c.def.type] || '');
    let line = `${i + 1}. ${prefix} **${c.def.character}** ${energyDisplay(c.energy)}\n${hpBar(c.currentHP, c.maxHP)} ${c.currentHP}/${c.maxHP}`;
    if (state.selected !== null && state.player2Cards.indexOf(c) === state.selected && state.turn === 'player2') line = `**> ${line}**`;
    return line;
  });
  const p2FieldValue = p2Lines.length > 0 ? p2Lines.join('\n') : 'All cards defeated!';
  embed.addFields({ name: `${user2.username} ${p2HeaderEmojis}`, value: p2FieldValue });

  // action columns
  if (state.lastP1Action || state.lastP2Action) {
    embed.addFields(
      { name: `${user1.username}'s Action`, value: state.lastP1Action || '—', inline: true },
      { name: `${user2.username}'s Action`, value: state.lastP2Action || '—', inline: true }
    );
  }

  // log
  if (state.log) {
    embed.addFields({ name: 'Battle Log', value: state.log });
  }

  return embed;
}

function makeSelectionRow(state, isPlayer1Turn) {
  const row = new ActionRowBuilder();
  const cards = isPlayer1Turn ? state.player1Cards : state.player2Cards;
  cards.forEach((c, i) => {
    const locked = c.status && c.status.some(st => st.type === 'stun' || st.type === 'freeze');
    const disabled = !c.alive || (isPlayer1Turn ? state.turn !== 'player1' : state.turn !== 'player2') || c.energy === 0 || !!state.awaitingTarget || locked;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`duel_select:${i}`)
        .setLabel(c.def.character)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
  });
  return row;
}

function makeActionRow(state, isPlayer1Turn) {
  if (state.selected === null || state.awaitingTarget) return null;
  const card = isPlayer1Turn ? state.player1Cards[state.selected] : state.player2Cards[state.selected];
  if (!card) return null;
  
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('duel_action:attack')
      .setLabel('Attack')
      .setStyle(ButtonStyle.Primary)
  );
  if (card.def.special_attack && card.energy >= 3) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('duel_action:special')
        .setLabel('Special Attack')
        .setStyle(ButtonStyle.Primary)
    );
  }
  if (card.def.type === 'Special') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('duel_action:ability')
        .setLabel('Special Ability')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('duel_action:forfeit')
      .setLabel('Forfeit')
      .setStyle(ButtonStyle.Danger)
  );
  return row;
}

function makeTargetRow(state, isPlayer1Turn) {
  if (!state.awaitingTarget) return null;
  const row = new ActionRowBuilder();
  const targetTeam = isPlayer1Turn ? state.player2Cards : state.player1Cards;
  targetTeam.forEach((c, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`duel_target:${i}`)
        .setLabel(`${c.def.character}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(c.currentHP <= 0)
    );
  });
  return row;
}

async function updateDuelMessage(msg, state, user1, user2) {
  const embed = buildEmbed(state, user1, user2);
  const components = [];
  
  const isPlayer1Turn = state.turn === 'player1';
  const s1Row = makeSelectionRow(state, isPlayer1Turn);
  if (s1Row) components.push(s1Row);
  
  if (state.awaitingTarget) {
    const tRow = makeTargetRow(state, isPlayer1Turn);
    if (tRow) components.push(tRow);
  } else {
    const aRow = makeActionRow(state, isPlayer1Turn);
    if (aRow) components.push(aRow);
  }

  if (state.finished) {
    components.forEach(r => r.components.forEach(b => b.setDisabled(true)));
  }

  await msg.edit({ embeds: [embed], components });

  if (state.finished) {
    clearDuelTimeout(state);
  } else {
    setupTimeout(state, msg, user1, user2);
  }
}

function rechargeEnergy(state) {
  state.player1Cards.forEach(c => {
    const locked = c.status && c.status.some(st => st.type === 'stun' || st.type === 'freeze');
    if (!c.usedLastTurn && c.alive && c.energy < 3 && !locked) {
      c.energy++;
    }
    c.usedLastTurn = false;
  });
  state.player2Cards.forEach(c => {
    const locked = c.status && c.status.some(st => st.type === 'stun' || st.type === 'freeze');
    if (!c.usedLastTurn && c.alive && c.energy < 3 && !locked) {
      c.energy++;
    }
    c.usedLastTurn = false;
  });
}

function checkTeamDefeated(team) {
  return team.every(c => !c.alive);
}

function clearDuelTimeout(state) {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
}

function setupTimeout(state, msg, user1, user2) {
  clearDuelTimeout(state);
  if (!state.finished) {
    state.timeout = setTimeout(async () => {
      if (state.finished) return;
      appendLog(state, `${state.turn === 'player1' ? user1.username : user2.username} took too long. Turn passed.`);
      await finalizeAction(state, msg, user1, user2, true);
    }, 30000);
  }
}

function appendLog(state, txt) {
  if (state.log) state.log += '\n' + txt;
  else state.log = txt;
}

async function finalizeAction(state, msg, user1, user2, timedOut = false) {
  // Check if player's team is defeated
  const currentTeam = state.turn === 'player1' ? state.player1Cards : state.player2Cards;
  const opponentTeam = state.turn === 'player1' ? state.player2Cards : state.player1Cards;

  if (checkTeamDefeated(currentTeam)) {
    state.finished = true;
    const winner = state.turn === 'player1' ? user2 : user1;
    appendLog(state, `${winner.username} wins the duel!`);
    // send a fresh victory embed
    msg = await refreshDuelMessage(msg, state, user1, user2);
  } else {
    // Recharge and switch turn
    rechargeEnergy(state);
    state.turn = state.turn === 'player1' ? 'player2' : 'player1';
    applyGlobalCut(state); // global cut on every turn switch
    state.selected = null;
    state.lastP1Action = state.lastP1Action || '';
    state.lastP2Action = state.lastP2Action || '';
    state.log = ''; // Clear log at start of new turn

    // Apply start-of-turn effects (still keep per-team for backward compatibility)
    const teamAboutToAct = state.turn === 'player1' ? state.player1Cards : state.player2Cards;
    const startLogs = applyStatusesForTurn(teamAboutToAct);
    startLogs.forEach(l => appendLog(state, l));

    // refresh message instead of editing
    msg = await refreshDuelMessage(msg, state, user1, user2);

    if (checkTeamDefeated(state.turn === 'player1' ? state.player1Cards : state.player2Cards)) {
      state.finished = true;
      const winner = state.turn === 'player1' ? user2 : user1;
      appendLog(state, `${winner.username} wins the duel!`);
      // send fresh victory embed
      msg = await refreshDuelMessage(msg, state, user1, user2);
      duelStates.delete(msg.id);
    }
  }
}

module.exports = {
  name: 'duel',
  description: 'Duel another player',
  options: [
    { name: 'opponent', type: 6, description: 'The player to duel', required: true }
  ],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    let user1 = await User.findOne({ userId });
    if (!user1) {
      const reply = 'You need an account first – run `op start` or /start.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Get opponent
    let opponentId;
    if (message) {
      const mentionMatch = message.mentions.users.first();
      if (mentionMatch) {
        opponentId = mentionMatch.id;
      } else {
        opponentId = args[0]?.match(/(\d+)/)?.[1];
      }
    } else {
      opponentId = interaction.options.getUser('opponent').id;
    }

    if (!opponentId) {
      const reply = 'Please specify an opponent.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    let user2 = await User.findOne({ userId: opponentId });
    if (!user2) {
      const reply = 'That user doesn\'t have an account.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (opponentId === userId) {
      const reply = 'You cannot duel yourself.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check both have full teams
    if (!Array.isArray(user1.team) || user1.team.length < 3) {
      const reply = 'Your team is not full (3 cards required).';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (!Array.isArray(user2.team) || user2.team.length < 3) {
      const reply = `${user2.username} doesn't have a full team.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Get user objects for discord
    const discordUser1 = message ? message.author : interaction.user;
    const discordUser2 = await (message ? message.client.users.fetch(opponentId) : interaction.client.users.fetch(opponentId));

    // Resolve teams with stats
    const resolveTeam = (user, teamIds) => {
      return teamIds.slice(0, 3).map(id => {
        const def = cardDefs.find(c => c.id === id);
        if (!def) return null;
        const entry = (user.ownedCards || []).find(e => e.cardId === id) || { cardId: id, level: 1, xp: 0 };
        const scaled = resolveStats(entry, user.ownedCards || []);
        return {
          def,
          userEntry: entry,
          scaled: scaled || {
            health: def.health,
            power: def.power,
            speed: def.speed,
            attack_min: def.attack_min,
            attack_max: def.attack_max,
            special_attack: def.special_attack ? { min: def.special_attack.min_atk || def.special_attack.min, max: def.special_attack.max_atk || def.special_attack.max } : undefined
          },
          currentHP: (scaled && scaled.health) || def.health,
          maxHP: (scaled && scaled.health) || def.health,
          energy: 3,
          alive: true,
          usedLastTurn: false,
          status: []
        };
      }).filter(Boolean);
    };

    const p1Team = resolveTeam(user1, user1.team);
    const p2Team = resolveTeam(user2, user2.team);

    if (p1Team.length < 3 || p2Team.length < 3) {
      const reply = 'One or more cards could not be found.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Determine who goes first
    const p1Speed = Math.max(...p1Team.map(c => c.def.speed || 0));
    const p2Speed = Math.max(...p2Team.map(c => c.def.speed || 0));

    const state = {
      player1Id: userId,
      player2Id: opponentId,
      player1Cards: p1Team,
      player2Cards: p2Team,
      turn: p1Speed >= p2Speed ? 'player1' : 'player2',
      selected: null,
      awaitingTarget: null,
      finished: false,
      log: '',
      lastP1Action: '',
      lastP2Action: '',
      timeout: null,
      embedImage: null
    };
    // early cut/duration effects at game start
    applyGlobalCut(state);

    // Send initial message
    const embed = buildEmbed(state, discordUser1, discordUser2);
    const row = makeSelectionRow(state, state.turn === 'player1');
    let msg;
    if (message) {
      msg = await message.channel.send({ embeds: [embed], components: [row] });
    } else {
      msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    }
    duelStates.set(msg.id, state);
    await setupTimeout(state, msg, discordUser1, discordUser2);
  },

  async handleButton(interaction, rawAction, cardId) {
    const msgId = interaction.message.id;
    const state = duelStates.get(msgId);

    if (!state) {
      return interaction.reply({ content: 'This duel session has expired.', ephemeral: true });
    }

    const isPlayer1 = interaction.user.id === state.player1Id;
    const isPlayer2 = interaction.user.id === state.player2Id;

    if (!isPlayer1 && !isPlayer2) {
      return interaction.reply({ content: 'You are not part of this duel.', ephemeral: true });
    }

    const expectedTurn = isPlayer1 ? 'player1' : 'player2';
    if (state.turn !== expectedTurn) {
      return interaction.reply({ content: 'It is not your turn.', ephemeral: true });
    }

    const myTeam = isPlayer1 ? state.player1Cards : state.player2Cards;
    const opponentTeam = isPlayer1 ? state.player2Cards : state.player1Cards;
    const myId = isPlayer1 ? state.player1Id : state.player2Id;
    const opponentId = isPlayer1 ? state.player2Id : state.player1Id;
    let myUser = await User.findOne({ userId: myId });
    let opponentUser = await User.findOne({ userId: opponentId });
    const discordUser1 = await interaction.client.users.fetch(state.player1Id);
    const discordUser2 = await interaction.client.users.fetch(state.player2Id);

    // Handle target selection
    if (rawAction.startsWith('duel_target')) {
      const targetIdx = parseInt(cardId, 10);
      if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= opponentTeam.length) {
        return interaction.reply({ content: 'Invalid target.', ephemeral: true });
      }
      const action = state.awaitingTarget;
      state.awaitingTarget = null;
      const card = myTeam[state.selected];

      // Check if card is locked by status effect
      if (hasStatusLock(card)) {
        const reason = getStatusLockReason(card);
        appendLog(state, `${card.def.character} is ${reason} and cannot act!`);
        state.lastP1Action = state.lastP1Action || '';
        state.lastP2Action = state.lastP2Action || '';
        state.selected = null;
        await finalizeAction(state, interaction.message, discordUser1, discordUser2);
        return interaction.deferUpdate();
      }

      if (action === 'attack') {
        if (card.energy < 1) {
          return interaction.reply({ content: 'Not enough energy.', ephemeral: true });
        }
        card.energy -= 1;
        card.usedLastTurn = true;
        // Apply bleed damage if card has bleed status (1 energy spent)
        const bleedLogsD1 = applyBleedOnEnergyUse(card, 1);
        bleedLogsD1.forEach(l => appendLog(state, l));
        const dmg = calculateUserDamage(card, 'attack', myUser);
        const target = opponentTeam[targetIdx];
        target.currentHP -= dmg;
        if (target.currentHP <= 0) target.currentHP = 0;
        const effectLogsD1 = applyCardEffectShared(card, target);
        effectLogsD1.forEach(l => appendLog(state, l));
        const actionText = `${card.def.character} used Attack on ${target.def.character} for ${dmg} damage! <:energy:1478051414558118052> -1`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      } else if (action === 'special') {
        if (card.energy < 3) {
          return interaction.reply({ content: 'Not enough energy.', ephemeral: true });
        }
        card.energy -= 3;
        card.usedLastTurn = true;
        // Apply bleed damage if card has bleed status (3 energy spent)
        const bleedLogsD2 = applyBleedOnEnergyUse(card, 3);
        bleedLogsD2.forEach(l => appendLog(state, l));
        const dmg = calculateUserDamage(card, 'special', myUser);
        const target = opponentTeam[targetIdx];
        target.currentHP -= dmg;
        if (target.currentHP <= 0) target.currentHP = 0;
        const effectLogsD2 = applyCardEffectShared(card, target);
        effectLogsD2.forEach(l => appendLog(state, l));
        // queue gif for embed
        state.embedImage = card.def.special_attack ? card.def.special_attack.gif : null;
        // queue gif for embed
        state.embedImage = card.def.special_attack ? card.def.special_attack.gif : null;
        const actionText = `${card.def.character} used ${card.def.special_attack?.name || 'Special Attack'} for ${dmg} damage! <:energy:1478051414558118052> -3`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      } else if (action === 'ability') {
        card.energy -= 1;
        card.usedLastTurn = true;
        // Apply bleed damage if card has bleed status (1 energy spent)
        const bleedLogsD3 = applyBleedOnEnergyUse(card, 1);
        bleedLogsD3.forEach(l => appendLog(state, l));
        const dmg = calculateUserDamage(card, 'ability', myUser);
        const target = opponentTeam[targetIdx];
        target.currentHP -= dmg;
        if (target.currentHP <= 0) target.currentHP = 0;
        const effectLogsD3 = applyCardEffectShared(card, target);
        effectLogsD3.forEach(l => appendLog(state, l));
        const actionText = `${card.def.character} used Special Ability on ${target.def.character} for ${dmg} damage! <:energy:1478051414558118052> -1`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      }

      state.selected = null;
      await finalizeAction(state, interaction.message, discordUser1, discordUser2);
      return interaction.deferUpdate();
    }

    // Handle selection
    if (rawAction.startsWith('duel_select')) {
      const idx = parseInt(cardId, 10);
      if (isNaN(idx) || idx < 0 || idx >= myTeam.length) {
        return interaction.reply({ content: 'Invalid selection.', ephemeral: true });
      }

      if (state.finished) {
        return interaction.reply({ content: 'This duel has finished.', ephemeral: true });
      }

      const card = myTeam[idx];
      if (!card.alive) {
        return interaction.reply({ content: 'That card is knocked out.', ephemeral: true });
      }

      // Check for stun/freeze
      if (card.status && card.status.length) {
        const st = card.status[0];
        if (st.type === 'stun' || st.type === 'freeze') {
          appendLog(state, `${card.def.character} is ${st.type === 'stun' ? 'stunned' : 'frozen'} and skips a turn!`);
          st.remaining -= 1;
          if (st.remaining <= 0) {
            card.status.shift();
          }
          state.selected = null;
          await finalizeAction(state, interaction.message, discordUser1, discordUser2);
          return interaction.deferUpdate();
        }
      }

      state.selected = idx;
      await updateDuelMessage(interaction.message, state, discordUser1, discordUser2);
      return interaction.deferUpdate();
    }

    // Handle action
    if (rawAction.startsWith('duel_action')) {
      const act = cardId;

      if (state.finished) {
        return interaction.reply({ content: 'The duel has already ended.', ephemeral: true });
      }

      const card = myTeam[state.selected];
      if (!card || !card.alive) {
        state.selected = null;
        await updateDuelMessage(interaction.message, state, discordUser1, discordUser2);
        return interaction.reply({ content: 'Selected card is unavailable.', ephemeral: true });
      }

      if (act === 'attack' || act === 'special' || act === 'ability') {
        // block stunned/frozen cards from initiating an action
        if (hasStatusLock(card)) {
          return interaction.reply({ content: `${card.def.character} is ${getStatusLockReason(card)} and cannot act!`, ephemeral: true });
        }
        const aliveOpponents = opponentTeam.filter(c => c.currentHP > 0);
        if (aliveOpponents.length > 1 && !state.awaitingTarget) {
          state.awaitingTarget = act;
          await updateDuelMessage(interaction.message, state, discordUser1, discordUser2);
          return interaction.deferUpdate();
        }

        let targetIdx = 0;
        if (aliveOpponents.length === 1) {
          targetIdx = opponentTeam.findIndex(c => c.currentHP > 0);
        }

        // Energy checks
        if (act === 'attack') {
          if (card.energy < 1) return interaction.reply({ content: 'Not enough energy for attack.', ephemeral: true });
          card.energy -= 1;
        } else if (act === 'special') {
          if (card.energy < 3) return interaction.reply({ content: 'Special attack requires 3 energy.', ephemeral: true });
          card.energy -= 3;
        } else if (act === 'ability') {
          if (card.def.type !== 'Special') return interaction.reply({ content: 'That card has no special ability.', ephemeral: true });
          if (card.energy < 1) return interaction.reply({ content: 'Not enough energy for ability.', ephemeral: true });
          card.energy -= 1;
        }

        // Bleed effect
        if (card.status && card.status.length) {
          const bleed = card.status.find(s => s.type === 'bleed');
          if (bleed) {
            card.currentHP = Math.max(0, card.currentHP - 2);
            appendLog(state, `${card.def.character} bleeds for -2 HP!`);
            bleed.remaining -= 1;
            if (bleed.remaining <= 0) {
              card.status = card.status.filter(s => s !== bleed);
            }
          }
        }

        card.usedLastTurn = true;
        const dmg = calculateUserDamage(card, act === 'ability' ? 'attack' : act, myUser);
        const target = opponentTeam[targetIdx];
        target.currentHP -= dmg;
        if (target.currentHP <= 0) target.currentHP = 0;
        const effectLogs = applyCardEffectShared(card, target);
        effectLogs.forEach(l => appendLog(state, l));

        const cost = act === 'attack' ? 1 : act === 'special' ? 3 : 1;
        let actionText;
        if (act === 'special') {
          actionText = `${card.def.character} used ${card.def.special_attack?.name || 'Special Attack'} for ${dmg} damage! <:energy:1478051414558118052> -${cost}`;
        } else {
          const label = act === 'attack' ? 'Attack' : 'Special Ability';
          actionText = `${card.def.character} used ${label} on ${target.def.character} for ${dmg} damage! <:energy:1478051414558118052> -${cost}`;
        }
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      } else if (act === 'forfeit') {
        const winner = isPlayer1 ? discordUser2 : discordUser1;
        appendLog(state, `${interaction.user.username} forfeited. ${winner.username} wins!`);
        state.finished = true;
        await updateDuelMessage(interaction.message, state, discordUser1, discordUser2);
        duelStates.delete(msgId);
        return interaction.deferUpdate();
      }

      await finalizeAction(state, interaction.message, discordUser1, discordUser2);
      return interaction.deferUpdate();
    }

    return interaction.reply({ content: 'Unsupported interaction.', ephemeral: true });
  }
};
