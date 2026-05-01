// Cut
// Deals a fixed amount of damage at the start of each turn.
// Fields:
//   type: 'cut'
//   effectDuration: number
//   amount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Cuts the opponent for <amount> damage each turn for <duration> turn(s).`
//   Battle embed: `<card> suffers cut for -<amount> HP!`
// Emoji: <:Cut:1479136751397109771>

function applyEffect(target, duration, data = {}) {
  return { type: 'cut', remaining: duration, stacks: 1, amount: data.amount ?? data.effectAmount ?? 1, ...data };
}

function onStartOfTurn(entity, status, logs, handleKO) {
  const amount = status.amount ?? 1;
  entity.currentHP = Math.max(0, (entity.currentHP || 0) - amount);
  logs.push(`${entity.def?.character || entity.rank || 'Entity'} suffers cut for -${amount} HP!`);
  const ko = handleKO(entity);
  if (ko) logs.push(ko);
  if (status.remaining !== Infinity) {
    status.remaining -= 1;
  }
  return status.remaining > 0 || status.remaining === Infinity;
}

module.exports = {
  type: 'cut',
  emoji: '<:1000048305:1497961725788426301>',
  applyEffect,
  onStartOfTurn
};
