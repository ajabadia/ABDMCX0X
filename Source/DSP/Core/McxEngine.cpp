#include "McxEngine.h"
#include "../../Core/McxFactoryBank.h"
#include "../../Sequencer/McxPatternSequencer.h"
#include "../../Sequencer/McxSongAndScenes.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxEngine::onRomplerVoiceStolen(void* userData, int ownerSlot, int drumSlotNote) noexcept
{
    auto* self = static_cast<McxEngine*>(userData);
    if (self == nullptr || ownerSlot < 0 || ownerSlot >= kNumParts || drumSlotNote < 0 || drumSlotNote >= 128)
        return;
    self->parts_[static_cast<std::size_t>(ownerSlot)].drumSlots[static_cast<std::size_t>(drumSlotNote)].activeSounding = false;
}

McxEngine::McxEngine() noexcept
{
    engineRegistry_.romplerPool().setVoiceStolenCallback(&McxEngine::onRomplerVoiceStolen, this);
    partEngineTypeIdx_.fill(McxEngineRegistry::kRomplerTypeIndex);
    initSequencer();

    for (int i = 0; i < kNumParts; ++i)
    {
        auto& rompler = engineRegistry_.rompler(i);
        engineSlots_[static_cast<std::size_t>(i)] = &rompler;
        cacheSemanticDestIds(i);

        parts_.emplace_back(rompler);
        auto& p = parts_.back();
        p.midiChannel = static_cast<std::uint8_t>(i + 1);
        p.partials[0].enabled = true;
        p.drumRemapper.initIdentity();
        p.latchedNoteMap.fill(-1);
    }
    partMidiPeaks_.fill(0.0f);

    McxFactoryBank::applyFactoryDefaults(*this);
    for (int i = 0; i < kNumParts; ++i)
    {
        parts_[static_cast<std::size_t>(i)].enabled = true;
        setPartKind(i, (i == 9) ? McxPartKind::DrumMap : McxPartKind::Chromatic);
    }
}

void McxEngine::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    prepared_ = true;
    engineRegistry_.prepare(sampleRate_, McxOutputAndFx::kMaxChunk);
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto idx = static_cast<std::size_t>(i);
        parts_[idx].arp.prepare(sampleRate_);
        if (engineSlots_[idx] != nullptr && engineRegistry_.findTypeIndexForInstance(engineSlots_[idx]) < 0)
            engineSlots_[idx]->prepare(sampleRate_, McxOutputAndFx::kMaxChunk);
        channelStrips_[idx].prepare(sampleRate_);
    }
    outputAndFx_.prepare(sampleRate_);
    diagProbe_.prepare(sampleRate_);
    diagFilter_.prepare(sampleRate_);
    prepareSequencer(sampleRate_);
    reset();
}

void McxEngine::reset() noexcept
{
    fxTailSamplesLeft_ = 0;
    fxGates_.fill(false); fxTempoSync_ = true; manualDuckGate_ = false;
    lfoPhase01_.fill(0.0f); lfoValueBipolar_.fill(0.0f);
    partMidiPeaks_.fill(0.0f);
    mirrorRouter_.clear();
    outputAndFx_.reset();
    diagProbe_.reset();
    diagFilter_.reset();
    engineRegistry_.reset();
    resetSequencer();
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto idx = static_cast<std::size_t>(i);
        if (engineSlots_[idx] != nullptr && engineRegistry_.findTypeIndexForInstance(engineSlots_[idx]) < 0)
            engineSlots_[idx]->reset();
        modRouters_[idx].clearDirectOffsets();
        lastSemanticOffsets_[idx] = McxTrackSemanticOffsets {};
        channelStrips_[idx].reset();
        auto& p = parts_[idx];
        p.arp.reset();
        p.latchedNoteMap.fill(-1);
        for (auto& slot : p.drumSlots)
            slot.activeSounding = false;
    }
    (void)engineRegistry_.collectUnusedWaves();
}

void McxEngine::processAudio(float* left, float* right, int numSamples) noexcept
{
    if (!left || !right || numSamples <= 0)
        return;

    std::fill_n(left, numSamples, 0.0f);
    std::fill_n(right, numSamples, 0.0f);
    std::fill(partPeaks_.begin(), partPeaks_.end(), 0.0f);

    int offset = 0;
    while (offset < numSamples)
    {
        const int chunk = std::min(McxOutputAndFx::kMaxChunk, numSamples - offset);
        advanceFocusedLfoTelemetry(chunk);
        processSequencerAndClock(chunk, offset);
        for (int partIdx = 0; partIdx < kNumParts; ++partIdx)
        {
            auto& p = parts_[static_cast<std::size_t>(partIdx)];
            if (!p.enabled || !p.arp.isEnabled())
                continue;
            p.arp.generate(chunk, [this, partIdx, offset](const abd::synth::GrooveArpeggiator::NoteEvent& ev) {
                if (ev.isNoteOn)
                    dispatchNoteOnToOutputs(partIdx, ev.note, ev.velocity, std::max(accentAmount_, std::clamp((ev.velocity - 0.85f) * 3.0f, 0.0f, 1.0f)), offset + ev.sampleOffset);
                else
                    dispatchNoteOffToOutputs(partIdx, ev.note, offset + ev.sampleOffset);
            });
        }
        std::fill_n(dryL_.data(), chunk, 0.0f);
        std::fill_n(dryR_.data(), chunk, 0.0f);
        std::fill_n(choL_.data(), chunk, 0.0f);
        std::fill_n(choR_.data(), chunk, 0.0f);
        std::fill_n(revL_.data(), chunk, 0.0f);
        std::fill_n(revR_.data(), chunk, 0.0f);
        std::fill_n(delL_.data(), chunk, 0.0f);
        std::fill_n(delR_.data(), chunk, 0.0f);
        std::fill_n(auxL_.data(), chunk, 0.0f);
        std::fill_n(auxR_.data(), chunk, 0.0f);

        bool anyVoiceActive = false;
        std::uint8_t insertUsedMask = 0;
        for (int pIdx = 0; pIdx < kNumParts; ++pIdx)
        {
            const auto idx = static_cast<std::size_t>(pIdx);
            auto& p = parts_[idx];
            IMcxSoundEngine* eng = engineSlots_[idx];
            if (!p.enabled || eng == nullptr)
                continue;

            syncPartEngineControl(pIdx);
            const bool voiceActive = eng->renderBlock(partL_.data(), partR_.data(), chunk);
            const bool hasInsert = (p.routeMode != McxPartRouteMode::ExternalMidi)
                && (p.insertSlot >= 0 && p.insertSlot < McxRackChassis::kMaxSlots);
            const bool insertClaimed = hasInsert && ((insertUsedMask & static_cast<std::uint8_t>(1u << p.insertSlot)) == 0);
            const bool insertTail = insertClaimed && outputAndFx_.getChassis().hasSlotActivity(p.insertSlot);
            if (!voiceActive && !insertTail)
                continue;

            if (voiceActive)
                anyVoiceActive = true;
            else
            {
                std::fill_n(partL_.data(), chunk, 0.0f);
                std::fill_n(partR_.data(), chunk, 0.0f);
            }

            if (insertClaimed)
            {
                insertUsedMask |= static_cast<std::uint8_t>(1u << p.insertSlot);
                outputAndFx_.getChassis().processSlot(
                    p.insertSlot,
                    partL_.data(), partR_.data(),
                    partL_.data(), partR_.data(),
                    chunk,
                    false);
            }

            McxChannelStripParams csp {};
            csp.eqEnabled = p.eqEnabled; csp.eqLowFreqHz = p.eqLowFreqHz; csp.eqLowGainDb = p.eqLowGainDb;
            csp.eqMidFreqHz = p.eqMidFreqHz; csp.eqMidGainDb = p.eqMidGainDb; csp.eqMidQ = p.eqMidQ;
            csp.eqHighFreqHz = p.eqHighFreqHz; csp.eqHighGainDb = p.eqHighGainDb;
            csp.driveEnabled = p.driveEnabled; csp.driveType = p.driveType; csp.driveAmount = p.driveAmount;
            csp.level = p.level; csp.pan = p.pan; csp.mute = p.mute; csp.solo = p.solo;
            csp.sendA = p.reverbSend; csp.sendAPre = p.reverbSendPre;
            csp.sendB = p.chorusSend; csp.sendBPre = p.chorusSendPre;
            csp.sendC = p.delaySend; csp.sendCPre = p.delaySendPre;
            csp.sendD = p.auxSend; csp.sendDPre = p.auxSendPre;

            channelStrips_[idx].process(
                partL_.data(), partR_.data(),
                revL_.data(), revR_.data(), choL_.data(), choR_.data(),
                delL_.data(), delR_.data(), auxL_.data(), auxR_.data(),
                chunk, csp, isPartAudible(pIdx));

            float pMax = 0.0f;
            for (int s = 0; s < chunk; ++s)
            {
                const float sL = partL_[static_cast<std::size_t>(s)];
                const float sR = partR_[static_cast<std::size_t>(s)];
                dryL_[static_cast<std::size_t>(s)] += sL;
                dryR_[static_cast<std::size_t>(s)] += sR;
                pMax = std::max(pMax, std::max(std::abs(sL), std::abs(sR)));
            }
            partPeaks_[idx] = std::max(partPeaks_[idx], pMax);
            if (audioDuckEnabled_ && (pIdx == 9 || parts_[idx].isDrumKit))
                audioDuckEnvelope_ = std::max(audioDuckEnvelope_, pMax);
        }

        const bool injFilter = diagProbe_.isInjectingAt(4) || diagProbe_.isInjectingAt(5);
        const bool injPreFx = diagProbe_.isInjectingAt(3);
        const bool injPreMaster = diagProbe_.isInjectingAt(2);
        const bool injPostMaster = diagProbe_.isInjectingAt(1);
        const auto& fp = parts_[static_cast<std::size_t>(std::clamp(focusedPartIndex_, 0, kNumParts - 1))];

        if (injFilter || injPreFx || injPreMaster)
        {
            if (injFilter)
            {
                const auto& pt0 = fp.partials[0];
                diagFilter_.setParameters(fp.filterModel, pt0.filterMode, pt0.cutoffHz, pt0.resonance, pt0.zplaneMorph, pt0.drive);
            }
            for (int i = 0; i < chunk; ++i)
            {
                const float raw = diagProbe_.nextSample();
                const auto idx = static_cast<std::size_t>(i);
                if (injFilter)
                {
                    const float sf = diagFilter_.processSample(raw);
                    dryL_[idx] += sf; dryR_[idx] += sf;
                    choL_[idx] += sf * fp.chorusSend; choR_[idx] += sf * fp.chorusSend;
                    revL_[idx] += sf * fp.reverbSend; revR_[idx] += sf * fp.reverbSend;
                }
                if (injPreFx)
                {
                    dryL_[idx] += raw; dryR_[idx] += raw;
                    choL_[idx] += raw * fp.chorusSend; choR_[idx] += raw * fp.chorusSend;
                    revL_[idx] += raw * fp.reverbSend; revR_[idx] += raw * fp.reverbSend;
                }
                if (injPreMaster)
                {
                    dryL_[idx] += raw; dryR_[idx] += raw;
                }
            }
        }

        const bool runOutput = anyVoiceActive || injFilter || injPreFx || injPreMaster
            || fxTailSamplesLeft_ > 0 || outputAndFx_.getChassis().hasAnySlotActivity();
        if (runOutput)
        {
            if (anyVoiceActive || injFilter || injPreFx)
                fxTailSamplesLeft_ = static_cast<int>(sampleRate_ * 5.0);
            else if (fxTailSamplesLeft_ > 0)
                fxTailSamplesLeft_ = std::max(0, fxTailSamplesLeft_ - chunk);

            McxOutputAndFx::ControlFrame fxCtrl;
            fxCtrl.bpm = static_cast<double>(masterTempoBpm_);
            fxCtrl.tempoSync = fxTempoSync_;
            const bool duckTriggered = manualDuckGate_ || (midiDuckEnabled_ && kickDuckEnvelope_ > 0.05f) || (audioDuckEnabled_ && audioDuckEnvelope_ > 0.08f);
            fxCtrl.gates[0] = duckTriggered ? 1.0f : 0.0f;
            fxCtrl.gates[1] = fxGates_[1] ? 1.0f : 0.0f;
            fxCtrl.gates[2] = fxGates_[2] ? 1.0f : 0.0f;
            fxCtrl.gates[3] = fxGates_[3] ? 1.0f : 0.0f;
            if (fp.lfo1Target < 4) fxCtrl.lfoMod[fp.lfo1Target] = std::clamp(lfoValueBipolar_[0] * fp.lfo1Depth, -1.0f, 1.0f);
            if (kickDuckEnvelope_ > 0.01f) kickDuckEnvelope_ *= std::exp(-static_cast<float>(chunk) / static_cast<float>(sampleRate_ * 0.18));
            else kickDuckEnvelope_ = 0.0f;
            if (audioDuckEnvelope_ > 0.01f) audioDuckEnvelope_ *= std::exp(-static_cast<float>(chunk) / static_cast<float>(sampleRate_ * 0.18));
            else audioDuckEnvelope_ = 0.0f;
            const float outGain = (injPreMaster && !anyVoiceActive && !injFilter && !injPreFx) ? 1.0f : masterGain_;
            outputAndFx_.processChunk(dryL_.data(), dryR_.data(), revL_.data(), revR_.data(), choL_.data(), choR_.data(),
                                      delL_.data(), delR_.data(), auxL_.data(), auxR_.data(), chunk, outGain, fxCtrl, insertUsedMask);
            for (int i = 0; i < chunk; ++i)
            {
                left[offset + i] = dryL_[static_cast<std::size_t>(i)];
                right[offset + i] = dryR_[static_cast<std::size_t>(i)];
            }
        }

        if (injPostMaster)
            diagProbe_.injectStereoBuffer(1, left + offset, right + offset, chunk, false);

        offset += chunk;
    }

    const float midiDecay = std::exp(-static_cast<float>(numSamples) / static_cast<float>(sampleRate_ * 0.14));
    for (float& mp : partMidiPeaks_)
    {
        mp *= midiDecay;
        if (mp < 1e-4f)
            mp = 0.0f;
    }
}

} // namespace abdmcx
