# Shared JUCE-free C++20 DSP & MIDI router sources for ABDMCX0X.
# Consumed identically by Native CMakeLists.txt and Emscripten wasm/CMakeLists.txt.

set(MCX_CORE_DSP_SOURCES
    Source/DSP/Core/McxEngine.cpp
    Source/DSP/Core/McxEngineAllocation.cpp
    Source/DSP/Synth/McxEnvelope5Stage.cpp
    Source/DSP/Synth/McxFilterBank.cpp
    Source/DSP/Synth/McxPartialExciter.cpp
    Source/DSP/Synth/McxVoice.cpp
    Source/DSP/FX/McxOutputAndFx.cpp
    Source/MIDI/HardwareMirrorRouter.cpp
    Source/Hardware/McxHardwareBridge.cpp
    Source/Hardware/McxHardwareInbound.cpp
    Source/Hardware/McxHardwareProfiles.cpp
    Source/Core/McxBankManagerBridge.cpp
    Source/Core/McxBankLoader.cpp
    Source/Core/McxFactoryBank.cpp
)
