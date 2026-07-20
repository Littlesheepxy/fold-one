# 语音热词流水线报告

- 时间: 2026-07-20T03:40:51.151Z
- 音色: Tingting
- 通过: **8/8** (100%)
- vocabulary_id: vocab-foldhw-21615cfe4862461c95aeb5f07a866edd

| ID | 结果 | 命中 | 漏掉 | ASR |
|----|------|------|------|-----|
| V1 | PASS | Fast Path, first character latency | — | fast path要优先保证first character latency。 |
| V2 | PASS | resolver, transcript | — | 这个resolver不应该每次重置整段transcript。 |
| V3 | PASS | InputSurface, ThoughtSurface | — | InputSurface和ThoughtSurface应该是两个独立的Surface。 |
| V4 | PASS | ARR | — | 这家公司今年on大概3000万，续费率还可以。 |
| V5 | PASS | 十四亿 | — | 这个项目投前估值14亿，但是目前还没有收入。 |
| V6 | PASS | 毛利率, 回款 | — | 我们需要确认一下毛利率和销售回款周期。 |
| V7 | PASS | PR, context | — | 你帮我看一下这个PR的context有没有问题。 |
| V8 | PASS | compare, branch, diff | — | 帮我compare一下这两个branch的diff。 |

> TTS（say）≠ 真人；用来回归链路与热词，不替代 T1 真人开口。
