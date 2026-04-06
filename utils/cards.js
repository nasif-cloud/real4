const { EmbedBuilder } = require('discord.js');
const { cards, rankData } = require('../data/cards');
const crews = require('../data/crews');
const { PULL_RATES, PITY_TARGET, PITY_DISTRIBUTION } = require('../config');

// Create icon map
const crewIcons = {};
crews.forEach(crew => {
  crewIcons[crew.name] = crew.icon;
});

function getModifiedRates(baseRates, rodMultiplier = 1) {
  if (rodMultiplier === 1) return baseRates;
  const boostedRanks = new Set(['A', 'S', 'SS', 'UR']);
  const modified = {};
  let total = 0;
  for (const [rank, pct] of Object.entries(baseRates)) {
    const weight = boostedRanks.has(rank) ? pct * rodMultiplier : pct;
    modified[rank] = weight;
    total += weight;
  }
  if (total === 0) return baseRates;
  const factor = 100 / total;
  for (const rank of Object.keys(modified)) {
    modified[rank] = modified[rank] * factor;
  }
  return modified;
}

function getRankFromDistribution(rates) {
  const r = Math.random() * 100;
  let running = 0;
  for (const [rk, pct] of Object.entries(rates)) {
    running += pct;
    if (r <= running) return rk;
  }
  return Object.keys(rates)[Object.keys(rates).length - 1];
}

// Get a card definition by its ID
function getCardById(cardId) {
  return cards.find(c => c.id === cardId);
}

function getAttributeEmoji(attribute) {
  const map = {
    STR: '<:STR:1490476222755639476>',
    DEX: '<:DEX:1490476443946188952>',
    QCK: '<:QCK:1490476238593331291>',
    PSY: '<:PSY:1490476369472127166>',
    INT: '<:INT:1490476207601483816>',
    ALL: '🔷'
  };
  return map[attribute] || attribute || '❔';
}

function stripBoostAmounts(boostText) {
  if (!boostText || typeof boostText !== 'string') return boostText;
  return boostText.replace(/\s*\(\d+%\)/g, '').trim();
}

function getAllCardVersions(character) {
  return cards.filter(c => c.character === character).map(c => c.id);
}

function getOwnedEntry(user, cardDef) {
  return user && Array.isArray(user.ownedCards) ? user.ownedCards.find(e => e.cardId === cardDef.id) : null;
}

function hasHigherVersionOwned(user, cardDef) {
  if (!user || !Array.isArray(user.ownedCards) || !cardDef || cardDef.mastery >= cardDef.mastery_total) return false;
  const allVersionIds = getAllCardVersions(cardDef.character);
  const currentIndex = allVersionIds.indexOf(cardDef.id);
  if (currentIndex < 0) return false;
  const higherVersionIds = allVersionIds.slice(currentIndex + 1);
  const ownedIds = user.ownedCards.map(e => e.cardId);
  return higherVersionIds.some(id => ownedIds.includes(id));
}

function resolveBoostsForCard(cardDef, user) {
  const boostEntries = [];
  let totalBoostPct = 0;
  const statBoosts = {};
  if (!user || !Array.isArray(user.ownedCards)) return { boostEntries, totalBoostPct, statBoosts };

  const getEffectiveBoost = (boostCardId, baseBoostPct) => {
    let effectiveBoost = baseBoostPct;
    user.ownedCards.forEach(entry => {
      const def = cards.find(c => c.id === entry.cardId);
      if (def && def.boost && entry.cardId !== boostCardId) {
        const boostCard = cards.find(c => c.id === boostCardId);
        if (boostCard) {
          const charRegex = new RegExp(`${boostCard.character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\((\\d+)%\\)`, 'i');
          const charMatch = def.boost.match(charRegex);
          if (charMatch) {
            const applyBoost = parseInt(charMatch[1], 10);
            effectiveBoost = Math.ceil(effectiveBoost * (1 + applyBoost / 100));
          }
        }
      }
    });
    return effectiveBoost;
  };

  user.ownedCards.forEach(entry => {
    const def = cards.find(c => c.id === entry.cardId);
    if (def && def.boost) {
      // Regex: target, optional stat, percent
      const regex = /([\w .'-]+?)(?:,\s*([\w ]+))?\s*\((\d+)%\)/gi;
      let match;
      while ((match = regex.exec(def.boost)) !== null) {
        const targetName = match[1].trim();
        const stat = match[2] ? match[2].trim() : null;
        const pct = parseInt(match[3], 10);
        // If this boost applies to this card or its faculty (faculty boost applies to all cards in that faculty)
        if (
          targetName.toLowerCase() === cardDef.character.toLowerCase() ||
          (cardDef.faculty && targetName.toLowerCase().replace(/-/g, '').replace(/ /g, '') === cardDef.faculty.toLowerCase().replace(/-/g, '').replace(/ /g, ''))
        ) {
          const isFacultyBoost = cardDef.faculty && targetName.toLowerCase().replace(/-/g, '').replace(/ /g, '') === cardDef.faculty.toLowerCase().replace(/-/g, '').replace(/ /g, '');
          const boostAmount = getEffectiveBoost(def.id, pct);
          if (stat) {
            statBoosts[stat] = (statBoosts[stat] || 0) + boostAmount;
            boostEntries.push({ source: def.character, pct: boostAmount, stat });
          } else {
            totalBoostPct += boostAmount;
            boostEntries.push({ source: def.character, pct: boostAmount });
          }
        }
      }
    }
  });

  return { boostEntries, totalBoostPct, statBoosts };
}

function getCardFinalStats(cardDef, level, user) {
  const userEntry = getOwnedEntry(user, cardDef);
  const isOwned = !!userEntry;
  const higherVersionOwned = !isOwned && hasHigherVersionOwned(user, cardDef);
  const boostInfo = (isOwned || !higherVersionOwned) ? resolveBoostsForCard(cardDef, user) : { boostEntries: [], totalBoostPct: 0, statBoosts: {} };
  const scaled = computeScaledStats(cardDef, level || 1, boostInfo.totalBoostPct, boostInfo.statBoosts);
  return {
    scaled,
    boostEntries: boostInfo.boostEntries,
    totalBoostPct: boostInfo.totalBoostPct,
    statBoosts: boostInfo.statBoosts || {},
    isOwned,
    higherVersionOwned
  };
}


// Find the highest mastery owned version of a character
async function findBestOwnedVersion(userId, character) {
  const User = require('../models/User');
  const allVersions = getAllCardVersions(character);
  if (!allVersions.length) return null;
  
  const user = await User.findOne({ userId });
  if (!user || !user.ownedCards) return null;
  
  const ownedIds = user.ownedCards.map(e => e.cardId);
  const ownedVersions = allVersions.filter(id => ownedIds.includes(id));
  
  if (!ownedVersions.length) return null;
  
  // return highest mastery owned version (they're in order, so last is highest)
  const lastId = ownedVersions[ownedVersions.length - 1];
  return getCardById(lastId);
}

// fuzzy search: return matched card definitions sorted by mastery asc
function searchCards(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const matches = cards.filter(c => {
    if (c.id.toLowerCase() === q) return true;
    if (c.character.toLowerCase().includes(q)) return true;
    if (Array.isArray(c.alias) && c.alias.some(a => a.toLowerCase().includes(q))) return true;
    return false;
  });
  return matches.sort((a,b)=> a.mastery - b.mastery);
}

function findFirstCard(query) {
  const results = searchCards(query);
  return results.length ? results[0] : null;
}

// Find the best (highest mastery) owned version of a card
async function findBestOwnedCard(userId, query) {
  const User = require('../models/User');
  const matches = searchCards(query);
  if (!matches.length) return null;
  
  const user = await User.findOne({ userId });
  if (!user || !user.ownedCards) return matches[0]; // fallback to base if no user
  
  // find all owned versions of this character
  const ownedIds = user.ownedCards.map(e => e.cardId);
  const ownedMatches = matches.filter(m => ownedIds.includes(m.id));
  
  // return highest mastery owned, or fallback to base if none owned
  return ownedMatches.length ? ownedMatches[ownedMatches.length - 1] : matches[0];
}

// Simulate a pull with optional faculty filter and optional rod/mastery modifiers
function simulatePull(pityCount, faculty = null, options = {}) {
  const { rodMultiplier = 1, mastery = 1 } = options;
  const rateSource = pityCount >= PITY_TARGET ? PITY_DISTRIBUTION : PULL_RATES;
  const effectiveRates = getModifiedRates(rateSource, rodMultiplier);
  const rank = getRankFromDistribution(effectiveRates);

  let pool = cards.filter(c => c.mastery === mastery && c.rank === rank);
  if (mastery === 1) pool = pool.filter(c => c.pullable);

  if (faculty) {
    const facultyPool = pool.filter(c => {
      if (c.faculty === faculty) return true;
      const allVersionIds = getAllCardVersions(c.character);
      return allVersionIds.some(versionId => {
        const versionCard = getCardById(versionId);
        return versionCard && versionCard.faculty === faculty;
      });
    });
    if (facultyPool.length > 0) {
      pool = facultyPool;
    } else {
      const alt = cards.filter(c => c.mastery === mastery && c.faculty === faculty);
      if (alt.length > 0) {
        pool = alt;
      }
    }
  }

  if (pool.length === 0) {
    pool = cards.filter(c => c.mastery === mastery);
    if (mastery === 1) pool = pool.filter(c => c.pullable);
  }

  if (pool.length === 0) {
    pool = cards.filter(c => c.pullable && c.mastery === 1);
  }

  if (pool.length === 0) {
    pool = cards.filter(c => c.pullable);
  }

  if (pool.length === 0) {
    return null;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}


// Build a pull embed according to spec
function buildPullEmbed(card, username, avatarUrl, pityText, duplicateInfo) {
  const color = (rankData[card.rank] && rankData[card.rank].color) || '#2b2d31';
  // same emoji handling as buildCardEmbed: transform `<:name:id>` into a CDN URL
  let iconVal = crewIcons[card.faculty];
  if (iconVal && iconVal.startsWith && iconVal.startsWith('<:')) {
    const m = iconVal.match(/<:[^:]+:(\d+)>/);
    if (m) iconVal = `https://cdn.discordapp.com/emojis/${m[1]}.png`;
  }
  const author = {};
  if (iconVal) {
    if (iconVal.startsWith && iconVal.startsWith('http')) author.iconURL = iconVal;
    else author.name = iconVal;
  }
  // always include a name field; use faculty if nothing else
  if (!author.name) author.name = card.faculty;
  
  // Calculate attack value for display
  const attackVal = `${card.attack_min} - ${card.attack_max}`;
  
  // Build stats field - exclude attack for cards that are pure boosts
  let statsText = `**Health:** ${card.health}\n**Power:** ${card.power}\n**Speed:** ${card.speed}`;
  if (!card.boost) {
    statsText += `\n**Attack:** ${attackVal}`;
  }
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${card.character}`)
    .setAuthor(author)
    .setDescription(card.title || '')
    .addFields(
      { name: 'Stats', value: statsText, inline: false }
    )
    .setImage(card.image_url || null)
    .setFooter({ text: `${username} pulled this card | ${pityText}${duplicateInfo ? ` | ${duplicateInfo}` : ''}`, iconURL: avatarUrl || null });

  // rank badge at top-right (thumbnail) when a badge URL is defined
  const rankBadge = rankData[card.rank] && rankData[card.rank].badge;
  if (rankBadge) embed.setThumbnail(rankBadge);

  return embed;
}

// Build a card embed according to spec
function buildCardEmbed(cardDef, userEntry, avatarUrl, user) {
  const color = (rankData[cardDef.rank] && rankData[cardDef.rank].color) || '#2b2d31';
  let iconText = crewIcons[cardDef.faculty];
  let iconUrl = iconText;
  if (iconText && iconText.startsWith && iconText.startsWith('<:')) {
    const match = iconText.match(/<:[^:]+:(\d+)>/);
    if (match) {
      iconUrl = `https://cdn.discordapp.com/emojis/${match[1]}.png`;
    }
  }

  const author = {};
  if (iconUrl) {
    if (iconUrl.startsWith && iconUrl.startsWith('http')) author.iconURL = iconUrl;
    else author.name = iconUrl;
  }
  if (!author.name) author.name = cardDef.faculty;

  const isOwned = !!userEntry;
  const lvl = isOwned ? userEntry.level : 1;
  const cardStats = getCardFinalStats(cardDef, lvl, user);
  const scaled = cardStats.scaled;
  const boostEntries = cardStats.boostEntries || [];

  // Title line: Card name (biggest), title next to it
  let titleLine = cardDef.character;
  if (cardDef.title) titleLine += ` — ${cardDef.title}`;
  // Blank line after title
  // Dex/attribute emoji below title, above level
  const attributeIcon = getAttributeEmoji(cardDef.attribute);
  let descLines = [
    titleLine,
    '',
    `**Dex:** ${attributeIcon}`,
    `**Level:** ${lvl}${isOwned && userEntry && typeof userEntry.xp === 'number' ? ` (XP: ${userEntry.xp})` : ''}`,
    `**Owned:** ${isOwned ? 'Yes' : 'No'}`
  ];

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor(author)
    .setTitle(cardDef.character)
    .setDescription(descLines.join('\n'))
    .setImage(cardDef.image_url || null)
    .setFooter({ text: `Mastery ${cardDef.mastery}/${cardDef.mastery_total}`, iconURL: avatarUrl || null });

  const rankBadge = rankData[cardDef.rank] && rankData[cardDef.rank].badge;
  if (rankBadge) embed.setThumbnail(rankBadge);
  else if (iconUrl && iconUrl.startsWith && iconUrl.startsWith('http')) embed.setThumbnail(iconUrl);

  const statsLines = [
    `**Health:** ${scaled.health}`
  ];
  // Only show power if not a boost card, or if power > 1
  if (!cardDef.boost || scaled.power > 1) {
    statsLines.push(`**Power:** ${scaled.power}`);
  }
  statsLines.push(`**Speed:** ${scaled.speed}`);
  if (!cardDef.boost) {
    statsLines.push(`**Attack:** ${scaled.attack_min} - ${scaled.attack_max}`);
  } else {
    // Show boost line with correct emoji(s), stat, and percent
    const targets = [];
    if (cardDef.boost) {
      // Regex: target, optional stat, percent
      const regex = /([\w .'-]+?)(?:,\s*([\w ]+))?\s*\((\d+)%\)/gi;
      let match;
      while ((match = regex.exec(cardDef.boost)) !== null) {
        const targetName = match[1].trim();
        const stat = match[2] ? match[2].trim() : null;
        const pct = match[3];
        // Find emoji for target (crew or card)
        let emoji = '';
        const crew = crews.find(cr => cr.name.toLowerCase().replace(/-/g, '').replace(/ /g, '') === targetName.toLowerCase().replace(/-/g, '').replace(/ /g, ''));
        if (crew && crew.icon) emoji = crew.icon + ' ';
        else {
          const targetCard = cards.find(c => c.character === targetName);
          if (targetCard && targetCard.emoji) emoji = targetCard.emoji + ' ';
        }
        if (stat) {
          targets.push(`${emoji}boosted by \`${pct}%\` of ${stat}`.trim());
        } else {
          targets.push(`${emoji}boosted by \`${pct}%\` of all stats`.trim());
        }
      }
    }
    if (targets.length) {
      statsLines.push(`**Boost:** ${targets.join(' ')}`);
    } else {
      statsLines.push(`**Boost:** Boost card`);
    }
  }
  embed.addFields({ name: 'Stats', value: statsLines.join('\n'), inline: false });

  if (cardDef.special_attack && scaled.special_attack) {
    const sa = cardDef.special_attack;
    let specialAttackValue = `${sa.name} (${scaled.special_attack.min}-${scaled.special_attack.max} Atk)`;
    if (cardDef.effect && cardDef.effectDuration) {
      const effectDesc = cardDef.effect === 'undead' && cardDef.itself
        ? 'Keeps itself alive at 1 HP until the effect ends'
        : getEffectDescription(cardDef.effect, cardDef.effectDuration);
      if (effectDesc) {
        const amountLabel = ['regen', 'attackup', 'attackdown', 'defenseup', 'defensedown'].includes(cardDef.effect)
        ? ` (${cardDef.effectAmount ?? (cardDef.effect === 'regen' ? 10 : 12)}%)`
        : cardDef.effect === 'confusion'
          ? ` (${cardDef.effectChance ?? 50}%)`
            : '';
        specialAttackValue += ` - *${effectDesc}${amountLabel}*`;
      }
    }
    embed.addFields({ name: 'Special Attack', value: specialAttackValue, inline: false });
  }

  if (cardDef.effect && (!cardDef.special_attack || !scaled.special_attack)) {
    const effectDescription = getEffectDescription(cardDef.effect, cardDef.effectDuration || 0);
    if (effectDescription) {
      embed.addFields({ name: 'Effect', value: effectDescription, inline: false });
    }
  }

  // No "Stat Boosts" section

  return embed;
}

function computeScaledStats(cardDef, level, boostPct = 0, statBoosts = {}) {
  // Use explicit formula: final = ceil(base * (1 + level*0.01)) then apply boosts
  const levelMultiplier = 1 + (level || 0) * 0.01;
  const base = {
    power: Math.ceil(cardDef.power * levelMultiplier),
    health: Math.ceil(cardDef.health * levelMultiplier),
    speed: Math.ceil(cardDef.speed * levelMultiplier),
    attack_min: Math.ceil(cardDef.attack_min * levelMultiplier),
    attack_max: Math.ceil(cardDef.attack_max * levelMultiplier)
  };
  // Apply all-stats boost
  if (boostPct > 0) {
    const boostMultiplier = 1 + boostPct / 100;
    base.power = Math.ceil(base.power * boostMultiplier);
    base.health = Math.ceil(base.health * boostMultiplier);
    base.speed = Math.ceil(base.speed * boostMultiplier);
    base.attack_min = Math.ceil(base.attack_min * boostMultiplier);
    base.attack_max = Math.ceil(base.attack_max * boostMultiplier);
  }
  // Apply stat-specific boosts
  if (statBoosts && typeof statBoosts === 'object') {
    for (const [stat, pct] of Object.entries(statBoosts)) {
      const statKey = stat.toLowerCase();
      if (base.hasOwnProperty(statKey)) {
        const multiplier = 1 + pct / 100;
        base[statKey] = Math.ceil(base[statKey] * multiplier);
      } else if (statKey === 'health') {
        base.health = Math.ceil(base.health * (1 + pct / 100));
      } else if (statKey === 'power') {
        base.power = Math.ceil(base.power * (1 + pct / 100));
      } else if (statKey === 'speed') {
        base.speed = Math.ceil(base.speed * (1 + pct / 100));
      } else if (statKey === 'attack') {
        base.attack_min = Math.ceil(base.attack_min * (1 + pct / 100));
        base.attack_max = Math.ceil(base.attack_max * (1 + pct / 100));
      }
    }
  }
  // also scale special attack if present
  if (cardDef.special_attack) {
    const sa = cardDef.special_attack;
    let min = Math.ceil(sa.min_atk * levelMultiplier);
    let max = Math.ceil(sa.max_atk * levelMultiplier);
    if (boostPct > 0) {
      const boostMultiplier = 1 + boostPct / 100;
      min = Math.ceil(min * boostMultiplier);
      max = Math.ceil(max * boostMultiplier);
    }
    // Apply stat-specific boost to special attack if relevant
    if (statBoosts && typeof statBoosts === 'object' && statBoosts['attack']) {
      const atkMultiplier = 1 + statBoosts['attack'] / 100;
      min = Math.ceil(min * atkMultiplier);
      max = Math.ceil(max * atkMultiplier);
    }
    base.special_attack = { min, max };
  }
  return base;
}

// alias for clarity.  the `isail` command and other places talk about final
// stats which are just the base values scaled by level and boosts.  the
// original name `computeScaledStats` has been around for a while and is still
// exported for backward compatibility, but this helper makes the intent a bit
// clearer when reading code elsewhere (e.g. `calculateFinalStats(...)`).
function calculateFinalStats(cardDef, level, boostPct = 0) {
  return computeScaledStats(cardDef, level, boostPct);
}

// expose helper for other modules to describe status effects on attacks
function getEffectDescription(effectType, duration) {
  const isPermanent = duration === -1;
  const durationText = isPermanent ? '' : ` for ${duration} turn${duration > 1 ? 's' : ''}`;
  const effectDescriptions = {
    'regen': `Regenerates HP each turn by ${durationText}`,
    'confusion': `Gives${durationText} of chance to miss attacks`,
    'attackup': isPermanent ? 'Permanently boosts attack by' : `Boosts attack${durationText}`,
    'attackdown': isPermanent ? 'Permanently reduces attack by' : `Reduces attack${durationText}`,
    'defenseup': isPermanent ? 'Permanently boosts defense by' : `Reduces incoming damage${durationText}`,
    'defensedown': isPermanent ? 'Permanently reduces defense' : `Increases incoming damage${durationText}`,
    'truesight': `Can't be attacked for ${durationText}`,
    'undead': `Keeps the target alive at 0 HP until the effect ends`,
    'stun': `Stuns the opponent ${durationText}`,
    'freeze': `Freezes the opponent ${durationText}`,
    'cut': `Cuts the opponent ${durationText}`,
    // bleed triggers when the affected card spends energy
    // (attack/special/ability); duration counts the number of uses
    'bleed': `Bleeds the opponent for ${duration}`,
  };
  return effectDescriptions[effectType] || null;
}

module.exports = {
  searchCards,
  findFirstCard,
  findBestOwnedCard,
  buildPullEmbed,
  buildCardEmbed,
  computeScaledStats,
  calculateFinalStats,
  getCardById,
  getAllCardVersions,
  findBestOwnedVersion,
  getEffectDescription,
  getCardFinalStats,
  getAttributeEmoji,
  simulatePull
};
