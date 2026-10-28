/**
 * map.js — Gestion de la carte Leaflet (init, marqueurs, polylines, highlight)
 * 
 * Dépend de : config.js (PegaseConfig), Leaflet (L), utils.js, cockpit.js
 */

let map = null;
let motoMarker = null;
let activePolyline = null;
let startMarker = null;
let endMarker = null;
let telemetryHoverMarker = null;

function initMap() {
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([PegaseConfig.DEFAULT_LAT, PegaseConfig.DEFAULT_LNG], PegaseConfig.DEFAULT_ZOOM);

  L.tileLayer(`${PegaseConfig.TILE_URL}?key=${PegaseConfig.CARTO_API_KEY}`, {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);
}

function updateMotoMarker(lat, lon, label) {
  if (motoMarker) {
    motoMarker.setLatLng([lat, lon]);
  } else {
    const motoIcon = L.divIcon({
      className: 'custom-moto-pin',
      html: `<div style="background: #f59e0b; width: 22px; height: 22px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 14px rgba(245, 158, 11, 0.8);"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    motoMarker = L.marker([lat, lon], { icon: motoIcon }).addTo(map);
    motoMarker.bindPopup(`<b>${label}</b><br>Emplacement actuel`).openPopup();
  }
  map.setView([lat, lon], 13);
}

function initMapEvents() {
  document.getElementById('btnCenterMoto').addEventListener('click', () => {
    if (PegaseState.currentDevice && PegaseState.currentDevice.latitude && PegaseState.currentDevice.longitude) {
      map.setView([PegaseState.currentDevice.latitude, PegaseState.currentDevice.longitude], 15);
      if (motoMarker) motoMarker.openPopup();
    }
  });

  const btnScrollActive = document.getElementById('btnScrollToActiveRide');
  if (btnScrollActive) {
    btnScrollActive.addEventListener('click', () => {
      if (typeof scrollToActiveRide === 'function') {
        scrollToActiveRide();
      }
    });
  }

  // Bouton Agrandir la hauteur de la carte (380px <-> 650px)
  const btnExpand = document.getElementById('btnExpandMap');
  const mapEl = document.getElementById('map');
  if (btnExpand && mapEl) {
    btnExpand.addEventListener('click', () => {
      const isExpanded = mapEl.classList.toggle('map-expanded');
      btnExpand.innerHTML = isExpanded ? '↕️ Réduire' : '↕️ Agrandir';
      btnExpand.title = isExpanded ? 'Revenir à la hauteur normale (380px)' : 'Agrandir la hauteur de la carte à 650px';
      setTimeout(() => {
        if (map) {
          map.invalidateSize();
          if (activePolyline) map.fitBounds(activePolyline.getBounds(), { padding: [40, 40] });
        }
      }, 320);
    });
  }

  // Bouton Plein Écran Immersif
  const btnFullscreen = document.getElementById('btnFullscreenMap');
  const mapCard = document.getElementById('mapCard');
  if (btnFullscreen && mapCard) {
    const toggleFullscreen = () => {
      const isFullscreen = mapCard.classList.toggle('fullscreen-mode');
      btnFullscreen.innerHTML = isFullscreen ? '✕ Quitter' : '⛶ Plein écran';
      btnFullscreen.title = isFullscreen ? 'Quitter le mode plein écran (Échap)' : 'Afficher la carte en plein écran immersif';
      if (isFullscreen) {
        btnFullscreen.classList.remove('btn-secondary');
        btnFullscreen.classList.add('btn-danger');
      } else {
        btnFullscreen.classList.remove('btn-danger');
        btnFullscreen.classList.add('btn-secondary');
      }
      setTimeout(() => {
        if (map) {
          map.invalidateSize();
          if (activePolyline) map.fitBounds(activePolyline.getBounds(), { padding: [40, 40] });
        }
      }, 200);
    };

    btnFullscreen.addEventListener('click', toggleFullscreen);

    // Quitter le mode plein écran avec la touche Échap (Escape)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mapCard.classList.contains('fullscreen-mode')) {
        toggleFullscreen();
      }
    });
  }
}

// Highlight marker on map when hovering on chart
function highlightMapPoint(lat, lng, speed, tilt, gForce) {
  if (!map || !lat || !lng) return;

  if (!telemetryHoverMarker) {
    const hoverIcon = L.divIcon({
      className: 'telemetry-hover-pin',
      html: `<div style="background: #38bdf8; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 14px #38bdf8; animation: pulse 1s infinite;"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    telemetryHoverMarker = L.marker([lat, lng], { icon: hoverIcon, zIndexOffset: 1000 }).addTo(map);
  } else {
    telemetryHoverMarker.setLatLng([lat, lng]);
  }

  // Update popup
  const gStr = gForce !== null ? `${gForce > 0 ? '+' : ''}${gForce} G` : '--';
  telemetryHoverMarker.bindTooltip(
    `<b>⚡ ${speed || 0} km/h</b> • 🛑 ${gStr} • 📐 ${tilt || 0}°`,
    { permanent: false, direction: 'top', offset: [0, -10], className: 'telemetry-tooltip' }
  ).openTooltip();
}

function clearMapHighlightPoint() {
  if (telemetryHoverMarker && map) {
    map.removeLayer(telemetryHoverMarker);
    telemetryHoverMarker = null;
  }
}

// Display Ride Trace on Map & Open Telemetry Cockpit
async function displayRideTraceOnMap(rideId) {
  const ride = PegaseState.allRides.find(r => r.id === rideId);
  if (!ride) return;

  document.getElementById('currentTraceTitle').textContent = `— Chargement de la télémétrie: ${ride.name || 'Balade'}...`;

  try {
    const points = await fetchRidePoints(rideId);
    if (!points || points.length === 0) {
      alert("Aucun point GPS disponible pour ce trajet.");
      document.getElementById('currentTraceTitle').textContent = '';
      return;
    }

    // Clean previous layers
    if (activePolyline) map.removeLayer(activePolyline);
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    clearMapHighlightPoint();

    const latLngs = points.map(p => [p.latitude, p.longitude]);

    // Draw polyline with orange glow
    activePolyline = L.polyline(latLngs, {
      color: '#f59e0b',
      weight: 4,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(map);

    // Start marker (Green)
    const pStart = parseTimestamp(points[0].gpsTimestamp);
    startMarker = L.circleMarker(latLngs[0], {
      radius: 7,
      fillColor: '#10b981',
      color: '#fff',
      weight: 2,
      fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Départ</b><br>${pStart ? pStart.toLocaleTimeString('fr-FR') : ''}<br>${ride.startLocation || ''}`);

    // End marker (Red)
    const pEnd = parseTimestamp(points[points.length - 1].gpsTimestamp);
    endMarker = L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 7,
      fillColor: '#f43f5e',
      color: '#fff',
      weight: 2,
      fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Arrivée</b><br>${pEnd ? pEnd.toLocaleTimeString('fr-FR') : ''}<br>${ride.endLocation || ''}`);

    map.fitBounds(activePolyline.getBounds(), { padding: [40, 40] });

    // Compute and analyze telemetry
    const telemetry = analyzeRideTelemetry(points);
    if (!PegaseState.telemetryCache) {
      PegaseState.telemetryCache = {};
    }
    PegaseState.telemetryCache[rideId] = telemetry;

    // Open Cockpit with live telemetry
    if (typeof openTelemetryCockpit === 'function') {
      openTelemetryCockpit(ride, telemetry);
    }

    // Update title bar
    let extraStats = '';
    if (telemetry.maxSpeed) extraStats += ` • ⚡ Vitesse max : <strong style="color: #38bdf8;">${telemetry.maxSpeed} km/h</strong>`;
    if (telemetry.maxBrakingG) extraStats += ` • 🛑 Freinage : <strong style="color: #fb7185;">${telemetry.maxBrakingG} G</strong>`;
    if (telemetry.maxTilt) extraStats += ` • 📐 Angle : <strong style="color: #f59e0b;">${telemetry.maxTilt}°</strong>`;

    document.getElementById('currentTraceTitle').innerHTML = `— ${ride.name || 'Balade'} (${formatRideDistance(ride)}, ${points.length} pts)${extraStats}`;

    // Update row badge and highlight active row in table
    if (typeof updateRideRowBadge === 'function') {
      updateRideRowBadge(rideId, telemetry);
    }
    if (typeof highlightActiveRideRow === 'function') {
      highlightActiveRideRow(rideId);
    }

    // Smooth scroll to map
    document.querySelector('.map-card').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    alert("Impossible de charger les points du trajet : " + err.message);
    document.getElementById('currentTraceTitle').textContent = '';
  }
}

// Fetch Points for a ride via GraphQL
async function fetchRidePoints(rideId) {
  const query = `
    query GetRideDetails($id: ID!) {
      user {
        ride(id: $id) {
          id
          name
          logConnection {
            edges {
              gpsTimestamp
              latitude
              longitude
              speed
              tilt
              acceleration
              ax
              ay
              az
              direction
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
