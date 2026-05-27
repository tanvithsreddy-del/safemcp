// safemcp client-side verification hydration.
//
// Fetches the list of verified servers once per page load, then:
//   1. Reveals .verified-badge on matching rows
//   2. Hides .claim-btn on matching rows
//   3. Marks the row with data-verified="1" (for filtering)
//   4. Adds +VERIFIED_BONUS to data-score AND the visible score number
//   5. Dispatches "safemcp:verified-hydrated" so the filter bar re-applies

(function () {
  var VERIFIED_BONUS = 5;

  function applyVerified(verifiedSet) {
    // 1+2: badges and claim buttons
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

    // 3+4: row marking and score bump
    document.querySelectorAll('[data-server]').forEach(function (row) {
      var id = row.getAttribute('data-server');
      if (!verifiedSet.has(id)) return;

      row.setAttribute('data-verified', '1');

      // Bump the numeric data-score used by the filter bar for sort/min-score
      var cur = parseInt(row.getAttribute('data-score') || '0', 10);
      if (!isNaN(cur)) row.setAttribute('data-score', String(cur + VERIFIED_BONUS));

      // Update the visible score badge text. ScoreBadge renders the number
      // as text inside an element with class "score-num" (or just the badge
      // root). Be defensive: try a few common patterns.
      var badge = row.querySelector('.score-num, .score, [data-score-text]');
      if (badge) {
        var txt = (badge.textContent || '').trim();
        var n = parseInt(txt, 10);
        if (!isNaN(n)) badge.textContent = String(n + VERIFIED_BONUS);
        badge.classList.add('score-boosted');
      }
    });

    // 5: let the filter bar know it should re-apply with the new scores
    document.dispatchEvent(new CustomEvent('safemcp:verified-hydrated'));
  }

  function run() {
    if (
      !document.querySelector('[data-verified-for]') &&
      !document.querySelector('[data-claim-for]') &&
      !document.querySelector('[data-server]')
    ) {
      return;
    }

    fetch('/api/verified.json', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { verified: [] }; })
      .then(function (data) {
        var list = (data && data.verified) || [];
        applyVerified(new Set(list));
      })
      .catch(function () { /* silent */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
