#include "Game.h"
#include "core/Blocks.h"
#include "core/JavaRandom.h"
#include "core/Save.h"
#include <algorithm>
#include <charconv>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <limits>
#include <utility>

namespace vox {
namespace {
using Clock=std::chrono::steady_clock;
int centerChunk(float pos) {return floorDiv16((int)std::floor(pos));}
bool isWood(uint16_t id) {
    return id==BlockID::Log||id==BlockID::Log2||id==BlockID::Planks||
           id==BlockID::Chest||id==BlockID::CraftingTable;
}
}
uint64_t Game::blockKey(Vec3i p) {return worldHash(0,p.x,p.y,p.z);}

bool Game::startup(std::string& error) {
    error.clear();
    if (!SDL_Init(SDL_INIT_VIDEO)) {
        error=std::string("SDL3 video could not start: ")+SDL_GetError();return false;
    }
    SDL_InitSubSystem(SDL_INIT_AUDIO); // optional, gameplay continues without audio
    loadSettings();
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER,1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE,24);
    window_=SDL_CreateWindow("AiSlopcraft - unofficial 1.7.3-inspired voxel sandbox",
        width_,height_,SDL_WINDOW_OPENGL|SDL_WINDOW_RESIZABLE|SDL_WINDOW_HIGH_PIXEL_DENSITY);
    if(!window_) {error=std::string("Cannot create OpenGL window: ")+SDL_GetError();return false;}
    SDL_SetWindowMinimumSize(window_,960,540);
    context_=SDL_GL_CreateContext(window_);
    if(!context_) {
        error=std::string("OpenGL 3.3 context unavailable: ")+SDL_GetError()+
              ". A real GPU/driver and a desktop display are required. "
              "For headless tests run --selftest or CTest.";
        return false;
    }
    SDL_GL_SetSwapInterval(vsync_?1:0);
    SDL_GetWindowSizeInPixels(window_,&width_,&height_);
    std::filesystem::path beside=std::filesystem::path(SDL_GetBasePath())/"assets";
    if(std::filesystem::exists(beside/"atlas.png")) assetDir_=beside;
    else if(std::filesystem::exists("assets/atlas.png")) assetDir_="assets";
    else assetDir_=VOXCRAFT_ASSET_DIR;
    if(!renderer_.init(assetDir_,error)) return false;
    std::string audioError;
    if(!audio_.init(assetDir_,audioError))std::cerr<<audioError<<'\n';
    titleWorld_=std::make_unique<World>(7137331);
    titleWorld_->setTime(6000);
    // One 3x3 menu scene, no background generation before the app starts.
    for(int z=-1;z<=1;++z)for(int x=-1;x<=1;++x)
        titleWorld_->ensureChunk(x,z);
    buildTitleMeshes();
    SDL_StartTextInput(window_);
    message_="Original art - not affiliated with Mojang or Microsoft";
    return true;
}
void Game::shutdown() {
    stopWorker();
    if(world_) save();
    saveSettings();
    capture(false);
    audio_.shutdown();
    if(context_) renderer_.shutdown();
    if(context_) SDL_GL_DestroyContext(context_);
    context_=nullptr;
    if(window_) SDL_DestroyWindow(window_);
    window_=nullptr;
    SDL_Quit();
}
int Game::run() {
    std::string error;
    if(!startup(error)) {
        std::cerr<<"AiSlopcraft startup error: "<<error<<'\n';
        shutdown();return 1;
    }
    auto previous=Clock::now(),secondStart=previous;
    double accumulator=0;
    while(running_) {
        events();
        auto now=Clock::now();
        double elapsed=std::chrono::duration<double>(now-previous).count();previous=now;
        elapsed=std::min(elapsed,0.25);accumulator+=elapsed;
        int ticks=0;
        while(accumulator>=0.05 && ticks<5) {
            if(screen_==Screen::Playing) {
                logicTick();autosaveTimer_+=0.05;
                if(autosaveTimer_>=30) {save();autosaveTimer_=0;}
            } else if(screen_==Screen::Title && titleWorld_)
                titleWorld_->setTime(titleWorld_->time()+1);
            accumulator-=0.05;++ticks;
        }
        if(ticks==5) accumulator=0; // avoid spiral of death on a slow frame
        if(world_) {streamChunks();meshBudget();}
        frame();
        ++frames_;
        double secs=std::chrono::duration<double>(now-secondStart).count();
        if(secs>=1) {fps_=frames_/secs;frames_=0;secondStart=now;}
    }
    shutdown();return 0;
}
void Game::loadSettings() {
    std::ifstream file("options.txt");std::string key;
    while(file>>key) {
        if(key=="distance") file>>renderDistance_;
        else if(key=="fov")file>>fov_;
        else if(key=="vsync")file>>vsync_;
        else if(key=="creative")file>>createCreative_;
        else if(key=="savefile") {
            std::string value;file>>value;
            std::filesystem::path path(value);
            if(!path.is_absolute() && path.extension()==".bin" &&
               path.begin()!=path.end() && (*path.begin())=="saves" &&
               value.find("..") == std::string::npos && value.size()<160)
                saveFile_=path;
        }
        else {std::string rest;std::getline(file,rest);}
    }
    renderDistance_=std::clamp(renderDistance_,2,12);
    fov_=clampf(fov_,55,110);
}
void Game::saveSettings() const {
    std::ofstream file("options.txt",std::ios::trunc);
    if(file) file<<"distance "<<renderDistance_<<"\nfov "<<fov_
                 <<"\nvsync "<<vsync_<<"\ncreative "<<createCreative_
                 <<"\nsavefile "<<saveFile_.string()<<'\n';
}
void Game::capture(bool enabled) {
    if(!window_)return;
    if(enabled && !SDL_SetWindowRelativeMouseMode(window_,true)) {
        message_=std::string("Mouse capture failed: ")+SDL_GetError();return;
    }
    if(!enabled) SDL_SetWindowRelativeMouseMode(window_,false);
    captured_=enabled;
}
void Game::startWorld(bool newWorld) {
    if(world_ && !save()) return; // never abandon an unsaved world on error
    stopWorker();
    // These UI/container objects are world-local, even though v1 saves cannot
    // yet persist them. Never carry a chest or furnace into a different seed.
    furnaces_.clear();
    chests_.clear();
    craftGrid_.fill({});
    cursor_.clear();
    target_.reset();
    miningProgress_=0;
    autosaveTimer_=0;
    player_=Player{};
    world_.reset();
    std::string error;
    if(!newWorld && std::filesystem::exists(saveFile_)) {
        PlayerSnapshot data;
        auto loaded=loadWorld(saveFile_,data,error);
        if(loaded && player_.restore(data)) {
            world_=std::move(loaded);
            message_="Loaded saved world";
        } else message_="Cannot load save: "+error+" (press N to create; original untouched)";
    }
    if(!world_) {
        if(!newWorld && std::filesystem::exists(saveFile_)) {screen_=Screen::Title;return;}
        int64_t seed=7137331;
        auto begin=seedText_.data(),end=begin+seedText_.size();
        auto [ptr,ec]=std::from_chars(begin,end,seed);
        if(ec!=std::errc{} || ptr!=end) {
            message_="Invalid seed; using fixed seed 7137331";seed=7137331;
        }
        if(newWorld) {
            // Never overwrite an older world's save when [N] is pressed.
            // Names contain only digits and a minus sign from the parsed seed.
            std::string stem="World-"+std::to_string(seed);
            auto candidate=std::filesystem::path("saves")/stem/"world.bin";
            int suffix=2;
            while(std::filesystem::exists(candidate))
                candidate=std::filesystem::path("saves")/(stem+"-"+std::to_string(suffix++))/"world.bin";
            saveFile_=candidate;
        }
        world_=std::make_unique<World>(seed,newWorldType_);
        player_.creative=createCreative_;
        int spawnY=world_->generator().heightAt(8,8)+2;
        player_.position={8.5f,(float)spawnY,8.5f};
        if(player_.creative) {
            uint16_t starters[9]={ItemID::Stone,ItemID::Grass,ItemID::Planks,
                ItemID::Glass,ItemID::Sand,ItemID::Torch,ItemID::WaterBucket,
                ItemID::OakStairs,ItemID::DiamondPickaxe};
            for(int i=0;i<9;++i)player_.inventory.set(i,{starters[i],64,0});
            player_.inventory.set(8,{ItemID::DiamondPickaxe,1,0});
        }
        message_="New world: seed "+std::to_string(seed);
    }
    Chunk& center=world_->ensureChunk(centerChunk(player_.position.x),
                                      centerChunk(player_.position.z));
    renderer_.clearMeshes(); // menu geometry belongs to a different seed
    int sy=(int)player_.position.y/16;
    for(int layer=std::max(0,sy-1);layer<=std::min(SectionCount-1,sy+1);++layer) {
        auto mesh=meshSection(*world_,center.cx,center.cz,layer,renderer_.tiles());
        renderer_.upload(center.cx,center.cz,layer,mesh);
        center.dirty[layer]=false;
    }
    screen_=Screen::Playing;
    capture(true);
    audio_.play("click");
    startWorker();
}
bool Game::save() {
    if(!world_)return true;
    std::string error;
    if(saveWorld(*world_,player_.snapshot(),saveFile_,error)) {
        message_="Saved world to "+saveFile_.string();
        return true;
    }
    message_="Save FAILED: "+error;
    std::cerr<<message_<<'\n';
    return false;
}
void Game::stopWorker() {
    {
        std::lock_guard<std::mutex> lock(workMutex_);
        stopWork_=true;workCV_.notify_all();
    }
    if(worker_.joinable())worker_.join();
    {
        std::lock_guard<std::mutex> lock(workMutex_);
        pending_.clear();finished_.clear();submitted_.clear();stopWork_=false;
    }
}
void Game::startWorker() {
    if(!world_)return;
    int64_t seed=world_->seed();
    auto type=world_->type();
    auto dim=world_->dimension();
    worker_=std::thread([this,seed,type,dim]() {
        WorldGenerator generator(seed,type,dim);
        for(;;) {
            std::pair<int,int> job;
            {
                std::unique_lock<std::mutex> lock(workMutex_);
                workCV_.wait(lock,[&]{return stopWork_||(!pending_.empty()&&finished_.size()<12);});
                if(stopWork_)return;
                job=pending_.front();pending_.pop_front();
            }
            auto built=generator.generate(job.first,job.second);
            {
                std::lock_guard<std::mutex> lock(workMutex_);
                if(stopWork_)return;
                finished_.push_back(std::move(built));
            }
        }
    });
}
void Game::streamChunks() {
    if(!world_ || screen_==Screen::Title)return;
    int cx=centerChunk(player_.position.x),cz=centerChunk(player_.position.z);
    std::vector<std::pair<int,int>> wants;
    for(int dz=-renderDistance_;dz<=renderDistance_;++dz)
        for(int dx=-renderDistance_;dx<=renderDistance_;++dx)
            wants.emplace_back(cx+dx,cz+dz);
    std::sort(wants.begin(),wants.end(),[&](const auto& a,const auto& b) {
        int da=(a.first-cx)*(a.first-cx)+(a.second-cz)*(a.second-cz);
        int db=(b.first-cx)*(b.first-cx)+(b.second-cz)*(b.second-cz);
        return da==db?a<b:da<db;
    });
    {
        std::lock_guard<std::mutex> lock(workMutex_);
        for(auto [x,z]:wants) {
            if(pending_.size()+finished_.size()>=20)break;
            if(world_->findChunk(x,z) || submitted_.contains(chunkKey(x,z)))continue;
            pending_.emplace_back(x,z);
            submitted_.insert(chunkKey(x,z));
        }
        workCV_.notify_one();
    }
    // A single finished chunk and two section uploads per frame prevent a
    // generation burst from holding the render thread hostage.
    std::unique_ptr<Chunk> incoming;
    {
        std::lock_guard<std::mutex> lock(workMutex_);
        if(!finished_.empty()) {incoming=std::move(finished_.front());finished_.pop_front();}
        workCV_.notify_one();
    }
    if(incoming)world_->installChunk(std::move(incoming));
    if(world_->loadedChunkCount()>(size_t)(2*renderDistance_+7)*(2*renderDistance_+7)) {
        world_->unloadFar(cx,cz,renderDistance_+3);
        renderer_.removeUnloaded(*world_);
        for(auto it=submitted_.begin();it!=submitted_.end();) {
            int x=(int32_t)(*it>>32),z=(int32_t)*it;
            if(std::max(std::abs(x-cx),std::abs(z-cz))>renderDistance_+3)it=submitted_.erase(it);
            else ++it;
        }
    }
}
void Game::buildTitleMeshes() {
    if(!titleWorld_) return;
    renderer_.clearMeshes();
    for(int cz=-1;cz<=1;++cz)for(int cx=-1;cx<=1;++cx)
        for(int sy=2;sy<=8;++sy) {
            auto mesh=meshSection(*titleWorld_,cx,cz,sy,renderer_.tiles());
            renderer_.upload(cx,cz,sy,mesh);
        }
}
void Game::meshBudget() {
    if(!world_)return;
    int cx=centerChunk(player_.position.x),cz=centerChunk(player_.position.z);
    struct Candidate {int cx,cz,sy,dist;};
    std::vector<Candidate> ready;
    for(const auto& [key,ch]:world_->chunks()) {
        (void)key;
        int dist=(ch->cx-cx)*(ch->cx-cx)+(ch->cz-cz)*(ch->cz-cz);
        if(dist>(renderDistance_+1)*(renderDistance_+1)*2)continue;
        for(int sy=0;sy<SectionCount;++sy)
            if(ch->dirty[sy])ready.push_back({ch->cx,ch->cz,sy,dist});
    }
    std::sort(ready.begin(),ready.end(),[&](const Candidate& a,const Candidate& b){
        if(a.dist!=b.dist)return a.dist<b.dist;
        int va=std::abs(a.sy*16-(int)player_.position.y);
        int vb=std::abs(b.sy*16-(int)player_.position.y);
        return va<vb;
    });
    int budget=2;
    for(const auto& job:ready) {
        if(!budget--)break;
        Chunk* c=world_->findChunk(job.cx,job.cz);
        if(!c||!c->dirty[job.sy])continue;
        MeshData mesh=meshSection(*world_,job.cx,job.cz,job.sy,renderer_.tiles());
        if(mesh.missingTiles)message_="Atlas missing "+std::to_string(mesh.missingTiles)+" tile references";
        renderer_.upload(job.cx,job.cz,job.sy,mesh);
        c->dirty[job.sy]=false;
    }
}
void Game::logicTick() {
    if(!world_||player_.dead)return;
    int count=0;
    const bool* keys=SDL_GetKeyboardState(&count);
    auto held=[&](SDL_Scancode code){return (int)code<count && keys[code];};
    MovementInput input;
    input.forward=(held(SDL_SCANCODE_W)?1.f:0.f)-(held(SDL_SCANCODE_S)?1.f:0.f);
    input.strafe=(held(SDL_SCANCODE_D)?1.f:0.f)-(held(SDL_SCANCODE_A)?1.f:0.f);
    input.jump=held(SDL_SCANCODE_SPACE);
    input.sneak=held(SDL_SCANCODE_LSHIFT)||held(SDL_SCANCODE_RSHIFT);
    input.sprint=held(SDL_SCANCODE_LCTRL)||held(SDL_SCANCODE_RCTRL);
    input.descend=input.sneak;
    player_.tick(*world_,input);
    world_->tick();
    for(auto& [key,f] : furnaces_) { (void)key;f.tick(); }
    target_=world_->raycast(player_.eye(),player_.lookDirection(),player_.creative?5.f:4.5f);
    if(mouseLeft_ && captured_ && target_) {
        if(target_->pos!=miningPos_) {miningPos_=target_->pos;miningProgress_=0;}
        const auto& s=player_.inventory.at((size_t)player_.selected);
        const ItemDef& item=itemDef(s.id);
        int tier=item.tier==4?0:item.tier;
        float seconds=player_.creative?0.05f :
            breakTime(target_->block.id,target_->block.meta,item.tool,tier,
                      player_.onGround,false);
        if(item.tier==4 && seconds>0 && canHarvest(target_->block.id,target_->block.meta,item.tool,0))
            seconds*=2.f/12.f;
        if(seconds>=0 && (miningProgress_+=0.05f)>=seconds) {
            breakTarget();miningProgress_=0;
        }
    } else {miningProgress_=0;miningPos_.x=INT32_MIN;}
    if(player_.dead) {screen_=Screen::Death;capture(false);audio_.play("hurt");}
}
void Game::breakTarget() {
    if(!world_||!target_)return;
    auto block=target_->block;
    if(blockDef(block.id).hardness<0 && !player_.creative)return;
    Vec3i p=target_->pos;
    if(!world_->setBlock(p.x,p.y,p.z,{}))return;
    audio_.play(isWood(block.id)?"break_wood":"break_stone");
    if(!player_.creative) {
        const ItemStack& held=player_.inventory.at((size_t)player_.selected);
        const auto& tool=itemDef(held.id);
        int tier=tool.tier==4?0:tool.tier;
        bool harvest=canHarvest(block.id,block.meta,tool.tool,tier);
        if(harvest) {
            JavaRandom rng((int64_t)worldHash(world_->seed(),p.x,p.y,p.z));
            ItemStack drop=blockDrop(block.id,block.meta,rng);
            if(!drop.empty() && player_.inventory.insert(drop)==0)audio_.play("pickup");
            else if(!drop.empty())message_="Inventory full: dropped item not retained";
        }
        if(held.isDamageable()) player_.inventory.damage((size_t)player_.selected);
    }
    target_.reset();
}
void Game::placeOrUse() {
    if(!world_)return;
    int slot=player_.selected;
    ItemStack selected=player_.inventory.at((size_t)slot);
    if(selected.id==ItemID::Bucket) {
        auto liquid=world_->raycast(player_.eye(),player_.lookDirection(),4.5f,true);
        if(liquid && (liquid->block.id==BlockID::Water || liquid->block.id==BlockID::Lava)) {
            world_->setBlock(liquid->pos.x,liquid->pos.y,liquid->pos.z,{});
            if(!player_.creative)player_.inventory.set((size_t)slot,
                {liquid->block.id==BlockID::Water?ItemID::WaterBucket:ItemID::LavaBucket,1,0});
            audio_.play("splash");return;
        }
    }
    if(!target_)return;
    Vec3i p=target_->pos;
    uint16_t id=target_->block.id;
    if(id==BlockID::CraftingTable) {
        screen_=Screen::Crafting;capture(false);audio_.play("click");return;
    }
    if(id==BlockID::Furnace||id==BlockID::LitFurnace) {
        openedBlock_=p;furnaces_.try_emplace(blockKey(p));
        screen_=Screen::Furnace;capture(false);audio_.play("click");return;
    }
    if(id==BlockID::Chest||id==BlockID::TrappedChest) {
        openedBlock_=p;chests_.try_emplace(blockKey(p),27);
        screen_=Screen::Chest;capture(false);audio_.play("click");return;
    }
    if(id==BlockID::WoodenDoor||id==BlockID::Trapdoor||id==BlockID::FenceGate||id==BlockID::Lever) {
        world_->setBlock(p.x,p.y,p.z,{id,(uint8_t)(target_->block.meta^4)});
        audio_.play("click");return;
    }
    if(selected.empty())return;
    if(player_.eat(slot)) {audio_.play("pickup");return;}
    uint16_t place=blockIdForItem(selected.id);
    if(selected.id==ItemID::WoodenDoorItem)place=BlockID::WoodenDoor;
    if(selected.id==ItemID::IronDoorItem)place=BlockID::IronDoor;
    if(selected.id==ItemID::Bed)place=BlockID::Bed;
    if(selected.id==ItemID::Cake)place=BlockID::Cake;
    if(selected.id==ItemID::WheatSeeds)place=BlockID::Wheat;
    if(selected.id==ItemID::Carrot)place=BlockID::Carrots;
    if(selected.id==ItemID::Potato)place=BlockID::Potatoes;
    if(selected.id==ItemID::Reeds)place=BlockID::Reeds;
    if(selected.id==ItemID::NetherWart)place=BlockID::NetherWart;
    if(selected.id==ItemID::WaterBucket)place=BlockID::Water;
    if(selected.id==ItemID::LavaBucket)place=BlockID::Lava;
    if(!place)return;
    Vec3i dest=p+dirOffset(target_->face);
    if(dest.y<0||dest.y>=WorldHeight ||
       !isAirLike(world_->blockAt(dest.x,dest.y,dest.z).id))return;
    if((place==BlockID::WoodenDoor||place==BlockID::IronDoor) &&
       (dest.y+1>=WorldHeight || !isAirLike(world_->blockAt(dest.x,dest.y+1,dest.z).id)))return;
    if((place==BlockID::Wheat||place==BlockID::Carrots||place==BlockID::Potatoes) &&
       world_->blockAt(dest.x,dest.y-1,dest.z).id!=BlockID::Farmland)return;
    AABB shape;
    uint8_t meta=(uint8_t)(selected.meta&15);
    if(place==BlockID::WoodenDoor||place==BlockID::IronDoor)meta=0;
    if(place==BlockID::Log||place==BlockID::Log2) {
        meta&=3;
        if(target_->face==East||target_->face==West)meta|=4;
        else if(target_->face==North||target_->face==South)meta|=8;
    }
    if(place==BlockID::StoneSlab||place==BlockID::WoodenSlab) {
        meta&=7;if(target_->face==Down)meta|=8;
    }
    if(blockCollision(place,meta,dest.x,dest.y,dest.z,shape) &&
       shape.intersects(player_.bounds()))return;
    if(world_->setBlock(dest.x,dest.y,dest.z,{place,meta})) {
        if(!player_.creative) {
            if(selected.id==ItemID::WaterBucket||selected.id==ItemID::LavaBucket)
                player_.inventory.set((size_t)slot,{ItemID::Bucket,1,0});
            else player_.inventory.take((size_t)slot,1);
        }
        if(place==BlockID::WoodenDoor||place==BlockID::IronDoor)
            world_->setBlock(dest.x,dest.y+1,dest.z,{place,8});
        audio_.play("place");
    }
}
void Game::events() {
    SDL_Event e;
    while(SDL_PollEvent(&e)) {
        switch(e.type) {
            case SDL_EVENT_QUIT:
                // A window close is not permission to discard edits when the
                // filesystem is full or read-only. Keep the game open and show
                // the failure so the player can resolve it or copy the save.
                if(!world_ || save()) running_=false;
                break;
            case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
                SDL_GetWindowSizeInPixels(window_,&width_,&height_);break;
            case SDL_EVENT_KEY_DOWN:
                if(!e.key.repeat)key(e.key.scancode);
                break;
            case SDL_EVENT_MOUSE_MOTION:
                if(captured_ && screen_==Screen::Playing)
                    player_.look(e.motion.xrel*sensitivity_,-e.motion.yrel*sensitivity_);
                else {
                    int w=width_,h=height_;
                    SDL_GetWindowSize(window_,&w,&h);
                    mouseX_=e.motion.x*width_/std::max(1,w);
                    mouseY_=e.motion.y*height_/std::max(1,h);
                }
                break;
            case SDL_EVENT_MOUSE_BUTTON_DOWN: {
                int w=width_,h=height_;SDL_GetWindowSize(window_,&w,&h);
                mouseButton(e.button.button,e.button.x*width_/std::max(1,w),
                            e.button.y*height_/std::max(1,h));break;
            }
            case SDL_EVENT_MOUSE_BUTTON_UP:
                if(e.button.button==SDL_BUTTON_LEFT)mouseLeft_=false;
                break;
            case SDL_EVENT_MOUSE_WHEEL:
                if(screen_==Screen::Playing)
                    player_.selected=(player_.selected+9-(int)std::copysign(1.f,e.wheel.y))%9;
                break;
            case SDL_EVENT_TEXT_INPUT:
                if(screen_==Screen::Title && seedText_.size()<18) {
                    for(const char* c=e.text.text;*c;++c)
                        if((*c>='0'&&*c<='9')||(*c=='-'&&seedText_.empty()))seedText_+=*c;
                }
                break;
            default:break;
        }
    }
}
void Game::key(SDL_Scancode k) {
    if(k==SDL_SCANCODE_F2) {screenshotRequested_=true;return;}
    if(k==SDL_SCANCODE_F3) {debug_=!debug_;return;}
    if(k==SDL_SCANCODE_F1) {hideHud_=!hideHud_;return;}
    if(screen_==Screen::Title) {
        if(k==SDL_SCANCODE_RETURN||k==SDL_SCANCODE_L)startWorld(false);
        else if(k==SDL_SCANCODE_N)startWorld(true);
        else if(k==SDL_SCANCODE_C)createCreative_=!createCreative_;
        else if(k==SDL_SCANCODE_P)newWorldType_=(WorldType)(((int)newWorldType_+1)%4);
        else if(k==SDL_SCANCODE_BACKSPACE && !seedText_.empty())seedText_.pop_back();
        else if(k==SDL_SCANCODE_ESCAPE)running_=false;
        return;
    }
    if(screen_==Screen::Options) {
        if(k==SDL_SCANCODE_ESCAPE){screen_=Screen::Pause;saveSettings();}
        else if(k==SDL_SCANCODE_EQUALS||k==SDL_SCANCODE_KP_PLUS)
            renderDistance_=std::min(12,renderDistance_+1);
        else if(k==SDL_SCANCODE_MINUS||k==SDL_SCANCODE_KP_MINUS)
            renderDistance_=std::max(2,renderDistance_-1);
        else if(k==SDL_SCANCODE_LEFTBRACKET)fov_=std::max(55.f,fov_-5);
        else if(k==SDL_SCANCODE_RIGHTBRACKET)fov_=std::min(110.f,fov_+5);
        else if(k==SDL_SCANCODE_V) {vsync_=!vsync_;SDL_GL_SetSwapInterval(vsync_?1:0);}
        else if(k==SDL_SCANCODE_M)audio_.muted=!audio_.muted;
        return;
    }
    if(screen_==Screen::Death) {
        if(k==SDL_SCANCODE_RETURN||k==SDL_SCANCODE_SPACE) {
            int spawn=world_->generator().heightAt(8,8)+2;
            player_.respawn({8.5f,(float)spawn,8.5f});
            screen_=Screen::Playing;capture(true);
        }
        return;
    }
    if(screen_==Screen::Pause) {
        if(k==SDL_SCANCODE_ESCAPE||k==SDL_SCANCODE_RETURN) {
            screen_=Screen::Playing;capture(true);
        } else if(k==SDL_SCANCODE_O)screen_=Screen::Options;
        else if(k==SDL_SCANCODE_F5)save();
        else if(k==SDL_SCANCODE_Q && save()) {
            stopWorker();world_.reset();screen_=Screen::Title;buildTitleMeshes();
        }
        return;
    }
    if(screen_==Screen::Inventory||screen_==Screen::Crafting||
       screen_==Screen::Furnace||screen_==Screen::Chest) {
        if(k==SDL_SCANCODE_ESCAPE||k==SDL_SCANCODE_E)closeInventory();
        return;
    }
    if(screen_==Screen::Playing) {
        if(k==SDL_SCANCODE_ESCAPE) {screen_=Screen::Pause;capture(false);mouseLeft_=false;}
        else if(k==SDL_SCANCODE_E) {screen_=Screen::Inventory;capture(false);mouseLeft_=false;}
        else if(k==SDL_SCANCODE_F5)save();
        else if(k==SDL_SCANCODE_F && player_.creative)player_.flying=!player_.flying;
        else if(k==SDL_SCANCODE_G) {player_.creative=!player_.creative;message_=player_.creative?"Creative mode":"Survival mode";}
        else if(k==SDL_SCANCODE_Q) {player_.inventory.take((size_t)player_.selected,1);message_="Discarded one item";}
        else if(k>=SDL_SCANCODE_1 && k<=SDL_SCANCODE_9)
            player_.selected=k-SDL_SCANCODE_1;
    }
}
void Game::mouseButton(int button,float x,float y) {
    mouseX_=x;mouseY_=y;
    if(screen_==Screen::Playing) {
        if(!captured_) {capture(true);return;}
        if(button==SDL_BUTTON_LEFT)mouseLeft_=true;
        if(button==SDL_BUTTON_RIGHT)placeOrUse();
        return;
    }
    if(screen_==Screen::Inventory||screen_==Screen::Crafting||
       screen_==Screen::Furnace||screen_==Screen::Chest) {
        inventoryClick(x,y,button==SDL_BUTTON_RIGHT);return;
    }
    if(button!=SDL_BUTTON_LEFT)return;
    float center=width_/2.f;
    if(screen_==Screen::Title) {
        float mid=height_/2.f;
        if(x>center-220 && x<center+220 && y>mid && y<mid+55)startWorld(false);
        else if(x>center-220&&x<center+220&&y>mid+65&&y<mid+120)startWorld(true);
        else if(x>center-220&&x<center+220&&y>mid+130&&y<mid+185)createCreative_=!createCreative_;
        else if(x>center-220&&x<center+220&&y>mid+195&&y<mid+250)running_=false;
    } else if(screen_==Screen::Pause) {
        if(y>height_/2.f-55&&y<height_/2.f) {screen_=Screen::Playing;capture(true);}
        else if(y>height_/2.f+5&&y<height_/2.f+60)screen_=Screen::Options;
        else if(y>height_/2.f+65&&y<height_/2.f+120)save();
        else if(y>height_/2.f+125&&y<height_/2.f+180 && save()) {
            stopWorker();world_.reset();screen_=Screen::Title;buildTitleMeshes();
        }
    } else if(screen_==Screen::Death) {
        int spawn=world_->generator().heightAt(8,8)+2;
        player_.respawn({8.5f,(float)spawn,8.5f});
        screen_=Screen::Playing;capture(true);
    }
}
void Game::interact() { placeOrUse(); }
void Game::frame() {
    if(!window_)return;
    if(world_ && screen_!=Screen::Title) {
        renderer_.drawWorld(*world_,player_.eye(),player_.lookDirection(),
                            width_,height_,fov_,renderDistance_);
    }else if(titleWorld_) {
        float surface=(float)titleWorld_->generator().heightAt(8,8);
        Vec3f eye{8.f,surface+12.f,21.f};
        renderer_.drawWorld(*titleWorld_,eye,Vec3f{0,-0.32f,-1},
                            width_,height_,fov_,3);
    }
    renderer_.uiBegin(width_,height_);
    switch(screen_) {
        case Screen::Title:drawTitle();break;
        case Screen::Playing:drawHud();break;
        case Screen::Pause:drawPause();break;
        case Screen::Options:drawOptions();break;
        case Screen::Inventory:case Screen::Crafting:case Screen::Furnace:case Screen::Chest:
            drawInventory();break;
        case Screen::Death:drawDeath();break;
    }
    renderer_.uiDraw();
    if(screenshotRequested_) {
        screenshotRequested_=false;
        std::string err;
        auto path=std::filesystem::path("screenshots")/
            ("aislopcraft-"+std::to_string(SDL_GetTicks())+".png");
        if(renderer_.screenshot(path,width_,height_,err))message_="Screenshot: "+path.string();
        else message_="Screenshot failed: "+err;
    }
    SDL_GL_SwapWindow(window_);
}

} // namespace vox
