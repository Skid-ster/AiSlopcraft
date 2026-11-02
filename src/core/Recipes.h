#pragma once
#include "Items.h"
#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace vox {

struct Ingredient { uint16_t id = 0; int meta = -1; }; // -1: any variant
struct Recipe {
    int width = 0, height = 0; // 0,0 = shapeless
    std::vector<Ingredient> ingredients; // row-major for shaped
    ItemStack result;
    const char* label = "";
};

// Shaped recipes translate in 2x2 / 3x3 grids and accept horizontal mirror;
// the grid is row-major, unused cells are empty. This is an explicit partial
// recipe catalogue; missing recipes are documented rather than fabricated.
const std::vector<Recipe>& recipes();
std::optional<ItemStack> craftResult(const std::array<ItemStack, 9>& grid, int side);
// Consumes one unit from each matching ingredient, returns crafted stack.
ItemStack craftOnce(std::array<ItemStack, 9>& grid, int side);

ItemStack smeltResult(const ItemStack& input);

struct Furnace {
    ItemStack input, fuel, output;
    int burnLeft = 0, burnTotal = 0, cook = 0;
    static constexpr int cookDuration = 200; // 10 seconds at 20 tps
    bool tick(); // true when a smelted item is produced
};

} // namespace vox
