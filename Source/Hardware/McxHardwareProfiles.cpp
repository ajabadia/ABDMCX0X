#include "McxHardwareBridge.h"

#include <algorithm>

namespace abdmcx
{

int McxHardwareBridge::resolveRegistryIndexById(std::string_view idOrAlias) const noexcept
{
    const auto* match = abd::synth::HardwareProfileHydrator::resolveByIdOrAlias(registry_, idOrAlias);
    if (!match || registry_.empty())
        return -1;
    const auto ptrDiff = match - registry_.data();
    if (ptrDiff < 0 || static_cast<std::size_t>(ptrDiff) >= registry_.size())
        return -1;
    return static_cast<int>(ptrDiff);
}

std::size_t McxHardwareBridge::loadContractsDirectory(const std::string& contractsDir)
{
    defaultProfileIdx_.store(-1, std::memory_order_release);
    for (auto& idx : partProfileIdx_)
        idx.store(-1, std::memory_order_relaxed);
    return abd::synth::HardwareProfileHydrator::loadDirectory(contractsDir, registry_, true);
}

void McxHardwareBridge::registerProfile(abd::synth::UniversalHardwareProfile profile)
{
    profile.rebuildLookupTables();
    for (auto& existing : registry_)
    {
        if (existing.id == profile.id)
        {
            existing = std::move(profile);
            return;
        }
    }
    registry_.push_back(std::move(profile));
}

bool McxHardwareBridge::loadProfileFromJsonString(std::string_view jsonText, std::string* outError)
{
    abd::synth::UniversalHardwareProfile hydrated;
    if (!abd::synth::HardwareProfileHydrator::hydrateFromJsonString(jsonText, hydrated, true, outError))
        return false;

    const std::string id = hydrated.id;
    registerProfile(std::move(hydrated));
    setProfileById(id);
    return true;
}

bool McxHardwareBridge::loadProfileFromJsonFile(const std::string& filePath, std::string* outError)
{
    abd::synth::UniversalHardwareProfile hydrated;
    if (!abd::synth::HardwareProfileHydrator::hydrateFromJsonFile(filePath, hydrated, true, outError))
        return false;

    const std::string id = hydrated.id;
    registerProfile(std::move(hydrated));
    setProfileById(id);
    return true;
}

void McxHardwareBridge::setProfile(const abd::synth::UniversalHardwareProfile& profile)
{
    fallbackProfile_ = profile;
    defaultProfileIdx_.store(-1, std::memory_order_release);
}

void McxHardwareBridge::setProfileById(const std::string& profileId)
{
    const int idx = resolveRegistryIndexById(profileId);
    if (idx >= 0)
    {
        defaultProfileIdx_.store(idx, std::memory_order_release);
        return;
    }
    fallbackProfile_ = abd::synth::HardwareProfileHydrator::makeGenericGmProfile();
    defaultProfileIdx_.store(-1, std::memory_order_release);
}

bool McxHardwareBridge::setPartHardwareProfile(std::uint8_t partIdx, const std::string& profileId)
{
    if (partIdx >= McxEngine::kNumParts)
        return false;
    if (profileId.empty() || profileId == "inherit" || profileId == "default")
    {
        partProfileIdx_[partIdx].store(-1, std::memory_order_release);
        return true;
    }
    const int idx = resolveRegistryIndexById(profileId);
    if (idx < 0)
        return false;
    partProfileIdx_[partIdx].store(idx, std::memory_order_release);
    return true;
}

void McxHardwareBridge::setPartMidiPort(std::uint8_t partIdx, std::uint8_t portIndex) noexcept
{
    if (partIdx < McxEngine::kNumParts)
        engine_.part(static_cast<int>(partIdx)).midiPortIndex = portIndex;
}

std::uint8_t McxHardwareBridge::getPartMidiPort(std::uint8_t partIdx) const noexcept
{
    if (partIdx >= McxEngine::kNumParts)
        return 0;
    return engine_.part(static_cast<int>(partIdx)).midiPortIndex;
}

bool McxHardwareBridge::autoDetectFromIdentityReply(const std::uint8_t* sysex, std::size_t length) noexcept
{
    const auto* match = abd::synth::HardwareProfileHydrator::resolveByIdentityReply(registry_, sysex, length);
    if (!match || registry_.empty())
        return false;
    const auto diff = match - registry_.data();
    if (diff < 0 || static_cast<std::size_t>(diff) >= registry_.size())
        return false;
    defaultProfileIdx_.store(static_cast<int>(diff), std::memory_order_release);
    return true;
}

bool McxHardwareBridge::autoDetectFromPortName(std::string_view portName) noexcept
{
    const auto* match = abd::synth::HardwareProfileHydrator::resolveByPortName(registry_, portName);
    if (!match || registry_.empty())
        return false;
    const auto diff = match - registry_.data();
    if (diff < 0 || static_cast<std::size_t>(diff) >= registry_.size())
        return false;
    defaultProfileIdx_.store(static_cast<int>(diff), std::memory_order_release);
    return true;
}

const abd::synth::UniversalHardwareProfile& McxHardwareBridge::getProfile() const noexcept
{
    const int idx = defaultProfileIdx_.load(std::memory_order_acquire);
    if (idx >= 0 && static_cast<std::size_t>(idx) < registry_.size())
        return registry_[static_cast<std::size_t>(idx)];
    return fallbackProfile_;
}

const abd::synth::UniversalHardwareProfile& McxHardwareBridge::getPartProfile(std::uint8_t partIdx) const noexcept
{
    if (partIdx < McxEngine::kNumParts)
    {
        const int idx = partProfileIdx_[partIdx].load(std::memory_order_acquire);
        if (idx >= 0 && static_cast<std::size_t>(idx) < registry_.size())
            return registry_[static_cast<std::size_t>(idx)];
    }
    return getProfile();
}

} // namespace abdmcx
