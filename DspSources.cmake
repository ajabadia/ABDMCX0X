# Shared JUCE-free C++20 DSP & MIDI router sources for ABDMCX0X.
# Consumed identically by Native CMakeLists.txt and Emscripten wasm/CMakeLists.txt.

set(MCX_CORE_DSP_SOURCES
    Source/DSP/Core/McxEngine.cpp
    Source/DSP/Core/McxEngineAllocation.cpp
    Source/DSP/Core/McxEngineControl.cpp
    Source/DSP/Core/McxEngineMultiEngine.cpp
    Source/DSP/Core/McxEngineRegistry.cpp
    Source/DSP/FX/McxOutputAndFx.cpp
    Source/DSP/FX/McxRackChassis.cpp
    Source/DSP/FX/McxRackChassisJson.cpp
    Source/DSP/FX/McxRackChassisParams.cpp
    Source/Sequencer/McxPatternSequencer.cpp
    Source/Sequencer/McxPatternSequencerPlayback.cpp
    Source/Sequencer/McxPatternSequencerRecord.cpp
    Source/Sequencer/McxEngineSequencer.cpp
    Source/Sequencer/McxSongAndScenes.cpp
    Source/MIDI/HardwareMirrorRouter.cpp
    Source/Hardware/McxHardwareBridge.cpp
    Source/Hardware/McxHardwareInbound.cpp
    Source/Hardware/McxHardwareProfiles.cpp
    Source/Core/McxBankManagerBridge.cpp
    Source/Core/McxMultiBankManager.cpp
    Source/Core/McxLibraryService.cpp
    Source/Core/McxLibraryBankScanner.cpp
)
