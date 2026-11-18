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
    engine_.setOutboundMidiQueue(&outQueue_);
}

void McxHardwareBridge::sendCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val, std::uint8_t portIdx) noexcept
{
    outQueue_.push(HardwareMirrorRouter::makeCc(ch1to16, cc, val, 0, portIdx));
}

void McxHardwareBridge::sendNrpn(std::uint8_t ch1to16, std::uint8_t msb, std::uint8_t lsb, std::uint8_t val, std::uint8_t portIdx) noexcept
{
    // Strict Roland ordering: CC99 (MSB) -> CC98 (LSB) -> CC6 (Data Entry MSB)
    sendCc(ch1to16, 99, msb, portIdx);
    sendCc(ch1to16, 98, lsb, portIdx);
    sendCc(ch1to16, 6, val, portIdx);
}

void McxHardwareBridge::dispatchBinding(std::uint8_t ch,
                                        std::uint8_t portIdx,
                                        const abd::synth::SemanticControlBinding& binding,
                                        float normalizedVal) noexcept
{
    if (binding.method == abd::synth::ControlWireMethod::None ||
        binding.method == abd::synth::ControlWireMethod::Manual)
    {
        return;
    }

    const float clamped = std::clamp(normalizedVal, 0.0f, 1.0f);
    const float scaled = binding.wireMin + clamped * (binding.wireMax - binding.wireMin);
    const std::uint8_t byteVal = static_cast<std::uint8_t>(std::clamp(static_cast<int>(std::round(scaled)), 0, 127));

    if (binding.method == abd::synth::ControlWireMethod::MidiCc)
        sendCc(ch, binding.controlNumber, byteVal, portIdx);
    else if (binding.method == abd::synth::ControlWireMethod::Nrpn7Bit ||
             binding.method == abd::synth::ControlWireMethod::Nrpn14Bit)
        sendNrpn(ch, binding.controlNumber, binding.subNumber, byteVal, portIdx);
}

void McxHardwareBridge::applyInternalSemanticParam(std::uint8_t partIdx,
                                                   std::uint64_t roleHash,
                                                   float normalizedVal) noexcept
{
    using namespace abd::synth::role;
    if (partIdx >= 16) return;

    auto& p = engine_.part(partIdx);
    const float n = std::clamp(normalizedVal, 0.0f, 1.0f);

    if (roleHash == kPartVolume)
        p.level = n;
    else if (roleHash == kPartPan)
        p.pan = std::clamp(n * 2.0f - 1.0f, -1.0f, 1.0f);
    else if (roleHash == kPartReverbSend)
        p.reverbSend = n;
    else if (roleHash == kPartChorusSend)
        p.chorusSend = n;
    else if (roleHash == kFilterCutoff)
    {
        const float hz = 20.0f * std::pow(1000.0f, n);
        for (auto& partial : p.partials) partial.cutoffHz = hz;
    }
    else if (roleHash == kFilterResonance)
    {
        for (auto& partial : p.partials) partial.resonance = n;
    }
    else if (roleHash == kAmpEnvAttack)
    {
        const float ms = 1.0f + n * 2000.0f;
        for (auto& partial : p.partials) partial.ampEnv.t1Ms = ms;
    }
    else if (roleHash == kAmpEnvDecay)
    {
        const float ms = 5.0f + n * 3000.0f;
        for (auto& partial : p.partials) partial.ampEnv.t2Ms = ms;
    }
    else if (roleHash == kAmpEnvRelease)
    {
        const float ms = 5.0f + n * 4000.0f;
        for (auto& partial : p.partials) partial.ampEnv.t4Ms = ms;
    }
    else if (roleHash == kVectorJoystickX)
        p.vectorX = std::clamp(n * 2.0f - 1.0f, -1.0f, 1.0f);
    else if (roleHash == kVectorJoystickY)
        p.vectorY = std::clamp(n * 2.0f - 1.0f, -1.0f, 1.0f);
}

void McxHardwareBridge::applyInternalDrumParam(std::uint8_t partIdx,
                                               std::uint8_t slotIdx,
                                               std::uint64_t roleHash,
                                               float normalizedVal,
                                               int rawMidiByte) noexcept
{
    using namespace abd::synth::role;
    if (partIdx >= 16 || slotIdx >= 128) return;

    auto& slot = engine_.part(partIdx).drumSlots[slotIdx];
    const float n = std::clamp(normalizedVal, 0.0f, 1.0f);

    if (roleHash == kDrumKeyPitch)
        slot.pitchKeyTrack = (rawMidiByte >= 0) ? (static_cast<float>(rawMidiByte - 64) * 0.5f) : ((n - 0.5f) * 24.0f);
    else if (roleHash == kDrumKeyLevel)
        slot.level = n;
    else if (roleHash == kDrumKeyPan)
        slot.pan = (rawMidiByte >= 0) ? (static_cast<float>(rawMidiByte - 64) / 64.0f) : std::clamp((n - 0.5f) * 2.0f, -1.0f, 1.0f);
    else if (roleHash == kDrumKeyReverbSend)
        slot.reverbSend = n;
    else if (roleHash == kDrumKeyChorusSend)
        slot.chorusSend = n;
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
            dispatchBinding(p.midiChannel, p.midiPortIndex, *binding, normalizedValue);
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
                const std::uint8_t valByte = static_cast<std::uint8_t>(std::clamp(static_cast<int>(scaled), 0, 127));
                sendNrpn(p.midiChannel, binding->controlNumber, drumKey, valByte, p.midiPortIndex);
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
