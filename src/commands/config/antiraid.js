// Commande de gestion de l'anti-raid - Active, désactive et configure le système de protection anti-raid
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, createEmbed, warningEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('Gérer le système anti-raid')
        /* ─── Sous-commande : activer l'anti-raid manuellement ─── */
        .addSubcommand(sub =>
            sub
                .setName('on')
                .setDescription('Activer le mode anti-raid manuellement')
        )
        /* ─── Sous-commande : désactiver l'anti-raid ─── */
        .addSubcommand(sub =>
            sub
                .setName('off')
                .setDescription('Désactiver le mode anti-raid')
        )
        /* ─── Sous-commande : configurer les paramètres de l'anti-raid ─── */
        .addSubcommand(sub =>
            sub
                .setName('config')
                .setDescription('Configurer les paramètres de l\'anti-raid')
                .addIntegerOption(option =>
                    option
                        .setName('join_threshold')
                        .setDescription('Nombre d\'arrivées pour déclencher l\'alerte')
                        .setMinValue(3)
                        .setMaxValue(50)
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('time_window')
                        .setDescription('Fenêtre de temps en secondes pour compter les arrivées')
                        .setMinValue(5)
                        .setMaxValue(120)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Action à effectuer lors d\'un raid détecté')
                        .setRequired(false)
                        .addChoices(
                            { name: '🔒 Vérification uniquement', value: 'verification' },
                            { name: '👢 Expulser les comptes récents', value: 'kick_new' },
                            { name: '🔨 Bannir automatiquement', value: 'auto_ban' },
                            { name: '🔐 Verrouiller le serveur', value: 'lockdown' }
                        )
                )
        )
        /* ─── Sous-commande : afficher le statut actuel de l'anti-raid ─── */
        .addSubcommand(sub =>
            sub
                .setName('status')
                .setDescription('Voir le statut actuel du système anti-raid')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: 'antiraid',
    adminOnly: true,

    async execute(interaction) {
        const { guild, client } = interaction;
        const subcommand = interaction.options.getSubcommand();

        // Récupérer la configuration actuelle du serveur
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
                return await handleConfig(interaction, guildSettings);
            case 'status':
                return await handleStatus(interaction, guildSettings, client);
            default:
                return interaction.reply({
                    embeds: [errorEmbed('Sous-commande inconnue.')],
                    ephemeral: true
                });
        }
    }
};

/**
 * Active manuellement le mode anti-raid sur le serveur.
 * Interagit avec le système anti-raid du client pour déclencher le mode défensif.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Configuration du serveur
 * @param {import('discord.js').Client} client - Instance du client Discord
 */
async function handleOn(interaction, guildSettings, client) {
    try {
        // Activer le module anti-raid dans la base de données
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            {
                $set: {
                    'modules.antiraid': true,
                    'antiraid.enabled': true
                }
            },
            { upsert: true }
        );

        // Notifier le système anti-raid si disponible
        if (client.systems?.antiraid) {
            await client.systems.antiraid.activate(interaction.guild.id);
        }

        Logger.info(`Anti-raid activé manuellement sur ${interaction.guild.name} par ${interaction.user.tag}`);

        return interaction.reply({
            embeds: [warningEmbed(
                `Le mode **anti-raid** a été **activé** manuellement.\n\n` +
                `🛡️ Les protections suivantes sont maintenant actives :\n` +
                `> • Surveillance renforcée des arrivées\n` +
                `> • Détection des actions suspectes\n` +
                `> • Notifications automatiques aux administrateurs\n\n` +
                `Utilisez \`/antiraid off\` pour désactiver le mode anti-raid.`,
                '🛡️ Anti-Raid Activé'
            )],
            ephemeral: false
        });

    } catch (error) {
        Logger.error(`Erreur lors de l'activation de l'anti-raid : ${error.message}`);
        return interaction.reply({
            embeds: [errorEmbed(`Une erreur est survenue lors de l'activation de l'anti-raid : ${error.message}`)],
            ephemeral: true
        });
    }
}

/**
 * Désactive le mode anti-raid sur le serveur.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Configuration du serveur
 * @param {import('discord.js').Client} client - Instance du client Discord
 */
async function handleOff(interaction, guildSettings, client) {
    try {
        // Désactiver l'anti-raid dans la base de données
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: { 'antiraid.enabled': false } },
            { upsert: true }
        );

        // Notifier le système anti-raid si disponible
        if (client.systems?.antiraid) {
            await client.systems.antiraid.deactivate(interaction.guild.id);
        }

        Logger.info(`Anti-raid désactivé sur ${interaction.guild.name} par ${interaction.user.tag}`);

        return interaction.reply({
            embeds: [successEmbed(
                `Le mode **anti-raid** a été **désactivé**.\n\n` +
                `Les protections automatiques ne sont plus actives. ` +
                `Le système peut toujours se réactiver automatiquement en cas de raid détecté ` +
                `si le module anti-raid reste activé.`
            )],
            ephemeral: false
        });

    } catch (error) {
        Logger.error(`Erreur lors de la désactivation de l'anti-raid : ${error.message}`);
        return interaction.reply({
            embeds: [errorEmbed(`Une erreur est survenue lors de la désactivation : ${error.message}`)],
            ephemeral: true
        });
    }
}

/**
 * Configure les paramètres du système anti-raid.
 * Permet de modifier le seuil de joins, la fenêtre de temps et les actions.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Configuration du serveur
 */
async function handleConfig(interaction, guildSettings) {
    const joinThreshold = interaction.options.getInteger('join_threshold');
    const timeWindow = interaction.options.getInteger('time_window');
    const action = interaction.options.getString('action');

    // Si aucun paramètre n'est fourni, afficher la configuration actuelle
    if (!joinThreshold && !timeWindow && !action) {
        const config = guildSettings.antiraid || {};
        const actions = config.actions || {};

        const embed = createEmbed({
            title: '⚙️ Configuration Anti-Raid',
            description: 'Paramètres actuels du système anti-raid.',
            color: 'info',
            fields: [
                {
                    name: '📊 Seuils de détection',
                    value:
                        `> **Seuil d'arrivées :** \`${config.joinThreshold || 10}\` membres\n` +
                        `> **Fenêtre de temps :** \`${config.joinTimeWindow || 10}\` secondes\n` +
                        `> **Seuil actions admin :** \`${config.adminActionThreshold || 5}\``,
                    inline: false
                },
                {
                    name: '🔧 Actions configurées',
                    value:
                        `> Vérification : ${actions.enableVerification !== false ? '✅' : '❌'}\n` +
                        `> Kick comptes récents : ${actions.kickNewAccounts ? '✅' : '❌'}\n` +
                        `> Ban automatique : ${actions.autoBan ? '✅' : '❌'}\n` +
                        `> Verrouillage : ${actions.lockdown ? '✅' : '❌'}\n` +
                        `> Notification admins : ${actions.notifyAdmins !== false ? '✅' : '❌'}`,
                    inline: false
                },
                {
                    name: '📅 Âge minimum de compte',
                    value: `> \`${actions.minAccountAge || 7}\` jours`,
                    inline: true
                }
            ],
            footer: { text: 'Utilisez /antiraid config [options] pour modifier' }
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Construire l'objet de mise à jour avec les paramètres fournis
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

    // Configurer les actions selon le choix de l'utilisateur
    if (action) {
        switch (action) {
            case 'verification':
                updateFields['antiraid.actions.enableVerification'] = true;
                updateFields['antiraid.actions.kickNewAccounts'] = false;
                updateFields['antiraid.actions.autoBan'] = false;
                updateFields['antiraid.actions.lockdown'] = false;
                changes.push('**Action :** Vérification uniquement');
                break;
            case 'kick_new':
                updateFields['antiraid.actions.enableVerification'] = true;
                updateFields['antiraid.actions.kickNewAccounts'] = true;
                updateFields['antiraid.actions.autoBan'] = false;
                updateFields['antiraid.actions.lockdown'] = false;
                changes.push('**Action :** Expulser les comptes récents');
                break;
            case 'auto_ban':
                updateFields['antiraid.actions.enableVerification'] = true;
                updateFields['antiraid.actions.kickNewAccounts'] = true;
                updateFields['antiraid.actions.autoBan'] = true;
                updateFields['antiraid.actions.lockdown'] = false;
                changes.push('**Action :** Bannir automatiquement');
                break;
            case 'lockdown':
                updateFields['antiraid.actions.enableVerification'] = true;
                updateFields['antiraid.actions.kickNewAccounts'] = true;
                updateFields['antiraid.actions.autoBan'] = true;
                updateFields['antiraid.actions.lockdown'] = true;
                changes.push('**Action :** Verrouillage du serveur');
                break;
        }
    }

    try {
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: updateFields },
            { upsert: true }
        );

        Logger.info(`Configuration anti-raid mise à jour sur ${interaction.guild.name} par ${interaction.user.tag}`);

        return interaction.reply({
            embeds: [successEmbed(
                `La configuration de l'anti-raid a été mise à jour :\n\n` +
                changes.map(c => `> ${c}`).join('\n')
            )],
            ephemeral: true
        });

    } catch (error) {
        Logger.error(`Erreur lors de la configuration de l'anti-raid : ${error.message}`);
        return interaction.reply({
            embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)],
            ephemeral: true
        });
    }
}

/**
 * Affiche le statut actuel du système anti-raid.
 * Montre si le mode est actif, les statistiques récentes et la configuration.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Configuration du serveur
 * @param {import('discord.js').Client} client - Instance du client Discord
 */
async function handleStatus(interaction, guildSettings, client) {
    const antiraidConfig = guildSettings.antiraid || {};
    const isModuleEnabled = guildSettings.modules?.antiraid || false;
    const isActive = antiraidConfig.enabled || false;

    // Récupérer les données en temps réel du système anti-raid si disponible
    let realtimeData = null;
    if (client.systems?.antiraid) {
        realtimeData = await client.systems.antiraid.getStatus(interaction.guild.id).catch(() => null);
    }

    // Déterminer le niveau d'alerte actuel
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
        alertColor = 'log';
    }

    const embed = createEmbed({
        title: '🛡️ Statut Anti-Raid',
        description: `État actuel du système de protection anti-raid.`,
        color: alertColor,
        fields: [
            {
                name: '📌 État du module',
                value: isModuleEnabled ? '✅ Module activé' : '❌ Module désactivé',
                inline: true
            },
            {
                name: '🔰 Mode anti-raid',
                value: isActive ? '✅ Actif' : '❌ Inactif',
                inline: true
            },
            {
                name: '🚨 Niveau d\'alerte',
                value: alertLevel,
                inline: true
            },
            {
                name: '📊 Configuration',
                value:
                    `> Seuil : \`${antiraidConfig.joinThreshold || 10}\` joins / \`${antiraidConfig.joinTimeWindow || 10}\`s\n` +
                    `> Seuil admin : \`${antiraidConfig.adminActionThreshold || 5}\` actions`,
                inline: false
            },
            {
                name: '📈 Données temps réel',
                value: realtimeData
                    ? `> Arrivées récentes : \`${realtimeData.recentJoins || 0}\`\n` +
                      `> Actions suspectes : \`${realtimeData.suspiciousActions || 0}\`\n` +
                      `> Raids détectés : \`${realtimeData.totalRaids || 0}\``
                    : '> *Données non disponibles (système non initialisé)*',
                inline: false
            }
        ],
        footer: { text: 'Dernière vérification' }
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}
