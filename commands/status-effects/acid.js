// Acid
// Deals damage each turn; damage increases by the same amount each turn.
// Fields:
//   type: 'acid'
//   effectDuration: number
//   effectAmount?: number
//   amount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Takes <amount> acid damage each turn; damage increases each turn for <duration> turn(s).`
//   Battle embed: `<card> suffers acid for -<amount> HP!`
// Emoji: <:acid:1492617822851829770>

const type = 'acid';
const emoji = '<:1000048293:1497961712958177400>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  const amount = def.effectAmount ?? 1;
  addEffectToTarget(target, type, dur, { amount });
  return [`${statusTargetName(target)} is coated in acid${statusMessage()}!`];
}

function onStartOfTurn(entity, status, logs, handleKO) {
  const amount = status.amount ?? 1;
  entity.currentHP = Math.max(0, (entity.currentHP || 0) - amount);
  logs.push(`${entity.def?.character || entity.rank || 'Entity'} suffers acid for -${amount} HP!`);
  const ko = handleKO(entity);
  if (ko) logs.push(ko);
  if (status.remaining !== Infinity) {
    status.remaining -= 1;
  }
  status.amount = amount + 1;
  return status.remaining > 0 || status.remaining === Infinity;
}

module.exports = {
  type,
  emoji,
  applyEffect,
  onStartOfTurn
};
