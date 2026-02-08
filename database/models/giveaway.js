const { Schema, model } = require('mongoose');

/**
 * Modèle de giveaway (concours / tirage au sort).
 *
 * Stocke toutes les informations relatives à un giveaway :
 * le prix, la date de fin, les participants, les gagnants
 * et les conditions de participation.
 */

const giveawaySchema = new Schema({
  /** Identifiant du serveur Discord */
  guildId: {
    type: String,
    required: true
  },

  /** Identifiant du message Discord du giveaway */
  messageId: {
    type: String,
    required: true
  },

  /** Identifiant du salon où se déroule le giveaway */
  channelId: {
    type: String,
    required: true
  },

  /** Description du lot à gagner */
  prize: {
    type: String,
    required: true
  },

  /** Nombre de gagnants à tirer */
  winners: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },

  /** Date et heure de fin du giveaway */
  endsAt: {
    type: Date,
    required: true
  },

  /** Liste des identifiants d'utilisateurs participant */
  participants: {
    type: [String],
    default: []
  },

  /** Indique si le giveaway est terminé */
  ended: {
    type: Boolean,
    default: false
  },

  /** Liste des identifiants des gagnants tirés au sort */
  winnerIds: {
    type: [String],
    default: []
  },

  /** Identifiant de l'utilisateur ayant lancé le giveaway */
  hostId: {
    type: String,
    required: true
  },

  /** Rôles requis pour participer (vide = aucun rôle requis) */
  requiredRoles: {
    type: [String],
    default: []
  }
});

/* ─── Index unique sur le message du giveaway ─── */
giveawaySchema.index({ messageId: 1 }, { unique: true });

/* ─── Index pour retrouver les giveaways d'un serveur ─── */
giveawaySchema.index({ guildId: 1 });

/* ─── Index pour retrouver les giveaways actifs qui doivent se terminer ─── */
giveawaySchema.index({ ended: 1, endsAt: 1 });

/* ─── Index pour retrouver les giveaways actifs d'un serveur ─── */
giveawaySchema.index({ guildId: 1, ended: 1 });

module.exports = model('Giveaway', giveawaySchema);
