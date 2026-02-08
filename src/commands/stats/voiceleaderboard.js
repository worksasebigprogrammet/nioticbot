// Commande de classement vocal - Affiche le classement des membres par temps passé en vocal
const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed, createEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Logger = require('../../utils/logger');

/* ─── Constante : nombre d'utilisateurs par page ─── */
const USERS_PER_PAGE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voiceleaderboard')
        .setDescription('Classement du temps en vocal')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Numéro de la page à afficher')
                .setMinValue(1)
                .setRequired(false)
        ),

    module: 'voiceTracking',
    adminOnly: false,

    async execute(interaction) {
        const { guild } = interaction;
        const page = interaction.options.getInteger('page') || 1;

        await interaction.deferReply();

        try {
            // Compter le nombre total d'utilisateurs ayant du temps vocal sur ce serveur
            const totalUsers = await User.countDocuments({
                guildId: guild.id,
                'voiceTime.totalTime': { $gt: 0 }
            });

            // Vérifier qu'il y a des données à afficher
            if (totalUsers === 0) {
                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '🔊 Classement Vocal',
                        description: 'Aucune donnée de temps vocal enregistrée sur ce serveur.',
                        color: 'info'
                    })]
                });
            }

            // Calculer la pagination
            const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);
            const currentPage = Math.min(page, totalPages);
            const skip = (currentPage - 1) * USERS_PER_PAGE;

            // Récupérer les utilisateurs triés par temps vocal décroissant
            const users = await User.find({
                guildId: guild.id,
                'voiceTime.totalTime': { $gt: 0 }
            })
                .sort({ 'voiceTime.totalTime': -1 })
                .skip(skip)
                .limit(USERS_PER_PAGE)
                .lean();

            // Construire le classement avec les données formatées
            const leaderboard = [];

            for (let i = 0; i < users.length; i++) {
                const userData = users[i];
                const rank = skip + i + 1;
                const totalTime = userData.voiceTime?.totalTime || 0;

                // Formater le temps en jours, heures et minutes
                const days = Math.floor(totalTime / 86400000);
                const hours = Math.floor((totalTime % 86400000) / 3600000);
                const minutes = Math.floor((totalTime % 3600000) / 60000);

                let timeFormatted = '';
                if (days > 0) timeFormatted += `${days}j `;
                timeFormatted += `${hours}h ${minutes}min`;

                // Récupérer le nom d'affichage de l'utilisateur
                const member = await guild.members.fetch(userData.userId).catch(() => null);
                const displayName = member ? member.displayName : `Utilisateur inconnu (${userData.userId})`;

                // Médailles pour les trois premiers
                let rankDisplay;
                switch (rank) {
                    case 1: rankDisplay = '🥇'; break;
                    case 2: rankDisplay = '🥈'; break;
                    case 3: rankDisplay = '🥉'; break;
                    default: rankDisplay = `**${rank}.**`;
                }

                // Barre de progression par rapport au premier du classement
                const maxTime = users[0]?.voiceTime?.totalTime || 1;
                const barLength = 8;
                const filled = Math.round((totalTime / maxTime) * barLength);
                const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

                leaderboard.push(
                    `${rankDisplay} ${displayName}\n` +
                    `> ${bar} \`${timeFormatted}\``
                );
            }

            // Trouver la position de l'utilisateur qui a exécuté la commande
            const callerData = await User.findOne({
                guildId: guild.id,
                userId: interaction.user.id,
                'voiceTime.totalTime': { $gt: 0 }
            }).lean();

            let callerPosition = null;
            if (callerData) {
                callerPosition = await User.countDocuments({
                    guildId: guild.id,
                    'voiceTime.totalTime': { $gt: callerData.voiceTime.totalTime }
                }) + 1;
            }

            // Formater le temps vocal de l'utilisateur exécutant
            let callerInfo = '';
            if (callerData) {
                const callerTime = callerData.voiceTime.totalTime;
                const cDays = Math.floor(callerTime / 86400000);
                const cHours = Math.floor((callerTime % 86400000) / 3600000);
                const cMinutes = Math.floor((callerTime % 3600000) / 60000);
                let callerTimeFormatted = '';
                if (cDays > 0) callerTimeFormatted += `${cDays}j `;
                callerTimeFormatted += `${cHours}h ${cMinutes}min`;
                callerInfo = `\n> Votre position : **#${callerPosition}** — \`${callerTimeFormatted}\``;
            }

            const embed = createEmbed({
                title: `🔊 Classement Vocal — ${guild.name}`,
                description:
                    leaderboard.join('\n\n') +
                    (callerInfo ? `\n\n───────────────${callerInfo}` : ''),
                color: 'info',
                thumbnail: guild.iconURL({ dynamic: true, size: 128 }),
                footer: {
                    text: `Page ${currentPage}/${totalPages} • ${totalUsers} membres classés`
                }
            });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error(`Erreur lors de la récupération du classement vocal : ${error.message}`);
            return interaction.editReply({
                embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)]
            });
        }
    }
};
