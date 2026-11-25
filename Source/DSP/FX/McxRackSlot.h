#pragma once

#include <cstdint>
#include <string_view>

namespace abdmcx
{

enum class McxRackEngineType : int
{
    Bypass = 0,
    ZitaReverb = 1,
    SpaceEcho = 2,
    BbdChorus = 3,
    StereoDelay = 4,
    Saturation = 5,
    Flanger = 6,
    MidasEq = 7,
    FairComp = 8,
    MoodFilter = 9,
    RolandBossReverb = 10,
    RolandMt32Reverb = 11,
    RolandMultiChorus = 12,
    RolandToneEq = 13,
    RolandJvReverb = 14,
    RolandJvChorus = 15,
    RolandGsDelay = 16,
    Ms2000ChorusFlanger = 17,
    Ms2000Ensemble = 18,
    Ms2000Phaser = 19,
    Ms2000Delay = 20,
    Ms2000Distortion = 21,
    Ms2000Eq = 22,
    NeuronSilverFilter = 23,
    NeuronSilverFreq = 24,
    NeuronSilverTime = 25,
    NeuronSlicer = 26,
    GolanaReverb = 27,
    IterumDelay = 28,
    Re201Wdf = 29,
    Kr106Chorus = 30,
    Count
};

struct McxRackSlotTelemetry
{
    float peakInL { 0.0f };
    float peakInR { 0.0f };
    float peakOutL { 0.0f };
    float peakOutR { 0.0f };
    bool isClipIn { false };
    bool isClipOut { false };
    bool isSleeping { false };
};

struct McxRackSlotState
{
    int slotIndex { 0 };
    McxRackEngineType engineType { McxRackEngineType::Bypass };
    char algoId[32] { "" };
    char customName[32] { "" };
    bool bypassed { false };
    bool sleeping { true };
    float inGain { 1.0f };
    float dryWetMix { 1.0f };
    int presetIdx { 0 };
    bool scDuckEnabled { false };
    float scDuckAmount { 0.6f };
    float p1 { 0.5f };
    float p2 { 0.5f };
    float p3 { 0.5f };
    float p4 { 0.8f };
    float p5 { 0.5f };
    float p6 { 0.5f };
    float p7 { 0.5f };
    float p8 { 0.5f };
    float p9 { 0.5f };
    float p10 { 0.5f };
    float p11 { 0.5f };
    float p12 { 0.5f };
    int mode { 0 };
    int chainTargetSlot { -1 }; // -1 = Master Return, 0..7 = Chain into Slot N
};

[[nodiscard]] constexpr std::string_view getRackEngineName(McxRackEngineType type) noexcept
{
    switch (type)
    {
        case McxRackEngineType::ZitaReverb:  return "Zita Reverb";
        case McxRackEngineType::SpaceEcho:   return "Space Echo RE-201";
        case McxRackEngineType::BbdChorus:   return "Roland BBD Chorus";
        case McxRackEngineType::StereoDelay: return "Stereo Delay";
        case McxRackEngineType::Saturation:  return "Tape Saturation";
        case McxRackEngineType::Flanger:     return "Stereo Flanger";
        case McxRackEngineType::MidasEq:     return "Midas 3-Band EQ";
        case McxRackEngineType::FairComp:          return "Fairchild Comp";
        case McxRackEngineType::MoodFilter:        return "Mood Filter LPF";
        case McxRackEngineType::RolandBossReverb:  return "Roland LA-50 Boss Reverb";
        case McxRackEngineType::RolandMt32Reverb:  return "Roland MT-32 / CM-32L Reverb";
        case McxRackEngineType::RolandMultiChorus: return "Roland LA-50 Multi-Chorus";
        case McxRackEngineType::RolandToneEq:      return "Roland LA-50 Tone EQ";
        case McxRackEngineType::RolandJvReverb:    return "Roland JV-880 / GS Reverb";
        case McxRackEngineType::RolandJvChorus:    return "Roland JV-880 / GS Chorus";
        case McxRackEngineType::RolandGsDelay:     return "Roland GS / MC-303 3-Tap Delay";
        case McxRackEngineType::Ms2000ChorusFlanger: return "Korg MS2000 Chorus / Flanger";
        case McxRackEngineType::Ms2000Ensemble:      return "Korg MS2000 3-Phase Ensemble";
        case McxRackEngineType::Ms2000Phaser:        return "Korg MS2000 4-Stage Phaser";
        case McxRackEngineType::Ms2000Delay:         return "Korg MS2000 Stereo / Cross Delay";
        case McxRackEngineType::Ms2000Distortion:    return "Korg MS2000 Voice Distortion";
        case McxRackEngineType::Ms2000Eq:            return "Korg MS2000 2-Band Shelf EQ";
        case McxRackEngineType::NeuronSilverFilter:  return "Hartmann Neuron Silver Filter";
        case McxRackEngineType::NeuronSilverFreq:    return "Hartmann Neuron Silver FreqFX";
        case McxRackEngineType::NeuronSilverTime:    return "Hartmann Neuron Silver TimeFX";
        case McxRackEngineType::NeuronSlicer:        return "Hartmann Neuron 2D/3D Slicer";
        case McxRackEngineType::GolanaReverb:        return "Hugelton Golana Reverb";
        case McxRackEngineType::IterumDelay:         return "Krate Iterum 11-Mode Delay";
        case McxRackEngineType::Re201Wdf:            return "Roland RE-201 WDF Tape & Spring";
        case McxRackEngineType::Kr106Chorus:         return "Juno-6/106 KR-106 BBD Chorus";
        case McxRackEngineType::Bypass:
        default:                                   return "Bypass / Empty";
    }
}

[[nodiscard]] constexpr const char* getRackEngineDefaultAlgoId(McxRackEngineType type) noexcept
{
    switch (type)
    {
        case McxRackEngineType::ZitaReverb:        return "zita";
        case McxRackEngineType::SpaceEcho:         return "space_echo";
        case McxRackEngineType::BbdChorus:         return "bbd_chorus";
        case McxRackEngineType::StereoDelay:       return "stereo_delay";
        case McxRackEngineType::Saturation:        return "saturation";
        case McxRackEngineType::Flanger:           return "flanger";
        case McxRackEngineType::MidasEq:           return "midas_eq";
        case McxRackEngineType::FairComp:          return "fair_comp";
        case McxRackEngineType::MoodFilter:        return "mood_filter";
        case McxRackEngineType::RolandBossReverb:  return "roland_boss_reverb";
        case McxRackEngineType::RolandMt32Reverb:  return "roland_mt32_reverb";
        case McxRackEngineType::RolandMultiChorus: return "roland_multi_chorus";
        case McxRackEngineType::RolandToneEq:      return "roland_tone_eq";
        case McxRackEngineType::RolandJvReverb:    return "roland_jv_reverb";
        case McxRackEngineType::RolandJvChorus:    return "roland_jv_chorus";
        case McxRackEngineType::RolandGsDelay:     return "roland_gs_delay";
        case McxRackEngineType::Ms2000ChorusFlanger: return "ms2000_chorus_flanger";
        case McxRackEngineType::Ms2000Ensemble:      return "ms2000_ensemble";
        case McxRackEngineType::Ms2000Phaser:        return "ms2000_phaser";
        case McxRackEngineType::Ms2000Delay:         return "ms2000_delay";
        case McxRackEngineType::Ms2000Distortion:    return "ms2000_distortion";
        case McxRackEngineType::Ms2000Eq:            return "ms2000_eq";
        case McxRackEngineType::NeuronSilverFilter:  return "neuron_silver_filter";
        case McxRackEngineType::NeuronSilverFreq:    return "neuron_silver_freq";
        case McxRackEngineType::NeuronSilverTime:    return "neuron_silver_time";
        case McxRackEngineType::NeuronSlicer:        return "neuron_slicer";
        case McxRackEngineType::GolanaReverb:        return "golana_reverb";
        case McxRackEngineType::IterumDelay:         return "iterum_delay";
        case McxRackEngineType::Re201Wdf:            return "re201_wdf";
        case McxRackEngineType::Kr106Chorus:         return "kr106_chorus";
        case McxRackEngineType::Bypass:
        default:                                   return "";
    }
}

[[nodiscard]] constexpr McxRackEngineType normalizeRackEngineType(int rawId) noexcept
{
    if (rawId >= 0 && rawId < static_cast<int>(McxRackEngineType::Count))
        return static_cast<McxRackEngineType>(rawId);
    switch (rawId)
    {
        case 61: return McxRackEngineType::RolandBossReverb;
        case 62: return McxRackEngineType::RolandMt32Reverb;
        case 63: return McxRackEngineType::RolandMultiChorus;
        case 64: return McxRackEngineType::RolandToneEq;
        case 65: return McxRackEngineType::RolandJvReverb;
        case 66: return McxRackEngineType::RolandJvChorus;
        case 67: return McxRackEngineType::RolandGsDelay;
        case 68: return McxRackEngineType::Ms2000ChorusFlanger;
        case 69: return McxRackEngineType::Ms2000Ensemble;
        case 70: return McxRackEngineType::Ms2000Phaser;
        case 71: return McxRackEngineType::Ms2000Delay;
        case 72: return McxRackEngineType::Ms2000Distortion;
        case 73: return McxRackEngineType::Ms2000Eq;
        case 74: return McxRackEngineType::NeuronSilverFilter;
        case 75: return McxRackEngineType::NeuronSilverFreq;
        case 76: return McxRackEngineType::NeuronSilverTime;
        case 77: return McxRackEngineType::NeuronSlicer;
        case 78: return McxRackEngineType::GolanaReverb;
        case 79: return McxRackEngineType::IterumDelay;
        case 80: return McxRackEngineType::Re201Wdf;
        case 81: return McxRackEngineType::Kr106Chorus;
        case 53: return McxRackEngineType::ZitaReverb;
        case 39: return McxRackEngineType::SpaceEcho;
        case 36: return McxRackEngineType::BbdChorus;
        case 58: return McxRackEngineType::Saturation;
        case 30: return McxRackEngineType::MidasEq;
        case 31: return McxRackEngineType::FairComp;
        default: return McxRackEngineType::Bypass;
    }
}

} // namespace abdmcx
