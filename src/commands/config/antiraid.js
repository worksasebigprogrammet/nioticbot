// Commande de gestion de l'anti-raid - Panneau interactif complet avec boutons
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { successEmbed, errorEmbed, createEmbed, warningEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('Gérer le système anti-raid')
        .addSubcommand(sub =>
            sub.setName('on')
                .setDescription('Activer le mode anti-raid manuellement'))
        .addSubcommand(sub =>
            sub.setName('off')
                .setDescription('Désactiver le mode anti-raid'))
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Panneau de configuration interactive anti-raid')
                .addIntegerOption(option =>
                    option.setName('join_threshold')
                        .setDescription('Nombre d\'arrivées pour déclencher l\'alerte')
                        .setMinValue(3).setMaxValue(50).setRequired(false))
                .addIntegerOption(option =>
                    option.setName('time_window')
                        .setDescription('Fenêtre de temps en secondes')
                        .setMinValue(5).setMaxValue(120).setRequired(false))
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action lors d\'un raid détecté')
                        .setRequired(false)
                        .addChoices(
                            { name: '🔒 Vérification uniquement', value: 'verification' },
                            { name: '👢 Expulser les comptes récents', value: 'kick_new' },
                            { name: '🔨 Bannir automatiquement', value: 'auto_ban' },
                            { name: '🔐 Verrouiller le serveur', value: 'lockdown' }
                        )))
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Voir le statut actuel du système anti-raid'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: 'antiraid',
    adminOnly: true,

    async execute(interaction) {
        const { guild, client } = interaction;
        const subcommand = interaction.options.getSubcommand();

        let guildSettings = await Guild.findOne({ guildId: guild.id });
        if (!guildSettings) {
            guildSettings = await Guild.create({ guildId: guild.id });
        }

        switch (subcommand) {
            case 'on':
                return await handleOn(interaction, guildSettings, client);
            case 'off':
                return await handleOff(interaction, guildSettings, client);
            case 'config':
                return await handleConfig(interaction, guildSettings, client);
            case 'status':
                return await handleStatus(interaction, guildSettings, client);
        }
    }
};

/* ─── Activer le mode anti-raid ─── */
async function handleOn(interaction, guildSettings, client) {
    try {
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: { 'modules.antiraid': true, 'antiraid.enabled': true } },
            { upsert: true }
        );

        if (client.systems?.antiraid) {
            await client.systems.antiraid.activate(interaction.guild.id);
        }

        Logger.info(`Anti-raid activé sur ${interaction.guild.name} par ${interaction.user.tag}`);

        return interaction.reply({
            embeds: [warningEmbed(
                `Le mode **anti-raid** a été **activé** manuellement.\n\n` +
                `🛡️ Protections actives :\n` +
                `> Surveillance renforcée des arrivées\n` +
                `> Détection des actions suspectes\n` +
                `> Notifications aux administrateurs\n\n` +
                `Utilisez \`/antiraid off\` pour désactiver.`,
                '🛡️ Anti-Raid Activé'
            )]
        });
    } catch (error) {
        Logger.error(`Erreur activation anti-raid : ${error.message}`);
        return interaction.reply({ embeds: [errorEmbed(`Erreur : ${error.message}`)], ephemeral: true });
    }
}

/* ─── Désactiver le mode anti-raid ─── */
async function handleOff(interaction, guildSettings, client) {
    try {
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: { 'antiraid.enabled': false } },
            { upsert: true }
        );

        if (client.systems?.antiraid) {
            await client.systems.antiraid.deactivate(interaction.guild.id);
        }

        Logger.info(`Anti-raid désactivé sur ${interaction.guild.name} par ${interaction.user.tag}`);

        return interaction.reply({
            embeds: [successEmbed(
                `Le mode **anti-raid** a été **désactivé**.\n\n` +
                `Le système peut toujours se réactiver automatiquement en cas de raid détecté.`
            )]
        });
    } catch (error) {
        Logger.error(`Erreur désactivation anti-raid : ${error.message}`);
        return interaction.reply({ embeds: [errorEmbed(`Erreur : ${error.message}`)], ephemeral: true });
    }
}

/* ─── Configuration interactive avec panneau de boutons ─── */
async function handleConfig(interaction, guildSettings, client) {
    const joinThreshold = interaction.options.getInteger('join_threshold');
    const timeWindow = interaction.options.getInteger('time_window');
    const action = interaction.options.getString('action');

    // Si des paramètres sont fournis, mettre à jour directement
    if (joinThreshold || timeWindow || action) {
        return await applyConfigChanges(interaction, joinThreshold, timeWindow, action);
    }

    // Sinon, afficher le panneau interactif complet
    return await showInteractivePanel(interaction, guildSettings);
}

/* ─── Panneau interactif principal ─── */
async function showInteractivePanel(interaction, guildSettings) {
    const config = guildSettings.antiraid || {};
    const actions = config.actions || {};

    const embed = new EmbedBuilder()
        .setColor(config.enabled ? 0xFF0000 : 0x2F3136)
        .setTitle('🛡️ Configuration Anti-Raid')
        .setDescription('Configurez tous les paramètres de protection anti-raid via les boutons ci-dessous.')
        .addFields(
            {
                name: '📊 Statut',
                value: config.enabled ? '✅ Activé' : '❌ Désactivé',
                inline: true
            },
            {
                name: '👥 Seuil Joins',
                value: `\`${config.joinThreshold || 10}\` joins en \`${config.joinTimeWindow || 10}\`s`,
                inline: true
            },
            {
                name: '🔨 Seuil Admin',
                value: `\`${config.adminActionThreshold || 5}\` actions suspectes`,
                inline: true
            },
            {
                name: '🚫 Actions lors d\'un raid',
                value:
                    `${actions.enableVerification !== false ? '✅' : '❌'} Vérification maximale\n` +
                    `${actions.kickNewAccounts ? '✅' : '❌'} Kick comptes récents (<\`${actions.minAccountAge || 7}\`j)\n` +
                    `${actions.autoBan ? '✅' : '❌'} Ban automatique des raiders\n` +
                    `${actions.lockdown ? '✅' : '❌'} Verrouillage des salons\n` +
                    `${actions.notifyAdmins !== false ? '✅' : '❌'} Notification admins`,
                inline: false
            }
        )
        .setFooter({ text: 'Les boutons expirent après 5 minutes' })
        .setTimestamp();

    // Ligne 1 : Activation / Seuils
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ar_toggle')
            .setLabel(config.enabled ? '❌ Désactiver' : '✅ Activer')
            .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ar_threshold_up')
            .setLabel('📈 Seuil +5')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_threshold_down')
            .setLabel('📉 Seuil -5')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((config.joinThreshold || 10) <= 5),
        new ButtonBuilder()
            .setCustomId('ar_window_up')
            .setLabel('⏱️ Fenêtre +5s')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_window_down')
            .setLabel('⏱️ Fenêtre -5s')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((config.joinTimeWindow || 10) <= 5)
    );

    // Ligne 2 : Actions individuelles
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ar_act_verification')
            .setLabel('🔒 Vérification')
            .setStyle(actions.enableVerification !== false ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_kick')
            .setLabel('👢 Kick récents')
            .setStyle(actions.kickNewAccounts ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_ban')
            .setLabel('🔨 Auto-Ban')
            .setStyle(actions.autoBan ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_lockdown')
            .setLabel('🔐 Lockdown')
            .setStyle(actions.lockdown ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_notify')
            .setLabel('📢 Notifier')
            .setStyle(actions.notifyAdmins !== false ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Ligne 3 : Presets rapides
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ar_preset_low')
            .setLabel('🟢 Protection Basse')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ar_preset_medium')
            .setLabel('🟡 Protection Moyenne')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ar_preset_high')
            .setLabel('🔴 Protection Maximale')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ar_refresh')
            .setLabel('🔄 Actualiser')
            .setStyle(ButtonStyle.Secondary)
    );

    // Répondre ou mettre à jour selon le type d'interaction
    const messageOptions = { embeds: [embed], components: [row1, row2, row3], ephemeral: true };

    let reply;
    if (interaction.replied || interaction.deferred) {
        reply = await interaction.editReply(messageOptions);
    } else if (interaction.isButton()) {
        await interaction.update(messageOptions);
        reply = await interaction.message;
    } else {
        reply = await interaction.reply({ ...messageOptions, fetchReply: true });
    }

    // Collecteur d'interactions pour les boutons
    const collector = reply.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes
    });

    collector.on('collect', async (i) => {
        try {
            // Recharger les settings depuis la BDD
            let freshSettings = await Guild.findOne({ guildId: interaction.guild.id });
            if (!freshSettings) freshSettings = await Guild.create({ guildId: interaction.guild.id });

            const cfg = freshSettings.antiraid || {};
            const acts = cfg.actions || {};

            switch (i.customId) {
                case 'ar_toggle':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.enabled': !cfg.enabled } },
                        { upsert: true }
                    );
                    break;

                case 'ar_threshold_up':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.joinThreshold': Math.min((cfg.joinThreshold || 10) + 5, 50) } },
                        { upsert: true }
                    );
                    break;

                case 'ar_threshold_down':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.joinThreshold': Math.max((cfg.joinThreshold || 10) - 5, 3) } },
                        { upsert: true }
                    );
                    break;

                case 'ar_window_up':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.joinTimeWindow': Math.min((cfg.joinTimeWindow || 10) + 5, 120) } },
                        { upsert: true }
                    );
                    break;

                case 'ar_window_down':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.joinTimeWindow': Math.max((cfg.joinTimeWindow || 10) - 5, 5) } },
                        { upsert: true }
                    );
                    break;

                case 'ar_act_verification':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.actions.enableVerification': acts.enableVerification === false } },
                        { upsert: true }
                    );
                    break;

                case 'ar_act_kick':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.actions.kickNewAccounts': !acts.kickNewAccounts } },
                        { upsert: true }
                    );
                    break;

                case 'ar_act_ban':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.actions.autoBan': !acts.autoBan } },
                        { upsert: true }
                    );
                    break;

                case 'ar_act_lockdown':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.actions.lockdown': !acts.lockdown } },
                        { upsert: true }
                    );
                    break;

                case 'ar_act_notify':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: { 'antiraid.actions.notifyAdmins': acts.notifyAdmins === false ? true : false } },
                        { upsert: true }
                    );
                    break;

                // Presets de protection
                case 'ar_preset_low':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: {
                            'antiraid.enabled': true,
                            'antiraid.joinThreshold': 15,
                            'antiraid.joinTimeWindow': 10,
                            'antiraid.actions.enableVerification': true,
                            'antiraid.actions.kickNewAccounts': false,
                            'antiraid.actions.autoBan': false,
                            'antiraid.actions.lockdown': false,
                            'antiraid.actions.notifyAdmins': true
                        }},
                        { upsert: true }
                    );
                    break;

                case 'ar_preset_medium':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: {
                            'antiraid.enabled': true,
                            'antiraid.joinThreshold': 10,
                            'antiraid.joinTimeWindow': 10,
                            'antiraid.actions.enableVerification': true,
                            'antiraid.actions.kickNewAccounts': true,
                            'antiraid.actions.autoBan': false,
                            'antiraid.actions.lockdown': false,
                            'antiraid.actions.notifyAdmins': true
                        }},
                        { upsert: true }
                    );
                    break;

                case 'ar_preset_high':
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $set: {
                            'antiraid.enabled': true,
                            'antiraid.joinThreshold': 5,
                            'antiraid.joinTimeWindow': 10,
                            'antiraid.actions.enableVerification': true,
                            'antiraid.actions.kickNewAccounts': true,
                            'antiraid.actions.autoBan': true,
                            'antiraid.actions.lockdown': true,
                            'antiraid.actions.notifyAdmins': true
                        }},
                        { upsert: true }
                    );
                    break;

                case 'ar_refresh':
                    break; // Simple rechargement
            }

            // Recharger et réafficher le panneau
            const updatedSettings = await Guild.findOne({ guildId: interaction.guild.id });
            await refreshPanel(i, updatedSettings);

        } catch (error) {
            Logger.error(`Erreur interaction antiraid: ${error.message}`);
            await i.reply({ embeds: [errorEmbed(`Erreur : ${error.message}`)], ephemeral: true }).catch(() => {});
        }
    });

    // Désactiver les boutons à l'expiration
    collector.on('end', async () => {
        try {
            await reply.edit({ components: [] }).catch(() => {});
        } catch (e) { /* Message peut avoir été supprimé */ }
    });
}

/* ─── Rafraîchir le panneau interactif après une modification ─── */
async function refreshPanel(interaction, guildSettings) {
    const config = guildSettings.antiraid || {};
    const actions = config.actions || {};

    const embed = new EmbedBuilder()
        .setColor(config.enabled ? 0xFF0000 : 0x2F3136)
        .setTitle('🛡️ Configuration Anti-Raid')
        .setDescription('Configurez tous les paramètres de protection anti-raid via les boutons ci-dessous.')
        .addFields(
            {
                name: '📊 Statut',
                value: config.enabled ? '✅ Activé' : '❌ Désactivé',
                inline: true
            },
            {
                name: '👥 Seuil Joins',
                value: `\`${config.joinThreshold || 10}\` joins en \`${config.joinTimeWindow || 10}\`s`,
                inline: true
            },
            {
                name: '🔨 Seuil Admin',
                value: `\`${config.adminActionThreshold || 5}\` actions suspectes`,
                inline: true
            },
            {
                name: '🚫 Actions lors d\'un raid',
                value:
                    `${actions.enableVerification !== false ? '✅' : '❌'} Vérification maximale\n` +
                    `${actions.kickNewAccounts ? '✅' : '❌'} Kick comptes récents (<\`${actions.minAccountAge || 7}\`j)\n` +
                    `${actions.autoBan ? '✅' : '❌'} Ban automatique des raiders\n` +
                    `${actions.lockdown ? '✅' : '❌'} Verrouillage des salons\n` +
                    `${actions.notifyAdmins !== false ? '✅' : '❌'} Notification admins`,
                inline: false
            }
        )
        .setFooter({ text: 'Les boutons expirent après 5 minutes' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ar_toggle')
            .setLabel(config.enabled ? '❌ Désactiver' : '✅ Activer')
            .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ar_threshold_up')
            .setLabel('📈 Seuil +5')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_threshold_down')
            .setLabel('📉 Seuil -5')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((config.joinThreshold || 10) <= 5),
        new ButtonBuilder()
            .setCustomId('ar_window_up')
            .setLabel('⏱️ Fenêtre +5s')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_window_down')
            .setLabel('⏱️ Fenêtre -5s')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((config.joinTimeWindow || 10) <= 5)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ar_act_verification')
            .setLabel('🔒 Vérification')
            .setStyle(actions.enableVerification !== false ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_kick')
            .setLabel('👢 Kick récents')
            .setStyle(actions.kickNewAccounts ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_ban')
            .setLabel('🔨 Auto-Ban')
            .setStyle(actions.autoBan ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_lockdown')
            .setLabel('🔐 Lockdown')
            .setStyle(actions.lockdown ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ar_act_notify')
            .setLabel('📢 Notifier')
            .setStyle(actions.notifyAdmins !== false ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ar_preset_low')
            .setLabel('🟢 Protection Basse')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ar_preset_medium')
            .setLabel('🟡 Protection Moyenne')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ar_preset_high')
            .setLabel('🔴 Protection Maximale')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ar_refresh')
            .setLabel('🔄 Actualiser')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({ embeds: [embed], components: [row1, row2, row3] });
}

/* ─── Appliquer des changements directs via options ─── */
async function applyConfigChanges(interaction, joinThreshold, timeWindow, action) {
    const updateFields = {};
    const changes = [];

    if (joinThreshold) {
        updateFields['antiraid.joinThreshold'] = joinThreshold;
        changes.push(`**Seuil d'arrivées :** \`${joinThreshold}\``);
    }

    if (timeWindow) {
        updateFields['antiraid.joinTimeWindow'] = timeWindow;
        changes.push(`**Fenêtre de temps :** \`${timeWindow}s\``);
    }

    if (action) {
        const actionPresets = {
            verification: { enableVerification: true, kickNewAccounts: false, autoBan: false, lockdown: false },
            kick_new: { enableVerification: true, kickNewAccounts: true, autoBan: false, lockdown: false },
            auto_ban: { enableVerification: true, kickNewAccounts: true, autoBan: true, lockdown: false },
            lockdown: { enableVerification: true, kickNewAccounts: true, autoBan: true, lockdown: true }
        };
        const preset = actionPresets[action];
        for (const [key, value] of Object.entries(preset)) {
            updateFields[`antiraid.actions.${key}`] = value;
        }
        changes.push(`**Action :** ${action}`);
    }

    try {
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: updateFields },
            { upsert: true }
        );

        Logger.info(`Config anti-raid mise à jour sur ${interaction.guild.name} par ${interaction.user.tag}`);

        return interaction.reply({
            embeds: [successEmbed(
                `Configuration anti-raid mise à jour :\n\n` +
                changes.map(c => `> ${c}`).join('\n')
            )],
            ephemeral: true
        });
    } catch (error) {
        Logger.error(`Erreur config anti-raid : ${error.message}`);
        return interaction.reply({ embeds: [errorEmbed(`Erreur : ${error.message}`)], ephemeral: true });
    }
}

/* ─── Afficher le statut actuel ─── */
async function handleStatus(interaction, guildSettings, client) {
    const antiraidConfig = guildSettings.antiraid || {};
    const isModuleEnabled = guildSettings.modules?.antiraid || false;
    const isActive = antiraidConfig.enabled || false;

    let realtimeData = null;
    if (client.systems?.antiraid) {
        realtimeData = await client.systems.antiraid.getStatus(interaction.guild.id).catch(() => null);
    }

    let alertLevel = '🟢 Normal';
    let alertColor = 'success';
    if (isActive && realtimeData?.raidDetected) {
        alertLevel = '🔴 Raid détecté';
        alertColor = 'error';
    } else if (isActive) {
        alertLevel = '🟡 Surveillance active';
        alertColor = 'warning';
    } else if (!isModuleEnabled) {
        alertLevel = '⚫ Désactivé';
        alertColor = 0x2F3136;
    }

    const embed = createEmbed({
        title: '🛡️ Statut Anti-Raid',
        description: 'État actuel du système de protection anti-raid.',
        color: alertColor,
        fields: [
            { name: '📌 Module', value: isModuleEnabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '🔰 Mode', value: isActive ? '✅ Actif' : '❌ Inactif', inline: true },
            { name: '🚨 Alerte', value: alertLevel, inline: true },
            {
                name: '📊 Configuration',
                value: `> Seuil : \`${antiraidConfig.joinThreshold || 10}\` joins / \`${antiraidConfig.joinTimeWindow || 10}\`s\n` +
                       `> Seuil admin : \`${antiraidConfig.adminActionThreshold || 5}\` actions`,
                inline: false
            },
            {
                name: '📈 Données temps réel',
                value: realtimeData
                    ? `> Arrivées récentes : \`${realtimeData.recentJoins || 0}\`\n` +
                      `> Actions suspectes : \`${realtimeData.suspiciousActions || 0}\`\n` +
                      `> Raids détectés : \`${realtimeData.totalRaids || 0}\``
                    : '> *Système non initialisé*',
                inline: false
            }
        ],
        footer: { text: 'Dernière vérification' }
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}
