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
        case McxRackEngineType::FairComp:    return "Fairchild Comp";
        case McxRackEngineType::MoodFilter:  return "Mood Filter LPF";
        case McxRackEngineType::Bypass:
        default:                             return "Bypass / Empty";
    }
}

[[nodiscard]] constexpr const char* getRackEngineDefaultAlgoId(McxRackEngineType type) noexcept
{
    switch (type)
    {
        case McxRackEngineType::ZitaReverb:  return "zita";
        case McxRackEngineType::SpaceEcho:   return "space_echo";
        case McxRackEngineType::BbdChorus:   return "bbd_chorus";
        case McxRackEngineType::StereoDelay: return "stereo_delay";
        case McxRackEngineType::Saturation:  return "saturation";
        case McxRackEngineType::Flanger:     return "flanger";
        case McxRackEngineType::MidasEq:     return "midas_eq";
        case McxRackEngineType::FairComp:    return "fair_comp";
        case McxRackEngineType::MoodFilter:  return "mood_filter";
        case McxRackEngineType::Bypass:
        default:                             return "";
    }
}

} // namespace abdmcx
