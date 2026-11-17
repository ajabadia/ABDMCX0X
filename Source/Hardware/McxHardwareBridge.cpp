#include "McxHardwareBridge.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

McxHardwareBridge::McxHardwareBridge(McxEngine& engine) noexcept
    : engine_(engine)
{
    setHardwareTarget(McxHardwareTarget::BossDr5);
}

void McxHardwareBridge::setHardwareTarget(McxHardwareTarget target) noexcept
{
    target_ = target;
}

void McxHardwareBridge::setHardwareTargetById(const std::string& profileId) noexcept
{
    if (profileId == "boss_dr5" || profileId == "boss-dr5" || profileId == "dr5")
        target_ = McxHardwareTarget::BossDr5;
    else if (profileId == "roland_mc303" || profileId == "roland-mc303" || profileId == "mc303")
        target_ = McxHardwareTarget::RolandMc303;
    else if (profileId == "roland_d2" || profileId == "roland-d2" || profileId == "d2")
        target_ = McxHardwareTarget::RolandD2;
    else if (profileId == "roland_sc55" || profileId == "roland-sc55" || profileId == "sc55")
        target_ = McxHardwareTarget::RolandSc55;
    else if (profileId == "abd_mcx0x" || profileId == "abdmcx0x")
        target_ = McxHardwareTarget::AbdMcx0x;
    else
        target_ = McxHardwareTarget::GenericMidi;
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
        const std::uint8_t outNote = p.isDrumPart ? p.drumRemapper.slotToExternal[note & 0x7Fu] : note;
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
        const std::uint8_t outNote = p.isDrumPart ? p.drumRemapper.slotToExternal[note & 0x7Fu] : note;
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
    {
        const std::uint8_t val = static_cast<std::uint8_t>(std::clamp(static_cast<int>(normalizedLevel * 127.0f), 0, 127));
        sendCc(p.midiChannel, 7, val);
    }
}

void McxHardwareBridge::routePartPan(std::uint8_t partIdx, float normalizedPan) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        p.pan = std::clamp(normalizedPan, -1.0f, 1.0f);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const int midiPan = static_cast<int>(std::round((normalizedPan + 1.0f) * 63.5f));
        sendCc(p.midiChannel, 10, static_cast<std::uint8_t>(std::clamp(midiPan, 0, 127)));
    }
}

void McxHardwareBridge::routePartReverb(std::uint8_t partIdx, float normalizedReverb) noexcept
{
    if (partIdx >= 16)
        return;

    auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        p.reverbSend = std::clamp(normalizedReverb, 0.0f, 1.0f);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const std::uint8_t val = static_cast<std::uint8_t>(std::clamp(static_cast<int>(normalizedReverb * 127.0f), 0, 127));
        sendCc(p.midiChannel, 91, val);
    }
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

        // GS Drum Kit NRPNs:
        // Pitch: MSB=24 (0x18), Level: MSB=26 (0x1A), Pan: MSB=28 (0x1C), Reverb: MSB=29 (0x1D)
        std::uint8_t nrpnMsb = 26;
        if (paramKind == 0) nrpnMsb = 24;
        else if (paramKind == 1) nrpnMsb = 26;
        else if (paramKind == 2) nrpnMsb = 28;
        else if (paramKind == 3) nrpnMsb = 29;

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
        if (target_ == McxHardwareTarget::RolandMc303 || target_ == McxHardwareTarget::RolandD2)
        {
            // MC-303 TVF NRPN MSB=1, LSB=32 (Cutoff 14..114), LSB=33 (Resonance 14..114)
            const std::uint8_t cVal = static_cast<std::uint8_t>(std::clamp(14 + static_cast<int>(cutoffNorm * 100.0f), 14, 114));
            const std::uint8_t rVal = static_cast<std::uint8_t>(std::clamp(14 + static_cast<int>(resNorm * 100.0f), 14, 114));
            sendNrpn(p.midiChannel, 1, 32, cVal);
            sendNrpn(p.midiChannel, 1, 33, rVal);
        }
        else
        {
            sendCc(p.midiChannel, 74, static_cast<std::uint8_t>(std::clamp(static_cast<int>(cutoffNorm * 127.0f), 0, 127)));
            sendCc(p.midiChannel, 71, static_cast<std::uint8_t>(std::clamp(static_cast<int>(resNorm * 127.0f), 0, 127)));
        }
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
        if (target_ == McxHardwareTarget::RolandMc303 || target_ == McxHardwareTarget::RolandD2)
        {
            // MC-303 TVA Envelope NRPN MSB=1: LSB=99 (Attack), LSB=100 (Decay), LSB=102 (Release)
            const std::uint8_t aVal = static_cast<std::uint8_t>(std::clamp(14 + static_cast<int>(aNorm * 100.0f), 14, 114));
            const std::uint8_t dVal = static_cast<std::uint8_t>(std::clamp(14 + static_cast<int>(dNorm * 100.0f), 14, 114));
            const std::uint8_t rVal = static_cast<std::uint8_t>(std::clamp(14 + static_cast<int>(rNorm * 100.0f), 14, 114));
            sendNrpn(p.midiChannel, 1, 99, aVal);
            sendNrpn(p.midiChannel, 1, 100, dVal);
            sendNrpn(p.midiChannel, 1, 102, rVal);
        }
        else
        {
            sendCc(p.midiChannel, 73, static_cast<std::uint8_t>(std::clamp(static_cast<int>(aNorm * 127.0f), 0, 127)));
            sendCc(p.midiChannel, 75, static_cast<std::uint8_t>(std::clamp(static_cast<int>(dNorm * 127.0f), 0, 127)));
            sendCc(p.midiChannel, 72, static_cast<std::uint8_t>(std::clamp(static_cast<int>(rNorm * 127.0f), 0, 127)));
        }
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

    // Direct CC handling
    for (int i = 0; i < 16; ++i)
    {
        auto& p = engine_.part(static_cast<std::size_t>(i));
        if (p.midiChannel == ch1to16)
        {
            if (cc == 7)
            {
                p.level = static_cast<float>(val) / 127.0f;
                return true;
            }
            if (cc == 10)
            {
                p.pan = (static_cast<float>(val) - 64.0f) / 64.0f;
                return true;
            }
            if (cc == 91)
            {
                p.reverbSend = static_cast<float>(val) / 127.0f;
                return true;
            }
            if (cc == 74)
            {
                const float cutNorm = static_cast<float>(val) / 127.0f;
                for (auto& part : p.partials)
                    part.cutoffHz = 20.0f * std::pow(1000.0f, cutNorm);
                return true;
            }
            if (cc == 71)
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
    // Find target part
    for (int i = 0; i < 16; ++i)
    {
        auto& p = engine_.part(static_cast<std::size_t>(i));
        if (p.midiChannel == channel)
        {
            if (p.isDrumPart)
            {
                // GS Drum Key NRPN: LSB is drum note
                const std::uint8_t drumNote = static_cast<std::uint8_t>(lsb & 0x7F);
                const std::uint8_t slotIdx = p.drumRemapper.inputToSlot[drumNote];
                auto& slot = p.drumSlots[slotIdx];

                if (msb == 24) // Drum Pitch Coarse (center 64)
                    slot.pitchKeyTrack = (static_cast<float>(dataVal - 64)) * 0.5f;
                else if (msb == 26) // Drum TVA Level
                    slot.level = static_cast<float>(dataVal) / 127.0f;
                else if (msb == 28) // Drum Panpot (center 64)
                    slot.pan = static_cast<float>(dataVal - 64) / 64.0f;
                else if (msb == 29) // Drum Reverb Send
                    slot.reverbSend = static_cast<float>(dataVal) / 127.0f;
            }
            else
            {
                // Roland MC-303 Synth NRPNs
                if (msb == 1 && lsb == 32) // Cutoff (14..114)
                {
                    const float norm = std::clamp((static_cast<float>(dataVal - 14)) / 100.0f, 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.cutoffHz = 20.0f * std::pow(1000.0f, norm);
                }
                else if (msb == 1 && lsb == 33) // Resonance (14..114)
                {
                    const float norm = std::clamp((static_cast<float>(dataVal - 14)) / 100.0f, 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.resonance = norm;
                }
                else if (msb == 1 && lsb == 99) // Amp Attack
                {
                    const float norm = std::clamp((static_cast<float>(dataVal - 14)) / 100.0f, 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.ampEnv.t1Ms = 1.0f + norm * 2000.0f;
                }
                else if (msb == 1 && lsb == 100) // Amp Decay
                {
                    const float norm = std::clamp((static_cast<float>(dataVal - 14)) / 100.0f, 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.ampEnv.t2Ms = 5.0f + norm * 3000.0f;
                }
                else if (msb == 1 && lsb == 102) // Amp Release
                {
                    const float norm = std::clamp((static_cast<float>(dataVal - 14)) / 100.0f, 0.0f, 1.0f);
                    for (auto& part : p.partials)
                        part.ampEnv.t4Ms = 5.0f + norm * 4000.0f;
                }
            }
        }
    }
}

void McxHardwareBridge::processInboundMidiByte(std::uint8_t b) noexcept
{
    if (b >= 0xF8) // Realtime clock/active-sensing bypass
        return;

    if (b >= 0x80) // Status byte
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

    if (msgType == 0xB0 && msgPendingLen_ == 2) // Control Change
    {
        processInboundCc(ch, msgPending_[0], msgPending_[1]);
        msgPendingLen_ = 0;
    }
    else if ((msgType == 0x90 || msgType == 0x80) && msgPendingLen_ == 2) // Note On / Off
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
