const levelers = [
  // INT
  {
    id: 'purple_hermit_crab',
    name: 'Purple Hermit Crab',
    emoji: '<:inthermitcrab:1490353109111668876>',
    attribute: 'INT',
    rank: 'C',
    xp: 25,
    beli: 100
  },
  {
    id: 'purple_robber_penguin',
    name: 'Purple Robber Penguin',
    emoji: '<:intRoberPenguin:1490354066277269726>',
    attribute: 'INT',
    rank: 'C',
    xp: 20,
    beli: 80
  },
  {
    id: 'purple_lobster',
    name: 'Purple Lobster',
    emoji: '<:intlobster:1490353639968210994>',
    attribute: 'INT',
    rank: 'B',
    xp: 60,
    beli: 180
  },
  {
    id: 'purple_dragon',
    name: 'Purple Dragon',
    emoji: '<:intdragon:1490354354224365748>',
    attribute: 'INT',
    rank: 'A',
    xp: 100,
    beli: 250
  },

  // QCK
  {
    id: 'blue_hermit_crab',
    name: 'Blue Hermit Crab',
    emoji: '<:qckhermitcrab:1490354761923428383>',
    attribute: 'QCK',
    rank: 'C',
    xp: 25,
    beli: 100
  },
  {
    id: 'blue_robber_penguin',
    name: 'Blue Robber Penguin',
    emoji: '<:qckrobberpenguin:1490355003993362604>',
    attribute: 'QCK',
    rank: 'C',
    xp: 20,
    beli: 80
  },
  {
    id: 'blue_lobster',
    name: 'Blue Lobster',
    emoji: '<:qcklobster:1490355188119113728>',
    attribute: 'QCK',
    rank: 'B',
    xp: 60,
    beli: 180
  },
  {
    id: 'blue_dragon',
    name: 'Blue Dragon',
    emoji: '<:qckdragon:1490355331698786595>',
    attribute: 'QCK',
    rank: 'A',
    xp: 100,
    beli: 250
  },

  // DEX
  {
    id: 'green_hermit_crab',
    name: 'Green Hermit Crab',
    emoji: '<:dexhermitcrab:1490355524624056392>',
    attribute: 'DEX',
    rank: 'C',
    xp: 25,
    beli: 100
  },
  {
    id: 'green_robber_penguin',
    name: 'Green Robber Penguin',
    emoji: '<:dexrobberpenguin:1490355704140140595>',
    attribute: 'DEX',
    rank: 'C',
    xp: 20,
    beli: 80
  },
  {
    id: 'green_lobster',
    name: 'Green Lobster',
    emoji: '<:Greenlobster:1490355871526555761>',
    attribute: 'DEX',
    rank: 'B',
    xp: 60,
    beli: 180
  },
  {
    id: 'dex_dragon',
    name: 'Green Dragon',
    emoji: '<:dexdragon:1490356060819816569>',
    attribute: 'DEX',
    rank: 'A',
    xp: 100,
    beli: 250
  },

  // Rainbow
  {
    id: 'rainbow_hermit_crab',
    name: 'Rainbow Hermit Crab',
    emoji: '<:rainbowhermitcrab:1490356387811819520>',
    attribute: 'ALL',
    rank: 'A',
    xp: { INT: 100, QCK: 25, DEX: 25, STR: 25, PSY: 25 },
    beli: 100
  },
  {
    id: 'rainbow_robber_penguin',
    name: 'Rainbow Robber Penguin',
    emoji: '<:rainbowrobberpenguin:1490356754691784754>',
    attribute: 'ALL',
    rank: 'A',
    xp: { INT: 100, QCK: 20, DEX: 20, STR: 20, PSY: 20 },
    beli: 100
  },
  {
    id: 'rainbow_stripped_dragon',
    name: 'Rainbow Stripped Dragon',
    emoji: '<:rainbowstrippeddragon:1490357034925821992>',
    attribute: 'ALL',
    rank: 'SS',
    xp: { INT: 300, QCK: 100, DEX: 100, STR: 100, PSY: 100 },
    beli: 200
  },

  // STR
  {
    id: 'red_hermit_crab',
    name: 'Red Hermit Crab',
    emoji: '<:STRhermitcrab:1490357448777797692>',
    attribute: 'STR',
    rank: 'C',
    xp: 25,
    beli: 100
  },
  {
    id: 'red_robber_penguin',
    name: 'Red Robber Penguin',
    emoji: '<:strrobberpenguin:1490357807999090960>',
    attribute: 'STR',
    rank: 'C',
    xp: 20,
    beli: 80
  },
  {
    id: 'red_lobster',
    name: 'Red Lobster',
    emoji: '<:strlobster:1490358186400813197>',
    attribute: 'STR',
    rank: 'B',
    xp: 25,
    beli: 120
  },
  {
    id: 'red_dragon',
    name: 'Red Dragon',
    emoji: '<:strdragon:1490358483990614299>',
    attribute: 'STR',
    rank: 'A',
    xp: 100,
    beli: 250
  },

  // PSY
  {
    id: 'sea_pony',
    name: 'Sea Pony',
    emoji: '<:seapony:1490359333605609673>',
    attribute: 'PSY',
    rank: 'C',
    xp: 20,
    beli: 80
  },
  {
    id: 'sea_colt',
    name: 'Sea Colt',
    emoji: '<:psyseacolt:1490358807715381298>',
    attribute: 'PSY',
    rank: 'B',
    xp: 50,
    beli: 150
  },
  {
    id: 'sea_horse',
    name: 'Sea Horse',
    emoji: '<:psyseahorse:1490359161014452315>',
    attribute: 'PSY',
    rank: 'A',
    xp: 100,
    beli: 250
  },
  {
    id: 'sea_stallion',
    name: 'Sea Stallion',
    emoji: '<:seastallion:1490359552435290242>',
    attribute: 'PSY',
    rank: 'S',
    xp: 150,
    beli: 350
  }
];

module.exports = { levelers };