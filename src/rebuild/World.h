#pragma once
// Independent, bounded reference-scene simulation. No legacy world/save dependencies.
#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

namespace rebuild {

struct Vec3 {
    float x=0, y=0, z=0;
    Vec3 operator+(Vec3 b) const { return {x+b.x,y+b.y,z+b.z}; }
    Vec3 operator-(Vec3 b) const { return {x-b.x,y-b.y,z-b.z}; }
    Vec3 operator*(float s) const { return {x*s,y*s,z*s}; }
};
struct Cell {
    int x=0,y=0,z=0;
    bool operator==(const Cell& b) const = default;
};

enum class Block : uint8_t {
    Air, Grass, Dirt, Stone, Log, Leaves, Planks, Cobble, Sand, TallGrass, Flower
};
bool solid(Block b);
bool opaque(Block b);

// A deliberately fixed meadow/forest art study, NOT generated Java terrain.
// This is a tiny, in-memory world; it neither loads nor writes legacy saves.
class World {
public:
    static constexpr int side=96, half=side/2, height=32, chunk=16;
    World();
    static bool inside(Cell c);
    Block get(Cell c) const;
    bool set(Cell c, Block b);
    static int surface(int x,int z);
private:
    std::vector<Block> cells_;
    static size_t index(Cell c);
};

struct Hit {
    Cell cell, normal;       // normal points out of the selected face
    float distance=0;
    Block block=Block::Air;
};
std::optional<Hit> raycast(const World& world,Vec3 eye,Vec3 direction,float reach=4.5f);

struct Input { bool forward=false,back=false,left=false,right=false,jump=false,sprint=false; };
struct Player {
    Vec3 feet{0.5f,7,15.5f};
    float yaw=0, pitch=-0.48f; // radians; initial camera faces north and slightly down
    float verticalSpeed=0;
    bool onGround=false;
    Vec3 eye() const { return feet+Vec3{0,1.62f,0}; }
    Vec3 direction() const;
    void tick(const World& world,const Input& input,float dt);
    bool overlaps(Cell c) const;
private:
    bool collides(const World& world,Vec3 position) const;
};

} // namespace rebuild
