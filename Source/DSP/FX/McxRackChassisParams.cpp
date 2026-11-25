#include "McxRackChassis.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxRackChassis::setSlotParams(int slotIdx, float p1, float p2, float dryWetMix) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    st.p1 = std::clamp(p1, 0.0f, 1.0f);
    st.p2 = std::clamp(p2, 0.0f, 1.0f);
    st.dryWetMix = std::clamp(dryWetMix, 0.0f, 1.0f);
    applySlotDspParams(slotIdx);
}

void McxRackChassis::setSlotParamByKey(int slotIdx, std::string_view key, float value) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    const float v01 = std::clamp(value, 0.0f, 1.0f);
    const bool jvRev = st.engineType == McxRackEngineType::RolandJvReverb;
    const bool gsDly = st.engineType == McxRackEngineType::RolandGsDelay;
    const bool jvCho = st.engineType == McxRackEngineType::RolandJvChorus, mtRev = st.engineType == McxRackEngineType::RolandMt32Reverb;
    const bool msMod = st.engineType == McxRackEngineType::Ms2000ChorusFlanger || st.engineType == McxRackEngineType::Ms2000Phaser;
    const bool msDly = st.engineType == McxRackEngineType::Ms2000Delay;
    const bool gRev = st.engineType == McxRackEngineType::GolanaReverb, iDly = st.engineType == McxRackEngineType::IterumDelay;
    const bool reWdf = st.engineType == McxRackEngineType::Re201Wdf, krCho = st.engineType == McxRackEngineType::Kr106Chorus;
    const bool nFlt = st.engineType == McxRackEngineType::NeuronSilverFilter, nFrq = st.engineType == McxRackEngineType::NeuronSilverFreq;
    const bool nTim = st.engineType == McxRackEngineType::NeuronSilverTime, nSlc = st.engineType == McxRackEngineType::NeuronSlicer;
    if (key == "mix") st.dryWetMix = v01;
    else if (key == "mode" || key == "curve" || key == "pingPong") st.mode = std::clamp(static_cast<int>(value), 0, 15);
    else if (key == "p1" || ((key == "rate" || key == "speed") && !nTim) || key == "decay" || key == "midGain" || key == "thresh" || key == "cutoff" || key == "lowGain" || key == "program" || key == "revMode" || key == "revType" || key == "delayMacro" || key == "freqAlgo" || key == "timeAlgo" || (key == "time" && !jvRev && !gsDly && !mtRev && !nTim) || (key == "drive" && st.engineType != McxRackEngineType::MoodFilter)) st.p1 = v01;
    else if (key == "p2" || key == "intensity" || key == "revTime" || (key == "time" && (jvRev || gsDly || mtRev)) || (key == "tone" && !gRev) || key == "midFreq" || key == "reso" || key == "lowFreq" || key == "param1" || key == "character" || key == "saturation" || key == "bbdDrive" || (key == "rate" && nTim) || (key == "fb" && !jvRev && !gsDly && !jvCho && !msMod && !msDly) || ((key == "level" || key == "wetLevel") && (st.engineType == McxRackEngineType::RolandBossReverb || st.engineType == McxRackEngineType::Ms2000Distortion)) || (key == "damp" && st.engineType != McxRackEngineType::StereoDelay && !jvRev) || (key == "depth" && st.engineType != McxRackEngineType::MoodFilter && !nTim)) st.p2 = v01;
    else if (key == "p3" || key == "size" || key == "echoVol" || key == "width" || key == "bias" || key == "midQ" || key == "chipMode" || key == "chorusMode" || key == "chorusType" || key == "delayFeedback" || key == "filterMode" || key == "slicerMode" || key == "param2" || key == "springMix" || (key == "depth" && nTim) || ((key == "fb" || key == "feedback") && (jvRev || gsDly || msMod || msDly || iDly)) || (key == "damp" && st.engineType == McxRackEngineType::StereoDelay) || (key == "highGain" && (st.engineType == McxRackEngineType::RolandToneEq || st.engineType == McxRackEngineType::Ms2000Eq)) || (key == "drive" && st.engineType == McxRackEngineType::MoodFilter)) st.p3 = v01;
    else if (key == "p4" || key == "preDelay" || key == "bass" || key == "noise" || key == "spread" || key == "preLpf" || key == "hiMidGain" || key == "delayMode" || key == "param3" || key == "wave" || (key == "tone" && gRev) || key == "clockNoise" || ((key == "fb" || key == "feedback") && (jvCho || nTim)) || ((key == "level" || key == "wetLevel") && !gsDly && !jvCho && st.engineType != McxRackEngineType::Ms2000Distortion) || ((key == "highFreq") && (st.engineType == McxRackEngineType::RolandToneEq || st.engineType == McxRackEngineType::Ms2000Eq)) || (key == "depth" && st.engineType == McxRackEngineType::MoodFilter)) st.p4 = v01;
    else if (key == "p5" || key == "lowCut" || key == "treble" || key == "sync" || key == "hiMidFreq" || key == "highQ" || (key == "damp" && jvRev) || ((key == "level" || key == "wetLevel") && (gsDly || jvCho))) st.p5 = v01;
    else if (key == "p6" || key == "hiMidQ") st.p6 = v01;
    else if (key == "p7" || key == "hiGain") st.p7 = v01;
    else if (key == "p8" || key == "hiFreq") st.p8 = v01;
    else if (key == "p9") st.p9 = v01; else if (key == "p10") st.p10 = v01; else if (key == "p11") st.p11 = v01; else if (key == "p12") st.p12 = v01;
    (void)reWdf; (void)krCho; (void)nFlt; (void)nFrq; (void)nSlc;
    applySlotDspParams(slotIdx);
}

void McxRackChassis::applySlotDspParams(int slotIdx) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots || !dsp_) return;
    const auto& st = states_[static_cast<std::size_t>(slotIdx)];
    auto& d = (*dsp_)[static_cast<std::size_t>(slotIdx)];
    if (st.engineType == McxRackEngineType::ZitaReverb) {
        d.zita.setDecayNorm(st.p1); d.zita.setDampingNorm(st.p2); d.zita.setSizeNorm(st.p3); d.zita.setPreDelayNorm(st.p4); d.zita.setMixNorm(1.0f);
    } else if (st.engineType == McxRackEngineType::SpaceEcho) {
        d.delay.setTimeNorm(st.p1); d.delay.setFeedbackLNorm(st.p2); d.delay.setFeedbackRNorm(st.p2);
        d.delay.setMode(st.mode % 4); d.delay.setLoCutNorm(1.0f - st.p4); d.delay.setHiCutNorm(st.p5);
        d.zita.setDecayNorm(st.p2 * 0.8f); d.zita.setMixNorm(1.0f);
    } else if (st.engineType == McxRackEngineType::StereoDelay) {
        d.delay.setTimeNorm(st.p1); d.delay.setFeedbackLNorm(st.p2); d.delay.setFeedbackRNorm(st.p2);
        d.delay.setHiCutNorm(1.0f - st.p3); d.delay.setOffsetNorm(0.5f + (st.p4 - 0.5f) * 0.8f);
        d.delay.setMode(st.mode > 0 ? abd::dsp::DspStereoDelay::kPingPong : abd::dsp::DspStereoDelay::kStereo);
    } else if (st.engineType == McxRackEngineType::BbdChorus) {
        d.chorus.setSpeedNorm(st.p1); d.chorus.setWidthLNorm(st.p2); d.chorus.setWidthRNorm(st.p2); d.chorus.setSpreadNorm(st.p3); d.chorus.setPhaseNorm(st.p3);
    } else if (st.engineType == McxRackEngineType::Flanger) {
        d.flanger.setRateNorm(st.p1); d.flanger.setFeedbackNorm(st.p2); d.flanger.setDepthLNorm(st.p3); d.flanger.setDepthRNorm(st.p3); d.flanger.setBaseDelayLNorm(st.p4); d.flanger.setBaseDelayRNorm(st.p4);
    } else if (st.engineType == McxRackEngineType::MidasEq) {
        d.midasEq.setEqIn(true); d.midasEq.setLoMidGainNorm(st.p1); d.midasEq.setLoMidFreqNorm(st.p2); d.midasEq.setLoShelfGainNorm(st.p3); d.midasEq.setHiShelfGainNorm(st.p4);
    } else if (st.engineType == McxRackEngineType::FairComp) {
        d.fairComp.setMode(abd::dsp::DspFairComp::kStereo); d.fairComp.setThresholdLM(st.p1); d.fairComp.setTimeConstantLM(st.p2); d.fairComp.setDcBiasLM(st.p3); d.fairComp.setOutputGainLM(st.p4);
    } else if (st.engineType == McxRackEngineType::MoodFilter) {
        d.moodFilter.setBaseFreqNorm(st.p1); d.moodFilter.setResonanceNorm(st.p2); d.moodFilter.setDriveNorm(st.p3); d.moodFilter.setDepthNorm(st.p4 * 0.5f);
    } else if (st.engineType == McxRackEngineType::RolandBossReverb) {
        d.bossReverb.setMt32Compatible(false, false);
        d.bossReverb.setParameters(std::clamp(static_cast<int>(std::lround(st.p1 * 31.0f)), 0, 31), std::clamp(static_cast<int>(std::lround(st.p2 * 100.0f)), 0, 100), 100);
    } else if (st.engineType == McxRackEngineType::RolandMt32Reverb) {
        static constexpr int kP[4][4] = { { 4, 6, 7, 9 }, { 0, 8, 2, 1 }, { 5, 5, 18, 18 }, { 10, 11, 19, 20 } };
        d.bossReverb.setMt32Compatible(st.p3 >= 0.5f, true);
        d.bossReverb.setParameters(kP[std::clamp(static_cast<int>(st.p1 * 3.99f), 0, 3)][std::clamp(static_cast<int>(st.p2 * 3.99f), 0, 3)], std::clamp(static_cast<int>(std::lround(st.p4 * 100.0f)), 0, 100), 100);
    } else if (st.engineType == McxRackEngineType::RolandMultiChorus) {
        d.rolandChorus.setParameters(std::clamp(static_cast<int>(std::lround(st.p3 * 7.0f)), 0, 7), std::clamp(static_cast<int>(std::lround(st.p1 * 100.0f)), 0, 100), std::clamp(static_cast<int>(std::lround(st.p2 * 100.0f)), 0, 100), 100);
    } else if (st.engineType == McxRackEngineType::RolandToneEq) {
        d.rolandEq.setParameters(std::clamp(static_cast<int>(std::lround(st.p2 * 15.0f)), 0, 15), (st.p1 - 0.5f) * 24.0f, std::clamp(static_cast<int>(std::lround(st.p4 * 21.0f)), 0, 21), std::clamp(static_cast<int>(std::lround(st.p5 * 8.0f)), 0, 8), (st.p3 - 0.5f) * 24.0f, true);
    } else if (st.engineType == McxRackEngineType::RolandJvReverb) {
        d.jvReverb.setParameters(std::clamp(static_cast<int>(std::lround(st.p1 * 7.0f)), 0, 7), st.p2, st.p4 * 1.25f, st.p5, st.p3);
    } else if (st.engineType == McxRackEngineType::RolandJvChorus) {
        d.jvChorus.setParameters(std::clamp(static_cast<int>(std::lround(st.p3 * 7.0f)), 0, 7), st.p1, st.p2, st.p4, st.p5 * 1.25f);
    } else if (st.engineType == McxRackEngineType::RolandGsDelay) {
        d.gsDelay.setParameters(std::clamp(static_cast<int>(std::lround(st.p1 * 9.0f)), 0, 9), st.p2, st.p3, st.p4, st.p5 * 1.25f);
    } else if (st.engineType == McxRackEngineType::Ms2000ChorusFlanger) {
        d.ms2000ChoFlg.setSpeedHz(0.05f + st.p1 * 9.95f); d.ms2000ChoFlg.setDepth(st.p2); d.ms2000ChoFlg.setFeedback((st.p3 - 0.5f) * 1.8f);
    } else if (st.engineType == McxRackEngineType::Ms2000Ensemble) {
        d.ms2000Ens.setSpeed(st.p1); d.ms2000Ens.setDepth(st.p2);
    } else if (st.engineType == McxRackEngineType::Ms2000Phaser) {
        d.ms2000Phaser.setRateHz(0.05f + st.p1 * 9.95f); d.ms2000Phaser.setDepth(st.p2); d.ms2000Phaser.setFeedback((st.p3 - 0.5f) * 1.84f);
    } else if (st.engineType == McxRackEngineType::Ms2000Delay) {
        d.ms2000Delay.setMode(static_cast<abd::dsp::DspMS2000Delay::Mode>(std::clamp(static_cast<int>(std::lround(st.p4 * 2.0f)), 0, 2)));
        d.ms2000Delay.setTimeSeconds(0.01f + st.p1 * 1.39f); d.ms2000Delay.setDepth(st.p2); d.ms2000Delay.setFeedback(st.p3 * 0.95f);
    } else if (st.engineType == McxRackEngineType::Ms2000Eq) {
        d.ms2000Eq.setLowGainDB((st.p1 - 0.5f) * 24.0f); d.ms2000Eq.setLowFreqIndex(std::clamp(static_cast<int>(std::lround(st.p2 * 3.0f)), 0, 3));
        d.ms2000Eq.setHighGainDB((st.p3 - 0.5f) * 24.0f); d.ms2000Eq.setHighFreqIndex(std::clamp(static_cast<int>(std::lround(st.p4 * 3.0f)), 0, 3));
    }
    else if (st.engineType == McxRackEngineType::NeuronSilverFilter)
    {
        const int fm = std::clamp(static_cast<int>(std::lround(st.p3 * 4.0f)), 0, 4);
        d.neuronFilter.setNormalizedParameters(static_cast<abd::dsp::DspNeuronSilverFilter::Mode>(fm), st.p1, st.p2);
    }
    else if (st.engineType == McxRackEngineType::NeuronSilverFreq)
    {
        const int fa = std::clamp(static_cast<int>(std::lround(st.p1 * 4.0f)), 0, 4);
        d.neuronFreq.setEnabled(true); d.neuronFreq.setAlgorithm(fa);
        if (fa == 0) {
            const float g1 = (st.p2 - 0.5f) * 48.0f, g2 = (st.p3 - 0.5f) * 48.0f;
            d.neuronFreq.setEQParams(true, true, g1, 0.35f, 0.5f, true, g1 * 0.5f, st.p2, 0.5f, true, g2 * 0.5f, st.p3, 0.5f, true, g2, 0.7f, 0.5f);
            d.neuronFreq.setCompressorParams(true, -30.0f * st.p4, 30.0f + st.p4 * 30.0f, st.p4);
        } else if (fa == 1) {
            d.neuronFreq.setDistortionParams(0.5f + st.p2 * 3.5f, st.p3, std::clamp(static_cast<int>(std::lround(st.p4 * 5.0f)), 0, 5), 0.7f);
        } else if (fa == 2) {
            d.neuronFreq.setRingModParams(1.0f, 0.05f + st.p4 * 12.0f, st.p3, 0, 20.0f + st.p2 * 1200.0f, st.p3 * 0.4f, 0.25f);
        } else if (fa == 3) {
            d.neuronFreq.setDecimatorParams(1.0f, 1 + std::clamp(static_cast<int>(std::lround(st.p2 * 40.0f)), 0, 40), 1.0f - st.p3 * 0.85f);
        } else {
            d.neuronFreq.setSpWarpParams(1.0f, st.p2, st.p3, 0.35f, 0.05f + st.p4 * 8.0f, st.p4 * 0.65f, 0);
        }
    }
    else if (st.engineType == McxRackEngineType::NeuronSilverTime)
    {
        const int ta = std::clamp(static_cast<int>(std::lround(st.p1 * 4.0f)), 0, 4);
        const float fb = (st.p4 - 0.5f) * 1.92f;
        d.neuronTime.setEnabled(true); d.neuronTime.setAlgorithm(ta);
        if (ta == 0) d.neuronTime.setStereoSpreadParams((st.p3 - 0.5f) * 120.0f, fb);
        else if (ta == 1) d.neuronTime.setLRDelayParams(1.0f, 10.0f + st.p2 * 890.0f, fb);
        else d.neuronTime.setModulationParams(1.0f, st.p3, 0.05f + st.p2 * 9.95f, fb);
    }
    else if (st.engineType == McxRackEngineType::NeuronSlicer)
    {
        const int sm = std::clamp(static_cast<int>(std::lround(st.p3 * 2.0f)), 0, 2);
        const int wv = std::clamp(static_cast<int>(std::lround(st.p4 * 11.0f)), 0, 11);
        d.neuronSlicer.setParameters(sm, st.p2, 0.1f + st.p1 * 19.9f, wv);
    }
    else if (st.engineType == McxRackEngineType::GolanaReverb) {
        d.golanaReverb.setParameters(std::clamp(static_cast<int>(std::lround(st.p1 * 3.0f)), 0, 3), st.p3, st.p2, st.p4);
    } else if (st.engineType == McxRackEngineType::IterumDelay) {
        d.iterumDelay.setParameters(std::clamp(static_cast<int>(std::lround(st.p4 * 10.0f)), 0, 10), st.p1, st.p3, st.p2);
    } else if (st.engineType == McxRackEngineType::Re201Wdf) {
        d.re201Wdf.setParameters(st.p1, st.p2, st.p4, st.p5, st.p3);
    } else if (st.engineType == McxRackEngineType::Kr106Chorus) {
        d.kr106Chorus.setParameters(std::clamp(static_cast<int>(std::lround(st.p3 * 2.0f)), 0, 2), st.p2, st.p4, st.p1);
    }
}

void McxRackChassis::applyPresetToSlot(int slotIdx, int presetIdx) noexcept
{
    if (slotIdx < 0 || slotIdx >= kMaxSlots) return;
    auto& st = states_[static_cast<std::size_t>(slotIdx)];
    const int i = std::clamp(presetIdx, 0, 3);
    if (st.engineType == McxRackEngineType::RolandBossReverb) {
        static constexpr float kP[4] { 0.065f, 0.226f, 0.516f, 0.806f }; st.p1 = kP[i]; st.p2 = 0.85f;
    } else if (st.engineType == McxRackEngineType::RolandMt32Reverb) {
        static constexpr float kM[4] { 0.0f, 0.35f, 0.65f, 0.95f }; st.p1 = kM[i]; st.p2 = 0.55f; st.p3 = (i % 2 == 0) ? 1.0f : 0.0f; st.p4 = 0.85f;
    } else if (st.engineType == McxRackEngineType::RolandMultiChorus) {
        static constexpr float kM[4] { 0.0f, 0.286f, 0.857f, 1.0f }; st.p1 = 0.42f; st.p2 = 0.68f; st.p3 = kM[i];
    } else if (st.engineType == McxRackEngineType::RolandToneEq) {
        static constexpr float kLo[4] { 0.5f, 0.68f, 0.62f, 0.38f }, kHi[4] { 0.5f, 0.65f, 0.42f, 0.72f };
        st.p1 = kLo[i]; st.p2 = 0.27f; st.p3 = kHi[i]; st.p4 = 0.57f; st.p5 = 0.25f;
    } else if (st.engineType == McxRackEngineType::RolandJvReverb) {
        static constexpr float kA[4] { 0.0f / 7.0f, 4.0f / 7.0f, 5.0f / 7.0f, 7.0f / 7.0f };
        st.p1 = kA[i]; st.p2 = 0.58f; st.p3 = 0.45f; st.p4 = 0.75f; st.p5 = 0.35f;
    } else if (st.engineType == McxRackEngineType::RolandJvChorus) {
        static constexpr float kA[4] { 0.0f / 7.0f, 2.0f / 7.0f, 4.0f / 7.0f, 5.0f / 7.0f };
        st.p1 = 0.40f; st.p2 = 0.55f; st.p3 = kA[i]; st.p4 = 0.15f; st.p5 = 0.75f;
    } else if (st.engineType == McxRackEngineType::RolandGsDelay) {
        static constexpr float kM[4] { 0.0f / 9.0f, 4.0f / 9.0f, 8.0f / 9.0f, 9.0f / 9.0f };
        st.p1 = kM[i]; st.p2 = 0.84f; st.p3 = 0.62f; st.p4 = 0.0f; st.p5 = 0.75f;
    } else if (st.engineType == McxRackEngineType::Ms2000ChorusFlanger) {
        static constexpr float kS[4] { 0.12f, 0.05f, 0.08f, 0.18f }, kD[4] { 0.65f, 0.85f, 0.80f, 0.50f }, kF[4] { 0.50f, 0.62f, 0.88f, 0.12f };
        st.p1 = kS[i]; st.p2 = kD[i]; st.p3 = kF[i];
    } else if (st.engineType == McxRackEngineType::Ms2000Ensemble) {
        static constexpr float kS[4] { 0.35f, 0.15f, 0.65f, 0.25f }, kD[4] { 0.65f, 0.85f, 0.75f, 0.35f }; st.p1 = kS[i]; st.p2 = kD[i];
    } else if (st.engineType == McxRackEngineType::Ms2000Phaser) {
        static constexpr float kS[4] { 0.08f, 0.03f, 0.15f, 0.45f }, kD[4] { 0.75f, 0.90f, 0.65f, 0.70f }, kF[4] { 0.75f, 0.82f, 0.18f, 0.85f };
        st.p1 = kS[i]; st.p2 = kD[i]; st.p3 = kF[i];
    } else if (st.engineType == McxRackEngineType::Ms2000Delay) {
        static constexpr float kT[4] { 0.21f, 0.28f, 0.24f, 0.08f }, kF[4] { 0.35f, 0.48f, 0.45f, 0.22f }, kM[4] { 0.00f, 0.50f, 1.00f, 0.00f };
        st.p1 = kT[i]; st.p2 = 0.45f; st.p3 = kF[i]; st.p4 = kM[i];
    } else if (st.engineType == McxRackEngineType::Ms2000Distortion) {
        static constexpr float kD[4] { 0.65f, 0.35f, 0.90f, 0.20f }, kL[4] { 0.60f, 0.75f, 0.50f, 0.80f }; st.p1 = kD[i]; st.p2 = kL[i];
    } else if (st.engineType == McxRackEngineType::Ms2000Eq) {
        static constexpr float kL[4] { 0.50f, 0.70f, 0.80f, 0.42f }, kH[4] { 0.50f, 0.65f, 0.45f, 0.78f };
        st.p1 = kL[i]; st.p2 = 1.0f / 3.0f; st.p3 = kH[i]; st.p4 = 2.0f / 3.0f;
    } else if (st.engineType == McxRackEngineType::NeuronSilverFilter) {
        static constexpr float kC[4] { 0.65f, 0.72f, 0.40f, 0.55f }, kR[4] { 0.45f, 0.55f, 0.65f, 0.70f }, kM[4] { 0.00f, 0.25f, 0.75f, 1.00f };
        st.p1 = kC[i]; st.p2 = kR[i]; st.p3 = kM[i];
    } else if (st.engineType == McxRackEngineType::NeuronSilverFreq) {
        static constexpr float kA[4] { 1.00f, 0.50f, 0.25f, 0.75f }, k1[4] { 0.55f, 0.45f, 0.65f, 0.50f }, k2[4] { 0.50f, 0.60f, 0.40f, 0.35f }, k3[4] { 0.35f, 0.55f, 0.40f, 0.50f };
        st.p1 = kA[i]; st.p2 = k1[i]; st.p3 = k2[i]; st.p4 = k3[i];
    } else if (st.engineType == McxRackEngineType::NeuronSilverTime) {
        static constexpr float kA[4] { 1.00f, 0.25f, 0.50f, 0.75f }, kR[4] { 0.25f, 0.35f, 0.15f, 0.20f }, kD[4] { 0.65f, 0.70f, 0.80f, 0.75f }, kF[4] { 0.55f, 0.68f, 0.72f, 0.65f };
        st.p1 = kA[i]; st.p2 = kR[i]; st.p3 = kD[i]; st.p4 = kF[i];
    } else if (st.engineType == McxRackEngineType::NeuronSlicer) {
        static constexpr float kM[4] { 1.00f, 0.50f, 1.00f, 0.50f }, kR[4] { 0.30f, 0.18f, 0.52f, 0.40f }, kD[4] { 0.70f, 0.85f, 0.65f, 0.90f }, kW[4] { 0.36f, 0.00f, 0.18f, 0.72f };
        st.p1 = kR[i]; st.p2 = kD[i]; st.p3 = kM[i]; st.p4 = kW[i];
    } else if (st.engineType == McxRackEngineType::GolanaReverb) {
        static constexpr float kM[4] { 1.0f / 3.0f, 2.0f / 3.0f, 0.00f, 1.00f }, kD[4] { 0.45f, 0.35f, 0.60f, 0.25f }, kS[4] { 0.65f, 0.78f, 0.55f, 0.50f }, kT[4] { 0.55f, 0.62f, 0.42f, 0.75f };
        st.p1 = kM[i]; st.p2 = kD[i]; st.p3 = kS[i]; st.p4 = kT[i];
    } else if (st.engineType == McxRackEngineType::IterumDelay) {
        static constexpr float kM[4] { 0.20f, 0.70f, 0.80f, 0.60f }, kT[4] { 0.35f, 0.42f, 0.28f, 0.32f }, kC[4] { 0.50f, 0.65f, 0.70f, 0.55f }, kF[4] { 0.45f, 0.62f, 0.55f, 0.48f };
        st.p1 = kT[i]; st.p2 = kC[i]; st.p3 = kF[i]; st.p4 = kM[i];
    } else if (st.engineType == McxRackEngineType::Re201Wdf) {
        static constexpr float kD[4] { 0.60f, 0.45f, 0.82f, 0.35f }, kS[4] { 0.55f, 0.40f, 0.75f, 0.30f }, kSp[4] { 0.35f, 0.55f, 0.68f, 0.15f }, kB[4] { 0.50f, 0.58f, 0.65f, 0.45f }, kT[4] { 0.50f, 0.60f, 0.42f, 0.72f };
        st.p1 = kD[i]; st.p2 = kS[i]; st.p3 = kSp[i]; st.p4 = kB[i]; st.p5 = kT[i];
    } else if (st.engineType == McxRackEngineType::Kr106Chorus) {
        static constexpr float kM[4] { 0.00f, 0.50f, 1.00f, 0.00f }, kD[4] { 0.50f, 0.55f, 0.45f, 0.85f }, kN[4] { 0.70f, 0.75f, 0.65f, 1.00f }, kR[4] { 0.50f, 0.50f, 0.50f, 0.58f };
        st.p1 = kR[i]; st.p2 = kD[i]; st.p3 = kM[i]; st.p4 = kN[i];
    } else if (presetIdx == 0) { st.p1 = 0.35f; st.p2 = 0.45f; }
    else if (presetIdx == 1) { st.p1 = 0.65f; st.p2 = 0.30f; }
    else if (presetIdx == 2) { st.p1 = 0.80f; st.p2 = 0.70f; }
    else { st.p1 = 0.50f; st.p2 = 0.50f; }
    setSlotParams(slotIdx, st.p1, st.p2, st.dryWetMix);
}

} // namespace abdmcx
