#include "McxHardwareBridge.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

namespace
{

float normalizeWireByte(int dataVal, const abd::synth::SemanticControlBinding& b) noexcept
{
    const float span = b.wireMax - b.wireMin;
    if (std::abs(span) < 1e-6f)
        return std::clamp(static_cast<float>(dataVal) / 127.0f, 0.0f, 1.0f);
    return std::clamp((static_cast<float>(dataVal) - b.wireMin) / span, 0.0f, 1.0f);
}

} // namespace

bool McxHardwareBridge::processInboundCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val) noexcept
{
    const std::size_t chIdx = static_cast<std::size_t>(std::clamp<int>(ch1to16, 1, 16) - 1);
    auto& st = nrpnStates_[chIdx];
    if (cc == 99)
    {
        st.currentChannel = ch1to16;
        st.nrpnMsb = val & 0x7F;
        return true;
    }
    if (cc == 98)
    {
        st.currentChannel = ch1to16;
        st.nrpnLsb = val & 0x7F;
        return true;
    }
    if (cc == 6)
    {
        if (st.nrpnMsb >= 0 && st.nrpnLsb >= 0)
        {
            handleCompleteInboundNrpn(ch1to16, st.nrpnMsb, st.nrpnLsb, val & 0x7F);
            return true;
        }
    }

    bool handled = false;
    if (cc == 64)
    {
        engine_.routeMidiChannelCc(ch1to16, cc, val);
        handled = true;
    }
    for (std::uint8_t i = 0; i < McxEngine::kNumParts; ++i)
    {
        if (engine_.part(i).midiChannel != ch1to16)
            continue;
        const auto* binding = getPartProfile(i).findByCc(cc);
        if (!binding || binding->roleHash == 0)
            continue;

        const float norm = normalizeWireByte(val & 0x7F, *binding);
        applyInternalSemanticParam(i, binding->roleHash, norm);
        if (inboundSemanticCb_)
            inboundSemanticCb_(i, binding->roleHash, norm);
        handled = true;
    }
    return handled;
}

void McxHardwareBridge::handleCompleteInboundNrpn(int channel, int msb, int lsb, int dataVal) noexcept
{
    const auto msb7 = static_cast<std::uint8_t>(msb & 0x7F);
    const auto lsb7 = static_cast<std::uint8_t>(lsb & 0x7F);

    for (std::uint8_t i = 0; i < McxEngine::kNumParts; ++i)
    {
        auto& p = engine_.part(i);
        if (p.midiChannel != channel)
            continue;

        const auto& prof = getPartProfile(i);
        const auto* drumBinding = prof.findDrumByNrpnMsb(msb7);
        const auto* synthBinding = prof.findByNrpn(msb7, lsb7);

        if (p.isDrumKit && drumBinding != nullptr)
        {
            const std::uint8_t slotIdx = p.drumRemapper.inputToSlot[lsb7];
            const float norm = normalizeWireByte(dataVal, *drumBinding);
            applyInternalDrumParam(i, slotIdx, drumBinding->roleHash, norm, dataVal);
            if (inboundSemanticCb_)
                inboundSemanticCb_(i, drumBinding->roleHash, norm);
        }
        else if (synthBinding != nullptr && synthBinding->roleHash != 0)
        {
            const float norm = normalizeWireByte(dataVal, *synthBinding);
            applyInternalSemanticParam(i, synthBinding->roleHash, norm);
            if (inboundSemanticCb_)
                inboundSemanticCb_(i, synthBinding->roleHash, norm);
        }
    }
}

void McxHardwareBridge::processInboundMidiByte(std::uint8_t b, bool dispatchNotes) noexcept
{
    if (b >= 0xF8)
        return; // Real-time clock/transport messages do not disturb running status or SysEx

    if (b == 0xF0)
    {
        inSysEx_ = true;
        sysexLen_ = 0;
        sysexBuf_[sysexLen_++] = b;
        runningStatus_ = 0;
        msgPendingLen_ = 0;
        return;
    }

    if (inSysEx_)
    {
        if (sysexLen_ < sysexBuf_.size())
            sysexBuf_[sysexLen_++] = b;
        if (b == 0xF7)
        {
            inSysEx_ = false;
            autoDetectFromIdentityReply(sysexBuf_.data(), sysexLen_);
            sysexLen_ = 0;
        }
        return;
    }

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
        if (dispatchNotes)
        {
            if (msgType == 0x90 && msgPending_[1] > 0)
                engine_.routeMidiChannelNoteOn(ch, msgPending_[0], static_cast<float>(msgPending_[1]) / 127.0f);
            else
                engine_.routeMidiChannelNoteOff(ch, msgPending_[0]);
        }
        msgPendingLen_ = 0;
    }
}

void McxHardwareBridge::processInboundMidiBuffer(const std::uint8_t* data, std::size_t length, bool dispatchNotes) noexcept
{
    if (!data || length == 0)
        return;

    for (std::size_t i = 0; i < length; ++i)
        processInboundMidiByte(data[i], dispatchNotes);
}

} // namespace abdmcx
