// Faithful reimplementation of java.util.Random (48-bit LCG).
// Minecraft 1.7.x world generation is driven by this generator, so matching it
// is the first step toward seed-compatible terrain.
#pragma once
#include <cstdint>
#include <cmath>
#include <stdexcept>
#include <limits>

namespace vox {

class JavaRandom {
public:
    JavaRandom() { setSeed(0); }
    explicit JavaRandom(int64_t seed) { setSeed(seed); }

    void setSeed(int64_t seed) {
        seed_ = (uint64_t)(seed ^ 0x5DEECE66DLL) & ((1ULL << 48) - 1);
        haveNextNextGaussian_ = false;
    }

    // java.util.Random.next(int bits)
    int next(int bits) {
        seed_ = (seed_ * 0x5DEECE66DLL + 0xBLL) & ((1ULL << 48) - 1);
        return (int)(seed_ >> (48 - bits));
    }

    int32_t nextInt() { return (int32_t)next(32); }

    int32_t nextInt(int32_t bound) {
        // Mirrors java.util.Random.nextInt(int) exactly, including the
        // rejection sampling for non-power-of-two bounds.
        if (bound <= 0) throw std::invalid_argument("JavaRandom::nextInt bound must be positive");
        if ((bound & -bound) == bound) // power of two
            return (int32_t)((bound * (int64_t)next(31)) >> 31);
        int32_t bits, val;
        do {
            bits = next(31);
            val = bits % bound;
        // Java's signed 32-bit overflow is defined by the JVM; do not
        // trigger signed-overflow UB in C++ for large bounds.
        } while ((int32_t)(uint32_t)((uint32_t)bits - (uint32_t)val + (uint32_t)(bound - 1)) < 0);
        return val;
    }

    float nextFloat() { return (float)next(24) / ((float)(1 << 24)); }

    double nextDouble() {
        return (((uint64_t)next(26) << 27) + (uint64_t)next(27)) / (double)(1ULL << 53);
    }

    bool nextBoolean() { return next(1) != 0; }

    double nextGaussian() {
        if (haveNextNextGaussian_) {
            haveNextNextGaussian_ = false;
            return nextNextGaussian_;
        }
        double v1, v2, s;
        do {
            v1 = 2 * nextDouble() - 1;
            v2 = 2 * nextDouble() - 1;
            s = v1 * v1 + v2 * v2;
        } while (s >= 1 || s == 0);
        double multiplier = std::sqrt(-2 * std::log(s) / s);
        nextNextGaussian_ = v2 * multiplier;
        haveNextNextGaussian_ = true;
        return v1 * multiplier;
    }

    uint64_t rawSeed() const { return seed_; }

private:
    uint64_t seed_ = 0;
    bool haveNextNextGaussian_ = false;
    double nextNextGaussian_ = 0;
};

} // namespace vox
