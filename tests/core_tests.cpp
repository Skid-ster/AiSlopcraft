#include "core/Blocks.h"
#include "core/Chunk.h"
#include "core/Inventory.h"
#include "core/Items.h"
#include "core/JavaRandom.h"
#include "core/Noise.h"
#include "core/Physics.h"
#include "core/Recipes.h"
#include "core/Save.h"
#include "core/World.h"
#include "core/WorldGen.h"
#include <array>
#include <cmath>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

using namespace vox;
static int checks=0;
#define CHECK(expr) do { ++checks; if (!(expr)) { \
    throw std::runtime_error(std::string(__FILE__)+":"+std::to_string(__LINE__)+ \
                             " check failed: " #expr); } } while(false)

static void testRegistry() {
    CHECK(BlockID::StainedGlass==95);
    CHECK(BlockID::Log2==162);
    CHECK(ItemID::DiamondPickaxe==278);
    CHECK(ItemID::NameTag==421);
    CHECK(blockDef(BlockID::Grass).hardness==0.6f);
    CHECK(blockDef(BlockID::Bedrock).hardness<0);
    CHECK(blockDef(BlockID::Torch).lightEmission==14);
    CHECK(blockTile(BlockID::Grass,0,Up)=="grass_top");
    CHECK(blockTile(BlockID::Dirt,2,Up)=="dirt_podzol_top");
    CHECK(blockTile(BlockID::Dirt,1,Up)=="dirt_coarse");
    CHECK(blockTile(BlockID::Log2,1,Up)=="log_big_oak_top");
    CHECK(blockTile(BlockID::Wool,14,North)=="wool_colored_red");
    CHECK(itemTile(ItemID::DiamondPickaxe,0)=="diamond_pickaxe");
    CHECK(itemTile(ItemID::Dye,0)=="dye_powder_black");
    CHECK(itemTile(ItemID::Dye,15)=="dye_powder_white");
    CHECK(itemTile(ItemID::Fish,3)=="fish_pufferfish_raw");
    CHECK(itemExists(ItemID::GoldenHoe));
    CHECK(!itemExists(409)); // no 1.8 items
    CHECK(!itemExists(65535));
    CHECK((ItemStack{ItemID::Egg,1,0}.maxStack()==16));
    CHECK((ItemStack{ItemID::IronPickaxe,1,10}.maxDamage()==250));
    CHECK((ItemStack{ItemID::IronPickaxe,1,10}.maxStack()==1));
    CHECK(itemFuelTicks(ItemID::Coal,1)==1600);
    CHECK(itemFuelTicks(ItemID::HayBlock,0)==0);
    CHECK(!canHarvest(BlockID::DiamondOre,0,ToolType::Pickaxe,1));
    CHECK(canHarvest(BlockID::DiamondOre,0,ToolType::Pickaxe,2));
    CHECK(breakTime(BlockID::Bedrock,0,ToolType::Pickaxe,3,true,false)<0);
    JavaRandom r(0);
    CHECK(blockDrop(BlockID::Stone,0,r).id==ItemID::Cobblestone);
    CHECK(blockDrop(BlockID::Glass,0,r).empty());
    AABB hit;
    CHECK(blockCollision(BlockID::StoneSlab,0,1,2,3,hit));
    CHECK(hit.max.y==2.5f);
}
static void testRandom() {
    JavaRandom a(0);
    CHECK(a.nextInt()==-1155484576);
    CHECK(a.nextInt()==-723955400);
    JavaRandom b(0);
    CHECK(b.nextInt(100)==60); // Java next(31) first = 1569741360
    JavaRandom c(1234), d(1234);
    for (int i=0;i<500;++i) CHECK(c.nextInt(37)==d.nextInt(37));
    bool threw=false;
    try { a.nextInt(0); } catch (const std::invalid_argument&) { threw=true; }
    CHECK(threw);
    OctaveNoise n(77,4);
    CHECK(n.sample2(100,-300)==OctaveNoise(77,4).sample2(100,-300));
    CHECK(std::isfinite(n.sample2(123456,-45089)));
    CHECK(worldHash(-5,16,24,-1)==worldHash(-5,16,24,-1));
    CHECK(worldHash(-5,16,24,-1)!=worldHash(-5,16,24,0));
}
static void testInventoryRecipes() {
    Inventory inv(4);
    CHECK(inv.insert({ItemID::Stone,64,0})==0);
    CHECK(inv.insert({ItemID::Stone,16,0})==0);
    CHECK(inv.countOf(ItemID::Stone)==80);
    CHECK(inv.transfer(1,2,8));
    CHECK(inv.at(2).count==8 && inv.at(1).count==8);
    CHECK(inv.take(0,80).count==64);
    CHECK(inv.countOf(ItemID::Stone)==16);
    CHECK(inv.insert({ItemID::IronPickaxe,1,0})==0);
    CHECK(!inv.damage(0,249) && inv.at(0).meta==249);
    CHECK(inv.damage(0) && inv.at(0).empty());
    Inventory wear(1);
    CHECK(wear.set(0,{ItemID::WoodenPickaxe,1,58}));
    CHECK(wear.damage(0) && wear.at(0).empty());
    CHECK(!wear.set(0,{ItemID::Stone,65,0}));
    CHECK(!wear.set(1,{ItemID::Stone,1,0}));
    std::array<ItemStack,9> grid{};
    grid[0]={ItemID::Log2,1,1};
    CHECK(craftResult(grid,2)->id==ItemID::Planks);
    CHECK(craftResult(grid,2)->meta==5);
    CHECK(craftOnce(grid,2).count==4 && grid[0].empty());
    grid[0]={ItemID::Planks,1,0}; grid[2]={ItemID::Planks,1,5};
    CHECK(craftResult(grid,2)->id==ItemID::Stick);
    grid[2]={ItemID::Stone,1,0};
    CHECK(!craftResult(grid,2).has_value());
    CHECK(smeltResult({ItemID::IronOre,1,0}).id==ItemID::IronIngot);
    CHECK(smeltResult({ItemID::Fish,1,3}).empty());
    Furnace f;
    f.input={ItemID::IronOre,1,0}; f.fuel={ItemID::Coal,1,0};
    int produced=0;
    for(int i=0;i<200;++i) produced+=f.tick();
    CHECK(produced==1 && f.output.id==ItemID::IronIngot);
}
static void testChunksWorld() {
    CHECK(floorDiv16(0)==0 && floorMod16(0)==0);
    CHECK(floorDiv16(-1)==-1 && floorMod16(-1)==15);
    CHECK(floorDiv16(-16)==-1 && floorMod16(-16)==0);
    CHECK(floorDiv16(-17)==-2 && floorMod16(-17)==15);
    WorldGenerator gen(12345);
    auto a=gen.generate(-1,0), b=gen.generate(-1,0);
    for(int z=0;z<16;++z) for(int x=0;x<16;++x) {
        CHECK(a->height[z*16+x]==b->height[z*16+x]);
        for(int y=0;y<128;++y) CHECK(a->block(x,y,z)==b->block(x,y,z));
    }
    World w(99,WorldType::Flat);
    CHECK(w.blockAt(-1,3,-16).id==BlockID::Grass);
    CHECK(w.blockAt(-16,1,-1).id==BlockID::Dirt);
    CHECK(w.blockAt(0,4,0).id==BlockID::Air);
    CHECK(w.setBlock(-1,4,-16,{BlockID::Torch,0}));
    CHECK(w.lightAt(-1,4,-16)==14);
    CHECK(w.lightAt(-2,4,-16)>=13);
    CHECK(w.setBlock(-1,4,-16,{}));
    CHECK(w.lightAt(-1,4,-16)==0);
    CHECK(w.skyAt(0,4,0)==15);
    CHECK(w.setBlock(0,5,0,{BlockID::Stone,0}));
    CHECK(w.skyAt(0,4,0)<15);
    CHECK(w.setBlock(0,5,0,{}));
    CHECK(w.skyAt(0,4,0)==15);
    auto hit=w.raycast({0.5f,6.5f,0.5f},{0,-1,0},8);
    CHECK(hit.has_value() && hit->pos.y==3 && hit->face==Up);
    CHECK(w.collides(AABB::fromOriginSize({0.2f,3,0.2f},{0.5f,1,0.5f})));
    w.tick(); CHECK(w.time()==6001);
}
static void testPhysicsFluids() {
    World w(5,WorldType::Flat);
    Player p;
    p.position={0.5f,4.0f,0.5f};
    for(int i=0;i<20;++i) p.tick(w,{});
    CHECK(p.onGround && std::abs(p.position.y-4.f)<0.002f);
    CHECK(p.health==20 && p.hunger==20);
    MovementInput move; move.forward=1; move.sprint=true;
    for(int i=0;i<15;++i) p.tick(w,move);
    CHECK(p.position.z< -1.0f);
    float prior=p.position.y;
    move.jump=true; p.tick(w,move);
    CHECK(p.position.y>prior && !p.onGround);
    p.health=15;p.hunger=15;
    p.inventory.set(0,{ItemID::Bread,2,0});
    CHECK(p.eat(0) && p.hunger==20 && p.inventory.at(0).count==1);
    p.damage(999); CHECK(p.dead && p.health==0);
    p.respawn({0.5f,4,0.5f});
    CHECK(!p.dead && p.health==20 && p.position.y==4);
    p.creative=true;p.flying=true;
    for(int i=0;i<5;++i) p.tick(w,MovementInput{.jump=true});
    CHECK(p.position.y>4 && p.health==20);
    CHECK(w.setBlock(5,9,5,{BlockID::Sand,0}));
    for(int i=0;i<6;++i) w.tick();
    CHECK(w.peekBlock(5,4,5).id==BlockID::Sand);
    CHECK(w.setBlock(2,4,2,{BlockID::Water,0}));
    for(int i=0;i<6;++i) w.tick();
    CHECK(w.peekBlock(3,4,2).id==BlockID::FlowingWater);
}
static void testSave() {
    namespace fs=std::filesystem;
    auto dir=fs::temp_directory_path() / ("aislopcraft-save-test-"+
        std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    auto file=dir/"world.bin";
    World world(-67985,WorldType::Flat);
    world.setTime(23456);
    CHECK(world.setBlock(-17,4,15,{BlockID::DiamondBlock,0}));
    CHECK(world.setBlock(16,6,-1,{BlockID::Torch,0}));
    PlayerSnapshot player;
    player.position={-16.5f,5.0f,14.5f};
    player.yaw=112.5f; player.creative=true;
    player.inventory[0]={ItemID::DiamondPickaxe,1,200};
    player.inventory[1]={ItemID::Planks,32,5};
    std::string error;
    CHECK(saveWorld(world,player,file,error));
    CHECK(fs::exists(file));
    { std::ofstream interrupted(file.string()+".tmp",std::ios::binary); interrupted<<"partial"; }
    PlayerSnapshot restored;
    auto loaded=loadWorld(file,restored,error);
    CHECK(loaded!=nullptr);
    CHECK(loaded->seed()==-67985 && loaded->time()==23456);
    CHECK(loaded->blockAt(-17,4,15).id==BlockID::DiamondBlock);
    CHECK(loaded->blockAt(16,6,-1).id==BlockID::Torch);
    CHECK(restored.inventory[0].meta==200);
    CHECK(restored.inventory[1].count==32);
    CHECK(restored.position.x==-16.5f && restored.creative);
    CHECK(saveWorld(*loaded,restored,file,error)); // atomic replacement
    auto corrupted=dir/"corrupted.bin";
    fs::copy_file(file,corrupted);
    { std::fstream f(corrupted,std::ios::in|std::ios::out|std::ios::binary);
      f.seekp(30); char c=127; f.write(&c,1); }
    CHECK(loadWorld(corrupted,restored,error)==nullptr);
    CHECK(error.find("checksum")!=std::string::npos);
    CHECK(loadWorld(dir/"missing.bin",restored,error)==nullptr);
    fs::remove_all(dir);
}
int main() {
    try {
        testRegistry(); std::cout<<"[PASS] registry and mining\n";
        testRandom(); std::cout<<"[PASS] Java RNG and deterministic noise\n";
        testInventoryRecipes(); std::cout<<"[PASS] inventory, recipes, smelting\n";
        testChunksWorld(); std::cout<<"[PASS] chunks, worldgen, lighting, raycast\n";
        testPhysicsFluids(); std::cout<<"[PASS] movement, damage, food, gravity/fluids\n";
        testSave(); std::cout<<"[PASS] save/load, checksum, interrupted temp, missing file\n";
        std::cout<<"ALL "<<checks<<" checks passed\n";
        return 0;
    } catch (const std::exception& ex) {
        std::cerr<<"[FAIL] "<<ex.what()<<" after "<<checks<<" checks\n";
        return 1;
    }
}
