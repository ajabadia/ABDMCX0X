# Shared JUCE-free C++20 DSP & MIDI router sources for ABDMCX0X.
# Consumed identically by Native CMakeLists.txt and Emscripten wasm/CMakeLists.txt.

set(MCX_CORE_DSP_SOURCES
    Source/DSP/Core/McxEngine.cpp
    Source/DSP/Core/McxEngineAllocation.cpp
    Source/DSP/Core/McxEngineControl.cpp
    Source/DSP/FX/McxOutputAndFx.cpp
    Source/MIDI/HardwareMirrorRouter.cpp
    Source/Hardware/McxHardwareBridge.cpp
    Source/Hardware/McxHardwareInbound.cpp
    Source/Hardware/McxHardwareProfiles.cpp
    Source/Core/McxBankManagerBridge.cpp
    Source/Core/McxLibraryService.cpp
)
