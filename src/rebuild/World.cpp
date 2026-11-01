#include "World.h"
#include <algorithm>
#include <cmath>
#include <limits>

namespace rebuild {

bool solid(Block b) { return b!=Block::Air && b!=Block::TallGrass && b!=Block::Flower; }
bool opaque(Block b) { return solid(b) && b!=Block::Leaves; }
bool World::inside(Cell c) {
    return c.x>=-half && c.x<half && c.z>=-half && c.z<half && c.y>=0 && c.y<height;
}
size_t World::index(Cell c) {
    return (static_cast<size_t>(c.z+half)*side+static_cast<size_t>(c.x+half))*height+
           static_cast<size_t>(c.y);
}
Block World::get(Cell c) const {
    // Closed lateral/bottom bounds prevent stepping off the incomplete study.
    if(c.y<0 || c.x< -half || c.x>=half || c.z< -half || c.z>=half)return Block::Stone;
    if(c.y>=height)return Block::Air;
    return cells_[index(c)];
}
bool World::set(Cell c,Block b) {
    if(!inside(c) || c.y==0 || cells_[index(c)]==b)return false;
    cells_[index(c)]=b;return true;
}
int World::surface(int x,int z) {
    return std::clamp(6+static_cast<int>(std::round(1.5*std::sin(x*.09)*std::cos(z*.12)
                                              +.45*std::sin((x+z)*.17))),3,10);
}
namespace {
uint32_t hash(int x,int z) {
    uint32_t h=static_cast<uint32_t>(x)*0x9E3779B9u ^
               static_cast<uint32_t>(z)*0x85EBCA6Bu ^ 0xE58F53A1u;
    h^=h>>16;h*=0x7FEB352Du;h^=h>>15;h*=0x846CA68Bu;return h^(h>>16);
}
}
World::World():cells_(static_cast<size_t>(side)*side*height,Block::Air) {
    for(int z=-half;z<half;++z)for(int x=-half;x<half;++x) {
        int top=surface(x,z);
        for(int y=0;y<=top;++y)
            cells_[index({x,y,z})]=y==top?Block::Grass:(y>=top-3?Block::Dirt:Block::Stone);
        uint32_t h=hash(x,z);
        // A few low plants, clear around the initial camera and open foreground.
        if((h%27)==0 && (x*x+(z-15)*(z-15)>20) && top+1<height)
            cells_[index({x,top+1,z})]=(h&8u)?Block::TallGrass:Block::Flower;
    }
    struct Tree {int x,z;};
    constexpr Tree trees[]={{-14,-11},{13,-16},{-22,-29},{25,-27},
                             {-31,15},{34,18},{-8,-35},{8,-35},{-35,-24}};
    for(auto [x,z]:trees) {
        const int ground=surface(x,z);
        const int trunk=4+static_cast<int>(hash(x,z)%2);
        for(int y=ground+1;y<=ground+trunk;++y)set({x,y,z},Block::Log);
        const int crown=ground+trunk;
        // Layered, irregular pixel/block silhouette; intentionally not 1.7 treegen.
        for(int dy=-2;dy<=2;++dy)for(int dz=-2;dz<=2;++dz)for(int dx=-2;dx<=2;++dx) {
            int radius=(dy>=1)?1:2;
            if(std::abs(dx)>radius || std::abs(dz)>radius)continue;
            if(dy==2 && (std::abs(dx)+std::abs(dz)>1))continue;
            if(dy==-2 && std::abs(dx)==2 && std::abs(dz)==2)continue;
            Cell c{x+dx,crown+dy,z+dz};
            if(inside(c) && (get(c)==Block::Air || get(c)==Block::TallGrass || get(c)==Block::Flower))
                set(c,Block::Leaves);
        }
    }
}

std::optional<Hit> raycast(const World& world,Vec3 eye,Vec3 direction,float reach) {
    const float length=std::sqrt(direction.x*direction.x+direction.y*direction.y+
                                 direction.z*direction.z);
    if(length<1e-7f || reach<=0)return std::nullopt;
    direction=direction*(1.f/length);
    Cell c{static_cast<int>(std::floor(eye.x)),static_cast<int>(std::floor(eye.y)),
           static_cast<int>(std::floor(eye.z))};
    // Outside the finite study is not a target, even though it is collidable.
    if(World::inside(c) && solid(world.get(c)))return Hit{c,{},0,world.get(c)};
    int step[3]={direction.x>0?1:(direction.x<0?-1:0),
                 direction.y>0?1:(direction.y<0?-1:0),
                 direction.z>0?1:(direction.z<0?-1:0)};
    float p[3]={eye.x,eye.y,eye.z},v[3]={direction.x,direction.y,direction.z};
    int pos[3]={c.x,c.y,c.z};
    float tMax[3],tDelta[3];
    for(int a=0;a<3;++a) {
        if(step[a]==0){tMax[a]=tDelta[a]=std::numeric_limits<float>::infinity();continue;}
        tDelta[a]=std::abs(1.f/v[a]);
        tMax[a]=((step[a]>0 ? float(pos[a]+1):float(pos[a]))-p[a])/v[a];
    }
    while(true) {
        int axis=tMax[0]<=tMax[1] && tMax[0]<=tMax[2]?0:(tMax[1]<=tMax[2]?1:2);
        float distance=tMax[axis];
        if(distance>reach || !std::isfinite(distance))break;
        pos[axis]+=step[axis];tMax[axis]+=tDelta[axis];
        c={pos[0],pos[1],pos[2]};
        if(!World::inside(c))continue;
        Block b=world.get(c);
        if(!solid(b))continue;
        Cell normal{};
        if(axis==0)normal.x=-step[0];
        if(axis==1)normal.y=-step[1];
        if(axis==2)normal.z=-step[2];
        return Hit{c,normal,distance,b};
    }
    return std::nullopt;
}

Vec3 Player::direction() const {
    return {std::sin(yaw)*std::cos(pitch),std::sin(pitch),
            -std::cos(yaw)*std::cos(pitch)};
}
bool Player::collides(const World& world,Vec3 p) const {
    constexpr float radius=.3f, height=1.8f, eps=0.0001f;
    for(int x=static_cast<int>(std::floor(p.x-radius+eps));
            x<=static_cast<int>(std::floor(p.x+radius-eps));++x)
        for(int y=static_cast<int>(std::floor(p.y+eps));
                y<=static_cast<int>(std::floor(p.y+height-eps));++y)
            for(int z=static_cast<int>(std::floor(p.z-radius+eps));
                    z<=static_cast<int>(std::floor(p.z+radius-eps));++z)
                if(solid(world.get({x,y,z})))return true;
    return false;
}
bool Player::overlaps(Cell c) const {
    return c.x < feet.x+.3f && c.x+1 > feet.x-.3f &&
           c.z < feet.z+.3f && c.z+1 > feet.z-.3f &&
           c.y < feet.y+1.8f && c.y+1 > feet.y;
}
void Player::tick(const World& world,const Input& input,float dt) {
    dt=std::clamp(dt,0.f,.05f);
    if(dt==0)return;
    onGround=collides(world,feet+Vec3{0,-.055f,0});
    float f=float(input.forward)-float(input.back),r=float(input.right)-float(input.left);
    float length=std::sqrt(f*f+r*r);
    if(length>0){f/=length;r/=length;}
    const float speed=input.sprint?5.6f:4.3f;
    Vec3 motion{(f*std::sin(yaw)+r*std::cos(yaw))*speed*dt,0,
                (-f*std::cos(yaw)+r*std::sin(yaw))*speed*dt};
    // Sliding in X/Z, with bounded substeps to avoid tunneling through a wall.
    auto axisMove=[&](float amount,bool xAxis) {
        int steps=std::max(1,int(std::ceil(std::abs(amount)/.20f)));
        for(int i=0;i<steps;++i){
            Vec3 trial=feet;
            (xAxis?trial.x:trial.z)+=amount/steps;
            if(!collides(world,trial)){feet=trial;continue;}
            // One-block steps must remain an explicit later milestone; this
            // study refuses to walk through collision instead of faking it.
            break;
        }
    };
    axisMove(motion.x,true);axisMove(motion.z,false);
    if(input.jump && onGround){verticalSpeed=7.5f;onGround=false;}
    verticalSpeed=std::max(-30.f,verticalSpeed-21.f*dt);
    float vertical=verticalSpeed*dt;
    int steps=std::max(1,int(std::ceil(std::abs(vertical)/.10f)));
    for(int i=0;i<steps;++i){
        Vec3 trial=feet;trial.y+=vertical/steps;
        if(collides(world,trial)) {verticalSpeed=0;break;}
        feet=trial;
    }
    onGround=collides(world,feet+Vec3{0,-.055f,0});
}
} // namespace rebuild
