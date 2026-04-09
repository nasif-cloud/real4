const User = require('../models/User');
const crews = require('../data/crews');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatCooldown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

module.exports = {
  name: 'loot',
  description: 'Attempt to loot a random guild ship for Beli and packs',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const now = new Date();
    if (user.lootCooldownUntil && user.lootCooldownUntil > now) {
      const diff = user.lootCooldownUntil - now;
      const timeLeft = formatCooldown(diff);
      const reply = `You must wait another \`${timeLeft}\` before attempting to loot again.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const crew = crews[Math.floor(Math.random() * crews.length)];
    const caught = Math.random() < 0.1;
    const amount = randomInt(10, 300);

    user.lootCooldownUntil = new Date(Date.now() + 30 * 60 * 1000);

    let reply;
    if (caught) {
      const loss = Math.min(amount, user.balance || 0);
      user.balance = (user.balance || 0) - loss;
      await user.save();
      reply = `You attempted to loot the **${crew.icon} ${crew.name}** Ship but got caught and lost **<:beri:1490738445319016651> ${loss}**...`;
    } else {
      user.balance = (user.balance || 0) + amount;
      let packText = '';
      if (Math.random() < 0.3) {
        user.packInventory = user.packInventory || {};
        user.packInventory[crew.name] = (user.packInventory[crew.name] || 0) + 1;
        user.markModified('packInventory');
        packText = ` and \`1x\` **${crew.packEmoji} ${crew.name} pack**`;
      }
      await user.save();
      reply = `You looted the **${crew.icon} ${crew.name}** pirate ship for **<:beri:1490738445319016651> ${amount} Berries**${packText}${packText ? ' !' : '!'}`;
    }

    if (message) return message.channel.send(reply);
    return interaction.reply({ content: reply });
  }
};
