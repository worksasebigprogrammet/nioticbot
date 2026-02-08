const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed } = require('../utils/embed');
const Guild = require('../../database/models/guild');
const Logger = require('../utils/logger');

/**
 * Système anti-raid du bot Discord.
 *
 * Surveille les arrivées massives de membres et les actions
 * administratives suspectes pour protéger le serveur contre
 * les raids et les compromissions de comptes administrateurs.
 *
 * Fonctionnalités principales :
 * - Détection de raids par afflux massif de membres
 * - Verrouillage automatique des salons textuels
 * - Augmentation du niveau de vérification
 * - Surveillance des actions administratives suspectes
 * - Alertes aux propriétaires et administrateurs
 */

/* ─── Paramètres par défaut de l'anti-raid ─── */
const DEFAULT_SETTINGS = {
    /** Nombre d'arrivées pour déclencher le mode raid */
    joinThreshold: 10,
    /** Fenêtre de temps pour compter les arrivées (en millisecondes) */
    joinTimeWindow: 10000,
    /** Nombre d'actions admin suspectes avant alerte */
    adminActionThreshold: 5,
    /** Fenêtre de temps pour les actions admin (en millisecondes) */
    adminActionTimeWindow: 30000,
};

/**
 * Classe AntiRaid — système de protection contre les raids.
 *
 * Utilise des Maps pour suivre les arrivées et les actions
 * administratives par serveur. Peut verrouiller automatiquement
 * le serveur et alerter les propriétaires en cas de détection.
 */
class AntiRaid {
    /**
     * Crée une nouvelle instance du système anti-raid.
     * @param {import('discord.js').Client} client - Instance du client Discord
     */
    constructor(client) {
        /** Référence au client Discord */
        this.client = client;

        /** Instance du logger pour les messages internes */
        this.logger = new Logger('AntiRaid');

        /**
         * Suivi des arrivées de membres par serveur.
         * Clé : guildId, Valeur : tableau de timestamps d'arrivée
         * @type {Map<string, number[]>}
         */
        this.joinTracker = new Map();

        /**
         * Suivi des actions administratives par serveur.
         * Clé : guildId, Valeur : tableau d'objets { type, timestamp }
         * @type {Map<string, Array<{type: string, timestamp: number}>>}
         */
        this.adminActionTracker = new Map();

        /**
         * État du mode raid par serveur.
         * Clé : guildId, Valeur : objet contenant l'état et les métadonnées
         * @type {Map<string, {active: boolean, activatedAt: number, previousVerificationLevel: number, lockedChannels: string[]}>}
         */
        this.raidMode = new Map();
    }

    /**
     * Gère l'arrivée d'un nouveau membre sur le serveur.
     *
     * Enregistre le timestamp d'arrivée, nettoie les anciennes entrées
     * en dehors de la fenêtre de temps, et vérifie si le seuil est atteint
     * pour déclencher le mode raid.
     *
     * @param {import('discord.js').GuildMember} member - Membre qui vient de rejoindre
     * @param {object} guildSettings - Configuration du serveur depuis la base de données
     * @returns {Promise<void>}
     */
    async handleJoin(member, guildSettings) {
        try {
            const guildId = member.guild.id;

            /* ─── Vérifier que l'anti-raid est activé ─── */
            if (!guildSettings || !guildSettings.modules || !guildSettings.modules.antiraid) {
                return;
            }

            /* ─── Récupérer les paramètres ou utiliser les valeurs par défaut ─── */
            const antiraidConfig = guildSettings.antiraid || {};
            const joinThreshold = antiraidConfig.joinThreshold || DEFAULT_SETTINGS.joinThreshold;
            const joinTimeWindow = (antiraidConfig.joinTimeWindow || DEFAULT_SETTINGS.joinTimeWindow / 1000) * 1000;

            /* ─── Initialiser le suivi pour ce serveur si nécessaire ─── */
            if (!this.joinTracker.has(guildId)) {
                this.joinTracker.set(guildId, []);
            }

            const now = Date.now();
            const joins = this.joinTracker.get(guildId);

            /* ─── Ajouter le timestamp de cette arrivée ─── */
            joins.push(now);

            /* ─── Nettoyer les arrivées en dehors de la fenêtre de temps ─── */
            const recentJoins = joins.filter(timestamp => now - timestamp <= joinTimeWindow);
            this.joinTracker.set(guildId, recentJoins);

            this.logger.debug(`[${guildId}] Arrivée détectée : ${recentJoins.length}/${joinThreshold} en ${joinTimeWindow / 1000}s`);

            /* ─── Vérifier si le seuil est atteint pour déclencher le raid ─── */
            if (recentJoins.length >= joinThreshold) {
                /* ─── Éviter de déclencher plusieurs fois si déjà en mode raid ─── */
                const currentStatus = this.raidMode.get(guildId);
                if (currentStatus && currentStatus.active) {
                    this.logger.debug(`[${guildId}] Mode raid déjà actif, arrivée ignorée`);
                    return;
                }

                this.logger.warn(`[${guildId}] Seuil de raid atteint ! ${recentJoins.length} arrivées en ${joinTimeWindow / 1000}s`);

                /* ─── Déclencher le mode raid ─── */
                await this.triggerRaidMode(member.guild, guildSettings);

                /* ─── Réinitialiser le compteur d'arrivées ─── */
                this.joinTracker.set(guildId, []);
            }
        } catch (error) {
            this.logger.error(`Erreur lors du traitement de l'arrivée du membre :`, error.message);
        }
    }

    /**
     * Déclenche le mode raid sur le serveur.
     *
     * Actions effectuées :
     * 1. Verrouiller tous les salons textuels (retirer SendMessages pour @everyone)
     * 2. Augmenter le niveau de vérification au maximum
     * 3. Envoyer une alerte dans le salon de logs anti-raid
     * 4. Enregistrer l'état du mode raid
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur Discord
     * @param {object} guildSettings - Configuration du serveur depuis la base de données
     * @returns {Promise<void>}
     */
    async triggerRaidMode(guild, guildSettings) {
        try {
            const guildId = guild.id;
            const actions = (guildSettings.antiraid && guildSettings.antiraid.actions) || {};
            const actionsTaken = [];

            this.logger.warn(`[${guildId}] Activation du mode raid sur le serveur "${guild.name}"`);

            /* ─── Sauvegarder le niveau de vérification actuel ─── */
            const previousVerificationLevel = guild.verificationLevel;
            const lockedChannels = [];

            /* ─── 1. Verrouiller tous les salons textuels ─── */
            if (actions.lockdown !== false) {
                const textChannels = guild.channels.cache.filter(
                    channel => channel.type === ChannelType.GuildText
                );

                for (const [channelId, channel] of textChannels) {
                    try {
                        /* ─── Retirer la permission d'envoyer des messages pour @everyone ─── */
                        await channel.permissionOverwrites.edit(guild.roles.everyone, {
                            [PermissionFlagsBits.SendMessages]: false,
                        }, { reason: '[Anti-Raid] Verrouillage automatique — raid détecté' });

                        lockedChannels.push(channelId);
                    } catch (err) {
                        this.logger.error(`[${guildId}] Impossible de verrouiller le salon #${channel.name} :`, err.message);
                    }
                }

                actionsTaken.push(`Verrouillage de ${lockedChannels.length} salons textuels`);
            }

            /* ─── 2. Augmenter le niveau de vérification au maximum ─── */
            if (actions.enableVerification !== false) {
                try {
                    await guild.setVerificationLevel(4, '[Anti-Raid] Niveau de vérification maximal — raid détecté');
                    actionsTaken.push('Niveau de vérification défini au maximum');
                } catch (err) {
                    this.logger.error(`[${guildId}] Impossible de modifier le niveau de vérification :`, err.message);
                }
            }

            /* ─── 3. Désactiver les invitations si configuré ─── */
            if (actions.disableInvites) {
                try {
                    const invites = await guild.invites.fetch();
                    for (const [code, invite] of invites) {
                        try {
                            await invite.delete('[Anti-Raid] Suppression des invitations — raid détecté');
                        } catch (err) {
                            this.logger.error(`[${guildId}] Impossible de supprimer l'invitation ${code} :`, err.message);
                        }
                    }
                    actionsTaken.push(`Suppression de ${invites.size} invitations`);
                } catch (err) {
                    this.logger.error(`[${guildId}] Impossible de récupérer les invitations :`, err.message);
                }
            }

            /* ─── 4. Expulser les comptes récents si configuré ─── */
            if (actions.kickNewAccounts) {
                const minAge = (actions.minAccountAge || 7) * 24 * 60 * 60 * 1000;
                const now = Date.now();
                let kickedCount = 0;

                const recentMembers = guild.members.cache.filter(m => {
                    if (!m.user.createdAt) return false;
                    return (now - m.user.createdAt.getTime()) < minAge && !m.user.bot;
                });

                for (const [memberId, member] of recentMembers) {
                    try {
                        if (member.kickable) {
                            await member.kick('[Anti-Raid] Compte trop récent — raid détecté');
                            kickedCount++;
                        }
                    } catch (err) {
                        this.logger.error(`[${guildId}] Impossible d'expulser le membre ${memberId} :`, err.message);
                    }
                }

                if (kickedCount > 0) {
                    actionsTaken.push(`Expulsion de ${kickedCount} comptes récents`);
                }
            }

            /* ─── 5. Enregistrer l'état du mode raid ─── */
            this.raidMode.set(guildId, {
                active: true,
                activatedAt: Date.now(),
                previousVerificationLevel,
                lockedChannels,
            });

            /* ─── 6. Envoyer une alerte dans le salon de logs anti-raid ─── */
            await this._sendRaidAlert(guild, guildSettings, actionsTaken);

            /* ─── 7. Notifier les administrateurs si configuré ─── */
            if (actions.notifyAdmins !== false) {
                await this._notifyAdmins(guild, actionsTaken);
            }

            this.logger.warn(`[${guildId}] Mode raid activé avec succès. Actions : ${actionsTaken.join(', ')}`);
        } catch (error) {
            this.logger.error(`Erreur lors de l'activation du mode raid :`, error.message);
        }
    }

    /**
     * Désactive le mode raid sur le serveur.
     *
     * Actions effectuées :
     * 1. Déverrouiller tous les salons précédemment verrouillés
     * 2. Restaurer le niveau de vérification précédent
     * 3. Envoyer une alerte de fin de raid
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur Discord
     * @param {object} guildSettings - Configuration du serveur depuis la base de données
     * @returns {Promise<void>}
     */
    async disableRaidMode(guild, guildSettings) {
        try {
            const guildId = guild.id;
            const raidStatus = this.raidMode.get(guildId);

            /* ─── Vérifier que le mode raid est actuellement actif ─── */
            if (!raidStatus || !raidStatus.active) {
                this.logger.debug(`[${guildId}] Le mode raid n'est pas actif`);
                return;
            }

            this.logger.info(`[${guildId}] Désactivation du mode raid sur le serveur "${guild.name}"`);

            const actionsTaken = [];

            /* ─── 1. Déverrouiller les salons précédemment verrouillés ─── */
            if (raidStatus.lockedChannels && raidStatus.lockedChannels.length > 0) {
                let unlockedCount = 0;

                for (const channelId of raidStatus.lockedChannels) {
                    try {
                        const channel = guild.channels.cache.get(channelId);
                        if (channel) {
                            /* ─── Réinitialiser la permission d'envoi de messages ─── */
                            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                                [PermissionFlagsBits.SendMessages]: null,
                            }, { reason: '[Anti-Raid] Déverrouillage — fin du mode raid' });

                            unlockedCount++;
                        }
                    } catch (err) {
                        this.logger.error(`[${guildId}] Impossible de déverrouiller le salon ${channelId} :`, err.message);
                    }
                }

                actionsTaken.push(`Déverrouillage de ${unlockedCount} salons textuels`);
            }

            /* ─── 2. Restaurer le niveau de vérification précédent ─── */
            if (raidStatus.previousVerificationLevel !== undefined) {
                try {
                    await guild.setVerificationLevel(
                        raidStatus.previousVerificationLevel,
                        '[Anti-Raid] Restauration du niveau de vérification — fin du mode raid'
                    );
                    actionsTaken.push('Niveau de vérification restauré');
                } catch (err) {
                    this.logger.error(`[${guildId}] Impossible de restaurer le niveau de vérification :`, err.message);
                }
            }

            /* ─── 3. Mettre à jour l'état du mode raid ─── */
            this.raidMode.set(guildId, {
                active: false,
                activatedAt: raidStatus.activatedAt,
                deactivatedAt: Date.now(),
                previousVerificationLevel: raidStatus.previousVerificationLevel,
                lockedChannels: [],
            });

            /* ─── 4. Envoyer l'alerte de fin de raid ─── */
            await this._sendRaidEndAlert(guild, guildSettings, actionsTaken);

            this.logger.info(`[${guildId}] Mode raid désactivé avec succès. Actions : ${actionsTaken.join(', ')}`);
        } catch (error) {
            this.logger.error(`Erreur lors de la désactivation du mode raid :`, error.message);
        }
    }

    /**
     * Gère les actions administratives pour détecter les comportements suspects.
     *
     * Surveille les actions telles que la suppression de salons, de rôles,
     * les bannissements massifs, etc. Si un administrateur effectue trop
     * d'actions en peu de temps, une alerte est envoyée aux propriétaires.
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur Discord
     * @param {string} actionType - Type d'action administrative (ex: 'channel_delete', 'role_delete', 'ban')
     * @returns {Promise<void>}
     */
    async handleAdminAction(guild, actionType) {
        try {
            const guildId = guild.id;

            /* ─── Récupérer la configuration du serveur ─── */
            const guildSettings = await Guild.findOne({ guildId });
            if (!guildSettings || !guildSettings.modules || !guildSettings.modules.antiraid) {
                return;
            }

            /* ─── Récupérer les paramètres ou utiliser les valeurs par défaut ─── */
            const antiraidConfig = guildSettings.antiraid || {};
            const adminActionThreshold = antiraidConfig.adminActionThreshold || DEFAULT_SETTINGS.adminActionThreshold;
            const adminActionTimeWindow = DEFAULT_SETTINGS.adminActionTimeWindow;

            /* ─── Initialiser le suivi pour ce serveur si nécessaire ─── */
            if (!this.adminActionTracker.has(guildId)) {
                this.adminActionTracker.set(guildId, []);
            }

            const now = Date.now();
            const actions = this.adminActionTracker.get(guildId);

            /* ─── Ajouter cette action au suivi ─── */
            actions.push({ type: actionType, timestamp: now });

            /* ─── Nettoyer les actions en dehors de la fenêtre de temps ─── */
            const recentActions = actions.filter(a => now - a.timestamp <= adminActionTimeWindow);
            this.adminActionTracker.set(guildId, recentActions);

            this.logger.debug(`[${guildId}] Action admin détectée (${actionType}) : ${recentActions.length}/${adminActionThreshold} en ${adminActionTimeWindow / 1000}s`);

            /* ─── Vérifier si le seuil est atteint ─── */
            if (recentActions.length >= adminActionThreshold) {
                this.logger.warn(`[${guildId}] Activité administrative suspecte détectée ! ${recentActions.length} actions en ${adminActionTimeWindow / 1000}s`);

                /* ─── Alerter les propriétaires du serveur ─── */
                await this._alertOwners(guild, recentActions);

                /* ─── Réinitialiser le compteur pour éviter les alertes en boucle ─── */
                this.adminActionTracker.set(guildId, []);
            }
        } catch (error) {
            this.logger.error(`Erreur lors du traitement de l'action administrative :`, error.message);
        }
    }

    /**
     * Retourne l'état actuel du système anti-raid pour un serveur.
     *
     * @param {string} guildId - Identifiant du serveur Discord
     * @returns {object} Objet contenant l'état du mode raid et les statistiques
     */
    getStatus(guildId) {
        const raidStatus = this.raidMode.get(guildId) || { active: false };
        const joinHistory = this.joinTracker.get(guildId) || [];
        const adminActions = this.adminActionTracker.get(guildId) || [];

        return {
            /** Indique si le mode raid est actuellement actif */
            raidModeActive: raidStatus.active,
            /** Timestamp d'activation du mode raid (si actif) */
            activatedAt: raidStatus.activatedAt || null,
            /** Timestamp de désactivation du mode raid (si désactivé) */
            deactivatedAt: raidStatus.deactivatedAt || null,
            /** Nombre de salons actuellement verrouillés */
            lockedChannelsCount: raidStatus.lockedChannels ? raidStatus.lockedChannels.length : 0,
            /** Nombre d'arrivées récentes dans la fenêtre de temps */
            recentJoins: joinHistory.length,
            /** Nombre d'actions administratives récentes */
            recentAdminActions: adminActions.length,
        };
    }

    /**
     * Envoie une alerte de raid dans le salon de logs anti-raid.
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur
     * @param {object} guildSettings - Configuration du serveur
     * @param {string[]} actionsTaken - Liste des actions effectuées
     * @returns {Promise<void>}
     * @private
     */
    async _sendRaidAlert(guild, guildSettings, actionsTaken) {
        try {
            /* ─── Trouver le salon de log anti-raid ─── */
            const logConfig = guildSettings.logs ? guildSettings.logs.antiraid : null;
            if (!logConfig || !logConfig.enabled || !logConfig.channelId) return;

            const channel = guild.channels.cache.get(logConfig.channelId);
            if (!channel) return;

            /* ─── Construire l'embed d'alerte ─── */
            const embed = createEmbed({
                title: '🚨 RAID DÉTECTÉ — Mode raid activé',
                description: `Un afflux massif de membres a été détecté sur **${guild.name}**. Le mode raid a été automatiquement activé pour protéger le serveur.`,
                color: 0xFF0000,
                fields: [
                    {
                        name: '🛡️ Actions effectuées',
                        value: actionsTaken.length > 0 ? actionsTaken.map(a => `• ${a}`).join('\n') : 'Aucune action automatique',
                        inline: false,
                    },
                    {
                        name: '⏱️ Activé à',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true,
                    },
                    {
                        name: '💡 Désactivation',
                        value: 'Utilisez la commande anti-raid pour désactiver le mode raid manuellement.',
                        inline: false,
                    },
                ],
                footer: { text: 'Système Anti-Raid' },
                timestamp: true,
            });

            await channel.send({ content: '@everyone', embeds: [embed] });
        } catch (error) {
            this.logger.error(`Erreur lors de l'envoi de l'alerte de raid :`, error.message);
        }
    }

    /**
     * Envoie une alerte de fin de raid dans le salon de logs anti-raid.
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur
     * @param {object} guildSettings - Configuration du serveur
     * @param {string[]} actionsTaken - Liste des actions effectuées pour la désactivation
     * @returns {Promise<void>}
     * @private
     */
    async _sendRaidEndAlert(guild, guildSettings, actionsTaken) {
        try {
            /* ─── Trouver le salon de log anti-raid ─── */
            const logConfig = guildSettings.logs ? guildSettings.logs.antiraid : null;
            if (!logConfig || !logConfig.enabled || !logConfig.channelId) return;

            const channel = guild.channels.cache.get(logConfig.channelId);
            if (!channel) return;

            /* ─── Construire l'embed de fin de raid ─── */
            const embed = createEmbed({
                title: '✅ Mode raid désactivé',
                description: `Le mode raid a été désactivé sur **${guild.name}**. Le serveur revient à son état normal.`,
                color: 0x00FF00,
                fields: [
                    {
                        name: '🔓 Actions de restauration',
                        value: actionsTaken.length > 0 ? actionsTaken.map(a => `• ${a}`).join('\n') : 'Aucune action de restauration',
                        inline: false,
                    },
                    {
                        name: '⏱️ Désactivé à',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true,
                    },
                ],
                footer: { text: 'Système Anti-Raid' },
                timestamp: true,
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error(`Erreur lors de l'envoi de l'alerte de fin de raid :`, error.message);
        }
    }

    /**
     * Notifie les administrateurs du serveur par message privé.
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur
     * @param {string[]} actionsTaken - Liste des actions effectuées
     * @returns {Promise<void>}
     * @private
     */
    async _notifyAdmins(guild, actionsTaken) {
        try {
            /* ─── Récupérer les membres avec la permission d'administrateur ─── */
            const admins = guild.members.cache.filter(
                m => m.permissions.has(PermissionFlagsBits.Administrator) && !m.user.bot
            );

            const embed = createEmbed({
                title: '🚨 Alerte Anti-Raid',
                description: `Un raid a été détecté sur **${guild.name}**. Le mode raid a été activé automatiquement.`,
                color: 0xFF0000,
                fields: [
                    {
                        name: '🛡️ Actions effectuées',
                        value: actionsTaken.length > 0 ? actionsTaken.map(a => `• ${a}`).join('\n') : 'Aucune action automatique',
                        inline: false,
                    },
                ],
                footer: { text: 'Système Anti-Raid' },
                timestamp: true,
            });

            /* ─── Envoyer un message privé à chaque administrateur ─── */
            for (const [memberId, admin] of admins) {
                try {
                    await admin.send({ embeds: [embed] });
                } catch (err) {
                    /* ─── L'administrateur a peut-être désactivé les messages privés ─── */
                    this.logger.debug(`Impossible d'envoyer un MP à l'administrateur ${admin.user.tag}`);
                }
            }
        } catch (error) {
            this.logger.error(`Erreur lors de la notification des administrateurs :`, error.message);
        }
    }

    /**
     * Alerte les propriétaires du serveur en cas d'activité administrative suspecte.
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur
     * @param {Array<{type: string, timestamp: number}>} recentActions - Actions récentes détectées
     * @returns {Promise<void>}
     * @private
     */
    async _alertOwners(guild, recentActions) {
        try {
            /* ─── Construire le résumé des actions suspectes ─── */
            const actionSummary = recentActions
                .map(a => `• **${a.type}** — <t:${Math.floor(a.timestamp / 1000)}:T>`)
                .join('\n');

            const embed = createEmbed({
                title: '⚠️ Activité administrative suspecte',
                description: `Une activité administrative inhabituelle a été détectée sur **${guild.name}**. Cela pourrait indiquer une compromission de compte administrateur.`,
                color: 0xFFA500,
                fields: [
                    {
                        name: '📋 Actions détectées',
                        value: actionSummary.substring(0, 1024) || 'Détails indisponibles',
                        inline: false,
                    },
                    {
                        name: '🔢 Nombre d\'actions',
                        value: `${recentActions.length} actions en moins de ${DEFAULT_SETTINGS.adminActionTimeWindow / 1000} secondes`,
                        inline: true,
                    },
                    {
                        name: '💡 Recommandation',
                        value: 'Vérifiez les journaux d\'audit du serveur et changez les permissions si nécessaire.',
                        inline: false,
                    },
                ],
                footer: { text: 'Système Anti-Raid — Surveillance administrative' },
                timestamp: true,
            });

            /* ─── Envoyer au propriétaire du serveur ─── */
            try {
                const owner = await guild.fetchOwner();
                if (owner) {
                    await owner.send({ embeds: [embed] });
                    this.logger.info(`[${guild.id}] Alerte envoyée au propriétaire ${owner.user.tag}`);
                }
            } catch (err) {
                this.logger.error(`Impossible d'envoyer l'alerte au propriétaire :`, err.message);
            }
        } catch (error) {
            this.logger.error(`Erreur lors de l'alerte aux propriétaires :`, error.message);
        }
    }
}

module.exports = AntiRaid;
