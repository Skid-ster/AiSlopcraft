// Rideable boats and minecarts. Vehicles are independent world entities and
// serialize separately from the player; mount state is deliberately not saved.
import * as THREE from 'three';
import { AIR, WATER, WATER_FLOW, RAIL, getBlock } from '../world/blocks.js';
import { CH } from '../world/chunk.js';

const SIDES = [[1,0],[-1,0],[0,1],[0,-1]];
const water = id => id === WATER || id === WATER_FLOW;

export class VehicleManager {
  constructor(world, scene, lighting) {
    this.world = world; this.scene = scene; this.lighting = lighting;
    this.vehicles = []; this.mounted = null;
    this.ray = new THREE.Ray(); this.hit = new THREE.Vector3();
  }
  loaded(x,z) { return !!this.world.getChunk(Math.floor(x/CH), Math.floor(z/CH))?.generated; }
  create(type, x, y, z) {
    if (!['boat','minecart','storage','powered'].includes(type) || ![x,y,z].every(Number.isFinite)) return null;
    const group = new THREE.Group();
    const color = type === 'boat' ? 0x9e713d : 0x999c9f;
    const make = (w,h,d,px,py,pz,col=color) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshBasicMaterial({color:col}));
      mesh.position.set(px,py,pz); group.add(mesh);
    };
    if (type === 'boat') {
      make(1.15,.13,1.55,0,.10,0); make(.12,.38,1.55,-.52,.30,0); make(.12,.38,1.55,.52,.30,0);
      make(1.15,.38,.12,0,.30,-.71); make(1.15,.38,.12,0,.30,.71);
      make(.9,.08,.28,0,.25,0,0x77502a);
    } else {
      make(.92,.12,1.05,0,.16,0); make(.10,.48,1.05,-.41,.42,0); make(.10,.48,1.05,.41,.42,0);
      make(.92,.48,.1,0,.42,-.48); make(.92,.48,.1,0,.42,.48);
      for(const xx of [-.36,.36]) for(const zz of [-.32,.32]) make(.15,.19,.19,xx,.08,zz,0x343434);
      if (type === 'storage') {
        make(.72,.57,.72,0,.62,0,0x9c703c); make(.72,.06,.72,0,.92,0,0x60442c);
        make(.12,.13,.025,0,.70,-.37,0xd2c9a3);
      } else if (type === 'powered') {
        make(.72,.65,.72,0,.67,0,0x777777); make(.38,.28,.025,0,.69,-.37,0x303030);
      }
    }
    group.position.set(x,y,z); this.lighting?.prepare(group); this.scene.add(group);
    const v = {type, group, vx:0, vz:0, nodeX:Math.floor(x), nodeZ:Math.floor(z), target:null, progress:0,
      slots: type === 'storage' ? new Array(27).fill(null) : null, fuel:0, travel:[0,-1], cartSpeed:0};
    this.vehicles.push(v); return v;
  }
  place(type, hit) {
    if (!hit || !this.loaded(hit.x,hit.z)) return null;
    const block=this.world.getBlock(hit.x,hit.y,hit.z);
    if (type === 'boat' && !water(block)) return null;
    if (type !== 'boat' && block !== RAIL) return null;
    if (getBlock(this.world.getBlock(hit.x,hit.y+1,hit.z)).solid) return null;
    if (this.vehicles.some(v => v.group.position.distanceToSquared(new THREE.Vector3(hit.x+.5,hit.y,hit.z+.5)) < 1)) return null;
    return this.create(type,hit.x+.5, type === 'boat' ? hit.y+.86 : hit.y+.04,hit.z+.5);
  }
  target(player, maxDistance=4) {
    const origin=player.camera.position;
    const cp=Math.cos(player.pitch);
    this.ray.set(origin,new THREE.Vector3(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp));
    let nearest=null, distance=maxDistance;
    for(const v of this.vehicles) {
      if (!v.group.visible || v===this.mounted) continue;
      const p=v.group.position;
      const box=new THREE.Box3(new THREE.Vector3(p.x-.8,p.y,p.z-.85),new THREE.Vector3(p.x+.8,p.y+.8,p.z+.85));
      if (!this.ray.intersectBox(box,this.hit)) continue;
      const d=origin.distanceTo(this.hit); if (d<distance) {distance=d; nearest=v;}
    }
    const blockHit=player.raycast?.(this.world,maxDistance,{solidOnly:true});
    return nearest && (!blockHit || blockHit.dist > distance) ? nearest : null;
  }
  mount(v, player) {
    if (!v || this.mounted || player.dead || v.type === 'storage' || v.type === 'powered') return false;
    this.mounted=v; player.vel.set(0,0,0); player.fallStart=null;
    player.leftDown=false; player.rightDown=false;
    return true;
  }
  dismount(player, force=false) {
    if (!this.mounted) return false;
    const v=this.mounted, p=v.group.position, x=Math.floor(p.x), z=Math.floor(p.z), y=Math.floor(p.y);
    for (const [dx,dz] of SIDES) for (const dy of [0,1,-1]) {
      const xx=x+dx, yy=y+dy, zz=z+dz;
      if (!this.loaded(xx,zz) || yy < 1 || yy > 125) continue;
      if (getBlock(this.world.getBlock(xx,yy,zz)).solid || getBlock(this.world.getBlock(xx,yy+1,zz)).solid) continue;
      if (!force && !getBlock(this.world.getBlock(xx,yy-1,zz)).solid && !water(this.world.getBlock(xx,yy,zz))) continue;
      player.pos.set(xx+.5,yy+.01,zz+.5); player.vel.set(0,0,0); player.fallStart=null; this.mounted=null; return true;
    }
    if (force) { player.pos.set(p.x,p.y+1,p.z); player.vel.set(0,0,0); this.mounted=null; return true; }
    return false;
  }
  remove(v) {
    if (!v || v===this.mounted) return false;
    const index=this.vehicles.indexOf(v); if (index<0) return false;
    this.vehicles.splice(index,1); this.scene.remove(v.group); this.lighting?.forget(v.group);
    v.group.traverse(o=>{ if(o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return true;
  }
  serialize() { return this.vehicles.map(v=>({type:v.type,pos:v.group.position.toArray(),rotation:v.group.rotation.y,
    ...(v.slots ? {slots:v.slots} : {}), ...(v.type === 'powered' ? {fuel:v.fuel} : {}), ...(v.type !== 'boat' ? {nodeX:v.nodeX,nodeZ:v.nodeZ,target:v.target,progress:v.progress,travel:v.travel,cartSpeed:v.cartSpeed} : {})})); }
  load(items) {
    if (!Array.isArray(items)) return;
    for(const item of items.slice(0,1024)) {
      if (!Array.isArray(item?.pos) || item.pos.length!==3 || !item.pos.every(Number.isFinite)) continue;
      const v=this.create(item.type,...item.pos);
      if (!v) continue;
      if (Number.isFinite(item.rotation)) v.group.rotation.y=item.rotation;
      if (v.type === 'storage' && Array.isArray(item.slots) && item.slots.length === 27) v.slots=item.slots;
      if (v.type === 'powered') {
        v.fuel=Number.isFinite(item.fuel) ? Math.max(0,Math.min(item.fuel,3600)) : 0;
      }
      if (v.type !== 'boat') {
        if (Array.isArray(item.travel) && item.travel.length===2 && item.travel.every(Number.isFinite) && Math.hypot(...item.travel) > 0.01) v.travel=item.travel;
        v.cartSpeed=Number.isFinite(item.cartSpeed) ? Math.max(0,Math.min(item.cartSpeed,8)) : 0;
        const target = item.target;
        if (Number.isInteger(item.nodeX) && Number.isInteger(item.nodeZ) && Array.isArray(target) && target.length === 2 && SIDES.some(([dx,dz]) => dx === target[0] && dz === target[1]) && Number.isFinite(item.progress) && item.progress >= 0 && item.progress < 1) {
          v.nodeX=item.nodeX; v.nodeZ=item.nodeZ; v.target=[...target]; v.progress=item.progress;
          v.group.position.x=v.nodeX+.5+target[0]*v.progress; v.group.position.z=v.nodeZ+.5+target[1]*v.progress;
        } else { v.group.position.x=v.nodeX+.5; v.group.position.z=v.nodeZ+.5; }
      }
    }
  }
  moveCart(v,dt,direction,allowTurn=false,speed=3) {
    const p=v.group.position, y=Math.floor(p.y);
    if (this.world.getBlock(v.nodeX,y,v.nodeZ) !== RAIL) return false;
    if (v.target && this.world.getBlock(v.nodeX+v.target[0],y,v.nodeZ+v.target[1]) !== RAIL) { v.target=null; v.progress=0; p.x=v.nodeX+.5; p.z=v.nodeZ+.5; }
    if (!v.target) {
      const choices=SIDES.filter(([dx,dz])=>this.loaded(v.nodeX+dx,v.nodeZ+dz) && this.world.getBlock(v.nodeX+dx,y,v.nodeZ+dz)===RAIL)
        .sort((a,b)=>(b[0]*direction[0]+b[1]*direction[1])-(a[0]*direction[0]+a[1]*direction[1]));
      if (choices.length && choices[0][0]*direction[0]+choices[0][1]*direction[1] > (allowTurn ? -0.1 : 0.1)) { v.target=choices[0]; v.travel=[...v.target]; v.progress=0; }
    }
    if (!v.target) return false;
    v.progress=Math.min(1,v.progress+dt*speed);
    p.x=v.nodeX+.5+v.target[0]*v.progress; p.z=v.nodeZ+.5+v.target[1]*v.progress;
    v.group.rotation.y=Math.atan2(v.target[0],v.target[1]);
    if(v.progress>=1) { v.travel=[...v.target]; v.nodeX+=v.target[0]; v.nodeZ+=v.target[1]; v.target=null; v.progress=0; }
    return true;
  }
  update(dt,player) {
    dt=Math.max(0,Math.min(dt,.05));
    const v=this.mounted;
    for(const vehicle of this.vehicles) {
      const p=vehicle.group.position; vehicle.group.visible=this.loaded(p.x,p.z);
      if (vehicle.group.visible) {
        if (vehicle.type === 'powered' && vehicle.fuel > 0) {
          vehicle.fuel=Math.max(0,vehicle.fuel-dt);
          this.moveCart(vehicle,dt,vehicle.travel,true);
        } else if (vehicle !== v && vehicle.type !== 'boat' && vehicle.cartSpeed > 0) {
          vehicle.cartSpeed *= Math.exp(-0.4 * dt);
          if (vehicle.cartSpeed < 0.02 || !this.moveCart(vehicle,dt,vehicle.travel,true,vehicle.cartSpeed)) vehicle.cartSpeed=0;
        }
        this.lighting?.refreshObject(vehicle.group,this.world,p,.4);
      }
    }
    if (!v) return false;
    if (player.dead) { this.dismount(player,true); return false; }
    if (player.keys[player.bindings.sneak] && this.dismount(player)) return false;
    const forward=(player.keys[player.bindings.forward]?1:0)-(player.keys[player.bindings.back]?1:0);
    const p=v.group.position;
    if(v.type==='boat') {
      const speed=3.6;
      const tx=-Math.sin(player.yaw)*forward*speed, tz=-Math.cos(player.yaw)*forward*speed;
      const blend=1-Math.exp(-3*dt);
      v.vx+=(tx-v.vx)*blend; v.vz+=(tz-v.vz)*blend;
      const nx=p.x+v.vx*dt, nz=p.z+v.vz*dt;
      const bx=Math.floor(nx), bz=Math.floor(nz), by=Math.floor(p.y-.1);
      if (this.loaded(bx,bz) && water(this.world.getBlock(bx,by,bz)) && !getBlock(this.world.getBlock(bx,by+1,bz)).solid) { p.x=nx; p.z=nz; }
      else { v.vx=0; v.vz=0; }
      if(forward) v.group.rotation.y=player.yaw;
    } else {
      const desired=[-Math.sin(player.yaw)*forward,-Math.cos(player.yaw)*forward];
      const dot=desired[0]*v.travel[0]+desired[1]*v.travel[1];
      if (forward && v.cartSpeed > 0 && dot < -0.5) v.cartSpeed=Math.max(0,v.cartSpeed-8*dt);
      else if (forward) v.cartSpeed=Math.min(3,v.cartSpeed+8*dt);
      else v.cartSpeed*=Math.exp(-0.4*dt);
      if (v.cartSpeed < 0.02) v.cartSpeed=0;
      if (forward && v.cartSpeed === 0 && v.target && dot < -0.5) {
        v.nodeX+=v.target[0]; v.nodeZ+=v.target[1];
        v.target=[-v.target[0],-v.target[1]]; v.progress=1-v.progress; v.travel=[...v.target];
      }
      if (v.cartSpeed > 0 && !this.moveCart(v,dt,v.cartSpeed < 0.41 && forward ? desired : v.travel,true,v.cartSpeed)) v.cartSpeed=0;
    }
    player.pos.set(p.x,p.y+.35,p.z); player.vel.set(0,0,0); player.fallStart=null;
    player.inWater=false; player.inLava=false; player.air=Math.min(300,player.air+dt*60);
    player.updateRidingView(dt);
    return true;
  }

}
