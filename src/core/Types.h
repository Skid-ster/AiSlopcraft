// AiSlopcraft - core math/utility types.
// Unofficial Minecraft-1.7.3-inspired voxel sandbox. No Mojang code or assets.
#pragma once
#include <cstdint>
#include <cmath>
#include <algorithm>
#include <string>

namespace vox {

struct Vec2f { float x = 0, y = 0; };

struct Vec3f {
    float x = 0, y = 0, z = 0;
    Vec3f() = default;
    Vec3f(float X, float Y, float Z) : x(X), y(Y), z(Z) {}
    Vec3f operator+(const Vec3f& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3f operator-(const Vec3f& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3f operator*(float s) const { return {x * s, y * s, z * s}; }
    Vec3f& operator+=(const Vec3f& o) { x += o.x; y += o.y; z += o.z; return *this; }
    Vec3f& operator-=(const Vec3f& o) { x -= o.x; y -= o.y; z -= o.z; return *this; }
    Vec3f& operator*=(float s) { x *= s; y *= s; z *= s; return *this; }
    float length() const { return std::sqrt(x * x + y * y + z * z); }
    float lengthSq() const { return x * x + y * y + z * z; }
    Vec3f normalized() const { float l = length(); return l > 0 ? Vec3f{x / l, y / l, z / l} : Vec3f{}; }
    float dot(const Vec3f& o) const { return x * o.x + y * o.y + z * o.z; }
    Vec3f cross(const Vec3f& o) const {
        return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x};
    }
};
inline Vec3f operator*(float s, const Vec3f& v) { return v * s; }

struct Vec3i {
    int x = 0, y = 0, z = 0;
    Vec3i() = default;
    Vec3i(int X, int Y, int Z) : x(X), y(Y), z(Z) {}
    Vec3i operator+(const Vec3i& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3i operator-(const Vec3i& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3i operator*(int s) const { return {x * s, y * s, z * s}; }
    bool operator==(const Vec3i& o) const { return x == o.x && y == o.y && z == o.z; }
    bool operator!=(const Vec3i& o) const { return !(*this == o); }
};

// Axis-aligned bounding box, min/max corners.
struct AABB {
    Vec3f min, max;
    AABB() = default;
    AABB(Vec3f a, Vec3f b) : min(a), max(b) {}
    static AABB fromCenterSize(Vec3f center, Vec3f size) {
        return {center - size * 0.5f, center + size * 0.5f};
    }
    static AABB fromOriginSize(Vec3f origin, Vec3f size) {
        return {origin, origin + size};
    }
    bool intersects(const AABB& o) const {
        return min.x < o.max.x && max.x > o.min.x &&
               min.y < o.max.y && max.y > o.min.y &&
               min.z < o.max.z && max.z > o.min.z;
    }
    bool contains(Vec3f p) const {
        return p.x >= min.x && p.x < max.x && p.y >= min.y && p.y < max.y &&
               p.z >= min.z && p.z < max.z;
    }
    AABB expanded(float g) const {
        return {{min.x - g, min.y - g, min.z - g}, {max.x + g, max.y + g, max.z + g}};
    }
    AABB offset(Vec3f d) const { return {{min.x + d.x, min.y + d.y, min.z + d.z},
                                          {max.x + d.x, max.y + d.y, max.z + d.z}}; }
    AABB grow(Vec3f o) const { return {{min.x - o.x, min.y - o.y, min.z - o.z},
                                       {max.x + o.x, max.y + o.y, max.z + o.z}};
    }
    Vec3f center() const { return (min + max) * 0.5f; }
    Vec3f size() const { return max - min; }
};

// Six directions, in the order used for face culling / meshing.
enum Dir : uint8_t { Down = 0, Up = 1, North = 2, South = 3, West = 4, East = 5, DirCount = 6 };
inline Vec3i dirOffset(Dir d) {
    switch (d) {
        case Down:  return {0, -1, 0};
        case Up:    return {0, 1, 0};
        case North: return {0, 0, -1};
        case South: return {0, 0, 1};
        case West:  return {-1, 0, 0};
        default:    return {1, 0, 0};
    }
}
inline Dir dirOpposite(Dir d) { return (Dir)(d ^ 1); }

constexpr int ChunkSize  = 16;
constexpr int WorldHeight = 256;   // 1.7 height limit
constexpr int SectionCount = WorldHeight / ChunkSize; // 16
constexpr int SeaLevel   = 63;     // 1.7 sea level (water surface at y=63)
constexpr int TicksPerDay = 24000;

inline uint64_t chunkKey(int cx, int cz) {
    return ((uint64_t)(uint32_t)cx << 32) | (uint32_t)cz;
}

inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }

} // namespace vox
