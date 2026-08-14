# 架构决策：私有运行时与受控版本

## 目标

让 Windows 用户无需安装 Node.js、npm 或 PowerShell 7 即可使用 DeepSeek Harness，同时不影响用户已经存在的开发环境。

## 决策

1. 私有 Node.js 是唯一正式运行时。启动器总是调用安装目录中的绝对路径 `runtime/node/node.exe`。
2. 私有 PowerShell 7 会随 Windows x64 载荷分发，优先放在子进程 `PATH` 前方。
3. `@deepseek-ai/dsh` 使用精确版本号和 npm integrity 固定。用户机器不会运行未锁版本的 `npx`。
4. 构建时下载全部第三方载荷并校验 SHA-256；运行时载荷不提交进 Git。
5. 用户数据与程序分离：便携包可解压到任意目录，数据位于 `%LOCALAPPDATA%\DeepSeekHarness`；默认工作目录是其下的空 `workspace`，不把整个用户主目录作为 Harness 的工作根目录。
6. 未来更新采用并存版本、健康检查、显式切换和可回退方式；不覆盖运行中的旧版本。
7. 便携版启动器以私有 Node 运行。`start.vbs` 负责无窗口双击启动，并仅在用户显式启动时创建或更新当前用户桌面的快捷方式；`start.cmd` 用于命令行诊断。
8. 发布包为 ZIP，只打入明确白名单中的运行时、应用、启动器、运行时清单和发布文档；同时生成 SHA-256 文件供下载者核验。它不使用自解压 EXE，也不会在解压时写入安装目录或创建快捷方式。
9. 工作区选择固定使用官方 Harness 的网页内 `browse` Host 后端。启动器通过随包分发的 `--patch` 覆盖层装配该后端与社区驱动器选择 Client；启动时只会在 DSH 数据目录的受管模块回退位置创建或更新该 Client 的专属链接，不改动用户配置，也不触发可能停留在任务栏后台的 Windows 原生文件夹窗口。

## 不变量

- 不修改 Windows 系统或用户级 PATH。
- 不调用 `npm install -g`，不写入用户全局 npm 目录。
- 不读取、上传或记录 DeepSeek API Key。
- Web UI 的默认绑定地址必须是 `127.0.0.1`。
- 运行时版本必须来自 [`../config/runtime-manifest.json`](../config/runtime-manifest.json)。
- 启动器仅将私有 Node 和 PowerShell 前置给 DSH 子进程；不会写入系统或用户环境变量。
- 启动器日志会脱敏符合 `sk-...` 格式的 API Key。
- 网页内退出请求只能携带该次启动随机生成的令牌访问本机精确路由；请求先完成响应，再经官方 `appExit` 通道优雅关闭 DSH。
- 工作区目录选择覆盖层必须作为启动器运行时的一部分分发，并在启动 DSH 时通过 `--patch` 传入。
- Windows 盘符由社区 Client 通过官方目录列表 API 仅探测已挂载的 `C:` 至 `Z:`；不会挂载磁盘、修改权限或枚举网络共享。网络共享继续要求用户显式输入完整 UNC 路径。

## 构建源策略

构建端的 npm registry 在运行时清单中显式指定，并可由 `build-runtime.ps1 -NpmRegistry <url>` 覆盖。首版默认使用适合中国大陆网络的镜像；无论使用哪个 registry，`package-lock.json` 中的 npm integrity 都必须验证每个下载包。最终用户不会在首次启动时安装或更新 npm 依赖。
