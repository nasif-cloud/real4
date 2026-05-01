// Attack Down
// Reduces attack damage by a percentage for the duration.
// Fields:
//   type: 'attackdown'
//   effectDuration: number
//   effectAmount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Reduces attack by <amount>% for <duration> turn(s).`
//   Battle embed: `<card>'s attack is reduced (<amount>%)!`
// Emoji: <:attackdown:1485296830295314492>

function applyEffect(target, duration, data = {}) {
  return { type: 'attackdown', remaining: duration, stacks: 1, amount: data.effectAmount ?? 12, ...data };
}

module.exports = {
  type: 'attackdown',
  emoji: '<:1000048289:1497961703810400347>',
  applyEffect,
};
