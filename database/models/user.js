const { Schema, model } = require('mongoose');

/**
 * Modèle des données utilisateur par serveur.
 *
 * Chaque document représente un utilisateur sur un serveur donné.
 * Il contient les données de niveaux, d'économie, d'avertissements,
 * de temps vocal, de messages et d'inventaire.
 */

/* ─── Sous-schéma : avertissement de modération ─── */
const warningSchema = new Schema({
  /** Raison de l'avertissement */
  reason: { type: String, required: true },
  /** Identifiant du modérateur ayant émis l'avertissement */
  moderatorId: { type: String, required: true },
  /** Date de l'avertissement */
  date: { type: Date, default: Date.now }
}, { _id: true });

/* ─── Sous-schéma : session vocale ─── */
const voiceSessionSchema = new Schema({
  /** Identifiant du salon vocal */
  channelId: { type: String, required: true },
  /** Date de connexion */
  joinedAt: { type: Date, required: true },
  /** Date de déconnexion */
  leftAt: { type: Date, default: null },
  /** Durée de la session en millisecondes */
  duration: { type: Number, default: 0 }
}, { _id: false });

/* ─── Sous-schéma : article dans l'inventaire ─── */
const inventoryItemSchema = new Schema({
  /** Nom de l'article */
  itemName: { type: String, required: true },
  /** Quantité possédée */
  quantity: { type: Number, default: 1 },
  /** Date d'acquisition */
  acquiredAt: { type: Date, default: Date.now }
}, { _id: false });

/* ─── Schéma principal de l'utilisateur ─── */
const userSchema = new Schema({
  /** Identifiant du serveur Discord */
  guildId: {
    type: String,
    required: true
  },

  /** Identifiant de l'utilisateur Discord */
  userId: {
    type: String,
    required: true
  },

  /* ─── Système de niveaux ─── */

  /** Points d'expérience actuels (pour le niveau en cours) */
  xp: { type: Number, default: 0 },

  /** Niveau actuel */
  level: { type: Number, default: 0 },

  /** Total d'XP accumulé depuis le début */
  totalXp: { type: Number, default: 0 },

  /* ─── Système d'économie ─── */

  /** Solde de monnaie du serveur */
  balance: { type: Number, default: 0 },

  /** Dernière réclamation de la récompense quotidienne */
  dailyLastClaimed: { type: Date, default: null },

  /** Dernière réclamation de la récompense hebdomadaire */
  weeklyLastClaimed: { type: Date, default: null },

  /* ─── Avertissements ─── */

  /** Liste des avertissements reçus */
  warnings: { type: [warningSchema], default: [] },

  /* ─── Suivi du temps vocal ─── */
  voiceTime: {
    /** Temps total passé en vocal (en millisecondes) */
    totalTime: { type: Number, default: 0 },
    /** Historique des sessions vocales */
    sessions: { type: [voiceSessionSchema], default: [] },
    /** Temps passé par salon : { channelId: durée en ms } */
    byChannel: { type: Map, of: Number, default: new Map() }
  },

  /** Nombre total de messages envoyés */
  messageCount: { type: Number, default: 0 },

  /** Inventaire d'articles achetés ou obtenus */
  inventory: { type: [inventoryItemSchema], default: [] }

}, {
  /** Ajouter automatiquement createdAt et updatedAt */
  timestamps: true
});

/* ─── Index composé unique : un document par utilisateur par serveur ─── */
userSchema.index({ guildId: 1, userId: 1 }, { unique: true });

/* ─── Index pour les classements (leaderboards) ─── */
userSchema.index({ guildId: 1, totalXp: -1 });
userSchema.index({ guildId: 1, balance: -1 });
userSchema.index({ guildId: 1, messageCount: -1 });
userSchema.index({ guildId: 1, 'voiceTime.totalTime': -1 });

module.exports = model('User', userSchema);
