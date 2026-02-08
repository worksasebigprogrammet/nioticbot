// Événement déclenché quand le bot est prêt et connecté
const Logger = require('../utils/logger');
const { ActivityType } = require('discord.js');
const AntiRaid = require('../systems/antiraid');
const AutoMod = require('../systems/automod');
const LogSystem = require('../systems/logs');
const LevelSystem = require('../systems/levels');
const EconomySystem = require('../systems/economy');
const VoiceTrackingSystem = require('../systems/voiceTracking');
const BackupSystem = require('../systems/backup');
const AdminLogsSystem = require('../systems/adminLogs');

module.exports = {
    name: 'ready',
    once: true,

    async execute(client) {
        Logger.info(`✅ ${client.user.tag} est en ligne ! (${client.guilds.cache.size} serveurs)`);

        // Définition du statut du bot
        client.user.setActivity('avec les membres !', { type: ActivityType.Playing });

        // Enregistrement des commandes slash
        await client.commandHandler.registerCommands();

        // Initialisation des systèmes
        try {
            client.systems.antiraid = new AntiRaid(client);
            Logger.info('Système Anti-Raid initialisé');

            client.systems.automod = new AutoMod(client);
            Logger.info('Système Auto-Modération initialisé');

            client.systems.logs = new LogSystem(client);
            Logger.info('Système de Logs initialisé');

            client.systems.levels = new LevelSystem(client);
            Logger.info('Système de Niveaux initialisé');

            client.systems.economy = new EconomySystem(client);
            Logger.info('Système d\'Économie initialisé');

            client.systems.voiceTracking = new VoiceTrackingSystem(client);
            Logger.info('Système de Tracking Vocal initialisé');

            client.systems.backup = new BackupSystem(client);
            Logger.info('Système de Backup initialisé');

            client.systems.adminLogs = new AdminLogsSystem(client);
            Logger.info('Système de Logs Admin initialisé');
        } catch (error) {
            Logger.error('Erreur lors de l\'initialisation des systèmes:', error);
        }
    },
};
