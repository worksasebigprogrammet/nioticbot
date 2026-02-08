// Commande pour afficher la file d'attente des musiques
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Voir la file d\'attente'),

    module: 'music',
    adminOnly: false,

    async execute(interaction, client) {
        // Récupérer la file d'attente du serveur
        const serverQueue = client.musicQueues?.get(interaction.guild.id);
        if (!serverQueue || serverQueue.songs.length === 0) {
            return interaction.reply({
                embeds: [createEmbed('info', 'La file d\'attente est vide. Utilisez `/play` pour ajouter des musiques.')],
                ephemeral: true
            });
        }

        try {
            const currentSong = serverQueue.songs[0];
            const upcomingSongs = serverQueue.songs.slice(1);

            // Construire l'embed de la file d'attente
            const queueEmbed = new EmbedBuilder()
                .setColor('#9b59b6')
                .setTitle('File d\'attente')
                .setDescription(`**En cours de lecture :**\n[${currentSong.title}](${currentSong.url}) — \`${currentSong.duration || 'Inconnue'}\` — Demandée par ${currentSong.requester}`)
                .setThumbnail(currentSong.thumbnail)
                .setTimestamp();

            // Ajouter les prochaines chansons (limité à 10 pour la lisibilité)
            if (upcomingSongs.length > 0) {
                const maxDisplay = 10;
                const songsToShow = upcomingSongs.slice(0, maxDisplay);

                const upcomingList = songsToShow.map((song, index) =>
                    `**${index + 1}.** [${song.title}](${song.url}) — \`${song.duration || 'Inconnue'}\` — ${song.requester}`
                ).join('\n');

                queueEmbed.addFields({
                    name: `Prochaines musiques (${upcomingSongs.length})`,
                    value: upcomingList
                });

                // Indiquer s'il y a plus de chansons non affichées
                if (upcomingSongs.length > maxDisplay) {
                    queueEmbed.setFooter({
                        text: `Et ${upcomingSongs.length - maxDisplay} autre(s) musique(s) dans la file d'attente`
                    });
                }
            } else {
                queueEmbed.addFields({
                    name: 'Prochaines musiques',
                    value: 'Aucune musique en attente.'
                });
            }

            // Ajouter les informations de volume et d'état
            const status = serverQueue.paused ? 'En pause' : 'En lecture';
            queueEmbed.addFields(
                { name: 'État', value: status, inline: true },
                { name: 'Volume', value: `${serverQueue.volume}%`, inline: true },
                { name: 'Total', value: `${serverQueue.songs.length} musique(s)`, inline: true }
            );

            return interaction.reply({ embeds: [queueEmbed] });

        } catch (error) {
            logger.error(`Erreur lors de l'affichage de la file d'attente: ${error.message}`);
            return interaction.reply({
                embeds: [createEmbed('error', 'Une erreur est survenue lors de l\'affichage de la file d\'attente.')],
                ephemeral: true
            });
        }
    }
};
