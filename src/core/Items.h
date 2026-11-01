// Item registry: 1.7.3 numeric item ids, stack limits, tools, food, armor.
#pragma once
#include <cstdint>
#include <string>
#include "Blocks.h" // ToolType, BlockID

namespace vox {

class JavaRandom;

// Item ids. Blocks double as items using their block id (< 256).
namespace ItemID {
enum : uint16_t {
    // Block items (id == block id)
    Stone = BlockID::Stone, Grass = BlockID::Grass, Dirt = BlockID::Dirt,
    Cobblestone = BlockID::Cobblestone, Planks = BlockID::Planks,
    Sapling = BlockID::Sapling, Sand = BlockID::Sand, Gravel = BlockID::Gravel,
    Log = BlockID::Log, Leaves = BlockID::Leaves, Glass = BlockID::Glass,
    Wool = BlockID::Wool, YellowFlower = BlockID::YellowFlower,
    RedFlower = BlockID::RedFlower, BrownMushroomItem = BlockID::BrownMushroom,
    RedMushroomItem = BlockID::RedMushroom, StoneSlab = BlockID::StoneSlab,
    BrickBlock = BlockID::BrickBlock, TNT = BlockID::TNT,
    Bookshelf = BlockID::Bookshelf, MossyCobblestone = BlockID::MossyCobblestone,
    Obsidian = BlockID::Obsidian, Torch = BlockID::Torch,
    OakStairs = BlockID::OakStairs, Chest = BlockID::Chest,
    CraftingTable = BlockID::CraftingTable, Furnace = BlockID::Furnace,
    Ladder = BlockID::Ladder, Rail = BlockID::Rail,
    StoneStairs = BlockID::StoneStairs, Lever = BlockID::Lever,
    StonePressurePlate = BlockID::StonePressurePlate,
    WoodenPressurePlate = BlockID::WoodenPressurePlate,
    SnowLayer = BlockID::SnowLayer, Ice = BlockID::Ice, Snow = BlockID::Snow,
    Cactus = BlockID::Cactus, Clay = BlockID::Clay, ReedsBlock = BlockID::Reeds,
    Fence = BlockID::Fence, Pumpkin = BlockID::Pumpkin,
    Netherrack = BlockID::Netherrack, SoulSand = BlockID::SoulSand,
    Glowstone = BlockID::Glowstone, LitPumpkin = BlockID::LitPumpkin,
    Trapdoor = BlockID::Trapdoor, Stonebrick = BlockID::Stonebrick,
    IronBars = BlockID::IronBars, GlassPane = BlockID::GlassPane,
    MelonBlock = BlockID::MelonBlock, Vine = BlockID::Vine,
    FenceGate = BlockID::FenceGate, BrickStairs = BlockID::BrickStairs,
    StoneBrickStairs = BlockID::StoneBrickStairs, Mycelium = BlockID::Mycelium,
    Waterlily = BlockID::Waterlily, NetherBrick = BlockID::NetherBrick,
    NetherBrickFence = BlockID::NetherBrickFence,
    NetherBrickStairs = BlockID::NetherBrickStairs,
    NetherWartBlock = BlockID::NetherWart, EnchantingTable = BlockID::EnchantingTable,
    EndStone = BlockID::EndStone, RedstoneLamp = BlockID::RedstoneLamp,
    WoodenSlab = BlockID::WoodenSlab, Sandstone = BlockID::Sandstone,
    EmeraldBlock = BlockID::EmeraldBlock, SpruceStairs = BlockID::SpruceStairs,
    BirchStairs = BlockID::BirchStairs, JungleStairs = BlockID::JungleStairs,
    CobblestoneWall = BlockID::CobblestoneWall, Carrots = BlockID::Carrots,
    Potatoes = BlockID::Potatoes, WoodenButton = BlockID::WoodenButton,
    AnvilItem = BlockID::Anvil, TrappedChest = BlockID::TrappedChest,
    LightWeightedPressurePlate = BlockID::LightWeightedPressurePlate,
    HeavyWeightedPressurePlate = BlockID::HeavyWeightedPressurePlate,
    DaylightSensor = BlockID::DaylightDetector,
    RedstoneBlock = BlockID::RedstoneBlock, HopperItem = BlockID::Hopper,
    QuartzBlock = BlockID::QuartzBlock, QuartzStairs = BlockID::QuartzStairs,
    ActivatorRail = BlockID::ActivatorRail, Dropper = BlockID::Dropper,
    StainedGlass = BlockID::StainedGlass,
    StainedGlassPane = BlockID::StainedGlassPane,
    StainedHardenedClay = BlockID::StainedHardenedClay,
    Leaves2 = BlockID::Leaves2, Log2 = BlockID::Log2,
    AcaciaStairs = BlockID::AcaciaStairs, DarkOakStairs = BlockID::DarkOakStairs,
    HayBlock = BlockID::HayBlock, Carpet = BlockID::Carpet,
    HardenedClay = BlockID::HardenedClay, CoalBlock = BlockID::CoalBlock,
    PackedIce = BlockID::PackedIce, DoublePlant = BlockID::DoublePlant,
    GoldBlock = BlockID::GoldBlock, IronBlock = BlockID::IronBlock,
    DiamondBlock = BlockID::DiamondBlock, LapisBlock = BlockID::LapisBlock,
    LapisOre = BlockID::LapisOre, Dispenser = BlockID::Dispenser,
    Noteblock = BlockID::Noteblock, GoldenRail = BlockID::GoldenRail,
    DetectorRail = BlockID::DetectorRail, Web = BlockID::Web,
    Deadbush = BlockID::Deadbush, Sponge = BlockID::Sponge,
    Jukebox = BlockID::Jukebox, FireItem = BlockID::Fire,
    RedstoneOreItem = BlockID::RedstoneOre, RedstoneTorch = BlockID::RedstoneTorch,
    StoneButton = BlockID::StoneButton, PumpkinStem = BlockID::PumpkinStem,
    MelonStem = BlockID::MelonStem, EmeraldOre = BlockID::EmeraldOre,
    EnderChest = BlockID::EnderChest, Beacon = BlockID::Beacon,
    FlowerPotBlock = BlockID::FlowerPot, ComparatorBlock = BlockID::UnpoweredComparator,
    QuartzOre = BlockID::QuartzOre, GoldOre = BlockID::GoldOre,
    IronOre = BlockID::IronOre, CoalOre = BlockID::CoalOre,
    DiamondOre = BlockID::DiamondOre, MonsterEgg = BlockID::MonsterEgg,
    BrownMushroomBlock = BlockID::BrownMushroomBlock,
    RedMushroomBlock = BlockID::RedMushroomBlock, Cocoa = BlockID::Cocoa,
    SandstoneStairs = BlockID::SandstoneStairs, CommandBlock = BlockID::CommandBlock,
    DragonEgg = BlockID::DragonEgg, Bedrock = BlockID::Bedrock,

    // Real items (1.7 numeric ids)
    IronShovel = 256, IronPickaxe = 257, IronAxe = 258, FlintAndSteel = 259,
    Apple = 260, Bow = 261, Arrow = 262, Coal = 263, Diamond = 264,
    IronIngot = 265, GoldIngot = 266, IronSword = 267, WoodenSword = 268,
    WoodenShovel = 269, WoodenPickaxe = 270, WoodenAxe = 271,
    StoneSword = 272, StoneShovel = 273, StonePickaxe = 274, StoneAxe = 275,
    DiamondSword = 276, DiamondShovel = 277, DiamondPickaxe = 278,
    DiamondAxe = 279, Stick = 280, Bowl = 281, MushroomStew = 282,
    GoldenSword = 283, GoldenShovel = 284, GoldenPickaxe = 285,
    GoldenAxe = 286, String = 287, Feather = 288, Gunpowder = 289,
    WoodenHoe = 290, StoneHoe = 291, IronHoe = 292, DiamondHoe = 293,
    GoldenHoe = 294, WheatSeeds = 295, Wheat = 296, Bread = 297,
    LeatherHelmet = 298, LeatherChestplate = 299, LeatherLeggings = 300,
    LeatherBoots = 301, ChainHelmet = 302, ChainChestplate = 303,
    ChainLeggings = 304, ChainBoots = 305, IronHelmet = 306,
    IronChestplate = 307, IronLeggings = 308, IronBoots = 309,
    DiamondHelmet = 310, DiamondChestplate = 311, DiamondLeggings = 312,
    DiamondBoots = 313, GoldenHelmet = 314, GoldenChestplate = 315,
    GoldenLeggings = 316, GoldenBoots = 317, Flint = 318, Porkchop = 319,
    CookedPorkchop = 320, Painting = 321, GoldenApple = 322, Sign = 323,
    WoodenDoorItem = 324, Bucket = 325, WaterBucket = 326, LavaBucket = 327,
    Minecart = 328, Saddle = 329, IronDoorItem = 330, Redstone = 331,
    Snowball = 332, Boat = 333, Leather = 334, MilkBucket = 335, Brick = 336,
    ClayBall = 337, Reeds = 338, Paper = 339, Book = 340, SlimeBall = 341,
    ChestMinecart = 342, FurnaceMinecart = 343, Egg = 344, Compass = 345,
    FishingRod = 346, Clock = 347, GlowstoneDust = 348, Fish = 349,
    CookedFish = 350, Dye = 351, Bone = 352, Sugar = 353, Cake = 354,
    Bed = 355, RepeaterItem = 356, Cookie = 357, FilledMap = 358,
    Shears = 359, Melon = 360, PumpkinSeeds = 361, MelonSeeds = 362,
    Beef = 363, CookedBeef = 364, Chicken = 365, CookedChicken = 366,
    RottenFlesh = 367, EnderPearl = 368, BlazeRod = 369, GhastTear = 370,
    GoldNugget = 371, NetherWart = 372, Potion = 373, GlassBottle = 374,
    SpiderEye = 375, FermentedSpiderEye = 376, BlazePowder = 377,
    MagmaCream = 378, BrewingStandItem = 379, CauldronItem = 380,
    EnderEye = 381, SpeckledMelon = 382, SpawnEgg = 383,
    ExperienceBottle = 384, FireCharge = 385, WritableBook = 386,
    WrittenBook = 387, Emerald = 388, ItemFrame = 389, FlowerPotItem = 390,
    Carrot = 391, Potato = 392, BakedPotato = 393, PoisonousPotato = 394,
    Map = 395, GoldenCarrot = 396, SkullItem = 397, CarrotOnAStick = 398,
    NetherStar = 399, PumpkinPie = 400, Fireworks = 401,
    FireworkCharge = 402, EnchantedBook = 403, ComparatorItem = 404,
    Netherbrick = 405, Quartz = 406, TntMinecart = 407,
    HopperMinecart = 408, IronHorseArmor = 417, GoldenHorseArmor = 418,
    DiamondHorseArmor = 419, Lead = 420, NameTag = 421,
    ItemIDCount = 422
};
} // namespace ItemID

struct ItemStack {
    uint16_t id = 0;
    uint8_t count = 0;
    uint16_t meta = 0; // damage for tools/armor; variant for blocks/dye/fish...

    bool empty() const { return id == 0 || count == 0; }
    void clear() { id = 0; count = 0; meta = 0; }
    bool sameItem(const ItemStack& o) const { return id == o.id && meta == o.meta; }
    bool stackableWith(const ItemStack& o) const {
        return sameItem(o) && !isDamageable() && maxStack() > 1;
    }
    int maxStack() const;
    int maxDamage() const;        // 0 = not damageable
    bool isDamageable() const { return maxDamage() > 0; }
    bool isDamaged() const { return isDamageable() && meta > 0; }
    int remainingUses() const { return maxDamage() - (int)meta; }
    std::string displayName() const;
};

struct ItemDef {
    uint16_t id = 0;
    const char* name = "";
    const char* displayName = "Unknown Item";
    int maxStack = 64;
    int durability = 0;      // uses before breaking (0 = not damageable)
    ToolType tool = ToolType::None;
    int tier = -1;           // 0 wood, 1 stone, 2 iron, 3 diamond, 4 gold
    float efficiency = 1.0f; // mining speed multiplier
    float attackDamage = 1.0f; // vs mobs (1.7 values)
    int food = 0;            // hunger points restored
    float saturation = 0;    // saturation restored
    bool alwaysEdible = false;
    int armorSlot = -1;      // 0 helmet, 1 chest, 2 legs, 3 boots
    int armorPoints = 0;
    uint16_t blockId = 0;    // non-zero: places this block
    uint8_t placeMeta = 0;
    bool fuel = false;
    int burnTicks = 0;
    bool smeltable = false;
};

const ItemDef& itemDef(uint16_t id);
const char* itemName(uint16_t id);
bool itemExists(uint16_t id);
// Item id for a placeable block, or 0 for non-placeable items.
uint16_t blockIdForItem(uint16_t itemId);
// Texture tile for inventory / held rendering (1.7-style names, original art).
std::string itemTile(uint16_t id, uint16_t meta);
// Fuel burn ticks (1.7 furnace values). 0 = not a fuel.
int itemFuelTicks(uint16_t id, uint16_t meta);

} // namespace vox
