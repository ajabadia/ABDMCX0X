#pragma once

#include "PluginProcessor.h"
#include "McxPatternJsonAdapter.h"
#include <juce_core/juce_core.h>

namespace abdmcx
{

/**
 * @brief Builds WebView2 telemetry payload (audio + MIDI peaks + sequencer clock mirror).
 */
inline juce::var buildTelemetryPayload(const McxTelemetrySnapshot& snap)
{
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "telemetry");
    payload->setProperty("peakL", snap.peakL);
    payload->setProperty("peakR", snap.peakR);
    payload->setProperty("peakSendA", snap.peakSendA);
    payload->setProperty("peakSendB", snap.peakSendB);
    payload->setProperty("peakSendC", snap.peakSendC);
    payload->setProperty("peakSendD", snap.peakSendD);
    payload->setProperty("limiterGrDb", snap.limiterGrDb);
    payload->setProperty("activeVoices", snap.activeVoices);
    payload->setProperty("focusedPart", snap.focusedPart);
    payload->setProperty("sampleRate", snap.sampleRate);
    payload->setProperty("lfoPhase", snap.lfoPhase);
    payload->setProperty("lfo2Phase", snap.lfo2Phase);
    payload->setProperty("seqPlaying", snap.seqPlaying);
    payload->setProperty("seqPaused", snap.seqPaused);
    payload->setProperty("seqCountInTicks", snap.seqCountInTicks);
    payload->setProperty("seqRecRev", static_cast<int>(snap.seqRecRev));
    payload->setProperty("seqTick", snap.seqTick);
    payload->setProperty("seqStep", snap.seqStep);
    payload->setProperty("seqTotalTicks", snap.seqTotalTicks);
    payload->setProperty("bpm", snap.bpm);
    payload->setProperty("activeScene", snap.activeScene);
    payload->setProperty("queuedScene", snap.queuedScene);
    payload->setProperty("songMode", snap.songMode);
    payload->setProperty("songLoop", snap.songLoop);
    payload->setProperty("songBlockIdx", snap.songBlockIdx);
    payload->setProperty("songBarInBlock", snap.songBarInBlock);
    payload->setProperty("songBlockCount", snap.songBlockCount);
    payload->setProperty("sceneApplySeq", static_cast<int>(snap.sceneApplySeq));
    payload->setProperty("appliedMuteMask", static_cast<int>(snap.appliedMuteMask & 0xFFFFull));
    juce::Array<juce::var> mask64;
    mask64.add(static_cast<int>((snap.appliedMuteMask >> 0) & 0xFFFFull));
    mask64.add(static_cast<int>((snap.appliedMuteMask >> 16) & 0xFFFFull));
    mask64.add(static_cast<int>((snap.appliedMuteMask >> 32) & 0xFFFFull));
    mask64.add(static_cast<int>((snap.appliedMuteMask >> 48) & 0xFFFFull));
    payload->setProperty("appliedMuteMask64", mask64);
    payload->setProperty("appliedTranspose", snap.appliedTranspose);
    payload->setProperty("muteQuantizeBar", snap.muteQuantizeBar);
    payload->setProperty("muteApplySeq", static_cast<int>(snap.muteApplySeq));
    payload->setProperty("appliedBankMuteMask", static_cast<int>(snap.appliedBankMuteMask));
    payload->setProperty("queuedBankMuteMask", static_cast<int>(snap.queuedBankMuteMask));
    juce::Array<juce::var> qMask64;
    qMask64.add(static_cast<int>((snap.queuedPartMuteMask >> 0) & 0xFFFFull));
    qMask64.add(static_cast<int>((snap.queuedPartMuteMask >> 16) & 0xFFFFull));
    qMask64.add(static_cast<int>((snap.queuedPartMuteMask >> 32) & 0xFFFFull));
    qMask64.add(static_cast<int>((snap.queuedPartMuteMask >> 48) & 0xFFFFull));
    payload->setProperty("queuedPartMuteMask64", qMask64);

    juce::Array<juce::var> mutes;
    for (bool m : snap.sendBusMutes) mutes.add(m);
    payload->setProperty("sendBusMutes", mutes);

    juce::DynamicObject::Ptr labels = new juce::DynamicObject();
    labels->setProperty("sendA", juce::String(snap.sendNameA));
    labels->setProperty("sendB", juce::String(snap.sendNameB));
    labels->setProperty("sendC", juce::String(snap.sendNameC));
    labels->setProperty("sendD", juce::String(snap.sendNameD));
    payload->setProperty("sendLabels", juce::var(labels.get()));

    juce::Array<juce::var> samples;
    samples.ensureStorageAllocated(128);
    for (float s : snap.samplesL) samples.add(s);
    payload->setProperty("samplesL", samples);

    juce::Array<juce::var> pPeaks;
    pPeaks.ensureStorageAllocated(McxEngine::kNumParts);
    for (float p : snap.partPeaks) pPeaks.add(p);
    payload->setProperty("partPeaks", pPeaks);

    juce::Array<juce::var> pMidiPeaks;
    pMidiPeaks.ensureStorageAllocated(McxEngine::kNumParts);
    for (float mp : snap.partMidiPeaks) pMidiPeaks.add(mp);
    payload->setProperty("partMidiPeaks", pMidiPeaks);

    juce::Array<juce::var> rPeakIn, rPeakOut, rClipIn, rClipOut;
    for (int i = 0; i < 8; ++i) {
        rPeakIn.add(snap.rackPeakIn[static_cast<std::size_t>(i)]);
        rPeakOut.add(snap.rackPeakOut[static_cast<std::size_t>(i)]);
        rClipIn.add(snap.rackClipIn[static_cast<std::size_t>(i)]);
        rClipOut.add(snap.rackClipOut[static_cast<std::size_t>(i)]);
    }
    payload->setProperty("rackPeakIn", rPeakIn);
    payload->setProperty("rackPeakOut", rPeakOut);
    payload->setProperty("rackClipIn", rClipIn);
    payload->setProperty("rackClipOut", rClipOut);

    return juce::var(payload.get());
}

/**
 * @brief Dispatches WebView2 sequencer & transport messages cleanly into McxAudioProcessor.
 */
inline bool handleSequencerJsEvent(McxAudioProcessor& proc, const juce::String& type, const juce::DynamicObject& obj)
{
    if (type == "setTransport")
    {
        proc.enqueueTransportPlay(static_cast<bool>(obj.getProperty("playing")),
                                  !obj.hasProperty("reset") || static_cast<bool>(obj.getProperty("reset")));
        return true;
    }
    if (type == "setHostSync")
    {
        proc.engine().setHostSyncEnabled(static_cast<bool>(obj.getProperty("enabled")));
        return true;
    }
    if (type == "seqSeekBars")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SeqSeekBars;
        cmd.paramId = static_cast<std::int16_t>(std::clamp<int>(static_cast<int>(obj.getProperty("deltaBars")), -64, 64));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "seqReturnToZero")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SeqReturnToZero;
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setSeqRecordConfig")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetSeqRecordConfig;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("mode")), 0, 1));
        cmd.argU8b = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("countInBars")), 0, 2));
        cmd.paramId = static_cast<std::int16_t>(std::clamp<int>(static_cast<int>(obj.getProperty("quantizeSteps")), 0, 64));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setSequencerBars")
    {
        proc.enqueueSequencerBars(static_cast<int>(obj.getProperty("bars")));
        return true;
    }
    if (type == "setGroove")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        const int mode = obj.getProperty("mode").isString()
            ? detail::mapGrooveMode(obj.getProperty("mode").toString())
            : static_cast<int>(obj.getProperty("mode"));
        const int algo = obj.getProperty("algorithm").isString()
            ? detail::mapGrooveAlgorithm(obj.getProperty("algorithm").toString())
            : static_cast<int>(obj.getProperty("algorithm"));
        const int res = (obj.getProperty("resolution").toString() == "1/8") ? 1 : static_cast<int>(obj.getProperty("resolution"));
        const float amt = static_cast<float>(obj.getProperty("amount"));
        proc.enqueueSequencerGroove(part, mode, algo, res, amt);
        return true;
    }
    if (type == "setPattern")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        proc.uploadPartPattern(part, obj);
        return true;
    }
    return false;
}

} // namespace abdmcx
