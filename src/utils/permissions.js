const { PermissionsBitField } = require('discord.js');

/**
 * Identifiants des propriétaires du bot.
 * Chargés depuis les variables d'environnement ou la configuration.
 * Ces utilisateurs ont un accès complet à toutes les commandes.
 */
const BOT_OWNERS = process.env.BOT_OWNERS
    ? process.env.BOT_OWNERS.split(',').map(id => id.trim())
    : [];

/**
 * Vérifie si un utilisateur est propriétaire du bot.
 * Les propriétaires ont un accès total sans restriction à toutes les fonctionnalités.
 *
 * @param {string} userId - L'identifiant Discord de l'utilisateur à vérifier
 * @returns {boolean} true si l'utilisateur est un propriétaire du bot
 */
function isBotOwner(userId) {
    // Vérifier dans les variables d'environnement
    if (BOT_OWNERS.includes(userId)) return true;

    // Vérifier dans la configuration du serveur si elle existe
    try {
        const configPath = require('path').join(__dirname, '..', '..', 'config', 'config.json');
        const fs = require('fs');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.bot && config.bot.owners && Array.isArray(config.bot.owners)) {
                return config.bot.owners.includes(userId);
            }
        }
    } catch {
        // Ignorer silencieusement si le fichier de config n'existe pas
    }

    return false;
}

/**
 * Vérifie si un membre est administrateur du serveur.
 * Un membre est considéré administrateur s'il remplit l'une de ces conditions :
 * - Il est propriétaire du bot (bypass total)
 * - Il est propriétaire du serveur Discord
 * - Il possède la permission ADMINISTRATOR de Discord
 * - Il possède le rôle admin défini dans les paramètres du serveur
 * - Son identifiant figure dans la liste des utilisateurs admin du serveur
 *
 * @param {import('discord.js').GuildMember} member - Le membre Discord à vérifier
 * @param {object} [guildSettings={}] - Paramètres personnalisés du serveur
 * @param {string} [guildSettings.adminRoleId] - ID du rôle administrateur personnalisé
 * @param {string[]} [guildSettings.adminUsers] - Liste des IDs utilisateurs administrateurs
 * @param {string[]} [guildSettings.bypassUsers] - Liste des IDs utilisateurs avec bypass total
 * @returns {boolean} true si le membre est administrateur
 */
function isAdmin(member, guildSettings = {}) {
    // Les propriétaires du bot ont toujours accès
    if (isBotOwner(member.id)) return true;

    // Le propriétaire du serveur Discord est toujours administrateur
    if (member.id === member.guild.ownerId) return true;

    // Vérifier la permission native ADMINISTRATOR de Discord
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    // Vérifier si l'utilisateur est dans la liste de bypass (accès total)
    if (guildSettings.bypassUsers && Array.isArray(guildSettings.bypassUsers)) {
        if (guildSettings.bypassUsers.includes(member.id)) return true;
    }

    // Vérifier si le membre possède le rôle admin personnalisé
    if (guildSettings.adminRoleId) {
        if (member.roles.cache.has(guildSettings.adminRoleId)) return true;
    }

    // Vérifier si l'utilisateur est dans la liste des administrateurs personnalisés
    if (guildSettings.adminUsers && Array.isArray(guildSettings.adminUsers)) {
        if (guildSettings.adminUsers.includes(member.id)) return true;
    }

    return false;
}

/**
 * Vérifie si un membre possède une ou plusieurs permissions spécifiques.
 * Prend en compte les rôles personnalisés et les utilisateurs avec bypass
 * définis dans les paramètres du serveur.
 *
 * @param {import('discord.js').GuildMember} member - Le membre Discord à vérifier
 * @param {object} [guildSettings={}] - Paramètres personnalisés du serveur
 * @param {string} [guildSettings.adminRoleId] - ID du rôle administrateur personnalisé
 * @param {string[]} [guildSettings.adminUsers] - IDs des utilisateurs administrateurs
 * @param {string[]} [guildSettings.bypassUsers] - IDs des utilisateurs avec bypass
 * @param {object} [guildSettings.commandPermissions] - Permissions spécifiques par commande
 * @param {string|string[]} [requiredPermissions] - Permission(s) Discord requise(s)
 * @returns {object} Résultat de la vérification avec { allowed: boolean, reason: string }
 */
function checkPermission(member, guildSettings = {}, requiredPermissions = null) {
    // Les administrateurs ont accès à tout sans vérification supplémentaire
    if (isAdmin(member, guildSettings)) {
        return { allowed: true, reason: 'Administrateur' };
    }

    // Si aucune permission spécifique n'est requise, autoriser l'accès
    if (!requiredPermissions) {
        return { allowed: true, reason: 'Aucune permission requise' };
    }

    // Normaliser en tableau si une seule permission est fournie sous forme de chaîne
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    // Collecter les permissions manquantes pour un message d'erreur détaillé
    const missingPermissions = [];

    for (const perm of permissions) {
        // Vérifier si la permission existe dans le bitfield de Discord
        if (PermissionsBitField.Flags[perm] !== undefined) {
            if (!member.permissions.has(PermissionsBitField.Flags[perm])) {
                missingPermissions.push(perm);
            }
        }
    }

    // Si des permissions manquent, refuser l'accès avec la liste des permissions manquantes
    if (missingPermissions.length > 0) {
        return {
            allowed: false,
            reason: `Permissions manquantes : ${missingPermissions.join(', ')}`,
            missing: missingPermissions,
        };
    }

    return { allowed: true, reason: 'Toutes les permissions sont accordées' };
}

/**
 * Vérifie que le bot lui-même possède les permissions nécessaires dans un serveur.
 * Indispensable avant d'exécuter des actions de modération ou de gestion.
 *
 * @param {import('discord.js').Guild} guild - Le serveur Discord dans lequel vérifier
 * @param {string|string[]} permissions - Permission(s) Discord à vérifier pour le bot
 * @returns {object} Résultat avec { hasAll: boolean, missing: string[] }
 */
function checkBotPermissions(guild, permissions) {
    // Récupérer le membre bot dans le serveur
    const botMember = guild.members.me;

    if (!botMember) {
        return {
            hasAll: false,
            missing: Array.isArray(permissions) ? permissions : [permissions],
            reason: 'Le bot n\'est pas trouvé dans le serveur',
        };
    }

    // Normaliser en tableau si une seule permission est fournie
    const permArray = Array.isArray(permissions) ? permissions : [permissions];

    // Vérifier chaque permission et collecter celles qui manquent
    const missingPermissions = [];

    for (const perm of permArray) {
        if (PermissionsBitField.Flags[perm] !== undefined) {
            if (!botMember.permissions.has(PermissionsBitField.Flags[perm])) {
                missingPermissions.push(perm);
            }
        } else {
            // Permission inconnue, la signaler comme manquante
            missingPermissions.push(`${perm} (permission inconnue)`);
        }
    }

    if (missingPermissions.length > 0) {
        return {
            hasAll: false,
            missing: missingPermissions,
            reason: `Permissions manquantes pour le bot : ${missingPermissions.join(', ')}`,
        };
    }

    return {
        hasAll: true,
        missing: [],
        reason: 'Le bot possède toutes les permissions requises',
    };
}

/**
 * Vérifie que le bot peut interagir avec un membre cible (hiérarchie des rôles).
 * Le rôle le plus élevé du bot doit être au-dessus de celui du membre cible.
 *
 * @param {import('discord.js').Guild} guild - Le serveur Discord
 * @param {import('discord.js').GuildMember} targetMember - Le membre cible
 * @returns {boolean} true si le bot peut agir sur ce membre
 */
function canInteractWith(guild, targetMember) {
    const botMember = guild.members.me;

    if (!botMember) return false;

    // Le propriétaire du serveur ne peut pas être affecté
    if (targetMember.id === guild.ownerId) return false;

    // Comparer la position du rôle le plus élevé du bot avec celui du membre cible
    return botMember.roles.highest.position > targetMember.roles.highest.position;
}

/**
 * Vérifie si un membre a un rôle spécifique dans le serveur.
 *
 * @param {import('discord.js').GuildMember} member - Le membre Discord
 * @param {string} roleId - L'identifiant du rôle à vérifier
 * @returns {boolean} true si le membre possède ce rôle
 */
function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

module.exports = {
    checkPermission,
    isAdmin,
    isBotOwner,
    checkBotPermissions,
    canInteractWith,
    hasRole,
};
