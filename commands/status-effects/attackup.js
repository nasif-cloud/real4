// Attack Up
// Boosts attack damage by a percentage for the duration.
// Fields:
//   type: 'attackup'
//   effectDuration: number
//   effectAmount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Boosts attack by <amount>% for <duration> turn(s).`
//   Battle embed: `<card>'s attack is boosted (<amount>%)!`
// Emoji: <:atkup:1485295694053900328>

function applyEffect(target, duration, data = {}) {
  return { type: 'attackup', remaining: duration, stacks: 1, amount: data.effectAmount ?? 12, ...data };
}

module.exports = {
  type: 'attackup',
  emoji: '<:1000048307:1497961719094444217>',
  applyEffect,
};
