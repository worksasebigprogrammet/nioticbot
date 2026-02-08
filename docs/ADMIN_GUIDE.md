# Guide Administrateur - NioticBot

## Table des Matières
1. [Modération](#modération)
2. [Anti-Raid](#anti-raid)
3. [Logs](#logs)
4. [Tickets](#tickets)
5. [XP & Niveaux](#xp--niveaux)
6. [Économie](#économie)
7. [Musique](#musique)
8. [Giveaways](#giveaways)
9. [Auto-Rôles](#auto-rôles)
10. [Suggestions](#suggestions)
11. [Statistiques](#statistiques)
12. [Configuration](#configuration)

---

## Modération

### Commandes de base

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/ban [user] [reason] [duration]` | Bannir un membre | `/ban @user Spam 7d` |
| `/kick [user] [reason]` | Expulser un membre | `/kick @user Comportement inapproprié` |
| `/mute [user] [duration] [reason]` | Rendre muet | `/mute @user 1h Spam` |
| `/unmute [user]` | Démuter | `/unmute @user` |
| `/warn [user] [reason]` | Avertir | `/warn @user Langage inapproprié` |
| `/warnings [user]` | Voir les avertissements | `/warnings @user` |
| `/clearwarns [user]` | Effacer les warns | `/clearwarns @user` |
| `/softban [user] [reason]` | Ban + unban (nettoie messages) | `/softban @user Nettoyage` |

### Gestion des messages

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/purge [amount]` | Supprimer X messages | `/purge 50` |
| `/purge [amount] user:[user]` | Messages d'un utilisateur | `/purge 50 user:@user` |
| `/purge [amount] filter:bots` | Messages des bots | `/purge 50 filter:bots` |
| `/purge [amount] filter:contains text:[texte]` | Messages contenant un texte | `/purge 50 filter:contains text:spam` |

### Système de cas

Chaque action de modération crée un "cas" unique avec :
- ID unique
- Type d'action
- Modérateur
- Utilisateur ciblé
- Raison
- Date et heure

| Commande | Description |
|----------|-------------|
| `/case [id]` | Voir les détails d'un cas |
| `/history [user]` | Voir tout l'historique d'un membre |

### Bonnes pratiques
- Toujours fournir une raison pour les actions de modération
- Utiliser `/warn` avant `/mute` ou `/ban` pour les infractions mineures
- Consulter `/history` avant de sanctionner pour voir les antécédents
- Utiliser `/softban` pour nettoyer les messages de spam sans ban permanent

---

## Anti-Raid

### Commandes

| Commande | Description |
|----------|-------------|
| `/antiraid on` | Activer manuellement le mode anti-raid |
| `/antiraid off` | Désactiver le mode anti-raid |
| `/antiraid config` | Configurer les paramètres |
| `/antiraid status` | Voir l'état actuel |

### Détection automatique

Le système détecte automatiquement :
1. **Raids par joins massifs** : Si 10+ membres rejoignent en 10 secondes
2. **Admin compromis** : Si un admin effectue 5+ bans/kicks en 30 secondes

### Actions automatiques
Quand un raid est détecté :
- Verrouillage de tous les salons textuels
- Passage de la vérification au niveau maximum
- Notification dans le salon anti-raid
- Enregistrement de tous les détails

### Désactivation
Utilisez `/antiraid off` pour désactiver le mode et déverrouiller les salons.

---

## Logs

### Configuration rapide

```
/setup preset:simple    → 4 salons (modération, messages, membres, antiraid)
/setup preset:complete  → 8 salons (+ rôles, vocal, serveur, tickets)
/setup preset:extreme   → 12+ salons (+ avatars, invitations, emojis, webhooks)
```

### Types de logs disponibles

**Modération** : Bans, kicks, mutes, warns, unmutes
**Messages** : Suppression, modification, suppression en masse
**Membres** : Arrivées, départs, changements de rôles, pseudos, avatars
**Vocal** : Connexions, déconnexions, déplacements, mutes/deafen
**Serveur** : Création/suppression de salons et rôles
**Invitations** : Création, utilisation, suppression
**Anti-Raid** : Déclenchements et actions

---

## Tickets

### Mise en place

1. Créer le panel : `/ticket panel`
2. Les utilisateurs cliquent sur le bouton "🎫 Créer un ticket"
3. Ils sélectionnent une catégorie
4. Un salon privé est créé

### Gestion des tickets

| Commande | Description |
|----------|-------------|
| `/ticket claim` | Prendre en charge un ticket |
| `/ticket close [raison]` | Fermer le ticket |
| `/ticket add [user]` | Ajouter quelqu'un |
| `/ticket remove [user]` | Retirer quelqu'un |
| `/ticket rename [nom]` | Renommer le salon |
| `/ticket reopen [id]` | Réouvrir un ticket fermé |
| `/ticket stats [user]` | Statistiques du staff |
| `/ticket leaderboard` | Classement du staff |

### Processus
1. Un utilisateur crée un ticket
2. Le staff reçoit une notification
3. Un membre du staff `/ticket claim` le ticket
4. Discussion et résolution
5. `/ticket close` pour fermer
6. Un transcript est automatiquement généré
7. L'utilisateur peut noter le support (1-5 étoiles)

---

## XP & Niveaux

### Fonctionnement
- Les membres gagnent 15-25 XP par message (cooldown 60s)
- La formule de niveau : `niveau = floor(0.1 * sqrt(xp))`
- Des rôles peuvent être attribués automatiquement par niveau

### Commandes

| Commande | Description |
|----------|-------------|
| `/rank [user]` | Voir son niveau et XP |
| `/leaderboard [page]` | Classement du serveur |

### Configuration des récompenses
Configurez des rôles attribués à certains niveaux via les settings du module levels.

### Multiplicateurs
- Par rôle : les Boosters peuvent avoir x2 XP
- Par salon : certains salons donnent plus d'XP

---

## Économie

### Commandes membres

| Commande | Description |
|----------|-------------|
| `/balance [user]` | Voir son solde |
| `/daily` | Récompense quotidienne (100 coins) |
| `/weekly` | Récompense hebdomadaire (500 coins) |
| `/give [user] [amount]` | Donner de l'argent |
| `/baltop [page]` | Classement des plus riches |
| `/shop list` | Voir la boutique |
| `/shop buy [item]` | Acheter un item |

### Sources de revenus
- Messages (1-3 coins par message)
- Temps en vocal
- Récompenses quotidiennes/hebdomadaires
- Gains par participation

---

## Musique

| Commande | Description |
|----------|-------------|
| `/play [recherche/URL]` | Jouer une musique |
| `/pause` | Pause/Reprendre |
| `/skip` | Passer à la suivante |
| `/stop` | Arrêter et déconnecter |
| `/queue` | Voir la file d'attente |
| `/volume [0-100]` | Régler le volume |

---

## Giveaways

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/giveaway create` | Créer un giveaway | `/giveaway create duration:24h winners:1 prize:Nitro` |
| `/giveaway end [id]` | Terminer plus tôt | `/giveaway end message_id:123` |
| `/giveaway reroll [id]` | Re-tirer les gagnants | `/giveaway reroll message_id:123` |

---

## Auto-Rôles

### Rôles à l'arrivée

| Commande | Description |
|----------|-------------|
| `/autorole add [role]` | Ajouter un rôle auto |
| `/autorole remove [role]` | Retirer un rôle auto |
| `/autorole list` | Lister les rôles auto |

### Rôles par réaction/bouton

| Commande | Description |
|----------|-------------|
| `/reactionrole create` | Créer un panel de rôles |
| `/reactionrole addrole [message_id] [emoji] [role]` | Ajouter un rôle au panel |

**Modes disponibles :**
- **Normal** : Le membre peut avoir tous les rôles
- **Unique** : Un seul rôle à la fois
- **Verify** : Pour la vérification

---

## Suggestions

| Commande | Description |
|----------|-------------|
| `/suggest [suggestion]` | Faire une suggestion |
| `/suggestion accept [id] [raison]` | Accepter (admin) |
| `/suggestion deny [id] [raison]` | Refuser (admin) |
| `/suggestion consider [id] [raison]` | Mettre en considération (admin) |
| `/suggestion implement [id]` | Marquer comme implémentée (admin) |

---

## Statistiques

| Commande | Description |
|----------|-------------|
| `/stats server` | Stats globales du serveur |
| `/stats member [user]` | Stats d'un membre |
| `/stats moderation` | Stats de modération |
| `/voicetime [user]` | Temps en vocal |
| `/voiceleaderboard` | Classement vocal |

---

## Configuration

### Commandes

| Commande | Description |
|----------|-------------|
| `/config view [module]` | Voir la config d'un module |
| `/config set [module] [key] [value]` | Modifier un paramètre |
| `/config reset [module]` | Réinitialiser un module |
| `/config reload` | Recharger la configuration |
| `/language [fr/en]` | Changer la langue |

### Backups

| Commande | Description |
|----------|-------------|
| `/backup create` | Créer un backup manuel |
| `/backup list` | Lister les backups |
| `/backup restore [id]` | Restaurer un backup |
