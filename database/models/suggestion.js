const { Schema, model } = require('mongoose');

/**
 * Modèle de suggestion.
 *
 * Permet aux utilisateurs de soumettre des suggestions pour
 * le serveur. Chaque suggestion possède un numéro unique par
 * serveur, un statut de traitement et un système de votes.
 */

const suggestionSchema = new Schema({
  /** Identifiant du serveur Discord */
  guildId: {
    type: String,
    required: true
  },

  /** Numéro de la suggestion, unique par serveur */
  suggestionId: {
    type: Number,
    required: true
  },

  /** Identifiant du message Discord contenant la suggestion */
  messageId: {
    type: String,
    required: true
  },

  /** Identifiant du salon où la suggestion a été publiée */
  channelId: {
    type: String,
    required: true
  },

  /** Identifiant de l'utilisateur ayant soumis la suggestion */
  userId: {
    type: String,
    required: true
  },

  /** Tag Discord de l'auteur de la suggestion */
  userTag: {
    type: String,
    required: true
  },

  /** Contenu textuel de la suggestion */
  content: {
    type: String,
    required: true
  },

  /** Statut actuel de la suggestion */
  status: {
    type: String,
    enum: ['pending', 'accepted', 'denied', 'considered', 'implemented'],
    default: 'pending'
  },

  /** Raison du changement de statut (fournie par le personnel) */
  statusReason: {
    type: String,
    default: null
  },

  /** Identifiant de la personne ayant modifié le statut */
  statusBy: {
    type: String,
    default: null
  },

  /** Nombre de votes positifs */
  upvotes: {
    type: Number,
    default: 0
  },

  /** Nombre de votes négatifs */
  downvotes: {
    type: Number,
    default: 0
  },

  /** Date de création de la suggestion */
  createdAt: {
    type: Date,
    default: Date.now
  }
});

/* ─── Index composé unique : un numéro de suggestion unique par serveur ─── */
suggestionSchema.index({ guildId: 1, suggestionId: 1 }, { unique: true });

/* ─── Index pour retrouver la suggestion par son message Discord ─── */
suggestionSchema.index({ messageId: 1 }, { unique: true });

/* ─── Index pour lister les suggestions d'un serveur par statut ─── */
suggestionSchema.index({ guildId: 1, status: 1 });

/* ─── Index pour lister les suggestions d'un utilisateur sur un serveur ─── */
suggestionSchema.index({ guildId: 1, userId: 1 });

module.exports = model('Suggestion', suggestionSchema);
