import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VehicleManager } from '../src/entities/vehicles.js';
import { AIR, WATER, RAIL, STONE } from '../src/world/blocks.js';

class World {
  constructor(){ this.blocks=new Map(); }
  key(x,y,z){return `${x},${y},${z}`;}
  getChunk(){return {generated:true};}
  getBlock(x,y,z){return this.blocks.get(this.key(x,y,z)) ?? AIR;}
  set(x,y,z,id){this.blocks.set(this.key(x,y,z),id);}
}
const world=new World(), scene=new THREE.Scene(), vehicles=new VehicleManager(world,scene,null);
for(let x=0;x<8;x++) for(let z=0;z<8;z++) world.set(x,0,z,STONE);
world.set(2,1,2,WATER);world.set(3,1,2,WATER);world.set(4,1,2,WATER);
for(let x=1;x<=4;x++) world.set(x,1,5,RAIL);
const camera=new THREE.PerspectiveCamera();
const player={camera,pos:new THREE.Vector3(2.5,2,1),vel:new THREE.Vector3(),yaw:-Math.PI/2,pitch:0,keys:{},bindings:{forward:'KeyW',back:'KeyS',sneak:'ShiftLeft'},air:300,dead:false,updateRidingView(){this.camera.position.set(this.pos.x,this.pos.y+1.62,this.pos.z)},raycast(){return null;}};
assert.equal(vehicles.place('boat',{x:0,y:1,z:0}),null);
const boat=vehicles.place('boat',{x:2,y:1,z:2});assert.ok(boat);
assert.equal(vehicles.place('boat',{x:2,y:1,z:2}),null,'cannot overlap vehicles');
assert.equal(vehicles.mount(boat,player),true);
player.keys.KeyW=true;
for(let i=0;i<20;i++) vehicles.update(.05,player);
assert.ok(boat.group.position.x>3,'boat moves under player control');
assert.equal(player.pos.x,boat.group.position.x,'rider follows the vehicle');
player.keys.KeyW=false;player.keys.ShiftLeft=true;vehicles.update(.05,player);
assert.equal(vehicles.mounted,null,'sneak dismounts');
assert.equal(vehicles.remove(boat),true);
const cart=vehicles.place('minecart',{x:1,y:1,z:5}); assert.ok(cart);
assert.equal(vehicles.place('minecart',{x:0,y:1,z:0}),null);
player.keys.ShiftLeft=false;player.keys.KeyW=true;vehicles.mount(cart,player);
for(let i=0;i<15;i++) vehicles.update(.05,player);
assert.ok(cart.group.position.x>2,'minecart follows adjacent rails');
assert.equal(vehicles.remove(cart),false,'cannot remove an occupied vehicle');
vehicles.dismount(player,true);
const saved=vehicles.serialize(); const loaded=new VehicleManager(world,new THREE.Scene(),null); loaded.load(saved);
assert.equal(loaded.vehicles.length,1); assert.equal(loaded.vehicles[0].type,'minecart');
assert.deepEqual(loaded.serialize()[0].pos,saved[0].pos);
const storage=vehicles.place('storage',{x:1,y:1,z:5});
assert.ok(storage); storage.slots[0]={id:4,count:12};
assert.equal(vehicles.mount(storage,player),false);
const powered=vehicles.place('powered',{x:4,y:1,z:5});
assert.ok(powered); powered.fuel=10; powered.travel=[-1,0];
for(let i=0;i<10;i++) vehicles.update(.05,player);
assert.ok(powered.group.position.x<4.5,'fueled cart moves without a rider');
const restored=new VehicleManager(world,new THREE.Scene()); restored.load(vehicles.serialize());
assert.equal(restored.vehicles.find(v=>v.type==='storage').slots[0].count,12);
assert.ok(restored.vehicles.find(v=>v.type==='powered').fuel>0);
const curveWorld=new World();
for (const [x,z] of [[1,1],[2,1],[3,1],[3,2],[3,3],[3,4],[3,5]]) curveWorld.set(x,1,z,RAIL);
const curveVehicles=new VehicleManager(curveWorld,new THREE.Scene());
const curved=curveVehicles.place('minecart',{x:1,y:1,z:1});
player.yaw=-Math.PI/2; player.keys.KeyW=true; curveVehicles.mount(curved,player);
for (let i=0;i<28;i++) curveVehicles.update(.05,player);
assert.ok(curved.group.position.z>1.5,'moving minecart follows a flat curve');
const before=curved.group.position.z; player.keys.KeyW=false;
for (let i=0;i<5;i++) curveVehicles.update(.05,player);
assert.ok(curved.group.position.z>before,'minecart coasts when the rider releases forward');
console.log('ALL VEHICLE TESTS PASSED');
