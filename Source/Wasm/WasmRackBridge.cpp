#include "WasmBridge.h"
#include "WasmInternal.h"

#include <array>
#include <cstring>

namespace
{
char s_rackJsonBuffer[4096] {};
}

extern "C"
{

WASM_EXPORT int setRackSlotEngine(int slotIdx, int engineType, const char* customName)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotEngine(slotIdx, static_cast<abdmcx::McxRackEngineType>(engineType), customName);
    return 1;
}

WASM_EXPORT void setRackSlotName(int slotIdx, const char* customName)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotCustomName(slotIdx, customName);
}

WASM_EXPORT void removeRackSlot(int slotIdx)
{
    abdmcx::wasm_internal::engine().removeRackSlot(slotIdx);
}

WASM_EXPORT void moveRackSlot(int fromIdx, int toIdx)
{
    abdmcx::wasm_internal::engine().moveRackSlot(fromIdx, toIdx);
}

WASM_EXPORT void setRackSlotBypass(int slotIdx, int bypass)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotBypass(slotIdx, bypass != 0);
}

WASM_EXPORT void setRackSlotParams(int slotIdx, float p1, float p2, float mix)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotParams(slotIdx, p1, p2, mix);
}

WASM_EXPORT void setRackSlotParamByKey(int slotIdx, const char* key, float value)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotParamByKey(slotIdx, key ? key : "", value);
}

WASM_EXPORT void setRackSlotPreset(int slotIdx, int presetIdx)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotPreset(slotIdx, presetIdx);
}

WASM_EXPORT void setRackSlotDucking(int slotIdx, int enabled, float amount)
{
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.setSlotDucking(slotIdx, enabled != 0, amount);
}

WASM_EXPORT void getRackSlotTelemetry(int slotIdx, float* outPeaks4, int* outFlags3)
{
    if (!outPeaks4 || !outFlags3) return;
    const auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    const auto t = chassis.getSlotTelemetry(slotIdx);
    outPeaks4[0] = t.peakInL;
    outPeaks4[1] = t.peakInR;
    outPeaks4[2] = t.peakOutL;
    outPeaks4[3] = t.peakOutR;
    outFlags3[0] = t.isClipIn ? 1 : 0;
    outFlags3[1] = t.isClipOut ? 1 : 0;
    outFlags3[2] = t.isSleeping ? 1 : 0;
}

WASM_EXPORT const char* getRackSlotsStateJson()
{
    const auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    chassis.serializeJson(s_rackJsonBuffer, sizeof(s_rackJsonBuffer));
    return s_rackJsonBuffer;
}

WASM_EXPORT int loadRackSlotsStateJson(const char* jsonText)
{
    if (!jsonText) return 0;
    auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    return chassis.deserializeJson(jsonText) ? 1 : 0;
}

WASM_EXPORT void setPartInsertSlot(int partIdx, int slotIdx)
{
    abdmcx::wasm_internal::engine().setPartInsertSlot(partIdx, slotIdx);
}

WASM_EXPORT int getPartInsertSlot(int partIdx)
{
    return abdmcx::wasm_internal::engine().getPartInsertSlot(partIdx);
}

WASM_EXPORT void setSendSlotTarget(int busIdx, int slotIdx)
{
    abdmcx::wasm_internal::engine().getOutputAndFx().setSendSlotTarget(busIdx, slotIdx);
}

WASM_EXPORT int getSendSlotTarget(int busIdx)
{
    return abdmcx::wasm_internal::engine().getOutputAndFx().getSendSlotTarget(busIdx);
}

WASM_EXPORT void setSlotChainTarget(int slotIdx, int targetSlotIdx)
{
    abdmcx::wasm_internal::engine().getOutputAndFx().getChassis().setSlotChainTarget(slotIdx, targetSlotIdx);
}

WASM_EXPORT int getSlotChainTarget(int slotIdx)
{
    return abdmcx::wasm_internal::engine().getOutputAndFx().getChassis().getSlotChainTarget(slotIdx);
}

WASM_EXPORT void getAllRackSlotsTelemetry(float* outPeaks16, int* outFlags16)
{
    if (!outPeaks16 || !outFlags16) return;
    const auto& chassis = abdmcx::wasm_internal::engine().getOutputAndFx().getChassis();
    for (int i = 0; i < 8; ++i) {
        const auto t = chassis.getSlotTelemetry(i);
        outPeaks16[i] = std::max(t.peakInL, t.peakInR);
        outPeaks16[8 + i] = std::max(t.peakOutL, t.peakOutR);
        outFlags16[i] = t.isClipIn ? 1 : 0;
        outFlags16[8 + i] = t.isClipOut ? 1 : 0;
    }
}

}
