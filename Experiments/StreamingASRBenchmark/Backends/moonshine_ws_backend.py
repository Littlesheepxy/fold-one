#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import struct
import time
from pathlib import Path

import websockets
from moonshine_voice.download import get_model_for_language
from moonshine_voice.transcriber import Transcriber


class MoonshineStreamingBackend:
    def __init__(self, language: str, model_arch: str | None, asset_root: Path, update_interval: float):
        self.language = language
        self.model_arch_name = model_arch
        self.asset_root = asset_root
        self.update_interval = update_interval
        self.transcriber: Transcriber | None = None
        self.stream = None
        self.latest_text = ""
        self.last_emit = 0.0

    async def prepare(self) -> None:
        from moonshine_voice.moonshine_api import string_to_model_arch

        wanted_arch = string_to_model_arch(self.model_arch_name) if self.model_arch_name else None
        model_path, model_arch = get_model_for_language(
            wanted_language=self.language,
            wanted_model_arch=wanted_arch,
            cache_root=self.asset_root,
        )
        self.transcriber = Transcriber(model_path=Path(model_path), model_arch=model_arch, update_interval=self.update_interval)

    async def start(self, config: dict) -> None:
        if config.get("sampleRate") != 16000:
            raise RuntimeError("Moonshine backend expects 16 kHz PCM")
        if self.transcriber is None:
            await self.prepare()
        self.stream = self.transcriber.create_stream(update_interval=self.update_interval)
        self.stream.start()
        self.latest_text = ""
        self.last_emit = 0.0

    async def accept_pcm(self, pcm_s16le: bytes) -> str | None:
        if self.stream is None:
            raise RuntimeError("stream has not started")
        if len(pcm_s16le) < 2:
            return None

        sample_count = len(pcm_s16le) // 2
        values = struct.unpack("<" + "h" * sample_count, pcm_s16le[: sample_count * 2])
        samples = [value / 32768.0 for value in values]
        self.stream.add_audio(samples, 16000)

        now = time.monotonic()
        if now - self.last_emit < self.update_interval:
            return None
        self.last_emit = now
        transcript = self.stream.update_transcription()
        text = "".join(line.text for line in transcript.lines if line.text)
        if text and text != self.latest_text:
            self.latest_text = text
            return text
        return None

    async def finish(self) -> str:
        if self.stream is None:
            return self.latest_text
        transcript = self.stream.stop()
        text = "".join(line.text for line in transcript.lines if line.text) if transcript else self.latest_text
        self.latest_text = text
        self.stream = None
        return text


async def handle_connection(websocket, args: argparse.Namespace) -> None:
    backend = MoonshineStreamingBackend(
        language=args.language,
        model_arch=args.model_arch,
        asset_root=Path(args.asset_root),
        update_interval=args.update_interval,
    )
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                partial = await backend.accept_pcm(message)
                if partial:
                    await websocket.send(json.dumps({"type": "partial", "text": partial}, ensure_ascii=False))
                continue

            payload = json.loads(message)
            if payload.get("type") == "start":
                await backend.start(payload)
                await websocket.send(json.dumps({"type": "status", "message": "ready"}, ensure_ascii=False))
            elif payload.get("type") == "finish":
                final = await backend.finish()
                await websocket.send(json.dumps({"type": "final", "text": final}, ensure_ascii=False))
                return
    except Exception as exc:
        await websocket.send(json.dumps({"type": "error", "message": str(exc)}, ensure_ascii=False))


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8791)
    parser.add_argument("--language", default="zh")
    parser.add_argument("--model-arch", default=None)
    parser.add_argument("--asset-root", default="Backends/moonshine-assets")
    parser.add_argument("--update-interval", type=float, default=0.12)
    args = parser.parse_args()

    async with websockets.serve(lambda ws: handle_connection(ws, args), args.host, args.port):
        print(f"moonshine backend listening on ws://{args.host}:{args.port}/stream", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
