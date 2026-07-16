#!/usr/bin/env swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
	fputs("Usage: knock-out-bg.swift <input.png> <output.png> [threshold]\n", stderr)
	exit(1)
}

let threshold = UInt8(args.count > 3 ? (UInt8(args[3]) ?? 248) : 248)
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

guard let src = CGImageSourceCreateWithURL(input as CFURL, nil),
	  let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
	fputs("Failed to load image\n", stderr)
	exit(1)
}

let w = cg.width
let h = cg.height
var pixels = [UInt8](repeating: 0, count: w * h * 4)
guard let ctx = CGContext(
	data: &pixels,
	width: w,
	height: h,
	bitsPerComponent: 8,
	bytesPerRow: w * 4,
	space: CGColorSpaceCreateDeviceRGB(),
	bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
	fputs("Failed to create context\n", stderr)
	exit(1)
}

ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

for i in stride(from: 0, to: pixels.count, by: 4) {
	let r = pixels[i]
	let g = pixels[i + 1]
	let b = pixels[i + 2]
	if r >= threshold && g >= threshold && b >= threshold {
		pixels[i] = 0
		pixels[i + 1] = 0
		pixels[i + 2] = 0
		pixels[i + 3] = 0
	}
}

guard let outCtx = CGContext(
	data: &pixels,
	width: w,
	height: h,
	bitsPerComponent: 8,
	bytesPerRow: w * 4,
	space: CGColorSpaceCreateDeviceRGB(),
	bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
), let outCg = outCtx.makeImage() else {
	fputs("Failed to create output image\n", stderr)
	exit(1)
}

guard let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else {
	fputs("Failed to create destination\n", stderr)
	exit(1)
}
CGImageDestinationAddImage(dest, outCg, nil)
guard CGImageDestinationFinalize(dest) else {
	fputs("Failed to write output\n", stderr)
	exit(1)
}
