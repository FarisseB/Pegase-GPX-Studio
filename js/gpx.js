/**
 * gpx.js — Génération GPX et téléchargement (single & bulk ZIP)
 * 
 * Dépend de : utils.js, map.js (fetchRidePoints), JSZip, FileSaver
 */

// Convert Points to GPX XML String
function generateGPX(ride, points) {
  const name = (ride.name || `Trajet Pegase ${ride.id}`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dStart = parseTimestamp(ride.startTime) || new Date();
  const startTimeISO = dStart.toISOString();

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pegase GPX Studio" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <time>${startTimeISO}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
`;

  points.forEach(pt => {
    const ptDate = parseTimestamp(pt.gpsTimestamp) || dStart;
    const timeISO = ptDate.toISOString();
    gpx += `      <trkpt lat="${pt.latitude}" lon="${pt.longitude}">\n`;
    gpx += `        <time>${timeISO}</time>\n`;
    if (pt.speed !== undefined && pt.speed !== null) {
      gpx += `        <speed>${pt.speed}</speed>\n`;
    }

    let hasExt = false;
    let extXml = `        <extensions>\n`;
    if (pt.tilt !== undefined && pt.tilt !== null) {
      extXml += `          <tilt>${pt.tilt}</tilt>\n`;
      hasExt = true;
    }
    const rawAcc = pt.acceleration ?? pt.ax;
    if (rawAcc !== undefined && rawAcc !== null) {
      extXml += `          <acceleration>${rawAcc}</acceleration>\n`;
      if (typeof toGForce === 'function') {
        const g = toGForce(rawAcc);
        if (g !== null) extXml += `          <gforce>${g.toFixed(2)}</gforce>\n`;
      }
      hasExt = true;
    }
    if (pt.direction !== undefined && pt.direction !== null) {
      extXml += `          <course>${pt.direction}</course>\n`;
      hasExt = true;
    }
    extXml += `        </extensions>\n`;

    if (hasExt) {
      gpx += extXml;
    }
    gpx += `      </trkpt>\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

// Bulk / Single Download Engine
async function downloadRides(rideIds) {
  const progressModal = document.getElementById('progressModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalStatus = document.getElementById('modalStatus');
  const progressBarFill = document.getElementById('progressBarFill');
  const modalPercent = document.getElementById('modalPercent');

  progressModal.style.display = 'flex';
  modalTitle.textContent = `Téléchargement de ${rideIds.length} trajet${rideIds.length > 1 ? 's' : ''}...`;
  progressBarFill.style.width = '0%';
  modalPercent.textContent = '0%';

  try {
    if (rideIds.length === 1) {
      // Single GPX directly
      const id = rideIds[0];
      const ride = PegaseState.allRides.find(r => r.id === id) || { id, name: 'Trajet_Pegase' };
      modalStatus.textContent = `Récupération de : ${ride.name || id}...`;

      const points = await fetchRidePoints(id);
      const gpxContent = generateGPX(ride, points);

      const dStart = parseTimestamp(ride.startTime) || new Date();
      const datePart = dStart.toISOString().split('T')[0];
      const safeName = (ride.name || `Trajet_${id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${datePart}_${safeName}.gpx`;

      const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
      saveAs(blob, filename);

      progressBarFill.style.width = '100%';
      modalPercent.textContent = '100%';
      setTimeout(() => { progressModal.style.display = 'none'; }, 500);

    } else {
      // Bulk into a ZIP file using JSZip
      const zip = new JSZip();
      const folder = zip.folder("Trajets_Pegase_GPX");

      for (let i = 0; i < rideIds.length; i++) {
        const id = rideIds[i];
        const ride = PegaseState.allRides.find(r => r.id === id) || { id, name: `Trajet_${i+1}` };
        
        modalStatus.textContent = `Récupération [${i+1}/${rideIds.length}] : ${ride.name || id}...`;
        const points = await fetchRidePoints(id);
        const gpxContent = generateGPX(ride, points);

        const dStart = parseTimestamp(ride.startTime) || new Date();
        const datePart = dStart.toISOString().split('T')[0];
        const safeName = (ride.name || `Trajet_${id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${datePart}_${safeName}.gpx`;

        folder.file(filename, gpxContent);

        const pct = Math.round(((i + 1) / rideIds.length) * 100);
        progressBarFill.style.width = `${pct}%`;
        modalPercent.textContent = `${pct}%`;
      }

      modalStatus.textContent = "Compression de l'archive ZIP...";
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const today = new Date().toISOString().split('T')[0];
      saveAs(zipBlob, `Export_Pegase_${today}_${rideIds.length}_trajets.zip`);

      setTimeout(() => { progressModal.style.display = 'none'; }, 600);
    }

  } catch (err) {
    alert("Erreur lors de l'export GPX : " + err.message);
    progressModal.style.display = 'none';
  }
}
