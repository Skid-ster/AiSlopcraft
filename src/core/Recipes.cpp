#include "Recipes.h"
#include "Blocks.h"
#include <algorithm>
#include <stdexcept>

namespace vox {
namespace {

bool accepts(const Ingredient& want, const ItemStack& have) {
    return want.id == 0 ? have.empty() :
        (!have.empty() && want.id == have.id && (want.meta < 0 || want.meta == have.meta));
}

bool match(const Recipe& r, const std::array<ItemStack, 9>& grid, int side,
           std::array<bool, 9>* used = nullptr) {
    if (side != 2 && side != 3) return false;
    if (r.width == 0) {
        std::array<bool, 9> taken{};
        for (const Ingredient& in : r.ingredients) {
            int idx = -1;
            for (int i = 0; i < side * side; ++i)
                if (!taken[i] && accepts(in, grid[i])) { idx = i; break; }
            if (idx < 0) return false;
            taken[idx] = true;
        }
        for (int i = 0; i < side * side; ++i)
            if (!grid[i].empty() && !taken[i]) return false;
        if (used) *used = taken;
        return true;
    }
    if (r.width > side || r.height > side) return false;
    for (int oy = 0; oy <= side - r.height; ++oy) {
        for (int ox = 0; ox <= side - r.width; ++ox) {
            for (int mirror = 0; mirror < 2; ++mirror) {
                bool okay = true;
                std::array<bool, 9> taken{};
                for (int y = 0; y < side && okay; ++y)
                    for (int x = 0; x < side; ++x) {
                        int rx = x - ox, ry = y - oy;
                        Ingredient want{};
                        if (rx >= 0 && rx < r.width && ry >= 0 && ry < r.height)
                            want = r.ingredients[ry * r.width + (mirror ? r.width - 1 - rx : rx)];
                        if (!accepts(want, grid[y * side + x])) { okay = false; break; }
                        if (want.id != 0) taken[y * side + x] = true;
                    }
                if (okay) { if (used) *used = taken; return true; }
            }
        }
    }
    return false;
}

std::vector<Recipe> buildRecipes() {
    using namespace ItemID;
    std::vector<Recipe> all;
    auto s = [&](std::initializer_list<Ingredient> items, ItemStack out, const char* name) {
        all.push_back({0, 0, items, out, name});
    };
    auto r = [&](std::initializer_list<std::string> rows, char a, Ingredient ia,
                 char b, Ingredient ib, char c, Ingredient ic,
                 ItemStack out, const char* name) {
        Recipe recipe;
        recipe.height = (int)rows.size();
        recipe.width = (int)rows.begin()->size();
        recipe.result = out; recipe.label = name;
        for (const auto& row : rows) {
            if ((int)row.size() != recipe.width) throw std::logic_error("recipe row width mismatch");
            for (char ch : row) {
                Ingredient in{};
                if (ch == a) in = ia;
                else if (ch == b) in = ib;
                else if (ch == c) in = ic;
                else if (ch != ' ') throw std::logic_error("unknown recipe symbol");
                recipe.ingredients.push_back(in);
            }
        }
        all.push_back(std::move(recipe));
    };
    constexpr Ingredient nil{};
    // Logs -> 4 planks of the correct wood (acacia and dark oak have log2 id).
    for (int m = 0; m < 4; ++m)
        s({{Log,m}}, {Planks,4,(uint16_t)m}, "log to planks");
    for (int m = 0; m < 2; ++m)
        s({{Log2,m}}, {Planks,4,(uint16_t)(m+4)}, "new log to planks");
    // Any plank type works, but ingredient metadata matching follows vanilla
    // when stacking (all three rows use the same variant for slab/door).
    r({"A","A"}, 'A',{Planks,-1},'\0',nil,'\1',nil, {Stick,4,0}, "sticks");
    r({"AA","AA"},'A',{Planks,-1},'\0',nil,'\1',nil,{CraftingTable,1,0},"crafting table");
    r({"AAA","A A","AAA"},'A',{Planks,-1},'\0',nil,'\1',nil,{Chest,1,0},"chest");
    r({"AAA","A A","AAA"},'A',{Cobblestone,-1},'\0',nil,'\1',nil,{ItemID::Furnace,1,0},"furnace");
    r({"AAA","AAA"},'A',{Planks,-1},'\0',nil,'\1',nil,{WoodenDoorItem,1,0},"wooden door");
    r({"AA","AA","AA"},'A',{IronIngot,-1},'\0',nil,'\1',nil,{IronDoorItem,1,0},"iron door");
    r({"AAA"},'A',{Planks,-1},'\0',nil,'\1',nil,{WoodenSlab,6,0},"wood slabs");
    r({"AAA"},'A',{Cobblestone,-1},'\0',nil,'\1',nil,{StoneSlab,6,3},"cobble slabs");
    r({"A  ","AA ","AAA"},'A',{Planks,-1},'\0',nil,'\1',nil,{OakStairs,4,0},"wood stairs");
    r({"A  ","AA ","AAA"},'A',{Cobblestone,-1},'\0',nil,'\1',nil,{StoneStairs,4,0},"cobble stairs");
    r({"A  ","AA ","AAA"},'A',{BrickBlock,-1},'\0',nil,'\1',nil,{BrickStairs,4,0},"brick stairs");
    r({"AAA","AAA"},'A',{Stick,-1},'\0',nil,'\1',nil,{Fence,2,0},"fences");
    r({"BAB","BAB"},'A',{Planks,-1},'B',{Stick,-1},'\1',nil,{FenceGate,1,0},"fence gate");
    r({"A","B"},'A',{Coal,-1},'B',{Stick,-1},'\1',nil,{Torch,4,0},"torches");
    // Food and basic utility
    r({"AAA"},'A',{Wheat,-1},'\0',nil,'\1',nil,{Bread,1,0},"bread");
    r({"AAA","AAA","AAA"},'A',{Wheat,-1},'\0',nil,'\1',nil,{HayBlock,1,0},"hay bale");
    s({{HayBlock,-1}}, {Wheat,9,0}, "unpack hay");
    r({"AAA","AAA","AAA"},'A',{Coal,-1},'\0',nil,'\1',nil,{CoalBlock,1,0},"coal block");
    s({{CoalBlock,-1}}, {Coal,9,0}, "unpack coal");
    r({"AAA","AAA","AAA"},'A',{IronIngot,-1},'\0',nil,'\1',nil,{IronBlock,1,0},"iron block");
    s({{IronBlock,-1}}, {IronIngot,9,0}, "unpack iron");
    r({"AAA","AAA","AAA"},'A',{GoldIngot,-1},'\0',nil,'\1',nil,{GoldBlock,1,0},"gold block");
    s({{GoldBlock,-1}}, {GoldIngot,9,0}, "unpack gold");
    r({"AAA","AAA","AAA"},'A',{Diamond,-1},'\0',nil,'\1',nil,{DiamondBlock,1,0},"diamond block");
    s({{DiamondBlock,-1}}, {Diamond,9,0}, "unpack diamond");
    r({"AAA","AAA","AAA"},'A',{Redstone,-1},'\0',nil,'\1',nil,{RedstoneBlock,1,0},"redstone block");
    s({{RedstoneBlock,-1}}, {Redstone,9,0}, "unpack redstone");
    r({"AAA","AAA","AAA"},'A',{Emerald,-1},'\0',nil,'\1',nil,{EmeraldBlock,1,0},"emerald block");
    s({{EmeraldBlock,-1}}, {Emerald,9,0}, "unpack emerald");
    s({{Reeds,-1}}, {Sugar,1,0}, "sugar");
    r({"AAA"},'A',{Reeds,-1},'\0',nil,'\1',nil,{Paper,3,0},"paper");
    s({{Paper,-1},{Paper,-1},{Paper,-1},{Leather,-1}}, {Book,1,0}, "book");
    r({"AAA","A A","AAA"},'A',{Glass,-1},'\0',nil,'\1',nil,{GlassPane,16,0},"glass panes");
    for (int dye = 0; dye < 16; ++dye) {
        r({"AAA","ABA","AAA"},'A',{Glass,-1},'B',{Dye,dye},'\1',nil,
          {StainedGlass,8,(uint16_t)(15-dye)},"stained glass");
    }
    // Tool templates. Explicit ordered material patterns avoid treating any
    // material as interchangeable in a shaped recipe.
    const uint16_t mats[5] = {Planks,Cobblestone,IronIngot,Diamond,GoldIngot};
    const uint16_t swords[5] = {WoodenSword,StoneSword,IronSword,DiamondSword,GoldenSword};
    const uint16_t picks[5] = {WoodenPickaxe,StonePickaxe,IronPickaxe,DiamondPickaxe,GoldenPickaxe};
    const uint16_t shovels[5] = {WoodenShovel,StoneShovel,IronShovel,DiamondShovel,GoldenShovel};
    const uint16_t axes[5] = {WoodenAxe,StoneAxe,IronAxe,DiamondAxe,GoldenAxe};
    const uint16_t hoes[5] = {WoodenHoe,StoneHoe,IronHoe,DiamondHoe,GoldenHoe};
    for (int t=0; t<5; ++t) {
        Ingredient material{mats[t],-1};
        r({" A "," A "," B "}, 'A',material,'B',{Stick,-1},'\1',nil,{swords[t],1,0},"sword");
        r({"AAA"," B "," B "}, 'A',material,'B',{Stick,-1},'\1',nil,{picks[t],1,0},"pickaxe");
        r({" A "," B "," B "}, 'A',material,'B',{Stick,-1},'\1',nil,{shovels[t],1,0},"shovel");
        r({"AA ","AB "," B "}, 'A',material,'B',{Stick,-1},'\1',nil,{axes[t],1,0},"axe");
        r({"AA "," B "," B "}, 'A',material,'B',{Stick,-1},'\1',nil,{hoes[t],1,0},"hoe");
    }
    r({"AAA","BBB"},'A',{Wool,-1},'B',{Planks,-1},'\1',nil,{Bed,1,0},"bed");
    r({"A A"," A "},'A',{IronIngot,-1},'\0',nil,'\1',nil,{Bucket,1,0},"bucket");
    s({{Flint,-1},{IronIngot,-1}}, {FlintAndSteel,1,0}, "flint and steel");
    s({{BrownMushroomItem,-1},{RedMushroomItem,-1},{Bowl,-1}},
       {MushroomStew,1,0}, "mushroom stew");
    s({{MelonBlock,-1}}, {Melon,9,0}, "melon slices");
    return all;
}

const Recipe* findRecipe(const std::array<ItemStack, 9>& grid, int side,
                         std::array<bool, 9>* used = nullptr) {
    for (const Recipe& r : recipes()) if (match(r, grid, side, used)) return &r;
    return nullptr;
}
} // namespace

const std::vector<Recipe>& recipes() {
    static const auto all = buildRecipes();
    return all;
}

std::optional<ItemStack> craftResult(const std::array<ItemStack, 9>& grid, int side) {
    if (const Recipe* r = findRecipe(grid, side)) return r->result;
    return std::nullopt;
}

ItemStack craftOnce(std::array<ItemStack, 9>& grid, int side) {
    std::array<bool, 9> used{};
    const Recipe* r = findRecipe(grid, side, &used);
    if (!r) return {};
    for (int i=0; i<side*side; ++i) {
        if (used[i] && --grid[i].count == 0) grid[i].clear();
    }
    return r->result;
}

ItemStack smeltResult(const ItemStack& input) {
    if (input.empty()) return {};
    using namespace ItemID;
    switch (input.id) {
        case IronOre: return {IronIngot,1,0};
        case GoldOre: return {GoldIngot,1,0};
        case Sand: return {Glass,1,0};
        case Cobblestone: return {Stone,1,0};
        case ClayBall: return {Brick,1,0};
        case Clay: return {HardenedClay,1,0};
        case Log: case Log2: return {Coal,1,1}; // charcoal
        case Porkchop: return {CookedPorkchop,1,0};
        case Beef: return {CookedBeef,1,0};
        case Chicken: return {CookedChicken,1,0};
        case Fish:
            if (input.meta < 2) return {CookedFish,1,input.meta};
            return {}; // 1.7 clownfish/pufferfish cannot be cooked
        case Potato: return {BakedPotato,1,0};
        case Netherrack: return {Netherbrick,1,0};
        case Cactus: return {Dye,1,2}; // cactus green
        case Stonebrick: return {Stonebrick,1,2}; // cracked stone bricks
        default: return {};
    }
}

bool Furnace::tick() {
    ItemStack cooked = smeltResult(input);
    bool canCook = !cooked.empty() &&
        (output.empty() || (output.stackableWith(cooked) && output.count < output.maxStack()));
    if (burnLeft > 0) --burnLeft;
    if (burnLeft == 0 && canCook && !fuel.empty()) {
        int ticks = itemFuelTicks(fuel.id, fuel.meta);
        if (ticks > 0) {
            burnTotal = burnLeft = ticks;
            bool bucket = fuel.id == ItemID::LavaBucket;
            if (--fuel.count == 0) { if (bucket) fuel = {ItemID::Bucket,1,0}; else fuel.clear(); }
        }
    }
    if (!canCook || burnLeft == 0) { cook = 0; return false; }
    if (++cook < cookDuration) return false;
    cook = 0;
    if (output.empty()) output = cooked;
    else output.count++;
    if (--input.count == 0) input.clear();
    return true;
}

} // namespace vox
