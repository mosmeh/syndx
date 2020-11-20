const LEVEL_UNIT = (20 * Math.log10(2)) / 256; // approx. 0.0235 dB

// prettier-ignore
const LEVEL_LUT = [
    0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46
];

function scaleOutLevel(outLevel) {
    return outLevel >= 20 ? 28 + outLevel : LEVEL_LUT[outLevel];
}

const envOutputLUT = new Float32Array(4096);
for (let i = 0; i < envOutputLUT.length; i++) {
    const dB = (i - 3824) * LEVEL_UNIT;
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
                (scaleOutLevel(newLevel) << 5) - 224
            );
            this._rising = this._targetLevel - this._level > 0;
            const qr = Math.min(63, (this._rates[this._state] * 41) >> 6);
            this._decayIncrement = Math.pow(2, qr / 4) / 2048;
        }
    }
}

// prettier-ignore
const VELOCITY_DATA = [
    0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163,
    166, 170, 173, 174, 178, 181, 184, 186, 189, 190, 194, 196, 198, 200, 202,
    205, 206, 209, 211, 214, 216, 218, 220, 222, 224, 225, 227, 229, 230, 232,
    233, 235, 237, 238, 240, 241, 242, 243, 244, 246, 246, 248, 249, 250, 251,
    252, 253, 254
];

function scaleVelocity(velocity, sensitivity) {
    const clampedVel = Math.max(0, Math.min(127, velocity));
    const velValue = VELOCITY_DATA[clampedVel >> 1] - 239;
    const scaledVel = ((sensitivity * velValue + 7) >> 3) << 4;
    return scaledVel;
}

class Operator {
    constructor(params, baseFreq, velocity) {
        this.val = 0;

        this.ampL = Math.cos(((Math.PI / 2) * (params.pan + 50)) / 100);
        this.ampR = Math.sin(((Math.PI / 2) * (params.pan + 50)) / 100);

        let outLevel = scaleOutLevel(params.volume) << 5;
        outLevel += scaleVelocity(velocity, params.velocitySens);
        outLevel = Math.max(0, outLevel);

        const outLeveldB = LEVEL_UNIT * (outLevel - 99 * 32);
        this.outputLevel = Math.pow(10, outLeveldB / 20);

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

        this.down = true;

        this._operators = [];
        for (const param of PATCH.operators) {
            this._operators.push(new Operator(param, freq, velocity));
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
