// Import only the block sprites that this renderer can use from a local Java
// 1.7 resource pack (or a client jar). Minecraft assets are not distributed.
import { unzipSync } from 'fflate';
import { TILES } from './blocks.js';

export const BLOCK_SPRITES = {
  grass_top:'grass_top', grass_side:'grass_side', dirt:'dirt', stone:'stone', cobblestone:'cobble',
  bedrock:'bedrock', sand:'sand', gravel:'gravel', log_oak:'log_side', log_oak_top:'log_top',
  leaves_oak:'leaves', planks_oak:'planks', glass:'glass', lava_still:'lava',
  sandstone_top:'sandstone_top', sandstone_normal:'sandstone_side', sandstone_bottom:'sandstone_bottom',
  brick:'brick', tnt_top:'tnt_top', tnt_side:'tnt_side', tnt_bottom:'tnt_bottom',
  crafting_table_top:'crafting_top', crafting_table_side:'crafting_side', crafting_table_front:'crafting_front',
  furnace_top:'furnace_top', furnace_side:'furnace_side', furnace_front_off:'furnace_front', furnace_front_on:'furnace_front_lit',
  coal_ore:'coal_ore', iron_ore:'iron_ore', gold_ore:'gold_ore', diamond_ore:'diamond_ore', redstone_ore:'redstone_ore', lapis_ore:'lapis_ore',
  clay:'clay', snow:'snow', ice:'ice', obsidian:'obsidian', glowstone:'glowstone', netherrack:'netherrack', soul_sand:'slow_sand',
  stonebrick:'stone_brick', cobblestone_mossy:'mossy_cobble', iron_block:'iron_block', gold_block:'gold_block', diamond_block:'diamond_block', bookshelf:'bookshelf',
  pumpkin_side:'pumpkin_side', pumpkin_face_off:'pumpkin_face', pumpkin_face_on:'jack_o_lantern', pumpkin_top:'pumpkin_top',
  cactus_side:'cactus_side', cactus_top:'cactus_top', reeds:'sugarcane', flower_rose:'rose', flower_dandelion:'dandelion', tallgrass:'tall_grass',
  mushroom_red:'mushroom_red', mushroom_brown:'mushroom_brown', sapling_oak:'sapling', torch_on:'torch', ladder:'ladder', rail_normal:'rail',
  jukebox_side:'jukebox_side', jukebox_top:'jukebox_top', web:'cobweb', farmland_dry:'farmland', farmland_wet:'farmland_wet',
  bed_head_top:'bed_top', bed_feet_top:'bed_foot', bed_head_side:'bed_side', bed_head_end:'bed_end',
  cake_top:'cake_top', cake_side:'cake_side', cake_bottom:'cake_bottom', lever:'lever', repeater_off:'repeater',
  redstone_torch_off:'redstone_torch_off', door_wood_upper:'door_wood', door_wood_lower:'door_wood_bottom',
  door_iron_upper:'door_iron', door_iron_lower:'door_iron_bottom', water_still:'water',
  ...Object.fromEntries(Array.from({length: 10}, (_, i) => [`destroy_stage_${i}`, `destroy${i}`])),
  ...Object.fromEntries(['white','red','orange','yellow','lime','green','cyan','light_blue','blue','purple','magenta','pink','gray','silver','brown','black'].map(c => [`wool_colored_${c}`, `wool_${c === 'light_blue' ? 'lightblue' : c === 'silver' ? 'lightgray' : c}`])),
  ...Object.fromEntries(Array.from({length: 8}, (_, i) => [`wheat_stage_${i}`, `crops${i}`])),
};
const PREFIX = 'assets/minecraft/textures/blocks/';
const MAX_ARCHIVE = 32 * 1024 * 1024, MAX_IMAGE = 1024 * 1024, MAX_TOTAL = 8 * 1024 * 1024;

export function extractBlockSprites(bytes) {
  if (bytes.length > MAX_ARCHIVE) throw new Error('Pack is too large (maximum 32 MB).');
  let total = 0;
  const entries = unzipSync(bytes, { filter(entry) {
    if (!entry.name.startsWith(PREFIX) || !entry.name.endsWith('.png')) return false;
    const name = entry.name.slice(PREFIX.length, -4);
    if (!Object.hasOwn(BLOCK_SPRITES, name) && name !== 'grass_side_overlay') return false;
    total += entry.originalSize;
    if (entry.originalSize > MAX_IMAGE || total > MAX_TOTAL) throw new Error('Pack textures are too large.');
    return true;
  }});
  const sprites = Object.fromEntries(Object.entries(entries).map(([path, data]) => [path.slice(PREFIX.length, -4), data]));
  if (!Object.keys(sprites).some(name => Object.hasOwn(BLOCK_SPRITES, name))) throw new Error('No supported 1.7 block textures found in this archive.');
  return sprites;
}

function dimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, i) => bytes[i] === value) ||
      String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('A block texture is not a PNG.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = header.getUint32(16), height = header.getUint32(20);
  if (width < 1 || width > 512 || height < width || height > 8192 || height % width)
    throw new Error('A block texture has unsupported dimensions.');
  return [width, height];
}

async function decode(bytes) {
  dimensions(bytes);
  const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
  if (bitmap.width < 1 || bitmap.width > 512 || bitmap.height < bitmap.width || bitmap.height > 8192 || bitmap.height % bitmap.width) {
    bitmap.close(); throw new Error('A block texture has unsupported dimensions.');
  }
  return bitmap;
}

// A neutral biome colour baked into grayscale vanilla sprites. The existing
// mesher still supplies its climate variation; this is not a full colormap system.
function tint(ctx, color) {
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = color; ctx.fillRect(0, 0, 16, 16);
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(ctx.canvas._mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

export async function paintBlockSprites(target, sprites) {
  // Paint into a staging copy, so an invalid image cannot partially alter the atlas.
  const staged = document.createElement('canvas'); staged.width = target.width; staged.height = target.height;
  const out = staged.getContext('2d'); out.imageSmoothingEnabled = false; out.drawImage(target, 0, 0);
  const decoded = new Map();
  try {
    let pixels = 0;
    for (const bytes of Object.values(sprites)) {
      const [width, height] = dimensions(bytes); pixels += width * height;
      if (pixels > 8 * 1024 * 1024) throw new Error('Pack images are too large.');
    }
    for (const [name, bytes] of Object.entries(sprites)) decoded.set(name, await decode(bytes));
    for (const [name, tileName] of Object.entries(BLOCK_SPRITES)) {
      const image = decoded.get(name); if (!image) continue;
      const tile = TILES[tileName]; if (tile === undefined) continue;
      const part = document.createElement('canvas'); part.width = part.height = 16;
      const ctx = part.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, image.width, image.width, 0, 0, 16, 16);
      if (name === 'grass_top' || name === 'leaves_oak') {
        const mask = document.createElement('canvas'); mask.width = mask.height = 16;
        mask.getContext('2d').drawImage(part, 0, 0); part._mask = mask;
        tint(ctx, name === 'grass_top' ? '#7cbd4e' : '#6da442');
      }
      if (name === 'grass_side' && decoded.has('grass_side_overlay')) {
        const overlay = document.createElement('canvas'); overlay.width = overlay.height = 16;
        const oc = overlay.getContext('2d'); oc.imageSmoothingEnabled = false;
        const img = decoded.get('grass_side_overlay'); oc.drawImage(img, 0, 0, img.width, img.width, 0, 0, 16, 16);
        const mask = document.createElement('canvas'); mask.width = mask.height = 16; mask.getContext('2d').drawImage(overlay, 0, 0);
        overlay._mask = mask; tint(oc, '#7cbd4e'); ctx.drawImage(overlay, 0, 0);
      }
      const x = tile % 16 * 16, y = Math.floor(tile / 16) * 16;
      out.clearRect(x, y, 16, 16); out.drawImage(part, x, y);
      // Snow layers and snow blocks share the same sprite in Java 1.7.3.
      if (name === 'snow') { const sx = TILES.snow_block % 16 * 16, sy = Math.floor(TILES.snow_block / 16) * 16; out.clearRect(sx, sy, 16, 16); out.drawImage(part, sx, sy); }
    }
    const ctx = target.getContext('2d'); ctx.clearRect(0, 0, target.width, target.height); ctx.drawImage(staged, 0, 0);
    return Object.keys(sprites).filter(name => Object.hasOwn(BLOCK_SPRITES, name)).length;
  } finally { for (const image of decoded.values()) image.close(); }
}
