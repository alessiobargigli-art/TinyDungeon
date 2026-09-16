(() => {
  'use strict';

  const base = document.getElementById('moveJoystick');
  const knob = document.getElementById('moveJoystickKnob');
  const label = document.getElementById('moveJoystickLabel');
  if (!base || !knob) return;

  const proxies = {
    up: document.querySelector('[data-touch-proxy="up"]'),
    down: document.querySelector('[data-touch-proxy="down"]'),
    left: document.querySelector('[data-touch-proxy="left"]'),
    right: document.querySelector('[data-touch-proxy="right"]')
  };

  const active = new Set();
  let pointerId = null;
  const maxTravel = 43;
  const deadZone = 12;

  const directionLabels = {
    '': 'FERMO', up: 'N', 'up,right': 'NE', right: 'E', 'down,right': 'SE',
    down: 'S', 'down,left': 'SO', left: 'O', 'up,left': 'NO'
  };

  function emit(key, pressed) {
    const proxy = proxies[key];
    if (!proxy) return;
    proxy.dispatchEvent(new PointerEvent(pressed ? 'pointerdown' : 'pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 999,
      pointerType: 'touch'
    }));
  }

  function setKeys(nextKeys) {
    for (const key of [...active]) {
      if (!nextKeys.has(key)) {
        emit(key, false);
        active.delete(key);
      }
    }
    for (const key of nextKeys) {
      if (!active.has(key)) {
        emit(key, true);
        active.add(key);
      }
    }
    if (label) label.textContent = directionLabels[[...nextKeys].sort((a, b) => ['up', 'right', 'down', 'left'].indexOf(a) - ['up', 'right', 'down', 'left'].indexOf(b)).join(',')] || 'FERMO';
  }

  function neutral() {
    setKeys(new Set());
    knob.style.transform = 'translate3d(0, 0, 0)';
    base.classList.remove('active');
  }

  function updateFromPointer(clientX, clientY) {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const distance = Math.hypot(dx, dy);

    if (distance <= deadZone) {
      neutral();
      return;
    }

    const scale = Math.min(1, maxTravel / distance);
    const visualX = dx * scale;
    const visualY = dy * scale;
    knob.style.transform = `translate3d(${visualX}px, ${visualY}px, 0)`;
    base.classList.add('active');

    const angle = Math.atan2(dy, dx);
    const octant = Math.round(angle / (Math.PI / 4));
    const dirs = [
      new Set(['right']),
      new Set(['right', 'down']),
      new Set(['down']),
      new Set(['down', 'left']),
      new Set(['left']),
      new Set(['left', 'up']),
      new Set(['up']),
      new Set(['up', 'right'])
    ];
    setKeys(dirs[(octant + 8) % 8]);
  }

  base.addEventListener('pointerdown', event => {
    event.preventDefault();
    pointerId = event.pointerId;
    base.setPointerCapture?.(pointerId);
    updateFromPointer(event.clientX, event.clientY);
  }, { passive: false });

  base.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    updateFromPointer(event.clientX, event.clientY);
  }, { passive: false });

  const release = event => {
    if (pointerId !== null && event?.pointerId != null && event.pointerId !== pointerId) return;
    pointerId = null;
    neutral();
  };

  base.addEventListener('pointerup', release);
  base.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => { pointerId = null; neutral(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pointerId = null; neutral(); } });

  neutral();
})();