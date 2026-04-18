const User = require('../models/User');
const { ACHIEVEMENTS } = require('../utils/achievements');

module.exports = {
  name: 'removebadge',
  description: 'Unequip a badge from your profile',
  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const query = message ? args.slice(1).join(' ') : interaction.options?.getString('badge');
    if (!query) {
      const reply = 'Usage: op removebadge <badge name>'; 
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` to register.';
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const q = query.toLowerCase();
    const def = ACHIEVEMENTS.find(a => a.title.toLowerCase() === q || a.id === q || a.title.toLowerCase().includes(q));
    if (!def) {
      const reply = `Badge not found: ${query}`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    user.badgesEquipped = user.badgesEquipped || [];
    if (!user.badgesEquipped.includes(def.id)) {
      const reply = `Badge is not equipped.`;
      if (message) return message.channel.send(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }
    user.badgesEquipped = user.badgesEquipped.filter(b => b !== def.id);
    await user.save();
    const reply = `Removed badge ${def.icon} ${def.title}`;
    if (message) return message.channel.send(reply);
    return interaction.reply({ content: reply, ephemeral: true });
  }
};
