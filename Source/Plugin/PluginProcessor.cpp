#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace abdmcx {

McxAudioProcessor::McxAudioProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts_(*this, nullptr, "Parameters", createMcxParameterLayout()),
      hardwareBridge_(engine_, midiOutQueue_),
      bankManagerBridge_(engine_) {
    for (const auto& desc : kParameterDescriptors) {
        apvts_.addParameterListener(desc.id, this);
    }
}

McxAudioProcessor::~McxAudioProcessor() {
    for (const auto& desc : kParameterDescriptors) {
        apvts_.removeParameterListener(desc.id, this);
    }
}

bool McxAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()) {
        return false;
    }
    return true;
}

void McxAudioProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/) {
    engine_.prepare(sampleRate);
    compensator_.prepare(sampleRate);
}

void McxAudioProcessor::releaseResources() {
    engine_.reset();
}

void McxAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;

    const int totalNumOutputChannels = getTotalNumOutputChannels();
    const int numSamples = buffer.getNumSamples();

    for (int i = getTotalNumInputChannels(); i < totalNumOutputChannels; ++i) {
        buffer.clear(i, 0, numSamples);
    }

    // Ingest MIDI messages
    for (const auto metadata : midiMessages) {
        const auto msg = metadata.getMessage();
        if (msg.isNoteOn()) {
            engine_.triggerNote(msg.getChannel() - 1, msg.getNoteNumber(), msg.getFloatVelocity(), metadata.samplePosition);
        } else if (msg.isNoteOff()) {
            engine_.releaseNote(msg.getChannel() - 1, msg.getNoteNumber(), metadata.samplePosition);
        }
        hardwareBridge_.processMidiIn(msg);
    }

    // Render internal audio
    float* left = buffer.getWritePointer(0);
    float* right = totalNumOutputChannels > 1 ? buffer.getWritePointer(1) : left;
    engine_.processAudio(left, right, numSamples);

    if (compensator_.isEnabled()) {
        compensator_.processBlock(left, right, static_cast<size_t>(numSamples));
    }

    // Drain queued hardware mirror SysEx / MIDI messages into host output
    hardwareBridge_.drainOutputQueue(midiMessages, numSamples);
}

juce::AudioProcessorEditor* McxAudioProcessor::createEditor() {
    return new McxAudioProcessorEditor(*this);
}

void McxAudioProcessor::getStateInformation(juce::MemoryBlock& destData) {
    auto state = apvts_.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void McxAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts_.state.getType())) {
        apvts_.replaceState(juce::ValueTree::fromXml(*xmlState));
    }
}

void McxAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
    applyParameterToEngine(parameterID, newValue);
}

void McxAudioProcessor::applyParameterToEngine(const juce::String& paramId, float value) {
    if (paramId == ParamId::FocusedPartIndex) {
        focusedPartIndex_.store(static_cast<uint32_t>(value));
        engine_.setFocusedPart(static_cast<int>(focusedPartIndex_.load()));
        return;
    }
    if (paramId == ParamId::MasterVolumeDb) {
        engine_.setMasterVolume(dbToGain(value));
        return;
    }
    if (paramId == ParamId::OutputCharacter) {
        engine_.setOutputCharacter(static_cast<McxOutputCharacter>(static_cast<int>(value)));
        return;
    }
    if (paramId == ParamId::PartialBudgetMode) {
        int idx = static_cast<int>(value);
        engine_.setPartialBudget(idx == 1 ? 28 : (idx == 2 ? 64 : (idx == 3 ? 32 : 128)));
        return;
    }
    if (paramId == ParamId::MachinePersona) {
        engine_.setMachinePersona(static_cast<McxMachinePersona>(static_cast<int>(value)));
        return;
    }
    if (paramId == ParamId::PolyphonyVoices) {
        engine_.setMaxPolyphony(static_cast<int>(value));
        return;
    }

    // Apply to focused part proxy
    auto& p = engine_.part(static_cast<int>(focusedPartIndex_.load()));
    if (paramId == ParamId::PartRouteMode) p.routeMode = static_cast<McxPartRouteMode>(static_cast<int>(value));
    else if (paramId == ParamId::PartLevel) p.level = value;
    else if (paramId == ParamId::PartPan) p.pan = value;
    else if (paramId == ParamId::PartFilterModel) {
        p.filterModel = static_cast<McxFilterModel>(static_cast<int>(value));
        for (auto& partial : p.partials) partial.filterModel = p.filterModel;
    }
    else if (paramId == ParamId::TvfCutoffOffset) {
        for (auto& partial : p.partials) partial.cutoffHz = std::clamp(12000.0f + value * 100.0f, 20.0f, 20000.0f);
    }
    else if (paramId == ParamId::TvfResonanceOffset) {
        for (auto& partial : p.partials) partial.resonance = std::clamp(0.15f + value * 0.01f, 0.0f, 1.0f);
    }
    else if (paramId == ParamId::ZplaneMorph) {
        for (auto& partial : p.partials) partial.zplaneMorph = value;
    }
    else if (paramId == ParamId::PartReverbSend) p.reverbSend = value * 0.01f;
    else if (paramId == ParamId::PartChorusSend) p.chorusSend = value * 0.01f;
    else if (paramId == ParamId::VectorX) p.vectorX = value;
    else if (paramId == ParamId::VectorY) p.vectorY = value;
    else if (paramId == ParamId::DrumMapMode) p.drumMapMode = static_cast<McxDrumMapMode>(static_cast<int>(value));
}

} // namespace abdmcx

// JUCE Plugin Entry Point
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new abdmcx::McxAudioProcessor();
}
