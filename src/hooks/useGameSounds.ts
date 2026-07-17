import { useCallback, useEffect, useRef } from 'react';

// ============================================================================
// Piano Tiles-style sound system
// - Additive-synthesis piano voice (fundamentals + harmonics + fast attack)
// - Each merge advances the current song by one note, so successful play
//   gradually reveals a familiar melody.
// - On big milestones (1024, 2048) we play a small celebratory flourish.
// ============================================================================

const SONGS: { name: string; notes: number[] }[] = [
  {
    name: 'Für Elise',
    notes: [
      659.25, 622.25, 659.25, 622.25, 659.25, 493.88, 587.33, 523.25, 440.0,
      261.63, 329.63, 440.0, 493.88, 329.63, 415.3, 493.88, 523.25,
    ],
  },
  {
    name: 'Ode to Joy',
    notes: [
      329.63, 329.63, 349.23, 392.0, 392.0, 349.23, 329.63, 293.66, 261.63,
      261.63, 293.66, 329.63, 329.63, 293.66, 293.66,
    ],
  },
  {
    name: 'Twinkle Twinkle',
    notes: [
      261.63, 261.63, 392.0, 392.0, 440.0, 440.0, 392.0, 349.23, 349.23,
      329.63, 329.63, 293.66, 293.66, 261.63,
    ],
  },
];

function playPianoNote(ctx: AudioContext, freq: number, when: number, dur = 1.2, velocity = 0.35) {
  // Additive synth: fundamental + inharmonic partials, each with its own envelope.
  // Rough emulation of a felted piano — soft attack, long natural decay.
  const master = ctx.createGain();
  master.gain.value = velocity;
  master.connect(ctx.destination);

  const partials = [
    { mult: 1, gain: 1.0, decay: dur },
    { mult: 2, gain: 0.5, decay: dur * 0.75 },
    { mult: 3, gain: 0.22, decay: dur * 0.55 },
    { mult: 4, gain: 0.14, decay: dur * 0.4 },
    { mult: 5.02, gain: 0.08, decay: dur * 0.3 },
  ];

  partials.forEach(({ mult, gain, decay }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = mult === 1 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq * mult, when);
    // Piano-like ADSR: fast attack, exponential decay
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, when + decay);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + decay + 0.05);
  });

  // Subtle hammer noise burst for realism
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  noise.buffer = noiseBuffer;
  noiseGain.gain.value = 0.05 * velocity;
  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(when);
}

export function useGameSounds() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const songIdxRef = useRef(0);
  const noteIdxRef = useRef(0);

  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    };
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, []);

  // Soft tick on every valid move — very quiet, doesn't fatigue
  const playMoveSound = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    playPianoNote(ctx, 261.63, now, 0.35, 0.08); // low C, ambient
  }, []);

  // Advance the current melody by one note. Call this on every merge.
  const playMergeNote = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const song = SONGS[songIdxRef.current];
    const note = song.notes[noteIdxRef.current];
    playPianoNote(ctx, note, ctx.currentTime, 1.1, 0.32);
    noteIdxRef.current += 1;
    if (noteIdxRef.current >= song.notes.length) {
      noteIdxRef.current = 0;
      songIdxRef.current = (songIdxRef.current + 1) % SONGS.length;
    }
  }, []);

  // Milestone flourish — arpeggio + sustained chord
  const playMilestoneSound = useCallback((value: number) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord =
      value >= 2048
        ? [523.25, 659.25, 783.99, 1046.5] // C major triad + octave
        : value >= 512
          ? [440.0, 554.37, 659.25, 880.0]
          : [329.63, 415.3, 493.88, 659.25];

    chord.forEach((f, i) => playPianoNote(ctx, f, now + i * 0.09, 1.5, 0.28));
    // Sustained final chord
    chord.forEach((f) => playPianoNote(ctx, f, now + chord.length * 0.09 + 0.1, 2.2, 0.22));
  }, []);

  const resetMelody = useCallback(() => {
    noteIdxRef.current = 0;
  }, []);

  return { playMoveSound, playMergeNote, playMilestoneSound, resetMelody };
}
