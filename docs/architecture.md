# 架构决策：私有运行时与受控版本

## 目标

让 Windows 用户无需安装 Node.js、npm 或 PowerShell 7 即可使用 DeepSeek Harness，同时不影响用户已经存在的开发环境。

## 决策

1. 私有 Node.js 是唯一正式运行时。启动器总是调用安装目录中的绝对路径 `runtime/node/node.exe`。
2. 私有 PowerShell 7 会随 Windows x64 载荷分发，优先放在子进程 `PATH` 前方。
3. `@deepseek-ai/dsh` 使用精确版本号和 npm integrity 固定。用户机器不会运行未锁版本的 `npx`。
4. 构建时下载全部第三方载荷并校验 SHA-256；运行时载荷不提交进 Git。
5. 用户数据与程序分离：程序位于 `%LOCALAPPDATA%\Programs\DeepSeekHarness`，数据位于 `%LOCALAPPDATA%\DeepSeekHarness\data`。
6. 未来更新采用并存版本、健康检查、显式切换和可回退方式；不覆盖运行中的旧版本。

## 不变量

- 不修改 Windows 系统或用户级 PATH。
- 不调用 `npm install -g`，不写入用户全局 npm 目录。
- 不读取、上传或记录 DeepSeek API Key。
- Web UI 的默认绑定地址必须是 `127.0.0.1`。
- 运行时版本必须来自 [`../config/runtime-manifest.json`](../config/runtime-manifest.json)。

## 构建源策略

构建端的 npm registry 在运行时清单中显式指定，并可由 `build-runtime.ps1 -NpmRegistry <url>` 覆盖。首版默认使用适合中国大陆网络的镜像；无论使用哪个 registry，`package-lock.json` 中的 npm integrity 都必须验证每个下载包。最终用户不会在首次启动时安装或更新 npm 依赖。
