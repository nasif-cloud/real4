const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// wrapper for deferring interactions safely (avoids 10062 Unknown interaction)
async function safeDefer(interaction) {
  if (interaction.deferred || interaction.replied) return;

  try {
    await interaction.deferUpdate();
  } catch (e) {
    if (e.code !== 10062) {
      console.error('Failed to defer interaction:', e);
    }
  }
}
const User = require('../models/User');
const { cards: cardDefs } = require('../data/cards');
const { resolveStats } = require('../utils/statResolver');
const { getEffectDescription } = require('../utils/cards');
const { getDamageMultiplier, getAttributeDescription } = require('../utils/attributeSystem');

const statusManager = require('../src/battle/statusManager');
const STATUS_EMOJIS = statusManager.STATUS_EMOJIS;
const {
  addStatus,
  hasStatusLock,
  getStatusLockReason,
  applyStartOfTurnEffects: applyStatusesForTurn,
  applyCardEffect: applyCardEffectShared,
  calculateUserDamage: calculateUserDamageShared,
  getAttackModifier,
  getDefenseMultiplier,
  getConfusionChance,
  hasTruesight,
  consumeTruesight,
  handleKO
} = statusManager;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const calculateUserDamage = calculateUserDamageShared;

// Map to track pending duel requests (messageId => pendingState)
const pendingDuelRequests = new Map();
const duelStates = new Map();

// global cut damage helper
function applyGlobalCut(state) {
  const logs = [];
  logs.push(...applyStatusesForTurn(state.player1Cards));
  logs.push(...applyStatusesForTurn(state.player2Cards));
  logs.forEach(l => appendLog(state, l));
}

// refresh the duel embed by deleting old message and sending a new one
async function refreshDuelMessage(oldMsg, state) {
  try { await oldMsg.delete(); } catch {}
  const embed = buildEmbed(state);
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
  if (max <= 0 || current <= 0) {
    return '<:Healthemptyleft:1481750325151928391>'
      + '<:Healthemptymiddle:1481750341489004596>'.repeat(6)
      + '<:healthemptyright:1481750363286667334>';
  }
  
  // Calculate percentage of health remaining
  const healthPercent = Math.max(0, Math.min(1, current / max));
  // 6 middle sections, so we have 0-6 filled sections
  const filledSections = Math.floor(healthPercent * 6);
  
  // Build the bar: right-to-left filling
  const leftIcon = '<:Healthfullleft:1481750264074469437>';
  const rightIcon = filledSections === 6 ? '<:healthfullright:1481750302679105710>' : '<:healthemptyright:1481750363286667334>';
  
  let bar = leftIcon;
  
  // Add filled middle sections first (on left side for left-to-right filling)
  for (let i = 0; i < filledSections; i++) {
    bar += '<:healthfullmiddle:1481750286795149435>';
  }
  
  // Add empty middle sections after (on right side)
  for (let i = filledSections; i < 6; i++) {
    bar += '<:Healthemptymiddle:1481750341489004596>';
  }
  
  bar += rightIcon;
  return bar;
}

function getEffectString(card, target) {
  if (!card.def.effect) return '';
  if (card.def.effect === 'team_stun') {
    const duration = card.def.effectDuration || 1;
    if (duration === -1) {
      return ` (${STATUS_EMOJIS.stun} stuns the whole team permanently)`;
    }
    return ` (${STATUS_EMOJIS.stun} stuns the whole team for **${duration}** turn(s))`;
  } else {
    const effectVerbs = {
      'stun': 'stuns',
      'freeze': 'freezes',
      'cut': 'cuts',
      'bleed': 'bleeds',
      'regen': 'regenerates',
      'confusion': 'confuses',
      'attackup': 'boosts attack on',
      'attackdown': 'reduces attack on',
      'defenseup': 'boosts defense on',
      'defensedown': 'reduces defense on',
      'truesight': 'grants truesight to',
      'undead': 'grants undead to'
    };
    const verb = effectVerbs[card.def.effect] || 'affects';
    const duration = card.def.effectDuration || 1;
    const targetName = card.def.itself ? card.def.character : (target ? target.def.character : 'target');
    const icon = STATUS_EMOJIS[card.def.effect] || '';
    const defaultAmount = 12; // Updated default
    const effectAmount = card.def.effectAmount ?? (card.def.effect === 'regen' ? 10 : defaultAmount);
    const effectChance = card.def.effectChance ?? 50; // Updated default
    let details = '';
    if (card.def.effect === 'regen') details = ` (${effectAmount}%)`;
    if (card.def.effect === 'confusion') details = ` (${effectChance}%)`;
    if (['attackup', 'attackdown', 'defenseup', 'defensedown'].includes(card.def.effect)) details = ` (${effectAmount}%)`;
    
    if (duration === -1) {
      // Permanent effects
      const permanentVerbs = {
        'stun': 'permanently stuns',
        'freeze': 'permanently freezes',
        'cut': 'permanently cuts',
        'bleed': 'permanently bleeds',
        'regen': 'permanently regenerates',
        'confusion': 'permanently confuses',
        'attackup': 'Permanently boosts attack by',
        'attackdown': 'Permanently reduces attack by',
        'defenseup': 'Permanently boosts defense by',
        'defensedown': 'Permanently reduces defense by',
        'truesight': 'permanently grants truesight to',
        'undead': 'permanently grants undead to'
      };
      const permVerb = permanentVerbs[card.def.effect] || 'permanently affects';
      if (['attackup', 'attackdown', 'defenseup', 'defensedown'].includes(card.def.effect)) {
        return ` (${icon} ${permVerb} ${effectAmount}%)`;
      } else if (card.def.effect === 'confusion') {
        return ` (${icon} ${permVerb} ${targetName} (${effectChance}% miss chance))`;
      } else if (card.def.effect === 'regen') {
        return ` (${icon} ${permVerb} ${targetName} (${effectAmount}%))`;
      } else {
        return ` (${icon} ${permVerb} ${targetName})`;
      }
    } else {
      return ` (${icon} ${verb} ${targetName}${details} for **${duration}** turn(s))`;
    }
  }
}

function addEmbedFieldLines(embed, baseName, lines, inline = false) {
  const maxLen = 1024;
  let content = lines.join('\n');
  if (content.length > maxLen) {
    content = content.slice(0, maxLen - 1) + '…';
  }
  embed.addFields({ name: baseName, value: content, inline });
}

function energyDisplay(energy) {
  if (energy <= 0) return '0';
  return '<:energy:1478051414558118052>'.repeat(energy);
}

function buildEmbed(state) {
  // Embed color based on turn: blue for player 1, red for player 2
  const embedColor = state.turn === 'player1' ? '#0000FF' : '#FF0000';
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('Duel: Interactive Battle')
    .setDescription(`${state.discordUser1.username} vs ${state.discordUser2.username}`);
  // attach any queued gif image
  if (state.embedImage) {
    embed.setImage(state.embedImage);
  }
  const { applyDefaultEmbedStyle } = require('../utils/embedStyle');
  applyDefaultEmbedStyle(embed, state.discordUser1);

  // Bounty indication
  if (state.isBountyDuel) {
    const hunter = state.bountyHunter === state.player1Id ? state.discordUser1.username : state.discordUser2.username;
    const target = state.bountyHunter === state.player1Id ? state.discordUser2.username : state.discordUser1.username;
    embed.addFields({ name: 'Bounty Duel', value: `${hunter} is hunting ${target}!`, inline: false });
  }

  // Player 1 team - filter out KO, add each as separate inline field
  const p1Alive = state.player1Cards.filter(c => c.currentHP > 0);
  if (p1Alive.length > 0) {
    for (const c of p1Alive) {
      const statusEmojis = (c.status || []).map(st => STATUS_EMOJIS[st.type] || '').join('');
      const prefix = statusEmojis || (c.def.emoji || '');
      const idx = state.player1Cards.indexOf(c);
      const isSelected = state.selected !== null && idx === state.selected && state.turn === 'player1';
      const level = c.userEntry ? c.userEntry.level : 1;
      const upgradeMatch = (c.def.id.match(/-u(\d+)$/) || [])[1] || '1';
      let value = `${prefix} ${hpBar(c.currentHP, c.maxHP)}`;
      value += `\n${c.def.character} | Lv. ${level} U${upgradeMatch}`;
      value += `\n${c.currentHP}/${c.maxHP} ${energyDisplay(c.energy)}`;
      if (isSelected) value = `**> ${value}**`;
      embed.addFields({ name: c.def.character, value, inline: true });
    }
  } else {
    embed.addFields({ name: `${state.discordUser1.username}`, value: 'All cards defeated!', inline: false });
  }

  // Separator between teams
  embed.addFields({ name: '\u200B', value: '\u200B' });

  // Player 2 team - filter out KO, add each as separate inline field
  const p2Alive = state.player2Cards.filter(c => c.currentHP > 0);
  if (p2Alive.length > 0) {
    for (const c of p2Alive) {
      const statusEmojis = (c.status || []).map(st => STATUS_EMOJIS[st.type] || '').join('');
      const prefix = statusEmojis || (c.def.emoji || '');
      const idx = state.player2Cards.indexOf(c);
      const isSelected = state.selected !== null && idx === state.selected && state.turn === 'player2';
      const level = c.userEntry ? c.userEntry.level : 1;
      const upgradeMatch = (c.def.id.match(/-u(\d+)$/) || [])[1] || '1';
      let value = `${prefix} ${hpBar(c.currentHP, c.maxHP)}`;
      value += `\n${c.def.character} | Lv. ${level} U${upgradeMatch}`;
      value += `\n${c.currentHP}/${c.maxHP} ${energyDisplay(c.energy)}`;
      if (isSelected) value = `**> ${value}**`;
      embed.addFields({ name: c.def.character, value, inline: true });
    }
  } else {
    embed.addFields({ name: `${state.discordUser2.username}`, value: 'All cards defeated!', inline: false });
  }

  // action columns
  if (state.lastP1Action || state.lastP2Action) {
    embed.addFields(
      { name: `${state.discordUser1.username}'s Action`, value: state.lastP1Action || '—', inline: true },
      { name: `${state.discordUser2.username}'s Action`, value: state.lastP2Action || '—', inline: true }
    );
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
  // Add forfeit button to character row only if not awaiting target
  if (!state.awaitingTarget) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('duel_action:forfeit')
        .setLabel('Forfeit')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(state.finished)
    );
  }
  return row;
}

function makeActionRow(state, isPlayer1Turn) {
  if (state.selected === null || state.awaitingTarget) return null;
  const card = isPlayer1Turn ? state.player1Cards[state.selected] : state.player2Cards[state.selected];
  if (!card) return null;
  const isUndead = card.status && card.status.some(st => st.type === 'undead');
  
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('duel_action:attack')
      .setLabel('Attack')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isUndead)
  );
  if (card.def.special_attack && card.energy >= 3) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('duel_action:special')
        .setLabel('Special Attack')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isUndead)
    );
  }
  // Rest button - reset energy to 3
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('duel_action:rest')
      .setLabel('Rest')
      .setStyle(ButtonStyle.Success)
  );
  return row;
}

function makeTargetRow(state, isPlayer1Turn) {
  if (!state.awaitingTarget) return null;
  const row = new ActionRowBuilder();
  const targetTeam = isPlayer1Turn ? state.player2Cards : state.player1Cards;
  const attackerTeam = isPlayer1Turn ? state.player1Cards : state.player2Cards;
  const attacker = attackerTeam[state.selected];
  // All live cards can be targeted (no tank restriction)
  targetTeam.forEach((c, i) => {
    const disabled = c.currentHP <= 0;
    const multiplier = getDamageMultiplier(attacker.def.attribute, c.def.attribute);
    let style = ButtonStyle.Secondary; // Grey for neutral
    if (multiplier > 1) style = ButtonStyle.Success; // Green for effective
    else if (multiplier < 1) style = ButtonStyle.Danger; // Red for resisted
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`duel_target:${i}`)
        .setLabel(`${c.def.character}`)
        .setStyle(style)
        .setDisabled(disabled)
    );
  });
  return row;
}

async function updateDuelMessage(msg, state) {
  const embed = buildEmbed(state);
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
    setupTimeout(state, msg);
  }
}

function rechargeEnergy(state) {
  state.player1Cards.forEach(c => {
    const locked = c.status && c.status.some(st => st.type === 'stun' || st.type === 'freeze');
    if (c.turnsUntilRecharge > 0) {
      c.turnsUntilRecharge--;
    } else if (c.alive && c.energy < 3 && !locked) {
      c.energy++;
    }
  });
  state.player2Cards.forEach(c => {
    const locked = c.status && c.status.some(st => st.type === 'stun' || st.type === 'freeze');
    if (c.turnsUntilRecharge > 0) {
      c.turnsUntilRecharge--;
    } else if (c.alive && c.energy < 3 && !locked) {
      c.energy++;
    }
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

function setupTimeout(state, msg) {
  clearDuelTimeout(state);
  if (!state.finished) {
    state.timeout = setTimeout(async () => {
      try {
        // Check if duel state still exists with this message ID
        if (!duelStates.has(msg.id)) return;
        if (state.finished) return;
        appendLog(state, `${state.turn === 'player1' ? state.discordUser1.username : state.discordUser2.username} took too long. Turn passed.`);
        // Try to finalize, but handle case where message was deleted
        try {
          await finalizeAction(state, msg, true);
        } catch (e) {
          console.error('Timeout error:', e);
        }
      } catch (e) {
        console.error('Timeout handler error:', e);
      }
    }, 30000);
  }
}

function appendLog(state, txt) {
  if (state.log) state.log += '\n' + txt;
  else state.log = txt;
}

// Check if a team has any valid moves (at least one unlocked card with energy)
function canTeamAct(team) {
  if (!team || team.length === 0) return false;
  return team.some(c => c.alive && !hasStatusLock(c) && c.energy > 0);
}

async function finalizeAction(state, msg, timedOut = false) {
  // Check if player's team is defeated
  const currentTeam = state.turn === 'player1' ? state.player1Cards : state.player2Cards;
  const opponentTeam = state.turn === 'player1' ? state.player2Cards : state.player1Cards;

  if (checkTeamDefeated(currentTeam)) {
    state.finished = true;
    const winnerId = state.turn === 'player1' ? state.player2Id : state.player1Id;
    const loserId = state.turn === 'player1' ? state.player1Id : state.player2Id;
    const winner = state.turn === 'player1' ? state.discordUser2 : state.discordUser1;
    const loser = state.turn === 'player1' ? state.discordUser1 : state.discordUser2;
    
    // Load user documents and calculate bounty change
    let winnerUser = await User.findOne({ userId: winnerId });
    let loserUser = await User.findOne({ userId: loserId });
    let bountyGain = 0;
    
    if (winnerUser && loserUser) {
      const winnerBounty = winnerUser.bounty || 100;
      const loserBounty = loserUser.bounty || 100;
      
      // Calculate bounty gain based on the rules:
      // If Winner's Bounty >= Loser's Bounty: 0 Bounty gain
      // If Loser's Bounty > Winner's Bounty: Winner gains 3% of the Loser's bounty
      // Cap: If the Loser has > 3x the Winner's bounty, the Winner earns 0 Bounty
      if (loserBounty > winnerBounty) {
        if (loserBounty > winnerBounty * 3) {
          bountyGain = 0; // Cap reached
        } else {
          bountyGain = Math.floor(loserBounty * 0.03);
        }
      }
      
      if (bountyGain > 0) {
        winnerUser.bounty = (winnerUser.bounty || 100) + bountyGain;
        await winnerUser.save();
      }
    }
    
    // Handle bounty rewards
    let xpGain = 0;
    let beliGain = 0;
    if (state.isBountyDuel && winnerId === state.bountyHunter) {
      const targetBounty = loserUser.bounty || 100;
      xpGain = Math.floor(targetBounty / 10);
      beliGain = Math.floor(targetBounty / 2);
      
      winnerUser.balance = (winnerUser.balance || 0) + beliGain;
      // Add XP to all owned cards
      if (winnerUser.ownedCards) {
        winnerUser.ownedCards.forEach(card => {
          card.xp = (card.xp || 0) + xpGain;
        });
      }
      winnerUser.activeBountyTarget = null;
      winnerUser.bountyCooldownUntil = null;
      await winnerUser.save();
    } else if (state.isBountyDuel && loserId === state.bountyHunter) {
      // Hunter lost, reset cooldown but keep target
      const hunterUser = await User.findOne({ userId: state.bountyHunter });
      if (hunterUser) {
        hunterUser.bountyCooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await hunterUser.save();
      }
    }
    
    // Create victory embed with bounty information
    let description = `${winner.username} wins!`;
    if (bountyGain > 0) {
      description += `\n\nBounty Gained: **${bountyGain}**`;
    }
    if (xpGain > 0 && beliGain > 0) {
      description += `\n\nBounty Claimed! Earned **${xpGain} XP** and ¥**${beliGain}**!`;
    }
    
    const victorEmbed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('Duel Victory!')
      .setDescription(description)
      .setAuthor({ name: state.discordUser1.username, iconURL: state.discordUser1.displayAvatarURL() });
    
    try { await msg.delete(); } catch {}
    await msg.channel.send({ embeds: [victorEmbed] });
    duelStates.delete(msg.id);
  } else {
    // Recharge and switch turn
    rechargeEnergy(state);
    state.turn = state.turn === 'player1' ? 'player2' : 'player1';
    state.selected = null;
    state.lastP1Action = state.lastP1Action || '';
    state.lastP2Action = state.lastP2Action || '';
    // do not clear log here – we want current log entries to show on the
    // upcoming embed (especially status messages or skip notices)
    state.embedImage = null; // Clear special attack gif
    state.gifMessageId = null; // Clear special attack gif message

    // Apply start-of-turn effects to ALL cards (both teams)
    applyGlobalCut(state);

    // Check if current player can act; if not, automatically skip their turn
    const activeTeam = state.turn === 'player1' ? state.player1Cards : state.player2Cards;
    if (!canTeamAct(activeTeam)) {
      appendLog(state, `${state.turn === 'player1' ? state.discordUser1.username : state.discordUser2.username} has no valid moves. Turn skipped.`);
      return finalizeAction(state, msg, false);
    }

    // refresh message instead of editing
    msg = await refreshDuelMessage(msg, state);
    // clear log now that we have shown it on the latest embed
    state.log = '';

    if (checkTeamDefeated(state.turn === 'player1' ? state.player1Cards : state.player2Cards)) {
      state.finished = true;
      const winnerId = state.turn === 'player1' ? state.player2Id : state.player1Id;
      const loserId = state.turn === 'player1' ? state.player1Id : state.player2Id;
      const winner = state.turn === 'player1' ? state.discordUser2 : state.discordUser1;
      
      // Load user documents and calculate bounty change
      let winnerUser = await User.findOne({ userId: winnerId });
      let loserUser = await User.findOne({ userId: loserId });
      let bountyGain = 0;
      
      if (winnerUser && loserUser) {
        const winnerBounty = winnerUser.bounty || 100;
        const loserBounty = loserUser.bounty || 100;
        
        // Calculate bounty gain based on the rules
        if (loserBounty > winnerBounty) {
          if (loserBounty > winnerBounty * 3) {
            bountyGain = 0; // Cap reached
          } else {
            bountyGain = Math.floor(loserBounty * 0.03);
          }
        }
        
        if (bountyGain > 0) {
          winnerUser.bounty = (winnerUser.bounty || 100) + bountyGain;
          await winnerUser.save();
        }
      }
      
      // Create victory embed with bounty information
      let description = `${winner.username} wins!`;
      if (bountyGain > 0) {
        description += `\n\nBounty Gained: **${bountyGain}**`;
      }
      
      const victorEmbed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle('Duel Victory!')
        .setDescription(description)
        .setAuthor({ name: state.discordUser1.username, iconURL: state.discordUser1.displayAvatarURL() });
      
      try { await msg.delete(); } catch {}
      await msg.channel.send({ embeds: [victorEmbed] });
      duelStates.delete(msg.id);
    }
  }
}

function clearUserState(userId) {
  for (const [msgId, state] of duelStates) {
    if (state.player1Id === userId || state.player2Id === userId) {
      duelStates.delete(msgId);
    }
  }
  for (const [msgId, pending] of pendingDuelRequests) {
    if (pending.player1Id === userId || pending.player2Id === userId) {
      pendingDuelRequests.delete(msgId);
    }
  }
}

module.exports = {
  name: 'duel',
  description: 'Duel another player',
  options: [
    { name: 'opponent', type: 6, description: 'The player to duel', required: true }
  ],
  clearUserState,
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

    // Check if either player is already in an active duel
    for (const [_, state] of duelStates) {
      if (!state.finished && (state.player1Id === userId || state.player2Id === userId || state.player1Id === opponentId || state.player2Id === opponentId)) {
        const reply = 'One or both players are already in an active duel.';
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
    }

    // Check if there's already a pending duel request between these players
    for (const [_, pending] of pendingDuelRequests) {
      if ((pending.player1Id === userId && pending.player2Id === opponentId) || (pending.player1Id === opponentId && pending.player2Id === userId)) {
        const reply = 'There is already a pending duel request between you and this player.';
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
    }

    // Get user objects for discord
    const discordUser1 = message ? message.author : interaction.user;
    const discordUser2 = await (message ? message.client.users.fetch(opponentId) : interaction.client.users.fetch(opponentId));

    // Check both have at least 1 card on their team
    if (!Array.isArray(user1.team) || user1.team.length === 0) {
      const reply = 'Your team must have at least 1 card.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (!Array.isArray(user2.team) || user2.team.length === 0) {
      const opponent2Username = discordUser2?.username || 'That user';
      const reply = `${opponent2Username} must have at least 1 card on their team.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

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
          turnsUntilRecharge: 0,
          status: []
        };
      }).filter(Boolean);
    };

    const p1Team = resolveTeam(user1, user1.team);
    const p2Team = resolveTeam(user2, user2.team);

    if (p1Team.length < 1 || p2Team.length < 1) {
      const reply = 'Duel requires at least 1 valid card per player.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Determine who goes first BY CARD SPEED, not who initiated
    const p1Speed = Math.max(...p1Team.map(c => c.def.speed || 0));
    const p2Speed = Math.max(...p2Team.map(c => c.def.speed || 0));
    
    // Swap if p2 is faster (so player 1 always has higher speed)
    let team1 = p1Team, team2 = p2Team, user1Id = userId, user2Id = opponentId, disc1 = discordUser1, disc2 = discordUser2, speed1 = p1Speed, speed2 = p2Speed;
    if (p2Speed > p1Speed) {
      team1 = p2Team;
      team2 = p1Team;
      user1Id = opponentId;
      user2Id = userId;
      disc1 = discordUser2;
      disc2 = discordUser1;
      speed1 = p2Speed;
      speed2 = p1Speed;
    }

    // Send acceptance message
    const challengerTeamLines = p1Team.map(c => `${c.def.emoji || '•'} ${c.def.character} (${c.def.rank})`).join('\n');
    const starterUser = disc1.username; // disc1 has higher speed
    const acceptEmbed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setDescription(`** <a:duelxbounty:1489629169506713600> ${discordUser1.username} challenged you to a duel! **\n\n${discordUser1.username}'s team \n ${challengerTeamLines}\n\n-# ${starterUser} would start this duel first.`);
    
    const acceptRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('duel_accept:accept')
          .setLabel('Accept')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<:accept:1489632023600697454>'),
        new ButtonBuilder()
          .setCustomId('duel_accept:decline')
          .setLabel('Decline')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<:decline:1489632232942342154>')
      );
    
    let acceptMsg;
    if (message) {
      acceptMsg = await message.channel.send({ embeds: [acceptEmbed], components: [acceptRow] });
    } else {
      acceptMsg = await interaction.reply({ embeds: [acceptEmbed], components: [acceptRow], fetchReply: true });
    }
    
    // Store pending duel request temporarily
    const pendingState = {
      player1Id: userId, // Challenger (who initiated the duel)
      player2Id: opponentId, // Opponent (who was challenged)
      player1Cards: p1Team, // Challenger's team
      player2Cards: p2Team, // Opponent's team
      p1Speed: p1Speed,
      p2Speed: p2Speed,
      discordUser1: discordUser1,
      discordUser2: discordUser2
    };
    pendingDuelRequests.set(acceptMsg.id, pendingState);
    // Expire after 5 minutes
    // setTimeout(() => pendingDuelRequests.delete(acceptMsg.id), 5 * 60 * 1000);
  },

  async handleButton(interaction, rawAction, cardId) {
    const msgId = interaction.message.id;
    
    // Handle accept/decline actions
    if (rawAction === 'duel_accept') {
      const pending = pendingDuelRequests.get(msgId);
      if (!pending) {
        return interaction.reply({ content: 'This duel request has expired.', ephemeral: true });
      }
      
      // Check if the challenger is trying to accept their own challenge
      if (interaction.user.id === pending.player1Id) {
        return interaction.reply({ content: 'You cannot accept your own challenge. Waiting for your opponent...', ephemeral: true });
      }
      
      // Only the challenged player (player2) can respond
      if (interaction.user.id !== pending.player2Id) {
        return interaction.reply({ content: 'Only the challenged player can respond to this duel request.', ephemeral: true });
      }
      
      if (cardId === 'decline') {
        try { await interaction.message.delete(); } catch {}
        pendingDuelRequests.delete(msgId);
        return interaction.reply({ content: 'Duel request declined.' });
      }
      
      if (cardId === 'accept') {
        // Check if either player already has an active duel
        let alreadyDueling = false;
        for (const [_, state] of duelStates) {
          if (!state.finished && (state.player1Id === pending.player1Id || state.player1Id === pending.player2Id || state.player2Id === pending.player1Id || state.player2Id === pending.player2Id)) {
            alreadyDueling = true;
            break;
          }
        }
        
        if (alreadyDueling) {
          return interaction.reply({ content: 'One or both players are already in an active duel.', ephemeral: true });
        }
        
        // Check for bounty duel
        let isBountyDuel = false;
        let bountyHunter = null;
        const p1User = await User.findOne({ userId: pending.player1Id });
        const p2User = await User.findOne({ userId: pending.player2Id });
        if (p1User && p1User.activeBountyTarget === pending.player2Id) {
          isBountyDuel = true;
          bountyHunter = pending.player1Id;
        } else if (p2User && p2User.activeBountyTarget === pending.player1Id) {
          isBountyDuel = true;
          bountyHunter = pending.player2Id;
        }
        
        // Start the duel
        const state = {
          player1Id: pending.player1Id,
          player2Id: pending.player2Id,
          player1Cards: pending.player1Cards,
          player2Cards: pending.player2Cards,
          turn: pending.p1Speed >= pending.p2Speed ? 'player1' : 'player2',
          // remember who started so we can keep embed colors stable
          startingPlayer: pending.p1Speed >= pending.p2Speed ? 'player1' : 'player2',
          selected: null,
          awaitingTarget: null,
          finished: false,
          log: '',
          lastP1Action: '',
          lastP2Action: '',
          timeout: null,
          embedImage: null,
          gifMessageId: null,
          discordUser1: pending.discordUser1,
          discordUser2: pending.discordUser2,
          isBountyDuel,
          bountyHunter
        };
        applyGlobalCut(state);
        appendLog(state, `${state.startingPlayer === 'player1' ? state.discordUser1.username : state.discordUser2.username} goes first!`);
        
        const embed = buildEmbed(state);
        const row = makeSelectionRow(state, state.turn === 'player1');
        
        try { await interaction.message.delete(); } catch {}
        const battleMsg = await interaction.channel.send({ embeds: [embed], components: [row] });
        duelStates.set(battleMsg.id, state);
        pendingDuelRequests.delete(msgId);
        await setupTimeout(state, battleMsg);

        // 3-minute expiration timeout
        setTimeout(() => {
          const expiredEmbed = buildEmbed(state);
          expiredEmbed.setFooter({ text: 'Expired' });
          battleMsg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
        }, 180000);
        return safeDefer(interaction);
      }
    }
    
    const state = duelStates.get(msgId);
    const logs = [];

    if (!state) {
      return interaction.reply({ content: 'This duel session has expired.', ephemeral: true });
    }

    // Clear any active special attack GIF when a player interacts
    if (state.gifMessageId) {
      try {
        const gifMsg = await interaction.channel.messages.fetch(state.gifMessageId);
        await gifMsg.delete();
      } catch (e) {
        // Message might already be deleted
      }
      state.gifMessageId = null;
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
    if (rawAction === 'duel_target') {
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
        await finalizeAction(state, interaction.message);
        return safeDefer(interaction);
      }

      const target = opponentTeam[targetIdx];

      const confusionStatus = getConfusionChance(card);
      if (confusionStatus > 0 && randomInt(1, 100) <= confusionStatus) {
        const actionText = `${card.def.character} is confused and misses the attack! <:energy:1478051414558118052> -1`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
        state.selected = null;
        await finalizeAction(state, interaction.message);
        return safeDefer(interaction);
      }

      if (hasTruesight(target)) {
        consumeTruesight(target);
        const actionText = `${card.def.character} attacks ${target.def.character} but ${target.def.character} dodges with truesight! <:energy:1478051414558118052> -1`;
        appendLog(state, `${target.def.character} used truesight and avoided the attack!`);
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
        state.selected = null;
        await finalizeAction(state, interaction.message);
        return safeDefer(interaction);
      }

      if (action === 'attack') {
        if (card.energy < 1) {
          return interaction.reply({ content: 'Not enough energy.', ephemeral: true });
        }
        card.energy -= 1;
        card.turnsUntilRecharge = 2;

        let baseDmg = calculateUserDamage(card, 'attack');
        const attrMultiplier = getDamageMultiplier(card.def.attribute, target.def.attribute);
        const attackMod = getAttackModifier(card);
        const defenseMultiplier = getDefenseMultiplier(card, target);
        let dmg = Math.floor(baseDmg * attrMultiplier * attackMod * defenseMultiplier);
        dmg = Math.max(0, dmg);

        target.currentHP -= dmg;
        if (target.currentHP <= 0) {
          target.currentHP = 0;
          const ko = handleKO(target);
          if (ko) logs.push(ko);
        }

        if (target.status) {
          const freezeIdx = target.status.findIndex(st => st.type === 'freeze');
          if (freezeIdx >= 0) {
            target.status.splice(freezeIdx, 1);
            appendLog(state, `${target.def.character} was unfrozen by the attack!`);
          }
        }        const effectiveness = attrMultiplier > 1 ? ' (Effective!)' : attrMultiplier < 1 ? ' (Weak)' : '';
        const actionText = `${card.def.emoji} **${card.def.character}** attacked ${target.def.emoji} **${target.def.character}** for **${dmg} DMG**${effectiveness}! **<:energy:1478051414558118052> -1**`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      } else if (action === 'special') {
        if (card.energy < 3) {
          return interaction.reply({ content: 'Not enough energy.', ephemeral: true });
        }
        card.energy -= 3;
        card.turnsUntilRecharge = 2;

        let baseDmg = calculateUserDamage(card, 'special');
        const attrMultiplier = getDamageMultiplier(card.def.attribute, target.def.attribute);
        const attackMod = getAttackModifier(card);
        const defenseMultiplier = getDefenseMultiplier(card, target);
        let dmg = Math.floor(baseDmg * attrMultiplier * attackMod * defenseMultiplier);
        dmg = Math.max(0, dmg);

        target.currentHP -= dmg;
        if (target.currentHP <= 0) {
          target.currentHP = 0;
          const ko = handleKO(target);
          if (ko) logs.push(ko);
        }

        if (target.status) {
          const freezeIdx = target.status.findIndex(st => st.type === 'freeze');
          if (freezeIdx >= 0) {
            target.status.splice(freezeIdx, 1);
            appendLog(state, `${target.def.character} was unfrozen by the attack!`);
          }
        }

        let effectLogsD2 = [];
        if (card.def.effect === 'team_stun') {
          const allAlive = opponentTeam.filter(c => c.currentHP > 0);
          effectLogsD2 = applyCardEffectShared(card, allAlive);
        } else {
          effectLogsD2 = applyCardEffectShared(card, target);
        }
        effectLogsD2.forEach(l => appendLog(state, l));

        const effectStr = getEffectString(card, target);
        const effectiveness = attrMultiplier > 1 ? ' (Effective!)' : attrMultiplier < 1 ? ' (Weak)' : '';
        const actionText = `${card.def.emoji} **${card.def.character}** used ${card.def.special_attack?.name || 'Special Attack'} for **${dmg} DMG**${effectiveness}${effectStr}! **<:energy:1478051414558118052> -3**`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;

        if (card.def.special_attack?.gif) {
          state.embedImage = card.def.special_attack.gif;
          try {
            let desc = `${card.def.character} uses ${card.def.special_attack.name || 'Special Attack'}!`;
            if (card.def.effect && card.def.effectDuration) {
              const effectDesc = getEffectDescription(card.def.effect, card.def.effectDuration);
              if (effectDesc) desc += `\n*${effectDesc}*`;
            }
            const gifEmbed = new EmbedBuilder()
              .setColor('#FFFFFF')
              .setImage(card.def.special_attack.gif)
              .setDescription(desc)
              .setAuthor({ name: state.discordUser1.username, iconURL: state.discordUser1.displayAvatarURL() });
            const gifMsg = await interaction.channel.send({ embeds: [gifEmbed] });
            state.gifMessageId = gifMsg.id;
          } catch (e) {
            console.error('Failed to send special attack GIF:', e);
          }
        }
      }

      if (logs.length > 0) {
        logs.forEach(l => appendLog(state, l));
      }
      state.selected = null;
      await finalizeAction(state, interaction.message);
      return safeDefer(interaction);
    }

    // Handle selection
    if (rawAction === 'duel_select') {
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

      // Hard stun/freeze block - prevent selection of stunned/frozen cards
      if (hasStatusLock(card)) {
        const reason = getStatusLockReason(card);
        return interaction.reply({ content: `${card.def.character} is ${reason}!`, ephemeral: true });
      }

      state.selected = idx;
      await updateDuelMessage(interaction.message, state);
      return safeDefer(interaction);
    }

    // Handle action
    if (rawAction === 'duel_action') {
      const act = cardId;

      // handle forfeit immediately before card logic
      if (act === 'forfeit') {
        state.finished = true;
        const winnerId = isPlayer1 ? state.player2Id : state.player1Id;
        const loserId = isPlayer1 ? state.player1Id : state.player2Id;
        const winner = isPlayer1 ? state.discordUser2 : state.discordUser1;
        const loser = isPlayer1 ? state.discordUser1 : state.discordUser2;
        
        // Load user documents and calculate bounty change
        let winnerUser = await User.findOne({ userId: winnerId });
        let loserUser = await User.findOne({ userId: loserId });
        let bountyGain = 0;
        
        if (winnerUser && loserUser) {
          const winnerBounty = winnerUser.bounty || 100;
          const loserBounty = loserUser.bounty || 100;
          
          // Calculate bounty gain based on the rules:
          // If Winner's Bounty >= Loser's Bounty: 0 Bounty gain
          // If Loser's Bounty > Winner's Bounty: Winner gains 3% of the Loser's bounty
          // Cap: If the Loser has > 3x the Winner's bounty, the Winner earns 0 Bounty
          if (loserBounty > winnerBounty) {
            if (loserBounty > winnerBounty * 3) {
              bountyGain = 0; // Cap reached
            } else {
              bountyGain = Math.floor(loserBounty * 0.03);
            }
          }
          
          if (bountyGain > 0) {
            winnerUser.bounty = (winnerUser.bounty || 100) + bountyGain;
            await winnerUser.save();
          }
        }
        
        // Handle bounty rewards
        let xpGain = 0;
        let beliGain = 0;
        if (state.isBountyDuel && winnerId === state.bountyHunter) {
          const targetBounty = loserUser.bounty || 100;
          xpGain = Math.floor(targetBounty / 10);
          beliGain = Math.floor(targetBounty / 2);
          
          winnerUser.balance = (winnerUser.balance || 0) + beliGain;
          // Add XP to all owned cards
          if (winnerUser.ownedCards) {
            winnerUser.ownedCards.forEach(card => {
              card.xp = (card.xp || 0) + xpGain;
            });
          }
          winnerUser.activeBountyTarget = null;
          winnerUser.bountyCooldownUntil = null;
          await winnerUser.save();
        } else if (state.isBountyDuel && loserId === state.bountyHunter) {
          // Hunter lost, reset cooldown but keep target
          const hunterUser = await User.findOne({ userId: state.bountyHunter });
          if (hunterUser) {
            hunterUser.bountyCooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await hunterUser.save();
          }
        }
        
        // Create victory embed with bounty information
        let description = `${interaction.user.username} forfeited.\n${winner.username} wins!`;
        if (bountyGain > 0) {
          description += `\n\nBounty Gained: **${bountyGain}**`;
        }
        if (xpGain > 0 && beliGain > 0) {
          description += `\n\nBounty Claimed! Earned **${xpGain} XP** and ¥**${beliGain}**!`;
        }
        
        const forfeitEmbed = new EmbedBuilder()
          .setColor('#FFFFFF')
          .setTitle('Duel Victory!')
          .setDescription(description)
          .setAuthor({ name: state.discordUser1.username, iconURL: state.discordUser1.displayAvatarURL() });
        try { await interaction.message.delete(); } catch {}
        await interaction.channel.send({ embeds: [forfeitEmbed] });
        duelStates.delete(msgId);
        return safeDefer(interaction);
      }

      if (state.finished) {
        return interaction.reply({ content: 'The duel has already ended.', ephemeral: true });
      }

      const card = myTeam[state.selected];
      if (!card || !card.alive) {
        state.selected = null;
        await updateDuelMessage(interaction.message, state);
        return interaction.reply({ content: 'Selected card is unavailable.', ephemeral: true });
      }

      if (act === 'attack' || act === 'special') {
        // block stunned/frozen cards from initiating an action
        if (hasStatusLock(card)) {
          return interaction.reply({ content: `${card.def.character} is ${getStatusLockReason(card)} and cannot act!`, ephemeral: true });
        }
        const aliveOpponents = opponentTeam.filter(c => c.currentHP > 0);
        if (aliveOpponents.length === 0) {
          return interaction.reply({ content: 'No valid targets remaining.', ephemeral: true });
        }
        // pick a target index now, default to first alive opponent
        let targetIdx = opponentTeam.findIndex(c => c.currentHP > 0);
        // if there are multiple opponents, prompt the player
        if (aliveOpponents.length > 1 && !state.awaitingTarget) {
          state.awaitingTarget = act;
          await updateDuelMessage(interaction.message, state);
          return safeDefer(interaction);
        }

        // Energy checks
        if (act === 'attack') {
          if (card.energy < 1) return interaction.reply({ content: 'Not enough energy for attack.', ephemeral: true });
          card.energy -= 1;
        } else if (act === 'special') {
          if (card.energy < 3) return interaction.reply({ content: 'Special attack requires 3 energy.', ephemeral: true });
          card.energy -= 3;
        }

        card.turnsUntilRecharge = 2;
        const baseDmg = calculateUserDamage(card, act, myUser);
        // determine damage target(s) and effect target(s)
        let damageTarget;
        let effectTarget;
        if (act === 'special' && card.def.effect === 'team_stun') {
          // team_stun: damage single target, stun all alive opponents
          damageTarget = opponentTeam[targetIdx];
          effectTarget = opponentTeam.filter(c => c.currentHP > 0);
        } else {
          const target = opponentTeam[targetIdx];
          damageTarget = target;
          effectTarget = target;
        }
        // calculate final damage with attribute multiplier
        let attrMultiplier = 1;
        if (damageTarget) {
          attrMultiplier = getDamageMultiplier(card.def.attribute, damageTarget.def.attribute);
        }
        const dmg = Math.floor(baseDmg * attrMultiplier);
        if (damageTarget) {
          damageTarget.currentHP -= dmg;
          if (damageTarget.currentHP <= 0) {
            damageTarget.currentHP = 0;
            const ko = handleKO(damageTarget);
            if (ko) logs.push(ko);
          }
        }
        // unfreeze the damage target if it was frozen
        if (damageTarget.status) {
          const freezeIdx = damageTarget.status.findIndex(st => st.type === 'freeze');
          if (freezeIdx >= 0) {
            damageTarget.status.splice(freezeIdx, 1);
          }
        }
        // apply status effect only for specials
        let effectLogs = [];
        let effectSummary = '';
        if (act === 'special') {
          effectLogs = applyCardEffectShared(card, effectTarget);
          // Build effect summary for GIF embed (e.g., "and stuns Roronoa Zoro")
          if (card.def.effect === 'team_stun') {
            effectSummary = ' and stunned the whole team';
          } else if (card.def.effect && effectTarget.def) {
            const effectVerbs = {
              'stun': 'stuns',
              'freeze': 'freezes',
              'cut': 'cuts',
              'bleed': 'bleeds'
            };
            const verb = effectVerbs[card.def.effect] || 'hits';
            effectSummary = ` and ${verb} ${effectTarget.def.character}`;
          }
          // embed the gif on main duel embed as well
          if (card.def.special_attack?.gif) {
            state.embedImage = card.def.special_attack.gif;
            try {
              let desc = `${card.def.character} uses ${card.def.special_attack.name || 'Special Attack'}!`;
              if (card.def.effect && card.def.effectDuration) {
                const effectDesc = getEffectDescription(card.def.effect, card.def.effectDuration);
                if (effectDesc) desc += `\n*${effectDesc}*`;
              } else if (effectSummary) {
                // fallback to previous short summary if no duration available
                desc += effectSummary;
              }
              const gifEmbed = new EmbedBuilder()
                .setColor('#FFFFFF')
                .setImage(card.def.special_attack.gif)
                .setDescription(desc)
                .setAuthor({ name: state.discordUser1.username, iconURL: state.discordUser1.displayAvatarURL() });
              const gifMsg = await interaction.channel.send({ embeds: [gifEmbed] });
              state.gifMessageId = gifMsg.id;
            } catch (e) {
              console.error('Failed to send special attack GIF:', e);
            }
          } else {
            state.embedImage = null;
          }
        }
        effectLogs.forEach(l => appendLog(state, l));

        const cost = act === 'attack' ? 1 : act === 'special' ? 3 : 1;
        const effectivenessStr = attrMultiplier > 1 ? ' (super effective)' : attrMultiplier < 1 ? ' (not very effective)' : '';
        const effectMessages = effectLogs.length > 0 ? ` *${effectLogs.join(', ')}*` : '';
        let actionText;
        if (act === 'special') {
          if (card.def.effect === 'team_stun') {
            actionText = `${card.def.emoji} **${card.def.character}** used ${card.def.special_attack?.name || 'Special Attack'} on ${damageTarget?.def?.emoji || '⚔️'} **${damageTarget?.def?.character || 'target'}** for **${dmg} DMG**!${effectivenessStr} *stunned the whole team*${effectMessages} **<:energy:1478051414558118052> -${cost}**`;
          } else {
            actionText = `${card.def.emoji} **${card.def.character}** used ${card.def.special_attack?.name || 'Special Attack'} for **${dmg} DMG**!${effectivenessStr}${getEffectString(card, damageTarget)}${effectMessages} **<:energy:1478051414558118052> -${cost}**`;
          }
        } else {
          actionText = `${card.def.emoji} **${card.def.character}** attacked ${damageTarget.def.emoji} **${damageTarget.def.character}** for **${dmg} DMG**!${effectivenessStr}${getEffectString(card, damageTarget)}${effectMessages} **<:energy:1478051414558118052> -${cost}**`;
        }
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      } else if (act === 'rest') {
        // Rest action: restore card's energy to 3 and heal 10% of max HP
        card.energy = 3;
        card.turnsUntilRecharge = 2;
        const healAmount = Math.ceil(card.maxHP * 0.1);
        card.currentHP = Math.min(card.maxHP, card.currentHP + healAmount);
        const actionText = `${card.def.character} took a rest, restored energy and healed for ${healAmount} HP!`;
        if (isPlayer1) state.lastP1Action = actionText;
        else state.lastP2Action = actionText;
      }

      // Clear log after action to prevent accumulation
      state.log = '';

      await finalizeAction(state, interaction.message);
      return safeDefer(interaction);
    }

    return interaction.reply({ content: 'Unsupported interaction.', ephemeral: true });
  }
};
