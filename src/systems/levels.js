const User = require('../../database/models/user');
const Logger = require('../utils/logger');
const { createEmbed, COLORS } = require('../utils/embed');

/**
 * Système de niveaux et d'expérience (XP).
 *
 * Gère l'attribution d'XP aux membres du serveur en fonction
 * de leur activité textuelle, les montées de niveau,
 * les récompenses de rôles et le classement.
 */
class LevelSystem {
    /**
     * Crée une nouvelle instance du système de niveaux.
     * @param {import('discord.js').Client} client - Le client Discord
     */
    constructor(client) {
        /** @type {import('discord.js').Client} Le client Discord */
        this.client = client;

        /**
         * Cooldowns d'XP par utilisateur pour éviter le spam.
         * Clé : `${guildId}-${userId}`, Valeur : timestamp du dernier gain
         * @type {Map<string, number>}
         */
        this.xpCooldowns = new Map();

        /** @type {Logger} Instance du logger pour ce système */
        this.logger = new Logger('LevelSystem');
    }

    /**
     * Traite un message pour attribuer de l'XP à l'auteur.
     * Appelée à chaque message reçu dans un serveur où le système est activé.
     *
     * Vérifie le cooldown, calcule l'XP à attribuer (avec multiplicateurs),
     * met à jour la base de données et vérifie si une montée de niveau a lieu.
     *
     * @param {import('discord.js').Message} message - Le message reçu
     * @param {object} guildSettings - Les paramètres du serveur depuis la base de données
     * @returns {Promise<void>}
     */
    async processMessage(message, guildSettings) {
        try {
            /* ─── Ignorer les bots et les messages système ─── */
            if (message.author.bot) return;
            if (!message.guild) return;

            const { guildId } = message.guild;
            const { id: userId } = message.author;
            const cooldownKey = `${guildId}-${userId}`;

            /* ─── Vérification du cooldown d'XP ─── */
            const cooldownDuration = (guildSettings.levels?.xpCooldown || 60) * 1000;
            const lastXpTime = this.xpCooldowns.get(cooldownKey);

            if (lastXpTime && (Date.now() - lastXpTime) < cooldownDuration) {
                return; // L'utilisateur est encore en cooldown
            }

            /* ─── Calcul de l'XP de base (15 à 25, aléatoire) ─── */
            let xpGain = Math.floor(Math.random() * 11) + 15;

            /* ─── Application des multiplicateurs par rôle ─── */
            if (guildSettings.levels?.multipliers?.roles) {
                const roleMultipliers = guildSettings.levels.multipliers.roles;
                const member = message.member;

                if (member) {
                    for (const [roleId, multiplier] of roleMultipliers) {
                        if (member.roles.cache.has(roleId)) {
                            xpGain = Math.floor(xpGain * multiplier);
                            break; // Appliquer uniquement le premier multiplicateur trouvé
                        }
                    }
                }
            }

            /* ─── Application des multiplicateurs par salon ─── */
            if (guildSettings.levels?.multipliers?.channels) {
                const channelMultipliers = guildSettings.levels.multipliers.channels;
                const channelMultiplier = channelMultipliers.get(message.channel.id);

                if (channelMultiplier) {
                    xpGain = Math.floor(xpGain * channelMultiplier);
                }
            }

            /* ─── Mise à jour du cooldown ─── */
            this.xpCooldowns.set(cooldownKey, Date.now());

            /* ─── Mise à jour de l'utilisateur en base de données ─── */
            const user = await User.findOneAndUpdate(
                { guildId, userId },
                {
                    $inc: {
                        xp: xpGain,
                        totalXp: xpGain,
                        messageCount: 1
                    },
                    $setOnInsert: {
                        guildId,
                        userId
                    }
                },
                { upsert: true, new: true }
            );

            /* ─── Vérification de la montée de niveau ─── */
            await this.checkLevelUp(user, guildSettings, message.member);

        } catch (error) {
            this.logger.error(`Erreur lors du traitement du message pour l'XP : ${error.message}`);
        }
    }

    /**
     * Calcule le niveau correspondant à une quantité totale d'XP.
     *
     * Formule : level = Math.floor(0.1 * Math.sqrt(xp))
     *
     * @param {number} xp - La quantité totale d'XP
     * @returns {number} Le niveau calculé
     */
    calculateLevel(xp) {
        return Math.floor(0.1 * Math.sqrt(xp));
    }

    /**
     * Calcule la quantité d'XP nécessaire pour atteindre un niveau donné.
     *
     * Formule : (level * 10) ^ 2
     *
     * @param {number} level - Le niveau cible
     * @returns {number} L'XP totale requise pour ce niveau
     */
    xpForLevel(level) {
        return Math.pow(level * 10, 2);
    }

    /**
     * Vérifie si l'utilisateur a atteint un nouveau niveau après un gain d'XP.
     * Si oui, met à jour le niveau, envoie une notification et attribue
     * les rôles de récompense correspondants.
     *
     * @param {object} user - Le document utilisateur de la base de données
     * @param {object} guildSettings - Les paramètres du serveur
     * @param {import('discord.js').GuildMember} member - Le membre Discord
     * @returns {Promise<void>}
     */
    async checkLevelUp(user, guildSettings, member) {
        try {
            /* ─── Calcul du nouveau niveau à partir de l'XP totale ─── */
            const newLevel = this.calculateLevel(user.totalXp);
            const oldLevel = user.level;

            /* ─── Pas de changement de niveau, on s'arrête ─── */
            if (newLevel <= oldLevel) return;

            /* ─── Mise à jour du niveau dans la base de données ─── */
            await User.findOneAndUpdate(
                { guildId: user.guildId, userId: user.userId },
                { $set: { level: newLevel } }
            );

            this.logger.info(`${user.userId} est passé au niveau ${newLevel} sur le serveur ${user.guildId}`);

            /* ─── Création de l'embed de notification ─── */
            const embed = createEmbed({
                title: '🎉 Montée de niveau !',
                description: `Félicitations <@${user.userId}> ! Tu es passé au **niveau ${newLevel}** !`,
                color: COLORS.levels,
                fields: [
                    {
                        name: '📊 Niveau',
                        value: `${oldLevel} → **${newLevel}**`,
                        inline: true
                    },
                    {
                        name: '✨ XP totale',
                        value: `${user.totalXp.toLocaleString()} XP`,
                        inline: true
                    },
                    {
                        name: '📈 Prochain niveau',
                        value: `${this.xpForLevel(newLevel + 1).toLocaleString()} XP`,
                        inline: true
                    }
                ],
                thumbnail: member?.user?.displayAvatarURL({ dynamic: true, size: 128 }) || null
            });

            /* ─── Envoi de la notification dans le salon configuré ou en DM ─── */
            const levelUpChannelId = guildSettings.levels?.levelUpChannelId;

            if (levelUpChannelId) {
                /* Envoyer dans le salon de montée de niveau configuré */
                const channel = member?.guild?.channels?.cache.get(levelUpChannelId);
                if (channel) {
                    await channel.send({ embeds: [embed] }).catch(() => null);
                }
            } else if (member) {
                /* Envoyer en message privé si aucun salon n'est configuré */
                await member.user.send({ embeds: [embed] }).catch(() => null);
            }

            /* ─── Attribution des rôles de récompense ─── */
            const rewards = guildSettings.levels?.rewards || [];

            for (const reward of rewards) {
                /* Vérifier chaque récompense dont le niveau requis est atteint */
                if (reward.level <= newLevel && member) {
                    const role = member.guild.roles.cache.get(reward.roleId);

                    if (role && !member.roles.cache.has(reward.roleId)) {
                        await member.roles.add(role).catch((err) => {
                            this.logger.error(`Impossible d'attribuer le rôle ${reward.roleId} : ${err.message}`);
                        });

                        this.logger.info(
                            `Rôle de récompense ${reward.roleId} attribué à ${user.userId} (niveau ${reward.level})`
                        );
                    }
                }
            }

        } catch (error) {
            this.logger.error(`Erreur lors de la vérification de montée de niveau : ${error.message}`);
        }
    }

    /**
     * Récupère le classement des utilisateurs par XP totale, paginé.
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

            /* ─── Compter le nombre total d'utilisateurs dans le serveur ─── */
            const total = await User.countDocuments({ guildId, totalXp: { $gt: 0 } });

            /* ─── Récupérer les utilisateurs triés par XP totale décroissante ─── */
            const users = await User.find({ guildId, totalXp: { $gt: 0 } })
                .sort({ totalXp: -1 })
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
            this.logger.error(`Erreur lors de la récupération du classement : ${error.message}`);
            return { users: [], total: 0, page, totalPages: 0 };
        }
    }
}

module.exports = LevelSystem;
