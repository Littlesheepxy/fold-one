# ASR Benchmark

Generated from Apple Silicon local fixture runs. Conclusions should be updated only after all required WAV fixtures have been recorded and all engines complete successfully.

| Model | First Char P50 | First Char P95 | Update Interval | Revision Rate | RTF | CPU | RAM |
| ----- | -------------- | -------------- | --------------- | ------------- | --- | --- | --- |

## Recommendation

1. Fast Path candidate: TBD, based on measured first-character latency and update cadence.
2. Final Path candidate: TBD, based on lower revision rate and acceptable RTF.
3. Not recommended: any engine with missing partials, high first-character P95, or RTF above 1.0 on the same fixtures.
4. Current bottleneck: inspect `firstAudioLatencyMs`, `realTimeFactor`, resolver revision counts, and UI patch timings. This report records audio, ASR, and resolver-facing data; production UI timing is intentionally outside this experiment module.

## Coverage

- Runs: 0
- Fixtures: 0
