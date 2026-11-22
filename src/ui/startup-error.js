export function showGraphicsStartupError(document, onReload) {
  document.getElementById('game-canvas')?.remove();
  const uiRoot = document.getElementById('ui');
  if (!uiRoot) return null;

  const fallback = document.createElement('main');
  fallback.className = 'startup-error-screen';
  fallback.setAttribute('role', 'alert');
  const card = document.createElement('section');
  card.className = 'startup-error-card';
  const heading = document.createElement('h1');
  heading.textContent = 'Graphics could not start';
  const message = document.createElement('p');
  message.textContent = 'AiSlopcraft needs WebGL to draw the world. Try enabling hardware acceleration, updating your browser, or opening the game on a device that supports WebGL.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'RELOAD GAME';
  retry.addEventListener('click', onReload);
  card.append(heading, message, retry);
  fallback.append(card);
  uiRoot.append(fallback);
  retry.focus();
  return fallback;
}
