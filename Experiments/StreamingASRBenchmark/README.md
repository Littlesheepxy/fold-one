# Local Streaming ASR Benchmark

Standalone experiment for comparing Fold local streaming ASR candidates on Apple Silicon Mac.

This module is intentionally decoupled from the production Fold ASR path. It uses `AVAudioEngine` for live capture. Engines are registered through a common `StreamingASREngine` adapter so benchmark logic does not change per model.

## Models

Current shortlist:

| Priority | Engine ID | Model | Status |
| --- | --- | --- | --- |
| P0 | `moonshine_v2_streaming` | Moonshine v2 Streaming | WebSocket backend adapter |
| P0 | `dolphin_cn_dialect_small_streaming` | Dolphin-CN-Dialect Small Streaming | WebSocket backend adapter |
| P0 | `sherpa_zipformer` | Streaming Zipformer | Live + fixture adapter ready with official sherpa-onnx runtime |
| P0 | `whisperkit_large_v3_turbo` | WhisperKit Large v3 Turbo | WebSocket backend adapter |
| P0 | `qwen3_asr_0_6b_streaming` | Qwen3-ASR 0.6B Streaming | Backend adapter; official streaming path is vLLM-backed, not Fold macOS Fast Path yet |
| P1 | `sherpa_paraformer` | Streaming Paraformer | Live + fixture adapter ready with official sherpa-onnx runtime |

`current_fold_baseline` is still available by explicit `--engines current_fold_baseline` as a Fold-local baseline, but it is not a real streaming recognizer and is not shown as a Fast Path live candidate.

## Runtime Configuration

For sherpa engines, either place downloads under the default experiment paths or export explicit paths.

Default sherpa runtime path:

```text
Runtime/sherpa-onnx-v1.13.4-osx-arm64-shared-no-tts/lib/libsherpa-onnx-c-api.dylib
```

Optional explicit configuration:

```bash
export SHERPA_ONNX_DYLIB=/absolute/path/to/libsherpa-onnx-c-api.dylib
export SHERPA_ZIPFORMER_MODEL_DIR=/absolute/path/to/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20
export SHERPA_PARAFORMER_MODEL_DIR=/absolute/path/to/sherpa-onnx-streaming-paraformer-bilingual-zh-en
export FOLD_LOCAL_WHISPER_MODEL_PATH=/absolute/path/to/ggml-small.bin
```

Optional overrides:

```bash
export SHERPA_PROVIDER=cpu
export SHERPA_NUM_THREADS=2
export SHERPA_DECODING_METHOD=greedy_search
```

## Run

Record or place identical WAV fixtures under `Fixtures/WAV`, then run:

```bash
cd Experiments/StreamingASRBenchmark
swift run StreamingASRBenchmark --fixtures Fixtures/utterances.json --wav-dir Fixtures/WAV --reports-dir Reports
```

Cloud cost baseline only (no WAV required):

```bash
swift run StreamingASRBenchmark --cost-baseline --reports-dir Reports
```

Outputs:

- `Reports/asr_benchmark_results.json`
- `Reports/asr_benchmark_results.csv`
- `Reports/ASR_BENCHMARK.md`
- `Reports/COST_BASELINE.md`
- `Reports/cost_baseline.json`

## Live UI

For manual real-time voice testing, start the local UI:

```bash
cd Experiments/StreamingASRBenchmark
swift run StreamingASRBenchmark --live-ui --port 8787
```

Then open:

```text
http://127.0.0.1:8787
```

The page supports:

- viewing all six shortlist candidates
- starting real-time microphone streaming for candidates with a live adapter
- starting all six candidates from one microphone stream for side-by-side comparison
- starting/stopping microphone streaming
- live partial text
- stable vs unstable tail display
- per-model first character latency, partial update interval, revision rate, and RTF
- event log for start, partial, and final results

The Live UI shows all shortlist models. Sherpa engines run in-process. Moonshine, Dolphin, WhisperKit, and Qwen require their local backend server to be running.

For Moonshine, Dolphin, WhisperKit, and Qwen, the benchmark now includes a local WebSocket backend adapter. See `Backends/README.md` for the protocol. Each backend must use its official runtime and keep persistent streaming recognizer state per WebSocket session.

## Streaming Rules

The benchmark feeds each engine only newly arrived PCM samples. Each utterance uses a persistent recognizer stream state:

`PCM buffer -> accept(samples:) -> IsReady -> Decode -> GetResult -> partial result`

The audio callback never performs model inference, text diffing, UI mutation, or large allocation.
