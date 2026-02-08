// Commande de configuration avancée du bot — Sous-commandes : logs, wizard, status, permissions
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
} = require('discord.js');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');
const { successEmbed, errorEmbed, createEmbed, warningEmbed } = require('../../utils/embed');

/* ─── Définition des presets de salons de logs ─── */
const PRESETS = {
    simple: {
        label: 'Simple',
        channels: [
            { name: '📝-moderation', logType: 'moderation' },
            { name: '💬-messages', logType: 'messageDelete' },
            { name: '👥-membres', logType: 'memberJoinLeave' },
            { name: '⚠️-antiraid', logType: 'antiraid' }
        ]
    },
    complete: {
        label: 'Complet',
        channels: [
            { name: '📝-moderation', logType: 'moderation' },
            { name: '💬-messages', logType: 'messageDelete' },
            { name: '👥-membres', logType: 'memberJoinLeave' },
            { name: '⚠️-antiraid', logType: 'antiraid' },
            { name: '🎭-roles', logType: 'roleUpdate' },
            { name: '🔊-vocal', logType: 'voice' },
            { name: '⚙️-serveur', logType: 'server' },
            { name: '🎫-tickets', logType: 'tickets' }
        ]
    },
    extreme: {
        label: 'Extrême',
        channels: [
            { name: '📝-moderation', logType: 'moderation' },
            { name: '💬-messages', logType: 'messageDelete' },
            { name: '👥-membres', logType: 'memberJoinLeave' },
            { name: '⚠️-antiraid', logType: 'antiraid' },
            { name: '🎭-roles', logType: 'roleUpdate' },
            { name: '🔊-vocal', logType: 'voice' },
            { name: '⚙️-serveur', logType: 'server' },
            { name: '🎫-tickets', logType: 'tickets' },
            { name: '🖼️-avatars', logType: 'memberJoinLeave' },
            { name: '🎉-invitations', logType: 'server' },
            { name: '😀-emojis', logType: 'server' },
            { name: '🤖-webhooks', logType: 'server' }
        ]
    }
};

/* ─── Définition de la commande slash avec sous-commandes ─── */
const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configurer le bot — logs, wizard interactif, statut, permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub
            .setName('logs')
            .setDescription('Configurer les salons de logs automatiquement')
            .addStringOption(option =>
                option
                    .setName('preset')
                    .setDescription('Le type de configuration à appliquer')
                    .setRequired(true)
                    .addChoices(
                        { name: '🟢 Simple (4 salons)', value: 'simple' },
                        { name: '🟡 Complet (8 salons)', value: 'complete' },
                        { name: '🔴 Extrême (12+ salons)', value: 'extreme' }
                    )
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('wizard')
            .setDescription('Lancer l\'assistant de configuration interactif')
    )
    .addSubcommand(sub =>
        sub
            .setName('status')
            .setDescription('Configurer le statut du bot')
    )
    .addSubcommand(sub =>
        sub
            .setName('permissions')
            .setDescription('Configurer les rôles administrateurs du bot')
    );

/* ─── Fonction utilitaire : créer les salons de logs selon un preset ─── */
async function createLogChannels(interaction, preset, presetConfig) {
    const { guild, client } = interaction;

    try {
        // Créer la catégorie principale pour les logs
        const category = await guild.channels.create({
            name: '📊 Logs',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    // Refuser la vue à @everyone
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    // Autoriser la vue au bot
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks
                    ]
                }
            ]
        });

        Logger.info(`Catégorie de logs créée sur ${guild.name} (${guild.id})`);

        // Préparer la mise à jour des paramètres de logs dans la base de données
        const logsUpdate = {};
        const createdChannels = [];

        // Créer chaque salon de log selon le preset choisi
        for (const channelConfig of presetConfig.channels) {
            const channel = await guild.channels.create({
                name: channelConfig.name,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        // Refuser la vue à @everyone
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        // Autoriser la vue au bot uniquement
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles
                        ]
                    }
                ]
            });

            // Enregistrer le mapping type de log -> ID du salon
            logsUpdate[`logs.${channelConfig.logType}.channelId`] = channel.id;
            logsUpdate[`logs.${channelConfig.logType}.enabled`] = true;

            createdChannels.push({ name: channelConfig.name, id: channel.id });

            Logger.debug(`Salon de log créé : ${channelConfig.name} (${channel.id})`);
        }

        // Activer le module de logs et mettre à jour la configuration en base de données
        await Guild.findOneAndUpdate(
            { guildId: guild.id },
            {
                $set: {
                    'modules.logs': true,
                    ...logsUpdate
                }
            },
            { upsert: true, new: true }
        );

        // Construire la liste des salons créés pour l'embed de confirmation
        const channelList = createdChannels
            .map(ch => `> <#${ch.id}> — \`${ch.name}\``)
            .join('\n');

        // Répondre avec un embed de succès détaillé
        const embed = createEmbed({
            title: '✅ Configuration des logs terminée',
            description:
                `Le preset **${presetConfig.label}** a été appliqué avec succès.\n\n` +
                `**${createdChannels.length} salons** ont été créés dans la catégorie **📊 Logs** :\n\n` +
                channelList,
            color: 'success',
            fields: [
                {
                    name: '🔒 Permissions',
                    value: 'Seuls les administrateurs et le bot peuvent voir ces salons.',
                    inline: false
                },
                {
                    name: '💡 Astuce',
                    value: 'Utilisez `/config view logs` pour voir la configuration actuelle des logs.',
                    inline: false
                }
            ],
            footer: { text: `Preset: ${presetConfig.label} • ${createdChannels.length} salons créés` }
        });

        return interaction.editReply({ embeds: [embed], components: [] });

    } catch (error) {
        Logger.error(`Erreur lors du setup des logs sur ${guild.name}: ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(
                `Une erreur est survenue lors de la création des salons de logs.\n` +
                `**Erreur:** ${error.message}\n\n` +
                `Vérifiez que le bot possède les permissions nécessaires (Gérer les salons).`
            )],
            components: []
        });
    }
}

/* ─── Sous-commande : logs — Configuration automatique des salons de logs ─── */
async function handleLogs(interaction) {
    const { guild } = interaction;
    const preset = interaction.options.getString('preset');
    const presetConfig = PRESETS[preset];

    // Différer la réponse car la création de salons peut prendre du temps
    await interaction.deferReply({ ephemeral: true });

    // Vérifier si une catégorie "📊 Logs" existe déjà sur le serveur
    const existingCategory = guild.channels.cache.find(
        ch => ch.type === ChannelType.GuildCategory && ch.name === '📊 Logs'
    );

    if (existingCategory) {
        // Afficher une confirmation avec des boutons avant de recréer
        const confirmEmbed = warningEmbed(
            `Une catégorie **📊 Logs** existe déjà sur ce serveur.\n\n` +
            `**Catégorie existante :** ${existingCategory.name} (\`${existingCategory.id}\`)\n\n` +
            `Voulez-vous **recréer** une nouvelle catégorie de logs avec le preset **${presetConfig.label}** ?\n` +
            `L'ancienne catégorie ne sera **pas supprimée** automatiquement.`,
            '⚠️ Catégorie de logs existante'
        );

        // Boutons de confirmation : Recréer ou Annuler
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`setup_logs_confirm_${preset}`)
                .setLabel('Recréer les salons')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('setup_logs_cancel')
                .setLabel('Annuler')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
        );

        const reply = await interaction.editReply({
            embeds: [confirmEmbed],
            components: [confirmRow]
        });

        // Attendre la réponse de l'utilisateur (bouton cliqué) pendant 60 secondes
        try {
            const btnInteraction = await reply.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 60_000
            });

            if (btnInteraction.customId === 'setup_logs_cancel') {
                // Annulation par l'utilisateur
                return btnInteraction.update({
                    embeds: [errorEmbed('Configuration annulée. Aucune modification effectuée.')],
                    components: []
                });
            }

            // L'utilisateur a confirmé — mettre à jour l'interaction et procéder
            await btnInteraction.update({
                embeds: [createEmbed({
                    title: '⏳ Création en cours...',
                    description: `Création des salons de logs avec le preset **${presetConfig.label}**...`,
                    color: 'info'
                })],
                components: []
            });

            // Créer les salons de logs
            return await createLogChannels(interaction, preset, presetConfig);

        } catch {
            // Expiration du délai d'attente
            return interaction.editReply({
                embeds: [errorEmbed('Temps écoulé. Configuration annulée.')],
                components: []
            });
        }
    }

    // Aucune catégorie existante — procéder directement à la création
    return await createLogChannels(interaction, preset, presetConfig);
}

/* ─── Sous-commande : wizard — Assistant de configuration interactif ─── */
async function handleWizard(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Construire l'embed principal du wizard avec les étapes de configuration
    const wizardEmbed = createEmbed({
        title: '🧙 Assistant de configuration',
        description:
            'Bienvenue dans l\'assistant de configuration interactif !\n\n' +
            'Cliquez sur les boutons ci-dessous pour configurer chaque aspect du bot. ' +
            'Vous pouvez configurer les modules dans l\'ordre que vous souhaitez.\n\n' +
            '**Étapes disponibles :**\n' +
            '> 📊 **Logs** — Configurer les salons de journalisation\n' +
            '> 🧩 **Modules** — Activer ou désactiver les modules\n' +
            '> 🔐 **Permissions** — Définir les rôles administrateurs\n' +
            '> 🎮 **Statut** — Configurer le statut du bot\n' +
            '> 🛡️ **Anti-raid** — Configurer la protection anti-raid\n' +
            '> ✅ **Terminer** — Finaliser la configuration',
        color: 'info',
        footer: { text: 'Assistant de configuration • Cliquez sur un bouton pour commencer' }
    });

    // Première ligne de boutons : Logs, Modules, Permissions
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('wizard_logs')
            .setLabel('Logs')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊'),
        new ButtonBuilder()
            .setCustomId('wizard_modules')
            .setLabel('Modules')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🧩'),
        new ButtonBuilder()
            .setCustomId('wizard_permissions')
            .setLabel('Permissions')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔐')
    );

    // Deuxième ligne de boutons : Statut, Anti-raid, Terminer
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('wizard_status')
            .setLabel('Statut')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎮'),
        new ButtonBuilder()
            .setCustomId('wizard_antiraid')
            .setLabel('Anti-raid')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🛡️'),
        new ButtonBuilder()
            .setCustomId('wizard_finish')
            .setLabel('Terminer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );

    const reply = await interaction.editReply({
        embeds: [wizardEmbed],
        components: [row1, row2]
    });

    // Collecteur de boutons — reste actif pendant 5 minutes
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id,
        time: 300_000
    });

    collector.on('collect', async btnInteraction => {
        try {
            switch (btnInteraction.customId) {
                /* ── Étape Logs : afficher un sélecteur de preset ── */
                case 'wizard_logs': {
                    const logsEmbed = createEmbed({
                        title: '📊 Configuration des logs',
                        description:
                            'Choisissez un preset pour créer automatiquement les salons de logs :\n\n' +
                            '> 🟢 **Simple** — 4 salons essentiels (modération, messages, membres, antiraid)\n' +
                            '> 🟡 **Complet** — 8 salons détaillés (+ rôles, vocal, serveur, tickets)\n' +
                            '> 🔴 **Extrême** — 12+ salons pour une couverture maximale',
                        color: 'info'
                    });

                    const presetRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('wizard_preset_simple')
                            .setLabel('Simple')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('🟢'),
                        new ButtonBuilder()
                            .setCustomId('wizard_preset_complete')
                            .setLabel('Complet')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🟡'),
                        new ButtonBuilder()
                            .setCustomId('wizard_preset_extreme')
                            .setLabel('Extrême')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔴'),
                        new ButtonBuilder()
                            .setCustomId('wizard_back')
                            .setLabel('Retour')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                    await btnInteraction.update({ embeds: [logsEmbed], components: [presetRow] });
                    break;
                }

                /* ── Sélection d'un preset de logs depuis le wizard ── */
                case 'wizard_preset_simple':
                case 'wizard_preset_complete':
                case 'wizard_preset_extreme': {
                    const selectedPreset = btnInteraction.customId.replace('wizard_preset_', '');
                    const selectedConfig = PRESETS[selectedPreset];

                    await btnInteraction.update({
                        embeds: [createEmbed({
                            title: '⏳ Création en cours...',
                            description: `Création des salons de logs avec le preset **${selectedConfig.label}**...`,
                            color: 'info'
                        })],
                        components: []
                    });

                    // Vérifier si la catégorie existe déjà
                    const existingCat = interaction.guild.channels.cache.find(
                        ch => ch.type === ChannelType.GuildCategory && ch.name === '📊 Logs'
                    );

                    if (existingCat) {
                        // Demander confirmation avant de recréer
                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`wizard_confirm_logs_${selectedPreset}`)
                                .setLabel('Recréer les salons')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🔄'),
                            new ButtonBuilder()
                                .setCustomId('wizard_back')
                                .setLabel('Annuler')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('❌')
                        );

                        return interaction.editReply({
                            embeds: [warningEmbed(
                                `Une catégorie **📊 Logs** existe déjà.\n` +
                                `Voulez-vous recréer les salons avec le preset **${selectedConfig.label}** ?`,
                                '⚠️ Catégorie existante'
                            )],
                            components: [confirmRow]
                        });
                    }

                    // Créer directement les salons de logs
                    await createLogChannels(interaction, selectedPreset, selectedConfig);
                    collector.stop('completed_logs');
                    break;
                }

                /* ── Confirmation de recréation des logs depuis le wizard ── */
                case 'wizard_confirm_logs_simple':
                case 'wizard_confirm_logs_complete':
                case 'wizard_confirm_logs_extreme': {
                    const confirmPreset = btnInteraction.customId.replace('wizard_confirm_logs_', '');
                    const confirmConfig = PRESETS[confirmPreset];

                    await btnInteraction.update({
                        embeds: [createEmbed({
                            title: '⏳ Création en cours...',
                            description: `Création des salons de logs avec le preset **${confirmConfig.label}**...`,
                            color: 'info'
                        })],
                        components: []
                    });

                    await createLogChannels(interaction, confirmPreset, confirmConfig);
                    collector.stop('completed_logs');
                    break;
                }

                /* ── Étape Modules : afficher le menu de sélection des modules ── */
                case 'wizard_modules': {
                    // Récupérer la configuration actuelle des modules
                    const guildData = await Guild.findOne({ guildId: interaction.guild.id });
                    const currentModules = guildData?.modules || {};

                    const modulesEmbed = createEmbed({
                        title: '🧩 Configuration des modules',
                        description:
                            'Sélectionnez les modules à **activer** dans le menu ci-dessous.\n' +
                            'Les modules non sélectionnés seront **désactivés**.\n\n' +
                            '**Modules disponibles :**\n' +
                            `> 📋 Logs — ${currentModules.logs ? '✅' : '❌'}\n` +
                            `> 🛡️ Anti-raid — ${currentModules.antiraid ? '✅' : '❌'}\n` +
                            `> 🤖 Auto-mod — ${currentModules.automod ? '✅' : '❌'}\n` +
                            `> 🎫 Tickets — ${currentModules.tickets ? '✅' : '❌'}\n` +
                            `> 📈 Niveaux — ${currentModules.levels ? '✅' : '❌'}\n` +
                            `> 💰 Économie — ${currentModules.economy ? '✅' : '❌'}\n` +
                            `> 🎵 Musique — ${currentModules.music ? '✅' : '❌'}\n` +
                            `> 🔊 Voice Tracking — ${currentModules.voiceTracking ? '✅' : '❌'}\n` +
                            `> 🎉 Giveaways — ${currentModules.giveaways ? '✅' : '❌'}\n` +
                            `> 🎭 Auto-rôles — ${currentModules.autoroles ? '✅' : '❌'}\n` +
                            `> 💡 Suggestions — ${currentModules.suggestions ? '✅' : '❌'}`,
                        color: 'info'
                    });

                    // Construire les options par défaut sélectionnées
                    const moduleOptions = [
                        { label: 'Logs', value: 'logs', emoji: '📋', description: 'Journalisation des événements' },
                        { label: 'Anti-raid', value: 'antiraid', emoji: '🛡️', description: 'Protection contre les raids' },
                        { label: 'Auto-mod', value: 'automod', emoji: '🤖', description: 'Modération automatique' },
                        { label: 'Tickets', value: 'tickets', emoji: '🎫', description: 'Système de tickets' },
                        { label: 'Niveaux', value: 'levels', emoji: '📈', description: 'Système d\'XP et niveaux' },
                        { label: 'Économie', value: 'economy', emoji: '💰', description: 'Système économique' },
                        { label: 'Musique', value: 'music', emoji: '🎵', description: 'Lecteur de musique' },
                        { label: 'Voice Tracking', value: 'voiceTracking', emoji: '🔊', description: 'Suivi de l\'activité vocale' },
                        { label: 'Giveaways', value: 'giveaways', emoji: '🎉', description: 'Système de tirages au sort' },
                        { label: 'Auto-rôles', value: 'autoroles', emoji: '🎭', description: 'Attribution automatique de rôles' },
                        { label: 'Suggestions', value: 'suggestions', emoji: '💡', description: 'Système de suggestions' }
                    ].map(opt => ({
                        ...opt,
                        default: currentModules[opt.value] === true
                    }));

                    const moduleSelect = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('wizard_modules_select')
                            .setPlaceholder('Sélectionnez les modules à activer...')
                            .setMinValues(0)
                            .setMaxValues(moduleOptions.length)
                            .addOptions(moduleOptions)
                    );

                    const backRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('wizard_back')
                            .setLabel('Retour')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                    await btnInteraction.update({ embeds: [modulesEmbed], components: [moduleSelect, backRow] });
                    break;
                }

                /* ── Étape Permissions : afficher le sélecteur de rôles admin ── */
                case 'wizard_permissions': {
                    await handlePermissionsDisplay(btnInteraction, interaction);
                    break;
                }

                /* ── Étape Statut : ouvrir le modal de configuration ── */
                case 'wizard_status': {
                    await showStatusModal(btnInteraction);
                    break;
                }

                /* ── Étape Anti-raid : configurer les paramètres de base ── */
                case 'wizard_antiraid': {
                    const guildData = await Guild.findOne({ guildId: interaction.guild.id });
                    const antiraidEnabled = guildData?.antiraid?.enabled || false;

                    const antiraidEmbed = createEmbed({
                        title: '🛡️ Configuration de l\'anti-raid',
                        description:
                            `**État actuel :** ${antiraidEnabled ? '✅ Activé' : '❌ Désactivé'}\n\n` +
                            'L\'anti-raid protège votre serveur contre les attaques de masse :\n' +
                            '> • Détection des arrivées massives\n' +
                            '> • Verrouillage automatique du serveur\n' +
                            '> • Notification des administrateurs\n\n' +
                            'Cliquez sur le bouton ci-dessous pour activer ou désactiver l\'anti-raid.',
                        color: antiraidEnabled ? 'success' : 'warning'
                    });

                    const antiraidRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('wizard_antiraid_toggle')
                            .setLabel(antiraidEnabled ? 'Désactiver l\'anti-raid' : 'Activer l\'anti-raid')
                            .setStyle(antiraidEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
                            .setEmoji(antiraidEnabled ? '🔴' : '🟢'),
                        new ButtonBuilder()
                            .setCustomId('wizard_back')
                            .setLabel('Retour')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                    await btnInteraction.update({ embeds: [antiraidEmbed], components: [antiraidRow] });
                    break;
                }

                /* ── Basculer l'état de l'anti-raid ── */
                case 'wizard_antiraid_toggle': {
                    const guildData = await Guild.findOne({ guildId: interaction.guild.id });
                    const newState = !(guildData?.antiraid?.enabled || false);

                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        {
                            $set: {
                                'antiraid.enabled': newState,
                                'modules.antiraid': newState
                            }
                        },
                        { upsert: true }
                    );

                    Logger.info(`Anti-raid ${newState ? 'activé' : 'désactivé'} sur ${interaction.guild.name}`);

                    const toggleEmbed = createEmbed({
                        title: '🛡️ Anti-raid',
                        description: `L'anti-raid a été **${newState ? 'activé' : 'désactivé'}** avec succès.`,
                        color: newState ? 'success' : 'warning'
                    });

                    const toggleRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('wizard_antiraid_toggle')
                            .setLabel(newState ? 'Désactiver l\'anti-raid' : 'Activer l\'anti-raid')
                            .setStyle(newState ? ButtonStyle.Danger : ButtonStyle.Success)
                            .setEmoji(newState ? '🔴' : '🟢'),
                        new ButtonBuilder()
                            .setCustomId('wizard_back')
                            .setLabel('Retour')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                    await btnInteraction.update({ embeds: [toggleEmbed], components: [toggleRow] });
                    break;
                }

                /* ── Retour au menu principal du wizard ── */
                case 'wizard_back': {
                    await btnInteraction.update({ embeds: [wizardEmbed], components: [row1, row2] });
                    break;
                }

                /* ── Terminer le wizard ── */
                case 'wizard_finish': {
                    const finishEmbed = successEmbed(
                        'L\'assistant de configuration est terminé !\n\n' +
                        'Vous pouvez relancer `/setup wizard` à tout moment pour modifier la configuration.\n' +
                        'Utilisez `/config view` pour consulter la configuration actuelle.',
                        '✅ Configuration terminée'
                    );

                    await btnInteraction.update({ embeds: [finishEmbed], components: [] });
                    collector.stop('finished');
                    break;
                }
            }
        } catch (error) {
            Logger.error(`Erreur dans le wizard setup : ${error.message}`);
            // Tenter de répondre si possible
            try {
                if (btnInteraction.deferred || btnInteraction.replied) {
                    await interaction.editReply({
                        embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)],
                        components: []
                    });
                } else {
                    await btnInteraction.update({
                        embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)],
                        components: []
                    });
                }
            } catch {
                // Ignorer les erreurs de réponse en cascade
            }
        }
    });

    // Gérer la sélection de modules via le StringSelectMenu
    const selectCollector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id,
        time: 300_000
    });

    selectCollector.on('collect', async selectInteraction => {
        try {
            if (selectInteraction.customId === 'wizard_modules_select') {
                const selectedModules = selectInteraction.values;

                // Construire la mise à jour : tous les modules à false, sauf ceux sélectionnés
                const modulesUpdate = {
                    'modules.logs': selectedModules.includes('logs'),
                    'modules.antiraid': selectedModules.includes('antiraid'),
                    'modules.automod': selectedModules.includes('automod'),
                    'modules.tickets': selectedModules.includes('tickets'),
                    'modules.levels': selectedModules.includes('levels'),
                    'modules.economy': selectedModules.includes('economy'),
                    'modules.music': selectedModules.includes('music'),
                    'modules.voiceTracking': selectedModules.includes('voiceTracking'),
                    'modules.giveaways': selectedModules.includes('giveaways'),
                    'modules.autoroles': selectedModules.includes('autoroles'),
                    'modules.suggestions': selectedModules.includes('suggestions')
                };

                await Guild.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { $set: modulesUpdate },
                    { upsert: true }
                );

                Logger.info(`Modules mis à jour sur ${interaction.guild.name}: ${selectedModules.join(', ') || 'aucun'}`);

                // Afficher le résultat
                const resultList = selectedModules.length > 0
                    ? selectedModules.map(m => `> ✅ **${m}**`).join('\n')
                    : '> Aucun module activé.';

                const resultEmbed = successEmbed(
                    `**${selectedModules.length} module(s)** ont été activés :\n\n${resultList}`,
                    '🧩 Modules mis à jour'
                );

                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('wizard_back')
                        .setLabel('Retour au wizard')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );

                await selectInteraction.update({ embeds: [resultEmbed], components: [backRow] });
            }

            if (selectInteraction.customId === 'wizard_permissions_select') {
                await handlePermissionsSelect(selectInteraction, interaction);
            }
        } catch (error) {
            Logger.error(`Erreur lors de la sélection de modules : ${error.message}`);
        }
    });

    // Expiration du collecteur principal
    collector.on('end', async (_, reason) => {
        if (reason === 'time') {
            try {
                await interaction.editReply({
                    embeds: [warningEmbed('L\'assistant de configuration a expiré. Relancez `/setup wizard` pour recommencer.')],
                    components: []
                });
            } catch {
                // L'interaction a peut-être déjà expiré
            }
        }
    });
}

/* ─── Sous-commande : status — Configurer le statut du bot via un modal ─── */
async function handleStatus(interaction) {
    await showStatusModal(interaction);
}

/* ─── Afficher le modal de configuration du statut ─── */
async function showStatusModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('setup_status_modal')
        .setTitle('🎮 Configurer le statut du bot');

    // Champ pour le type d'activité
    const typeInput = new TextInputBuilder()
        .setCustomId('status_type')
        .setLabel('Type d\'activité')
        .setPlaceholder('playing, watching, listening, competing')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(20)
        .setValue('watching');

    // Champ pour le texte du statut
    const textInput = new TextInputBuilder()
        .setCustomId('status_text')
        .setLabel('Texte du statut')
        .setPlaceholder('Ex: vos serveurs | /help')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(128)
        .setValue('vos serveurs');

    // Ajouter les champs au modal
    modal.addComponents(
        new ActionRowBuilder().addComponents(typeInput),
        new ActionRowBuilder().addComponents(textInput)
    );

    await interaction.showModal(modal);

    // Attendre la soumission du modal pendant 2 minutes
    try {
        const modalInteraction = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'setup_status_modal' && i.user.id === interaction.user.id,
            time: 120_000
        });

        const statusType = modalInteraction.fields.getTextInputValue('status_type').toLowerCase().trim();
        const statusText = modalInteraction.fields.getTextInputValue('status_text').trim();

        // Mapper les types d'activité Discord
        const activityTypes = {
            'playing': 0,     // Joue à...
            'streaming': 1,   // Streame...
            'listening': 2,   // Écoute...
            'watching': 3,    // Regarde...
            'competing': 5    // Participe à...
        };

        // Vérifier que le type est valide
        if (!(statusType in activityTypes)) {
            return modalInteraction.reply({
                embeds: [errorEmbed(
                    `Le type **${statusType}** n'est pas valide.\n\n` +
                    `Types disponibles : \`playing\`, \`watching\`, \`listening\`, \`competing\`, \`streaming\``
                )],
                ephemeral: true
            });
        }

        // Appliquer le statut au bot
        const { client } = interaction;
        client.user.setPresence({
            activities: [{
                name: statusText,
                type: activityTypes[statusType]
            }],
            status: 'online'
        });

        // Labels français pour l'affichage
        const typeLabels = {
            'playing': 'Joue à',
            'streaming': 'Streame',
            'listening': 'Écoute',
            'watching': 'Regarde',
            'competing': 'Participe à'
        };

        Logger.info(`Statut du bot mis à jour : ${typeLabels[statusType]} ${statusText}`);

        return modalInteraction.reply({
            embeds: [successEmbed(
                `Le statut du bot a été mis à jour avec succès !\n\n` +
                `**Type :** ${typeLabels[statusType]}\n` +
                `**Texte :** ${statusText}\n\n` +
                `Le bot affiche maintenant : *${typeLabels[statusType]} ${statusText}*`,
                '🎮 Statut mis à jour'
            )],
            ephemeral: true
        });

    } catch {
        // Le modal n'a pas été soumis dans le temps imparti — aucune action nécessaire
    }
}

/* ─── Sous-commande : permissions — Configurer les rôles administrateurs ─── */
async function handlePermissions(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await handlePermissionsDisplay(null, interaction);
}

/* ─── Afficher l'interface de sélection des rôles administrateurs ─── */
async function handlePermissionsDisplay(btnInteraction, originalInteraction) {
    const { guild } = originalInteraction;

    // Récupérer la configuration actuelle des permissions
    const guildData = await Guild.findOne({ guildId: guild.id });
    const currentAdminRole = guildData?.permissions?.adminRoleId;

    // Récupérer les rôles du serveur (filtrer @everyone et les rôles de bots)
    const roles = guild.roles.cache
        .filter(r => !r.managed && r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first(25); // Limite de 25 options pour un select menu

    if (roles.length === 0) {
        const noRolesEmbed = errorEmbed('Aucun rôle configurable trouvé sur ce serveur.');

        if (btnInteraction) {
            return btnInteraction.update({ embeds: [noRolesEmbed], components: [] });
        }
        return originalInteraction.editReply({ embeds: [noRolesEmbed], components: [] });
    }

    const permEmbed = createEmbed({
        title: '🔐 Configuration des permissions',
        description:
            'Sélectionnez le(s) rôle(s) qui auront les permissions **administrateur du bot** dans le menu ci-dessous.\n\n' +
            `**Rôle admin actuel :** ${currentAdminRole ? `<@&${currentAdminRole}>` : 'Aucun'}\n\n` +
            '> Les membres ayant ce rôle pourront utiliser les commandes de configuration du bot.',
        color: 'info',
        footer: { text: 'Permissions • Sélectionnez un ou plusieurs rôles' }
    });

    // Construire les options du menu de sélection
    const roleOptions = roles.map(role => ({
        label: role.name,
        value: role.id,
        description: `${role.members.size} membre(s) • Position: ${role.position}`,
        default: role.id === currentAdminRole
    }));

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('wizard_permissions_select')
            .setPlaceholder('Sélectionnez les rôles administrateurs...')
            .setMinValues(1)
            .setMaxValues(Math.min(roleOptions.length, 5))
            .addOptions(roleOptions)
    );

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('wizard_back')
            .setLabel('Retour')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('◀️')
    );

    // Afficher via update (wizard) ou editReply (commande directe)
    if (btnInteraction) {
        await btnInteraction.update({ embeds: [permEmbed], components: [selectRow, backRow] });
    } else {
        await originalInteraction.editReply({ embeds: [permEmbed], components: [selectRow, backRow] });
    }
}

/* ─── Gérer la sélection des rôles administrateurs ─── */
async function handlePermissionsSelect(selectInteraction, originalInteraction) {
    const selectedRoles = selectInteraction.values;

    // Sauvegarder le premier rôle sélectionné comme rôle admin principal
    // et tous les rôles sélectionnés dans la liste des utilisateurs admin
    await Guild.findOneAndUpdate(
        { guildId: originalInteraction.guild.id },
        {
            $set: {
                'permissions.adminRoleId': selectedRoles[0],
                'permissions.adminUsers': []
            }
        },
        { upsert: true }
    );

    const rolesMentions = selectedRoles.map(id => `> <@&${id}>`).join('\n');

    Logger.info(`Rôles admin mis à jour sur ${originalInteraction.guild.name}: ${selectedRoles.join(', ')}`);

    const resultEmbed = successEmbed(
        `Les rôles administrateurs du bot ont été mis à jour :\n\n${rolesMentions}\n\n` +
        'Les membres ayant ces rôles pourront utiliser les commandes de configuration.',
        '🔐 Permissions mises à jour'
    );

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('wizard_back')
            .setLabel('Retour au wizard')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('◀️')
    );

    await selectInteraction.update({ embeds: [resultEmbed], components: [backRow] });
}

/* ─── Fonction principale : router vers la bonne sous-commande ─── */
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'logs':
            return handleLogs(interaction);
        case 'wizard':
            return handleWizard(interaction);
        case 'status':
            return handleStatus(interaction);
        case 'permissions':
            return handlePermissions(interaction);
        default:
            return interaction.reply({
                embeds: [errorEmbed('Sous-commande inconnue.')],
                ephemeral: true
            });
    }
}

module.exports = { data, execute, module: 'logs', adminOnly: true };
