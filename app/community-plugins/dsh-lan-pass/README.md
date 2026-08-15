# dsh-lan-pass

DSH 局域网密码门禁：让手机/平板在**同一局域网**内通过密码访问本机的 DSH Web UI（http://电脑IP:3080）。

- 手机打开地址 → 输入访问密钥 → 进入完整 UI，会话/输入输出与电脑**实时同步**（同一后端，天然同屏）
- 本机（localhost/127.0.0.1）访问永不拦截，无感知
- 内置 `crypto.randomUUID` polyfill（HTTP 非安全上下文必需，替代 dsh-web-lan-access 的作用）
- 登录页移动端自适应

## 安装

\`\`\`bash
dsh plugin --profile web add link:/path/to/lan-pass
\`\`\`

## 配置（密码）

**默认密钥：`deepseekyyds`** —— 装完即用，无需任何配置。

> ⚠️ 默认密钥是公开的，等于没上锁！请尽快改成你自己的：

1. 环境变量 `DSH_LAN_PASSWORD`，或
2. 编辑 `%USERPROFILE%\.dsh\.credentials.yaml`，加一行：

\`\`\`yaml
DSH_LAN_PASSWORD: 你的新密钥
\`\`\`

3. 重启 dsh 生效。使用默认值时启动日志会打印警告。

## 启动（关键）

\`\`\`bash
dsh web --host 0.0.0.0
\`\`\`

并放行防火墙（管理员 CMD）：

\`\`\`
netsh advfirewall firewall add rule name="DSH Web 3080" dir=in action=allow protocol=TCP localport=3080
\`\`\`

手机浏览器打开 `http://<电脑局域网IP>:3080`（ipconfig 查看 IPv4），输密钥即可。

## 安全边界（如实说明）

- 门禁校验在**服务端**完成：Cookie 为 HMAC 令牌，HttpOnly
- 但 webServer 无全局中间件，**未认证设备理论上仍可直呼 /api/* 接口**（进不了 UI）。仅建议在可信家庭局域网使用；跨不可信网络请改用反向代理方案（如 dsh-mobile-gate + HTTPS）
- 密钥走明文 HTTP，别用重要密码，建议 8 位以上随机串

## License

MIT
