// Reflect
// Reflects incoming attacks back to the attacker for the duration.
// Fields:
//   type: 'reflect'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Reflects attacks for <duration> turn(s).`
//   Battle embed: `<card> gains reflect!`
// Emoji: <:refelct:1492516882954190898>

const type = 'reflect';
const emoji = '<:1000048292:1497961724018557040>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  addEffectToTarget(target, type, dur);
  return [`${statusTargetName(target)} gains reflect${statusMessage()}!`];
}

module.exports = {
  type,
  emoji,
  applyEffect
};
