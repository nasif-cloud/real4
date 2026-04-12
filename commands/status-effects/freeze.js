// Freeze
// Prevents the affected card from taking actions for the duration.
// Takes damage each turn while frozen.
// Fields:
//   type: 'freeze'
//   effectDuration: number
//   amount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Freezes the opponent for <duration> turn(s) and deals <amount> damage each turn.`
//   Battle embed: `<card> is frozen and can't move!`
// Emoji: <:Freeze:1479137305749880924>

function applyEffect(target, duration, data = {}) {
  return { type: 'freeze', remaining: duration, stacks: 1, amount: data.amount ?? 1, ...data };
}

function onStartOfTurn(entity, status, logs, handleKO) {
  if (status.remaining !== Infinity) {
    status.remaining = Infinity;
  }
  const amount = status.amount ?? 1;
  entity.currentHP = Math.max(0, (entity.currentHP || 0) - amount);
  logs.push(`${entity.def?.character || entity.rank || 'Entity'} suffers freeze for -${amount} HP!`);
  const ko = handleKO(entity);
  if (ko) logs.push(ko);
  return true;
}

module.exports = {
  type: 'freeze',
  emoji: '<:Freeze:1479137305749880924>',
  applyEffect,
  onStartOfTurn
};
