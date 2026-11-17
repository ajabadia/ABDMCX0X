cmake_minimum_required(VERSION 3.22)

if(APPLE AND NOT CMAKE_OSX_ARCHITECTURES)
    set(CMAKE_OSX_ARCHITECTURES "x86_64;arm64" CACHE STRING "Build Universal Binary for macOS" FORCE)
endif()

project(ABDMCX0X VERSION 0.1.0 LANGUAGES C CXX)

enable_testing()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(MCX_HEADLESS_ONLY "Build only headless C++20 core and unit tests (no JUCE dependency)" ON)

# ==============================================================================
# Shared Infrastructure Discovery: ABDShared & ABDBankManager
# ==============================================================================
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../ABDShared/Code/CMakeLists.txt")
    set(ABDSHARED_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ABDShared/Code")
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../ABDBankManager/cpp/CMakeLists.txt" AND NOT MCX_HEADLESS_ONLY)
    set(ABDBANKMANAGER_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ABDBankManager")
    add_subdirectory("${ABDBANKMANAGER_DIR}/cpp" "${CMAKE_BINARY_DIR}/ABDBankManagerCore")
    set(ABDSHAREDCODE_SKIP_ADD_SUBDIRECTORY ON CACHE INTERNAL "" FORCE)
endif()

if(NOT ABDSHAREDCODE_SKIP_ADD_SUBDIRECTORY AND DEFINED ABDSHARED_CODE_DIR)
    set(ABDSHARED_BUILD_DSPCORE_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_SYNTHCORE_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_DSPEFFECTS_TESTS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_AUTOUPDATER OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_HARDWAREDRIVERS OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_HARDWAREMIDIDETECT OFF CACHE BOOL "" FORCE)
    set(ABDSHARED_BUILD_AUDIOCOMPARATOR OFF CACHE BOOL "" FORCE)
    add_subdirectory("${ABDSHARED_CODE_DIR}" "${CMAKE_BINARY_DIR}/ABDShared_build")
endif()

include("${CMAKE_CURRENT_SOURCE_DIR}/DspSources.cmake")

# ==============================================================================
# Headless C++20 Core Library & Phase 0 Verification Target
# ==============================================================================
add_library(ABDMCX0X_Core STATIC ${MCX_CORE_DSP_SOURCES})
target_include_directories(ABDMCX0X_Core PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/Source"
    "${ABDSHARED_CODE_DIR}"
)
target_compile_features(ABDMCX0X_Core PUBLIC cxx_std_20)
target_link_libraries(ABDMCX0X_Core PUBLIC ABDShared::SynthCore ABDShared::DspCore ABDShared::DspEffects)

add_executable(McxPhase0Tests Tests/McxPhase0Tests.cpp)
target_link_libraries(McxPhase0Tests PRIVATE ABDMCX0X_Core)
add_test(NAME McxPhase0Tests COMMAND McxPhase0Tests)

add_executable(McxPhase1Tests Tests/McxPhase1Tests.cpp)
target_link_libraries(McxPhase1Tests PRIVATE ABDMCX0X_Core)
add_test(NAME McxPhase1Tests COMMAND McxPhase1Tests)

add_executable(McxPhase2Tests Tests/McxPhase2Tests.cpp)
target_link_libraries(McxPhase2Tests PRIVATE ABDMCX0X_Core)
add_test(NAME McxPhase2Tests COMMAND McxPhase2Tests)

add_executable(McxPhase3Tests Tests/McxPhase3Tests.cpp)
target_link_libraries(McxPhase3Tests PRIVATE ABDMCX0X_Core)
add_test(NAME McxPhase3Tests COMMAND McxPhase3Tests)

# ==============================================================================
# Full JUCE 9 + Windows WebView2 Static Linking Plugin Targets (Phase 3+)
# ==============================================================================
if(NOT MCX_HEADLESS_ONLY)
    if(WIN32)
        set(JUCE_USE_WIN_WEBVIEW2 ON CACHE BOOL "Use WebView2 on Windows" FORCE)
        if(NOT DEFINED JUCE_WEBVIEW2_PACKAGE_LOCATION)
            if(DEFINED WEBVIEW2_PACKAGE_DIR AND EXISTS "${WEBVIEW2_PACKAGE_DIR}")
                set(JUCE_WEBVIEW2_PACKAGE_LOCATION "${WEBVIEW2_PACKAGE_DIR}" CACHE PATH "WebView2 package location")
            elseif(DEFINED ENV{WEBVIEW2_PACKAGE_LOCATION} AND EXISTS "$ENV{WEBVIEW2_PACKAGE_LOCATION}")
                set(JUCE_WEBVIEW2_PACKAGE_LOCATION "$ENV{WEBVIEW2_PACKAGE_LOCATION}" CACHE PATH "WebView2 package location")
            elseif(DEFINED ENV{USERPROFILE} AND EXISTS "$ENV{USERPROFILE}/AppData/Local/PackageManagement/NuGet/Packages")
                set(JUCE_WEBVIEW2_PACKAGE_LOCATION "$ENV{USERPROFILE}/AppData/Local/PackageManagement/NuGet/Packages" CACHE PATH "WebView2 package location")
            endif()
        endif()
    endif()

    if(NOT DEFINED JUCE_PATH)
        if(DEFINED ENV{JUCE_PATH} AND EXISTS "$ENV{JUCE_PATH}/CMakeLists.txt")
            set(JUCE_PATH "$ENV{JUCE_PATH}")
        elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../ABDEep/JUCE/CMakeLists.txt")
            set(JUCE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../ABDEep/JUCE")
        elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../ABDMS2000/GITS/JUCE/CMakeLists.txt")
            set(JUCE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../ABDMS2000/GITS/JUCE")
        elseif(EXISTS "C:/JUCE/CMakeLists.txt")
            set(JUCE_PATH "C:/JUCE")
        endif()
    endif()

    if(EXISTS "${JUCE_PATH}/CMakeLists.txt")
        add_subdirectory("${JUCE_PATH}" juce)
    else()
        find_package(JUCE 9 CONFIG REQUIRED)
    endif()

    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/Source/Plugin/PluginProcessor.cpp")
        juce_add_plugin(ABDMCX0X
            COMPANY_NAME "ABDSynths"
            PLUGIN_MANUFACTURER_CODE ABDS
            PLUGIN_CODE MCXX
            FORMATS Standalone VST3
            IS_SYNTH TRUE
            NEEDS_MIDI_INPUT TRUE
            NEEDS_MIDI_OUTPUT TRUE
            PRODUCT_NAME "ABDMCX0X"
            NEEDS_WEBVIEW2 TRUE
        )
        target_sources(ABDMCX0X PRIVATE
            Source/Plugin/PluginProcessor.cpp
            Source/Plugin/PluginEditor.cpp
        )
        target_include_directories(ABDMCX0X PUBLIC
            "${CMAKE_CURRENT_SOURCE_DIR}/Source"
            "${ABDSHARED_CODE_DIR}"
        )
        target_link_libraries(ABDMCX0X PRIVATE
            ABDMCX0X_Core
            ABDShared::WebView2Bridge
            juce::juce_audio_utils
            juce::juce_audio_processors
            juce::juce_gui_extra
        )
        if(WIN32)
            target_compile_definitions(ABDMCX0X PUBLIC
                JUCE_USE_WIN_WEBVIEW2=1
                JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
            )
        endif()
    endif()
endif()
