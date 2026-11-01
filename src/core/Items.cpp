#include "Items.h"
#include <cstdio>
#include <array>
#include <mutex>

namespace vox {

using namespace ItemID;

// ---------------------------------------------------------------------------
static ItemDef g_items[ItemID::ItemIDCount];
static std::once_flag g_initOnce;

static ItemDef& I(uint16_t id) { return g_items[id]; }

static void mkBlockItem(uint16_t id, const char* name, const char* display) {
    ItemDef& d = g_items[id];
    d.id = id; d.name = name; d.displayName = display; d.blockId = id;
}

static void mk(uint16_t id, const char* name, const char* display, int maxStack = 64) {
    ItemDef& d = g_items[id];
    d.id = id; d.name = name; d.displayName = display; d.maxStack = maxStack;
}

static void mkTool(uint16_t id, const char* name, const char* display,
                   ToolType tool, int tier, int durability, float efficiency,
                   float attack) {
    ItemDef& d = g_items[id];
    d.id = id; d.name = name; d.displayName = display; d.maxStack = 1;
    d.tool = tool; d.tier = tier; d.durability = durability;
    d.efficiency = efficiency; d.attackDamage = attack;
}

static void mkArmor(uint16_t id, const char* name, const char* display,
                    int slot, int points, int durability) {
    ItemDef& d = g_items[id];
    d.id = id; d.name = name; d.displayName = display; d.maxStack = 1;
    d.armorSlot = slot; d.armorPoints = points; d.durability = durability;
}

static void mkFood(uint16_t id, const char* name, const char* display,
                   int food, float sat, bool alwaysEdible = false,
                   int maxStack = 64) {
    ItemDef& d = g_items[id];
    d.id = id; d.name = name; d.displayName = display; d.maxStack = maxStack;
    d.food = food; d.saturation = sat; d.alwaysEdible = alwaysEdible;
}

static const float kTierEff[5] = {2.0f, 4.0f, 6.0f, 8.0f, 12.0f};
static const int kTierDur[5] = {59, 131, 250, 1561, 32};
// 1.7 final damage values (sword = 4 + tier dmg etc.)
static const float kSwordDmg[5] = {5, 6, 7, 8, 5};     // wood stone iron diamond gold
static const float kShovelDmg[5] = {2, 3, 4, 5, 2};
static const float kPickDmg[5] = {3, 4, 5, 6, 3};
static const float kAxeDmg[5] = {4, 5, 6, 7, 4};

static void initItems() {
    for (int i = 0; i < ItemID::ItemIDCount; ++i) {
        g_items[i] = ItemDef{};
        g_items[i].id = (uint16_t)i;
    }

    // -- block items ---------------------------------------------------------
    mkBlockItem(Stone, "stone", "Stone");
    mkBlockItem(Grass, "grass", "Grass Block");
    mkBlockItem(Dirt, "dirt", "Dirt");
    mkBlockItem(Cobblestone, "cobblestone", "Cobblestone");
    mkBlockItem(Planks, "planks", "Wood Planks");
    mkBlockItem(Sapling, "sapling", "Sapling");
    mkBlockItem(Bedrock, "bedrock", "Bedrock");
    mkBlockItem(Sand, "sand", "Sand");
    mkBlockItem(Gravel, "gravel", "Gravel");
    mkBlockItem(GoldOre, "gold_ore", "Gold Ore");
    mkBlockItem(IronOre, "iron_ore", "Iron Ore");
    mkBlockItem(CoalOre, "coal_ore", "Coal Ore");
    mkBlockItem(Log, "log", "Wood");
    mkBlockItem(Leaves, "leaves", "Leaves");
    mkBlockItem(Sponge, "sponge", "Sponge");
    mkBlockItem(Glass, "glass", "Glass");
    mkBlockItem(LapisOre, "lapis_ore", "Lapis Lazuli Ore");
    mkBlockItem(LapisBlock, "lapis_block", "Lapis Lazuli Block");
    mkBlockItem(Dispenser, "dispenser", "Dispenser");
    mkBlockItem(Sandstone, "sandstone", "Sandstone");
    mkBlockItem(Noteblock, "noteblock", "Note Block");
    mkBlockItem(GoldenRail, "golden_rail", "Powered Rail");
    mkBlockItem(DetectorRail, "detector_rail", "Detector Rail");
    mkBlockItem(Web, "web", "Cobweb");
    mkBlockItem(Deadbush, "deadbush", "Dead Bush");
    mkBlockItem(Wool, "wool", "Wool");
    mkBlockItem(YellowFlower, "yellow_flower", "Dandelion");
    mkBlockItem(RedFlower, "red_flower", "Flower");
    mkBlockItem(BrownMushroomItem, "brown_mushroom", "Mushroom");
    mkBlockItem(RedMushroomItem, "red_mushroom", "Mushroom");
    mkBlockItem(GoldBlock, "gold_block", "Block of Gold");
    mkBlockItem(IronBlock, "iron_block", "Block of Iron");
    mkBlockItem(StoneSlab, "stone_slab", "Slab");
    mkBlockItem(BrickBlock, "brick_block", "Bricks");
    mkBlockItem(TNT, "tnt", "TNT");
    mkBlockItem(Bookshelf, "bookshelf", "Bookshelf");
    mkBlockItem(MossyCobblestone, "mossy_cobblestone", "Moss Stone");
    mkBlockItem(Obsidian, "obsidian", "Obsidian");
    mkBlockItem(Torch, "torch", "Torch");
    mkBlockItem(OakStairs, "oak_stairs", "Oak Stairs");
    mkBlockItem(Chest, "chest", "Chest");
    mkBlockItem(DiamondOre, "diamond_ore", "Diamond Ore");
    mkBlockItem(DiamondBlock, "diamond_block", "Block of Diamond");
    mkBlockItem(CraftingTable, "crafting_table", "Crafting Table");
    mkBlockItem(Furnace, "furnace", "Furnace");
    mkBlockItem(Ladder, "ladder", "Ladder");
    mkBlockItem(Rail, "rail", "Rail");
    mkBlockItem(StoneStairs, "stone_stairs", "Cobblestone Stairs");
    mkBlockItem(Lever, "lever", "Lever");
    mkBlockItem(StonePressurePlate, "stone_pressure_plate", "Stone Pressure Plate");
    mkBlockItem(WoodenPressurePlate, "wooden_pressure_plate", "Wooden Pressure Plate");
    mkBlockItem(RedstoneOreItem, "redstone_ore", "Redstone Ore");
    mkBlockItem(RedstoneTorch, "redstone_torch", "Redstone Torch");
    mkBlockItem(StoneButton, "stone_button", "Button");
    mkBlockItem(SnowLayer, "snow_layer", "Snow");
    mkBlockItem(Ice, "ice", "Ice");
    mkBlockItem(Snow, "snow", "Snow Block");
    mkBlockItem(Cactus, "cactus", "Cactus");
    mkBlockItem(Clay, "clay", "Clay");
    mkBlockItem(ReedsBlock, "reeds", "Sugar Canes");
    mkBlockItem(Jukebox, "jukebox", "Jukebox");
    mkBlockItem(Fence, "fence", "Fence");
    mkBlockItem(Pumpkin, "pumpkin", "Pumpkin");
    mkBlockItem(Netherrack, "netherrack", "Netherrack");
    mkBlockItem(SoulSand, "soul_sand", "Soul Sand");
    mkBlockItem(Glowstone, "glowstone", "Glowstone");
    mkBlockItem(LitPumpkin, "lit_pumpkin", "Jack o'Lantern");
    mkBlockItem(Trapdoor, "trapdoor", "Trapdoor");
    mkBlockItem(MonsterEgg, "monster_egg", "Stone Monster Egg");
    mkBlockItem(Stonebrick, "stonebrick", "Stone Bricks");
    mkBlockItem(BrownMushroomBlock, "brown_mushroom_block", "Mushroom");
    mkBlockItem(RedMushroomBlock, "red_mushroom_block", "Mushroom");
    mkBlockItem(IronBars, "iron_bars", "Iron Bars");
    mkBlockItem(GlassPane, "glass_pane", "Glass Pane");
    mkBlockItem(MelonBlock, "melon_block", "Melon");
    mkBlockItem(Vine, "vine", "Vines");
    mkBlockItem(FenceGate, "fence_gate", "Fence Gate");
    mkBlockItem(BrickStairs, "brick_stairs", "Brick Stairs");
    mkBlockItem(StoneBrickStairs, "stone_brick_stairs", "Stone Brick Stairs");
    mkBlockItem(Mycelium, "mycelium", "Mycelium");
    mkBlockItem(Waterlily, "waterlily", "Lily Pad");
    mkBlockItem(NetherBrick, "nether_brick", "Nether Bricks");
    mkBlockItem(NetherBrickFence, "nether_brick_fence", "Nether Brick Fence");
    mkBlockItem(NetherBrickStairs, "nether_brick_stairs", "Nether Brick Stairs");
    mkBlockItem(NetherWartBlock, "nether_wart", "Nether Wart");
    mkBlockItem(EnchantingTable, "enchanting_table", "Enchantment Table");
    mkBlockItem(EndStone, "end_stone", "End Stone");
    mkBlockItem(RedstoneLamp, "redstone_lamp", "Redstone Lamp");
    mkBlockItem(WoodenSlab, "wooden_slab", "Wood Slab");
    mkBlockItem(Cocoa, "cocoa", "Cocoa");
    mkBlockItem(SandstoneStairs, "sandstone_stairs", "Sandstone Stairs");
    mkBlockItem(EmeraldOre, "emerald_ore", "Emerald Ore");
    mkBlockItem(EnderChest, "ender_chest", "Ender Chest");
    mkBlockItem(EmeraldBlock, "emerald_block", "Block of Emerald");
    mkBlockItem(SpruceStairs, "spruce_stairs", "Spruce Stairs");
    mkBlockItem(BirchStairs, "birch_stairs", "Birch Stairs");
    mkBlockItem(JungleStairs, "jungle_stairs", "Jungle Stairs");
    mkBlockItem(CommandBlock, "command_block", "Command Block");
    mkBlockItem(Beacon, "beacon", "Beacon");
    mkBlockItem(CobblestoneWall, "cobblestone_wall", "Cobblestone Wall");
    mkBlockItem(FlowerPotBlock, "flower_pot", "Flower Pot");
    mkBlockItem(WoodenButton, "wooden_button", "Button");
    mkBlockItem(AnvilItem, "anvil", "Anvil");
    mkBlockItem(TrappedChest, "trapped_chest", "Trapped Chest");
    mkBlockItem(LightWeightedPressurePlate, "light_weighted_pressure_plate",
                "Weighted Pressure Plate (Light)");
    mkBlockItem(HeavyWeightedPressurePlate, "heavy_weighted_pressure_plate",
                "Weighted Pressure Plate (Heavy)");
    mkBlockItem(DaylightSensor, "daylight_detector", "Daylight Sensor");
    mkBlockItem(RedstoneBlock, "redstone_block", "Block of Redstone");
    mkBlockItem(QuartzOre, "quartz_ore", "Nether Quartz Ore");
    mkBlockItem(HopperItem, "hopper", "Hopper");
    mkBlockItem(QuartzBlock, "quartz_block", "Block of Quartz");
    mkBlockItem(QuartzStairs, "quartz_stairs", "Quartz Stairs");
    mkBlockItem(ActivatorRail, "activator_rail", "Activator Rail");
    mkBlockItem(Dropper, "dropper", "Dropper");
    mkBlockItem(StainedGlass, "stained_glass", "Stained Glass");
    mkBlockItem(StainedGlassPane, "stained_glass_pane", "Stained Glass Pane");
    mkBlockItem(StainedHardenedClay, "stained_hardened_clay", "Stained Clay");
    mkBlockItem(Leaves2, "leaves2", "Leaves");
    mkBlockItem(Log2, "log2", "Wood");
    mkBlockItem(AcaciaStairs, "acacia_stairs", "Acacia Stairs");
    mkBlockItem(DarkOakStairs, "dark_oak_stairs", "Dark Oak Stairs");
    mkBlockItem(HayBlock, "hay_block", "Hay Bale");
    mkBlockItem(Carpet, "carpet", "Carpet");
    mkBlockItem(HardenedClay, "hardened_clay", "Hardened Clay");
    mkBlockItem(CoalBlock, "coal_block", "Block of Coal");
    mkBlockItem(PackedIce, "packed_ice", "Packed Ice");
    mkBlockItem(DoublePlant, "double_plant", "Large Plant");
    mkBlockItem(DragonEgg, "dragon_egg", "Dragon Egg");
    mkBlockItem(ComparatorBlock, "comparator", "Redstone Comparator");
    // Special placement metas
    I(Dirt).maxStack = 64;

    // -- tools -----------------------------------------------------------------
    const char* tierNames[5] = {"wooden", "stone", "iron", "diamond", "golden"};
    const char* tierDisp[5] = {"Wooden", "Stone", "Iron", "Diamond", "Golden"};
    // Fixed buffers avoid POSIX strdup (unavailable on MSVC) and heap leaks.
    static std::array<std::array<char, 64>, 25> names{}, displays{};
    int slot = 0;
    for (int t = 0; t < 5; ++t) {
        // swords
        uint16_t swordIds[5] = {WoodenSword, StoneSword, IronSword, DiamondSword, GoldenSword};
        char* nameBuf = names[slot].data();
        char* dispBuf = displays[slot].data();
        std::snprintf(nameBuf, 64, "%s_sword", tierNames[t]);
        std::snprintf(dispBuf, 64, "%s Sword", tierDisp[t]);
        mkTool(swordIds[t], nameBuf, dispBuf, ToolType::Sword, t,
               kTierDur[t], kTierEff[t], kSwordDmg[t]); ++slot;
        uint16_t shovelIds[5] = {WoodenShovel, StoneShovel, IronShovel, DiamondShovel, GoldenShovel};
        nameBuf = names[slot].data();
        dispBuf = displays[slot].data();
        std::snprintf(nameBuf, 64, "%s_shovel", tierNames[t]);
        std::snprintf(dispBuf, 64, "%s Shovel", tierDisp[t]);
        mkTool(shovelIds[t], nameBuf, dispBuf, ToolType::Shovel, t,
               kTierDur[t], kTierEff[t], kShovelDmg[t]); ++slot;
        uint16_t pickIds[5] = {WoodenPickaxe, StonePickaxe, IronPickaxe, DiamondPickaxe, GoldenPickaxe};
        nameBuf = names[slot].data();
        dispBuf = displays[slot].data();
        std::snprintf(nameBuf, 64, "%s_pickaxe", tierNames[t]);
        std::snprintf(dispBuf, 64, "%s Pickaxe", tierDisp[t]);
        mkTool(pickIds[t], nameBuf, dispBuf, ToolType::Pickaxe, t,
               kTierDur[t], kTierEff[t], kPickDmg[t]); ++slot;
        uint16_t axeIds[5] = {WoodenAxe, StoneAxe, IronAxe, DiamondAxe, GoldenAxe};
        nameBuf = names[slot].data();
        dispBuf = displays[slot].data();
        std::snprintf(nameBuf, 64, "%s_axe", tierNames[t]);
        std::snprintf(dispBuf, 64, "%s Axe", tierDisp[t]);
        mkTool(axeIds[t], nameBuf, dispBuf, ToolType::Axe, t,
               kTierDur[t], kTierEff[t], kAxeDmg[t]); ++slot;
        uint16_t hoeIds[5] = {WoodenHoe, StoneHoe, IronHoe, DiamondHoe, GoldenHoe};
        nameBuf = names[slot].data();
        dispBuf = displays[slot].data();
        std::snprintf(nameBuf, 64, "%s_hoe", tierNames[t]);
        std::snprintf(dispBuf, 64, "%s Hoe", tierDisp[t]);
        mkTool(hoeIds[t], nameBuf, dispBuf, ToolType::None, t,
               kTierDur[t], 1.0f, 1.0f); ++slot;
    }
    mkTool(Shears, "shears", "Shears", ToolType::Shears, -1, 238, 1.0f, 1.0f);
    mk(Bow, "bow", "Bow", 1); I(Bow).durability = 384;
    mk(FishingRod, "fishing_rod", "Fishing Rod", 1); I(FishingRod).durability = 64;
    mk(FlintAndSteel, "flint_and_steel", "Flint and Steel", 1);
    I(FlintAndSteel).durability = 64;
    mk(Bucket, "bucket", "Bucket", 1);
    mk(WaterBucket, "water_bucket", "Water Bucket", 1);
    mk(LavaBucket, "lava_bucket", "Lava Bucket", 1);
    mk(MilkBucket, "milk_bucket", "Milk Bucket", 1);

    // -- armor ------------------------------------------------------------------
    // leather
    mkArmor(LeatherHelmet, "leather_helmet", "Leather Cap", 0, 1, 55);
    mkArmor(LeatherChestplate, "leather_chestplate", "Leather Tunic", 1, 3, 80);
    mkArmor(LeatherLeggings, "leather_leggings", "Leather Pants", 2, 2, 75);
    mkArmor(LeatherBoots, "leather_boots", "Leather Boots", 3, 1, 65);
    mkArmor(ChainHelmet, "chainmail_helmet", "Chain Helmet", 0, 2, 165);
    mkArmor(ChainChestplate, "chainmail_chestplate", "Chain Chestplate", 1, 5, 240);
    mkArmor(ChainLeggings, "chainmail_leggings", "Chain Leggings", 2, 4, 225);
    mkArmor(ChainBoots, "chainmail_boots", "Chain Boots", 3, 1, 195);
    mkArmor(IronHelmet, "iron_helmet", "Iron Helmet", 0, 2, 165);
    mkArmor(IronChestplate, "iron_chestplate", "Iron Chestplate", 1, 6, 240);
    mkArmor(IronLeggings, "iron_leggings", "Iron Leggings", 2, 5, 225);
    mkArmor(IronBoots, "iron_boots", "Iron Boots", 3, 2, 195);
    mkArmor(DiamondHelmet, "diamond_helmet", "Diamond Helmet", 0, 3, 363);
    mkArmor(DiamondChestplate, "diamond_chestplate", "Diamond Chestplate", 1, 8, 528);
    mkArmor(DiamondLeggings, "diamond_leggings", "Diamond Leggings", 2, 6, 495);
    mkArmor(DiamondBoots, "diamond_boots", "Diamond Boots", 3, 3, 429);
    mkArmor(GoldenHelmet, "golden_helmet", "Golden Helmet", 0, 2, 77);
    mkArmor(GoldenChestplate, "golden_chestplate", "Golden Chestplate", 1, 5, 112);
    mkArmor(GoldenLeggings, "golden_leggings", "Golden Leggings", 2, 3, 105);
    mkArmor(GoldenBoots, "golden_boots", "Golden Boots", 3, 1, 91);

    // -- materials / drops ---------------------------------------------------------
    mk(Arrow, "arrow", "Arrow");
    mk(Coal, "coal", "Coal"); // meta 1 = charcoal
    mk(Diamond, "diamond", "Diamond");
    mk(IronIngot, "iron_ingot", "Iron Ingot");
    mk(GoldIngot, "gold_ingot", "Gold Ingot");
    mk(Stick, "stick", "Stick");
    mk(Bowl, "bowl", "Bowl");
    mk(String, "string", "String");
    mk(Feather, "feather", "Feather");
    mk(Gunpowder, "gunpowder", "Gunpowder");
    mk(WheatSeeds, "wheat_seeds", "Seeds");
    mk(Wheat, "wheat", "Wheat");
    mk(Flint, "flint", "Flint");
    mk(Leather, "leather", "Leather");
    mk(Brick, "brick", "Brick");
    mk(ClayBall, "clay_ball", "Clay");
    mk(Reeds, "reeds", "Sugar Canes");
    mk(Paper, "paper", "Paper");
    mk(Book, "book", "Book");
    mk(SlimeBall, "slime_ball", "Slimeball");
    mk(Egg, "egg", "Egg", 16);
    mk(Redstone, "redstone", "Redstone");
    mk(Snowball, "snowball", "Snowball", 16);
    mk(GlowstoneDust, "glowstone_dust", "Glowstone Dust");
    mk(Dye, "dye", "Dye");
    mk(Bone, "bone", "Bone");
    mk(Sugar, "sugar", "Sugar");
    mk(EnderPearl, "ender_pearl", "Ender Pearl", 16);
    mk(BlazeRod, "blaze_rod", "Blaze Rod");
    mk(GoldNugget, "gold_nugget", "Gold Nugget");
    mk(NetherWart, "nether_wart", "Nether Wart");
    mk(GlassBottle, "glass_bottle", "Glass Bottle");
    mk(SpiderEye, "spider_eye", "Spider Eye");
    mk(Emerald, "emerald", "Emerald");
    mk(Quartz, "quartz", "Nether Quartz");
    mk(Netherbrick, "netherbrick", "Nether Brick");
    mk(Lead, "lead", "Lead");
    mk(NameTag, "name_tag", "Name Tag");
    mk(Sign, "sign", "Sign", 16);
    mk(WoodenDoorItem, "wooden_door", "Wooden Door", 1);
    mk(IronDoorItem, "iron_door", "Iron Door", 1);
    mk(Bed, "bed", "Bed", 1);
    mk(Cake, "cake", "Cake", 1);
    mk(RepeaterItem, "repeater", "Redstone Repeater");
    mk(ComparatorItem, "comparator", "Redstone Comparator");
    mk(BrewingStandItem, "brewing_stand", "Brewing Stand");
    mk(CauldronItem, "cauldron", "Cauldron");
    mk(FlowerPotItem, "flower_pot", "Flower Pot");
    mk(Painting, "painting", "Painting");
    mk(Compass, "compass", "Compass");
    mk(Clock, "clock", "Clock");
    mk(Map, "map", "Empty Map");
    mk(Boat, "boat", "Boat", 1);
    mk(Minecart, "minecart", "Minecart", 1);
    mk(Saddle, "saddle", "Saddle", 1);
    mk(SpawnEgg, "spawn_egg", "Spawn Egg");
    mk(ItemFrame, "item_frame", "Item Frame");
    mk(SkullItem, "skull", "Head");
    mk(ChestMinecart, "chest_minecart", "Minecart with Chest", 1);
    mk(FurnaceMinecart, "furnace_minecart", "Minecart with Furnace", 1);
    mk(TntMinecart, "tnt_minecart", "Minecart with TNT", 1);
    mk(HopperMinecart, "hopper_minecart", "Minecart with Hopper", 1);
    mk(FilledMap, "filled_map", "Map", 1);
    mk(PumpkinSeeds, "pumpkin_seeds", "Pumpkin Seeds");
    mk(MelonSeeds, "melon_seeds", "Melon Seeds");
    mk(GhastTear, "ghast_tear", "Ghast Tear");
    mk(Potion, "potion", "Potion", 1);
    mk(FermentedSpiderEye, "fermented_spider_eye", "Fermented Spider Eye");
    mk(BlazePowder, "blaze_powder", "Blaze Powder");
    mk(MagmaCream, "magma_cream", "Magma Cream");
    mk(EnderEye, "ender_eye", "Eye of Ender");
    mk(SpeckledMelon, "speckled_melon", "Glistering Melon");
    mk(ExperienceBottle, "experience_bottle", "Bottle o' Enchanting");
    mk(FireCharge, "fire_charge", "Fire Charge");
    mk(WritableBook, "writable_book", "Book and Quill", 1);
    mk(WrittenBook, "written_book", "Written Book", 1);
    mk(CarrotOnAStick, "carrot_on_a_stick", "Carrot on a Stick", 1);
    I(CarrotOnAStick).durability = 25;
    mk(NetherStar, "nether_star", "Nether Star");
    mk(Fireworks, "fireworks", "Firework Rocket");
    mk(FireworkCharge, "firework_charge", "Firework Star");
    mk(EnchantedBook, "enchanted_book", "Enchanted Book", 1);
    mk(IronHorseArmor, "iron_horse_armor", "Iron Horse Armor", 1);
    mk(GoldenHorseArmor, "golden_horse_armor", "Gold Horse Armor", 1);
    mk(DiamondHorseArmor, "diamond_horse_armor", "Diamond Horse Armor", 1);

    // -- food -----------------------------------------------------------------------
    mkFood(Apple, "apple", "Apple", 4, 2.4f);
    mkFood(Bread, "bread", "Bread", 5, 6.0f);
    mkFood(MushroomStew, "mushroom_stew", "Mushroom Stew", 6, 7.2f, false, 1);
    mkFood(Porkchop, "porkchop", "Raw Porkchop", 3, 1.8f);
    mkFood(CookedPorkchop, "cooked_porkchop", "Cooked Porkchop", 8, 12.8f);
    mkFood(GoldenApple, "golden_apple", "Golden Apple", 4, 9.6f, true);
    mkFood(Fish, "fish", "Raw Fish", 2, 0.4f);       // meta: 0 fish 1 salmon 2 clown 3 puffer
    mkFood(CookedFish, "cooked_fish", "Cooked Fish", 6, 7.2f);
    mkFood(Cookie, "cookie", "Cookie", 2, 0.4f);
    mkFood(Melon, "melon", "Melon", 2, 1.2f);
    mkFood(Beef, "beef", "Raw Beef", 3, 1.8f);
    mkFood(CookedBeef, "cooked_beef", "Steak", 8, 12.8f);
    mkFood(Chicken, "chicken", "Raw Chicken", 2, 1.2f);
    mkFood(CookedChicken, "cooked_chicken", "Cooked Chicken", 6, 7.2f);
    mkFood(RottenFlesh, "rotten_flesh", "Rotten Flesh", 4, 0.8f);
    mkFood(SpiderEye, "spider_eye", "Spider Eye", 2, 3.2f);
    mkFood(Carrot, "carrot", "Carrot", 3, 3.6f);
    mkFood(Potato, "potato", "Potato", 1, 0.6f);
    mkFood(BakedPotato, "baked_potato", "Baked Potato", 5, 6.0f);
    mkFood(PoisonousPotato, "poisonous_potato", "Poisonous Potato", 2, 1.2f);
    mkFood(GoldenCarrot, "golden_carrot", "Golden Carrot", 6, 14.4f);
    mkFood(PumpkinPie, "pumpkin_pie", "Pumpkin Pie", 8, 4.8f);
    // Clownfish/pufferfish share Fish id with meta; adjust per-meta in food logic.

}

const ItemDef& itemDef(uint16_t id) {
    std::call_once(g_initOnce, initItems);
    if (id >= ItemID::ItemIDCount) return g_items[0];
    return g_items[id];
}

const char* itemName(uint16_t id) { return itemDef(id).name; }
bool itemExists(uint16_t id) { return id < ItemID::ItemIDCount && itemDef(id).name[0] != '\0'; }

// ---------------------------------------------------------------------------
// ItemStack behavior
// ---------------------------------------------------------------------------
int ItemStack::maxStack() const {
    const ItemDef& d = itemDef(id);
    if (isDamageable()) return 1;
    switch (id) {
        case Sign: case Egg: case Snowball: case EnderPearl:
            return 16;
        case Bed: case Cake: case Bucket: case WaterBucket: case LavaBucket:
        case MilkBucket: case WoodenDoorItem: case IronDoorItem: case Boat:
        case Minecart: case Saddle: case MushroomStew: case Bow:
        case FishingRod: case FlintAndSteel: case Shears: case ChestMinecart:
        case FurnaceMinecart: case TntMinecart: case HopperMinecart:
            return 1;
        default: return d.maxStack;
    }
}

int ItemStack::maxDamage() const { return itemDef(id).durability; }

std::string ItemStack::displayName() const {
    const ItemDef& d = itemDef(id);
    if (id == Dye) {
        static const char* dyeNames[16] = {
            "Ink Sac", "Rose Red", "Cactus Green", "Cocoa Beans",
            "Lapis Lazuli", "Purple Dye", "Cyan Dye", "Light Gray Dye",
            "Gray Dye", "Pink Dye", "Lime Dye", "Dandelion Yellow",
            "Light Blue Dye", "Magenta Dye", "Orange Dye", "Bone Meal"};
        return dyeNames[meta & 15];
    }
    if (id == Coal) return (meta & 1) ? "Charcoal" : "Coal";
    if (id == Fish) {
        static const char* names[4] = {"Raw Fish", "Raw Salmon", "Clownfish", "Pufferfish"};
        return names[meta & 3];
    }
    if (id == CookedFish) return (meta & 1) ? "Cooked Salmon" : "Cooked Fish";
    if (id == SpawnEgg) return std::string("Spawn ") + d.displayName;
    // Blocks with variants: decorate a few common ones.
    if (blockIdForItem(id) != 0) {
        if (id == ItemID::Planks) {
            static const char* n[6] = {"Oak", "Spruce", "Birch", "Jungle", "Acacia", "Dark Oak"};
            return std::string(n[std::min<int>(5, meta & 7)]) + " Wood Planks";
        }
        if (id == ItemID::StoneSlab) {
            static const char* n[8] = {"Stone", "Sandstone", "Wooden", "Cobblestone",
                                       "Bricks", "Stone Bricks", "Nether Brick", "Quartz"};
            return std::string(n[std::min<int>(7, meta & 7)]) + " Slab";
        }
        if (id == ItemID::Wool) {
            static const char* n[16] = {"White", "Orange", "Magenta", "Light Blue",
                                        "Yellow", "Lime", "Pink", "Gray", "Light Gray",
                                        "Cyan", "Purple", "Blue", "Brown", "Green",
                                        "Red", "Black"};
            return std::string(n[meta & 15]) + " Wool";
        }
    }
    return d.displayName;
}

uint16_t blockIdForItem(uint16_t itemId) {
    const ItemDef& d = itemDef(itemId);
    return d.blockId;
}

// ---------------------------------------------------------------------------
// Fuel values (1.7 furnace ticks)
// ---------------------------------------------------------------------------
int itemFuelTicks(uint16_t id, uint16_t meta) {
    switch (id) {
        case LavaBucket: return 20000;
        case CoalBlock: return 16000;
        case BlazeRod: return 2400;
        case Coal: return 1600;
        case Boat: return 400;
        case Log: case Log2: return 300;
        case Planks: return 300;
        case WoodenSlab: return 150;
        case CraftingTable: case Bookshelf: case Chest: case TrappedChest:
        case Jukebox: case Noteblock: return 300;
        case OakStairs: case SpruceStairs: case BirchStairs: case JungleStairs:
        case AcaciaStairs: case DarkOakStairs: return 150;
        case Fence: case FenceGate: return 300;
        case Ladder: return 300;
        case WoodenDoorItem: return 300;
        case Trapdoor: return 300;
        case WoodenButton: return 5;
        case WoodenPickaxe: case WoodenAxe: case WoodenShovel: case WoodenHoe:
        case WoodenSword: return 200;
        case Bowl: return 100;
        case Stick: return 100;
        case Sapling: return 100;
                case DaylightSensor: return 300;
        case HayBlock: return 0; // not a fuel in 1.7
        default:
            (void)meta;
            return 0;
    }
}

// ---------------------------------------------------------------------------
// Inventory icon tiles
// ---------------------------------------------------------------------------
static const char* kDyeTiles[16] = {
    "dye_powder_black", "dye_powder_red", "dye_powder_green", "dye_powder_brown",
    "dye_powder_blue", "dye_powder_purple", "dye_powder_cyan", "dye_powder_silver",
    "dye_powder_gray", "dye_powder_pink", "dye_powder_lime", "dye_powder_yellow",
    "dye_powder_light_blue", "dye_powder_magenta", "dye_powder_orange",
    "dye_powder_white"};

std::string itemTile(uint16_t id, uint16_t meta) {
    std::call_once(g_initOnce, initItems);
    const ItemDef& d = itemDef(id);
    if (d.blockId != 0) {
        // Blocks: use a side face (full 3D icon is rendered in the UI).
        return blockTile(d.blockId, (uint8_t)meta, 2);
    }
    char buf[64];
    switch (id) {
        case Coal: return (meta & 1) ? "charcoal" : "coal";
        case Dye: return kDyeTiles[meta & 15];
        case Fish: {
            switch (meta & 3) {
                case 1: return "fish_salmon_raw";
                case 2: return "fish_clownfish_raw";
                case 3: return "fish_pufferfish_raw";
                default: return "fish_raw";
            }
        }
        case CookedFish: return (meta & 1) ? "fish_salmon_cooked" : "fish_cooked";
        case WoodenDoorItem: return "door_wood";
        case IronDoorItem: return "door_iron";
        case Bucket: return "bucket_empty";
        case WaterBucket: return "bucket_water";
        case LavaBucket: return "bucket_lava";
        case MilkBucket: return "bucket_milk";
        case Redstone: return "redstone_dust";
        case WheatSeeds: return "seeds_wheat";
        case PumpkinSeeds: return "seeds_pumpkin";
        case MelonSeeds: return "seeds_melon";
        case Bow: return "bow_standby";
        case FishingRod: return "fishing_rod_uncast";
        case Book: return "book_normal";
        case GoldenApple: return (meta & 1) ? "apple_golden" : "apple_golden";
        case Egg: return "egg";
        case FlintAndSteel: return "flint_and_steel";
        case MushroomStew: return "mushroom_stew";
        case Minecart: return "minecart_normal";
        case Reeds: return "reeds";
        case Clock: return "clock";
        case Compass: return "compass";
        case SpawnEgg: return "spawn_egg";
        case NetherWart: return "nether_wart";
        case GlassBottle: return "potion_bottle_empty";
        case Cake: return "cake";
        case Bed: return "bed";
        case Lead: return "lead";
        case NameTag: return "name_tag";
        case Shears: return "shears";
        default: break;
    }
    // Tools / armor: "<material>_<kind>"
    if (d.tool != ToolType::None || d.armorSlot >= 0 || (id >= WoodenHoe && id <= GoldenHoe)) {
        static const char* mat[5] = {"wood", "stone", "iron", "diamond", "gold"};
        const char* m = (d.tier >= 0 && d.tier < 5) ? mat[d.tier] : "iron";
        if (id == Shears) return "shears";
        switch (d.tool) {
            case ToolType::Sword: std::snprintf(buf, sizeof(buf), "%s_sword", m); return buf;
            case ToolType::Pickaxe: std::snprintf(buf, sizeof(buf), "%s_pickaxe", m); return buf;
            case ToolType::Axe: std::snprintf(buf, sizeof(buf), "%s_axe", m); return buf;
            case ToolType::Shovel: std::snprintf(buf, sizeof(buf), "%s_shovel", m); return buf;
            default: break;
        }
        if (d.armorSlot >= 0) {
            static const char* armorMat[5] = {"leather", "chainmail", "iron", "diamond", "golden"};
            static const char* part[4] = {"helmet", "chestplate", "leggings", "boots"};
            int mi = 2;
            if (id >= LeatherHelmet && id <= LeatherBoots) mi = 0;
            else if (id >= ChainHelmet && id <= ChainBoots) mi = 1;
            else if (id >= IronHelmet && id <= IronBoots) mi = 2;
            else if (id >= DiamondHelmet && id <= DiamondBoots) mi = 3;
            else if (id >= GoldenHelmet && id <= GoldenBoots) mi = 4;
            if (mi == 0 && d.armorSlot == 0) { std::snprintf(buf, sizeof(buf), "leather_helmet"); return buf; }
            if (mi == 0 && d.armorSlot == 1) { std::snprintf(buf, sizeof(buf), "leather_chestplate"); return buf; }
            if (mi == 0 && d.armorSlot == 2) { std::snprintf(buf, sizeof(buf), "leather_leggings"); return buf; }
            if (mi == 0 && d.armorSlot == 3) { std::snprintf(buf, sizeof(buf), "leather_boots"); return buf; }
            std::snprintf(buf, sizeof(buf), "%s_%s", armorMat[mi], part[d.armorSlot]);
            return buf;
        }
        if (id >= WoodenHoe && id <= GoldenHoe) {
            std::snprintf(buf, sizeof(buf), "%s_hoe", m);
            return buf;
        }
    }
    // Simple named icons.
    if (d.name && d.name[0]) return d.name;
    return "stone";
}

} // namespace vox
