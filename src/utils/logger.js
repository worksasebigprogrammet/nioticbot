const fs = require('fs');
const path = require('path');

/**
 * Répertoire où les fichiers de logs seront stockés.
 * Créé automatiquement s'il n'existe pas.
 */
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Codes ANSI pour colorer la sortie console.
 * Chaque niveau de log possède sa propre couleur.
 */
const COLORS = {
    reset: '\x1b[0m',
    debug: '\x1b[36m',   // Cyan pour le débogage
    info: '\x1b[32m',    // Vert pour les informations
    warn: '\x1b[33m',    // Jaune pour les avertissements
    error: '\x1b[31m',   // Rouge pour les erreurs
    timestamp: '\x1b[90m', // Gris pour l'horodatage
    label: '\x1b[1m',    // Gras pour le libellé du niveau
};

/**
 * Niveaux de log avec leur priorité numérique.
 * Plus le nombre est élevé, plus le niveau est critique.
 */
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Classe Logger — système de journalisation complet.
 *
 * Fournit une journalisation sur la console (avec couleurs et horodatage)
 * ainsi qu'une écriture dans des fichiers rotatifs dans le dossier logs/.
 *
 * Peut être utilisée via des méthodes statiques (Logger.info, Logger.error, etc.)
 * ou en instanciant un logger nommé pour un module spécifique.
 */
class Logger {
    /**
     * Crée une nouvelle instance de Logger.
     * @param {string} name - Nom du module ou contexte (affiché dans les logs)
     * @param {object} options - Options de configuration
     * @param {string} options.level - Niveau minimum de log à afficher ('debug', 'info', 'warn', 'error')
     * @param {boolean} options.writeToFile - Activer l'écriture dans des fichiers (par défaut : true)
     * @param {boolean} options.writeToConsole - Activer l'affichage dans la console (par défaut : true)
     */
    constructor(name = 'Bot', options = {}) {
        this.name = name;
        this.level = options.level || 'debug';
        this.writeToFile = options.writeToFile !== undefined ? options.writeToFile : true;
        this.writeToConsole = options.writeToConsole !== undefined ? options.writeToConsole : true;
    }

    /**
     * Génère un horodatage lisible au format YYYY-MM-DD HH:mm:ss.
     * Utilisé pour préfixer chaque message de log.
     * @returns {string} L'horodatage formaté
     */
    _getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Renvoie la date du jour au format YYYY-MM-DD pour nommer les fichiers de log.
     * @returns {string} La date formatée
     */
    _getDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Formatte un message pour l'affichage dans la console avec couleurs ANSI.
     * @param {string} level - Niveau du log (debug, info, warn, error)
     * @param {string} message - Le message à formater
     * @returns {string} Le message formaté avec couleurs
     */
    _formatConsoleMessage(level, message) {
        const timestamp = this._getTimestamp();
        const color = COLORS[level] || COLORS.reset;
        const levelLabel = level.toUpperCase().padEnd(5);

        return `${COLORS.timestamp}[${timestamp}]${COLORS.reset} ${color}${COLORS.label}[${levelLabel}]${COLORS.reset} ${color}[${this.name}]${COLORS.reset} ${message}`;
    }

    /**
     * Formatte un message pour l'écriture dans un fichier (sans codes couleurs).
     * @param {string} level - Niveau du log
     * @param {string} message - Le message à formater
     * @returns {string} Le message formaté en texte brut
     */
    _formatFileMessage(level, message) {
        const timestamp = this._getTimestamp();
        const levelLabel = level.toUpperCase().padEnd(5);
        return `[${timestamp}] [${levelLabel}] [${this.name}] ${message}`;
    }

    /**
     * Écrit un message dans le fichier de log correspondant au niveau et à la date.
     * Chaque jour et chaque niveau possèdent leur propre fichier.
     * Un fichier combined.log regroupe tous les niveaux.
     * @param {string} level - Niveau du log
     * @param {string} message - Le message à écrire
     */
    _writeToLogFile(level, message) {
        try {
            const dateStr = this._getDateString();
            const formattedMessage = this._formatFileMessage(level, message);

            // Écriture dans le fichier spécifique au niveau (ex: 2026-02-08-error.log)
            const levelFilePath = path.join(LOGS_DIR, `${dateStr}-${level}.log`);
            fs.appendFileSync(levelFilePath, formattedMessage + '\n', 'utf8');

            // Écriture dans le fichier combiné qui regroupe tous les niveaux
            const combinedFilePath = path.join(LOGS_DIR, `${dateStr}-combined.log`);
            fs.appendFileSync(combinedFilePath, formattedMessage + '\n', 'utf8');
        } catch (err) {
            // En cas d'erreur d'écriture, afficher dans la console en dernier recours
            console.error(`[Logger] Erreur d'écriture dans le fichier de log : ${err.message}`);
        }
    }

    /**
     * Méthode principale de journalisation.
     * Vérifie le niveau minimum, formate le message et l'envoie
     * vers la console et/ou les fichiers selon la configuration.
     * @param {string} level - Niveau du log
     * @param {string} message - Le message à journaliser
     * @param  {...any} args - Arguments supplémentaires à inclure
     */
    _log(level, message, ...args) {
        // Vérifier si le niveau demandé est supérieur ou égal au niveau minimum configuré
        if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;

        // Construire le message complet avec les arguments supplémentaires
        const fullMessage = args.length > 0
            ? `${message} ${args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')}`
            : message;

        // Afficher dans la console si activé
        if (this.writeToConsole) {
            const consoleMessage = this._formatConsoleMessage(level, fullMessage);
            switch (level) {
                case 'debug':
                    console.debug(consoleMessage);
                    break;
                case 'info':
                    console.info(consoleMessage);
                    break;
                case 'warn':
                    console.warn(consoleMessage);
                    break;
                case 'error':
                    console.error(consoleMessage);
                    break;
                default:
                    console.log(consoleMessage);
            }
        }

        // Écrire dans le fichier si activé
        if (this.writeToFile) {
            this._writeToLogFile(level, fullMessage);
        }
    }

    /**
     * Journalise un message de niveau DEBUG.
     * Utilisé pour les informations détaillées utiles au développement.
     * @param {string} message - Le message de débogage
     * @param {...any} args - Arguments supplémentaires
     */
    debug(message, ...args) {
        this._log('debug', message, ...args);
    }

    /**
     * Journalise un message de niveau INFO.
     * Utilisé pour les événements normaux du cycle de vie du bot.
     * @param {string} message - Le message d'information
     * @param {...any} args - Arguments supplémentaires
     */
    info(message, ...args) {
        this._log('info', message, ...args);
    }

    /**
     * Journalise un message de niveau WARN.
     * Utilisé pour signaler des situations anormales mais non bloquantes.
     * @param {string} message - Le message d'avertissement
     * @param {...any} args - Arguments supplémentaires
     */
    warn(message, ...args) {
        this._log('warn', message, ...args);
    }

    /**
     * Journalise un message de niveau ERROR.
     * Utilisé pour les erreurs critiques nécessitant une intervention.
     * @param {string} message - Le message d'erreur
     * @param {...any} args - Arguments supplémentaires
     */
    error(message, ...args) {
        this._log('error', message, ...args);
    }

    /**
     * Définit dynamiquement le niveau minimum de journalisation.
     * Les messages en dessous de ce niveau seront ignorés.
     * @param {string} level - Le nouveau niveau minimum ('debug', 'info', 'warn', 'error')
     */
    setLevel(level) {
        if (LOG_LEVELS[level] !== undefined) {
            this.level = level;
        } else {
            this.warn(`Niveau de log invalide : "${level}". Niveaux valides : ${Object.keys(LOG_LEVELS).join(', ')}`);
        }
    }
}

/**
 * Instance par défaut du Logger, utilisée par les méthodes statiques.
 * Permet d'utiliser Logger.info(), Logger.error(), etc. sans créer d'instance.
 */
const defaultLogger = new Logger('Bot');

/**
 * Méthode statique pour journaliser un message DEBUG via l'instance par défaut.
 * @param {string} message - Le message de débogage
 * @param {...any} args - Arguments supplémentaires
 */
Logger.debug = (message, ...args) => defaultLogger.debug(message, ...args);

/**
 * Méthode statique pour journaliser un message INFO via l'instance par défaut.
 * @param {string} message - Le message d'information
 * @param {...any} args - Arguments supplémentaires
 */
Logger.info = (message, ...args) => defaultLogger.info(message, ...args);

/**
 * Méthode statique pour journaliser un message WARN via l'instance par défaut.
 * @param {string} message - Le message d'avertissement
 * @param {...any} args - Arguments supplémentaires
 */
Logger.warn = (message, ...args) => defaultLogger.warn(message, ...args);

/**
 * Méthode statique pour journaliser un message ERROR via l'instance par défaut.
 * @param {string} message - Le message d'erreur
 * @param {...any} args - Arguments supplémentaires
 */
Logger.error = (message, ...args) => defaultLogger.error(message, ...args);

module.exports = Logger;
