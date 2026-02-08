// Événement déclenché quand un message est supprimé
// Envoie un log dans le salon configuré
const Logger = require('../utils/logger');

module.exports = {
    name: 'messageDelete',
    once: false,

    async execute(message, client) {
        // Ignorer les messages partiels sans contenu, les bots et les DMs
        if (!message.guild || message.partial) return;

        try {
            if (client.systems.logs) {
                await client.systems.logs.log(message.guild.id, 'message.delete', {
                    user: message.author,
                    channel: message.channel,
                    content: message.content || 'Contenu non disponible',
                    attachments: message.attachments?.map(a => a.url) || [],
                    timestamp: message.createdAt
                });
            }
        } catch (error) {
            Logger.error('Erreur messageDelete log:', error);
        }
    },
};
