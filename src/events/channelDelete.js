// Événement déclenché quand un salon est supprimé
const Logger = require('../utils/logger');

module.exports = {
    name: 'channelDelete',
    once: false,

    async execute(channel, client) {
        try {
            if (!channel.guild || !client.systems.logs) return;

            await client.systems.logs.log(channel.guild.id, 'server.channel_delete', {
                channelName: channel.name,
                channelType: channel.type,
                channelId: channel.id,
                category: channel.parent?.name || 'Aucune'
            });
        } catch (error) {
            Logger.error('Erreur channelDelete log:', error);
        }
    },
};
