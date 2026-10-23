// Small renderer helpers that can be tested without creating a WebGL context.
export function syncFogUniforms(materials, fog) {
  if (!fog?.color) return false;
  for (const material of materials) {
    const uniforms = material?.uniforms;
    if (!uniforms?.uFogColor || !uniforms?.uFogNear || !uniforms?.uFogFar) continue;
    uniforms.uFogColor.value.copy(fog.color);
    uniforms.uFogNear.value = fog.near;
    uniforms.uFogFar.value = fog.far;
  }
  return true;
}
