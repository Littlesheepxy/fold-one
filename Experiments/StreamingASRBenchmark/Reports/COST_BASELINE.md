# Voice Cost Baseline

Assumes 60s audio, ~120-character cleaned transcript, China DashScope list prices.
Audio token rule: 25 tokens/second.
Default-route budget: ≤ ¥0.03/min.

| Route | Cost / min | Cost / 60s | Default-route OK |
| ----- | ---------- | --------------------------- | ---------------- |
| Qwen3.5 Omni Plus Realtime | ¥0.0858 | ¥0.0858 | no |
| Qwen3.5 Omni Flash Realtime | ¥0.0291 | ¥0.0291 | yes |
| Fun-ASR + Qwen Flash | ¥0.0201 | ¥0.0201 | yes |

## Recommendation

1. Default structure route: **Fun-ASR + Qwen Flash** (¥0.0201/min).
2. Keep Omni Plus for reply / hard correction only — it exceeds the ¥0.03/min default budget.
3. At 300 Pro minutes/user/month, Omni Flash ≈ ¥8.7274; Fun-ASR path ≈ ¥6.0239.
4. Never ship unlimited Omni Plus on ¥29.9/mo.
