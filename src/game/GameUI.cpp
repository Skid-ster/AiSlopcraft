#include "Game.h"
#include "core/Blocks.h"
#include <algorithm>
#include <cmath>
#include <sstream>

namespace vox {
int Game::uiScale() const {return height_>=1100?2:1;}
void Game::button(float x,float y,float w,const std::string& label,bool selected) {
    renderer_.uiRect(x+3,y+4,w,48,0x0d121a,0.8f);
    renderer_.uiRect(x,y,w,48,selected?0xb8c69b:0x6d7e87,0.97f);
    renderer_.uiRect(x+3,y+3,w-6,42,selected?0x314b37:0x27353e,1.f);
    float textScale=uiScale()==2?1.6f:1.2f;
    float width=label.size()*11.f*textScale;
    renderer_.uiText(label,x+(w-width)*0.5f,y+13,textScale,
                     selected?0xe9efc1:0xe3e8e7);
}
void Game::drawTitle() {
    float mid=height_/2.f,cx=width_/2.f;
    renderer_.uiRect(cx-290,mid-193,580,455,0x111b28,0.82f);
    renderer_.uiRect(cx-288,mid-191,576,451,0x304659,0.32f);
    renderer_.uiText("AI SLOPCRAFT",cx-205,mid-170,2.2f,0xf8da8a);
    renderer_.uiText("A VOXEL WORLD OF YOUR OWN",cx-186,mid-127,1.1f,0xdbead8);
    renderer_.uiText("Unofficial 2013 release 1.7.3-inspired sandbox",cx-242,mid-92,0.95f,0xaec6ca);
    renderer_.uiText("Not affiliated with Mojang or Microsoft",cx-227,mid-72,0.95f,0xaec6ca);
    renderer_.uiText("Seed: "+seedText_+"_   [P] world type: "+
        std::string(newWorldType_==WorldType::Default?"Default":
        newWorldType_==WorldType::Flat?"Superflat":
        newWorldType_==WorldType::LargeBiomes?"Large Biomes":"Amplified"),
        cx-260,mid-32,0.9f,0xf5ecc5);
    button(cx-220,mid,440,"PLAY / LOAD LAST [ENTER]");
    button(cx-220,mid+65,440,"CREATE NEW WORLD [N]");
    button(cx-220,mid+130,440,createCreative_?"MODE: CREATIVE [C]":"MODE: SURVIVAL [C]",createCreative_);
    button(cx-220,mid+195,440,"QUIT [ESC]");
    if(!message_.empty())renderer_.uiText(message_,std::max(12.f,cx-300),height_-30,0.8f,0xf4d891);
}
void Game::drawHud() {
    if(!world_)return;
    int s=uiScale();float size=42.f*s;
    float left=width_/2.f-9*size/2.f;
    if(!hideHud_) {
        renderer_.uiRect(left-6,height_-size-14*s,9*size+12,size+14*s,0x111921,0.75f);
        for(int i=0;i<9;++i) {
            bool active=i==player_.selected;
            renderer_.uiRect(left+i*size,height_-size-8*s,size-2,size-2,
                             active?0xe3e1b4:0x546473,active?1.f:0.8f);
            renderer_.uiRect(left+i*size+3,height_-size-5*s,size-8,size-8,0x222c32,0.95f);
            const auto& item=player_.inventory.at((size_t)i);
            if(!item.empty()) {
                renderer_.uiSprite(itemTile(item.id,item.meta),left+i*size+7*s,
                                    height_-size-1*s,26.f*s);
                if(item.count>1)renderer_.uiText(std::to_string(item.count),
                    left+i*size+(size-21*s),height_-19*s,0.72f*s,0xffffff);
            }
        }
        for(int i=0;i<10;++i) {
            renderer_.uiSprite(i*2<player_.health?"hud_heart":"hud_heart_empty",
                               left+18*s*i,height_-size-41*s,18.f*s);
            renderer_.uiSprite(i*2<player_.hunger?"hud_hunger":"hud_hunger_empty",
                               left+9*size-(i+1)*18*s,height_-size-41*s,18.f*s);
        }
        renderer_.uiRect(left+5*s,height_-size-19*s,9*size-10*s,6*s,0x192c38);
        renderer_.uiRect(left+5*s,height_-size-19*s,
            (9*size-10*s)*((player_.experience%100)/100.f),6*s,0x75b35a);
        float center=width_/2.f;
        renderer_.uiRect(center-10*s,height_/2.f,7*s,2*s,0xe9efef,0.84f);
        renderer_.uiRect(center+3*s,height_/2.f,7*s,2*s,0xe9efef,0.84f);
        renderer_.uiRect(center-1*s,height_/2.f-9*s,2*s,7*s,0xe9efef,0.84f);
        renderer_.uiRect(center-1*s,height_/2.f+4*s,2*s,7*s,0xe9efef,0.84f);
        if(target_) {
            auto name=blockDef(target_->block.id).displayName;
            renderer_.uiText(name,width_/2.f-std::string(name).size()*5.5f*s,
                             height_-size-63*s,0.8f*s,0xf5f3db);
        }
    }
    if(debug_) {
        float y=12;
        auto line=[&](std::string text) {
            renderer_.uiRect(7,y-1,(float)text.size()*11+12,17,0x0c1720,0.65f);
            renderer_.uiText(text,12,y,0.9f,0xe9efec);y+=18;
        };
        line("AISLOPCRAFT / RELEASE 1.7.3 TARGET - NOT A PARITY CLAIM");
        line("FPS: "+std::to_string((int)std::lround(fps_))+"  CHUNKS: "+
             std::to_string(world_->loadedChunkCount())+"  VIEW: "+std::to_string(renderDistance_));
        line("XYZ: "+std::to_string((int)player_.position.x)+" / "+
             std::to_string((int)player_.position.y)+" / "+
             std::to_string((int)player_.position.z));
        int cx=floorDiv16((int)std::floor(player_.position.x));
        int cz=floorDiv16((int)std::floor(player_.position.z));
        const Chunk* chunk=world_->findChunk(cx,cz);
        if(chunk)line(std::string("BIOME: ")+biomeName(chunk->biomes[
            floorMod16((int)std::floor(player_.position.z))*16+
            floorMod16((int)std::floor(player_.position.x))])+"  SEED: "+std::to_string(world_->seed()));
        line("TICKS: "+std::to_string(world_->time()%24000)+"  MODE: "+
            (player_.creative?"CREATIVE":"SURVIVAL")+(player_.flying?" / FLY":""));
        line("GL: "+renderer_.driver());
    }
    if(!message_.empty())renderer_.uiText(message_,12,height_-size-83*s,0.8f,0xf5d89b);
}
void Game::slot(float x,float y,const ItemStack& item,bool chosen) {
    int s=uiScale();float size=35.f*s;
    renderer_.uiRect(x,y,size,size,chosen?0xc4d5ab:0x63747a);
    renderer_.uiRect(x+2*s,y+2*s,size-4*s,size-4*s,0x242e34);
    if(item.empty())return;
    renderer_.uiSprite(itemTile(item.id,item.meta),x+4*s,y+4*s,26.f*s);
    if(item.count>1)renderer_.uiText(std::to_string(item.count),x+18*s,y+23*s,
                                    0.68f*s,0xf7f7ed);
}
void Game::drawInventory() {
    int s=uiScale();float x=width_/2.f-305*s,y=height_/2.f-220*s;
    renderer_.uiRect(0,0,(float)width_,(float)height_,0x080d15,0.54f);
    renderer_.uiRect(x,y,610*s,450*s,0x101d26,0.97f);
    renderer_.uiRect(x+4*s,y+4*s,602*s,442*s,0x8b9890,0.14f);
    std::string title=screen_==Screen::Inventory?"INVENTORY / 2x2 CRAFTING":
        screen_==Screen::Crafting?"CRAFTING TABLE / 3x3":
        screen_==Screen::Furnace?"FURNACE / SMELTING":"CHEST / STORAGE";
    renderer_.uiText(title,x+20*s,y+18*s,1.05f*s,0xf4e9c8);
    renderer_.uiText("Left: take/place   Right: split/one   E / ESC: close",
                      x+20*s,y+46*s,0.7f*s,0xc8d7d7);
    if(screen_==Screen::Inventory||screen_==Screen::Crafting) {
        int side=screen_==Screen::Crafting?3:2;
        renderer_.uiText("CRAFT",x+420*s,y+66*s,0.85f*s,0xcdd9c5);
        for(int i=0;i<side*side;++i) {
            int a=i%side,b=i/side;
            slot(x+(420+a*40)*s,y+(91+b*40)*s,craftGrid_[i]);
        }
        auto result=craftResult(craftGrid_,side);
        renderer_.uiText("->",x+535*s,y+146*s,0.85f*s,0xf5edc8);
        slot(x+560*s,y+141*s,result.value_or(ItemStack{}),result.has_value());
        renderer_.uiText("Click output to craft",x+410*s,y+215*s,0.72f*s,0xcdd8cf);
    } else if(screen_==Screen::Furnace) {
        auto& f=furnaces_[blockKey(openedBlock_)];
        renderer_.uiText("INPUT",x+410*s,y+76*s,0.75f*s);
        slot(x+425*s,y+99*s,f.input);
        renderer_.uiText("FUEL",x+410*s,y+139*s,0.75f*s);
        slot(x+425*s,y+160*s,f.fuel);
        renderer_.uiText("=>",x+477*s,y+139*s,1.f*s,0xf6d088);
        slot(x+530*s,y+130*s,f.output);
        renderer_.uiRect(x+420*s,y+205*s,155*s,7*s,0x314047);
        renderer_.uiRect(x+420*s,y+205*s,155*s*f.cook/Furnace::cookDuration,7*s,0xe4ac67);
        renderer_.uiText("BURN: "+std::to_string(f.burnLeft),x+410*s,y+220*s,0.7f*s);
    } else {
        renderer_.uiText("CHEST CONTENTS (not yet saved)",x+16*s,y+67*s,0.8f*s,0xf3d394);
        auto& chest=chests_.at(blockKey(openedBlock_));
        for(int i=0;i<27;++i)slot(x+(20+(i%9)*40)*s,y+(95+(i/9)*40)*s,chest.at((size_t)i));
    }
    renderer_.uiText("YOUR PACK",x+20*s,y+228*s,0.9f*s,0xe5e9d8);
    for(int row=0;row<4;++row)for(int col=0;col<9;++col) {
        int index=row==3?col:9+row*9+col;
        slot(x+(20+col*40)*s,y+(251+row*40)*s,player_.inventory.at((size_t)index),
             row==3&&col==player_.selected);
    }
    if(!cursor_.empty()) {
        renderer_.uiSprite(itemTile(cursor_.id,cursor_.meta),mouseX_-14*s,mouseY_-14*s,28.f*s);
        if(cursor_.count>1)renderer_.uiText(std::to_string(cursor_.count),mouseX_+8*s,
                                            mouseY_+8*s,0.8f*s);
    }
    if(!message_.empty())renderer_.uiText(message_,x+20*s,y+418*s,0.68f*s,0xf2cc91);
}
void Game::drawPause() {
    float mid=height_/2.f,cx=width_/2.f;
    renderer_.uiRect(0,0,(float)width_,(float)height_,0x071120,0.62f);
    renderer_.uiText("PAUSED",cx-75,mid-155,2.f,0xf3e4b6);
    button(cx-220,mid-55,440,"RESUME [ESC]");
    button(cx-220,mid+5,440,"OPTIONS [O]");
    button(cx-220,mid+65,440,"SAVE WORLD [F5]");
    button(cx-220,mid+125,440,"SAVE AND TITLE [Q]");
    if(!message_.empty())renderer_.uiText(message_,cx-210,mid+200,0.85f,0xd5e3ca);
}
void Game::drawOptions() {
    float mid=height_/2.f,cx=width_/2.f;
    renderer_.uiRect(0,0,(float)width_,(float)height_,0x071120,0.75f);
    renderer_.uiRect(cx-320,mid-220,640,455,0x273540,0.95f);
    renderer_.uiText("VIDEO / AUDIO OPTIONS",cx-245,mid-185,1.5f,0xf3d78d);
    renderer_.uiText("Render distance   [-] / [+]: "+std::to_string(renderDistance_)+" chunks",
        cx-260,mid-115,1.f);
    renderer_.uiText("Field of view     [ / ]: "+std::to_string((int)fov_)+" degrees",
        cx-260,mid-65,1.f);
    renderer_.uiText(std::string("VSync            [V]: ")+(vsync_?"ON":"OFF"),cx-260,mid-15,1.f);
    renderer_.uiText(std::string("Sound            [M]: ")+(audio_.muted?"MUTED":"ON"),
        cx-260,mid+35,1.f);
    renderer_.uiText("Mouse sensitivity: fixed 0.13 (remapping pending)",cx-260,mid+100,0.8f,0xcbd2c8);
    renderer_.uiText("ESC: save settings and return",cx-260,mid+160,0.9f,0xf1d699);
}
void Game::drawDeath() {
    float mid=height_/2.f,cx=width_/2.f;
    renderer_.uiRect(0,0,(float)width_,(float)height_,0x7c2530,0.68f);
    renderer_.uiText("YOU DIED",cx-105,mid-130,2.f,0xffe2d4);
    renderer_.uiText("Death mechanics and dropped items are still incomplete.",cx-270,mid-60,0.9f);
    button(cx-220,mid,440,"RESPAWN [ENTER]");
}
void Game::closeInventory() {
    for(auto& item:craftGrid_) if(!item.empty()) {
        int left=player_.inventory.insert(item);
        if(left>0) {item.count=(uint8_t)left;message_="Pack full: clear a slot before closing";return;}
        item.clear();
    }
    if(!cursor_.empty()) {
        int left=player_.inventory.insert(cursor_);
        if(left>0) {cursor_.count=(uint8_t)left;message_="Pack full: clear a slot before closing";return;}
        cursor_.clear();
    }
    screen_=Screen::Playing;capture(true);
}
void Game::inventoryClick(float px,float py,bool right) {
    int s=uiScale();float x=width_/2.f-305*s,y=height_/2.f-220*s;
    auto inside=[&](float sx,float sy){return px>=sx&&px<sx+35*s&&py>=sy&&py<sy+35*s;};
    auto clickStack=[&](ItemStack& slot) {
        if(cursor_.empty()) {
            if(slot.empty())return;
            int n=right?((int)slot.count+1)/2:slot.count;
            cursor_={slot.id,(uint8_t)n,slot.meta};
            slot.count-=(uint8_t)n;if(!slot.count)slot.clear();
        } else if(slot.empty()) {
            int n=right?1:cursor_.count;
            slot={cursor_.id,(uint8_t)n,cursor_.meta};
            cursor_.count-=(uint8_t)n;if(!cursor_.count)cursor_.clear();
        } else if(slot.stackableWith(cursor_) && slot.count<slot.maxStack()) {
            int n=std::min((int)slot.maxStack()-slot.count,right?1:(int)cursor_.count);
            slot.count+=(uint8_t)n;cursor_.count-=(uint8_t)n;
            if(!cursor_.count)cursor_.clear();
        } else if(!right) std::swap(cursor_,slot);
        audio_.play("click");
    };
    for(int row=0;row<4;++row)for(int col=0;col<9;++col) {
        if(inside(x+(20+col*40)*s,y+(251+row*40)*s)) {
            int index=row==3?col:9+row*9+col;
            ItemStack item=player_.inventory.at((size_t)index);
            clickStack(item);
            player_.inventory.set((size_t)index,item);
            return;
        }
    }
    if(screen_==Screen::Inventory||screen_==Screen::Crafting) {
        int side=screen_==Screen::Crafting?3:2;
        for(int i=0;i<side*side;++i) {
            if(inside(x+(420+i%side*40)*s,y+(91+i/side*40)*s)) {
                clickStack(craftGrid_[i]);return;
            }
        }
        if(inside(x+560*s,y+141*s)) {
            auto result=craftResult(craftGrid_,side);
            if(!result)return;
            if(!cursor_.empty() && (!cursor_.stackableWith(*result) ||
                 cursor_.count+result->count>cursor_.maxStack()))return;
            ItemStack made=craftOnce(craftGrid_,side);
            if(cursor_.empty())cursor_=made;
            else cursor_.count+=made.count;
            audio_.play("pickup");return;
        }
    }else if(screen_==Screen::Furnace) {
        Furnace& f=furnaces_.at(blockKey(openedBlock_));
        if(inside(x+425*s,y+99*s))clickStack(f.input);
        else if(inside(x+425*s,y+160*s))clickStack(f.fuel);
        else if(inside(x+530*s,y+130*s) && cursor_.empty())clickStack(f.output);
    } else if(screen_==Screen::Chest) {
        Inventory& chest=chests_.at(blockKey(openedBlock_));
        for(int i=0;i<27;++i)if(inside(x+(20+i%9*40)*s,y+(95+i/9*40)*s)) {
            ItemStack item=chest.at((size_t)i);
            clickStack(item);chest.set((size_t)i,item);return;
        }
    }
}
} // namespace vox
