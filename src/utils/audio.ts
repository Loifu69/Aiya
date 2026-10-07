// Web Audio API procedural sound engine for water sounds and notification tones
import { SoundType } from '../types';

let audioCtx: AudioContext | null = null;
let currentWaterSource: {
  stop: () => void;
} | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playWaterSound(type: SoundType = 'river', volume = 0.8) {
  stopWaterSound();

  const ctx = getAudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.01, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(Math.max(0.1, Math.min(volume, 1)), ctx.currentTime + 0.3);
  masterGain.connect(ctx.destination);

  let isPlaying = true;
  let timerId: number | null = null;
  let noiseNode: AudioBufferSourceNode | null = null;

  if (type === 'river') {
    // Flowing river stream: shaped pink/white noise with resonant bandpass and bubbling modulations
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const output = noiseBuffer.getChannelData(channel);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.3 + white * 0.08;
      }
    }

    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    // Resonant filters to give water splash / stream body
    const filter1 = ctx.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.value = 650;
    filter1.Q.value = 1.8;

    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 2400;

    noiseNode.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(masterGain);
    noiseNode.start();

    // Spawn micro bubbling sines at random intervals to simulate bubbling river water
    const triggerBubble = () => {
      if (!isPlaying) return;
      try {
        const osc = ctx.createOscillator();
        const bGain = ctx.createGain();
        const startFreq = 700 + Math.random() * 900;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.6, ctx.currentTime + 0.12);

        bGain.gain.setValueAtTime(0.001, ctx.currentTime);
        bGain.gain.linearRampToValueAtTime(0.08 * volume, ctx.currentTime + 0.02);
        bGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

        osc.connect(bGain);
        bGain.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        // ignore audio quirks
      }

      if (isPlaying) {
        timerId = window.setTimeout(triggerBubble, 120 + Math.random() * 280);
      }
    };
    triggerBubble();
  } else if (type === 'droplets') {
    // Staggered rhythmic gentle water drops
    const triggerDrop = () => {
      if (!isPlaying) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const dropGain = ctx.createGain();
        const baseFreq = 1200 + Math.random() * 800;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.18);

        dropGain.gain.setValueAtTime(0.001, now);
        dropGain.gain.linearRampToValueAtTime(0.25 * volume, now + 0.02);
        dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(dropGain);
        dropGain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.25);
      } catch {
        // ignore
      }

      if (isPlaying) {
        timerId = window.setTimeout(triggerDrop, 250 + Math.random() * 350);
      }
    };
    triggerDrop();
  } else {
    // Gentle rain: soft noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const output = noiseBuffer.getChannelData(channel);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.25;
      }
    }

    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 1600;

    noiseNode.connect(rainFilter);
    rainFilter.connect(masterGain);
    noiseNode.start();
  }

  currentWaterSource = {
    stop: () => {
      isPlaying = false;
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      try {
        masterGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        setTimeout(() => {
          if (noiseNode) {
            try {
              noiseNode.stop();
              noiseNode.disconnect();
            } catch {
              // ignore
            }
          }
          masterGain.disconnect();
        }, 220);
      } catch {
        // ignore
      }
    },
  };
}

export function stopWaterSound() {
  if (currentWaterSource) {
    currentWaterSource.stop();
    currentWaterSource = null;
  }
}

// Single droplet tone for nudge notification from friends (as per doc Section 12.2: no looping)
export function playNudgeTone() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // ignore
  }
}

// Success chime when user clicks "Sudah"
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.38);
    });
  } catch {
    // ignore
  }
}
