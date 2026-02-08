// Commande de temps vocal - Affiche le temps passé en vocal par un utilisateur
const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed, createEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicetime')
        .setDescription('Voir le temps passé en vocal')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre dont voir le temps vocal (par défaut : vous)')
                .setRequired(false)
        ),

    module: 'voiceTracking',
    adminOnly: false,

    async execute(interaction) {
        const { guild } = interaction;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        await interaction.deferReply();

        try {
            // Récupérer les données vocales de l'utilisateur en base de données
            const userData = await User.findOne({
                guildId: guild.id,
                userId: targetUser.id
            }).lean();

            // Vérifier si des données vocales existent
            if (!userData || !userData.voiceTime || userData.voiceTime.totalTime === 0) {
                return interaction.editReply({
                    embeds: [createEmbed({
                        title: `🔊 Temps vocal de ${targetUser.tag}`,
                        description: `${targetUser.id === interaction.user.id ? 'Vous n\'avez' : 'Cet utilisateur n\'a'} aucune donnée de temps vocal enregistrée.`,
                        color: 'info',
                        thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 128 })
                    })]
                });
            }

            const voiceData = userData.voiceTime;
            const totalTime = voiceData.totalTime || 0;

            // Formater le temps total en jours, heures et minutes
            const totalDays = Math.floor(totalTime / 86400000);
            const totalHours = Math.floor((totalTime % 86400000) / 3600000);
            const totalMinutes = Math.floor((totalTime % 3600000) / 60000);

            let totalFormatted = '';
            if (totalDays > 0) totalFormatted += `${totalDays}j `;
            totalFormatted += `${totalHours}h ${totalMinutes}min`;

            // Récupérer le temps par salon et trier par durée décroissante (top 5)
            const byChannel = voiceData.byChannel || new Map();
            const channelEntries = [];

            // Convertir la Map en tableau triable
            if (byChannel instanceof Map) {
                for (const [channelId, duration] of byChannel) {
                    channelEntries.push({ channelId, duration });
                }
            } else if (typeof byChannel === 'object') {
                for (const [channelId, duration] of Object.entries(byChannel)) {
                    channelEntries.push({ channelId, duration: Number(duration) });
                }
            }

            // Trier par durée décroissante et prendre les 5 premiers
            channelEntries.sort((a, b) => b.duration - a.duration);
            const topChannels = channelEntries.slice(0, 5);

            // Formater le classement des salons
            let channelList = '';
            if (topChannels.length > 0) {
                channelList = topChannels.map((entry, index) => {
                    const hours = Math.floor(entry.duration / 3600000);
                    const minutes = Math.floor((entry.duration % 3600000) / 60000);
                    const channel = guild.channels.cache.get(entry.channelId);
                    const channelName = channel ? `<#${entry.channelId}>` : `\`Salon supprimé (${entry.channelId})\``;

                    // Calculer le pourcentage du temps total
                    const percentage = totalTime > 0 ? ((entry.duration / totalTime) * 100).toFixed(1) : 0;

                    // Barre de progression visuelle
                    const barLength = 10;
                    const filled = Math.round((entry.duration / totalTime) * barLength);
                    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

                    return `> **${index + 1}.** ${channelName}\n>    ${bar} \`${hours}h ${minutes}min\` (${percentage}%)`;
                }).join('\n');
            } else {
                channelList = '> *Aucune donnée par salon disponible*';
            }

            // Nombre total de sessions vocales
            const sessionCount = voiceData.sessions?.length || 0;

            const embed = createEmbed({
                title: `🔊 Temps vocal de ${targetUser.tag}`,
                thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 256 }),
                color: 'info',
                fields: [
                    {
                        name: '⏱️ Temps total',
                        value: `> **${totalFormatted}**`,
                        inline: true
                    },
                    {
                        name: '📊 Sessions',
                        value: `> \`${sessionCount}\` sessions enregistrées`,
                        inline: true
                    },
                    {
                        name: '🏆 Top 5 des salons',
                        value: channelList,
                        inline: false
                    }
                ],
                footer: { text: `ID: ${targetUser.id} • Suivi vocal` }
            });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error(`Erreur lors de la récupération du temps vocal : ${error.message}`);
            return interaction.editReply({
                embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)]
            });
        }
    }
};
