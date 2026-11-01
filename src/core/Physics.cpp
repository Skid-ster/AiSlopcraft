#include "Physics.h"
#include "Blocks.h"
#include <algorithm>
#include <cmath>

namespace vox {
namespace {
constexpr float kPi=3.14159265358979323846f;
}
Player::Player() = default;
AABB Player::bounds() const {
    return {{position.x-0.3f,position.y,position.z-0.3f},
            {position.x+0.3f,position.y+1.8f,position.z+0.3f}};
}
Vec3f Player::eye() const { return position+Vec3f{0,sneaking?1.54f:1.62f,0}; }
Vec3f Player::lookDirection() const {
    float yr=yaw*kPi/180.f,pr=pitch*kPi/180.f;
    return {std::sin(yr)*std::cos(pr),std::sin(pr),-std::cos(yr)*std::cos(pr)};
}
void Player::look(float deltaYaw,float deltaPitch) {
    yaw=std::fmod(yaw+deltaYaw,360.f);
    pitch=clampf(pitch+deltaPitch,-89.9f,89.9f);
}
float Player::moveAxis(World& world,const AABB& box,int axis,float delta) {
    if (std::abs(delta)<1e-7f) return 0;
    Vec3f step{};
    if (axis==0) step.x=delta;
    else if (axis==1) step.y=delta;
    else step.z=delta;
    if (!world.collides(box.offset(step))) return delta;
    float sign=delta<0?-1.f:1.f;
    float lo=0,hi=std::abs(delta);
    for (int iter=0;iter<13;++iter) {
        float mid=(lo+hi)*0.5f;
        Vec3f trial{};
        if (axis==0) trial.x=mid*sign;
        else if (axis==1) trial.y=mid*sign;
        else trial.z=mid*sign;
        if (world.collides(box.offset(trial))) hi=mid;
        else lo=mid;
    }
    return std::max(0.f,lo-0.0001f)*sign;
}
void Player::tick(World& world,const MovementInput& input) {
    if (dead) return;
    sneaking=input.sneak && !flying;
    if (invulnerableTicks_>0) --invulnerableTicks_;
    float yr=yaw*kPi/180.f;
    Vec3f forward{std::sin(yr),0,-std::cos(yr)};
    Vec3f right{std::cos(yr),0,std::sin(yr)};
    Vec3f wish=forward*input.forward+right*input.strafe;
    if (wish.lengthSq()>1) wish=wish.normalized();
    bool inWater=isLiquidBlock(world.blockAt((int)std::floor(position.x),
        (int)std::floor(position.y+0.6f),(int)std::floor(position.z)).id);
    float speed=flying?0.48f : sneaking?0.065f : inWater?0.095f :
                (input.sprint && input.forward>0 ? 0.28f : 0.215f);
    // Ground friction/air control; velocity is blocks per logic tick.
    float control=flying?0.28f : onGround?0.38f : inWater?0.24f : 0.08f;
    velocity.x=lerpf(velocity.x,wish.x*speed,control);
    velocity.z=lerpf(velocity.z,wish.z*speed,control);
    if (flying) {
        velocity.y=(input.jump?0.3f:0.f)-(input.descend?0.3f:0.f);
    } else if (inWater) {
        velocity.y=(velocity.y-0.015f)*0.8f;
        if (input.jump) velocity.y=0.08f;
    } else {
        if (onGround && input.jump) { velocity.y=0.42f; onGround=false; }
        else velocity.y=(velocity.y-0.08f)*0.98f;
        if (velocity.y< -3.92f) velocity.y=-3.92f;
    }
    AABB original=bounds();
    float yMove=moveAxis(world,original,1,velocity.y);
    position.y+=yMove;
    bool landed=velocity.y<0 && yMove>velocity.y+0.0005f;
    if (std::abs(yMove-velocity.y)>0.0005f) velocity.y=0;
    onGround=landed;
    AABB box=bounds();
    float xMove=moveAxis(world,box,0,velocity.x);
    box=box.offset({xMove,0,0});
    float zMove=moveAxis(world,box,2,velocity.z);
    if (onGround && (std::abs(xMove-velocity.x)>0.001f ||
                     std::abs(zMove-velocity.z)>0.001f) && !sneaking) {
        // Step up a half block to pass slabs/stairs. A full block remains solid.
        AABB raised=bounds().offset({0,0.6f,0});
        if (!world.collides(raised)) {
            float sx=moveAxis(world,raised,0,velocity.x);
            AABB stepBox=raised.offset({sx,0,0});
            float sz=moveAxis(world,stepBox,2,velocity.z);
            if (sx*sx+sz*sz>xMove*xMove+zMove*zMove+0.0001f) {
                position.y+=0.6f;
                float down=moveAxis(world,stepBox.offset({0,0,sz}),1,-0.6f);
                position.y+=down;
                xMove=sx;zMove=sz;
            }
        }
    }
    position.x+=xMove; position.z+=zMove;
    if (std::abs(xMove-velocity.x)>0.0005f) velocity.x=0;
    if (std::abs(zMove-velocity.z)>0.0005f) velocity.z=0;
    if (!flying && !inWater) {
        if (landed) {
            if (fallDistance>3.0f && !creative)
                damage((int)std::ceil(fallDistance-3.0f));
            fallDistance=0;
        } else if (yMove<0) fallDistance-=yMove;
    } else fallDistance=0;
    if (!creative) {
        exhaustion+=(std::abs(xMove)+std::abs(zMove)) *
            ((input.sprint && input.forward>0)?0.1f:0.01f);
        while(exhaustion>=4.f) {
            exhaustion-=4.f;
            if (saturation>0) saturation=std::max(0.f,saturation-1);
            else hunger=std::max(0,hunger-1);
        }
        if (++regenerationTicks_>=80) {
            regenerationTicks_=0;
            if (hunger>=18 && health<20) { ++health; exhaustion+=3; }
            if (hunger==0 && health>1) --health; // normal difficulty starvation
        }
        int x=(int)std::floor(position.x),z=(int)std::floor(position.z);
        auto head=world.blockAt(x,(int)std::floor(position.y+1.6f),z).id;
        if (head==BlockID::Water || head==BlockID::FlowingWater) {
            if (--airTicks<=-20) { airTicks=0; damage(2); }
        } else airTicks=300;
        if (head==BlockID::Lava || head==BlockID::FlowingLava) damage(4);
    }
}
void Player::damage(int amount) {
    if (amount<=0 || creative || dead || invulnerableTicks_>0) return;
    int reduced=std::max(1,(amount*(25-std::clamp(armorPoints,0,20))+24)/25);
    health=std::max(0,health-reduced);
    if (!health) dead=true;
    invulnerableTicks_=10;
}
void Player::respawn(Vec3f spawn) {
    position=spawn;velocity={};health=hunger=20;saturation=5;exhaustion=0;
    fallDistance=0;airTicks=300;dead=false;flying=false;onGround=false;
    invulnerableTicks_=0;
}
bool Player::eat(int slot) {
    if (slot<0 || (std::size_t)slot>=inventory.size()) return false;
    ItemStack s=inventory.at(slot);
    const ItemDef& d=itemDef(s.id);
    if (s.empty() || d.food<=0 || (hunger>=20 && !d.alwaysEdible)) return false;
    hunger=std::min(20,hunger+d.food);
    saturation=std::min((float)hunger,saturation+d.saturation);
    inventory.take(slot,1);
    if (s.id==ItemID::MushroomStew) inventory.insert({ItemID::Bowl,1,0});
    return true;
}
PlayerSnapshot Player::snapshot() const {
    PlayerSnapshot d;
    d.position=position;d.yaw=yaw;d.pitch=pitch;d.health=(int16_t)health;
    d.hunger=(int16_t)hunger;d.saturation=saturation;d.experience=experience;
    d.selected=(uint8_t)selected;d.creative=creative;
    for(std::size_t i=0;i<inventory.size() && i<d.inventory.size();++i)
        d.inventory[i]=inventory.at(i);
    return d;
}
bool Player::restore(const PlayerSnapshot& d) {
    Inventory newInv(36);
    for(std::size_t i=0;i<d.inventory.size();++i)
        if (!newInv.set(i,d.inventory[i])) return false;
    inventory=std::move(newInv);
    position=d.position;velocity={};yaw=d.yaw;pitch=d.pitch;
    health=d.health;hunger=d.hunger;saturation=d.saturation;
    experience=d.experience;selected=d.selected;creative=d.creative;
    dead=health==0;flying=false;onGround=false;fallDistance=0;
    return true;
}
} // namespace vox
