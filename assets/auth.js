/* ------------------------------------------------------------------ */
/*  AUTHENTIFICATION RÉELLE — Domaine Sesquier                         */
/*                                                                      */
/*  Remplace l'ancien rideau (gate.js, cosmétique) par une vraie       */
/*  session Supabase Auth. Le blocage réel se fait côté Worker (chaque */
/*  requête API exige un JWT valide) — ce script ne fait que gérer     */
/*  l'écran de connexion et fournir le jeton courant à utils.js.       */
/*                                                                      */
/*  Trois vues : connexion, « mot de passe oublié » (envoi d'un lien   */
/*  par email), et choix d'un nouveau mot de passe au retour du lien.  */
/*                                                                      */
/*  Nécessite que la librairie Supabase soit chargée AVANT ce script : */
/*    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> */
/*    <script src="assets/auth.js"></script>                           */
/* ------------------------------------------------------------------ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ymwebdihbmzrcaivldxu.supabase.co';
  // Clé anon : publique par conception (nécessaire pour l'appel de connexion
  // Supabase Auth lui-même). La vraie protection se fait côté Worker + RLS.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltd2ViZGloYm16cmNhaXZsZHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODkxMjMsImV4cCI6MjA5NDA2NTEyM30.htAc4nHjbv-yFHW-59i_1eBPUsNcfd8-DMq9D1igVPw';

  // Page d'atterrissage du lien « mot de passe oublié ». Doit figurer dans
  // Supabase → Authentication → URL Configuration → Redirect URLs.
  var RESET_REDIRECT = location.origin + '/';

  // Retour d'un lien reçu par email : Supabase place le résultat dans le
  // fragment d'URL (#...). On le lit AVANT que la librairie ne le nettoie.
  var urlHash = location.hash || '';
  var isRecovery = /type=recovery/.test(urlHash);
  var linkError = /error_code=|error=/.test(urlHash)
    ? decodeURIComponent((urlHash.match(/error_description=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ')
    : '';

  var root = document.documentElement;
  // Masquer immédiatement toute la page (évite le flash de contenu le temps
  // de savoir si une session valide existe déjà).
  root.style.visibility = 'hidden';

  // « Se souvenir de moi » : coché, la session est gardée dans localStorage
  // (survit à la fermeture du navigateur) ; décoché, dans sessionStorage
  // (effacée à la fermeture de l'onglet). Les iframes du tableau de bord
  // partagent le sessionStorage de leur onglet, donc restent connectées.
  var REMEMBER_KEY = 'ds_auth_remember';
  function remember() {
    try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
  }
  var storageAdapter = {
    getItem: function (k) {
      try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; }
    },
    setItem: function (k, v) {
      try {
        if (remember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
        else            { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
      } catch (e) { /* stockage indisponible */ }
    },
    removeItem: function (k) {
      try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* noop */ }
    },
  };

  var _client = null;
  function getClient() {
    if (!_client) {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage: storageAdapter, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return _client;
  }

  function currentSession() {
    return getClient().auth.getSession().then(function (res) {
      return (res && res.data && res.data.session) || null;
    }).catch(function () { return null; });
  }

  // API utilisée par assets/utils.js (fetchJson) et les pages pour attacher
  // le jeton courant à chaque appel vers le Worker / Supabase Storage.
  window.SesquierAuth = {
    async getToken() {
      var s = await currentSession();
      return s ? s.access_token : null;
    },
    async getUserEmail() {
      var s = await currentSession();
      return s && s.user ? s.user.email : null;
    },
    async logout() {
      try { await getClient().auth.signOut(); } catch (e) { /* noop */ }
      location.reload();
    },
  };

  function showApp() {
    root.style.visibility = '';
  }

  // Enlève le fragment #access_token=… de l'URL une fois traité.
  function cleanUrl() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* noop */ }
  }

  /* ── Rendu de l'écran ─────────────────────────────────────────── */

  var INPUT = 'width:100%;padding:13px 14px;border:1px solid #E8E5DE;border-radius:8px;font-size:15px;text-align:center;outline:none;box-sizing:border-box;background:#fff;';
  var BUTTON = 'width:100%;margin-top:10px;padding:13px;border:none;border-radius:8px;background:#3A5538;color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
  var LINK = 'background:none;border:none;padding:0;color:#3A5538;font-size:12.5px;cursor:pointer;text-decoration:underline;font-family:inherit;';

  var overlay = null;
  function mountOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ds-auth-overlay';
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647', 'visibility:visible',
      'background:#F4F1EA', 'display:flex', 'align-items:center', 'justify-content:center',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(';'));
    root.appendChild(overlay);
    return overlay;
  }

  function header(subtitle) {
    return '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:30px;font-weight:700;color:#3A5538;line-height:1.1;">Domaine Sesquier</div>' +
           '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9DA393;margin:6px 0 24px;">' + subtitle + '</div>';
  }

  function render(html) {
    var ov = mountOverlay();
    ov.innerHTML = '<div style="width:100%;max-width:340px;padding:0 20px;text-align:center;">' + html + '</div>';
    return ov;
  }

  function busy(btn, label) {
    btn.disabled = true;
    btn.dataset.label = btn.textContent;
    btn.textContent = label;
  }
  function idle(btn) {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || btn.textContent;
  }

  /* Vue 1 : connexion */
  function showLogin(message, isError) {
    var ov = render(
      header('Connexion requise') +
      '<form id="ds-auth-form">' +
        '<input id="ds-auth-email" type="email" autocomplete="username" placeholder="Email" style="' + INPUT + 'margin-bottom:8px;" />' +
        '<input id="ds-auth-pass" type="password" autocomplete="current-password" placeholder="Mot de passe" style="' + INPUT + '" />' +
        '<label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:#555;cursor:pointer;justify-content:flex-start;">' +
          '<input id="ds-auth-remember" type="checkbox" style="width:15px;height:15px;accent-color:#3A5538;cursor:pointer;" />' +
          'Se souvenir de moi' +
        '</label>' +
        '<button type="submit" style="' + BUTTON + '">Se connecter</button>' +
        '<div id="ds-auth-msg" style="min-height:16px;margin-top:12px;font-size:12.5px;"></div>' +
        '<button type="button" id="ds-auth-forgot" style="' + LINK + 'margin-top:6px;">Mot de passe oublié ?</button>' +
      '</form>'
    );

    var form = ov.querySelector('#ds-auth-form');
    var email = ov.querySelector('#ds-auth-email');
    var pass = ov.querySelector('#ds-auth-pass');
    var rememberBox = ov.querySelector('#ds-auth-remember');
    var msg = ov.querySelector('#ds-auth-msg');

    rememberBox.checked = remember();
    if (message) { msg.textContent = message; msg.style.color = isError ? '#C53030' : '#3A5538'; }
    setTimeout(function () { email.focus(); }, 50);

    ov.querySelector('#ds-auth-forgot').addEventListener('click', function () {
      showForgot(email.value);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.textContent = '';
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, 'Connexion…');

      // Le choix doit être posé AVANT la connexion : c'est lui qui décide
      // où la session sera écrite.
      try { localStorage.setItem(REMEMBER_KEY, rememberBox.checked ? '1' : '0'); } catch (err) { /* noop */ }

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
        msg.style.color = '#C53030';
        msg.textContent = 'Email ou mot de passe incorrect.';
        pass.value = '';
        pass.focus();
        idle(btn);
      });
    });
  }

  /* Vue 2 : mot de passe oublié — envoi du lien */
  function showForgot(prefill) {
    var ov = render(
      header('Mot de passe oublié') +
      '<p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 16px;">Indique ton email : tu recevras un lien pour choisir un nouveau mot de passe.</p>' +
      '<form id="ds-forgot-form">' +
        '<input id="ds-forgot-email" type="email" autocomplete="username" placeholder="Email" style="' + INPUT + '" />' +
        '<button type="submit" style="' + BUTTON + '">Envoyer le lien</button>' +
        '<div id="ds-forgot-msg" style="min-height:16px;margin-top:12px;font-size:12.5px;line-height:1.45;"></div>' +
        '<button type="button" id="ds-forgot-back" style="' + LINK + 'margin-top:6px;">← Retour à la connexion</button>' +
      '</form>'
    );

    var form = ov.querySelector('#ds-forgot-form');
    var email = ov.querySelector('#ds-forgot-email');
    var msg = ov.querySelector('#ds-forgot-msg');
    email.value = prefill || '';
    setTimeout(function () { email.focus(); }, 50);

    ov.querySelector('#ds-forgot-back').addEventListener('click', function () { showLogin(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = (email.value || '').trim();
      if (!value) { email.focus(); return; }
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, 'Envoi…');

      getClient().auth.resetPasswordForEmail(value, { redirectTo: RESET_REDIRECT })
        .then(function (res) {
          if (res.error) throw res.error;
          // Message volontairement neutre : on ne révèle pas si un compte
          // existe pour cette adresse.
          msg.style.color = '#3A5538';
          msg.textContent = "Si un compte existe pour cette adresse, un email vient d'être envoyé. Pense à vérifier les spams.";
          btn.style.display = 'none';
        })
        .catch(function (err) {
          msg.style.color = '#C53030';
          msg.textContent = /rate|limit|seconds/i.test((err && err.message) || '')
            ? 'Trop de demandes rapprochées. Réessaie dans quelques minutes.'
            : "L'envoi a échoué. Réessaie dans un instant.";
          idle(btn);
        });
    });
  }

  /* Vue 3 : nouveau mot de passe (retour du lien reçu par email) */
  function showNewPassword() {
    var ov = render(
      header('Nouveau mot de passe') +
      '<form id="ds-reset-form">' +
        '<input id="ds-reset-pass" type="password" autocomplete="new-password" placeholder="Nouveau mot de passe" style="' + INPUT + 'margin-bottom:8px;" />' +
        '<input id="ds-reset-pass2" type="password" autocomplete="new-password" placeholder="Confirmer le mot de passe" style="' + INPUT + '" />' +
        '<div style="font-size:11.5px;color:#9DA393;margin-top:8px;">10 caractères minimum.</div>' +
        '<button type="submit" style="' + BUTTON + '">Enregistrer le mot de passe</button>' +
        '<div id="ds-reset-msg" style="min-height:16px;margin-top:12px;font-size:12.5px;color:#C53030;"></div>' +
      '</form>'
    );

    var form = ov.querySelector('#ds-reset-form');
    var p1 = ov.querySelector('#ds-reset-pass');
    var p2 = ov.querySelector('#ds-reset-pass2');
    var msg = ov.querySelector('#ds-reset-msg');
    setTimeout(function () { p1.focus(); }, 50);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.textContent = '';
      if ((p1.value || '').length < 10) { msg.textContent = 'Le mot de passe doit faire au moins 10 caractères.'; p1.focus(); return; }
      if (p1.value !== p2.value) { msg.textContent = 'Les deux mots de passe ne correspondent pas.'; p2.focus(); return; }

      var btn = form.querySelector('button[type="submit"]');
      busy(btn, 'Enregistrement…');
      getClient().auth.updateUser({ password: p1.value })
        .then(function (res) {
          if (res.error) throw res.error;
          cleanUrl();
          location.reload();
        })
        .catch(function (err) {
          msg.textContent = /same|different/i.test((err && err.message) || '')
            ? "Choisis un mot de passe différent de l'ancien."
            : "Impossible d'enregistrer le mot de passe. Le lien a peut-être expiré : redemande-en un.";
          idle(btn);
        });
    });
  }

  /* ── Démarrage ────────────────────────────────────────────────── */

  function init() {
    if (typeof window.supabase === 'undefined') {
      // Librairie Supabase non chargée (CDN bloqué, hors-ligne…) : on ne
      // bloque pas silencieusement, on affiche un message clair.
      root.style.visibility = '';
      var warn = document.createElement('div');
      warn.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#F4F1EA;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#C53030;padding:20px;text-align:center;';
      warn.textContent = "Erreur : la librairie d'authentification n'a pas pu être chargée. Vérifie ta connexion internet.";
      (document.body || root).appendChild(warn);
      return;
    }

    // Lien expiré / déjà utilisé : on revient à la connexion avec un message.
    if (linkError) {
      cleanUrl();
      showLogin('Ce lien a expiré ou a déjà été utilisé. Redemande-en un via « Mot de passe oublié ».', true);
      return;
    }

    currentSession().then(function (session) {
      if (isRecovery && session) {
        // Arrivée depuis le lien email : la session de récupération est
        // ouverte, on impose le choix d'un nouveau mot de passe.
        showNewPassword();
      } else if (session) {
        if (/access_token=/.test(urlHash)) cleanUrl();
        showApp();
      } else {
        showLogin();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
