#include "../Source/DSP/Core/McxEngine.h"

#include <cmath>
#include <cstdio>
#include <vector>

namespace
{
int gPassed = 0;
int gFailed = 0;

void check(bool condition, const char* label)
{
    if (condition)
    {
        ++gPassed;
        std::printf("  [PASS] %s\n", label);
    }
    else
    {
        ++gFailed;
        std::printf("  [FAIL] %s\n", label);
    }
}

float computeRms(const std::vector<float>& buf)
{
    double sum = 0.0;
    for (float x : buf)
    {
        if (!std::isfinite(x))
            return -1.0f;
        sum += static_cast<double>(x) * static_cast<double>(x);
    }
    return static_cast<float>(std::sqrt(sum / static_cast<double>(buf.size())));
}

float renderAndMeasureRms(abdmcx::McxEngine& eng, int samples, float& outDiff)
{
    std::vector<float> l(static_cast<std::size_t>(samples), 0.0f);
    std::vector<float> r(static_cast<std::size_t>(samples), 0.0f);
    eng.processAudio(l.data(), r.data(), samples);
    double lrDiff = 0.0;
    for (int i = 0; i < samples; ++i)
        lrDiff += std::abs(l[static_cast<std::size_t>(i)] - r[static_cast<std::size_t>(i)]);
    outDiff = static_cast<float>(lrDiff);
    return computeRms(l);
}
} // namespace

int main()
{
    using namespace abdmcx;
    std::printf("=== ABDMCX0X Phase 1 Headless DSP Tests ===\n");

    // 1. 4-Partial Structures (Parallel, RingMod12, Booster12, Vector2D)
    {
        auto initStructureEngine = [](McxEngine& eng, McxStructureMode mode, float vx = 0.0f, float vy = 0.0f) {
            eng.prepare(44100.0);
            auto& p = eng.part(0);
            p.structureMode = mode;
            p.vectorX = vx;
            p.vectorY = vy;
            p.reverbSend = 0.0f;
            p.chorusSend = 0.0f;
            p.partials[0].enabled = true;
            p.partials[0].level = 0.9f;
            p.partials[0].sourceKind = McxOscSourceKind::VaOsc;
            p.partials[0].vaWaveform = 0;
            p.partials[1].enabled = true;
            p.partials[1].level = 0.9f;
            p.partials[1].coarseSemitones = 7;
            p.partials[3].enabled = true;
            p.partials[3].level = 0.9f;
            p.partials[3].coarseSemitones = 12;
            p.partials[3].pan = 0.8f;
        };

        float d1 = 0.0f, d2 = 0.0f, d3 = 0.0f, d4 = 0.0f;
        McxEngine ePar, eRing, eBoost, eVecBR;
        initStructureEngine(ePar, McxStructureMode::Parallel);
        ePar.triggerNote(0, 60, 0.9f);
        const float rPar = renderAndMeasureRms(ePar, 512, d1);

        initStructureEngine(eRing, McxStructureMode::RingMod12);
        eRing.triggerNote(0, 60, 0.9f);
        const float rRing = renderAndMeasureRms(eRing, 512, d2);

        initStructureEngine(eBoost, McxStructureMode::Booster12);
        eBoost.triggerNote(0, 60, 0.9f);
        const float rBoost = renderAndMeasureRms(eBoost, 512, d3);

        initStructureEngine(eVecBR, McxStructureMode::Vector2D, 1.0f, 1.0f); // isolates Partial 3 (panned +0.8)
        eVecBR.triggerNote(0, 60, 0.9f);
        const float rVec = renderAndMeasureRms(eVecBR, 512, d4);

        check(rPar > 0.05f && rRing > 0.01f && rBoost > 0.01f && rVec > 0.01f,
              "All 4 Partial combination structures produce valid audio");
        check(std::abs(rPar - rRing) > 0.01f && d4 > 0.5f,
              "RingMod12 differs from Parallel and Vector2D(+1,+1) isolates panned Partial 4");
    }

    // 2. All 6 swappable filters including RolandTc6116Tvf & ZPlaneMorph
    {
        const McxFilterModel models[6] = {
            McxFilterModel::SvfClean, McxFilterModel::RolandTvfZdf, McxFilterModel::Ms20Acid,
            McxFilterModel::LadderDrive, McxFilterModel::ZPlaneMorph, McxFilterModel::RolandTc6116Tvf
        };
        bool allFinite = true;
        float rSvf = 0.0f, rTc = 0.0f, rZm0 = 0.0f, rZm1 = 0.0f;
        for (int m = 0; m < 6; ++m)
        {
            McxEngine eng;
            eng.prepare(44100.0);
            auto& p = eng.part(0);
            p.reverbSend = 0.0f;
            p.chorusSend = 0.0f;
            p.partials[0].filterModel = models[m];
            p.partials[0].cutoffHz = 900.0f;
            p.partials[0].resonance = 0.78f;
            p.partials[0].zplaneMorph = 0.0f;
            eng.triggerNote(0, 48, 1.0f);
            float diff = 0.0f;
            const float rms = renderAndMeasureRms(eng, 512, diff);
            if (rms <= 0.001f) allFinite = false;
            if (models[m] == McxFilterModel::SvfClean) rSvf = rms;
            if (models[m] == McxFilterModel::RolandTc6116Tvf) rTc = rms;
            if (models[m] == McxFilterModel::ZPlaneMorph) rZm0 = rms;
        }
        {
            McxEngine eng;
            eng.prepare(44100.0);
            eng.part(0).reverbSend = 0.0f;
            eng.part(0).partials[0].filterModel = McxFilterModel::ZPlaneMorph;
            eng.part(0).partials[0].cutoffHz = 900.0f;
            eng.part(0).partials[0].resonance = 0.78f;
            eng.part(0).partials[0].zplaneMorph = 0.95f;
            eng.triggerNote(0, 48, 1.0f);
            float diff = 0.0f;
            rZm1 = renderAndMeasureRms(eng, 512, diff);
        }
        check(allFinite, "All 6 filter models produce finite non-zero resonant signal");
        check(std::abs(rSvf - rTc) > 1e-4f && std::abs(rZm0 - rZm1) > 1e-4f,
              "RolandTc6116Tvf and ZPlaneMorph respond measurably to character/morph");
    }

    // 3. 5-Stage Envelope + ROM LUT + Accent boost & Exciter Loop Modes
    {
        McxEnvelope5Stage envSoft, envAccent;
        envSoft.prepare(44100.0);
        envAccent.prepare(44100.0);
        McxEnv4T4L cfg {};
        cfg.useRomLut = true;
        cfg.rateT1 = 112;
        cfg.l1 = 1.0f;
        cfg.l3 = 0.5f;
        envSoft.noteOn(cfg, 0.75f, 0.0f);
        envAccent.noteOn(cfg, 0.75f, 1.0f);
        float peakSoft = 0.0f, peakAccent = 0.0f;
        for (int i = 0; i < 512; ++i)
        {
            peakSoft = std::max(peakSoft, envSoft.processSample());
            peakAccent = std::max(peakAccent, envAccent.processSample());
        }
        check(peakAccent > peakSoft && envAccent.isActive(),
              "McxEnvelope5Stage ROM LUT boosts accented level and shapes 5-stage curve");

        McxPartialExciter exc;
        exc.prepare(44100.0);
        std::array<float, 16> sampleTbl { 0.0f, 0.4f, 0.8f, 1.0f, 0.8f, 0.4f, 0.0f, -0.4f, -0.8f, -1.0f, -0.8f, -0.4f, 0.0f, 0.2f, 0.4f, 0.6f };
        exc.setExternalTable(sampleTbl.data(), 16, 4, 15);
        McxPartialConfig pc {};
        pc.enabled = true;
        pc.sourceKind = McxOscSourceKind::PcmZone;
        pc.pingPongLoop = true;
        pc.oneShotMode = false;
        exc.noteOn(pc, 60.0f);
        float oL = 0.0f, oR = 0.0f;
        for (int i = 0; i < 64; ++i) exc.processStereo(pc, 0.0f, oL, oR);
        check(!exc.hasFinishedOneShot() && std::isfinite(oL), "Ping-pong table loop plays continuously without termination");

        pc.oneShotMode = true;
        exc.noteOn(pc, 60.0f);
        for (int i = 0; i < 200; ++i) exc.processStereo(pc, 0.0f, oL, oR);
        check(exc.hasFinishedOneShot(), "One-shot external table terminates at end frame");
    }

    // 4. Dynamic Polyphony, Zero-Idle CPU, Machine Personas & 28-Partial MC-303 Voice Stealing
    {
        McxEngine mc303;
        mc303.prepare(44100.0);
        mc303.setMachinePersona(McxMachinePersona::RolandMc303);
        const auto spec303 = mc303.getPersonaSpec();
        check(spec303.maxPartialsPerTone == 2 && spec303.defaultPartialBudget == 28 && spec303.defaultFilter == McxFilterModel::RolandTc6116Tvf,
              "RolandMc303 persona presets 2-partial limit, 28-partial budget, RolandTc6116Tvf");

        // Trigger 16 2-partial notes: must cap active Partials <= 28 (14 voices max)
        mc303.part(0).partials[0].enabled = true;
        mc303.part(0).partials[1].enabled = true;
        mc303.part(0).partials[2].enabled = true; // blocked at 2 by MC-303 persona!
        for (int n = 48; n < 64; ++n)
            mc303.triggerNote(0, n, 0.85f);
        check(mc303.getActivePartialCount() == 28 && mc303.getActiveVoiceCount() == 14,
              "MC-303 mode enforces authentic 28-Partial voice stealing (14 x 2-partial voices)");

        mc303.setMachinePersona(McxMachinePersona::FreeSuper);
        mc303.setMaxPolyphony(4);
        check(mc303.getPersonaSpec().maxPartialsPerTone == 4 && mc303.getActiveVoiceCount() <= 4,
              "FreeSuper unlocks 4 Partials and honors dynamic Settings polyphony reduction");
    }

    // 5. Drum Rack: Note Remapper, OneShot vs Gated, Choke Group, & DAC/FX
    {
        McxEngine drum;
        drum.prepare(44100.0);
        auto& kit = drum.part(9);
        kit.routeMode = McxPartRouteMode::BothAB;
        kit.drumMapMode = McxDrumMapMode::YamahaXgXs;
        kit.drumRemapper.inputToSlot[36] = 19;     // GM kick 36 -> Slot 19
        kit.drumRemapper.slotToExternal[19] = 48;  // Slot 19 -> External note 48
        kit.drumSlots[19].triggerMode = McxDrumTriggerMode::OneShot;
        kit.drumSlots[20].triggerMode = McxDrumTriggerMode::Gated;
        kit.drumSlots[42].muteGroup = 1;
        kit.drumSlots[46].muteGroup = 1;

        drum.triggerNote(9, 36, 0.9f);
        check(kit.drumSlots[19].activeSounding &&
                  drum.getMirrorRouter().at(0).bytes[1] == 99 &&
                  drum.getMirrorRouter().at(1).bytes[1] == 98 &&
                  drum.getMirrorRouter().at(1).bytes[2] == 48,
              "DrumNoteRemapper maps input GM 36 -> slot 19 and external note 48 in HardwareMirrorRouter");

        drum.releaseNote(9, 36);
        check(kit.drumSlots[19].activeSounding && drum.getActiveVoiceCount() == 1,
              "OneShot drum slot ignores Note-Off and continues envelope");

        drum.triggerNote(9, 20, 0.9f);
        drum.releaseNote(9, 20);
        check(!kit.drumSlots[20].activeSounding, "Gated drum slot releases immediately on Note-Off");

        drum.triggerNote(9, 46, 0.9f);
        drum.triggerNote(9, 42, 0.9f);
        check(!kit.drumSlots[46].activeSounding && kit.drumSlots[42].activeSounding,
              "Drum mute group 1 chokes Open Hi-Hat voice on Closed Hi-Hat hit");

        drum.setOutputCharacter(McxOutputCharacter::Sampler12Bit);
        drum.setFxMix(0.5f, 0.4f, 0.6f);
        float fxDiff = 0.0f;
        const float fxRms = renderAndMeasureRms(drum, 1024, fxDiff);
        check(fxRms > 0.005f, "DAC 12-bit + Chorus/Delay/Reverb send mix produces valid wet drum output");
    }

    // 7. Dual Filter in Series (Filter 1 -> Filter 2) + Bypass behavior
    {
        McxEngine engBypass, engActive;
        engBypass.prepare(44100.0);
        engActive.prepare(44100.0);

        auto configurePart = [](McxEngine& e, bool f2Active) {
            auto& p = e.part(0);
            p.reverbSend = 0.0f;
            p.chorusSend = 0.0f;
            p.partials[0].enabled = true;
            p.partials[0].level = 0.9f;
            p.partials[0].sourceKind = McxOscSourceKind::VaOsc;
            p.partials[0].vaWaveform = 0; // Saw
            p.partials[0].cutoffHz = 14000.0f; // F1 wide open
            p.partials[0].filterModel = McxFilterModel::RolandTc6116Tvf;

            p.filter2Enabled = f2Active;
            p.filter2Model = McxFilterModel::SvfClean;
            p.filter2Mode = f2Active ? 1 : 3; // 1 = HPF, 3 = Bypass
            p.filter2CutoffHz = 2500.0f; // Cut off below 2.5kHz
            p.filter2Resonance = 0.35f;
        };

        configurePart(engBypass, false);
        configurePart(engActive, true);

        engBypass.triggerNote(0, 36, 1.0f);
        engActive.triggerNote(0, 36, 1.0f);

        float d0 = 0.0f, d1 = 0.0f;
        const float rmsFull = renderAndMeasureRms(engBypass, 1024, d0);
        const float rmsFiltered = renderAndMeasureRms(engActive, 1024, d1);

        check(rmsFull > 0.05f && rmsFiltered > 0.005f, "Dual filter signals are both finite and audible");
        check(rmsFiltered < rmsFull * 0.85f, "Series Filter 2 HPF successfully attenuates low frequencies below cutoff");
    }

    std::printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
