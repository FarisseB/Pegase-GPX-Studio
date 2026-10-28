/**
 * rides.js — Gestion de la table des trajets, filtres avancés, tri et calcul fiable de la vitesse max
 * 
 * Dépend de : utils.js, map.js, gpx.js, app.js (PegaseState)
 */

// Current sort & prefetch state
var currentSortKey = 'date';
var currentSortDir = 'desc'; // 'asc' | 'desc'
var isPrefetching = false;
var cancelPrefetch = false;

// Render Rides Table
function renderRidesTable(rides) {
  const ridesTableBody = document.getElementById('ridesTableBody');
  ridesTableBody.innerHTML = '';

  if (!rides || rides.length === 0) {
    ridesTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 40px;">Aucun trajet correspondant aux filtres.</td></tr>`;
    document.getElementById('valTotalRidesCount').innerHTML = `0 <span class="stat-unit">trajet</span>`;
    document.getElementById('valTotalDistance').textContent = `0 km cumulés`;
    updatePrefetchButtonUI();
    return;
  }

  let totalKm = 0;
  rides.forEach(ride => {
    const isChecked = PegaseState.selectedRideIds.has(ride.id);
    const isActiveView = (PegaseState.activeRideId === ride.id);

    const tr = document.createElement('tr');
    tr.id = `ride-row-${ride.id}`;
    if (isChecked) tr.classList.add('selected-row');
    if (isActiveView) tr.classList.add('active-view-row');

    const dateStr = formatRideDate(ride.startTime);
    const distanceKm = getRideDistanceKm(ride);
    const distanceDisplay = formatRideDistance(ride);
    totalKm += distanceKm;

    const durationFormatted = getRideDuration(ride);
    const avgSpeed = getAverageSpeed(ride);

    // Telemetry cache lookup
    const cached = PegaseState.telemetryCache && PegaseState.telemetryCache[ride.id];

    let maxSpeedDisplay = `<span id="cell-max-speed-${ride.id}" style="color: var(--text-dim); font-size: 0.8rem;">--</span>`;
    let badgeHtml = `<div id="telemetry-badge-${ride.id}">`;

    if (cached && cached.calculated) {
      if (cached.maxSpeed && cached.maxSpeed > 0) {
        maxSpeedDisplay = `<span id="cell-max-speed-${ride.id}"><strong style="color: #fbbf24; font-size: 0.95rem;">⚡ ${cached.maxSpeed} km/h</strong></span>`;
        const parts = [];
        parts.push(`⚡ ${cached.maxSpeed} km/h`);
        if (cached.maxBrakingG) parts.push(`🛑 ${cached.maxBrakingG} G`);
        if (cached.maxTilt) parts.push(`📐 ${cached.maxTilt}°`);
        badgeHtml += `<div class="ride-telemetry-badge">${parts.join(' &bull; ')}</div>`;
      } else {
        maxSpeedDisplay = `<span id="cell-max-speed-${ride.id}" style="color: var(--text-dim); font-size: 0.78rem;">0 km/h</span>`;
      }
    }
    badgeHtml += `</div>`;

    // Location / drift indicator
    let locationSubtitle = '';
    if (distanceKm < 0.05 || (ride.length && ride.length <= 2)) {
      const meters = Math.round(distanceKm * 1000);
      locationSubtitle = `<div style="font-size: 0.75rem; color: #fb7185; opacity: 0.85;">⚠️ Dérive GPS stationnement (${meters} m en ${durationFormatted})</div>`;
    } else if (ride.startLocation || ride.endLocation) {
      locationSubtitle = `<div style="font-size: 0.75rem; color: var(--text-dim);">${ride.startLocation || 'Inconnu'} ➔ ${ride.endLocation || 'Inconnu'}</div>`;
    } else {
      locationSubtitle = `<div style="font-size: 0.75rem; color: var(--text-dim);">Lieu non géocodé</div>`;
    }

    const title = ride.name || (ride.startLocation && ride.endLocation ? `${ride.startLocation} ➔ ${ride.endLocation}` : `Balade du ${dateStr.split(' ')[0]}`);

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="ride-checkbox" data-id="${ride.id}" ${isChecked ? 'checked' : ''}>
      </td>
      <td>
        <div class="ride-date" title="Timestamp brut : ${ride.startTime}">${dateStr}</div>
      </td>
      <td>
        <div class="ride-title">
          🏍️ ${title}
          ${isActiveView ? '<span class="badge-active-trace">📍 Affiché</span>' : ''}
        </div>
        ${locationSubtitle}
        ${badgeHtml}
      </td>
      <td>
        <strong style="color: #38bdf8;" title="Valeur brute distance : ${ride.distance}">${distanceDisplay}</strong>
      </td>
      <td>
        <span style="color: var(--text-muted);" title="Valeur brute durée : ${ride.effectiveDuration}">${durationFormatted}</span>
      </td>
      <td>
        <span style="color: var(--text-main); font-weight: 500; font-size: 0.85rem;">${avgSpeed}</span>
      </td>
      <td>
        ${maxSpeedDisplay}
      </td>
      <td>
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--text-dim);">
          ${ride.length || 0} pts
        </span>
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn ${isActiveView ? 'btn-active-trace' : 'btn-secondary'} btn-sm btn-view-trace" data-id="${ride.id}" title="${isActiveView ? 'Ce trajet est actuellement affiché sur la carte' : 'Afficher le tracé sur la carte'}">
          ${isActiveView ? '📍 Actif' : '🗺️ Voir'}
        </button>
        <button class="btn btn-primary btn-sm btn-download-single" data-id="${ride.id}" title="Télécharger le fichier GPX">📥 GPX</button>
      </td>
    `;

    ridesTableBody.appendChild(tr);
  });

  document.getElementById('valTotalRidesCount').innerHTML = `${rides.length} <span class="stat-unit">trajet${rides.length > 1 ? 's' : ''}</span>`;
  document.getElementById('valTotalDistance').textContent = `${Math.round(totalKm)} km cumulés`;

  attachTableEvents();
  updateSelectionUI();
  updatePrefetchButtonUI();

  // Launch non-blocking background queue for rides not yet calculated
  startTelemetryPrefetchQueue(rides);
}

// Update the prefetch button text & counter
function updatePrefetchButtonUI() {
  const btn = document.getElementById('btnPrefetchSpeeds');
  const countEl = document.getElementById('speedProgressCount');
  if (!btn || !countEl) return;

  const total = PegaseState.allRides.length;
  if (total === 0) {
    countEl.textContent = '0/0';
    return;
  }

  const calculated = PegaseState.allRides.filter(r => {
    return PegaseState.telemetryCache && PegaseState.telemetryCache[r.id] && PegaseState.telemetryCache[r.id].calculated;
  }).length;

  countEl.textContent = `${calculated}/${total}`;

  if (calculated >= total) {
    btn.innerHTML = `✅ Vitesses à jour (${calculated}/${total})`;
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-emerald');
  } else {
    btn.innerHTML = `⚡ Calculer les vitesses (<span id="speedProgressCount">${calculated}/${total}</span>)`;
    btn.classList.remove('btn-emerald');
    btn.classList.add('btn-secondary');
  }
}

// Attach Table Events (checkboxes, buttons)
function attachTableEvents() {
  document.querySelectorAll('.ride-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      if (e.target.checked) {
        PegaseState.selectedRideIds.add(id);
        e.target.closest('tr').classList.add('selected-row');
      } else {
        PegaseState.selectedRideIds.delete(id);
        e.target.closest('tr').classList.remove('selected-row');
      }
      updateSelectionUI();
    });
  });

  // View trace on map
  document.querySelectorAll('.btn-view-trace').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await displayRideTraceOnMap(id);
    });
  });

  // Single download
  document.querySelectorAll('.btn-download-single').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await downloadRides([id]);
    });
  });
}

// Update Selection Counter & Button
function updateSelectionUI() {
  const selectionBadge = document.getElementById('selectionBadge');
  const btnDownloadSelected = document.getElementById('btnDownloadSelected');
  const count = PegaseState.selectedRideIds.size;

  if (count > 0) {
    selectionBadge.style.display = 'inline-block';
    selectionBadge.textContent = `${count} trajet${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`;
    btnDownloadSelected.disabled = false;
    btnDownloadSelected.textContent = `📥 Télécharger la sélection (${count} GPX)`;
  } else {
    selectionBadge.style.display = 'none';
    btnDownloadSelected.disabled = true;
    btnDownloadSelected.textContent = `📥 Télécharger les trajets sélectionnés`;
  }
}

// Filter Search, Distance & Speed + Bidirectional Sorting
function applyFilters(readSortFromDropdown = false) {
  const filterInput = document.getElementById('filterInput');
  const query = (filterInput ? filterInput.value : '').toLowerCase().trim();

  const tripFilterEl = document.getElementById('selectTripFilter');
  const tripFilter = tripFilterEl ? tripFilterEl.value : 'rides_1km';

  const speedFilterEl = document.getElementById('selectSpeedFilter');
  const speedFilter = speedFilterEl ? speedFilterEl.value : 'all';

  if (readSortFromDropdown) {
    const sortSelect = document.getElementById('selectSort');
    if (sortSelect && sortSelect.value) {
      const parts = sortSelect.value.split('_');
      currentSortKey = parts[0];
      currentSortDir = parts[1] || 'desc';
    }
  }

  let filtered = PegaseState.allRides.filter(r => {
    const km = getRideDistanceKm(r);
    const pts = r.length || 0;

    // 1. Distance / Type Filter
    if (tripFilter === 'rides_1km' && km < 1.0) return false;
    if (tripFilter === 'rides_10km' && km < 10.0) return false;
    if (tripFilter === 'rides_50km' && km < 50.0) return false;
    if (tripFilter === 'parking_only' && (km >= 1.0 && pts >= 50)) return false;

    // 2. Speed Filter
    if (speedFilter !== 'all') {
      const cached = PegaseState.telemetryCache && PegaseState.telemetryCache[r.id];
      const maxSpd = cached ? (cached.maxSpeed || 0) : 0;
      if (speedFilter === 'speed_50' && maxSpd < 50) return false;
      if (speedFilter === 'speed_90' && maxSpd < 90) return false;
      if (speedFilter === 'speed_130' && maxSpd < 130) return false;
    }

    // 3. Text query (name or location)
    if (query) {
      const name = (r.name || '').toLowerCase();
      const start = (r.startLocation || '').toLowerCase();
      const end = (r.endLocation || '').toLowerCase();
      return name.includes(query) || start.includes(query) || end.includes(query);
    }

    return true;
  });

  // 4. Bidirectional Sorting
  filtered.sort((a, b) => {
    let valA, valB;

    switch (currentSortKey) {
      case 'date':
        valA = parseTimestamp(a.startTime)?.getTime() || 0;
        valB = parseTimestamp(b.startTime)?.getTime() || 0;
        break;
      case 'distance':
        valA = getRideDistanceKm(a);
        valB = getRideDistanceKm(b);
        break;
      case 'duration':
        valA = Number(a.effectiveDuration) || 0;
        valB = Number(b.effectiveDuration) || 0;
        break;
      case 'avgSpeed':
        const spdA = parseFloat(getAverageSpeed(a)) || 0;
        const spdB = parseFloat(getAverageSpeed(b)) || 0;
        if (currentSortDir === 'asc') {
          if (spdA === 0 && spdB > 0) return 1;
          if (spdB === 0 && spdA > 0) return -1;
        }
        valA = spdA;
        valB = spdB;
        break;
      case 'maxSpeed':
        const tA = PegaseState.telemetryCache && PegaseState.telemetryCache[a.id];
        const tB = PegaseState.telemetryCache && PegaseState.telemetryCache[b.id];
        const sA = tA ? (tA.maxSpeed || 0) : 0;
        const sB = tB ? (tB.maxSpeed || 0) : 0;
        // Si tri croissant, placer les vitesses non encore calculées ou égales à 0 tout en bas
        if (currentSortDir === 'asc') {
          if (sA === 0 && sB > 0) return 1;
          if (sB === 0 && sA > 0) return -1;
        }
        valA = sA;
        valB = sB;
        break;
      case 'points':
        valA = a.length || 0;
        valB = b.length || 0;
        break;
      case 'name':
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        const comp = valA.localeCompare(valB);
        return currentSortDir === 'asc' ? comp : -comp;
      default:
        valA = parseTimestamp(a.startTime)?.getTime() || 0;
        valB = parseTimestamp(b.startTime)?.getTime() || 0;
    }

    if (valA === valB) {
      // Départage stable par date décroissante
      const dateA = parseTimestamp(a.startTime)?.getTime() || 0;
      const dateB = parseTimestamp(b.startTime)?.getTime() || 0;
      return dateB - dateA;
    }

    if (currentSortDir === 'asc') {
      return valA > valB ? 1 : -1;
    } else {
      return valA < valB ? 1 : -1;
    }
  });

  updateSortHeadersUI();
  renderRidesTable(filtered);
}

// Mise à jour visuelle des flèches et couleurs sur les colonnes du tableau
function updateSortHeadersUI() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    const sortField = th.getAttribute('data-sort');
    const icon = th.querySelector('.sort-icon');

    if (sortField === currentSortKey) {
      if (currentSortDir === 'asc') {
        th.classList.add('sorted-asc');
        if (icon) icon.textContent = '▲';
        th.setAttribute('title', `Tri croissant (du plus petit au plus grand). Cliquer pour inverser vers décroissant (▼)`);
      } else {
        th.classList.add('sorted-desc');
        if (icon) icon.textContent = '▼';
        th.setAttribute('title', `Tri décroissant (du plus grand au plus petit). Cliquer pour inverser vers croissant (▲)`);
      }
    } else {
      if (icon) icon.textContent = '⇅';
      th.setAttribute('title', `Cliquer pour trier selon cette colonne`);
    }
  });
}

// Surlignage visuel du trajet actuellement sélectionné / visualisé sur la carte
function highlightActiveRideRow(rideId) {
  PegaseState.activeRideId = rideId;

  // Réinitialiser les anciennes lignes actives
  document.querySelectorAll('tr.active-view-row').forEach(row => {
    row.classList.remove('active-view-row');
    const btn = row.querySelector('.btn-view-trace');
    if (btn) {
      btn.classList.remove('btn-active-trace');
      btn.classList.add('btn-secondary');
      btn.textContent = '🗺️ Voir';
      btn.title = 'Afficher le tracé sur la carte';
    }
    const badge = row.querySelector('.badge-active-trace');
    if (badge) badge.remove();
  });

  // Appliquer le surlignage à la ligne correspondante dans le DOM
  const targetRow = document.getElementById(`ride-row-${rideId}`);
  if (targetRow) {
    targetRow.classList.add('active-view-row');
    const btn = targetRow.querySelector('.btn-view-trace');
    if (btn) {
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-active-trace');
      btn.textContent = '📍 Actif';
      btn.title = 'Ce trajet est actuellement affiché sur la carte';
    }
    const titleDiv = targetRow.querySelector('.ride-title');
    if (titleDiv && !titleDiv.querySelector('.badge-active-trace')) {
      const badge = document.createElement('span');
      badge.className = 'badge-active-trace';
      badge.textContent = '📍 Affiché';
      titleDiv.appendChild(badge);
    }
  }

  // Activer le bouton de repérage dans l'en-tête de la carte
  const btnScrollMap = document.getElementById('btnScrollToActiveRide');
  if (btnScrollMap) {
    btnScrollMap.style.display = 'inline-flex';
  }
}

// Fonction pour faire défiler la page et faire pulser la ligne du trajet actif
function scrollToActiveRide() {
  if (!PegaseState.activeRideId) return;

  let targetRow = document.getElementById(`ride-row-${PegaseState.activeRideId}`);

  // Si le trajet est masqué par une recherche ou un filtre, réinitialiser temporairement
  if (!targetRow) {
    const filterInput = document.getElementById('filterInput');
    const tripFilter = document.getElementById('selectTripFilter');
    const speedFilter = document.getElementById('selectSpeedFilter');
    if (filterInput) filterInput.value = '';
    if (tripFilter) tripFilter.value = 'all';
    if (speedFilter) speedFilter.value = 'all';
    applyFilters(false);
    targetRow = document.getElementById(`ride-row-${PegaseState.activeRideId}`);
  }

  if (targetRow) {
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.classList.add('flash-active-row');
    setTimeout(() => {
      targetRow.classList.remove('flash-active-row');
    }, 1600);
  }
}


// Lightweight GraphQL query for summary telemetry (speed, tilt, accel only)
async function fetchRideSummaryTelemetry(rideId) {
  const query = `
    query GetRideSummary($id: ID!) {
      user {
        ride(id: $id) {
          id
          logConnection {
            edges {
              speed
              tilt
              acceleration
            }
          }
        }
      }
    }
  `;

  const data = await callGraphQL(query, { id: rideId });
  if (data && data.user && data.user.ride && data.user.ride.logConnection) {
    return data.user.ride.logConnection.edges || [];
  }
  return [];
}

// Reliable, non-blocking telemetry prefetch queue with automatic retry & rate-limit backoff
async function startTelemetryPrefetchQueue(rides) {
  if (isPrefetching) return;
  isPrefetching = true;
  cancelPrefetch = false;

  const btn = document.getElementById('btnPrefetchSpeeds');

  // Filter rides that need calculation (not yet marked as calculated)
  const pending = (rides || PegaseState.allRides).filter(r => {
    return !PegaseState.telemetryCache || !PegaseState.telemetryCache[r.id] || !PegaseState.telemetryCache[r.id].calculated;
  });

  if (pending.length === 0) {
    isPrefetching = false;
    updatePrefetchButtonUI();
    return;
  }

  for (let i = 0; i < pending.length; i++) {
    if (cancelPrefetch) break;

    const ride = pending[i];

    // Show temporary spinner in cell
    const cell = document.getElementById(`cell-max-speed-${ride.id}`);
    if (cell && cell.textContent === '--') {
      cell.innerHTML = `<span style="color: #38bdf8; font-size: 0.75rem; opacity: 0.8;">⏳ ...</span>`;
    }

    if (btn) {
      const calculated = PegaseState.allRides.filter(r => PegaseState.telemetryCache && PegaseState.telemetryCache[r.id] && PegaseState.telemetryCache[r.id].calculated).length;
      btn.innerHTML = `⏳ Calcul... (${calculated}/${PegaseState.allRides.length})`;
    }

    try {
      // Si le trajet est vide, sans point GPS ou une simple dérive (< 50m ou <= 2 pts), marquer à 0 sans requête API
      const km = getRideDistanceKm(ride);
      const pts = Number(ride.length) || 0;
      if (km < 0.05 || pts <= 2) {
        saveTelemetryToCache(ride.id, { maxSpeed: 0, avgSpeed: 0, maxBrakingG: null, maxTilt: null });
        if (cell) cell.innerHTML = `<span style="color: var(--text-dim); font-size: 0.78rem;">0 km/h</span>`;
        continue;
      }

      // Fetch lightweight telemetry
      const points = await fetchRideSummaryTelemetry(ride.id);
      const telemetry = analyzeRideTelemetry(points);

      saveTelemetryToCache(ride.id, telemetry);
      updateRideRowBadge(ride.id, telemetry);

      if (cell) {
        if (telemetry.maxSpeed && telemetry.maxSpeed > 0) {
          cell.innerHTML = `<strong style="color: #fbbf24; font-size: 0.95rem;">⚡ ${telemetry.maxSpeed} km/h</strong>`;
        } else {
          cell.innerHTML = `<span style="color: var(--text-dim); font-size: 0.78rem;">0 km/h</span>`;
        }
      }

      // Smooth 250ms interval between requests
      await new Promise(res => setTimeout(res, 250));

    } catch (err) {
      console.warn(`[Prefetch] Erreur sur trajet ${ride.id}:`, err.message);

      // If rate limited (429 ou saturation réseau), pause 2s et réessayer une fois
      if (err.message && (err.message.includes('429') || err.message.includes('réseau') || err.message.includes('504') || err.message.includes('timeout'))) {
        console.log('[Prefetch] Pause de 2s puis nouvel essai...');
        await new Promise(res => setTimeout(res, 2000));
        try {
          const retryPoints = await fetchRideSummaryTelemetry(ride.id);
          const telemetry = analyzeRideTelemetry(retryPoints);
          saveTelemetryToCache(ride.id, telemetry);
          updateRideRowBadge(ride.id, telemetry);
          if (cell) {
            cell.innerHTML = (telemetry.maxSpeed && telemetry.maxSpeed > 0)
              ? `<strong style="color: #fbbf24; font-size: 0.95rem;">⚡ ${telemetry.maxSpeed} km/h</strong>`
              : `<span style="color: var(--text-dim); font-size: 0.78rem;">0 km/h</span>`;
          }
          continue;
        } catch (retryErr) {
          console.warn(`[Prefetch] Échec définitif pour trajet ${ride.id}, marquage neutre.`);
        }
      }

      // Toujours marquer comme calculé pour éviter de bloquer le compteur à l'infini
      saveTelemetryToCache(ride.id, { maxSpeed: 0, avgSpeed: 0, maxBrakingG: null, maxTilt: null });
      if (cell) cell.innerHTML = `<span style="color: var(--text-dim); font-size: 0.78rem;">--</span>`;
    }
  }

  isPrefetching = false;
  updatePrefetchButtonUI();
}

// Save telemetry to state & localStorage
function saveTelemetryToCache(rideId, telemetry) {
  if (!PegaseState.telemetryCache) PegaseState.telemetryCache = {};
  PegaseState.telemetryCache[rideId] = {
    maxSpeed: telemetry.maxSpeed || 0,
    avgSpeed: telemetry.avgSpeed || 0,
    maxBrakingG: telemetry.maxBrakingG,
    maxTilt: telemetry.maxTilt,
    calculated: true
  };
  try {
    localStorage.setItem('pegase_telemetry_cache', JSON.stringify(PegaseState.telemetryCache));
  } catch (e) {}
}

function initRidesEvents() {
  const filterInput = document.getElementById('filterInput');
  const selectTripFilter = document.getElementById('selectTripFilter');
  const selectSpeedFilter = document.getElementById('selectSpeedFilter');
  const selectSort = document.getElementById('selectSort');
  const checkSelectAll = document.getElementById('checkSelectAll');
  const btnDownloadSelected = document.getElementById('btnDownloadSelected');
  const btnPrefetchSpeeds = document.getElementById('btnPrefetchSpeeds');

  if (filterInput) filterInput.addEventListener('input', () => applyFilters(false));
  if (selectTripFilter) selectTripFilter.addEventListener('change', () => applyFilters(false));
  if (selectSpeedFilter) selectSpeedFilter.addEventListener('change', () => applyFilters(false));
  if (selectSort) selectSort.addEventListener('change', () => applyFilters(true));

  // Manual Trigger Button for Telemetry Speeds
  if (btnPrefetchSpeeds) {
    btnPrefetchSpeeds.addEventListener('click', () => {
      if (isPrefetching) {
        cancelPrefetch = true;
        isPrefetching = false;
        btnPrefetchSpeeds.innerHTML = `⚡ Reprendre le calcul`;
      } else {
        startTelemetryPrefetchQueue(PegaseState.allRides);
      }
    });
  }

  // Clickable Sortable Columns (Inversion du tri au clic)
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (currentSortKey === field) {
        // Inverser la direction : si décroissant -> croissant, si croissant -> décroissant
        currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        currentSortKey = field;
        // Par défaut décroissant, sauf pour le nom où A->Z est plus naturel
        currentSortDir = (field === 'name') ? 'asc' : 'desc';
      }

      // Mettre à jour la valeur du menu déroulant de tri
      if (selectSort) {
        const val = `${currentSortKey}_${currentSortDir}`;
        const hasOpt = Array.from(selectSort.options).some(o => o.value === val);
        if (hasOpt) {
          selectSort.value = val;
        }
      }

      applyFilters(false);
    });
  });

  // Master checkbox
  if (checkSelectAll) {
    checkSelectAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const visibleCheckboxes = document.querySelectorAll('.ride-checkbox');
      visibleCheckboxes.forEach(cb => {
        const id = cb.getAttribute('data-id');
        cb.checked = isChecked;
        if (isChecked) {
          PegaseState.selectedRideIds.add(id);
          cb.closest('tr').classList.add('selected-row');
        } else {
          PegaseState.selectedRideIds.delete(id);
          cb.closest('tr').classList.remove('selected-row');
        }
      });
      updateSelectionUI();
    });
  }

  // Download Selected Button
  if (btnDownloadSelected) {
    btnDownloadSelected.addEventListener('click', async () => {
      const ids = Array.from(PegaseState.selectedRideIds);
      if (ids.length === 0) return;
      await downloadRides(ids);
    });
  }
}

// Update the badge under a ride title dynamically
function updateRideRowBadge(rideId, telemetry) {
  const container = document.getElementById(`telemetry-badge-${rideId}`);
  if (!container || !telemetry) return;

  const parts = [];
  if (telemetry.maxSpeed && telemetry.maxSpeed > 0) parts.push(`⚡ ${telemetry.maxSpeed} km/h`);
  if (telemetry.maxBrakingG) parts.push(`🛑 ${telemetry.maxBrakingG} G`);
  if (telemetry.maxTilt) parts.push(`📐 ${telemetry.maxTilt}°`);

  if (parts.length > 0) {
    container.innerHTML = `<div class="ride-telemetry-badge">${parts.join(' &bull; ')}</div>`;
  }
}
