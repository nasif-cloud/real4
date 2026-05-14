const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');

const VOTE_CHEST_IDS = ['c_chest', 'b_chest', 'a_chest'];
const GOD_TOKEN_STREAK_INTERVAL = 5;

function randomChestId() {
  return VOTE_CHEST_IDS[Math.floor(Math.random() * VOTE_CHEST_IDS.length)];
}

function startVoteWebhook(discordClient) {
  const app = express();

  // Parse raw body for signature verification
  app.use('/webhook/topgg', express.raw({ type: '*/*' }));
  app.use(express.json());

  app.post('/webhook/topgg', async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      const expectedAuth = process.env.TOPGG_WEBHOOK_AUTH;

      if (!expectedAuth || auth !== expectedAuth) {
        console.warn('[vote-webhook] Unauthorized request rejected');
        return res.status(401).send('Unauthorized');
      }

      const rawBody = req.body;
      let payload;
      try {
        payload = JSON.parse(rawBody.toString());
      } catch (e) {
        return res.status(400).send('Bad Request');
      }

      // top.gg sends { user, bot, type, isWeekend }
      const voterId = payload.user;
      const type = payload.type;

      // Acknowledge immediately — top.gg requires a 2xx within 5 seconds
      res.status(200).send('OK');

      if (type === 'test') {
        console.log(`[vote-webhook] Test ping received for user ${voterId}`);
        return;
      }

      if (!voterId) return;

      // Find or create user
      let user = await User.findOne({ userId: voterId });
      if (!user) {
        console.log(`[vote-webhook] Vote from unknown user ${voterId} — no account`);
        return;
      }

      // Update streak
      const now = new Date();
      const lastVoted = user.lastVoted ? new Date(user.lastVoted) : null;
      const hoursSinceLast = lastVoted ? (now - lastVoted) / (1000 * 60 * 60) : Infinity;

      // Reset streak if more than 48 hours since last vote (missed a cycle)
      if (hoursSinceLast > 48) {
        user.voteStreak = 0;
      }

      user.voteStreak = (user.voteStreak || 0) + 1;
      user.lastVoted = now;

      // Give 1 reset token
      user.resetTokens = (user.resetTokens || 0) + 1;

      // Give 1 random chest
      const chestId = randomChestId();
      user.items = user.items || [];
      const existingChest = user.items.find(i => i.itemId === chestId);
      if (existingChest) {
        existingChest.quantity = (existingChest.quantity || 0) + 1;
      } else {
        user.items.push({ itemId: chestId, quantity: 1 });
      }

      // Every 5-streak: give 1 god token
      const earnedGodToken = user.voteStreak % GOD_TOKEN_STREAK_INTERVAL === 0;
      if (earnedGodToken) {
        const godToken = user.items.find(i => i.itemId === 'god_token');
        if (godToken) {
          godToken.quantity = (godToken.quantity || 0) + 1;
        } else {
          user.items.push({ itemId: 'god_token', quantity: 1 });
        }
      }

      await user.save();

      // DM the voter with their rewards
      if (discordClient) {
        try {
          const discordUser = await discordClient.users.fetch(voterId).catch(() => null);
          if (discordUser) {
            const { EmbedBuilder } = require('discord.js');
            const chestNames = { c_chest: 'C Chest', b_chest: 'B Chest', a_chest: 'A Chest' };
            const chestEmojis = {
              c_chest: '<:Cchest:1492559506868146307>',
              b_chest: '<:Bchest:1492559568738451567>',
              a_chest: '<:Achest:1492559635507450068>'
            };

            let rewardLines = [
              `<:resettoken:1490738386540171445> **1x Reset Token**`,
              `${chestEmojis[chestId]} **1x ${chestNames[chestId]}**`
            ];
            if (earnedGodToken) {
              rewardLines.push(`<:godtoken:1499957056650608753> **1x God Token** (Vote Streak x${user.voteStreak}!)`);
            }

            const embed = new EmbedBuilder()
              .setColor('#FFFFFF')
              .setTitle('Thanks for voting!')
              .setDescription(`You voted for the bot on top.gg and received:\n\n${rewardLines.join('\n')}`)
              .setFooter({ text: `Vote streak: ${user.voteStreak} — vote again in 12 hours!` })
              .setThumbnail(discordClient.user.displayAvatarURL());

            await discordUser.send({ embeds: [embed] }).catch(() => {});
          }
        } catch (err) {
          console.error('[vote-webhook] Failed to DM voter:', err);
        }
      }

      console.log(`[vote-webhook] Processed vote for user ${voterId} (streak: ${user.voteStreak}${earnedGodToken ? ', god token awarded' : ''})`);
    } catch (err) {
      console.error('[vote-webhook] Error processing vote:', err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  });

  // Health check
  app.get('/webhook/topgg', (req, res) => res.send('Vote webhook active'));

  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Vote webhook listening on port ${port} (https://${process.env.REPLIT_DEV_DOMAIN}/webhook/topgg)`);
  });
}

module.exports = { startVoteWebhook };
