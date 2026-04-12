// Confusion
// Causes the affected card to hit itself instead of the intended target.
// Fields:
//   type: 'confusion'
//   effectDuration: number
//   effectChance?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Confuses the opponent with <chance>% chance to hit themselves for <duration> turn(s).`
//   Battle embed: `<card> is confused and hits themselves!`
// Emoji: <:confused:1485292931597209811>

function applyEffect(target, duration, data = {}) {
  return { type: 'confusion', remaining: duration, stacks: 1, chance: data.effectChance ?? data.effectAmount ?? 50, ...data };
}

module.exports = {
  type: 'confusion',
  emoji: '<:confused:1485292931597209811>',
  applyEffect,
};
