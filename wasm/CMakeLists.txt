cmake_minimum_required(VERSION 3.22)
project(ABDMCX0X_WASM LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ============================================================
# ABDShared (WASM) — SynthCore, DspCore, DspEffects
# ============================================================
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../ABDShared/Code/CMakeLists.txt")
    set(ABDSHARED_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../ABDShared/Code")
    message(STATUS "ABDShared (WASM): Using canonical Code at ${ABDSHARED_CODE_DIR}")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../ABDSharedCode/CMakeLists.txt")
    set(ABDSHARED_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../ABDSharedCode")
    message(STATUS "ABDShared (WASM): Using legacy sibling at ${ABDSHARED_CODE_DIR}")
endif()

if(DEFINED ABDSHARED_CODE_DIR)
    set(ABDSHAREDCODE_BUILD_SYNTHCORE_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHAREDCODE_BUILD_AUTOUPDATER OFF CACHE BOOL "" FORCE)
    set(ABDSHAREDCODE_BUILD_HARDWAREDRIVERS OFF CACHE BOOL "" FORCE)
    set(ABDSHAREDCODE_BUILD_HARDWAREMIDIDETECT OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_SYNTHCORE_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_SYNTHENGINES_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_DSPCORE_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_DSPEFFECTS_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_AUTOUPDATER OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_HARDWAREDRIVERS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_HARDWAREMIDIDETECT OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_AUDIOCOMPARATOR OFF CACHE BOOL "" FORCE)
    add_subdirectory("${ABDSHARED_CODE_DIR}" "${CMAKE_BINARY_DIR}/ABDShared_build")
endif()

# Single-Source Anti-Drift: DspSources.cmake is shared identically with native builds
include("${CMAKE_CURRENT_LIST_DIR}/../DspSources.cmake")

list(TRANSFORM MCX_CORE_DSP_SOURCES PREPEND "../")

set(WASM_DSP_SOURCES
    ../Source/Wasm/WasmBridge.cpp
    ../Source/Wasm/WasmBankAndEngineBridge.cpp
    ../Source/Wasm/WasmSongBridge.cpp
    ../Source/Wasm/WasmRackBridge.cpp
    ${MCX_CORE_DSP_SOURCES}
)

add_executable(mcx0x_dsp ${WASM_DSP_SOURCES})

target_link_libraries(mcx0x_dsp PRIVATE 
    ABDShared::SynthEngines
    ABDShared::StructuredRompler
    ABDShared::SynthCore 
    ABDShared::DspCore 
    ABDShared::DspEffects
    ABDShared::DiagnosticProbe
)

target_include_directories(mcx0x_dsp PRIVATE
    ../Source
    ${ABDSHARED_CODE_DIR}
    ../Source/Core
    ../Source/DSP/Core
    ../Source/DSP/Synth
    ../Source/DSP/FX
    ../Source/MIDI
    ../Source/Hardware
    ../Source/Wasm
)

target_compile_definitions(mcx0x_dsp PRIVATE
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    __EMSCRIPTEN__=1
)

# Emscripten Compilation & Link Flags (-O2 keeps unminified imports/exports for AudioWorklet)
set_target_properties(mcx0x_dsp PROPERTIES
    OUTPUT_NAME "mcx0x_dsp"
    SUFFIX ".js"
    LINK_FLAGS "-s WASM=1 -s MALLOC=emmalloc -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=33554432 -s FILESYSTEM=0 -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','HEAPF32','HEAPU8'] -s EXPORTED_FUNCTIONS=['_initEngine','_processAudio','_noteOn','_noteOff','_allNotesOff','_setTempoBPM','_setPartParam','_setMasterVolume','_loadBankFromMemory','_getAudioSnapshot','_getPartPeaks','_getPartMidiPeaks','_resetToFactory','_setTransportPlaying','_setSequencerBars','_setPartGroove','_clearPartPattern','_addPartNote','_addPartMotionPoint','_commitPartPattern','_getSequencerState','_drainMidiOut','_getRegisteredEngineCount','_getPartEngineTypeIndex','_selectPartEngineType','_getPartEngineTypeId','_getPartFactoryPresetCount','_getPartFactoryPresetName','_loadPartFactoryPreset','_getPartCurrentPresetName','_setPartEngineParamByKey','_getPartEngineParamByKey','_getPartEngineStateJson','_indexBankFromMemory','_getIndexedBankToneCount','_getIndexedBankKitCount','_loadIndexedToneOnDemand','_loadIndexedKitOnDemand','_collectUnusedWaves','_triggerScene','_captureScene','_updateSceneSlot','_setSongModeEnabled','_setSongLoopEnabled','_jumpSongBlock','_clearSongBlocks','_addSongBlock','_commitSongBlocks','_getSongSceneTelemetry','_getSongScenesStateJson','_setRackSlotEngine','_setRackSlotName','_removeRackSlot','_moveRackSlot','_setRackSlotBypass','_setRackSlotParams','_setRackSlotParamByKey','_setRackSlotPreset','_setRackSlotDucking','_getRackSlotTelemetry','_getRackSlotsStateJson','_loadRackSlotsStateJson','_setPartInsertSlot','_getPartInsertSlot','_setSendSlotTarget','_getSendSlotTarget','_setSlotChainTarget','_getSlotChainTarget','_getAllRackSlotsTelemetry','_malloc','_free'] -O2"
)
