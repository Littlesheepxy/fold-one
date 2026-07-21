import AVFoundation
import AVKit
import UIKit

/// Keeps the main app process alive via a real Picture-in-Picture window (idle mic off).
@MainActor
final class PictureInPictureSession: NSObject {
	private var player: AVQueuePlayer?
	private var looper: AVPlayerLooper?
	private var playerLayer: AVPlayerLayer?
	private var controller: AVPictureInPictureController?
	private var hostView: UIView?
	private(set) var isActive = false
	var onStopped: (() -> Void)?

	func start(in hostView: UIView) throws {
		stop()
		guard AVPictureInPictureController.isPictureInPictureSupported() else {
			throw PictureInPictureError.unsupported
		}
		let url = try Self.standbyVideoURL()
		let item = AVPlayerItem(url: url)
		let player = AVQueuePlayer(playerItem: item)
		player.isMuted = true
		player.actionAtItemEnd = .none
		let looper = AVPlayerLooper(player: player, templateItem: item)

		let layer = AVPlayerLayer(player: player)
		layer.videoGravity = .resizeAspectFill
		layer.frame = CGRect(x: 0, y: 0, width: 160, height: 90)
		hostView.layer.addSublayer(layer)
		// Keep off-screen so it doesn't cover the UI; user sees the system PiP window.
		hostView.frame = CGRect(x: -200, y: -200, width: 160, height: 90)

		let controller = AVPictureInPictureController(playerLayer: layer)
		controller?.delegate = self
		controller?.canStartPictureInPictureAutomaticallyFromInline = true

		self.player = player
		self.looper = looper
		self.playerLayer = layer
		self.controller = controller
		self.hostView = hostView

		player.play()
		DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
			self?.controller?.startPictureInPicture()
		}
		isActive = true
	}

	func stop() {
		if controller?.isPictureInPictureActive == true {
			controller?.stopPictureInPicture()
		}
		player?.pause()
		playerLayer?.removeFromSuperlayer()
		player = nil
		looper = nil
		playerLayer = nil
		controller = nil
		hostView = nil
		isActive = false
	}

	/// Tiny looping muted solid-color MP4 cached in Caches.
	private static func standbyVideoURL() throws -> URL {
		let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
		let url = dir.appendingPathComponent("zhigeng-pip-standby.mp4")
		if FileManager.default.fileExists(atPath: url.path) { return url }
		try writeSolidColorVideo(to: url)
		return url
	}

	private static func writeSolidColorVideo(to url: URL) throws {
		try? FileManager.default.removeItem(at: url)
		guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else {
			throw PictureInPictureError.encodeFailed
		}
		let settings: [String: Any] = [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: 320,
			AVVideoHeightKey: 180,
		]
		let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
		input.expectsMediaDataInRealTime = false
		let adaptor = AVAssetWriterInputPixelBufferAdaptor(
			assetWriterInput: input,
			sourcePixelBufferAttributes: [
				kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
				kCVPixelBufferWidthKey as String: 320,
				kCVPixelBufferHeightKey as String: 180,
			]
		)
		guard writer.canAdd(input) else { throw PictureInPictureError.encodeFailed }
		writer.add(input)
		guard writer.startWriting() else { throw PictureInPictureError.encodeFailed }
		writer.startSession(atSourceTime: .zero)

		let frameCount = 30
		let fps: Int32 = 15
		for i in 0..<frameCount {
			while !input.isReadyForMoreMediaData {
				Thread.sleep(forTimeInterval: 0.01)
			}
			var buffer: CVPixelBuffer?
			CVPixelBufferCreate(
				kCFAllocatorDefault, 320, 180,
				kCVPixelFormatType_32ARGB, nil, &buffer
			)
			guard let buffer else { throw PictureInPictureError.encodeFailed }
			CVPixelBufferLockBaseAddress(buffer, [])
			if let base = CVPixelBufferGetBaseAddress(buffer) {
				let count = CVPixelBufferGetDataSize(buffer)
				// Brand-ish indigo: #675CF1
				let bytes = base.bindMemory(to: UInt8.self, capacity: count)
				for offset in stride(from: 0, to: count, by: 4) {
					bytes[offset] = 255
					bytes[offset + 1] = 0x67
					bytes[offset + 2] = 0x5C
					bytes[offset + 3] = 0xF1
				}
			}
			CVPixelBufferUnlockBaseAddress(buffer, [])
			let time = CMTime(value: CMTimeValue(i), timescale: fps)
			adaptor.append(buffer, withPresentationTime: time)
		}
		input.markAsFinished()
		let semaphore = DispatchSemaphore(value: 0)
		writer.finishWriting { semaphore.signal() }
		semaphore.wait()
		guard writer.status == .completed else { throw PictureInPictureError.encodeFailed }
	}
}

enum PictureInPictureError: LocalizedError {
	case unsupported
	case encodeFailed

	var errorDescription: String? {
		switch self {
		case .unsupported: "此设备不支持画中画"
		case .encodeFailed: "画中画待命视频生成失败"
		}
	}
}

extension PictureInPictureSession: AVPictureInPictureControllerDelegate {
	nonisolated func pictureInPictureControllerDidStopPictureInPicture(
		_ pictureInPictureController: AVPictureInPictureController
	) {
		Task { @MainActor in
			self.isActive = false
			self.onStopped?()
		}
	}
}
