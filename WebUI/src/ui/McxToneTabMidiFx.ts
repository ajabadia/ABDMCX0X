/**
 * ABDMCX0X -- McxToneTabMidiFx.ts
 * Tab 3 ("MIDI FX"): Groove Arpeggiator, Global Scale/Transpose link,
 * quick launchers for Piano Roll & Groove/Shuffle, and non-destructive macro offsets.
 * Strict line limit: < 200 lines.
 */

export function buildMidiFxTabHtml(): string {
  return `
    <div class="mcx-midifx-grid">
      <!-- ETAPA 1: FUENTES DE SECUENCIA Y ENTRADA -->
      <section class="mcx-module-card mcx-card-seq-links" title="Fuentes de notas y edición de patrones para esta pista">
        <div class="mcx-module-head">
          <span class="mcx-module-title">1. FUENTES &amp; SECUENCIA</span>
          <span class="mcx-module-badge">IN/SEQ</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <span class="mcx-midifx-summary" id="mcx-midifx-seq-summary">1 compás · 0 notas · Swing 50%</span>
          <div class="mcx-midifx-actions">
            <button type="button" class="mcx-midifx-action-btn" data-act="open-seq">Piano Roll (Pianola) ↗</button>
            <button type="button" class="mcx-midifx-action-btn" data-act="open-pads">Pads MPC (4x4) ↗</button>
            <button type="button" class="mcx-midifx-action-btn" data-act="open-groove">Groove &amp; Swing ↗</button>
          </div>
          <p class="mcx-midifx-hint">Grabación a tiempo real (cuantizada) o edición por pasos en pianola.</p>
        </div>
      </section>

      <!-- ETAPA 2: INSERCIÓN MIDI 1 (ARPEGIADOR GROOVE) -->
      <section class="mcx-module-card mcx-card-arp" title="Inserción MIDI: Arpegiador polifónico sincronizado al tempo">
        <div class="mcx-module-head">
          <span class="mcx-module-title">2. INSERCIÓN: ARPEGIADOR</span>
          <span class="mcx-module-badge is-fx">ARP FX</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <button type="button" class="mcx-midifx-toggle-btn" id="mcx-drawer-arp-btn" data-act="drawer-arp">
            ARPEGIADOR: APAGADO
          </button>
          <div class="mcx-midifx-actions">
            <button type="button" class="mcx-midifx-action-btn" data-act="open-arp">Configurar Arpegiador ↗</button>
          </div>
          <p class="mcx-midifx-hint">Genera patrones rítmicos Up/Down/Random/Chord con swing y compuerta ajustable.</p>
        </div>
      </section>

      <!-- ETAPA 3: INSERCIÓN MIDI 2 (ESCALA Y TRANSPOSICIÓN) -->
      <section class="mcx-module-card mcx-card-scale" title="Inserción MIDI: Cuantización de escala y transposición musical">
        <div class="mcx-module-head">
          <span class="mcx-module-title">3. ESCALA &amp; TRANSPOSICIÓN</span>
          <span class="mcx-module-badge">PITCH FX</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <button type="button" class="mcx-midifx-toggle-btn is-active" id="mcx-midifx-tr-btn" data-act="drawer-tr">
            SEGUIR TRANSPOSICIÓN: ON
          </button>
          <p class="mcx-midifx-hint" id="mcx-midifx-tr-hint">Las notas cromáticas siguen la tonalidad y transposición global en vivo.</p>
        </div>
      </section>

      <!-- ETAPA 4: MACROS Y OFFSETS SEMÁNTICOS DE PISTA -->
      <section class="mcx-module-card mcx-card-offsets" title="Offsets semánticos no destructivos por pista">
        <div class="mcx-module-head">
          <span class="mcx-module-title">4. MACROS DE PISTA</span>
          <span class="mcx-module-badge">TRK MOD</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <p class="mcx-midifx-hint" id="mcx-midifx-offset-summary">Offsets no destructivos (Corte, Reso, ADSR, Vibrato) en reposo (0%).</p>
          <div class="mcx-midifx-actions">
            <button type="button" class="mcx-midifx-action-btn" data-act="reset-offsets">Restablecer Macros a 0%</button>
            <span class="mcx-midifx-future-pill">Chords / Note Repeat · Próximamente</span>
          </div>
        </div>
      </section>
    </div>
  `;
}
