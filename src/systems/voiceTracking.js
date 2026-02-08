const User = require('../../database/models/user');
const Logger = require('../utils/logger');

/**
 * Système de suivi du temps passé en vocal.
 *
 * Enregistre les sessions vocales des membres, calcule la durée
 * passée dans chaque salon, et peut attribuer de l'XP et des pièces
 * en récompense du temps passé en vocal.
 */
class VoiceTrackingSystem {
    /**
     * Crée une nouvelle instance du système de suivi vocal.
     * @param {import('discord.js').Client} client - Le client Discord
     */
    constructor(client) {
        /** @type {import('discord.js').Client} Le client Discord */
        this.client = client;

        /**
         * Sessions vocales actives en cours.
         * Clé : `${guildId}-${userId}`, Valeur : { userId, guildId, channelId, joinedAt }
         * @type {Map<string, { userId: string, guildId: string, channelId: string, joinedAt: Date }>}
         */
        this.activeSessions = new Map();

        /** @type {Logger} Instance du logger pour ce système */
        this.logger = new Logger('VoiceTrackingSystem');
    }

    /**
     * Gère les changements d'état vocal des membres.
     * Appelée depuis l'événement voiceStateUpdate du client Discord.
     *
     * Détecte les cas suivants :
     * - Connexion à un salon vocal : démarrer le suivi
     * - Déconnexion d'un salon vocal : terminer le suivi et enregistrer
     * - Déplacement entre salons : terminer l'ancien suivi, en démarrer un nouveau
     *
     * @param {import('discord.js').VoiceState} oldState - L'ancien état vocal
     * @param {import('discord.js').VoiceState} newState - Le nouvel état vocal
     * @returns {Promise<void>}
     */
    async handleVoiceUpdate(oldState, newState) {
        try {
            /* ─── Ignorer les bots ─── */
            if (newState.member?.user?.bot) return;

            const userId = newState.id;
            const guildId = newState.guild.id;
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;

            /* ─── Cas 1 : L'utilisateur a rejoint un salon vocal ─── */
            if (!oldChannel && newChannel) {
                /* Ignorer le salon AFK du serveur */
                if (newChannel.id === newState.guild.afkChannelId) return;

                /* Ignorer si l'utilisateur est seul dans le salon (configurable) */
                if (newChannel.members.filter(m => !m.user.bot).size <= 1) return;

                await this.startSession(userId, guildId, newChannel.id);
                return;
            }

            /* ─── Cas 2 : L'utilisateur a quitté un salon vocal ─── */
            if (oldChannel && !newChannel) {
                await this.endSession(userId, guildId);
                return;
            }

            /* ─── Cas 3 : L'utilisateur a changé de salon vocal ─── */
            if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
                /* Terminer la session dans l'ancien salon */
                await this.endSession(userId, guildId);

                /* Ignorer le salon AFK du serveur pour la nouvelle session */
                if (newChannel.id === newState.guild.afkChannelId) return;

                /* Ignorer si l'utilisateur est seul dans le nouveau salon */
                if (newChannel.members.filter(m => !m.user.bot).size <= 1) return;

                /* Démarrer une nouvelle session dans le nouveau salon */
                await this.startSession(userId, guildId, newChannel.id);
                return;
            }

        } catch (error) {
            this.logger.error(`Erreur lors du traitement de la mise à jour vocale : ${error.message}`);
        }
    }

    /**
     * Démarre le suivi d'une session vocale pour un utilisateur.
     * Enregistre le timestamp de connexion et les informations du salon.
     *
     * @param {string} userId - L'identifiant de l'utilisateur
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} channelId - L'identifiant du salon vocal
     * @returns {Promise<void>}
     */
    async startSession(userId, guildId, channelId) {
        try {
            const sessionKey = `${guildId}-${userId}`;

            /* ─── Vérifier si une session est déjà en cours ─── */
            if (this.activeSessions.has(sessionKey)) {
                this.logger.warn(`Session déjà active pour ${userId} sur ${guildId}, terminaison forcée`);
                await this.endSession(userId, guildId);
            }

            /* ─── Enregistrer la nouvelle session ─── */
            this.activeSessions.set(sessionKey, {
                userId,
                guildId,
                channelId,
                joinedAt: new Date()
            });

            this.logger.debug(`Session vocale démarrée : ${userId} dans le salon ${channelId} sur ${guildId}`);

        } catch (error) {
            this.logger.error(`Erreur lors du démarrage de la session vocale : ${error.message}`);
        }
    }

    /**
     * Termine le suivi d'une session vocale et sauvegarde les données.
     *
     * Calcule la durée de la session, met à jour le temps total,
     * ajoute la session à l'historique, incrémente le temps par salon,
     * et attribue optionnellement de l'XP et des pièces en récompense.
     *
     * @param {string} userId - L'identifiant de l'utilisateur
     * @param {string} guildId - L'identifiant du serveur
     * @returns {Promise<void>}
     */
    async endSession(userId, guildId) {
        try {
            const sessionKey = `${guildId}-${userId}`;
            const session = this.activeSessions.get(sessionKey);

            /* ─── Pas de session active pour cet utilisateur ─── */
            if (!session) return;

            /* ─── Retirer la session de la carte des sessions actives ─── */
            this.activeSessions.delete(sessionKey);

            /* ─── Calculer la durée de la session en millisecondes ─── */
            const now = new Date();
            const duration = now.getTime() - session.joinedAt.getTime();

            /* ─── Ignorer les sessions trop courtes (moins de 10 secondes) ─── */
            if (duration < 10000) {
                this.logger.debug(`Session vocale trop courte ignorée : ${duration}ms pour ${userId}`);
                return;
            }

            /* ─── Construire l'objet session pour l'historique ─── */
            const sessionData = {
                channelId: session.channelId,
                joinedAt: session.joinedAt,
                leftAt: now,
                duration
            };

            /* ─── Calcul des récompenses pour le temps vocal ─── */
            /* 1 XP par minute passée en vocal */
            const minutesInVoice = Math.floor(duration / 60000);
            const xpReward = minutesInVoice;

            /* 1 pièce par tranche de 5 minutes en vocal */
            const coinReward = Math.floor(minutesInVoice / 5);

            /* ─── Mise à jour de la base de données ─── */
            const channelKey = `voiceTime.byChannel.${session.channelId}`;

            const updateQuery = {
                $inc: {
                    'voiceTime.totalTime': duration,
                    [channelKey]: duration
                },
                $push: {
                    'voiceTime.sessions': sessionData
                },
                $setOnInsert: {
                    guildId,
                    userId
                }
            };

            /* ─── Ajouter les récompenses d'XP et de pièces si applicables ─── */
            if (xpReward > 0) {
                updateQuery.$inc.xp = xpReward;
                updateQuery.$inc.totalXp = xpReward;
            }

            if (coinReward > 0) {
                updateQuery.$inc.balance = coinReward;
            }

            await User.findOneAndUpdate(
                { guildId, userId },
                updateQuery,
                { upsert: true, new: true }
            );

            this.logger.debug(
                `Session vocale terminée : ${userId} sur ${guildId} ` +
                `(durée : ${Math.floor(duration / 1000)}s, XP : +${xpReward}, pièces : +${coinReward})`
            );

        } catch (error) {
            this.logger.error(`Erreur lors de la fin de la session vocale : ${error.message}`);
        }
    }

    /**
     * Récupère les statistiques vocales d'un utilisateur sur un serveur.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} userId - L'identifiant de l'utilisateur
     * @returns {Promise<{ totalTime: number, sessions: object[], byChannel: Map, currentSession: object|null }>}
     *          Les statistiques vocales de l'utilisateur
     */
    async getUserStats(guildId, userId) {
        try {
            const user = await User.findOne({ guildId, userId }).lean();

            /* ─── Vérifier si une session est actuellement en cours ─── */
            const sessionKey = `${guildId}-${userId}`;
            const currentSession = this.activeSessions.get(sessionKey) || null;

            /* ─── Calculer le temps en cours si une session est active ─── */
            let activeTime = 0;
            if (currentSession) {
                activeTime = Date.now() - currentSession.joinedAt.getTime();
            }

            return {
                totalTime: (user?.voiceTime?.totalTime || 0) + activeTime,
                sessions: user?.voiceTime?.sessions || [],
                byChannel: user?.voiceTime?.byChannel || {},
                currentSession
            };

        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des stats vocales : ${error.message}`);
            return { totalTime: 0, sessions: [], byChannel: {}, currentSession: null };
        }
    }

    /**
     * Récupère le classement des utilisateurs par temps vocal total, paginé.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {number} [page=1] - Le numéro de la page (commence à 1)
     * @param {number} [limit=10] - Le nombre d'entrées par page
     * @returns {Promise<{ users: object[], total: number, page: number, totalPages: number }>}
     *          Le classement paginé avec les métadonnées de pagination
     */
    async getLeaderboard(guildId, page = 1, limit = 10) {
        try {
            /* ─── Calculer le nombre de documents à sauter ─── */
            const skip = (page - 1) * limit;

            /* ─── Compter le nombre total d'utilisateurs avec du temps vocal ─── */
            const total = await User.countDocuments({
                guildId,
                'voiceTime.totalTime': { $gt: 0 }
            });

            /* ─── Récupérer les utilisateurs triés par temps vocal décroissant ─── */
            const users = await User.find({
                guildId,
                'voiceTime.totalTime': { $gt: 0 }
            })
                .sort({ 'voiceTime.totalTime': -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            /* ─── Calculer le nombre total de pages ─── */
            const totalPages = Math.ceil(total / limit);

            return {
                users,
                total,
                page,
                totalPages
            };

        } catch (error) {
            this.logger.error(`Erreur lors de la récupération du classement vocal : ${error.message}`);
            return { users: [], total: 0, page, totalPages: 0 };
        }
    }
}

module.exports = VoiceTrackingSystem;
