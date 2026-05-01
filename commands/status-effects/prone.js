// Prone
// Makes the affected card take extra damage from effective attribute attacks.
// Fields:
//   type: 'prone'
//   effectDuration: number
//   effectAmount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Makes the target take <amount>% extra damage from effective attributes for <duration> turn(s).`
//   Battle embed: `<card> becomes prone (<amount>% extra from effective attributes)!`
// Emoji: <:prone:1492621344825937970>

const type = 'prone';
const emoji = '<:1000048294:1497961715009327225>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  const amount = def.effectAmount ?? 20;
  addEffectToTarget(target, type, dur, { amount });
  return [`${statusTargetName(target)} becomes prone (${amount}% extra from effective attributes)${statusMessage()}!`];
}

module.exports = {
  type,
  emoji,
  applyEffect
};
