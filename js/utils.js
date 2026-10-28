/**
 * utils.js — Fonctions utilitaires (parsing, formatage)
 * 
 * Parsers universels pour timestamps, distances et durées
 * provenant de l'API Pégase.
 */

// Universal Smart Timestamp Parser (handles seconds, milliseconds, microseconds, or ISO string)
function parseTimestamp(ts) {
  if (ts === null || ts === undefined || ts === '') return null;
  if (typeof ts === 'string') {
    const num = Number(ts);
    if (!isNaN(num) && num > 0) {
      ts = num;
    } else {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const num = Number(ts);
  if (isNaN(num) || num <= 0) return null;

  // > 1e14: microseconds
  // > 1e11: milliseconds (13 digits, ~1.7e12 in 2024-2026)
  // <= 1e11: seconds (10 digits, ~1.7e9 in 2024-2026)
  let d;
  if (num > 1e14) d = new Date(num / 1000000);
  else if (num > 1e11) d = new Date(num);
  else d = new Date(num * 1000);

  return isNaN(d.getTime()) ? null : d;
}

function formatRideDate(ts) {
  const d = parseTimestamp(ts);
  if (!d) return '--';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// In Pégase / Flashbird, distance is ALWAYS stored in METERS
function getRideDistanceKm(ride) {
  const d = ride.distance;
  if (d === null || d === undefined) return 0;
  const num = Number(d);
  if (isNaN(num) || num <= 0) return 0;
  return num / 1000;
}

function formatRideDistance(ride) {
  const km = getRideDistanceKm(ride);
  if (!km || km <= 0) return '0 m';
  if (km < 0.1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// Smart Duration Parser (seconds, milliseconds, or fallback to endTime - startTime)
function getRideDuration(ride) {
  let dur = Number(ride.effectiveDuration);

  // Fallback: calculate from endTime - startTime if effectiveDuration is missing or 0
  if ((!dur || isNaN(dur) || dur <= 0) && ride.startTime && ride.endTime) {
    const start = parseTimestamp(ride.startTime)?.getTime();
    const end = parseTimestamp(ride.endTime)?.getTime();
    if (start && end && end > start) {
      dur = (end - start) / 1000; // in seconds
    }
  }

  if (!dur || isNaN(dur) || dur <= 0) return '--';

  // If dur > 50,000, it's in milliseconds
  let totalSeconds = dur;
  if (dur > 50000) {
    totalSeconds = Math.round(dur / 1000);
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  } else if (minutes > 0) {
    return `${minutes} min`;
  } else {
    return `${seconds} s`;
  }
}

// Calculate Average Speed
function getAverageSpeed(ride) {
  const km = getRideDistanceKm(ride);
  let dur = Number(ride.effectiveDuration);
  if ((!dur || dur <= 0) && ride.startTime && ride.endTime) {
    const s = parseTimestamp(ride.startTime)?.getTime();
    const e = parseTimestamp(ride.endTime)?.getTime();
    if (s && e && e > s) dur = (e - s) / 1000;
  }
  if (dur && dur > 50000) dur /= 1000;
  if (!km || km < 0.1 || !dur || dur < 30) return '--';

  const hours = dur / 3600;
  const speed = Math.round(km / hours);
  if (speed <= 0 || speed > 300) return '--';
  return `${speed} km/h`;
}

// Convert raw acceleration into G-force (auto-detects m/s² vs G units)
function toGForce(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  // If absolute value > 2.2, it's expressed in m/s² (1 G = 9.80665 m/s²)
  if (Math.abs(num) > 2.2) {
    return num / 9.80665;
  }
  return num;
}

// Analyze complete telemetry points for a ride (Speed, Braking, Acceleration, Tilt)
function analyzeRideTelemetry(points) {
  if (!points || points.length === 0) {
    return {
      maxSpeed: null,
      avgSpeed: null,
      maxBrakingG: null,
      maxAccelG: null,
      maxTilt: null,
      maxTiltLeft: null,
      maxTiltRight: null,
      chartPoints: []
    };
  }

  const validSpeeds = [];
  const validTilts = [];
  const leftTilts = [];
  const rightTilts = [];
  const brakings = [];
  const accelerations = [];

  points.forEach((p, index) => {
    // Speed
    const spd = Number(p.speed);
    if (!isNaN(spd) && spd >= 0 && spd < 380) {
      validSpeeds.push(spd);
    }

    // Tilt (inclinaison)
    const t = Number(p.tilt);
    if (!isNaN(t) && Math.abs(t) <= 75) {
      const absT = Math.abs(t);
      validTilts.push(absT);
      if (t < -1) leftTilts.push(absT);
      else if (t > 1) rightTilts.push(absT);
    }

    // Acceleration & Braking
    const rawAcc = (p.acceleration !== null && p.acceleration !== undefined) 
      ? p.acceleration 
      : (p.ax !== null && p.ax !== undefined ? p.ax : null);

    const g = toGForce(rawAcc);
    if (g !== null && !isNaN(g)) {
      // Exclude extreme shock spikes (> 1.8G or < -1.8G)
      if (g >= -1.8 && g <= 1.8) {
        if (g < -0.05) brakings.push(g);
        if (g > 0.05) accelerations.push(g);
      }
    }
  });

  const maxSpeed = validSpeeds.length ? Math.round(Math.max(...validSpeeds)) : null;
  const avgSpeed = validSpeeds.length ? Math.round(validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length) : null;

  const maxTilt = validTilts.length ? Math.round(Math.max(...validTilts)) : null;
  const maxTiltLeft = leftTilts.length ? Math.round(Math.max(...leftTilts)) : null;
  const maxTiltRight = rightTilts.length ? Math.round(Math.max(...rightTilts)) : null;

  const maxBrakingG = brakings.length ? Math.min(...brakings) : null;
  const maxAccelG = accelerations.length ? Math.max(...accelerations) : null;

  // Sampling for chart (aim for ~250 points for smooth rendering)
  const maxSamples = 250;
  const step = Math.max(1, Math.floor(points.length / maxSamples));
  const chartPoints = [];

  for (let i = 0; i < points.length; i += step) {
    const pt = points[i];
    const spd = Number(pt.speed) || 0;
    const t = Math.abs(Number(pt.tilt) || 0);
    const rawAcc = pt.acceleration ?? pt.ax;
    const g = toGForce(rawAcc) || 0;

    chartPoints.push({
      originalIndex: i,
      lat: pt.latitude,
      lng: pt.longitude,
      time: parseTimestamp(pt.gpsTimestamp),
      speed: Math.round(spd),
      tilt: Math.round(t),
      gForce: Number(g.toFixed(2))
    });
  }

  return {
    maxSpeed,
    avgSpeed,
    maxBrakingG: maxBrakingG !== null ? Number(maxBrakingG.toFixed(2)) : null,
    maxAccelG: maxAccelG !== null ? Number(maxAccelG.toFixed(2)) : null,
    maxTilt,
    maxTiltLeft,
    maxTiltRight,
    chartPoints
  };
}

