// safemcp client-side verification hydration.
//
// Fetches the list of verified servers once per page load, then toggles
// the .verified-badge / .claim-btn elements accordingly. Runs without
// blocking page render.

(function () {
  function applyVerified(verifiedSet) {
    document.querySelectorAll('[data-verified-for]').forEach(function (el) {
      if (verifiedSet.has(el.getAttribute('data-verified-for'))) {
        el.hidden = false;
      }
    });
    document.querySelectorAll('[data-claim-for]').forEach(function (el) {
      if (verifiedSet.has(el.getAttribute('data-claim-for'))) {
        el.hidden = true;
      }
    });
  }

  function run() {
    // Only fetch if there's at least one claimable/verifiable element on
    // this page. Avoids wasted requests on /about, /sponsors, etc.
    if (
      !document.querySelector('[data-verified-for]') &&
      !document.querySelector('[data-claim-for]')
    ) {
      return;
    }

    fetch('/api/verified.json', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { verified: [] }; })
      .then(function (data) {
        var list = (data && data.verified) || [];
        applyVerified(new Set(list));
      })
      .catch(function () { /* silent — UI just stays in default state */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
