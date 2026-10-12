/* =====================================================================
   Courage Library — Early Access top banner
   File: js/earlyAccessBanner.js
   Add ONE line before </body> on any page:
     <script src="/js/earlyAccessBanner.js" defer></script>
   - No dependencies (works with or without Tailwind)
   - Hidden on the early-access page itself
   - Dismissible; stays hidden for 3 days after closing
   ===================================================================== */
(function () {
  'use strict';

  var LINK = '/early-access?utm_source=website&utm_medium=banner&utm_campaign=founding_members';
  var KEY = 'cl_ea_banner_closed_at';
  var HIDE_FOR_MS = 3 * 24 * 60 * 60 * 1000;

  if (/early-access/.test(window.location.pathname)) return;

  try {
    var closedAt = Number(window.localStorage.getItem(KEY) || 0);
    if (closedAt && Date.now() - closedAt < HIDE_FOR_MS) return;
  } catch (e) { /* storage blocked: just show the banner */ }

  function mount() {
    if (document.getElementById('cl-ea-banner')) return;

    var bar = document.createElement('div');
    bar.id = 'cl-ea-banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Early access announcement');
    bar.style.cssText = [
      'position:relative', 'z-index:60', 'display:flex', 'align-items:center',
      'justify-content:center', 'gap:12px', 'padding:10px 44px 10px 16px',
      'background:linear-gradient(90deg,#1E40AF,#1D4ED8)', 'color:#fff',
      'font:600 14px/1.4 Inter,"Noto Sans Devanagari",system-ui,sans-serif',
      'text-align:center', 'flex-wrap:wrap'
    ].join(';');

    var text = document.createElement('span');
    text.textContent = 'नया Courage Library आ रहा है — पहले 1,000 students के लिए free Founding Member access';

    var cta = document.createElement('a');
    cta.href = LINK;
    cta.textContent = 'अभी जुड़ें →';
    cta.style.cssText = 'background:#F59E0B;color:#0F172A;padding:6px 14px;border-radius:999px;text-decoration:none;white-space:nowrap;font-weight:700';

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px';
    close.addEventListener('click', function () {
      bar.remove();
      try { window.localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ }
    });

    cta.addEventListener('click', function () {
      if (typeof window.gtag === 'function') window.gtag('event', 'early_access_banner_click');
    });

    bar.appendChild(text);
    bar.appendChild(cta);
    bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
