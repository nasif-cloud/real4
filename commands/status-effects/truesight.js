// Truesight
// Dodges all incoming attacks during the duration.
// Fields:
//   type: 'truesight'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Cannot be attacked for <duration> turn(s).`
//   Battle embed: `<card> gains truesight!`
// Emoji: <:truesight:1485299663879012484>

const type = 'truesight';
const emoji = '<:truesight:1485299663879012484>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  addEffectToTarget(target, type, dur);
  return [`${statusTargetName(target)} gains truesight${statusMessage()}!`];
}

module.exports = {
  type,
  emoji,
  applyEffect
};
