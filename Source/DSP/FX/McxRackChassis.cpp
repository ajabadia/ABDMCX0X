#include "McxRackChassis.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace abdmcx
{

namespace
{
float slotTailSeconds(McxRackEngineType t) noexcept
{
    if (t == McxRackEngineType::ZitaReverb || t == McxRackEngineType::SpaceEcho) return 5.0f;
    if (t == McxRackEngineType::StereoDelay) return 3.5f;
    if (t == McxRackEngineType::BbdChorus || t == McxRackEngineType::Flanger) return 1.2f;
    return 0.25f;
}

float nextNoise(std::uint32_t& state) noexcept
{
    state = state * 1664525u + 1013904223u;
    return (static_cast<float>(state >> 16) / 32768.0f) - 1.0f;
}

float processSatSample(float x, const McxRackSlotState& st) noexcept
{
    const float drive = 1.0f + st.p1 * 3.0f;
    if (st.mode == 1) return std::tanh(x * drive * 0.9f);
    if (st.mode == 2) return std::tanh((x + (st.p3 - 0.5f) * 0.25f) * drive * 1.15f);
    if (st.mode == 3) return std::clamp(x * drive, -0.95f, 0.95f);
    return abd::dsp::Saturation::processSample(x, drive);
}
} // namespace

McxRackChassis::McxRackChassis()
    : dsp_(std::make_unique<std::array<SlotDsp, kMaxSlots>>())
{
    for (int i = 0; i < kMaxSlots; ++i)
    {
        states_[static_cast<std::size_t>(i)].slotIndex = i;
        states_[static_cast<std::size_t>(i)].engineType = McxRackEngineType::Bypass;
    }
}

void McxRackChassis::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    if (dsp_)
    {
        for (auto& s : *dsp_)
        {
            s.zita.prepare(sampleRate_); s.zita.setMixNorm(1.0f);
            s.delay.prepare(sampleRate_); s.chorus.prepare(sampleRate_); s.flanger.prepare(sampleRate_);
            s.midasEq.prepare(sampleRate_); s.fairComp.prepare(sampleRate_); s.moodFilter.prepare(sampleRate_);
        }
    }
    reset();
}

void McxRackChassis::reset() noexcept
{
    if (!dsp_) return;
    for (auto& s : *dsp_)
    {
        s.zita.reset(); s.delay.reset(); s.chorus.reset(); s.flanger.reset();
        s.midasEq.reset(); s.fairComp.reset(); s.moodFilter.reset();
        s.tailSamplesRemaining = 0; s.smoothBypassGain = s.smoothDuckGain = 1.0f;
        s.toneStateL = s.toneStateR = 0.0f;
        s.peakInL = s.peakInR = s.peakOutL = s.peakOutR = 0.0f;
        s.clipHoldIn = s.clipHoldOut = 0.0f;
    }
}

void McxRackChassis::setSlotEngine(int slotIdx, McxRackEngineType type, const char* customName) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    st.engineType = type;
    std::snprintf(st.algoId, sizeof(st.algoId), "%s", getRackEngineDefaultAlgoId(type));
    std::snprintf(st.customName, sizeof(st.customName), "%s", (customName && customName[0]) ? customName : getRackEngineName(type).data());
    st.bypassed = false; st.sleeping = false; st.presetIdx = 0;
    st.p3 = (type == McxRackEngineType::SpaceEcho) ? 0.8f : (type == McxRackEngineType::ZitaReverb) ? 0.7f : (type == McxRackEngineType::BbdChorus) ? 0.85f : (type == McxRackEngineType::StereoDelay || type == McxRackEngineType::Saturation) ? 0.3f : 0.5f;
    st.p4 = (type == McxRackEngineType::BbdChorus) ? 0.1f : (type == McxRackEngineType::ZitaReverb) ? 0.2f : (type == McxRackEngineType::StereoDelay || type == McxRackEngineType::Saturation) ? 0.8f : 0.5f;
    st.p5 = (type == McxRackEngineType::ZitaReverb) ? 0.15f : 0.5f;
    st.mode = (type == McxRackEngineType::SpaceEcho || type == McxRackEngineType::BbdChorus) ? 3 : (type == McxRackEngineType::StereoDelay ? 1 : 0);
    applyPresetToSlot(slotIdx, 0);
}

void McxRackChassis::removeSlotEngine(int slotIdx) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    st.engineType = McxRackEngineType::Bypass;
    st.algoId[0] = st.customName[0] = '\0';
    st.bypassed = false; st.sleeping = true; st.chainTargetSlot = -1;
    if (dsp_) (*dsp_)[static_cast<std::size_t>(slotIdx)].tailSamplesRemaining = 0;
    for (auto& other : states_)
        if (other.chainTargetSlot == slotIdx) other.chainTargetSlot = -1;
}

void McxRackChassis::moveSlot(int fromIdx, int toIdx) noexcept
{
    if (fromIdx < 0 || fromIdx >= kMaxSlots || toIdx < 0 || toIdx >= kMaxSlots || fromIdx == toIdx) return;
    std::swap(states_[static_cast<std::size_t>(fromIdx)], states_[static_cast<std::size_t>(toIdx)]);
    if (dsp_) std::swap((*dsp_)[static_cast<std::size_t>(fromIdx)], (*dsp_)[static_cast<std::size_t>(toIdx)]);
    states_[static_cast<std::size_t>(fromIdx)].slotIndex = fromIdx;
    states_[static_cast<std::size_t>(toIdx)].slotIndex = toIdx;
    for (int i = 0; i < kMaxSlots; ++i)
    {
        auto& ch = states_[static_cast<std::size_t>(i)].chainTargetSlot;
        if (ch == fromIdx) ch = toIdx;
        else if (ch == toIdx) ch = fromIdx;
        if (ch == i) ch = -1;
    }
}

void McxRackChassis::setSlotBypass(int slotIdx, bool bypassed) noexcept
{
    if (slotIdx >= 0 && slotIdx < kMaxSlots)
        states_[static_cast<std::size_t>(slotIdx)].bypassed = bypassed;
}

void McxRackChassis::setSlotCustomName(int slotIdx, const char* name) noexcept
{
    if (slotIdx >= 0 && slotIdx < kMaxSlots && name)
        std::snprintf(states_[static_cast<std::size_t>(slotIdx)].customName,
                      sizeof(states_[static_cast<std::size_t>(slotIdx)].customName), "%s", name);
}

void McxRackChassis::setSlotPreset(int slotIdx, int presetIdx) noexcept
{
    if (slotIdx >= 0 && slotIdx < kMaxSlots) { states_[static_cast<std::size_t>(slotIdx)].presetIdx = presetIdx; applyPresetToSlot(slotIdx, presetIdx); }
}

void McxRackChassis::setSlotDucking(int slotIdx, bool enabled, float amount) noexcept
{
    if (slotIdx >= 0 && slotIdx < kMaxSlots) {
        states_[static_cast<std::size_t>(slotIdx)].scDuckEnabled = enabled;
        states_[static_cast<std::size_t>(slotIdx)].scDuckAmount = std::clamp(amount, 0.0f, 1.0f);
    }
}

void McxRackChassis::setSlotChainTarget(int slotIdx, int targetSlotIdx) noexcept
{
    if (slotIdx >= 0 && slotIdx < kMaxSlots)
        states_[static_cast<std::size_t>(slotIdx)].chainTargetSlot = (targetSlotIdx >= 0 && targetSlotIdx < kMaxSlots && targetSlotIdx != slotIdx) ? targetSlotIdx : -1;
}

int McxRackChassis::getSlotChainTarget(int slotIdx) const noexcept
{
    return (slotIdx >= 0 && slotIdx < kMaxSlots) ? states_[static_cast<std::size_t>(slotIdx)].chainTargetSlot : -1;
}

McxRackSlotTelemetry McxRackChassis::getSlotTelemetry(int slotIdx) const noexcept
{
    McxRackSlotTelemetry t {};
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return t;
    const auto& d = (*dsp_)[static_cast<std::size_t>(slotIdx)];
    t.peakInL = d.peakInL; t.peakInR = d.peakInR; t.peakOutL = d.peakOutL; t.peakOutR = d.peakOutR;
    t.isClipIn = d.clipHoldIn > 0.0f; t.isClipOut = d.clipHoldOut > 0.0f; t.isSleeping = states_[static_cast<std::size_t>(slotIdx)].sleeping;
    return t;
}

const McxRackSlotState& McxRackChassis::getSlotState(int slotIdx) const noexcept
{
    static const McxRackSlotState kDummy {};
    return (slotIdx >= 0 && slotIdx < kMaxSlots) ? states_[static_cast<std::size_t>(slotIdx)] : kDummy;
}

bool McxRackChassis::isSlotActive(int slotIdx) const noexcept
{
    return (slotIdx >= 0 && slotIdx < kMaxSlots) && (states_[static_cast<std::size_t>(slotIdx)].engineType != McxRackEngineType::Bypass);
}

bool McxRackChassis::hasSlotActivity(int slotIdx) const noexcept
{
    if (!isSlotActive(slotIdx) || !dsp_) return false;
    const auto idx = static_cast<std::size_t>(slotIdx);
    return !states_[idx].bypassed && (*dsp_)[idx].tailSamplesRemaining > 0;
}

bool McxRackChassis::hasAnySlotActivity() const noexcept
{
    for (int i = 0; i < kMaxSlots; ++i)
        if (hasSlotActivity(i)) return true;
    return false;
}

void McxRackChassis::processSlot(int slotIdx, const float* inL, const float* inR, float* outL, float* outR, int numSamples, bool sidechainDuck) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !outL || !outR || numSamples <= 0) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    if (!dsp_ || st.engineType == McxRackEngineType::Bypass || st.bypassed || !inL || !inR) {
        if (inL && inR && inL != outL) { std::memcpy(outL, inL, sizeof(float) * numSamples); std::memcpy(outR, inR, sizeof(float) * numSamples); }
        st.sleeping = true; return;
    }
    const int n = std::min(numSamples, kMaxChunk);
    auto& d = (*dsp_)[static_cast<std::size_t>(slotIdx)];
    float pIn = 0.0f;
    for (int i = 0; i < n; ++i) { tempL_[i] = inL[i]; tempR_[i] = inR[i]; pIn = std::max(pIn, std::max(std::abs(inL[i]), std::abs(inR[i]))); }
    d.peakInL = std::max(pIn, d.peakInL * 0.88f); d.peakInR = std::max(pIn, d.peakInR * 0.88f);
    if (pIn >= 1.0f) d.clipHoldIn = 1.5f;
    else if (d.clipHoldIn > 0.0f) d.clipHoldIn = std::max(0.0f, d.clipHoldIn - static_cast<float>(n) / static_cast<float>(sampleRate_));

    if (pIn < 1e-4f) {
        if (d.tailSamplesRemaining > 0) d.tailSamplesRemaining = std::max(0, d.tailSamplesRemaining - n);
        else { st.sleeping = true; if (inL != outL) { std::memcpy(outL, tempL_.data(), sizeof(float) * n); std::memcpy(outR, tempR_.data(), sizeof(float) * n); } return; }
    } else { st.sleeping = false; d.tailSamplesRemaining = static_cast<int>(sampleRate_ * slotTailSeconds(st.engineType)); }

    const float targetDuck = (st.scDuckEnabled && sidechainDuck) ? std::max(0.08f, 1.0f - st.scDuckAmount * 0.85f) : 1.0f;
    d.smoothDuckGain += (targetDuck - d.smoothDuckGain) * 0.12f;
    const float *srcL = tempL_.data(), *srcR = tempR_.data();

    if (st.engineType == McxRackEngineType::ZitaReverb) {
        d.zita.process(srcL, srcR, outL, outR, n);
        if (st.p5 > 0.01f) { const float c = 0.005f + st.p5 * 0.08f; for (int i = 0; i < n; ++i) { d.toneStateL += c * (outL[i] - d.toneStateL); d.toneStateR += c * (outR[i] - d.toneStateR); outL[i] -= d.toneStateL; outR[i] -= d.toneStateR; } }
    } else if (st.engineType == McxRackEngineType::SpaceEcho) {
        if (st.mode == 11) d.zita.process(srcL, srcR, outL, outR, n);
        else { d.delay.process(srcL, srcR, outL, outR, n); const float ev = 0.2f + st.p3 * 1.0f; for (int i = 0; i < n; ++i) { outL[i] *= ev; outR[i] *= ev; } }
    } else if (st.engineType == McxRackEngineType::StereoDelay) d.delay.process(srcL, srcR, outL, outR, n);
    else if (st.engineType == McxRackEngineType::BbdChorus) {
        if (st.mode == 0) { std::memcpy(outL, srcL, sizeof(float) * n); std::memcpy(outR, srcR, sizeof(float) * n); }
        else { d.chorus.process(srcL, srcR, outL, outR, n); const float na = st.p4 * 0.0015f; for (int i = 0; i < n; ++i) { outL[i] += nextNoise(d.noiseRng) * na; outR[i] += nextNoise(d.noiseRng) * na; } }
    } else if (st.engineType == McxRackEngineType::Flanger) d.flanger.process(srcL, srcR, outL, outR, n);
    else if (st.engineType == McxRackEngineType::Saturation) {
        const float lvl = st.p4 * 1.25f, lp = 0.15f + st.p2 * 0.80f;
        for (int i = 0; i < n; ++i) { d.toneStateL += lp * (processSatSample(srcL[i], st) - d.toneStateL); d.toneStateR += lp * (processSatSample(srcR[i], st) - d.toneStateR); outL[i] = d.toneStateL * lvl; outR[i] = d.toneStateR * lvl; }
    } else if (st.engineType == McxRackEngineType::MidasEq) d.midasEq.process(srcL, srcR, outL, outR, n);
    else if (st.engineType == McxRackEngineType::FairComp) d.fairComp.process(srcL, srcR, outL, outR, n);
    else if (st.engineType == McxRackEngineType::MoodFilter) d.moodFilter.process(srcL, srcR, outL, outR, n);
    else { std::memcpy(outL, srcL, sizeof(float) * n); std::memcpy(outR, srcR, sizeof(float) * n); }

    const float wet = st.dryWetMix, dry = 1.0f - wet;
    float pOut = 0.0f;
    for (int i = 0; i < n; ++i) {
        outL[i] = (srcL[i] * dry + outL[i] * wet) * d.smoothDuckGain;
        outR[i] = (srcR[i] * dry + outR[i] * wet) * d.smoothDuckGain;
        pOut = std::max(pOut, std::max(std::abs(outL[i]), std::abs(outR[i])));
    }
    d.peakOutL = std::max(pOut, d.peakOutL * 0.88f); d.peakOutR = std::max(pOut, d.peakOutR * 0.88f);
    if (pOut >= 1.0f) d.clipHoldOut = 1.5f;
    else if (d.clipHoldOut > 0.0f) d.clipHoldOut = std::max(0.0f, d.clipHoldOut - static_cast<float>(n) / static_cast<float>(sampleRate_));
}

} // namespace abdmcx
