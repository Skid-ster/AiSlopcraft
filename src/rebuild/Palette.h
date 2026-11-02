#pragma once
#include "World.h"
#include <array>

namespace rebuild {
// Single source of truth for the creative hotbar, selection preview, and
// block placed by right-click. These are all original study materials.
inline constexpr std::array<Block,9> creativePalette{{
    Block::Grass,Block::Dirt,Block::Stone,Block::Log,Block::Planks,
    Block::Cobble,Block::Sand,Block::Leaves,Block::Flower
}};
}
