#pragma once

#include "../Core/McxMultiBankManager.h"
#include "../DSP/Core/McxEngine.h"

namespace abdmcx::wasm_internal
{

McxEngine& engine() noexcept;
McxMultiBankManager& bankManager() noexcept;
double sampleRate() noexcept;

} // namespace abdmcx::wasm_internal
