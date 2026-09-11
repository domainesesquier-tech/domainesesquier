/* ------------------------------------------------------------------ */
/*  RIDEAU D'ACCÈS  (dissuasif — pas une sécurité forte)               */
/*                                                                      */
/*  But : masquer le tableau de bord à un visiteur qui tombe sur       */
/*  l'URL par hasard. L'API (Worker) reste techniquement accessible ;  */
/*  pour une vraie fermeture, il faut une authentification serveur.    */
/*                                                                      */
/*  Changer le code : générer le SHA-256 du nouveau code puis          */
/*  remplacer CODE_HASH ci-dessous. En console navigateur :            */
/*    crypto.subtle.digest('SHA-256', new TextEncoder().encode('MON_CODE'))  */
/*      .then(b => console.log([...new Uint8Array(b)]                   */
/*        .map(x => x.toString(16).padStart(2,'0')).join('')))          */
/* ------------------------------------------------------------------ */
(function () {
  'use strict';

  // Code d'accès (empreinte SHA-256)
  var CODE_HASH = '6d41366d187aab33743770d0f2227ddca6e861da0dfeb924532efde6adc5fdc8';
  var KEY = 'ds_gate_ok';

  // Si la page est embarquée par notre propre app (iframe même origine),
  // le parent a déjà géré le déverrouillage — on ne remet pas de rideau.
  try {
    if (window.self !== window.top && window.top.location.origin === window.location.origin) return;
  } catch (e) { /* parent d'une autre origine : on garde le rideau */ }

  // Déjà déverrouillé sur ce navigateur ?
  try {
    if (localStorage.getItem(KEY) === CODE_HASH) return;
  } catch (e) { /* localStorage indisponible : on demandera le code */ }

  // Masquer immédiatement toute la page (évite le flash du tableau)
  var root = document.documentElement;
  root.style.visibility = 'hidden';

  function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function mount() {
    var ov = document.createElement('div');
    ov.id = 'ds-gate-overlay';
    ov.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647', 'visibility:visible',
      'background:#F4F1EA', 'display:flex', 'align-items:center', 'justify-content:center',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(';'));
    ov.innerHTML =
      '<div style="width:100%;max-width:340px;padding:0 20px;text-align:center;">' +
        '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:30px;font-weight:700;color:#3A5538;line-height:1.1;">Domaine Sesquier</div>' +
        '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9DA393;margin:6px 0 24px;">Accès réservé</div>' +
        '<form id="ds-gate-form">' +
          '<input id="ds-gate-input" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Code d\'accès" ' +
            'style="width:100%;padding:13px 14px;border:1px solid #E8E5DE;border-radius:8px;font-size:15px;text-align:center;outline:none;box-sizing:border-box;background:#fff;" />' +
          '<button type="submit" ' +
            'style="width:100%;margin-top:10px;padding:13px;border:none;border-radius:8px;background:#3A5538;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Entrer</button>' +
          '<div id="ds-gate-err" style="height:16px;margin-top:12px;color:#C53030;font-size:12.5px;"></div>' +
        '</form>' +
      '</div>';
    root.appendChild(ov);

    var form  = ov.querySelector('#ds-gate-form');
    var input = ov.querySelector('#ds-gate-input');
    var err   = ov.querySelector('#ds-gate-err');
    setTimeout(function () { input.focus(); }, 50);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sha256((input.value || '').trim()).then(function (h) {
        if (h === CODE_HASH) {
          try { localStorage.setItem(KEY, CODE_HASH); } catch (_) {}
          ov.parentNode && ov.parentNode.removeChild(ov);
          root.style.visibility = '';
        } else {
          err.textContent = 'Code incorrect';
          input.value = '';
          input.focus();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
