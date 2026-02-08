const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed } = require('../utils/embed');
const Guild = require('../../database/models/guild');
const Logger = require('../utils/logger');

/**
 * Système de journalisation (logs) du bot Discord.
 *
 * Gère l'envoi automatique de logs dans les salons configurés
 * pour chaque serveur. Chaque type d'événement est associé à
 * un embed personnalisé avec des couleurs et champs appropriés.
 */

/* ─── Correspondance entre les types de log et les clés de configuration ─── */
const LOG_TYPE_MAP = {
    /* ─── Messages ─── */
    'message.delete':       'messageDelete',
    'message.edit':         'messageEdit',
    'message.bulk_delete':  'messageDelete',
    'message.pin':          'messageDelete',
    'message.unpin':        'messageDelete',

    /* ─── Membres ─── */
    'member.join':          'memberJoinLeave',
    'member.leave':         'memberJoinLeave',
    'member.role_add':      'roleUpdate',
    'member.role_remove':   'roleUpdate',
    'member.nickname':      'memberJoinLeave',
    'member.avatar':        'memberJoinLeave',

    /* ─── Vocal ─── */
    'voice.join':           'voice',
    'voice.leave':          'voice',
    'voice.move':           'voice',
    'voice.mute':           'voice',
    'voice.deafen':         'voice',

    /* ─── Serveur ─── */
    'server.channel_create': 'channelUpdate',
    'server.channel_delete': 'channelUpdate',
    'server.channel_update': 'channelUpdate',
    'server.role_create':    'roleUpdate',
    'server.role_delete':    'roleUpdate',
    'server.role_update':    'roleUpdate',
    'server.emoji_create':   'server',
    'server.emoji_delete':   'server',

    /* ─── Invitations ─── */
    'invite.create':        'server',
    'invite.delete':        'server',
    'invite.used':          'server',

    /* ─── Webhooks ─── */
    'webhook.create':       'server',
    'webhook.delete':       'server',

    /* ─── Anti-raid ─── */
    'antiraid.triggered':   'antiraid',
    'antiraid.action':      'antiraid',

    /* ─── Modération ─── */
    'moderation.ban':       'moderation',
    'moderation.kick':      'moderation',
    'moderation.mute':      'moderation',
    'moderation.warn':      'moderation',
    'moderation.unban':     'moderation',
    'moderation.unmute':    'moderation',
    'moderation.softban':   'moderation',
    'moderation.purge':     'moderation',
    'moderation.clearwarns':'moderation',

    /* ─── Tickets ─── */
    'ticket.create':        'tickets',
    'ticket.claim':         'tickets',
    'ticket.close':         'tickets',
    'ticket.reopen':        'tickets',
};

/* ─── Couleurs associées à chaque catégorie de log ─── */
const LOG_COLORS = {
    'message.delete':        0xFF4444,
    'message.edit':          0xFFAA00,
    'message.bulk_delete':   0xFF0000,
    'message.pin':           0x00AAFF,
    'message.unpin':         0x888888,

    'member.join':           0x00FF00,
    'member.leave':          0xFF0000,
    'member.role_add':       0x00CC99,
    'member.role_remove':    0xCC6600,
    'member.nickname':       0xFFCC00,
    'member.avatar':         0x9966FF,

    'voice.join':            0x00CC00,
    'voice.leave':           0xCC0000,
    'voice.move':            0x0099FF,
    'voice.mute':            0xFF6600,
    'voice.deafen':          0xFF3300,

    'server.channel_create': 0x00CC66,
    'server.channel_delete': 0xCC3300,
    'server.channel_update': 0xFFAA00,
    'server.role_create':    0x00CC66,
    'server.role_delete':    0xCC3300,
    'server.role_update':    0xFFAA00,
    'server.emoji_create':   0x00CC66,
    'server.emoji_delete':   0xCC3300,

    'invite.create':         0x00AAFF,
    'invite.delete':         0xFF6666,
    'invite.used':           0x66CCFF,

    'webhook.create':        0x00CC66,
    'webhook.delete':        0xCC3300,

    'antiraid.triggered':    0xFF0000,
    'antiraid.action':       0xFF3300,

    'moderation.ban':        0xE74C3C,
    'moderation.kick':       0xE67E22,
    'moderation.mute':       0xF1C40F,
    'moderation.warn':       0xFFCC00,
    'moderation.unban':      0x00FF00,
    'moderation.unmute':     0x00FFAA,
    'moderation.softban':    0xFF4444,
    'moderation.purge':      0xFF6600,
    'moderation.clearwarns': 0x00CCFF,

    /* ─── Tickets ─── */
    'ticket.create':         0x00CC66,
    'ticket.claim':          0x3498DB,
    'ticket.close':          0xE74C3C,
    'ticket.reopen':         0xF39C12,
};

/* ─── Titres d'embeds pour chaque type de log ─── */
const LOG_TITLES = {
    'message.delete':        '🗑️ Message supprimé',
    'message.edit':          '✏️ Message modifié',
    'message.bulk_delete':   '🗑️ Suppression en masse',
    'message.pin':           '📌 Message épinglé',
    'message.unpin':         '📌 Message désépinglé',

    'member.join':           '📥 Membre rejoint',
    'member.leave':          '📤 Membre parti',
    'member.role_add':       '🏷️ Rôle ajouté',
    'member.role_remove':    '🏷️ Rôle retiré',
    'member.nickname':       '📝 Pseudo modifié',
    'member.avatar':         '🖼️ Avatar modifié',

    'voice.join':            '🔊 Connexion vocale',
    'voice.leave':           '🔇 Déconnexion vocale',
    'voice.move':            '🔀 Déplacement vocal',
    'voice.mute':            '🔇 Sourdine vocale',
    'voice.deafen':          '🔕 Mise en sourdine complète',

    'server.channel_create': '📁 Salon créé',
    'server.channel_delete': '📁 Salon supprimé',
    'server.channel_update': '📁 Salon modifié',
    'server.role_create':    '🎭 Rôle créé',
    'server.role_delete':    '🎭 Rôle supprimé',
    'server.role_update':    '🎭 Rôle modifié',
    'server.emoji_create':   '😀 Emoji ajouté',
    'server.emoji_delete':   '😀 Emoji supprimé',

    'invite.create':         '🔗 Invitation créée',
    'invite.delete':         '🔗 Invitation supprimée',
    'invite.used':           '🔗 Invitation utilisée',

    'webhook.create':        '🔧 Webhook créé',
    'webhook.delete':        '🔧 Webhook supprimé',

    'antiraid.triggered':    '🚨 Anti-raid déclenché',
    'antiraid.action':       '🛡️ Action anti-raid',

    'moderation.ban':        '🔨 Bannissement',
    'moderation.kick':       '👢 Expulsion',
    'moderation.mute':       '🔇 Réduction au silence',
    'moderation.warn':       '⚠️ Avertissement',
    'moderation.unban':      '🔓 Débannissement',
    'moderation.unmute':     '🔊 Démute',
    'moderation.softban':    '👋 Softban',
    'moderation.purge':      '🧹 Purge',
    'moderation.clearwarns': '🗑️ Avertissements effacés',

    /* ─── Tickets ─── */
    'ticket.create':         '🎫 Ticket créé',
    'ticket.claim':          '🙋 Ticket réclamé',
    'ticket.close':          '🔒 Ticket fermé',
    'ticket.reopen':         '🔓 Ticket réouvert',
};

/**
 * Classe LogSystem — système central de journalisation.
 *
 * Reçoit les événements du bot et les retransmet sous forme d'embeds
 * dans les salons de logs configurés pour chaque serveur.
 */
class LogSystem {
    /**
     * Crée une nouvelle instance du système de logs.
     * @param {import('discord.js').Client} client - Instance du client Discord
     */
    constructor(client) {
        /** Référence au client Discord */
        this.client = client;

        /** Instance du logger pour les messages internes */
        this.logger = new Logger('LogSystem');
    }

    /**
     * Méthode principale de journalisation.
     *
     * Récupère la configuration du serveur depuis la base de données,
     * vérifie si le type de log est activé, construit l'embed approprié
     * et l'envoie dans le salon configuré.
     *
     * @param {string} guildId - Identifiant du serveur Discord
     * @param {string} type - Type de log (ex: 'message.delete', 'member.join')
     * @param {object} data - Données associées à l'événement
     * @returns {Promise<void>}
     */
    async log(guildId, type, data) {
        try {
            /* ─── Vérifier que le type de log est valide ─── */
            const logConfigKey = LOG_TYPE_MAP[type];
            if (!logConfigKey) {
                this.logger.warn(`Type de log inconnu : "${type}"`);
                return;
            }

            /* ─── Récupérer la configuration du serveur ─── */
            const guildSettings = await Guild.findOne({ guildId });
            if (!guildSettings) {
                this.logger.debug(`Aucune configuration trouvée pour le serveur ${guildId}`);
                return;
            }

            /* ─── Vérifier que le module de logs est activé ─── */
            if (!guildSettings.modules || !guildSettings.modules.logs) {
                return;
            }

            /* ─── Récupérer la configuration du type de log spécifique ─── */
            const logConfig = guildSettings.logs ? guildSettings.logs[logConfigKey] : null;
            if (!logConfig || !logConfig.enabled || !logConfig.channelId) {
                return;
            }

            /* ─── Récupérer le salon de log Discord ─── */
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;

            const channel = guild.channels.cache.get(logConfig.channelId);
            if (!channel) {
                this.logger.warn(`Salon de log introuvable (${logConfig.channelId}) pour le serveur ${guildId}`);
                return;
            }

            /* ─── Construire l'embed approprié selon le type ─── */
            const embed = this._buildEmbed(type, data, logConfig);

            /* ─── Envoyer l'embed dans le salon de log ─── */
            await channel.send({ embeds: [embed] });

            this.logger.debug(`Log envoyé : [${type}] sur le serveur ${guildId}`);
        } catch (error) {
            this.logger.error(`Erreur lors de l'envoi du log [${type}] pour ${guildId} :`, error.message);
        }
    }

    /**
     * Construit un embed Discord adapté au type d'événement.
     *
     * Chaque type de log possède ses propres champs et sa mise en forme.
     * La couleur peut être personnalisée via la configuration du serveur
     * ou utiliser la couleur par défaut du type.
     *
     * @param {string} type - Type de log
     * @param {object} data - Données de l'événement
     * @param {object} logConfig - Configuration du type de log (couleur, etc.)
     * @returns {EmbedBuilder} L'embed construit
     * @private
     */
    _buildEmbed(type, data, logConfig) {
        /* ─── Déterminer la couleur de l'embed ─── */
        const color = logConfig.color && logConfig.color !== '#2F3136'
            ? parseInt(logConfig.color.replace('#', ''), 16)
            : LOG_COLORS[type] || 0x2F3136;

        /* ─── Récupérer le titre de l'embed ─── */
        const title = LOG_TITLES[type] || '📋 Événement';

        /* ─── Construire les champs selon le type d'événement ─── */
        const fields = this._buildFields(type, data);

        /* ─── Déterminer la description ─── */
        const description = data.description || null;

        /* ─── Déterminer la miniature ─── */
        let thumbnail = null;
        if (data.user && data.user.displayAvatarURL) {
            thumbnail = data.user.displayAvatarURL({ dynamic: true, size: 128 });
        } else if (data.member && data.member.user && data.member.user.displayAvatarURL) {
            thumbnail = data.member.user.displayAvatarURL({ dynamic: true, size: 128 });
        }

        /* ─── Créer l'embed final ─── */
        return createEmbed({
            title,
            description,
            color,
            fields,
            thumbnail,
            footer: { text: `Type : ${type}` },
            timestamp: true,
        });
    }

    /**
     * Construit les champs de l'embed en fonction du type d'événement.
     *
     * Chaque type possède ses propres données à afficher.
     *
     * @param {string} type - Type de log
     * @param {object} data - Données de l'événement
     * @returns {object[]} Tableau de champs pour l'embed
     * @private
     */
    _buildFields(type, data) {
        switch (type) {
            /* ─────────────────────────────────────────── */
            /*                  MESSAGES                   */
            /* ─────────────────────────────────────────── */

            case 'message.delete':
                return this._buildMessageDeleteFields(data);
            case 'message.edit':
                return this._buildMessageEditFields(data);
            case 'message.bulk_delete':
                return this._buildBulkDeleteFields(data);
            case 'message.pin':
                return this._buildMessagePinFields(data);
            case 'message.unpin':
                return this._buildMessageUnpinFields(data);

            /* ─────────────────────────────────────────── */
            /*                  MEMBRES                    */
            /* ─────────────────────────────────────────── */

            case 'member.join':
                return this._buildMemberJoinFields(data);
            case 'member.leave':
                return this._buildMemberLeaveFields(data);
            case 'member.role_add':
                return this._buildMemberRoleAddFields(data);
            case 'member.role_remove':
                return this._buildMemberRoleRemoveFields(data);
            case 'member.nickname':
                return this._buildMemberNicknameFields(data);
            case 'member.avatar':
                return this._buildMemberAvatarFields(data);

            /* ─────────────────────────────────────────── */
            /*                   VOCAL                     */
            /* ─────────────────────────────────────────── */

            case 'voice.join':
                return this._buildVoiceJoinFields(data);
            case 'voice.leave':
                return this._buildVoiceLeaveFields(data);
            case 'voice.move':
                return this._buildVoiceMoveFields(data);
            case 'voice.mute':
                return this._buildVoiceMuteFields(data);
            case 'voice.deafen':
                return this._buildVoiceDeafenFields(data);

            /* ─────────────────────────────────────────── */
            /*                  SERVEUR                    */
            /* ─────────────────────────────────────────── */

            case 'server.channel_create':
                return this._buildChannelCreateFields(data);
            case 'server.channel_delete':
                return this._buildChannelDeleteFields(data);
            case 'server.channel_update':
                return this._buildChannelUpdateFields(data);
            case 'server.role_create':
                return this._buildRoleCreateFields(data);
            case 'server.role_delete':
                return this._buildRoleDeleteFields(data);
            case 'server.role_update':
                return this._buildRoleUpdateFields(data);
            case 'server.emoji_create':
                return this._buildEmojiCreateFields(data);
            case 'server.emoji_delete':
                return this._buildEmojiDeleteFields(data);

            /* ─────────────────────────────────────────── */
            /*                INVITATIONS                  */
            /* ─────────────────────────────────────────── */

            case 'invite.create':
                return this._buildInviteCreateFields(data);
            case 'invite.delete':
                return this._buildInviteDeleteFields(data);
            case 'invite.used':
                return this._buildInviteUsedFields(data);

            /* ─────────────────────────────────────────── */
            /*                 WEBHOOKS                    */
            /* ─────────────────────────────────────────── */

            case 'webhook.create':
                return this._buildWebhookCreateFields(data);
            case 'webhook.delete':
                return this._buildWebhookDeleteFields(data);

            /* ─────────────────────────────────────────── */
            /*                ANTI-RAID                    */
            /* ─────────────────────────────────────────── */

            case 'antiraid.triggered':
                return this._buildAntiraidTriggeredFields(data);
            case 'antiraid.action':
                return this._buildAntiraidActionFields(data);

            /* ─────────────────────────────────────────── */
            /*               MODÉRATION                    */
            /* ─────────────────────────────────────────── */

            case 'moderation.ban':
                return this._buildModerationBanFields(data);
            case 'moderation.kick':
                return this._buildModerationKickFields(data);
            case 'moderation.mute':
                return this._buildModerationMuteFields(data);
            case 'moderation.warn':
                return this._buildModerationWarnFields(data);
            case 'moderation.unban':
                return this._buildModerationUnbanFields(data);
            case 'moderation.unmute':
                return this._buildModerationUnmuteFields(data);
            case 'moderation.softban':
                return this._buildModerationSoftbanFields(data);
            case 'moderation.purge':
                return this._buildModerationPurgeFields(data);
            case 'moderation.clearwarns':
                return this._buildModerationClearwarnsFields(data);

            /* ─────────────────────────────────────────── */
            /*                  TICKETS                    */
            /* ─────────────────────────────────────────── */

            case 'ticket.create':
                return this._buildTicketCreateFields(data);
            case 'ticket.claim':
                return this._buildTicketClaimFields(data);
            case 'ticket.close':
                return this._buildTicketCloseFields(data);
            case 'ticket.reopen':
                return this._buildTicketReopenFields(data);

            /* ─── Type inconnu : retourner un champ générique ─── */
            default:
                return [{ name: '📋 Détails', value: JSON.stringify(data).substring(0, 1024) || 'Aucun détail', inline: false }];
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*          CONSTRUCTEURS DE CHAMPS PAR TYPE DE LOG           */
    /* ═══════════════════════════════════════════════════════════ */

    /* ─── Message supprimé ─── */
    _buildMessageDeleteFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.content) {
            fields.push({ name: '📝 Contenu', value: data.content.substring(0, 1024) || '*Aucun contenu textuel*', inline: false });
        }
        if (data.attachments && data.attachments > 0) {
            fields.push({ name: '📎 Pièces jointes', value: `${data.attachments} fichier(s)`, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Supprimé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Message modifié ─── */
    _buildMessageEditFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.oldContent) {
            fields.push({ name: '📝 Ancien contenu', value: data.oldContent.substring(0, 1024) || '*Vide*', inline: false });
        }
        if (data.newContent) {
            fields.push({ name: '📝 Nouveau contenu', value: data.newContent.substring(0, 1024) || '*Vide*', inline: false });
        }
        if (data.messageUrl) {
            fields.push({ name: '🔗 Lien', value: `[Aller au message](${data.messageUrl})`, inline: false });
        }
        return fields;
    }

    /* ─── Suppression en masse ─── */
    _buildBulkDeleteFields(data) {
        const fields = [];
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.count) {
            fields.push({ name: '🔢 Nombre de messages', value: `${data.count} messages supprimés`, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Exécuteur', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Message épinglé ─── */
    _buildMessagePinFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur du message', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '📌 Épinglé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        if (data.content) {
            fields.push({ name: '📝 Contenu', value: data.content.substring(0, 1024) || '*Aucun contenu*', inline: false });
        }
        return fields;
    }

    /* ─── Message désépinglé ─── */
    _buildMessageUnpinFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur du message', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '📌 Désépinglé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Membre rejoint ─── */
    _buildMemberJoinFields(data) {
        const fields = [];
        const member = data.member || data.user;
        if (member) {
            const user = member.user || member;
            fields.push({ name: '👤 Membre', value: `${user.tag || user}\n\`${user.id || 'Inconnu'}\``, inline: true });
            if (user.createdAt) {
                const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
                fields.push({ name: '📅 Compte créé le', value: `<t:${createdTimestamp}:F>\n<t:${createdTimestamp}:R>`, inline: true });
            }
        }
        if (data.memberCount) {
            fields.push({ name: '👥 Nombre de membres', value: `${data.memberCount}`, inline: true });
        }
        return fields;
    }

    /* ─── Membre parti ─── */
    _buildMemberLeaveFields(data) {
        const fields = [];
        const member = data.member || data.user;
        if (member) {
            const user = member.user || member;
            fields.push({ name: '👤 Membre', value: `${user.tag || user}\n\`${user.id || 'Inconnu'}\``, inline: true });
            if (member.joinedAt) {
                const joinedTimestamp = Math.floor(member.joinedAt.getTime() / 1000);
                fields.push({ name: '📅 Avait rejoint le', value: `<t:${joinedTimestamp}:F>\n<t:${joinedTimestamp}:R>`, inline: true });
            }
        }
        if (data.roles && data.roles.length > 0) {
            const roleList = data.roles.map(r => `<@&${r.id || r}>`).join(', ');
            fields.push({ name: '🏷️ Rôles', value: roleList.substring(0, 1024), inline: false });
        }
        if (data.memberCount) {
            fields.push({ name: '👥 Nombre de membres', value: `${data.memberCount}`, inline: true });
        }
        return fields;
    }

    /* ─── Rôle ajouté à un membre ─── */
    _buildMemberRoleAddFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.role) {
            fields.push({ name: '🏷️ Rôle ajouté', value: `<@&${data.role.id || data.role}>\n\`${data.role.id || data.role}\``, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Ajouté par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Rôle retiré d'un membre ─── */
    _buildMemberRoleRemoveFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.role) {
            fields.push({ name: '🏷️ Rôle retiré', value: `<@&${data.role.id || data.role}>\n\`${data.role.id || data.role}\``, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Retiré par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Pseudo modifié ─── */
    _buildMemberNicknameFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        fields.push({ name: '📝 Ancien pseudo', value: data.oldNickname || '*Aucun*', inline: true });
        fields.push({ name: '📝 Nouveau pseudo', value: data.newNickname || '*Aucun*', inline: true });
        if (data.executor) {
            fields.push({ name: '🔧 Modifié par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Avatar modifié ─── */
    _buildMemberAvatarFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.oldAvatarUrl) {
            fields.push({ name: '🖼️ Ancien avatar', value: `[Lien](${data.oldAvatarUrl})`, inline: true });
        }
        if (data.newAvatarUrl) {
            fields.push({ name: '🖼️ Nouvel avatar', value: `[Lien](${data.newAvatarUrl})`, inline: true });
        }
        return fields;
    }

    /* ─── Connexion vocale ─── */
    _buildVoiceJoinFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '🔊 Salon vocal', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        return fields;
    }

    /* ─── Déconnexion vocale ─── */
    _buildVoiceLeaveFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '🔊 Salon vocal', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.duration) {
            fields.push({ name: '⏱️ Durée', value: data.duration, inline: true });
        }
        return fields;
    }

    /* ─── Déplacement vocal ─── */
    _buildVoiceMoveFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.oldChannel) {
            fields.push({ name: '🔊 Ancien salon', value: `<#${data.oldChannel.id || data.oldChannel}>`, inline: true });
        }
        if (data.newChannel) {
            fields.push({ name: '🔊 Nouveau salon', value: `<#${data.newChannel.id || data.newChannel}>`, inline: true });
        }
        return fields;
    }

    /* ─── Sourdine vocale ─── */
    _buildVoiceMuteFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '🔊 Salon vocal', value: `<#${data.channel.id || data.channel}>`, inline: true });
        }
        fields.push({ name: '🔇 État', value: data.muted ? 'Microphone coupé' : 'Microphone activé', inline: true });
        if (data.executor) {
            fields.push({ name: '🔧 Par', value: `${data.executor.tag || data.executor}`, inline: true });
        }
        return fields;
    }

    /* ─── Sourdine complète vocale ─── */
    _buildVoiceDeafenFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '🔊 Salon vocal', value: `<#${data.channel.id || data.channel}>`, inline: true });
        }
        fields.push({ name: '🔕 État', value: data.deafened ? 'Son désactivé' : 'Son activé', inline: true });
        if (data.executor) {
            fields.push({ name: '🔧 Par', value: `${data.executor.tag || data.executor}`, inline: true });
        }
        return fields;
    }

    /* ─── Salon créé ─── */
    _buildChannelCreateFields(data) {
        const fields = [];
        if (data.channel) {
            fields.push({ name: '📁 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.channelType) {
            fields.push({ name: '📋 Type', value: data.channelType, inline: true });
        }
        if (data.category) {
            fields.push({ name: '📂 Catégorie', value: data.category, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Créé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Salon supprimé ─── */
    _buildChannelDeleteFields(data) {
        const fields = [];
        if (data.channelName) {
            fields.push({ name: '📁 Salon', value: `#${data.channelName}\n\`${data.channelId || 'Inconnu'}\``, inline: true });
        }
        if (data.channelType) {
            fields.push({ name: '📋 Type', value: data.channelType, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Supprimé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Salon modifié ─── */
    _buildChannelUpdateFields(data) {
        const fields = [];
        if (data.channel) {
            fields.push({ name: '📁 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.changes && data.changes.length > 0) {
            const changesText = data.changes.map(c => `**${c.key}** : \`${c.old}\` → \`${c.new}\``).join('\n');
            fields.push({ name: '📝 Modifications', value: changesText.substring(0, 1024), inline: false });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Modifié par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Rôle créé ─── */
    _buildRoleCreateFields(data) {
        const fields = [];
        if (data.role) {
            fields.push({ name: '🎭 Rôle', value: `<@&${data.role.id || data.role}>\n\`${data.role.id || data.role}\``, inline: true });
        }
        if (data.roleName) {
            fields.push({ name: '📝 Nom', value: data.roleName, inline: true });
        }
        if (data.color) {
            fields.push({ name: '🎨 Couleur', value: data.color, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Créé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Rôle supprimé ─── */
    _buildRoleDeleteFields(data) {
        const fields = [];
        if (data.roleName) {
            fields.push({ name: '🎭 Rôle', value: `${data.roleName}\n\`${data.roleId || 'Inconnu'}\``, inline: true });
        }
        if (data.color) {
            fields.push({ name: '🎨 Couleur', value: data.color, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Supprimé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Rôle modifié ─── */
    _buildRoleUpdateFields(data) {
        const fields = [];
        if (data.role) {
            fields.push({ name: '🎭 Rôle', value: `<@&${data.role.id || data.role}>\n\`${data.role.id || data.role}\``, inline: true });
        }
        if (data.changes && data.changes.length > 0) {
            const changesText = data.changes.map(c => `**${c.key}** : \`${c.old}\` → \`${c.new}\``).join('\n');
            fields.push({ name: '📝 Modifications', value: changesText.substring(0, 1024), inline: false });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Modifié par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Emoji ajouté ─── */
    _buildEmojiCreateFields(data) {
        const fields = [];
        if (data.emoji) {
            fields.push({ name: '😀 Emoji', value: `${data.emoji}\n\`${data.emojiName || 'Inconnu'}\``, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Ajouté par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Emoji supprimé ─── */
    _buildEmojiDeleteFields(data) {
        const fields = [];
        if (data.emojiName) {
            fields.push({ name: '😀 Emoji', value: `\`${data.emojiName}\`\n\`${data.emojiId || 'Inconnu'}\``, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Supprimé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Invitation créée ─── */
    _buildInviteCreateFields(data) {
        const fields = [];
        if (data.code) {
            fields.push({ name: '🔗 Code', value: `\`${data.code}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>`, inline: true });
        }
        if (data.maxUses) {
            fields.push({ name: '🔢 Utilisations max', value: data.maxUses === 0 ? 'Illimitées' : `${data.maxUses}`, inline: true });
        }
        if (data.maxAge) {
            fields.push({ name: '⏱️ Expiration', value: data.maxAge === 0 ? 'Jamais' : `${data.maxAge} secondes`, inline: true });
        }
        if (data.inviter) {
            fields.push({ name: '🔧 Créée par', value: `${data.inviter.tag || data.inviter}\n\`${data.inviter.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Invitation supprimée ─── */
    _buildInviteDeleteFields(data) {
        const fields = [];
        if (data.code) {
            fields.push({ name: '🔗 Code', value: `\`${data.code}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>`, inline: true });
        }
        if (data.uses !== undefined) {
            fields.push({ name: '🔢 Utilisations', value: `${data.uses}`, inline: true });
        }
        return fields;
    }

    /* ─── Invitation utilisée ─── */
    _buildInviteUsedFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Membre', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.code) {
            fields.push({ name: '🔗 Code', value: `\`${data.code}\``, inline: true });
        }
        if (data.inviter) {
            fields.push({ name: '🔧 Invité par', value: `${data.inviter.tag || data.inviter}\n\`${data.inviter.id || 'Inconnu'}\``, inline: true });
        }
        if (data.uses !== undefined) {
            fields.push({ name: '🔢 Utilisations', value: `${data.uses}`, inline: true });
        }
        return fields;
    }

    /* ─── Webhook créé ─── */
    _buildWebhookCreateFields(data) {
        const fields = [];
        if (data.webhookName) {
            fields.push({ name: '🔧 Nom', value: data.webhookName, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>`, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Créé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Webhook supprimé ─── */
    _buildWebhookDeleteFields(data) {
        const fields = [];
        if (data.webhookName) {
            fields.push({ name: '🔧 Nom', value: data.webhookName, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>`, inline: true });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Supprimé par', value: `${data.executor.tag || data.executor}\n\`${data.executor.id || 'Inconnu'}\``, inline: true });
        }
        return fields;
    }

    /* ─── Anti-raid déclenché ─── */
    _buildAntiraidTriggeredFields(data) {
        const fields = [];
        fields.push({ name: '🚨 Raison', value: data.reason || 'Raid détecté', inline: false });
        if (data.joinCount) {
            fields.push({ name: '📥 Nombre d\'arrivées', value: `${data.joinCount} membres`, inline: true });
        }
        if (data.timeWindow) {
            fields.push({ name: '⏱️ Fenêtre de temps', value: `${data.timeWindow / 1000} secondes`, inline: true });
        }
        if (data.actionsTaken && data.actionsTaken.length > 0) {
            fields.push({ name: '🛡️ Actions effectuées', value: data.actionsTaken.join('\n'), inline: false });
        }
        return fields;
    }

    /* ─── Action anti-raid ─── */
    _buildAntiraidActionFields(data) {
        const fields = [];
        if (data.action) {
            fields.push({ name: '🛡️ Action', value: data.action, inline: true });
        }
        if (data.target) {
            fields.push({ name: '👤 Cible', value: `${data.target.tag || data.target}\n\`${data.target.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.executor) {
            fields.push({ name: '🔧 Par', value: data.executor, inline: true });
        }
        return fields;
    }

    /* ─── Bannissement ─── */
    _buildModerationBanFields(data) {
        const fields = [];
        if (data.target) {
            fields.push({ name: '👤 Utilisateur banni', value: `${data.target.tag || data.target}\n\`${data.target.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '🔨 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.duration) {
            fields.push({ name: '⏱️ Durée', value: data.duration, inline: true });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Expulsion ─── */
    _buildModerationKickFields(data) {
        const fields = [];
        if (data.target) {
            fields.push({ name: '👤 Utilisateur expulsé', value: `${data.target.tag || data.target}\n\`${data.target.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '👢 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Réduction au silence ─── */
    _buildModerationMuteFields(data) {
        const fields = [];
        if (data.target) {
            fields.push({ name: '👤 Utilisateur muté', value: `${data.target.tag || data.target}\n\`${data.target.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '🔇 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.duration) {
            fields.push({ name: '⏱️ Durée', value: data.duration, inline: true });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Avertissement ─── */
    _buildModerationWarnFields(data) {
        const fields = [];
        if (data.target) {
            fields.push({ name: '👤 Utilisateur averti', value: `${data.target.tag || data.target}\n\`${data.target.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '⚠️ Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.warningCount) {
            fields.push({ name: '🔢 Total d\'avertissements', value: `${data.warningCount}`, inline: true });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Débannissement ─── */
    _buildModerationUnbanFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Utilisateur débanni', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '🔓 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Démute ─── */
    _buildModerationUnmuteFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Utilisateur démuté', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '🔊 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Softban ─── */
    _buildModerationSoftbanFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Utilisateur softban', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '👋 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.caseId) {
            fields.push({ name: '🔢 Cas', value: `#${data.caseId}`, inline: true });
        }
        return fields;
    }

    /* ─── Purge ─── */
    _buildModerationPurgeFields(data) {
        const fields = [];
        if (data.moderator) {
            fields.push({ name: '🧹 Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Détails', value: data.reason, inline: false });
        }
        return fields;
    }

    /* ─── Avertissements effacés ─── */
    _buildModerationClearwarnsFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Utilisateur', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.moderator) {
            fields.push({ name: '🗑️ Modérateur', value: `${data.moderator.tag || data.moderator}\n\`${data.moderator.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Détails', value: data.reason, inline: false });
        }
        return fields;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*              CONSTRUCTEURS DE CHAMPS — TICKETS             */
    /* ═══════════════════════════════════════════════════════════ */

    /* ─── Ticket créé ─── */
    _buildTicketCreateFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Créé par', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.category) {
            fields.push({ name: '📁 Catégorie', value: data.category, inline: true });
        }
        if (data.ticketId) {
            fields.push({ name: '🔢 Ticket', value: `#${data.ticketId}`, inline: true });
        }
        return fields;
    }

    /* ─── Ticket réclamé ─── */
    _buildTicketClaimFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur du ticket', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.staff) {
            fields.push({ name: '🙋 Réclamé par', value: `${data.staff.tag || data.staff}\n\`${data.staff.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.ticketId) {
            fields.push({ name: '🔢 Ticket', value: `#${data.ticketId}`, inline: true });
        }
        return fields;
    }

    /* ─── Ticket fermé ─── */
    _buildTicketCloseFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur du ticket', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.closedBy) {
            fields.push({ name: '🔒 Fermé par', value: `${data.closedBy.tag || data.closedBy}\n\`${data.closedBy.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.reason) {
            fields.push({ name: '📝 Raison', value: data.reason, inline: false });
        }
        if (data.ticketId) {
            fields.push({ name: '🔢 Ticket', value: `#${data.ticketId}`, inline: true });
        }
        return fields;
    }

    /* ─── Ticket réouvert ─── */
    _buildTicketReopenFields(data) {
        const fields = [];
        if (data.user) {
            fields.push({ name: '👤 Auteur du ticket', value: `${data.user.tag || data.user}\n\`${data.user.id || 'Inconnu'}\``, inline: true });
        }
        if (data.reopenedBy) {
            fields.push({ name: '🔓 Réouvert par', value: `${data.reopenedBy.tag || data.reopenedBy}\n\`${data.reopenedBy.id || 'Inconnu'}\``, inline: true });
        }
        if (data.channel) {
            fields.push({ name: '💬 Salon', value: `<#${data.channel.id || data.channel}>\n\`${data.channel.id || data.channel}\``, inline: true });
        }
        if (data.ticketId) {
            fields.push({ name: '🔢 Ticket', value: `#${data.ticketId}`, inline: true });
        }
        return fields;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*                  MÉTHODE logTicket                         */
    /* ═══════════════════════════════════════════════════════════ */

    /**
     * Journalise une action liée aux tickets.
     *
     * Récupère la configuration du serveur, vérifie que les logs
     * de tickets sont activés, et envoie un embed adapté à l'action.
     *
     * @param {import('discord.js').Guild} guild - Instance du serveur Discord
     * @param {string} action - Type d'action : 'ticket_created', 'ticket_claimed', 'ticket_closed', 'ticket_reopened'
     * @param {object} data - Données associées à l'événement
     * @returns {Promise<void>}
     */
    async logTicket(guild, action, data) {
        try {
            /* ─── Récupérer la configuration du serveur ─── */
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            if (!guildSettings) return;

            /* ─── Vérifier que le module de logs est activé ─── */
            if (!guildSettings.modules || !guildSettings.modules.logs) return;

            /* ─── Vérifier que les logs de tickets sont activés ─── */
            const ticketLogConfig = guildSettings.logs ? guildSettings.logs.tickets : null;
            if (!ticketLogConfig || !ticketLogConfig.enabled || !ticketLogConfig.channelId) return;

            /* ─── Récupérer le salon de log ─── */
            const channel = guild.channels.cache.get(ticketLogConfig.channelId);
            if (!channel) {
                this.logger.warn(`Salon de log tickets introuvable (${ticketLogConfig.channelId}) pour ${guild.id}`);
                return;
            }

            /* ─── Correspondance action -> type de log interne ─── */
            const actionMap = {
                'ticket_created': 'ticket.create',
                'ticket_claimed': 'ticket.claim',
                'ticket_closed':  'ticket.close',
                'ticket_reopened': 'ticket.reopen',
            };

            const type = actionMap[action];
            if (!type) {
                this.logger.warn(`Action de ticket inconnue : "${action}"`);
                return;
            }

            /* ─── Construire et envoyer l'embed ─── */
            const embed = this._buildEmbed(type, data, ticketLogConfig);
            await channel.send({ embeds: [embed] });

            this.logger.debug(`Log ticket envoyé : [${action}] sur le serveur ${guild.id}`);
        } catch (error) {
            this.logger.error(`Erreur lors du log ticket [${action}] pour ${guild.id} :`, error.message);
        }
    }
}

module.exports = LogSystem;
