#pragma once
#include "Save.h"

namespace vox {

struct MovementInput {
    float forward=0; // -1 backward, +1 forward
    float strafe=0;  // -1 left, +1 right
    bool jump=false, sneak=false, sprint=false, descend=false;
};

// Physics state uses velocity in blocks/tick, simulates at 20 Hz. This is
// inspired by the 1.7 movement model but parameters/collision resolution
// require reference-client comparison before exact parity can be claimed.
class Player {
public:
    Player();
    Vec3f position{0.5f,82,0.5f}; // feet at Y
    Vec3f velocity{};
    float yaw=0, pitch=0;
    int health=20,hunger=20,experience=0;
    float saturation=5,exhaustion=0;
    int armorPoints=0;
    bool creative=false,flying=false,onGround=false,dead=false,sneaking=false;
    float fallDistance=0;
    int airTicks=300;
    int selected=0;
    Inventory inventory{36};

    AABB bounds() const;
    Vec3f eye() const;
    Vec3f lookDirection() const;
    void look(float deltaYaw,float deltaPitch);
    void tick(World& world,const MovementInput& input);
    void damage(int amount); // before armor reduction, applies invulnerability
    void respawn(Vec3f spawn);
    bool eat(int slot);
    PlayerSnapshot snapshot() const;
    bool restore(const PlayerSnapshot& data);
private:
    int invulnerableTicks_=0,regenerationTicks_=0;
    static float moveAxis(World& world,const AABB& box,int axis,float delta);
};

} // namespace vox
