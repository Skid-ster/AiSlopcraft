#pragma once
#include "JavaRandom.h"
#include <array>
#include <vector>

namespace vox {

// Vanilla-era improved Perlin form (permutation, fade and gradient). This
// primitive resembles the 1.7 implementation, but the *worldgen* pipeline is
// independent and not seed-compatible with release 1.7.3.
class PerlinNoise {
public:
    explicit PerlinNoise(JavaRandom& rng);
    double sample(double x, double y, double z) const;
    double sample2(double x, double z) const { return sample(x, 0.0, z); }
private:
    std::array<int, 512> p_{};
    double ox_ = 0, oy_ = 0, oz_ = 0;
};

class OctaveNoise {
public:
    OctaveNoise(int64_t seed, int octaves);
    double sample(double x, double y, double z, double baseFrequency = 1.0) const;
    double sample2(double x, double z, double baseFrequency = 1.0) const {
        return sample(x, 0, z, baseFrequency);
    }
private:
    std::vector<PerlinNoise> layers_;
};

// Integer-coordinate hash: stable across operating systems and thread order;
// neighbouring chunk generators use global coordinates to avoid seam RNG.
uint64_t mix64(uint64_t value);
uint64_t worldHash(int64_t seed, int x, int y, int z);
float hashUnit(int64_t seed, int x, int y, int z);

} // namespace vox
