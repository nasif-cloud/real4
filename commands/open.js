const User = require('../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { simulatePull, buildPullEmbed, getAllCardVersions, getCardById } = require('../utils/cards');
const { cards } = require('../data/cards');
const crews = require('../data/crews');
const { levelers } = require('../data/levelers');
const { getChestByQuery, getChestById } = require('../data/chests');
const { PULL_RATES, PITY_TARGET, PITY_DISTRIBUTION } = require('../config');

// Special loot emojis
const COLA_EMOJI = '<:cola:1494106165955792967>';
const GOD_EMOJI = '<:godtoken:1499957056650608753>';
const SHARD_EMOJIS = {
  Red: '<:RedShard:1494106374492131439>',
  Blue: '<:Blueshard:1494106500149411980>',
  Green: '<:GreenShard:1494106686963581039>',
  Yellow: '<:YellowShard:1494106825627406530>',
  Purple: '<:PurpleShard:1494106958582776008>'
};

function normalizeName(name) {
  return name ? name.toLowerCase().replace(/\s+/g, '') : '';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseChestItem(rank) {
  const candidates = levelers.filter(l => l.rank === rank);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function addChestItemToUser(user, chestItem) {
  if (!chestItem) return;
  user.items = user.items || [];
  const existingItem = user.items.find(it => it.itemId === chestItem.id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    user.items.push({ itemId: chestItem.id, quantity: 1 });
  }
}

function getRandomCrewByRank(rank) {
  const matching = crews.filter(c => c.rank === rank && c.name !== 'Marines');
  if (matching.length === 0) return null;
  return matching[Math.floor(Math.random() * matching.length)];
}

module.exports = {
  name: 'open',
  description: 'Open a pack or chest to get cards or rewards',
  options: [
    { name: 'item', type: 3, description: 'Pack or chest name (e.g., Strawhat Pirates, B Chest)', required: true },
    { name: 'amount', type: 4, description: 'Amount to open (only supported for chests)', required: false }
  ],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    let packQuery = message ? args.join(' ') : interaction.options.getString('pack');
    const amountOption = interaction ? interaction.options.getInteger('amount') : null;
    let quantity = 1;

    if (message && args.length > 1) {
      const lastArg = args[args.length - 1];
      const parsed = parseInt(lastArg, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        quantity = parsed;
        packQuery = args.slice(0, -1).join(' ');
      }
    }

    if (!message && amountOption && amountOption > 1) {
      quantity = amountOption;
    }

    const normalizedQuery = (packQuery || '').trim();

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const chest = normalizedQuery ? getChestByQuery(normalizedQuery) : null;
    if (chest) {
      user.items = user.items || [];
      const chestEntry = user.items.find(it => it.itemId === chest.id);
      if (!chestEntry || chestEntry.quantity <= 0) {
        const reply = `You have no **${chest.name}** to open.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }

      if (chestEntry.quantity < quantity) {
        const reply = `You only have ${chestEntry.quantity}x **${chest.name}**.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }

      chestEntry.quantity -= quantity;
      if (chestEntry.quantity <= 0) {
        user.items = user.items.filter(it => it.itemId !== chest.id);
      }

      const rewardTotals = {};
      const contents = chest.contents || {};

      for (let i = 0; i < quantity; i += 1) {
        if (contents.beli) {
          const amount = randomInt(contents.beli[0], contents.beli[1]);
          user.balance = (user.balance || 0) + amount;
          rewardTotals['Beli'] = (rewardTotals['Beli'] || 0) + amount;
        }

        if (contents.resetTokens && Math.random() < (contents.resetTokens.chance || 0)) {
          const resetCount = randomInt(contents.resetTokens.count[0], contents.resetTokens.count[1]);
          user.resetTokens = (user.resetTokens || 0) + resetCount;
          rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] = (rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] || 0) + resetCount;
        }

        // C-Chest special 80% chance extra drop: Cola, Beli(30), or Random Shard
        if (chest.id === 'c_chest' && Math.random() < 0.80) {
          const choices = ['cola', 'beli30', 'shard'];
          const pick = choices[Math.floor(Math.random() * choices.length)];
          if (pick === 'cola') {
            user.items = user.items || [];
            const it = user.items.find(itm => itm.itemId === 'cola');
            if (it) it.quantity = (it.quantity || 0) + 1;
            else user.items.push({ itemId: 'cola', quantity: 1 });
            rewardTotals['Cola'] = (rewardTotals['Cola'] || 0) + 1;
          } else if (pick === 'beli30') {
            user.balance = (user.balance || 0) + 30;
            rewardTotals['Beli'] = (rewardTotals['Beli'] || 0) + 30;
          } else if (pick === 'shard') {
            const colors = Object.keys(SHARD_EMOJIS);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const shardId = `${color.toLowerCase()}_shard`;
            user.items = user.items || [];
            const it = user.items.find(itm => itm.itemId === shardId);
            if (it) it.quantity = (it.quantity || 0) + 1;
            else user.items.push({ itemId: shardId, quantity: 1 });
            rewardTotals[`${color} Shard`] = (rewardTotals[`${color} Shard`] || 0) + 1;
          }
        }

        // B-Chest special 80% chance extra drop: one of several goodies
        if (chest.id === 'b_chest' && Math.random() < 0.80) {
          const choices = ['beli50to100', 'cola2', 'shards2', 'gem', 'reset1'];
          const pick = choices[Math.floor(Math.random() * choices.length)];
          if (pick === 'beli50to100') {
            const amt = randomInt(50, 100);
            user.balance = (user.balance || 0) + amt;
            rewardTotals['Beli'] = (rewardTotals['Beli'] || 0) + amt;
          } else if (pick === 'cola2') {
            user.items = user.items || [];
            const it = user.items.find(itm => itm.itemId === 'cola');
            if (it) it.quantity = (it.quantity || 0) + 2;
            else user.items.push({ itemId: 'cola', quantity: 2 });
            rewardTotals['Cola'] = (rewardTotals['Cola'] || 0) + 2;
          } else if (pick === 'shards2') {
            const colors = Object.keys(SHARD_EMOJIS);
            for (let s = 0; s < 2; s += 1) {
              const color = colors[Math.floor(Math.random() * colors.length)];
              const shardId = `${color.toLowerCase()}_shard`;
              user.items = user.items || [];
              const it = user.items.find(itm => itm.itemId === shardId);
              if (it) it.quantity = (it.quantity || 0) + 1;
              else user.items.push({ itemId: shardId, quantity: 1 });
              rewardTotals[`${color} Shard`] = (rewardTotals[`${color} Shard`] || 0) + 1;
            }
          } else if (pick === 'gem') {
            user.gems = (user.gems || 0) + 1;
            rewardTotals['Gems'] = (rewardTotals['Gems'] || 0) + 1;
          } else if (pick === 'reset1') {
            user.resetTokens = (user.resetTokens || 0) + 1;
            rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] = (rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] || 0) + 1;
          }
        }

        // A-Chest special 50% chance extra drop: higher tier goodies including forced artifact/ship/pack
        if (chest.id === 'a_chest' && Math.random() < 0.50) {
          const choices = ['beli100to300', 'gem', 'reset1', 'godtoken', 'artifact_force', 'ship_force', 'pack_force'];
          const pick = choices[Math.floor(Math.random() * choices.length)];
          if (pick === 'beli100to300') {
            const amt = randomInt(100, 300);
            user.balance = (user.balance || 0) + amt;
            rewardTotals['Beli'] = (rewardTotals['Beli'] || 0) + amt;
          } else if (pick === 'gem') {
            user.gems = (user.gems || 0) + 1;
            rewardTotals['Gems'] = (rewardTotals['Gems'] || 0) + 1;
          } else if (pick === 'reset1') {
            user.resetTokens = (user.resetTokens || 0) + 1;
            rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] = (rewardTotals[`<:resettoken:1490738386540171445> Reset Token`] || 0) + 1;
          } else if (pick === 'godtoken') {
            user.items = user.items || [];
            const g = user.items.find(itm => itm.itemId === 'god_token');
            if (g) g.quantity = (g.quantity || 0) + 1;
            else user.items.push({ itemId: 'god_token', quantity: 1 });
            rewardTotals[`${GOD_EMOJI} God Token`] = (rewardTotals[`${GOD_EMOJI} God Token`] || 0) + 1;
          } else if (pick === 'artifact_force') {
            // pick a random artifact globally
            const artifactPool = cards.filter(c => c.artifact && c.pullable);
            const card = artifactPool.length ? artifactPool[Math.floor(Math.random() * artifactPool.length)] : null;
            if (card) {
              // handle duplicate similar to pack logic
              const allVersions = getAllCardVersions(card);
              let bestOwnedEntry = null;
              let bestOwnedId = null;
              for (const versionId of allVersions) {
                const entry = user.ownedCards.find(e => e.cardId === versionId);
                if (entry) {
                  bestOwnedEntry = entry;
                  bestOwnedId = versionId;
                }
              }
              if (bestOwnedEntry && bestOwnedId) {
                // duplicate -> give XP
                bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
                const gained = Math.floor(bestOwnedEntry.xp / 100);
                if (gained > 0) {
                  bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
                  bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
                }
                rewardTotals[`${card.character || card.id} (duplicate)`] = (rewardTotals[`${card.character || card.id} (duplicate)`] || 0) + 1;
              } else {
                user.ownedCards = user.ownedCards || [];
                user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
                rewardTotals[`${card.character || card.id}`] = (rewardTotals[`${card.character || card.id}`] || 0) + 1;
              }
            }
          } else if (pick === 'ship_force') {
            const shipPool = cards.filter(c => c.ship && c.pullable);
            const card = shipPool.length ? shipPool[Math.floor(Math.random() * shipPool.length)] : null;
            if (card) {
              const allVersions = getAllCardVersions(card);
              let bestOwnedEntry = null;
              let bestOwnedId = null;
              for (const versionId of allVersions) {
                const entry = user.ownedCards.find(e => e.cardId === versionId);
                if (entry) {
                  bestOwnedEntry = entry;
                  bestOwnedId = versionId;
                }
              }
              if (bestOwnedEntry && bestOwnedId) {
                rewardTotals[`${card.character || card.id} (duplicate ship)`] = (rewardTotals[`${card.character || card.id} (duplicate ship)`] || 0) + 1;
              } else {
                user.ownedCards = user.ownedCards || [];
                user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
                rewardTotals[`${card.character || card.id}`] = (rewardTotals[`${card.character || card.id}`] || 0) + 1;
              }
            }
          } else if (pick === 'pack_force') {
            // give a random pack (crew)
            const crew = crews[Math.floor(Math.random() * crews.length)];
            if (crew) {
              user.packInventory = user.packInventory || {};
              user.packInventory[crew.name] = (user.packInventory[crew.name] || 0) + 1;
              user.markModified('packInventory');
              const key = `${crew.packEmoji || ''} ${crew.name}`.trim();
              rewardTotals[key] = (rewardTotals[key] || 0) + 1;
            }
          }
        }
      }

      await user.save();

      const rewardLines = Object.entries(rewardTotals).map(([key, value]) => {
        if (key === 'Beli') return `<:beri:1490738445319016651> ${value} Beli`;
        if (key === 'Gems') return `<:gem:1490741488081043577> ${value}x gem${value > 1 ? 's' : ''}`;
        if (key === 'Cola') return `${COLA_EMOJI} ${value}x Cola`;
        // color shard lines like 'Red Shard'
        if (key && key.endsWith('Shard')) {
          const color = key.split(' ')[0];
          const emoji = SHARD_EMOJIS[color] || '';
          return `${emoji} ${value}x ${key}`;
        }
        return `${key} x${value}`;
      });

      const reply = `You opened ${chest.emoji} **${chest.name}** x${quantity} and received:\n${rewardLines.join('\n')}`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply });
    }

    // Fuzzy match pack
    const availablePacks = Object.keys(user.packInventory || {}).filter(p => (user.packInventory[p] || 0) > 0);
    if (availablePacks.length === 0) {
      const reply = 'You have no packs or chests to open.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const matchedPack = availablePacks.find(p => p.toLowerCase().includes(normalizedQuery.toLowerCase())) || null;
    if (!matchedPack) {
      const reply = `**${packQuery}** not found.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if ((user.packInventory[matchedPack] || 0) <= 0) {
      const reply = `You have no ${matchedPack} packs.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Open pack: pull 5 cards along with duplicate info
    // Detect if this pack has any available cards for the pack's faculty.
    const packCheck = simulatePull(user.pityCount, matchedPack, { wishlist: user.wishlistCards });
    if (!packCheck) {
      const reply = `The ${matchedPack} pack cannot be opened because it has no available cards.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const normalizeName = name => name ? name.toLowerCase().replace(/\s+/g, '') : '';
    const isStrawhatPack = name => {
      const normalized = normalizeName(name);
      return normalized.includes('strawhat') && normalized.includes('pirates');
    };
    const normalizedPack = normalizeName(matchedPack);

    // Build pools for this pack faculty
    let artifactCandidates = cards.filter(c => c.artifact && c.pullable && normalizeName(c.faculty) === normalizedPack);
    if (!artifactCandidates.length && isStrawhatPack(matchedPack)) {
      artifactCandidates = cards.filter(c => c.artifact && normalizeName(c.faculty).includes('strawhat'));
    }
    let shipCandidates = cards.filter(c => c.ship && c.pullable && normalizeName(c.faculty) === normalizedPack);

    // Do NOT fallback to global artifact/ship pools. Keep faculty-specific candidates only.
    // If this pack has no artifacts or ships defined, the first card will fall back to a normal card.

    const { pickFromPoolWithWishlist } = require('../utils/cards');
    const pickRandom = (arr) => (arr && arr.length) ? pickFromPoolWithWishlist(arr, user.wishlistCards) : null;

    const pickRankFromRatesWithAllowed = (rates, allowedSet) => {
      const entries = Object.entries(rates).filter(([rk, wt]) => allowedSet.has(rk) && wt > 0);
      if (!entries.length) return null;
      const total = entries.reduce((s, [, wt]) => s + wt, 0);
      let r = Math.random() * total;
      for (const [rk, wt] of entries) {
        r -= wt;
        if (r <= 0) return rk;
      }
      return entries[entries.length - 1][0];
    };

    const getRankForUser = (user, pool) => {
      const allowedRanks = new Set((pool || []).map(c => c.rank));
      if (!allowedRanks.size) return null;
      // If pity active, try pity distribution first
      if (user.pityCount >= PITY_TARGET) {
        const fromPity = pickRankFromRatesWithAllowed(PITY_DISTRIBUTION, allowedRanks);
        if (fromPity) return fromPity;
        const fromPull = pickRankFromRatesWithAllowed(PULL_RATES, allowedRanks);
        if (fromPull) return fromPull;
      }
      const fromPull = pickRankFromRatesWithAllowed(PULL_RATES, allowedRanks);
      if (fromPull) return fromPull;
      // fallback: random allowed rank
      return Array.from(allowedRanks)[Math.floor(Math.random() * allowedRanks.size)];
    };

    const pickFromPoolByRank = (pool, rank) => {
      if (!pool || !pool.length) return null;
      const candidates = pool.filter(c => c.rank === rank);
      if (candidates.length) return pickRandom(candidates);
      return pickRandom(pool);
    };

    const pulledCards = [];

    // Determine first card: ALWAYS artifact (80%) or ship (20%)
    let firstCategory = Math.random() < 0.8 ? 'artifact' : 'ship';
    // If chosen category has no candidates, try the other; if still none, fallback to card
    if (firstCategory === 'artifact' && !artifactCandidates.length) {
      firstCategory = shipCandidates.length ? 'ship' : 'card';
    }
    if (firstCategory === 'ship' && !shipCandidates.length) {
      firstCategory = artifactCandidates.length ? 'artifact' : 'card';
    }

    for (let i = 0; i < 5; i++) {
      let card = null;

      // First card: forced artifact/ship
      if (i === 0) {
        if (firstCategory === 'artifact') {
          const rank = getRankForUser(user, artifactCandidates);
          card = pickFromPoolByRank(artifactCandidates, rank);
        } else if (firstCategory === 'ship') {
          const rank = getRankForUser(user, shipCandidates);
          card = pickFromPoolByRank(shipCandidates, rank);
        } else {
          // pick a normal card (exclude artifacts and ships) using the same pull rarity logic
          let cardPool = cards.filter(c => c.pullable && !c.artifact && !c.ship && normalizeName(c.faculty) === normalizedPack);
          if (!cardPool.length) cardPool = cards.filter(c => c.pullable && !c.artifact && !c.ship);
          const rank = getRankForUser(user, cardPool);
          card = pickFromPoolByRank(cardPool, rank) || pickRandom(cardPool) || simulatePull(user.pityCount, matchedPack, { wishlist: user.wishlistCards });
        }
        if (!card) {
          const reply = `The ${matchedPack} pack cannot be opened because it has no available cards.`;
          if (message) return message.channel.send(reply);
          return interaction.reply({ content: reply, ephemeral: true });
        }
      } else if (i === 4) {
        // Last card: guaranteed S+ (ship/artifact -> Guaranteed S; card -> 90% S, 8% SS, 2% UR)
        // First choose category by 97/2/1 weights (cards/artifact/ship)
        const r = Math.random() * 100;
        let cat = r < 97 ? 'card' : (r < 99 ? 'artifact' : 'ship');
        // if chosen category empty, fallback to next available
        if (cat === 'artifact' && !artifactCandidates.length) cat = shipCandidates.length ? 'ship' : 'card';
        if (cat === 'ship' && !shipCandidates.length) cat = artifactCandidates.length ? 'artifact' : 'card';

        if (cat === 'ship') {
          // pick guaranteed S ship
          const sPool = shipCandidates.filter(c => c.rank === 'S');
          card = pickRandom(sPool.length ? sPool : shipCandidates);
        } else if (cat === 'artifact') {
          const sPool = artifactCandidates.filter(c => c.rank === 'S');
          card = pickRandom(sPool.length ? sPool : artifactCandidates);
        } else {
          // card: choose rank among S/SS/UR with 90/8/2
          const LAST_RATES = { S: 90, SS: 8, UR: 2 };
          const pool = cards.filter(c => c.pullable && !c.artifact && !c.ship && normalizeName(c.faculty) === normalizedPack);
          const allowed = new Set(pool.map(c => c.rank));
          // pick rank from LAST_RATES but only allowed
          const pickRankFromLastWithAllowed = (rates, allowedSet) => {
            const entries = Object.entries(rates).filter(([rk, wt]) => allowedSet.has(rk) && wt > 0);
            if (!entries.length) return null;
            const total = entries.reduce((s, [, wt]) => s + wt, 0);
            let rr = Math.random() * total;
            for (const [rk, wt] of entries) {
              rr -= wt;
              if (rr <= 0) return rk;
            }
            return entries[entries.length - 1][0];
          };
          let chosenRank = pickRankFromLastWithAllowed(LAST_RATES, allowed);
          if (!chosenRank) {
            // fallback to highest rank available
            const order = ['UR', 'SS', 'S'];
            chosenRank = order.find(rk => allowed.has(rk)) || null;
          }
          if (chosenRank) card = pickFromPoolByRank(pool, chosenRank);
          if (!card) card = simulatePull(user.pityCount, matchedPack, { wishlist: user.wishlistCards });
        }

        if (!card) {
          const reply = `The ${matchedPack} pack cannot be opened because it has no available cards.`;
          if (message) return message.channel.send(reply);
          return interaction.reply({ content: reply, ephemeral: true });
        }
      } else {
        // Middle cards: choose category by 97% card, 2% artifact, 1% ship
        const r = Math.random() * 100;
        let cat = r < 97 ? 'card' : (r < 99 ? 'artifact' : 'ship');
        if (cat === 'artifact' && !artifactCandidates.length) cat = 'card';
        if (cat === 'ship' && !shipCandidates.length) cat = 'card';

        if (cat === 'card') {
          // pick a normal card (exclude artifacts and ships) using the same pull rarity logic
          let cardPool = cards.filter(c => c.pullable && !c.artifact && !c.ship && normalizeName(c.faculty) === normalizedPack);
          if (!cardPool.length) cardPool = cards.filter(c => c.pullable && !c.artifact && !c.ship);
          const rank = getRankForUser(user, cardPool);
          card = pickFromPoolByRank(cardPool, rank) || pickRandom(cardPool) || simulatePull(user.pityCount, matchedPack, { wishlist: user.wishlistCards });
        } else if (cat === 'artifact') {
          const rank = getRankForUser(user, artifactCandidates);
          card = pickFromPoolByRank(artifactCandidates, rank) || pickRandom(artifactCandidates);
        } else if (cat === 'ship') {
          const rank = getRankForUser(user, shipCandidates);
          card = pickFromPoolByRank(shipCandidates, rank) || pickRandom(shipCandidates);
        }

        if (!card) {
          const reply = `The ${matchedPack} pack cannot be opened because it has no available cards.`;
          if (message) return message.channel.send(reply);
          return interaction.reply({ content: reply, ephemeral: true });
        }
      }
      // compute duplicate text same as pull.js logic
      let duplicateText = '';
      const allVersions = getAllCardVersions(card);
      let bestOwnedEntry = null;
      let bestOwnedId = null;
      for (const versionId of allVersions) {
        const entry = user.ownedCards.find(e => e.cardId === versionId);
        if (entry) {
          bestOwnedEntry = entry;
          bestOwnedId = versionId;
        }
      }
      if (bestOwnedEntry && bestOwnedId) {
        const bestOwnedCard = getCardById(bestOwnedId);
        if (card.ship) {
          duplicateText = 'Duplicate ship already owned';
        } else if (card.mastery < bestOwnedCard.mastery) {
          bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
          const gained = Math.floor(bestOwnedEntry.xp / 100);
          if (gained > 0) {
            bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
            bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
          }
          duplicateText = `Duplicate +100 XP${gained ? ` (+${gained} lvl)` : ''}`;
        } else if (card.mastery === bestOwnedCard.mastery) {
          bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
          const gained = Math.floor(bestOwnedEntry.xp / 100);
          if (gained > 0) {
            bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
            bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
          }
          duplicateText = `Duplicate +100 XP${gained ? ` (+${gained} lvl)` : ''}`;
        } else {
          // Higher version - add new and remove lower ones
          if (!user.team || !user.team.includes(bestOwnedId)) {
            user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
            user.ownedCards = user.ownedCards.filter(e => {
              const eCard = getCardById(e.cardId);
              if (!eCard || eCard.character !== card.character) return true;
              return eCard.mastery >= card.mastery;
            });
            if (!user.history.includes(card.id)) user.history.push(card.id);
            duplicateText = `Upgraded!`;
          } else {
            bestOwnedEntry.xp = (bestOwnedEntry.xp || 0) + 100;
            const gained = Math.floor(bestOwnedEntry.xp / 100);
            if (gained > 0) {
              bestOwnedEntry.level = (bestOwnedEntry.level || 1) + gained;
              bestOwnedEntry.xp = bestOwnedEntry.xp % 100;
            }
            duplicateText = `Duplicate +100 XP${gained ? ` (+${gained} lvl)` : ''} (upgrade blocked while on team)`;
          }
        }
      } else {
        user.ownedCards.push({ cardId: card.id, level: 1, xp: 0 });
        if (!user.history.includes(card.id)) user.history.push(card.id);
      }
      pulledCards.push({ card, dup: duplicateText });
      // Update pity
      user.pityCount += 1;
      if (user.pityCount >= require('../config').PITY_TARGET) {
        user.pityCount = 0;
      }
    }

    // Preserve the pack draw order so the first pulled card remains the guaranteed artifact
    // and the final card retains the upgrade/chance logic.
    // add cards to inventory already done above while building dup texts
    // (no additional loop needed)


    // Determine which pulled cards were favorited or wishlisted at the time
    // of the pull so we can show a star on those embeds even after we remove
    // wishlist entries when saving.
    const pulledIds = pulledCards.map(p => p.card.id);
    const starIds = [];
    if (Array.isArray(user.favoriteCards)) {
      for (const id of user.favoriteCards) if (pulledIds.includes(id)) starIds.push(id);
    }
    if (Array.isArray(user.wishlistCards)) {
      for (const id of user.wishlistCards) if (pulledIds.includes(id) && !starIds.includes(id)) starIds.push(id);
    }

    // Build first embed before we remove wishlist entries so the embed will
    // show the star for wishlisted cards that were just pulled.
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const firstEmbed = buildPullEmbed(pulledCards[0].card, username, avatarUrl, '', pulledCards[0].dup, user);

    // Remove any pulled cards from the user's wishlist now that they own them.
    if (Array.isArray(user.wishlistCards) && user.wishlistCards.length) {
      user.wishlistCards = user.wishlistCards.filter(id => !pulledIds.includes(id));
      if (typeof user.markModified === 'function') user.markModified('wishlistCards');
    }

    // Decrement pack count
    user.packInventory[matchedPack] -= 1;
    if (user.packInventory[matchedPack] <= 0) {
      delete user.packInventory[matchedPack];
    }
    user.markModified('packInventory');

    // Update total pulls
    user.totalPulls = (user.totalPulls || 0) + 5;

    await user.save();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_next:${userId}:0`)
        .setLabel('Next Card')
        .setStyle(ButtonStyle.Primary)
    );

    // Store the pulled cards in a map for the session, including starIds so
    // later pages can still render a star even though wishlist entries were
    // removed from the persisted user.
    if (!global.packSessions) global.packSessions = new Map();
    global.packSessions.set(`${userId}_pack`, { cards: pulledCards, pack: matchedPack, starIds });

    if (message) {
      const sent = await message.channel.send({ embeds: [firstEmbed], components: [row] });
    } else {
      await interaction.reply({ embeds: [firstEmbed], components: [row] });
    }
  },

  async handleButton(interaction, customId) {
    const [cmd, userId, indexStr] = customId.split(':');
    const index = parseInt(indexStr);

    const session = global.packSessions.get(`${interaction.user.id}_pack`);
    if (!session) {
      return interaction.reply({ content: 'Pack session expired or not your session.', ephemeral: true });
    }

    const pulledCards = session.cards;
    const matchedPack = session.pack;

    const nextIndex = index + 1;
    if (nextIndex > pulledCards.length || !pulledCards[nextIndex]) {
      return interaction.reply({ content: 'No more cards in this pack.', ephemeral: true });
    }

    const username = interaction.user.username;
    const avatarUrl = interaction.user.displayAvatarURL();
    // Fetch the latest user document to know about favorites, but use the
    // session's starIds to force a star for cards that were wishlisted at
    // the time of the pull.
    const user = await User.findOne({ userId: interaction.user.id });
    const forceStar = Array.isArray(session.starIds) && session.starIds.includes(pulledCards[nextIndex].card.id);
    const embed = buildPullEmbed(pulledCards[nextIndex].card, username, avatarUrl, '', pulledCards[nextIndex].dup, user, { forceStar });

    const row = (nextIndex + 1 >= pulledCards.length) ? [] : [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_next:${userId}:${nextIndex}`)
        .setLabel('Next Card')
        .setStyle(ButtonStyle.Primary)
    )];

    await interaction.update({ embeds: [embed], components: row });
  }
};