const { Schema, model } = require('mongoose');

/**
 * Modèle de cas de modération.
 *
 * Chaque action de modération (ban, kick, mute, warn, etc.)
 * est enregistrée comme un « cas » avec un numéro auto-incrémenté
 * par serveur. Cela permet un suivi complet de l'historique
 * de modération.
 */

const caseSchema = new Schema({
  /** Identifiant du serveur Discord */
  guildId: {
    type: String,
    required: true
  },

  /** Numéro du cas, auto-incrémenté par serveur */
  caseId: {
    type: Number,
    required: true
  },

  /** Type d'action de modération effectuée */
  type: {
    type: String,
    required: true,
    enum: ['ban', 'kick', 'mute', 'warn', 'softban', 'unmute', 'unban']
  },

  /** Identifiant de l'utilisateur sanctionné */
  userId: {
    type: String,
    required: true
  },

  /** Tag Discord de l'utilisateur sanctionné (ex. Utilisateur#1234) */
  userTag: {
    type: String,
    required: true
  },

  /** Identifiant du modérateur ayant effectué l'action */
  moderatorId: {
    type: String,
    required: true
  },

  /** Tag Discord du modérateur */
  moderatorTag: {
    type: String,
    required: true
  },

  /** Raison de la sanction */
  reason: {
    type: String,
    default: 'Aucune raison fournie'
  },

  /** Durée de la sanction temporaire (en millisecondes), null si permanente */
  duration: {
    type: Number,
    default: null
  },

  /** Date et heure de la sanction */
  timestamp: {
    type: Date,
    default: Date.now
  },

  /** Indique si la sanction temporaire est encore active */
  active: {
    type: Boolean,
    default: true
  }
});

/* ─── Index composé unique : un numéro de cas unique par serveur ─── */
caseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });

/* ─── Index pour rechercher les cas par utilisateur sur un serveur ─── */
caseSchema.index({ guildId: 1, userId: 1 });

/* ─── Index pour rechercher les cas par modérateur sur un serveur ─── */
caseSchema.index({ guildId: 1, moderatorId: 1 });

/* ─── Index pour retrouver les sanctions temporaires encore actives ─── */
caseSchema.index({ guildId: 1, active: 1, type: 1 });

/**
 * Méthode statique : obtenir le prochain numéro de cas pour un serveur.
 * Recherche le cas le plus récent et incrémente son numéro de 1.
 *
 * @param {string} guildId - Identifiant du serveur
 * @returns {Promise<number>} Le prochain numéro de cas
 */
caseSchema.statics.getNextCaseId = async function (guildId) {
  const dernier = await this.findOne({ guildId })
    .sort({ caseId: -1 })
    .select('caseId')
    .lean();
  return dernier ? dernier.caseId + 1 : 1;
};

module.exports = model('Case', caseSchema);
