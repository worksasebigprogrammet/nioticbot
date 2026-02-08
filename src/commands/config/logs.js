// Commande de configuration interactive des logs — Permet de gérer les types de logs, activer/désactiver et définir les salons
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ComponentType
} = require('discord.js');
const { createEmbed, successEmbed, errorEmbed, infoEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

/* ─── Types de logs affichables et correspondance vers les clés DB ─── */
const LOG_TYPES = {
    moderation: {
        label: '🔨 Modération',
        description: 'Bans, kicks, mutes, warns',
        dbKeys: ['moderation'],
        emoji: '🔨'
    },
    messages: {
        label: '💬 Messages',
        description: 'Suppressions et modifications de messages',
        dbKeys: ['messageDelete', 'messageEdit'],
        emoji: '💬'
    },
    members: {
        label: '👥 Membres',
        description: 'Arrivées, départs, changements de pseudo',
        dbKeys: ['memberJoinLeave'],
        emoji: '👥'
    },
    voice: {
        label: '🔊 Vocal',
        description: 'Connexions, déconnexions, déplacements vocaux',
        dbKeys: ['voice'],
        emoji: '🔊'
    },
    server: {
        label: '🏠 Serveur',
        description: 'Salons, rôles, emojis, mises à jour du serveur',
        dbKeys: ['server', 'channelUpdate'],
        emoji: '🏠'
    },
    tickets: {
        label: '🎫 Tickets',
        description: 'Création, réclamation, fermeture, réouverture',
        dbKeys: ['tickets'],
        emoji: '🎫'
    },
    antiraid: {
        label: '🛡️ Anti-Raid',
        description: 'Alertes et actions anti-raid',
        dbKeys: ['antiraid'],
        emoji: '🛡️'
    },
    invites: {
        label: '🔗 Invitations',
        description: 'Création, suppression, utilisation d\'invitations',
        dbKeys: ['server'],
        emoji: '🔗'
    }
};

/* ─── Noms de choix pour les sous-commandes enable/disable/channel ─── */
const TYPE_CHOICES = Object.keys(LOG_TYPES).map(key => ({
    name: LOG_TYPES[key].label.replace(/^[^\s]+\s/, ''),
    value: key
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Configurer les logs du serveur')
        /* ─── Sous-commande : panneau interactif ─── */
        .addSubcommand(sub =>
            sub
                .setName('config')
                .setDescription('Afficher le panneau de configuration interactif des logs')
        )
        /* ─── Sous-commande : activer un type ─── */
        .addSubcommand(sub =>
            sub
                .setName('enable')
                .setDescription('Activer un type de log')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Le type de log à activer')
                        .setRequired(true)
                        .addChoices(...TYPE_CHOICES)
                )
        )
        /* ─── Sous-commande : désactiver un type ─── */
        .addSubcommand(sub =>
            sub
                .setName('disable')
                .setDescription('Désactiver un type de log')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Le type de log à désactiver')
                        .setRequired(true)
                        .addChoices(...TYPE_CHOICES)
                )
        )
        /* ─── Sous-commande : définir le salon d'un type ─── */
        .addSubcommand(sub =>
            sub
                .setName('channel')
                .setDescription('Définir le salon pour un type de log')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Le type de log')
                        .setRequired(true)
                        .addChoices(...TYPE_CHOICES)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Le salon où envoyer les logs')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: 'logs',
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Récupérer ou créer la configuration du serveur
        let guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        if (!guildSettings) {
            guildSettings = await Guild.create({ guildId: interaction.guild.id });
        }

        switch (subcommand) {
            case 'config':
                return await handleConfig(interaction, guildSettings);
            case 'enable':
                return await handleEnable(interaction, guildSettings);
            case 'disable':
                return await handleDisable(interaction, guildSettings);
            case 'channel':
                return await handleChannel(interaction, guildSettings);
            default:
                return interaction.reply({
                    embeds: [errorEmbed('Sous-commande inconnue.')],
                    ephemeral: true
                });
        }
    }
};

/* ═══════════════════════════════════════════════════════════ */
/*              PANNEAU INTERACTIF (config)                   */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Construit l'embed principal du panneau de configuration des logs.
 * Affiche tous les types de logs avec leur statut et salon configuré.
 *
 * @param {object} guildSettings - Document de configuration du serveur
 * @returns {EmbedBuilder} L'embed du panneau
 */
function buildConfigEmbed(guildSettings) {
    const fields = [];

    // Parcourir chaque type de log pour afficher son statut
    for (const [key, config] of Object.entries(LOG_TYPES)) {
        const primaryDbKey = config.dbKeys[0];
        const logConfig = guildSettings.logs ? guildSettings.logs[primaryDbKey] : null;
        const enabled = logConfig && logConfig.enabled;
        const channelId = logConfig ? logConfig.channelId : null;

        const status = enabled ? '✅ Activé' : '❌ Désactivé';
        const channelDisplay = channelId ? `<#${channelId}>` : '*Non configuré*';

        fields.push({
            name: `${config.emoji} ${config.label.replace(/^[^\s]+\s/, '')}`,
            value: `${status}\nSalon : ${channelDisplay}`,
            inline: true
        });
    }

    return createEmbed({
        title: '📋 Configuration des Logs',
        description: 'Sélectionnez un type de log dans le menu ci-dessous pour le configurer, ou utilisez les boutons pour des actions rapides.',
        color: 0x5865F2,
        fields,
        footer: { text: 'Utilisez le menu déroulant pour configurer un type spécifique' }
    });
}

/**
 * Construit les composants (menu + boutons) du panneau interactif.
 *
 * @returns {ActionRowBuilder[]} Les lignes de composants
 */
function buildConfigComponents() {
    // Menu déroulant pour sélectionner un type de log
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('logs_select_type')
        .setPlaceholder('Sélectionner un type de log...')
        .addOptions(
            Object.entries(LOG_TYPES).map(([key, config]) => ({
                label: config.label.replace(/^[^\s]+\s/, ''),
                description: config.description,
                value: key,
                emoji: config.emoji
            }))
        );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    // Boutons d'actions rapides
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('logs_enable_all')
            .setLabel('Activer tout')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('logs_disable_all')
            .setLabel('Désactiver tout')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌'),
        new ButtonBuilder()
            .setCustomId('logs_refresh')
            .setLabel('Rafraîchir')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
    );

    return [selectRow, buttonRow];
}

/**
 * Construit l'embed de détail d'un type de log sélectionné.
 *
 * @param {string} typeKey - Clé du type de log
 * @param {object} guildSettings - Document de configuration du serveur
 * @returns {EmbedBuilder} L'embed de détail
 */
function buildTypeDetailEmbed(typeKey, guildSettings) {
    const config = LOG_TYPES[typeKey];
    if (!config) return errorEmbed('Type de log inconnu.');

    const fields = [];

    // Afficher le statut de chaque clé DB associée
    for (const dbKey of config.dbKeys) {
        const logConfig = guildSettings.logs ? guildSettings.logs[dbKey] : null;
        const enabled = logConfig && logConfig.enabled;
        const channelId = logConfig ? logConfig.channelId : null;

        fields.push({
            name: `\`${dbKey}\``,
            value: `Statut : ${enabled ? '✅ Activé' : '❌ Désactivé'}\nSalon : ${channelId ? `<#${channelId}>` : '*Non configuré*'}`,
            inline: true
        });
    }

    return createEmbed({
        title: `${config.emoji} Configuration — ${config.label.replace(/^[^\s]+\s/, '')}`,
        description: config.description,
        color: 0x5865F2,
        fields,
        footer: { text: 'Utilisez les boutons ci-dessous pour modifier ce type' }
    });
}

/**
 * Construit les boutons de détail d'un type de log (toggle + set channel + retour).
 *
 * @param {string} typeKey - Clé du type de log
 * @param {object} guildSettings - Document de configuration du serveur
 * @returns {ActionRowBuilder[]} Les lignes de composants
 */
function buildTypeDetailComponents(typeKey, guildSettings) {
    const config = LOG_TYPES[typeKey];
    const primaryDbKey = config.dbKeys[0];
    const logConfig = guildSettings.logs ? guildSettings.logs[primaryDbKey] : null;
    const enabled = logConfig && logConfig.enabled;

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`logs_toggle_${typeKey}`)
            .setLabel(enabled ? 'Désactiver' : 'Activer')
            .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji(enabled ? '❌' : '✅'),
        new ButtonBuilder()
            .setCustomId(`logs_setchannel_${typeKey}`)
            .setLabel('Définir le salon')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
        new ButtonBuilder()
            .setCustomId('logs_back')
            .setLabel('Retour')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('◀️')
    );

    return [buttonRow];
}

/**
 * Gère le panneau interactif de configuration des logs.
 * Affiche le panneau principal avec collecteur de composants.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleConfig(interaction, guildSettings) {
    const embed = buildConfigEmbed(guildSettings);
    const components = buildConfigComponents();

    const reply = await interaction.reply({
        embeds: [embed],
        components,
        ephemeral: true
    });

    // Créer un collecteur d'interactions pour les composants
    const collector = reply.createMessageComponentCollector({
        time: 300_000 // 5 minutes
    });

    collector.on('collect', async (i) => {
        try {
            // Recharger la configuration depuis la DB à chaque interaction
            let freshSettings = await Guild.findOne({ guildId: interaction.guild.id });
            if (!freshSettings) {
                freshSettings = await Guild.create({ guildId: interaction.guild.id });
            }

            /* ─── Menu déroulant : sélection d'un type ─── */
            if (i.customId === 'logs_select_type') {
                const selectedType = i.values[0];
                const detailEmbed = buildTypeDetailEmbed(selectedType, freshSettings);
                const detailComponents = buildTypeDetailComponents(selectedType, freshSettings);

                await i.update({
                    embeds: [detailEmbed],
                    components: detailComponents
                });
                return;
            }

            /* ─── Bouton : Activer tout ─── */
            if (i.customId === 'logs_enable_all') {
                const updateObj = {};
                for (const config of Object.values(LOG_TYPES)) {
                    for (const dbKey of config.dbKeys) {
                        updateObj[`logs.${dbKey}.enabled`] = true;
                    }
                }

                await Guild.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { $set: updateObj },
                    { upsert: true }
                );

                Logger.info(`Tous les logs activés sur ${interaction.guild.name}`);

                freshSettings = await Guild.findOne({ guildId: interaction.guild.id });
                const updatedEmbed = buildConfigEmbed(freshSettings);

                await i.update({
                    embeds: [updatedEmbed],
                    components: buildConfigComponents()
                });
                return;
            }

            /* ─── Bouton : Désactiver tout ─── */
            if (i.customId === 'logs_disable_all') {
                const updateObj = {};
                for (const config of Object.values(LOG_TYPES)) {
                    for (const dbKey of config.dbKeys) {
                        updateObj[`logs.${dbKey}.enabled`] = false;
                    }
                }

                await Guild.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { $set: updateObj },
                    { upsert: true }
                );

                Logger.info(`Tous les logs désactivés sur ${interaction.guild.name}`);

                freshSettings = await Guild.findOne({ guildId: interaction.guild.id });
                const updatedEmbed = buildConfigEmbed(freshSettings);

                await i.update({
                    embeds: [updatedEmbed],
                    components: buildConfigComponents()
                });
                return;
            }

            /* ─── Bouton : Rafraîchir ─── */
            if (i.customId === 'logs_refresh') {
                const updatedEmbed = buildConfigEmbed(freshSettings);

                await i.update({
                    embeds: [updatedEmbed],
                    components: buildConfigComponents()
                });
                return;
            }

            /* ─── Bouton : Retour au panneau principal ─── */
            if (i.customId === 'logs_back') {
                const mainEmbed = buildConfigEmbed(freshSettings);

                await i.update({
                    embeds: [mainEmbed],
                    components: buildConfigComponents()
                });
                return;
            }

            /* ─── Bouton : Toggle (activer/désactiver) un type ─── */
            if (i.customId.startsWith('logs_toggle_')) {
                const typeKey = i.customId.replace('logs_toggle_', '');
                const config = LOG_TYPES[typeKey];
                if (!config) return;

                // Déterminer le nouvel état (inverser l'état actuel)
                const primaryDbKey = config.dbKeys[0];
                const currentConfig = freshSettings.logs ? freshSettings.logs[primaryDbKey] : null;
                const currentEnabled = currentConfig && currentConfig.enabled;
                const newEnabled = !currentEnabled;

                // Mettre à jour toutes les clés DB associées
                const updateObj = {};
                for (const dbKey of config.dbKeys) {
                    updateObj[`logs.${dbKey}.enabled`] = newEnabled;
                }

                await Guild.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { $set: updateObj },
                    { upsert: true }
                );

                const label = config.label.replace(/^[^\s]+\s/, '');
                Logger.info(`Log ${label} ${newEnabled ? 'activé' : 'désactivé'} sur ${interaction.guild.name}`);

                // Recharger et afficher le détail mis à jour
                freshSettings = await Guild.findOne({ guildId: interaction.guild.id });
                const detailEmbed = buildTypeDetailEmbed(typeKey, freshSettings);
                const detailComponents = buildTypeDetailComponents(typeKey, freshSettings);

                await i.update({
                    embeds: [detailEmbed],
                    components: detailComponents
                });
                return;
            }

            /* ─── Bouton : Définir le salon (affiche un message informatif) ─── */
            if (i.customId.startsWith('logs_setchannel_')) {
                const typeKey = i.customId.replace('logs_setchannel_', '');
                const config = LOG_TYPES[typeKey];
                if (!config) return;

                const label = config.label.replace(/^[^\s]+\s/, '');

                await i.update({
                    embeds: [infoEmbed(
                        `Pour définir le salon des logs **${label}**, utilisez la commande :\n\n` +
                        `\`/logs channel type:${typeKey} channel:#salon\``,
                        '📝 Définir le salon'
                    )],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('logs_back')
                                .setLabel('Retour')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('◀️')
                        )
                    ]
                });
                return;
            }

        } catch (error) {
            Logger.error(`Erreur dans le collecteur de logs config : ${error.message}`);
            try {
                await i.reply({
                    embeds: [errorEmbed('Une erreur est survenue lors du traitement.')],
                    ephemeral: true
                });
            } catch (_) {
                // Ignorer si la réponse a déjà été envoyée
            }
        }
    });

    // Désactiver les composants à l'expiration du collecteur
    collector.on('end', async () => {
        try {
            await interaction.editReply({ components: [] });
        } catch (_) {
            // Ignorer si le message a été supprimé
        }
    });
}

/* ═══════════════════════════════════════════════════════════ */
/*           SOUS-COMMANDES enable / disable / channel        */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Active un type de log spécifique.
 * Met à jour toutes les clés DB associées au type.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleEnable(interaction, guildSettings) {
    const typeKey = interaction.options.getString('type');
    const config = LOG_TYPES[typeKey];

    if (!config) {
        return interaction.reply({
            embeds: [errorEmbed(`Type de log \`${typeKey}\` inconnu.`)],
            ephemeral: true
        });
    }

    // Activer toutes les clés DB associées
    const updateObj = {};
    for (const dbKey of config.dbKeys) {
        updateObj[`logs.${dbKey}.enabled`] = true;
    }

    await Guild.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: updateObj },
        { upsert: true }
    );

    const label = config.label.replace(/^[^\s]+\s/, '');
    Logger.info(`Log ${label} activé sur ${interaction.guild.name}`);

    return interaction.reply({
        embeds: [successEmbed(
            `Les logs **${label}** ont été **activés**.\n\n` +
            `Clés mises à jour : ${config.dbKeys.map(k => `\`${k}\``).join(', ')}`,
            `${config.emoji} Logs activés`
        )],
        ephemeral: true
    });
}

/**
 * Désactive un type de log spécifique.
 * Met à jour toutes les clés DB associées au type.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleDisable(interaction, guildSettings) {
    const typeKey = interaction.options.getString('type');
    const config = LOG_TYPES[typeKey];

    if (!config) {
        return interaction.reply({
            embeds: [errorEmbed(`Type de log \`${typeKey}\` inconnu.`)],
            ephemeral: true
        });
    }

    // Désactiver toutes les clés DB associées
    const updateObj = {};
    for (const dbKey of config.dbKeys) {
        updateObj[`logs.${dbKey}.enabled`] = false;
    }

    await Guild.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: updateObj },
        { upsert: true }
    );

    const label = config.label.replace(/^[^\s]+\s/, '');
    Logger.info(`Log ${label} désactivé sur ${interaction.guild.name}`);

    return interaction.reply({
        embeds: [successEmbed(
            `Les logs **${label}** ont été **désactivés**.\n\n` +
            `Clés mises à jour : ${config.dbKeys.map(k => `\`${k}\``).join(', ')}`,
            `${config.emoji} Logs désactivés`
        )],
        ephemeral: true
    });
}

/**
 * Définit le salon pour un type de log spécifique.
 * Met à jour le channelId de toutes les clés DB associées.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleChannel(interaction, guildSettings) {
    const typeKey = interaction.options.getString('type');
    const channel = interaction.options.getChannel('channel');
    const config = LOG_TYPES[typeKey];

    if (!config) {
        return interaction.reply({
            embeds: [errorEmbed(`Type de log \`${typeKey}\` inconnu.`)],
            ephemeral: true
        });
    }

    // Vérifier que le salon est bien un salon textuel accessible
    if (channel.type !== ChannelType.GuildText) {
        return interaction.reply({
            embeds: [errorEmbed('Le salon doit être un salon textuel.')],
            ephemeral: true
        });
    }

    // Mettre à jour le channelId de toutes les clés DB associées
    const updateObj = {};
    for (const dbKey of config.dbKeys) {
        updateObj[`logs.${dbKey}.channelId`] = channel.id;
    }

    await Guild.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: updateObj },
        { upsert: true }
    );

    const label = config.label.replace(/^[^\s]+\s/, '');
    Logger.info(`Salon de log ${label} défini sur #${channel.name} pour ${interaction.guild.name}`);

    return interaction.reply({
        embeds: [successEmbed(
            `Le salon des logs **${label}** a été défini sur ${channel}.\n\n` +
            `Clés mises à jour : ${config.dbKeys.map(k => `\`${k}\``).join(', ')}`,
            `${config.emoji} Salon configuré`
        )],
        ephemeral: true
    });
}
