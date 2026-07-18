# Agent 上线前体验抽检清单

自动化：`pnpm test:agent-stress`（L1 headless）。本清单是 **L2 真桌面打分**，人工约 20 分钟，只打分不排错。

## 怎么跑

```bash
# 可选：指定一条意图自动进 executeTask
FOLD_E2E_INTENT="帮我整理刚下载的报价发给 Jason" pnpm desktop:dev

# 或启动后 DevTools Console：
# await window.fold.runTask("你的意图")
```

每条意图打三个分（1–5）：**顺畅度** / **交互清晰** / **结果满意度**。Aha 只记「会不会想点」。

## 意图抽检（10）

| # | 意图 | 顺畅 | 交互 | 结果 | 备注 |
|---|------|------|------|------|------|
| 1 | 帮我整理刚下载的报价发给 Jason |  |  |  | 需 Downloads 有近期 PDF |
| 2 | 上次那个报价再发一份 |  |  |  | 测历史召回 |
| 3 | 我刚才让你做过什么 |  |  |  | 测 episode 叙述 |
| 4 | 看一下 Chrome 当前页面标题 |  |  |  | 需 CDP / Bridge |
| 5 | 帮我截一张当前屏幕 |  |  |  | 测权限 HITL |
| 6 | 给产品讨论群发一条测试（应出确认卡） |  |  |  | HITL external |
| 7 | 取消掉刚才的确认 |  |  |  | 取消无副作用 |
| 8 | 用不存在的文件路径读 PDF |  |  |  | 失败文案是否人话 |
| 9 | 把这段话交给本地 Agent 总结（cwd=某项目） |  |  |  | 需 Subagent 开关 + CLI |
| 10 | 今天日历接下来有什么 |  |  |  | 日历权限 |
| 11 | 设置切到「自己的 Agent」后：修仓库类意图 |  |  |  | overlay 是否说清「交给了 Claude/Codex」；断 CLI 后是否自动回 Fold |
| 12 | 把这篇会议纪要同步进我的 Obsidian vault，并按项目名归档 |  |  |  | WorkBuddy 网关就绪时：是否走 `workbuddy.run` / 文案说清；不可用时是否不硬塞 |

自动化难意图分流：`FOLD_STRESS_LIVE_AGENT=1 pnpm test:agent-stress -- --scenario=journey-local-agent`（`runTask` → `agent.execute` → 改文件回传）。

## Fold 快路径体感（约 15 分钟）

记墙钟延迟；compiled 应感觉「秒回」，不应长时间停在 planning。

自动化：`pnpm test:agent-stress -- --scenario=journey-fastpath`（compiled &lt;8s；日历 recipe 热路径 ≤ 冷启动）。

| # | 意图 | 延迟 | planning 闪过？ | 备注 |
|---|------|------|-----------------|------|
| F1 | 在飞书给我自己发一条消息：快路径压测… |  |  | 期望 compiled &lt;5s、无 LLM |
| F2 | 再发一条类似自聊 |  |  | 第二次是否仍快 / recipe 是否命中 |
| F3 | 明天 15:00–16:00 建一个飞书日历「快路径」 |  |  | 同类第二次应明显快于冷启动 planner |

## 语音 × AI / 工作术语（约 20 分钟）

真说 → 看 transcript → 是否进对 agent 任务。素材对齐 `Experiments/StreamingASRBenchmark/Fixtures/utterances.json`。过关：关键名词不错成日常词，且能触发正确任务。

| # | 说什么 | 关键词是否正确 | 进 agent？ | 备注 |
|---|--------|----------------|------------|------|
| V1 | Fast Path 要优先保证 first character latency |  |  | utt_017 |
| V2 | 这个 resolver 不应该每次重置整段 transcript |  |  | utt_018 |
| V3 | InputSurface 和 ThoughtSurface 应该是两个独立的 surface |  |  | utt_005 |
| V4 | 这家公司今年 ARR 大概三千万，续费率还可以 |  |  | utt_021 |
| V5 | 这个项目投前估值十四亿，但是目前还没有收入 |  |  | utt_007 |
| V6 | 我们需要确认一下毛利率和销售回款周期 |  |  | utt_022 |
| V7 | 你帮我看一下这个 PR 的 context 有没有问题 |  |  | utt_004 |
| V8 | 帮我 compare 一下这两个 branch 的 diff |  |  | utt_016 |

## Aha（Settings → Home「知更注意到了」）

连续触发 5 次，换场景：写代码 / 比价网页 / 空闲桌面 / 邮件 / 会议前。

| 次 | 场景 | 回复是否贴切 | 会不会想点 suggestion | 备注 |
|----|------|--------------|----------------------|------|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |

## 通过标准（建议）

- 意图 1–10 平均分 ≥ 3.5，无「卡死 / 白屏 / 误发外部消息」
- F1–F3：compiled 自聊体感 &lt;5s；同类第二次不明显慢于第一次
- V1–V8：≥6/8 关键名词正确，且至少 4 条能进对 agent
- #12 WorkBuddy：网关可用时分流清晰；不可用时 SKIP/文案清楚（不硬塞）
- Aha 5 次里 ≥ 3 次「会想点」
- L1 `pnpm test:agent-stress` 全绿（本地 Agent / WorkBuddy live 允许 SKIP）

## 后续待测 TODO（未闭合）

自动化已绿：L1 全量、fastpath、WorkBuddy Ardot live、Claude 难意图回传、飞书 REAL。以下仍要人肉或等条件：

| ID | 项 | 怎么验 | 状态 |
|----|-----|--------|------|
| T1 | **语音转写精度 / 关键热词** | 真说 V1–V8；对照 transcript：专有名词是否被吃掉/改成日常词；再看是否进对 agent。虽走大模型 ASR，**未证明**产品链路（profile keywords / `structureSpeechText` / Pro 云端）对 AI·投资热词够稳 | 未测 |
| T2 | 语音 → agent 端到端 | 同一批话术不只看字对，还要看任务是否做对 | 未测 |
| T3 | Codex 难意图 live | `FOLD_PREFERRED_EXECUTOR=codex FOLD_STRESS_LIVE_AGENT=1 … journey-local-agent`；当前卡 **ChatGPT Codex usage limit**（约 Jul 23 后可再跑） | 阻塞：额度 |
| T4 | 真机 HITL | Chrome 断连授权自动续跑；群消息确认卡取消无副作用 | 未测 |
| T5 | Overlay 体感 | local_agent 交 Claude/Codex 时文案是否说清；compiled 是否少闪 planning | 未测 |
| T6 | ASR 基准回归（可选） | `Experiments/StreamingASRBenchmark` 对 V1–V8 出 WER/热词错字表，和真机 transcript 对照 | 工具链验证过，见下 |
| T7 | ASR 基准工具加自动错字率对比（新发现的缺口） | `BenchmarkRunner`/`ReportWriter` 目前只测延迟/RTF，`recognized_text` 不会自动对 `utterances.json` 的 ground truth 算 WER，需要人工比对 | 未做 |

语音热词备注：仓库有 utterance 素材，**没有**硬热词表；靠大模型 + 后处理。T1 的目标是量「关键词错了多少」，再决定要不要加 bias / 词表。

### T6 dry-run 记录（07-18）

`Fixtures/WAV/` 一直是空的，`Reports/ASR_BENCHMARK.md` 显示 `Runs: 0`——这个基准从没真正跑过。用 `say -v Tingting --data-format=LEI16@16000` 给 V1–V8 合成了 8 条占位 WAV（跑完即删，不是真人录音，不能当 T1 的结论），本地已下载模型的 `sherpa_zipformer` / `sherpa_paraformer` 两个引擎跑通了完整链路（编译 → 识别 → 出报告），没有崩：

| utt | 原文关键词 | zipformer 识别 | paraformer 识别 |
|---|---|---|---|
| utt_005 | InputSurface / ThoughtSurface | SURE FACE / FOUGHT SURFACE | input surface / faud face |
| utt_017 | Fast Path / first character latency | FAST PASS / FIRST CARRIAGE TO THE LA | fast path / forest carried to llatenc |
| utt_021 | ARR | 直接吞掉，句子里没有 ARR | 识别成 "on" |
| utt_016 | compare / branch / diff | 吞片衣下…BRENCH OF（几乎全错） | compare / branch of di（截断） |

**顺手发现一个更根本的缺口**：这个工具目前只测延迟/RTF（`ReportWriter.swift` 的报告表里没有 WER 列），并**不会**拿 `recognizedText` 和 `utterances.json` 里的 ground-truth `text` 自动比对算错字率——「WER/热词错字表」现在得人工拿 CSV 里的 `recognized_text` 列对着原文看，不是自动出的。要真正把 T6 变成能重复跑的基准，需要先给 `BenchmarkRunner`/`ReportWriter` 加一段文本对比逻辑（不在这次范围内，单独记一条）。

**结论**：工具链本身没问题，可以放心用真人录音跑；但即使跑了，也是「人工对照 CSV」而不是自动出错字率报告。T1/T2 仍然要等真人对着 V1–V8 说一遍。

## 基线日期

- 日期：
- 构建 / commit：
- 记录人：
