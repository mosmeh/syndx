import * as Tone from 'tone';
import worklet from '-!url-loader?limit=false!./worklet';

export class Synth {
    constructor() {
        this._input = new Tone.Gain();
        this._chorus = new Tone.Chorus(2, 2, 0.1).start();
        this._reverb = new Tone.Reverb().set({
            wet: 0.3,
            decay: 0.5,
            preDelay: 0.01,
        });
        this._gain = new Tone.Gain(1);
        const limiter = new Tone.Limiter(-20);

        this._input.chain(
            this._chorus,
            this._reverb,
            this._gain,
            limiter,
            Tone.Destination
        );
    }

    async setup() {
        const context = Tone.getContext();

        await context.addAudioWorkletModule(worklet, 'main');
        const workletNode = context.createAudioWorkletNode('main', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });
        this._port = workletNode.port;

        Tone.connect(workletNode, this._input);
    }

    set voices(value) {
        this._port.postMessage({
            type: 'voices',
            voices: value,
        });
    }

    set volume(value) {
        this._gain.gain.value = value;
    }

    set chorusEnabled(on) {
        this._input.disconnect();
        if (on) {
            this._input.connect(this._chorus);
        } else {
            this._input.connect(this._reverb);
        }
    }

    set chorusDepth(value) {
        this._chorus.set({ depth: value });
    }

    noteOn(note, velocity) {
        this._port.postMessage({
            type: 'noteOn',
            note,
            velocity,
        });
    }

    noteOff(note) {
        this._port.postMessage({
            type: 'noteOff',
            note,
        });
    }

    sustain(down) {
        this._port.postMessage({
            type: 'sustain',
            down,
        });
    }
}
