// Regen
// Restores a percentage of max HP at the start of each turn.
// Fields:
//   type: 'regen'
//   effectDuration: number
//   effectAmount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Regenerates <amount>% HP each turn for <duration> turn(s).`
//   Battle embed: `<card> regenerates <heal> HP from regen!`
// Emoji: <:regen:1485292289827016734>

function applyEffect(target, duration, data = {}) {
  return { type: 'regen', remaining: duration, stacks: 1, amount: data.effectAmount ?? 10, ...data };
}

function onStartOfTurn(entity, status, logs) {
  const amount = status.amount ?? 0;
  const baseHP = entity.maxHP || entity.def?.health || 0;
  if (baseHP > 0) {
    const heal = Math.ceil(baseHP * amount / 100);
    entity.currentHP = Math.min(baseHP, (entity.currentHP || 0) + heal);
    if (entity.currentHP > 0) entity.alive = true;
    logs.push(`${entity.def?.character || entity.rank || 'Entity'} regenerates ${heal} HP from regen!`);
  }
  if (status.remaining !== Infinity) {
    status.remaining -= 1;
  }
  return status.remaining > 0 || status.remaining === Infinity;
}

module.exports = {
  type: 'regen',
  emoji: '<:1000048286:1497963088992010362>',
  applyEffect,
  onStartOfTurn
};
