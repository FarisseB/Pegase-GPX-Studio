/**
 * config.js — Configuration globale & Persistance locale de Pégase GPX Studio
 * 
 * Centralise les constantes et l'état global avec sauvegarde locale sur disque (localStorage).
 */

var PegaseConfig = {
  // Endpoint GraphQL de l'API Pégase / SMT Performances
  API_ENDPOINT: 'https://pegase.api-smt.ovh/graphql',

  // Clé API CARTO pour les tuiles de la carte
  CARTO_API_KEY: 'cb1_4wf7_1_9b4be5c937778dd04a5d1d32',

  // URL template des tuiles cartographiques
  TILE_URL: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',

  // Coordonnées par défaut (Bruxelles) pour l'initialisation de la carte
  DEFAULT_LAT: 50.8503,
  DEFAULT_LNG: 4.3517,
  DEFAULT_ZOOM: 12,

  // Nombre de trajets par lot de pagination (batch)
  MAX_RIDES_FETCH: 500,

  // Clés de stockage local sur votre disque dur
  STORAGE_KEY_TOKEN: 'pegase_token',
  STORAGE_KEY_RIDES: 'pegase_rides_history',
  STORAGE_KEY_TELEMETRY: 'pegase_telemetry_cache',
};

// État global partagé entre tous les modules (défini au plus tôt)
var PegaseState = {
  authToken: localStorage.getItem(PegaseConfig.STORAGE_KEY_TOKEN) || null,
  currentUser: null,
  currentDevice: null,
  allRides: [],
  selectedRideIds: new Set(),
  telemetryCache: {},
  activeRideId: null, // ID du trajet actuellement affiché sur la carte & cockpit
};

if (typeof window !== 'undefined') {
  window.PegaseConfig = PegaseConfig;
  window.PegaseState = PegaseState;
}

// 1. Charger l'historique complet des trajets sauvegardé en local (disque dur)
try {
  const savedRides = localStorage.getItem(PegaseConfig.STORAGE_KEY_RIDES);
  if (savedRides) {
    PegaseState.allRides = JSON.parse(savedRides);
    console.log(`[Base locale] ${PegaseState.allRides.length} trajets chargés depuis le stockage local.`);
  } else {
    PegaseState.allRides = [];
  }
} catch (e) {
  console.warn("[Base locale] Impossible de lire l'historique local:", e);
  PegaseState.allRides = [];
}

// 2. Charger le cache de télémétrie persisté (vitesses max, angles, freinages)
try {
  const savedCache = localStorage.getItem(PegaseConfig.STORAGE_KEY_TELEMETRY);
  if (savedCache) {
    PegaseState.telemetryCache = JSON.parse(savedCache);
  }
} catch (e) {
  PegaseState.telemetryCache = {};
}

// Helper pour sauvegarder l'historique des trajets sur le disque dur (localStorage)
function saveLocalRidesHistory() {
  try {
    localStorage.setItem(PegaseConfig.STORAGE_KEY_RIDES, JSON.stringify(PegaseState.allRides));
    console.log(`[Base locale] ${PegaseState.allRides.length} trajets sauvegardés en mémoire locale.`);
    return true;
  } catch (e) {
    console.warn("[Base locale] Erreur lors de la sauvegarde sur disque:", e);
    return false;
  }
}

// Helper pour effacer la base locale si besoin
function clearLocalRidesHistory() {
  try {
    localStorage.removeItem(PegaseConfig.STORAGE_KEY_RIDES);
    PegaseState.allRides = [];
    console.log("[Base locale] Historique local effacé.");
  } catch (e) {}
}
