#include "McxRackChassis.h"

#include <algorithm>

namespace abdmcx
{

void McxRackChassis::setSlotParams(int slotIdx, float p1, float p2, float dryWetMix) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    st.p1 = std::clamp(p1, 0.0f, 1.0f);
    st.p2 = std::clamp(p2, 0.0f, 1.0f);
    st.dryWetMix = std::clamp(dryWetMix, 0.0f, 1.0f);
    applySlotDspParams(slotIdx);
}

void McxRackChassis::setSlotParamByKey(int slotIdx, std::string_view key, float value) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    const float v01 = std::clamp(value, 0.0f, 1.0f);
    if (key == "mix") st.dryWetMix = v01;
    else if (key == "mode" || key == "curve" || key == "pingPong") st.mode = std::clamp(static_cast<int>(value), 0, 15);
    else if (key == "p1" || key == "rate" || key == "decay" || key == "time" || key == "midGain" || key == "thresh" || key == "cutoff" || (key == "drive" && st.engineType != McxRackEngineType::MoodFilter)) st.p1 = v01;
    else if (key == "p2" || key == "intensity" || key == "fb" || key == "tone" || key == "midFreq" || key == "reso" || (key == "damp" && st.engineType != McxRackEngineType::StereoDelay) || (key == "depth" && st.engineType != McxRackEngineType::MoodFilter)) st.p2 = v01;
    else if (key == "p3" || key == "size" || key == "echoVol" || key == "width" || key == "bias" || key == "damp" || (key == "drive" && st.engineType == McxRackEngineType::MoodFilter)) st.p3 = v01;
    else if (key == "p4" || key == "preDelay" || key == "bass" || key == "noise" || key == "spread" || key == "level" || (key == "depth" && st.engineType == McxRackEngineType::MoodFilter)) st.p4 = v01;
    else if (key == "p5" || key == "lowCut" || key == "treble" || key == "sync") st.p5 = v01;
    applySlotDspParams(slotIdx);
}

void McxRackChassis::applySlotDspParams(int slotIdx) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return;
    const auto& st = states_[static_cast<std::size_t>(slotIdx)];
    auto& d = (*dsp_)[static_cast<std::size_t>(slotIdx)];
    if (st.engineType == McxRackEngineType::ZitaReverb)
    {
        d.zita.setDecayNorm(st.p1); d.zita.setDampingNorm(st.p2);
        d.zita.setSizeNorm(st.p3); d.zita.setPreDelayNorm(st.p4); d.zita.setMixNorm(1.0f);
    }
    else if (st.engineType == McxRackEngineType::SpaceEcho)
    {
        d.delay.setTimeNorm(st.p1); d.delay.setFeedbackLNorm(st.p2); d.delay.setFeedbackRNorm(st.p2);
        d.delay.setMode(st.mode % 4); d.delay.setLoCutNorm(1.0f - st.p4); d.delay.setHiCutNorm(st.p5);
        d.zita.setDecayNorm(st.p2 * 0.8f); d.zita.setMixNorm(1.0f);
    }
    else if (st.engineType == McxRackEngineType::StereoDelay)
    {
        d.delay.setTimeNorm(st.p1); d.delay.setFeedbackLNorm(st.p2); d.delay.setFeedbackRNorm(st.p2);
        d.delay.setHiCutNorm(1.0f - st.p3); d.delay.setOffsetNorm(0.5f + (st.p4 - 0.5f) * 0.8f);
        d.delay.setMode(st.mode > 0 ? abd::dsp::DspStereoDelay::kPingPong : abd::dsp::DspStereoDelay::kStereo);
    }
    else if (st.engineType == McxRackEngineType::BbdChorus)
    {
        d.chorus.setSpeedNorm(st.p1); d.chorus.setWidthLNorm(st.p2); d.chorus.setWidthRNorm(st.p2);
        d.chorus.setSpreadNorm(st.p3); d.chorus.setPhaseNorm(st.p3);
    }
    else if (st.engineType == McxRackEngineType::Flanger)
    {
        d.flanger.setRateNorm(st.p1); d.flanger.setFeedbackNorm(st.p2);
        d.flanger.setDepthLNorm(st.p3); d.flanger.setDepthRNorm(st.p3);
        d.flanger.setBaseDelayLNorm(st.p4); d.flanger.setBaseDelayRNorm(st.p4);
    }
    else if (st.engineType == McxRackEngineType::MidasEq)
    {
        d.midasEq.setEqIn(true); d.midasEq.setLoMidGainNorm(st.p1); d.midasEq.setLoMidFreqNorm(st.p2);
        d.midasEq.setLoShelfGainNorm(st.p3); d.midasEq.setHiShelfGainNorm(st.p4);
    }
    else if (st.engineType == McxRackEngineType::FairComp)
    {
        d.fairComp.setMode(abd::dsp::DspFairComp::kStereo); d.fairComp.setThresholdLM(st.p1);
        d.fairComp.setTimeConstantLM(st.p2); d.fairComp.setDcBiasLM(st.p3); d.fairComp.setOutputGainLM(st.p4);
    }
    else if (st.engineType == McxRackEngineType::MoodFilter)
    {
        d.moodFilter.setBaseFreqNorm(st.p1); d.moodFilter.setResonanceNorm(st.p2);
        d.moodFilter.setDriveNorm(st.p3); d.moodFilter.setDepthNorm(st.p4 * 0.5f);
    }
}

void McxRackChassis::applyPresetToSlot(int slotIdx, int presetIdx) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    if (presetIdx == 0) { st.p1 = 0.35f; st.p2 = 0.45f; }
    else if (presetIdx == 1) { st.p1 = 0.65f; st.p2 = 0.30f; }
    else if (presetIdx == 2) { st.p1 = 0.80f; st.p2 = 0.70f; }
    else { st.p1 = 0.50f; st.p2 = 0.50f; }
    setSlotParams(slotIdx, st.p1, st.p2, st.dryWetMix);
}

} // namespace abdmcx
