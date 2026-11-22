import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const output = new URL('../creator-m0/assets/resources/campaign/', import.meta.url);
const sampleRate = 22050;
const tau = 2 * Math.PI;

function score(name, beat, arrange) {
    const mix = new Float64Array(Math.round(sampleRate * beat * 32));
    function add(startBeat, duration, gain, synth) {
        const start = Math.round(startBeat * beat * sampleRate);
        const length = Math.round(duration * sampleRate);
        for (let i = 0; i < length; i++) {
            const time = i / sampleRate;
            // Carry note tails over the seam of the repeating phrase.
            mix[(start + i + mix.length) % mix.length] += gain * synth(time, duration - time);
        }
    }
    function note(at, beats, midi, gain, kind) {
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        add(at, beats * beat, gain, (time, remaining) => {
            const phase = tau * frequency * time;
            if (kind === 'pad') {
                const envelope = Math.min(1, time / 0.65, remaining / 1.35);
                return envelope * (0.68 * Math.sin(phase) + 0.19 * Math.sin(phase * 1.003)
                    + 0.09 * Math.sin(phase * 2) + 0.04 * Math.sin(phase * 3));
            }
            if (kind === 'bass') {
                const envelope = Math.min(1, time / 0.035, remaining / 0.16) * Math.exp(-time * 1.5);
                return envelope * (0.64 * Math.sin(phase) + 0.28 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 3));
            }
            const envelope = Math.min(1, time / 0.022, remaining / 0.24) * Math.exp(-time * 2.7);
            return envelope * (0.72 * Math.sin(phase + 0.37 * Math.sin(phase * 2.003))
                + 0.18 * Math.sin(phase * 2.007) + 0.10 * Math.sin(phase * 3.011));
        });
    }
    arrange(add, note);
    encode(name, mix);
}

const chords = [
    { root: 38, tones: [53, 57, 60, 64] },
    { root: 34, tones: [53, 57, 60, 62] },
    { root: 43, tones: [55, 58, 62, 65] },
    { root: 45, tones: [52, 55, 58, 61] },
];

score('night-shift', 0.6, (_add, note) => {
    for (const [index, { root, tones }] of chords.entries()) {
        const first = 8 * index;
        for (const tone of tones) note(first - 0.35, 9.2, tone, 0.047, 'pad');
        for (const offset of [0, 4]) {
            note(first + offset, 1.75, root + 12, 0.105, 'bass');
            note(first + offset + 2.5, 1.18, root + 19, 0.057, 'bass');
        }
    }
    const motif = [
        [0.2, 65], [1.5, 69], [3.25, 74], [6.5, 72], [9.5, 69], [12.5, 65], [14.25, 67],
        [17.5, 70], [19.5, 74], [22.25, 77], [25.5, 76], [28.25, 73], [30.5, 70],
    ];
    for (const [at, tone] of motif) {
        note(at, 2.45, tone, 0.102, 'signal');
        note(at + 0.75, 2.35, tone, 0.029, 'signal');
    }
});

score('live-circuit', 0.48, (add, note) => {
    let noise = 71623;
    function grain() {
        noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
        return noise / 0x80000000 - 1;
    }
    for (const [index, { root, tones }] of chords.entries()) {
        const first = index * 8;
        for (const tone of tones) note(first - 0.3, 9.1, tone, 0.028, 'pad');
        for (const offset of [0, 0.75, 1.5, 2.5, 3.25, 4, 4.75, 5.5, 6.5, 7.25]) {
            note(first + offset, 0.66, root + (offset % 2 > 1 ? 19 : 12), 0.101, 'bass');
        }
        for (const [offset, tone] of [[0.5, tones[3]], [2, tones[2]], [3.5, tones[1]], [5, tones[3] + 12], [6.75, tones[2]]]) {
            note(first + offset, 0.95, tone, 0.081, 'signal');
            note(first + offset + 0.5, 0.9, tone, 0.023, 'signal');
        }
        for (let step = 0; step < 8; step++) {
            const at = first + step;
            add(at + 0.5, 0.045, 0.025, (time, left) =>
                grain() * Math.min(1, time / 0.002, left / 0.014) * Math.exp(-time * 57));
            if (step % 2 === 0) {
                add(at, 0.21, 0.15, (time, left) => Math.sin(tau * (54 * time + 0.9 * (1 - Math.exp(-70 * time))))
                    * Math.min(1, time / 0.006, left / 0.03) * Math.exp(-time * 23));
            } else {
                add(at, 0.105, 0.07, (time, left) => (grain() * 0.65 + Math.sin(tau * 182 * time) * 0.35)
                    * Math.min(1, time / 0.003, left / 0.024) * Math.exp(-time * 36));
            }
        }
    }
});

function encode(name, mix) {
    const peak = mix.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    const pcm = Buffer.alloc(mix.length * 2);
    for (let i = 0; i < mix.length; i++) pcm.writeInt16LE(Math.round(mix[i] / peak * 24000), i * 2);
    const path = fileURLToPath(new URL(`${name}.mp3`, output));
    const result = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0',
        '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '32k', path,
    ], { input: pcm, stdio: ['pipe', 'inherit', 'inherit'] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status}`);
}
