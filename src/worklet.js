// prettier-ignore
const ENV_OUTPUT_LEVELS = [
    0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39,
    41, 42, 43, 45, 46, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
    62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
    81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
    115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127
];

const envOutputLUT = new Float32Array(4096);
for (let i = 0; i < envOutputLUT.length; i++) {
    const dB = (i - 3824) * 0.0235;
    envOutputLUT[i] = Math.pow(20, dB / 20);
}

class Envelope {
    constructor(levels, rates) {
        this._levels = levels;
        this._rates = rates;
        this._level = 0;
        this._down = true;
        this._decayIncrement = 0;
        this._advance(0);
    }

    noteOff() {
        this._down = false;
        this._advance(3);
    }

    isFinished() {
        return this._state === 4;
    }

    render() {
        if (this._state < 3 || (this._state < 4 && !this._down)) {
            if (this._rising) {
                this._level +=
                    this._decayIncrement *
                    (2 + (this._targetLevel - this._level) / 256);
                if (this._level >= this._targetLevel) {
                    this._level = this._targetLevel;
                    this._advance(this._state + 1);
                }
            } else {
                this._level -= this._decayIncrement;
                if (this._level <= this._targetLevel) {
                    this._level = this._targetLevel;
                    this._advance(this._state + 1);
                }
            }
        }

        return envOutputLUT[Math.floor(this._level)];
    }

    _advance(newState) {
        this._state = newState;
        if (this._state < 4) {
            const newLevel = this._levels[this._state];
            this._targetLevel = Math.max(
                0,
                (ENV_OUTPUT_LEVELS[newLevel] << 5) - 224
            );
            this._rising = this._targetLevel - this._level > 0;
            const qr = Math.min(63, (this._rates[this._state] * 41) >> 6);
            this._decayIncrement = Math.pow(2, qr / 4) / 2048;
        }
    }
}

// prettier-ignore
const OP_OUTPUT_LEVELS = [
    0.000000, 0.000337, 0.000476, 0.000674, 0.000952, 0.001235, 0.001602, 0.001905, 0.002265, 0.002694,
    0.003204, 0.003810, 0.004531, 0.005388, 0.006408, 0.007620, 0.008310, 0.009062, 0.010776, 0.011752,
    0.013975, 0.015240, 0.016619, 0.018123, 0.019764, 0.021552, 0.023503, 0.025630, 0.027950, 0.030480,
    0.033238, 0.036247, 0.039527, 0.043105, 0.047006, 0.051261, 0.055900, 0.060960, 0.066477, 0.072494,
    0.079055, 0.086210, 0.094012, 0.102521, 0.111800, 0.121919, 0.132954, 0.144987, 0.158110, 0.172420,
    0.188025, 0.205043, 0.223601, 0.243838, 0.265907, 0.289974, 0.316219, 0.344839, 0.376050, 0.410085,
    0.447201, 0.487676, 0.531815, 0.579948, 0.632438, 0.689679, 0.752100, 0.820171, 0.894403, 0.975353,
    1.063630, 1.159897, 1.264876, 1.379357, 1.504200, 1.640341, 1.788805, 1.950706, 2.127260, 2.319793,
    2.529752, 2.758714, 3.008399, 3.280683, 3.577610, 3.901411, 4.254519, 4.639586, 5.059505, 5.517429,
    6.016799, 6.561366, 7.155220, 7.802823, 8.509039, 9.279172, 10.11901, 11.03486, 12.03360, 13.12273
];

class Operator {
    constructor(params, baseFreq) {
        this.val = 0;

        this.ampL = Math.cos(((Math.PI / 2) * (params.pan + 50)) / 100);
        this.ampR = Math.sin(((Math.PI / 2) * (params.pan + 50)) / 100);

        const idx = Math.min(99, Math.max(0, Math.floor(params.volume)));
        this.outputLevel = OP_OUTPUT_LEVELS[idx] * 1.27;

        this._phase = 0;
        this._envelope = new Envelope(params.levels, params.rates);

        const OCTAVE_1024 = 1.0006771307; // Math.exp(Math.log(2) / 1024);
        const freq =
            baseFreq * params.freqCoarse * Math.pow(OCTAVE_1024, params.detune);
        this._phaseStep = (2 * Math.PI * freq) / sampleRate;
    }

    noteOff() {
        this._envelope.noteOff();
    }

    isFinished() {
        return this._envelope.isFinished();
    }

    render(mod) {
        this.val = Math.sin(this._phase + mod) * this._envelope.render();
        this._phase += this._phaseStep;
        if (this._phase >= 2 * Math.PI) {
            this._phase -= 2 * Math.PI;
        }
        return this.val;
    }
}

const PER_VOICE_LEVEL = 0.125 / 6;

// Algorithm 5
const MOD_MATRIX = {
    0: 1,
    2: 3,
    4: 5,
    5: 5,
};
const CARRIERS = [0, 2, 4];

// E.PIANO 1
const PATCH = {
    feedback: 6,
    operators: [
        {
            rates: [96, 25, 25, 67],
            levels: [99, 75, 0, 0],
            detune: 3,
            velocitySens: 2,
            volume: 99,
            freqCoarse: 1,
            pan: 0,
        },
        {
            rates: [95, 50, 35, 78],
            levels: [99, 75, 0, 0],
            detune: 0,
            velocitySens: 7,
            volume: 58,
            freqCoarse: 14,
            pan: 25,
        },
        {
            rates: [95, 20, 20, 50],
            levels: [99, 95, 0, 0],
            detune: 0,
            velocitySens: 2,
            volume: 99,
            freqCoarse: 1,
            pan: -25,
        },
        {
            rates: [95, 29, 20, 50],
            levels: [99, 95, 0, 0],
            detune: 0,
            velocitySens: 6,
            volume: 89,
            freqCoarse: 1,
            pan: 0,
        },
        {
            rates: [95, 20, 20, 50],
            levels: [99, 95, 0, 0],
            detune: -7,
            velocitySens: 0,
            volume: 99,
            freqCoarse: 1,
            pan: 25,
        },
        {
            rates: [95, 29, 20, 50],
            levels: [99, 95, 0, 0],
            detune: 7,
            velocitySens: 6,
            volume: 79,
            freqCoarse: 1,
            pan: -25,
        },
    ],
};

const feedbackRatio = Math.pow(2, PATCH.feedback - 7);

class Voice {
    constructor(note, velocity) {
        this.note = note;
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        velocity /= 127;

        this.down = true;

        this._operators = [];
        for (const param of PATCH.operators) {
            const op = new Operator(param, freq);
            op.outputLevel *= 1 + (velocity - 1) * (param.velocitySens / 7);
            this._operators.push(op);
        }
    }

    noteOff() {
        for (const op of this._operators) {
            op.noteOff();
        }
    }

    isFinished() {
        for (const i of CARRIERS) {
            if (!this._operators[i].isFinished()) {
                return false;
            }
        }
        return true;
    }

    render() {
        for (let i = this._operators.length - 1; i >= 0; --i) {
            let mod = 0;
            if (i in MOD_MATRIX) {
                const modulator = MOD_MATRIX[i];
                const op = this._operators[modulator];
                mod =
                    op.val * (i === modulator ? feedbackRatio : op.outputLevel);
            }
            this._operators[i].render(mod);
        }

        const out = [0, 0];
        for (const i of CARRIERS) {
            const carrier = this._operators[i];
            const level = carrier.val * carrier.outputLevel;
            out[0] += level * carrier.ampL;
            out[1] += level * carrier.ampR;
        }
        out[0] *= PER_VOICE_LEVEL / CARRIERS.length;
        out[1] *= PER_VOICE_LEVEL / CARRIERS.length;

        return out;
    }
}

class Processor extends AudioWorkletProcessor {
    constructor() {
        super();

        this._voices = [];
        this._poly = 8;
        this._sustain = false;

        this.port.onmessage = (msg) => {
            const { data } = msg;
            switch (data.type) {
                case 'voices':
                    this._poly = data.voices;
                    while (this._voices.length > this._poly) {
                        this._voices.shift();
                    }
                    break;
                case 'noteOn':
                    this._voices.push(new Voice(data.note, data.velocity));
                    while (this._voices.length > this._poly) {
                        this._voices.shift();
                    }
                    break;
                case 'noteOff':
                    this._voices.forEach((voice) => {
                        if (voice.note === data.note && voice.down) {
                            voice.down = false;
                            if (!this._sustain) {
                                voice.noteOff();
                            }
                        }
                    });
                    break;
                case 'sustain':
                    this._sustain = data.down;
                    if (!data.down) {
                        this._voices.forEach((voice) => {
                            if (!voice.down) {
                                voice.noteOff();
                            }
                        });
                    }
                    break;
            }
        };
    }

    process(_, outputs) {
        const outL = outputs[0][0];
        const outR = outputs[0][1];

        for (let i = 0; i < outL.length; ++i) {
            const [l, r] = this._voices.reduce(
                (sum, voice) => {
                    const x = voice.render();
                    sum[0] += x[0];
                    sum[1] += x[1];
                    return sum;
                },
                [0, 0]
            );
            outL[i] = l;
            outR[i] = r;
        }

        this._voices = this._voices.filter((voice) => !voice.isFinished());

        return true;
    }
}

registerProcessor('main', Processor);
