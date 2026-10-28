/**
 * api.js — Helper GraphQL pour l'API Pégase
 * 
 * Fournit callGraphQL() utilisé par tous les autres modules.
 * Dépend de : config.js (PegaseConfig)
 */

async function callGraphQL(query, variables = {}, token = PegaseState.authToken) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let response;
  try {
    response = await fetch(PegaseConfig.API_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error("Délai d'attente dépassé (timeout 12s) sur l'API Pégase");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (data && data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map(e => e.message).join(' | '));
    }
    throw new Error(`Erreur réseau HTTP ${response.status}`);
  }

  if (data && data.errors && data.errors.length > 0) {
    throw new Error(data.errors[0].message || 'Erreur API inconnue');
  }

  return data.data;
}
