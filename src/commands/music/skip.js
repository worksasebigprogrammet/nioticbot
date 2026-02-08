// Commande pour passer à la musique suivante dans la file d'attente
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Passer à la musique suivante'),

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

            // Vérifier s'il y a une chanson suivante
            if (serverQueue.songs.length <= 1) {
                // Arrêter le lecteur, le gestionnaire d'événements Idle s'occupera du reste
                serverQueue.player.stop();

                const skipEmbed = new EmbedBuilder()
                    .setColor('#e67e22')
                    .setTitle('Musique passée')
                    .setDescription(`**${currentSong.title}** a été passée.\nPlus de musiques dans la file d'attente.`)
                    .setTimestamp();

                return interaction.reply({ embeds: [skipEmbed] });
            }

            const nextSong = serverQueue.songs[1];

            // Arrêter la lecture actuelle (déclenche l'événement Idle qui joue la suivante)
            serverQueue.player.stop();

            const skipEmbed = new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle('Musique passée')
                .setDescription(`**${currentSong.title}** a été passée.`)
                .addFields(
                    { name: 'Prochaine musique', value: `**${nextSong.title}**`, inline: true },
                    { name: 'Demandée par', value: `${nextSong.requester}`, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [skipEmbed] });

        } catch (error) {
            logger.error(`Erreur lors du skip: ${error.message}`);
            return interaction.reply({
                embeds: [createEmbed('error', 'Une erreur est survenue en passant la musique.')],
                ephemeral: true
            });
        }
    }
};
