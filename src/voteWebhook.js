const express = require('express');
const User = require('../models/User');

const VOTE_CHEST_IDS = ['c_chest', 'b_chest', 'a_chest'];
const GOD_TOKEN_STREAK_INTERVAL = 5;
const CHEST_NAMES = { c_chest: 'C Chest', b_chest: 'B Chest', a_chest: 'A Chest' };
const CHEST_EMOJIS = {
  c_chest: '<:Cchest:1492559506868146307>',
  b_chest: '<:Bchest:1492559568738451567>',
  a_chest: '<:Achest:1492559635507450068>'
};

let _client = null;

function setClient(client) {
  _client = client;
  console.log('[vote-webhook] Discord client attached.');
}

function randomChestId() {
  return VOTE_CHEST_IDS[Math.floor(Math.random() * VOTE_CHEST_IDS.length)];
}

function startVoteWebhook() {
  const app = express();

  // Use json() for most routes, raw() only for the topgg webhook so we can log the raw body
  app.use('/webhook/topgg', express.raw({ type: '*/*' }));

  app.post('/webhook/topgg', async (req, res) => {
    console.log('[vote-webhook] Incoming POST /webhook/topgg');

    try {
      // Auth check
      const auth = req.headers['authorization'];
      const expectedAuth = process.env.TOPGG_WEBHOOK_AUTH;

      if (!expectedAuth) {
        console.error('[vote-webhook] ERROR: TOPGG_WEBHOOK_AUTH secret is not set!');
        return res.status(500).send('Server misconfigured');
      }

      if (auth !== expectedAuth) {
        console.warn(`[vote-webhook] Unauthorized — received auth: "${auth ? auth.slice(0, 8) + '...' : 'none'}"`);
        return res.status(401).send('Unauthorized');
      }

      // Parse body
      let payload;
      try {
        const raw = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
        console.log(`[vote-webhook] Raw body: ${raw}`);
        payload = JSON.parse(raw);
      } catch (e) {
        console.error('[vote-webhook] ERROR: Failed to parse JSON body:', e.message);
        return res.status(400).send('Bad Request');
      }

      const voterId = payload.user;
      const type = payload.type;
      console.log(`[vote-webhook] Parsed payload — type: ${type}, user: ${voterId}, isWeekend: ${payload.isWeekend}`);

      // Acknowledge immediately (top.gg needs 2xx within 5s)
      res.status(200).send('OK');

      if (type === 'test') {
        console.log(`[vote-webhook] Test ping received — webhook is working!`);
        return;
      }

      if (!voterId) {
        console.error('[vote-webhook] ERROR: No user ID in payload');
        return;
      }

      // Find user account
      let user = await User.findOne({ userId: voterId });
      if (!user) {
        console.warn(`[vote-webhook] User ${voterId} voted but has no bot account — no rewards given`);
        return;
      }

      console.log(`[vote-webhook] Found account for user ${voterId} (current streak: ${user.voteStreak || 0})`);

      // Streak logic — reset if more than 48 hours since last vote
      const now = new Date();
      const lastVoted = user.lastVoted ? new Date(user.lastVoted) : null;
      const hoursSinceLast = lastVoted ? (now - lastVoted) / (1000 * 60 * 60) : Infinity;
      if (hoursSinceLast > 48) {
        console.log(`[vote-webhook] Streak reset for ${voterId} (${hoursSinceLast.toFixed(1)}h since last vote)`);
        user.voteStreak = 0;
      }

      user.voteStreak = (user.voteStreak || 0) + 1;
      user.lastVoted = now;

      // Reward: 1 reset token
      user.resetTokens = (user.resetTokens || 0) + 1;
      console.log(`[vote-webhook] Gave 1 reset token to ${voterId}`);

      // Reward: 1 random chest
      const chestId = randomChestId();
      user.items = user.items || [];
      const existingChest = user.items.find(i => i.itemId === chestId);
      if (existingChest) {
        existingChest.quantity = (existingChest.quantity || 0) + 1;
      } else {
        user.items.push({ itemId: chestId, quantity: 1 });
      }
      console.log(`[vote-webhook] Gave 1x ${CHEST_NAMES[chestId]} to ${voterId}`);

      // Reward: god token every 5-streak
      const earnedGodToken = user.voteStreak % GOD_TOKEN_STREAK_INTERVAL === 0;
      if (earnedGodToken) {
        const godToken = user.items.find(i => i.itemId === 'god_token');
        if (godToken) {
          godToken.quantity = (godToken.quantity || 0) + 1;
        } else {
          user.items.push({ itemId: 'god_token', quantity: 1 });
        }
        console.log(`[vote-webhook] Gave 1x God Token to ${voterId} (streak milestone: ${user.voteStreak})`);
      }

      await user.save();
      console.log(`[vote-webhook] ✅ Rewards saved for user ${voterId} — streak: ${user.voteStreak}${earnedGodToken ? ', +God Token' : ''}`);

      // DM the voter
      if (_client) {
        try {
          const discordUser = await _client.users.fetch(voterId).catch(() => null);
          if (!discordUser) {
            console.warn(`[vote-webhook] Could not fetch Discord user ${voterId} for DM`);
            return;
          }

          const { EmbedBuilder } = require('discord.js');
          const rewardLines = [
            `<:resettoken:1490738386540171445> **1x Reset Token**`,
            `${CHEST_EMOJIS[chestId]} **1x ${CHEST_NAMES[chestId]}**`
          ];
          if (earnedGodToken) {
            rewardLines.push(`<:godtoken:1499957056650608753> **1x God Token** (Vote Streak x${user.voteStreak}!)`);
          }

          const nextMilestone = GOD_TOKEN_STREAK_INTERVAL - (user.voteStreak % GOD_TOKEN_STREAK_INTERVAL);
          const footerText = nextMilestone === GOD_TOKEN_STREAK_INTERVAL
            ? `Vote streak: ${user.voteStreak} — vote again in 12 hours!`
            : `Vote streak: ${user.voteStreak} — ${nextMilestone} more vote(s) until a God Token!`;

          const embed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setTitle('Thanks for voting!')
            .setDescription(`You voted for the bot on top.gg and received:\n\n${rewardLines.join('\n')}`)
            .setFooter({ text: footerText })
            .setThumbnail(_client.user.displayAvatarURL());

          await discordUser.send({ embeds: [embed] });
          console.log(`[vote-webhook] DM sent successfully to ${voterId}`);
        } catch (dmErr) {
          console.error(`[vote-webhook] Failed to DM user ${voterId}:`, dmErr.message);
        }
      } else {
        console.warn('[vote-webhook] Discord client not attached yet — DM skipped');
      }

    } catch (err) {
      console.error('[vote-webhook] UNCAUGHT ERROR processing vote:', err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  });

  app.get('/webhook/topgg', (req, res) => {
    res.send('Vote webhook is active. Set this URL in top.gg: POST /webhook/topgg');
  });

  // Diagnostic endpoint — visit /webhook-status to confirm the server is reachable
  app.get('/webhook-status', (req, res) => {
    const authConfigured = !!process.env.TOPGG_WEBHOOK_AUTH;
    const clientReady = !!_client;
    res.json({
      status: 'running',
      authConfigured,
      discordClientReady: clientReady,
      webhookUrl: 'POST /webhook/topgg',
    });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[vote-webhook] Listening on port ${port}`);
    console.log(`[vote-webhook] Register this URL in top.gg dashboard → Webhooks: https://<your-domain>/webhook/topgg`);
  });
}

module.exports = { startVoteWebhook, setClient };
