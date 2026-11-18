#include "HardwareMirrorRouter.h"

#include <algorithm>

namespace abdmcx
{

namespace
{
std::uint8_t clampChannel0to15(std::uint8_t channel1to16) noexcept
{
    return static_cast<std::uint8_t>(std::clamp<int>(channel1to16, 1, 16) - 1);
}

McxMidiOutMessage makeThreeByteMsg(std::uint8_t portIndex,
                                   std::uint8_t priority,
                                   std::uint8_t status,
                                   std::uint8_t data1,
                                   std::uint8_t data2,
                                   std::int32_t sampleOffset) noexcept
{
    McxMidiOutMessage msg {};
    msg.portIndex = portIndex;
    msg.priority = priority;
    msg.length = 3;
    msg.bytes[0] = status;
    msg.bytes[1] = static_cast<std::uint8_t>(data1 & 0x7Fu);
    msg.bytes[2] = static_cast<std::uint8_t>(data2 & 0x7Fu);
    msg.sampleOffset = sampleOffset;
    return msg;
}
} // namespace

McxMidiOutMessage HardwareMirrorRouter::makeNoteOn(std::uint8_t channel1to16,
                                                   std::uint8_t note,
                                                   std::uint8_t velocity,
                                                   std::int32_t sampleOffset,
                                                   std::uint8_t portIndex) noexcept
{
    const auto status = static_cast<std::uint8_t>(0x90u | clampChannel0to15(channel1to16));
    const auto clampedVel = static_cast<std::uint8_t>(std::clamp<int>(velocity & 0x7Fu, 1, 127));
    return makeThreeByteMsg(portIndex, 1, status, note, clampedVel, sampleOffset);
}

McxMidiOutMessage HardwareMirrorRouter::makeNoteOff(std::uint8_t channel1to16,
                                                    std::uint8_t note,
                                                    std::int32_t sampleOffset,
                                                    std::uint8_t portIndex) noexcept
{
    const auto status = static_cast<std::uint8_t>(0x80u | clampChannel0to15(channel1to16));
    return makeThreeByteMsg(portIndex, 1, status, note, 0, sampleOffset);
}

McxMidiOutMessage HardwareMirrorRouter::makeCc(std::uint8_t channel1to16,
                                               std::uint8_t cc,
                                               std::uint8_t value,
                                               std::int32_t sampleOffset,
                                               std::uint8_t portIndex) noexcept
{
    const auto status = static_cast<std::uint8_t>(0xB0u | clampChannel0to15(channel1to16));
    return makeThreeByteMsg(portIndex, 2, status, cc, value, sampleOffset);
}

std::uint8_t HardwareMirrorRouter::computeRolandDt1Checksum(const std::uint8_t* addrAndData, std::size_t count) noexcept
{
    if (!addrAndData || count == 0)
        return 0;

    std::uint32_t sum = 0;
    for (std::size_t i = 0; i < count; ++i)
        sum += addrAndData[i];

    return static_cast<std::uint8_t>((0x80u - (sum & 0x7Fu)) & 0x7Fu);
}

bool HardwareMirrorRouter::pushMessage(const McxMidiOutMessage& msg) noexcept
{
    if (count_ >= kQueueCapacity)
        return false;
    buffer_[count_++] = msg;
    return true;
}

bool HardwareMirrorRouter::emitNoteOn(std::uint8_t channel1to16,
                                      std::uint8_t note,
                                      std::uint8_t velocity,
                                      std::int32_t sampleOffset,
                                      std::uint8_t portIndex) noexcept
{
    return pushMessage(makeNoteOn(channel1to16, note, velocity, sampleOffset, portIndex));
}

bool HardwareMirrorRouter::emitNoteOff(std::uint8_t channel1to16,
                                       std::uint8_t note,
                                       std::int32_t sampleOffset,
                                       std::uint8_t portIndex) noexcept
{
    return pushMessage(makeNoteOff(channel1to16, note, sampleOffset, portIndex));
}

bool HardwareMirrorRouter::emitCc(std::uint8_t channel1to16,
                                  std::uint8_t cc,
                                  std::uint8_t value,
                                  std::int32_t sampleOffset,
                                  std::uint8_t portIndex) noexcept
{
    return pushMessage(makeCc(channel1to16, cc, value, sampleOffset, portIndex));
}

bool HardwareMirrorRouter::emitNrpn(std::uint8_t channel1to16,
                                    std::uint8_t msb,
                                    std::uint8_t lsb,
                                    std::uint8_t dataMsb,
                                    std::int32_t sampleOffset,
                                    std::uint8_t portIndex) noexcept
{
    if (count_ + 3 > kQueueCapacity)
        return false;

    // Strict Roland ordering: CC99 (NRPN MSB) -> CC98 (NRPN LSB) -> CC6 (Data Entry MSB)
    return emitCc(channel1to16, 99, msb, sampleOffset, portIndex)
        && emitCc(channel1to16, 98, lsb, sampleOffset, portIndex)
        && emitCc(channel1to16, 6, dataMsb, sampleOffset, portIndex);
}

bool HardwareMirrorRouter::emitDrumKeyNrpn(std::uint8_t channel1to16,
                                           std::uint8_t paramMsb,
                                           std::uint8_t drumKeyNote,
                                           std::uint8_t value,
                                           std::int32_t sampleOffset,
                                           std::uint8_t portIndex) noexcept
{
    return emitNrpn(channel1to16, paramMsb, drumKeyNote, value, sampleOffset, portIndex);
}

bool HardwareMirrorRouter::emitRolandDt1SysEx(std::uint8_t deviceId,
                                              const std::uint8_t* modelId,
                                              std::size_t modelIdLen,
                                              const std::uint8_t* addr,
                                              std::size_t addrLen,
                                              const std::uint8_t* data,
                                              std::size_t dataLen,
                                              std::int32_t sampleOffset,
                                              std::uint8_t portIndex) noexcept
{
    if (!modelId || !addr || (addrLen != 3 && addrLen != 4) || (!data && dataLen > 0))
        return false;

    const std::size_t totalLen = 3 + modelIdLen + 1 + addrLen + dataLen + 2;
    if (totalLen > sizeof(McxMidiOutMessage::bytes))
        return false;

    McxMidiOutMessage msg {};
    msg.portIndex = portIndex;
    msg.priority = 2;
    std::size_t pos = 0;
    msg.bytes[pos++] = 0xF0;
    msg.bytes[pos++] = 0x41;
    msg.bytes[pos++] = static_cast<std::uint8_t>(deviceId & 0x7Fu);
    for (std::size_t i = 0; i < modelIdLen; ++i)
        msg.bytes[pos++] = static_cast<std::uint8_t>(modelId[i] & 0x7Fu);
    msg.bytes[pos++] = 0x12; // DT1

    const std::size_t cksumStart = pos;
    for (std::size_t i = 0; i < addrLen; ++i)
        msg.bytes[pos++] = static_cast<std::uint8_t>(addr[i] & 0x7Fu);
    for (std::size_t i = 0; i < dataLen; ++i)
        msg.bytes[pos++] = static_cast<std::uint8_t>(data[i] & 0x7Fu);

    msg.bytes[pos++] = computeRolandDt1Checksum(&msg.bytes[cksumStart], addrLen + dataLen);
    msg.bytes[pos++] = 0xF7;
    msg.length = static_cast<std::uint8_t>(pos);
    msg.sampleOffset = sampleOffset;
    return pushMessage(msg);
}

} // namespace abdmcx
