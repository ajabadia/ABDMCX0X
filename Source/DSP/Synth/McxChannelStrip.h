/*
  ==============================================================================

    McxChannelStrip.h
    Per-Part Channel Strip for ABDMCX0X:
      - 3-band Parametric EQ (Low Shelf, Mid Peak/Dip with Q, High Shelf)
      - Drive / Tube Saturation with automatic gain compensation
      - Level, Equal-Power Panning, Mute, Solo
      - 4 Aux/Effect Sends (Send A..D: Reverb, Chorus, Delay, Aux) with Pre/Post

    CANONICAL LOCATION: ABDMCX0X/Source/DSP/Synth/McxChannelStrip.h
    NAMESPACE: abdmcx

  ==============================================================================
*/

#pragma once

#include "DspEffects/DspSaturation.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace abdmcx
{

struct McxChannelStripParams
{
    // EQ
    bool eqEnabled { false };
    float eqLowFreqHz { 100.0f };
    float eqLowGainDb { 0.0f };
    float eqMidFreqHz { 1000.0f };
    float eqMidGainDb { 0.0f };
    float eqMidQ { 1.0f };
    float eqHighFreqHz { 8000.0f };
    float eqHighGainDb { 0.0f };

    // Drive
    bool driveEnabled { false };
    float driveAmount { 0.0f }; // [0.0 .. 1.0]

    // Fader & Pan
    float level { 0.85f };
    float pan { 0.0f };
    bool mute { false };
    bool solo { false };

    // 4 Sends
    float sendA { 0.25f }; // Reverb
    bool sendAPre { false };
    float sendB { 0.10f }; // Chorus
    bool sendBPre { false };
    float sendC { 0.0f };  // Delay
    bool sendCPre { false };
    float sendD { 0.0f };  // Aux
    bool sendDPre { false };
};

class McxChannelStrip
{
public:
    struct Biquad
    {
        float b0 { 1.0f }, b1 { 0.0f }, b2 { 0.0f };
        float a1 { 0.0f }, a2 { 0.0f };
        float s1 { 0.0f }, s2 { 0.0f };

        void reset() noexcept { s1 = 0.0f; s2 = 0.0f; }
        void copyCoeffsFrom(const Biquad& o) noexcept { b0 = o.b0; b1 = o.b1; b2 = o.b2; a1 = o.a1; a2 = o.a2; }

        inline float process(float in) noexcept
        {
            const float out = b0 * in + s1;
            s1 = b1 * in - a1 * out + s2;
            s2 = b2 * in - a2 * out;
            return out;
        }

        void setLowShelf(float sampleRate, float freqHz, float gainDb) noexcept
        {
            const float A = std::pow(10.0f, gainDb / 40.0f);
            const float w0 = 6.2831853f * std::clamp(freqHz, 20.0f, sampleRate * 0.48f) / sampleRate;
            const float cosw = std::cos(w0);
            const float sinw = std::sin(w0);
            const float alpha = sinw / 2.0f * std::sqrt((A + 1.0f / A) * (1.0f / 0.7071f - 1.0f) + 2.0f);
            const float twoSqrtAAlpha = 2.0f * std::sqrt(A) * alpha;

            const float a0 = (A + 1.0f) + (A - 1.0f) * cosw + twoSqrtAAlpha;
            b0 = (A * ((A + 1.0f) - (A - 1.0f) * cosw + twoSqrtAAlpha)) / a0;
            b1 = (2.0f * A * ((A - 1.0f) - (A + 1.0f) * cosw)) / a0;
            b2 = (A * ((A + 1.0f) - (A - 1.0f) * cosw - twoSqrtAAlpha)) / a0;
            a1 = (-2.0f * ((A - 1.0f) + (A + 1.0f) * cosw)) / a0;
            a2 = ((A + 1.0f) + (A - 1.0f) * cosw - twoSqrtAAlpha) / a0;
        }

        void setHighShelf(float sampleRate, float freqHz, float gainDb) noexcept
        {
            const float A = std::pow(10.0f, gainDb / 40.0f);
            const float w0 = 6.2831853f * std::clamp(freqHz, 20.0f, sampleRate * 0.48f) / sampleRate;
            const float cosw = std::cos(w0);
            const float sinw = std::sin(w0);
            const float alpha = sinw / 2.0f * std::sqrt((A + 1.0f / A) * (1.0f / 0.7071f - 1.0f) + 2.0f);
            const float twoSqrtAAlpha = 2.0f * std::sqrt(A) * alpha;

            const float a0 = (A + 1.0f) - (A - 1.0f) * cosw + twoSqrtAAlpha;
            b0 = (A * ((A + 1.0f) + (A - 1.0f) * cosw + twoSqrtAAlpha)) / a0;
            b1 = (-2.0f * A * ((A - 1.0f) + (A + 1.0f) * cosw)) / a0;
            b2 = (A * ((A + 1.0f) + (A - 1.0f) * cosw - twoSqrtAAlpha)) / a0;
            a1 = (2.0f * ((A - 1.0f) - (A + 1.0f) * cosw)) / a0;
            a2 = ((A + 1.0f) - (A - 1.0f) * cosw - twoSqrtAAlpha) / a0;
        }

        void setPeak(float sampleRate, float freqHz, float gainDb, float Q) noexcept
        {
            const float A = std::pow(10.0f, gainDb / 40.0f);
            const float w0 = 6.2831853f * std::clamp(freqHz, 20.0f, sampleRate * 0.48f) / sampleRate;
            const float cosw = std::cos(w0);
            const float sinw = std::sin(w0);
            const float alpha = sinw / (2.0f * std::max(0.1f, Q));

            const float a0 = 1.0f + alpha / A;
            b0 = (1.0f + alpha * A) / a0;
            b1 = (-2.0f * cosw) / a0;
            b2 = (1.0f - alpha * A) / a0;
            a1 = (-2.0f * cosw) / a0;
            a2 = (1.0f - alpha / A) / a0;
        }
    };

    McxChannelStrip() noexcept = default;

    void prepare(double sampleRate) noexcept
    {
        sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
        dirtyCoeffs_ = true;
        reset();
    }

    void reset() noexcept
    {
        eqLowL_.reset();  eqLowR_.reset();
        eqMidL_.reset();  eqMidR_.reset();
        eqHighL_.reset(); eqHighR_.reset();
    }

    void process(float* inOutL,
                 float* inOutR,
                 float* sendAL, float* sendAR,
                 float* sendBL, float* sendBR,
                 float* sendCL, float* sendCR,
                 float* sendDL, float* sendDR,
                 int numSamples,
                 const McxChannelStripParams& p,
                 bool isAudible) noexcept
    {
        if (numSamples <= 0 || !inOutL || !inOutR)
            return;

        if (dirtyCoeffs_ || eqLowGainDb_ != p.eqLowGainDb || eqLowFreqHz_ != p.eqLowFreqHz ||
            eqMidGainDb_ != p.eqMidGainDb || eqMidFreqHz_ != p.eqMidFreqHz || eqMidQ_ != p.eqMidQ ||
            eqHighGainDb_ != p.eqHighGainDb || eqHighFreqHz_ != p.eqHighFreqHz)
        {
            updateEqCoeffs(p);
        }

        const float driveGain = 1.0f + p.driveAmount * 4.0f;
        const float driveComp = 1.0f / std::sqrt(1.0f + p.driveAmount * 3.0f);
        const bool applyDrive = p.driveEnabled && p.driveAmount > 0.005f;

        // Pan law: equal-power sine/cosine
        const float panNorm = std::clamp(p.pan, -1.0f, 1.0f);
        const float panAngle = (panNorm + 1.0f) * 0.25f * 3.14159265f;
        const float panL = std::cos(panAngle) * 1.41421356f;
        const float panR = std::sin(panAngle) * 1.41421356f;

        const float faderGainL = isAudible ? (p.level * panL) : 0.0f;
        const float faderGainR = isAudible ? (p.level * panR) : 0.0f;

        for (int i = 0; i < numSamples; ++i)
        {
            float l = inOutL[i];
            float r = inOutR[i];

            // 1. EQ
            if (p.eqEnabled)
            {
                l = eqHighL_.process(eqMidL_.process(eqLowL_.process(l)));
                r = eqHighR_.process(eqMidR_.process(eqLowR_.process(r)));
            }

            // 2. Drive
            if (applyDrive)
            {
                l = abd::dsp::Saturation::processSample(l, driveGain) * driveComp;
                r = abd::dsp::Saturation::processSample(r, driveGain) * driveComp;
            }

            // 3. Pre-Fader Sends (tap after EQ/Drive, before Fader/Mute)
            if (p.sendAPre && sendAL && sendAR) { sendAL[i] += l * p.sendA; sendAR[i] += r * p.sendA; }
            if (p.sendBPre && sendBL && sendBR) { sendBL[i] += l * p.sendB; sendBR[i] += r * p.sendB; }
            if (p.sendCPre && sendCL && sendCR) { sendCL[i] += l * p.sendC; sendCR[i] += r * p.sendC; }
            if (p.sendDPre && sendDL && sendDR) { sendDL[i] += l * p.sendD; sendDR[i] += r * p.sendD; }

            // 4. Fader & Pan
            const float postL = l * faderGainL;
            const float postR = r * faderGainR;

            // 5. Post-Fader Sends (tap after Fader/Mute)
            if (!p.sendAPre && sendAL && sendAR) { sendAL[i] += postL * p.sendA; sendAR[i] += postR * p.sendA; }
            if (!p.sendBPre && sendBL && sendBR) { sendBL[i] += postL * p.sendB; sendBR[i] += postR * p.sendB; }
            if (!p.sendCPre && sendCL && sendCR) { sendCL[i] += postL * p.sendC; sendCR[i] += postR * p.sendC; }
            if (!p.sendDPre && sendDL && sendDR) { sendDL[i] += postL * p.sendD; sendDR[i] += postR * p.sendD; }

            // 6. Direct output into Master bus
            inOutL[i] = postL;
            inOutR[i] = postR;
        }
    }

private:
    void updateEqCoeffs(const McxChannelStripParams& p) noexcept
    {
        const float sr = static_cast<float>(sampleRate_);
        eqLowFreqHz_ = p.eqLowFreqHz;
        eqLowGainDb_ = p.eqLowGainDb;
        eqMidFreqHz_ = p.eqMidFreqHz;
        eqMidGainDb_ = p.eqMidGainDb;
        eqMidQ_ = p.eqMidQ;
        eqHighFreqHz_ = p.eqHighFreqHz;
        eqHighGainDb_ = p.eqHighGainDb;

        eqLowL_.setLowShelf(sr, eqLowFreqHz_, eqLowGainDb_);
        eqLowR_.copyCoeffsFrom(eqLowL_);

        eqMidL_.setPeak(sr, eqMidFreqHz_, eqMidGainDb_, eqMidQ_);
        eqMidR_.copyCoeffsFrom(eqMidL_);

        eqHighL_.setHighShelf(sr, eqHighFreqHz_, eqHighGainDb_);
        eqHighR_.copyCoeffsFrom(eqHighL_);

        dirtyCoeffs_ = false;
    }

    double sampleRate_ { 44100.0 };
    bool dirtyCoeffs_ { true };

    float eqLowFreqHz_ { 100.0f };
    float eqLowGainDb_ { 0.0f };
    float eqMidFreqHz_ { 1000.0f };
    float eqMidGainDb_ { 0.0f };
    float eqMidQ_ { 1.0f };
    float eqHighFreqHz_ { 8000.0f };
    float eqHighGainDb_ { 0.0f };

    Biquad eqLowL_ {},  eqLowR_ {};
    Biquad eqMidL_ {},  eqMidR_ {};
    Biquad eqHighL_ {}, eqHighR_ {};
};

} // namespace abdmcx
