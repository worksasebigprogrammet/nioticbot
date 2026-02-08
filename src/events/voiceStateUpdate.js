// Événement déclenché lors de changements vocaux (join, leave, move, mute, deafen)
const Logger = require('../utils/logger');

module.exports = {
    name: 'voiceStateUpdate',
    once: false,

    async execute(oldState, newState, client) {
        try {
            const guild = newState.guild || oldState.guild;
            const member = newState.member || oldState.member;
            if (!member) return;

            // Tracking du temps vocal
            if (client.systems.voiceTracking) {
                await client.systems.voiceTracking.handleVoiceUpdate(oldState, newState);
            }

            if (!client.systems.logs) return;

            // Membre rejoint un salon vocal
            if (!oldState.channelId && newState.channelId) {
                await client.systems.logs.log(guild.id, 'voice.join', {
                    user: member.user,
                    channel: newState.channel
                });
                return;
            }

            // Membre quitte un salon vocal
            if (oldState.channelId && !newState.channelId) {
                await client.systems.logs.log(guild.id, 'voice.leave', {
                    user: member.user,
                    channel: oldState.channel
                });
                return;
            }

            // Membre déplacé entre salons vocaux
            if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                await client.systems.logs.log(guild.id, 'voice.move', {
                    user: member.user,
                    oldChannel: oldState.channel,
                    newChannel: newState.channel
                });
                return;
            }

            // Changement de mute
            if (oldState.serverMute !== newState.serverMute) {
                await client.systems.logs.log(guild.id, 'voice.mute', {
                    user: member.user,
                    channel: newState.channel,
                    muted: newState.serverMute
                });
            }

            // Changement de sourd
            if (oldState.serverDeaf !== newState.serverDeaf) {
                await client.systems.logs.log(guild.id, 'voice.deafen', {
                    user: member.user,
                    channel: newState.channel,
                    deafened: newState.serverDeaf
                });
            }

        } catch (error) {
            Logger.error('Erreur voiceStateUpdate:', error);
        }
    },
};
