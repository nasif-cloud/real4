// Charmed
// Prevents the affected card from attacking same-attribute targets for the duration.
// Fields:
//   type: 'charmed'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Cannot attack same-attribute targets for <duration> turn(s).`
//   Battle embed: `<card> is charmed and cannot attack same-attribute targets!`
// Emoji: <:charmed:placeholder>

const type = 'charmed';
const emoji = '<:1000048296:1497961707832610938>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  addEffectToTarget(target, type, dur);
  return [`${statusTargetName(target)} is charmed and cannot attack same-attribute targets${statusMessage()}!`];
}

module.exports = {
  type,
  emoji,
  applyEffect
};
