# 🚀 DeepSeek Harness 社区启动器(Windows 便携版)

> 一个给 Windows 用户准备的 DeepSeek Harness 启动器 —— **不用装 Node.js、不用碰命令行、解压双击就能用**。

DeepSeek Harness 是 DeepSeek 官方推出的 AI 开发工具(开发者预览阶段)。但它默认需要你自己装好 Node.js 和 npm 才能运行,这对不搞编程的普通用户很不友好。

本项目的目标就是把这层麻烦彻底去掉:把 Harness 需要的运行环境**打包进一个绿色便携包里**,你只需要下载、解压、双击,浏览器自动打开就能开始用。

> ⚠️ **非官方项目**:本项目由社区维护,与 DeepSeek 官方无隶属关系,也不提供官方支持。

---

## ✨ 它解决了什么问题

| 官方方式的麻烦 | 本启动器的方式 |
|---|---|
| 要先安装 Node.js + npm | ✅ 便携包自带私有运行时,什么都不用装 |
| 要敲命令行启动 | ✅ 双击 `start.vbs`,自动启动并打开浏览器 |
| 命令行窗口一直挂着 | ✅ 后台运行,不占任务栏 |
| 每次都要手动输入启动命令 | ✅ 自动创建桌面快捷方式,以后双击图标即可 |
| 装坏了可能影响电脑上已有的开发环境 | ✅ 完全不碰你的系统,不装全局包、不改 `PATH` |

---

## 🎯 特性一览

- 🖱️ **双击即用**:解压后双击 `launcher\start.vbs`,自动启动服务、打开浏览器、创建桌面快捷方式
- 🧰 **零依赖**:自带私有 Node.js 与 PowerShell,不需要预装任何东西,也不需要管理员权限
- 🔒 **不污染环境**:不修改 `PATH`、不安装全局 npm 包、不影响你电脑上已有的 Node.js
- 🚪 **一键退出**:网页侧边栏底部有"退出 DeepSeek Harness"按钮,优雅关闭后台服务
- 📂 **图形化选目录**:内置网页版目录浏览器,会列出你电脑上所有已挂载的盘符(C:、D: …),点选即可切换工作目录,也支持输入网络共享路径(UNC)
- 🔁 **端口自动避让**:默认 3080 端口被占用时,自动尝试后续端口
- 🛡️ **数据安全**:只监听本机回环地址(127.0.0.1),不对局域网暴露;日志自动脱敏 API Key

---

## 🚀 快速开始(3 步)

1. **下载** 最新版 ZIP 包(见右侧 Releases 或 [构建产物说明](#-从源码构建))
2. **解压** 到任意目录(比如 `D:\DeepSeekHarness`),路径里最好别有空格和中文
3. **双击** 解压目录里的 `launcher\start.vbs`

第一次启动会:

- 在后台拉起 DeepSeek Harness 服务
- 自动打开浏览器进入 Web UI(`http://127.0.0.1:3080`)
- 在你桌面创建 **"DeepSeek Harness"** 快捷方式

之后**直接双击桌面图标**就能再次启动。如果之后你把整个目录移动到了别的位置,再双击一次 `start.vbs` 即可刷新快捷方式。

---

## 📖 常用操作

| 操作 | 方法 |
|---|---|
| 启动 | 双击桌面图标,或双击 `launcher\start.vbs` |
| 查看状态 | 双击 `launcher\start.cmd` 后输入 `status` |
| 停止服务 | `launcher\start.cmd stop` |
| 指定工作目录启动 | `launcher\start.cmd start --workspace "D:\我的项目"` |
| 网页内退出 | Web UI 侧边栏底部 → "退出 DeepSeek Harness" → 确认 |

> 工作区(WorkSpace)就是你存放项目文件、让 Harness 读写代码的目录。**首次启动默认使用空目录** `%LOCALAPPDATA%\DeepSeekHarness\workspace`,不会把整个用户主目录暴露给 Harness。

---

## ❓ 常见问题

**Q: 我需要先安装 Node.js 吗?**
不需要。便携包内已包含私有 Node.js 运行时,与系统环境完全隔离。

**Q: 会不会影响我电脑上已经装好的开发环境?**
不会。启动器不修改 `PATH`、不写系统环境变量、不安装全局 npm 包,只把私有运行时临时前置给 Harness 子进程。

**Q: 我的 DeepSeek API Key 安全吗?**
安全。API Key 由官方 Harness Web UI 写入它自己的凭据存储,本启动器**不读取、不上传、不打印**密钥,日志还会自动把 `sk-...` 格式的内容脱敏。

**Q: 需要管理员权限吗?**
不需要,普通用户权限即可运行。

**Q: 3080 端口被占用了怎么办?**
不用管。启动器会自动尝试 3080 之后的端口(最多试 20 个),并打开对应的地址。

**Q: 如何卸载?**
直接把解压目录删掉即可,不残留任何系统级安装记录。你的工作区和数据在 `%LOCALAPPDATA%\DeepSeekHarness`,如需彻底清理一并删除即可(会丢失工作区内容,请先备份)。

**Q: 这个项目是 DeepSeek 官方的吗?**
不是。这是社区制作的第三方启动器,DeepSeek Harness 本身是官方产品。

---

## 🔧 从源码构建(开发者)

> 以下内容面向想自行构建、打包或贡献代码的开发者;**普通用户直接用上方 ZIP 包即可,无需阅读本节。**

### 环境要求

- Windows x64 + PowerShell 7(构建机需要,最终用户不需要)
- 网络可访问 nodejs.org / GitHub / npm registry

### 构建便携运行时

```powershell
./scripts/build-runtime.ps1
```

成功后产物在 `artifacts/portable/DeepSeekHarness/`,包含私有 Node.js、PowerShell 与 `@deepseek-ai/dsh`。默认使用中国大陆镜像源,可切换:

```powershell
./scripts/build-runtime.ps1 -NpmRegistry https://registry.npmjs.org/
```

### 构建可发布 ZIP

```powershell
./scripts/build-portable-zip.ps1
```

生成 `artifacts/dist/DeepSeekHarness-Portable-<版本>.zip` 及同名 `.sha256` 校验文件,并附上 `LICENSE`、`README.md`、`THIRD_PARTY_NOTICES.md`。

### 验证

```powershell
./scripts/verify-runtime.ps1    # 校验运行时文件与版本
./scripts/smoke-web.ps1         # 冒烟测试 Web UI
```

### 版本固定与更新策略

本项目**固定并验证特定版本**,绝不在用户机器上追踪 `latest`。所有版本、下载地址与 SHA-256 哈希集中在 [`config/runtime-manifest.json`](config/runtime-manifest.json) 中维护。推送 `v*` 标签会触发 `.github/workflows/release.yml`,在干净的 Windows Runner 上构建、验证并发布 ZIP 与 SHA-256 到 GitHub Release。

---

## 🛡️ 数据与安全边界

- 数据目录固定在 `%LOCALAPPDATA%\DeepSeekHarness`,与程序目录分离
- 默认工作区是其下的空 `workspace` 目录,不把用户主目录作为工作根目录
- Web UI 只监听 `127.0.0.1`,不对局域网暴露
- 启动器日志会脱敏 `sk-` 格式的 API Key
- 网页内退出请求需携带该次启动随机生成的令牌,且仅对本机精确路由有效

---

## 📄 许可证与致谢

- 本启动器代码与文档:[MIT License](LICENSE)
- DeepSeek Harness:MIT(官方仓库)
- Node.js:由构建脚本从 [nodejs.org](https://nodejs.org) 官方分发下载
- PowerShell:由构建脚本从 PowerShell 官方 GitHub Release 下载
- 第三方许可来源详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

---

## 🤝 参与贡献

欢迎提交 Issue 与 PR!请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [SECURITY.md](SECURITY.md)。

> 注意:公开 Issue 中请勿包含 API Key、令牌、私有工作区内容及个人信息。
