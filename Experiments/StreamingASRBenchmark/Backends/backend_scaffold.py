#!/usr/bin/env python3
"""
Minimal WebSocket scaffold for Fold Streaming ASR Benchmark backends.

This file defines the transport contract only. Replace the methods in
StreamingBackend with official runtime calls for Moonshine, Dolphin, WhisperKit,
or Qwen3-ASR. Do not implement timer polling over the whole audio buffer here.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass

try:
    import websockets
except ImportError as exc:
    raise SystemExit("Install dependency: python3 -m pip install websockets") from exc


@dataclass
class StreamingBackend:
    engine: str

    async def start(self, config: dict) -> None:
        """Create persistent recognizer stream state here."""
        raise NotImplementedError(f"{self.engine}: wire official streaming runtime in start()")

    async def accept_pcm(self, pcm_s16le: bytes) -> str | None:
        """Append only new PCM samples and return an incremental partial if available."""
        raise NotImplementedError(f"{self.engine}: wire official streaming runtime in accept_pcm()")

    async def finish(self) -> str:
        """Finalize the persistent stream and return final text."""
        raise NotImplementedError(f"{self.engine}: wire official streaming runtime in finish()")


async def handle_connection(websocket, engine: str) -> None:
    backend = StreamingBackend(engine=engine)
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                partial = await backend.accept_pcm(message)
                if partial is not None:
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
    parser.add_argument("--engine", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    async with websockets.serve(lambda ws: handle_connection(ws, args.engine), args.host, args.port):
        print(f"{args.engine} backend listening on ws://{args.host}:{args.port}/stream")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
