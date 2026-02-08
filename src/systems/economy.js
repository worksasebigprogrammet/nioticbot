const User = require('../../database/models/user');
const Logger = require('../utils/logger');

/**
 * Système d'économie virtuelle du serveur.
 *
 * Gère la monnaie virtuelle des membres : gain passif par message,
 * solde, transferts, récompenses quotidiennes et hebdomadaires,
 * ainsi que le classement par richesse.
 */
class EconomySystem {
    /**
     * Crée une nouvelle instance du système d'économie.
     * @param {import('discord.js').Client} client - Le client Discord
     */
    constructor(client) {
        /** @type {import('discord.js').Client} Le client Discord */
        this.client = client;

        /**
         * Cooldowns de gain de monnaie par message, pour éviter le spam.
         * Clé : `${guildId}-${userId}`, Valeur : timestamp du dernier gain
         * @type {Map<string, number>}
         */
        this.messageCooldowns = new Map();

        /** @type {Logger} Instance du logger pour ce système */
        this.logger = new Logger('EconomySystem');
    }

    /**
     * Traite un message pour attribuer un petit gain de monnaie à l'auteur.
     * Appelée à chaque message reçu dans un serveur où le système est activé.
     *
     * Le gain est de 1 à 3 pièces par message, avec un cooldown de 60 secondes.
     *
     * @param {import('discord.js').Message} message - Le message reçu
     * @param {object} guildSettings - Les paramètres du serveur depuis la base de données
     * @returns {Promise<void>}
     */
    async processMessage(message, guildSettings) {
        try {
            /* ─── Ignorer les bots et les messages hors serveur ─── */
            if (message.author.bot) return;
            if (!message.guild) return;

            const { guildId } = message.guild;
            const { id: userId } = message.author;
            const cooldownKey = `${guildId}-${userId}`;

            /* ─── Vérification du cooldown (60 secondes par défaut) ─── */
            const cooldownDuration = 60 * 1000;
            const lastGainTime = this.messageCooldowns.get(cooldownKey);

            if (lastGainTime && (Date.now() - lastGainTime) < cooldownDuration) {
                return; // L'utilisateur est encore en cooldown
            }

            /* ─── Calcul du gain de monnaie (1 à 3 pièces, configurable) ─── */
            const minGain = 1;
            const maxGain = 3;
            const coinGain = Math.floor(Math.random() * (maxGain - minGain + 1)) + minGain;

            /* ─── Mise à jour du cooldown ─── */
            this.messageCooldowns.set(cooldownKey, Date.now());

            /* ─── Mise à jour du solde en base de données ─── */
            await User.findOneAndUpdate(
                { guildId, userId },
                {
                    $inc: { balance: coinGain },
                    $setOnInsert: { guildId, userId }
                },
                { upsert: true, new: true }
            );

        } catch (error) {
            this.logger.error(`Erreur lors du gain de monnaie par message : ${error.message}`);
        }
    }

    /**
     * Récupère le solde d'un utilisateur sur un serveur donné.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} userId - L'identifiant de l'utilisateur
     * @returns {Promise<number>} Le solde actuel de l'utilisateur
     */
    async getBalance(guildId, userId) {
        try {
            const user = await User.findOne({ guildId, userId }).lean();
            return user?.balance || 0;
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération du solde : ${error.message}`);
            return 0;
        }
    }

    /**
     * Ajoute un montant au solde d'un utilisateur.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} userId - L'identifiant de l'utilisateur
     * @param {number} amount - Le montant à ajouter (doit être positif)
     * @returns {Promise<number>} Le nouveau solde après l'ajout
     */
    async addBalance(guildId, userId, amount) {
        try {
            if (amount <= 0) {
                this.logger.warn(`Tentative d'ajout d'un montant négatif ou nul : ${amount}`);
                return await this.getBalance(guildId, userId);
            }

            const user = await User.findOneAndUpdate(
                { guildId, userId },
                {
                    $inc: { balance: amount },
                    $setOnInsert: { guildId, userId }
                },
                { upsert: true, new: true }
            );

            return user.balance;

        } catch (error) {
            this.logger.error(`Erreur lors de l'ajout au solde : ${error.message}`);
            return 0;
        }
    }

    /**
     * Retire un montant du solde d'un utilisateur.
     * Retourne false si le solde est insuffisant.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} userId - L'identifiant de l'utilisateur
     * @param {number} amount - Le montant à retirer (doit être positif)
     * @returns {Promise<boolean>} true si le retrait a réussi, false si fonds insuffisants
     */
    async removeBalance(guildId, userId, amount) {
        try {
            if (amount <= 0) {
                this.logger.warn(`Tentative de retrait d'un montant négatif ou nul : ${amount}`);
                return false;
            }

            /* ─── Vérifier si le solde est suffisant ─── */
            const currentBalance = await this.getBalance(guildId, userId);

            if (currentBalance < amount) {
                return false; // Fonds insuffisants
            }

            /* ─── Effectuer le retrait ─── */
            await User.findOneAndUpdate(
                { guildId, userId },
                { $inc: { balance: -amount } }
            );

            return true;

        } catch (error) {
            this.logger.error(`Erreur lors du retrait du solde : ${error.message}`);
            return false;
        }
    }

    /**
     * Transfère un montant d'un utilisateur à un autre sur le même serveur.
     *
     * Vérifie que l'expéditeur a suffisamment de fonds avant d'effectuer
     * le transfert. Les deux opérations (retrait et ajout) sont effectuées
     * séquentiellement.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} fromUserId - L'identifiant de l'expéditeur
     * @param {string} toUserId - L'identifiant du destinataire
     * @param {number} amount - Le montant à transférer
     * @returns {Promise<{ success: boolean, fromBalance: number, toBalance: number }>}
     *          Résultat du transfert avec les soldes mis à jour
     */
    async transfer(guildId, fromUserId, toUserId, amount) {
        try {
            if (amount <= 0) {
                return { success: false, fromBalance: 0, toBalance: 0 };
            }

            /* ─── Vérifier que l'expéditeur et le destinataire sont différents ─── */
            if (fromUserId === toUserId) {
                return { success: false, fromBalance: 0, toBalance: 0 };
            }

            /* ─── Retirer du solde de l'expéditeur ─── */
            const removed = await this.removeBalance(guildId, fromUserId, amount);

            if (!removed) {
                const fromBalance = await this.getBalance(guildId, fromUserId);
                const toBalance = await this.getBalance(guildId, toUserId);
                return { success: false, fromBalance, toBalance };
            }

            /* ─── Ajouter au solde du destinataire ─── */
            const toBalance = await this.addBalance(guildId, toUserId, amount);
            const fromBalance = await this.getBalance(guildId, fromUserId);

            this.logger.info(
                `Transfert de ${amount} pièces : ${fromUserId} → ${toUserId} sur ${guildId}`
            );

            return { success: true, fromBalance, toBalance };

        } catch (error) {
            this.logger.error(`Erreur lors du transfert : ${error.message}`);
            return { success: false, fromBalance: 0, toBalance: 0 };
        }
    }

    /**
     * Réclame la récompense quotidienne pour un utilisateur.
     *
     * Vérifie que 24 heures se sont écoulées depuis la dernière réclamation.
     * Le montant par défaut est de 100 pièces, configurable dans les paramètres du serveur.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} userId - L'identifiant de l'utilisateur
     * @param {number} [amount] - Le montant à attribuer (optionnel, défaut : 100)
     * @returns {Promise<{ success: boolean, amount: number, nextClaim: Date|null }>}
     *          Résultat de la réclamation avec le prochain horaire disponible
     */
    async claimDaily(guildId, userId, amount) {
        try {
            /* ─── Montant par défaut : 100 pièces ─── */
            const dailyAmount = amount || 100;

            /* ─── Récupérer l'utilisateur en base de données ─── */
            let user = await User.findOne({ guildId, userId });

            if (!user) {
                user = await User.create({ guildId, userId });
            }

            /* ─── Vérifier si 24 heures se sont écoulées ─── */
            const now = new Date();
            const cooldownMs = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

            if (user.dailyLastClaimed) {
                const timeSinceLastClaim = now.getTime() - user.dailyLastClaimed.getTime();

                if (timeSinceLastClaim < cooldownMs) {
                    /* Calculer quand la prochaine réclamation sera possible */
                    const nextClaim = new Date(user.dailyLastClaimed.getTime() + cooldownMs);
                    return { success: false, amount: 0, nextClaim };
                }
            }

            /* ─── Attribuer la récompense et mettre à jour la date ─── */
            await User.findOneAndUpdate(
                { guildId, userId },
                {
                    $inc: { balance: dailyAmount },
                    $set: { dailyLastClaimed: now }
                }
            );

            this.logger.info(
                `Récompense quotidienne de ${dailyAmount} pièces réclamée par ${userId} sur ${guildId}`
            );

            return { success: true, amount: dailyAmount, nextClaim: null };

        } catch (error) {
            this.logger.error(`Erreur lors de la réclamation quotidienne : ${error.message}`);
            return { success: false, amount: 0, nextClaim: null };
        }
    }

    /**
     * Réclame la récompense hebdomadaire pour un utilisateur.
     *
     * Vérifie que 7 jours se sont écoulés depuis la dernière réclamation.
     * Le montant par défaut est de 500 pièces, configurable dans les paramètres du serveur.
     *
     * @param {string} guildId - L'identifiant du serveur
     * @param {string} userId - L'identifiant de l'utilisateur
     * @param {number} [amount] - Le montant à attribuer (optionnel, défaut : 500)
     * @returns {Promise<{ success: boolean, amount: number, nextClaim: Date|null }>}
     *          Résultat de la réclamation avec le prochain horaire disponible
     */
    async claimWeekly(guildId, userId, amount) {
        try {
            /* ─── Montant par défaut : 500 pièces ─── */
            const weeklyAmount = amount || 500;

            /* ─── Récupérer l'utilisateur en base de données ─── */
            let user = await User.findOne({ guildId, userId });

            if (!user) {
                user = await User.create({ guildId, userId });
            }

            /* ─── Vérifier si 7 jours se sont écoulés ─── */
            const now = new Date();
            const cooldownMs = 7 * 24 * 60 * 60 * 1000; // 7 jours en millisecondes

            if (user.weeklyLastClaimed) {
                const timeSinceLastClaim = now.getTime() - user.weeklyLastClaimed.getTime();

                if (timeSinceLastClaim < cooldownMs) {
                    /* Calculer quand la prochaine réclamation sera possible */
                    const nextClaim = new Date(user.weeklyLastClaimed.getTime() + cooldownMs);
                    return { success: false, amount: 0, nextClaim };
                }
            }

            /* ─── Attribuer la récompense et mettre à jour la date ─── */
            await User.findOneAndUpdate(
                { guildId, userId },
                {
                    $inc: { balance: weeklyAmount },
                    $set: { weeklyLastClaimed: now }
                }
            );

            this.logger.info(
                `Récompense hebdomadaire de ${weeklyAmount} pièces réclamée par ${userId} sur ${guildId}`
            );

            return { success: true, amount: weeklyAmount, nextClaim: null };

        } catch (error) {
            this.logger.error(`Erreur lors de la réclamation hebdomadaire : ${error.message}`);
            return { success: false, amount: 0, nextClaim: null };
        }
    }

    /**
     * Récupère le classement des utilisateurs par solde, paginé.
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

            /* ─── Compter le nombre total d'utilisateurs avec un solde positif ─── */
            const total = await User.countDocuments({ guildId, balance: { $gt: 0 } });

            /* ─── Récupérer les utilisateurs triés par solde décroissant ─── */
            const users = await User.find({ guildId, balance: { $gt: 0 } })
                .sort({ balance: -1 })
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
            this.logger.error(`Erreur lors de la récupération du classement économie : ${error.message}`);
            return { users: [], total: 0, page, totalPages: 0 };
        }
    }
}

module.exports = EconomySystem;
