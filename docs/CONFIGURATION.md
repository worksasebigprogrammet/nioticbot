# Guide de Configuration - NioticBot

## Structure des Fichiers de Configuration

```
nioticbot/
├── .env                          # Variables d'environnement (secrets)
└── config/
    └── config.example.json       # Configuration principale (template)
```

La configuration du bot utilise deux niveaux :
1. **Fichier `.env`** : Token, URI MongoDB, et autres secrets
2. **Base de données** : Configuration par serveur (paramétrable via commandes Discord)

## Variables d'Environnement (.env)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Token du bot | `MTIzNDU2Nzg5...` |
| `CLIENT_ID` | ID de l'application | `123456789012345678` |
| `GUILD_ID` | ID du serveur dev (optionnel) | `987654321098765432` |
| `MONGODB_URI` | URI MongoDB | `mongodb+srv://...` |
| `DEFAULT_LANGUAGE` | Langue par défaut | `fr` |
| `LOG_LEVEL` | Niveau de logs | `info` |
| `NODE_ENV` | Environnement | `production` |

## Configuration par Serveur (via Discord)

Toute la configuration est stockée dans MongoDB et configurable via des commandes Discord.

### Commandes de Configuration

#### Voir la configuration
```
/config view module:moderation
/config view module:logs
/config view module:antiraid
/config view module:levels
/config view module:economy
```

#### Modifier un paramètre
```
/config set module:levels key:xpPerMessage value:20
/config set module:economy key:currencyName value:Pièces
/config set module:economy key:dailyAmount value:150
```

#### Réinitialiser un module
```
/config reset module:levels
```

## Modules Disponibles

Chaque module peut être activé/désactivé :

| Module | Description | Par défaut |
|--------|-------------|------------|
| `moderation` | Ban, kick, mute, warn | ✅ Activé |
| `logs` | Système de logs | ✅ Activé |
| `antiraid` | Protection anti-raid | ✅ Activé |
| `automod` | Auto-modération | ✅ Activé |
| `tickets` | Tickets de support | ✅ Activé |
| `levels` | Système XP/Niveaux | ✅ Activé |
| `economy` | Économie virtuelle | ✅ Activé |
| `music` | Lecteur de musique | ✅ Activé |
| `voiceTracking` | Tracking vocal | ✅ Activé |
| `giveaways` | Tirages au sort | ✅ Activé |
| `autoroles` | Rôles automatiques | ✅ Activé |
| `suggestions` | Suggestions | ✅ Activé |
| `stats` | Statistiques | ✅ Activé |
| `backup` | Backups automatiques | ✅ Activé |

## Configuration des Logs

### Setup automatique
```
/setup preset:simple    # 4 salons de logs
/setup preset:complete  # 8 salons de logs
/setup preset:extreme   # 12+ salons de logs
```

### Configuration individuelle
Chaque type de log peut être configuré individuellement via la base de données. Les types disponibles sont :

**Modération** : `moderation.ban`, `moderation.kick`, `moderation.mute`, `moderation.warn`

**Messages** : `message.delete`, `message.edit`, `message.bulk_delete`

**Membres** : `member.join`, `member.leave`, `member.role_add`, `member.role_remove`, `member.nickname`, `member.avatar`

**Vocal** : `voice.join`, `voice.leave`, `voice.move`, `voice.mute`, `voice.deafen`

**Serveur** : `server.channel_create`, `server.channel_delete`, `server.role_create`, `server.role_delete`

**Invitations** : `invite.create`, `invite.delete`, `invite.used`

**Anti-raid** : `antiraid.triggered`, `antiraid.action`

## Configuration Anti-Raid

### Paramètres
```
/antiraid config
```

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `joinThreshold` | Nombre de joins pour déclencher | 10 |
| `joinTimeWindow` | Fenêtre de temps (ms) | 10000 |
| `adminActionThreshold` | Actions admin suspectes | 5 |
| `adminActionTimeWindow` | Fenêtre actions admin (ms) | 30000 |

### Actions configurables
- Verrouiller les salons textuels
- Désactiver les invitations
- Kick les nouveaux arrivants
- Bannir les comptes récents
- Passer la vérification au maximum

## Configuration Auto-Modération

| Filtre | Paramètres | Action par défaut |
|--------|-----------|-------------------|
| Anti-spam | 5 messages en 5 secondes | warn |
| Anti-liens | URLs non autorisées | warn |
| Anti-mention | Max 5 mentions par message | warn |
| Anti-caps | 70% majuscules (min 10 chars) | warn |
| Anti-flood | Messages identiques répétés | warn |

Actions possibles : `warn`, `mute`, `kick`, `ban`

## Configuration XP/Niveaux

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `xpPerMessage` | XP base par message | 15-25 (aléatoire) |
| `xpCooldown` | Cooldown entre gains (ms) | 60000 |
| `levelUpChannelId` | Salon notifications level-up | null (DM) |
| `multipliers.roles` | Multiplicateurs par rôle | {} |
| `multipliers.channels` | Multiplicateurs par salon | {} |
| `rewards` | Rôles par niveau | [] |

### Multiplicateurs
```javascript
// Exemple de configuration
multipliers: {
  roles: {
    "BOOSTER_ROLE_ID": 2.0,    // Boosters = x2 XP
    "VIP_ROLE_ID": 1.5         // VIP = x1.5 XP
  },
  channels: {
    "CHANNEL_ID": 1.5          // Salon actif = x1.5 XP
  }
}
```

### Récompenses par niveau
```javascript
rewards: [
  { level: 5, roleId: "ROLE_ACTIF_ID" },
  { level: 10, roleId: "ROLE_REGULIER_ID" },
  { level: 20, roleId: "ROLE_VETERAN_ID" }
]
```

## Configuration Économie

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `currencyName` | Nom de la monnaie | Coins |
| `currencySymbol` | Symbole | 🪙 |
| `dailyAmount` | Récompense quotidienne | 100 |
| `weeklyAmount` | Récompense hebdomadaire | 500 |
| `messageGain` | Gain par message | 1-3 |

## Configuration des Tickets

| Paramètre | Description |
|-----------|-------------|
| `categoryId` | ID de la catégorie pour les tickets |
| `logChannelId` | Salon pour les logs de tickets |
| `transcriptChannelId` | Salon pour les transcripts |
| `categories` | Catégories disponibles |

## Couleurs par Défaut

Les couleurs des embeds sont configurables :

```javascript
colors: {
  success: '#00FF00',    // Vert - Actions réussies
  error: '#FF0000',      // Rouge - Erreurs
  warning: '#FFA500',    // Orange - Avertissements
  info: '#0099FF',       // Bleu - Informations
  moderation: '#E74C3C', // Rouge foncé - Modération
  levels: '#9B59B6',     // Violet - Niveaux
  economy: '#F1C40F',    // Jaune - Économie
  music: '#3498DB'       // Bleu clair - Musique
}
```

## Internationalisation

Le bot supporte le français et l'anglais par défaut.

### Changer la langue
```
/language lang:en
/language lang:fr
```

### Ajouter une langue
1. Copiez `locales/fr.json` vers `locales/xx.json` (code de langue)
2. Traduisez toutes les chaînes
3. La nouvelle langue sera automatiquement disponible
