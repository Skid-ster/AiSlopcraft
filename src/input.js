export function requestGamePointerLock(canvas) {
  // On an automatic launch or a denied permission, leave the click-to-play hint available.
  // Older browsers return undefined rather than a promise.
  void canvas?.requestPointerLock?.()?.catch(() => {});
}
