// simple marine rank dataset used for the Infinite Sail encounter
// ranks run from lowly choreboy up to captain. additional stats can be
// added later when more granularity is needed.

const MARINE_STAGE_HP_MULTIPLIER = 4; // HP bonus per stage level

const marines = [
  { 
    rank: 'Choreboy', // appears from isail 1
    minHP: 1, maxHP: 4, 
    atk: 1, 
    speed: 1, 
    attribute: 'INT',
    stagerange: [1, 3],
    pool: [
      { emoji: '<:INTcabinboy:1490381950958043206>', attribute: 'INT' },
      { emoji: '<:QCKcabinboy:1490382202603704360>', attribute: 'QCK' },
      { emoji: '<:DEXcabinboy:1490382492346220795>', attribute: 'DEX' },
      { emoji: '<:PSYcabinboy:1490382699934777506>', attribute: 'PSY' },
      { emoji: '<:STRcabinboy:1490382907657818132>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Seaman Recruit', // appears from isail 1
    minHP: 2, maxHP: 6, 
    atk: 1, 
    speed: 1, 
    attribute: 'STR',
    stagerange: [1, 3],
    pool: [
      { emoji: '<:STRseasmanrecruit:1490383182745309405>', attribute: 'STR' },
      { emoji: '<:DEXseasmanrecruit:1490384443439841281>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Seaman Apprentice', // appears from isail 2
    minHP: 5, maxHP: 9, 
    atk: 2, 
    speed: 2, 
    attribute: 'DEX',
    stagerange: [2, 5],
    pool: [
      { emoji: '<:DEXseasmanapprentice:1490385316765241526>', attribute: 'DEX' },
      { emoji: '<:INTseasmanapprentice:1490385511397724391>', attribute: 'INT' },
      { emoji: '<:STRseasmanapprentice:1490385663621730525>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Seaman First Class', // appears from isail 4
    minHP: 7, maxHP: 12, 
    atk: 3, 
    speed: 2, 
    attribute: 'DEX',
    stagerange: [4, 7],
    pool: [
      { emoji: '<:DEXseasmanapprentice:1490385316765241526>', attribute: 'DEX' },
      { emoji: '<:INTseasmanapprentice:1490385511397724391>', attribute: 'INT' },
      { emoji: '<:STRseasmanapprentice:1490385663621730525>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Petty Officer', // appears from isail 6
    minHP: 10, maxHP: 16, 
    atk: 3, 
    speed: 3, 
    attribute: 'STR',
    stagerange: [6, 9],
    pool: [
      { emoji: '<:STRpettyofficer:1490386643637633104>', attribute: 'STR' },
      { emoji: '<:DEXpettyofficer:1490386795479961762>', attribute: 'DEX' },
      { emoji: '<:PSYpettyofficer:1490387070387097860>', attribute: 'PSY' }
    ]
  },
  { 
    rank: 'Chief Petty Officer', // appears from isail 8
    minHP: 15, maxHP: 22, 
    atk: 4, 
    speed: 3, 
    attribute: 'STR',
    stagerange: [8, 11],
    pool: [
      { emoji: '<:STRchiefpettyofficer:1490387685838159882>', attribute: 'STR' },
      { emoji: '<:INTchiefpettyofficer:1490387722446045268>', attribute: 'INT' }
    ]
  },
  { 
    rank: 'Master Chief Petty Officer', // appears from isail 10
    minHP: 20, maxHP: 28, 
    atk: 4, 
    speed: 3, 
    attribute: 'QCK',
    stagerange: [10, 13],
    pool: [
      { emoji: '<:QCKmasterchiefpettyofficer:1490388129222365414>', attribute: 'QCK' },
      { emoji: '<:PSYmasterchiefpettyofficer:1490388321518747869>', attribute: 'PSY' }
    ]
  },
  { 
    rank: 'Warrant Officer', // appears from isail 12
    minHP: 25, maxHP: 35, 
    atk: 5, 
    speed: 4, 
    attribute: 'PSY',
    stagerange: [12, 15],
    pool: [
      { emoji: '<:PSYwarrantofficer:1490389260040278077>', attribute: 'PSY' },
      { emoji: '<:STRwarrantofficer:1490389232571777054>', attribute: 'STR' },
      { emoji: '<:INTwarrantofficer:1490389211545600062>', attribute: 'INT' }
    ]
  },
  { 
    rank: 'Ensign', // appears from isail 14
    minHP: 30, maxHP: 42, 
    atk: 6, 
    speed: 4, 
    attribute: 'QCK',
    stagerange: [14, 17],
    pool: [
      { emoji: '<:QCKenseign:1490389522968613035>', attribute: 'QCK' },
      { emoji: '<:INTensign:1490389758285975753>', attribute: 'INT' },
      { emoji: '<:STRensign:1490389776673542184>', attribute: 'STR' },
      { emoji: '<:PSYensign:1490389809594892492>', attribute: 'PSY' },
      { emoji: '<:DEXensign:1490389857627803678>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Lieutenant Junior Grade', // appears from isail 16
    minHP: 35, maxHP: 50, 
    atk: 7, 
    speed: 5, 
    attribute: 'QCK',
    stagerange: [16, 19],
    pool: [
      { emoji: '<:QCKenseign:1490389522968613035>', attribute: 'QCK' },
      { emoji: '<:INTensign:1490389758285975753>', attribute: 'INT' },
      { emoji: '<:STRensign:1490389776673542184>', attribute: 'STR' },
      { emoji: '<:PSYensign:1490389809594892492>', attribute: 'PSY' },
      { emoji: '<:DEXensign:1490389857627803678>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Lieutenant', // appears from isail 18
    minHP: 40, maxHP: 55, 
    atk: 8, 
    speed: 5, 
    attribute: 'QCK',
    stagerange: [18, 21],
    pool: [
      { emoji: '<:QCKenseign:1490389522968613035>', attribute: 'QCK' },
      { emoji: '<:INTensign:1490389758285975753>', attribute: 'INT' },
      { emoji: '<:STRensign:1490389776673542184>', attribute: 'STR' },
      { emoji: '<:PSYensign:1490389809594892492>', attribute: 'PSY' },
      { emoji: '<:DEXensign:1490389857627803678>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Lieutenant Commander', // appears from isail 20
    minHP: 45, maxHP: 62, 
    atk: 10, 
    speed: 6, 
    attribute: 'INT',
    stagerange: [20, 25],
    pool: [
      { emoji: '<:INTlieutenant:1490390781540962537>', attribute: 'INT' },
      { emoji: '<:PSYlieutenantcommander:1490390996519747654>', attribute: 'PSY' },
      { emoji: '<:strlieutenantcommander:1490391335855722667>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Captain', // appears from isail 22
    minHP: 50, maxHP: 70, 
    atk: 12, 
    speed: 6, 
    attribute: 'PSY',
    stagerange: [22, 27],
    pool: [
      { emoji: '<:psycaptain:1490392429495586907>', attribute: 'PSY' },
      { emoji: '<:INTcaptain:1490392199693733899>', attribute: 'INT' },
      { emoji: '<:INTcaptain2:1490392724669599914>', attribute: 'INT' },
      { emoji: '<:QCKcaptain:1490392956639907941>', attribute: 'QCK' },
      { emoji: '<:Dexcaptain:1490393253487579300>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Commodore', // appears from isail 24
    minHP: 55, maxHP: 77, 
    atk: 13, 
    speed: 6, 
    attribute: 'PSY',
    stagerange: [24, 33],
    pool: [
      { emoji: '<:INTcommodore:1491525969243279411>', attribute: 'INT' },
      { emoji: '<:DEXcommodore:1491526702478921761>', attribute: 'DEX' }
    ]
  },
  { 
    rank: 'Rear admiral', // appears from isail 26
    minHP: 60, maxHP: 85, 
    atk: 15, 
    speed: 7, 
    attribute: 'PSY',
    stagerange: [26, 37],
    pool: [
      { emoji: '<:QCKrearadmiral:1491527615293689949>', attribute: 'QCK' },
      { emoji: '<:INTrearadmiral:1491527898119667863>', attribute: 'INT' },
      { emoji: '<:PSYrearadmiral:1491528314207338626>', attribute: 'PSY' }
    ]
  },
  { 
    rank: 'Vice admiral', // appears from isail 34
    minHP: 70, maxHP: 100, 
    atk: 18, 
    speed: 10, 
    attribute: 'PSY',
    stagerange: [34, 41],
    pool: [
      { emoji: '<:DEXviceadmiral:1491532324033134726>', attribute: 'DEX' },
      { emoji: '<:INT2viceadmiral:1491532051587924129>', attribute: 'INT' },
      { emoji: '<:INTviceadmiral:1491531375650668624>', attribute: 'INT' },
      { emoji: '<:QCKviceadmiral:1491532505122214061>', attribute: 'QCK' },
      { emoji: '<:PSYviceadmiral:1491533004105973880>', attribute: 'PSY' },
      { emoji: '<:STRviceadmiral:1491533609574858892>', attribute: 'STR' },
      { emoji: '<:DEX2viceadmiral:1491533376921010226>', attribute: 'DEX' },
      { emoji: '<:QCK2Viceadmiral:1491534250921693254>', attribute: 'QCK' },
      { emoji: '<:PSYviceadmiral:1491533004105973880>', attribute: 'PSY' },
      { emoji: '<:DEX3Viceadmiral:1491534415225032824>', attribute: 'DEX' },
      { emoji: '<:PSY3viceadmiral:1491534627628646410>', attribute: 'PSY' },
      { emoji: '<:STR2Viceadmiral:1491534817161117816>>', attribute: 'STR' }
    ]
  },
  { 
    rank: 'Admiral', // appears from isail 38
    minHP: 80, maxHP: 116, 
    atk: 20, 
    speed: 11, 
    attribute: 'PSY',
    stagerange: [38, 45],
    pool: [
      { emoji: '<:PSYAdmiral:1491535320720867328>', attribute: 'PSY' },
      { emoji: '<:INTadmiral:1491535479198187554>', attribute: 'INT' },
      { emoji: '<:QCKamiral:1491536135967739945>', attribute: 'QCK' },
      { emoji: '<:INT2admiral:1491536432941240422>', attribute: 'INT' }
    ]
  },
  { 
    rank: 'Fleet Admiral', // appears from isail 42
    minHP: 100, maxHP: 145, 
    atk: 25, 
    speed: 15, 
    attribute: 'PSY',
    stagerange: [42, 999],
    pool: [
      { emoji: '<:STRfleetadmiral:1491537014435352657>', attribute: 'STR' },
      { emoji: '<:PSYfleetadmiral:1491537308036370614>', attribute: 'PSY' },
      { emoji: '<:QCKamiral:1491536135967739945>', attribute: 'QCK' },
      { emoji: '<:INT2admiral:1491536432941240422>', attribute: 'INT' }
    ]
  }
];


function getMarineHPRange(rank, stageNumber = 1) {
  const marine = marines.find(m => m.rank === rank);
  if (!marine) return { minHP: 1, maxHP: 1 };
  const multiplier = MARINE_STAGE_HP_MULTIPLIER;
  const bonus = Math.max(0, stageNumber - 1) * multiplier;
  return {
    minHP: marine.minHP + bonus,
    maxHP: marine.maxHP + bonus
  };
}

function getRandomMarineHP(rank, stageNumber = 1) {
  const range = getMarineHPRange(rank, stageNumber);
  const minHP = Math.max(1, range.minHP);
  const maxHP = Math.max(minHP, range.maxHP);
  return Math.floor(Math.random() * (maxHP - minHP + 1)) + minHP;
}

marines.MARINE_STAGE_HP_MULTIPLIER = MARINE_STAGE_HP_MULTIPLIER;
marines.getMarineHPRange = getMarineHPRange;
marines.getRandomMarineHP = getRandomMarineHP;

module.exports = marines;