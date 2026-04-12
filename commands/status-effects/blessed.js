// Blessed
// Causes the affected card to gain energy faster for the duration.
// Fields:
//   type: 'blessed'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Gains energy faster for <duration> turn(s).`
//   Battle embed: `<card> is blessed and gains energy faster!`
// Emoji: <:blessed:placeholder>

const type = 'blessed';
const emoji = '<:blessed:placeholder>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  addEffectToTarget(target, type, dur);
  return [`${statusTargetName(target)} is blessed and gains energy faster${statusMessage()}!`];
}

module.exports = {
  type,
  emoji,
  applyEffect
};
