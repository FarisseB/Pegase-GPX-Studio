/**
 * cockpit.js — Cockpit de Télémétrie & Graphique Dynamique Synchronisé
 * 
 * Affiche la Vitesse Max, le Freinage Max (en G), l'Accélération Max
 * et l'Angle d'Inclinaison (gauche/droite) au clic sur un trajet.
 * Synchronise le survol de la courbe avec la carte Leaflet.
 */

let telemetryChart = null;
let currentTelemetryData = null;
let activeMetric = 'speed'; // 'speed' | 'braking' | 'tilt'

function initCockpit() {
  const btnClose = document.getElementById('btnCloseCockpit');
  if (btnClose) {
    btnClose.addEventListener('click', closeTelemetryCockpit);
  }

  const btnScrollList = document.getElementById('btnCockpitScrollToList');
  if (btnScrollList) {
    btnScrollList.addEventListener('click', () => {
      if (typeof scrollToActiveRide === 'function') {
        scrollToActiveRide();
      }
    });
  }

  // Metric toggle buttons (Vitesse / Freinage / Angle)
  const toggleBtns = document.querySelectorAll('.chart-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeMetric = e.target.getAttribute('data-metric');
      if (currentTelemetryData) {
        renderChartMetric(currentTelemetryData, activeMetric);
      }
    });
  });
}

function openTelemetryCockpit(ride, telemetry) {
  currentTelemetryData = telemetry;
  const container = document.getElementById('rideTelemetryCockpit');
  if (!container) return;

  container.style.display = 'block';

  // Title
  const nameEl = document.getElementById('cockpitRideName');
  if (nameEl) {
    nameEl.textContent = `— ${ride.name || 'Balade moto'}`;
  }

  // 1. Vitesse
  const kpiSpeed = document.getElementById('kpiMaxSpeed');
  const kpiAvgSpeed = document.getElementById('kpiAvgSpeed');
  if (kpiSpeed) kpiSpeed.textContent = telemetry.maxSpeed !== null ? telemetry.maxSpeed : '--';
  if (kpiAvgSpeed) kpiAvgSpeed.textContent = telemetry.avgSpeed !== null ? `Moyenne: ${telemetry.avgSpeed} km/h` : 'Moyenne: -- km/h';

  // 2. Freinage
  const kpiBraking = document.getElementById('kpiMaxBraking');
  const kpiBrakingLabel = document.getElementById('kpiBrakingLabel');
  if (kpiBraking) {
    if (telemetry.maxBrakingG !== null) {
      kpiBraking.textContent = `${telemetry.maxBrakingG}`;
      if (telemetry.maxBrakingG <= -0.8) {
        kpiBrakingLabel.textContent = 'Freinage d\'urgence intense';
      } else if (telemetry.maxBrakingG <= -0.5) {
        kpiBrakingLabel.textContent = 'Freinage appuyé';
      } else {
        kpiBrakingLabel.textContent = 'Freinage modéré';
      }
    } else {
      kpiBraking.textContent = '--';
      kpiBrakingLabel.textContent = 'Non mesuré';
    }
  }

  // 3. Accélération
  const kpiAccel = document.getElementById('kpiMaxAccel');
  const kpiAccelLabel = document.getElementById('kpiAccelLabel');
  if (kpiAccel) {
    if (telemetry.maxAccelG !== null) {
      kpiAccel.textContent = `+${telemetry.maxAccelG}`;
      if (telemetry.maxAccelG >= 0.7) {
        kpiAccelLabel.textContent = 'Forte accélération plein gaz';
      } else if (telemetry.maxAccelG >= 0.4) {
        kpiAccelLabel.textContent = 'Relance dynamique';
      } else {
        kpiAccelLabel.textContent = 'Accélération douce';
      }
    } else {
      kpiAccel.textContent = '--';
      kpiAccelLabel.textContent = 'Non mesuré';
    }
  }

  // 4. Angle d'inclinaison
  const kpiTilt = document.getElementById('kpiMaxTilt');
  const kpiTiltDetail = document.getElementById('kpiTiltDetail');
  if (kpiTilt) {
    kpiTilt.textContent = telemetry.maxTilt !== null ? telemetry.maxTilt : '--';
    const leftStr = telemetry.maxTiltLeft !== null ? `${telemetry.maxTiltLeft}°` : '--°';
    const rightStr = telemetry.maxTiltRight !== null ? `${telemetry.maxTiltRight}°` : '--°';
    if (kpiTiltDetail) {
      kpiTiltDetail.innerHTML = `⬅️ Gauche: <strong>${leftStr}</strong> &nbsp;|&nbsp; Droite: <strong>${rightStr}</strong> ➡️`;
    }
  }

  // Render Chart
  renderChartMetric(telemetry, activeMetric);
}

function closeTelemetryCockpit() {
  const container = document.getElementById('rideTelemetryCockpit');
  if (container) container.style.display = 'none';
  if (typeof clearMapHighlightPoint === 'function') {
    clearMapHighlightPoint();
  }
}

function renderChartMetric(telemetry, metric) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  const canvas = document.getElementById('telemetryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const pts = telemetry.chartPoints || [];
  if (pts.length === 0) return;

  const labels = pts.map((p, i) => {
    if (p.time) {
      return p.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return `#${i + 1}`;
  });

  let datasetConfig = {};

  if (metric === 'speed') {
    datasetConfig = {
      label: 'Vitesse (km/h)',
      data: pts.map(p => p.speed),
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.12)',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#38bdf8',
      yAxisID: 'y'
    };
  } else if (metric === 'braking') {
    datasetConfig = {
      label: 'Force G (Freinage / Accélération)',
      data: pts.map(p => p.gForce),
      borderColor: '#fb7185',
      backgroundColor: 'rgba(244, 63, 94, 0.15)',
      borderWidth: 2,
      fill: true,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#fb7185',
      yAxisID: 'y'
    };
  } else if (metric === 'tilt') {
    datasetConfig = {
      label: 'Angle d\'inclinaison (°)',
      data: pts.map(p => p.tilt),
      borderColor: '#fbbf24',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#fbbf24',
      yAxisID: 'y'
    };
  }

  if (telemetryChart) {
    telemetryChart.destroy();
  }

  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [datasetConfig]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#38bdf8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: function(items) {
              const idx = items[0].dataIndex;
              const pt = pts[idx];
              return pt.time ? pt.time.toLocaleTimeString('fr-FR') : `Point #${idx + 1}`;
            },
            label: function(item) {
              const idx = item.dataIndex;
              const pt = pts[idx];
              return [
                `⚡ Vitesse : ${pt.speed} km/h`,
                `🛑 G-Force : ${pt.gForce > 0 ? '+' : ''}${pt.gForce} G`,
                `📐 Angle : ${pt.tilt}°`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 8,
            font: { size: 10, family: "'JetBrains Mono', monospace" }
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: "'JetBrains Mono', monospace" }
          }
        }
      },
      onHover: (event, activeElements) => {
        if (activeElements && activeElements.length > 0) {
          const idx = activeElements[0].index;
          const pt = pts[idx];
          if (pt && typeof highlightMapPoint === 'function') {
            highlightMapPoint(pt.lat, pt.lng, pt.speed, pt.tilt, pt.gForce);
          }
        } else {
          if (typeof clearMapHighlightPoint === 'function') {
            clearMapHighlightPoint();
          }
        }
      }
    }
  });
}
