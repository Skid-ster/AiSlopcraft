#include "Noise.h"
#include <cmath>
#include <stdexcept>

namespace vox {
namespace {
inline double fade(double t) { return t*t*t*(t*(t*6-15)+10); }
inline double lerp(double a, double b, double t) { return a+t*(b-a); }
inline double grad(int h, double x, double y, double z) {
    h &= 15;
    double u = h < 8 ? x : y;
    double v = h < 4 ? y : (h == 12 || h == 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
}
PerlinNoise::PerlinNoise(JavaRandom& rng) {
    ox_ = rng.nextDouble() * 256.0;
    oy_ = rng.nextDouble() * 256.0;
    oz_ = rng.nextDouble() * 256.0;
    for (int i = 0; i < 256; ++i) p_[i] = i;
    for (int i = 0; i < 256; ++i) {
        int j = i + rng.nextInt(256 - i);
        int t = p_[i]; p_[i] = p_[j]; p_[j] = t;
    }
    for (int i=0; i<256; ++i) p_[i+256] = p_[i];
}

double PerlinNoise::sample(double x, double y, double z) const {
    x += ox_; y += oy_; z += oz_;
    double fx = std::floor(x), fy = std::floor(y), fz = std::floor(z);
    int X = static_cast<int>(static_cast<int64_t>(fx) & 255);
    int Y = static_cast<int>(static_cast<int64_t>(fy) & 255);
    int Z = static_cast<int>(static_cast<int64_t>(fz) & 255);
    x -= fx; y -= fy; z -= fz;
    double u=fade(x), v=fade(y), w=fade(z);
    int A=p_[X]+Y, AA=p_[A]+Z, AB=p_[A+1]+Z;
    int B=p_[X+1]+Y, BA=p_[B]+Z, BB=p_[B+1]+Z;
    return lerp(lerp(lerp(grad(p_[AA], x,y,z), grad(p_[BA],x-1,y,z), u),
                     lerp(grad(p_[AB], x,y-1,z),grad(p_[BB],x-1,y-1,z),u),v),
                lerp(lerp(grad(p_[AA+1],x,y,z-1),grad(p_[BA+1],x-1,y,z-1),u),
                     lerp(grad(p_[AB+1],x,y-1,z-1),grad(p_[BB+1],x-1,y-1,z-1),u),v),w);
}

OctaveNoise::OctaveNoise(int64_t seed, int octaves) {
    if (octaves < 1 || octaves > 16) throw std::invalid_argument("octaves must be 1..16");
    JavaRandom rng(seed);
    layers_.reserve(octaves);
    for (int i=0; i<octaves; ++i) layers_.emplace_back(rng);
}

double OctaveNoise::sample(double x, double y, double z, double f) const {
    // Fractal Brownian motion with decreasing amplitude and increasing
    // frequency; the octave set is driven by a JavaRandom stream.
    double total=0, norm=0, amp=1;
    for (const auto& layer : layers_) {
        total += layer.sample(x*f, y*f, z*f) * amp;
        norm += amp; f *= 2.0; amp *= 0.5;
    }
    return total / norm;
}

uint64_t mix64(uint64_t v) {
    v ^= v >> 30; v *= UINT64_C(0xbf58476d1ce4e5b9);
    v ^= v >> 27; v *= UINT64_C(0x94d049bb133111eb);
    return v ^ (v >> 31);
}
uint64_t worldHash(int64_t seed, int x, int y, int z) {
    uint64_t n = static_cast<uint64_t>(seed);
    n ^= mix64(static_cast<uint64_t>(static_cast<int64_t>(x)) + UINT64_C(0x9e3779b97f4a7c15));
    n ^= mix64(static_cast<uint64_t>(static_cast<int64_t>(y)) + UINT64_C(0xc2b2ae3d27d4eb4f));
    n ^= mix64(static_cast<uint64_t>(static_cast<int64_t>(z)) + UINT64_C(0x165667b19e3779f9));
    return mix64(n);
}
float hashUnit(int64_t seed, int x, int y, int z) {
    return (float)((worldHash(seed,x,y,z) >> 40) * (1.0 / 16777216.0));
}
} // namespace vox
