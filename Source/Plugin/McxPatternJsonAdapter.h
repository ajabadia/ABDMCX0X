#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../Sequencer/McxPatternSequencer.h"
#include <juce_core/juce_core.h>
#include <algorithm>

namespace abdmcx
{

namespace detail
{
[[nodiscard]] inline int mapMotionTargetNameToParamId(const juce::String& name) noexcept
{
    if (name == "cutoff") return 0;
    if (name == "resonance") return 1;
    if (name == "pan") return 7;
    if (name == "sendA") return 8;
    if (name == "sendB") return 9;
    if (name == "sendC") return 47;
    if (name == "sendD") return 48;
    return -1;
}

[[nodiscard]] inline int mapGrooveMode(const juce::String& m) noexcept
{
    if (m == "custom") return 1;
    if (m == "off") return 2;
    return 0;
}

[[nodiscard]] inline int mapGrooveAlgorithm(const juce::String& a) noexcept
{
    if (a == "tr909") return 1;
    if (a == "sp1200") return 2;
    if (a == "triplet") return 3;
    if (a == "dilla") return 4;
    return 0;
}
} // namespace detail

/**
 * @brief Converts a WebView2 pattern DTO into McxPatternSequencer double-buffer (lock-free).
 */
inline void applyPatternDtoToEngine(McxEngine& engine, int partIdx, const juce::DynamicObject& obj) noexcept
{
    if (partIdx < 0 || partIdx >= McxEngine::kNumParts)
        return;

    auto& seq = engine.sequencer();
    if (obj.hasProperty("bars"))
        seq.setBars(static_cast<int>(obj.getProperty("bars")));
    if (obj.hasProperty("ppq"))
        seq.setPpq(static_cast<int>(obj.getProperty("ppq")));

    McxPatternSequencer::PartPattern pat {};
    const int totalTicks = std::max(1, seq.getTotalTicks());

    if (const auto notesVar = obj.getProperty("notes"); notesVar.isArray())
    {
        if (const auto* arr = notesVar.getArray())
        {
            for (const auto& item : *arr)
            {
                if (!item.isObject() || pat.eventCount >= McxPatternSequencer::kMaxEventsPerPart)
                    continue;
                const auto* nObj = item.getDynamicObject();
                if (!nObj) continue;

                auto& ev = pat.events[static_cast<std::size_t>(pat.eventCount++)];
                ev.startTick = std::clamp(static_cast<int>(nObj->getProperty("startTick")), 0, totalTicks - 1);
                ev.durationTicks = std::max(1, static_cast<int>(nObj->getProperty("durationTicks")));
                ev.midiNote = static_cast<std::uint8_t>(std::clamp(static_cast<int>(nObj->getProperty("midiNote")), 0, 127));
                ev.velocity = static_cast<std::uint8_t>(std::clamp(static_cast<int>(nObj->getProperty("velocity")), 1, 127));
                ev.slide = static_cast<bool>(nObj->getProperty("slide"));
                ev.active = true;
            }
        }
    }

    if (const auto motionVar = obj.getProperty("motion"); motionVar.isObject())
    {
        if (const auto* mObj = motionVar.getDynamicObject())
        {
            int laneIdx = 0;
            for (const auto& prop : mObj->getProperties())
            {
                if (laneIdx >= McxPatternSequencer::kMaxMotionLanes) break;
                const auto keyStr = prop.name.toString();
                const int paramId = detail::mapMotionTargetNameToParamId(keyStr);
                const auto pHash = McxPatternSequencer::hashMotionParamId(keyStr.toStdString());
                if ((paramId < 0 && pHash == 0u) || !prop.value.isArray()) continue;
                const auto* pts = prop.value.getArray();
                if (!pts) continue;

                auto& lane = pat.motionLanes[static_cast<std::size_t>(laneIdx++)];
                lane.paramId = paramId;
                lane.paramHash = pHash;
                for (const auto& ptVar : *pts)
                {
                    if (!ptVar.isObject() || lane.count >= McxPatternSequencer::kMaxMotionPoints)
                        continue;
                    const auto* ptObj = ptVar.getDynamicObject();
                    if (!ptObj) continue;
                    lane.points[static_cast<std::size_t>(lane.count++)] = {
                        std::clamp(static_cast<int>(ptObj->getProperty("tick")), 0, totalTicks - 1),
                        static_cast<float>(ptObj->getProperty("value"))
                    };
                }
            }
        }
    }

    seq.replacePartPattern(partIdx, pat);
}

} // namespace abdmcx
