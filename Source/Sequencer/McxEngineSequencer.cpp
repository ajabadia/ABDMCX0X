#include "../DSP/Core/McxEngine.h"
#include "../Core/McxParamRouter.h"
#include "McxPatternSequencer.h"
#include "McxSongAndScenes.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

namespace
{
void seqOnNoteOn(void* ctx, int part, std::uint8_t note, std::uint8_t vel, bool slide, std::int32_t sampleOffset) noexcept
{
    auto* eng = static_cast<McxEngine*>(ctx);
    if (eng == nullptr || !eng->isPartAudible(part)) return;
    auto& p = eng->part(part);
    auto* soundEng = eng->getPartSoundEngine(part);

    if (slide && HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        if (auto* q = eng->getOutboundMidiQueue())
            q->push(HardwareMirrorRouter::makeCc(p.midiChannel, 65, 127, sampleOffset, p.midiPortIndex));
    }

    float prevPorta = 0.0f;
    float prevLegato = 1.0f;
    if (slide && soundEng != nullptr)
    {
        (void)soundEng->getParamByKey("porta.enabled", prevPorta);
        (void)soundEng->getParamByKey("porta.legato", prevLegato);
        (void)soundEng->setParamByKey("porta.enabled", 1.0f);
        (void)soundEng->setParamByKey("porta.legato", 0.0f);
    }

    eng->triggerPartNoteOn(part, static_cast<int>(note), static_cast<float>(vel) / 127.0f, sampleOffset);

    if (slide)
    {
        if (soundEng != nullptr)
        {
            (void)soundEng->setParamByKey("porta.enabled", prevPorta);
            (void)soundEng->setParamByKey("porta.legato", prevLegato);
        }
        if (HardwareMirrorRouter::routesToExternal(p.routeMode))
        {
            if (auto* q = eng->getOutboundMidiQueue())
                q->push(HardwareMirrorRouter::makeCc(p.midiChannel, 65, 0, sampleOffset, p.midiPortIndex));
        }
    }
}

void seqOnNoteOff(void* ctx, int part, std::uint8_t note, std::int32_t sampleOffset) noexcept
{
    auto* eng = static_cast<McxEngine*>(ctx);
    if (eng != nullptr)
        eng->releasePartNoteOff(part, static_cast<int>(note), sampleOffset);
}

void seqOnMotion(void* ctx, int part, int paramId, float value, std::int32_t /*sampleOffset*/) noexcept
{
    auto* eng = static_cast<McxEngine*>(ctx);
    if (eng != nullptr)
        applyWebPartParam(*eng, part, paramId, value);
}

bool seqOnBarBoundary(void* ctx, std::int32_t sampleOffset) noexcept
{
    auto* eng = static_cast<McxEngine*>(ctx);
    if (eng == nullptr) return true;
    const auto act = eng->songAndScenes().onBarBoundary();
    if (act.stopTransport)
    {
        eng->midiClock().emitStop(eng->getOutboundMidiQueue(), sampleOffset);
        return false;
    }
    if (act.applied)
    {
        eng->songAndScenes().quantizedMute().clearQueued();
        eng->applySceneStateNow(act.muteMask, act.transposeSemitones);
        eng->songAndScenes().quantizedMute().recordApplied(eng->bankLayout().bankMuteMask);
    }
    else
    {
        eng->flushQueuedMutesNow();
    }
    return true;
}

[[nodiscard]] McxSequencerCallbacks makeSeqCallbacks(McxEngine* eng) noexcept
{
    McxSequencerCallbacks cbs {};
    cbs.ctx = eng;
    cbs.onNoteOn = &seqOnNoteOn;
    cbs.onNoteOff = &seqOnNoteOff;
    cbs.onMotion = &seqOnMotion;
    cbs.onBarBoundary = &seqOnBarBoundary;
    return cbs;
}
} // namespace

McxEngine::~McxEngine() noexcept = default;

void McxEngine::initSequencer() noexcept
{
    sequencer_ = std::make_unique<McxPatternSequencer>();
    songAndScenes_ = std::make_unique<McxSongAndScenes>();
}

void McxEngine::prepareSequencer(double sr) noexcept
{
    midiClock_.prepare(sr);
    if (sequencer_) sequencer_->prepare(sr);
}

void McxEngine::resetSequencer() noexcept
{
    midiClock_.reset();
    prevHostPlaying_ = false;
    prevHostPpqPos_ = -1.0;
    if (sequencer_) sequencer_->reset();
    if (songAndScenes_) songAndScenes_->reset();
}

McxPatternSequencer& McxEngine::sequencer() noexcept { return *sequencer_; }
const McxPatternSequencer& McxEngine::sequencer() const noexcept { return *sequencer_; }
McxSongAndScenes& McxEngine::songAndScenes() noexcept { return *songAndScenes_; }
const McxSongAndScenes& McxEngine::songAndScenes() const noexcept { return *songAndScenes_; }

std::uint64_t McxEngine::captureCurrentMuteMask() const noexcept
{
    std::uint64_t mask = 0ull;
    for (int i = 0; i < kNumParts; ++i)
        if (parts_[static_cast<std::size_t>(i)].mute)
            mask |= (1ull << i);
    return mask;
}

void McxEngine::applySceneStateNow(std::uint64_t muteMask, int transposeSemitones) noexcept
{
    for (int i = 0; i < kNumParts; ++i)
        parts_[static_cast<std::size_t>(i)].mute = ((muteMask & (1ull << i)) != 0ull);
    const int clampedTr = std::clamp(transposeSemitones, -24, 24);
    setGlobalTranspose(clampedTr);
    if (songAndScenes_) songAndScenes_->recordAppliedState(muteMask, clampedTr);
}

void McxEngine::triggerScene(int sceneIndex, bool immediate) noexcept
{
    if (!songAndScenes_) return;
    const bool running = sequencer_ && sequencer_->isRunning();
    const auto act = songAndScenes_->triggerScene(sceneIndex, running, immediate);
    if (act.applied) applySceneStateNow(act.muteMask, act.transposeSemitones);
}

void McxEngine::captureCurrentToScene(int sceneIndex) noexcept
{
    if (!songAndScenes_) return;
    const auto mask = captureCurrentMuteMask();
    const int tr = transposer_.getTransposeSemitones();
    songAndScenes_->setScene(sceneIndex, mask, tr);
    songAndScenes_->recordAppliedState(mask, tr);
}

void McxEngine::setSongModeEnabled(bool enabled) noexcept
{
    if (!songAndScenes_) return;
    songAndScenes_->setSongMode(enabled);
    if (enabled && sequencer_ && !sequencer_->isRunning())
    {
        const auto act = songAndScenes_->onTransportStart(0);
        if (act.applied) applySceneStateNow(act.muteMask, act.transposeSemitones);
    }
}

void McxEngine::setSongLoopEnabled(bool loop) noexcept
{
    if (songAndScenes_) songAndScenes_->setSongLoop(loop);
}

void McxEngine::jumpSongBlock(int blockIndex, bool immediate) noexcept
{
    if (!songAndScenes_) return;
    const bool running = sequencer_ && sequencer_->isRunning();
    const auto act = songAndScenes_->jumpToSongBlock(blockIndex, running, immediate);
    if (act.applied) applySceneStateNow(act.muteMask, act.transposeSemitones);
}

void McxEngine::setMuteQuantizeToBar(bool enabled) noexcept
{
    if (!songAndScenes_) return;
    songAndScenes_->quantizedMute().setQuantizeEnabled(enabled);
    if (!enabled) flushQueuedMutesNow();
}

void McxEngine::togglePartMuteQuantized(int partIdx, bool forceImmediate) noexcept
{
    if (partIdx < 0 || partIdx >= kNumParts || !songAndScenes_) return;
    auto& qm = songAndScenes_->quantizedMute();
    if (!qm.isQuantizeEnabled() || forceImmediate || !isSequencerRunning())
    {
        auto& p = parts_[static_cast<std::size_t>(partIdx)];
        p.mute = !p.mute;
        if (p.mute) p.solo = false;
        qm.clearPartBit(partIdx);
        songAndScenes_->recordAppliedState(captureCurrentMuteMask(), transposer_.getTransposeSemitones());
        qm.recordApplied(bankLayout_.bankMuteMask);
        return;
    }
    (void)qm.queuePartToggle(partIdx);
}

void McxEngine::toggleBankMuteQuantized(int bankIdx, bool forceImmediate) noexcept
{
    if (bankIdx < 0 || bankIdx >= McxBankLayoutState::kMaxBanks || !songAndScenes_) return;
    auto& qm = songAndScenes_->quantizedMute();
    if (!qm.isQuantizeEnabled() || forceImmediate || !isSequencerRunning())
    {
        const bool nextMuted = !bankLayout_.isBankMuted(bankIdx);
        bankLayout_.setBankMuted(bankIdx, nextMuted);
        if (nextMuted) bankLayout_.setBankSoloed(bankIdx, false);
        qm.clearBankBit(bankIdx);
        songAndScenes_->recordAppliedState(captureCurrentMuteMask(), transposer_.getTransposeSemitones());
        qm.recordApplied(bankLayout_.bankMuteMask);
        return;
    }
    (void)qm.queueBankToggle(bankIdx);
}

void McxEngine::flushQueuedMutesNow() noexcept
{
    if (!songAndScenes_) return;
    std::uint64_t qPart = 0ull;
    std::uint8_t qBank = 0u;
    if (!songAndScenes_->quantizedMute().consumePending(qPart, qBank)) return;
    for (int i = 0; i < kNumParts; ++i)
    {
        if ((qPart & (1ull << static_cast<unsigned>(i))) == 0ull) continue;
        auto& p = parts_[static_cast<std::size_t>(i)];
        p.mute = !p.mute;
        if (p.mute) p.solo = false;
    }
    for (int b = 0; b < McxBankLayoutState::kMaxBanks; ++b)
    {
        if ((qBank & static_cast<std::uint8_t>(1u << static_cast<unsigned>(b))) == 0u) continue;
        const bool nextMuted = !bankLayout_.isBankMuted(b);
        bankLayout_.setBankMuted(b, nextMuted);
        if (nextMuted) bankLayout_.setBankSoloed(b, false);
    }
    songAndScenes_->recordAppliedState(captureCurrentMuteMask(), transposer_.getTransposeSemitones());
    songAndScenes_->quantizedMute().recordApplied(bankLayout_.bankMuteMask);
}

void McxEngine::setSequencerPlaying(bool playing, bool resetToZero) noexcept
{
    if (!sequencer_) return;
    const bool wasRunning = sequencer_->isRunning();
    if (playing && !wasRunning)
    {
        if (resetToZero && songAndScenes_)
        {
            const auto act = songAndScenes_->onTransportStart(0);
            if (act.applied) applySceneStateNow(act.muteMask, act.transposeSemitones);
        }
        sequencer_->start(resetToZero);
        if (resetToZero) midiClock_.emitStart(outboundQueue_, 0);
        else midiClock_.emitContinue(outboundQueue_, 0);
    }
    else if (!playing && wasRunning)
    {
        if (resetToZero)
        {
            sequencer_->stop(makeSeqCallbacks(this), 0);
            if (songAndScenes_) songAndScenes_->quantizedMute().clearQueued();
        }
        else
        {
            sequencer_->pause();
            allNotesOff();
        }
        midiClock_.emitStop(outboundQueue_, 0);
    }
    else if (!playing && resetToZero)
    {
        sequencer_->stop(makeSeqCallbacks(this), 0);
        if (songAndScenes_) songAndScenes_->quantizedMute().clearQueued();
    }
}

void McxEngine::syncHostTransport(bool hostPlaying, double hostBpm, double hostPpqPos, bool ppqValid) noexcept
{
    if (!sequencer_) return;
    if (hostBpm >= 20.0 && hostBpm <= 300.0)
        setMasterTempoBpm(static_cast<float>(hostBpm));

    const bool started = hostPlaying && !prevHostPlaying_;
    const bool seeked = hostPlaying && prevHostPlaying_ && ppqValid && prevHostPpqPos_ >= 0.0
                        && (hostPpqPos < prevHostPpqPos_ - 0.1 || std::abs(hostPpqPos - prevHostPpqPos_) > 2.0);
    if ((started || seeked) && songAndScenes_)
    {
        const int hostBar = (ppqValid && hostPpqPos >= 0.0) ? static_cast<int>(std::floor(hostPpqPos / 4.0)) : 0;
        const auto act = songAndScenes_->onTransportStart(hostBar);
        if (act.applied) applySceneStateNow(act.muteMask, act.transposeSemitones);
    }
    prevHostPlaying_ = hostPlaying;
    if (ppqValid) prevHostPpqPos_ = hostPpqPos;

    sequencer_->syncFromHostTransport(
        hostPlaying, static_cast<double>(masterTempoBpm_), hostPpqPos, ppqValid,
        makeSeqCallbacks(this), &midiClock_, outboundQueue_);
}

void McxEngine::processSequencerAndClock(int numSamples, std::int32_t baseSampleOffset) noexcept
{
    const double bpm = static_cast<double>(masterTempoBpm_);
    midiClock_.setBpm(bpm);
    midiClock_.processBlock(numSamples, outboundQueue_, baseSampleOffset);
    if (sequencer_)
    {
        sequencer_->setBpm(bpm);
        sequencer_->processBlock(numSamples, makeSeqCallbacks(this), baseSampleOffset);
    }
}

bool McxEngine::isSequencerRunning() const noexcept { return sequencer_ && sequencer_->isRunning(); }
bool McxEngine::isSequencerPaused() const noexcept { return sequencer_ && sequencer_->isPaused(); }
bool McxEngine::isSequencerCountingIn() const noexcept { return sequencer_ && sequencer_->isCountingIn(); }
int McxEngine::getSequencerCountInTicks() const noexcept { return sequencer_ ? sequencer_->getCountInRemainingTicks() : 0; }
std::uint32_t McxEngine::getSequencerRecordedRev() const noexcept { return sequencer_ ? sequencer_->getRecordedPatternRev() : 0u; }
int McxEngine::getSequencerTick() const noexcept { return sequencer_ ? sequencer_->getCurrentTick() : 0; }
int McxEngine::getSequencerStep() const noexcept { return sequencer_ ? sequencer_->getCurrentStep() : 0; }
int McxEngine::getSequencerTotalTicks() const noexcept { return sequencer_ ? sequencer_->getTotalTicks() : 384; }

void McxEngine::seekSequencerBars(int deltaBars) noexcept
{
    if (sequencer_)
        sequencer_->seekByBars(deltaBars, makeSeqCallbacks(this), 0);
}

void McxEngine::returnSequencerToZero() noexcept
{
    if (sequencer_)
        sequencer_->returnToZero(makeSeqCallbacks(this), 0);
}

void McxEngine::setSequencerRecordConfig(int mode01, int countInBars, int quantizeSteps) noexcept
{
    if (!sequencer_) return;
    sequencer_->setRecordMode(mode01 == 1 ? McxPatternSequencer::RecordMode::Replace : McxPatternSequencer::RecordMode::Overdub);
    sequencer_->setCountInBars(countInBars);
    sequencer_->setRecordQuantizeSteps(quantizeSteps);
}

void McxEngine::recordLiveInputNoteOn(int partIndex, int midiNote, float velocity) noexcept
{
    if (!sequencer_ || !sequencer_->isRecording()) return;
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto note = static_cast<std::uint8_t>(std::clamp(midiNote, 0, 127));
    const auto vel = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(std::lround(velocity * 127.0f)), 1, 127));
    sequencer_->recordLiveNoteOn(idx, note, vel);
}

void McxEngine::recordLiveInputNoteOff(int partIndex, int midiNote) noexcept
{
    if (!sequencer_ || !sequencer_->isRecording()) return;
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto note = static_cast<std::uint8_t>(std::clamp(midiNote, 0, 127));
    sequencer_->recordLiveNoteOff(idx, note);
}

} // namespace abdmcx
