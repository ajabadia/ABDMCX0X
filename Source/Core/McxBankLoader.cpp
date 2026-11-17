#include "McxBankLoader.h"
#include "../DSP/Core/McxEngine.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <fstream>
#include <sstream>

namespace abdmcx
{

namespace
{
std::string findString(const std::string& json, const std::string& key, const std::string& def)
{
    const std::string pat = "\"" + key + "\"";
    auto pos = json.find(pat);
    if (pos == std::string::npos) return def;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return def;
    auto q1 = json.find('"', pos);
    auto q2 = (q1 != std::string::npos) ? json.find('"', q1 + 1) : std::string::npos;
    return (q2 != std::string::npos) ? json.substr(q1 + 1, q2 - q1 - 1) : def;
}

int findInt(const std::string& json, const std::string& key, int def)
{
    const std::string pat = "\"" + key + "\"";
    auto pos = json.find(pat);
    if (pos == std::string::npos) return def;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return def;
    auto start = json.find_first_of("-0123456789", pos);
    if (start == std::string::npos || start > pos + 10) return def;
    auto end = json.find_first_not_of("-0123456789", start);
    return std::stoi(json.substr(start, end - start));
}

float findFloat(const std::string& json, const std::string& key, float def)
{
    const std::string pat = "\"" + key + "\"";
    auto pos = json.find(pat);
    if (pos == std::string::npos) return def;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return def;
    auto start = json.find_first_of("-0123456789.", pos);
    if (start == std::string::npos || start > pos + 10) return def;
    auto end = json.find_first_not_of("-0123456789.eE", start);
    return std::stof(json.substr(start, end - start));
}

std::uint32_t readU32LE(const std::uint8_t* p)
{
    return static_cast<std::uint32_t>(p[0]) | (static_cast<std::uint32_t>(p[1]) << 8) |
           (static_cast<std::uint32_t>(p[2]) << 16) | (static_cast<std::uint32_t>(p[3]) << 24);
}

std::uint16_t readU16LE(const std::uint8_t* p)
{
    return static_cast<std::uint16_t>(p[0]) | (static_cast<std::uint16_t>(p[1]) << 8);
}
} // namespace

bool McxBankLoader::parseZip(const std::uint8_t* bytes, std::size_t size, std::vector<ZipEntryView>& outEntries)
{
    std::size_t offset = 0;
    while (offset + 30 <= size)
    {
        if (readU32LE(bytes + offset) != 0x04034b50u) break;
        const std::uint32_t compSize = readU32LE(bytes + offset + 18);
        const std::uint16_t nameLen = readU16LE(bytes + offset + 26);
        const std::uint16_t extraLen = readU16LE(bytes + offset + 28);
        if (offset + 30 + nameLen + extraLen + compSize > size) return false;
        std::string name(reinterpret_cast<const char*>(bytes + offset + 30), nameLen);
        outEntries.push_back({ name, bytes + offset + 30 + nameLen + extraLen, compSize });
        offset += 30 + nameLen + extraLen + compSize;
    }
    return !outEntries.empty();
}

bool McxBankLoader::parseWav(const std::uint8_t* wav, std::size_t wavSize, McxLoadedWave& wave)
{
    if (wavSize < 44 || std::memcmp(wav, "RIFF", 4) != 0 || std::memcmp(wav + 8, "WAVE", 4) != 0) return false;
    std::size_t offset = 12;
    int channels = 1, bitsPerSample = 16;
    const std::uint8_t* pcmData = nullptr;
    std::size_t pcmSize = 0;
    while (offset + 8 <= wavSize)
    {
        const std::uint32_t chunkSize = readU32LE(wav + offset + 4);
        if (std::memcmp(wav + offset, "fmt ", 4) == 0 && chunkSize >= 16)
        {
            channels = readU16LE(wav + offset + 10);
            bitsPerSample = readU16LE(wav + offset + 22);
        }
        else if (std::memcmp(wav + offset, "data", 4) == 0)
        {
            pcmData = wav + offset + 8;
            pcmSize = std::min<std::size_t>(chunkSize, wavSize - (offset + 8));
        }
        offset += 8 + chunkSize + (chunkSize & 1u);
    }
    if (!pcmData || bitsPerSample != 16 || channels < 1) return false;
    const std::size_t totalSamples = (pcmSize / sizeof(std::int16_t)) / static_cast<std::size_t>(channels);
    wave.sampleDataL.resize(totalSamples);
    wave.sampleDataR.resize(totalSamples);
    wave.isStereo = (channels >= 2);
    const auto* pcm16 = reinterpret_cast<const std::int16_t*>(pcmData);
    for (std::size_t i = 0; i < totalSamples; ++i)
    {
        wave.sampleDataL[i] = static_cast<float>(pcm16[i * channels]) / 32768.0f;
        wave.sampleDataR[i] = (channels >= 2) ? (static_cast<float>(pcm16[i * channels + 1]) / 32768.0f) : wave.sampleDataL[i];
    }
    return true;
}

bool McxBankLoader::parseManifest(const std::string& json)
{
    bankName_ = findString(json, "bankName", "Unknown Bank");
    author_ = findString(json, "author", "ABDSynths");

    // Scan wavePool
    std::size_t curPos = json.find("\"wavePool\"");
    while (curPos != std::string::npos)
    {
        curPos = json.find("{\"id\":", curPos);
        if (curPos == std::string::npos) break;
        const auto endBrace = json.find('}', curPos);
        const std::string block = json.substr(curPos, (endBrace != std::string::npos) ? (endBrace - curPos + 1) : 300);
        McxLoadedWave w;
        w.id = findString(block, "id", "");
        w.name = findString(block, "name", w.id);
        w.rootKey = findInt(block, "rootKey", 60);
        w.fineTuneCents = findFloat(block, "fineTuneCents", 0.0f);
        w.loopStart = findInt(block, "loopStartFrame", 0);
        w.loopEnd = findInt(block, "loopEndFrame", 0);
        w.isLooping = (findString(block, "playMode", "oneshot") == "forward");
        if (!w.id.empty()) waves_[w.id] = std::move(w);
        curPos = (endBrace != std::string::npos) ? endBrace + 1 : std::string::npos;
    }

    // Scan drumKits
    std::size_t dkPos = json.find("\"drumKits\"");
    if (dkPos != std::string::npos)
    {
        McxLoadedDrumKit kit { findString(json.substr(dkPos), "id", "kit_001"), findString(json.substr(dkPos), "name", bankName_) };
        std::size_t slotPos = dkPos;
        for (;;)
        {
            slotPos = json.find("\"midiNote\":", slotPos);
            if (slotPos == std::string::npos) break;
            const auto blockEnd = json.find('}', slotPos);
            const std::string sBlock = json.substr(slotPos, (blockEnd != std::string::npos) ? (blockEnd - slotPos + 1) : 250);
            const int note = std::clamp(findInt(sBlock, "midiNote", 60), 0, 127);
            auto& slot = kit.slots[static_cast<std::size_t>(note)];
            slot.midiNote = note;
            slot.waveId = findString(sBlock, "toneId", "");
            slot.muteGroup = static_cast<std::uint8_t>(findInt(sBlock, "muteGroup", 0));
            slot.cutoffHzOverride = findFloat(sBlock, "cutoffHzOverride", 14000.0f);
            slot.triggerMode = (findString(sBlock, "triggerMode", "one_shot") == "gated")
                                   ? McxDrumTriggerMode::Gated : McxDrumTriggerMode::OneShot;
            slotPos = (blockEnd != std::string::npos) ? blockEnd + 1 : std::string::npos;
        }
        drumKits_.push_back(std::move(kit));
    }

    std::size_t tnPos = json.find("\"tones\"");
    if (tnPos != std::string::npos)
    {
        McxLoadedTone tone { findString(json.substr(tnPos), "id", "tone_001"), findString(json.substr(tnPos), "name", bankName_) };
        for (std::size_t p = 0; p < 4; ++p)
        {
            auto& pt = tone.partials[p];
            pt.enabled = (p == 0 || p < waves_.size());
            pt.sourceKind = McxOscSourceKind::PcmZone;
            pt.cutoffHz = 16000.0f;
            pt.level = 0.85f;
            tone.partialWaveIds[p] = "w_" + std::string(4 - std::to_string(p).length(), '0') + std::to_string(p);
        }
        tones_.push_back(std::move(tone));
    }
    return !waves_.empty() || !tones_.empty();
}

bool McxBankLoader::loadFromMemory(const void* data, std::size_t sizeBytes)
{
    clear();
    if (!data || sizeBytes < 30) return false;
    std::vector<ZipEntryView> entries;
    if (!parseZip(static_cast<const std::uint8_t*>(data), sizeBytes, entries)) return false;

    auto it = std::find_if(entries.begin(), entries.end(), [](const ZipEntryView& e) {
        return e.filename == "manifest.json" || e.filename.ends_with("/manifest.json");
    });
    if (it == entries.end()) return false;
    if (!parseManifest(std::string(reinterpret_cast<const char*>(it->data), it->size))) return false;

    for (auto& [id, wave] : waves_)
        for (const auto& e : entries)
            if (e.filename.ends_with(".wav") && (e.filename.find(id) != std::string::npos || e.filename.find(wave.name) != std::string::npos))
            { parseWav(e.data, e.size, wave); break; }

    valid_ = true;
    return true;
}

bool McxBankLoader::loadFromFilePath(const std::string& filePath)
{
    std::ifstream file(filePath, std::ios::binary | std::ios::ate);
    if (!file.is_open()) return false;
    const auto size = static_cast<std::size_t>(file.tellg());
    file.seekg(0, std::ios::beg);
    std::vector<std::uint8_t> buffer(size);
    return file.read(reinterpret_cast<char*>(buffer.data()), static_cast<std::streamsize>(size)) &&
           loadFromMemory(buffer.data(), buffer.size());
}

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
bool McxBankLoader::loadFromFile(const juce::File& file)
{
    juce::MemoryBlock mb;
    return file.loadFileAsData(mb) && loadFromMemory(mb.getData(), mb.getSize());
}
#endif

void McxBankLoader::clear() noexcept
{
    valid_ = false;
    bankName_.clear();
    author_.clear();
    waves_.clear();
    tones_.clear();
    drumKits_.clear();
}

const McxLoadedTone* McxBankLoader::getTone(int index) const noexcept
{
    return (index >= 0 && static_cast<std::size_t>(index) < tones_.size()) ? &tones_[static_cast<std::size_t>(index)] : nullptr;
}

const McxLoadedDrumKit* McxBankLoader::getDrumKit(int index) const noexcept
{
    return (index >= 0 && static_cast<std::size_t>(index) < drumKits_.size()) ? &drumKits_[static_cast<std::size_t>(index)] : nullptr;
}

const McxLoadedWave* McxBankLoader::findWave(const std::string& waveId) const noexcept
{
    auto it = waves_.find(waveId);
    return (it != waves_.end()) ? &it->second : nullptr;
}

bool McxBankLoader::applyToneToPart(int toneIndex, McxPartState& part) const noexcept
{
    const auto* tone = getTone(toneIndex);
    if (!tone) return false;
    part.isDrumKit = false;
    part.structureMode = tone->structureMode;
    for (std::size_t p = 0; p < 4; ++p)
    {
        part.partials[p] = tone->partials[p];
        if (const auto* w = findWave(tone->partialWaveIds[p]); w && !w->sampleDataL.empty())
        {
            auto& pt = part.partials[p];
            pt.externalSampleData = w->sampleDataL.data();
            pt.externalSampleLength = static_cast<int>(w->sampleDataL.size());
            pt.externalLoopStart = w->loopStart;
            pt.externalLoopEnd = (w->loopEnd > w->loopStart) ? w->loopEnd : static_cast<int>(w->sampleDataL.size());
        }
    }
    return true;
}

bool McxBankLoader::applyDrumKitToPart(int kitIndex, McxPartState& part) const noexcept
{
    const auto* kit = getDrumKit(kitIndex);
    if (!kit) return false;
    part.isDrumKit = true;
    part.drumMapMode = kit->drumMapMode;
    for (int n = 0; n < 128; ++n)
    {
        const auto& s = kit->slots[static_cast<std::size_t>(n)];
        auto& slot = part.drumSlots[static_cast<std::size_t>(n)];
        slot.muteGroup = s.muteGroup;
        slot.cutoffHzOverride = s.cutoffHzOverride;
        slot.triggerMode = s.triggerMode;
        slot.level = s.level;
        slot.pan = s.pan;
        if (const auto* w = findWave(s.waveId); w && !w->sampleDataL.empty())
        {
            slot.externalSampleData = w->sampleDataL.data();
            slot.externalSampleLength = static_cast<int>(w->sampleDataL.size());
            slot.externalLoopStart = w->loopStart;
            slot.externalLoopEnd = (w->loopEnd > w->loopStart) ? w->loopEnd : static_cast<int>(w->sampleDataL.size());
        }
    }
    return true;
}

} // namespace abdmcx
