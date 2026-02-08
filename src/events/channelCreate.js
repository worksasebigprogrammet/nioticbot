// Événement déclenché quand un salon est créé
const Logger = require('../utils/logger');

module.exports = {
    name: 'channelCreate',
    once: false,

    async execute(channel, client) {
        try {
            if (!channel.guild || !client.systems.logs) return;

            await client.systems.logs.log(channel.guild.id, 'server.channel_create', {
                channelName: channel.name,
                channelType: channel.type,
                channelId: channel.id,
                category: channel.parent?.name || 'Aucune'
            });
        } catch (error) {
            Logger.error('Erreur channelCreate log:', error);
        }
    },
};
