import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../creator-m0/assets/resources/m2/', import.meta.url);
const sampleRate = 22050;
const cues = {
    warning: [0.23, 520, 820, 2],
    charge: [0.3, 295, 107, 1],
    hit: [0.14, 168, 82, 1],
    clear: [0.38, 392, 784, 3],
};

function tone([seconds, low, high, pulses]) {
    const count = Math.round(seconds * sampleRate);
    const file = Buffer.alloc(44 + count * 2);
    file.write('RIFF', 0);
    file.writeUInt32LE(file.length - 8, 4);
    file.write('WAVEfmt ', 8);
    file.writeUInt32LE(16, 16);
    file.writeUInt16LE(1, 20);
    file.writeUInt16LE(1, 22);
    file.writeUInt32LE(sampleRate, 24);
    file.writeUInt32LE(sampleRate * 2, 28);
    file.writeUInt16LE(2, 32);
    file.writeUInt16LE(16, 34);
    file.write('data', 36);
    file.writeUInt32LE(count * 2, 40);
    let phase = 0;
    for (let sample = 0; sample < count; sample++) {
        const position = sample / count;
        const pulse = (position * pulses) % 1;
        const frequency = low + (high - low) * position;
        const envelope = Math.min(1, pulse * 11, (1 - pulse) * 4) * (1 - position * 0.65);
        phase += 2 * Math.PI * frequency / sampleRate;
        const signal = 0.8 * Math.sin(phase) + 0.2 * Math.sin(phase * 2);
        file.writeInt16LE(Math.round(signal * envelope * 9800), 44 + sample * 2);
    }
    return file;
}

await mkdir(output, { recursive: true });
await Promise.all(Object.entries(cues).map(([name, cue]) => writeFile(new URL(`${name}.wav`, output), tone(cue))));
