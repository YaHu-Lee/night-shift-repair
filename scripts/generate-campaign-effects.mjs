import { writeFileSync } from 'node:fs';

const output = new URL('../creator-m0/assets/resources/campaign/', import.meta.url);
const transientCues = new Set(['tool-arc', 'tool-shot', 'tool-impact']);
const tau = 2 * Math.PI;
const sine = (frequency, time) => Math.sin(tau * frequency * time);
const slide = (frequency, slope, time) => sine(frequency + slope * time / 2, time);
const decay = (time, speed) => Math.exp(-time * speed);
const ring = (time, hz) => sine(hz, time) * decay(time, 15)
    + 0.32 * sine(hz * 2.027, time) * decay(time, 32);
const chirp = (time, at, hz) => time < at ? 0 : ring(time - at, hz) * Math.min(1, (time - at) * 220);

const cues = {
    'tool-arc': [0.23, (time, grain) => (
        slide(1120, -1940, time) * (0.63 + 0.37 * sine(97, time)) + 0.3 * grain) * decay(time, 12)],
    'tool-shot': [0.18, (time, grain) => (
        (0.62 * grain + 0.55 * slide(235, -930, time)) * decay(time, 30) + 0.16 * ring(time, 920))],
    'tool-heat': [0.28, (time, grain) => (
        (0.73 * grain + 0.27 * slide(260, -440, time)) * (1 - decay(time, 48)) * decay(time, 11))],
    'tool-magnet': [0.28, (time) => (
        (slide(275, -520, time) + 0.34 * slide(822, -1610, time)) * decay(time, 10)
        + 0.38 * chirp(time, 0.102, 220))],
    'tool-induction': [0.34, (time, grain) => (
        0.31 * grain * decay(time, 21) + slide(470, 740, time) * decay(time, 19)
        + 0.58 * chirp(time, 0.09, 645) + 0.48 * chirp(time, 0.162, 910))],
    'enemy-projectile': [0.23, (time, grain) => (
        0.20 * grain * decay(time, 20) + slide(730, -2350, time) * decay(time, 13)
        + 0.25 * slide(365, -1175, time) * decay(time, 11))],
    'enemy-melee': [0.27, (time, grain) => (
        (0.53 * grain * sine(37, time) + 0.58 * slide(198, -460, time))
        * (1 - decay(time, 49)) * decay(time, 10))],
    'enemy-area': [0.36, (time, grain) => (
        0.4 * slide(196, -251, time) * decay(time, 11) + 0.58 * grain * decay(time, 8)
        + 0.35 * chirp(time, 0.076, 165) + 0.26 * chirp(time, 0.142, 132))],
    'tool-impact': [0.11, (time, grain) => (
        (0.64 * grain + 0.38 * sine(215, time) + 0.22 * sine(1130, time)) * decay(time, 38))],
    purchase: [0.31, (time) => 0.72 * chirp(time, 0, 659) + 0.66 * chirp(time, 0.087, 880)],
    unlock: [0.71, (time) => 0.62 * chirp(time, 0, 523) + 0.67 * chirp(time, 0.105, 659)
        + 0.69 * chirp(time, 0.218, 784) + 0.79 * chirp(time, 0.375, 1046) + 0.19 * chirp(time, 0.375, 523)],
};

for (const [name, [duration, synth]] of Object.entries(cues)) {
    const rate = transientCues.has(name) ? 16_000 : 12_000;
    const length = Math.round(duration * rate);
    const mix = new Float64Array(length);
    let seed = 837344;
    let lastNoise = 0;
    let peak = 0;
    for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 0x80000000 - 1;
        const time = i / rate;
        mix[i] = synth(time, (noise - 0.38 * lastNoise) * 0.75)
            * Math.min(1, time * 500, (duration - time) * 80);
        lastNoise = noise;
        peak = Math.max(peak, Math.abs(mix[i]));
    }
    const wave = Buffer.alloc(44 + length * 2);
    wave.write('RIFF', 0);
    wave.writeUInt32LE(wave.length - 8, 4);
    wave.write('WAVEfmt ', 8);
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20); // PCM
    wave.writeUInt16LE(1, 22); // Mono
    wave.writeUInt32LE(rate, 24);
    wave.writeUInt32LE(rate * 2, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write('data', 36);
    wave.writeUInt32LE(length * 2, 40);
    for (let i = 0; i < length; i++) wave.writeInt16LE(Math.round(mix[i] / peak * 25000), 44 + i * 2);
    writeFileSync(new URL(`${name}.wav`, output), wave);
}
