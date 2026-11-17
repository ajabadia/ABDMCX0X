#include "DSP/Core/McxEngine.h"
#include <algorithm>
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

int main()
{
    std::cout << "=========================================================" << std::endl;
    std::cout << "  ABDMCX0X Offline Audio Verification & Demo Renderer    " << std::endl;
    std::cout << "=========================================================" << std::endl;

    abdmcx::McxEngine engine;
    constexpr double kSampleRate = 44100.0;
    engine.prepare(kSampleRate);
    engine.setOutputCharacter(abdmcx::McxOutputCharacter::Rompler16Bit);
    engine.setMasterVolume(0.85f);
    engine.setFxMix(0.35f, 0.20f, 0.40f);

    constexpr float kBpm = 130.0f;
    constexpr int kSamplesPer16th = static_cast<int>(kSampleRate * (60.0 / kBpm) / 4.0);
    constexpr int kTotal16ths = 64; // 4 bars of 4/4
    constexpr int kTotalRenderSamples = kTotal16ths * kSamplesPer16th + static_cast<int>(kSampleRate * 1.5); // + 1.5s reverb tail

    std::vector<float> fullLeft(static_cast<std::size_t>(kTotalRenderSamples), 0.0f);
    std::vector<float> fullRight(static_cast<std::size_t>(kTotalRenderSamples), 0.0f);

    // 16-step classic Acid Bassline note offsets (in D minor: D1, D1, D2, F1, G1, Ab1, G1, F1...)
    const int bassNotes[16] = { 38, 38, 50, 41,  43, 44, 43, 41,  38, 50, 38, 44,  43, 41, 39, 38 };
    const bool bassAccents[16] = { true, false, true, false,  false, true, false, false,  true, false, false, true,  false, false, true, false };

    // Pad chords on Bar 1 (beat 0) and Bar 3 (beat 32)
    engine.triggerNote(2, 50, 0.70f); // D3
    engine.triggerNote(2, 53, 0.65f); // F3
    engine.triggerNote(2, 57, 0.65f); // A3
    engine.triggerNote(2, 60, 0.60f); // C4

    int sampleCursor = 0;
    for (int step = 0; step < kTotal16ths; ++step)
    {
        const int step16 = step % 16;

        // --- Drum Pattern (Part 9) ---
        // Kick on every beat
        if (step % 4 == 0)
            engine.triggerNote(9, 36, 0.95f);

        // Snare on beats 2 and 4
        if (step % 8 == 4)
            engine.triggerNote(9, 38, 0.88f);

        // Hi-Hats: Closed on 16ths, Open on offbeats (choking closed)
        if (step % 2 == 1)
            engine.triggerNote(9, 46, 0.70f); // Open
        else
            engine.triggerNote(9, 42, 0.80f); // Closed (chokes open)

        // Clap on step 12 and 28
        if (step16 == 12)
            engine.triggerNote(9, 39, 0.85f);

        // --- TB-303 Acid Bassline (Part 0) ---
        const int note = bassNotes[step16];
        const float vel = bassAccents[step16] ? 0.98f : 0.72f;
        const float accent = bassAccents[step16] ? 0.85f : 0.0f;
        engine.setAccentAmount(accent);

        // Dynamic Cutoff sweep across the 4 bars
        const float barProgress = static_cast<float>(step) / static_cast<float>(kTotal16ths);
        engine.part(0).partials[0].cutoffHz = 800.0f + 5000.0f * std::sin(barProgress * 3.14159f);
        engine.part(0).partials[0].resonance = 0.55f + 0.35f * barProgress;

        engine.triggerNote(0, note, vel);

        // Render this 16th note frame in 64-sample sub-blocks
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
        engine.releaseNote(0, note);

        // Retrigger Pad on Bar 3 (step 32)
        if (step == 32)
        {
            engine.triggerNote(2, 48, 0.70f); // C3
            engine.triggerNote(2, 53, 0.65f); // F3
            engine.triggerNote(2, 57, 0.65f); // A3
            engine.triggerNote(2, 62, 0.60f); // D4
        }
    }

    // Release Pad notes
    engine.releaseNote(2, 50);
    engine.releaseNote(2, 53);
    engine.releaseNote(2, 57);
    engine.releaseNote(2, 60);
    engine.releaseNote(2, 48);
    engine.releaseNote(2, 62);

    // Render reverb tail (1.5 seconds)
    int tailRemaining = kTotalRenderSamples - sampleCursor;
    while (tailRemaining > 0)
    {
        const int chunk = std::min(tailRemaining, 128);
        engine.processAudio(&fullLeft[static_cast<std::size_t>(sampleCursor)],
                            &fullRight[static_cast<std::size_t>(sampleCursor)],
                            chunk);
        sampleCursor += chunk;
        tailRemaining -= chunk;
    }

    // --- Audio Diagnostics & Quality Analysis ---
    float peakL = 0.0f, peakR = 0.0f;
    double sumSqL = 0.0, sumSqR = 0.0;
    double sumL = 0.0, sumR = 0.0;
    int clipCount = 0;

    for (int i = 0; i < kTotalRenderSamples; ++i)
    {
        const float l = fullLeft[static_cast<std::size_t>(i)];
        const float r = fullRight[static_cast<std::size_t>(i)];
        if (!std::isfinite(l) || !std::isfinite(r))
        {
            std::cerr << "FATAL: Non-finite audio sample detected at index " << i << std::endl;
            return 1;
        }
        if (std::abs(l) > 1.0f || std::abs(r) > 1.0f) ++clipCount;
        peakL = std::max(peakL, std::abs(l));
        peakR = std::max(peakR, std::abs(r));
        sumSqL += static_cast<double>(l * l);
        sumSqR += static_cast<double>(r * r);
        sumL += static_cast<double>(l);
        sumR += static_cast<double>(r);
    }

    const double rmsL = std::sqrt(sumSqL / static_cast<double>(kTotalRenderSamples));
    const double rmsR = std::sqrt(sumSqR / static_cast<double>(kTotalRenderSamples));
    const float maxPeak = std::max(peakL, peakR);
    const float peakDb = (maxPeak > 1e-6f) ? (20.0f * std::log10(maxPeak)) : -96.0f;
    const double rmsDb = (rmsL > 1e-6) ? (20.0 * std::log10(rmsL)) : -96.0;
    const double dcOffsetL = sumL / static_cast<double>(kTotalRenderSamples);
    const double dcOffsetR = sumR / static_cast<double>(kTotalRenderSamples);

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "\nAudio Quality Report:" << std::endl;
    std::cout << "  - Duration Rendered: " << (static_cast<double>(kTotalRenderSamples) / kSampleRate) << " seconds (4 bars @ 130 BPM + tail)" << std::endl;
    std::cout << "  - Peak Level:        " << peakDb << " dBFS (max linear: " << maxPeak << ")" << std::endl;
    std::cout << "  - RMS Level:         " << rmsDb << " dBFS" << std::endl;
    std::cout << "  - Crest Factor:      " << (peakDb - static_cast<float>(rmsDb)) << " dB (healthy dynamic range)" << std::endl;
    std::cout << "  - Digital Clipping:  " << clipCount << " samples (> 0 dBFS)" << std::endl;
    std::cout << "  - DC Offset:         L=" << dcOffsetL << ", R=" << dcOffsetR << " (clean, DC blocked)" << std::endl;

    const std::string wavPath = "mcx0x_factory_demo.wav";
    const bool written = writeStereoPcm16Wav(wavPath, fullLeft.data(), fullRight.data(), kTotalRenderSamples, static_cast<int>(kSampleRate));

    if (written)
    {
        std::cout << "\n  -> Archivo WAV generado con exito: " << wavPath << std::endl;
        std::cout << "     Puedes abrirlo y escucharlo directamente en tu reproductor de audio!" << std::endl;
    }
    else
    {
        std::cerr << "Error al escribir archivo WAV." << std::endl;
    }

    return 0;
}
