#include "HardwareMirrorRouter.h"

#include <algorithm>

namespace abdmcx
{

namespace
{
std::uint8_t statusCc(std::uint8_t channel1to16) noexcept
{
    const std::uint8_t ch = static_cast<std::uint8_t>(std::clamp<int>(channel1to16, 1, 16) - 1);
    return static_cast<std::uint8_t>(0xB0u | ch);
}
} // namespace

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

bool HardwareMirrorRouter::emitCc(std::uint8_t channel1to16,
                                  std::uint8_t cc,
                                  std::uint8_t value,
                                  std::int32_t sampleOffset) noexcept
{
    McxMidiOutMessage msg {};
    msg.length = 3;
    msg.bytes[0] = statusCc(channel1to16);
    msg.bytes[1] = static_cast<std::uint8_t>(cc & 0x7Fu);
    msg.bytes[2] = static_cast<std::uint8_t>(value & 0x7Fu);
    msg.sampleOffset = sampleOffset;
    return pushMessage(msg);
}

bool HardwareMirrorRouter::emitNrpn(std::uint8_t channel1to16,
                                    std::uint8_t msb,
                                    std::uint8_t lsb,
                                    std::uint8_t dataMsb,
                                    std::int32_t sampleOffset) noexcept
{
    if (count_ + 3 > kQueueCapacity)
        return false;

    // Strict Roland ordering: CC99 (NRPN MSB) -> CC98 (NRPN LSB) -> CC6 (Data Entry MSB)
    return emitCc(channel1to16, 99, msb, sampleOffset)
        && emitCc(channel1to16, 98, lsb, sampleOffset)
        && emitCc(channel1to16, 6, dataMsb, sampleOffset);
}

bool HardwareMirrorRouter::emitDrumKeyNrpn(std::uint8_t channel1to16,
                                           std::uint8_t paramMsb,
                                           std::uint8_t drumKeyNote,
                                           std::uint8_t value,
                                           std::int32_t sampleOffset) noexcept
{
    return emitNrpn(channel1to16, paramMsb, drumKeyNote, value, sampleOffset);
}

bool HardwareMirrorRouter::emitRolandDt1SysEx(std::uint8_t deviceId,
                                              const std::uint8_t* modelId,
                                              std::size_t modelIdLen,
                                              const std::uint8_t* addr,
                                              std::size_t addrLen,
                                              const std::uint8_t* data,
                                              std::size_t dataLen,
                                              std::int32_t sampleOffset) noexcept
{
    if (!modelId || !addr || (addrLen != 3 && addrLen != 4) || (!data && dataLen > 0))
        return false;

    const std::size_t totalLen = 3 + modelIdLen + 1 + addrLen + dataLen + 2;
    if (totalLen > sizeof(McxMidiOutMessage::bytes))
        return false;

    McxMidiOutMessage msg {};
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
