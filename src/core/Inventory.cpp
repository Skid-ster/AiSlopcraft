#include "Inventory.h"
#include <algorithm>

namespace vox {

bool Inventory::set(std::size_t i, ItemStack s) {
    if (i >= size()) return false;
    if (s.empty()) { slots_[i].clear(); return true; }
    if (!itemExists(s.id) || s.count > s.maxStack()) return false;
    slots_[i] = s;
    return true;
}

int Inventory::insert(ItemStack s) {
    if (s.empty()) return 0;
    if (!itemExists(s.id)) return s.count;
    int left = s.count;
    for (auto& dst : slots_) {
        if (dst.empty() || !dst.stackableWith(s)) continue;
        int n = std::min(left, dst.maxStack() - (int)dst.count);
        if (n > 0) { dst.count += (uint8_t)n; left -= n; }
        if (!left) return 0;
    }
    for (auto& dst : slots_) {
        if (!dst.empty()) continue;
        int n = std::min(left, s.maxStack());
        dst = {s.id, (uint8_t)n, s.meta};
        left -= n;
        if (!left) return 0;
    }
    return left;
}

ItemStack Inventory::take(std::size_t i, int count) {
    if (i >= size() || slots_[i].empty() || count <= 0) return {};
    ItemStack& s = slots_[i];
    int n = std::min(count, (int)s.count);
    ItemStack result{s.id, (uint8_t)n, s.meta};
    s.count -= (uint8_t)n;
    if (!s.count) s.clear();
    return result;
}

bool Inventory::transfer(std::size_t src, std::size_t dst, int count) {
    if (src >= size() || dst >= size() || src == dst || slots_[src].empty()) return false;
    ItemStack& a = slots_[src];
    ItemStack& b = slots_[dst];
    int n = count <= 0 ? a.count : std::min((int)a.count, count);
    if (b.empty()) {
        b = {a.id, (uint8_t)n, a.meta};
        a.count -= (uint8_t)n;
        if (!a.count) a.clear();
        return true;
    }
    if (b.stackableWith(a)) {
        n = std::min(n, b.maxStack() - (int)b.count);
        if (n <= 0) return false;
        b.count += (uint8_t)n;
        a.count -= (uint8_t)n;
        if (!a.count) a.clear();
        return true;
    }
    if (n != a.count) return false; // never swap a partial stack implicitly
    std::swap(a, b);
    return true;
}

bool Inventory::damage(std::size_t i, int uses) {
    if (i >= size() || slots_[i].empty() || uses <= 0) return false;
    ItemStack& s = slots_[i];
    if (!s.isDamageable()) return false;
    if ((int)s.meta + uses >= s.maxDamage()) { s.clear(); return true; }
    s.meta = (uint16_t)(s.meta + uses);
    return false;
}

int Inventory::countOf(uint16_t id, int meta) const {
    int n = 0;
    for (const auto& s : slots_) {
        if (s.id == id && !s.empty() && (meta < 0 || s.meta == meta)) n += s.count;
    }
    return n;
}

} // namespace vox
