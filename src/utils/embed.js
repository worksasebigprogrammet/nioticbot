const { EmbedBuilder } = require('discord.js');

/**
 * Couleurs par défaut utilisées pour les différents types d'embeds.
 * Correspond aux couleurs définies dans le fichier de configuration du bot.
 */
const COLORS = {
    success: 0x00FF00,     // Vert — opération réussie
    error: 0xFF0000,       // Rouge — erreur survenue
    warning: 0xFFA500,     // Orange — avertissement
    info: 0x0099FF,        // Bleu — information générale
    moderation: 0xE74C3C,  // Rouge foncé — action de modération
    log: 0x2F3136,         // Gris foncé — log d'événement
    levels: 0x9B59B6,      // Violet — système de niveaux
    economy: 0xF1C40F,     // Jaune — système d'économie
    music: 0x3498DB,       // Bleu clair — système de musique
    default: 0x5865F2,     // Bleu Discord — couleur par défaut
};

/**
 * Crée un embed Discord standardisé avec un style cohérent.
 * Cette fonction sert de base à tous les autres constructeurs d'embeds.
 *
 * @param {object} options - Options de configuration de l'embed
 * @param {string} [options.title] - Titre de l'embed
 * @param {string} [options.description] - Description principale
 * @param {number|string} [options.color] - Couleur de la bordure latérale (nom ou code hexadécimal)
 * @param {object[]} [options.fields] - Tableau de champs { name, value, inline }
 * @param {string} [options.thumbnail] - URL de la miniature (coin supérieur droit)
 * @param {string} [options.image] - URL de l'image principale (grande, en bas)
 * @param {object} [options.author] - Informations sur l'auteur { name, iconURL, url }
 * @param {object} [options.footer] - Pied de page { text, iconURL }
 * @param {boolean} [options.timestamp=true] - Ajouter l'horodatage automatiquement
 * @param {string} [options.url] - URL cliquable dans le titre
 * @returns {EmbedBuilder} L'embed Discord construit
 */
function createEmbed(options = {}) {
    const embed = new EmbedBuilder();

    // Appliquer la couleur : accepte un nom prédéfini ou un code hexadécimal direct
    const color = typeof options.color === 'string' && COLORS[options.color]
        ? COLORS[options.color]
        : (options.color || COLORS.default);
    embed.setColor(color);

    // Définir le titre si fourni
    if (options.title) {
        embed.setTitle(options.title);
    }

    // Définir la description si fournie
    if (options.description) {
        embed.setDescription(options.description);
    }

    // Ajouter les champs (sections nommées dans l'embed)
    if (options.fields && Array.isArray(options.fields)) {
        for (const field of options.fields) {
            embed.addFields({
                name: field.name || '\u200b',
                value: field.value || '\u200b',
                inline: field.inline || false,
            });
        }
    }

    // Définir la miniature (petite image en haut à droite)
    if (options.thumbnail) {
        embed.setThumbnail(options.thumbnail);
    }

    // Définir l'image principale (grande image en bas)
    if (options.image) {
        embed.setImage(options.image);
    }

    // Définir l'auteur (affiché en haut de l'embed)
    if (options.author) {
        embed.setAuthor({
            name: options.author.name || '',
            iconURL: options.author.iconURL || undefined,
            url: options.author.url || undefined,
        });
    }

    // Définir le pied de page
    if (options.footer) {
        embed.setFooter({
            text: typeof options.footer === 'string' ? options.footer : (options.footer.text || ''),
            iconURL: typeof options.footer === 'string' ? undefined : (options.footer.iconURL || undefined),
        });
    }

    // Ajouter l'horodatage automatiquement sauf si désactivé explicitement
    if (options.timestamp !== false) {
        embed.setTimestamp();
    }

    // Ajouter l'URL cliquable au titre
    if (options.url) {
        embed.setURL(options.url);
    }

    return embed;
}

/**
 * Crée un embed de succès vert.
 * Utilisé pour confirmer qu'une action a été effectuée correctement.
 *
 * @param {string} description - Message de confirmation à afficher
 * @param {string} [title] - Titre optionnel de l'embed
 * @returns {EmbedBuilder} Embed vert de succès
 */
function successEmbed(description, title = null) {
    return createEmbed({
        title: title || '✅ Succès',
        description,
        color: COLORS.success,
    });
}

/**
 * Crée un embed d'erreur rouge.
 * Utilisé pour signaler qu'une action a échoué ou qu'une erreur est survenue.
 *
 * @param {string} description - Message d'erreur à afficher
 * @param {string} [title] - Titre optionnel de l'embed
 * @returns {EmbedBuilder} Embed rouge d'erreur
 */
function errorEmbed(description, title = null) {
    return createEmbed({
        title: title || '❌ Erreur',
        description,
        color: COLORS.error,
    });
}

/**
 * Crée un embed d'avertissement orange.
 * Utilisé pour alerter sur une situation nécessitant l'attention de l'utilisateur.
 *
 * @param {string} description - Message d'avertissement à afficher
 * @param {string} [title] - Titre optionnel de l'embed
 * @returns {EmbedBuilder} Embed orange d'avertissement
 */
function warningEmbed(description, title = null) {
    return createEmbed({
        title: title || '⚠️ Attention',
        description,
        color: COLORS.warning,
    });
}

/**
 * Crée un embed d'information bleu.
 * Utilisé pour afficher des informations générales ou des détails neutres.
 *
 * @param {string} description - Message d'information à afficher
 * @param {string} [title] - Titre optionnel de l'embed
 * @returns {EmbedBuilder} Embed bleu d'information
 */
function infoEmbed(description, title = null) {
    return createEmbed({
        title: title || 'ℹ️ Information',
        description,
        color: COLORS.info,
    });
}

/**
 * Crée un embed de modération détaillé.
 * Utilisé pour afficher les actions de modération (ban, kick, mute, warn, etc.)
 * avec toutes les informations nécessaires : cible, modérateur, raison, durée.
 *
 * @param {object} options - Options de l'embed de modération
 * @param {string} options.action - Type d'action (Ban, Kick, Mute, Warn, etc.)
 * @param {import('discord.js').User} options.target - Utilisateur ciblé par l'action
 * @param {import('discord.js').User} options.moderator - Modérateur ayant effectué l'action
 * @param {string} [options.reason='Aucune raison fournie'] - Raison de l'action
 * @param {string} [options.duration] - Durée de l'action (pour les mutes temporaires, etc.)
 * @param {string} [options.caseId] - Identifiant du cas de modération
 * @param {object[]} [options.additionalFields] - Champs supplémentaires à ajouter
 * @returns {EmbedBuilder} Embed de modération complet
 */
function moderationEmbed(options = {}) {
    const {
        action = 'Action de modération',
        target,
        moderator,
        reason = 'Aucune raison fournie',
        duration,
        caseId,
        additionalFields = [],
    } = options;

    // Construire les champs de base de l'embed de modération
    const fields = [
        {
            name: '👤 Utilisateur',
            value: target ? `${target.tag} (${target.id})` : 'Inconnu',
            inline: true,
        },
        {
            name: '🔨 Modérateur',
            value: moderator ? `${moderator.tag} (${moderator.id})` : 'Système',
            inline: true,
        },
        {
            name: '📝 Raison',
            value: reason,
            inline: false,
        },
    ];

    // Ajouter la durée si elle est spécifiée (mutes temporaires, etc.)
    if (duration) {
        fields.push({
            name: '⏱️ Durée',
            value: duration,
            inline: true,
        });
    }

    // Ajouter l'identifiant du cas s'il est fourni
    if (caseId) {
        fields.push({
            name: '🔢 Cas',
            value: `#${caseId}`,
            inline: true,
        });
    }

    // Ajouter les champs supplémentaires personnalisés
    fields.push(...additionalFields);

    return createEmbed({
        title: `🛡️ ${action}`,
        color: COLORS.moderation,
        fields,
        thumbnail: target ? target.displayAvatarURL({ dynamic: true, size: 128 }) : undefined,
        footer: {
            text: moderator ? `Action par ${moderator.tag}` : 'Action automatique',
            iconURL: moderator ? moderator.displayAvatarURL({ dynamic: true }) : undefined,
        },
    });
}

/**
 * Crée un embed de log détaillé pour le système de journalisation.
 * Utilisé pour enregistrer les événements du serveur dans un salon de logs
 * avec un maximum de détails pour faciliter la traçabilité.
 *
 * @param {object} options - Options de l'embed de log
 * @param {string} options.event - Nom de l'événement (ex: 'Message supprimé', 'Membre banni')
 * @param {string} [options.description] - Description détaillée de l'événement
 * @param {import('discord.js').User} [options.user] - Utilisateur concerné par l'événement
 * @param {import('discord.js').TextChannel} [options.channel] - Salon concerné
 * @param {import('discord.js').User} [options.executor] - Utilisateur ayant déclenché l'événement
 * @param {object[]} [options.fields] - Champs supplémentaires personnalisés
 * @param {number} [options.color] - Couleur personnalisée (par défaut : gris foncé)
 * @returns {EmbedBuilder} Embed de log complet avec tous les détails
 */
function logEmbed(options = {}) {
    const {
        event = 'Événement',
        description,
        user,
        channel,
        executor,
        fields = [],
        color,
    } = options;

    // Construire les champs de base de l'embed de log
    const logFields = [];

    // Ajouter les informations sur l'utilisateur concerné
    if (user) {
        logFields.push({
            name: '👤 Utilisateur',
            value: `${user.tag}\n\`${user.id}\``,
            inline: true,
        });
    }

    // Ajouter les informations sur le salon concerné
    if (channel) {
        logFields.push({
            name: '💬 Salon',
            value: `${channel}\n\`${channel.id}\``,
            inline: true,
        });
    }

    // Ajouter les informations sur l'exécuteur (celui qui a déclenché l'événement)
    if (executor) {
        logFields.push({
            name: '🔧 Exécuteur',
            value: `${executor.tag}\n\`${executor.id}\``,
            inline: true,
        });
    }

    // Fusionner avec les champs supplémentaires personnalisés
    logFields.push(...fields);

    return createEmbed({
        title: `📋 ${event}`,
        description: description || null,
        color: color || COLORS.log,
        fields: logFields,
        thumbnail: user ? user.displayAvatarURL({ dynamic: true, size: 128 }) : undefined,
        footer: { text: `Log • ${event}` },
    });
}

module.exports = {
    createEmbed,
    successEmbed,
    errorEmbed,
    warningEmbed,
    infoEmbed,
    moderationEmbed,
    logEmbed,
    COLORS,
};
