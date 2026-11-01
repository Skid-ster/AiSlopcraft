import assert from 'node:assert/strict';
import { TILES } from '../src/world/blocks.js';
import { applyClassicTextures } from '../src/world/classic-textures.js';
import { ITEM_ICON_INDEX } from '../src/ui/ui.js';

// A minimal image-data context lets the atlas artwork be tested without a DOM.
function render() {
  const tiles = new Map();
  const ctx = {
    createImageData(w,h) { return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}; },
    putImageData(img,x,y) { assert.equal(x%16,0); assert.equal(y%16,0); tiles.set(x/16 + y/16*16,img); },
  };
  applyClassicTextures(ctx);
  return tiles;
}
const a=render(), b=render();
for (const [tile,img] of a) {
  assert.deepEqual(img.data,b.get(tile).data,`tile ${tile} is deterministic`);
  assert.equal(img.data.length,16*16*4);
}
const pixel=(tile,x,y) => [...a.get(tile).data.slice((y*16+x)*4,(y*16+x)*4+4)];
assert.notDeepEqual(pixel(TILES.grass_side,0,0),pixel(TILES.grass_side,0,15));
assert.equal(pixel(TILES.glass,8,8)[3],0,'glass center remains transparent');
assert.equal(pixel(TILES.door_wood_bottom,4,3)[3],255,'bottom of wooden door is opaque');
assert.notDeepEqual(pixel(TILES.furnace_front,7,11),pixel(TILES.furnace_front_lit,7,11),'lit furnace has a visible flame');
assert.notEqual(ITEM_ICON_INDEX[283],ITEM_ICON_INDEX[261],'gold sword no longer shares the bow icon');
assert.notEqual(ITEM_ICON_INDEX[285],ITEM_ICON_INDEX[328],'gold pickaxe no longer shares the cart icon');
assert.notEqual(ITEM_ICON_INDEX[342],ITEM_ICON_INDEX[343],'minecart variants have distinct icons');
console.log('ALL TEXTURE TESTS PASSED');
