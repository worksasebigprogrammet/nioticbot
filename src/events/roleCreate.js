// Événement déclenché quand un rôle est créé
const Logger = require('../utils/logger');

module.exports = {
    name: 'roleCreate',
    once: false,

    async execute(role, client) {
        try {
            if (!client.systems.logs) return;

            await client.systems.logs.log(role.guild.id, 'server.role_create', {
                roleName: role.name,
                roleId: role.id,
                color: role.hexColor,
                permissions: role.permissions.toArray().join(', ') || 'Aucune'
            });
        } catch (error) {
            Logger.error('Erreur roleCreate log:', error);
        }
    },
};
