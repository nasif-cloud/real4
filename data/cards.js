// rank metadata (color and optional image) – used by embeds
exports.rankData = {
  D: { color: '#B87333', badge: 'https://files.catbox.moe/gcxdld.png' },
  C: { color: '#f9a53f', badge: 'https://files.catbox.moe/g2k0qe.png' },
  B: { color: '#c6c6c7', badge: 'https://files.catbox.moe/hwe2sp.png' },
  A: { color: '#bfddff', badge: 'https://files.catbox.moe/bazsnm.png' },
  S: { color: '#9966CC', badge: 'https://files.catbox.moe/5o59c4.png' },
  SS: { color: '#26619C', badge: 'https://files.catbox.moe/jxtjc6.png' },
  UR: { color: '#E0115F', badge: 'https://files.catbox.moe/07p0m2.png' }
};

// ID generation with collision handling
// Format: First letters of name parts + Rank + Upgrade version
// Example: Monkey D. Luffy, Rank B, U1 = "MDLB1"
// Example: Alvida, Rank A, U2 = "AAA2" (collision handling adds more letters)
function generateCardId(character, rank, masteryLevel, existingIds = new Set()) {
  // Parse character name into parts (handles middle names)
  const parts = character.split(' ').filter(p => p.length > 0);
  
  // Build initial ID from first letters
  let idBase = parts.map(p => p[0].toUpperCase()).join('') + rank + masteryLevel;
  
  // If ID doesn't exist, return it
  if (!existingIds.has(idBase)) {
    return idBase;
  }
  
  // Handle collisions by progressively adding more letters
  let collision = true;
  let attempts = 0;
  const maxLettersPerPart = 3;
  
  while (collision && attempts < 100) {
    attempts++;
    let newIdBase = '';
    
    // Progressively build longer ID by taking more letters from each name part
    let lettersToTake = Math.floor(attempts / (parts.length || 1)) + 1;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const take = Math.min(lettersToTake, part.length, maxLettersPerPart);
      newIdBase += part.substring(0, take).toUpperCase();
    }
    
    idBase = newIdBase + rank + masteryLevel;
    collision = existingIds.has(idBase);
  }
  
  return idBase;
}

// Helper function to flatten consolidated cards into the expected array format
// Consolidates upgrades of the same character into one object, which is then expanded
// Handles emoji/attribute inheritance from u1 to higher upgrades
function flattenCards(consolidatedCards) {
  const result = [];
  const usedIds = new Set();
  
  // First pass: generate and collect all IDs
  const cardIdMap = new Map(); // character -> { u1Id, u2Id, u3Id, u4Id }
  
  consolidatedCards.forEach(card => {
    const masteryTotal = card.upgradeTotal || 1;
    const idMap = {};
    
    // Generate ID for u1
    idMap.u1 = generateCardId(card.character, card.rank, 1, usedIds);
    usedIds.add(idMap.u1);
    
    // Generate IDs for upgrades
    const upgradeNames = ['secondupgrade', 'thirdupgrade', 'fourthupgrade'];
    upgradeNames.forEach((upgradeName, index) => {
      if (card[upgradeName]) {
        const masteryLevel = index + 2;
        const upgradeRank = card[upgradeName].rank;
        const upgradeId = generateCardId(card.character, upgradeRank, masteryLevel, usedIds);
        idMap[`u${masteryLevel}`] = upgradeId;
        usedIds.add(upgradeId);
      }
    });
    
    cardIdMap.set(card.character, idMap);
  });
  
  // Second pass: create flattened cards with generated IDs
  consolidatedCards.forEach(card => {
    const masteryTotal = card.upgradeTotal || 1;
    const idMap = cardIdMap.get(card.character);
    
    // Extract u1 properties (always at top level of consolidated card)
    const u1Card = {
      id: idMap.u1,
      character: card.character,
      alias: card.alias,
      title: card.title,
      faculty: card.faculty,
      rank: card.rank,
      mastery: 1,
      mastery_total: masteryTotal,
      pullable: card.pullable !== undefined ? card.pullable : true,
      power: card.power,
      health: card.health,
      speed: card.speed,
      attack_min: card.attack_min,
      attack_max: card.attack_max,
      image_url: card.image_url
    };
    
    // Add optional fields if they exist
    if (card.special_attack) u1Card.special_attack = card.special_attack;
    if (card.effect !== undefined) u1Card.effect = card.effect;
    if (card.effectDuration !== undefined) u1Card.effectDuration = card.effectDuration;
    if (card.itself !== undefined) u1Card.itself = card.itself;
    if (card.attribute) u1Card.attribute = card.attribute;
    if (card.emoji) u1Card.emoji = card.emoji;
    if (card.boost) u1Card.boost = card.boost;
    if (card.upgradeRequirements) u1Card.upgradeRequirements = card.upgradeRequirements;
    
    result.push(u1Card);
    
    // Process upgrades (secondupgrade, thirdupgrade, fourthupgrade)
    const upgradeNames = ['secondupgrade', 'thirdupgrade', 'fourthupgrade'];
    upgradeNames.forEach((upgradeName, index) => {
      if (card[upgradeName]) {
        const masteryLevel = index + 2;
        const upgradeData = card[upgradeName];
        
        const upgradedCard = {
          id: idMap[`u${masteryLevel}`],
          character: card.character,
          alias: card.alias,
          title: upgradeData.title,
          faculty: upgradeData.faculty,
          rank: upgradeData.rank,
          mastery: masteryLevel,
          mastery_total: masteryTotal,
          pullable: false, // upgrades > 1 are unpullable
          power: upgradeData.power,
          health: upgradeData.health,
          speed: upgradeData.speed,
          attack_min: upgradeData.attack_min,
          attack_max: upgradeData.attack_max,
          image_url: upgradeData.image_url
        };
        
        // Inherit emoji and attribute from u1
        if (card.attribute) upgradedCard.attribute = card.attribute;
        if (card.emoji) upgradedCard.emoji = card.emoji;
        
        // Add optional fields if they exist in upgrade data
        if (upgradeData.special_attack) upgradedCard.special_attack = upgradeData.special_attack;
        if (upgradeData.effect !== undefined) upgradedCard.effect = upgradeData.effect;
        if (upgradeData.effectDuration !== undefined) upgradedCard.effectDuration = upgradeData.effectDuration;
        if (upgradeData.itself !== undefined) upgradedCard.itself = upgradeData.itself;
        if (upgradeData.boost) upgradedCard.boost = upgradeData.boost;
        if (upgradeData.upgradeRequirements) upgradedCard.upgradeRequirements = upgradeData.upgradeRequirements;
        
        result.push(upgradedCard);
      }
    });
  });
  
  return result;
}

// Consolidated card definitions - upgrades are nested to reduce repetition
const consolidatedCardData = [
  {
    character: 'Monkey D. Luffy',
    alias: ['luffy', 'monkey d luffy', 'strawhat'],
    upgradeTotal: 4,
    pullable: true,
    attribute: 'DEX',
    emoji: '<:MonkeyDLuffy:1481698180209971361>',
    title: 'Captain of the Straw Hat Pirates',
    faculty: 'Strawhat Pirates',
    rank: 'B',
    power: 10,
    health: 15,
    speed: 3,
    attack_min: 2,
    attack_max: 2,
    special_attack: {
      name: 'Gomu Gomu no Giant Pistol',
      min_atk: 3,
      max_atk: 5,
      gif: 'https://files.catbox.moe/gcyuly.gif'
    },
    effect: 'attackdown',
    effectDuration: 3,
    effectAmount: 5,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/lDbfzvp.png',
    secondupgrade: {
      title: 'the Worst Generation pirates',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 16,
      health: 28,
      speed: 8,
      attack_min: 3,
      attack_max: 5,
      special_attack: {
        name: 'Gomu Gomu no Jet Culverin',
        min_atk: 5,
        max_atk: 11,
        gif: 'https://files.catbox.moe/13wkm8.gif'
      },
        effect: 'attackdown',
    effectDuration: 3,
    effectAmount: 10,
      upgradeRequirements: ['RZB1', 'NC1', 'UC1', 'VSB1'],
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/g5NhBgN.png'
    },
    thirdupgrade: {
      title: 'Yonko of the Sea',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 30,
      health: 40,
      speed: 10,
      attack_min: 6,
      attack_max: 10,
      special_attack: {
        name: 'Leo Bazooka',
        min_atk: 11,
        max_atk: 21,
        gif: 'https://files.catbox.moe/9npqi3.gif'
      },
        effect: 'attackdown',
    effectDuration: 3,
    effectAmount: 15,
      upgradeRequirements: ['TTC1', 'NRA1', 'CFB1', 'BA1'],
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/2RJrsJN'
    },
    fourthupgrade: {
      title: 'The Warrior of Liberation',
      faculty: 'Strawhat Pirates',
      rank: 'UR',
      power: 52,
      health: 78,
      speed: 24,
      attack_min: 15,
      attack_max: 19,
      special_attack: {
        name: 'Gomu Gomu no Mogura Pistol',
        min_atk: 29,
        max_atk: 40,
        gif: 'https://files.catbox.moe/1x0eu8.gif'
      },
        effect: 'undead',
    effectDuration: 3,
    itself: true,
      upgradeRequirements: ['JA1'],
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/deRr9tW'
    }
  },
  {
    character: 'Roronoa Zoro',
    alias: ['zoro', 'roronoa', 'pirate hunter'],
    upgradeTotal: 3,
    pullable: true,
    attribute: 'DEX',
    emoji: '<:RoronoaZoro:1481724083388285039>',
    title: 'Strawhat Pirates',
    faculty: 'Strawhat Pirates',
    rank: 'B',
    power: 12,
    health: 20,
    speed: 3,
    attack_min: 2,
    attack_max: 4,
    special_attack: {
      name: 'Oni-Giri',
      min_atk: 3,
      max_atk: 9,
      gif: 'https://files.catbox.moe/mkqkd7.gif'
    },
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/lst3Ppp.png',
    secondupgrade: {
      title: 'Pirate hunter',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 24,
      health: 38,
      speed: 10,
      attack_min: 7,
      attack_max: 10,
      special_attack: {
        name: '1080 Pound Phoenix',
        min_atk: 13,
        max_atk: 21,
        gif: 'https://files.catbox.moe/cswvsg.gif'
      },
        effect: 'cut',
    effectDuration: 3,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/o1pXcH8.png'
    },
    thirdupgrade: {
      title: 'King of Hell',
      faculty: 'Strawhat Pirates',
      rank: 'SS',
      power: 35,
      health: 62,
      speed: 14,
      attack_min: 12,
      attack_max: 16,
      special_attack: {
        name: 'King of Hell: 103 Mercies Dragon Damnation',
        min_atk: 23,
        max_atk: 34,
        gif: 'https://files.catbox.moe/o8hcyj.gif'
      },
      effect: 'bleed',
      effectDuration: 5,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/jnsEZ0y'
    }
  },
  {
    character: 'Makino',
    alias: ['makino'],
    upgradeTotal: 2,
    attribute: 'INT',
    emoji: '<:Makino:1481742971131920475>',
    pullable: true,
    title: 'Barmaid of the Partys Bar',
    faculty: null,
    rank: 'D',
    power: 1,
    health: 5,
    speed: 1,
    attack_min: 0,
    attack_max: 0,
    boost: 'Monkey D. Luffy (5%), Figarland Shanks (5%)',
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/jygjq2q.png',
    secondupgrade: {
      title: 'Seasoned Bartender of Partys Bar',
      faculty: null,
      rank: 'C',
      power: 5,
      health: 8,
      speed: 1,
      attack_min: 0,
      attack_max: 0,
      boost: 'Monkey D. Luffy (7%), Figarland Shanks (7%)',
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/dkqNc3f.png'
    }
  },
  {
    character: 'Cutty Flam',
    alias: ['franky'],
    upgradeTotal: 3,
    attribute: 'DEX',
    emoji: '<:CuttyFlam:1482368560696266903>',
    pullable: true,
    title: 'Shipwright of the Strawhat Pirates',
    faculty: 'Strawhat Pirates',
    rank: 'B',
    power: 13,
    health: 32,
    speed: 3,
    attack_min: 2,
    attack_max: 3,
    special_attack: {
      name: 'Strong Right',
      min_atk: 3,
      max_atk: 7,
      gif: 'https://files.catbox.moe/yheddw.gif'
    },
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/aUSfoWu.png',
    secondupgrade: {
      title: 'Cyborg',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 18,
      health: 45,
      speed: 5,
      attack_min: 3,
      attack_max: 4,
      special_attack: {
        name: 'Franky Fireball',
        min_atk: 5,
        max_atk: 9,
        gif: 'https://files.catbox.moe/ue4qr2.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/bMH4EWP.png'
    },
    thirdupgrade: {
      title: 'General Franky',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 22,
      health: 60,
      speed: 7,
      attack_min: 6,
      attack_max: 8,
      special_attack: {
        name: 'Coup de Vent',
        min_atk: 11,
        max_atk: 17,
        gif: 'https://files.catbox.moe/79q64r.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/ODzjNp3'
    }
  },
  {
    character: 'Nami',
    alias: ['nami'],
    upgradeTotal: 3,
    attribute: 'DEX',
    emoji: '<:Nami:1482368704439123989>',
    pullable: true,
    title: 'Navigator of the Strawhat Pirates',
    faculty: 'Strawhat Pirates',
    rank: 'C',
    power: 6,
    health: 10,
    speed: 1,
    attack_min: 1,
    attack_max: 1,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/gCh3nWP.png',
    secondupgrade: {
      title: 'Cat burglar',
      faculty: 'Strawhat Pirates',
      rank: 'B',
      power: 12,
      health: 16,
      speed: 3,
      attack_min: 2,
      attack_max: 4,
      special_attack: {
        name: 'Thunderbolt Tempo',
        min_atk: 3,
        max_atk: 9,
        gif: 'https://files.catbox.moe/vemw4q.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/l05ABiW.png'
    },
    thirdupgrade: {
      title: 'Cat burglar',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 16,
      health: 27,
      speed: 4,
      attack_min: 3,
      attack_max: 6,
      special_attack: {
        name: 'Thunderbolt Tempo',
        min_atk: 5,
        max_atk: 13,
        gif: 'https://files.catbox.moe/3b5i8c.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/lwoA9mK'
    }
  },
  {
    character: 'Vinsmoke Sanji',
    alias: ['sanji', 'vinsmoke'],
    upgradeTotal: 3,
    attribute: 'PSY',
    emoji: '<:VinsmokeSanji:1482368973071974573>',
    pullable: true,
    title: 'Cook of the Strawhat Pirates',
    faculty: 'Strawhat Pirates',
    rank: 'B',
    power: 12,
    health: 23,
    speed: 5,
    attack_min: 2,
    attack_max: 4,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/UbYf36i.png',
    secondupgrade: {
      title: 'Black Leg',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 18,
      health: 34,
      speed: 7,
      attack_min: 5,
      attack_max: 7,
      special_attack: {
        name: 'Black leg style',
        min_atk: 9,
        max_atk: 15,
        gif: 'https://files.catbox.moe/x6f0pl.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/cEvfr7F.png'
    },
    thirdupgrade: {
      title: 'Mr. Prince',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 25,
      health: 45,
      speed: 11,
      attack_min: 7,
      attack_max: 10,
      special_attack: {
        name: 'Diable Jambe',
        min_atk: 13,
        max_atk: 21,
        gif: 'https://files.catbox.moe/zkymnw.gif'
      },
      effect: 'cut',
      effectDuration: 3,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/kLga5EL'
    }
  },
  {
    character: 'Tony Tony Chopper',
    alias: ['chopper'],
    upgradeTotal: 2,
    attribute: 'INT',
    emoji: '<:TonyTonyChopper:1482369219567030332>',
    pullable: true,
    title: 'Cotton Candy Lover',
    faculty: 'Strawhat Pirates',
    rank: 'C',
    power: 6,
    health: 8,
    speed: 2,
    attack_min: 0,
    attack_max: 0,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/MegxsOu.png',
    secondupgrade: {
      title: 'Monster Point',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 20,
      health: 50,
      speed: 5,
      attack_min: 5,
      attack_max: 8,
      special_attack: {
        name: 'Kokutei: Palme (Carving Hoof: Palm)',
        min_atk: 9,
        max_atk: 17,
        gif: 'https://files.catbox.moe/7eg2wl.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/QEfJIhZ.png'
    }
  },
  {
    character: 'Usopp',
    alias: ['usopp', 'god'],
    upgradeTotal: 3,
    attribute: 'DEX',
    emoji: '<:Usopp:1482369558097559662>',
    pullable: true,
    title: 'Sharpshooter of the Strawhat Pirates',
    faculty: 'Usopp Pirates',
    rank: 'C',
    power: 5,
    health: 8,
    speed: 1,
    attack_min: 1,
    attack_max: 1,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/elLlCS9.png',
    secondupgrade: {
      title: 'Sniper king',
      faculty: 'Strawhat Pirates',
      rank: 'B',
      power: 10,
      health: 16,
      speed: 2,
      attack_min: 1,
      attack_max: 3,
      special_attack: {
        name: 'Impact Dial',
        min_atk: 2,
        max_atk: 7,
        gif: 'https://files.catbox.moe/vsztx7.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/j84FU8x.png'
    },
    thirdupgrade: {
      title: 'GOD',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 15,
      health: 26,
      speed: 3,
      attack_min: 3,
      attack_max: 6,
      special_attack: {
        name: 'Kaen Boshi (Flame Star)',
        min_atk: 5,
        max_atk: 13,
        gif: 'https://files.catbox.moe/recrph.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/7tRPjue'
    }
  },
  {
    character: 'Nico Robin',
    alias: ['robin'],
    upgradeTotal: 3,
    attribute: 'PSY',
    emoji: '<:NicoRobin:1482369749777252373>',
    pullable: true,
    title: 'Miss all Sunday',
    faculty: 'Boroque Works',
    rank: 'A',
    power: 16,
    health: 28,
    speed: 3,
    attack_min: 3,
    attack_max: 4,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/WQNJRUG.png',
    secondupgrade: {
      title: 'Archaeologist of the Strawhat Pirates',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 20,
      health: 32,
      speed: 6,
      attack_min: 5,
      attack_max: 7,
      special_attack: {
        name: 'Cien FLeur: Delphinium',
        min_atk: 9,
        max_atk: 15,
        gif: 'https://files.catbox.moe/atuxzj.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/AbucvHW.png'
    },
    thirdupgrade: {
      title: 'Demon child',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 24,
      health: 38,
      speed: 9,
      attack_min: 7,
      attack_max: 9,
      special_attack: {
        name: 'Demonio Fleur: Gran Jacuzzi Clutch',
        min_atk: 13,
        max_atk: 19,
        gif: 'https://files.catbox.moe/nst9sc.gif'
      },
      effect: 'team_stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/p5LTjdh'
    }
  },
  {
    character: 'Brook',
    alias: ['brook'],
    upgradeTotal: 3,
    attribute: 'INT',
    emoji: '<:Brook:1482369967184805931>',
    pullable: true,
    title: 'Musician of the Strawhat Pirates',
    faculty: 'Strawhat Pirates',
    rank: 'A',
    power: 16,
    health: 28,
    speed: 6,
    attack_min: 3,
    attack_max: 5,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/RwUFlMT.png',
    secondupgrade: {
      title: 'Soul King',
      faculty: 'Strawhat Pirates',
      rank: 'A',
      power: 19,
      health: 32,
      speed: 7,
      attack_min: 4,
      attack_max: 7,
      special_attack: {
        name: 'Aubade Coup Droit',
        min_atk: 7,
        max_atk: 15,
        gif: 'https://files.catbox.moe/oikxve.gif'
      },
      effect: 'freeze',
      effectDuration: 2,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/q6WvmnM.png'
    },
    thirdupgrade: {
      title: 'Soul King',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 23,
      health: 44,
      speed: 11,
      attack_min: 7,
      attack_max: 10,
      special_attack: {
        name: 'Three-pace hum, Soul Notch slash',
        min_atk: 13,
        max_atk: 21,
        gif: 'https://files.catbox.moe/q575pp.gif'
      },
      effect: 'freeze',
      effectDuration: 2,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/bBAXniE'
    }
  },
  {
    character: 'Jinbe',
    alias: ['jimbei'],
    upgradeTotal: 3,
    pullable: true,
    attribute: 'QCK',
    emoji: '<:Jinbe:1481698679936127027>',
    title: 'Warlord of the sea',
    faculty: 'Strawhat Pirates',
    rank: 'A',
    power: 18,
    health: 33,
    speed: 5,
    attack_min: 3,
    attack_max: 5,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/KDhnqgL.png',
    secondupgrade: {
      title: 'Pilot of the Strawhat Pirates',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 20,
      health: 35,
      speed: 7,
      attack_min: 5,
      attack_max: 7,
      special_attack: {
        name: 'Five Thousand Tile True Punch',
        min_atk: 9,
        max_atk: 15,
        gif: 'https://files.catbox.moe/1gvgyc.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/YBCTiWq.png'
    },
    thirdupgrade: {
      title: 'Knight of the Sea',
      faculty: 'Strawhat Pirates',
      rank: 'S',
      power: 28,
      health: 60,
      speed: 10,
      attack_min: 6,
      attack_max: 8,
      special_attack: {
        name: 'Five Thousand Tile True Punch',
        min_atk: 11,
        max_atk: 17,
        gif: 'https://files.catbox.moe/mwl2r5.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/4NFb31i'
    }
  },
  {
    character: 'Alvida',
    alias: ['alvida'],
    upgradeTotal: 3,
    attribute: 'DEX',
    emoji: '<:Alvida:1482370194243325963>',
    pullable: true,
    title: 'Captain of the Alvida Pirates',
    faculty: 'Alvida Pirates',
    rank: 'C',
    power: 9,
    health: 10,
    speed: 1,
    attack_min: 2,
    attack_max: 3,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/kF9E2EE.png',
    secondupgrade: {
      title: 'Iron Mace',
      faculty: 'Buggy Pirates',
      rank: 'A',
      power: 15,
      health: 28,
      speed: 5,
      attack_min: 3,
      attack_max: 5,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/Ka5AkQC.png'
    },
    thirdupgrade: {
      title: 'Iron Mace',
      faculty: 'Cross Guild',
      rank: 'A',
      power: 18,
      health: 30,
      speed: 7,
      attack_min: 4,
      attack_max: 6,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/ENnEHR1.png'
    }
  },
  {
    character: 'Coby',
    alias: ['koby'],
    upgradeTotal: 3,
    attribute: 'PSY',
    emoji: '<:Coby:1482370446799142932>',
    pullable: true,
    title: 'Cabin boy',
    faculty: 'Alvida Pirates',
    rank: 'D',
    power: 1,
    health: 5,
    speed: 1,
    attack_min: 0,
    attack_max: 1,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/9BylcGi.png',
    secondupgrade: {
      title: 'Master Chief Petty Officer',
      faculty: 'Marines',
      rank: 'B',
      power: 10,
      health: 13,
      speed: 2,
      attack_min: 1,
      attack_max: 3,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/aamlTog.png'
    },
    thirdupgrade: {
      title: 'Koby the Hero',
      faculty: 'Marines',
      rank: 'S',
      power: 28,
      health: 39,
      speed: 10,
      attack_min: 7,
      attack_max: 10,
      special_attack: {
        name: 'Honesty Impact',
        min_atk: 16,
        max_atk: 24,
        gif: 'https://one-piece-artworks.com/app/view/assets/img/rHRC8mf'
      },
      effect: 'stun',
      effectDuration: 2,
      image_url: 'https://files.catbox.moe/5z2a8n.jpg'
    }
  },
  {
    character: 'Buggy',
    alias: ['buggy'],
    upgradeTotal: 3,
    attribute: 'INT',
    emoji: '<:Buggy:1482370604177821776>',
    pullable: true,
    title: 'Captain of the Buggy Pirates',
    faculty: 'Buggy Pirates',
    rank: 'B',
    power: 11,
    health: 14,
    speed: 2,
    attack_min: 2,
    attack_max: 3,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/AZNSg7Z.png',
    secondupgrade: {
      title: 'The Star Clown',
      faculty: 'Buggy Pirates',
      rank: 'A',
      power: 16,
      health: 28,
      speed: 5,
      attack_min: 2,
      attack_max: 4,
      special_attack: {
        name: 'Bara Bara Festival',
        min_atk: 3,
        max_atk: 9,
        gif: 'https://files.catbox.moe/7igapl.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/onGEdMW.png'
    },
    thirdupgrade: {
      title: 'Emperor of the new World',
      faculty: 'Cross Guild',
      rank: 'S',
      power: 22,
      health: 35,
      speed: 9,
      attack_min: 6,
      attack_max: 7,
      special_attack: {
        name: 'Bara Bara Festival',
        min_atk: 11,
        max_atk: 15,
        gif: 'https://files.catbox.moe/7igapl.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/hXkq04a'
    }
  },
  {
    character: 'Galdino',
    alias: ['mr. 3'],
    upgradeTotal: 3,
    attribute: 'QCK',
    emoji: '<:Galdino:1482370864858005736>',
    pullable: true,
    title: 'Mr.3 Of Boroque Works',
    faculty: 'Boroque Works',
    rank: 'A',
    power: 16,
    health: 18,
    speed: 3,
    attack_min: 3,
    attack_max: 5,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/McvTEak.png',
    secondupgrade: {
      title: 'Loan Shark',
      faculty: 'Buggy Pirates',
      rank: 'A',
      power: 17,
      health: 28,
      speed: 4,
      attack_min: 3,
      attack_max: 6,
      special_attack: {
        name: 'Wax Weapons',
        min_atk: 5,
        max_atk: 12,
        gif: 'https://media1.tenor.com/m/RIcW9zpVekAAAAAC/mr3.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/KeZHoqt.png'
    },
    thirdupgrade: {
      title: 'Loan Shark',
      faculty: 'Cross Guild',
      rank: 'A',
      power: 20,
      health: 30,
      speed: 6,
      attack_min: 4,
      attack_max: 7,
      special_attack: {
        name: 'Wax Weapons',
        min_atk: 7,
        max_atk: 15,
        gif: 'https://media1.tenor.com/m/RIcW9zpVekAAAAAC/mr3.gif'
      },
      effect: 'stun',
      effectDuration: 1,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/ztgxNN8.png'
    }
  },
  {
    character: 'Crocodile',
    alias: ['mr. 0'],
    upgradeTotal: 3,
    attribute: 'STR',
    emoji: '<:Crocodile:1482371011167912038>',
    pullable: true,
    title: 'President of Boroque Works',
    faculty: 'Boroque Works',
    rank: 'A',
    power: 20,
    health: 30,
    speed: 5,
    attack_min: 4,
    attack_max: 6,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/uuR19Hs.png',
    secondupgrade: {
      title: 'Former Warlord of the Sea',
      faculty: null,
      rank: 'S',
      power: 21,
      health: 32,
      speed: 5,
      attack_min: 4,
      attack_max: 7,
      special_attack: {
        name: 'Sables (Sandstorm)',
        min_atk: 7,
        max_atk: 15,
        gif: 'https://media1.tenor.com/m/p8kha-qt3isAAAAC/crocodile-warlord.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/ycjwoCK.png'
    },
    thirdupgrade: {
      title: 'Desert King',
      faculty: 'Cross Guild',
      rank: 'S',
      power: 29,
      health: 44,
      speed: 10,
      attack_min: 7,
      attack_max: 11,
      special_attack: {
        name: 'Sables (Sandstorm)',
        min_atk: 13,
        max_atk: 23,
        gif: 'https://media1.tenor.com/m/VbmZWE02BkMAAAAd/crocodile-crocodile-one-piece.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/N8RUyMn'
    }
  },
  {
    character: 'Dracule Mihawk',
    alias: ['fraud'],
    attribute: 'STR',
    emoji: '<:DraculeMihawk:1482371278122778645>',
    upgradeTotal: 2,
    pullable: true,
    title: 'Strongest Swordsman in the World',
    faculty: null,
    rank: 'SS',
    power: 46,
    health: 70,
    speed: 13,
    attack_min: 15,
    attack_max: 18,
    special_attack: {
      name: 'Black Blade One Flash',
      min_atk: 29,
      max_atk: 40,
      gif: 'https://media1.tenor.com/m/bma-E_F-nXUAAAAd/mihawk.gif'
    },
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/KcnD5km',
    secondupgrade: {
      title: 'Strongest Swordsman in the World',
      faculty: 'Cross Guild',
      rank: 'UR',
      power: 54,
      health: 80,
      speed: 18,
      attack_min: 17,
      attack_max: 20,
      special_attack: {
        name: 'Black Blade One Flash',
        min_atk: 34,
        max_atk: 44,
        gif: 'https://media1.tenor.com/m/vf5isZQBOX0AAAAd/jozu-mihawk.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/fiLOArn'
    }
  },
  {
    character: 'Daz Bones',

    alias: ['mr. 1'],
    upgradeTotal: 3,
    attribute: 'QCK',
    emoji: '<:DazBones:1482371437825233016>',
    pullable: true,
    title: 'Mr. 1 Of Boroque Works',
    faculty: 'Boroque Works',
    rank: 'B',
    power: 15,
    health: 22,
    speed: 3,
    attack_min: 2,
    attack_max: 5,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/BDPmWCR.png',
    secondupgrade: {
      title: 'The Killer',
      faculty: null,
      rank: 'A',
      power: 17,
      health: 26,
      speed: 4,
      attack_min: 3,
      attack_max: 5,
      special_attack: {
        name: 'Spar Claw',
        min_atk: 5,
        max_atk: 11,
        gif: 'https://media1.tenor.com/m/FESeJXBo8lsAAAAd/one-piece-anime.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/rLv6C7O.png'
    },
    thirdupgrade: {
      title: 'The Killer',
      faculty: 'Cross Guild',
      rank: 'A',
      power: 19,
      health: 30,
      speed: 5,
      attack_min: 4,
      attack_max: 6,
      special_attack: {
        name: 'Spar Claw',
        min_atk: 7,
        max_atk: 13,
        gif: 'https://media1.tenor.com/m/FESeJXBo8lsAAAAd/one-piece-anime.gif'
      },
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/Ut0pOgP'
    }
  },
  

  // Red-Haired Pirates
  {
    character: 'Figarland Shanks',
    alias: ['shanks', 'red-haired shanks'],
    upgradeTotal: 3,
    pullable: true,
    attribute: 'INT',
    emoji: '<:shanks:1489447892488949823>',
    title: 'Knight of God',
    faculty: 'Red-Haired Pirates',
    rank: 'SS',
    power: 40,
    health: 65,
    speed: 15,
    attack_min: 12,
    attack_max: 16,
    special_attack: {
      name: 'Divine Departure',
      min_atk: 20,
      max_atk: 32,
      gif: 'https://media1.tenor.com/m/m-QOWyoBR-MAAAAd/shanks-one-piece.gif'
    },
    effect: 'truesight',
    effectDuration: 1,
    itself: true,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/8wOmpFA.png',
    secondupgrade: {
      title: 'Captain of the Red hair Pirates',
      faculty: 'Red-Haired Pirates',
      rank: 'UR',
      power: 55,
      health: 85,
      speed: 20,
      attack_min: 15,
      attack_max: 19,
      special_attack: {
        name: 'Divine Departure',
        min_atk: 25,
        max_atk: 38,
        gif: 'https://media1.tenor.com/m/m-QOWyoBR-MAAAAd/shanks-one-piece.gif'
      },
      effect: 'truesight',
      effectDuration: 2,
      itself: true,
      upgradeRequirements: ['BBP1', 'YB1', 'RSB1'],
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/VC7uKaG'
    },
    thirdupgrade: {
      title: 'Emperor of the new world',
      faculty: 'Red-Haired Pirates',
      rank: 'UR',
      power: 65,
      health: 100,
      speed: 22,
      attack_min: 17,
      attack_max: 21,
      special_attack: {
        name: 'Divine Departure',
        min_atk: 30,
        max_atk: 42,
        gif: 'https://media1.tenor.com/m/m-QOWyoBR-MAAAAd/shanks-one-piece.gif'
      },
      effect: 'truesight',
      effectDuration: 3,
      itself: true,
      upgradeRequirements: ['BBP2', 'MDTS2'],
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/qOOqwTm'
    }
  },
  {
    character: 'Benn Beckman',
    alias: ['beckman', 'benn'],
    upgradeTotal: 2,
    pullable: true,
    attribute: 'INT',
    emoji: '<:bennbeckman:1489447916174315721>',
    title: 'First mate of the Red hair Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'S',
    power: 25,
    health: 42,
    speed: 9,
    attack_min: 7,
    attack_max: 10,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/qh0I2YO.png',
    secondupgrade: {
      title: 'First mate of the Red hair Pirates',
      faculty: 'Red-Haired Pirates',
      rank: 'S',
      power: 28,
      health: 48,
      speed: 11,
      attack_min: 8,
      attack_max: 12,
      special_attack: {
        name: 'Rifle bullets w haki ig',
        min_atk: 12,
        max_atk: 21,
        gif: 'https://media1.tenor.com/m/0_YHDV0fraEAAAAC/kizaru-ben-beckman.gif'
      },
      effect: 'stun',
      effectDuration: 2,
      effectAmount: 8,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/SN2HBvv.png'
    }
  },
  {
    character: 'Lucky Roux',
    alias: ['lucky roux', 'roux'],
    upgradeTotal: 2,
    pullable: true,
    attribute: 'QCK',
    emoji: '<:luckyroux:1489447906955231293>',
    title: 'Cook of the Red haired Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'A',
    power: 19,
    health: 30,
    speed: 5,
    attack_min: 3,
    attack_max: 6,
    boost: 'Red hair Pirates HP by 10%',
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/5KQjg68.png',
    secondupgrade: {
      title: 'Cook of the Red haired Pirates',
      faculty: 'Red-Haired Pirates',
      rank: 'S',
      power: 24,
      health: 45,
      speed: 8,
      attack_min: 6,
      attack_max: 9,
      boost: 'Red hair pirates HP by 15%',
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/JtIr9Tj.png'
    }
  },
  {
    character: 'Yasopp',
    alias: ['yasopp'],
    upgradeTotal: 2,
    pullable: true,
    attribute: 'QCK',
    emoji: '<:yasopp:1489447878517723286>',
    title: 'Sharpshooter of the Red haired Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'A',
    power: 18,
    health: 30,
    speed: 6,
    attack_min: 4,
    attack_max: 7,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/Q1S5t6g.png',
    secondupgrade: {
      title: 'Sharpshooter of the Red haired Pirates',
      faculty: 'Red-Haired Pirates',
      rank: 'S',
      power: 24,
      health: 42,
      speed: 10,
      attack_min: 6,
      attack_max: 10,
      special_attack: {
        name: 'Precise Shot',
        min_atk: 11,
        max_atk: 19,
        gif: null
      },
      effect: 'cut',
      effectDuration: 2,
      effectAmount: 7,
      image_url: 'https://one-piece-artworks.com/app/view/assets/img/gxHvNqR.png'
    }
  },
  {
    character: 'Limejuice',
    alias: ['limejuice'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'PSY',
    emoji: '<:LimeJuice:1489447908205133854>',
    title: 'Senior officers of the Red hair Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'A',
    power: 17,
    health: 28,
    speed: 5,
    attack_min: 4,
    attack_max: 6,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/r9yWrHq.png'
  },
  {
    character: 'Bonk Punch',
    alias: ['bonk punch', 'bonk'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'PSY',
    emoji: '<:bonkpunch:1489447915113152643>',
    title: 'musician of the red Haired pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'B',
    power: 13,
    health: 20,
    speed: 3,
    attack_min: 2,
    attack_max: 4,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/yV6NZda.png'
  },
  {
    character: 'Monster',
    alias: ['monster'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'PSY',
    emoji: '<:bonkpunch:1489447915113152643>',
    title: 'musician of the red Haired pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'B',
    power: 12,
    health: 18,
    speed: 4,
    attack_min: 2,
    attack_max: 4,
    image_url: 'https://static.wikia.nocookie.net/onepiece/images/9/93/Monster_Anime_Infobox.png/revision/latest?cb=20240714020813'
  },
  {
    character: 'Building Snake',
    alias: ['building snake', 'snake'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'PSY',
    emoji: '<:buildingsnake:1489447913644884049>',
    title: 'navigator of the Red haired Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'A',
    power: 16,
    health: 26,
    speed: 6,
    attack_min: 3,
    attack_max: 6,
    image_url: 'https://static.wikia.nocookie.net/onepiece/images/5/59/Building_Snake_Anime_Infobox.png/revision/latest?cb=20220617092208'
  },
  {
    character: 'Hongo',
    alias: ['hongo'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'PSY',
    emoji: '<:hongo:1489447910360744046>',
    title: 'Doctor of the Red hair Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'A',
    power: 12,
    health: 28,
    speed: 4,
    attack_min: 3,
    attack_max: 5,
    boost: 'Red hair Pirates HP by 10%',
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/dLJioEQ.png'
  },
  {
    character: 'Howling Gabu',
    alias: ['howling gabu', 'gabu'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'PSY',
    emoji: '<:buildingsnake:1489447913644884049>',
    title: 'Senior Officers of the Red hair Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'A',
    power: 17,
    health: 29,
    speed: 5,
    attack_min: 4,
    attack_max: 6,
    image_url: 'https://static.wikia.nocookie.net/onepiece/images/6/67/Gab_Anime_Infobox.png/revision/latest/scale-to-width-down/1000?cb=20240623212148'
  },
  {
    character: 'Rockstar',
    alias: ['rockstar'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'STR',
    emoji: '<:rockstar:1489447900529561690>',
    title: 'Member of the Red hair Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'B',
    power: 14,
    health: 22,
    speed: 4,
    attack_min: 3,
    attack_max: 5,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/rBRgJYR.png'
  },
  {
    character: 'Gerotini',
    alias: ['gerotini'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'QCK',
    emoji: '<:gerotini:1489447911442878464>',
    title: '"Ball fingers" Gerotini - Captain of the Puddle Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'C',
    power: 8,
    health: 14,
    speed: 2,
    attack_min: 1,
    attack_max: 3,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/TF8OSB0.png'
  },
  {
    character: 'Fugar',
    alias: ['fugar'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'INT',
    emoji: '<:fugar:1489447912357236776>',
    title: '"Memorial Blade" Fugar - Bandmaster of the Social Club',
    faculty: 'Red-Haired Pirates',
    rank: 'C',
    power: 7,
    health: 12,
    speed: 3,
    attack_min: 1,
    attack_max: 2,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/2vEfBnN.png'
  },
  {
    character: 'Pururu',
    alias: ['pururu'],
    upgradeTotal: 1,
    pullable: true,
    attribute: 'INT',
    emoji: '<:Pururu:1489447903192682527>',
    title: '"Trembling" Pururu - Princess of the Bourgeois Pirates',
    faculty: 'Red-Haired Pirates',
    rank: 'C',
    power: 6,
    health: 10,
    speed: 2,
    attack_min: 1,
    attack_max: 2,
    image_url: 'https://one-piece-artworks.com/app/view/assets/img/iI4OVED.png'
  },

  ...require('./morecards').moreCards
];

// Flatten consolidated cards into the array format expected by the rest of the codebase
exports.cards = flattenCards(consolidatedCardData);
