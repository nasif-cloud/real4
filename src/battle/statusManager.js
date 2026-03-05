// Centralized status and battle utilities shared by isail and duel
const STATUS_EMOJIS = {
  stun: '🌀',
  freeze: '❄️',
  cut: '🔪',
  bleed: '🩸'
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addStatus(entity, type, duration) {
  if (!entity) return;
  if (!entity.status) entity.status = [];
  entity.status.push({ type, remaining: duration });
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
    entity.currentHP = 0;
    entity.alive = false;
    entity.energy = 0;
    return `${entity.def?.character || entity.rank || 'Entity'} is knocked out!`;
  }
  return null;
}

// Apply start-of-turn status effects (cut) to the provided team array.
// Returns an array of log strings describing what happened.
function applyStartOfTurnEffects(teamArray) {
  const logs = [];
  // Safety checks: ensure teamArray is valid
  if (!teamArray || !Array.isArray(teamArray)) return logs;
  
  teamArray.forEach(e => {
    if (!e || !e.status || (e.currentHP || 0) <= 0) return;
    e.status = e.status.filter(st => {
      if (st.type === 'cut') {
        e.currentHP = Math.max(0, (e.currentHP || 0) - 1);
        logs.push(`${e.def?.character || e.rank || 'Entity'} suffers cut for -1 HP!`);
        const ko = _handleKO(e);
        if (ko) logs.push(ko);
      }
      st.remaining -= 1;
      return st.remaining > 0;
    });
  });
  return logs;
}

// Apply card effect (stun, freeze, cut, bleed, team_stun)
// Mutates target(s) by adding statuses and returns array of log strings.
function applyCardEffect(attacker, target) {
  const logs = [];
  if (!attacker || !attacker.def || !attacker.def.effect) return logs;
  const def = attacker.def;
  // Stun and freeze get +1 duration so they last for the current turn being checked
  let dur = def.effectDuration || 1;
  if (def.effect === 'stun' || def.effect === 'freeze') {
    dur = (def.effectDuration || 1) + 1;
  }
  // Cut and other status effects use duration as-is
  switch (def.effect) {
    case 'stun':
      addStatus(target, 'stun', dur);
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is stunned!`);
      break;
    case 'freeze':
      addStatus(target, 'freeze', dur);
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is frozen!`);
      break;
    case 'cut':
      addStatus(target, 'cut', dur);
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is cut!`);
      break;
    case 'bleed':
      addStatus(target, 'bleed', dur);
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is bleeding!`);
      break;
    case 'team_stun':
      if (Array.isArray(target)) {
        target.forEach(t => addStatus(t, 'stun', dur));
        logs.push(`All opponents are stunned!`);
      }
      break;
  }
  return logs;
}

// Calculate damage using the resolved `card.scaled` stats.
function calculateUserDamage(card, type, user) {
  const scaled = card.scaled || {};
  if (type === 'special') {
    if (card.def.special_attack && scaled.special_attack) {
      const min = scaled.special_attack.min;
      const max = scaled.special_attack.max;
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      const dmg = randomInt(low, high);
      return dmg < low ? low : dmg;
    }
    if (scaled.attack_min != null && scaled.attack_max != null) {
      const low = Math.min(scaled.attack_min, scaled.attack_max);
      const high = Math.max(scaled.attack_min, scaled.attack_max);
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
  applyBleedOnEnergyUse
};
