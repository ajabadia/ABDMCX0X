#include "WasmBridge.h"
#include "WasmInternal.h"

#include <string>

extern "C"
{

int getRegisteredEngineCount()
{
    return abdmcx::wasm_internal::engine().getRegisteredEngineTypeCount();
}

int getPartEngineTypeIndex(int partIdx)
{
    return abdmcx::wasm_internal::engine().getPartEngineTypeIndex(partIdx);
}

int selectPartEngineType(int partIdx, int typeIndex)
{
    return abdmcx::wasm_internal::engine().selectPartEngineType(partIdx, typeIndex) ? 1 : 0;
}

const char* getPartEngineTypeId(int partIdx)
{
    return abdmcx::wasm_internal::engine().getPartEngineTypeId(partIdx);
}

int getPartFactoryPresetCount(int partIdx)
{
    return abdmcx::wasm_internal::engine().getPartFactoryPresetCount(partIdx);
}

const char* getPartFactoryPresetName(int partIdx, int presetIdx)
{
    return abdmcx::wasm_internal::engine().getPartFactoryPresetName(partIdx, presetIdx);
}

int loadPartFactoryPreset(int partIdx, int presetIdx)
{
    return abdmcx::wasm_internal::engine().loadPartFactoryPreset(partIdx, presetIdx) ? 1 : 0;
}

const char* getPartCurrentPresetName(int partIdx)
{
    return abdmcx::wasm_internal::engine().getPartCurrentPresetName(partIdx);
}

int setPartEngineParamByKey(int partIdx, const char* key, float value)
{
    if (key == nullptr) return 0;
    return abdmcx::wasm_internal::engine().setPartEngineParamByKey(partIdx, key, value) ? 1 : 0;
}

float getPartEngineParamByKey(int partIdx, const char* key)
{
    if (key == nullptr) return 0.0f;
    float out = 0.0f;
    return abdmcx::wasm_internal::engine().getPartEngineParamByKey(partIdx, key, out) ? out : 0.0f;
}

const char* getPartEngineStateJson(int partIdx)
{
    static std::string sStateJson;
    sStateJson = abdmcx::wasm_internal::engine().serializePartEngineStateJson(partIdx);
    return sStateJson.c_str();
}

int indexBankFromMemory(const uint8_t* data, int sizeBytes)
{
    if (data == nullptr || sizeBytes <= 0)
        return -1;
    return abdmcx::wasm_internal::bankManager().mountBankFromMemory(data, static_cast<std::size_t>(sizeBytes), {}, true);
}

int getIndexedBankToneCount(int bankSlot)
{
    const auto* bank = abdmcx::wasm_internal::bankManager().getBank(bankSlot);
    return (bank != nullptr) ? bank->getToneCount() : 0;
}

int getIndexedBankKitCount(int bankSlot)
{
    const auto* bank = abdmcx::wasm_internal::bankManager().getBank(bankSlot);
    return (bank != nullptr) ? bank->getDrumKitCount() : 0;
}

int loadIndexedToneOnDemand(int bankSlot, int toneIdx, int partIdx)
{
    return abdmcx::wasm_internal::bankManager().loadToneToPart(
               bankSlot, toneIdx, abdmcx::wasm_internal::engine(), partIdx)
               ? 1
               : 0;
}

int loadIndexedKitOnDemand(int bankSlot, int kitIdx, int partIdx)
{
    return abdmcx::wasm_internal::bankManager().loadDrumKitToPart(
               bankSlot, kitIdx, abdmcx::wasm_internal::engine(), partIdx)
               ? 1
               : 0;
}

int collectUnusedWaves()
{
    return static_cast<int>(abdmcx::wasm_internal::engine().collectUnusedWaves());
}

} // extern "C"
