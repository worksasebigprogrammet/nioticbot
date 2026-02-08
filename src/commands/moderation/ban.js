// Commande de bannissement - Permet de bannir un membre du serveur (temporaire ou permanent)
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre du serveur')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à bannir')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('La raison du bannissement')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Durée du bannissement temporaire (ex: 1h, 1d, 7d)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Aucune raison fournie';
        const durationStr = interaction.options.getString('duration');

        // Récupérer le membre du serveur
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        // Vérifier que l'utilisateur cible n'est pas le modérateur lui-même
        if (targetUser.id === member.id) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas vous bannir vous-même.')],
                ephemeral: true
            });
        }

        // Vérifier que le bot peut bannir ce membre
        if (targetMember) {
            if (!targetMember.bannable) {
                return interaction.reply({
                    embeds: [errorEmbed('Je ne peux pas bannir ce membre. Vérifiez ma position dans la hiérarchie des rôles.')],
                    ephemeral: true
                });
            }

            // Vérifier la hiérarchie des rôles entre le modérateur et la cible
            if (targetMember.roles.highest.position >= member.roles.highest.position) {
                return interaction.reply({
                    embeds: [errorEmbed('Vous ne pouvez pas bannir un membre ayant un rôle supérieur ou égal au vôtre.')],
                    ephemeral: true
                });
            }
        }

        // Analyser la durée si fournie (bannissement temporaire)
        let duration = null;
        if (durationStr) {
            duration = ms(durationStr);
            if (!duration || duration < 0) {
                return interaction.reply({
                    embeds: [errorEmbed('Durée invalide. Utilisez un format valide (ex: 10m, 1h, 1d, 7d).')],
                    ephemeral: true
                });
            }
        }

        // Créer le numéro de cas en incrémentant le dernier cas du serveur
        const lastCase = await Case.findOne({ guildId: guild.id }).sort({ caseId: -1 });
        const caseId = lastCase ? lastCase.caseId + 1 : 1;

        // Envoyer un message privé à l'utilisateur avant le bannissement
        try {
            await targetUser.send({
                embeds: [moderationEmbed({
                    title: `Vous avez été banni de ${guild.name}`,
                    reason: reason,
                    duration: durationStr || 'Permanent',
                    moderator: member.user.tag
                })]
            });
        } catch (err) {
            // Impossible d'envoyer un MP à l'utilisateur (MPs désactivés)
            Logger.warn(`Impossible d'envoyer un MP à ${targetUser.tag} pour le bannissement.`);
        }

        try {
            // Exécuter le bannissement
            await guild.members.ban(targetUser.id, {
                reason: `[${member.user.tag}] ${reason}`,
                deleteMessageSeconds: 0
            });

            // Enregistrer le cas dans la base de données
            await Case.create({
                guildId: guild.id,
                caseId: caseId,
                type: durationStr ? 'tempban' : 'ban',
                userId: targetUser.id,
                userTag: targetUser.tag,
                moderatorId: member.id,
                moderatorTag: member.user.tag,
                reason: reason,
                duration: durationStr || null,
                timestamp: new Date(),
                active: true
            });

            // Programmer le débannissement automatique si c'est un bannissement temporaire
            if (duration) {
                setTimeout(async () => {
                    try {
                        await guild.members.unban(targetUser.id, 'Bannissement temporaire expiré');

                        // Mettre à jour le cas comme inactif
                        await Case.findOneAndUpdate(
                            { guildId: guild.id, caseId: caseId },
                            { active: false }
                        );

                        // Journaliser le débannissement automatique
                        client.systems?.logs?.log(guild.id, 'moderation.unban', {
                            user: targetUser,
                            moderator: client.user,
                            reason: 'Bannissement temporaire expiré',
                            caseId: caseId
                        });
                    } catch (err) {
                        Logger.error(`Erreur lors du débannissement automatique de ${targetUser.tag}: ${err.message}`);
                    }
                }, duration);
            }

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.ban', {
                user: targetUser,
                moderator: member.user,
                reason: reason,
                caseId: caseId,
                duration: durationStr || null
            });

            // Répondre avec un embed de succès
            return interaction.reply({
                embeds: [successEmbed(
                    `**${targetUser.tag}** a été banni${durationStr ? ` pour ${durationStr}` : ' définitivement'}.\n` +
                    `**Raison:** ${reason}\n` +
                    `**Cas #${caseId}**`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors du bannissement de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors du bannissement: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
