// Gestionnaire global d'erreurs
// Capture les erreurs non gérées pour éviter les crashes

const Logger = require('../utils/logger');

class ErrorHandler {
    // Initialise les gestionnaires d'erreurs globaux
    static init() {
        // Erreurs non capturées dans les promesses
        process.on('unhandledRejection', (reason, promise) => {
            Logger.error('Promesse rejetée non gérée:', reason);
        });

        // Erreurs non capturées
        process.on('uncaughtException', (error) => {
            Logger.error('Exception non capturée:', error);
            // Ne pas arrêter le processus pour les erreurs non critiques
            if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                Logger.warn('Erreur réseau détectée, le bot continue de fonctionner');
                return;
            }
        });

        // Signal d'arrêt propre
        process.on('SIGINT', () => {
            Logger.info('Arrêt du bot (SIGINT)...');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            Logger.info('Arrêt du bot (SIGTERM)...');
            process.exit(0);
        });

        Logger.info('Gestionnaire d\'erreurs initialisé');
    }
}

module.exports = ErrorHandler;
