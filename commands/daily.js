const User = require('../models/User');
const { EmbedBuilder } = require('discord.js');
const crews = require('../data/crews');

const DAILY_REWARDS = {
  1: {
    beli: [10, 100],
    gems: [0, 1],
    packs: [{ rank: 'C', count: 1 }]
  },
  2: {
    beli: [50, 250],
    gems: [1, 2],
    packs: [{ rank: 'C', count: 2 }]
  },
  3: {
    beli: [100, 300],
    gems: [1, 3],
    packs: [{ rank: 'C', count: 2 }, { rank: 'B', count: 1 }]
  },
  4: {
    beli: [250, 500],
    gems: [2, 3],
    packs: [{ rank: 'B', count: 2 }, { rank: 'A', count: 0.3 }] // 30% chance for A
  },
  5: {
    beli: [500, 1000],
    gems: [3, 5],
    packs: [{ rank: 'B', count: 2 }, { rank: 'A', count: 1 }, { rank: 'S', count: 0.3 }] // 30% chance for S
  }
};

// Map pack ranks to crew ranks
const PACK_TO_CREW_RANK = {
  'C': 'D',
  'B': 'A',
  'A': 'A',
  'S': 'S'
};

function getRandomCrewByRank(rank) {
  const crewRank = PACK_TO_CREW_RANK[rank];
  const availableCrews = crews.filter(c => c.rank === crewRank);
  if (availableCrews.length === 0) return null;
  return availableCrews[Math.floor(Math.random() * availableCrews.length)];
}

function getStreakString(streak) {
  const filled = '★'.repeat(streak);
  const empty = '☆'.repeat(5 - streak);
  return filled + empty;
}

module.exports = {
  name: 'daily',
  description: 'Claim your daily rewards',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    user.packInventory = user.packInventory || {};
    user.dailyStreak = typeof user.dailyStreak === 'number' ? user.dailyStreak : 0;

    const now = new Date();
    const lastDaily = user.lastDaily ? new Date(user.lastDaily) : null;
    const timeSinceLast = lastDaily ? now - lastDaily : null;

    // Check if can claim
    if (lastDaily && timeSinceLast < 24 * 60 * 60 * 1000) {
      const remainingMs = 24 * 60 * 60 * 1000 - timeSinceLast;
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const reply = `You can claim your daily reward in \`${hours}h ${minutes}m\`.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Calculate streak
    let newStreak = 1;
    if (lastDaily && timeSinceLast < 48 * 60 * 60 * 1000) {
      // Within 48 hours, continue streak
      newStreak = user.dailyStreak + 1;
    }
    // Cap at 5
    if (newStreak > 5) newStreak = 5;

    const rewards = DAILY_REWARDS[newStreak];

    // Calculate rewards
    const beliReward = Math.floor(Math.random() * (rewards.beli[1] - rewards.beli[0] + 1)) + rewards.beli[0];
    const gemsReward = Math.floor(Math.random() * (rewards.gems[1] - rewards.gems[0] + 1)) + rewards.gems[0];

    let packRewards = [];
    for (const pack of rewards.packs) {
      let count = pack.count;
      if (count < 1) {
        // Chance
        if (Math.random() < count) count = 1;
        else count = 0;
      }
      for (let i = 0; i < Math.floor(count); i++) {
        const crew = getRandomCrewByRank(pack.rank);
        if (crew) {
          packRewards.push(crew.name);
          user.packInventory[crew.name] = (user.packInventory[crew.name] || 0) + 1;
        }
      }
    }

    // Apply rewards
    user.balance += beliReward;
    user.gems += gemsReward;
    user.lastDaily = now;
    user.dailyStreak = newStreak;
    user.markModified('packInventory');
    await user.save();

    // Emoji constants
    const nextEmoji = '<:next:1489374606916714706>';
    const beliIcon = '<:beli:1482371237991239681>';
    const gemIcon = '<:gem:1482371241231239682>';
    // Find a pack emoji for each pack (use crew icon)
    let packLines = [];
    if (packRewards.length > 0) {
      for (const packName of packRewards) {
        const crew = crews.find(c => c.name === packName);
        const packEmoji = crew && crew.icon ? crew.icon : '';
        packLines.push(`${nextEmoji} 1 ${packEmoji} ${packName}`);
      }
    }
    // Compose lines
    const lines = [
      '**Daily rewards claimed!**',
      `${nextEmoji} ${beliReward} beli ${beliIcon}`,
      `${nextEmoji} ${gemsReward} gems ${gemIcon}`
    ];
    if (packLines.length > 0) {
      lines.push(...packLines);
    }
    lines.push(`\n**Streak**: ${getStreakString(newStreak)}`);
    lines.push(`-# come back in \`${hours}h ${minutes}m\` for more rewards.`);

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setDescription(lines.join('\n'))
      .setAuthor({ name: discordUser.username, iconURL: discordUser.displayAvatarURL() });

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};