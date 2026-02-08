const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed } = require('../utils/embed');
const Guild = require('../../database/models/guild');
const Case = require('../../database/models/case');
const User = require('../../database/models/user');
const Logger = require('../utils/logger');

/**
 * Système d'auto-modération du bot Discord.
 *
 * Analyse automatiquement chaque message envoyé sur le serveur
 * et applique les règles de modération configurées. Détecte :
 * - Le spam (messages répétés trop rapidement)
 * - Les liens non autorisés
 * - Les mentions excessives
 * - Les majuscules abusives
 * - Le flood (messages identiques répétés)
 *
 * Chaque violation peut déclencher une action configurable :
 * avertissement, réduction au silence, expulsion ou bannissement.
 */

/* ─── Expression régulière pour détecter les URLs ─── */
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

/* ─── Paramètres par défaut de l'auto-modération ─── */
const DEFAULT_SETTINGS = {
    antiSpam: {
        /** Nombre maximum de messages dans la fenêtre de temps */
        threshold: 5,
        /** Fenêtre de temps en millisecondes */
        timeWindow: 5000,
    },
    antiLinks: {
        /** Liste blanche de domaines autorisés */
        whitelist: [],
        /** Liste noire de domaines bloqués (vide = tous bloqués sauf whitelist) */
        blacklist: [],
    },
    antiMention: {
        /** Nombre maximum de mentions par message */
        maxMentions: 5,
    },
    antiCaps: {
        /** Pourcentage maximum de majuscules autorisé */
        maxPercentage: 70,
        /** Longueur minimale du message pour appliquer la règle */
        minLength: 10,
    },
    antiFlood: {
        /** Nombre de messages identiques avant action */
        maxRepeats: 3,
        /** Fenêtre de temps pour compter les répétitions (en millisecondes) */
        timeWindow: 30000,
    },
};

/**
 * Classe AutoMod — système d'auto-modération.
 *
 * Analyse les messages en temps réel et applique les règles
 * de modération configurées pour chaque serveur.
 */
class AutoMod {
    /**
     * Crée une nouvelle instance du système d'auto-modération.
     * @param {import('discord.js').Client} client - Instance du client Discord
     */
    constructor(client) {
        /** Référence au client Discord */
        this.client = client;

        /** Instance du logger pour les messages internes */
        this.logger = new Logger('AutoMod');

        /**
         * Suivi du spam par utilisateur et par serveur.
         * Clé : `${guildId}-${userId}`, Valeur : tableau de timestamps
         * @type {Map<string, number[]>}
         */
        this.spamTracker = new Map();

        /**
         * Suivi du flood (messages identiques) par utilisateur et par serveur.
         * Clé : `${guildId}-${userId}`, Valeur : tableau d'objets { content, timestamp }
         * @type {Map<string, Array<{content: string, timestamp: number}>>}
         */
        this.floodTracker = new Map();
    }

    /**
     * Méthode principale : analyse un message et applique les règles d'auto-modération.
     *
     * Vérifie chaque règle activée dans l'ordre de priorité.
     * Si une violation est détectée, l'action configurée est exécutée
     * et la méthode retourne `true`.
     *
     * @param {import('discord.js').Message} message - Le message à analyser
     * @param {object} guildSettings - Configuration du serveur depuis la base de données
     * @returns {Promise<boolean>} `true` si le message a été bloqué, `false` sinon
     */
    async processMessage(message, guildSettings) {
        try {
            /* ─── Ignorer les bots et les messages en dehors des serveurs ─── */
            if (message.author.bot || !message.guild) return false;

            /* ─── Vérifier que l'auto-modération est activée ─── */
            if (!guildSettings || !guildSettings.modules || !guildSettings.modules.automod) {
                return false;
            }

            const automodConfig = guildSettings.automod || {};

            /* ─── Vérifier si l'utilisateur est exempté ─── */
            if (this._isExempt(message, guildSettings)) {
                return false;
            }

            /* ─── Vérifier chaque règle dans l'ordre de priorité ─── */

            /* 1. Anti-spam : messages envoyés trop rapidement */
            if (automodConfig.antiSpam && automodConfig.antiSpam.enabled) {
                const spamResult = this.checkAntiSpam(message, automodConfig.antiSpam);
                if (spamResult) {
                    await this.takeAction(message, automodConfig.antiSpam.action || 'warn', 'Anti-spam : envoi de messages trop rapide');
                    return true;
                }
            }

            /* 2. Anti-liens : URLs non autorisées */
            if (automodConfig.antiLinks && automodConfig.antiLinks.enabled) {
                const linkResult = this.checkAntiLinks(message, automodConfig.antiLinks);
                if (linkResult) {
                    await this.takeAction(message, automodConfig.antiLinks.action || 'warn', 'Anti-liens : lien non autorisé détecté');
                    return true;
                }
            }

            /* 3. Anti-mentions : trop de mentions dans un message */
            if (automodConfig.antiMention && automodConfig.antiMention.enabled) {
                const mentionResult = this.checkAntiMention(message, automodConfig.antiMention);
                if (mentionResult) {
                    await this.takeAction(message, automodConfig.antiMention.action || 'warn', 'Anti-mentions : trop de mentions dans le message');
                    return true;
                }
            }

            /* 4. Anti-majuscules : trop de caractères en majuscules */
            if (automodConfig.antiCaps && automodConfig.antiCaps.enabled) {
                const capsResult = this.checkAntiCaps(message, automodConfig.antiCaps);
                if (capsResult) {
                    await this.takeAction(message, automodConfig.antiCaps.action || 'warn', 'Anti-majuscules : utilisation excessive de majuscules');
                    return true;
                }
            }

            /* 5. Anti-flood : messages identiques répétés */
            if (automodConfig.antiFlood && automodConfig.antiFlood.enabled) {
                const floodResult = this.checkAntiFlood(message, automodConfig.antiFlood);
                if (floodResult) {
                    await this.takeAction(message, automodConfig.antiFlood.action || 'warn', 'Anti-flood : envoi de messages identiques répétés');
                    return true;
                }
            }

            /* ─── Aucune violation détectée ─── */
            return false;
        } catch (error) {
            this.logger.error(`Erreur lors du traitement du message :`, error.message);
            return false;
        }
    }

    /**
     * Vérifie la règle anti-spam : détecte les messages envoyés trop rapidement.
     *
     * Suit les timestamps des messages par utilisateur et vérifie
     * si le nombre de messages dans la fenêtre de temps dépasse le seuil.
     *
     * @param {import('discord.js').Message} message - Le message à vérifier
     * @param {object} settings - Configuration de la règle anti-spam
     * @returns {boolean} `true` si une violation est détectée
     */
    checkAntiSpam(message, settings) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();

        /* ─── Récupérer les paramètres ou utiliser les valeurs par défaut ─── */
        const threshold = settings.threshold || DEFAULT_SETTINGS.antiSpam.threshold;
        const timeWindow = DEFAULT_SETTINGS.antiSpam.timeWindow;

        /* ─── Initialiser le suivi pour cet utilisateur si nécessaire ─── */
        if (!this.spamTracker.has(key)) {
            this.spamTracker.set(key, []);
        }

        const timestamps = this.spamTracker.get(key);

        /* ─── Ajouter le timestamp actuel ─── */
        timestamps.push(now);

        /* ─── Nettoyer les timestamps en dehors de la fenêtre de temps ─── */
        const recentMessages = timestamps.filter(t => now - t <= timeWindow);
        this.spamTracker.set(key, recentMessages);

        /* ─── Vérifier si le seuil est dépassé ─── */
        if (recentMessages.length > threshold) {
            this.logger.debug(`[${message.guild.id}] Anti-spam déclenché pour ${message.author.tag} : ${recentMessages.length}/${threshold}`);
            /* ─── Réinitialiser le compteur après détection ─── */
            this.spamTracker.set(key, []);
            return true;
        }

        return false;
    }

    /**
     * Vérifie la règle anti-liens : détecte les URLs non autorisées.
     *
     * Utilise une expression régulière pour détecter les URLs,
     * puis vérifie chaque lien trouvé contre la liste blanche
     * (domaines autorisés) et la liste noire (domaines bloqués).
     *
     * @param {import('discord.js').Message} message - Le message à vérifier
     * @param {object} settings - Configuration de la règle anti-liens
     * @returns {boolean} `true` si une violation est détectée
     */
    checkAntiLinks(message, settings) {
        const content = message.content;

        /* ─── Chercher toutes les URLs dans le message ─── */
        const urls = content.match(URL_REGEX);
        if (!urls || urls.length === 0) return false;

        /* ─── Récupérer les listes blanche et noire ─── */
        const whitelist = (settings.whitelist && settings.whitelist.length > 0)
            ? settings.whitelist
            : DEFAULT_SETTINGS.antiLinks.whitelist;
        const blacklist = (settings.blacklist && settings.blacklist.length > 0)
            ? settings.blacklist
            : DEFAULT_SETTINGS.antiLinks.blacklist;

        /* ─── Vérifier chaque URL trouvée ─── */
        for (const url of urls) {
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname.toLowerCase();

                /* ─── Si une liste blanche existe, vérifier que le domaine y figure ─── */
                if (whitelist.length > 0) {
                    const isWhitelisted = whitelist.some(allowed =>
                        domain === allowed.toLowerCase() || domain.endsWith(`.${allowed.toLowerCase()}`)
                    );
                    if (!isWhitelisted) {
                        this.logger.debug(`[${message.guild.id}] Anti-liens déclenché pour ${message.author.tag} : domaine "${domain}" non dans la liste blanche`);
                        return true;
                    }
                }

                /* ─── Si une liste noire existe, vérifier que le domaine n'y figure pas ─── */
                if (blacklist.length > 0) {
                    const isBlacklisted = blacklist.some(blocked =>
                        domain === blocked.toLowerCase() || domain.endsWith(`.${blocked.toLowerCase()}`)
                    );
                    if (isBlacklisted) {
                        this.logger.debug(`[${message.guild.id}] Anti-liens déclenché pour ${message.author.tag} : domaine "${domain}" dans la liste noire`);
                        return true;
                    }
                }

                /* ─── Si aucune liste blanche mais pas de liste noire correspondante : bloquer par défaut ─── */
                if (whitelist.length === 0 && blacklist.length === 0) {
                    this.logger.debug(`[${message.guild.id}] Anti-liens déclenché pour ${message.author.tag} : liens non autorisés`);
                    return true;
                }
            } catch (err) {
                /* ─── URL invalide, considérer comme violation ─── */
                this.logger.debug(`[${message.guild.id}] Anti-liens : URL invalide détectée dans le message`);
                return true;
            }
        }

        return false;
    }

    /**
     * Vérifie la règle anti-mentions : détecte les messages avec trop de mentions.
     *
     * Compte le nombre total de mentions d'utilisateurs et de rôles
     * dans le message et vérifie si le seuil est dépassé.
     *
     * @param {import('discord.js').Message} message - Le message à vérifier
     * @param {object} settings - Configuration de la règle anti-mentions
     * @returns {boolean} `true` si une violation est détectée
     */
    checkAntiMention(message, settings) {
        /* ─── Récupérer le seuil ou utiliser la valeur par défaut ─── */
        const maxMentions = settings.threshold || DEFAULT_SETTINGS.antiMention.maxMentions;

        /* ─── Compter les mentions d'utilisateurs et de rôles ─── */
        const userMentions = message.mentions.users.size;
        const roleMentions = message.mentions.roles.size;
        const totalMentions = userMentions + roleMentions;

        /* ─── Vérifier si le seuil est dépassé ─── */
        if (totalMentions > maxMentions) {
            this.logger.debug(`[${message.guild.id}] Anti-mentions déclenché pour ${message.author.tag} : ${totalMentions}/${maxMentions} mentions`);
            return true;
        }

        return false;
    }

    /**
     * Vérifie la règle anti-majuscules : détecte les messages avec trop de caractères en majuscules.
     *
     * Calcule le pourcentage de caractères alphabétiques en majuscules
     * dans le message. Ignore les messages trop courts.
     *
     * @param {import('discord.js').Message} message - Le message à vérifier
     * @param {object} settings - Configuration de la règle anti-majuscules
     * @returns {boolean} `true` si une violation est détectée
     */
    checkAntiCaps(message, settings) {
        const content = message.content;

        /* ─── Récupérer les paramètres ou utiliser les valeurs par défaut ─── */
        const maxPercentage = DEFAULT_SETTINGS.antiCaps.maxPercentage;
        const minLength = DEFAULT_SETTINGS.antiCaps.minLength;

        /* ─── Ignorer les messages trop courts ─── */
        if (content.length < minLength) return false;

        /* ─── Extraire uniquement les caractères alphabétiques ─── */
        const letters = content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
        if (letters.length === 0) return false;

        /* ─── Compter les lettres en majuscules ─── */
        const upperCase = letters.replace(/[^A-ZÀ-Ý]/g, '');
        const capsPercentage = (upperCase.length / letters.length) * 100;

        /* ─── Vérifier si le pourcentage dépasse le seuil ─── */
        if (capsPercentage > maxPercentage) {
            this.logger.debug(`[${message.guild.id}] Anti-majuscules déclenché pour ${message.author.tag} : ${capsPercentage.toFixed(1)}%/${maxPercentage}%`);
            return true;
        }

        return false;
    }

    /**
     * Vérifie la règle anti-flood : détecte les messages identiques répétés.
     *
     * Suit les messages récents par utilisateur et vérifie si le même
     * contenu a été envoyé plus de X fois dans la fenêtre de temps.
     *
     * @param {import('discord.js').Message} message - Le message à vérifier
     * @param {object} settings - Configuration de la règle anti-flood
     * @returns {boolean} `true` si une violation est détectée
     */
    checkAntiFlood(message, settings) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();
        const content = message.content.toLowerCase().trim();

        /* ─── Ignorer les messages vides ─── */
        if (!content) return false;

        /* ─── Récupérer les paramètres ou utiliser les valeurs par défaut ─── */
        const maxRepeats = settings.threshold || DEFAULT_SETTINGS.antiFlood.maxRepeats;
        const timeWindow = DEFAULT_SETTINGS.antiFlood.timeWindow;

        /* ─── Initialiser le suivi pour cet utilisateur si nécessaire ─── */
        if (!this.floodTracker.has(key)) {
            this.floodTracker.set(key, []);
        }

        const history = this.floodTracker.get(key);

        /* ─── Ajouter le message actuel à l'historique ─── */
        history.push({ content, timestamp: now });

        /* ─── Nettoyer les messages en dehors de la fenêtre de temps ─── */
        const recentMessages = history.filter(m => now - m.timestamp <= timeWindow);
        this.floodTracker.set(key, recentMessages);

        /* ─── Compter les messages identiques au message actuel ─── */
        const sameMessages = recentMessages.filter(m => m.content === content);

        /* ─── Vérifier si le nombre de répétitions dépasse le seuil ─── */
        if (sameMessages.length >= maxRepeats) {
            this.logger.debug(`[${message.guild.id}] Anti-flood déclenché pour ${message.author.tag} : ${sameMessages.length}/${maxRepeats} messages identiques`);
            /* ─── Réinitialiser le suivi après détection ─── */
            this.floodTracker.set(key, []);
            return true;
        }

        return false;
    }

    /**
     * Exécute l'action configurée en réponse à une violation d'auto-modération.
     *
     * Actions possibles :
     * - `warn` : Avertir l'utilisateur
     * - `mute` : Réduire au silence l'utilisateur (timeout Discord)
     * - `kick` : Expulser l'utilisateur du serveur
     * - `ban` : Bannir l'utilisateur du serveur
     *
     * Le message incriminé est toujours supprimé.
     * Un cas de modération est créé dans la base de données.
     * L'action est journalisée dans les logs d'auto-modération.
     *
     * @param {import('discord.js').Message} message - Le message ayant déclenché la violation
     * @param {string} action - Type d'action à exécuter ('warn', 'mute', 'kick', 'ban')
     * @param {string} reason - Raison de l'action
     * @returns {Promise<void>}
     */
    async takeAction(message, action, reason) {
        try {
            const guild = message.guild;
            const member = message.member;
            const user = message.author;

            /* ─── 1. Supprimer le message incriminé ─── */
            try {
                if (message.deletable) {
                    await message.delete();
                }
            } catch (err) {
                this.logger.error(`Impossible de supprimer le message :`, err.message);
            }

            /* ─── 2. Obtenir le prochain numéro de cas ─── */
            const caseId = await Case.getNextCaseId(guild.id);

            /* ─── 3. Exécuter l'action selon le type ─── */
            switch (action) {
                case 'warn':
                    await this._actionWarn(guild, member, user, reason, caseId);
                    break;

                case 'mute':
                    await this._actionMute(guild, member, user, reason, caseId);
                    break;

                case 'kick':
                    await this._actionKick(guild, member, user, reason, caseId);
                    break;

                case 'ban':
                    await this._actionBan(guild, member, user, reason, caseId);
                    break;

                default:
                    /* ─── Action inconnue : appliquer un avertissement par défaut ─── */
                    await this._actionWarn(guild, member, user, reason, caseId);
                    break;
            }

            /* ─── 4. Journaliser l'action dans les logs du serveur ─── */
            await this._logAction(guild, action, user, reason, caseId);

            this.logger.info(`[${guild.id}] Auto-mod : ${action} appliqué à ${user.tag} — ${reason}`);
        } catch (error) {
            this.logger.error(`Erreur lors de l'exécution de l'action d'auto-modération :`, error.message);
        }
    }

    /**
     * Vérifie si un utilisateur est exempté de l'auto-modération.
     *
     * Un utilisateur est exempté s'il :
     * - Possède la permission d'administrateur
     * - Possède la permission de gérer les messages
     * - Figure dans la liste des utilisateurs exemptés (bypassUsers)
     * - Figure dans la liste des utilisateurs admin du bot (adminUsers)
     *
     * @param {import('discord.js').Message} message - Le message de l'utilisateur
     * @param {object} guildSettings - Configuration du serveur
     * @returns {boolean} `true` si l'utilisateur est exempté
     * @private
     */
    _isExempt(message, guildSettings) {
        const member = message.member;
        if (!member) return false;

        /* ─── Vérifier les permissions Discord ─── */
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
        if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;

        /* ─── Vérifier la liste des utilisateurs exemptés du bot ─── */
        const permissions = guildSettings.permissions || {};
        if (permissions.bypassUsers && permissions.bypassUsers.includes(message.author.id)) return true;
        if (permissions.adminUsers && permissions.adminUsers.includes(message.author.id)) return true;

        /* ─── Vérifier si l'utilisateur possède le rôle admin du bot ─── */
        if (permissions.adminRoleId && member.roles.cache.has(permissions.adminRoleId)) return true;

        /* ─── Vérifier les salons exemptés pour chaque règle active ─── */
        const automodConfig = guildSettings.automod || {};
        const rules = ['antiSpam', 'antiLinks', 'antiMention', 'antiCaps', 'antiFlood'];
        for (const rule of rules) {
            if (automodConfig[rule] && automodConfig[rule].whitelist) {
                /* ─── Vérifier si le salon actuel est dans la liste blanche de la règle ─── */
                if (automodConfig[rule].whitelist.includes(message.channel.id)) return true;
                /* ─── Vérifier si un des rôles du membre est dans la liste blanche ─── */
                if (member.roles.cache.some(role => automodConfig[rule].whitelist.includes(role.id))) return true;
            }
        }

        return false;
    }

    /**
     * Action : avertir l'utilisateur.
     *
     * Enregistre un avertissement dans le profil de l'utilisateur
     * et crée un cas de modération.
     *
     * @param {import('discord.js').Guild} guild - Le serveur Discord
     * @param {import('discord.js').GuildMember} member - Le membre sanctionné
     * @param {import('discord.js').User} user - L'utilisateur sanctionné
     * @param {string} reason - Raison de l'avertissement
     * @param {number} caseId - Numéro du cas de modération
     * @returns {Promise<void>}
     * @private
     */
    async _actionWarn(guild, member, user, reason, caseId) {
        try {
            /* ─── Enregistrer l'avertissement dans le profil utilisateur ─── */
            await User.findOneAndUpdate(
                { guildId: guild.id, userId: user.id },
                {
                    $push: {
                        warnings: {
                            reason: `[Auto-Mod] ${reason}`,
                            moderatorId: this.client.user.id,
                            date: new Date(),
                        },
                    },
                },
                { upsert: true, new: true }
            );

            /* ─── Créer le cas de modération ─── */
            await Case.create({
                guildId: guild.id,
                caseId,
                type: 'warn',
                userId: user.id,
                userTag: user.tag,
                moderatorId: this.client.user.id,
                moderatorTag: this.client.user.tag,
                reason: `[Auto-Mod] ${reason}`,
            });

            /* ─── Envoyer un message privé à l'utilisateur ─── */
            try {
                const embed = createEmbed({
                    title: '⚠️ Avertissement automatique',
                    description: `Vous avez reçu un avertissement automatique sur **${guild.name}**.`,
                    color: 0xFFCC00,
                    fields: [
                        { name: '📝 Raison', value: reason, inline: false },
                        { name: '🔢 Cas', value: `#${caseId}`, inline: true },
                    ],
                    footer: { text: 'Auto-Modération' },
                    timestamp: true,
                });
                await user.send({ embeds: [embed] });
            } catch (err) {
                /* ─── Impossible d'envoyer un MP (DMs désactivés) ─── */
            }
        } catch (error) {
            this.logger.error(`Erreur lors de l'avertissement de ${user.tag} :`, error.message);
        }
    }

    /**
     * Action : réduire au silence l'utilisateur (timeout Discord).
     *
     * Applique un timeout de 5 minutes par défaut et crée un cas de modération.
     *
     * @param {import('discord.js').Guild} guild - Le serveur Discord
     * @param {import('discord.js').GuildMember} member - Le membre sanctionné
     * @param {import('discord.js').User} user - L'utilisateur sanctionné
     * @param {string} reason - Raison du mute
     * @param {number} caseId - Numéro du cas de modération
     * @returns {Promise<void>}
     * @private
     */
    async _actionMute(guild, member, user, reason, caseId) {
        try {
            /* ─── Durée du mute : 5 minutes par défaut ─── */
            const muteDuration = 5 * 60 * 1000;

            /* ─── Appliquer le timeout Discord ─── */
            if (member && member.moderatable) {
                await member.timeout(muteDuration, `[Auto-Mod] ${reason}`);
            }

            /* ─── Créer le cas de modération ─── */
            await Case.create({
                guildId: guild.id,
                caseId,
                type: 'mute',
                userId: user.id,
                userTag: user.tag,
                moderatorId: this.client.user.id,
                moderatorTag: this.client.user.tag,
                reason: `[Auto-Mod] ${reason}`,
                duration: muteDuration,
            });

            /* ─── Envoyer un message privé à l'utilisateur ─── */
            try {
                const embed = createEmbed({
                    title: '🔇 Réduction au silence automatique',
                    description: `Vous avez été réduit au silence automatiquement sur **${guild.name}**.`,
                    color: 0xF1C40F,
                    fields: [
                        { name: '📝 Raison', value: reason, inline: false },
                        { name: '⏱️ Durée', value: '5 minutes', inline: true },
                        { name: '🔢 Cas', value: `#${caseId}`, inline: true },
                    ],
                    footer: { text: 'Auto-Modération' },
                    timestamp: true,
                });
                await user.send({ embeds: [embed] });
            } catch (err) {
                /* ─── Impossible d'envoyer un MP (DMs désactivés) ─── */
            }
        } catch (error) {
            this.logger.error(`Erreur lors du mute de ${user.tag} :`, error.message);
        }
    }

    /**
     * Action : expulser l'utilisateur du serveur.
     *
     * Expulse le membre et crée un cas de modération.
     *
     * @param {import('discord.js').Guild} guild - Le serveur Discord
     * @param {import('discord.js').GuildMember} member - Le membre sanctionné
     * @param {import('discord.js').User} user - L'utilisateur sanctionné
     * @param {string} reason - Raison de l'expulsion
     * @param {number} caseId - Numéro du cas de modération
     * @returns {Promise<void>}
     * @private
     */
    async _actionKick(guild, member, user, reason, caseId) {
        try {
            /* ─── Envoyer un message privé avant l'expulsion ─── */
            try {
                const embed = createEmbed({
                    title: '👢 Expulsion automatique',
                    description: `Vous avez été expulsé automatiquement de **${guild.name}**.`,
                    color: 0xE67E22,
                    fields: [
                        { name: '📝 Raison', value: reason, inline: false },
                        { name: '🔢 Cas', value: `#${caseId}`, inline: true },
                    ],
                    footer: { text: 'Auto-Modération' },
                    timestamp: true,
                });
                await user.send({ embeds: [embed] });
            } catch (err) {
                /* ─── Impossible d'envoyer un MP (DMs désactivés) ─── */
            }

            /* ─── Expulser le membre ─── */
            if (member && member.kickable) {
                await member.kick(`[Auto-Mod] ${reason}`);
            }

            /* ─── Créer le cas de modération ─── */
            await Case.create({
                guildId: guild.id,
                caseId,
                type: 'kick',
                userId: user.id,
                userTag: user.tag,
                moderatorId: this.client.user.id,
                moderatorTag: this.client.user.tag,
                reason: `[Auto-Mod] ${reason}`,
            });
        } catch (error) {
            this.logger.error(`Erreur lors de l'expulsion de ${user.tag} :`, error.message);
        }
    }

    /**
     * Action : bannir l'utilisateur du serveur.
     *
     * Bannit le membre et crée un cas de modération.
     *
     * @param {import('discord.js').Guild} guild - Le serveur Discord
     * @param {import('discord.js').GuildMember} member - Le membre sanctionné
     * @param {import('discord.js').User} user - L'utilisateur sanctionné
     * @param {string} reason - Raison du bannissement
     * @param {number} caseId - Numéro du cas de modération
     * @returns {Promise<void>}
     * @private
     */
    async _actionBan(guild, member, user, reason, caseId) {
        try {
            /* ─── Envoyer un message privé avant le bannissement ─── */
            try {
                const embed = createEmbed({
                    title: '🔨 Bannissement automatique',
                    description: `Vous avez été banni automatiquement de **${guild.name}**.`,
                    color: 0xE74C3C,
                    fields: [
                        { name: '📝 Raison', value: reason, inline: false },
                        { name: '🔢 Cas', value: `#${caseId}`, inline: true },
                    ],
                    footer: { text: 'Auto-Modération' },
                    timestamp: true,
                });
                await user.send({ embeds: [embed] });
            } catch (err) {
                /* ─── Impossible d'envoyer un MP (DMs désactivés) ─── */
            }

            /* ─── Bannir le membre ─── */
            if (member && member.bannable) {
                await member.ban({ reason: `[Auto-Mod] ${reason}`, deleteMessageSeconds: 86400 });
            }

            /* ─── Créer le cas de modération ─── */
            await Case.create({
                guildId: guild.id,
                caseId,
                type: 'ban',
                userId: user.id,
                userTag: user.tag,
                moderatorId: this.client.user.id,
                moderatorTag: this.client.user.tag,
                reason: `[Auto-Mod] ${reason}`,
            });
        } catch (error) {
            this.logger.error(`Erreur lors du bannissement de ${user.tag} :`, error.message);
        }
    }

    /**
     * Journalise l'action d'auto-modération dans les logs du serveur.
     *
     * Envoie un embed dans le salon de logs d'auto-modération configuré.
     *
     * @param {import('discord.js').Guild} guild - Le serveur Discord
     * @param {string} action - Type d'action exécutée
     * @param {import('discord.js').User} user - L'utilisateur sanctionné
     * @param {string} reason - Raison de l'action
     * @param {number} caseId - Numéro du cas de modération
     * @returns {Promise<void>}
     * @private
     */
    async _logAction(guild, action, user, reason, caseId) {
        try {
            /* ─── Récupérer la configuration des logs du serveur ─── */
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            if (!guildSettings) return;

            /* ─── Vérifier que les logs d'auto-modération sont activés ─── */
            const logConfig = guildSettings.logs ? guildSettings.logs.automod : null;
            if (!logConfig || !logConfig.enabled || !logConfig.channelId) return;

            const channel = guild.channels.cache.get(logConfig.channelId);
            if (!channel) return;

            /* ─── Correspondance action → libellé français ─── */
            const actionLabels = {
                warn: 'Avertissement',
                mute: 'Réduction au silence',
                kick: 'Expulsion',
                ban: 'Bannissement',
            };

            /* ─── Correspondance action → couleur ─── */
            const actionColors = {
                warn: 0xFFCC00,
                mute: 0xF1C40F,
                kick: 0xE67E22,
                ban: 0xE74C3C,
            };

            /* ─── Construire et envoyer l'embed de log ─── */
            const embed = createEmbed({
                title: `🤖 Auto-Modération — ${actionLabels[action] || action}`,
                color: actionColors[action] || 0x2F3136,
                fields: [
                    {
                        name: '👤 Utilisateur',
                        value: `${user.tag}\n\`${user.id}\``,
                        inline: true,
                    },
                    {
                        name: '🛡️ Action',
                        value: actionLabels[action] || action,
                        inline: true,
                    },
                    {
                        name: '📝 Raison',
                        value: reason,
                        inline: false,
                    },
                    {
                        name: '🔢 Cas',
                        value: `#${caseId}`,
                        inline: true,
                    },
                ],
                thumbnail: user.displayAvatarURL({ dynamic: true, size: 128 }),
                footer: { text: 'Système d\'Auto-Modération' },
                timestamp: true,
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error(`Erreur lors de la journalisation de l'action d'auto-modération :`, error.message);
        }
    }
}

module.exports = AutoMod;
