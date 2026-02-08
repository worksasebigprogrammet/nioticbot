// Événement déclenché quand un message est modifié
const Logger = require('../utils/logger');

module.exports = {
    name: 'messageUpdate',
    once: false,

    async execute(oldMessage, newMessage, client) {
        // Ignorer les messages partiels, les bots et les DMs
        if (!newMessage.guild || newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;

        try {
            if (client.systems.logs) {
                await client.systems.logs.log(newMessage.guild.id, 'message.edit', {
                    user: newMessage.author,
                    channel: newMessage.channel,
                    oldContent: oldMessage.content || 'Contenu non disponible',
                    newContent: newMessage.content || 'Contenu non disponible',
                    messageUrl: newMessage.url
                });
            }

            // Re-vérifier l'automod sur le message modifié
            const Guild = require('../../database/models/guild');
            const guildSettings = await Guild.findOne({ guildId: newMessage.guild.id });

            if (guildSettings?.modules?.automod && client.systems.automod) {
                await client.systems.automod.processMessage(newMessage, guildSettings);
            }
        } catch (error) {
            Logger.error('Erreur messageUpdate log:', error);
        }
    },
};
