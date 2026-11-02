#pragma once
#include "World.h"
#include <cstddef>
#include <filesystem>
#include <string>

namespace rebuild {

// An independent, versioned, checksum-protected study save. Never interprets
// or overwrites the legacy 'saves/' format. Only block edits, camera and slot
// are persisted; not a Java Anvil/NBT save or a complete survival world.
struct LoadStatus {
    bool loaded=false;
    bool backup=false;
    size_t edits=0;
    std::string message;
};

// Destination is caller-supplied for tests; the game uses only the fixed path
// saves-rebuild/study-v1.bin. Writes a .tmp then atomically replaces destination;
// previous data remains available as .bak. On error, the old destination stays.
bool saveStudy(const World& world,const Player& player,int slot,
               const std::filesystem::path& file,std::string& error);

// Returns default/unmodified World and Player if neither primary nor backup
// passes strict validation. Does not delete or overwrite a damaged save.
LoadStatus loadStudy(World& world,Player& player,int& slot,
                     const std::filesystem::path& file);

} // namespace rebuild
