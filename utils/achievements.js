const { EmbedBuilder } = require('discord.js');
const { cards: allCards } = require('../data/cards');
const { getChestById } = require('../data/chests');
const User = require('../models/User');

function normalizeKey(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Precompute faculty card sets (normalized faculty -> list of card ids)
const facultyMap = {};
for (const c of allCards) {
  if (!c.faculty) continue;
  const key = normalizeKey(c.faculty);
  facultyMap[key] = facultyMap[key] || [];
  facultyMap[key].push(c.id);
}

const ACHIEVEMENTS = [
  {
    id: 'pull_100',
    title: 'Collector',
    icon: '<:100cards:1493739584234979338>',
    check: (user) => (user.totalPulls || 0) >= 100,
    reward: { beli: 100, chests: [{ id: 'c_chest', count: 1 }] },
    reason: 'pulling 100 cards'
  },
  {
    id: 'pull_1000',
    title: 'Collector II',
    icon: '<:1000cards:1493739865593090048>',
    check: (user) => (user.totalPulls || 0) >= 1000,
    reward: { beli: 1000, chests: [{ id: 'b_chest', count: 3 }, { id: 'a_chest', count: 1 }] },
    reason: 'pulling 1000 cards'
  },
  {
    id: 'strawhat_pirate',
    title: 'Strawhat Pirate',
    icon: '<:strawhatsbadge:1493740709537255426>',
    check: (user) => {
      const set = facultyMap['strawhatpirates'] || [];
      if (set.length === 0) return false;
      const owned = new Set((user.ownedCards || []).map(e => e.cardId));
      return set.every(id => owned.has(id));
    },
    reward: { beli: 5000, chests: [{ id: 'a_chest', count: 5 }, { id: 'b_chest', count: 10 }, { id: 'c_chest', count: 25 }] },
    reason: 'collecting all Strawhat Pirates cards'
  },
  {
    id: 'ur_card',
    title: 'Adept Pirate',
    icon: '<:UR:1493742900247531572>',
    check: (user) => {
      const owned = (user.ownedCards || []).map(e => e.cardId);
      return owned.some(id => {
        const def = allCards.find(c => c.id === id);
        return def && def.rank === 'UR';
      });
    },
    reward: { beli: 100, chests: [{ id: 'c_chest', count: 1 }] },
    reason: 'obtaining a UR rank card'
  },
  {
    id: 'bounty_5m',
    title: 'Wanted Pirate',
    icon: '<:5mbountybadge:1493757902370897930>',
    check: (user) => (user.bounty || 0) >= 5000000,
    reward: { beli: 100, chests: [{ id: 'c_chest', count: 1 }] },
    reason: "obtaining a bounty of 5'000'000"
  },
  {
    id: 'powerful_pirate',
    title: 'Powerful Pirate',
    icon: '<:100powerbadge:1493745762620932127>',
    check: (user) => {
      // compute team power
      const team = user.team || [];
      if (!team.length) return false;
      let total = 0;
      for (const id of team) {
        const def = allCards.find(c => c.id === id);
        if (!def) continue;
        total += def.power || 0;
      }
      return total >= 100;
    },
    reward: { beli: 500, chests: [{ id: 'c_chest', count: 3 }, { id: 'b_chest', count: 1 }] },
    reason: 'forming a team with power 100 or more'
  },
  {
    id: 'lvl_100',
    title: 'Expert Pirate',
    icon: '<:LVL100badge:1493746306819162242>',
    check: (user) => {
      const owned = user.ownedCards || [];
      return owned.some(e => (e.level || 1) >= 100);
    },
    reward: { beli: 1000, chests: [{ id: 'c_chest', count: 10 }, { id: 'b_chest', count: 3 }, { id: 'a_chest', count: 1 }] },
    reason: 'getting a card to level 100'
  }
];

async function awardAchievement(user, achId, client) {
  if (!user || !achId) return;
  const def = ACHIEVEMENTS.find(a => a.id === achId);
  if (!def) return;

  // Attempt atomic mark of achievement to prevent duplicates across concurrent processes
  const query = { userId: user.userId, [`achievements.${achId}`]: { $exists: false } };
  const update = { $set: { [`achievements.${achId}`]: new Date() }, $addToSet: { badgesOwned: achId } };
  // Apply immediate simple rewards atomically where possible
  if (def.reward && typeof def.reward.beli === 'number') {
    update.$inc = Object.assign(update.$inc || {}, { balance: def.reward.beli });
  }

  const updated = await User.findOneAndUpdate(query, update, { new: true });
  if (!updated) {
    // Someone else already awarded this achievement
    return;
  }

  // Apply non-atomic rewards (chests, packs) on the updated document
  if (def.reward) {
    if (def.reward.chests) {
      updated.items = updated.items || [];
      for (const ch of def.reward.chests) {
        const existing = updated.items.find(it => it.itemId === ch.id);
        if (existing) existing.quantity += ch.count;
        else updated.items.push({ itemId: ch.id, quantity: ch.count });
      }
      updated.markModified('items');
    }
    if (def.reward.packs) {
      updated.packInventory = updated.packInventory || {};
      for (const p of def.reward.packs) {
        updated.packInventory[p.rank] = (updated.packInventory[p.rank] || 0) + (p.count || 0);
      }
      updated.markModified('packInventory');
    }
  }

  await updated.save();

  // send DM to user with reward breakdown
  try {
    const discordUser = await client.users.fetch(updated.userId).catch(() => null);
    if (discordUser) {
      const nextEmoji = '<:next:1489374606916714706>';
      const beliIcon = '<:beri:1490738445319016651>';
      const gemIcon = '<:gem:1490741488081043577>';

      const embed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle('Achievement Unlocked!')
        .setDescription(`You got the achievement **${def.icon} ${def.title}** for ${def.reason}`)
        .setThumbnail(client.user.displayAvatarURL());

      const rewardLines = [];
      if (def.reward) {
        if (def.reward.beli) rewardLines.push(`${nextEmoji} ${beliIcon} ${def.reward.beli} Beli`);
        if (def.reward.gems) rewardLines.push(`${nextEmoji} ${gemIcon} ${def.reward.gems}x Gems`);
        if (def.reward.chests) {
          for (const ch of def.reward.chests) {
            const chestDef = getChestById(ch.id);
            const chestEmoji = chestDef ? chestDef.emoji : ch.id;
            const chestName = chestDef ? chestDef.name : ch.id;
            rewardLines.push(`${nextEmoji} ${chestEmoji} ${ch.count}x ${chestName}`);
          }
        }
        if (def.reward.packs) {
          for (const p of def.reward.packs) {
            rewardLines.push(`${nextEmoji} ${p.count}x ${p.rank} pack`);
          }
        }
      }

      if (rewardLines.length) {
        embed.addFields({ name: 'Rewards obtained', value: rewardLines.join('\n'), inline: false });
      }

      await discordUser.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    // ignore DM failures
  }
}

async function checkAndAwardAll(user, client, context = {}) {
  if (!user) return;
  for (const ach of ACHIEVEMENTS) {
    try {
      const already = user.achievements && user.achievements[ach.id];
      if (already) continue;
      if (ach.check(user, context)) {
        await awardAchievement(user, ach.id, client);
      }
    } catch (err) {
      console.error('Achievement check error', ach.id, err);
    }
  }
}

module.exports = { ACHIEVEMENTS, checkAndAwardAll, awardAchievement };
