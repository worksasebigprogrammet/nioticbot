// Commande de statistiques - Affiche les statistiques du serveur, des membres et de la modération
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, createEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Case = require('../../../database/models/case');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Voir les statistiques')
        /* ─── Sous-commande : statistiques du serveur ─── */
        .addSubcommand(sub =>
            sub
                .setName('server')
                .setDescription('Voir les statistiques du serveur')
        )
        /* ─── Sous-commande : statistiques d'un membre ─── */
        .addSubcommand(sub =>
            sub
                .setName('member')
                .setDescription('Voir les statistiques d\'un membre')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Le membre dont voir les statistiques')
                        .setRequired(false)
                )
        )
        /* ─── Sous-commande : statistiques de modération (admin uniquement) ─── */
        .addSubcommand(sub =>
            sub
                .setName('moderation')
                .setDescription('Voir les statistiques de modération')
        ),

    module: 'stats',
    adminOnly: false,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'server':
                return await handleServerStats(interaction);
            case 'member':
                return await handleMemberStats(interaction);
            case 'moderation':
                return await handleModerationStats(interaction);
            default:
                return interaction.reply({
                    embeds: [errorEmbed('Sous-commande inconnue.')],
                    ephemeral: true
                });
        }
    }
};

/**
 * Affiche les statistiques globales du serveur.
 * Inclut le nombre de membres, les messages récents et les nouvelles arrivées.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleServerStats(interaction) {
    const { guild } = interaction;
    await interaction.deferReply();

    try {
        // Récupérer les membres du serveur depuis le cache Discord
        const members = await guild.members.fetch();
        const totalMembers = members.size;
        const onlineMembers = members.filter(m => m.presence?.status !== 'offline' && m.presence !== null).size;
        const botMembers = members.filter(m => m.user.bot).size;
        const humanMembers = totalMembers - botMembers;

        // Calculer les dates de référence pour les périodes de statistiques
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Compter les messages des utilisateurs sur différentes périodes
        const allUsers = await User.find({ guildId: guild.id }).lean();
        const totalMessages = allUsers.reduce((sum, u) => sum + (u.messageCount || 0), 0);

        // Compter les nouveaux membres sur les différentes périodes
        const newMembers24h = members.filter(m => m.joinedAt && m.joinedAt > last24h).size;
        const newMembers7d = members.filter(m => m.joinedAt && m.joinedAt > last7d).size;
        const newMembers30d = members.filter(m => m.joinedAt && m.joinedAt > last30d).size;

        // Compter les salons par type
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const categories = guild.channels.cache.filter(c => c.type === 4).size;
        const totalRoles = guild.roles.cache.size - 1; // Exclure @everyone

        const embed = createEmbed({
            title: `📊 Statistiques de ${guild.name}`,
            thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
            color: 'info',
            fields: [
                {
                    name: '👥 Membres',
                    value:
                        `> **Total :** \`${totalMembers}\`\n` +
                        `> **En ligne :** \`${onlineMembers}\`\n` +
                        `> **Humains :** \`${humanMembers}\`\n` +
                        `> **Bots :** \`${botMembers}\``,
                    inline: true
                },
                {
                    name: '💬 Messages',
                    value:
                        `> **Total enregistré :** \`${totalMessages.toLocaleString('fr-FR')}\`\n` +
                        `> *Basé sur les données\ndu suivi de messages*`,
                    inline: true
                },
                {
                    name: '📥 Nouveaux membres',
                    value:
                        `> **24h :** \`+${newMembers24h}\`\n` +
                        `> **7 jours :** \`+${newMembers7d}\`\n` +
                        `> **30 jours :** \`+${newMembers30d}\``,
                    inline: true
                },
                {
                    name: '📁 Salons',
                    value:
                        `> **Textuels :** \`${textChannels}\`\n` +
                        `> **Vocaux :** \`${voiceChannels}\`\n` +
                        `> **Catégories :** \`${categories}\``,
                    inline: true
                },
                {
                    name: '🎭 Rôles',
                    value: `> **Total :** \`${totalRoles}\``,
                    inline: true
                },
                {
                    name: '📅 Création du serveur',
                    value: `> <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
                    inline: true
                }
            ],
            footer: { text: `ID: ${guild.id}` }
        });

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        Logger.error(`Erreur lors de la récupération des stats serveur : ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)]
        });
    }
}

/**
 * Affiche les statistiques détaillées d'un membre spécifique.
 * Inclut les messages, le temps vocal, le niveau, le solde et les avertissements.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleMemberStats(interaction) {
    const { guild } = interaction;
    const targetUser = interaction.options.getUser('user') || interaction.user;

    await interaction.deferReply();

    try {
        // Récupérer le membre du serveur
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.editReply({
                embeds: [errorEmbed('Ce membre n\'est pas sur le serveur.')]
            });
        }

        // Récupérer les données de l'utilisateur en base de données
        const userData = await User.findOne({
            guildId: guild.id,
            userId: targetUser.id
        }).lean();

        // Préparer les valeurs avec des valeurs par défaut si l'utilisateur n'a pas de données
        const messageCount = userData?.messageCount || 0;
        const level = userData?.level || 0;
        const xp = userData?.xp || 0;
        const totalXp = userData?.totalXp || 0;
        const balance = userData?.balance || 0;
        const warnings = userData?.warnings || [];
        const voiceTotalTime = userData?.voiceTime?.totalTime || 0;

        // Formater le temps vocal en heures et minutes
        const voiceHours = Math.floor(voiceTotalTime / 3600000);
        const voiceMinutes = Math.floor((voiceTotalTime % 3600000) / 60000);

        // Compter les cas de modération pour cet utilisateur
        const caseCount = await Case.countDocuments({
            guildId: guild.id,
            userId: targetUser.id
        });

        const embed = createEmbed({
            title: `📊 Statistiques de ${targetUser.tag}`,
            thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 256 }),
            color: 'info',
            fields: [
                {
                    name: '💬 Messages',
                    value: `> \`${messageCount.toLocaleString('fr-FR')}\` messages envoyés`,
                    inline: true
                },
                {
                    name: '🔊 Temps vocal',
                    value: `> \`${voiceHours}h ${voiceMinutes}min\``,
                    inline: true
                },
                {
                    name: '⭐ Niveau',
                    value: `> Niveau \`${level}\` — \`${xp.toLocaleString('fr-FR')}\` XP\n> Total: \`${totalXp.toLocaleString('fr-FR')}\` XP`,
                    inline: true
                },
                {
                    name: '💰 Solde',
                    value: `> \`${balance.toLocaleString('fr-FR')}\``,
                    inline: true
                },
                {
                    name: '⚠️ Avertissements',
                    value: `> \`${warnings.length}\` avertissements actifs`,
                    inline: true
                },
                {
                    name: '🔨 Cas de modération',
                    value: `> \`${caseCount}\` cas enregistrés`,
                    inline: true
                },
                {
                    name: '📅 A rejoint le serveur',
                    value: `> <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                    inline: true
                },
                {
                    name: '📅 Compte créé',
                    value: `> <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`,
                    inline: true
                }
            ],
            footer: { text: `ID: ${targetUser.id}` }
        });

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        Logger.error(`Erreur lors de la récupération des stats membre : ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)]
        });
    }
}

/**
 * Affiche les statistiques de modération du serveur.
 * Réservé aux administrateurs. Montre les cas par type et par modérateur.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleModerationStats(interaction) {
    const { guild, member } = interaction;

    // Vérifier que l'utilisateur est administrateur pour les stats de modération
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            embeds: [errorEmbed('Vous devez être administrateur pour voir les statistiques de modération.')],
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Récupérer tous les cas de modération du serveur
        const allCases = await Case.find({ guildId: guild.id }).lean();
        const totalCases = allCases.length;

        // Compter les cas par type d'action
        const casesByType = {};
        for (const c of allCases) {
            casesByType[c.type] = (casesByType[c.type] || 0) + 1;
        }

        // Formater le comptage par type
        const typeLabels = {
            ban: '🔨 Bans',
            kick: '👢 Kicks',
            mute: '🔇 Mutes',
            warn: '⚠️ Warns',
            softban: '🔄 Softbans',
            unmute: '🔊 Unmutes',
            unban: '✅ Unbans',
            tempban: '⏱️ Tempbans'
        };

        const typeStats = Object.entries(casesByType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => `> ${typeLabels[type] || type} : \`${count}\``)
            .join('\n') || '> *Aucune action enregistrée*';

        // Compter les cas par modérateur (top 10)
        const casesByMod = {};
        for (const c of allCases) {
            const key = c.moderatorId;
            if (!casesByMod[key]) {
                casesByMod[key] = { tag: c.moderatorTag, count: 0 };
            }
            casesByMod[key].count++;
        }

        const modStats = Object.entries(casesByMod)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 10)
            .map(([id, data], index) => `> **${index + 1}.** ${data.tag} — \`${data.count}\` actions`)
            .join('\n') || '> *Aucun modérateur enregistré*';

        // Compter les cas actifs (sanctions temporaires encore en cours)
        const activeCases = allCases.filter(c => c.active && ['ban', 'tempban', 'mute'].includes(c.type)).length;

        // Statistiques des 30 derniers jours
        const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentCases = allCases.filter(c => new Date(c.timestamp) > last30d).length;

        const embed = createEmbed({
            title: '🛡️ Statistiques de Modération',
            description: `**${totalCases}** actions de modération enregistrées au total.`,
            color: 'moderation',
            fields: [
                {
                    name: '📊 Par type d\'action',
                    value: typeStats,
                    inline: false
                },
                {
                    name: '👮 Par modérateur (Top 10)',
                    value: modStats,
                    inline: false
                },
                {
                    name: '📈 Résumé',
                    value:
                        `> **Sanctions actives :** \`${activeCases}\`\n` +
                        `> **30 derniers jours :** \`${recentCases}\` actions\n` +
                        `> **Total historique :** \`${totalCases}\` actions`,
                    inline: false
                }
            ],
            footer: { text: `Serveur: ${guild.name}` }
        });

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        Logger.error(`Erreur lors de la récupération des stats modération : ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)]
        });
    }
}
