import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { RedstoneSimulator } from '../src/world/redstone.js';
import { structurePartner, setDoorOpen } from '../src/world/structures.js';
import { AIR, STONE, LEVER, REDSTONE_WIRE, REDSTONE_REPEATER, REDSTONE_TORCH, IRON_DOOR, WOOD_DOOR, BED_BLOCK, TNT } from '../src/world/blocks.js';

const world = new World('redstone-test', new THREE.Scene());
world.gen.fillChunk = chunk => { chunk.blocks.fill(AIR); chunk.generated=true; };
world.gen.decorate = (_w, chunk) => { chunk.decorated=true; };
const ignited=[];
const circuit = new RedstoneSimulator(world,{ignite:(x,y,z)=>ignited.push(`${x},${y},${z}`)});
world.generateChunk(0,0);
const set=(x,z,id,meta=0)=>world.setBlock(x,10,z,id,meta);
set(2,2,LEVER); set(3,2,REDSTONE_WIRE); set(4,2,REDSTONE_WIRE); set(5,2,IRON_DOOR);
circuit.update(); assert.equal(world.getMeta(5,10,2)&4,0);
world.setMeta(2,10,2,8); circuit.update();
assert.equal(world.getMeta(3,10,2),15);
assert.equal(world.getMeta(4,10,2),14);
assert.equal(world.getMeta(5,10,2)&4,4,'powered iron door opens');
world.setMeta(2,10,2,0); circuit.update();
assert.equal(world.getMeta(3,10,2),0); assert.equal(world.getMeta(4,10,2),0);
assert.equal(world.getMeta(5,10,2)&4,0,'door closes when power is removed');

// Repeater receives at its back and supplies only its front.
set(4,2,REDSTONE_REPEATER,3); set(5,2,REDSTONE_WIRE); set(6,2,TNT);
world.setMeta(2,10,2,8); circuit.update();
assert.equal(world.getMeta(4,10,2)&4,0); circuit.update(.1);
assert.equal(world.getMeta(4,10,2)&4,4,'repeater becomes powered');
assert.equal(world.getMeta(5,10,2),15,'repeater restores full signal');
assert.deepEqual(ignited,['6,10,2']);
world.setMeta(2,10,2,0); circuit.update(); circuit.update(.1);
assert.equal(world.getMeta(4,10,2)&4,0); assert.equal(world.getMeta(5,10,2),0);
world.setMeta(4,10,2,2); world.setMeta(2,10,2,8); circuit.update();
assert.equal(world.getMeta(4,10,2)&4,0,'repeater rejects input from its output side');

// Independent torch powers dust and removing it powers the network down.
set(8,2,REDSTONE_TORCH); set(9,2,REDSTONE_WIRE); circuit.update();
assert.equal(world.getMeta(9,10,2),15);
set(8,2,AIR); circuit.update(); assert.equal(world.getMeta(9,10,2),0);
// A repeater has one to four redstone ticks of delay and preserves a short pulse.
set(4,2,REDSTONE_REPEATER,3 | (3 << 3));
world.setMeta(2,10,2,8); circuit.update();
circuit.update(.39); assert.equal(world.getMeta(4,10,2)&4,0);
circuit.update(.01); assert.equal(world.getMeta(4,10,2)&4,4);
world.setMeta(2,10,2,0); circuit.update(); circuit.update(.4);
assert.equal(world.getMeta(4,10,2)&4,0);
set(4,2,REDSTONE_REPEATER,3);
world.setMeta(2,10,2,8); circuit.update();
world.setMeta(2,10,2,0); circuit.update(.05); circuit.update(.05);
assert.equal(world.getMeta(4,10,2)&4,4,'short input produces an output pulse');
circuit.update(.1); assert.equal(world.getMeta(4,10,2)&4,0);

// A torch inverts power to the solid block it is attached to, including light.
world.setBlock(8,9,5,STONE); world.setBlock(8,10,5,REDSTONE_TORCH);
world.setBlock(7,9,5,LEVER); world.setBlock(9,10,5,REDSTONE_WIRE); circuit.update();
assert.equal(world.getMeta(9,10,5),15);
world.setMeta(7,9,5,8); circuit.update(); circuit.update(.1);
assert.equal(world.getMeta(8,10,5)&8,8); assert.equal(world.getMeta(9,10,5),0);
assert.equal(world.getLight(8,10,5)&15,0,'unlit torch no longer emits light');
world.setMeta(7,9,5,0); circuit.update(); circuit.update(.1);
assert.equal(world.getMeta(8,10,5)&8,0); assert.equal(world.getMeta(9,10,5),15);
assert.ok((world.getLight(8,10,5)&15)>=7);

// A powered solid block can transmit power to a door or a repeater's input.
world.setBlock(3,9,12,LEVER,8); world.setBlock(4,9,12,STONE); world.setBlock(5,9,12,IRON_DOOR);
circuit.update(); assert.equal(world.getMeta(5,9,12)&4,4);
world.setMeta(3,9,12,0); circuit.update(); assert.equal(world.getMeta(5,9,12)&4,0);

// Dust connects up and down a block step, but not through a blocked ceiling.
world.setBlock(11,10,4,LEVER,8); world.setBlock(12,10,4,REDSTONE_WIRE);
world.setBlock(13,10,4,STONE); world.setBlock(13,11,4,REDSTONE_WIRE); circuit.update();
assert.equal(world.getMeta(13,11,4),14);
world.setBlock(12,11,4,STONE); circuit.update();
assert.equal(world.getMeta(13,11,4),0);

// Two-part structures remain synchronized, including upper-half power.
world.setBlock(10,10,10,WOOD_DOOR,1); world.setBlock(10,11,10,WOOD_DOOR,9);
assert.deepEqual(structurePartner(world,10,11,10),{x:10,y:10,z:10,meta:1});
assert.equal(setDoorOpen(world,10,11,10,true),true);
assert.equal(world.getMeta(10,10,10)&4,4); assert.equal(world.getMeta(10,11,10)&4,4);
setDoorOpen(world,10,10,10,false);
world.setBlock(11,11,10,LEVER,8); circuit.update();
assert.equal(world.getMeta(10,10,10)&4,4); assert.equal(world.getMeta(10,11,10)&4,4);
world.setMeta(11,11,10,0); circuit.update();
assert.equal(world.getMeta(10,10,10)&4,0); assert.equal(world.getMeta(10,11,10)&4,0);
world.setBlock(10,10,12,BED_BLOCK,3); world.setBlock(11,10,12,BED_BLOCK,11);
assert.equal(structurePartner(world,10,10,12)?.x,11);
assert.equal(structurePartner(world,11,10,12)?.x,10);
world.generateChunk(1,0);
world.setBlock(15,10,5,LEVER,8);world.setBlock(16,10,5,REDSTONE_WIRE);circuit.update();
assert.equal(world.getMeta(16,10,5),15);
world.unloadChunk(0,0);circuit.update();
assert.equal(world.getMeta(16,10,5),0,'unloading the source removes its signal');
world.generateChunk(0,0);circuit.update();
assert.equal(world.getMeta(16,10,5),15,'loading the source restores its signal');
console.log('ALL REDSTONE TESTS PASSED');
