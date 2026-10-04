/* ------------------------------------------------------------------ */
/*  AUTHENTIFICATION RÉELLE — Domaine Sesquier                         */
/*                                                                      */
/*  Remplace l'ancien rideau (gate.js, cosmétique) par une vraie       */
/*  session Supabase Auth. Le blocage réel se fait côté Worker (chaque */
/*  requête API exige un JWT valide) — ce script ne fait que gérer     */
/*  l'écran de connexion et fournir le jeton courant à utils.js.       */
/*                                                                      */
/*  Nécessite que la librairie Supabase soit chargée AVANT ce script : */
/*    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> */
/*    <script src="assets/auth.js"></script>                           */
/* ------------------------------------------------------------------ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ymwebdihbmzrcaivldxu.supabase.co';
  // Clé anon : publique par conception (nécessaire pour l'appel de connexion
  // Supabase Auth lui-même). La vraie protection se fait côté Worker.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltd2ViZGloYm16cmNhaXZsZHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODkxMjMsImV4cCI6MjA5NDA2NTEyM30.htAc4nHjbv-yFHW-59i_1eBPUsNcfd8-DMq9D1igVPw';

  var root = document.documentElement;
  // Masquer immédiatement toute la page (évite le flash de contenu le temps
  // de savoir si une session valide existe déjà).
  root.style.visibility = 'hidden';

  var _client = null;
  function getClient() {
    if (!_client) {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _client;
  }

  // API utilisée par assets/utils.js (fetchJson) pour attacher le jeton
  // courant à chaque appel vers le Worker.
  window.SesquierAuth = {
    async getToken() {
      try {
        var res = await getClient().auth.getSession();
        var session = res && res.data && res.data.session;
        return session ? session.access_token : null;
      } catch (e) {
        return null;
      }
    },
    async getUserEmail() {
      try {
        var res = await getClient().auth.getSession();
        var session = res && res.data && res.data.session;
        return session && session.user ? session.user.email : null;
      } catch (e) {
        return null;
      }
    },
    async logout() {
      try { await getClient().auth.signOut(); } catch (e) { /* noop */ }
      location.reload();
    },
  };

  function showApp() {
    root.style.visibility = '';
  }

  function mountLogin() {
    var ov = document.createElement('div');
    ov.id = 'ds-auth-overlay';
    ov.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647', 'visibility:visible',
      'background:#F4F1EA', 'display:flex', 'align-items:center', 'justify-content:center',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(';'));
    ov.innerHTML =
      '<div style="width:100%;max-width:340px;padding:0 20px;text-align:center;">' +
        '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:30px;font-weight:700;color:#3A5538;line-height:1.1;">Domaine Sesquier</div>' +
        '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9DA393;margin:6px 0 24px;">Connexion requise</div>' +
        '<form id="ds-auth-form">' +
          '<input id="ds-auth-email" type="email" autocomplete="username" placeholder="Email" ' +
            'style="width:100%;padding:13px 14px;border:1px solid #E8E5DE;border-radius:8px;font-size:15px;text-align:center;outline:none;box-sizing:border-box;background:#fff;margin-bottom:8px;" />' +
          '<input id="ds-auth-pass" type="password" autocomplete="current-password" placeholder="Mot de passe" ' +
            'style="width:100%;padding:13px 14px;border:1px solid #E8E5DE;border-radius:8px;font-size:15px;text-align:center;outline:none;box-sizing:border-box;background:#fff;" />' +
          '<button type="submit" ' +
            'style="width:100%;margin-top:10px;padding:13px;border:none;border-radius:8px;background:#3A5538;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Se connecter</button>' +
          '<div id="ds-auth-err" style="height:16px;margin-top:12px;color:#C53030;font-size:12.5px;"></div>' +
        '</form>' +
      '</div>';
    root.appendChild(ov);

    var form  = ov.querySelector('#ds-auth-form');
    var email = ov.querySelector('#ds-auth-email');
    var pass  = ov.querySelector('#ds-auth-pass');
    var err   = ov.querySelector('#ds-auth-err');
    setTimeout(function () { email.focus(); }, 50);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Connexion…';

      getClient().auth.signInWithPassword({
        email: (email.value || '').trim(),
        password: pass.value || '',
      }).then(function (res) {
        if (res.error) throw res.error;
        // Les pages lancent leur chargement de données dès l'ouverture,
        // donc avant la connexion (appels refusés par le Worker). On
        // recharge : la session est mémorisée, la page s'ouvre directement
        // et ses données arrivent cette fois avec le jeton.
        location.reload();
      }).catch(function () {
        err.textContent = 'Email ou mot de passe incorrect.';
        pass.value = '';
        pass.focus();
      }).finally(function () {
        btn.disabled = false; btn.textContent = 'Se connecter';
      });
    });
  }

  function init() {
    if (typeof window.supabase === 'undefined') {
      // Librairie Supabase non chargée (CDN bloqué, hors-ligne…) : on ne
      // bloque pas silencieusement, on affiche un message clair.
      root.style.visibility = '';
      var warn = document.createElement('div');
      warn.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#F4F1EA;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#C53030;padding:20px;text-align:center;';
      warn.textContent = "Erreur : la librairie d'authentification n'a pas pu être chargée. Vérifie ta connexion internet.";
      document.body ? document.body.appendChild(warn) : root.appendChild(warn);
      return;
    }

    getClient().auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session) {
        showApp();
      } else {
        mountLogin();
      }
    }).catch(function () {
      mountLogin();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
