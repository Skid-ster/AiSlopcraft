cmake_minimum_required(VERSION 3.20)

project(AiSlopcraft
    VERSION 0.1.0
    DESCRIPTION "AiSlopcraft - an unofficial native C++ voxel sandbox inspired by Minecraft Java Edition 1.7.3"
    LANGUAGES C CXX)

# ---------------------------------------------------------------------------
# Global settings
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "RelWithDebInfo")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(VOXCRAFT_BUILD_APP   "Build the game application (requires SDL3 + OpenGL)" ON)
option(VOXCRAFT_BUILD_TESTS "Build the automated test suite"                      ON)
option(VOXCRAFT_BUILD_TOOLS "Build developer asset-audit utilities"               ON)
option(VOXCRAFT_FETCH_SDL3  "Download and build SDL3 automatically if not found"  ON)

# Pinned dependency: SDL3 3.4.18 (zlib license).
# The URL below is the immutable git-archive snapshot of the release tag.
set(VOXCRAFT_SDL3_URL
    "https://codeload.github.com/libsdl-org/SDL/tar.gz/refs/tags/release-3.4.18"
    CACHE STRING "SDL3 source archive URL")
set(VOXCRAFT_SDL3_SHA256
    "c4b08b950bd29d83caae0ab8d884298d27046a9d30700fb42841c50992665c90"
    CACHE STRING "SHA256 of the SDL3 source archive")

find_package(Threads REQUIRED)

# ---------------------------------------------------------------------------
# Compiler warnings
# ---------------------------------------------------------------------------
add_library(voxcraft_warnings INTERFACE)
if(MSVC)
    target_compile_options(voxcraft_warnings INTERFACE /W4 /permissive- /Zc:__cplusplus /utf-8)
    target_compile_definitions(voxcraft_warnings INTERFACE
        _CRT_SECURE_NO_WARNINGS NOMINMAX WIN32_LEAN_AND_MEAN)
else()
    target_compile_options(voxcraft_warnings INTERFACE
        -Wall -Wextra -Wshadow -Wnon-virtual-dtor -Wpedantic)
endif()

# ---------------------------------------------------------------------------
# Core simulation library (platform independent, no SDL/GL)
# ---------------------------------------------------------------------------
file(GLOB VOXCORE_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/src/core/*.cpp)
add_library(voxcore STATIC ${VOXCORE_SOURCES})
target_include_directories(voxcore PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(voxcore PUBLIC Threads::Threads PRIVATE voxcraft_warnings)
target_compile_definitions(voxcore PUBLIC
    VOXCRAFT_ASSET_DIR="${CMAKE_CURRENT_SOURCE_DIR}/assets")

if(VOXCRAFT_BUILD_TOOLS)
    add_executable(dump_tiles tools/dump_tiles.cpp)
    target_link_libraries(dump_tiles PRIVATE voxcore voxcraft_warnings)
endif()

# ---------------------------------------------------------------------------
# Game application (SDL3 + OpenGL 3.3)
# ---------------------------------------------------------------------------
if(VOXCRAFT_BUILD_APP)
    find_package(SDL3 3.2 QUIET)
    if(NOT SDL3_FOUND AND VOXCRAFT_FETCH_SDL3)
        message(STATUS "SDL3 not found locally - fetching pinned SDL3 3.4.18 ...")
        include(FetchContent)
        set(SDL_SHARED OFF CACHE BOOL "" FORCE)
        set(SDL_STATIC ON  CACHE BOOL "" FORCE)
        set(SDL_TEST_LIBRARY OFF CACHE BOOL "" FORCE)
        set(SDL_TESTS OFF CACHE BOOL "" FORCE)
        set(SDL_DISABLE_INSTALL OFF CACHE BOOL "" FORCE)
        FetchContent_Declare(SDL3
            URL ${VOXCRAFT_SDL3_URL}
            URL_HASH SHA256=${VOXCRAFT_SDL3_SHA256}
            DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
        FetchContent_MakeAvailable(SDL3)
    endif()

    if(SDL3_FOUND OR TARGET SDL3::SDL3-static OR TARGET SDL3::SDL3)
        file(GLOB VOXAPP_SOURCES CONFIGURE_DEPENDS
            ${CMAKE_CURRENT_SOURCE_DIR}/src/platform/*.cpp
            ${CMAKE_CURRENT_SOURCE_DIR}/src/render/*.cpp
            ${CMAKE_CURRENT_SOURCE_DIR}/src/game/*.cpp)
        add_executable(aislopcraft ${VOXAPP_SOURCES} ${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp)
        target_link_libraries(aislopcraft PRIVATE voxcore voxcraft_warnings)
        target_include_directories(aislopcraft PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
        if(TARGET SDL3::SDL3-static)
            target_link_libraries(aislopcraft PRIVATE SDL3::SDL3-static)
        else()
            target_link_libraries(aislopcraft PRIVATE SDL3::SDL3)
        endif()
        if(UNIX AND NOT APPLE)
            target_link_libraries(aislopcraft PRIVATE ${CMAKE_DL_LIBS} m)
        endif()
        if(APPLE)
            target_link_libraries(aislopcraft PRIVATE "-framework OpenGL")
        endif()
        # Put the executable next to a copy of the assets for easy running.
        add_custom_command(TARGET aislopcraft POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_directory
                "${CMAKE_CURRENT_SOURCE_DIR}/assets" "$<TARGET_FILE_DIR:aislopcraft>/assets"
            COMMENT "Copying assets next to aislopcraft")
    else()
        message(FATAL_ERROR
            "SDL3 is unavailable and fetching is disabled. Set VOXCRAFT_BUILD_APP=OFF for an explicit core-only build, or allow pinned SDL3 fetching.")
    endif()
endif()

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
if(VOXCRAFT_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
