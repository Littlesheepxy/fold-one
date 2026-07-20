# Session B — 真人验收（T1/T2 + L2）

给**另一个 Cursor session**用。本 session **只做真桌面体验验收与报告**，不负责开 PR / 合 main（那是 Session A）。工程未进 main 时仍可用当前分支 `desktop:dev` 测，但对外发邀请前确认 Session A 已合。

## Goal

用真人开口 + L2 抽检证明「可以发封闭内测」，并产出可勾选的通过/不通过结论；可选补 T4/T5/Aha 主动建议。

## Global Constraints

- 仓库：`/Users/littleyang/Desktop/Fold One`
- 清单权威源：`docs/agent-stress-checklist.md`
- 内测边界：`docs/beta-tester-guide.md`（主推转写/代回；Agent 实验；无签名 DMG）
- **TTS `voice:hotword-pipeline` 8/8 ≠ 本 session 过关**；必须真人说 V1–V8
- 过关线（硬）：
  - V1–V8：≥6/8 关键词正确，且 ≥4 条能进对 agent
  - 意图 1–10：均分 ≥3.5；无卡死 / 白屏 / 误发外部消息
  - F1–F3：compiled 自聊体感 &lt;5s；同类第二次不明显更慢
  - Aha 5 次：≥3 次「会想点」
- 测完用埋点报告，少手填：
  ```bash
  pnpm exec tsx scripts/read-stress-log.ts --since=30m
  ```
- Agent 默认安全：Subagent / 本地脚本 / UI-TARS **保持关**（除非本条明确在测 Agent）
- 本 session **默认不改产品代码**；发现 bug → 记 RED 复现步骤 + 最小复现，另开 fix session，勿在验收 session 大改

## 启动

```bash
cd "/Users/littleyang/Desktop/Fold One"
# 若 Session A 已合 main：
git checkout main && git pull
# 否则可继续用 feat/stress-telemetry
pnpm asr:dev          # 云端 ASR 时
pnpm desktop:dev
```

可选自动进任务：

```bash
FOLD_E2E_INTENT="帮我整理刚下载的报价发给 Jason" pnpm desktop:dev
```

## 任务 1 — 真人 T1 + T2（约 20 分钟）

素材对齐 checklist「语音 × AI / 工作术语」与 `Experiments/StreamingASRBenchmark/Fixtures/utterances.json`。

| # | 说什么 | 关键词对？ | 进 agent？ | 备注 |
|---|--------|------------|------------|------|
| V1 | Fast Path 要优先保证 first character latency |  |  | |
| V2 | 这个 resolver 不应该每次重置整段 transcript |  |  | |
| V3 | InputSurface 和 ThoughtSurface 应该是两个独立的 surface |  |  | |
| V4 | 这家公司今年 ARR 大概三千万，续费率还可以 |  |  | |
| V5 | 这个项目投前估值十四亿，但是目前还没有收入 |  |  | |
| V6 | 我们需要确认一下毛利率和销售回款周期 |  |  | |
| V7 | 你帮我看一下这个 PR 的 context 有没有问题 |  |  | |
| V8 | 帮我 compare 一下这两个 branch 的 diff |  |  | |

测完：

```bash
pnpm exec tsx scripts/read-stress-log.ts --since=30m
```

报告应能看到原始 transcript、净化 outcome、热词命中（STT 对 / 净化纠回 / 丢）。把命令完整输出贴进本 session 结论。

**T2**：同一批话不只看字，还要看任务是否做对（进错 agent / 没触发 = 不过）。

建议：Pro/试用开着测一轮（云端热词）；有时间再关试用看 Free 轻对齐是否仍可接受（不挡首发，但记一笔）。

## 任务 2 — L2 意图抽检（约 20 分钟）

每条打三个分 1–5：顺畅 / 交互 / 结果。填 `docs/agent-stress-checklist.md` 表格或本 session 回复里复制一份。

| # | 意图 | 顺畅 | 交互 | 结果 | 备注 |
|---|------|------|------|------|------|
| 1 | 帮我整理刚下载的报价发给 Jason |  |  |  | Downloads 需有近期 PDF |
| 2 | 上次那个报价再发一份 |  |  |  | |
| 3 | 我刚才让你做过什么 |  |  |  | |
| 4 | 看一下 Chrome 当前页面标题 |  |  |  | CDP/Bridge |
| 5 | 帮我截一张当前屏幕 |  |  |  | 权限 HITL |
| 6 | 给产品讨论群发一条测试（应出确认卡） |  |  |  | 勿真发错群 |
| 7 | 取消掉刚才的确认 |  |  |  | 无副作用 |
| 8 | 用不存在的文件路径读 PDF |  |  |  | 失败文案 |
| 9 | 把这段话交给本地 Agent 总结 |  |  |  | 需 CLI；无则 SKIP 并注明 |
| 10 | 今天日历接下来有什么 |  |  |  | |
| 11 | 设置切到「自己的 Agent」后修仓库类意图 |  |  |  | 可选 |
| 12 | 会议纪要同步 Obsidian（WorkBuddy） |  |  |  | 不可用则 SKIP 文案 |

## 任务 3 — 快路径 F1–F3（约 15 分钟）

| # | 意图 | 延迟 | planning 闪过？ | 备注 |
|---|------|------|----------------|------|
| F1 | 在飞书给我自己发一条消息：快路径压测… |  |  | compiled &lt;5s |
| F2 | 再发一条类似自聊 |  |  | |
| F3 | 明天 15:00–16:00 建飞书日历「快路径」 |  |  | 第二次应更快 |

## 任务 4 — Aha（5 次）

设置 → Home「知更注意到了」。换场景：写代码 / 比价网页 / 空闲桌面 / 邮件 / 会议前。

| 次 | 场景 | 贴切？ | 会想点？ | 备注 |
|----|------|--------|----------|------|
| 1–5 |  |  |  | |

## 任务 5 — 建议项（可不挡首发，有时间再做）

### T4 HITL

- Chrome 断连 → 授权卡 → 允许后是否自动续跑
- #6/#7 群确认卡：取消无副作用（注意：群确认目前偏 UI 演示，盯 overlay）

测完可再跑 `read-stress-log` 看 `approval.requested` / `approval.resolved`。

### T5 Overlay

- 交给 Claude/Codex 时文案是否说清
- compiled 是否少闪 planning（可用 log 里 phase 停留时长核对）

### Aha 主动建议

1. 档位设 **normal**
2. 聊天 App 停留 ≥2 分钟
3. 等系统通知 → 点进预测卡应标「主动建议」
4. Esc → dismiss 落库

### 运营核对（发邀请前勾）

- [ ] 对方同意协议/隐私（`/beta` 申请表）
- [ ] 话术：主推代回/转写，Agent 实验
- [ ] 反馈：设置→高级→反馈 或 hello@zhigeng.app
- [ ] Subagent 默认关
- [ ] 说明安装方式：`desktop:dev` 或私发，**无商店下载**

## Done 标准（给用户的最终判决）

回复必须包含：

```text
## 验收结论
- T1/T2：PASS / FAIL（x/8 关键词，y/8 进 agent）
- L2 意图：PASS / FAIL（均分，是否有卡死/误发）
- F1–F3：PASS / FAIL
- Aha：PASS / FAIL
- 建议项：做了哪些 / 跳过哪些
- 能否发封闭内测邀请：是 / 否（否的话列出必须修的 RED）
```

并附上 `read-stress-log` 关键输出摘要。

## 本 session 明确不做

- `git push` / `gh pr create` / merge → **Session A**
- 改 Fun-ASR vocabulary / 双轨纠错实现（除非验收发现 P0 且用户要求当场修）
- 打包公证、支付完整计费、T3 Codex、T7 WER

## 与 Session A 的衔接

| Session A 状态 | Session B 怎么做 |
|----------------|------------------|
| 已合 main | `checkout main` 再测 → 结论可直接用于发邀请 |
| PR 未合 | 可在当前分支测，结论标注「基于未合分支」；发邀请前等 A 合完再 spot-check 语音 2 条 |
| L1 红 | 暂停发邀请；把 FAIL 剧本名丢给 Session A |

## 开 session 时的用户提示词（可复制）

```text
按 docs/launch-session-b-qa.md 执行真人验收。
不要开 PR、不要合 main。测完给出「能否发封闭内测邀请」判决，并贴 read-stress-log 摘要。
```
