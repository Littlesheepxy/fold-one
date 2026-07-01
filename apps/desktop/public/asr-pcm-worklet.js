/**
 * AudioWorklet — float32 to PCM int16
 */
class PCMWorklet extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		if (!input || !input[0]) return true;
		const ch0 = input[0];
		const out = new Int16Array(ch0.length);
		for (let i = 0; i < ch0.length; i++) {
			const s = Math.max(-1, Math.min(1, ch0[i]));
			out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		this.port.postMessage(out, [out.buffer]);
		return true;
	}
}

registerProcessor("pcm-worklet", PCMWorklet);
