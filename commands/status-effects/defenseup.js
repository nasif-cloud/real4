// Defense Up
// Reduces incoming attack damage by a percentage for the duration.
// Fields:
//   type: 'defenseup'
//   effectDuration: number
//   effectAmount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Boosts defense by <amount>% for <duration> turn(s).`
//   Battle embed: `<card>'s defense is boosted (<amount>%)!`
// Emoji: <:defenseup:1485297398942269510>

function applyEffect(target, duration, data = {}) {
  return { type: 'defenseup', remaining: duration, stacks: 1, amount: data.effectAmount ?? 12, ...data };
}

module.exports = {
  type: 'defenseup',
  emoji: '<:defenseup:1485297398942269510>',
  applyEffect,
};
