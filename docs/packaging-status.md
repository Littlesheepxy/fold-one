# 打包与分发状态（内测阻断项）

## 现状

- 客户端以 `pnpm desktop:dev` / `vite` + Electron 运行，**尚未接入** electron-builder / Electron Forge / Sparkle / electron-updater。
- 无仓库内 codesign / notarize 脚本；无 GitHub Actions release workflow。
- 因此：**不能**对非技术用户承诺「点链接下载 DMG」。

## 内测过渡方案

1. 技术内测：按 [beta-tester-guide.md](./beta-tester-guide.md) 本地跑。  
2. 给非技术同学：由维护者在本机临时 `electron-packager` / 手工签名后私发（不进主流程亦可）。  
3. 官网 CTA 已改为「申请内测码」，避免假下载按钮。

## 建议下一迭代（需 Apple Developer）

1. 引入 `electron-builder`（mac target：dmg + zip）。  
2. `CSC_LINK` / `APPLE_ID` / `APP_STORE_CONNECT` API key 做公证。  
3. 可选：Sparkle 或 electron-updater 自动更新。  
4. CI：tag → build → 上传私有分发（或 GitHub Release 仅对协作者可见）。

完成前请保持内测规模小、说明文档诚实。
