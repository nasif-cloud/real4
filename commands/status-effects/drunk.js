// Drunk
// Causes the affected card to hit the wrong target at random for the duration.
// Fields:
//   type: 'drunk'
//   effectDuration: number
//   effectChance?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `<amount>% chance to hit a wrong target for <duration> turn(s).`
//   Battle embed: `<card> is drunk and hits the wrong target!`
// Emoji: <:drunk:placeholder>

const type = 'drunk';
const emoji = '<:drunk:placeholder>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  const chance = def.effectChance ?? def.effectAmount ?? 20;
  addEffectToTarget(target, type, dur, { chance });
  return [`${statusTargetName(target)} is drunk (${chance}% chance to hit the wrong target)${statusMessage()}!`];
}

module.exports = {
  type,
  emoji,
  applyEffect
};
