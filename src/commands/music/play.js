// Commande pour jouer une musique dans un salon vocal
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    NoSubscriberBehavior
} = require('@discordjs/voice');
const play = require('play-dl');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Jouer une musique')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Terme de recherche ou URL de la musique')
                .setRequired(true)
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

        // Vérifier les permissions du bot dans le salon vocal
        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                embeds: [createEmbed('error', 'Je n\'ai pas les permissions de rejoindre ou de parler dans ce salon vocal.')],
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const query = interaction.options.getString('query');

        try {
            // Initialiser la map des files d'attente si elle n'existe pas
            if (!client.musicQueues) {
                client.musicQueues = new Map();
            }

            let serverQueue = client.musicQueues.get(interaction.guild.id);

            // Rechercher ou valider l'URL de la musique
            let songInfo;
            let stream;

            // Vérifier si c'est une URL ou un terme de recherche
            const isUrl = play.yt_validate(query);

            if (isUrl === 'video') {
                // URL directe d'une vidéo YouTube
                const info = await play.video_info(query);
                songInfo = {
                    title: info.video_details.title,
                    url: info.video_details.url,
                    duration: info.video_details.durationRaw,
                    thumbnail: info.video_details.thumbnails[0]?.url || null,
                    requester: interaction.user
                };
            } else if (isUrl === 'playlist') {
                // Gérer les playlists YouTube
                const playlist = await play.playlist_info(query, { incomplete: true });
                const videos = await playlist.all_videos();

                if (videos.length === 0) {
                    return interaction.editReply({
                        embeds: [createEmbed('error', 'Aucune vidéo trouvée dans cette playlist.')]
                    });
                }

                // Ajouter toutes les vidéos de la playlist à la file d'attente
                const songs = videos.map(video => ({
                    title: video.title,
                    url: video.url,
                    duration: video.durationRaw,
                    thumbnail: video.thumbnails[0]?.url || null,
                    requester: interaction.user
                }));

                songInfo = songs[0];

                // Ajouter les autres chansons à la file d'attente si elle existe
                if (serverQueue) {
                    songs.forEach(song => serverQueue.songs.push(song));

                    const playlistEmbed = new EmbedBuilder()
                        .setColor('#3498db')
                        .setTitle('Playlist ajoutée à la file d\'attente')
                        .setDescription(`**${playlist.title}** - ${songs.length} musiques ajoutées`)
                        .setTimestamp();

                    return interaction.editReply({ embeds: [playlistEmbed] });
                }

                // Créer la file d'attente avec toutes les chansons
                serverQueue = {
                    textChannel: interaction.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    player: null,
                    songs: songs,
                    volume: 50,
                    playing: true,
                    paused: false
                };

                client.musicQueues.set(interaction.guild.id, serverQueue);

                // Rejoindre le salon vocal et jouer la première chanson
                await connectAndPlay(interaction, client, serverQueue);

                const playlistEmbed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('Playlist ajoutée')
                    .setDescription(`**${playlist.title}** - ${songs.length} musiques`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [playlistEmbed] });
            } else {
                // Recherche par terme
                const searchResults = await play.search(query, { limit: 1 });

                if (searchResults.length === 0) {
                    return interaction.editReply({
                        embeds: [createEmbed('error', 'Aucun résultat trouvé pour cette recherche.')]
                    });
                }

                const video = searchResults[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.durationRaw,
                    thumbnail: video.thumbnails[0]?.url || null,
                    requester: interaction.user
                };
            }

            // Si une file d'attente existe déjà, ajouter la chanson
            if (serverQueue) {
                serverQueue.songs.push(songInfo);

                const queueEmbed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('Ajoutée à la file d\'attente')
                    .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
                    .addFields(
                        { name: 'Durée', value: songInfo.duration || 'Inconnue', inline: true },
                        { name: 'Position', value: `${serverQueue.songs.length}`, inline: true },
                        { name: 'Demandée par', value: `${songInfo.requester}`, inline: true }
                    )
                    .setThumbnail(songInfo.thumbnail)
                    .setTimestamp();

                return interaction.editReply({ embeds: [queueEmbed] });
            }

            // Créer une nouvelle file d'attente
            serverQueue = {
                textChannel: interaction.channel,
                voiceChannel: voiceChannel,
                connection: null,
                player: null,
                songs: [songInfo],
                volume: 50,
                playing: true,
                paused: false
            };

            client.musicQueues.set(interaction.guild.id, serverQueue);

            // Rejoindre le salon vocal et jouer la musique
            await connectAndPlay(interaction, client, serverQueue);

        } catch (error) {
            logger.error(`Erreur lors de la lecture de la musique: ${error.message}`);

            // Nettoyer en cas d'erreur
            client.musicQueues.delete(interaction.guild.id);

            return interaction.editReply({
                embeds: [createEmbed('error', `Une erreur est survenue lors de la lecture: ${error.message}`)]
            });
        }
    }
};

/**
 * Connecter le bot au salon vocal et jouer la première chanson
 * @param {Object} interaction - L'interaction Discord
 * @param {Object} client - Le client Discord
 * @param {Object} serverQueue - La file d'attente du serveur
 */
async function connectAndPlay(interaction, client, serverQueue) {
    // Rejoindre le salon vocal
    const connection = joinVoiceChannel({
        channelId: serverQueue.voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true
    });

    serverQueue.connection = connection;

    // Créer le lecteur audio
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
        }
    });

    serverQueue.player = player;

    // Abonner la connexion au lecteur
    connection.subscribe(player);

    // Gérer la déconnexion
    connection.on(VoiceConnectionStatus.Disconnected, () => {
        try {
            client.musicQueues.delete(interaction.guild.id);
            connection.destroy();
        } catch (error) {
            logger.error(`Erreur lors de la déconnexion: ${error.message}`);
        }
    });

    // Gérer la fin d'une chanson pour passer à la suivante
    player.on(AudioPlayerStatus.Idle, () => {
        // Retirer la chanson terminée
        serverQueue.songs.shift();

        // Vérifier s'il reste des chansons dans la file d'attente
        if (serverQueue.songs.length === 0) {
            // Plus de chansons, déconnecter après un délai
            setTimeout(() => {
                const currentQueue = client.musicQueues.get(interaction.guild.id);
                if (currentQueue && currentQueue.songs.length === 0) {
                    connection.destroy();
                    client.musicQueues.delete(interaction.guild.id);

                    serverQueue.textChannel.send({
                        embeds: [createEmbed('info', 'File d\'attente terminée, déconnexion du salon vocal.')]
                    }).catch(() => {});
                }
            }, 30000);
            return;
        }

        // Jouer la chanson suivante
        playSong(interaction.guild.id, client, serverQueue);
    });

    // Gérer les erreurs du lecteur
    player.on('error', (error) => {
        logger.error(`Erreur du lecteur audio: ${error.message}`);
        serverQueue.songs.shift();

        if (serverQueue.songs.length > 0) {
            playSong(interaction.guild.id, client, serverQueue);
        } else {
            connection.destroy();
            client.musicQueues.delete(interaction.guild.id);
        }
    });

    // Jouer la première chanson
    await playSong(interaction.guild.id, client, serverQueue);

    // Envoyer l'embed "En cours de lecture"
    const song = serverQueue.songs[0];
    const nowPlayingEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('En cours de lecture')
        .setDescription(`**[${song.title}](${song.url})**`)
        .addFields(
            { name: 'Durée', value: song.duration || 'Inconnue', inline: true },
            { name: 'Volume', value: `${serverQueue.volume}%`, inline: true },
            { name: 'Demandée par', value: `${song.requester}`, inline: true }
        )
        .setThumbnail(song.thumbnail)
        .setTimestamp();

    await interaction.editReply({ embeds: [nowPlayingEmbed] });
}

/**
 * Jouer une chanson depuis la file d'attente
 * @param {string} guildId - L'identifiant du serveur
 * @param {Object} client - Le client Discord
 * @param {Object} serverQueue - La file d'attente du serveur
 */
async function playSong(guildId, client, serverQueue) {
    const song = serverQueue.songs[0];
    if (!song) return;

    try {
        // Créer le flux audio avec play-dl
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });

        // Appliquer le volume
        resource.volume.setVolumeLogarithmic(serverQueue.volume / 100);

        // Jouer la ressource audio
        serverQueue.player.play(resource);
        serverQueue.resource = resource;

        // Envoyer un message pour la chanson suivante (sauf la première)
        if (serverQueue.songs.length > 0 && serverQueue.textChannel) {
            const nowPlayingEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('En cours de lecture')
                .setDescription(`**[${song.title}](${song.url})**`)
                .addFields(
                    { name: 'Durée', value: song.duration || 'Inconnue', inline: true },
                    { name: 'Demandée par', value: `${song.requester}`, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setTimestamp();

            serverQueue.textChannel.send({ embeds: [nowPlayingEmbed] }).catch(() => {});
        }
    } catch (error) {
        logger.error(`Erreur lors de la lecture de ${song.title}: ${error.message}`);
        serverQueue.songs.shift();

        if (serverQueue.songs.length > 0) {
            await playSong(guildId, client, serverQueue);
        }
    }
}
