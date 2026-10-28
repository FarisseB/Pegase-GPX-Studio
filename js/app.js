/**
 * app.js — Point d'entrée et orchestration de Pégase GPX Studio
 * 
 * État global partagé (PegaseState) et fonctions d'orchestration :
 * showLogin(), showDashboard(), loadDashboard(), renderDeviceTelemetry()
 * 
 * Dépend de : config.js, api.js, utils.js, auth.js, map.js, rides.js, gpx.js
 */

// Navigation entre login et dashboard
function showLogin() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('headerActions').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';
  document.getElementById('headerActions').style.display = 'flex';
  setTimeout(() => { map.invalidateSize(); }, 200);
}

// Load Dashboard Data with Instant Local Display and Incremental Sync
async function loadDashboard(forceFullSync = false) {
  showDashboard();
  
  const syncBadge = document.getElementById('syncBadge');
  const hasLocalData = PegaseState.allRides && PegaseState.allRides.length > 0;

  // 1. AFFICHAGE INSTANTANÉ (0 ms) : Si des trajets sont déjà enregistrés en local sur le disque dur
  if (hasLocalData && !forceFullSync) {
    if (syncBadge) {
      syncBadge.style.display = 'inline-flex';
      syncBadge.className = 'pill pill-emerald';
      syncBadge.textContent = `💾 Base locale : ${PegaseState.allRides.length} trajets`;
    }
    if (typeof applyFilters === 'function') {
      applyFilters();
    } else {
      renderRidesTable(PegaseState.allRides);
    }
  } else {
    // Premier chargement ou re-synchronisation complète forcée
    document.getElementById('ridesTableBody').innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Récupération des données du traceur et de l'historique...</td></tr>`;
  }

  // 2. REQUÊTE VERS L'API PÉGASE :
  // Si nous avons déjà les données en local, on ne demande que les 30 derniers trajets (sync incrémentale ultra-légère).
  // Si c'est un premier démarrage ou un rafraîchissement forcé, on charge par lots de MAX_RIDES_FETCH (500).
  const fetchCount = (hasLocalData && !forceFullSync) ? 30 : PegaseConfig.MAX_RIDES_FETCH;

  const query = `
    query GetDashboardData {
      user {
        id
        email
        firstName
        lastName
        currentDevice {
          id
          name
          latitude
          longitude
          lastGpsCoordinatesTimestamp
          batteryVoltageInMillivolt
          batteryPercentage
          status {
            isConnectedToGSM
            lastPollingTimestamp
          }
          lockEnabled
          isStolen
          motorcycle {
            brand {
              label
            }
            model {
              label
            }
            licensePlate
          }
          rideConnection(first: ${fetchCount}, includeShortRides: true) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                startTime
                endTime
                distance
                effectiveDuration
                length
                startLocation
                endLocation
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await callGraphQL(query);
    PegaseState.currentUser = data.user;
    PegaseState.currentDevice = PegaseState.currentUser.currentDevice;

    if (!PegaseState.currentDevice) {
      throw new Error("Aucun traceur actif détecté sur ce compte.");
    }

    renderDeviceTelemetry(PegaseState.currentDevice);

    const conn = PegaseState.currentDevice.rideConnection;
    const fetchedNodes = (conn && conn.edges) ? conn.edges.map(e => e.node) : [];

    if (hasLocalData && !forceFullSync) {
      // SYNCHRONISATION INCRÉMENTALE :
      // On compare les 30 derniers trajets du serveur avec notre base locale
      const existingIds = new Set(PegaseState.allRides.map(r => r.id));
      const newRides = fetchedNodes.filter(n => !existingIds.has(n.id));

      if (newRides.length > 0) {
        console.log(`[Sync incrémentale] ${newRides.length} nouveau(x) trajet(s) détecté(s).`);
        newRides.forEach(n => {
          PegaseState.allRides.unshift(n);
          existingIds.add(n.id);
        });

        // Tri chronologique décroissant
        PegaseState.allRides.sort((a,b) => {
          const tA = parseTimestamp(a.startTime)?.getTime() || 0;
          const tB = parseTimestamp(b.startTime)?.getTime() || 0;
          return tB - tA;
        });

        // Sauvegarde immédiate sur le disque dur local
        saveLocalRidesHistory();

        if (typeof applyFilters === 'function') {
          applyFilters();
        }

        if (syncBadge) {
          syncBadge.style.display = 'inline-flex';
          syncBadge.className = 'pill pill-emerald';
          syncBadge.textContent = `💾 Base à jour : +${newRides.length} nouveau(x) (${PegaseState.allRides.length} trajets)`;
        }
      } else {
        console.log(`[Sync incrémentale] Base locale à jour (aucun nouveau trajet).`);
        if (syncBadge) {
          syncBadge.style.display = 'inline-flex';
          syncBadge.className = 'pill pill-emerald';
          syncBadge.textContent = `💾 Base locale à jour (${PegaseState.allRides.length} trajets)`;
        }
      }

    } else {
      // PREMIÈRE INITIALISATION OU RE-SYNCHRONISATION FORCÉE :
      PegaseState.allRides = fetchedNodes.sort((a,b) => {
        const tA = parseTimestamp(a.startTime)?.getTime() || 0;
        const tB = parseTimestamp(b.startTime)?.getTime() || 0;
        return tB - tA;
      });

      console.log(`Premier lot reçu : ${PegaseState.allRides.length} trajets.`);
      if (typeof applyFilters === 'function') {
        applyFilters();
      } else {
        renderRidesTable(PegaseState.allRides);
      }

      // Sauvegarde du premier lot en local
      saveLocalRidesHistory();

      // Si d'autres trajets existent, lancer la pagination complète en tâche de fond
      if (conn && conn.pageInfo && conn.pageInfo.hasNextPage && conn.pageInfo.endCursor) {
        await loadAllRemainingRides(conn.pageInfo.endCursor);
      } else {
        if (syncBadge) {
          syncBadge.style.display = 'inline-flex';
          syncBadge.className = 'pill pill-emerald';
          syncBadge.textContent = `💾 Base locale : ${PegaseState.allRides.length} trajets`;
        }
      }
    }

  } catch (err) {
    console.error(err);
    if (err.message.includes('401') || err.message.toLowerCase().includes('token') || err.message.includes('notAuthenticated')) {
      localStorage.removeItem(PegaseConfig.STORAGE_KEY_TOKEN);
      PegaseState.authToken = null;
      showLogin();
      const loginError = document.getElementById('loginError');
      loginError.textContent = "Session expirée. Veuillez vous reconnecter.";
      loginError.style.display = 'block';
    } else {
      // Si une erreur réseau survient alors qu'on a déjà les données locales, on n'interrompt pas l'utilisateur
      if (hasLocalData) {
        console.warn("Connexion réseau indisponible, fonctionnement avec les données locales.");
        if (syncBadge) {
          syncBadge.style.display = 'inline-flex';
          syncBadge.className = 'pill pill-amber';
          syncBadge.textContent = `💾 Base locale (Hors-ligne) : ${PegaseState.allRides.length} trajets`;
        }
      } else {
        alert("Erreur lors de la récupération des données : " + err.message);
      }
    }
  }
}

// Background pagination loop to fetch 100% of all history (3000+ rides) and persist to disk
async function loadAllRemainingRides(initialCursor) {
  let cursor = initialCursor;
  let hasNext = true;

  const statusBadge = document.getElementById('ridesLoadingStatus');
  const syncBadge = document.getElementById('syncBadge');

  if (statusBadge) {
    statusBadge.style.display = 'inline-flex';
    statusBadge.classList.remove('pill-emerald');
    statusBadge.classList.add('pill-amber');
    statusBadge.textContent = `📥 Téléchargement historique : ${PegaseState.allRides.length} trajets...`;
  }

  const query = `
    query GetMoreRides($first: Int!, $after: String, $includeShortRides: Boolean) {
      user {
        currentDevice {
          id
          rideConnection(first: $first, after: $after, includeShortRides: $includeShortRides) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                startTime
                endTime
                distance
                effectiveDuration
                length
                startLocation
                endLocation
              }
            }
          }
        }
      }
    }
  `;

  while (hasNext && cursor) {
    try {
      const data = await callGraphQL(query, {
        first: PegaseConfig.MAX_RIDES_FETCH || 500,
        after: cursor,
        includeShortRides: true
      });

      if (!data || !data.user || !data.user.currentDevice || !data.user.currentDevice.rideConnection) {
        break;
      }

      const conn = data.user.currentDevice.rideConnection;
      const newNodes = (conn.edges || []).map(e => e.node);

      if (newNodes.length === 0) {
        break;
      }

      // Append new rides without duplicates
      const existingIds = new Set(PegaseState.allRides.map(r => r.id));
      newNodes.forEach(n => {
        if (!existingIds.has(n.id)) {
          PegaseState.allRides.push(n);
          existingIds.add(n.id);
        }
      });

      // Sort chronological descending
      PegaseState.allRides.sort((a,b) => {
        const tA = parseTimestamp(a.startTime)?.getTime() || 0;
        const tB = parseTimestamp(b.startTime)?.getTime() || 0;
        return tB - tA;
      });

      // Save intermediate batch to disk
      saveLocalRidesHistory();

      if (statusBadge) {
        statusBadge.textContent = `📥 Téléchargement historique : ${PegaseState.allRides.length} trajets...`;
      }

      // Update table & counters dynamically
      if (typeof applyFilters === 'function') {
        applyFilters();
      }

      hasNext = conn.pageInfo ? conn.pageInfo.hasNextPage : false;
      cursor = conn.pageInfo ? conn.pageInfo.endCursor : null;

      // Small 200ms delay to keep UI smooth and prevent rate limiting
      await new Promise(res => setTimeout(res, 200));

    } catch (err) {
      console.warn("[Pagination] Erreur récupération lot:", err);
      break;
    }
  }

  // Final save to local storage
  saveLocalRidesHistory();

  if (syncBadge) {
    syncBadge.style.display = 'inline-flex';
    syncBadge.className = 'pill pill-emerald';
    syncBadge.textContent = `💾 Base locale : ${PegaseState.allRides.length} trajets`;
  }

  if (statusBadge) {
    statusBadge.textContent = `✅ Tous les ${PegaseState.allRides.length} trajets enregistrés en local`;
    statusBadge.classList.remove('pill-amber');
    statusBadge.classList.add('pill-emerald');
    setTimeout(() => {
      statusBadge.style.display = 'none';
      statusBadge.classList.remove('pill-emerald');
      statusBadge.classList.add('pill-amber');
    }, 6000);
  }
}

// Render Telemetry
function renderDeviceTelemetry(dev) {
  // Vehicle Badge
  const moto = dev.motorcycle;
  const deviceBadge = document.getElementById('deviceBadge');
  if (moto) {
    const brandLabel = (moto.brand && moto.brand.label) ? moto.brand.label : '';
    const modelLabel = (moto.model && moto.model.label) ? moto.model.label : '';
    const plate = moto.licensePlate ? `(${moto.licensePlate})` : '';
    const title = `${brandLabel} ${modelLabel} ${plate}`.trim();
    deviceBadge.textContent = title ? `🏍️ ${title}` : `🏍️ ${dev.name || 'Pégase Moto'}`;
  } else {
    deviceBadge.textContent = `🏍️ ${dev.name || 'Pégase Moto'}`;
  }

  // Battery
  const mv = dev.batteryVoltageInMillivolt;
  const valBatteryVoltage = document.getElementById('valBatteryVoltage');
  const badgeBatteryHealth = document.getElementById('badgeBatteryHealth');
  if (mv) {
    const volts = (mv / 1000).toFixed(2);
    valBatteryVoltage.innerHTML = `${volts} <span class="stat-unit">V</span>`;
    if (volts >= 12.4) {
      badgeBatteryHealth.className = 'pill pill-emerald';
      badgeBatteryHealth.textContent = 'Optimale (100%)';
    } else if (volts >= 12.0) {
      badgeBatteryHealth.className = 'pill pill-amber';
      badgeBatteryHealth.textContent = 'Correcte';
    } else {
      badgeBatteryHealth.className = 'pill pill-rose';
      badgeBatteryHealth.textContent = 'Faible (< 12V)';
    }
  } else {
    valBatteryVoltage.innerHTML = `-- <span class="stat-unit">V</span>`;
  }

  // Lock status
  const valLockStatus = document.getElementById('valLockStatus');
  const badgeLockPill = document.getElementById('badgeLockPill');
  if (dev.lockEnabled) {
    valLockStatus.textContent = 'Armé 🔒';
    badgeLockPill.className = 'pill pill-emerald';
    badgeLockPill.textContent = 'Surveillance active';
  } else {
    valLockStatus.textContent = 'Désarmé 🔓';
    badgeLockPill.className = 'pill pill-amber';
    badgeLockPill.textContent = 'Désactivé';
  }

  // GPS Position & Map Marker
  const valCoordinates = document.getElementById('valCoordinates');
  const valGpsTimestamp = document.getElementById('valGpsTimestamp');
  if (dev.latitude && dev.longitude) {
    valCoordinates.textContent = `${dev.latitude.toFixed(4)}, ${dev.longitude.toFixed(4)}`;
    
    if (dev.lastGpsCoordinatesTimestamp) {
      const date = parseTimestamp(dev.lastGpsCoordinatesTimestamp);
      valGpsTimestamp.textContent = date ? date.toLocaleString('fr-FR') : 'Date inconnue';
    }

    // Place on Map
    updateMotoMarker(dev.latitude, dev.longitude, dev.name || 'Votre Moto');
  } else {
    valCoordinates.textContent = 'Non disponible';
  }

  // Total count
  document.getElementById('valTotalRidesCount').innerHTML = `${PegaseState.allRides.length} <span class="stat-unit">trajets</span>`;
}

// Init App — point d'entrée principal
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  initMapEvents();
  initAuth();
  initRidesEvents();
  if (typeof initCockpit === 'function') {
    initCockpit();
  }

  // Bouton Synchroniser (vérification incrémentale ultra-rapide des nouveaux trajets uniquement)
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadDashboard(false);
    });
  }

  // Bouton Re-synchronisation complète (télécharger tout l'historique de 3000+ trajets depuis zéro)
  const btnFullResync = document.getElementById('btnFullResync');
  if (btnFullResync) {
    btnFullResync.addEventListener('click', () => {
      if (confirm("Voulez-vous forcer le re-téléchargement complet de tout l'historique depuis les serveurs Pégase ?")) {
        loadDashboard(true);
      }
    });
  }

  // Si un token existe, charger directement le dashboard (instantané depuis le cache local)
  if (PegaseState.authToken) {
    loadDashboard(false);
  } else {
    showLogin();
  }
});
