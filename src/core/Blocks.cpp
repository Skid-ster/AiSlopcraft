#include "Blocks.h"
#include "Items.h"
#include "JavaRandom.h"
#include <cstdio>
#include <cstring>
#include <mutex>

namespace vox {

using namespace BlockID;

// ---------------------------------------------------------------------------
// Registry table
// ---------------------------------------------------------------------------
static BlockDef g_defs[BlockID::BlockIDCount];
static std::once_flag g_initOnce;

static BlockDef& B(uint16_t id) { return g_defs[id]; }

static void def(uint16_t id, const char* name, const char* display,
                float hardness, float resistance) {
    BlockDef& d = B(id);
    d.id = id; d.name = name; d.displayName = display;
    d.hardness = hardness; d.resistance = resistance;
}

// Dye-color names in Damage/wool meta order (1.7).
static const char* kColorNames[16] = {
    "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink",
    "gray", "silver", "cyan", "purple", "blue", "brown", "green", "red",
    "black"};

static void initRegistry() {
    for (int i = 0; i < BlockID::BlockIDCount; ++i) {
        BlockDef& d = g_defs[i];
        d = BlockDef{};
        d.id = (uint16_t)i;
    }

    // -- basics -------------------------------------------------------------
    def(Air, "air", "Air", 0, 0);
    {
        BlockDef& d = B(Air);
        d.air = true; d.solid = false; d.fullCubeOpaque = false;
        d.lightOpacity = 0; d.layer = RenderLayer::Invisible;
        d.shape = BlockShape::InvisibleShape; d.slipperiness = 1.0f;
    }
    def(Stone, "stone", "Stone", 1.5f, 30);
    def(Grass, "grass", "Grass Block", 0.6f, 3);
    def(Dirt, "dirt", "Dirt", 0.5f, 2.5f);
    def(Cobblestone, "cobblestone", "Cobblestone", 2.0f, 30);
    def(Planks, "planks", "Wood Planks", 2.0f, 15);
    def(Sapling, "sapling", "Sapling", 0, 0);
    def(Bedrock, "bedrock", "Bedrock", -1, 18000000);
    def(FlowingWater, "flowing_water", "Flowing Water", 100, 500);
    def(Water, "water", "Water", 100, 500);
    def(FlowingLava, "flowing_lava", "Flowing Lava", 100, 500);
    def(Lava, "lava", "Lava", 100, 500);
    def(Sand, "sand", "Sand", 0.5f, 2.5f);
    def(Gravel, "gravel", "Gravel", 0.6f, 3);
    def(GoldOre, "gold_ore", "Gold Ore", 3, 15);
    def(IronOre, "iron_ore", "Iron Ore", 3, 15);
    def(CoalOre, "coal_ore", "Coal Ore", 3, 15);
    def(Log, "log", "Wood", 2, 10);
    def(Leaves, "leaves", "Leaves", 0.2f, 1);
    def(Sponge, "sponge", "Sponge", 0.6f, 3);
    def(Glass, "glass", "Glass", 0.3f, 1.5f);
    def(LapisOre, "lapis_ore", "Lapis Lazuli Ore", 3, 15);
    def(LapisBlock, "lapis_block", "Lapis Lazuli Block", 3, 15);
    def(Dispenser, "dispenser", "Dispenser", 3.5f, 17.5f);
    def(Sandstone, "sandstone", "Sandstone", 0.8f, 4);
    def(Noteblock, "noteblock", "Note Block", 0.8f, 4);
    def(Bed, "bed", "Bed", 0.2f, 1);
    def(GoldenRail, "golden_rail", "Powered Rail", 0.7f, 3.5f);
    def(DetectorRail, "detector_rail", "Detector Rail", 0.7f, 3.5f);
    def(StickyPiston, "sticky_piston", "Sticky Piston", 0.5f, 2.5f);
    def(Web, "web", "Cobweb", 4, 20);
    def(Tallgrass, "tallgrass", "Grass", 0, 0);
    def(Deadbush, "deadbush", "Dead Bush", 0, 0);
    def(Piston, "piston", "Piston", 0.5f, 2.5f);
    def(PistonHead, "piston_head", "Piston Head", 0.5f, 2.5f);
    def(Wool, "wool", "Wool", 0.8f, 4);
    def(YellowFlower, "yellow_flower", "Dandelion", 0, 0);
    def(RedFlower, "red_flower", "Flower", 0, 0);
    def(BrownMushroom, "brown_mushroom", "Mushroom", 0, 0);
    def(RedMushroom, "red_mushroom", "Mushroom", 0, 0);
    def(GoldBlock, "gold_block", "Block of Gold", 3, 30);
    def(IronBlock, "iron_block", "Block of Iron", 5, 30);
    def(DoubleStoneSlab, "double_stone_slab", "Double Slab", 2, 30);
    def(StoneSlab, "stone_slab", "Slab", 2, 30);
    def(BrickBlock, "brick_block", "Bricks", 2, 30);
    def(TNT, "tnt", "TNT", 0, 0);
    def(Bookshelf, "bookshelf", "Bookshelf", 1.5f, 7.5f);
    def(MossyCobblestone, "mossy_cobblestone", "Moss Stone", 2, 30);
    def(Obsidian, "obsidian", "Obsidian", 50, 6000);
    def(Torch, "torch", "Torch", 0, 0);
    def(Fire, "fire", "Fire", 0, 0);
    def(MobSpawner, "mob_spawner", "Monster Spawner", 5, 25);
    def(OakStairs, "oak_stairs", "Oak Stairs", 2, 15);
    def(Chest, "chest", "Chest", 2.5f, 12.5f);
    def(RedstoneWire, "redstone_wire", "Redstone Wire", 0, 0);
    def(DiamondOre, "diamond_ore", "Diamond Ore", 3, 15);
    def(DiamondBlock, "diamond_block", "Block of Diamond", 5, 30);
    def(CraftingTable, "crafting_table", "Crafting Table", 2.5f, 12.5f);
    def(Wheat, "wheat", "Wheat", 0, 0);
    def(Farmland, "farmland", "Farmland", 0.6f, 3);
    def(Furnace, "furnace", "Furnace", 3.5f, 17.5f);
    def(LitFurnace, "lit_furnace", "Furnace", 3.5f, 17.5f);
    def(StandingSign, "standing_sign", "Sign", 1, 5);
    def(WoodenDoor, "wooden_door", "Wooden Door", 3, 15);
    def(Ladder, "ladder", "Ladder", 0.4f, 1.5f);
    def(Rail, "rail", "rail", 0.7f, 3.5f);
    def(StoneStairs, "stone_stairs", "Cobblestone Stairs", 2, 30);
    def(WallSign, "wall_sign", "Sign", 1, 5);
    def(Lever, "lever", "Lever", 0.5f, 2.5f);
    def(StonePressurePlate, "stone_pressure_plate", "Stone Pressure Plate", 0.5f, 2.5f);
    def(IronDoor, "iron_door", "Iron Door", 5, 25);
    def(WoodenPressurePlate, "wooden_pressure_plate", "Wooden Pressure Plate", 0.5f, 2.5f);
    def(RedstoneOre, "redstone_ore", "Redstone Ore", 3, 15);
    def(LitRedstoneOre, "lit_redstone_ore", "Redstone Ore", 3, 15);
    def(UnlitRedstoneTorch, "unlit_redstone_torch", "Redstone Torch", 0, 0);
    def(RedstoneTorch, "redstone_torch", "Redstone Torch", 0, 0);
    def(StoneButton, "stone_button", "Button", 0.5f, 2.5f);
    def(SnowLayer, "snow_layer", "Snow", 0.1f, 0.5f);
    def(Ice, "ice", "Ice", 0.5f, 2.5f);
    def(Snow, "snow", "Snow Block", 0.2f, 1);
    def(Cactus, "cactus", "Cactus", 0.4f, 4);
    def(Clay, "clay", "Clay", 0.6f, 3);
    def(Reeds, "reeds", "Sugar Canes", 0, 0);
    def(Jukebox, "jukebox", "Jukebox", 0.8f, 4);
    def(Fence, "fence", "Fence", 2, 15);
    def(Pumpkin, "pumpkin", "Pumpkin", 1, 5);
    def(Netherrack, "netherrack", "Netherrack", 0.4f, 2);
    def(SoulSand, "soul_sand", "Soul Sand", 0.5f, 2.5f);
    def(Glowstone, "glowstone", "Glowstone", 0.3f, 1.5f);
    def(Portal, "portal", "Portal", -1, 0);
    def(LitPumpkin, "lit_pumpkin", "Jack o'Lantern", 1, 5);
    def(Cake, "cake", "Cake", 0.5f, 2.5f);
    def(UnpoweredRepeater, "unpowered_repeater", "Redstone Repeater", 0, 0);
    def(PoweredRepeater, "powered_repeater", "Redstone Repeater", 0, 0);
    def(StainedGlass, "stained_glass", "Stained Glass", 0.3f, 1.5f);
    def(Trapdoor, "trapdoor", "Trapdoor", 3, 15);
    def(MonsterEgg, "monster_egg", "Monster Egg", 0.75f, 3.75f);
    def(Stonebrick, "stonebrick", "Stone Bricks", 1.5f, 30);
    def(BrownMushroomBlock, "brown_mushroom_block", "Mushroom", 0.2f, 1);
    def(RedMushroomBlock, "red_mushroom_block", "Mushroom", 0.2f, 1);
    def(IronBars, "iron_bars", "Iron Bars", 5, 30);
    def(GlassPane, "glass_pane", "Glass Pane", 0.3f, 1.5f);
    def(MelonBlock, "melon_block", "Melon", 1, 5);
    def(PumpkinStem, "pumpkin_stem", "Pumpkin Stem", 0, 0);
    def(MelonStem, "melon_stem", "Melon Stem", 0, 0);
    def(Vine, "vine", "Vines", 0.2f, 1);
    def(FenceGate, "fence_gate", "Fence Gate", 2, 15);
    def(BrickStairs, "brick_stairs", "Brick Stairs", 2, 30);
    def(StoneBrickStairs, "stone_brick_stairs", "Stone Brick Stairs", 1.5f, 30);
    def(Mycelium, "mycelium", "Mycelium", 0.6f, 3);
    def(Waterlily, "waterlily", "Lily Pad", 0, 0);
    def(NetherBrick, "nether_brick", "Nether Bricks", 2, 30);
    def(NetherBrickFence, "nether_brick_fence", "Nether Brick Fence", 2, 30);
    def(NetherBrickStairs, "nether_brick_stairs", "Nether Brick Stairs", 2, 30);
    def(NetherWart, "nether_wart", "Nether Wart", 0, 0);
    def(EnchantingTable, "enchanting_table", "Enchantment Table", 5, 6000);
    def(BrewingStand, "brewing_stand", "Brewing Stand", 0.5f, 2.5f);
    def(Cauldron, "cauldron", "Cauldron", 2, 10);
    def(EndPortal, "end_portal", "End Portal", -1, 18000000);
    def(EndPortalFrame, "end_portal_frame", "End Portal Frame", -1, 18000000);
    def(EndStone, "end_stone", "End Stone", 3, 45);
    def(DragonEgg, "dragon_egg", "Dragon Egg", 3, 45);
    def(RedstoneLamp, "redstone_lamp", "Redstone Lamp", 0.3f, 1.5f);
    def(LitRedstoneLamp, "lit_redstone_lamp", "Redstone Lamp", 0.3f, 1.5f);
    def(WoodenDoubleSlab, "wooden_double_slab", "Double Wood Slab", 2, 15);
    def(WoodenSlab, "wooden_slab", "Wood Slab", 2, 15);
    def(Cocoa, "cocoa", "Cocoa", 0.2f, 15);
    def(SandstoneStairs, "sandstone_stairs", "Sandstone Stairs", 0.8f, 4);
    def(EmeraldOre, "emerald_ore", "Emerald Ore", 3, 15);
    def(EnderChest, "ender_chest", "Ender Chest", 22.5f, 3000);
    def(TripwireHook, "tripwire_hook", "Tripwire Hook", 0, 0);
    def(Tripwire, "tripwire", "Tripwire", 0, 0);
    def(EmeraldBlock, "emerald_block", "Block of Emerald", 5, 30);
    def(SpruceStairs, "spruce_stairs", "Spruce Stairs", 2, 15);
    def(BirchStairs, "birch_stairs", "Birch Stairs", 2, 15);
    def(JungleStairs, "jungle_stairs", "Jungle Stairs", 2, 15);
    def(CommandBlock, "command_block", "Command Block", -1, 18000000);
    def(Beacon, "beacon", "Beacon", 3, 15);
    def(CobblestoneWall, "cobblestone_wall", "Cobblestone Wall", 2, 30);
    def(FlowerPot, "flower_pot", "Flower Pot", 0, 0);
    def(Carrots, "carrots", "Carrots", 0, 0);
    def(Potatoes, "potatoes", "Potatoes", 0, 0);
    def(WoodenButton, "wooden_button", "Button", 0.5f, 2.5f);
    def(Skull, "skull", "Head", 1, 5);
    def(Anvil, "anvil", "Anvil", 5, 6000);
    def(TrappedChest, "trapped_chest", "Trapped Chest", 2.5f, 12.5f);
    def(LightWeightedPressurePlate, "light_weighted_pressure_plate",
        "Weighted Pressure Plate (Light)", 0.5f, 2.5f);
    def(HeavyWeightedPressurePlate, "heavy_weighted_pressure_plate",
        "Weighted Pressure Plate (Heavy)", 0.5f, 2.5f);
    def(UnpoweredComparator, "unpowered_comparator", "Redstone Comparator", 0, 0);
    def(PoweredComparator, "powered_comparator", "Redstone Comparator", 0, 0);
    def(DaylightDetector, "daylight_detector", "Daylight Sensor", 0.2f, 1);
    def(RedstoneBlock, "redstone_block", "Block of Redstone", 5, 30);
    def(QuartzOre, "quartz_ore", "Nether Quartz Ore", 3, 15);
    def(Hopper, "hopper", "Hopper", 3, 24);
    def(QuartzBlock, "quartz_block", "Block of Quartz", 0.8f, 4);
    def(QuartzStairs, "quartz_stairs", "Quartz Stairs", 0.8f, 4);
    def(ActivatorRail, "activator_rail", "Activator Rail", 0.7f, 3.5f);
    def(Dropper, "dropper", "Dropper", 3.5f, 17.5f);
    def(StainedHardenedClay, "stained_hardened_clay", "Stained Clay", 1.25f, 21);
    def(StainedGlassPane, "stained_glass_pane", "Stained Glass Pane", 0.3f, 1.5f);
    def(Leaves2, "leaves2", "Leaves", 0.2f, 1);
    def(Log2, "log2", "Wood", 2, 10);
    def(AcaciaStairs, "acacia_stairs", "Acacia Stairs", 2, 15);
    def(DarkOakStairs, "dark_oak_stairs", "Dark Oak Stairs", 2, 15);
    def(HayBlock, "hay_block", "Hay Bale", 0.5f, 2.5f);
    def(Carpet, "carpet", "Carpet", 0.1f, 0.5f);
    def(HardenedClay, "hardened_clay", "Hardened Clay", 1.25f, 21);
    def(CoalBlock, "coal_block", "Block of Coal", 5, 50);
    def(PackedIce, "packed_ice", "Packed Ice", 0.5f, 2.5f);
    def(DoublePlant, "double_plant", "Large Plant", 0, 0);

    // -- pickaxe-harvested stone family -------------------------------------
    auto pick = [&](uint16_t id, int level) {
        B(id).tool = ToolType::Pickaxe; B(id).harvestLevel = level;
    };
    pick(Stone, 0); pick(Cobblestone, 0); pick(Sandstone, 0);
    pick(DoubleStoneSlab, 0); pick(StoneSlab, 0); pick(BrickBlock, 0);
    pick(MossyCobblestone, 0); pick(Obsidian, 3); pick(StoneStairs, 0);
    pick(IronBlock, 0); pick(GoldBlock, 0); pick(DiamondBlock, 0);
    pick(LapisBlock, 0); pick(EmeraldBlock, 0); pick(RedstoneBlock, 0);
    pick(Netherrack, 0); pick(NetherBrick, 0); pick(NetherBrickFence, 0);
    pick(NetherBrickStairs, 0); pick(Stonebrick, 0); pick(StoneBrickStairs, 0);
    pick(CoalBlock, 0); pick(HardenedClay, 0); pick(StainedHardenedClay, 0);
    pick(QuartzBlock, 0); pick(QuartzStairs, 0); pick(SandstoneStairs, 0);
    pick(BrickStairs, 0); pick(EndStone, 0); pick(MonsterEgg, 0);
    pick(Dispenser, 0); pick(Dropper, 0); pick(Furnace, 0); pick(LitFurnace, 0);
    pick(CobblestoneWall, 0); pick(Anvil, 0); pick(Hopper, 0);
    pick(EnderChest, 0); pick(Beacon, 0); pick(Piston, 0); pick(StickyPiston, 0);
    pick(PistonHead, 0); pick(MobSpawner, 0); pick(EnchantingTable, 0);
    pick(Cauldron, 0); pick(BrewingStand, 0); pick(DaylightDetector, 0);
    pick(GoldOre, 2); pick(IronOre, 1); pick(CoalOre, 0); pick(LapisOre, 1);
    pick(DiamondOre, 2); pick(RedstoneOre, 2); pick(LitRedstoneOre, 2);
    pick(EmeraldOre, 2); pick(QuartzOre, 0);

    // -- shovel / axe --------------------------------------------------------
    auto shovel = [&](uint16_t id) { B(id).tool = ToolType::Shovel; };
    shovel(Dirt); shovel(Grass); shovel(Sand); shovel(Gravel); shovel(Clay);
    shovel(SnowLayer); shovel(Snow); shovel(SoulSand); shovel(Mycelium);
    shovel(Farmland);
    auto axe = [&](uint16_t id) { B(id).tool = ToolType::Axe; };
    axe(Planks); axe(Log); axe(Log2); axe(Bookshelf); axe(CraftingTable);
    axe(Chest); axe(TrappedChest); axe(OakStairs); axe(SpruceStairs);
    axe(BirchStairs); axe(JungleStairs); axe(AcaciaStairs);
    axe(DarkOakStairs); axe(WoodenSlab); axe(WoodenDoubleSlab); axe(Fence);
    axe(FenceGate); axe(WoodenDoor); axe(Trapdoor); axe(Ladder); axe(Noteblock);
    axe(Jukebox); axe(Pumpkin); axe(LitPumpkin); axe(MelonBlock);
    axe(WoodenButton); axe(WoodenPressurePlate); axe(Cocoa); axe(Bed);
    axe(Vine); // vines fastest with axe in 1.7

    // -- lighting -------------------------------------------------------------
    B(Torch).lightEmission = 14;
    B(Fire).lightEmission = 15;
    B(Lava).lightEmission = 15;
    B(FlowingLava).lightEmission = 15;
    B(Glowstone).lightEmission = 15;
    B(LitPumpkin).lightEmission = 15;
    B(LitFurnace).lightEmission = 13;
    B(RedstoneTorch).lightEmission = 7;
    B(LitRedstoneLamp).lightEmission = 15;
    B(LitRedstoneOre).lightEmission = 9;
    B(Portal).lightEmission = 11;
    B(EndPortal).lightEmission = 15;
    B(Beacon).lightEmission = 15;
    B(BrownMushroom).lightEmission = 1;
    B(RedMushroom).lightEmission = 1;
    B(BrewingStand).lightEmission = 1;
    B(EnchantingTable).lightEmission = 7;
    B(DragonEgg).lightEmission = 1;

    // -- liquids ----------------------------------------------------------------
    for (uint16_t id : {FlowingWater, Water, FlowingLava, Lava}) {
        BlockDef& d = B(id);
        d.liquid = true; d.solid = false; d.fullCubeOpaque = false;
        d.replaceable = true; d.tickable = true;
        d.layer = RenderLayer::Transparent; d.shape = BlockShape::Liquid;
    }
    B(Water).lightOpacity = 3; B(FlowingWater).lightOpacity = 3;
    B(Lava).lightOpacity = 0; B(FlowingLava).lightOpacity = 0; // lava emits, handled specially
    B(Lava).fullCubeOpaque = true; B(FlowingLava).fullCubeOpaque = true;
    B(Lava).layer = RenderLayer::Opaque; B(FlowingLava).layer = RenderLayer::Opaque;

    // -- glass family ------------------------------------------------------------
    for (uint16_t id : {Glass, StainedGlass}) {
        BlockDef& d = B(id);
        d.fullCubeOpaque = false; d.lightOpacity = 0;
        d.layer = RenderLayer::Transparent;
    }
    B(Ice).fullCubeOpaque = false; B(Ice).lightOpacity = 3;
    B(Ice).layer = RenderLayer::Transparent; B(Ice).slipperiness = 0.98f;
    B(PackedIce).slipperiness = 0.98f;
    for (uint16_t id : {IronBars, GlassPane, StainedGlassPane}) {
        BlockDef& d = B(id);
        d.fullCubeOpaque = false; d.lightOpacity = 0;
        d.layer = RenderLayer::Cutout; d.shape = BlockShape::Pane;
    }
    B(GlassPane).layer = RenderLayer::Transparent;
    B(StainedGlassPane).layer = RenderLayer::Transparent;

    // -- plants ---------------------------------------------------------------------
    auto plant = [&](uint16_t id, BlockShape shape = BlockShape::Cross) {
        BlockDef& d = B(id);
        d.solid = false; d.fullCubeOpaque = false; d.lightOpacity = 0;
        d.layer = RenderLayer::Cutout; d.shape = shape; d.plant = true;
        d.flammable = true; d.fireSpread = 60;
    };
    plant(Sapling); plant(Tallgrass); plant(Deadbush); plant(YellowFlower);
    plant(RedFlower); plant(BrownMushroom); plant(RedMushroom); plant(Web);
    plant(Reeds); plant(NetherWart);
    B(Web).flammable = false; B(Web).solid = true; B(Web).layer = RenderLayer::Cutout;
    B(Web).shape = BlockShape::Cross; B(Web).plant = false; B(Web).slipperiness = 0.25f;
    plant(Wheat, BlockShape::Crop);
    plant(Carrots, BlockShape::Crop);
    plant(Potatoes, BlockShape::Crop);
    plant(PumpkinStem, BlockShape::Stem);
    plant(MelonStem, BlockShape::Stem);
    plant(DoublePlant, BlockShape::DoublePlant);
    plant(Vine, BlockShape::Vine);
    plant(Waterlily, BlockShape::LilyPad);
    plant(Portal, BlockShape::Portal);
    B(Portal).solid = false; B(Portal).layer = RenderLayer::Transparent;
    plant(Fire, BlockShape::Fire);
    B(Fire).flammable = false; B(Fire).tickable = true; B(Fire).plant = false;
    B(Fire).layer = RenderLayer::Cutout;
    B(Tallgrass).tinted = true;
    B(Vine).tinted = true;
    B(Waterlily).tinted = true;
    B(Reeds).tinted = true;
    B(DoublePlant).tinted = true;
    B(PumpkinStem).tinted = true;
    B(MelonStem).tinted = true;
    B(Grass).tinted = true;   // top face + overlay only (mesher handles)
    B(Leaves).tinted = true;
    B(Leaves2).tinted = true;

    // leaves: transparent layer in Fancy, light-blocking
    for (uint16_t id : {Leaves, Leaves2}) {
        BlockDef& d = B(id);
        d.fullCubeOpaque = true; // 1.7 leaves block light completely
        d.lightOpacity = 15;
        d.layer = RenderLayer::Transparent; // fancy graphics: blended
        d.flammable = true; d.fireSpread = 30;
    }

    // torches / rails / attachments ----------------------------------------------------
    auto attach = [&](uint16_t id, BlockShape shape) {
        BlockDef& d = B(id);
        d.solid = false; d.fullCubeOpaque = false; d.lightOpacity = 0;
        d.layer = RenderLayer::Cutout; d.shape = shape;
    };
    attach(Torch, BlockShape::Torch);
    attach(RedstoneTorch, BlockShape::Torch);
    attach(UnlitRedstoneTorch, BlockShape::Torch);
    attach(Lever, BlockShape::Lever);
    attach(StoneButton, BlockShape::Button);
    attach(WoodenButton, BlockShape::Button);
    attach(StonePressurePlate, BlockShape::PressurePlate);
    attach(WoodenPressurePlate, BlockShape::PressurePlate);
    attach(LightWeightedPressurePlate, BlockShape::PressurePlate);
    attach(HeavyWeightedPressurePlate, BlockShape::PressurePlate);
    attach(Rail, BlockShape::Rails);
    attach(GoldenRail, BlockShape::Rails);
    attach(DetectorRail, BlockShape::Rails);
    attach(ActivatorRail, BlockShape::Rails);
    attach(TripwireHook, BlockShape::Button);
    attach(Tripwire, BlockShape::InvisibleShape);
    attach(RedstoneWire, BlockShape::InvisibleShape);
    attach(Ladder, BlockShape::Ladder);
    attach(SnowLayer, BlockShape::SnowLayer);
    attach(Carpet, BlockShape::Carpet);
    attach(FlowerPot, BlockShape::Cross);
    attach(Skull, BlockShape::Cross);
    attach(Cake, BlockShape::Cake);
    B(Cake).solid = true; B(Cake).lightOpacity = 0; B(Cake).fullCubeOpaque = false;
    attach(Bed, BlockShape::Bed);
    B(Bed).solid = true; B(Bed).fullCubeOpaque = false; B(Bed).lightOpacity = 0;

    // doors & trapdoors
    {
        BlockDef& d = B(WoodenDoor);
        d.solid = true; d.fullCubeOpaque = false; d.lightOpacity = 0;
        d.layer = RenderLayer::Cutout; d.shape = BlockShape::Door;
    }
    B(IronDoor) = B(WoodenDoor); B(IronDoor).id = IronDoor;
    B(IronDoor).name = "iron_door"; B(IronDoor).hardness = 5;
    B(IronDoor).resistance = 25;
    {
        BlockDef& d = B(Trapdoor);
        d.solid = true; d.fullCubeOpaque = false; d.lightOpacity = 0;
        d.layer = RenderLayer::Cutout; d.shape = BlockShape::Trapdoor;
    }

    // slabs / stairs ----------------------------------------------------------------------
    auto slab = [&](uint16_t id) {
        BlockDef& d = B(id);
        d.shape = BlockShape::Slab; d.fullCubeOpaque = false;
        d.lightOpacity = 15; // 1.7 slabs block light like full cubes
    };
    slab(StoneSlab); slab(WoodenSlab);
    B(DoubleStoneSlab).shape = BlockShape::Cube;
    B(WoodenDoubleSlab).shape = BlockShape::Cube;
    auto stairs = [&](uint16_t id) {
        BlockDef& d = B(id);
        d.shape = BlockShape::Stairs; d.fullCubeOpaque = false; d.lightOpacity = 15;
    };
    stairs(OakStairs); stairs(StoneStairs); stairs(BrickStairs);
    stairs(StoneBrickStairs); stairs(NetherBrickStairs); stairs(SandstoneStairs);
    stairs(SpruceStairs); stairs(BirchStairs); stairs(JungleStairs);
    stairs(QuartzStairs); stairs(AcaciaStairs); stairs(DarkOakStairs);

    // fences / walls -------------------------------------------------------------------------
    for (uint16_t id : {Fence, NetherBrickFence, FenceGate, CobblestoneWall}) {
        BlockDef& d = B(id);
        d.shape = (id == CobblestoneWall) ? BlockShape::Wall : BlockShape::Fence;
        d.fullCubeOpaque = false; d.lightOpacity = 0;
    }
    B(FenceGate).shape = BlockShape::Fence;

    // misc special cubes -----------------------------------------------------------------------
    B(SnowLayer).solid = false; B(SnowLayer).lightOpacity = 0;
    B(Carpet).solid = false; B(Carpet).lightOpacity = 0;
    B(Ladder).solid = false;
    B(Cactus).shape = BlockShape::Cactus; B(Cactus).fullCubeOpaque = false;
    B(Cactus).lightOpacity = 0; B(Cactus).layer = RenderLayer::Cutout;
    B(Farmland).shape = BlockShape::Farmland; B(Farmland).fullCubeOpaque = false;
    B(Farmland).lightOpacity = 15;
    B(HayBlock).shape = BlockShape::HayAxis;
    B(QuartzBlock).metaVariants = 4;
    B(Planks).metaVariants = 6;
    B(Log).metaVariants = 16; B(Log2).metaVariants = 16;
    B(Leaves).metaVariants = 4; B(Leaves2).metaVariants = 4;
    B(Sapling).metaVariants = 6;
    B(Wool).metaVariants = 16;
    B(StainedGlass).metaVariants = 16;
    B(StainedGlassPane).metaVariants = 16;
    B(StainedHardenedClay).metaVariants = 16;
    B(Carpet).metaVariants = 16;
    B(Sand).metaVariants = 2;
    B(Dirt).metaVariants = 2;
    B(Sandstone).metaVariants = 3;
    B(Stonebrick).metaVariants = 4;
    B(MonsterEgg).metaVariants = 3;
    B(DoublePlant).metaVariants = 16;
    B(RedFlower).metaVariants = 9;
    B(Tallgrass).metaVariants = 3;
    B(StoneSlab).metaVariants = 8;
    B(DoubleStoneSlab).metaVariants = 8;
    B(WoodenSlab).metaVariants = 8;
    B(WoodenDoubleSlab).metaVariants = 8;
    B(CobblestoneWall).metaVariants = 2;
    B(SnowLayer).metaVariants = 8;
    B(Anvil).metaVariants = 12;

    // gravity blocks ------------------------------------------------------------------------------
    B(Sand).gravity = true; B(Gravel).gravity = true;
    B(Anvil).gravity = true;
    B(Anvil).shape = BlockShape::Cube;

    // tickable blocks -------------------------------------------------------------------------------
    for (uint16_t id : {Grass, Mycelium, Farmland, Wheat, Carrots, Potatoes,
                        PumpkinStem, MelonStem, Sapling, Cocoa, NetherWart,
                        Ice, SnowLayer, Cactus, Reeds, Fire, TNT})
        B(id).tickable = true;
    B(Grass).flammable = false;

    // flammable wood family ---------------------------------------------------------------------------
    for (uint16_t id : {Planks, Log, Log2, WoodenSlab, WoodenDoubleSlab, Fence,
                        FenceGate, OakStairs, SpruceStairs, BirchStairs,
                        JungleStairs, AcaciaStairs, DarkOakStairs, Bookshelf,
                        CraftingTable, Chest, TrappedChest, WoodenDoor, Trapdoor,
                        Ladder, Vine, Wool, Carpet, DoublePlant, CoalBlock}) {
        B(id).flammable = true;
        if (B(id).fireSpread == 0) B(id).fireSpread = 5;
    }
    B(CoalBlock).fireSpread = 1;

}

const BlockDef& blockDef(uint16_t id) {
    std::call_once(g_initOnce, initRegistry);
    if (id >= BlockID::BlockIDCount) return g_defs[0];
    return g_defs[id];
}

const char* blockName(uint16_t id) { return blockDef(id).name; }

// ---------------------------------------------------------------------------
// Texture tile names (1.7 resource-pack naming, original art)
// ---------------------------------------------------------------------------
static std::string colorTile(const char* prefix, uint8_t meta) {
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%s%s", prefix, kColorNames[meta & 15]);
    return buf;
}

static const char* plankTile(uint8_t meta) {
    switch (meta & 7) {
        case 1: return "planks_spruce";
        case 2: return "planks_birch";
        case 3: return "planks_jungle";
        case 4: return "planks_acacia";
        case 5: return "planks_big_oak";
        default: return "planks_oak";
    }
}

static const char* logSideTile(uint16_t id, uint8_t meta) {
    if (id == Log2) return (meta & 1) ? "log_big_oak" : "log_acacia";
    switch (meta & 3) {
        case 1: return "log_spruce";
        case 2: return "log_birch";
        case 3: return "log_jungle";
        default: return "log_oak";
    }
}
static const char* logTopTile(uint16_t id, uint8_t meta) {
    if (id == Log2) return (meta & 1) ? "log_big_oak_top" : "log_acacia_top";
    switch (meta & 3) {
        case 1: return "log_spruce_top";
        case 2: return "log_birch_top";
        case 3: return "log_jungle_top";
        default: return "log_oak_top";
    }
}
static const char* leafTile(uint16_t id, uint8_t meta) {
    if (id == Leaves2) return (meta & 1) ? "leaves_big_oak" : "leaves_acacia";
    switch (meta & 3) {
        case 1: return "leaves_spruce";
        case 2: return "leaves_birch";
        case 3: return "leaves_jungle";
        default: return "leaves_oak";
    }
}
static const char* saplingTile(uint8_t meta) {
    switch (meta & 7) {
        case 1: return "sapling_spruce";
        case 2: return "sapling_birch";
        case 3: return "sapling_jungle";
        case 4: return "sapling_acacia";
        case 5: return "sapling_roofed_oak";
        default: return "sapling_oak";
    }
}
static const char* flowerTile(uint8_t meta) {
    switch (meta & 15) {
        case 0: return "flower_poppy";
        case 1: return "flower_blue_orchid";
        case 2: return "flower_allium";
        case 3: return "flower_houstonia";
        case 4: return "flower_tulip_red";
        case 5: return "flower_tulip_orange";
        case 6: return "flower_tulip_white";
        case 7: return "flower_tulip_pink";
        case 8: return "flower_oxeye_daisy";
        default: return "flower_poppy";
    }
}
static const char* tallgrassTile(uint8_t meta) {
    switch (meta & 3) {
        case 0: return "deadbush"; // shrub reuses deadbush art in 1.7
        case 1: return "tallgrass";
        case 2: return "fern";
        default: return "tallgrass";
    }
}
// returns bottom/top texture for double plants; half = 0 bottom, 1 top
static const char* doublePlantTile(uint8_t meta, int half) {
    switch (meta & 7) {
        case 0: return half ? "double_plant_sunflower_top" : "double_plant_sunflower_bottom";
        case 1: return half ? "double_plant_syringa_top" : "double_plant_syringa_bottom";
        case 2: return half ? "double_plant_grass_top" : "double_plant_grass_bottom";
        case 3: return half ? "double_plant_fern_top" : "double_plant_fern_bottom";
        case 4: return half ? "double_plant_rose_top" : "double_plant_rose_bottom";
        case 5: return half ? "double_plant_paeonia_top" : "double_plant_paeonia_bottom";
        default: return half ? "double_plant_grass_top" : "double_plant_grass_bottom";
    }
}
static const char* slabTile(uint16_t id, uint8_t meta, int face) {
    // face: 0 bottom, 1 top, 2+ side
    bool top = face == 1, bottom = face == 0;
    if (id == WoodenSlab || id == WoodenDoubleSlab) return plankTile(meta);
    switch (meta & 7) {
        case 0: return top ? "stone_slab_top" : (bottom ? "stone_slab_top" : "stone_slab_side");
        case 1: return top || bottom ? "sandstone_top" : "sandstone_normal";
        case 2: return "planks_oak";
        case 3: return "cobblestone";
        case 4: return "brick";
        case 5: return "stonebrick";
        case 6: return "nether_brick";
        case 7: return "quartz_block_side";
        default: return "stone_slab_top";
    }
}
static const char* stairsMaterial(uint16_t id, uint8_t meta, int face) {
    switch (id) {
        case OakStairs: return "planks_oak";
        case SpruceStairs: return "planks_spruce";
        case BirchStairs: return "planks_birch";
        case JungleStairs: return "planks_jungle";
        case AcaciaStairs: return "planks_acacia";
        case DarkOakStairs: return "planks_big_oak";
        case StoneStairs: return "cobblestone";
        case BrickStairs: return "brick";
        case StoneBrickStairs: return "stonebrick";
        case NetherBrickStairs: return "nether_brick";
        case QuartzStairs:
            if (face == 1) return "quartz_block_top";
            if (face == 0) return "quartz_block_bottom";
            return "quartz_block_side";
        case SandstoneStairs:
            if (face == 1) return "sandstone_top";
            if (face == 0) return "sandstone_bottom";
            return "sandstone_normal";
        default: return "cobblestone";
    }
    (void)meta;
}

std::string blockTile(uint16_t id, uint8_t meta, int face, int /*x*/, int /*y*/, int /*z*/) {
    std::call_once(g_initOnce, initRegistry);
    char buf[80];
    switch (id) {
        case Grass:
            if (face == 1) return "grass_top";
            if (face == 0) return "dirt";
            return "grass_side";
        case Dirt:
            if ((meta & 3) == 2) {
                if (face == 1) return "dirt_podzol_top";
                if (face == 0) return "dirt";
                return "dirt_podzol_side";
            }
            return (meta & 3) == 1 ? "dirt_coarse" : "dirt";
        case Planks: return plankTile(meta);
        case Sapling: return saplingTile(meta);
        case Log: case Log2: {
            int axis = (meta >> 2) & 3;
            if (axis == 3) return logSideTile(id, meta);
            bool vertical = axis == 0;
            bool xAligned = axis == 1;
            bool zAligned = axis == 2;
            if ((vertical && (face == 0 || face == 1)) ||
                (xAligned && (face == 4 || face == 5)) ||
                (zAligned && (face == 2 || face == 3)))
                return logTopTile(id, meta);
            return logSideTile(id, meta);
        }
        case Leaves: case Leaves2: return leafTile(id, meta);
        case Water: case FlowingWater:
            return (face == 1) ? "water_still" : "water_flow";
        case Lava: case FlowingLava:
            return (face == 1) ? "lava_still" : "lava_flow";
        case Sand: return (meta & 1) ? "red_sand" : "sand";
        case Wool: case Carpet: return colorTile("wool_colored_", meta);
        case StainedGlass: return colorTile("glass_", meta);
        case StainedGlassPane: return colorTile("glass_", meta);
        case StainedHardenedClay: return colorTile("hardened_clay_stained_", meta);
        case Sandstone:
            if (face == 1) return "sandstone_top";
            if (face == 0) return "sandstone_bottom";
            switch (meta & 3) {
                case 1: return "sandstone_carved";
                case 2: return "sandstone_smooth";
                default: return "sandstone_normal";
            }
        case Stonebrick:
            switch (meta & 3) {
                case 1: return "stonebrick_mossy";
                case 2: return "stonebrick_cracked";
                case 3: return "stonebrick_carved";
                default: return "stonebrick";
            }
        case MonsterEgg:
            switch (meta & 3) {
                case 1: return "cobblestone";
                case 2: return "stonebrick";
                default: return "stone";
            }
        case DoubleStoneSlab: case StoneSlab:
        case WoodenDoubleSlab: case WoodenSlab:
            return slabTile(id, meta, face);
        case OakStairs: case SpruceStairs: case BirchStairs: case JungleStairs:
        case AcaciaStairs: case DarkOakStairs: case StoneStairs:
        case BrickStairs: case StoneBrickStairs: case NetherBrickStairs:
        case SandstoneStairs: case QuartzStairs:
            return stairsMaterial(id, meta, face);
        case Torch: return "torch_on";
        case RedstoneTorch: return "redstone_torch_on";
        case UnlitRedstoneTorch: return "redstone_torch_off";
        case Fire: return "fire_layer_0";
        case CraftingTable:
            if (face == 1) return "crafting_table_top";
            if (face == 0) return "planks_oak";
            return (face == 2 || face == 4) ? "crafting_table_side" : "crafting_table_front";
        case Furnace: case LitFurnace:
            if (face == 1) return "furnace_top";
            if (face == 0) return "furnace_top";
            if (face >= 2) {
                bool front = (meta & 7) == (uint8_t)(face);
                if (front) return id == LitFurnace ? "furnace_front_on" : "furnace_front_off";
                return "furnace_side";
            }
            return "furnace_side";
        case Chest: case TrappedChest:
            if (face == 1) return "chest_top";
            if (face == 0) return "chest_top";
            return (meta >= 2 && meta <= 5 && (int)meta == face)
                       ? (id == TrappedChest ? "trapped_chest_front" : "chest_front")
                       : (id == TrappedChest ? "trapped_chest_side" : "chest_side");
        case Wheat: {
            int stage = meta & 7;
            std::snprintf(buf, sizeof(buf), "wheat_stage_%d", stage);
            return buf;
        }
        case Carrots: {
            int stage = std::min(3, (meta & 7) / 2);
            std::snprintf(buf, sizeof(buf), "carrots_stage_%d", stage);
            return buf;
        }
        case Potatoes: {
            int stage = std::min(3, (meta & 7) / 2);
            std::snprintf(buf, sizeof(buf), "potatoes_stage_%d", stage);
            return buf;
        }
        case Farmland:
            if (face == 1) return (meta & 7) ? "farmland_wet" : "farmland_dry";
            return "dirt";
        case Pumpkin: case LitPumpkin:
            if (face == 1) return "pumpkin_top";
            if (face == 0) return "pumpkin_top";
            if (meta >= 2 && meta <= 5 && (int)meta == face)
                return id == LitPumpkin ? "pumpkin_face_on" : "pumpkin_face_off";
            return "pumpkin_side";
        case MelonBlock:
            return face == 1 || face == 0 ? "melon_top" : "melon_side";
        case NetherWart: {
            int stage = std::min(2, meta & 3);
            std::snprintf(buf, sizeof(buf), "nether_wart_stage_%d", stage);
            return buf;
        }
        case Web: return "web";
        case BrownMushroomBlock: case RedMushroomBlock: {
            const char* skin = id == RedMushroomBlock ? "red" : "brown";
            if (meta == 0) return "mushroom_block_inside";
            if (meta >= 10) return "mushroom_block_stem";
            if (meta >= 1 && meta <= 9 && meta != 5)
                return std::string("mushroom_block_skin_") + skin;
            return "mushroom_block_stem";
        }
        case Vine: return "vine";
        case Waterlily: return "waterlily";
        case Reeds: return "reeds";
        case Cactus:
            if (face == 1) return "cactus_top";
            if (face == 0) return "cactus_bottom";
            return "cactus_side";
        case Mycelium:
            if (face == 1) return "mycelium_top";
            if (face == 0) return "dirt";
            return "mycelium_side";
        case SnowLayer: case Snow: return "snow";
        case Ice: return "ice";
        case PackedIce: return "ice_packed";
        case Ladder: return "ladder";
        case Trapdoor: return "trapdoor";
        case WoodenDoor:
            return (meta & 8) ? "door_wood_upper" : "door_wood_lower";
        case IronDoor:
            return (meta & 8) ? "door_iron_upper" : "door_iron_lower";
        case Rail: return (meta >= 6 && meta <= 9) ? "rail_normal_turned" : "rail_normal";
        case GoldenRail: return (meta & 8) ? "rail_golden_powered" : "rail_golden";
        case DetectorRail: return (meta & 8) ? "rail_detector_powered" : "rail_detector";
        case ActivatorRail: return (meta & 8) ? "rail_activator_powered" : "rail_activator";
        case IronBars: return "iron_bars";
        case GlassPane: return "glass_pane_top";
        case Jukebox:
            return face == 1 ? "jukebox_top" : "jukebox_side";
        case Dispenser: case Dropper:
            if (face == 1) return "furnace_top";
            if (face == 0) return "furnace_top";
            if (meta >= 2 && meta <= 5 && (int)meta == face)
                return id == Dropper ? "dropper_front_horizontal" : "dispenser_front_horizontal";
            return "furnace_side";
        case Noteblock: return "noteblock";
        case Bookshelf: return face == 1 || face == 0 ? "planks_oak" : "bookshelf";
        case TNT:
            if (face == 1) return "tnt_top";
            if (face == 0) return "tnt_bottom";
            return "tnt_side";
        case EnchantingTable:
            if (face == 1) return "enchanting_table_top";
            if (face == 0) return "obsidian";
            return "enchanting_table_side";
        case EndPortalFrame:
            if (face == 1) return "endframe_top";
            if (face == 0) return "end_stone";
            return "endframe_side";
        case Portal: return "portal";
        case QuartzBlock: {
            int variant = meta & 3;
            int axis = (meta >> 2) & 3;
            if (variant == 0) {
                if (face == 1) return "quartz_block_top";
                if (face == 0) return "quartz_block_bottom";
                return "quartz_block_side";
            }
            if (variant == 1) {
                if (face == 1 || face == 0) return "quartz_block_chiseled_top";
                return "quartz_block_chiseled";
            }
            bool topFace = (axis == 0 && (face == 0 || face == 1)) ||
                           (axis == 1 && (face == 4 || face == 5)) ||
                           (axis == 2 && (face == 2 || face == 3));
            if (topFace) return "quartz_block_lines_top";
            return "quartz_block_lines";
        }
        case HayBlock: {
            int axis = (meta >> 2) & 3;
            bool topFace = (axis == 0 && (face == 0 || face == 1)) ||
                           (axis == 1 && (face == 4 || face == 5)) ||
                           (axis == 2 && (face == 2 || face == 3));
            return topFace ? "hay_block_top" : "hay_block_side";
        }
        case CoalBlock: return "coal_block";
        case HardenedClay: return "hardened_clay";
        case RedstoneLamp: return "redstone_lamp_off";
        case LitRedstoneLamp: return "redstone_lamp_on";
        case Glowstone: return "glowstone";
        case SoulSand: return "soul_sand";
        case Netherrack: return "netherrack";
        case NetherBrick: case NetherBrickFence: return "nether_brick";
        case Fence: case FenceGate: return plankTile(meta);
        case CobblestoneWall: return (meta & 1) ? "cobblestone_mossy" : "cobblestone";
        case Cocoa: {
            int stage = (meta >> 2) & 3;
            std::snprintf(buf, sizeof(buf), "cocoa_stage_%d", std::min(2, stage));
            return buf;
        }
        case DoublePlant: return doublePlantTile(meta, 0);
        case CommandBlock: return "command_block";
        case Beacon: return "beacon";
        case MobSpawner: return "mob_spawner";
        case Bedrock: return "bedrock";
        case Obsidian: return "obsidian";
        case Clay: return "clay";
        case Gravel: return "gravel";
        case Stone: return "stone";
        case Cobblestone: return "cobblestone";
        case MossyCobblestone: return "cobblestone_mossy";
        case Glass: return "glass";
        case GoldOre: return "gold_ore";
        case IronOre: return "iron_ore";
        case CoalOre: return "coal_ore";
        case LapisOre: return "lapis_ore";
        case DiamondOre: return "diamond_ore";
        case RedstoneOre: case LitRedstoneOre: return "redstone_ore";
        case EmeraldOre: return "emerald_ore";
        case QuartzOre: return "quartz_ore";
        case GoldBlock: return "gold_block";
        case IronBlock: return "iron_block";
        case DiamondBlock: return "diamond_block";
        case LapisBlock: return "lapis_block";
        case EmeraldBlock: return "emerald_block";
        case RedstoneBlock: return "redstone_block";
        case BrickBlock: return "brick";
        case Sponge: return "sponge";
        case Deadbush: return "deadbush";
        case Tallgrass: return tallgrassTile(meta);
        case YellowFlower: return "flower_dandelion";
        case RedFlower: return flowerTile(meta);
        case BrownMushroom: return "mushroom_brown";
        case RedMushroom: return "mushroom_red";
        case EndStone: return "end_stone";
        case DragonEgg: return "dragon_egg";
        case Cake:
            if (face == 1) return "cake_top";
            if (face == 0) return "cake_bottom";
            return "cake_side";
        case Bed: return "bed_feet_top";
        case Anvil:
            if (face == 1) {
                int dmg = (meta >> 2) & 3;
                std::snprintf(buf, sizeof(buf), "anvil_top_damaged_%d", dmg);
                return buf;
            }
            return "anvil_base";
        case Hopper: return face == 1 ? "hopper_top" : "hopper_outside";
        case DaylightDetector:
            return face == 1 ? "daylight_detector_top" : "daylight_detector_side";
        case BrewingStand: return "brewing_stand";
        case Cauldron: return face == 1 ? "cauldron_top" : "cauldron_side";
        case FlowerPot: return "flower_pot";
        case Skull: return "skull";
        case Lever: return "lever";
        case StoneButton: return "stone";
        case WoodenButton: return plankTile(0);
        case StonePressurePlate: return "stone";
        case WoodenPressurePlate: return plankTile(0);
        case LightWeightedPressurePlate: return "gold_block";
        case HeavyWeightedPressurePlate: return "iron_block";
        default: break;
    }
    // Fallback: named stone-ish tile.
    return "stone";
}

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------
ItemStack blockDrop(uint16_t id, uint8_t meta, JavaRandom& rng) {
    auto none = [] { return ItemStack{}; };
    auto of = [](uint16_t itemId, int count, uint16_t meta2 = 0) {
        ItemStack s; s.id = itemId; s.count = (uint8_t)count; s.meta = meta2;
        return s;
    };
    switch (id) {
        case Air: case Bedrock: case FlowingWater: case Water: case FlowingLava:
        case Lava: case Fire: case Portal: case EndPortal: case EndPortalFrame:
        case MobSpawner: case Glass: case Ice: case PackedIce: case StainedGlass:
        case GlassPane: case StainedGlassPane: case StandingSign: case WallSign:
        case CommandBlock: case Cake: case Skull: case PistonHead: case RedstoneWire:
        case Tripwire:
            return none();
        case Grass: case Mycelium: case Farmland: return of(ItemID::Dirt, 1);
        case Dirt: return (meta & 3) == 1 ? of(ItemID::Dirt, 1, 1) : of(ItemID::Dirt, 1);
        case Stone: return of(ItemID::Cobblestone, 1);
        case Gravel: return rng.nextInt(10) == 0 ? of(ItemID::Flint, 1)
                                                 : of(ItemID::Gravel, 1);
        case CoalOre: return of(ItemID::Coal, 1, 0);
        case DiamondOre: return of(ItemID::Diamond, 1);
        case EmeraldOre: return of(ItemID::Emerald, 1);
        case LapisOre: return of(ItemID::Dye, 4 + rng.nextInt(5), 4);
        case RedstoneOre: case LitRedstoneOre: return of(ItemID::Redstone, 4 + rng.nextInt(2));
        case QuartzOre: return of(ItemID::Quartz, 1);
        case Leaves: {
            int chance = 20; // 5% sapling (1.7 oak/spruce/birch/jungle)
            if (rng.nextInt(chance) == 0) return of(ItemID::Sapling, 1, meta & 3);
            if ((meta & 3) == 0 && rng.nextInt(200) == 0) return of(ItemID::Apple, 1);
            return none();
        }
        case Leaves2: {
            int chance = (meta & 1) ? 40 : 20; // dark oak rarer
            if (rng.nextInt(chance) == 0) return of(ItemID::Sapling, 1, 4 + (meta & 1));
            return none();
        }
        case Web: return of(ItemID::String, 1);
        case Tallgrass: case DoublePlant:
            if ((id == DoublePlant) && (meta & 7) < 2) return of(id, 1, meta);
            if ((id == DoublePlant) && (meta & 7) >= 4) return of(id, 1, meta);
            if (rng.nextInt(8) == 0) return of(ItemID::WheatSeeds, 1);
            return id == DoublePlant ? of(id, 1, meta) : none();
        case Wheat:
            if ((meta & 7) >= 7) return of(ItemID::Wheat, 1);
            return of(ItemID::WheatSeeds, 1);
        case Carrots:
            return (meta & 7) >= 7 ? of(ItemID::Carrot, 1 + rng.nextInt(4))
                                   : of(ItemID::Carrot, 1);
        case Potatoes: {
            if ((meta & 7) < 7) return of(ItemID::Potato, 1);
            if (rng.nextInt(50) == 1) return of(ItemID::PoisonousPotato, 1);
            return of(ItemID::Potato, 1 + rng.nextInt(4));
        }
        case Glowstone: return of(ItemID::GlowstoneDust, 2 + rng.nextInt(3));
        case MelonBlock: return of(ItemID::Melon, 3 + rng.nextInt(5));
        case PumpkinStem: case MelonStem:
            return of(id == PumpkinStem ? ItemID::PumpkinSeeds : ItemID::MelonSeeds, 1);
        case Reeds: return of(ItemID::Reeds, 1);
        case Clay: return of(ItemID::ClayBall, 4);
        case SnowLayer: return of(ItemID::Snowball, 1);
        case Snow: return of(ItemID::Snowball, 4);
        case StoneSlab: return of(ItemID::StoneSlab, 1, meta & 7);
        case DoubleStoneSlab: return of(ItemID::StoneSlab, 2, meta & 7);
        case WoodenSlab: return of(ItemID::WoodenSlab, 1, meta & 7);
        case WoodenDoubleSlab: return of(ItemID::WoodenSlab, 2, meta & 7);
        case Bookshelf: return of(ItemID::Book, 3);
        case EnderChest: return of(ItemID::Obsidian, 8);
        case Cocoa: return of(ItemID::Dye, ((meta >> 2) & 3) >= 2 ? 3 : 1, 3);
        case NetherWart: return of(ItemID::NetherWart, 1 + ((meta & 3) >= 3 ? rng.nextInt(4) : 0));
        case Bed: return (meta & 8) ? none() : of(ItemID::Bed, 1);
        case WoodenDoor: return (meta & 8) ? none() : of(ItemID::WoodenDoorItem, 1);
        case IronDoor: return (meta & 8) ? none() : of(ItemID::IronDoorItem, 1);
        case MonsterEgg: return none();
        case BrownMushroomBlock:
            return rng.nextInt(10) < 2 ? of(ItemID::BrownMushroomItem, 1) : none();
        case RedMushroomBlock:
            return rng.nextInt(10) < 2 ? of(ItemID::RedMushroomItem, 1) : none();
        case TNT: return of(ItemID::TNT, 1);
        case Vine: return none(); // shears-only, approximated
        case QuartzBlock: return of(ItemID::QuartzBlock, 1, meta);
        case HayBlock: return of(ItemID::HayBlock, 1);
        case Carpet: return of(ItemID::Carpet, 1, meta);
        case Anvil: return of(ItemID::AnvilItem, 1, (meta >> 2) & 3);
        case BrewingStand: return of(ItemID::BrewingStandItem, 1);
        case Cauldron: return of(ItemID::CauldronItem, 1);
        case FlowerPot: return of(ItemID::FlowerPotItem, 1);
        case Hopper: return of(ItemID::HopperItem, 1);
        case UnpoweredComparator: case PoweredComparator:
            return of(ItemID::ComparatorItem, 1);
        case UnpoweredRepeater: case PoweredRepeater: return of(ItemID::RepeaterItem, 1);
        default: break;
    }
    // Default: the block itself with its visual meta.
    if (id < 256) {
        uint16_t outMeta = meta;
        if (blockDef(id).shape == BlockShape::Stairs) outMeta = 0;
        if (id == Torch || id == RedstoneTorch || id == UnlitRedstoneTorch) outMeta = 0;
        if (id == Furnace || id == LitFurnace) { if (id == LitFurnace) return of(Furnace, 1, 0); }
        if (id == Log || id == Log2) outMeta = meta & 3;
        return of(id, 1, outMeta);
    }
    return none();
}

// ---------------------------------------------------------------------------
// Harvesting / break time
// ---------------------------------------------------------------------------
bool canHarvest(uint16_t id, uint8_t meta, ToolType tool, int toolLevel) {
    const BlockDef& d = blockDef(id);
    (void)meta;
    if (d.hardness < 0) return false;
    if (d.tool == ToolType::None) return true;
    if (tool != d.tool) return false;
    return toolLevel >= d.harvestLevel;
}

static float toolSpeed(uint16_t id, uint8_t meta, ToolType tool, int toolLevel) {
    if (tool == ToolType::Shears) {
        if (id == Web) return 15.0f;
        if (id == Wool) return 5.0f;
        if (id == Leaves || id == Leaves2) return 15.0f;
        if (id == Vine) return 2.0f;
        return 1.0f;
    }
    if (tool == ToolType::Sword) {
        if (id == Vine || id == Leaves || id == Leaves2) return 1.5f;
        if (id == Web) return 15.0f;
        return 1.0f;
    }
    const BlockDef& d = blockDef(id);
    if (d.tool != tool || !canHarvest(id, meta, tool, toolLevel)) return 1.0f;
    switch (toolLevel) {
        case 0: return 2.0f;   // wood / gold-tier level check uses tier below
        case 1: return 4.0f;   // stone
        case 2: return 6.0f;   // iron
        case 3: return 8.0f;   // diamond
        default: return 1.0f;
    }
}

float breakTime(uint16_t id, uint8_t meta, ToolType tool, int toolLevel,
                bool onGround, bool inWater) {
    const BlockDef& d = blockDef(id);
    if (d.hardness < 0) return -1.0f;
    if (d.hardness == 0) return 0.05f;
    float speed = toolSpeed(id, meta, tool, toolLevel);
    if (tool == ToolType::None) {
        // gold tools are fast but low tier - handled by caller passing level
        speed = 1.0f;
    }
    bool harvest = canHarvest(id, meta, tool, toolLevel);
    float damage = (harvest ? 1.5f : 5.0f) * d.hardness / speed;
    if (inWater) damage *= 5.0f;
    if (!onGround) damage *= 5.0f;
    return damage; // seconds
}

// ---------------------------------------------------------------------------
// Collision / outline boxes
// ---------------------------------------------------------------------------
static AABB box(int x, int y, int z, float x1, float y1, float z1,
                float x2, float y2, float z2) {
    return AABB({(float)x + x1, (float)y + y1, (float)z + z1},
                {(float)x + x2, (float)y + y2, (float)z + z2});
}

bool blockCollision(uint16_t id, uint8_t meta, int x, int y, int z, AABB& out) {
    const BlockDef& d = blockDef(id);
    if (!d.solid) return false;
    switch (d.shape) {
        case BlockShape::Slab: {
            bool top = (meta & 8) != 0;
            out = top ? box(x, y, z, 0, 0.5f, 0, 1, 1, 1)
                      : box(x, y, z, 0, 0, 0, 1, 0.5f, 1);
            return true;
        }
        case BlockShape::Stairs: {
            // bottom half + raised back half, per facing meta 0..3
            int facing = meta & 3; // 0=+x(east) 1=-x(west) 2=+z(south) 3=-z(north)
            bool upper = (meta & 4) != 0;
            out = box(x, y, z, 0, 0, 0, 1, 0.5f, 1);
            // caller may union the back-half box via blockOutline extras; keep
            // a single conservative full-bottom + back box:
            AABB back;
            switch (facing) {
                case 0: back = box(x, y, z, 0.5f, 0, 0, 1, 1, 1); break;
                case 1: back = box(x, y, z, 0, 0, 0, 0.5f, 1, 1); break;
                case 2: back = box(x, y, z, 0, 0, 0.5f, 1, 1, 1); break;
                default: back = box(x, y, z, 0, 0, 0, 1, 1, 0.5f); break;
            }
            if (upper) {
                out = box(x, y, z, 0, 0.5f, 0, 1, 1, 1);
                switch (facing) {
                    case 0: back = box(x, y, z, 0, 0, 0, 0.5f, 0.5f, 1); break;
                    case 1: back = box(x, y, z, 0.5f, 0, 0, 1, 0.5f, 1); break;
                    case 2: back = box(x, y, z, 0, 0, 0, 1, 0.5f, 0.5f); break;
                    default: back = box(x, y, z, 0, 0, 0.5f, 1, 0.5f, 1); break;
                }
            }
            // merge into single AABB is lossy; use the union box (slightly
            // generous but keeps stair climbing smooth like MC)
            out = AABB({std::min(out.min.x, back.min.x), std::min(out.min.y, back.min.y),
                        std::min(out.min.z, back.min.z)},
                       {std::max(out.max.x, back.max.x), std::max(out.max.y, back.max.y),
                        std::max(out.max.z, back.max.z)});
            return true;
        }
        case BlockShape::SnowLayer: {
            float h = (float)((meta & 7) + 1) / 8.0f;
            if (h < 0.25f) return false; // very thin layers don't collide
            out = box(x, y, z, 0, 0, 0, 1, h, 1);
            return true;
        }
        case BlockShape::Carpet:
            out = box(x, y, z, 0, 0, 0, 1, 1.0f / 16.0f, 1);
            return true;
        case BlockShape::Cactus:
            out = box(x, y, z, 1 / 16.f, 0, 1 / 16.f, 15 / 16.f, 1, 15 / 16.f);
            return true;
        case BlockShape::Farmland:
            out = box(x, y, z, 0, 0, 0, 1, 15.0f / 16.0f, 1);
            return true;
        case BlockShape::Fence: {
            if (id == FenceGate) {
                bool open = (meta & 4) != 0;
                if (open) return false;
                int facing = meta & 3;
                out = (facing & 1) ? box(x, y, z, 0, 0, 6 / 16.f, 1, 1.5f, 10 / 16.f)
                                   : box(x, y, z, 6 / 16.f, 0, 0, 10 / 16.f, 1.5f, 1);
                return true;
            }
            out = box(x, y, z, 6 / 16.f, 0, 6 / 16.f, 10 / 16.f, 1.5f, 10 / 16.f);
            return true;
        }
        case BlockShape::Wall:
            out = box(x, y, z, 4 / 16.f, 0, 4 / 16.f, 12 / 16.f, 1.5f, 12 / 16.f);
            return true;
        case BlockShape::Pane:
            out = box(x, y, z, 7 / 16.f, 0, 7 / 16.f, 9 / 16.f, 1, 9 / 16.f);
            return true;
        case BlockShape::Bed:
            out = box(x, y, z, 0, 0, 0, 1, 9 / 16.f, 1);
            return true;
        case BlockShape::Cake:
            out = box(x, y, z, 1 / 16.f, 0, 1 / 16.f, 15 / 16.f, 0.5f, 15 / 16.f);
            return true;
        case BlockShape::Door: {
            bool open = (meta & 4) != 0;
            int facing = meta & 3;
            if (open) facing = (facing + 1) & 3;
            float t = 3.0f / 16.0f;
            switch (facing) {
                case 0: out = box(x, y, z, 0, 0, 0, t, 1, 1); break;
                case 1: out = box(x, y, z, 1 - t, 0, 0, 1, 1, 1); break;
                case 2: out = box(x, y, z, 0, 0, 0, 1, 1, t); break;
                default: out = box(x, y, z, 0, 0, 1 - t, 1, 1, 1); break;
            }
            return true;
        }
        case BlockShape::Trapdoor: {
            bool open = (meta & 4) != 0;
            if (open) {
                int facing = meta & 3;
                float t = 3.0f / 16.0f;
                switch (facing) {
                    case 0: out = box(x, y, z, 0, 0, 1 - t, 1, 1, 1); break;
                    case 1: out = box(x, y, z, 0, 0, 0, 1, 1, t); break;
                    case 2: out = box(x, y, z, 1 - t, 0, 0, 1, 1, 1); break;
                    default: out = box(x, y, z, 0, 0, 0, t, 1, 1); break;
                }
            } else if (meta & 8) {
                out = box(x, y, z, 0, 1 - 3 / 16.f, 0, 1, 1, 1);
            } else {
                out = box(x, y, z, 0, 0, 0, 1, 3 / 16.f, 1);
            }
            return true;
        }
        default:
            out = box(x, y, z, 0, 0, 0, 1, 1, 1);
            return true;
    }
}

bool blockOutline(uint16_t id, uint8_t meta, int x, int y, int z, AABB& out) {
    return blockCollision(id, meta, x, y, z, out);
}

// ---------------------------------------------------------------------------
// Misc queries
// ---------------------------------------------------------------------------
TintType blockTint(uint16_t id) {
    switch (id) {
        case Grass: case Tallgrass: case DoublePlant: case Vine: case Reeds:
            return TintType::Grass;
        case Leaves: case Leaves2:
            return TintType::Foliage;
        case Waterlily:
            return TintType::Grass;
        case Water: case FlowingWater:
            return TintType::Water;
        default: return TintType::None;
    }
}

bool isLiquidBlock(uint16_t id) {
    return id == Water || id == FlowingWater || id == Lava || id == FlowingLava;
}
bool isOpaqueForLight(uint16_t id, uint8_t meta) {
    return lightOpacityOf(id, meta) >= 15;
}
uint8_t lightOpacityOf(uint16_t id, uint8_t meta) {
    const BlockDef& d = blockDef(id);
    if (d.shape == BlockShape::Slab || d.shape == BlockShape::Stairs) return 15;
    if (id == Lava || id == FlowingLava) return 15;
    (void)meta;
    return d.lightOpacity;
}
bool blocksMovement(uint16_t id, uint8_t meta) {
    const BlockDef& d = blockDef(id);
    if (!d.solid) return false;
    if (d.shape == BlockShape::SnowLayer && ((meta & 7) + 1) < 5) return false;
    return true;
}
bool isAirLike(uint16_t id) {
    if (id == Air) return true;
    const BlockDef& d = blockDef(id);
    return d.replaceable || (d.plant && !d.solid) || id == Fire;
}
bool isFullCube(uint16_t id, uint8_t meta) {
    const BlockDef& d = blockDef(id);
    (void)meta;
    return d.fullCubeOpaque && d.shape == BlockShape::Cube;
}
bool emitsLight(uint16_t id) { return blockDef(id).lightEmission > 0; }

int logSpecies(uint8_t meta) { return meta & 3; }
int logAxis(uint8_t meta) { return (meta >> 2) & 3; }

} // namespace vox
