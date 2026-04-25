# Fork Upstream Sync Guide

This repo is a fork of [getpaseo/paseo](https://github.com/getpaseo/paseo). We maintain custom features on top of upstream releases.

## Remote setup

- `origin` → `ygcedu/paseo` (our fork)
- `upstream` → `getpaseo/paseo` (upstream, read-only)

## Branch naming convention

- `main` — tracks upstream `main` (no custom commits)
- `feature/{version}-plus` — based on upstream release tag `v{version}`, with our custom commits cherry-picked on top

Current plus branch: `feature/0.1.62-plus` (based on `v0.1.62`)

## Our custom commits (cherry-picked onto plus branches)

| Commit | Description |
|---|---|
| `feat(desktop): 添加 release 构建脚本和 macOS ad-hoc 签名` | Desktop release build script |
| `feat(server,app): add free-code as a new agent provider` | Free Code provider (Claude Code fork) |
| `feat(server,app): add Devin as a new agent provider via ACP` | Devin for Terminal provider via ACP |

## Sync procedure (when upstream releases a new version)

```bash
# 1. Fetch upstream
git fetch upstream --tags

# 2. Update main to match upstream
git checkout main
git merge upstream/main
git push origin main

# 3. Create new plus branch from the release tag
git checkout -b feature/{version}-plus v{version}

# 4. Cherry-pick our custom commits (resolve conflicts as needed)
git cherry-pick <commit-hash>...

# 5. Fix typecheck errors after cherry-pick
npm install
npm run typecheck

# 6. Push the new branch
git push origin feature/{version}-plus
```

## Conflict resolution tips

- **Feature already in upstream**: `git cherry-pick --skip` — upstream may have implemented the same feature differently
- **Our unique feature**: resolve conflicts manually, adapting our code to upstream's new architecture
- **After rebase/cherry-pick**: always run `npm run typecheck` to catch API signature changes
- **Enable git rerere** to auto-resolve recurring conflicts: `git config rerere.enabled true`

## Skipped commits (already covered by upstream)

| Original commit | Upstream equivalent | Notes |
|---|---|---|
| `fix(server): Windows 上优先选择 .cmd/.exe 可执行文件并修复 .cmd 启动` | `fafefb7e fix(server): handle .cmd files on Windows for Claude Code spawn` + PowerShell shim support | 上游方案更完善，支持 PowerShell shims |
| `fix(app): 修复 IME 输入法确认时误触发消息发送` | `8023e1f0 fix: skip Enter key handling during IME composition (#270)` | 上游方案更完善，做了 web-only scope 和 isComposing/keyCode 229 双重检测 |
| `feat(server): 从 settings.json 加载 Claude 配置并改进 API Key 检测` | `b6147e39 feat(server): show Claude auth status in provider diagnostic` + `resolveClaudeAuth()` | 上游用 `claude auth status` 命令检测认证，而非读取 settings.json |

> **注意**: `feat(server): resolve Claude model from environment variables` 和 `fix(server): support ANTHROPIC_AUTH_TOKEN` 这两个 commit 在 `origin/main` 上但不在任何上游 tag 中，上游 v0.1.62 用了 `resolveClaudeAuth()` + SDK bundled binary 的不同架构替代。
