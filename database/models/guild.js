const { Schema, model } = require('mongoose');

/**
 * Modèle de configuration d'un serveur Discord (guild).
 *
 * Ce schéma stocke l'ensemble des paramètres, modules activés,
 * configurations d'anti-raid, d'auto-modération, de tickets,
 * de niveaux, d'économie, de suggestions, d'auto-rôles et de logs
 * pour chaque serveur utilisant le bot.
 */

/* ─── Sous-schéma : configuration d'un canal de log ─── */
const logChannelSchema = new Schema({
  /** Identifiant du salon Discord où envoyer les logs */
  channelId: { type: String, default: null },
  /** Si ce type de log est activé */
  enabled: { type: Boolean, default: false },
  /** Couleur de l'embed (format hexadécimal) */
  color: { type: String, default: '#2F3136' }
}, { _id: false });

/* ─── Sous-schéma : règle d'auto-modération ─── */
const automodRuleSchema = new Schema({
  /** Règle activée ou non */
  enabled: { type: Boolean, default: false },
  /** Seuil de déclenchement (ex. nombre de messages, mentions, etc.) */
  threshold: { type: Number, default: 5 },
  /** Action à effectuer : warn, mute, kick ou ban */
  action: { type: String, enum: ['warn', 'mute', 'kick', 'ban'], default: 'warn' },
  /** Liste blanche de salons ou rôles exemptés */
  whitelist: { type: [String], default: [] }
}, { _id: false });

/* ─── Sous-schéma : récompense de niveau ─── */
const levelRewardSchema = new Schema({
  /** Niveau requis pour obtenir la récompense */
  level: { type: Number, required: true },
  /** Identifiant du rôle attribué */
  roleId: { type: String, required: true }
}, { _id: false });

/* ─── Sous-schéma : article de la boutique ─── */
const shopItemSchema = new Schema({
  /** Nom de l'article */
  name: { type: String, required: true },
  /** Description de l'article */
  description: { type: String, default: '' },
  /** Prix en monnaie du serveur */
  price: { type: Number, required: true },
  /** Identifiant du rôle accordé à l'achat (si applicable) */
  roleId: { type: String, default: null },
  /** Quantité maximale achetable par utilisateur (0 = illimité) */
  maxPerUser: { type: Number, default: 0 },
  /** Si l'article est disponible à l'achat */
  available: { type: Boolean, default: true }
}, { _id: false });

/* ─── Sous-schéma : catégorie de ticket ─── */
const ticketCategorySchema = new Schema({
  /** Nom de la catégorie (ex. support, signalement) */
  name: { type: String, required: true },
  /** Description affichée lors de la création */
  description: { type: String, default: '' },
  /** Emoji affiché sur le bouton */
  emoji: { type: String, default: null },
  /** Identifiant de la catégorie Discord où créer le salon */
  categoryId: { type: String, default: null },
  /** Rôles ayant accès aux tickets de cette catégorie */
  staffRoles: { type: [String], default: [] }
}, { _id: false });

/* ─── Sous-schéma : rôle de réaction ─── */
const reactionRoleSchema = new Schema({
  /** Identifiant du message contenant les réactions */
  messageId: { type: String, required: true },
  /** Identifiant du salon contenant le message */
  channelId: { type: String, required: true },
  /** Emoji associé au rôle */
  emoji: { type: String, required: true },
  /** Identifiant du rôle attribué */
  roleId: { type: String, required: true }
}, { _id: false });

/* ─── Schéma principal du serveur ─── */
const guildSchema = new Schema({
  /** Identifiant unique du serveur Discord */
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  /** Langue du bot sur ce serveur */
  language: {
    type: String,
    default: 'fr'
  },

  /* ─── Modules activés / désactivés ─── */
  modules: {
    moderation:    { type: Boolean, default: true },
    logs:          { type: Boolean, default: false },
    antiraid:      { type: Boolean, default: false },
    automod:       { type: Boolean, default: false },
    tickets:       { type: Boolean, default: false },
    levels:        { type: Boolean, default: false },
    economy:       { type: Boolean, default: false },
    music:         { type: Boolean, default: false },
    voiceTracking: { type: Boolean, default: false },
    giveaways:     { type: Boolean, default: false },
    autoroles:     { type: Boolean, default: false },
    suggestions:   { type: Boolean, default: false },
    stats:         { type: Boolean, default: false },
    backup:        { type: Boolean, default: false }
  },

  /* ─── Permissions du bot sur ce serveur ─── */
  permissions: {
    /** Identifiant du rôle administrateur du bot */
    adminRoleId: { type: String, default: null },
    /** Identifiants des utilisateurs ayant les droits admin du bot */
    adminUsers: { type: [String], default: [] },
    /** Utilisateurs exemptés de l'auto-modération et de l'anti-raid */
    bypassUsers: { type: [String], default: [] }
  },

  /* ─── Configuration des logs par type ─── */
  logs: {
    /** Actions de modération (ban, kick, mute, warn) */
    moderation:    { type: logChannelSchema, default: () => ({}) },
    /** Entrées et sorties de membres */
    memberJoinLeave: { type: logChannelSchema, default: () => ({}) },
    /** Suppression et modification de messages */
    messageDelete: { type: logChannelSchema, default: () => ({}) },
    messageEdit:   { type: logChannelSchema, default: () => ({}) },
    /** Changements de rôles et de salons */
    roleUpdate:    { type: logChannelSchema, default: () => ({}) },
    channelUpdate: { type: logChannelSchema, default: () => ({}) },
    /** Activité vocale */
    voice:         { type: logChannelSchema, default: () => ({}) },
    /** Événements d'anti-raid */
    antiraid:      { type: logChannelSchema, default: () => ({}) },
    /** Événements d'auto-modération */
    automod:       { type: logChannelSchema, default: () => ({}) },
    /** Logs des tickets */
    tickets:       { type: logChannelSchema, default: () => ({}) },
    /** Logs du serveur (mises à jour du serveur) */
    server:        { type: logChannelSchema, default: () => ({}) }
  },

  /* ─── Configuration de l'anti-raid ─── */
  antiraid: {
    /** Anti-raid activé */
    enabled: { type: Boolean, default: false },
    /** Nombre d'arrivées pour déclencher l'alerte */
    joinThreshold: { type: Number, default: 10 },
    /** Fenêtre de temps en secondes pour compter les arrivées */
    joinTimeWindow: { type: Number, default: 10 },
    /** Seuil d'actions administratives suspectes */
    adminActionThreshold: { type: Number, default: 5 },
    /** Actions à effectuer lors d'un raid détecté */
    actions: {
      /** Activer le mode vérification */
      enableVerification: { type: Boolean, default: true },
      /** Expulser les comptes récents (en jours d'âge minimum) */
      kickNewAccounts: { type: Boolean, default: false },
      /** Âge minimum du compte en jours */
      minAccountAge: { type: Number, default: 7 },
      /** Bannir automatiquement les raiders */
      autoBan: { type: Boolean, default: false },
      /** Verrouiller le serveur */
      lockdown: { type: Boolean, default: false },
      /** Notifier les administrateurs */
      notifyAdmins: { type: Boolean, default: true }
    }
  },

  /* ─── Configuration de l'auto-modération ─── */
  automod: {
    /** Anti-spam (messages répétés) */
    antiSpam:    { type: automodRuleSchema, default: () => ({}) },
    /** Anti-liens (URLs non autorisées) */
    antiLinks:   { type: automodRuleSchema, default: () => ({}) },
    /** Anti-mentions (ping massif) */
    antiMention: { type: automodRuleSchema, default: () => ({}) },
    /** Anti-majuscules (messages en majuscules excessives) */
    antiCaps:    { type: automodRuleSchema, default: () => ({}) },
    /** Anti-flood (envoi rapide de messages) */
    antiFlood:   { type: automodRuleSchema, default: () => ({}) }
  },

  /* ─── Configuration des tickets ─── */
  tickets: {
    /** Identifiant de la catégorie Discord pour les tickets */
    categoryId: { type: String, default: null },
    /** Salon de logs des tickets */
    logChannelId: { type: String, default: null },
    /** Catégories de tickets disponibles */
    categories: { type: [ticketCategorySchema], default: [] },
    /** Salon où envoyer les transcriptions */
    transcriptChannelId: { type: String, default: null }
  },

  /* ─── Configuration des niveaux ─── */
  levels: {
    /** Système de niveaux activé */
    enabled: { type: Boolean, default: false },
    /** Quantité d'XP gagnée par message */
    xpPerMessage: { type: Number, default: 15 },
    /** Temps de recharge entre les gains d'XP (en secondes) */
    xpCooldown: { type: Number, default: 60 },
    /** Salon où annoncer les montées de niveau (null = salon actuel) */
    levelUpChannelId: { type: String, default: null },
    /** Multiplicateurs d'XP par rôle ou salon */
    multipliers: {
      /** Multiplicateurs par rôle : { roleId: multiplicateur } */
      roles: { type: Map, of: Number, default: new Map() },
      /** Multiplicateurs par salon : { channelId: multiplicateur } */
      channels: { type: Map, of: Number, default: new Map() }
    },
    /** Récompenses automatiques (rôles attribués à certains niveaux) */
    rewards: { type: [levelRewardSchema], default: [] }
  },

  /* ─── Configuration de l'économie ─── */
  economy: {
    /** Système d'économie activé */
    enabled: { type: Boolean, default: false },
    /** Nom de la monnaie */
    currencyName: { type: String, default: 'pièces' },
    /** Symbole de la monnaie */
    currencySymbol: { type: String, default: '🪙' },
    /** Montant de la récompense quotidienne */
    dailyAmount: { type: Number, default: 100 },
    /** Montant de la récompense hebdomadaire */
    weeklyAmount: { type: Number, default: 500 },
    /** Articles disponibles dans la boutique */
    shopItems: { type: [shopItemSchema], default: [] }
  },

  /* ─── Configuration des suggestions ─── */
  suggestions: {
    /** Salon où envoyer les suggestions */
    channelId: { type: String, default: null },
    /** Compteur pour numéroter les suggestions */
    counter: { type: Number, default: 0 }
  },

  /* ─── Configuration des auto-rôles ─── */
  autoroles: {
    /** Rôles attribués automatiquement à l'arrivée d'un membre */
    joinRoles: { type: [String], default: [] },
    /** Rôles attribués par réaction */
    reactionRoles: { type: [reactionRoleSchema], default: [] }
  },

  /** Salon d'accueil des nouveaux membres */
  welcomeChannelId: { type: String, default: null },

  /** Salon d'annonce de départ des membres */
  leaveChannelId: { type: String, default: null }

}, {
  /** Ajouter automatiquement createdAt et updatedAt */
  timestamps: true
});


module.exports = model('Guild', guildSchema);
