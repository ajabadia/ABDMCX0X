#pragma once

#include "../DSP/Core/McxTypes.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace abdmcx
{

/**
 * @brief Zero-allocation MIDI/NRPN/DT1 SysEx formatter and INT/EXT/AB router.
 * Enforces strict Roland NRPN transmission order: CC99 (MSB) -> CC98 (LSB) -> CC6 (Data),
 * avoiding the out-of-order CC6-first bug found in legacy community editors.
 */
class HardwareMirrorRouter
{
public:
    static constexpr std::size_t kQueueCapacity = 128;

    static constexpr bool routesToInternal(McxPartRouteMode mode) noexcept
    {
        return mode == McxPartRouteMode::Internal || mode == McxPartRouteMode::BothAB;
    }

    static constexpr bool routesToExternal(McxPartRouteMode mode) noexcept
    {
        return mode == McxPartRouteMode::ExternalMidi || mode == McxPartRouteMode::BothAB;
    }

    /** Computes standard Roland 7-bit DT1 checksum: (0x80 - (sum & 0x7F)) & 0x7F. */
    static std::uint8_t computeRolandDt1Checksum(const std::uint8_t* addrAndData, std::size_t count) noexcept;

    static McxMidiOutMessage makeNoteOn(std::uint8_t channel1to16,
                                        std::uint8_t note,
                                        std::uint8_t velocity,
                                        std::int32_t sampleOffset = 0,
                                        std::uint8_t portIndex = 0) noexcept;

    static McxMidiOutMessage makeNoteOff(std::uint8_t channel1to16,
                                         std::uint8_t note,
                                         std::int32_t sampleOffset = 0,
                                         std::uint8_t portIndex = 0) noexcept;

    static McxMidiOutMessage makeCc(std::uint8_t channel1to16,
                                    std::uint8_t cc,
                                    std::uint8_t value,
                                    std::int32_t sampleOffset = 0,
                                    std::uint8_t portIndex = 0) noexcept;

    void clear() noexcept { count_ = 0; }
    [[nodiscard]] std::size_t size() const noexcept { return count_; }
    [[nodiscard]] const McxMidiOutMessage& at(std::size_t idx) const noexcept { return buffer_[idx]; }

    bool emitNoteOn(std::uint8_t channel1to16,
                    std::uint8_t note,
                    std::uint8_t velocity,
                    std::int32_t sampleOffset = 0,
                    std::uint8_t portIndex = 0) noexcept;

    bool emitNoteOff(std::uint8_t channel1to16,
                     std::uint8_t note,
                     std::int32_t sampleOffset = 0,
                     std::uint8_t portIndex = 0) noexcept;

    bool emitCc(std::uint8_t channel1to16,
                std::uint8_t cc,
                std::uint8_t value,
                std::int32_t sampleOffset = 0,
                std::uint8_t portIndex = 0) noexcept;

    bool emitNrpn(std::uint8_t channel1to16,
                  std::uint8_t msb,
                  std::uint8_t lsb,
                  std::uint8_t dataMsb,
                  std::int32_t sampleOffset = 0,
                  std::uint8_t portIndex = 0) noexcept;

    bool emitDrumKeyNrpn(std::uint8_t channel1to16,
                         std::uint8_t paramMsb,
                         std::uint8_t drumKeyNote,
                         std::uint8_t value,
                         std::int32_t sampleOffset = 0,
                         std::uint8_t portIndex = 0) noexcept;

    bool emitRolandDt1SysEx(std::uint8_t deviceId,
                            const std::uint8_t* modelId,
                            std::size_t modelIdLen,
                            const std::uint8_t* addr,
                            std::size_t addrLen,
                            const std::uint8_t* data,
                            std::size_t dataLen,
                            std::int32_t sampleOffset = 0,
                            std::uint8_t portIndex = 0) noexcept;

private:
    bool pushMessage(const McxMidiOutMessage& msg) noexcept;

    std::array<McxMidiOutMessage, kQueueCapacity> buffer_ {};
    std::size_t count_ { 0 };
};

} // namespace abdmcx
