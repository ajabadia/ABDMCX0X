#include "McxHardwareBridge.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

McxHardwareDeviceProfile McxHardwareDeviceProfile::makeGeneric() noexcept
{
    McxHardwareDeviceProfile p;
    p.profileId = "generic_midi";
    p.displayName = "Generic MIDI Device";
    p.sysexDeviceId = 0x10;
    p.sysexModelId = 0x00;
    p.useRolandChecksum = false;
    return p;
}

McxHardwareDeviceProfile McxHardwareDeviceProfile::makeRolandGs() noexcept
{
    McxHardwareDeviceProfile p;
    p.profileId = "roland_gs";
    p.displayName = "Roland GS / Boss DR-5";
    p.sysexDeviceId = 0x10;
    p.sysexModelId = 0x42;
    p.useRolandChecksum = true;

    p.partVolume = { McxControlMethod::MidiCc, 7, 0, 0.0f, 127.0f, 100.0f };
    p.partPan = { McxControlMethod::MidiCc, 10, 0, 0.0f, 127.0f, 64.0f };
    p.partReverb = { McxControlMethod::MidiCc, 91, 0, 0.0f, 127.0f, 0.0f };
    p.partChorus = { McxControlMethod::MidiCc, 93, 0, 0.0f, 127.0f, 0.0f };

    p.filterCutoff = { McxControlMethod::MidiCc, 74, 0, 0.0f, 127.0f, 64.0f };
    p.filterResonance = { McxControlMethod::MidiCc, 71, 0, 0.0f, 127.0f, 64.0f };

    p.drumPitchNrpnMsb = 24;
    p.drumLevelNrpnMsb = 26;
    p.drumPanNrpnMsb = 28;
    p.drumReverbNrpnMsb = 29;
    p.drumChorusNrpnMsb = 30;
    return p;
}

McxHardwareDeviceProfile McxHardwareDeviceProfile::makeRolandMc() noexcept
{
    McxHardwareDeviceProfile p = makeRolandGs();
    p.profileId = "roland_mc";
    p.displayName = "Roland MC Groovebox";
    p.sysexDeviceId = 0x10;
    p.sysexModelId = 0x03;

    // MC-303 TVF NRPNs (Cutoff 1/32, Res 1/33 in range 14..114)
    p.filterCutoff = { McxControlMethod::Nrpn7Bit, 1, 32, 14.0f, 114.0f, 64.0f };
    p.filterResonance = { McxControlMethod::Nrpn7Bit, 1, 33, 14.0f, 114.0f, 64.0f };

    // MC-303 TVA Env NRPNs (Attack 1/99, Decay 1/100, Release 1/102 in range 14..114)
    p.envAttack = { McxControlMethod::Nrpn7Bit, 1, 99, 14.0f, 114.0f, 64.0f };
    p.envDecay = { McxControlMethod::Nrpn7Bit, 1, 100, 14.0f, 114.0f, 64.0f };
    p.envRelease = { McxControlMethod::Nrpn7Bit, 1, 102, 14.0f, 114.0f, 64.0f };
    return p;
}

McxHardwareBridge::McxHardwareBridge(McxEngine& engine) noexcept
    : engine_(engine), profile_(McxHardwareDeviceProfile::makeRolandGs())
{
}

void McxHardwareBridge::setProfile(const McxHardwareDeviceProfile& profile) noexcept
{
    profile_ = profile;
}

void McxHardwareBridge::setProfileById(const std::string& profileId) noexcept
{
    if (profileId.find("mc303") != std::string::npos || profileId.find("mc") != std::string::npos)
        setProfile(McxHardwareDeviceProfile::makeRolandMc());
    else if (profileId.find("dr5") != std::string::npos || profileId.find("gs") != std::string::npos || profileId.find("sc55") != std::string::npos)
        setProfile(McxHardwareDeviceProfile::makeRolandGs());
    else
        setProfile(McxHardwareDeviceProfile::makeGeneric());
}

void McxHardwareBridge::sendCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val) noexcept
{
    const std::uint8_t ch = static_cast<std::uint8_t>(std::clamp<int>(ch1to16, 1, 16) - 1);
    McxMidiOutMessage msg {};
    msg.length = 3;
    msg.bytes[0] = static_cast<std::uint8_t>(0xB0u | ch);
    msg.bytes[1] = static_cast<std::uint8_t>(cc & 0x7Fu);
    msg.bytes[2] = static_cast<std::uint8_t>(val & 0x7Fu);
    outQueue_.push(msg);
}

void McxHardwareBridge::sendNrpn(std::uint8_t ch1to16, std::uint8_t msb, std::uint8_t lsb, std::uint8_t val) noexcept
{
    // Strict Roland ordering: CC99 (MSB) -> CC98 (LSB) -> CC6 (Data Entry MSB)
    sendCc(ch1to16, 99, msb);
    sendCc(ch1to16, 98, lsb);
    sendCc(ch1to16, 6, val);
}

void McxHardwareBridge::dispatchMappedControl(std::uint8_t ch, const McxParamControlMap& map, float normalizedVal) noexcept
{
    if (map.method == McxControlMethod::None)
        return;

    const float scaled = map.minVal + std::clamp(normalizedVal, 0.0f, 1.0f) * (map.maxVal - map.minVal);
    const std::uint8_t byteVal = static_cast<std::uint8_t>(std::clamp(static_cast<int>(std::round(scaled)), 0, 127));

    if (map.method == McxControlMethod::MidiCc)
        sendCc(ch, map.controlNumber, byteVal);
    else if (map.method == McxControlMethod::Nrpn7Bit)
        sendNrpn(ch, map.controlNumber, map.subNumber, byteVal);
}

void McxHardwareBridge::routeNoteOn(std::uint8_t partIdx, std::uint8_t note, float velocity, std::int32_t sampleOffset) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
    {
        engine_.triggerNote(partIdx, note, velocity);
    }

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const std::uint8_t outNote = p.isDrumKit ? p.drumRemapper.slotToExternal[note & 0x7Fu] : note;
        const std::uint8_t ch = static_cast<std::uint8_t>(std::clamp<int>(p.midiChannel, 1, 16) - 1);
        const std::uint8_t velByte = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(velocity * 127.0f), 1, 127));

        McxMidiOutMessage msg {};
        msg.length = 3;
        msg.bytes[0] = static_cast<std::uint8_t>(0x90u | ch);
        msg.bytes[1] = outNote;
        msg.bytes[2] = velByte;
        msg.sampleOffset = sampleOffset;
        outQueue_.push(msg);
    }
}

void McxHardwareBridge::routeNoteOff(std::uint8_t partIdx, std::uint8_t note, std::int32_t sampleOffset) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
    {
        engine_.releaseNote(partIdx, note);
    }

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const std::uint8_t outNote = p.isDrumKit ? p.drumRemapper.slotToExternal[note & 0x7Fu] : note;
        const std::uint8_t ch = static_cast<std::uint8_t>(std::clamp<int>(p.midiChannel, 1, 16) - 1);

        McxMidiOutMessage msg {};
        msg.length = 3;
        msg.bytes[0] = static_cast<std::uint8_t>(0x80u | ch);
        msg.bytes[1] = outNote;
        msg.bytes[2] = 0;
        msg.sampleOffset = sampleOffset;
        outQueue_.push(msg);
    }
}

void McxHardwareBridge::routePartVolume(std::uint8_t partIdx, float normalizedLevel) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        p.level = std::clamp(normalizedLevel, 0.0f, 1.0f);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
        dispatchMappedControl(p.midiChannel, profile_.partVolume, normalizedLevel);
}

void McxHardwareBridge::routePartPan(std::uint8_t partIdx, float normalizedPan) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        p.pan = std::clamp(normalizedPan, -1.0f, 1.0f);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
        dispatchMappedControl(p.midiChannel, profile_.partPan, (normalizedPan + 1.0f) * 0.5f);
}

void McxHardwareBridge::routePartReverb(std::uint8_t partIdx, float normalizedReverb) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        p.reverbSend = std::clamp(normalizedReverb, 0.0f, 1.0f);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
        dispatchMappedControl(p.midiChannel, profile_.partReverb, normalizedReverb);
}

void McxHardwareBridge::routeDrumSlotParam(std::uint8_t partIdx,
                                           std::uint8_t slotIdx,
                                           std::uint8_t paramKind,
                                           float normalizedValue) noexcept
{
    if (partIdx >= 16 || slotIdx >= 128)
        return;

    auto& p = engine_.part(partIdx);
    auto& slot = p.drumSlots[slotIdx];

    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
    {
        switch (paramKind)
        {
            case 0: slot.pitchKeyTrack = (normalizedValue - 0.5f) * 24.0f; break;
            case 1: slot.level = std::clamp(normalizedValue, 0.0f, 1.0f); break;
            case 2: slot.pan = std::clamp((normalizedValue - 0.5f) * 2.0f, -1.0f, 1.0f); break;
            case 3: slot.reverbSend = std::clamp(normalizedValue, 0.0f, 1.0f); break;
            default: break;
        }
    }

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const std::uint8_t drumKey = p.drumRemapper.slotToExternal[slotIdx];
        const std::uint8_t valByte = static_cast<std::uint8_t>(std::clamp(static_cast<int>(normalizedValue * 127.0f), 0, 127));

        std::uint8_t nrpnMsb = profile_.drumLevelNrpnMsb;
        if (paramKind == 0) nrpnMsb = profile_.drumPitchNrpnMsb;
        else if (paramKind == 1) nrpnMsb = profile_.drumLevelNrpnMsb;
        else if (paramKind == 2) nrpnMsb = profile_.drumPanNrpnMsb;
        else if (paramKind == 3) nrpnMsb = profile_.drumReverbNrpnMsb;

        sendNrpn(p.midiChannel, nrpnMsb, drumKey, valByte);
    }
}

void McxHardwareBridge::routeSynthFilter(std::uint8_t partIdx, float cutoffNorm, float resNorm) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
    {
        for (auto& partial : p.partials)
        {
            partial.cutoffHz = 20.0f * std::pow(1000.0f, std::clamp(cutoffNorm, 0.0f, 1.0f));
            partial.resonance = std::clamp(resNorm, 0.0f, 1.0f);
        }
    }

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        dispatchMappedControl(p.midiChannel, profile_.filterCutoff, cutoffNorm);
        dispatchMappedControl(p.midiChannel, profile_.filterResonance, resNorm);
    }
}

void McxHardwareBridge::routeSynthEnvelope(std::uint8_t partIdx, float aNorm, float dNorm, float rNorm) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
    {
        for (auto& partial : p.partials)
        {
            partial.ampEnv.t1Ms = 1.0f + aNorm * 2000.0f;
            partial.ampEnv.t2Ms = 5.0f + dNorm * 3000.0f;
            partial.ampEnv.t4Ms = 5.0f + rNorm * 4000.0f;
        }
    }

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        dispatchMappedControl(p.midiChannel, profile_.envAttack, aNorm);
        dispatchMappedControl(p.midiChannel, profile_.envDecay, dNorm);
        dispatchMappedControl(p.midiChannel, profile_.envRelease, rNorm);
    }
}

bool McxHardwareBridge::processInboundCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val) noexcept
{
    if (cc == 99)
    {
        nrpnState_.currentChannel = ch1to16;
        nrpnState_.nrpnMsb = val & 0x7F;
        return true;
    }
    if (cc == 98)
    {
        nrpnState_.currentChannel = ch1to16;
        nrpnState_.nrpnLsb = val & 0x7F;
        return true;
    }
    if (cc == 6)
    {
        if (nrpnState_.nrpnMsb >= 0 && nrpnState_.nrpnLsb >= 0)
        {
            handleCompleteInboundNrpn(ch1to16, nrpnState_.nrpnMsb, nrpnState_.nrpnLsb, val & 0x7F);
            return true;
        }
    }

    for (int i = 0; i < 16; ++i)
    {
        auto& p = engine_.part(static_cast<std::size_t>(i));
        if (p.midiChannel == ch1to16)
        {
            if (profile_.partVolume.method == McxControlMethod::MidiCc && profile_.partVolume.controlNumber == cc)
            {
                p.level = static_cast<float>(val) / 127.0f;
                return true;
            }
            if (profile_.partPan.method == McxControlMethod::MidiCc && profile_.partPan.controlNumber == cc)
            {
                p.pan = (static_cast<float>(val) - 64.0f) / 64.0f;
                return true;
            }
            if (profile_.partReverb.method == McxControlMethod::MidiCc && profile_.partReverb.controlNumber == cc)
            {
                p.reverbSend = static_cast<float>(val) / 127.0f;
                return true;
            }
            if (profile_.filterCutoff.method == McxControlMethod::MidiCc && profile_.filterCutoff.controlNumber == cc)
            {
                const float cutNorm = static_cast<float>(val) / 127.0f;
                for (auto& part : p.partials)
                    part.cutoffHz = 20.0f * std::pow(1000.0f, cutNorm);
                return true;
            }
            if (profile_.filterResonance.method == McxControlMethod::MidiCc && profile_.filterResonance.controlNumber == cc)
            {
                const float resNorm = static_cast<float>(val) / 127.0f;
                for (auto& part : p.partials)
                    part.resonance = resNorm;
                return true;
            }
        }
    }
    return false;
}

void McxHardwareBridge::handleCompleteInboundNrpn(int channel, int msb, int lsb, int dataVal) noexcept
{
    for (int i = 0; i < 16; ++i)
    {
        auto& p = engine_.part(static_cast<std::size_t>(i));
        if (p.midiChannel == channel)
        {
            if (p.isDrumKit)
            {
                const std::uint8_t drumNote = static_cast<std::uint8_t>(lsb & 0x7F);
                const std::uint8_t slotIdx = p.drumRemapper.inputToSlot[drumNote];
                auto& slot = p.drumSlots[slotIdx];

                if (msb == profile_.drumPitchNrpnMsb)
                    slot.pitchKeyTrack = (static_cast<float>(dataVal - 64)) * 0.5f;
                else if (msb == profile_.drumLevelNrpnMsb)
                    slot.level = static_cast<float>(dataVal) / 127.0f;
                else if (msb == profile_.drumPanNrpnMsb)
                    slot.pan = static_cast<float>(dataVal - 64) / 64.0f;
                else if (msb == profile_.drumReverbNrpnMsb)
                    slot.reverbSend = static_cast<float>(dataVal) / 127.0f;
            }
            else
            {
                if (profile_.filterCutoff.method == McxControlMethod::Nrpn7Bit &&
                    profile_.filterCutoff.controlNumber == msb && profile_.filterCutoff.subNumber == lsb)
                {
                    const float norm = std::clamp((static_cast<float>(dataVal) - profile_.filterCutoff.minVal) /
                                                  (profile_.filterCutoff.maxVal - profile_.filterCutoff.minVal), 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.cutoffHz = 20.0f * std::pow(1000.0f, norm);
                }
                else if (profile_.filterResonance.method == McxControlMethod::Nrpn7Bit &&
                         profile_.filterResonance.controlNumber == msb && profile_.filterResonance.subNumber == lsb)
                {
                    const float norm = std::clamp((static_cast<float>(dataVal) - profile_.filterResonance.minVal) /
                                                  (profile_.filterResonance.maxVal - profile_.filterResonance.minVal), 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.resonance = norm;
                }
            }
        }
    }
}

void McxHardwareBridge::processInboundMidiByte(std::uint8_t b) noexcept
{
    if (b >= 0xF8)
        return;

    if (b >= 0x80)
    {
        runningStatus_ = b;
        msgPendingLen_ = 0;
        return;
    }

    if (runningStatus_ == 0)
        return;

    msgPending_[msgPendingLen_++] = b;

    const std::uint8_t msgType = runningStatus_ & 0xF0;
    const std::uint8_t ch = static_cast<std::uint8_t>((runningStatus_ & 0x0F) + 1);

    if (msgType == 0xB0 && msgPendingLen_ == 2)
    {
        processInboundCc(ch, msgPending_[0], msgPending_[1]);
        msgPendingLen_ = 0;
    }
    else if ((msgType == 0x90 || msgType == 0x80) && msgPendingLen_ == 2)
    {
        if (msgType == 0x90 && msgPending_[1] > 0)
        {
            for (int i = 0; i < 16; ++i)
                if (engine_.part(i).midiChannel == ch)
                    engine_.triggerNote(static_cast<std::uint8_t>(i), msgPending_[0], static_cast<float>(msgPending_[1]) / 127.0f);
        }
        else
        {
            for (int i = 0; i < 16; ++i)
                if (engine_.part(i).midiChannel == ch)
                    engine_.releaseNote(static_cast<std::uint8_t>(i), msgPending_[0]);
        }
        msgPendingLen_ = 0;
    }
}

void McxHardwareBridge::processInboundMidiBuffer(const std::uint8_t* data, std::size_t length) noexcept
{
    if (!data || length == 0)
        return;

    for (std::size_t i = 0; i < length; ++i)
        processInboundMidiByte(data[i]);
}

std::size_t McxHardwareBridge::drainOutboundQueue(const MidiByteSink& sink) noexcept
{
    if (!sink)
        return 0;

    std::size_t count = 0;
    McxMidiOutMessage msg {};
    while (outQueue_.pop(msg))
    {
        if (msg.length > 0)
        {
            sink(msg.bytes, msg.length);
            ++count;
        }
    }
    return count;
}

} // namespace abdmcx
