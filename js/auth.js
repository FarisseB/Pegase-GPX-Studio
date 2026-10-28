/**
 * auth.js — Authentification Pégase (login, logout, gestion token)
 * 
 * Dépend de : config.js, api.js, app.js (PegaseState, showLogin, showDashboard, loadDashboard)
 */

function initAuth() {
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const btnSubmitLogin = document.getElementById('btnSubmitLogin');
  const btnLogout = document.getElementById('btnLogout');

  // Login Form Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    btnSubmitLogin.disabled = true;
    btnSubmitLogin.innerHTML = 'Connexion en cours...';

    const email = document.getElementById('inputEmail').value.trim();
    const password = document.getElementById('inputPassword').value;
    const remember = document.getElementById('checkRemember').checked;

    const mutation = `
      mutation SignIn($email: String!, $password: String!) {
        createUserOrSignInWithEmailAndPassword(
          email: $email
          password: $password
        ) {
          token
          sessionType
        }
      }
    `;

    try {
      const result = await callGraphQL(mutation, { email, password }, null);
      if (result && result.createUserOrSignInWithEmailAndPassword && result.createUserOrSignInWithEmailAndPassword.token) {
        PegaseState.authToken = result.createUserOrSignInWithEmailAndPassword.token;
        if (remember) {
          localStorage.setItem(PegaseConfig.STORAGE_KEY_TOKEN, PegaseState.authToken);
        } else {
          sessionStorage.setItem(PegaseConfig.STORAGE_KEY_TOKEN, PegaseState.authToken);
        }
        await loadDashboard();
      } else {
        throw new Error("Identifiants invalides ou échec d'authentification.");
      }
    } catch (err) {
      loginError.textContent = err.message || "Erreur de connexion";
      loginError.style.display = 'block';
    } finally {
      btnSubmitLogin.disabled = false;
      btnSubmitLogin.innerHTML = 'Se connecter au traceur';
    }
  });

  // Logout
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem(PegaseConfig.STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(PegaseConfig.STORAGE_KEY_TOKEN);
    PegaseState.authToken = null;
    PegaseState.allRides = [];
    PegaseState.selectedRideIds.clear();
    showLogin();
  });
}
