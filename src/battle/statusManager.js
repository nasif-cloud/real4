// Centralized status and battle utilities shared by isail and duel
const STATUS_EMOJIS = {
  stun: '<:Stun:1479135399573061751>',
  freeze: '<:Freeze:1479137305749880924>',
  cut: '<:Cut:1479136751397109771>',
  bleed: '<:1000043584:1479138154572156928>'
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

// Apply start-of-turn status effects (cut, bleed, stun expiration, etc.) to the
// provided team array. Bleed damage and duration are handled here per turn.
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
        // only decrement if NOT permanent
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
        }
        return st.remaining > 0 || st.remaining === Infinity;
      }
      if (st.type === 'bleed') {
        // Apply bleed damage per turn
        e.currentHP = Math.max(0, (e.currentHP || 0) - 2);
        logs.push(`${e.def?.character || e.rank || 'Entity'} suffers bleed for -2 HP!`);
        const ko = _handleKO(e);
        if (ko) logs.push(ko);
        // only decrement if NOT permanent
        if (st.remaining !== Infinity) {
          st.remaining -= 1;
        }
        return st.remaining > 0 || st.remaining === Infinity;
      }
      // log expiration of stun/freeze when they wear off
      if (st.type === 'stun' || st.type === 'freeze') {
        // only decrement if NOT permanent
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
      // other statuses just decrement once per turn
      st.remaining -= 1;
      return st.remaining > 0;
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
  // locking statuses tick down twice per round (once after each action), so
  // we multiply by two to ensure the intended number of victim turns are
  // blocked.  This pattern applies to stun, freeze and team-wide stuns.
  if (dur !== Infinity && (def.effect === 'stun' || def.effect === 'freeze' || def.effect === 'team_stun')) {
    dur = dur * 2;
  }
  // Cut and other status effects: apply the multiplied duration or Infinity
  switch (def.effect) {
    case 'stun':
      addStatus(target, 'stun', dur);
      const stunMsg = origDur === 0 ? ` (permanent)` : ` for ${origDur} turn${origDur > 1 ? 's' : ''}`;
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is stunned and can't move${stunMsg}!`);
      break;
    case 'freeze':
      addStatus(target, 'freeze', dur);
      const freezeMsg = origDur === 0 ? ` (permanent)` : ` for ${origDur} turn${origDur > 1 ? 's' : ''}`;
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is frozen and can't move${freezeMsg}!`);
      break;
    case 'cut':
      addStatus(target, 'cut', dur);
      const cutMsg = origDur === 0 ? ` (permanent)` : ` for ${origDur} turn${origDur > 1 ? 's' : ''}`;
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is cut${cutMsg}!`);
      break;
    case 'bleed':
      addStatus(target, 'bleed', dur);
      const bleedMsg = origDur === 0 ? ` (permanent)` : ` for ${origDur} use${origDur > 1 ? 's' : ''}`;
      logs.push(`${target.def?.character || target.rank || 'Enemy'} is bleeding${bleedMsg}!`);
      break;
    case 'team_stun':
      if (Array.isArray(target)) {
        target.forEach(t => addStatus(t, 'stun', dur));
        const teamMsg = origDur === 0 ? ` (permanent)` : ` for ${origDur} turn${origDur > 1 ? 's' : ''}`;
        logs.push(`All opponents are stunned${teamMsg}!`);
      }
      break;
  }
  return logs;
}

// Calculate damage using the resolved `card.scaled` stats.
function calculateUserDamage(card, type) {
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
  calculateUserDamage
};
