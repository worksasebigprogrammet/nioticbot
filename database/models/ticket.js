const { Schema, model } = require('mongoose');

/**
 * Modèle de ticket de support.
 *
 * Gère les tickets créés par les utilisateurs sur un serveur.
 * Chaque ticket possède un numéro auto-incrémenté par serveur,
 * un statut (ouvert, pris en charge, fermé), un système de
 * transcription des messages et une notation facultative.
 */

/* ─── Sous-schéma : message dans la transcription ─── */
const ticketMessageSchema = new Schema({
  /** Identifiant de l'auteur du message */
  authorId: { type: String, required: true },
  /** Tag Discord de l'auteur */
  authorTag: { type: String, required: true },
  /** Contenu textuel du message */
  content: { type: String, required: true },
  /** Pièces jointes (URLs) */
  attachments: { type: [String], default: [] },
  /** Date d'envoi du message */
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

/* ─── Schéma principal du ticket ─── */
const ticketSchema = new Schema({
  /** Identifiant du serveur Discord */
  guildId: {
    type: String,
    required: true
  },

  /** Numéro du ticket, auto-incrémenté par serveur */
  ticketId: {
    type: Number,
    required: true
  },

  /** Identifiant du salon Discord associé au ticket */
  channelId: {
    type: String,
    required: true
  },

  /** Identifiant de l'utilisateur ayant ouvert le ticket */
  userId: {
    type: String,
    required: true
  },

  /** Tag Discord de l'utilisateur ayant ouvert le ticket */
  userTag: {
    type: String,
    required: true
  },

  /** Catégorie du ticket */
  category: {
    type: String,
    enum: ['support', 'report', 'partnership', 'other'],
    default: 'support'
  },

  /** Statut actuel du ticket */
  status: {
    type: String,
    enum: ['open', 'claimed', 'closed'],
    default: 'open'
  },

  /** Identifiant du membre du personnel ayant pris en charge le ticket */
  claimedBy: {
    type: String,
    default: null
  },

  /** Transcription textuelle complète (résumé ou export) */
  transcript: {
    type: String,
    default: null
  },

  /** Note attribuée par l'utilisateur après fermeture (1 à 5 étoiles) */
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },

  /** Commentaire de l'utilisateur sur la qualité du support */
  ratingComment: {
    type: String,
    default: null
  },

  /** Liste des messages échangés dans le ticket (pour transcription) */
  messages: {
    type: [ticketMessageSchema],
    default: []
  },

  /** Date d'ouverture du ticket */
  openedAt: {
    type: Date,
    default: Date.now
  },

  /** Date de fermeture du ticket */
  closedAt: {
    type: Date,
    default: null
  },

  /** Identifiant de la personne ayant fermé le ticket */
  closedBy: {
    type: String,
    default: null
  },

  /** Raison de la fermeture */
  closeReason: {
    type: String,
    default: null
  }
});

/* ─── Index composé unique : un numéro de ticket unique par serveur ─── */
ticketSchema.index({ guildId: 1, ticketId: 1 }, { unique: true });

/* ─── Index pour retrouver le ticket par salon Discord ─── */
ticketSchema.index({ channelId: 1 }, { unique: true });

/* ─── Index pour lister les tickets d'un utilisateur sur un serveur ─── */
ticketSchema.index({ guildId: 1, userId: 1 });

/* ─── Index pour lister les tickets ouverts sur un serveur ─── */
ticketSchema.index({ guildId: 1, status: 1 });

/**
 * Méthode statique : obtenir le prochain numéro de ticket pour un serveur.
 *
 * @param {string} guildId - Identifiant du serveur
 * @returns {Promise<number>} Le prochain numéro de ticket
 */
ticketSchema.statics.getNextTicketId = async function (guildId) {
  const dernier = await this.findOne({ guildId })
    .sort({ ticketId: -1 })
    .select('ticketId')
    .lean();
  return dernier ? dernier.ticketId + 1 : 1;
};

module.exports = model('Ticket', ticketSchema);
