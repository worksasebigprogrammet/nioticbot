// Commande pour consulter les logs administratifs et générer des rapports
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, errorEmbed, infoEmbed } = require('../../utils/embed');
const AdminAction = require('../../../database/models/adminAction');
const Logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
    .setName('adminlogs')
    .setDescription('Consulter les logs administratifs et générer des rapports')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub.setName('recent')
            .setDescription('Afficher les 20 dernières actions administratives')
            .addUserOption(opt =>
                opt.setName('admin')
                    .setDescription('Filtrer par administrateur')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('report')
            .setDescription('Générer un rapport d\'activité administrative')
            .addStringOption(opt =>
                opt.setName('period')
                    .setDescription('Période du rapport')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Dernières 24h', value: '24h' },
                        { name: 'Derniers 7 jours', value: '7d' },
                        { name: 'Derniers 30 jours', value: '30d' },
                        { name: 'Ce mois-ci', value: 'month' }
                    )
            )
            .addUserOption(opt =>
                opt.setName('admin')
                    .setDescription('Filtrer par administrateur')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('search')
            .setDescription('Rechercher des actions par type')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Type d\'action à rechercher')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Ban', value: 'BAN' },
                        { name: 'Kick', value: 'KICK' },
                        { name: 'Mute', value: 'MUTE' },
                        { name: 'Warn', value: 'WARN' },
                        { name: 'Changement de config', value: 'CONFIG_CHANGE' },
                        { name: 'Déclenchement antiraid', value: 'ANTIRAID_TRIGGER' }
                    )
            )
            .addUserOption(opt =>
                opt.setName('admin')
                    .setDescription('Filtrer par administrateur')
                    .setRequired(false)
            )
    );

async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'recent':
                await handleRecent(interaction);
                break;
            case 'report':
                await handleReport(interaction);
                break;
            case 'search':
                await handleSearch(interaction);
                break;
        }
    } catch (error) {
        Logger.error('Erreur commande adminlogs:', error);
        const reply = { embeds: [errorEmbed('Une erreur est survenue lors de l\'exécution de la commande.')], ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(reply);
        } else {
            await interaction.reply(reply);
        }
    }
}

// Sous-commande : afficher les actions récentes
async function handleRecent(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const adminUser = interaction.options.getUser('admin');
    const query = { guildId: interaction.guild.id };
    if (adminUser) query.adminId = adminUser.id;

    const actions = await AdminAction.find(query)
        .sort({ timestamp: -1 })
        .limit(20);

    if (actions.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('Aucune action administrative trouvée.')]
        });
    }

    // Construire la liste des actions
    const lines = actions.map(a => {
        const time = `<t:${Math.floor(a.timestamp.getTime() / 1000)}:R>`;
        const target = a.targetTag ? ` → ${a.targetTag}` : '';
        return `\`${a.action}\` par **${a.adminTag}**${target} ${time}`;
    });

    const title = adminUser
        ? `📋 Actions récentes de ${adminUser.tag}`
        : '📋 Actions administratives récentes';

    const embed = createEmbed()
        .setTitle(title)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${actions.length} action(s) affichée(s)` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

// Sous-commande : générer un rapport
async function handleReport(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const period = interaction.options.getString('period');
    const adminUser = interaction.options.getUser('admin');

    // Calculer les dates de début et de fin selon la période
    const now = new Date();
    let startDate;

    switch (period) {
        case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        default:
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Construire la requête
    const query = { guildId: interaction.guild.id, timestamp: { $gte: startDate, $lte: now } };
    if (adminUser) query.adminId = adminUser.id;

    const actions = await AdminAction.find(query).sort({ timestamp: -1 });

    if (actions.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('Aucune action administrative trouvée pour cette période.')]
        });
    }

    // Calculer les statistiques par type d'action
    const statsByAction = {};
    const statsByAdmin = {};

    for (const action of actions) {
        statsByAction[action.action] = (statsByAction[action.action] || 0) + 1;
        statsByAdmin[action.adminTag] = (statsByAdmin[action.adminTag] || 0) + 1;
    }

    // Formater les statistiques par type d'action
    const actionLines = Object.entries(statsByAction)
        .sort(([, a], [, b]) => b - a)
        .map(([action, count]) => `\`${action}\` : **${count}**`)
        .join('\n');

    // Formater les statistiques par administrateur
    const adminLines = Object.entries(statsByAdmin)
        .sort(([, a], [, b]) => b - a)
        .map(([admin, count]) => `**${admin}** : ${count} action(s)`)
        .join('\n');

    // Libellé de la période
    const periodLabels = { '24h': 'Dernières 24 heures', '7d': 'Derniers 7 jours', '30d': 'Derniers 30 jours', 'month': 'Ce mois-ci' };
    const periodLabel = periodLabels[period] || period;

    const embed = createEmbed()
        .setTitle(`📊 Rapport administratif — ${periodLabel}`)
        .addFields(
            { name: '📈 Total d\'actions', value: `**${actions.length}**`, inline: true },
            { name: '📅 Période', value: `<t:${Math.floor(startDate.getTime() / 1000)}:d> → <t:${Math.floor(now.getTime() / 1000)}:d>`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '🔧 Par type d\'action', value: actionLines || 'Aucune', inline: true },
            { name: '👤 Par administrateur', value: adminLines || 'Aucun', inline: true }
        )
        .setTimestamp();

    if (adminUser) {
        embed.setFooter({ text: `Filtré pour ${adminUser.tag}` });
    }

    await interaction.editReply({ embeds: [embed] });
}

// Sous-commande : rechercher par type d'action
async function handleSearch(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const actionType = interaction.options.getString('action');
    const adminUser = interaction.options.getUser('admin');

    const query = { guildId: interaction.guild.id, action: actionType };
    if (adminUser) query.adminId = adminUser.id;

    const actions = await AdminAction.find(query)
        .sort({ timestamp: -1 })
        .limit(20);

    if (actions.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed(`Aucune action de type \`${actionType}\` trouvée.`)]
        });
    }

    // Construire la liste des résultats
    const lines = actions.map(a => {
        const time = `<t:${Math.floor(a.timestamp.getTime() / 1000)}:R>`;
        const target = a.targetTag ? ` → **${a.targetTag}**` : '';
        const reason = a.details?.reason ? ` — _${a.details.reason}_` : '';
        return `Par **${a.adminTag}**${target}${reason} ${time}`;
    });

    const title = adminUser
        ? `🔍 Recherche \`${actionType}\` — ${adminUser.tag}`
        : `🔍 Recherche : \`${actionType}\``;

    const embed = createEmbed()
        .setTitle(title)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${actions.length} résultat(s) trouvé(s)` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute, module: null, adminOnly: true };
