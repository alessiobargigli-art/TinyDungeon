(() => {
  'use strict';

  const installBtn = document.getElementById('installAppBtn');
  const installHint = document.getElementById('installHint');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const rotateFullscreenBtn = document.getElementById('rotateFullscreenBtn');
  const gameScreen = document.getElementById('gameScreen');

  let deferredInstallPrompt = null;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function updateInstallUi() {
    if (!installBtn) return;
    const installed = isStandalone();
    const canPrompt = !!deferredInstallPrompt;
    const showIosHelp = isIos && !installed;
    installBtn.classList.toggle('hidden', installed || (!canPrompt && !showIosHelp));
    installBtn.textContent = showIosHelp && !canPrompt ? 'Aggiungi alla Home' : 'Installa app';
    if (installed && installHint) installHint.textContent = 'TinyDungeon è installato come app.';
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallUi();
  });

  installBtn?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') deferredInstallPrompt = null;
      updateInstallUi();
      return;
    }

    if (isIos && installHint) {
      installHint.textContent = 'Su iPhone/iPad: Condividi → Aggiungi alla schermata Home.';
      installHint.classList.add('show');
    }
  });

  async function lockLandscape() {
    try {
      if (screen.orientation?.lock) await screen.orientation.lock('landscape');
    } catch {
      // Browser/device may not allow orientation locking outside fullscreen/PWA.
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
        await lockLandscape();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Fullscreen API is best-effort on mobile browsers.
    }
  }

  fullscreenBtn?.addEventListener('click', toggleFullscreen);
  rotateFullscreenBtn?.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    if (fullscreenBtn) fullscreenBtn.textContent = document.fullscreenElement ? 'Esci fullscreen' : 'Fullscreen';
    document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
  });

  function updateGameModeClass() {
    document.body.classList.toggle('game-playing', gameScreen && !gameScreen.classList.contains('hidden'));
  }

  if (gameScreen) {
    new MutationObserver(updateGameModeClass).observe(gameScreen, { attributes: true, attributeFilter: ['class'] });
  }
  updateGameModeClass();
  updateInstallUi();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // The game remains fully playable if service worker registration fails.
      });
    });
  }
})();
