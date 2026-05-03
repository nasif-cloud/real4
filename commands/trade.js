const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { getCardById, formatCardId } = require('../utils/cards');

// Local item display mapping (kept in sync with `commands/inventory.js`)
const ITEM_DISPLAY_NAMES = {
  red_shard: 'Red Shard',
  blue_shard: 'Blue Shard',
  green_shard: 'Green Shard',
  yellow_shard: 'Yellow Shard',
  purple_shard: 'Purple Shard'
};
const ITEM_DISPLAY_EMOJIS = {
  red_shard: '<:RedShard:1494106374492131439>',
  blue_shard: '<:Blueshard:1494106500149411980>',
  green_shard: '<:GreenShard:1494106686963581039>',
  yellow_shard: '<:YellowShard:1494106825627406530>',
  purple_shard: '<:PurpleShard:1494106958582776008>'
};

function parseMention(mention) {
  if (!mention) return null;
  const m = mention.match(/^<@!?(\d+)>$/);
  return m ? m[1] : null;
}

function shardCostForRank(rank) {
  switch ((rank || '').toUpperCase()) {
    case 'A': return 1;
    case 'S': return 2;
    case 'SS': return 3;
    case 'UR': return 4;
    default: return 0;
  }
}

function shardIdForAttribute(attr) {
  switch ((attr || '').toUpperCase()) {
    case 'DEX': return 'green_shard';
    case 'STR': return 'red_shard';
    case 'PSY': return 'yellow_shard';
    case 'QCK': return 'blue_shard';
    case 'INT': return 'purple_shard';
    default: return null;
  }
}

function findItemCount(items, itemId) {
  if (!Array.isArray(items)) return 0;
  const it = items.find(i => i.itemId === itemId);
  return it ? (it.quantity || 0) : 0;
}

function removeItem(items, itemId, count) {
  if (!Array.isArray(items) || count <= 0) return items;
  const idx = items.findIndex(i => i.itemId === itemId);
  if (idx === -1) return items;
  items[idx].quantity = (items[idx].quantity || 0) - count;
  if (items[idx].quantity <= 0) items.splice(idx, 1);
  return items;
}

function totalXpFromEntry(entry) {
  const lvl = (entry && typeof entry.level === 'number') ? entry.level : 1;
  const xp = (entry && typeof entry.xp === 'number') ? entry.xp : 0;
  // Treat each physical card copy as worth `level * 100 + xp` XP when
  // converting duplicates into XP. This makes a level 1 copy worth 100 XP
  // (matching duplicate rewards) and preserves higher-level progress.
  return (lvl * 100) + xp;
}

function applyIncomingEntryAsXp(user, incomingEntry) {
  if (!user || !incomingEntry) return false;
  user.ownedCards = user.ownedCards || [];
  const existing = user.ownedCards.find(e => e.cardId === incomingEntry.cardId);
  if (!existing) return false;
  const incomingXp = totalXpFromEntry(incomingEntry);
  existing.xp = (existing.xp || 0) + incomingXp;
  const gained = Math.floor(existing.xp / 100);
  if (gained > 0) {
    existing.level = (existing.level || 1) + gained;
    existing.xp = existing.xp % 100;
  }
  return true;
}

function cardHasArtifactEquipped(user, cardId) {
  if (!user || !Array.isArray(user.ownedCards) || !cardId) return false;
  return user.ownedCards.some(e => {
    const def = getCardById(e.cardId);
    return def && def.artifact && e.equippedTo === cardId;
  });
}

// Simple in-memory session map for pending trades
if (!global.tradeSessions) global.tradeSessions = new Map();

module.exports = {
  name: 'trade',
  description: 'Propose a trade: card-for-card or beli-for-card. Use `*` prefix for beli (e.g. *100)',
  options: [
    { name: 'offer', type: 3, description: 'Offered cardId or *<beli>', required: true },
    { name: 'want', type: 3, description: 'Requested cardId', required: true },
    { name: 'target', type: 6, description: 'Target user', required: true }
  ],

  async execute({ message, interaction, args }) {
    const initiatorId = message ? message.author.id : interaction.user.id;
    const initiatorName = message ? message.author.username : interaction.user.username;
    const rawOffer = message ? args[0] : interaction.options.getString('offer');
    const wantCardId = message ? args[1] : interaction.options.getString('want');
    const mention = message ? args[2] : interaction.options.getUser('target')?.id;
    const targetId = message ? parseMention(mention) || mention : mention;

    if (!rawOffer || !wantCardId || !targetId) {
      const reply = 'Usage: op trade <offer|*<beli>> <wantedCardId> <@user>'; 
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (targetId === initiatorId) {
      const r = 'Cannot trade with yourself.';
      if (message) return message.reply(r);
      return interaction.reply({ content: r, ephemeral: true });
    }

    const initiator = await User.findOne({ userId: initiatorId });
    const target = await User.findOne({ userId: targetId });
    if (!initiator) return (message ? message.reply('You have no account.') : interaction.reply({ content: 'You have no account.', ephemeral: true }));
    if (!target) return (message ? message.reply('Target has no account.') : interaction.reply({ content: 'Target has no account.', ephemeral: true }));

    const isBeliOffer = typeof rawOffer === 'string' && rawOffer.startsWith('*');
    let beliAmt = 0;
    let offeredCardId = null;
    if (isBeliOffer) {
      beliAmt = parseInt(rawOffer.slice(1), 10);
      if (isNaN(beliAmt) || beliAmt < 100) {
        const r = 'Beli offer must be a number and at least 100 (prefix with *).';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
    } else {
      offeredCardId = rawOffer;
    }

    // Validate requested card
    const wantedCardDef = getCardById(wantCardId);
    if (!wantedCardDef) {
      const r = `Requested card ${formatCardId(wantCardId)} not found.`;
      if (message) return message.reply(r);
      return interaction.reply({ content: r, ephemeral: true });
    }

    // If offering a card, resolve its definition as well
    let offeredCardDef = null;
    if (!isBeliOffer) {
      offeredCardDef = getCardById(offeredCardId);
      if (!offeredCardDef) {
        const r = `Offered card ${formatCardId(offeredCardId)} not found.`;
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
    }

    // Build session details and validate ownership
    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const session = { id: sessionId, initiatorId, targetId, createdAt: Date.now() };

    if (!isBeliOffer) {
      // Card-for-card: offeredCardId must exist and be owned by initiator
      const offeredEntry = (initiator.ownedCards || []).find(e => e.cardId === offeredCardDef.id);
      if (!offeredEntry) {
        const r = `You do not own ${offeredCardDef.emoji || ''} **${offeredCardDef.character || formatCardId(offeredCardDef.id)}**.`;
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
      const targetEntry = (target.ownedCards || []).find(e => e.cardId === wantedCardDef.id);
      if (!targetEntry) {
        const r = `Target does not own ${wantedCardDef.emoji || ''} **${wantedCardDef.character || formatCardId(wantedCardDef.id)}**.`;
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }

      // Prevent trading cards that are on teams
      if ((initiator.team || []).includes(offeredCardDef.id)) {
        const r = 'You must remove the offered card from your team before trading it.';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
      if ((target.team || []).includes(wantedCardDef.id)) {
        const r = 'Target must remove the requested card from their team before trading.';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
      // Prevent trading cards that currently have an artifact equipped to them
      if (cardHasArtifactEquipped(target, wantedCardDef.id)) {
        const r = 'Target must unequip any artifact attached to this card before trading.';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
      // Prevent trading cards that currently have an artifact equipped to them
      if (cardHasArtifactEquipped(initiator, offeredCardDef.id)) {
        const r = 'You must unequip any artifact attached to this card before trading.';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
      if (cardHasArtifactEquipped(target, wantedCardDef.id)) {
        const r = 'Target must unequip any artifact attached to this card before trading.';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }

      session.type = 'card_for_card';
      session.offered = { cardId: offeredCardDef.id, entry: offeredEntry };
      session.requested = { cardId: wantedCardDef.id, entry: targetEntry };

      // compute shard requirements for both sides (based on card attribute & rank)
      const offeredShardId = shardIdForAttribute(offeredCardDef.attribute || '');
      const offeredShardCount = shardCostForRank(offeredCardDef.rank || '');
      const requestedShardId = shardIdForAttribute(wantedCardDef.attribute || '');
      const requestedShardCount = shardCostForRank(wantedCardDef.rank || '');
      session.offeredShard = { shardId: offeredShardId, count: offeredShardCount };
      session.requestedShard = { shardId: requestedShardId, count: requestedShardCount };

      // enforce initiator has required shards for their offered card
      if (session.offeredShard.count > 0 && session.offeredShard.shardId) {
        const have = findItemCount(initiator.items || [], session.offeredShard.shardId);
        if (have < session.offeredShard.count) {
          const sname = ITEM_DISPLAY_NAMES[session.offeredShard.shardId] || session.offeredShard.shardId;
          const semoji = ITEM_DISPLAY_EMOJIS[session.offeredShard.shardId] || '';
          const r = `You need ${semoji} ${sname} x${session.offeredShard.count} to offer this card (you have ${have}).`;
          if (message) return message.reply(r);
          return interaction.reply({ content: r, ephemeral: true });
        }
      }
    } else {
      // Beli-for-card: ensure initiator has beli
      if ((initiator.balance || 0) < beliAmt) {
        const r = `You do not have ¥${beliAmt}.`;
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }

      // Target must own the wanted card
      const targetEntry = (target.ownedCards || []).find(e => e.cardId === wantedCardDef.id);
      if (!targetEntry) {
        const r = `Target does not own ${wantedCardDef.emoji || ''} **${wantedCardDef.character || formatCardId(wantedCardDef.id)}**.`;
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }
      if ((target.team || []).includes(wantedCardDef.id)) {
        const r = 'Target must remove the requested card from their team before trading.';
        if (message) return message.reply(r);
        return interaction.reply({ content: r, ephemeral: true });
      }

      // Beli-for-card: buyer pays Beli only (no shard requirement)
      session.type = 'beli_for_card';
      session.beli = beliAmt;
      session.requested = { cardId: wantedCardDef.id, entry: targetEntry };
    }

    // Build confirmation embed for target to accept/decline
    const initiatorBadge = initiator.discordAvatar || '';
    // build user-friendly displays
    let offeredDisplay;
    if (isBeliOffer) {
      offeredDisplay = `¥${session.beli.toLocaleString()}`;
    } else if (offeredCardDef) {
      if (offeredCardDef.ship) {
        offeredDisplay = `${offeredCardDef.character} (ship) (${offeredCardDef.rank || ''})`;
      } else {
        offeredDisplay = `${offeredCardDef.emoji || ''} ${offeredCardDef.character || offeredCardDef.id} (${offeredCardDef.rank || ''})`;
      }
    } else {
      offeredDisplay = formatCardId(offeredCardId);
    }

    let requestedDisplay;
    if (wantedCardDef) {
      if (wantedCardDef.ship) {
        requestedDisplay = `${wantedCardDef.character} (ship) (${wantedCardDef.rank || ''})`;
      } else {
        requestedDisplay = `${wantedCardDef.emoji || ''} ${wantedCardDef.character || wantedCardDef.id} (${wantedCardDef.rank || ''})`;
      }
    } else {
      requestedDisplay = formatCardId(wantCardId);
    }

    const embed = new EmbedBuilder()
      .setTitle('Trade Proposal')
      .setColor('#2b2d31')
      .setDescription(`<@${initiatorId}> proposes a trade to <@${targetId}>`)
      .addFields(
        { name: 'Offered', value: offeredDisplay, inline: true },
        { name: 'Requested', value: requestedDisplay, inline: true }
      )
      .setFooter({ text: 'Accept to complete the trade. Both users will have items updated.' });

    // If this is a card-for-card trade and either side requires shards, show both sides' requirements
    if (session.type === 'card_for_card' && (session.offeredShard?.count > 0 || session.requestedShard?.count > 0)) {
      const lines = [];
      if (session.offeredShard?.count > 0 && session.offeredShard?.shardId) {
        const sid = session.offeredShard.shardId;
        const sname = ITEM_DISPLAY_NAMES[sid] || sid;
        const semoji = ITEM_DISPLAY_EMOJIS[sid] || '';
        lines.push(`<@${initiatorId}> (offering): ${semoji} ${sname} x${session.offeredShard.count}`);
      } else {
        lines.push(`<@${initiatorId}> (offering): None`);
      }
      if (session.requestedShard?.count > 0 && session.requestedShard?.shardId) {
        const sid = session.requestedShard.shardId;
        const sname = ITEM_DISPLAY_NAMES[sid] || sid;
        const semoji = ITEM_DISPLAY_EMOJIS[sid] || '';
        lines.push(`<@${targetId}> (offering): ${semoji} ${sname} x${session.requestedShard.count}`);
      } else {
        lines.push(`<@${targetId}> (offering): None`);
      }
      embed.addFields({ name: 'Shard Requirements', value: lines.join('\n'), inline: false });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trade_confirm:${sessionId}`)
        .setLabel('Accept Trade')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`trade_cancel:${sessionId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Secondary)
    );

    // Persist session
    global.tradeSessions.set(sessionId, session);

    const replyContent = `<@${targetId}>, you have a trade proposal:`;
    if (message) return message.channel.send({ content: replyContent, embeds: [embed], components: [row] });
    return interaction.reply({ content: replyContent, embeds: [embed], components: [row] });
  },

  async handleButton(interaction, customId) {
    const parts = customId.split(':');
    const key = parts[0];
    const sessionId = parts[1];
    if (!key.startsWith('trade')) return;
    const session = global.tradeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Trade session expired or not found.', ephemeral: true });

    // Only target can accept/decline
    if (interaction.user.id !== session.targetId) {
      return interaction.reply({ content: 'Only the trade recipient may accept or decline this trade.', ephemeral: true });
    }

    if (key === 'trade_cancel') {
      global.tradeSessions.delete(sessionId);
      return interaction.update({ content: 'Trade declined.', embeds: [], components: [] });
    }

    // Accept flow
    if (key === 'trade_confirm') {
      // Re-fetch fresh docs to validate
      const initiator = await User.findOne({ userId: session.initiatorId });
      const target = await User.findOne({ userId: session.targetId });
      if (!initiator || !target) {
        global.tradeSessions.delete(sessionId);
        return interaction.update({ content: 'One of the users no longer has an account. Trade cancelled.', embeds: [], components: [] });
      }

      try {
        if (session.type === 'card_for_card') {
          // verify ownership still holds
          const offeredEntryIndex = (initiator.ownedCards || []).findIndex(e => e.cardId === session.offered.cardId);
          const requestedEntryIndex = (target.ownedCards || []).findIndex(e => e.cardId === session.requested.cardId);
          if (offeredEntryIndex === -1 || requestedEntryIndex === -1) {
            global.tradeSessions.delete(sessionId);
            return interaction.update({ content: 'Either user no longer owns the required card. Trade cancelled.', embeds: [], components: [] });
          }

          // verify both parties still have required shards (if any)
          const offeredShardId = session.offeredShard?.shardId;
          const offeredShardCount = session.offeredShard?.count || 0;
          const requestedShardId = session.requestedShard?.shardId;
          const requestedShardCount = session.requestedShard?.count || 0;

          if (offeredShardCount > 0 && offeredShardId) {
            const have = findItemCount(initiator.items || [], offeredShardId);
            if (have < offeredShardCount) {
              const sname = ITEM_DISPLAY_NAMES[offeredShardId] || offeredShardId;
              const semoji = ITEM_DISPLAY_EMOJIS[offeredShardId] || '';
              global.tradeSessions.delete(sessionId);
              return interaction.update({ content: `Trade cancelled: <@${session.initiatorId}> lacks required shards (${semoji} ${sname} x${offeredShardCount}).`, embeds: [], components: [] });
            }
          }

          if (requestedShardCount > 0 && requestedShardId) {
            const haveT = findItemCount(target.items || [], requestedShardId);
            if (haveT < requestedShardCount) {
              const sname = ITEM_DISPLAY_NAMES[requestedShardId] || requestedShardId;
              const semoji = ITEM_DISPLAY_EMOJIS[requestedShardId] || '';
                global.tradeSessions.delete(sessionId);
                return interaction.update({ content: `Trade cancelled: <@${session.targetId}> lacks required shards (${semoji} ${sname} x${requestedShardCount}).`, embeds: [], components: [] });
            }
          }

          // prevent trading if artifacts have been equipped since proposal
          if (cardHasArtifactEquipped(initiator, session.offered.cardId)) {
            global.tradeSessions.delete(sessionId);
            return interaction.update({ content: 'Trade cancelled: Offered card has an artifact equipped. Unequip it first.', embeds: [], components: [] });
          }
          if (cardHasArtifactEquipped(target, session.requested.cardId)) {
            global.tradeSessions.delete(sessionId);
            return interaction.update({ content: 'Trade cancelled: Requested card has an artifact equipped. Target must unequip it first.', embeds: [], components: [] });
          }

          // perform transfers: remove entries
          const offeredEntry = initiator.ownedCards.splice(offeredEntryIndex, 1)[0];
          const requestedEntry = target.ownedCards.splice(requestedEntryIndex, 1)[0];

          // remove shards from initiator -> add to target
          if (offeredShardCount > 0 && offeredShardId) {
            initiator.items = removeItem(initiator.items || [], offeredShardId, offeredShardCount);
            target.items = target.items || [];
            const existingT = target.items.find(i => i.itemId === offeredShardId);
            if (existingT) existingT.quantity = (existingT.quantity || 0) + offeredShardCount;
            else target.items.push({ itemId: offeredShardId, quantity: offeredShardCount });
          }

          // remove shards from target -> add to initiator
          if (requestedShardCount > 0 && requestedShardId) {
            target.items = removeItem(target.items || [], requestedShardId, requestedShardCount);
            initiator.items = initiator.items || [];
            const existingI = initiator.items.find(i => i.itemId === requestedShardId);
            if (existingI) existingI.quantity = (existingI.quantity || 0) + requestedShardCount;
            else initiator.items.push({ itemId: requestedShardId, quantity: requestedShardCount });
          }

          // When recipient already owns the incoming card, convert incoming card's level/xp into XP on existing entry
          if (!applyIncomingEntryAsXp(initiator, requestedEntry)) {
            initiator.ownedCards.push(requestedEntry);
          }
          if (!applyIncomingEntryAsXp(target, offeredEntry)) {
            target.ownedCards.push(offeredEntry);
          }

          await initiator.save();
          await target.save();

          // build completion message with shard details
          const offeredCard = getCardById(session.offered.cardId) || {};
          const requestedCard = getCardById(session.requested.cardId) || {};
          const shardParts = [];
          if (offeredShardCount > 0 && offeredShardId) {
            const sname = ITEM_DISPLAY_NAMES[offeredShardId] || offeredShardId;
            const semoji = ITEM_DISPLAY_EMOJIS[offeredShardId] || '';
            shardParts.push(`<@${session.initiatorId}> -> <@${session.targetId}>: ${semoji} ${sname} x${offeredShardCount}`);
          }
          if (requestedShardCount > 0 && requestedShardId) {
            const sname = ITEM_DISPLAY_NAMES[requestedShardId] || requestedShardId;
            const semoji = ITEM_DISPLAY_EMOJIS[requestedShardId] || '';
            shardParts.push(`<@${session.targetId}> -> <@${session.initiatorId}>: ${semoji} ${sname} x${requestedShardCount}`);
          }

          let completeMsg = `Trade completed: ${offeredCard.character || offeredCard.id} ↔ ${requestedCard.character || requestedCard.id}.`;
          if (shardParts.length) completeMsg += ` Shards exchanged: ${shardParts.join(' | ')}.`;

          global.tradeSessions.delete(sessionId);
          return interaction.update({ content: completeMsg, embeds: [], components: [] });
        }

        if (session.type === 'beli_for_card') {
          // validate buyer still has funds and shards
          const buyer = initiator; // initiator paid beli
          const seller = target;
          if ((buyer.balance || 0) < session.beli) {
            global.tradeSessions.delete(sessionId);
            return interaction.update({ content: 'Buyer no longer has enough Beli. Trade cancelled.', embeds: [], components: [] });
          }

          const shardId = session.shardReq?.shardId;
          const shardCount = session.shardReq?.count || 0;
          if (shardCount > 0 && shardId) {
            const have = findItemCount(buyer.items || [], shardId);
            if (have < shardCount) {
              const sname = ITEM_DISPLAY_NAMES[shardId] || shardId;
              const semoji = ITEM_DISPLAY_EMOJIS[shardId] || '';
              global.tradeSessions.delete(sessionId);
              return interaction.update({ content: `Buyer lacks required shards (${semoji} ${sname} x${shardCount}). Trade cancelled.`, embeds: [], components: [] });
            }
          }

          // find requested card on seller
          const requestedIndex = (seller.ownedCards || []).findIndex(e => e.cardId === session.requested.cardId);
          if (requestedIndex === -1) {
            global.tradeSessions.delete(sessionId);
            return interaction.update({ content: 'Seller no longer owns the requested card. Trade cancelled.', embeds: [], components: [] });
          }

          // perform transfers: buyer pays seller, shards move, card moves
          buyer.balance = (buyer.balance || 0) - session.beli;
          seller.balance = (seller.balance || 0) + session.beli;

          if (shardCount > 0) {
            // remove from buyer, add to seller
            buyer.items = removeItem(buyer.items || [], shardId, shardCount);
            seller.items = seller.items || [];
            const existing = seller.items.find(i => i.itemId === shardId);
            if (existing) existing.quantity = (existing.quantity || 0) + shardCount;
            else seller.items.push({ itemId: shardId, quantity: shardCount });
          }

          // transfer card
          // prevent trading if seller's card has an artifact equipped
          if (cardHasArtifactEquipped(seller, session.requested.cardId)) {
            global.tradeSessions.delete(sessionId);
            return interaction.update({ content: 'Trade cancelled: Seller has an artifact equipped to that card. Unequip first.', embeds: [], components: [] });
          }

          const requestedEntry = seller.ownedCards.splice(requestedIndex, 1)[0];
          buyer.ownedCards = buyer.ownedCards || [];
          // if buyer already owns the card, convert incoming entry's level/xp into XP on buyer's existing entry
          if (!applyIncomingEntryAsXp(buyer, requestedEntry)) {
            buyer.ownedCards.push(requestedEntry);
          }

          await buyer.save();
          await seller.save();

          const sname = ITEM_DISPLAY_NAMES[shardId] || shardId;
          const semoji = ITEM_DISPLAY_EMOJIS[shardId] || '';
          const shardPart = shardCount ? `${shardCount}x ${semoji} ${sname} ` : '';
          const requestedCard = getCardById(session.requested.cardId) || {};
          const reqName = requestedCard.ship ? `${requestedCard.character} (ship)` : `${requestedCard.emoji || ''} ${requestedCard.character}`;
          global.tradeSessions.delete(sessionId);
          return interaction.update({ content: `Trade completed: ¥${session.beli.toLocaleString()} and ${shardPart}exchanged for ${reqName}.`, embeds: [], components: [] });
        }
      } catch (err) {
        console.error('Trade accept failed:', err);
        global.tradeSessions.delete(sessionId);
        return interaction.update({ content: 'Trade failed due to an error. Check logs.', embeds: [], components: [] });
      }
    }
  }
};
