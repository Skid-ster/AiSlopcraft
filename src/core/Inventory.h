#pragma once
#include "Items.h"
#include <cstddef>
#include <vector>

namespace vox {

// 0..8 = hotbar, 9..35 = main inventory; armor/crafting grids live in the
// Player state. Methods maintain valid stack counts and never create items.
class Inventory {
public:
    explicit Inventory(std::size_t slots = 36) : slots_(slots) {}
    std::size_t size() const { return slots_.size(); }
    const ItemStack& at(std::size_t i) const { return slots_.at(i); }
    bool set(std::size_t i, ItemStack stack);
    // Merge into existing matching stacks before using empty slots. Returns
    // the number of items that did NOT fit; invalid items are rejected.
    int insert(ItemStack stack);
    ItemStack take(std::size_t i, int count);
    // Move or merge count items; if target is incompatible, swap full stacks
    // only (when count <= 0, move the entire source stack).
    bool transfer(std::size_t src, std::size_t dst, int count = 0);
    bool damage(std::size_t i, int uses = 1); // true if the item broke
    int countOf(uint16_t id, int meta = -1) const;
    const std::vector<ItemStack>& slots() const { return slots_; }
private:
    std::vector<ItemStack> slots_;
};

} // namespace vox
