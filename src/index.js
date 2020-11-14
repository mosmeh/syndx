import * as Tone from 'tone';
import './style.css';
import worklet from '-!url-loader!./worklet.js';

class Synth {
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

const keys = {};
document.querySelectorAll('.key').forEach((key) => {
    keys[+key.dataset.note] = key;
});

function highlightKey(note) {
    note = +note;
    if (note in keys) {
        const key = keys[note];
        key.classList.add('pressed');
    }
}

function unhighlightKey(note) {
    note = +note;
    if (note in keys) {
        const key = keys[note];
        key.classList.remove('pressed');
    }
}

async function setup() {
    await Tone.start();

    const synth = new Synth();
    await synth.setup();

    [
        ['volume', 'volume'],
        ['voices', 'voices'],
        ['chorus-depth', 'chorusDepth'],
    ].forEach(([id, prop]) => {
        const slider = document.getElementById(id);
        synth[prop] = slider.value;
        slider.addEventListener('input', (e) => {
            synth[prop] = e.target.value;
        });
    });

    const chorusOn = document.getElementById('chorus-on');
    synth.chorusEnabled = chorusOn.checked;
    chorusOn.addEventListener('input', (e) => {
        synth.chorusEnabled = e.target.checked;
    });

    function noteOnMidi(note, velocity) {
        synth.noteOn(+note, +velocity);
        highlightKey(+note - 12 * +octave.value);
    }
    function noteOffMidi(note) {
        synth.noteOff(+note);
        unhighlightKey(+note - 12 * +octave.value);
    }

    const octave = document.getElementById('octave');
    function noteOnScreen(note) {
        synth.noteOn(+note + 12 * +octave.value, 100);
        highlightKey(+note);
    }
    function noteOffScreen(note) {
        synth.noteOff(+note + 12 * +octave.value);
        unhighlightKey(+note);
    }

    for (const [note, key] of Object.entries(keys)) {
        function downHandler(e) {
            e.preventDefault();
            noteOnScreen(note);
        }
        key.addEventListener('mousedown', downHandler);
        key.addEventListener('touchstart', downHandler);

        function upHandler(e) {
            e.preventDefault();
            noteOffScreen(note);
        }
        key.addEventListener('mouseup', upHandler);
        key.addEventListener('mouseleave', upHandler);
        key.addEventListener('touchend', upHandler);

        key.addEventListener('mouseenter', (e) => {
            if (e.buttons !== 0) {
                e.preventDefault();
                noteOnScreen(note);
            }
        });
    }

    // prettier-ignore
    const KEYS = [
        'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG',
        'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL'
    ];
    document.addEventListener('keydown', (e) => {
        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
            return;
        }

        switch (e.code) {
            case 'KeyZ':
                octave.value = Math.max(+octave.value - 1, +octave.min);
                return;
            case 'KeyX':
                octave.value = Math.min(+octave.value + 1, +octave.max);
                return;
        }

        const i = KEYS.indexOf(e.code);
        if (i !== -1) {
            e.preventDefault();
            noteOnScreen(i + 60);
        }
    });
    document.addEventListener('keyup', (e) => {
        const i = KEYS.indexOf(e.code);
        if (i !== -1) {
            e.preventDefault();
            noteOffScreen(i + 60);
        }
    });

    function onMidiMessage(e) {
        switch (e.data[0] & 0xf0) {
            case 0x90:
                if (e.data[2] > 0) {
                    noteOnMidi(e.data[1], e.data[2]);
                } else {
                    noteOffMidi(e.data[1]);
                }
                break;
            case 0x80:
                noteOffMidi(e.data[1]);
                break;
            case 0xb0:
                if (e.data[1] === 64) {
                    synth.sustain(e.data[2] >= 64);
                }
                break;
        }
    }

    if (typeof navigator.requestMIDIAccess === 'function') {
        navigator.requestMIDIAccess().then((access) => {
            let inputs;
            if (typeof access.inputs === 'function') {
                inputs = access.inputs();
            } else {
                inputs = access.inputs.values();
            }
            for (const i of inputs) {
                i.onmidimessage = onMidiMessage;
            }
        });
    }
}

setup();

function resume() {
    Tone.start();
}

document.addEventListener('mousedown', resume);
document.addEventListener('keydown', resume);
