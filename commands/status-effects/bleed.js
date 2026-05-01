// Bleed
// Deals damage when the affected card spends energy while bleeding.
// Fields:
//   type: 'bleed'
//   effectDuration: number
//   effectAmount?: number
//   amount?: number
//   itself?: boolean
//   all?: boolean
// Text layout:
//   Info embed: `Bleeds the opponent for <amount> damage when they spend energy for <duration> use(s).`
//   Battle embed: `<card> takes -<amount> HP from bleed!`
// Emoji: <:1000043584:1479138154572156928>

function applyEffect(target, duration, data = {}) {
  // Bleed applied as "damage when spending energy". The engine will
  // call a shared helper when a card spends energy to apply bleed damage.
  return { type: 'bleed', remaining: duration, stacks: 1, amount: data.amount ?? data.effectAmount ?? 2, ...data };
}

module.exports = {
  type: 'bleed',
  emoji: '<:1000048306:1497961727336386641>',
  applyEffect
};
