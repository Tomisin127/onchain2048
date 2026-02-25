import { useCallback, useEffect, useRef } from 'react';

export function useGameSounds() {
  const audioContextRef = useRef<AudioContext | null>(null);

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

  const playMoveSound = useCallback(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // Soft marimba-like tone: a warm fundamental with a gentle harmonic
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    // Pentatonic notes for a pleasant, non-fatiguing sound
    const notes = [523, 587, 659, 784, 880]; // C5, D5, E5, G5, A5
    const note = notes[Math.floor(Math.random() * notes.length)];

    osc1.frequency.setValueAtTime(note, now);
    osc2.frequency.setValueAtTime(note * 2, now); // octave harmonic

    // Soft attack, quick decay — like a gentle tap
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.03, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(ctx.destination);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.2);
  }, []);

  const playMilestoneSound = useCallback((value: number) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // Ascending arpeggio — more magical for big milestones
    const notes = value >= 2048
      ? [784, 988, 1175, 1568] // G5 B5 D6 G6 (major chord)
      : [659, 784, 988, 1175]; // E5 G5 B5 D6

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.start(t);
      osc.stop(t + 0.4);
    });
  }, []);

  return { playMoveSound, playMilestoneSound };
}
