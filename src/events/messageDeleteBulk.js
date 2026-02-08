// Événement déclenché lors de la suppression en masse de messages
const Logger = require('../utils/logger');

module.exports = {
    name: 'messageDeleteBulk',
    once: false,

    async execute(messages, channel, client) {
        try {
            if (!channel.guild || !client.systems.logs) return;

            await client.systems.logs.log(channel.guild.id, 'message.bulk_delete', {
                channel: channel,
                count: messages.size,
                messages: messages.map(m => ({
                    author: m.author?.tag || 'Inconnu',
                    content: m.content?.substring(0, 100) || 'N/A'
                })).slice(0, 10) // Limiter à 10 pour l'embed
            });
        } catch (error) {
            Logger.error('Erreur messageDeleteBulk log:', error);
        }
    },
};
