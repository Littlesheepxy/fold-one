# Session A — 合入 `feat/stress-telemetry` + L1 绿灯

给**另一个 Cursor session**用。本 session **只做工程合入与自动化验证**，不做真人开口、不做 L2 打分（那是 Session B）。

## Goal

把 `feat/stress-telemetry` 推到 remote、开 PR、L1 全绿后合进 `main`，让内测包/开发机跑的是含热词双轨的最新代码。

## Global Constraints

- 仓库：`/Users/littleyang/Desktop/Fold One`
- 分支：`feat/stress-telemetry`（相对 `origin` 曾 ahead 1：`feat(voice): 热词进引擎 + 双轨纠错与 TTS 回归流水线`）
- **不要**改打包/公证流水线（Session 范围外；见 `docs/packaging-status.md`）
- **不要**承诺官网可下载 DMG；官网保持「申请内测码」
- 合入前必须有刚跑过的 `pnpm test:agent-stress` 全量输出（live Agent / WorkBuddy 允许 SKIP）
- 用户未明确说「合 PR」前：只 push + 建 PR；**合并需用户确认或用户在本 session 明确授权**
- 不要提交无关文件（如 `apps/site/next-env.d.ts` 的 Next 本地路径漂移）
- 改动遵循外科手术：本 session 默认**零功能改动**；仅当 L1 红且根因在本分支时才修，且最小 diff

## 背景（执行者无需重读整段聊天）

- 热词：Pro/试用 → Fun-ASR `vocabulary_id` + Omni instructions + 语境纠；Free → 本地轻对齐
- TTS 回归 `pnpm voice:hotword-pipeline` 已 8/8，**不能替代**真人 T1（Session B）
- 清单全文：`docs/agent-stress-checklist.md`
- 内测说明：`docs/beta-tester-guide.md`
- 打包阻断：`docs/packaging-status.md`

## 任务步骤

### 1. Pre-flight

```bash
cd "/Users/littleyang/Desktop/Fold One"
git status -sb
git log --oneline -5
git log origin/main..HEAD --oneline | head -40
gh pr list --head feat/stress-telemetry
```

预期：在 `feat/stress-telemetry`；有未推 commit 或已与 origin 同步；若已有 PR 则跳到步骤 3。

### 2. Push

```bash
git push -u origin HEAD
```

预期：`feat/stress-telemetry` 与 `origin/feat/stress-telemetry` 对齐。

### 3. 开 PR（若尚无）

```bash
gh pr create --base main --head feat/stress-telemetry --title "feat: 压测埋点、热词双轨与内测文档" --body "$(cat <<'EOF'
## Summary
- 压测埋点（phase / HITL approval）+ `read-stress-log` 报告脚本
- 语音热词：引擎 vocabulary + Pro/Free 双轨纠错；onboarding know-you；TTS 流水线
- 内测指南 / plan-tiers / packaging 现状对齐

## Test plan
- [x] `pnpm test:agent-stress`（本 PR 合入前再跑一遍，贴退出码）
- [ ] Session B：真人 V1–V8 + L2 抽检（不挡合入，挡「对外发内测结论」）
- [ ] 不承诺签名 DMG（见 docs/packaging-status.md）

EOF
)"
```

把 PR URL 记下来，回复用户。

### 4. L1 自动化（合入门禁）

```bash
cd "/Users/littleyang/Desktop/Fold One"
pnpm test:agent-stress
```

- **PASS / 允许 SKIP**：local-agent / WorkBuddy live 未装时可 SKIP
- **FAIL**：先 RED 复现 → 根因 → 最小修复 → 再跑 → 新 commit（勿 amend 已 push 的）
- 可选加深（非必须）：
  ```bash
  FOLD_STRESS_LIVE_AGENT=1 pnpm test:agent-stress -- --scenario=journey-local-agent
  ```
  Codex（T3）本机坏了可跳过，记在 PR 注释即可。

### 5. 合入（需用户点头）

用户说「合」或「merge」后再：

```bash
gh pr merge --squash --delete-branch
```

或按仓库习惯 `gh pr merge --squash`。合完后：

```bash
git fetch origin && git checkout main && git pull
git log -1 --oneline
```

### 6. 分发预期（文档核对，不写新功能）

确认以下仍诚实，无需改代码：

| 文档 | 应仍写明 |
|------|----------|
| `docs/packaging-status.md` | 无 electron-builder / 公证 |
| `docs/beta-tester-guide.md` | 技术同学 `desktop:dev` 或私发；无商店下载 |
| 官网 `/beta` | CTA = 申请内测码，不是假下载 |

若发现官网仍有「下载 DMG」文案 → **只改文案**并单独说明。

## Done 标准

- [ ] `feat/stress-telemetry` 已 push
- [ ] PR 已开（URL 给用户）
- [ ] 本机刚跑过 `pnpm test:agent-stress`，全绿（或仅允许的 SKIP）
- [ ] 用户授权后已 squash 合入 `main`，或明确停在「等用户点合」
- [ ] 未误改打包流水线；未把 `next-env.d.ts` 脏改带进 PR

## 本 session 明确不做

- 真人 V1–V8、L2 意图打分、Aha 手测 → **Session B**
- T4/T5 真机 HITL / Overlay 体感 → Session B 建议项
- electron-builder / notarize / 自动更新
- T3 Codex usage / T7 WER 自动对比

## 交给用户的一句话

合完后告诉用户：「工程侧已进 main；请开 Session B 做真人 T1/T2 + L2，再决定能不能发内测邀请。」

## 开 session 时的用户提示词（可复制）

```text
按 docs/launch-session-a-merge.md 执行：push、开 PR、跑 pnpm test:agent-stress。
先不要 merge，等我确认后再合。不要做人肉语音/L2 验收。
```
