# Windows Claude Code 连接修复说明

## 问题描述

在 Windows 上运行 Paseo 时，连接 Claude Code 会报错：
```
[System Error] Claude Code native binary not found at D:\apps\nvm\packages\npm_global\claude
```

## 问题原因

在 Windows 上，`where.exe claude` 返回多个匹配项：
1. `D:\apps\nvm\packages\npm_global\claude` (shell script，无扩展名)
2. `D:\apps\nvm\packages\npm_global\claude.cmd` (Windows 批处理文件)

原来的代码只取第一个结果（shell script），但 Claude SDK 无法直接执行这个文件。

## 修复内容

已修改 `packages/server/src/utils/executable.ts` 文件，在 Windows 上优先选择 `.cmd`、`.exe` 或 `.bat` 文件。

## 应用修复的方法

### 方法 1: 从源码构建（推荐）

如果你的构建环境正常，可以直接构建：

```bash
cd E:/packages/paseo
npm install
npm run build:daemon
cd packages/desktop
npm run build
```

构建完成后，安装包位于 `packages/desktop/release/` 目录。

### 方法 2: 等待官方发布

这个修复已经提交到代码库，可以等待官方发布新版本后直接安装。

### 方法 3: 手动修改已安装的 Paseo（临时方案）

如果你已经安装了 Paseo Desktop 应用，可以手动修改：

1. 找到 Paseo 的安装目录（通常在 `C:\Users\<用户名>\AppData\Local\Programs\Paseo\`）
2. 找到 `resources\app.asar` 文件
3. 使用 asar 工具解包：
   ```bash
   npm install -g asar
   asar extract app.asar app
   ```
4. 修改 `app/dist/daemon/utils/executable.js` 文件中的相关代码
5. 重新打包：
   ```bash
   asar pack app app.asar
   ```

## 验证修复

修复后，重启 Paseo daemon，然后在 Paseo 应用中连接 Claude Code，应该可以正常工作。

## 技术细节

修改的代码位置：`packages/server/src/utils/executable.ts`

修改内容：在 Windows 平台上，当 `where.exe` 返回多个结果时，优先选择带有 `.cmd`、`.exe` 或 `.bat` 扩展名的文件。

```typescript
// 修改前
return (
  stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null
);

// 修改后
const lines = stdout
  .trim()
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

// Prefer .cmd or .exe files over shell scripts without extensions
const preferred = lines.find((line) => /\.(cmd|exe|bat)$/i.test(line));
return preferred ?? lines[0] ?? null;
```

## 联系方式

如有问题，请在 GitHub 仓库提 issue：https://github.com/getpaseo/paseo
