// Commande de configuration générale - Permet de voir, modifier et réinitialiser les paramètres du bot
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, createEmbed, infoEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

/* ─── Liste des modules configurables et leurs clés modifiables ─── */
const MODULE_KEYS = {
    moderation: ['enabled'],
    logs: ['enabled', 'moderation', 'memberJoinLeave', 'messageDelete', 'messageEdit', 'roleUpdate', 'channelUpdate', 'voice', 'antiraid', 'automod', 'tickets', 'server'],
    antiraid: ['enabled', 'joinThreshold', 'joinTimeWindow', 'adminActionThreshold'],
    automod: ['antiSpam', 'antiLinks', 'antiMention', 'antiCaps', 'antiFlood'],
    tickets: ['categoryId', 'logChannelId', 'transcriptChannelId'],
    levels: ['enabled', 'xpPerMessage', 'xpCooldown', 'levelUpChannelId'],
    economy: ['enabled', 'currencyName', 'currencySymbol', 'dailyAmount', 'weeklyAmount'],
    suggestions: ['channelId'],
    autoroles: ['joinRoles'],
    voiceTracking: ['enabled'],
    stats: ['enabled'],
    backup: ['enabled'],
    music: ['enabled'],
    giveaways: ['enabled']
};

/* ─── Noms affichables des modules ─── */
const MODULE_NAMES = {
    moderation: '🔨 Modération',
    logs: '📋 Logs',
    antiraid: '⚠️ Anti-Raid',
    automod: '🤖 Auto-Modération',
    tickets: '🎫 Tickets',
    levels: '⭐ Niveaux',
    economy: '💰 Économie',
    suggestions: '💡 Suggestions',
    autoroles: '🎭 Auto-Rôles',
    voiceTracking: '🔊 Suivi Vocal',
    stats: '📊 Statistiques',
    backup: '💾 Backups',
    music: '🎵 Musique',
    giveaways: '🎉 Giveaways'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configurer le bot')
        /* ─── Sous-commande : voir la configuration d'un module ─── */
        .addSubcommand(sub =>
            sub
                .setName('view')
                .setDescription('Voir la configuration d\'un module')
                .addStringOption(option =>
                    option
                        .setName('module')
                        .setDescription('Le module à afficher')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(MODULE_NAMES).map(key => ({
                                name: MODULE_NAMES[key],
                                value: key
                            }))
                        )
                )
        )
        /* ─── Sous-commande : modifier un paramètre ─── */
        .addSubcommand(sub =>
            sub
                .setName('set')
                .setDescription('Modifier un paramètre de configuration')
                .addStringOption(option =>
                    option
                        .setName('module')
                        .setDescription('Le module à modifier')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(MODULE_NAMES).map(key => ({
                                name: MODULE_NAMES[key],
                                value: key
                            }))
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('key')
                        .setDescription('La clé du paramètre à modifier')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('value')
                        .setDescription('La nouvelle valeur du paramètre')
                        .setRequired(true)
                )
        )
        /* ─── Sous-commande : réinitialiser un module ─── */
        .addSubcommand(sub =>
            sub
                .setName('reset')
                .setDescription('Réinitialiser un module aux valeurs par défaut')
                .addStringOption(option =>
                    option
                        .setName('module')
                        .setDescription('Le module à réinitialiser')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(MODULE_NAMES).map(key => ({
                                name: MODULE_NAMES[key],
                                value: key
                            }))
                        )
                )
        )
        /* ─── Sous-commande : recharger la config depuis la base de données ─── */
        .addSubcommand(sub =>
            sub
                .setName('reload')
                .setDescription('Recharger la configuration depuis la base de données')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: null,
    adminOnly: true,

    async execute(interaction) {
        const { guild } = interaction;
        const subcommand = interaction.options.getSubcommand();

        // Récupérer ou créer la configuration du serveur en base de données
        let guildSettings = await Guild.findOne({ guildId: guild.id });
        if (!guildSettings) {
            guildSettings = await Guild.create({ guildId: guild.id });
        }

        switch (subcommand) {
            case 'view':
                return await handleView(interaction, guildSettings);
            case 'set':
                return await handleSet(interaction, guildSettings);
            case 'reset':
                return await handleReset(interaction, guildSettings);
            case 'reload':
                return await handleReload(interaction, guildSettings);
            default:
                return interaction.reply({
                    embeds: [errorEmbed('Sous-commande inconnue.')],
                    ephemeral: true
                });
        }
    }
};

/**
 * Affiche la configuration actuelle d'un module sous forme d'embed.
 * Parcourt les clés du module et affiche leurs valeurs actuelles.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleView(interaction, guildSettings) {
    const moduleName = interaction.options.getString('module');
    const displayName = MODULE_NAMES[moduleName] || moduleName;

    // Vérifier que le module existe dans la configuration
    const moduleData = guildSettings[moduleName] || guildSettings.modules?.[moduleName];
    const isEnabled = guildSettings.modules?.[moduleName];

    // Construire les champs de l'embed avec les paramètres du module
    const fields = [];

    // Afficher l'état d'activation du module
    fields.push({
        name: '📌 Statut',
        value: isEnabled ? '✅ Activé' : '❌ Désactivé',
        inline: true
    });

    // Récupérer les données spécifiques au module
    if (typeof moduleData === 'object' && moduleData !== null) {
        const entries = Object.entries(moduleData.toObject ? moduleData.toObject() : moduleData);
        for (const [key, value] of entries) {
            // Ignorer les clés internes de Mongoose
            if (key.startsWith('_') || key === '$__') continue;

            // Formater la valeur pour l'affichage
            let displayValue;
            if (typeof value === 'object' && value !== null) {
                // Pour les objets imbriqués (ex: sous-configurations de logs)
                if (value.channelId) {
                    displayValue = `Salon: <#${value.channelId}>\nActivé: ${value.enabled ? '✅' : '❌'}`;
                } else {
                    displayValue = `\`${JSON.stringify(value, null, 2).substring(0, 200)}\``;
                }
            } else if (typeof value === 'boolean') {
                displayValue = value ? '✅ Oui' : '❌ Non';
            } else {
                displayValue = `\`${value}\``;
            }

            fields.push({
                name: `\`${key}\``,
                value: String(displayValue || '*Non défini*'),
                inline: true
            });
        }
    }

    const embed = createEmbed({
        title: `⚙️ Configuration — ${displayName}`,
        description: `Paramètres actuels du module **${displayName}** sur ce serveur.`,
        color: 'info',
        fields,
        footer: { text: 'Utilisez /config set pour modifier un paramètre' }
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Modifie un paramètre de configuration pour un module donné.
 * Valide la clé et convertit la valeur au bon type avant la mise à jour.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleSet(interaction, guildSettings) {
    const moduleName = interaction.options.getString('module');
    const key = interaction.options.getString('key');
    const value = interaction.options.getString('value');
    const displayName = MODULE_NAMES[moduleName] || moduleName;

    // Vérifier que la clé est valide pour ce module
    const validKeys = MODULE_KEYS[moduleName];
    if (!validKeys) {
        return interaction.reply({
            embeds: [errorEmbed(`Le module \`${moduleName}\` n'est pas configurable.`)],
            ephemeral: true
        });
    }

    // Vérification spéciale : la clé "enabled" modifie modules.[moduleName]
    if (key === 'enabled') {
        const boolValue = parseBooleanValue(value);
        if (boolValue === null) {
            return interaction.reply({
                embeds: [errorEmbed('Valeur invalide. Utilisez `true`, `false`, `on`, `off`, `oui` ou `non`.')],
                ephemeral: true
            });
        }

        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: { [`modules.${moduleName}`]: boolValue } },
            { upsert: true }
        );

        Logger.info(`Module ${moduleName} ${boolValue ? 'activé' : 'désactivé'} sur ${interaction.guild.name}`);

        return interaction.reply({
            embeds: [successEmbed(
                `Le module **${displayName}** a été **${boolValue ? 'activé' : 'désactivé'}**.`
            )],
            ephemeral: true
        });
    }

    // Vérifier que la clé fait partie des clés autorisées
    if (!validKeys.includes(key)) {
        return interaction.reply({
            embeds: [errorEmbed(
                `La clé \`${key}\` n'est pas valide pour le module \`${moduleName}\`.\n\n` +
                `**Clés disponibles :** ${validKeys.map(k => `\`${k}\``).join(', ')}`
            )],
            ephemeral: true
        });
    }

    // Convertir la valeur au bon type selon le contexte
    const convertedValue = convertValue(value);

    // Construire le chemin de mise à jour dans le document MongoDB
    const updatePath = `${moduleName}.${key}`;

    try {
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: { [updatePath]: convertedValue } },
            { upsert: true }
        );

        Logger.info(`Config mise à jour : ${updatePath} = ${convertedValue} sur ${interaction.guild.name}`);

        return interaction.reply({
            embeds: [successEmbed(
                `Le paramètre \`${key}\` du module **${displayName}** a été mis à jour.\n\n` +
                `**Nouvelle valeur :** \`${convertedValue}\``
            )],
            ephemeral: true
        });

    } catch (error) {
        Logger.error(`Erreur lors de la mise à jour de la config : ${error.message}`);
        return interaction.reply({
            embeds: [errorEmbed(`Une erreur est survenue lors de la mise à jour : ${error.message}`)],
            ephemeral: true
        });
    }
}

/**
 * Réinitialise un module aux valeurs par défaut en supprimant sa configuration.
 * Le module retrouvera les valeurs définies dans le schéma Mongoose.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleReset(interaction, guildSettings) {
    const moduleName = interaction.options.getString('module');
    const displayName = MODULE_NAMES[moduleName] || moduleName;

    try {
        // Supprimer la configuration du module pour revenir aux valeurs par défaut
        await Guild.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $unset: { [moduleName]: '' } },
            { upsert: true }
        );

        Logger.info(`Configuration du module ${moduleName} réinitialisée sur ${interaction.guild.name}`);

        return interaction.reply({
            embeds: [successEmbed(
                `Le module **${displayName}** a été réinitialisé aux valeurs par défaut.\n\n` +
                `Utilisez \`/config view ${moduleName}\` pour voir les paramètres actuels.`
            )],
            ephemeral: true
        });

    } catch (error) {
        Logger.error(`Erreur lors de la réinitialisation du module ${moduleName}: ${error.message}`);
        return interaction.reply({
            embeds: [errorEmbed(`Une erreur est survenue lors de la réinitialisation : ${error.message}`)],
            ephemeral: true
        });
    }
}

/**
 * Recharge la configuration depuis la base de données.
 * Utile après une modification manuelle directement en base.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildSettings - Document de configuration du serveur
 */
async function handleReload(interaction, guildSettings) {
    try {
        // Forcer la relecture depuis MongoDB en ignorant le cache Mongoose
        const freshSettings = await Guild.findOne({ guildId: interaction.guild.id }).lean();

        if (!freshSettings) {
            return interaction.reply({
                embeds: [errorEmbed('Aucune configuration trouvée pour ce serveur. Utilisez `/config set` pour en créer une.')],
                ephemeral: true
            });
        }

        Logger.info(`Configuration rechargée depuis la base de données pour ${interaction.guild.name}`);

        // Lister les modules activés pour confirmation
        const enabledModules = Object.entries(freshSettings.modules || {})
            .filter(([, enabled]) => enabled)
            .map(([name]) => MODULE_NAMES[name] || name);

        return interaction.reply({
            embeds: [successEmbed(
                `La configuration a été rechargée depuis la base de données.\n\n` +
                `**Modules activés :** ${enabledModules.length > 0 ? enabledModules.join(', ') : '*Aucun*'}\n` +
                `**Langue :** \`${freshSettings.language || 'fr'}\``
            )],
            ephemeral: true
        });

    } catch (error) {
        Logger.error(`Erreur lors du rechargement de la config : ${error.message}`);
        return interaction.reply({
            embeds: [errorEmbed(`Une erreur est survenue lors du rechargement : ${error.message}`)],
            ephemeral: true
        });
    }
}

/**
 * Convertit une chaîne en booléen si applicable.
 * Accepte : true, false, on, off, oui, non, 1, 0
 *
 * @param {string} value - La valeur textuelle à convertir
 * @returns {boolean|null} Le booléen correspondant ou null si non reconnu
 */
function parseBooleanValue(value) {
    const truthy = ['true', 'on', 'oui', '1', 'yes', 'activer'];
    const falsy = ['false', 'off', 'non', '0', 'no', 'désactiver'];

    const lower = value.toLowerCase().trim();
    if (truthy.includes(lower)) return true;
    if (falsy.includes(lower)) return false;
    return null;
}

/**
 * Convertit une valeur textuelle au type approprié.
 * Détecte automatiquement les booléens, nombres et chaînes.
 *
 * @param {string} value - La valeur brute saisie par l'utilisateur
 * @returns {boolean|number|string} La valeur convertie au bon type
 */
function convertValue(value) {
    // Tester si c'est un booléen
    const boolValue = parseBooleanValue(value);
    if (boolValue !== null) return boolValue;

    // Tester si c'est un nombre
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== '') return numValue;

    // Sinon, retourner la chaîne telle quelle
    return value;
}
