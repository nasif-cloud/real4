const rods = [
  {
    id: 'basic_rod',
    name: 'Basic Rod',
    emoji: '<:basicrod:1490066589729558568>',
    cost: 0, // free starter
    luckBonus: 0,
    betterRankMultiplier: 1,
    thumbnail: 'https://files.catbox.moe/ck8x40.webp'
  },
  {
    id: 'gold_rod',
    name: 'Gold Rod',
    emoji: '<:goldrod:1490066952671072266>',
    cost: 3000,
    luckBonus: 0.15, // +15%
    betterRankMultiplier: 1.2,
    thumbnail: 'https://files.catbox.moe/4glijm.webp'
  },
  {
    id: 'white_rod',
    name: 'White Rod',
    emoji: '<:whiterod:1490067000838459533>',
    cost: 10000,
    luckBonus: 0.30, // +30%
    betterRankMultiplier: 1.5,
    thumbnail: 'https://files.catbox.moe/d5qvci.webp'
  }
];

module.exports = { rods };
