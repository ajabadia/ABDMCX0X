#include "McxHardwareBridge.h"

namespace abdmcx
{

std::size_t McxHardwareBridge::loadContractsDirectory(const std::string& contractsDir)
{
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

    setProfile(hydrated);
    registerProfile(std::move(hydrated));
    return true;
}

bool McxHardwareBridge::loadProfileFromJsonFile(const std::string& filePath, std::string* outError)
{
    abd::synth::UniversalHardwareProfile hydrated;
    if (!abd::synth::HardwareProfileHydrator::hydrateFromJsonFile(filePath, hydrated, true, outError))
        return false;

    setProfile(hydrated);
    registerProfile(std::move(hydrated));
    return true;
}

void McxHardwareBridge::setProfile(const abd::synth::UniversalHardwareProfile& profile)
{
    profile_ = profile;
}

void McxHardwareBridge::setProfileById(const std::string& profileId)
{
    if (const auto* match = abd::synth::HardwareProfileHydrator::resolveByIdOrAlias(registry_, profileId))
    {
        profile_ = *match;
        return;
    }
    profile_ = abd::synth::HardwareProfileHydrator::makeGenericGmProfile();
}

bool McxHardwareBridge::autoDetectFromIdentityReply(const std::uint8_t* sysex, std::size_t length)
{
    if (const auto* match = abd::synth::HardwareProfileHydrator::resolveByIdentityReply(registry_, sysex, length))
    {
        profile_ = *match;
        return true;
    }
    return false;
}

bool McxHardwareBridge::autoDetectFromPortName(std::string_view portName)
{
    if (const auto* match = abd::synth::HardwareProfileHydrator::resolveByPortName(registry_, portName))
    {
        profile_ = *match;
        return true;
    }
    return false;
}

} // namespace abdmcx
