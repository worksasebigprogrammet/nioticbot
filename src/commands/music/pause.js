// Commande pour mettre en pause ou reprendre la lecture de la musique
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Mettre en pause / reprendre la musique'),

    module: 'music',
    adminOnly: false,

    async execute(interaction, client) {
        // Vérifier que l'utilisateur est dans un salon vocal
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                embeds: [createEmbed('error', 'Vous devez être dans un salon vocal pour utiliser cette commande.')],
                ephemeral: true
            });
        }

        // Récupérer la file d'attente du serveur
        const serverQueue = client.musicQueues?.get(interaction.guild.id);
        if (!serverQueue) {
            return interaction.reply({
                embeds: [createEmbed('error', 'Aucune musique n\'est en cours de lecture.')],
                ephemeral: true
            });
        }

        // Vérifier que l'utilisateur est dans le même salon vocal que le bot
        if (voiceChannel.id !== serverQueue.voiceChannel.id) {
            return interaction.reply({
                embeds: [createEmbed('error', 'Vous devez être dans le même salon vocal que le bot.')],
                ephemeral: true
            });
        }

        try {
            const currentSong = serverQueue.songs[0];

            // Basculer entre pause et reprise
            if (serverQueue.paused) {
                // Reprendre la lecture
                serverQueue.player.unpause();
                serverQueue.paused = false;

                const resumeEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('Lecture reprise')
                    .setDescription(`**[${currentSong.title}](${currentSong.url})**`)
                    .setThumbnail(currentSong.thumbnail)
                    .setTimestamp();

                return interaction.reply({ embeds: [resumeEmbed] });
            } else {
                // Mettre en pause
                serverQueue.player.pause();
                serverQueue.paused = true;

                const pauseEmbed = new EmbedBuilder()
                    .setColor('#f39c12')
                    .setTitle('Musique en pause')
                    .setDescription(`**[${currentSong.title}](${currentSong.url})**\nUtilisez \`/pause\` pour reprendre la lecture.`)
                    .setThumbnail(currentSong.thumbnail)
                    .setTimestamp();

                return interaction.reply({ embeds: [pauseEmbed] });
            }

        } catch (error) {
            logger.error(`Erreur lors de la mise en pause/reprise: ${error.message}`);
            return interaction.reply({
                embeds: [createEmbed('error', 'Une erreur est survenue lors de la mise en pause/reprise.')],
                ephemeral: true
            });
        }
    }
};
