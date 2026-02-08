// Événement déclenché quand une invitation est créée
const Logger = require('../utils/logger');

module.exports = {
    name: 'inviteCreate',
    once: false,

    async execute(invite, client) {
        try {
            if (!invite.guild || !client.systems.logs) return;

            await client.systems.logs.log(invite.guild.id, 'invite.create', {
                inviter: invite.inviter,
                code: invite.code,
                channel: invite.channel,
                maxUses: invite.maxUses || 'Illimité',
                maxAge: invite.maxAge ? `${invite.maxAge}s` : 'Jamais'
            });
        } catch (error) {
            Logger.error('Erreur inviteCreate log:', error);
        }
    },
};
