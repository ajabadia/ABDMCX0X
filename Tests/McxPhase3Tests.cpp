#include <iostream>
#include <vector>
#include <cmath>
#include <cassert>
#include "State/ParameterRegistry.gen.h"
#include "State/Conversion.gen.h"
#include <SynthCore/StickPlayer.h>
#include <SynthCore/VelocitySensitivityCurves.h>
#include "DSP/Core/McxEngine.h"

using namespace abdmcx;

static int gPassedTests = 0;
static int gFailedTests = 0;

#define EXPECT_TRUE(cond, desc) \
    do { \
        if (cond) { \
            std::cout << "  [PASS] " << desc << "\n"; \
            gPassedTests++; \
        } else { \
            std::cerr << "  [FAIL] " << desc << " (" << __FILE__ << ":" << __LINE__ << ")\n"; \
            gFailedTests++; \
        } \
    } while(0)

#define EXPECT_NEAR(a, b, eps, desc) \
    EXPECT_TRUE(std::abs((a) - (b)) <= (eps), desc)

int main() {
    std::cout << "=== ABDMCX0X Phase 3 APVTS, StickPlayer & DRY Migrations Tests ===\n";

    // 1. Parameter Registry Validation
    EXPECT_TRUE(kNumParameters == 26, "Parameter registry has exactly 26 parameters");

    bool allRangesValid = true;
    for (size_t i = 0; i < kNumParameters; ++i) {
        const auto& d = kParameterDescriptors[i];
        if (d.minValue > d.maxValue || d.defaultValue < d.minValue || d.defaultValue > d.maxValue) {
            allRangesValid = false;
            break;
        }
    }
    EXPECT_TRUE(allRangesValid, "All 26 parameter descriptors have valid min <= default <= max ranges");

    // 2. Normalization and Conversion Roundtrips
    float rawCutoff = 25.0f;
    float normCutoff = rawToNormalized(ParamIdx::TvfCutoffOffset, rawCutoff);
    float roundtripCutoff = normalizedToRaw(ParamIdx::TvfCutoffOffset, normCutoff);
    EXPECT_NEAR(rawCutoff, roundtripCutoff, 0.001f, "Raw to normalized and back roundtrips accurately for TvfCutoffOffset");

    EXPECT_NEAR(dbToGain(0.0f), 1.0f, 0.0001f, "0 dB equals unity gain (1.0)");
    EXPECT_NEAR(dbToGain(-60.0f), 0.0f, 0.0001f, "-60 dB equals zero gain");
    EXPECT_NEAR(gainToDb(1.0f), 0.0f, 0.0001f, "Unity gain equals 0 dB");

    // 3. StickPlayer Trajectory Playback (DRY Component from ABDShared)
    {
        abdsynth::core::StickPlayer stick;
        stick.prepare(44100.0);

        std::vector<abdsynth::core::StickRecEvent> events = {
            { 0,   0, 0, 256 }, // Control 0, mid pos (0.5)
            { 50,  0, 0, 512 }, // Control 0, full pos (1.0)
            { 100, 0, 1, 0   }  // Control 1, min pos (0.0)
        };
        stick.loadEvents(events);
        EXPECT_TRUE(stick.hasEvents(), "StickPlayer successfully loaded 3 trajectory events");

        uint32_t lastUpdatedParam = 999;
        float lastVal = 0.0f;
        auto callback = [&](uint32_t pIdx, float val) {
            lastUpdatedParam = pIdx;
            lastVal = val;
        };

        stick.trigger();
        EXPECT_TRUE(stick.isPlaying(), "StickPlayer is playing after trigger");

        // Process 100 ms of audio (4410 samples @ 44.1kHz)
        stick.processBlock(4410, callback);
        EXPECT_TRUE(lastUpdatedParam == 1, "StickPlayer dispatched last event for control 1");
        EXPECT_NEAR(lastVal, 0.0f, 0.01f, "StickPlayer dispatched normalized value 0.0 for control 1");
        EXPECT_TRUE(!stick.isPlaying(), "StickPlayer stopped after non-loop playback completed");
    }

    // 4. VelocitySensitivityCurves Validation (DRY Component from ABDShared)
    {
        using namespace abdsynth::core;
        auto perc = VelocitySensitivityProcessor::getPercussiveCurve();
        EXPECT_TRUE(perc.amplitudeResponse == 1.0f, "Percussive curve has full velocity amp response");
        EXPECT_TRUE(perc.attackResponse < 0.0f, "Percussive curve has faster attack on hard hits");

        float velFull = 1.0f;
        float velHalf = 0.5f;
        float velZero = 0.0f;

        float ampFull = VelocitySensitivityProcessor::apply(velFull, 1.0f);
        float ampHalf = VelocitySensitivityProcessor::apply(velHalf, 1.0f);
        float ampZero = VelocitySensitivityProcessor::apply(velZero, 1.0f);

        EXPECT_NEAR(ampFull, 1.0f, 0.001f, "Full velocity with sens=1.0 gives 1.0 scaling");
        EXPECT_NEAR(ampHalf, 0.5f, 0.001f, "Half velocity with sens=1.0 gives 0.5 scaling");
        EXPECT_NEAR(ampZero, 0.0f, 0.001f, "Zero velocity with sens=1.0 gives 0.0 scaling");

        float flat = VelocitySensitivityProcessor::apply(velHalf, 0.0f);
        EXPECT_NEAR(flat, 1.0f, 0.001f, "Zero sensitivity ignores velocity and returns 1.0");
    }

    // 5. Engine Focused Part Proxy Routing
    {
        McxEngine engine;
        engine.prepare(44100.0);

        engine.setFocusedPart(3);
        EXPECT_TRUE(engine.getFocusedPart() == 3, "Focused part index is 3");

        engine.part(3).level = 0.77f;
        EXPECT_NEAR(engine.part(3).level, 0.77f, 0.001f, "Focused part level set cleanly");

        engine.setFocusedPart(0);
        EXPECT_TRUE(engine.getFocusedPart() == 0, "Focused part switched to 0");
        EXPECT_TRUE(engine.part(0).level != 0.77f, "Part 0 level independent from Part 3");
    }

    std::cout << "\nTest Summary: " << gPassedTests << " passed, " << gFailedTests << " failed.\n";
    return gFailedTests == 0 ? 0 : 1;
}
