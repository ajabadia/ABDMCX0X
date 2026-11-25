#include "Core/McxBankLoader.h"
#include "DSP/Core/McxEngine.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <vector>

namespace
{
void appendU16(std::vector<std::uint8_t>& b, std::uint16_t v)
{
    b.push_back(static_cast<std::uint8_t>(v & 0xFF));
    b.push_back(static_cast<std::uint8_t>((v >> 8) & 0xFF));
}

void appendU32(std::vector<std::uint8_t>& b, std::uint32_t v)
{
    b.push_back(static_cast<std::uint8_t>(v & 0xFF));
    b.push_back(static_cast<std::uint8_t>((v >> 8) & 0xFF));
    b.push_back(static_cast<std::uint8_t>((v >> 16) & 0xFF));
    b.push_back(static_cast<std::uint8_t>((v >> 24) & 0xFF));
}

bool writeStereoPcm16Wav(const std::string& path, const float* left, const float* right, int numSamples, int sampleRate)
{
    std::ofstream out(path, std::ios::binary);
    if (!out.is_open()) return false;

    const std::uint32_t dataBytes = static_cast<std::uint32_t>(numSamples * 2 * sizeof(std::int16_t));
    const std::uint32_t riffSize = 36 + dataBytes;

    std::vector<std::uint8_t> h;
    h.insert(h.end(), {'R', 'I', 'F', 'F'});
    appendU32(h, riffSize);
    h.insert(h.end(), {'W', 'A', 'V', 'E'});
    h.insert(h.end(), {'f', 'm', 't', ' '});
    appendU32(h, 16);
    appendU16(h, 1); // PCM
    appendU16(h, 2); // Stereo
    appendU32(h, static_cast<std::uint32_t>(sampleRate));
    appendU32(h, static_cast<std::uint32_t>(sampleRate * 4)); // byteRate
    appendU16(h, 4); // blockAlign
    appendU16(h, 16); // bitsPerSample
    h.insert(h.end(), {'d', 'a', 't', 'a'});
    appendU32(h, dataBytes);
    out.write(reinterpret_cast<const char*>(h.data()), static_cast<std::streamsize>(h.size()));

    std::vector<std::int16_t> pcm(static_cast<std::size_t>(numSamples * 2));
    for (int i = 0; i < numSamples; ++i)
    {
        const float l = std::clamp(left[i], -1.0f, 1.0f);
        const float r = std::clamp(right[i], -1.0f, 1.0f);
        pcm[static_cast<std::size_t>(i * 2)] = static_cast<std::int16_t>(l * 32767.0f);
        pcm[static_cast<std::size_t>(i * 2 + 1)] = static_cast<std::int16_t>(r * 32767.0f);
    }
    out.write(reinterpret_cast<const char*>(pcm.data()), static_cast<std::streamsize>(pcm.size() * sizeof(std::int16_t)));
    return true;
}
} // namespace

int main(int argc, char* argv[])
{
    std::cout << "=========================================================" << std::endl;
    std::cout << "  ABDMCX0X Roland SC-55 Quick Test .abdbank Verification " << std::endl;
    std::cout << "=========================================================" << std::endl;

    std::string bankPath = "sc55_quick_test.abdbank";
    if (argc > 1) bankPath = argv[1];

    std::cout << "Loading bank: " << bankPath << std::endl;
    abdmcx::McxBankLoader loader;
    bool loaded = loader.loadFromFilePath(bankPath);
    if (!loaded)
    {
        for (const char* fallback : {
                 "D:/desarrollos/ABDSynths/ABDMCX0X/sc55_quick_test.abdbank",
                 "D:/desarrollos/ABDSynths/ABDAxionikVS/AxionikDB/Banks/sc55_quick_test.abdbank",
                 "../ABDAxionikVS/AxionikDB/Banks/sc55_quick_test.abdbank",
             })
        {
            if (loader.loadFromFilePath(fallback)) { bankPath = fallback; loaded = true; break; }
        }
    }

    if (!loaded || !loader.isValid())
    {
        std::cerr << "FAIL: Could not load " << bankPath << std::endl;
        return 1;
    }

    std::cout << "  [PASS] Bank loaded successfully: " << loader.getBankName() << std::endl;
    std::cout << "         Author: " << loader.getAuthor() << std::endl;
    std::cout << "         Waves in pool: " << loader.getWaveCount() << std::endl;
    std::cout << "         Drum kits:     " << loader.getDrumKitCount() << std::endl;
    std::cout << "         Tones:         " << loader.getToneCount() << std::endl;

    assert(loader.getWaveCount() >= 23);
    assert(loader.getDrumKitCount() >= 1);

    // Prepare engine
    abdmcx::McxEngine engine;
    constexpr double kSampleRate = 44100.0;
    engine.prepare(kSampleRate);
    engine.setOutputCharacter(abdmcx::McxOutputCharacter::Rompler16Bit);
    engine.setMasterVolume(0.85f);
    engine.setFxMix(0.30f, 0.20f, 0.35f);

    // Apply Drum Kit to Part 9
    const bool drumApplied = loader.applyDrumKitToPart(0, engine.part(9));
    assert(drumApplied);
    std::cout << "  [PASS] Standard GS Kit applied to Part 9 (Drum Mode: " << (engine.part(9).isDrumKit ? "YES" : "NO") << ")" << std::endl;

    // Apply Orchestra Hit Tone to Part 0
    if (loader.getToneCount() > 0)
    {
        const bool toneApplied = loader.applyToneToPart(0, engine.part(0));
        assert(toneApplied);
        std::cout << "  [PASS] Chromatic Tone applied to Part 0 (Kind: " << static_cast<int>(engine.part(0).kind) << ")" << std::endl;
    }

    // Render 4 bars @ 125 BPM
    constexpr float kBpm = 125.0f;
    constexpr int kSamplesPer16th = static_cast<int>(kSampleRate * (60.0 / kBpm) / 4.0);
    constexpr int kTotal16ths = 64; // 4 bars
    constexpr int kTotalRenderSamples = kTotal16ths * kSamplesPer16th + static_cast<int>(kSampleRate * 1.5);

    std::vector<float> fullLeft(static_cast<std::size_t>(kTotalRenderSamples), 0.0f);
    std::vector<float> fullRight(static_cast<std::size_t>(kTotalRenderSamples), 0.0f);

    int sampleCursor = 0;
    for (int step = 0; step < kTotal16ths; ++step)
    {
        const int step16 = step % 16;

        // --- Part 9: Roland SC-55 Drum Kit ---
        // Kick (36) on 0, 4, 8, 12
        if (step % 4 == 0)
            engine.triggerNote(9, 36, 0.95f);

        // Snare (38) on 4, 12
        if (step % 8 == 4)
            engine.triggerNote(9, 38, 0.88f);

        // Hi-Hats: Closed (42) on 16ths, Open (46) on offbeat 16ths
        if (step % 4 == 2)
            engine.triggerNote(9, 46, 0.72f); // Open HH (choked next 16th by Closed HH!)
        else
            engine.triggerNote(9, 42, 0.78f); // Closed HH

        // Hand Clap (39) layer on step 12
        if (step16 == 12)
            engine.triggerNote(9, 39, 0.82f);

        // Tambourine (54) on 8th notes
        if (step % 2 == 1)
            engine.triggerNote(9, 54, 0.60f);

        // Cowbell (56) on bar 4 (steps 48..63) syncopated
        if (step >= 48 && (step16 == 4 || step16 == 7 || step16 == 10 || step16 == 14))
            engine.triggerNote(9, 56, 0.75f);

        // --- Part 0: Roland Orchestra Hit Stabs ---
        // Bar 1 start (step 0), Bar 3 start (step 32), and step 46
        if (step == 0 || step == 32 || step == 46)
        {
            engine.triggerNote(0, 60, 0.90f); // C4
        }
        else if (step == 16)
        {
            engine.triggerNote(0, 65, 0.90f); // F4
        }

        // Render block
        int remaining = kSamplesPer16th;
        while (remaining > 0)
        {
            const int chunk = std::min(remaining, 64);
            engine.processAudio(&fullLeft[static_cast<std::size_t>(sampleCursor)],
                                &fullRight[static_cast<std::size_t>(sampleCursor)],
                                chunk);
            sampleCursor += chunk;
            remaining -= chunk;
        }
    }

    // Process Reverb tail
    int tailRemaining = kTotalRenderSamples - sampleCursor;
    while (tailRemaining > 0)
    {
        const int chunk = std::min(tailRemaining, 64);
        engine.processAudio(&fullLeft[static_cast<std::size_t>(sampleCursor)],
                            &fullRight[static_cast<std::size_t>(sampleCursor)],
                            chunk);
        sampleCursor += chunk;
        tailRemaining -= chunk;
    }

    // Audio metrics
    float maxAbs = 0.0f;
    double sumSq = 0.0;
    int clipCount = 0;
    for (int i = 0; i < kTotalRenderSamples; ++i)
    {
        const float l = fullLeft[static_cast<std::size_t>(i)];
        const float r = fullRight[static_cast<std::size_t>(i)];
        assert(!std::isnan(l) && !std::isinf(l));
        assert(!std::isnan(r) && !std::isinf(r));

        const float al = std::abs(l);
        const float ar = std::abs(r);
        maxAbs = std::max({maxAbs, al, ar});
        sumSq += (l * l + r * r) * 0.5;
        if (al > 1.0f || ar > 1.0f) ++clipCount;
    }

    const float rms = static_cast<float>(std::sqrt(sumSq / static_cast<double>(kTotalRenderSamples)));
    const float peakDb = (maxAbs > 0.000001f) ? (20.0f * std::log10(maxAbs)) : -120.0f;
    const float rmsDb = (rms > 0.000001f) ? (20.0f * std::log10(rms)) : -120.0f;

    std::cout << "\nAudio Quality Report for SC-55 Render:" << std::endl;
    std::cout << "  - Peak Level:        " << std::fixed << std::setprecision(2) << peakDb << " dBFS (max linear: " << maxAbs << ")" << std::endl;
    std::cout << "  - RMS Level:         " << rmsDb << " dBFS" << std::endl;
    std::cout << "  - Digital Clipping:  " << clipCount << " samples (> 0 dBFS)" << std::endl;

    assert(maxAbs > 0.1f);
    assert(clipCount == 0);

    const std::string outWav = "sc55_quick_render.wav";
    const bool written = writeStereoPcm16Wav(outWav, fullLeft.data(), fullRight.data(), kTotalRenderSamples, static_cast<int>(kSampleRate));
    assert(written);

    std::cout << "\n>>> SUCCESS: Rendered " << outWav << " successfully!" << std::endl;
    std::cout << "    Duration: " << (static_cast<float>(kTotalRenderSamples) / static_cast<float>(kSampleRate)) << " seconds." << std::endl;
    std::cout << "    Everything loaded and played with zero errors." << std::endl;
    return 0;
}
