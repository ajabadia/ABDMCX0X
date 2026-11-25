#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../Sequencer/McxPatternSequencer.h"
#include "../Sequencer/McxSongAndScenes.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace abdmcx
{

struct OfflineBounceOptions
{
    double sampleRate { 44100.0 };
    int patternBars { 4 };
    float tailSeconds { 1.5f };
    int isolatePart { -1 };
    int isolateBank { -1 };
    bool useSongMode { false };
};

inline void writeLe16(std::vector<std::uint8_t>& out, std::uint16_t v)
{
    out.push_back(static_cast<std::uint8_t>(v & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >> 8) & 0xFFu));
}

inline void writeLe32(std::vector<std::uint8_t>& out, std::uint32_t v)
{
    out.push_back(static_cast<std::uint8_t>(v & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >> 8) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >> 16) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >> 24) & 0xFFu));
}

inline void encodeStereoPcm16Wav(const float* left, const float* right, int numFrames, int sampleRate,
                                 std::vector<std::uint8_t>& outWav)
{
    const int n = std::max(0, numFrames);
    const std::uint32_t sr = static_cast<std::uint32_t>(std::clamp(sampleRate, 8000, 192000));
    const std::uint32_t dataBytes = static_cast<std::uint32_t>(n) * 4u;
    outWav.clear();
    outWav.reserve(44u + dataBytes);
    const char riff[4] = { 'R', 'I', 'F', 'F' };
    const char wave[4] = { 'W', 'A', 'V', 'E' };
    const char fmt[4] = { 'f', 'm', 't', ' ' };
    const char data[4] = { 'd', 'a', 't', 'a' };
    outWav.insert(outWav.end(), riff, riff + 4);
    writeLe32(outWav, 36u + dataBytes);
    outWav.insert(outWav.end(), wave, wave + 4);
    outWav.insert(outWav.end(), fmt, fmt + 4);
    writeLe32(outWav, 16u);
    writeLe16(outWav, 1u);
    writeLe16(outWav, 2u);
    writeLe32(outWav, sr);
    writeLe32(outWav, sr * 4u);
    writeLe16(outWav, 4u);
    writeLe16(outWav, 16u);
    outWav.insert(outWav.end(), data, data + 4);
    writeLe32(outWav, dataBytes);
    for (int i = 0; i < n; ++i)
    {
        const float fl = std::clamp(left ? left[i] : 0.0f, -1.0f, 1.0f);
        const float fr = std::clamp(right ? right[i] : 0.0f, -1.0f, 1.0f);
        writeLe16(outWav, static_cast<std::uint16_t>(static_cast<std::int16_t>(std::lrint(fl * 32767.0f))));
        writeLe16(outWav, static_cast<std::uint16_t>(static_cast<std::int16_t>(std::lrint(fr * 32767.0f))));
    }
}

struct OfflineBounceSession
{
    bool active { false };
    McxEngine* engine { nullptr };
    double sampleRate { 44100.0 };
    int activeSamplesLeft { 0 };
    int tailSamplesLeft { 0 };
    int totalSamples { 0 };
    bool tailEntered { false };

    bool prevSeqLoop { true };
    bool prevSeqRec { false };
    int prevCountInBars { 0 };
    bool prevSongMode { false };
    bool prevSongLoop { true };
    std::uint8_t prevBankMuteMask { 0 };
    std::uint8_t prevBankSoloMask { 0 };
    int prevGlobalTranspose { 0 };
    std::array<bool, McxEngine::kNumParts> prevPartMute {};
    std::array<bool, McxEngine::kNumParts> prevPartSolo {};

    int begin(McxEngine& eng, const OfflineBounceOptions& opts) noexcept
    {
        if (active) end();
        engine = &eng;
        sampleRate = (opts.sampleRate > 1000.0) ? opts.sampleRate : 44100.0;
        auto& seq = eng.sequencer();
        auto& song = eng.songAndScenes();
        const auto songTel = song.readTelemetry();

        eng.allNotesOff();
        eng.setSequencerPlaying(false, true);

        prevSeqLoop = seq.isLoopEnabled();
        prevSeqRec = seq.isRecording();
        prevCountInBars = seq.getCountInBars();
        prevSongMode = songTel.songMode;
        prevSongLoop = songTel.songLoop;
        prevGlobalTranspose = eng.getTransposer().getTransposeSemitones();
        prevBankMuteMask = eng.bankLayout().bankMuteMask;
        prevBankSoloMask = eng.bankLayout().bankSoloMask;
        for (int i = 0; i < McxEngine::kNumParts; ++i)
        {
            const auto u = static_cast<std::size_t>(i);
            prevPartMute[u] = eng.part(i).mute;
            prevPartSolo[u] = eng.part(i).solo;
        }

        if (opts.isolatePart >= 0 && opts.isolatePart < McxEngine::kNumParts)
        {
            for (int i = 0; i < McxEngine::kNumParts; ++i)
                eng.part(i).solo = (i == opts.isolatePart);
            eng.bankLayout().bankSoloMask = 0u;
            eng.bankLayout().bankMuteMask = 0u;
        }
        else if (opts.isolateBank >= 0 && opts.isolateBank < McxBankLayoutState::kMaxBanks)
        {
            for (int i = 0; i < McxEngine::kNumParts; ++i)
                eng.part(i).solo = false;
            eng.bankLayout().bankSoloMask = static_cast<std::uint8_t>(1u << opts.isolateBank);
            eng.bankLayout().bankMuteMask = 0u;
        }

        int totalBars = std::max(1, opts.patternBars);
        if (opts.useSongMode)
        {
            const int blocks = song.getActiveSongBlockCount();
            if (blocks > 0)
            {
                totalBars = 0;
                for (int b = 0; b < blocks; ++b)
                    totalBars += std::max(1, static_cast<int>(song.getActiveSongBlock(b).bars));
            }
            eng.setSongModeEnabled(true);
            eng.setSongLoopEnabled(false);
            seq.setLoopEnabled(true);
        }
        else
        {
            eng.setSongModeEnabled(false);
            seq.setLoopEnabled(true);
        }

        seq.setRecording(false);
        seq.setCountInBars(0);
        const int ppq = std::max(1, seq.getPpq());
        const double ticks = static_cast<double>(totalBars * ppq * 4);
        const double bpm = std::max(20.0, static_cast<double>(eng.getMasterTempoBpm()));
        const int maxSamples = static_cast<int>(sampleRate * 300.0);
        activeSamplesLeft = std::clamp(static_cast<int>(std::llround(ticks * sampleRate * 60.0 / (bpm * ppq))), 1, maxSamples);
        tailSamplesLeft = std::clamp(static_cast<int>(std::llround(static_cast<double>(opts.tailSeconds) * sampleRate)),
                                     0, static_cast<int>(sampleRate * 10.0));
        totalSamples = activeSamplesLeft + tailSamplesLeft;
        tailEntered = false;
        active = true;
        eng.setSequencerPlaying(true, true);
        return totalSamples;
    }

    int renderChunk(float* outL, float* outR, int numFrames) noexcept
    {
        if (!active || !engine || numFrames <= 0) return 0;
        int rendered = 0;
        while (rendered < numFrames && (activeSamplesLeft > 0 || tailSamplesLeft > 0))
        {
            if (activeSamplesLeft > 0)
            {
                const int step = std::min(numFrames - rendered, activeSamplesLeft);
                engine->processAudio(outL + rendered, outR + rendered, step);
                activeSamplesLeft -= step;
                rendered += step;
            }
            else
            {
                if (!tailEntered)
                {
                    tailEntered = true;
                    engine->setSequencerPlaying(false, true);
                }
                const int step = std::min(numFrames - rendered, tailSamplesLeft);
                engine->processAudio(outL + rendered, outR + rendered, step);
                tailSamplesLeft -= step;
                rendered += step;
            }
        }
        return rendered;
    }

    [[nodiscard]] int remainingSamples() const noexcept { return activeSamplesLeft + tailSamplesLeft; }

    void end() noexcept
    {
        if (!active || !engine) return;
        engine->setSequencerPlaying(false, true);
        engine->allNotesOff();
        for (int i = 0; i < McxEngine::kNumParts; ++i)
        {
            const auto u = static_cast<std::size_t>(i);
            engine->part(i).mute = prevPartMute[u];
            engine->part(i).solo = prevPartSolo[u];
        }
        engine->setGlobalTranspose(prevGlobalTranspose);
        engine->bankLayout().bankMuteMask = prevBankMuteMask;
        engine->bankLayout().bankSoloMask = prevBankSoloMask;
        auto& seq = engine->sequencer();
        seq.setLoopEnabled(prevSeqLoop);
        seq.setCountInBars(prevCountInBars);
        seq.setRecording(prevSeqRec);
        engine->setSongModeEnabled(prevSongMode);
        engine->setSongLoopEnabled(prevSongLoop);
        active = false;
        engine = nullptr;
    }
};

inline bool renderEngineOfflineWav(McxEngine& engine, const OfflineBounceOptions& opts,
                                   std::vector<std::uint8_t>& outWav)
{
    OfflineBounceSession session;
    const int totalFrames = session.begin(engine, opts);
    if (totalFrames <= 0) { session.end(); return false; }
    std::vector<float> bufL(static_cast<std::size_t>(totalFrames), 0.0f);
    std::vector<float> bufR(static_cast<std::size_t>(totalFrames), 0.0f);
    session.renderChunk(bufL.data(), bufR.data(), totalFrames);
    session.end();
    encodeStereoPcm16Wav(bufL.data(), bufR.data(), totalFrames, static_cast<int>(std::lrint(session.sampleRate)), outWav);
    return !outWav.empty();
}

} // namespace abdmcx
