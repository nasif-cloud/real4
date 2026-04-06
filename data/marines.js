// simple marine rank dataset used for the Infinite Sail encounter
// ranks run from lowly choreboy up to captain. additional stats can be
// added later when more granularity is needed.

const marines = [
  { 
    rank: 'Choreboy', 
    hp: 1, 
    atk: 1, 
    speed: 1, 
    attribute: 'INT',
    pool: [
      { emoji: '<:INTcabinboy:1490381950958043206>', attribute: 'INT' },
      { emoji: '<:QCKcabinboy:1490382202603704360>', attribute: 'QCK' },
      { emoji: '<:DEXcabinboy:1490382492346220795>', attribute: 'DEX' },
      { emoji: '<:PSYcabinboy:1490382699934777506>', attribute: 'PSY' },
      { emoji: '<:STRcabinboy:1490382907657818132>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Seaman Recruit', 
    hp: 2, 
    atk: 1, 
    speed: 1, 
    attribute: 'STR',
    pool: [
      { emoji: '<:STRseasmanrecruit:1490383182745309405>', attribute: 'STR' },
      { emoji: '<:DEXseasmanrecruit:1490384443439841281>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Seaman Apprentice', 
    hp: 5, 
    atk: 2, 
    speed: 2, 
    attribute: 'DEX',
    pool: [
      { emoji: '<:DEXseasmanapprentice:1490385316765241526>', attribute: 'DEX' },
      { emoji: '<:INTseasmanapprentice:1490385511397724391>', attribute: 'INT' },
      { emoji: '<:STRseasmanapprentice:1490385663621730525>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Seaman First Class', 
    hp: 7, 
    atk: 2, 
    speed: 2, 
    attribute: 'DEX',
    pool: [
      { emoji: '<:DEXseasmanapprentice:1490385316765241526>', attribute: 'DEX' },
      { emoji: '<:INTseasmanapprentice:1490385511397724391>', attribute: 'INT' },
      { emoji: '<:STRseasmanapprentice:1490385663621730525>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Petty Officer', 
    hp: 10, 
    atk: 3, 
    speed: 3, 
    attribute: 'STR',
    pool: [
      { emoji: '<:STRpettyofficer:1490386643637633104>', attribute: 'STR' },
      { emoji: '<:DEXpettyofficer:1490386795479961762>', attribute: 'DEX' },
      { emoji: '<:PSYpettyofficer:1490387070387097860>', attribute: 'PSY' }
    ]
  },
  { 
    rank: 'Chief Petty Officer', 
    hp: 15, 
    atk: 3, 
    speed: 3, 
    attribute: 'STR',
    pool: [
      { emoji: '<:STRchiefpettyofficer:1490387685838159882>', attribute: 'STR' },
      { emoji: '<:INTchiefpettyofficer:1490387722446045268>', attribute: 'INT' }
    ]
  },
  { 
    rank: 'Master Chief Petty Officer', 
    hp: 20, 
    atk: 3, 
    speed: 3, 
    attribute: 'QCK',
    pool: [
      { emoji: '<:QCKmasterchiefpettyofficer:1490388129222365414>', attribute: 'QCK' },
      { emoji: '<:PSYmasterchiefpettyofficer:1490388321518747869>', attribute: 'PSY' }
    ]
  },
  { 
    rank: 'Warrant Officer', 
    hp: 25, 
    atk: 4, 
    speed: 4, 
    attribute: 'PSY',
    pool: [
      { emoji: '<:PSYwarrantofficer:1490389260040278077>', attribute: 'PSY' },
      { emoji: '<:STRwarrantofficer:1490389232571777054>', attribute: 'STR' },
      { emoji: '<:INTwarrantofficer:1490389211545600062>', attribute: 'INT' }
    ]
  },
  { 
    rank: 'Ensign', 
    hp: 30, 
    atk: 4, 
    speed: 4, 
    attribute: 'QCK',
    pool: [
      { emoji: '<:QCKenseign:1490389522968613035>', attribute: 'QCK' },
      { emoji: '<:INTensign:1490389758285975753>', attribute: 'INT' },
      { emoji: '<:STRensign:1490389776673542184>', attribute: 'STR' },
      { emoji: '<:PSYensign:1490389809594892492>', attribute: 'PSY' },
      { emoji: '<:DEXensign:1490389857627803678>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Lieutenant Junior Grade', 
    hp: 35, 
    atk: 4, 
    speed: 5, 
    attribute: 'QCK',
    pool: [
      { emoji: '<:QCKenseign:1490389522968613035>', attribute: 'QCK' },
      { emoji: '<:INTensign:1490389758285975753>', attribute: 'INT' },
      { emoji: '<:STRensign:1490389776673542184>', attribute: 'STR' },
      { emoji: '<:PSYensign:1490389809594892492>', attribute: 'PSY' },
      { emoji: '<:DEXensign:1490389857627803678>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Lieutenant', 
    hp: 40, 
    atk: 4, 
    speed: 5, 
    attribute: 'QCK',
    pool: [
      { emoji: '<:QCKenseign:1490389522968613035>', attribute: 'QCK' },
      { emoji: '<:INTensign:1490389758285975753>', attribute: 'INT' },
      { emoji: '<:STRensign:1490389776673542184>', attribute: 'STR' },
      { emoji: '<:PSYensign:1490389809594892492>', attribute: 'PSY' },
      { emoji: '<:DEXensign:1490389857627803678>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Lieutenant Commander', 
    hp: 45, 
    atk: 4, 
    speed: 6, 
    attribute: 'INT',
    pool: [
      { emoji: '<:INTlieutenant:1490390781540962537>', attribute: 'INT' },
      { emoji: '<:PSYlieutenantcommander:1490390996519747654>', attribute: 'PSY' },
      { emoji: '<:strlieutenantcommander:1490391335855722667>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Captain', 
    hp: 50, 
    atk: 5, 
    speed: 6, 
    attribute: 'PSY',
    pool: [
      { emoji: '<:psycaptain:1490392429495586907>', attribute: 'PSY' },
      { emoji: '<:INTcaptain:1490392199693733899>', attribute: 'INT' },
      { emoji: '<:INTcaptain2:1490392724669599914>', attribute: 'INT' },
      { emoji: '<:QCKcaptain:1490392956639907941>', attribute: 'QCK' },
      { emoji: '<:Dexcaptain:1490393253487579300>', attribute: 'DEX' }
    ]
  }
];

module.exports = marines;
