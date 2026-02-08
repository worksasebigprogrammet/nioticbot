// Événement déclenché quand un rôle est supprimé
const Logger = require('../utils/logger');

module.exports = {
    name: 'roleDelete',
    once: false,

    async execute(role, client) {
        try {
            if (!client.systems.logs) return;

            await client.systems.logs.log(role.guild.id, 'server.role_delete', {
                roleName: role.name,
                roleId: role.id,
                color: role.hexColor
            });
        } catch (error) {
            Logger.error('Erreur roleDelete log:', error);
        }
    },
};
