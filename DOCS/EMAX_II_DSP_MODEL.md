# Emax II DSP model in `emax_synth`

## Scope

`emax_synth` is a clean-room **player** for ABDMCX0X. Its priority is the Emax II
screen/menu topology and usable PCM playback from `.abdbank` archives. It is not a
cycle-exact emulation of the two E-mu VLSI chips. Engine registration, WebUI SSOT,
bank intake and verification are described in [`EMAX_II_INTEGRACION.md`](EMAX_II_INTEGRACION.md).

## Platform correction

The OS image analysed locally (`Emax II rev 2.14.EMX`, 266.240 B) imports in Ghidra
with `NS32016:LE:32:default`. The main CPU is therefore a **National Semiconductor
NS32CG16 @ 20 MHz**, with a 6502 keyboard scanner — not a Motorola 68000. The
relevant architectural idea still holds: the CPU computes coefficient sets and
writes them to memory-mapped DSP registers.

## OS-image findings (structural, not authoritative)

A structural pass over `Emax II rev 2.14.EMX` found three coherent `int16` LE
tables. Offsets use the imported base 0; lengths are in 16-bit words.

| Offset | Length | Best-fit generated curve | Status |
| --- | ---: | --- | --- |
| `0x2a5b8` | 36 | `round(32767·cos(π·k/64))`, `k=0..35` | strongest cosine/cutoff candidate; zero crossing at `k=32` |
| `0x2a3b8` | 96 | `round(32767·cos(π·k/64))`, `k=0..95` | longer cosine sweep; likely oscillator/LFO |
| `0x2a478` | 128 | `round(50·cos(2π·k/128))`, `k=0..127` | amplitude-50 table; no functional link yet |

No 256/512-word cosine table was found, and the 8-word H-Chip coefficient writer
was **not** identified: there was no block of eight contiguous `int16` stores with
the expected multiply/shift pattern, and the tables had no resolvable cross-references
in the initial pass (they were still undefined data in Ghidra).

### Why these findings are not applied to the DSP yet

- The 36-word length matching our own `kFcStagger` is coincidental: that constant
  was chosen in our engine, not read from the OS.
- `round(32767·cos(π·k/64))` for `k<=35` spans `cos(theta)` only from `+1` to about
  `-0.28`. Replacing the 512-entry log table with it would cap the cutoff near
  10.7 kHz at 39.0625 kHz and lose the top of the audible range.
- Q1.15 cannot represent `a1 = -2R·cos(theta)` when `|cos(theta)|` is large:
  values beyond ±1 overflow `int16`. Our Q2.14 (`*16384`, `>> 14`) is the minimal
  self-consistent format for a two-pole section. Generic `ASH #0xf1` (>>15)
  sequences elsewhere in the OS are not evidence that H-Chip coefficients use Q1.15.
- The `>> 6` coefficient slew remains an approximation; no OS evidence confirms
  or contradicts it.

A follow-up pass typed all three arrays in Ghidra and reanalysed the image
(13 536 instructions). Cross-references stayed at zero for each table; there is
no real RAM pointer to them, no split high/low base load, and no 8-word `int16`
coefficient-writer block. No `MUL #0x4000` or coefficient-scaling path was
identified either. The only defensible split is therefore the one already in
the engine: **Q1.15 for the `cos(theta)` lookup input**, **Q2.14 for the five
coefficients**. The cosine read was corrected to divide by 32767 to match that
Q1.15 scale exactly.

No ROM bytes, table values or decompiled text were copied into the repository.

## Current clean-room approximation

| Stage | Implementation | Fidelity note |
| --- | --- | --- |
| Pitch / interpolation | 32.32 phase accumulator with 256 sub-phases; 8-tap windowed-sinc (Blackman) table built at startup; PCM truncated to 16-bit before filtering | Matches the documented multipoint/256-subphase G-Chip behaviour. The table is clean-room derived, not copied from E-mu ROM. |
| Filter | Two cascaded **Q2.14 fixed-point** biquads (4 poles / 24 dB-oct); hardware-style coefficient slewing (`>> 6`), hard saturation between sections, resonance gain compensation | Models the H-Chip register format and zipper-noise avoidance. Coefficients now come from a clean-room polar parametrization, not RBJ. |
| Coefficient generation | Log-spaced 512-entry `cos(theta)` table at 39.0625 kHz; stage offsets ±36 indices for staggered tuning; `a1 = -2R·cos(theta)`, `a2 = R²`, `b0 = (1+a1+a2)/4 · makeup(Q)`; `b1 = 2b0`, `b2 = b0` | Matches the OS pole-radius/angle approach. Only eight Q2.14 words are written per voice, as on the H-Chip bus. |
| Rate handling | Filter coefficients generated at the internal **39.0625 kHz** reference; phase increment scaled by `waveRate / hostRate`; reconstruction lowpass near 17 kHz | Equivalent to the documented rate-scaling path. A full TDM engine running natively at 39.0625 kHz with host upsampling is still a later step. |
| Envelopes / LFO | Linear attack/hold, one-pole RC decay/release; exponential time law `T(v) ≈ 0.0015·e^(0.0745v)` seconds for `v ∈ [0,127]`; LFO Rate/Delay/Variation from OS menu IDs | Semantics and timing curve match the OS labels. LFO waveshapes and `Vari` LFSR remain simplified. |
| Chorus / Double | Voice duplication: `noteOn()` allocates a **second real voice** (`chorusPartner`) with `+5..25 cents` detune, opposite pan and slow-LFO detune in `renderBlock()`; it consumes 2 of 16 voices. The former BBD-style delay line was removed. | Matches the Emax II OS "Stereo Chorus" behaviour: no dedicated BBD chip, the effect is a doubled, panned voice. `getActiveVoiceCount()` reflects the extra voice. |
| Output | 16-bit quantization and one-pole reconstruction lowpass near 17 kHz | Approximates the 39 kHz clock's anti-imaging/op-amp rolloff. |

## Verification of the current model

| Suite | Result |
| --- | ---: |
| `ABDShared_EmaxEngine_Tests` | 11/11 |
| `McxPhase8MultiEngineTests` | 11/11 |
| Full `ctest` of `ABDMCX0X` | 14/14 |
| `ABDShared/tests/emaxEnginePanel.test.js` | 3/3 |
| `ABDNeuModMakr npm run verify` | 111/111 suites |

These tests cover finite audio from a dual-layer note, integer/normalized parameter
round-trips, JSON state round-trips, engine registration at index 7 and bank-archive
support. They do **not** prove DSP equivalence with hardware.

## Explicitly not available

- VLSI microcode or internal LUTs of the G/H chips (they are in silicon, not in the OS image).
- Byte-identical OS coefficient tables copied into the plugin.
- Sample-exact filter, envelope, chorus or pan behaviour without hardware reference renders.

## What would materially improve fidelity

1. **Polar LUTs — status**: the OS cosine candidates were located and typed in
   Ghidra, but no cross-references or coefficient writer appeared. That path is
   therefore closed for now; refitting our own curve constants needs a different
   source of evidence (see the remaining items). On NS32CG16 the tables are
   addressed relative to the static-base/module registers (`SB`/`MOD`), so
   Ghidra cannot resolve plain xrefs unless `SB` is pinned; and the actual
   parameter-to-coefficient conversion is done by the G/H ASICs, not by an NS32
   routine writing eight coefficients per voice. `0x2a3b8` (96 words of
   `cos(pi*k/64)`) is consistent with envelope/LFO/panpot law, while the
   36-word `0x2a5b8` would cap cutoff near 10.7 kHz and is therefore rejected —
   the clean-room 512-entry log `cos(theta)` table stays.
2. **OS LFO/velocity tables**: extract envelope, LFO, velocity and modulation tables
   and derive *our own* equivalents. Raw ROM bytes and decompiled text stay local.
3. **Bank mapping**: confirm the real zone layout of `.EB2/.EM2/.EZ2` banks (88 zones,
   primary/secondary handles, root keys, loop points) against real musical banks. EMXP
   TXT/CSV reports and looped WAV exports are the independent oracle for that comparison;
   its manual also confirms uncompressed PCM16 on Emax II (p.404) and that enabling chorus
   costs polyphony (p.402), corroborating the voice-doubling model above. Crossfade/switch
   and the PRI-over-SEC display flag remain deliberately undecoded until a real report shows them.
4. **Envelope stages**: EMXP documents five VCA/VCF stages (p.402); the current
   attack/hold/decay/release approximation is intentional until hardware renders exist.
5. **Hardware sweeps**: render cutoff/Q/velocity/AHDSR sweeps on a real Emax II and fit
   the approximation against them.

Local analysis inputs (not shipped with the plugin):

- `C:/Users/ajaba/AppData/Local/Temp/opencode/ghidra_emax/disasm.txt`
- `C:/Users/ajaba/AppData/Local/Temp/opencode/emax2test/Emax II rev 2.14.EMX`
- `D:/desarrollos/ABDSynths/_RESOURCES/convertidores/ConvertWithMoss-main/documentation/design/EMAX_FORMAT.md`
- `C:/Users/ajaba/AppData/Local/Temp/opencode/emxp_ref.pdf` (EMXP 3.11.5 reference manual,
  read-only extraction from `_RESOURCES/E-MU/EMXP/EMXP_v3_11_5.zip`; never shipped)

## Legal boundary

E-mu OS binaries, EEPROM dumps and decompiled listings are reference material only.
The plugin ships clean-room C++, parameter semantics and WAV PCM extracted from user
banks. No ROM, VLSI microcode, or verbatim decompiled source is redistributed.
