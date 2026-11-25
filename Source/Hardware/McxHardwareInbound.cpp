#include "McxHardwareBridge.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace abdmcx
{
namespace
{
struct DirectRoleKey { std::uint64_t hash; const char* key; };

constexpr DirectRoleKey kDirectNormRoleKeys[] = {
    { abd::synth::role::kAmpEnvDelay, "voiceDelay" },       { abd::synth::role::kAmpEnvHold, "ampHold" },
    { abd::synth::role::kOsc1Level, "voiceLevel" },         { abd::synth::role::kLfo1Delay, "lfoDelay" },
    { abd::synth::role::kFilterKeyTrack, "filterEnvTrack" }, { abd::synth::role::kFilterLfoDepth, "lfoToFilter" },
    { abd::synth::role::kFilterEnvAttack, "filterAttack" }, { abd::synth::role::kFilterEnvSustain, "filterSustain" },
    { abd::synth::role::kFilterEnvRelease, "filterRelease" }, { abd::synth::role::kTremoloDepth, "lfoToTrem" },
    { abd::synth::role::kDistortionDrive, "p1.drive" },
    { abd::synth::hashSemanticRole("Lfo1Variation"), "lfoVariation" },
    { abd::synth::hashSemanticRole("Lfo1PanDepth"), "lfoToPan" },
    { abd::synth::hashSemanticRole("AmpEnvVelocity"), "velToLevel" },
    { abd::synth::hashSemanticRole("FilterEnvVelocity"), "velToFilterCutoff" },
    { abd::synth::hashSemanticRole("FilterVelResonance"), "velToFilterQ" },
    { abd::synth::hashSemanticRole("ModSlot2Amount"), "velToPitch" },
    { abd::synth::hashSemanticRole("AmpEnvVelAttack"), "velToAttack" },
    { abd::synth::hashSemanticRole("FilterEnvVelAttack"), "velToFilterAttack" },
    { abd::synth::hashSemanticRole("PartVelPan"), "velToPan" },
    { abd::synth::hashSemanticRole("VoiceControlEnable"), "controlEnable" },
};

float normalizeWireByte(int dataVal, const abd::synth::SemanticControlBinding& b) noexcept
{
    const float v = (b.method == abd::synth::ControlWireMethod::Nrpn14Bit && dataVal > 127 && b.wireMax <= 127.0f)
        ? (static_cast<float>(dataVal) * (127.0f / 16383.0f)) : static_cast<float>(dataVal);
    const float span = b.wireMax - b.wireMin;
    if (std::abs(span) < 1e-6f)
        return std::clamp(v / 127.0f, 0.0f, 1.0f);
    return std::clamp((v - b.wireMin) / span, 0.0f, 1.0f);
}

bool rolandChecksumOk(const std::uint8_t* data, std::size_t len) noexcept
{
    if (len < 10 || data[0] != 0xF0 || data[1] != 0x41 || data[4] != 0x12 || data[len - 1] != 0xF7)
        return false;
    int sum = 0;
    for (std::size_t i = 5; i + 1 < len; ++i)
        sum += (data[i] & 0x7F);
    return (sum & 0x7F) == 0;
}

void applyDirectRolandDt1(McxEngine& eng, int partIdx, std::uint8_t model, const std::uint8_t* addr, const std::uint8_t* valBytes, std::size_t valLen) noexcept
{
    if (valLen == 0) return;
    const int v = valBytes[0] & 0x7F;
    if ((model == 0x14 && addr[0] == 0x00 && addr[1] <= 0x02) || (model == 0x16 && addr[0] == 0x04 && addr[1] == 0x00))
    {
        const std::uint8_t p = addr[2];
        if ((model == 0x14 && p == 0x10) || (model == 0x16 && p == 0x1A)) (void)eng.setPartEngineParamByKey(partIdx, "u.p1.tvfCutoff", static_cast<float>(std::min(100, v)));
        else if ((model == 0x14 && p == 0x11) || (model == 0x16 && p == 0x1B)) (void)eng.setPartEngineParamByKey(partIdx, "u.p1.tvfResonance", static_cast<float>(std::min(30, v)));
        else if ((model == 0x14 && p == 0x20) || (model == 0x16 && p == 0x2C)) (void)eng.setPartEngineParamByKey(partIdx, "u.p1.tvaEnv.t0", static_cast<float>(std::min(100, v)));
        else if ((model == 0x14 && p == 0x24) || (model == 0x16 && p == 0x30)) (void)eng.setPartEngineParamByKey(partIdx, "u.p1.tvaEnv.t4", static_cast<float>(std::min(100, v)));
    }
    else if (model == 0x46 && addr[2] >= 0x28 && addr[2] <= 0x2B)
    {
        char key[32]; const int pn = (addr[2] - 0x28) + 1;
        if (addr[3] == 0x4A) { std::snprintf(key, sizeof(key), "p%d.cutoffHz", pn); (void)eng.setPartEngineParamByKey(partIdx, key, 110.0f * std::pow(180.0f, static_cast<float>(v) / 127.0f)); }
        else if (addr[3] == 0x4B) { std::snprintf(key, sizeof(key), "p%d.resonance", pn); (void)eng.setPartEngineParamByKey(partIdx, key, std::clamp(static_cast<float>(v) / 130.0f, 0.0f, 0.98f)); }
        else if (addr[3] == 0x5C) { std::snprintf(key, sizeof(key), "p%d.level", pn); (void)eng.setPartEngineParamByKey(partIdx, key, static_cast<float>(v) / 127.0f); }
    }
}

} // namespace

void McxHardwareBridge::applyInternalSemanticParam(std::uint8_t partIdx, std::uint64_t roleHash, float normalizedVal) noexcept
{
    using namespace abd::synth::role;
    if (partIdx >= McxEngine::kNumParts) return;
    auto& p = engine_.part(partIdx);
    const float n = std::clamp(normalizedVal, 0.0f, 1.0f);

    if (roleHash == kPartVolume) p.level = n;
    else if (roleHash == kPartPan) p.pan = std::clamp(n * 2.0f - 1.0f, -1.0f, 1.0f);
    else if (roleHash == kPartReverbSend) p.reverbSend = n;
    else if (roleHash == kPartChorusSend) { p.chorusSend = n; (void)engine_.setPartEngineParamByKey(partIdx, "chorus", n); }
    else if (roleHash == kFilterCutoff) { p.semanticOffsets.cutoffOctaves = (n - 0.5f) * 2.0f; const float hz = 20.0f * std::pow(1000.0f, n); for (auto& pt : p.partials) pt.cutoffHz = hz; }
    else if (roleHash == kFilterResonance) { p.semanticOffsets.resonance = (n - 0.5f) * 2.0f; for (auto& pt : p.partials) pt.resonance = n; }
    else if (roleHash == kAmpEnvAttack) { p.semanticOffsets.envAttack = (n - 0.5f) * 2.0f; const float ms = 1.0f + n * 2000.0f; for (auto& pt : p.partials) pt.ampEnv.t1Ms = ms; }
    else if (roleHash == kAmpEnvDecay) { p.semanticOffsets.envDecay = (n - 0.5f) * 2.0f; const float ms = 5.0f + n * 3000.0f; for (auto& pt : p.partials) pt.ampEnv.t2Ms = ms; }
    else if (roleHash == kAmpEnvSustain) p.semanticOffsets.envSustain = (n - 0.5f) * 2.0f;
    else if (roleHash == kAmpEnvRelease) { p.semanticOffsets.envRelease = (n - 0.5f) * 2.0f; const float ms = 5.0f + n * 4000.0f; for (auto& pt : p.partials) pt.ampEnv.t4Ms = ms; }
    else if (roleHash == kLfo1Depth) p.semanticOffsets.vibratoDepth = (n - 0.5f) * 2.0f;
    else if (roleHash == kModulationWheel) p.semanticOffsets.vibratoDepth = n;
    else if (roleHash == kVectorJoystickX) { p.vectorX = std::clamp(n * 2.0f - 1.0f, -1.0f, 1.0f); (void)engine_.setPartEngineParamByKey(partIdx, "vector.x", p.vectorX); }
    else if (roleHash == kVectorJoystickY) { p.vectorY = std::clamp(n * 2.0f - 1.0f, -1.0f, 1.0f); (void)engine_.setPartEngineParamByKey(partIdx, "vector.y", p.vectorY); }
    else if (roleHash == kLfo1Rate) { (void)engine_.setPartEngineParamByKey(partIdx, "lfo1.rate", 0.05f * std::pow(800.0f, n)); (void)engine_.setPartEngineParamByKey(partIdx, "u.lfo0.rate", n * 100.0f); (void)engine_.setPartEngineParamByKey(partIdx, "lfoRate", n); }
    else if (roleHash == kPortamentoGlideTime) { (void)engine_.setPartEngineParamByKey(partIdx, "porta.timeMs", n * 5000.0f); (void)engine_.setPartEngineParamByKey(partIdx, "portaTime", n * 100.0f); }
    else if (roleHash == kPortamentoSwitch) { const float sw = n >= 0.5f ? 1.0f : 0.0f; (void)engine_.setPartEngineParamByKey(partIdx, "porta.enabled", sw); (void)engine_.setPartEngineParamByKey(partIdx, "portaSwitch", sw); }
    else if (roleHash == kOsc1Waveform) { (void)engine_.setPartEngineParamByKey(partIdx, "wave", n >= 0.5f ? 1.0f : 0.0f); (void)engine_.setPartEngineParamByKey(partIdx, "voice", std::round(n * 99.0f)); }
    else if (roleHash == kOsc1CoarseTune) (void)engine_.setPartEngineParamByKey(partIdx, "coarse", std::round((n - 0.5f) * 48.0f));
    else if (roleHash == kOsc1FineTune) { (void)engine_.setPartEngineParamByKey(partIdx, "fine", (n - 0.5f) * 200.0f); (void)engine_.setPartEngineParamByKey(partIdx, "voiceTune", n); }
    else if (roleHash == kOscKeyTrack) (void)engine_.setPartEngineParamByKey(partIdx, "nonTranspose", n >= 0.5f ? 1.0f : 0.0f);
    else if (roleHash == abd::synth::hashSemanticRole("MasterTuneCents")) (void)engine_.setPartEngineParamByKey(partIdx, "tuningA4", 400.0f + n * 80.0f);
    else if (roleHash == kFilterMode) (void)engine_.setPartEngineParamByKey(partIdx, "p1.filterMode", std::round(n * 3.0f));
    else if (roleHash == kFilterDrive) (void)engine_.setPartEngineParamByKey(partIdx, "driveType", std::round(n * 2.0f));
    else if (roleHash == kFilterEnvDecay) { (void)engine_.setPartEngineParamByKey(partIdx, "filterDecay", n); (void)engine_.setPartEngineParamByKey(partIdx, "accentDecay", 30.0f * std::pow(100.0f, n)); }
    else if (roleHash == kVoicePolyMode) (void)engine_.setPartEngineParamByKey(partIdx, "keyboardMode", std::round(n * 3.0f));
    else for (const auto& entry : kDirectNormRoleKeys) if (entry.hash == roleHash) { (void)engine_.setPartEngineParamByKey(partIdx, entry.key, n); break; }

    if (IMcxSoundEngine* eng = engine_.getPartSoundEngine(partIdx))
    {
        if (const auto destId = eng->findInputByRole(roleHash); destId != abd::synth::kNoModDestination)
        {
            engine_.modRouter(partIdx).setDirectOffset(destId, (n - 0.5f) * 2.0f);
            engine_.modRouter(partIdx).applyTo(*eng);
        }
        else if (roleHash == kFilterEnvDepth) (void)engine_.setPartEngineParamByKey(partIdx, "filterEnvAmount", n);
    }
}

void McxHardwareBridge::applyInternalDrumParam(std::uint8_t partIdx, std::uint8_t slotIdx, std::uint64_t roleHash, float normalizedVal, int rawMidiByte) noexcept
{
    using namespace abd::synth::role;
    if (partIdx >= McxEngine::kNumParts || slotIdx >= 128) return;
    auto& slot = engine_.part(partIdx).drumSlots[slotIdx];
    const float n = std::clamp(normalizedVal, 0.0f, 1.0f);
    const char* sub = nullptr; float engVal = n;
    if (roleHash == kDrumKeyPitch) { engVal = (rawMidiByte >= 0) ? (static_cast<float>(rawMidiByte - 64) * 0.5f) : ((n - 0.5f) * 24.0f); slot.pitchKeyTrack = engVal; sub = "pitchKeyTrack"; }
    else if (roleHash == kDrumKeyLevel) { slot.level = n; sub = "level"; }
    else if (roleHash == kDrumKeyPan) { engVal = (rawMidiByte >= 0) ? (static_cast<float>(rawMidiByte - 64) / 64.0f) : std::clamp((n - 0.5f) * 2.0f, -1.0f, 1.0f); slot.pan = engVal; sub = "pan"; }
    else if (roleHash == kDrumKeyReverbSend) { slot.reverbSend = n; sub = "reverbSend"; }
    else if (roleHash == kDrumKeyChorusSend) { slot.chorusSend = n; sub = "chorusSend"; }
    else if (roleHash == kDrumKeyDelaySend) { slot.delaySend = n; sub = "delaySend"; }
    if (sub) { char key[36]; std::snprintf(key, sizeof(key), "drum.%u.%s", static_cast<unsigned>(slotIdx), sub); (void)engine_.setPartEngineParamByKey(partIdx, key, engVal); }
}

bool McxHardwareBridge::processInboundCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val, int midiInPortIdx) noexcept
{
    const std::size_t portSlot = static_cast<std::size_t>(std::clamp(midiInPortIdx, 0, 31));
    const std::size_t chIdx = static_cast<std::size_t>(std::clamp<int>(ch1to16, 1, 16) - 1);
    auto& st = nrpnStates_[portSlot][chIdx];
    if (cc == 121 || cc == 123) { st.nrpnMsb = -1; st.nrpnLsb = -1; st.dataMsb = -1; }
    if (cc == 99) { st.currentChannel = ch1to16; st.nrpnMsb = val & 0x7F; st.dataMsb = -1; return true; }
    if (cc == 98) { st.currentChannel = ch1to16; st.nrpnLsb = val & 0x7F; st.dataMsb = -1; return true; }
    if (cc == 6 && st.nrpnMsb >= 0 && st.nrpnLsb >= 0) {
        st.dataMsb = val & 0x7F;
        handleCompleteInboundNrpn(ch1to16, st.nrpnMsb, st.nrpnLsb, st.dataMsb, midiInPortIdx);
        return true;
    }
    if (cc == 38 && st.nrpnMsb >= 0 && st.nrpnLsb >= 0) {
        const int v14 = (st.dataMsb >= 0) ? ((st.dataMsb << 7) | (val & 0x7F)) : (val & 0x7F);
        handleCompleteInboundNrpn(ch1to16, st.nrpnMsb, st.nrpnLsb, v14, midiInPortIdx);
        return true;
    }

    bool handled = false;
    if (cc == 64) { engine_.routeMidiPortChannelCc(midiInPortIdx, ch1to16, cc, val); handled = true; }
    for (std::uint8_t i = 0; i < McxEngine::kNumParts; ++i)
    {
        const auto& pt = engine_.part(i);
        if (!pt.enabled || static_cast<int>(pt.midiInPortIndex) != midiInPortIdx || pt.midiChannel != ch1to16) continue;
        const auto* binding = getPartProfile(i).findByCc(cc);
        if (!binding || binding->roleHash == 0) continue;

        const float norm = normalizeWireByte(val & 0x7F, *binding);
        applyInternalSemanticParam(i, binding->roleHash, norm);
        if (inboundSemanticCb_) inboundSemanticCb_(i, binding->roleHash, norm);
        handled = true;
    }
    return handled;
}

void McxHardwareBridge::handleCompleteInboundNrpn(int channel, int msb, int lsb, int dataVal, int midiInPortIdx) noexcept
{
    const auto msb7 = static_cast<std::uint8_t>(msb & 0x7F);
    const auto lsb7 = static_cast<std::uint8_t>(lsb & 0x7F);
    for (std::uint8_t i = 0; i < McxEngine::kNumParts; ++i)
    {
        auto& p = engine_.part(i);
        if (!p.enabled || static_cast<int>(p.midiInPortIndex) != midiInPortIdx || p.midiChannel != channel) continue;

        const auto& prof = getPartProfile(i);
        const auto* drumBinding = prof.findDrumByNrpnMsb(msb7);
        const auto* synthBinding = prof.findByNrpn(msb7, lsb7);
        if (p.isDrumKit && drumBinding != nullptr)
        {
            const std::uint8_t slotIdx = p.drumRemapper.inputToSlot[lsb7];
            const float norm = normalizeWireByte(dataVal, *drumBinding);
            applyInternalDrumParam(i, slotIdx, drumBinding->roleHash, norm, dataVal);
            if (inboundSemanticCb_) inboundSemanticCb_(i, drumBinding->roleHash, norm);
        }
        else if (synthBinding != nullptr && synthBinding->roleHash != 0)
        {
            const float norm = normalizeWireByte(dataVal, *synthBinding);
            applyInternalSemanticParam(i, synthBinding->roleHash, norm);
            if (inboundSemanticCb_) inboundSemanticCb_(i, synthBinding->roleHash, norm);
        }
    }
}

bool McxHardwareBridge::processInboundSysEx(const std::uint8_t* data, std::size_t len, int midiInPortIdx) noexcept
{
    if (!data || len < 6) return false;
    bool handled = autoDetectFromIdentityReply(data, len);
    if (!rolandChecksumOk(data, len)) return handled;

    const std::uint8_t dev = data[2], model = data[3];
    const std::size_t addrLen = (model == 0x46 || (len >= 12 && data[5] == 0x10)) ? 4u : 3u;
    if (len < 7u + addrLen) return handled;
    const std::uint8_t* addr = data + 5;
    const std::uint8_t* vals = addr + addrLen;
    const std::size_t valLen = len - 7u - addrLen;

    for (std::uint8_t i = 0; i < McxEngine::kNumParts; ++i)
    {
        const auto& pt = engine_.part(i);
        if (!pt.enabled || static_cast<int>(pt.midiInPortIndex) != midiInPortIdx) continue;
        const auto& prof = getPartProfile(i);
        if (dev != 0x7F && dev != prof.identity.defaultDeviceId && ((dev & 0x0F) + 1) != pt.midiChannel) continue;
        bool matchedBinding = false;
        for (const auto& b : prof.bindings)
        {
            if (b.method != abd::synth::ControlWireMethod::SysEx || b.sysexAddrLen != addrLen || b.roleHash == 0) continue;
            if (!std::equal(b.sysexAddrBytes.begin(), b.sysexAddrBytes.begin() + addrLen, addr)) continue;
            const float norm = normalizeWireByte(vals[0] & 0x7F, b);
            applyInternalSemanticParam(i, b.roleHash, norm);
            if (inboundSemanticCb_) inboundSemanticCb_(i, b.roleHash, norm);
            matchedBinding = handled = true;
        }
        if (!matchedBinding) { applyDirectRolandDt1(engine_, i, model, addr, vals, valLen); handled = true; }
    }
    return handled;
}

void McxHardwareBridge::processInboundMidiByte(std::uint8_t b, bool dispatchNotes, int midiInPortIdx) noexcept
{
    if (b >= 0xF8) return; // Real-time clock/transport messages do not disturb running status or SysEx
    if (b == 0xF0) {
        inSysEx_ = true; sysexLen_ = 0; sysexBuf_[sysexLen_++] = b;
        runningStatus_ = 0; msgPendingLen_ = 0;
        return;
    }
    if (inSysEx_) {
        if (sysexLen_ < sysexBuf_.size()) sysexBuf_[sysexLen_++] = b;
        if (b == 0xF7) { inSysEx_ = false; (void)processInboundSysEx(sysexBuf_.data(), sysexLen_, midiInPortIdx); sysexLen_ = 0; }
        return;
    }
    if (b >= 0x80) { runningStatus_ = b; msgPendingLen_ = 0; return; }
    if (runningStatus_ == 0) return;

    msgPending_[msgPendingLen_++] = b;
    const std::uint8_t msgType = runningStatus_ & 0xF0;
    const std::uint8_t ch = static_cast<std::uint8_t>((runningStatus_ & 0x0F) + 1);
    if (msgType == 0xB0 && msgPendingLen_ == 2) { processInboundCc(ch, msgPending_[0], msgPending_[1], midiInPortIdx); msgPendingLen_ = 0; }
    else if (msgType == 0xC0 && msgPendingLen_ == 1) {
        const std::size_t portSlot = static_cast<std::size_t>(std::clamp(midiInPortIdx, 0, 31));
        nrpnStates_[portSlot][static_cast<std::size_t>(std::clamp<int>(ch, 1, 16) - 1)] = {};
        msgPendingLen_ = 0;
    }
    else if ((msgType == 0x90 || msgType == 0x80) && msgPendingLen_ == 2) {
        if (dispatchNotes) {
            if (msgType == 0x90 && msgPending_[1] > 0) engine_.routeMidiPortChannelNoteOn(midiInPortIdx, ch, msgPending_[0], static_cast<float>(msgPending_[1]) / 127.0f);
            else engine_.routeMidiPortChannelNoteOff(midiInPortIdx, ch, msgPending_[0]);
        }
        msgPendingLen_ = 0;
    }
}

void McxHardwareBridge::processInboundMidiBuffer(const std::uint8_t* data, std::size_t length, bool dispatchNotes, int midiInPortIdx) noexcept
{
    if (!data || length == 0) return;
    for (std::size_t i = 0; i < length; ++i) processInboundMidiByte(data[i], dispatchNotes, midiInPortIdx);
}

} // namespace abdmcx
