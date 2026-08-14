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

便携版已经包含正式启动器。双击 `launcher/start.vbs` 会在后台启动 DSH 并自动打开浏览器；需要查看命令输出或诊断时，使用 `launcher/start.cmd`：

```powershell
./artifacts/portable/DeepSeekHarness/launcher/start.cmd status
./artifacts/portable/DeepSeekHarness/launcher/start.cmd stop
```

启动器会处理端口冲突、单实例、日志、浏览器打开、私有环境变量和进程退出。为避免 Windows 原生文件夹窗口被放到任务栏后台，工作区选择默认使用官方 Harness 提供的网页内目录浏览器；不会启动额外的系统选择窗口。启动器还会在该界面中可视化列出 Windows 已挂载的盘符，点击后可继续浏览其下的文件夹；网络共享仍可在“输入路径”中填写 UNC 路径。

## 构建可发布 ZIP 包

在 Windows PowerShell 中运行：

```powershell
./scripts/build-portable-zip.ps1
```

会生成 `artifacts/dist/DeepSeekHarness-Portable-*.zip` 及同名的 `.sha256` 校验文件。用户下载后只需解压 ZIP 到任意空目录，再双击其中的 `launcher\start.vbs`；不需要管理员权限，也不会安装或修改 Node.js、npm、PowerShell 或 `PATH`。如果 3080 被占用，启动器会自动尝试后续端口。

ZIP 同时包含本项目 `LICENSE`、`README.md` 和 `THIRD_PARTY_NOTICES.md`，可离线查看使用说明和第三方许可来源。

验证运行时与 Web UI：

```powershell
./scripts/verify-runtime.ps1
./scripts/smoke-web.ps1
./tests/launcher-core-test.mjs
./tests/launcher-integration.ps1
./tests/portable-zip-test.ps1
./tests/portable-zip-e2e.ps1
```

## 数据与安全边界

- Harness 数据目录将由启动器设置在 `%LOCALAPPDATA%\DeepSeekHarness`；首次启动默认使用其下的空工作目录，而不是整个用户主目录。需要指定项目时可执行 `start.cmd start --workspace "D:\你的项目"`。
- DeepSeek API Key 由官方 Harness Web UI 写入其凭据存储；本启动器不收集、不上传、不打印密钥。
- Web UI 只监听本机回环地址，不对局域网暴露。
- 本项目为非官方社区项目，与 DeepSeek 官方无隶属或授权关系。

## 许可证与来源

- 本项目的启动器代码和文档采用 [MIT License](LICENSE)。
- DeepSeek Harness：MIT，详见官方仓库的 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。
- Node.js：构建脚本从 nodejs.org 官方分发下载。
- PowerShell：构建脚本从 PowerShell 官方 GitHub Release 下载。

具体版本、下载地址及哈希值在 [`config/runtime-manifest.json`](config/runtime-manifest.json) 中维护。

完整的分发说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目为非官方社区项目，不代表 DeepSeek，也不提供官方支持。

## 社区协作与发布

欢迎通过 [贡献指南](CONTRIBUTING.md) 提交改进。请在公开 Issue 中删除 API Key、令牌、私有工作区内容和个人信息；安全问题遵循 [SECURITY.md](SECURITY.md)。

创建 GitHub 仓库后，推送 `v*` 标签会由 `.github/workflows/release.yml` 在干净的 Windows Runner 中构建并验证 ZIP，上传 ZIP 与 SHA-256 文件，并创建同名 GitHub Release。发布标签前应先更新 `config/runtime-manifest.json` 中的启动器版本，使其与标签一致。
