(() => {
  'use strict';

  const VERSION = 'v2026.09.19.6';
  window.TINY_DUNGEON_VERSION = VERSION;

  const renderVersion = () => {
    document.querySelectorAll('[data-app-version]').forEach(element => {
      element.textContent = VERSION;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVersion, { once: true });
  } else {
    renderVersion();
  }
})();
