# DeepSeek Harness Community Launcher

面向 Windows 小白用户的 DeepSeek Harness 非官方社区启动器。它会使用应用私有的 Node.js 和 PowerShell 运行时启动官方 Harness，不安装全局 npm 包、不修改用户的 `PATH`，也不干扰用户已经安装的 Node.js。

> DeepSeek Harness 仍处于开发者预览阶段。本项目固定并验证特定版本，绝不在用户机器上追踪 `latest`。

## 当前里程碑

第一阶段：构建一个可复现的 Windows x64 便携运行时。

- 固定 Node.js、PowerShell 与 `@deepseek-ai/dsh` 的版本及 SHA-256。
- 在构建时下载、校验和组装依赖；最终用户首次启动不需要 npm。
- 运行时载荷不提交 Git，只由构建脚本生成。

## 构建便携运行时

在 Windows PowerShell 中运行：

```powershell
./scripts/build-runtime.ps1
```

需要切换构建镜像时可显式传入 registry，例如：

```powershell
./scripts/build-runtime.ps1 -NpmRegistry https://registry.npmjs.org/
```

成功后，生成目录位于 `artifacts/portable/DeepSeekHarness/`。使用其中的私有 Node 启动命令为：

```powershell
./artifacts/portable/DeepSeekHarness/runtime/node/node.exe `
  ./artifacts/portable/DeepSeekHarness/app/node_modules/@deepseek-ai/dsh/lib/bin.js web
```

正式启动器会在下一阶段封装此调用，并处理端口、单实例、日志、浏览器打开和进程退出。

验证运行时与 Web UI：

```powershell
./scripts/verify-runtime.ps1
./scripts/smoke-web.ps1
```

## 数据与安全边界

- Harness 数据目录将由启动器设置在 `%LOCALAPPDATA%\DeepSeekHarness\data`。
- DeepSeek API Key 由官方 Harness Web UI 写入其凭据存储；本启动器不收集、不上传、不打印密钥。
- Web UI 只监听本机回环地址，不对局域网暴露。
- 本项目为非官方社区项目，与 DeepSeek 官方无隶属或授权关系。

## 许可证与来源

- DeepSeek Harness：MIT，详见官方仓库的 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。
- Node.js：构建脚本从 nodejs.org 官方分发下载。
- PowerShell：构建脚本从 PowerShell 官方 GitHub Release 下载。

具体版本、下载地址及哈希值在 [`config/runtime-manifest.json`](config/runtime-manifest.json) 中维护。
