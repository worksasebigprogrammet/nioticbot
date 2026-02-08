// Commande pour arrêter la musique et déconnecter le bot du salon vocal
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Arrêter la musique et déconnecter'),

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
            // Vider la file d'attente
            serverQueue.songs = [];

            // Arrêter le lecteur audio
            if (serverQueue.player) {
                serverQueue.player.stop(true);
            }

            // Détruire la connexion vocale
            if (serverQueue.connection) {
                serverQueue.connection.destroy();
            }

            // Supprimer la file d'attente du serveur
            client.musicQueues.delete(interaction.guild.id);

            const stopEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('Musique arrêtée')
                .setDescription('La musique a été arrêtée et la file d\'attente a été vidée.')
                .setTimestamp();

            return interaction.reply({ embeds: [stopEmbed] });

        } catch (error) {
            logger.error(`Erreur lors de l'arrêt de la musique: ${error.message}`);

            // Tenter de nettoyer même en cas d'erreur
            client.musicQueues.delete(interaction.guild.id);

            return interaction.reply({
                embeds: [createEmbed('error', 'Une erreur est survenue en arrêtant la musique.')],
                ephemeral: true
            });
        }
    }
};
