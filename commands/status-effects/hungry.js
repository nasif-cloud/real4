// Hungry
// Deals damage every turn until the effect is removed.
// Fields:
//   type: 'hungry'
//   effectDuration: number
//   effectAmount?: number
//   amount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Takes <amount> damage every turn until rested for <duration> turn(s).`
//   Battle embed: `<card> suffers hunger for -<amount> HP!`
// Emoji: <:hungry:placeholder>

const type = 'hungry';
const emoji = '<:hungry:placeholder>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  const amount = def.effectAmount ?? 1;
  addEffectToTarget(target, type, Infinity, { amount });
  return [`${statusTargetName(target)} is hungry and takes damage each turn${statusMessage()}!`];
}

function onStartOfTurn(entity, status, logs, handleKO) {
  if (status.remaining !== Infinity) {
    status.remaining = Infinity;
  }
  const amount = status.amount ?? 1;
  entity.currentHP = Math.max(0, (entity.currentHP || 0) - amount);
  logs.push(`${entity.def?.character || entity.rank || 'Entity'} suffers hunger for -${amount} HP!`);
  const ko = handleKO(entity);
  if (ko) logs.push(ko);
  return true;
}

module.exports = {
  type,
  emoji,
  applyEffect,
  onStartOfTurn
};
