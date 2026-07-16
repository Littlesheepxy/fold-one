# 输入习惯迁移（桌面 PoC → 后续移动端）

> 状态：**桌面仅测试链路**，产品化（UI、自动部署、移动端）后续再做。

## 目标

让用户从搜狗 / 微信 / Apple 等输入法迁移个人词库与短语，统一到枝根中间层，再导出到 Rime（桌面）或各端自有候选词库（移动）。

## 中间层

- 路径：`~/.zhigeng/input-habits.json`
- 类型：`PersonalLexiconEntry`（`surface` / `reading` / `shortcut` / `source` / `kind`）
- 原则：**只处理用户主动提供的官方导出文件**（合规）；自动扫 `~/Library` 仅 PoC

## 已验证数据源

| 来源 | 导入方式 | 格式 | 状态 |
|------|----------|------|------|
| 搜狗 Mac | 偏好设置 → 词库 → 词库设置 → **导出** | `SGPU` `.bin` | ✅ 官方备份，61k 词 |
| 搜狗内部 | `sgim_usr_v3new.bin` + parse.py | usrDictV3 | PoC only，非合规上线路径 |
| 微信 WeType | `userDict/v5/*/*.ldb` UTF-8 扫描 | LevelDB | PoC only |
| Apple | Text Replacement plist | 明文 | ✅ |
| Rime | `~/Library/Rime/*.yaml` | yaml/txt | 读入已有；**写出见下方** |

## 桌面测试：搜狗 → Rime

```bash
cd apps/desktop

# 一键脚本：检测输入法 → PoC 导入 → 可选搜狗 .bin → Rime
chmod +x scripts/import-input-habits.sh
./scripts/import-input-habits.sh ~/Desktop/搜狗词库备份_2026_07_13.bin

# 或分步：
npx tsx electron/input-habit-scanner/list-imes-cli.ts   # 仅检测
npx tsx electron/input-habit-scanner/import-cli.ts
npx tsx electron/input-habit-scanner/export-rime-cli.ts ~/Desktop/搜狗词库备份_2026_07_13.bin
```

输出目录：`~/.zhigeng/rime-export/`

| 文件 | 用途 |
|------|------|
| `zhigeng.user.dict.yaml` | 用户词库（词条 + 拼音 + 权重） |
| `zhigeng.custom.txt` | 自定义短语（`shortcut<TAB>surface`） |
| `default.custom.yaml.snippet` | 合并到鼠须管配置的说明片段 |

手动生效：复制到 `~/Library/Rime/`，按 snippet 修改 `import_tables` / `custom_phrase`，鼠须管 **重新部署**。

## 拼音与词频对齐（搜狗 → Rime）

- 拼音：搜狗 `a'li'ba` → Rime `a li ba`（`'` 换空格）
- 词频：搜狗 `freq` → Rime `weight`，`min(freq, 9999)`
- **不迁移**：搜狗动态选词权重、云同步、英文混输习惯

## 后续移动端（备忘）

1. **同一中间层**：移动端同步 `input-habits.json` 或 API 拉取词条列表（不必复用 Rime 文件）
2. **各端导出适配器**：
   - iOS：系统自定义短语 / 第三方输入法若提供导出则接文件；否则仅云同步或手动
   - Android：各 IME 差异大，优先官方导出 + 用户选文件
3. **枝根自产热词**：语音纠错、Agent 固定句 → append `PersonalLexiconEntry` → 各端 push
4. **桌面**：本目录 `export-rime.ts` 可演进为设置页「导出到 Rime」；移动端不需要 Rime，走自有键盘/候选 API

## 代码入口

```
electron/input-habit-scanner/
  sogou-sgpu.ts      # 搜狗官方 SGPU .bin 解析
  export-rime.ts     # → ~/.zhigeng/rime-export/
  export-rime-cli.ts # 测试 CLI
  list-imes-cli.ts   # 检测本机输入法
  import.ts          # 一键导入 PoC
  types.ts           # PersonalLexiconEntry
  MIGRATION.md       # 路线图 + 市占率 + 微信备忘
../../scripts/import-input-habits.sh  # 检测 + 导入 + 可选搜狗→Rime
```

设置页：**高级 → Input Habit Scanner** — 打开即显示本机输入法 Logo；「搜狗备份 → Rime」选官方 `.bin`。

## 合规

- **上线路径**：用户选择搜狗官方 `.bin` / 其他官方导出 → 解析 → 中间层 → 导出
- **避免**：内置自动读取 `~/Library/.../sgim_*.bin` 作为默认产品能力

---

## 中国市场占率（调研备忘，2025–2026）

> 第三方输入法 ≠ 全市场（还有 iOS 系统拼音、Android 厂商键盘、Gboard 等）。以下均为**第三方输入法子市场**的估计，各机构口径不一，作优先级参考即可。

### 寡占格局（第三方 IME）

| 来源 | 口径 | 结论 |
|------|------|------|
| MobTech《2025 中国第三方输入法行业洞察》（约 2025-07） | 四大头部合计 | **搜狗 + 讯飞 + 百度 + 微信 ≈ 84.4%**，其余 15.6% |
| QuestMobile《2025 移动应用市场年度报告》（引自行业报告，2026 初） | 按月活 MAU | **百度 34.1% · 搜狗 29.7% · 讯飞 18.6%**（三家合计 82.4%） |
| 正观新闻引 MobTech（2025） | 份额估算 | 搜狗 **~29%**、讯飞政企/语音强、百度下沉+搜索生态、**微信 >10%** |
| 36 氪 / 艾媒（2025 白皮书，口径偏「认知份额」） | 用户认知 | 搜狗 **42.3%** 仍常被列为第一（与 MAU 口径不可直接对比） |

### 增长与变量

| 厂商 | 趋势 |
|------|------|
| **讯飞** | 2025 下半年**新装增量/增速**常报第一；语音、会议场景强 |
| **百度** | 文心大模型绑定；AI 写作/语义生成 |
| **搜狗** | 腾讯系；社交斗图；资源部分向微信输入法倾斜 |
| **微信输入法** | 2022 起步，2023 更名，2024–25 混元 AI；**跨设备词库/常用语同步**；社交场景渗透 |
| **豆包输入法** | 字节 2025 下半年入局；端侧+语音；份额仍小但在涨 |
| **系统自带** | iOS「中文-拼音」、华为/小米键盘 — 未计入上表，但装机量巨大 |

### 对枝根迁移的优先级建议

| 优先级 | 输入法 | 理由 |
|--------|--------|------|
| P0 | **搜狗** | 份额高 + Mac 已有**官方 .bin 导出**（已打通） |
| P1 | **微信输入法** | 腾讯系增长快；你本机已装；**无本地文件导出**，路径不同 |
| P1 | **Apple 系统** | Text Replacement 明文；Mac/iOS 通用 |
| P2 | **百度** | 份额高；一般有 txt/scel 导出（待接适配器） |
| P2 | **讯飞** | 份额高；语音习惯为主，拼音词库导出需单独调研 |
| P3 | **Rime/鼠须管** | 极客小众；作桌面落盘目标，不是来源大户 |
| P3 | **豆包 / 千问** | 新玩家；Scanner 已预留 profile，等份额和导出能力成熟 |

---

## 微信输入法：后续怎么做

### 官方能力（合规路径）

**没有**类似搜狗的「导出 .bin 到桌面」按钮。官方迁移靠：

1. **跨设备粘贴和同步**（Mac / Win / iOS / Android）
   - 设置 → **跨设备** → 关联设备（匹配码，无需登录）
   - 开关：**个人词库同步**、**常用语同步**
   - 隐私政策：关联期间词库可经腾讯服务器**中转同步到关联设备**，非长期存储（以官方政策为准）

2. **常用语**（≈ 自定义短语）
   - 设置 → **常用语** → 添加常用语 + **输入码**
   - 可手动维护；**无批量导出文件**

3. **官网能力**：跨设备复制粘贴、同步词库（[z.weixin.qq.com](https://z.weixin.qq.com/)）

### 与搜狗路径的差异

| | 搜狗 | 微信输入法 |
|--|------|------------|
| 本地导出文件 | ✅ `SGPU` .bin | ❌ 无 |
| 跨端同步 | 账号云同步（不全量） | ✅ 跨设备匹配同步 |
| 短语 | 用户词库内 | **常用语**（独立功能） |
| 枝根合规导入 | 用户选 .bin | **不能**默认扫 `~/Library/.../WeType` 上线 |

### 本机 PoC 已探明（勿作产品默认）

- `~/Library/Application Support/WeType/userDict/v5/*/*.ldb`：UTF-8 可扫出 ~百余条中文（质量尚可）
- `user_hot_word/` LevelDB：protobuf，直接扫噪声大
- 深蓝词库转换等工具：**不支持**微信输入法格式

### 后续产品方案（移动端时一起做）

1. **首选**：引导用户在 WetType 内打开跨设备同步 → 在枝根侧**消费同步后的设备数据**（若自有键盘/候选层）
2. **桌面过渡**：用户手动整理常用语列表 / 从 PoC 导出 txt → 枝根「从文件导入」
3. **不做**：内置解析 WeType LevelDB 作为一键功能（协议与合规风险同搜狗读 Library）
4. **若微信日后提供导出**：再接文件适配器，进同一 `PersonalLexiconEntry` 管道

### 其他待调研 IME（简表）

| IME | 导出 | 备注 |
|-----|------|------|
| 百度输入法 | txt / bdict 等 | imewlconverter 支持 `bdpy` / `bdict` |
| 讯飞 | 待查 | 语音个人词库为主 |
| QQ 拼音 | txt / qpyd | 份额被搜狗/微信稀释 |
| 豆包输入法 | 未知 | 新产品 |
| macOS 简体拼音 | plist | imewlconverter `plist` |
