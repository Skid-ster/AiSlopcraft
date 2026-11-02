#pragma once
#include "Inventory.h"
#include "World.h"
#include <array>
#include <filesystem>
#include <memory>
#include <string>

namespace vox {

struct PlayerSnapshot {
    Vec3f position{0.5f,80.0f,0.5f};
    float yaw=0, pitch=0;
    int16_t health=20, hunger=20;
    float saturation=5;
    int32_t experience=0;
    uint8_t selected=0;
    bool creative=false;
    std::array<ItemStack,36> inventory{};
};

// Explicit little-endian independent format, NOT Anvil/NBT. CRC32 protects
// the entire payload. Saving uses a temporary sibling and atomic replacement;
// the old world stays readable if a write is interrupted before the rename.
// Pass the world FILE path, e.g. saves/MyWorld/world.bin.
bool saveWorld(const World& world,const PlayerSnapshot& player,
               const std::filesystem::path& file,std::string& error);
std::unique_ptr<World> loadWorld(const std::filesystem::path& file,
                                 PlayerSnapshot& player,std::string& error);

} // namespace vox
