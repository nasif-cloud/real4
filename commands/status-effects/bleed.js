// Bleed
// Deals damage when the affected card spends energy while bleeding.
// Fields:
//   type: 'bleed'
//   effectDuration: number
//   effectAmount?: number
//   amount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Bleeds the opponent for <amount> damage when they spend energy for <duration> use(s).`
//   Battle embed: `<card> takes -<amount> HP from bleed!`
// Emoji: <:1000043584:1479138154572156928>

function applyEffect(target, duration, data = {}) {
  return { type: 'bleed', remaining: duration, stacks: 1, amount: data.amount ?? data.effectAmount ?? 2, ...data };
}

function onStartOfTurn(entity, status, logs, handleKO) {
  const amount = status.amount ?? 2;
  entity.currentHP = Math.max(0, (entity.currentHP || 0) - amount);
  logs.push(`${entity.def?.character || entity.rank || 'Entity'} suffers bleed for -${amount} HP!`);
  const ko = handleKO(entity);
  if (ko) logs.push(ko);
  if (status.remaining !== Infinity) {
    status.remaining -= 1;
  }
  return status.remaining > 0 || status.remaining === Infinity;
}

module.exports = {
  type: 'bleed',
  emoji: '<:1000043584:1479138154572156928>',
  applyEffect,
  onStartOfTurn
};
