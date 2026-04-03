const { EmbedBuilder } = require('discord.js');
const { cards, rankData } = require('../data/cards');
const crews = require('../data/crews');

// Create icon map
const crewIcons = {};
crews.forEach(crew => {
  crewIcons[crew.name] = crew.icon;
});

// Get a card definition by its ID
function getCardById(cardId) {
  return cards.find(c => c.id === cardId);
}

// Get all card IDs for all versions of a character
function getAllCardVersions(character) {
  return cards.filter(c => c.character === character).map(c => c.id);
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

// Simulate a pull with optional faculty filter
function simulatePull(pityCount, faculty = null) {
  const { PULL_RATES, PITY_TARGET, PITY_DISTRIBUTION } = require('../config');
  
  // Determine rank
  let rank;
  if (pityCount >= PITY_TARGET) {
    const r = Math.random() * 100;
    let running = 0;
    for (const [rk, pct] of Object.entries(PITY_DISTRIBUTION)) {
      running += pct;
      if (r <= running) {
        rank = rk;
        break;
      }
    }
  } else {
    const r = Math.random() * 100;
    let running = 0;
    for (const [rk, pct] of Object.entries(PULL_RATES)) {
      running += pct;
      if (r <= running) {
        rank = rk;
        break;
      }
    }
  }

  // Filter cards by rank and then apply faculty constraint if given
  // Only include base/u1 versions (mastery === 1) to prevent pulling upgraded versions from packs
  let pool = cards.filter(c => c.pullable && c.mastery === 1 && c.rank === rank);
  if (faculty) {
    // Check if card's current upgrade OR any future upgrade has the target faculty
    const facultyPool = pool.filter(c => {
      if (c.faculty === faculty) return true;
      // Check if any other upgrade of this character has the target faculty
      const allVersionIds = getAllCardVersions(c.character);
      return allVersionIds.some(versionId => {
        const versionCard = getCardById(versionId);
        return versionCard && versionCard.faculty === faculty;
      });
    });
    if (facultyPool.length > 0) {
      pool = facultyPool;
    } else {
      // no cards of the right faculty at this rank; fall back to any rank within the faculty
      const alt = cards.filter(c => {
        if (c.pullable && c.mastery === 1 && c.faculty === faculty) return true;
        // Also check if any upgrade has the faculty
        const allVersionIds = getAllCardVersions(c.character);
        return allVersionIds.some(versionId => {
          const versionCard = getCardById(versionId);
          return versionCard && versionCard.faculty === faculty;
        });
      });
      if (alt.length > 0) {
        pool = alt;
      }
      // if alt empty for some reason, keep the unfiltered rank pool as ultimate fallback
    }
  }

  if (pool.length === 0) {
    // global fallback to any pullable base version to prevent pulling U2+ directly
    pool = cards.filter(c => c.pullable && c.mastery === 1);
  }

  if (pool.length === 0) {
    // fallback hard: if no base cards available somehow, use any pullable card
    pool = cards.filter(c => c.pullable);
  }

  if (pool.length === 0) {
    return null;
  }

  const card = pool[Math.floor(Math.random() * pool.length)];
  return card;
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
  // `crewIcons` stores whatever we want to show in the faculty line – normally
  // that is a custom emoji string such as `<:Strawats:1477827990397259858>`.
  // To get a small image up in the embed author section we need a URL, so if the
  // value looks like a custom emoji we convert it to a CDN URL here and keep the
  // original text for the description later.
  let iconText = crewIcons[cardDef.faculty];
  let iconUrl = iconText;
  if (iconText && iconText.startsWith && iconText.startsWith('<:')) {
    // parse ID from <:name:id>
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
  // discord.js requires an author.name when calling setAuthor, so default to
  // the faculty string if we didn't assign a name earlier.
  if (!author.name) author.name = cardDef.faculty;

  // move most metadata into description so only stats use a dedicated field
  let desc = cardDef.title || '';
  // order: Attribute, Faculty, Source (only shown if owned), Level (only shown if owned)
  desc += `\n**Attribute:** ${cardDef.attribute || 'unknown'}`;
  // always show the bare faculty name in the description – the emoji is used
  // only for the author icon above the embed.
  desc += `\n**Faculty:** ${cardDef.faculty || 'none'}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor(author)
    .setTitle(cardDef.character)
    .setDescription(desc)
    .setImage(cardDef.image_url || null)
    .setFooter({ text: `Mastery ${cardDef.mastery}/${cardDef.mastery_total}`, iconURL: avatarUrl || null });

  // show rank badge (thumbnail) if available; crew icon used only as author (small)
  const rankBadge = rankData[cardDef.rank] && rankData[cardDef.rank].badge;
  // iconUrl derived earlier may point to a CDN URL for custom emojis
  if (rankBadge) embed.setThumbnail(rankBadge);
  else if (iconUrl && iconUrl.startsWith && iconUrl.startsWith('http')) embed.setThumbnail(iconUrl);

  // Determine if user owns the card early so we can use it for conditional display
  const isOwned = !!userEntry;
  const lvl = isOwned ? userEntry.level : 1;

  // Check if user owns a HIGHER version of this card
  let higherVersionOwned = false;
  if (!isOwned && user && user.ownedCards && cardDef.mastery < cardDef.mastery_total) {
    const allVersionIds = getAllCardVersions(cardDef.character);
    const currentIndex = allVersionIds.indexOf(cardDef.id);
    // Check if any higher version is owned
    if (currentIndex >= 0) {
      const higherVersionIds = allVersionIds.slice(currentIndex + 1);
      const ownedIds = user.ownedCards.map(e => e.cardId);
      higherVersionOwned = higherVersionIds.some(id => ownedIds.includes(id));
    }
  }

  // stat boosts from owned Boost cards
  // Only apply boosts if this card is owned OR it's a lower version that doesn't have a higher version owned
  let boostEntries = [];
  let totalBoostPct = 0;
  if ((isOwned || !higherVersionOwned) && user && user.ownedCards) {
    const { cards } = require('../data/cards');
    
    // Helper: Calculate effective boost percentage for a boost card that may itself be boosted
    const getEffectiveBoost = (boostCardId, baseBoostPct) => {
      let effectiveBoost = baseBoostPct;
      // Check if this boost card receives boosts from other boost cards
      user.ownedCards.forEach(entry => {
        const def = cards.find(c => c.id === entry.cardId);
        if (def && def.boost && entry.cardId !== boostCardId) {
          const boostCard = cards.find(c => c.id === boostCardId);
          if (boostCard) {
            // Check if this boost targets the boost card
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
        let appliedBoost = false;
        let boostAmount = 0;
        
        // Check for character name match
        const charRegex = new RegExp(`${cardDef.character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\((\\d+)%\\)`, 'i');
        const charMatch = def.boost.match(charRegex);
        if (charMatch) {
          boostAmount = parseInt(charMatch[1], 10);
          // Apply boost stacking: if this boost card itself is boosted, scale the percentage
          boostAmount = getEffectiveBoost(def.id, boostAmount);
          totalBoostPct += boostAmount;
          boostEntries.push({ source: def.character, pct: boostAmount });
          appliedBoost = true;
        }
        
        // Check for faculty/crew match (e.g., "Strawhat Pirates (5%)")
        if (!appliedBoost && cardDef.faculty) {
          const facultyRegex = new RegExp(`${cardDef.faculty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\((\\d+)%\\)`, 'i');
          const facultyMatch = def.boost.match(facultyRegex);
          if (facultyMatch) {
            boostAmount = parseInt(facultyMatch[1], 10);
            // Apply boost stacking
            boostAmount = getEffectiveBoost(def.id, boostAmount);
            totalBoostPct += boostAmount;
            boostEntries.push({ source: def.character, pct: boostAmount, type: 'faculty' });
          }
        }
      }
    });
  }

  const scaled = computeScaledStats(cardDef, lvl, totalBoostPct);

  // put owned info into description; level and source only shown if owned
  desc += `\n**Owned:** ${isOwned ? 'Yes' : 'No'}`;
  if (isOwned) {
    desc += `\n**Source:** card pulls`;
    desc += `\n**Level:** ${lvl}`;
    // display XP progress if available on the user entry
    if (userEntry && typeof userEntry.xp === 'number') {
      desc += ` (${userEntry.xp} XP)`;
    }
  }
  embed.setDescription(desc);

  // only the stats should be a field heading; boost cards get a custom line
  let statsValue;
  if (cardDef.boost) {
    statsValue =
      `**Health:** ${scaled.health}\n` +
      `**Power:** ${scaled.power}\n` +
      `**Speed:** ${scaled.speed}\n` +
      `**Boost:** ${cardDef.boost || 'N/A'}`;
  } else {
    statsValue =
      `**Health:** ${scaled.health}\n` +
      `**Power:** ${scaled.power}\n` +
      `**Speed:** ${scaled.speed}\n` +
      `**Attack:** ${scaled.attack_min} - ${scaled.attack_max}`;
  }

  embed.addFields(
    { name: 'Stats', value: statsValue, inline: false }
  );

  // Helper function to describe status effects
  const getEffectDescription = (effectType, duration) => {
    const effectDescriptions = {
      'stun': `Stuns the opponent for ${duration} turn${duration > 1 ? 's' : ''}`,
      'freeze': `Freezes the opponent for ${duration} turn${duration > 1 ? 's' : ''}`,
      'cut': `Cuts the opponent for ${duration} turn${duration > 1 ? 's' : ''}`,
      // bleed triggers when the affected card spends energy
      // (attack/special/ability); duration counts the number of uses
      'bleed': `Bleeds the opponent for ${duration} energy use${duration > 1 ? 's' : ''}`,
      'team_stun': `Stuns all opponents for ${duration} turn${duration > 1 ? 's' : ''}`,
      'regen': `Regenerates HP each turn for ${duration} turn${duration > 1 ? 's' : ''}`,
      'confusion': `Gives ${duration} turn${duration > 1 ? 's' : ''} of chance to miss attacks`,
      'attackup': `Boosts attack for ${duration} turn${duration > 1 ? 's' : ''}`,
      'attackdown': `Reduces attack for ${duration} turn${duration > 1 ? 's' : ''}`,
      'defenseup': `Reduces incoming damage for ${duration} turn${duration > 1 ? 's' : ''}`,
      'defensedown': `Increases incoming damage for ${duration} turn${duration > 1 ? 's' : ''}`,
      'truesight': `Grants dodge immunity for ${duration} turn${duration > 1 ? 's' : ''}`,
      'undead': `Keeps the target alive at 0 HP until the effect ends`
    };
    return effectDescriptions[effectType] || null;
  };

  // if the card has a special attack defined, show it as its own field with
  // the scaled values (level/boost already applied above)
  if (cardDef.special_attack && scaled.special_attack) {
      const sa = cardDef.special_attack;
      let specialAttackValue = `${sa.name} (${scaled.special_attack.min}-${scaled.special_attack.max} Atk)`;
      
      // If the special attack applies a status effect, include it
      if (cardDef.effect && cardDef.effectDuration) {
        const effectDesc = getEffectDescription(cardDef.effect, cardDef.effectDuration);
        if (effectDesc) {
          const amountLabel = ['regen', 'attackup', 'attackdown', 'defenseup', 'defensedown'].includes(cardDef.effect)
            ? ` (${cardDef.effectAmount ?? (cardDef.effect === 'regen' ? 10 : 25)}%)`
            : cardDef.effect === 'confusion'
            ? ` (${cardDef.effectChance ?? 30}%)`
            : '';
          specialAttackValue += ` - *${effectDesc}${amountLabel}*`;
        }
      }
      
      embed.addFields({
        name: 'Special Attack',
        value: specialAttackValue,
        inline: false
      });
    }
  // if the card received any percentage boosts from owned Boost cards, display them
  // only show on cards the user owns
  if (isOwned && boostEntries && boostEntries.length) {
    const lines = boostEntries.map(b => `${b.source} - ${b.pct}%`);
    embed.addFields({ name: 'Stat Boosts', value: lines.join('\n'), inline: false });
  }

  return embed;
}

function computeScaledStats(cardDef, level, boostPct = 0) {
  // Use explicit formula: final = ceil(base * (1 + level*0.01)) then apply boosts
  const levelMultiplier = 1 + (level || 0) * 0.01;
  const base = {
    power: Math.ceil(cardDef.power * levelMultiplier),
    health: Math.ceil(cardDef.health * levelMultiplier),
    speed: Math.ceil(cardDef.speed * levelMultiplier),
    attack_min: Math.ceil(cardDef.attack_min * levelMultiplier),
    attack_max: Math.ceil(cardDef.attack_max * levelMultiplier)
  };
  if (boostPct > 0) {
    // apply boosts to all offensive/defensive stats, including attacks
    const boostMultiplier = 1 + boostPct / 100;
    base.power = Math.ceil(base.power * boostMultiplier);
    base.health = Math.ceil(base.health * boostMultiplier);
    base.speed = Math.ceil(base.speed * boostMultiplier);
    base.attack_min = Math.ceil(base.attack_min * boostMultiplier);
    base.attack_max = Math.ceil(base.attack_max * boostMultiplier);
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
  const effectDescriptions = {
    'regen': `Regenerates HP each turn for ${duration} turn${duration > 1 ? 's' : ''}`,
    'confusion': `Gives ${duration} turn${duration > 1 ? 's' : ''} of chance to miss attacks`,
    'attackup': `Boosts attack for ${duration} turn${duration > 1 ? 's' : ''}`,
    'attackdown': `Reduces attack for ${duration} turn${duration > 1 ? 's' : ''}`,
    'defenseup': `Reduces incoming damage for ${duration} turn${duration > 1 ? 's' : ''}`,
    'defensedown': `Increases incoming damage for ${duration} turn${duration > 1 ? 's' : ''}`,
    'truesight': `Grants dodge immunity for ${duration} turn${duration > 1 ? 's' : ''}`,
    'undead': `Keeps the target alive at 0 HP until the effect ends`,
    'stun': `Stuns the opponent for ${duration} turn${duration > 1 ? 's' : ''}`,
    'freeze': `Freezes the opponent for ${duration} turn${duration > 1 ? 's' : ''}`,
    'cut': `Cuts the opponent for ${duration} turn${duration > 1 ? 's' : ''}`,
    // bleed triggers when the affected card spends energy
    // (attack/special/ability); duration counts the number of uses
    'bleed': `Bleeds the opponent for ${duration} energy use${duration > 1 ? 's' : ''}`,
    'team_stun': `Stuns all opponents for ${duration} turn${duration > 1 ? 's' : ''}`
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
  simulatePull
};
