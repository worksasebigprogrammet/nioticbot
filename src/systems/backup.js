const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Logger = require('../utils/logger');

/**
 * Système de sauvegarde automatique et manuelle.
 *
 * Planifie des sauvegardes quotidiennes de la base de données,
 * permet des sauvegardes manuelles, gère la rotation des fichiers
 * et fournit des métadonnées sur les sauvegardes existantes.
 */
class BackupSystem {
    /**
     * Crée une nouvelle instance du système de sauvegarde.
     * @param {import('discord.js').Client} client - Le client Discord
     */
    constructor(client) {
        /** @type {import('discord.js').Client} Le client Discord */
        this.client = client;

        /** @type {Logger} Instance du logger pour ce système */
        this.logger = new Logger('BackupSystem');

        /** @type {string} Répertoire de stockage des sauvegardes */
        this.backupDir = path.join(__dirname, '..', '..', 'backups');

        /** @type {import('node-cron').ScheduledTask|null} Tâche planifiée pour les sauvegardes */
        this.scheduledTask = null;

        /* ─── Créer le répertoire de sauvegardes s'il n'existe pas ─── */
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Initialise le système de sauvegarde.
     * Planifie une sauvegarde automatique quotidienne à 3h du matin.
     *
     * @returns {void}
     */
    init() {
        try {
            /* ─── Planifier la sauvegarde quotidienne à 3h00 ─── */
            this.scheduledTask = cron.schedule('0 3 * * *', async () => {
                this.logger.info('Démarrage de la sauvegarde quotidienne planifiée...');

                try {
                    const backupInfo = await this.createBackup();
                    this.logger.info(`Sauvegarde quotidienne terminée : ${backupInfo.filename}`);

                    /* ─── Rotation des sauvegardes après chaque sauvegarde automatique ─── */
                    await this.rotateBackups();
                } catch (error) {
                    this.logger.error(`Échec de la sauvegarde quotidienne : ${error.message}`);
                }
            }, {
                timezone: 'Europe/Paris'
            });

            this.logger.info('Système de sauvegarde initialisé — sauvegarde quotidienne planifiée à 3h00');

        } catch (error) {
            this.logger.error(`Erreur lors de l'initialisation du système de sauvegarde : ${error.message}`);
        }
    }

    /**
     * Crée une sauvegarde manuelle de la base de données.
     *
     * Tente d'abord d'utiliser mongodump (si disponible sur le système)
     * pour une sauvegarde binaire native de MongoDB. Si mongodump n'est
     * pas disponible, exporte les collections en tant que fichiers JSON.
     *
     * Les sauvegardes sont compressées si possible (gzip pour mongodump,
     * ou archivage JSON pour le mode alternatif).
     *
     * @returns {Promise<{ filename: string, path: string, size: number, date: Date, type: string }>}
     *          Les métadonnées de la sauvegarde créée
     */
    async createBackup() {
        /* ─── Générer le nom de fichier avec horodatage ─── */
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        let backupFilename;
        let backupPath;
        let backupType;

        try {
            /* ─── Tenter d'utiliser mongodump pour la sauvegarde ─── */
            const mongodumpAvailable = this._isCommandAvailable('mongodump');

            if (mongodumpAvailable) {
                backupFilename = `backup-${timestamp}.gz`;
                backupPath = path.join(this.backupDir, backupFilename);
                backupType = 'mongodump';

                /* Récupérer l'URI MongoDB depuis les variables d'environnement */
                const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/nioticbot';

                /* Exécuter mongodump avec compression gzip */
                execSync(
                    `mongodump --uri="${mongoUri}" --archive="${backupPath}" --gzip`,
                    { stdio: 'pipe', timeout: 120000 }
                );

                this.logger.info(`Sauvegarde mongodump créée : ${backupFilename}`);

            } else {
                /* ─── Mode alternatif : export des collections en JSON ─── */
                backupFilename = `backup-${timestamp}.json`;
                backupPath = path.join(this.backupDir, backupFilename);
                backupType = 'json';

                await this._exportCollectionsAsJson(backupPath);

                this.logger.info(`Sauvegarde JSON créée : ${backupFilename}`);
            }

            /* ─── Récupérer les métadonnées du fichier créé ─── */
            const stats = fs.statSync(backupPath);

            const backupInfo = {
                filename: backupFilename,
                path: backupPath,
                size: stats.size,
                date: now,
                type: backupType
            };

            /* ─── Sauvegarder les métadonnées dans un fichier compagnon ─── */
            const metaPath = backupPath + '.meta.json';
            fs.writeFileSync(metaPath, JSON.stringify(backupInfo, null, 2), 'utf8');

            return backupInfo;

        } catch (error) {
            this.logger.error(`Erreur lors de la création de la sauvegarde : ${error.message}`);
            throw error;
        }
    }

    /**
     * Liste toutes les sauvegardes disponibles dans le répertoire de sauvegarde.
     *
     * Lit les fichiers de métadonnées (.meta.json) pour chaque sauvegarde
     * et retourne la liste triée par date décroissante (la plus récente en premier).
     *
     * @returns {Promise<Array<{ filename: string, path: string, size: number, date: Date, type: string }>>}
     *          La liste des sauvegardes disponibles
     */
    async listBackups() {
        try {
            /* ─── Lire le contenu du répertoire de sauvegardes ─── */
            const files = fs.readdirSync(this.backupDir);

            /* ─── Filtrer les fichiers de métadonnées ─── */
            const metaFiles = files.filter(f => f.endsWith('.meta.json'));

            /* ─── Lire et analyser chaque fichier de métadonnées ─── */
            const backups = [];

            for (const metaFile of metaFiles) {
                try {
                    const metaPath = path.join(this.backupDir, metaFile);
                    const metaContent = fs.readFileSync(metaPath, 'utf8');
                    const meta = JSON.parse(metaContent);

                    /* Vérifier que le fichier de sauvegarde existe toujours */
                    if (fs.existsSync(meta.path)) {
                        backups.push(meta);
                    }
                } catch (parseError) {
                    this.logger.warn(`Impossible de lire les métadonnées : ${metaFile}`);
                }
            }

            /* ─── Trier par date décroissante (plus récent en premier) ─── */
            backups.sort((a, b) => new Date(b.date) - new Date(a.date));

            return backups;

        } catch (error) {
            this.logger.error(`Erreur lors du listage des sauvegardes : ${error.message}`);
            return [];
        }
    }

    /**
     * Effectue la rotation des sauvegardes.
     *
     * Conserve uniquement les 7 dernières sauvegardes quotidiennes
     * et les 4 dernières sauvegardes hebdomadaires (une par semaine).
     * Les sauvegardes excédentaires sont supprimées pour libérer de l'espace.
     *
     * @returns {Promise<number>} Le nombre de sauvegardes supprimées
     */
    async rotateBackups() {
        try {
            const backups = await this.listBackups();

            if (backups.length === 0) return 0;

            /* ─── Séparer les sauvegardes en quotidiennes et hebdomadaires ─── */
            const dailyBackups = [];
            const weeklyBackups = [];
            const weeksTracked = new Set();

            for (const backup of backups) {
                const backupDate = new Date(backup.date);

                /* Calculer le numéro de semaine ISO pour identifier les sauvegardes hebdomadaires */
                const weekKey = this._getWeekKey(backupDate);

                if (!weeksTracked.has(weekKey)) {
                    /* Première sauvegarde de cette semaine : conserver comme hebdomadaire */
                    weeksTracked.add(weekKey);
                    weeklyBackups.push(backup);
                }

                dailyBackups.push(backup);
            }

            /* ─── Déterminer les sauvegardes à conserver ─── */
            const keepDaily = dailyBackups.slice(0, 7);
            const keepWeekly = weeklyBackups.slice(0, 4);

            /* ─── Fusionner les listes de sauvegardes à conserver (sans doublons) ─── */
            const keepSet = new Set();
            for (const b of keepDaily) keepSet.add(b.filename);
            for (const b of keepWeekly) keepSet.add(b.filename);

            /* ─── Supprimer les sauvegardes excédentaires ─── */
            let deletedCount = 0;

            for (const backup of backups) {
                if (!keepSet.has(backup.filename)) {
                    try {
                        /* Supprimer le fichier de sauvegarde */
                        if (fs.existsSync(backup.path)) {
                            fs.unlinkSync(backup.path);
                        }

                        /* Supprimer le fichier de métadonnées associé */
                        const metaPath = backup.path + '.meta.json';
                        if (fs.existsSync(metaPath)) {
                            fs.unlinkSync(metaPath);
                        }

                        deletedCount++;
                        this.logger.debug(`Sauvegarde supprimée lors de la rotation : ${backup.filename}`);

                    } catch (deleteError) {
                        this.logger.warn(`Impossible de supprimer la sauvegarde : ${backup.filename}`);
                    }
                }
            }

            if (deletedCount > 0) {
                this.logger.info(`Rotation des sauvegardes : ${deletedCount} sauvegarde(s) supprimée(s)`);
            }

            return deletedCount;

        } catch (error) {
            this.logger.error(`Erreur lors de la rotation des sauvegardes : ${error.message}`);
            return 0;
        }
    }

    /**
     * Récupère les métadonnées d'une sauvegarde spécifique par son identifiant (nom de fichier).
     *
     * @param {string} backupId - Le nom du fichier de sauvegarde (ex: backup-2026-02-08T03-00-00.gz)
     * @returns {Promise<{ filename: string, path: string, size: number, date: Date, type: string }|null>}
     *          Les métadonnées de la sauvegarde, ou null si introuvable
     */
    async getBackupInfo(backupId) {
        try {
            /* ─── Construire le chemin du fichier de métadonnées ─── */
            const backupPath = path.join(this.backupDir, backupId);
            const metaPath = backupPath + '.meta.json';

            /* ─── Vérifier l'existence du fichier de métadonnées ─── */
            if (!fs.existsSync(metaPath)) {
                this.logger.warn(`Métadonnées introuvables pour la sauvegarde : ${backupId}`);
                return null;
            }

            /* ─── Lire et retourner les métadonnées ─── */
            const metaContent = fs.readFileSync(metaPath, 'utf8');
            const meta = JSON.parse(metaContent);

            /* ─── Ajouter la taille actuelle du fichier si disponible ─── */
            if (fs.existsSync(backupPath)) {
                const stats = fs.statSync(backupPath);
                meta.size = stats.size;
            }

            return meta;

        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des infos de sauvegarde : ${error.message}`);
            return null;
        }
    }

    /**
     * Vérifie si une commande système est disponible sur la machine.
     *
     * @param {string} command - Le nom de la commande à vérifier
     * @returns {boolean} true si la commande est disponible, false sinon
     * @private
     */
    _isCommandAvailable(command) {
        try {
            execSync(`which ${command}`, { stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Exporte les collections de la base de données en tant que fichier JSON.
     * Utilisé comme méthode de secours lorsque mongodump n'est pas disponible.
     *
     * Récupère les données de toutes les collections Mongoose enregistrées
     * et les sauvegarde dans un seul fichier JSON.
     *
     * @param {string} outputPath - Le chemin du fichier de sortie
     * @returns {Promise<void>}
     * @private
     */
    async _exportCollectionsAsJson(outputPath) {
        try {
            const mongoose = require('mongoose');
            const exportData = {};

            /* ─── Parcourir toutes les collections enregistrées dans Mongoose ─── */
            const modelNames = mongoose.modelNames();

            for (const modelName of modelNames) {
                try {
                    const Model = mongoose.model(modelName);
                    const documents = await Model.find({}).lean();
                    exportData[modelName] = documents;

                    this.logger.debug(
                        `Collection "${modelName}" exportée : ${documents.length} document(s)`
                    );
                } catch (modelError) {
                    this.logger.warn(
                        `Impossible d'exporter la collection "${modelName}" : ${modelError.message}`
                    );
                }
            }

            /* ─── Ajouter les métadonnées d'export ─── */
            exportData._metadata = {
                exportDate: new Date().toISOString(),
                collections: modelNames,
                totalDocuments: Object.values(exportData)
                    .filter(Array.isArray)
                    .reduce((sum, arr) => sum + arr.length, 0)
            };

            /* ─── Écrire le fichier JSON ─── */
            fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

        } catch (error) {
            this.logger.error(`Erreur lors de l'export JSON des collections : ${error.message}`);
            throw error;
        }
    }

    /**
     * Génère une clé de semaine unique pour une date donnée.
     * Utilisée pour la rotation hebdomadaire des sauvegardes.
     *
     * @param {Date} date - La date à analyser
     * @returns {string} Clé au format "YYYY-WXX" (ex: "2026-W06")
     * @private
     */
    _getWeekKey(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);

        /* ─── Calcul du numéro de semaine ISO 8601 ─── */
        d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
        const yearStart = new Date(d.getFullYear(), 0, 4);
        const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

        return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
    }
}

module.exports = BackupSystem;
