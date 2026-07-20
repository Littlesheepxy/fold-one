# iOS 知更 — 键盘优先原生方案（Session 简报）

给**另一个 Cursor session**用的执行简报。改动均在 `apps/ios`（新目录）+ 少量后端配套；不碰桌面端功能代码。

> 本文件可以随时修改：改完哪节，把对应约束/里程碑同步更新即可；执行 session 以本文件为准。

## Goal

任何 App 里切到知更键盘 → 点麦说话 → 流式上屏 → 松手插入净化后文本。**原生 Swift/SwiftUI**，对标 Typeless / Wispr Flow 的丝滑体验。

## 已定决策（用户已确认，勿再问）

| 决策 | 结论 |
|------|------|
| 产品形态 | **键盘优先**：键盘扩展 + 主 App 双体；主 App = 首页 + 活动 + 懂我 + 我的 |
| 主 App IA | 四 Tab；Onboarding 四段（品牌/试说/键盘/完成）；PC 活动+轨迹合并为「活动」，连接进「我的」 |
| 语音卖点 | 轻声输入（真机验收后主宣）、去口头词、场景整理；结果页只显示真实发生的处理标签 |
| 技术栈 | **原生 Swift/SwiftUI**，不用 HBuilder/uni-app/RN；最低 **iOS 17** |
| 代码位置 | **Fold One monorepo 里新建 `apps/ios`** |
| 键盘页 | Voice + 26 键拼音（librime）+ Symbols 横滑；不绑 KeyboardKit |
| 开源策略 | Hamster / azooKey **只作样板**；中文底座 **BSD librime**；语音桥参考 Wave/Dictus（MIT） |
| 产品特色 | 语音与拼音共用 `PersonalLexicon`：修正一次 → Rime 加权 + ASR hotWords |
| v1 ASR | **复用现有 `apps/asr-proxy`**；火山/豆包抽象成 `AsrProvider` 二期再换 |
| 净化/热词 | 服务端 structure + vocabulary；客户端维护个人词并随 `start.hotWords` 上传 |
| 免切换 | PiP 主实验 + Live Activity 状态入口；不达标则回退显式切主 App |
| 账号 | 复用 `apps/account-api`（邮箱验证码 → `zk_` Bearer）；上架前补 Sign in with Apple |
| 签名 | Team `D4NF2N957K`（本机已有开发证书） |

## 为什么不用 supa-man 的混合壳（背景，不用复述）

supa-man（`~/Desktop/supa-man/apps/mobile`）是 uni-app + HBuilder 离线 SDK。踩过的坑：云打包依赖 GUI、Widget 靠 Ruby 改 pbxproj、WKWebView 缺 `URL`/`URLSearchParams`、流式 ASR 准确率不足最终回退「录完上传」。**可以参考的**：Live Activity/灵动岛与录音联动（`Native/LiveActivity/`）、better-auth Apple 登录流程、后端临时凭证模式。

## 平台硬限制（架构由此而来）

**iOS 键盘扩展拿不到麦克风**（iOS 8 至今，所有竞品同此）。业界标准做法（Wispr Flow / Muesli / Wave 同款）：

```text
键盘扩展（RequestsOpenAccess + App Group）
  ├─ 点麦 → URL scheme 唤起主 App
  ├─ 主 App：录音 → 流式 ASR → 净化 → 写 App Group + Darwin notification
  ├─ 用户返回原 App（v1 手动切回保底；自动返回无公开 API，勿依赖私有 API）
  └─ 键盘轮询 App Group → 插入文本
```

**丝滑关键 = 听写会话时间窗**（对齐 `docs/voice-standby.md` 的会话级待机）：主 App 保持一个「听写会话」（5min/15min/1h 可选），窗口内键盘点麦不再切 App，音频经主 App 后台音频会话直传。

## Global Constraints

- 新代码全部在 `apps/ios/`；后端改动（若有）走独立小 PR
- 键盘扩展内存上限 ~50MB，UI 保持轻量，不进大依赖
- WS 协议以现有实现为规格：`packages/voice/src/aliyun-asr.ts`（客户端行为）+ `apps/asr-proxy/src/session.ts`（服务端）
- 铁律沿用仓库规则：录音数据不得静默丢弃；finish 超时/断线 = incomplete，提示重说，禁止当成功插入
- 每个里程碑留一个可跑验证（真机/模拟器路径写清楚）
- 分支 `feat/ios-keyboard`，按里程碑拆 PR

## 里程碑

### M0 — 工程骨架
- `apps/ios` Xcode 工程：主 App（SwiftUI）+ `ZhigengKeyboard` 键盘扩展 + Live Activity
- App Group：`group.app.zhigeng.ios`；URL scheme：`zhigeng://`
- Core 包：`AppGroupBridge` + `PersonalLexicon`（`swift test` 可跑，不依赖模拟器）
- 品牌资源复用 `apps/desktop/public/zhigeng-*`
- 验证：`cd apps/ios && xcodegen generate && swift test`；真机装上后键盘能在设置里启用、能打开主 App
- 状态（2026-07-20）：骨架已生成，`swift test` 20/20 通过；generic iOS Simulator **BUILD SUCCEEDED**；主 App 已替换占位 List，落地 Onboarding 四段 + 四 Tab（首页/活动/懂我/我的）；真机 App Group / Full Access / Rime 内存 spike 待做；ASR 真机流式待接通（试说暂为标注示例整理）

### M0.5 — 主 App UI（当前）
- Onboarding：品牌能力 → 试说学习 → 键盘验证 → 准备完成
- Tab：首页 / 活动 / 懂我 / 我的；首页仅 ReadyCard + 最近听写 + 最近学会
- 键盘扩展写入 `KeyboardHeartbeat`；主 App 不臆测 Full Access
- 验证：Xcode 真机安装 → 走完引导 → 四 Tab 可点 →「我的 → 重新运行引导」可重进

### M1 — 主 App 内听写端到端（先不做键盘）
- AVAudioEngine 采 16k PCM → WS 连 asr-proxy `/asr/stream`（先连本机 dev：Mac 跑 `pnpm asr:dev`，手机走局域网 IP）
- 流式 partial 实时上屏；松手 finish → structure 净化结果
- 结果页：复制 / 分享
- 验证：真机对着 `docs/agent-stress-checklist.md` 的 V1–V8 说一遍，关键词命中记录下来

### M2 — 键盘扩展 + 切换回插
- 键盘 UI：麦按钮 + 最近结果 + 地球键切回系统键盘
- 点麦 → `zhigeng://dictate` 唤起主 App → 录 → App Group 写结果 → 键盘插入
- 听写会话时间窗（会话内免切换直录）
- 验证：在微信/备忘录里完整走一遍「切键盘 → 说 → 插入」

### M3 — 账号 / 热词 / 权益
- 邮箱验证码登录（`apps/account-api`）
- ⚠️ 已知不一致：account-api 发 `zk_` 前缀 token，asr-proxy/gateway 注释偏 `tm_`——对接前先核对齐
- 热词：onboarding 采集（对齐桌面 know-you 步骤）→ 服务端 vocabulary 下发
- Free/Pro 档位 + voice-usage 上报
- 验证：热词导入前后同一句话的专名命中对比

### M4 — 丝滑打磨
- 灵动岛 / Live Activity 录音态（参考 supa-man `SupamindLiveActivity`）
- Action Button / 锁屏 Widget 直达听写
- 触觉反馈、上屏动效、断网降级文案

### 配套（不在 apps/ios，但发内测前必须）
- **asr-proxy 公网部署**：现在只有本机 dev；真机离开局域网就没 ASR。托管方案另定（ECS / 云函数均可）
- TestFlight 分发（Developer 账号已就绪）

## 关键风险

| 风险 | 应对 |
|------|------|
| 键盘→主 App→返回原 App 无公开自动返回 API | v1 用户手动切回；会话时间窗把切换次数压到首次一次 |
| asr-proxy 无公网部署 | M1 用局域网先跑通；内测前解决托管 |
| 键盘扩展 50MB 内存上限 | 扩展内零重依赖，逻辑全在主 App |
| 火山/豆包流式（product.md §5.4 方向）与 v1 复用 DashScope 冲突 | `AsrProvider` 协议隔离，二期实测延迟后再切，不阻塞 v1 |

## 参考路径

- 协议规格：`packages/voice/src/aliyun-asr.ts`、`apps/asr-proxy/src/session.ts`、`apps/asr-proxy/src/vocabulary.ts`
- 决策文档：`docs/product.md` §5.4（iOS 流式 ASR 决策）、`docs/voice-standby.md`（会话级待机）、`docs/plan-tiers.md`
- 账号/权益：`apps/account-api/src/`、`apps/asr-proxy/src/entitlements.ts`
- supa-man 参考（只抄模式不抄壳）：`~/Desktop/supa-man/apps/mobile/ios-native`

## 开 session 时的用户提示词（可复制）

```text
按 docs/ios-session-plan.md 执行 iOS 版开发，从 M0 开始，按里程碑拆 PR（分支 feat/ios-keyboard）。
决策已定勿再问形态/技术栈；每个里程碑完成后给我真机验证步骤再继续。
```
