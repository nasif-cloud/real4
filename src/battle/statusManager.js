// Centralized status and battle utilities shared by isail and duel
const STATUS_EMOJIS = {
  stun: '<:Stun:1479135399573061751>',
  freeze: '<:Freeze:1479137305749880924>',
  cut: '<:Cut:1479136751397109771>',
  bleed: '<:1000043584:1479138154572156928>',
  regen: '<:regen:1485292289827016734>',
  confusion: '<:confused:1485292931597209811>',
  attackup: '<:atkup:1485295694053900328>',
  attackdown: '<:attackdown:1485296830295314492>',
  defenseup: '<:defenseup:1485297398942269510>',
  defensedown: '<:defensedown:1485297768535949524>',
  truesight: '<:truesight:1485299663879012484>',
  undead: '<:undead:1485300491930959882>'
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addStatus(entity, type, duration, data = {}) {
  if (!entity) return;
  if (!entity.status) entity.status = [];
  entity.status.push({ type, remaining: duration, ...data });
}

function hasStatusLock(card) {
  if (!card || !card.status || card.status.length === 0) return false;
  return card.status.some(st => st.type === 'stun' || st.type === 'freeze');
}

function getStatusLockReason(card) {
  if (!card || !card.status || card.status.length === 0) return null;
  const lock = card.status.find(st => st.type === 'stun' || st.type === 'freeze');
  if (lock) return lock.type === 'stun' ? 'stunned' : 'frozen';
  return null;
}

function _handleKO(entity) {
  if (!entity) return null;
  if (entity.currentHP <= 0) {
    const undeadActive = entity.status?.some(st => st.type === 'undead' && st.remaining > 0);
    if (undeadActive) {
      entity.currentHP = 0;
      entity.alive = true;
      entity.energy = 0;
      return `${entity.def?.character || entity.rank || 'Entity'} is undead and remains alive at 0 HP!`;
    }
    entity.currentHP = 0;
    entity.alive = false;
    entity.energy = 0;
    return `${entity.def?.character || entity.rank || 'Entity'} is knocked out!`;
  }
  return null;
}

// Apply start-of-turn status effects (cut, bleed, stun expiration, etc.) to the
// provided team array. Bleed damage and duration are handled here per turn.
// Returns an array of log strings describing what happened.
function applyStartOfTurnEffects(teamArray) {
  const logs = [];
  // Safety checks: ensure teamArray is valid
  if (!teamArray || !Array.isArray(teamArray)) return logs;
  
  teamArray.forEach(e => {
    if (!e || !e.status) return;
    e.status = e.status.filter(st => {
      if (st.type === 'cut') {
        e.currentHP = Math.max(0, (e.currentHP || 0) - 1);
        logs.push(`${e.def?.character || e.rank || 'Entity'} suffers cut for -1 HP!`);
        const ko = _handleKO(e);
        if (ko) logs.push(ko);
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
        }
        return st.remaining > 0 || st.remaining === Infinity;
      }

      if (st.type === 'bleed') {
        e.currentHP = Math.max(0, (e.currentHP || 0) - 2);
        logs.push(`${e.def?.character || e.rank || 'Entity'} suffers bleed for -2 HP!`);
        const ko = _handleKO(e);
        if (ko) logs.push(ko);
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
        }
        return st.remaining > 0 || st.remaining === Infinity;
      }

      if (st.type === 'regen') {
        const amount = st.amount || 0;
        const baseHP = e.maxHP || e.def?.health || 0;
        if (baseHP > 0) {
          const heal = Math.ceil(baseHP * amount / 100);
          e.currentHP = Math.min(baseHP, (e.currentHP || 0) + heal);
          if (e.currentHP > 0) e.alive = true;
          logs.push(`${e.def?.character || e.rank || 'Entity'} regenerates ${heal} HP from regen!`);
        }
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
        }
        return st.remaining > 0 || st.remaining === Infinity;
      }

      if (st.type === 'stun' || st.type === 'freeze') {
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
          if (st.remaining <= 0) {
            const msg = `${e.def?.character || e.rank || 'Entity'} is no longer ${st.type === 'stun' ? 'stunned' : 'frozen'}!`;
            logs.push(msg);
            return false;
          }
        }
        return true;
      }

      if (st.type === 'undead') {
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
          if (st.remaining <= 0) {
            if ((e.currentHP || 0) <= 0) {
              e.alive = false;
              e.energy = 0;
              logs.push(`${e.def?.character || e.rank || 'Entity'} is no longer undead and collapses!`);
            } else {
              logs.push(`${e.def?.character || e.rank || 'Entity'} is no longer undead.`);
            }
            return false;
          }
        }
        return true;
      }

      // all other statuses count down; we keep them and/or let the effect layer in other operations
      if (st.remaining !== Infinity) {
        st.remaining -= 1;
      }
      return st.remaining > 0 || st.remaining === Infinity;
    });
  });
  return logs;
}


// Apply card effect (stun, freeze, cut, bleed, team_stun)
// Mutates target(s) by adding statuses and returns array of log strings.
// Duration 0 = permanent effect; duration > 0 = ticks down each action/turn.
function applyCardEffect(attacker, target) {
  const logs = [];
  if (!attacker || !attacker.def || !attacker.def.effect) return logs;
  const def = attacker.def;
  // Store original duration for message display
  const origDur = def.effectDuration || 1;
  // If duration is 0, effect is permanent (use Infinity internally)
  let dur = origDur === 0 ? Infinity : origDur;

  const selfEffects = ['truesight', 'undead'];
  const applyTo = def.effect === 'team_stun' ? target : (def.itself || selfEffects.includes(def.effect) ? attacker : target);

  // locking statuses tick down twice per round (once after each action), so
  // we multiply by two to ensure the intended number of victim turns are
  // blocked.  This pattern applies to stun, freeze, team_stun and truesight.
  if (dur !== Infinity && (def.effect === 'stun' || def.effect === 'freeze' || def.effect === 'team_stun' || def.effect === 'truesight')) {
    dur = dur * 2;
  }

  const statusMessage = () => {
    if (origDur === 0) return ` (permanent)`;
    return ` for ${origDur} turn${origDur > 1 ? 's' : ''}`;
  };

  const statusTargetName = (entity) => entity?.def?.character || entity?.rank || 'Enemy';

  switch (def.effect) {
    case 'stun':
      addStatus(applyTo, 'stun', dur);
      logs.push(`${statusTargetName(applyTo)} is stunned and can't move${statusMessage()}!`);
      break;
    case 'freeze':
      addStatus(applyTo, 'freeze', dur);
      logs.push(`${statusTargetName(applyTo)} is frozen and can't move${statusMessage()}!`);
      break;
    case 'cut':
      addStatus(applyTo, 'cut', dur);
      logs.push(`${statusTargetName(applyTo)} is cut${statusMessage()}!`);
      break;
    case 'bleed':
      addStatus(applyTo, 'bleed', dur);
      logs.push(`${statusTargetName(applyTo)} is bleeding${origDur === 0 ? ' (permanent)' : ` for ${origDur} use${origDur > 1 ? 's' : ''}`}!`);
      break;
    case 'team_stun':
      if (Array.isArray(target)) {
        target.forEach(t => addStatus(t, 'stun', dur));
        logs.push(`All opponents are stunned${statusMessage()}!`);
      }
      break;
    case 'regen':
      addStatus(applyTo, 'regen', dur, { amount: def.effectAmount || 10 });
      logs.push(`${statusTargetName(applyTo)} gains regen (${def.effectAmount || 10}%)${statusMessage()}!`);
      break;
    case 'confusion':
      addStatus(applyTo, 'confusion', dur, { chance: def.effectChance || 30 });
      logs.push(`${statusTargetName(applyTo)} is confused (${def.effectChance || 30}% miss chance)${statusMessage()}!`);
      break;
    case 'attackup': {
      const amount = def.effectAmount ?? 25;
      addStatus(applyTo, 'attackup', dur, { amount });
      logs.push(`${statusTargetName(applyTo)}'s attack is boosted (${amount}%)${statusMessage()}!`);
      break;
    }
    case 'attackdown': {
      const amount = def.effectAmount ?? 25;
      addStatus(applyTo, 'attackdown', dur, { amount });
      logs.push(`${statusTargetName(applyTo)}'s attack is reduced (${amount}%)${statusMessage()}!`);
      break;
    }
    case 'defenseup': {
      const amount = def.effectAmount ?? 25;
      addStatus(applyTo, 'defenseup', dur, { amount });
      logs.push(`${statusTargetName(applyTo)}'s defense is boosted (${amount}%)${statusMessage()}!`);
      break;
    }
    case 'defensedown': {
      const amount = def.effectAmount ?? 25;
      addStatus(applyTo, 'defensedown', dur, { amount });
      logs.push(`${statusTargetName(applyTo)}'s defense is reduced (${amount}%)${statusMessage()}!`);
      break;
    }
    case 'truesight':
      addStatus(applyTo, 'truesight', dur);
      logs.push(`${statusTargetName(applyTo)} gains truesight${statusMessage()}!`);
      break;
    case 'undead':
      addStatus(applyTo, 'undead', dur);
      logs.push(`${statusTargetName(applyTo)} becomes undead${statusMessage()}!`);
      break;
  }
  return logs;
}

function getAttackModifier(entity) {
  if (!entity || !entity.status) return 1;
  const up = entity.status
    .filter(st => st.type === 'attackup')
    .reduce((sum, st) => sum + (st.amount || 0), 0);
  const down = entity.status
    .filter(st => st.type === 'attackdown')
    .reduce((sum, st) => sum + (st.amount || 0), 0);
  return Math.max(0, 1 + (up - down) / 100);
}

function getDefenseModifier(entity) {
  if (!entity || !entity.status) return 0;
  const up = entity.status
    .filter(st => st.type === 'defenseup')
    .reduce((sum, st) => sum + (st.amount || 0), 0);
  const down = entity.status
    .filter(st => st.type === 'defensedown')
    .reduce((sum, st) => sum + (st.amount || 0), 0);
  return Math.max(-0.9, (down - up) / 100); // -0.9 == 90% damage reduction cap
}

function getConfusionChance(entity) {
  if (!entity || !entity.status) return 0;
  const confusion = entity.status.find(st => st.type === 'confusion');
  return confusion ? (confusion.chance || 0) : 0;
}

function hasTruesight(entity) {
  if (!entity || !entity.status) return false;
  return entity.status.some(st => st.type === 'truesight' && st.remaining > 0);
}

function consumeTruesight(entity) {
  if (!entity || !entity.status) return false;
  const idx = entity.status.findIndex(st => st.type === 'truesight' && st.remaining > 0);
  if (idx < 0) return false;
  const status = entity.status[idx];
  if (status.remaining !== Infinity) {
    status.remaining = Math.max(0, status.remaining - 1);
    if (status.remaining === 0) {
      entity.status.splice(idx, 1);
    }
  }
  return true;
}

function calculateUserDamage(card, type) {
  if (!card || !card.scaled) return 0;
  const scaled = card.scaled || {};
  
  if (type === 'special') {
    if (card.def.special_attack && scaled.special_attack) {
      const min = scaled.special_attack.min;
      const max = scaled.special_attack.max;
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      return randomInt(low, high);
    }
    return 0;
  }
  
  if (scaled.attack_min != null && scaled.attack_max != null) {
    const low = Math.min(scaled.attack_min, scaled.attack_max);
    const high = Math.max(scaled.attack_min, scaled.attack_max);
    return randomInt(low, high);
  }
  return 0;
}

// Bleed: damage per energy spent. Returns logs and applies KO handling.
function applyBleedOnEnergyUse(entity, energySpent) {
  const logs = [];
  if (!entity || !entity.status || energySpent <= 0) return logs;
  const bleed = entity.status.find(s => s.type === 'bleed');
  if (!bleed) return logs;
  const total = 2 * energySpent;
  entity.currentHP = Math.max(0, (entity.currentHP || 0) - total);
  logs.push(`${entity.def?.character || entity.rank || 'Entity'} takes -${total} HP from bleed!`);
  // only decrement if NOT permanent (finite remaining)
  if (bleed.remaining !== Infinity) {
    bleed.remaining = Math.max(0, bleed.remaining - 1);
    if (bleed.remaining <= 0) {
      entity.status = entity.status.filter(s => s.type !== 'bleed');
      logs.push(`${entity.def?.character || entity.rank || 'Entity'} is no longer bleeding!`);
    }
  }
  const ko = _handleKO(entity);
  if (ko) logs.push(ko);
  return logs;
}

module.exports = {
  STATUS_EMOJIS,
  addStatus,
  hasStatusLock,
  getStatusLockReason,
  applyStartOfTurnEffects,
  applyCardEffect,
  calculateUserDamage,
  getAttackModifier,
  getDefenseModifier,
  getConfusionChance,
  hasTruesight,
  consumeTruesight,
  handleKO: _handleKO
};
