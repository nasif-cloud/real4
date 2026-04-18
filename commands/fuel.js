const User = require('../models/User');
const { findBestOwnedShip, getShipById } = require('../utils/cards');

module.exports = {
  name: 'fuel',
  description: 'Consume a Cola item to add +1 Cola to a ship',
  options: [{ name: 'ship', type: 3, description: 'Ship name (optional; uses active ship if omitted)', required: false }],
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const shipQuery = message ? (args && args.length ? args.join(' ') : '') : interaction.options.getString('ship');

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = "You don't have an account. Run `op start` or /start to register.";
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    let shipDef = null;
    if (shipQuery && shipQuery.trim()) {
      shipDef = await findBestOwnedShip(userId, shipQuery);
    } else if (user.activeShip) {
      shipDef = getShipById(user.activeShip);
    }

    if (!shipDef) {
      const reply = 'Please set a ship first.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check cola item in inventory
    user.items = user.items || [];
    const colaEntry = user.items.find(it => it.itemId === 'cola');
    if (!colaEntry || (colaEntry.quantity || 0) <= 0) {
      const reply = 'You have no <:cola:1494106165955792967> Cola to fuel with.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // consume one cola item
    colaEntry.quantity -= 1;
    if (colaEntry.quantity <= 0) {
      user.items = user.items.filter(it => it.itemId !== 'cola');
    }

    // ensure per-user ship state exists
    user.ships = user.ships || {};
    user.ships[shipDef.id] = user.ships[shipDef.id] || { cola: 0, maxCola: shipDef.maxCola || 0 };

    const maxCola = user.ships[shipDef.id].maxCola || shipDef.maxCola || 0;
    const before = user.ships[shipDef.id].cola || 0;
    if (before >= maxCola) {
      await user.save();
      const reply = `**${shipDef.character}** already has full Cola (${before}/${maxCola}).`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    user.ships[shipDef.id].cola = Math.min(maxCola, before + 1);
    await user.save();

    const reply = `Fueled **${shipDef.character}** with <:cola:1494106165955792967> +1. Current Cola: ${user.ships[shipDef.id].cola}/${maxCola}`;
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};
