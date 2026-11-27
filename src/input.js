export function requestGamePointerLock(canvas) {
  // On an automatic launch or a denied permission, leave the click-to-play hint available.
  // Older browsers return undefined rather than a promise.
  void canvas?.requestPointerLock?.()?.catch(() => {});
}

export function touchStick({ left, top, width = 96, height = 96 }, clientX, clientY, bindings) {
  width ||= 96;
  height ||= 96;
  const radius = Math.max(24, Math.min(width, height) * 0.42);
  const dx = clientX - (left + width / 2), dy = clientY - (top + height / 2);
  const scale = Math.min(1, radius / (Math.hypot(dx, dy) || 1));
  const keys = new Set();
  if (dy / radius < -0.28) keys.add(bindings.forward);
  if (dy / radius > 0.28) keys.add(bindings.back);
  if (dx / radius < -0.28) keys.add(bindings.left);
  if (dx / radius > 0.28) keys.add(bindings.right);
  return { x: dx * scale, y: dy * scale, keys };
}

export function bindTouchPointers(controls, player, isPlaying) {
  const look = controls.querySelector('#touch-look-zone');
  const joystick = controls.querySelector('#touch-joystick');
  const knob = controls.querySelector('#touch-joystick-knob');
  const actions = new Map();
  const lookPositions = new Map();
  let joystickPointer = null, joystickKeys = new Set();
  const isHeld = action => [...actions.values()].includes(action);

  function activate(event) {
    if (event.pointerType === 'mouse') return false;
    event.preventDefault();
    if (!isPlaying()) return false;
    player.setTouchPointer(event.pointerId, true);
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
    return true;
  }

  function release({ pointerId }) {
    const action = actions.get(pointerId);
    actions.delete(pointerId);
    if (action === 'attack' && !isHeld('attack')) {
      player.leftDown = false; player.mining.active = false; player.mining.progress = 0;
    }
    if (action === 'use' && !isHeld('use')) player.rightDown = false;
    if (action?.startsWith('key:')) {
      const code = action.slice(4);
      if (!isHeld(action) && !joystickKeys.has(code)) player.setTouchKey(code, false);
    }
    lookPositions.delete(pointerId);
    player.setTouchPointer(pointerId, false);
    if (joystickPointer === pointerId) {
      joystickPointer = null;
      for (const code of joystickKeys) if (!isHeld(`key:${code}`)) player.setTouchKey(code, false);
      joystickKeys.clear();
      knob.style.transform = 'translate(0, 0)';
    }
  }

  function bind(element, onDown, onMove) {
    element.addEventListener('pointerdown', event => { if (activate(event)) onDown(event); });
    if (onMove) element.addEventListener('pointermove', onMove);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, release);
  }

  const rememberLook = event => lookPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
  bind(look, rememberLook, event => {
    const previous = lookPositions.get(event.pointerId);
    if (!previous) return;
    player.mouseDX += (event.clientX - previous.x) * 2.25;
    player.mouseDY += (event.clientY - previous.y) * 2.25;
    rememberLook(event);
  });

  function updateJoystick(event) {
    const { x, y, keys } = touchStick(joystick.getBoundingClientRect(), event.clientX, event.clientY, player.bindings);
    knob.style.transform = `translate(${x}px, ${y}px)`;
    for (const code of joystickKeys) if (!keys.has(code) && !isHeld(`key:${code}`)) player.setTouchKey(code, false);
    for (const code of keys) player.setTouchKey(code, true);
    joystickKeys = keys;
  }
  bind(joystick, event => { joystickPointer = event.pointerId; updateJoystick(event); }, event => {
    if (event.pointerId === joystickPointer) updateJoystick(event);
  });

  function bindHold(id, action, fallbackButton) {
    bind(controls.querySelector(`#${id}`), event => {
      if (action.startsWith('binding:')) {
        const keyCode = player.bindings[action.slice(8)];
        if (!keyCode) return;
        actions.set(event.pointerId, `key:${keyCode}`);
        player.setTouchKey(keyCode, true);
        return;
      }
      actions.set(event.pointerId, action);
      if (action.startsWith('key:')) { player.setTouchKey(action.slice(4), true); return; }
      if (action === 'attack') player.leftDown = true;
      else player.rightDown = true;
      const boundButton = /^Mouse([0-2])$/.exec(player.bindings[action] || '');
      const button = boundButton ? Number(boundButton[1]) : fallbackButton;
      const doc = controls.ownerDocument;
      doc.dispatchEvent(new doc.defaultView.MouseEvent('mousedown', { button, bubbles: true, cancelable: true }));
    });
  }
  bindHold('touch-mine', 'attack', 0);
  bindHold('touch-use', 'use', 2);
  bindHold('touch-jump', 'binding:jump');
  bindHold('touch-sneak', 'binding:sneak');

  return () => {
    player.clearTouchInput?.();
    actions.clear();
    lookPositions.clear();
    joystickPointer = null;
    joystickKeys.clear();
    knob.style.transform = 'translate(0, 0)';
  };
}
