# Streaming Backend Contract

The benchmark has native sherpa-onnx adapters for Zipformer and Paraformer. The other shortlist engines are wired through a local WebSocket backend contract so each official runtime can stay isolated:

- Moonshine v2 Streaming: `MOONSHINE_STREAMING_WS_URL`, default `ws://127.0.0.1:8791/stream`
- Dolphin-CN-Dialect Small Streaming: `DOLPHIN_STREAMING_WS_URL`, default `ws://127.0.0.1:8792/stream`
- WhisperKit Large v3 Turbo: `WHISPERKIT_STREAMING_WS_URL`, default `ws://127.0.0.1:8793/stream`
- Qwen3-ASR 0.6B Streaming: `QWEN3_ASR_STREAMING_WS_URL`, default `ws://127.0.0.1:8794/stream`

## Client To Backend

Start message:

```json
{
  "type": "start",
  "engine": "moonshine_v2_streaming",
  "sampleRate": 16000,
  "format": "pcm_s16le",
  "channels": 1,
  "streaming": true
}
```

Audio messages:

```text
binary PCM16 little-endian, mono, 16 kHz, only newly captured samples
```

Finish message:

```json
{ "type": "finish" }
```

## Backend To Client

Partial result:

```json
{ "type": "partial", "text": "我觉得这个" }
```

Final result:

```json
{ "type": "final", "text": "我觉得这个方案可以" }
```

Error:

```json
{ "type": "error", "message": "model failed to load" }
```

The backend must keep one persistent recognizer stream state for a WebSocket session. Do not re-run recognition over the whole buffer for each partial.
