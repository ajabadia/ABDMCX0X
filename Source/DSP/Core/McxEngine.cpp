#include "McxEngine.h"
#include "../../Core/McxFactoryBank.h"

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
    : romplerEngines_(static_cast<std::size_t>(kNumParts))
{
    romplerPool_.setVoiceStolenCallback(&McxEngine::onRomplerVoiceStolen, this);

    for (int i = 0; i < kNumParts; ++i)
    {
        auto& rompler = romplerEngines_[static_cast<std::size_t>(i)];
        rompler.attachVoicePool(&romplerPool_, i);
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
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
    romplerPool_.prepare(sampleRate_);
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto idx = static_cast<std::size_t>(i);
        parts_[idx].arp.prepare(sampleRate_);
        if (engineSlots_[idx] != nullptr)
            engineSlots_[idx]->prepare(sampleRate_, McxOutputAndFx::kMaxChunk);
        channelStrips_[idx].prepare(sampleRate_);
    }
    outputAndFx_.prepare(sampleRate_);
    diagProbe_.prepare(sampleRate_);
    diagFilter_.prepare(sampleRate_);
    reset();
}

void McxEngine::reset() noexcept
{
    fxTailSamplesLeft_ = 0;
    partMidiPeaks_.fill(0.0f);
    mirrorRouter_.clear();
    outputAndFx_.reset();
    diagProbe_.reset();
    diagFilter_.reset();
    romplerPool_.reset();
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto idx = static_cast<std::size_t>(i);
        if (engineSlots_[idx] != nullptr)
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
}

void McxEngine::processAudio(float* left, float* right, int numSamples) noexcept
{
    if (!left || !right || numSamples <= 0)
        return;

    std::fill_n(left, numSamples, 0.0f);
    std::fill_n(right, numSamples, 0.0f);
    std::fill(partPeaks_.begin(), partPeaks_.end(), 0.0f);

    for (int partIdx = 0; partIdx < kNumParts; ++partIdx)
    {
        auto& p = parts_[static_cast<std::size_t>(partIdx)];
        if (!p.enabled || !p.arp.isEnabled())
            continue;

        p.arp.generate(numSamples, [this, partIdx](const abd::synth::GrooveArpeggiator::NoteEvent& ev) {
            if (ev.isNoteOn)
            {
                const float evAccent = std::max(accentAmount_, std::clamp((ev.velocity - 0.85f) * 3.0f, 0.0f, 1.0f));
                dispatchNoteOnToOutputs(partIdx, ev.note, ev.velocity, evAccent, ev.sampleOffset);
            }
            else
            {
                dispatchNoteOffToOutputs(partIdx, ev.note, ev.sampleOffset);
            }
        });
    }

    int offset = 0;
    while (offset < numSamples)
    {
        const int chunk = std::min(McxOutputAndFx::kMaxChunk, numSamples - offset);
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
        for (int pIdx = 0; pIdx < kNumParts; ++pIdx)
        {
            const auto idx = static_cast<std::size_t>(pIdx);
            auto& p = parts_[idx];
            IMcxSoundEngine* eng = engineSlots_[idx];
            if (!p.enabled || eng == nullptr)
                continue;

            syncPartEngineControl(pIdx);
            if (!eng->renderBlock(partL_.data(), partR_.data(), chunk))
                continue;

            anyVoiceActive = true;
            McxChannelStripParams csp {};
            csp.eqEnabled = p.eqEnabled;
            csp.eqLowFreqHz = p.eqLowFreqHz;
            csp.eqLowGainDb = p.eqLowGainDb;
            csp.eqMidFreqHz = p.eqMidFreqHz;
            csp.eqMidGainDb = p.eqMidGainDb;
            csp.eqMidQ = p.eqMidQ;
            csp.eqHighFreqHz = p.eqHighFreqHz;
            csp.eqHighGainDb = p.eqHighGainDb;
            csp.driveEnabled = p.driveEnabled;
            csp.driveAmount = p.driveAmount;
            csp.level = p.level;
            csp.pan = p.pan;
            csp.mute = p.mute;
            csp.solo = p.solo;
            csp.sendA = p.reverbSend;
            csp.sendAPre = p.reverbSendPre;
            csp.sendB = p.chorusSend;
            csp.sendBPre = p.chorusSendPre;
            csp.sendC = p.delaySend;
            csp.sendCPre = p.delaySendPre;
            csp.sendD = p.auxSend;
            csp.sendDPre = p.auxSendPre;

            channelStrips_[idx].process(
                partL_.data(), partR_.data(),
                revL_.data(), revR_.data(),
                choL_.data(), choR_.data(),
                delL_.data(), delR_.data(),
                auxL_.data(), auxR_.data(),
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

        const bool runOutput = anyVoiceActive || injFilter || injPreFx || injPreMaster || fxTailSamplesLeft_ > 0;
        if (runOutput)
        {
            if (anyVoiceActive || injFilter || injPreFx)
                fxTailSamplesLeft_ = static_cast<int>(sampleRate_ * 2.5);
            else if (fxTailSamplesLeft_ > 0)
                fxTailSamplesLeft_ = std::max(0, fxTailSamplesLeft_ - chunk);

            McxOutputAndFx::ControlFrame fxCtrl;
            fxCtrl.bpm = static_cast<double>(masterTempoBpm_);
            fxCtrl.tempoSync = true;
            outputAndFx_.processChunk(
                dryL_.data(), dryR_.data(),
                revL_.data(), revR_.data(),
                choL_.data(), choR_.data(),
                delL_.data(), delR_.data(),
                auxL_.data(), auxR_.data(),
                chunk, (injPreMaster && !anyVoiceActive && !injFilter && !injPreFx) ? 1.0f : masterGain_,
                fxCtrl);
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
