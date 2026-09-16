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
  let dragging = false;
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

    const order = ['up', 'right', 'down', 'left'];
    const key = [...nextKeys].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(',');
    if (label) label.textContent = directionLabels[key] || 'FERMO';
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
    const dx = clientX - cx;
    const dy = clientY - cy;
    const distance = Math.hypot(dx, dy);

    if (distance <= deadZone) {
      neutral();
      return;
    }

    const maxVisualTravel = Math.min(maxTravel, Math.max(20, rect.width * 0.29));
    const scale = Math.min(1, maxVisualTravel / distance);
    knob.style.transform = `translate3d(${dx * scale}px, ${dy * scale}px, 0)`;
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

  function start(event) {
    if (dragging) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    pointerId = event.pointerId;
    dragging = true;

    try { base.setPointerCapture(pointerId); } catch { /* global listeners keep tracking */ }
    updateFromPointer(event.clientX, event.clientY);
  }

  function move(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    updateFromPointer(event.clientX, event.clientY);
  }

  function release(event) {
    if (!dragging) return;
    if (event?.pointerId != null && event.pointerId !== pointerId) return;

    const oldPointerId = pointerId;
    dragging = false;
    pointerId = null;

    try {
      if (oldPointerId != null && base.hasPointerCapture?.(oldPointerId)) base.releasePointerCapture(oldPointerId);
    } catch { /* already released */ }

    neutral();
  }

  base.addEventListener('pointerdown', start, { passive: false });

  // Track on window in capture phase: on mobile browsers this remains reliable even
  // when the finger leaves the joystick element or the DOM hit-target changes.
  window.addEventListener('pointermove', move, { passive: false, capture: true });
  window.addEventListener('pointerup', release, { capture: true });
  window.addEventListener('pointercancel', release, { capture: true });

  base.addEventListener('lostpointercapture', event => {
    if (dragging && event.pointerId === pointerId) release(event);
  });

  window.addEventListener('blur', () => release());
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  neutral();
})();