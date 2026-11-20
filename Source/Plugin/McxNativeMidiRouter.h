#pragma once

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_core/juce_core.h>

#include "../DSP/Core/McxEngine.h"
#include "../Hardware/McxHardwareBridge.h"
#include "../MIDI/HardwareMirrorRouter.h"
#include "../MIDI/McxMidiOutQueue.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstring>
#include <memory>
#include <string_view>
#include <utility>
#include <vector>

namespace abdmcx
{

/**
 * @brief Lock-free multi-port physical MIDI router exposing ONLY real OS devices.
 * Port 0 = DAW/Host MIDI bus (VST3); Ports 1..31 = real WinMM/CoreMIDI/ALSA devices.
 * Never opens OS ports eagerly on startup to avoid stealing hardware from the DAW host.
 */
class McxNativeMidiRouter final : private juce::Thread
{
public:
    static constexpr int kMaxPhysicalPorts = 31;

    McxNativeMidiRouter()
        : juce::Thread("McxNativeMidiOut")
    {
        for (int i = 0; i < kMaxPhysicalPorts; ++i)
        {
            inputs_[static_cast<std::size_t>(i)].portIndex = static_cast<std::uint8_t>(i + 1);
            outputs_[static_cast<std::size_t>(i)].portIndex = static_cast<std::uint8_t>(i + 1);
        }
        refreshDevices();
        startThread();
    }

    ~McxNativeMidiRouter() override
    {
        signalThreadShouldExit();
        stopThread(500);
        for (auto& slot : inputs_)
        {
            if (slot.device != nullptr) slot.device->stop();
            slot.device.reset();
        }
        const juce::ScopedLock sl(outDeviceLock_);
        for (auto& slot : outputs_)
            slot.device.reset();
    }

    McxNativeMidiRouter(const McxNativeMidiRouter&) = delete;
    McxNativeMidiRouter& operator=(const McxNativeMidiRouter&) = delete;

    void enqueueOutbound(const McxMidiOutMessage& msg) noexcept
    {
        (void)outboundQueue_.push(msg);
    }

    void drainInboundToEngine(McxEngine& engine, McxHardwareBridge& hwBridge) noexcept
    {
        const int nIn = std::clamp(inputCount_.load(std::memory_order_acquire), 0, kMaxPhysicalPorts);
        for (int idx = 0; idx < nIn; ++idx)
        {
            auto& slot = inputs_[static_cast<std::size_t>(idx)];
            McxMidiOutMessage msg {};
            while (slot.queue.pop(msg))
            {
                if (msg.length == 0) continue;
                const std::uint8_t status = msg.bytes[0];
                const int pIdx = static_cast<int>(slot.portIndex);
                if (msg.length >= 2 && status < 0xF0u)
                {
                    const int ch1to16 = static_cast<int>((status & 0x0Fu) + 1u);
                    const std::uint8_t kind = status & 0xF0u;
                    if (kind == 0x90u && msg.length >= 3 && msg.bytes[2] > 0)
                        engine.routeMidiPortChannelNoteOn(pIdx, ch1to16, msg.bytes[1], static_cast<float>(msg.bytes[2]) / 127.0f, 0);
                    else if (kind == 0x80u || (kind == 0x90u && msg.length >= 3 && msg.bytes[2] == 0))
                        engine.routeMidiPortChannelNoteOff(pIdx, ch1to16, msg.bytes[1], 0);
                    else if (kind == 0xB0u && msg.length >= 3)
                    {
                        const int cc = msg.bytes[1];
                        if (cc == 120 || cc == 123) engine.allNotesOff();
                        else engine.routeMidiPortChannelCc(pIdx, ch1to16, cc, msg.bytes[2]);
                    }
                }
                hwBridge.processInboundMidiBuffer(msg.bytes, msg.length, false, pIdx);
            }
        }
    }

    void refreshDevices()
    {
        const auto availIn = juce::MidiInput::getAvailableDevices();
        const auto availOut = juce::MidiOutput::getAvailableDevices();

        std::vector<juce::String> openInIds;
        for (int i = 0; i < inputCount_.load(std::memory_order_relaxed); ++i)
        {
            auto& s = inputs_[static_cast<std::size_t>(i)];
            if (s.enabled && s.device != nullptr) openInIds.push_back(s.info.identifier);
            if (s.device != nullptr) s.device->stop();
            s.device.reset();
            s.enabled = false;
        }
        const int nextInCount = std::min<int>(availIn.size(), kMaxPhysicalPorts);
        for (int i = 0; i < nextInCount; ++i)
        {
            auto& s = inputs_[static_cast<std::size_t>(i)];
            s.portIndex = static_cast<std::uint8_t>(i + 1);
            s.info = availIn[i];
            if (std::find(openInIds.begin(), openInIds.end(), s.info.identifier) != openInIds.end())
            {
                s.device = juce::MidiInput::openDevice(s.info.identifier, &s);
                if (s.device != nullptr) { s.device->start(); s.enabled = true; }
            }
        }
        inputCount_.store(nextInCount, std::memory_order_release);

        const juce::ScopedLock sl(outDeviceLock_);
        std::vector<std::pair<juce::String, std::unique_ptr<juce::MidiOutput>>> openOuts;
        for (int i = 0; i < outputCount_; ++i)
        {
            auto& s = outputs_[static_cast<std::size_t>(i)];
            if (s.enabled && s.device != nullptr) openOuts.emplace_back(s.info.identifier, std::move(s.device));
            s.device.reset();
            s.enabled = false;
        }
        outputCount_ = std::min<int>(availOut.size(), kMaxPhysicalPorts);
        bool anyOpen = false;
        for (int i = 0; i < outputCount_; ++i)
        {
            auto& s = outputs_[static_cast<std::size_t>(i)];
            s.portIndex = static_cast<std::uint8_t>(i + 1);
            s.info = availOut[i];
            for (auto& kv : openOuts)
            {
                if (kv.first == s.info.identifier && kv.second != nullptr)
                {
                    s.device = std::move(kv.second);
                    s.enabled = true;
                    anyOpen = true;
                    break;
                }
            }
        }
        anyOutputOpen_.store(anyOpen, std::memory_order_release);
    }

    bool setInputEnabled(const juce::String& id, bool enabled)
    {
        const int nIn = inputCount_.load(std::memory_order_acquire);
        for (int i = 0; i < nIn; ++i)
        {
            auto& s = inputs_[static_cast<std::size_t>(i)];
            if (s.info.identifier != id) continue;
            if (!enabled)
            {
                if (s.device != nullptr) s.device->stop();
                s.device.reset();
                s.enabled = false;
                return true;
            }
            if (s.device == nullptr)
                s.device = juce::MidiInput::openDevice(s.info.identifier, &s);
            if (s.device != nullptr)
            {
                s.device->start();
                s.enabled = true;
                return true;
            }
            return false;
        }
        return false;
    }

    bool setOutputEnabled(const juce::String& id, bool enabled)
    {
        const juce::ScopedLock sl(outDeviceLock_);
        bool ok = false;
        for (int i = 0; i < outputCount_; ++i)
        {
            auto& s = outputs_[static_cast<std::size_t>(i)];
            if (s.info.identifier != id) continue;
            if (!enabled) { s.device.reset(); s.enabled = false; ok = true; }
            else
            {
                if (s.device == nullptr) s.device = juce::MidiOutput::openDevice(s.info.identifier);
                s.enabled = (s.device != nullptr);
                ok = s.enabled;
            }
            break;
        }
        updateAnyOutputFlag();
        return ok;
    }

    bool ensureInputOpenByPortIndex(int portIndex)
    {
        const int idx = portIndex - 1;
        if (idx < 0 || idx >= inputCount_.load(std::memory_order_acquire)) return false;
        return setInputEnabled(inputs_[static_cast<std::size_t>(idx)].info.identifier, true);
    }

    bool ensureOutputOpenByPortIndex(int portIndex)
    {
        if (portIndex < 1 || portIndex > outputCount_) return false;
        return setOutputEnabled(outputs_[static_cast<std::size_t>(portIndex - 1)].info.identifier, true);
    }

    void reconcileEngineDeviceNames(McxEngine& engine)
    {
        refreshDevices();
        for (int i = 0; i < McxEngine::kNumParts; ++i)
        {
            auto& p = engine.part(i);
            if (p.midiOutDeviceName[0] != '\0')
            {
                const int found = findOutputPortByName(p.midiOutDeviceName);
                if (found >= 1) p.midiPortIndex = static_cast<std::uint8_t>(found);
            }
            if (p.midiInDeviceName[0] != '\0')
            {
                const int found = findInputPortByName(p.midiInDeviceName);
                if (found >= 1) p.midiInPortIndex = static_cast<std::int16_t>(found);
            }
            if (p.enabled && p.midiPortIndex >= 1 && HardwareMirrorRouter::routesToExternal(p.routeMode))
                (void)ensureOutputOpenByPortIndex(p.midiPortIndex);
            if (p.enabled && p.midiInPortIndex >= 1)
                (void)ensureInputOpenByPortIndex(p.midiInPortIndex);
        }
    }

    juce::var buildDevicesPayload(bool isStandalone) const
    {
        juce::DynamicObject::Ptr root = new juce::DynamicObject();
        root->setProperty("type", "midiDevices");
        root->setProperty("isStandalone", isStandalone);

        juce::Array<juce::var> inArr, outArr;
        const int nIn = std::clamp(inputCount_.load(std::memory_order_acquire), 0, kMaxPhysicalPorts);
        for (int i = 0; i < nIn; ++i)
        {
            const auto& s = inputs_[static_cast<std::size_t>(i)];
            juce::DynamicObject::Ptr o = new juce::DynamicObject();
            o->setProperty("portIndex", static_cast<int>(s.portIndex));
            o->setProperty("id", s.info.identifier);
            o->setProperty("name", s.info.name);
            o->setProperty("enabled", s.enabled);
            inArr.add(juce::var(o.get()));
        }
        const juce::ScopedLock sl(outDeviceLock_);
        for (int i = 0; i < outputCount_; ++i)
        {
            const auto& s = outputs_[static_cast<std::size_t>(i)];
            juce::DynamicObject::Ptr o = new juce::DynamicObject();
            o->setProperty("portIndex", static_cast<int>(s.portIndex));
            o->setProperty("id", s.info.identifier);
            o->setProperty("name", s.info.name);
            o->setProperty("enabled", s.enabled);
            outArr.add(juce::var(o.get()));
        }
        root->setProperty("inputs", inArr);
        root->setProperty("outputs", outArr);
        return juce::var(root.get());
    }

private:
    struct InputSlot final : public juce::MidiInputCallback
    {
        McxMidiOutQueue<256> queue {};
        std::uint8_t portIndex { 1 };
        juce::MidiDeviceInfo info {};
        std::unique_ptr<juce::MidiInput> device;
        bool enabled { false };

        void handleIncomingMidiMessage(juce::MidiInput*, const juce::MidiMessage& msg) override
        {
            const int sz = msg.getRawDataSize();
            if (sz <= 0 || sz > static_cast<int>(sizeof(McxMidiOutMessage::bytes))) return;
            McxMidiOutMessage m {};
            m.portIndex = portIndex;
            m.priority = (sz == 1 && msg.getRawData()[0] >= 0xF8u) ? 0 : 1;
            m.length = static_cast<std::uint8_t>(sz);
            std::memcpy(m.bytes, msg.getRawData(), static_cast<std::size_t>(sz));
            (void)queue.push(m);
        }
    };

    struct OutputSlot
    {
        std::uint8_t portIndex { 1 };
        juce::MidiDeviceInfo info {};
        std::unique_ptr<juce::MidiOutput> device;
        bool enabled { false };
    };

    void run() override
    {
        while (!threadShouldExit())
        {
            McxMidiOutMessage msg {};
            bool processed = false;
            if (outboundQueue_.pop(msg))
            {
                processed = true;
                dispatchOutbound(msg);
                while (!threadShouldExit() && outboundQueue_.pop(msg))
                    dispatchOutbound(msg);
            }
            wait(processed ? 1 : (anyOutputOpen_.load(std::memory_order_relaxed) ? 2 : 15));
        }
    }

    void dispatchOutbound(const McxMidiOutMessage& msg)
    {
        if (msg.length == 0 || msg.length > sizeof(msg.bytes)) return;
        const juce::MidiMessage jmsg(msg.bytes, static_cast<int>(msg.length));
        const bool isRealtime = (msg.length == 1 && msg.bytes[0] >= 0xF8u);
        const juce::ScopedLock sl(outDeviceLock_);
        if (isRealtime)
        {
            for (int i = 0; i < outputCount_; ++i)
            {
                auto& s = outputs_[static_cast<std::size_t>(i)];
                if (s.enabled && s.device != nullptr) s.device->sendMessageNow(jmsg);
            }
        }
        else if (msg.portIndex >= 1 && static_cast<int>(msg.portIndex) <= outputCount_)
        {
            auto& s = outputs_[static_cast<std::size_t>(msg.portIndex - 1)];
            if (s.enabled && s.device != nullptr) s.device->sendMessageNow(jmsg);
        }
    }

    void updateAnyOutputFlag() noexcept
    {
        bool any = false;
        for (int i = 0; i < outputCount_; ++i)
            if (outputs_[static_cast<std::size_t>(i)].enabled) { any = true; break; }
        anyOutputOpen_.store(any, std::memory_order_release);
    }

    int findOutputPortByName(std::string_view name) const
    {
        const juce::ScopedLock sl(outDeviceLock_);
        for (int i = 0; i < outputCount_; ++i)
            if (outputs_[static_cast<std::size_t>(i)].info.name.toStdString() == name)
                return static_cast<int>(outputs_[static_cast<std::size_t>(i)].portIndex);
        return -1;
    }

    int findInputPortByName(std::string_view name) const
    {
        const int nIn = std::clamp(inputCount_.load(std::memory_order_acquire), 0, kMaxPhysicalPorts);
        for (int i = 0; i < nIn; ++i)
            if (inputs_[static_cast<std::size_t>(i)].info.name.toStdString() == name)
                return static_cast<int>(inputs_[static_cast<std::size_t>(i)].portIndex);
        return -1;
    }

    McxMidiOutQueue<2048> outboundQueue_;
    std::array<InputSlot, kMaxPhysicalPorts> inputs_ {};
    std::atomic<int> inputCount_ { 0 };
    std::array<OutputSlot, kMaxPhysicalPorts> outputs_ {};
    int outputCount_ { 0 };
    std::atomic<bool> anyOutputOpen_ { false };
    juce::CriticalSection outDeviceLock_;
};

} // namespace abdmcx
