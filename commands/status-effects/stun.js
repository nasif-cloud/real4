// Stun
// Prevents the affected card from taking actions for the duration.
// Fields:
//   type: 'stun'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Stuns the opponent for <duration> turn(s)`
//   Battle embed: `<card> is stunned and can't move!`
// Emoji: <:Stun:1479135399573061751>

function applyEffect(target, duration, data = {}) {
  return { type: 'stun', remaining: duration, stacks: 1, ...data };
}

module.exports = {
  type: 'stun',
  emoji: '<:1000048308:1497961729219494099>',
  applyEffect,
};
