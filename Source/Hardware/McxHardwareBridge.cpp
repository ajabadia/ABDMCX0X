#include "McxHardwareBridge.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

McxHardwareBridge::McxHardwareBridge(McxEngine& engine)
    : engine_(engine), fallbackProfile_(abd::synth::HardwareProfileHydrator::makeGenericGmProfile())
{
    for (auto& idx : partProfileIdx_)
        idx.store(-1, std::memory_order_relaxed);
    modDecimator_.prepare(44100.0);
    engine_.setOutboundMidiQueue(&outQueue_);
}

void McxHardwareBridge::prepare(double sampleRate) noexcept
{
    latencyComp_.prepare(sampleRate);
    modDecimator_.prepare(sampleRate);
}

void McxHardwareBridge::sendCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val, std::uint8_t portIdx) noexcept
{
    outQueue_.push(HardwareMirrorRouter::makeCc(ch1to16, cc, val, 0, portIdx));
}

void McxHardwareBridge::sendNrpn(std::uint8_t ch1to16, std::uint8_t msb, std::uint8_t lsb, std::uint8_t val, std::uint8_t portIdx, std::int16_t lsbVal) noexcept
{
    // Strict Roland ordering: CC99 (MSB) -> CC98 (LSB) -> CC6 (Data Entry MSB) [-> CC38 (LSB)]
    sendCc(ch1to16, 99, msb, portIdx);
    sendCc(ch1to16, 98, lsb, portIdx);
    sendCc(ch1to16, 6, val, portIdx);
    if (lsbVal >= 0) sendCc(ch1to16, 38, static_cast<std::uint8_t>(lsbVal & 0x7Fu), portIdx);
}

void McxHardwareBridge::dispatchBinding(std::uint8_t partIdx,
                                        std::uint8_t ch,
                                        std::uint8_t portIdx,
                                        const abd::synth::SemanticControlBinding& binding,
                                        float normalizedVal) noexcept
{
    if (binding.method == abd::synth::ControlWireMethod::None ||
        binding.method == abd::synth::ControlWireMethod::Manual)
    {
        return;
    }

    const bool isNrpn14 = (binding.method == abd::synth::ControlWireMethod::Nrpn14Bit);
    const float clamped = std::clamp(normalizedVal, 0.0f, 1.0f);
    const float scaled = binding.wireMin + clamped * (binding.wireMax - binding.wireMin);
    const float wireNorm01 = std::clamp(scaled / ((isNrpn14 && binding.wireMax > 127.0f) ? 16383.0f : 127.0f), 0.0f, 1.0f);
    const std::size_t slotId = (static_cast<std::size_t>(partIdx) * 13u
        + static_cast<std::size_t>(binding.controlNumber) * 3u
        + static_cast<std::size_t>(binding.subNumber)) % McxMidiModDecimator::kMaxSlots;

    if (binding.method == abd::synth::ControlWireMethod::MidiCc)
        (void)modDecimator_.submitCc(outQueue_, slotId, portIdx, ch, binding.controlNumber, wireNorm01);
    else if (binding.method == abd::synth::ControlWireMethod::Nrpn7Bit || isNrpn14)
        (void)modDecimator_.submitNrpn(outQueue_, slotId, portIdx, ch, binding.controlNumber, binding.subNumber, wireNorm01, 0, isNrpn14);
    else if (binding.method == abd::synth::ControlWireMethod::SysEx && binding.sysexAddrLen > 0)
    {
        const auto& id = getPartProfile(partIdx).identity;
        const std::uint8_t defModel = 0x14;
        const auto* modPtr = id.modelIdBytes.empty() ? &defModel : id.modelIdBytes.data();
        const std::size_t modLen = id.modelIdBytes.empty() ? 1u : id.modelIdBytes.size();
        const auto val7 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(std::lround(scaled)), 0, 127));
        const auto msg = HardwareMirrorRouter::makeRolandDt1SysEx(id.defaultDeviceId, modPtr, modLen, binding.sysexAddrBytes.data(), binding.sysexAddrLen, &val7, 1u, 0, portIdx);
        if (msg.length > 0) (void)outQueue_.push(msg);
    }
}

void McxHardwareBridge::routeNoteOn(std::uint8_t partIdx, std::uint8_t note, float velocity, std::int32_t sampleOffset) noexcept
{
    if (partIdx >= McxEngine::kNumParts) return;

    const auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        engine_.triggerInternalNoteOnly(partIdx, note, velocity);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const std::uint8_t outNote = p.isDrumKit ? p.drumRemapper.slotToExternal[note & 0x7Fu] : note;
        const std::uint8_t velByte = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(velocity * 127.0f), 1, 127));
        outQueue_.push(HardwareMirrorRouter::makeNoteOn(p.midiChannel, outNote, velByte, sampleOffset, p.midiPortIndex));
    }
}

void McxHardwareBridge::routeNoteOff(std::uint8_t partIdx, std::uint8_t note, std::int32_t sampleOffset) noexcept
{
    if (partIdx >= McxEngine::kNumParts) return;

    const auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        engine_.releaseInternalNoteOnly(partIdx, note);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        const std::uint8_t outNote = p.isDrumKit ? p.drumRemapper.slotToExternal[note & 0x7Fu] : note;
        outQueue_.push(HardwareMirrorRouter::makeNoteOff(p.midiChannel, outNote, sampleOffset, p.midiPortIndex));
    }
}

void McxHardwareBridge::routeSemanticParam(std::uint8_t partIdx, std::uint64_t roleHash, float normalizedValue) noexcept
{
    if (partIdx >= McxEngine::kNumParts) return;

    const auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        applyInternalSemanticParam(partIdx, roleHash, normalizedValue);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        if (const auto* binding = getPartProfile(partIdx).findByRoleHash(roleHash))
            dispatchBinding(partIdx, p.midiChannel, p.midiPortIndex, *binding, normalizedValue);
    }
}

void McxHardwareBridge::routeDrumSemanticParam(std::uint8_t partIdx,
                                               std::uint8_t slotIdx,
                                               std::uint64_t drumRoleHash,
                                               float normalizedValue) noexcept
{
    if (partIdx >= McxEngine::kNumParts || slotIdx >= 128) return;

    const auto& p = engine_.part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        applyInternalDrumParam(partIdx, slotIdx, drumRoleHash, normalizedValue, -1);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        if (const auto* binding = getPartProfile(partIdx).findByRoleHash(drumRoleHash))
        {
            if (binding->method == abd::synth::ControlWireMethod::Nrpn7Bit ||
                binding->method == abd::synth::ControlWireMethod::Nrpn14Bit)
            {
                const std::uint8_t drumKey = p.drumRemapper.slotToExternal[slotIdx];
                const float clamped = std::clamp(normalizedValue, 0.0f, 1.0f);
                const float scaled = binding->wireMin + clamped * (binding->wireMax - binding->wireMin);
                const int byteVal = std::clamp<int>(static_cast<int>(scaled), 0, 127);
                const float wireNorm01 = static_cast<float>(byteVal) / 127.0f;
                const std::size_t slotId = (static_cast<std::size_t>(partIdx) * 13u
                    + static_cast<std::size_t>(binding->controlNumber) * 3u
                    + static_cast<std::size_t>(drumKey)) % McxMidiModDecimator::kMaxSlots;
                (void)modDecimator_.submitNrpn(outQueue_, slotId, p.midiPortIndex, p.midiChannel,
                                               binding->controlNumber, drumKey, wireNorm01);
            }
        }
    }
}

void McxHardwareBridge::routePartVolume(std::uint8_t partIdx, float normalizedLevel) noexcept
{
    routeSemanticParam(partIdx, abd::synth::role::kPartVolume, normalizedLevel);
}

void McxHardwareBridge::routePartPan(std::uint8_t partIdx, float normalizedPan) noexcept
{
    routeSemanticParam(partIdx, abd::synth::role::kPartPan, (std::clamp(normalizedPan, -1.0f, 1.0f) + 1.0f) * 0.5f);
}

void McxHardwareBridge::routePartReverb(std::uint8_t partIdx, float normalizedReverb) noexcept
{
    routeSemanticParam(partIdx, abd::synth::role::kPartReverbSend, normalizedReverb);
}

void McxHardwareBridge::routePartChorus(std::uint8_t partIdx, float normalizedChorus) noexcept
{
    routeSemanticParam(partIdx, abd::synth::role::kPartChorusSend, normalizedChorus);
}

void McxHardwareBridge::routeDrumSlotParam(std::uint8_t partIdx,
                                           std::uint8_t slotIdx,
                                           std::uint8_t paramKind,
                                           float normalizedValue) noexcept
{
    using namespace abd::synth::role;
    std::uint64_t drumRole = kDrumKeyLevel;
    switch (paramKind)
    {
        case 0: drumRole = kDrumKeyPitch; break;
        case 1: drumRole = kDrumKeyLevel; break;
        case 2: drumRole = kDrumKeyPan; break;
        case 3: drumRole = kDrumKeyReverbSend; break;
        case 4: drumRole = kDrumKeyChorusSend; break;
        case 5: drumRole = kDrumKeyDelaySend; break;
        default: break;
    }
    routeDrumSemanticParam(partIdx, slotIdx, drumRole, normalizedValue);
}

void McxHardwareBridge::routeSynthFilter(std::uint8_t partIdx, float cutoffNorm, float resNorm) noexcept
{
    routeSemanticParam(partIdx, abd::synth::role::kFilterCutoff, cutoffNorm);
    routeSemanticParam(partIdx, abd::synth::role::kFilterResonance, resNorm);
}

void McxHardwareBridge::routeSynthEnvelope(std::uint8_t partIdx, float aNorm, float dNorm, float rNorm) noexcept
{
    routeSemanticParam(partIdx, abd::synth::role::kAmpEnvAttack, aNorm);
    routeSemanticParam(partIdx, abd::synth::role::kAmpEnvDecay, dNorm);
    routeSemanticParam(partIdx, abd::synth::role::kAmpEnvRelease, rNorm);
}

std::size_t McxHardwareBridge::drainOutboundQueue(const MidiByteSink& sink) noexcept
{
    if (!sink) return 0;

    McxMidiOutMessage msg {};
    std::size_t count = 0;
    while (outQueue_.pop(msg))
    {
        sink(msg.bytes, msg.length);
        ++count;
    }
    return count;
}

} // namespace abdmcx
