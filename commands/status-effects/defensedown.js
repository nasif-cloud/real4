// Defense Down
// Increases incoming attack damage by a percentage for the duration.
// Fields:
//   type: 'defensedown'
//   effectDuration: number
//   effectAmount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Reduces defense by <amount>% for <duration> turn(s).`
//   Battle embed: `<card>'s defense is reduced (<amount>%)!`
// Emoji: <:defensedown:1485297768535949524>

function applyEffect(target, duration, data = {}) {
  return { type: 'defensedown', remaining: duration, stacks: 1, amount: data.effectAmount ?? 12, ...data };
}

module.exports = {
  type: 'defensedown',
  emoji: '<:defensedown:1485297768535949524>',
  applyEffect,
};
