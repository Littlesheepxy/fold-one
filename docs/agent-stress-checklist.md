# Agent 上线前体验抽检清单

自动化：`pnpm test:agent-stress`（L1 headless）。本清单是 **L2 真桌面打分**，人工约 20 分钟，只打分不排错。

封闭内测发放与范围说明见 [beta-tester-guide.md](./beta-tester-guide.md)；官网申请内测码见 `/beta`。

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
| T1 | **语音转写精度 / 关键热词** | 真说 V1–V8；对照 transcript：专有名词是否被吃掉/改成日常词；再看是否进对 agent | 双轨门禁已修（见下）；真人开口仍未测 |
| T2 | 语音 → agent 端到端 | 同一批话术不只看字对，还要看任务是否做对 | 未测（依赖 T1 的真人录音） |
| T3 | Codex 难意图 live | `FOLD_PREFERRED_EXECUTOR=codex FOLD_STRESS_LIVE_AGENT=1 … journey-local-agent` | 阻塞：本机 `codex` CLI 装坏了（见下），和之前记的 usage limit 是两个问题 |
| T4 | 真机 HITL | Chrome 断连授权自动续跑；群消息确认卡取消无副作用 | 未测，但已埋点（见下）：Chrome/Gmail/屏幕权限授权会自动记时长+选择，测完跑报告脚本就知道；群消息确认卡目前是纯 UI 演示，挂不上埋点 |
| T5 | Overlay 体感 | local_agent 交 Claude/Codex 时文案是否说清；compiled 是否少闪 planning | 未测，但已埋点（见下）：planning 等 phase 停留时长现在客观可查；文案是否说清仍要人肉看 |
| T6 | ASR 基准回归（可选） | `Experiments/StreamingASRBenchmark` 对 V1–V8 出 WER/热词错字表，和真机 transcript 对照 | 工具链验证过，见下 |
| T7 | ASR 基准工具加自动错字率对比（新发现的缺口） | `BenchmarkRunner`/`ReportWriter` 目前只测延迟/RTF，`recognized_text` 不会自动对 `utterances.json` 的 ground truth 算 WER，需要人工比对 | 未做 |

语音热词备注：仓库有 utterance 素材，**没有**硬热词表；靠大模型 + 后处理。T1 的目标是量「关键词错了多少」，再决定要不要加 bias / 词表。

### 双轨专名纠错（07-20）

短命令（V1–V8 全中 `shouldCleanSpeechLocally`）不再一刀切关云，按权益拆：

| 档位 | 行为 |
|------|------|
| **Pro / 试用未耗尽**（`smartAccess.allowed`） | 客户端下发热词 → structure 有热词时走 **Fun-ASR + vocabulary_id**；无热词仍 Omni；Omni 路径 instructions 注入专名；`directStructured` 仍跑本地轻纠；后处理 `preferQuality` + `profileKeywords` |
| **Free 无试用** | 本地快路径 + `applyLocalHotwordHints`（去空格/大小写/驼峰）；**不**做谐音深纠 |

词源：onboarding `know-you`（职业/领域/英文专名 + 输入法导入）→ `resolveSpeechHotwords`。

验证：`pnpm --filter @fold/ai test:local-hotword-hints`；`pnpm --filter @fold/asr-proxy self-check`。

### 埋点（07-18）：T1/T2/T4/T5 测完自动出报告，不用手填表

真机测完（说话 / 走 HITL / 触发任务）后跑：

```bash
pnpm exec tsx scripts/read-stress-log.ts --since=30m
```

会读 SQLite 里已落盘的记录，汇总成报告，不需要用户手工描述：

- **T1/T2**：`saveVoiceInteraction` 本来就存了每次语音的原始 transcript + 净化后 outcome（episode 表），脚本按时间窗读出来，并对 `InputSurface`/`ARR`/`Fast Path` 等已知热词做命中检查（STT 直接识别对 / 净化纠回来了 / 完全丢了）。
- **T5**：`updateTaskRun` 新增：phase 变化（understanding→planning→executing→…）现在会落一条 `phase.changed` 事件（`packages/memory/src/run.ts`），带时间戳，脚本据此算出每个 phase 停留了多久——可以客观回答「compiled 是否少闪 planning」，而不是凭印象。
- **T4（部分）**：`orchestrator.ts` 里 `ensureExecutionPrerequisites` 调用前包了一层 `withApprovalLogging`，Gmail CLI / 浏览器 CDP / 屏幕录制权限这三类 HITL 授权卡会记 `approval.requested`/`approval.resolved`（含选项、耗时、用户选择）——**这条覆盖「Chrome 断连授权自动续跑」**。

**没覆盖到的**：意图抽检 #6/#7「群消息确认卡取消无副作用」——查了全仓库，`packages/skills` 里没有任何风险确认门禁调用 `requestUserAction`；唯一发出这张卡的地方是 `main.ts` 里 `FOLD_E2E_HITL=1` 的开发态直触发（不经过 `runTask`，没有真实 runId），所以这条目前还是纯 UI 能力演示，不是真实策略门禁，埋点也就挂不上去——如果要测，仍需人肉盯着 overlay 看文案和取消后有没有副作用。

顺畅度/文案是否说清这类主观体感，埋点给不出分数，仍要人肉扫一眼。

### T1 根因排查（07-18）：链路里挖出两个真 bug，已修

用 T6 dry-run 里真实 ASR 引擎（sherpa_zipformer/paraformer）啃 TTS 音频后吐出的错字文本（如 `sure face`→应为 `InputSurface`、`on`→应为 `ARR`），直接灌进产品的 `structureSpeechText` 纠错函数验证，起初 **0/4** 关键词纠回来，查出两个问题：

1. **`generateFastText`/`generateFastVision` 硬编码 temperature，Kimi Code Plan 接口只接受 1**：`.env` 里 `FOLD_PLANNER_PROVIDER=moonshot` 走的是 `MOONSHOT_BASE_URL` 指向的 Kimi Code Plan 端点，该端点要求 `temperature` 必须等于 1，但 `structure-speech.ts`/`predict-drafts.ts` 三处硬编码了 0.2/0.35/0.4，全部收到 `400 invalid temperature`。因为上层都有 `catch { return heuristicStructure(text) }` 式静默兜底，**从不报错**，直接退化成本地啟发式清洗（去口头禅，不纠专名）——语音专名纠错、AI 代回草稿、Aha 主动提示三个云端能力，在当前 `.env` 配置下全部静默失效。已修：`fast-text.ts`/`fast-vision.ts` 在 `choice.provider === "moonshot"` 时强制 `temperature=1`，回归见 `packages/ai/src/fast-text.self-check.ts`。
2. **`profileKeywords` 在真实语音链路里从没传过**：`structureSpeechText` 的 `profileKeywords` 纠错入参此前只在 onboarding 演示页（`onboarding-compare.ts`）用到，`main.ts` 里两处真实语音调用都没传——机制设计上就没接上生产链路。已接：`main.ts` 两处都改成 `profileKeywords: getSpeechHotwords()`（见下「热词合并」）。

修完后拿同一批错字文本重跑：**2/4**（`Fast Path`、`ARR` 纠对了；`InputSurface`/`ThoughtSurface`、`compare/branch/diff` 这两条云端模型返回空结果，退回本地兜底，看起来是 `moonshot-v1-8k` 这个快模型本身对高度混乱的中英混杂错字处理不稳，不是代码 bug）。

**新发现已闭合（07-20）**：原先 `shouldCleanSpeechLocally()` 对短命令强制 `allowCloud: false`，Pro/试用的专名增强也被掐掉。现已按档位拆开——付费/试用短命令上云；免费仅本地轻纠（见上「双轨专名纠错」）。

### 热词合并（07-19）：profile + 输入法词库

`structureSpeechText` 的 `profileKeywords` 现在由 `resolveSpeechHotwords()`（`packages/runtime/src/speech-hotwords.ts`）统一产出：profile 专名（`extractProfileKeywords`，角色/领域/工具/摘要/迁移档案抽取）优先，已导入的输入法词库（`loadImportedInputHabits()`，`hot_word` > `text_replacement` > `word` > `phrase`）补足余量，去重后截 12 个（宁少勿多，避免净化 prompt 膨胀）。未导入词库时行为与之前一致（仅 profile）。

**补测法**（验证词库真的起作用）：
1. 设置 → Input Habit Scanner → 一键导入 PoC，确认"已导入 N 条"且无报错。
2. 从导入样例里挑一条日常口语不太可能自动识别的词（如自定义缩写/小众专名），用它造一句语音指令（长句 >200 字、或多句，避开上面 `shouldCleanSpeechLocally` 的短路）。
3. 真说一遍，看 `read-stress-log` 报告里该词在净化后 outcome 的命中：词库导入前净化丢了、导入后纠回来 = 热词通路通了。

### 自动 Aha 主动建议（07-19）

后台监测 → 系统通知 → 点通知进完整预测卡（复用现有 `PredictConfirmCard` 交互）。核心决策：`packages/runtime/src/aha-proactive.ts` 的 `decideAhaProactiveShow()`，信心 + top 建议信心双高阈值（normal 档 0.72/0.8），冷却 + 每日上限节制。档位（`FoldConfig.ahaProactiveFrequency`）：off（默认）/ low（30min·3次）/ normal（10min·6次）/ high（3min·12次）。首页「知更 注意到了」框右上角可直接调档；后台每 60s 检查一次（`startAhaProactiveLoop`），弹出用 macOS 系统通知（不抢焦点、尊重勿扰模式），点通知才弹自有卡（`ahaProactiveReason` 标记「主动建议」，反馈 surface 与手动触发区分）。

**补测法**：设置 normal 档 → 在一个聊天 App 里停留 ≥2 分钟（让情境信心升上去）→ 等系统通知弹出；点通知 → 预测卡应显示「主动建议 · 猜你想做」；Esc 关 → dismiss 落库（surface=task）。

### T6/T8 语音热词流水线（07-20，可重复）

TTS（macOS `say`）→ Fun-ASR + vocabulary → 本地/云端净化 → 关键词表：

```bash
pnpm voice:hotword-pipeline
# 或经本地 proxy：pnpm voice:hotword-pipeline -- --proxy=ws://localhost:3003
# 只测后处理：pnpm voice:hotword-pipeline -- --skip-asr
```

报告目录：`Experiments/StreamingASRBenchmark/Reports/hotword-pipeline/`（`report.md` / `report.json` + 各条 WAV）。

**注意**：TTS ≠ 真人，不能替代 T1 真人开口；用来回归「热词是否进引擎 / 后处理是否纠得回来」。优化后（短缩写 weight=5 + context + Pro 语境纠 ARR）：**8/8**（V4 ASR 仍可能出 `on`，OUT 由 `applyContextualAcronymFixes` 纠回）。


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
