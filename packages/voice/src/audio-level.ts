export function pcm16AudioLevel(frameBuffer: ArrayBuffer | Uint8Array | null | undefined): number {
	if (!frameBuffer) return 0;
	const bytes = frameBuffer instanceof Uint8Array ? frameBuffer : new Uint8Array(frameBuffer);
	if (bytes.length < 2) return 0;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const sampleCount = Math.floor(bytes.length / 2);
	if (!sampleCount) return 0;

	let mean = 0;
	for (let i = 0; i < sampleCount; i++) {
		mean += view.getInt16(i * 2, true) / 32768;
	}
	mean /= sampleCount;

	let sumSq = 0;
	for (let i = 0; i < sampleCount; i++) {
		const sample = view.getInt16(i * 2, true) / 32768 - mean;
		sumSq += sample * sample;
	}
	const rms = Math.sqrt(sumSq / sampleCount);
	return Math.max(0, Math.min(1, Math.sqrt(rms) * 1.6));
}

export function smoothAudioLevel(current: number, next: number): number {
	const clamped = Math.max(0, Math.min(1, next));
	const attack = clamped > current ? 0.55 : 0.24;
	return current + (clamped - current) * attack;
}
