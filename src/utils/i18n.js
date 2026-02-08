const fs = require('fs');
const path = require('path');

/**
 * Répertoire contenant les fichiers de traduction (fr.json, en.json, etc.)
 */
const LOCALES_DIR = path.join(__dirname, '..', '..', 'locales');

/**
 * Langue par défaut utilisée si aucune langue n'est spécifiée.
 * Peut être modifiée via la méthode setDefaultLanguage().
 */
let defaultLanguage = 'fr';

/**
 * Cache des fichiers de traduction déjà chargés.
 * Clé : code de langue (ex: 'fr'), Valeur : objet JSON de traductions.
 * Évite de relire les fichiers à chaque appel de traduction.
 */
const localeCache = new Map();

/**
 * Charge un fichier de traduction depuis le disque et le met en cache.
 * Si le fichier est déjà en cache, le retourne directement sans relecture.
 *
 * @param {string} language - Code de la langue à charger (ex: 'fr', 'en')
 * @returns {object|null} L'objet de traductions ou null si le fichier n'existe pas
 */
function loadLocale(language) {
    // Vérifier si la locale est déjà en cache pour éviter une lecture disque inutile
    if (localeCache.has(language)) {
        return localeCache.get(language);
    }

    const filePath = path.join(LOCALES_DIR, `${language}.json`);

    // Vérifier que le fichier de traduction existe sur le disque
    if (!fs.existsSync(filePath)) {
        console.warn(`[i18n] Fichier de traduction introuvable : ${filePath}`);
        return null;
    }

    try {
        // Lire et parser le fichier JSON de traduction
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const localeData = JSON.parse(fileContent);

        // Stocker en cache pour les prochains appels
        localeCache.set(language, localeData);

        return localeData;
    } catch (err) {
        console.error(`[i18n] Erreur lors du chargement de la locale "${language}" : ${err.message}`);
        return null;
    }
}

/**
 * Accède à une valeur imbriquée dans un objet à partir d'une clé en notation pointée.
 * Par exemple, la clé "commands.ban.success" accédera à obj.commands.ban.success.
 *
 * @param {object} obj - L'objet dans lequel chercher
 * @param {string} key - La clé en notation pointée (ex: 'commands.ban.success')
 * @returns {string|undefined} La valeur trouvée ou undefined si le chemin n'existe pas
 */
function getNestedValue(obj, key) {
    // Découper la clé par les points et parcourir l'objet étape par étape
    return key.split('.').reduce((current, part) => {
        if (current === undefined || current === null) return undefined;
        return current[part];
    }, obj);
}

/**
 * Remplace les variables dans un texte avec la syntaxe {variable}.
 * Les variables non trouvées dans l'objet de remplacement sont laissées telles quelles.
 *
 * @param {string} text - Le texte contenant les variables à remplacer
 * @param {object} variables - Objet clé/valeur des remplacements à effectuer
 * @returns {string} Le texte avec les variables remplacées
 */
function interpolate(text, variables) {
    if (!variables || typeof variables !== 'object') return text;

    // Remplacer chaque occurrence de {nomVariable} par sa valeur correspondante
    return text.replace(/\{(\w+)\}/g, (match, varName) => {
        // Si la variable existe dans l'objet, la remplacer ; sinon, garder le placeholder
        return variables[varName] !== undefined ? String(variables[varName]) : match;
    });
}

/**
 * Traduit une clé dans la langue demandée avec interpolation de variables.
 *
 * Processus :
 * 1. Charge la locale demandée (ou la langue par défaut)
 * 2. Cherche la clé dans l'objet de traductions
 * 3. Si introuvable, tente un repli vers la langue par défaut
 * 4. Effectue l'interpolation des variables {variable}
 * 5. Retourne la clé brute si aucune traduction n'est trouvée
 *
 * @param {string} key - Clé de traduction en notation pointée (ex: 'commands.ban.success')
 * @param {object} [variables={}] - Variables à injecter dans le texte traduit
 * @param {string} [language] - Code langue (par défaut : langue configurée)
 * @returns {string} Le texte traduit avec les variables interpolées
 */
function translate(key, variables = {}, language = null) {
    const lang = language || defaultLanguage;

    // Charger la locale demandée
    const locale = loadLocale(lang);

    if (locale) {
        // Chercher la traduction dans la locale chargée
        const value = getNestedValue(locale, key);
        if (value !== undefined && typeof value === 'string') {
            return interpolate(value, variables);
        }
    }

    // Repli vers la langue par défaut si la clé n'est pas trouvée dans la langue demandée
    if (lang !== defaultLanguage) {
        const fallbackLocale = loadLocale(defaultLanguage);
        if (fallbackLocale) {
            const fallbackValue = getNestedValue(fallbackLocale, key);
            if (fallbackValue !== undefined && typeof fallbackValue === 'string') {
                return interpolate(fallbackValue, variables);
            }
        }
    }

    // Si aucune traduction n'est trouvée nulle part, retourner la clé brute
    return key;
}

/**
 * Modifie la langue par défaut du système de traduction.
 * Affecte tous les appels à translate() qui ne spécifient pas de langue.
 *
 * @param {string} language - Le nouveau code de langue par défaut (ex: 'fr', 'en')
 */
function setDefaultLanguage(language) {
    defaultLanguage = language;
}

/**
 * Retourne la langue par défaut actuellement configurée.
 *
 * @returns {string} Le code de la langue par défaut
 */
function getDefaultLanguage() {
    return defaultLanguage;
}

/**
 * Vide le cache des traductions chargées.
 * Utile si les fichiers de traduction ont été modifiés pendant l'exécution
 * et qu'il faut forcer une relecture depuis le disque.
 */
function clearCache() {
    localeCache.clear();
}

/**
 * Recharge une locale spécifique depuis le disque en vidant son cache.
 * Pratique pour recharger une seule langue sans affecter les autres.
 *
 * @param {string} language - Le code de langue à recharger
 * @returns {object|null} L'objet de traductions rechargé, ou null en cas d'erreur
 */
function reloadLocale(language) {
    // Supprimer l'entrée du cache pour forcer une relecture
    localeCache.delete(language);
    return loadLocale(language);
}

/**
 * Retourne la liste des langues disponibles (basée sur les fichiers .json du dossier locales/).
 *
 * @returns {string[]} Tableau des codes de langues disponibles (ex: ['fr', 'en'])
 */
function getAvailableLanguages() {
    try {
        // Lister les fichiers .json et extraire les noms sans extension
        return fs.readdirSync(LOCALES_DIR)
            .filter(file => file.endsWith('.json'))
            .map(file => path.basename(file, '.json'));
    } catch (err) {
        console.error(`[i18n] Erreur lors de la lecture du dossier des locales : ${err.message}`);
        return [];
    }
}

/**
 * Raccourci pour la fonction translate().
 * Permet d'utiliser t() au lieu de translate() pour plus de concision.
 */
const t = translate;

module.exports = {
    translate,
    t,
    setDefaultLanguage,
    getDefaultLanguage,
    clearCache,
    reloadLocale,
    loadLocale,
    getAvailableLanguages,
};
