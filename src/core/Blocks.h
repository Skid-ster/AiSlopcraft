// Block registry: numeric IDs, properties, drops, tile names.
// IDs follow the unofficial Java Edition 1.7.3 numeric block id table so that
// metadata semantics and (optional) resource-pack tile names line up with the
// target version. All textures are ORIGINAL art created by tools/assetgen.
#pragma once
#include <cstdint>
#include <string>
#include "Types.h"

namespace vox {

class JavaRandom;

// Numeric block ids (Java 1.7.3). Blocks not individually modelled yet still
// exist in the registry so ids/properties match the target version.
namespace BlockID {
enum : uint16_t {
    Air = 0, Stone = 1, Grass = 2, Dirt = 3, Cobblestone = 4, Planks = 5,
    Sapling = 6, Bedrock = 7, FlowingWater = 8, Water = 9, FlowingLava = 10,
    Lava = 11, Sand = 12, Gravel = 13, GoldOre = 14, IronOre = 15,
    CoalOre = 16, Log = 17, Leaves = 18, Sponge = 19, Glass = 20,
    LapisOre = 21, LapisBlock = 22, Dispenser = 23, Sandstone = 24,
    Noteblock = 25, Bed = 26, GoldenRail = 27, DetectorRail = 28,
    StickyPiston = 29, Web = 30, Tallgrass = 31, Deadbush = 32, Piston = 33,
    PistonHead = 34, Wool = 35, YellowFlower = 37, RedFlower = 38,
    BrownMushroom = 39, RedMushroom = 40, GoldBlock = 41, IronBlock = 42,
    DoubleStoneSlab = 43, StoneSlab = 44, BrickBlock = 45, TNT = 46,
    Bookshelf = 47, MossyCobblestone = 48, Obsidian = 49, Torch = 50,
    Fire = 51, MobSpawner = 52, OakStairs = 53, Chest = 54, RedstoneWire = 55,
    DiamondOre = 56, DiamondBlock = 57, CraftingTable = 58, Wheat = 59,
    Farmland = 60, Furnace = 61, LitFurnace = 62, StandingSign = 63,
    WoodenDoor = 64, Ladder = 65, Rail = 66, StoneStairs = 67, WallSign = 68,
    Lever = 69, StonePressurePlate = 70, IronDoor = 71,
    WoodenPressurePlate = 72, RedstoneOre = 73, LitRedstoneOre = 74,
    UnlitRedstoneTorch = 75, RedstoneTorch = 76, StoneButton = 77,
    SnowLayer = 78, Ice = 79, Snow = 80, Cactus = 81, Clay = 82, Reeds = 83,
    Jukebox = 84, Fence = 85, Pumpkin = 86, Netherrack = 87, SoulSand = 88,
    Glowstone = 89, Portal = 90, LitPumpkin = 91, Cake = 92,
    UnpoweredRepeater = 93, PoweredRepeater = 94, StainedGlass = 95,
    Trapdoor = 96, MonsterEgg = 97, Stonebrick = 98, BrownMushroomBlock = 99,
    RedMushroomBlock = 100, IronBars = 101, GlassPane = 102, MelonBlock = 103,
    PumpkinStem = 104, MelonStem = 105, Vine = 106, FenceGate = 107,
    BrickStairs = 108, StoneBrickStairs = 109, Mycelium = 110,
    Waterlily = 111, NetherBrick = 112, NetherBrickFence = 113,
    NetherBrickStairs = 114, NetherWart = 115, EnchantingTable = 116,
    BrewingStand = 117, Cauldron = 118, EndPortal = 119,
    EndPortalFrame = 120, EndStone = 121, DragonEgg = 122,
    RedstoneLamp = 123, LitRedstoneLamp = 124, WoodenDoubleSlab = 125,
    WoodenSlab = 126, Cocoa = 127, SandstoneStairs = 128, EmeraldOre = 129,
    EnderChest = 130, TripwireHook = 131, Tripwire = 132, EmeraldBlock = 133,
    SpruceStairs = 134, BirchStairs = 135, JungleStairs = 136,
    CommandBlock = 137, Beacon = 138, CobblestoneWall = 139,
    FlowerPot = 140, Carrots = 141, Potatoes = 142, WoodenButton = 143,
    Skull = 144, Anvil = 145, TrappedChest = 146,
    LightWeightedPressurePlate = 147, HeavyWeightedPressurePlate = 148,
    UnpoweredComparator = 149, PoweredComparator = 150,
    DaylightDetector = 151, RedstoneBlock = 152, QuartzOre = 153,
    Hopper = 154, QuartzBlock = 155, QuartzStairs = 156,
    ActivatorRail = 157, Dropper = 158, StainedHardenedClay = 159,
    StainedGlassPane = 160, Leaves2 = 161, Log2 = 162, AcaciaStairs = 163,
    DarkOakStairs = 164, HayBlock = 170, Carpet = 171,
    HardenedClay = 172, CoalBlock = 173, PackedIce = 174, DoublePlant = 175,
    BlockIDCount = 176
};
} // namespace BlockID

enum class ToolType : uint8_t { None, Pickaxe, Shovel, Axe, Sword, Shears };

enum class RenderLayer : uint8_t {
    Invisible,   // no geometry (air, signs without model, ...)
    Opaque,      // full light-blocking cubes
    Cutout,      // alpha-tested geometry (plants, torches, rails ...)
    Transparent, // blended geometry (glass, water, ice, leaves-fancy?)
};

// Special meshing shapes beyond a full cube.
enum class BlockShape : uint8_t {
    Cube, Cross, Torch, Liquid, Slab, DoubleSlab, Stairs, Fence, Wall,
    Pane, Ladder, Door, Trapdoor, Button, Lever, PressurePlate, SnowLayer,
    Cactus, Farmland, Crop, Vine, LilyPad, Cake, Bed, Portal, Fire,
    HayAxis, Carpet, DoublePlant, Stem, Rails, InvisibleShape, Spawner,
};

struct BlockDef {
    uint16_t id = 0;
    const char* name = "air";        // registry name, e.g. "stone"
    const char* displayName = "Air";
    float hardness = 0.0f;           // -1 = unbreakable (bedrock)
    float resistance = 0.0f;         // explosion resistance
    ToolType tool = ToolType::None;
    int harvestLevel = 0;            // required tool tier (0 = any of tool kind)
    uint8_t lightEmission = 0;       // 0..15
    uint8_t lightOpacity = 15;       // light absorbed per block, 0..15, 255-ish = full
    bool air = false;
    bool liquid = false;
    bool solid = true;               // blocks movement
    bool fullCubeOpaque = true;      // culls neighbor faces / blocks all light
    bool gravity = false;            // falls like sand
    bool replaceable = false;        // water/plants can be replaced when placing
    bool tickable = false;           // receives random/scheduled ticks
    bool plant = false;              // cross plants that need support
    RenderLayer layer = RenderLayer::Opaque;
    BlockShape shape = BlockShape::Cube;
    uint8_t metaVariants = 1;        // distinct visual variants via meta
    bool tinted = false;             // biome color map applied (grass/leaves...)
    float slipperiness = 0.6f;       // 1.7 default 0.6; ice 0.98
    bool flammable = false;          // can burn / be ignited
    uint8_t fireSpread = 0;          // relative flammability for fire spread
    int mapColor = 0;                // coarse map/minimap color index (future)
};

const BlockDef& blockDef(uint16_t id);
const char* blockName(uint16_t id);

// Texture tile name for a face, using 1.7-style resource pack names.
// face: Dir for cubes; for special shapes the mesher queries the same call.
std::string blockTile(uint16_t id, uint8_t meta, int face, int x = 0, int y = 0, int z = 0);

// Drop when broken in survival (no enchantments). Returns item id + meta.
// itemId 0 = nothing drops.
struct ItemStack;
ItemStack blockDrop(uint16_t id, uint8_t meta, JavaRandom& rng);
bool canHarvest(uint16_t id, uint8_t meta, ToolType tool, int toolLevel);

// Break time in seconds for given tool (matches 1.7 formula shape).
float breakTime(uint16_t id, uint8_t meta, ToolType tool, int toolLevel, bool onGround, bool inWater);

// Collision box of one block occupying [x,y,z]. Returns false if no collision.
bool blockCollision(uint16_t id, uint8_t meta, int x, int y, int z, AABB& out);
// Selection/outline box (may differ from collision, e.g. slabs).
bool blockOutline(uint16_t id, uint8_t meta, int x, int y, int z, AABB& out);

// Per-biome tint categories used by the mesher.
enum class TintType : uint8_t { None, Grass, Foliage, Water };
TintType blockTint(uint16_t id);

bool isLiquidBlock(uint16_t id);
bool isOpaqueForLight(uint16_t id, uint8_t meta);
uint8_t lightOpacityOf(uint16_t id, uint8_t meta);
bool blocksMovement(uint16_t id, uint8_t meta);
bool isAirLike(uint16_t id);          // air / replaceable plant that can be overwritten
bool isFullCube(uint16_t id, uint8_t meta);
bool emitsLight(uint16_t id);

// Log orientation helpers (1.7 meta: bits 0-1 species, bits 2-3 axis).
int logSpecies(uint8_t meta);   // 0 oak 1 spruce 2 birch 3 jungle
int logAxis(uint8_t meta);      // 0 = Y, 1 = X, 2 = Z, 3 = bark-only

} // namespace vox
