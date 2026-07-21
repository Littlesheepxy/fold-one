import AVFoundation
import Combine
import Foundation
import ZhigengCore

/// Shared mic capture: 16 kHz mono PCM for ASR + live level for waveform UI.
/// Supports warm mode (engine stays up; caller gates PCM) for long-lived sessions.
@MainActor
final class AudioCaptureEngine: ObservableObject {
	@Published private(set) var level = 0.0
	@Published private(set) var isRunning = false

	/// When false, PCM callbacks are suppressed but the engine may still run (warm mode).
	nonisolated(unsafe) var feedEnabled = true

	private var engine: AVAudioEngine?
	private var converter: AVAudioConverter?
	private var onPCM: ((Data) -> Void)?
	private var onLevel: ((Double) -> Void)?

	func start(onPCM: @escaping (Data) -> Void, onLevel: ((Double) -> Void)? = nil) -> Bool {
		stop()
		self.onPCM = onPCM
		self.onLevel = onLevel
		feedEnabled = true
		return startEngine()
	}

	/// Keep the mic engine warm without delivering PCM until `feedEnabled = true`.
	func startWarm(onPCM: @escaping (Data) -> Void, onLevel: ((Double) -> Void)? = nil) -> Bool {
		stop()
		self.onPCM = onPCM
		self.onLevel = onLevel
		feedEnabled = false
		return startEngine()
	}

	func stop() {
		if let engine {
			engine.inputNode.removeTap(onBus: 0)
			engine.stop()
		}
		engine = nil
		converter = nil
		onPCM = nil
		onLevel = nil
		level = 0
		isRunning = false
		feedEnabled = true
		try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
	}

	private func startEngine() -> Bool {
		do {
			let session = AVAudioSession.sharedInstance()
			try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
			try session.setPreferredSampleRate(16_000)
			try session.setActive(true)

			let engine = AVAudioEngine()
			let input = engine.inputNode
			let inputFormat = input.outputFormat(forBus: 0)
			guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else { return false }

			let targetFormat = AVAudioFormat(
				commonFormat: .pcmFormatInt16,
				sampleRate: 16_000,
				channels: 1,
				interleaved: true
			)!
			let converter = AVAudioConverter(from: inputFormat, to: targetFormat)
			self.converter = converter

			input.installTap(onBus: 0, bufferSize: 1_024, format: inputFormat) { [weak self] buffer, _ in
				guard let self else { return }
				self.publishLevel(from: buffer)
				guard self.feedEnabled, let converter = self.converter else { return }
				let ratio = targetFormat.sampleRate / inputFormat.sampleRate
				let outFrames = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
				guard let outBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outFrames) else { return }
				var error: NSError?
				let inputBlock: AVAudioConverterInputBlock = { _, status in
					status.pointee = .haveData
					return buffer
				}
				converter.convert(to: outBuffer, error: &error, withInputFrom: inputBlock)
				guard error == nil, outBuffer.frameLength > 0,
				      let channels = outBuffer.int16ChannelData else { return }
				let byteCount = Int(outBuffer.frameLength) * MemoryLayout<Int16>.size
				let data = Data(bytes: channels[0], count: byteCount)
				Task { @MainActor [weak self] in
					guard let self, self.feedEnabled else { return }
					self.onPCM?(data)
				}
			}

			engine.prepare()
			try engine.start()
			self.engine = engine
			isRunning = true
			return true
		} catch {
			stop()
			return false
		}
	}

	private nonisolated func publishLevel(from buffer: AVAudioPCMBuffer) {
		guard let channel = buffer.floatChannelData?[0] else { return }
		let count = Int(buffer.frameLength)
		guard count > 0 else { return }
		var sum = Float.zero
		for index in 0..<count {
			sum += channel[index] * channel[index]
		}
		let rms = sqrt(sum / Float(count))
		let decibels = 20 * log10(max(rms, 0.0001))
		let target = VoiceWaveformMath.normalizedLevel(decibels: decibels)
		Task { @MainActor [weak self] in
			guard let self else { return }
			let smoothed = self.level + (target - self.level) * (target > self.level ? 0.62 : 0.28)
			let next = smoothed < 0.008 ? 0 : smoothed
			self.level = next
			self.onLevel?(next)
		}
	}
}
