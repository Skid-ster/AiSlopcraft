// Emit the entire registry-to-atlas vocabulary for the original-art generator.
#include "core/Blocks.h"
#include "core/Items.h"
#include <iostream>
#include <set>
using namespace vox;
int main() {
    std::set<std::string> tiles{"missing","white","grass_side_overlay",
        "hud_heart","hud_heart_empty","hud_hunger","hud_hunger_empty","hud_armor"};
    for (int id=1;id<BlockID::BlockIDCount;++id) {
        if (std::string(blockName((uint16_t)id))=="air") continue;
        for (int meta=0;meta<16;++meta)
            for (int face=0;face<6;++face)
                tiles.insert(blockTile((uint16_t)id,(uint8_t)meta,face));
    }
    for (int id=1;id<ItemID::ItemIDCount;++id) if(itemExists((uint16_t)id)) {
        for(int meta=0;meta<16;++meta)
            tiles.insert(itemTile((uint16_t)id,(uint16_t)meta));
    }
    for (const auto& tile : tiles) std::cout<<tile<<'\n';
}
