// Doomed
// The affected card will die when the effect expires.
// Fields:
//   type: 'doomed'
//   effectDuration: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Will die in <duration> turn(s).`
//   Battle embed: `<card> is doomed and will die in <duration> turns!`
// Emoji: <:doomed:placeholder>

const type = 'doomed';
const emoji = '<:1000048297:1497961709388824798>';

function applyEffect({ target, def, dur, origDur, addEffectToTarget, statusTargetName, statusMessage }) {
  addEffectToTarget(target, type, dur);
  return [`${statusTargetName(target)} is doomed and will die in ${origDur} turn${origDur > 1 ? 's' : ''}${statusMessage().startsWith(' (permanent') ? '' : ''}!`];
}

function onStartOfTurn(entity, status, logs, handleKO) {
  if (status.remaining !== Infinity) {
    status.remaining -= 1;
    if (status.remaining <= 0) {
      entity.currentHP = 0;
      entity.alive = false;
      entity.energy = 0;
      logs.push(`${entity.def?.character || entity.rank || 'Entity'} is doomed and collapses!`);
      return false;
    }
  }
  return true;
}

module.exports = {
  type,
  emoji,
  applyEffect,
  onStartOfTurn
};
