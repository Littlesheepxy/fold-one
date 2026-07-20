# 打包与分发状态

## 现状（07-20 更新）

- **已接入 electron-builder**：`pnpm desktop:pack` 一条命令出 DMG（arm64，约 256MB）。
  - 配置：`apps/desktop/electron-builder.yml`；entitlements：`apps/desktop/build/entitlements.mac.plist`
  - 产物：`apps/desktop/release/Zhigeng-<version>-arm64.dmg`（已 gitignore）
  - 已验证：未签名包本机可安装、可启动（asar unpack 覆盖 better-sqlite3 / macos-input / uiohook / whisper addon / fold-calendar helper）
- **签名/公证还差一张证书**：本机钥匙串只有 `Apple Development`（跑不了对外分发），需要 **Developer ID Application** 证书（见下）。
- 无自动更新（Sparkle / electron-updater 未接）；无 CI release workflow。

## 出包命令

```bash
# 未签名（本机自测 / 私发给能点「仍要打开」的同学）
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm desktop:pack

# 签名 + 公证（Developer ID 证书装好后）
export APPLE_ID="<Apple ID 邮箱>"
export APPLE_APP_SPECIFIC_PASSWORD="<appleid.apple.com 生成的 App 专用密码>"
export APPLE_TEAM_ID="D4NF2N957K"
pnpm desktop:pack
```

electron-builder 检测到以上环境变量会自动 codesign（Hardened Runtime + entitlements）并 notarytool 公证 + staple；用户下载后可直接双击打开。

## Developer ID 证书（一次性，需 Account Holder 登录）

1. 打开 [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list) → `+`
2. 类型选 **Developer ID Application**（不是 Apple Development / Distribution）
3. 上传 CSR：可复用 `~/Desktop/supa-mind证书/CertificateSigningRequest.certSigningRequest`
4. 下载 `.cer` 双击导入钥匙串；`security find-identity -v -p codesigning` 应出现 `Developer ID Application: … (D4NF2N957K)`
5. App 专用密码：appleid.apple.com → 登录与安全 → App 专用密码

## 官网「点击下载」还差

1. 上面那张证书 + 一次签名公证出包
2. DMG 托管（对象存储 / GitHub Release 均可）
3. `apps/site` 把 `/beta` CTA 从「申请内测码」换成直链（或两者并存）

## 后续（不阻断下载）

- 自动更新：electron-updater + 托管 latest-mac.yml
- CI：tag → build → notarize → 上传
- Intel 支持：electron-builder target 加 x64（原生模块需双架构 rebuild）
