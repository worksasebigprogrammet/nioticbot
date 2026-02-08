// Commande pour régler le volume de la musique
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Régler le volume')
        .addIntegerOption(option =>
            option
                .setName('level')
                .setDescription('Niveau du volume (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        ),

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

        const level = interaction.options.getInteger('level');
        const oldVolume = serverQueue.volume;

        try {
            // Mettre à jour le volume dans la file d'attente
            serverQueue.volume = level;

            // Appliquer le volume sur la ressource audio en cours
            if (serverQueue.resource && serverQueue.resource.volume) {
                serverQueue.resource.volume.setVolumeLogarithmic(level / 100);
            }

            // Déterminer l'icône de volume selon le niveau
            let volumeIcon;
            if (level === 0) {
                volumeIcon = '🔇';
            } else if (level < 33) {
                volumeIcon = '🔈';
            } else if (level < 66) {
                volumeIcon = '🔉';
            } else {
                volumeIcon = '🔊';
            }

            // Créer une barre de progression visuelle
            const filled = Math.round(level / 10);
            const empty = 10 - filled;
            const progressBar = '▓'.repeat(filled) + '░'.repeat(empty);

            const volumeEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`${volumeIcon} Volume modifié`)
                .setDescription(`${progressBar} **${level}%**`)
                .addFields(
                    { name: 'Ancien volume', value: `${oldVolume}%`, inline: true },
                    { name: 'Nouveau volume', value: `${level}%`, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [volumeEmbed] });

        } catch (error) {
            logger.error(`Erreur lors du changement de volume: ${error.message}`);
            return interaction.reply({
                embeds: [createEmbed('error', 'Une erreur est survenue lors du changement de volume.')],
                ephemeral: true
            });
        }
    }
};
