// Undead
// Keeps the card alive at 1 HP until the effect expires.
// Fields:
//   type: 'undead'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Keeps the target alive at 1 HP until the effect ends.`
//   Battle embed: `<card> becomes undead and returns at 1 HP!`
// Emoji: <:undead:1485300491930959882>

const type = 'undead';
const emoji = '<:undead:1485300491930959882>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  addEffectToTarget(target, type, dur);
  if (!Array.isArray(target)) {
    target.currentHP = 1;
    target.alive = true;
  } else {
    target.forEach(entity => {
      entity.currentHP = 1;
      entity.alive = true;
    });
  }
  return [`${statusTargetName(target)} becomes undead${statusMessage()}!`];
}

function onStartOfTurn(entity, status, logs, handleKO) {
  if (status.remaining !== Infinity) {
    status.remaining -= 1;
    if (status.remaining <= 0) {
      if ((entity.currentHP || 0) <= 0) {
        entity.alive = false;
        entity.energy = 0;
        logs.push(`${entity.def?.character || entity.rank || 'Entity'} is no longer undead and collapses!`);
      } else {
        logs.push(`${entity.def?.character || entity.rank || 'Entity'} is no longer undead.`);
      }
      return false;
    }
  }
  return true;
}

module.exports = {
  type,
  emoji,
  applyEffect,
  onStartOfTurn
};
