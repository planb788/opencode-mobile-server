# OpenCode Mobile Server

这是一个面向手机浏览器、可自托管到服务器或局域网的 OpenCode Web 客户端与部署网关，提供会话列表、流式回复、Markdown、工具调用展示、文件上传和移动端抽屉式导航。它属于 OpenCode 生态，既可以在 Windows 电脑上启动供手机通过局域网访问，也可以部署到 Linux 服务器并通过域名对外提供 HTTPS 服务。

本文档提供完整的中文说明和完整的 English documentation，英文文档位于下方。

## 中文文档

## 功能

- 移动端优先的深色界面，支持手机安全区域。
- 会话切换、历史消息缓存和游标分页加载。
- 通过 OpenCode 事件接口实时显示生成内容。
- 支持单次请求最多 20 MB 的文件附件。
- 前端无需构建，运行时无需安装 npm 依赖。
- Node 网关同时提供静态页面，并代理 `/opencode/api/*` 到 OpenCode 服务。

## 工作原理

```text
手机或电脑浏览器
  -> /opencode/                 手机 Web 页面
  -> /opencode/api/*            Node 网关
                                  -> 127.0.0.1:4096 OpenCode 服务
```

本项目是 OpenCode 的客户端和网关，不包含 OpenCode CLI 本身。使用前需要单独安装 OpenCode，并确保 `opencode serve` 可以运行。

## 默认密码和修改方式

新部署的默认密码是：

```text
opencode
```

对外网开放前必须修改密码。复制 `.env.example` 为 `.env`，修改下面的配置：

```dotenv
OPENCODE_SERVER_PASSWORD=请替换为随机长密码
```

网关和 OpenCode 服务必须使用同一个密码：

- Windows：修改项目根目录的 `.env`。
- Linux 服务器：修改 `/etc/opencode-mobile-server/opencode.env`。

手机页面会将输入的密码保存在浏览器本地存储中。改密码后，请点击页面里的“退出登录”重新输入；如果仍然失败，请清除该网站的本地存储中的 `oc_pwd`。

## Windows 局域网部署

### 环境要求

- Windows 10 或更高版本。
- Node.js 18 或更高版本。
- 已安装 OpenCode，且命令行可以直接执行 `opencode`。

### 启动步骤

小白用户请先阅读完整的 [Windows 局域网访问指南](docs/WINDOWS-LAN-GUIDE.md)，其中解释了 `127.0.0.1`、`0.0.0.0` 和 `192.168.x.x` 的区别。

推荐直接双击下面的文件进行一键部署：

```text
scripts\deploy-windows.bat
```

它会检查 Node.js 和 OpenCode，自动创建 `.env`，启动 OpenCode 和 Web 网关，并打开本机页面。首次启动后请编辑项目根目录的 `.env` 修改密码，再重新运行脚本。

如果 4096 端口已有 OpenCode 服务，脚本会复用它，通常只需要启动窗口和 Web 网关窗口；如果脚本需要新启动 OpenCode，可能会额外出现一个后端窗口。如果后端启动失败，Web 网关 PowerShell 窗口会保留错误信息，不要只看自动关闭的后端窗口。

在 PowerShell 中进入项目目录：

```powershell
Copy-Item .env.example .env
notepad .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

脚本会启动：

- OpenCode API：`127.0.0.1:4096`，只允许本机访问。
- Web 网关：`0.0.0.0:8787`，允许局域网访问。

使用 `ipconfig` 查看 Windows 的局域网 IP，例如 `192.168.1.100`，然后在手机浏览器打开：

```text
http://192.168.1.100:8787/opencode/
```

如果 Windows 防火墙拦截 8787 端口，请使用管理员 PowerShell 执行：

```powershell
New-NetFirewallRule -DisplayName "OpenCode Mobile Server" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
```

如果 OpenCode 已经作为其他服务运行，只启动 Web 网关：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SkipBackend
```

也可以双击或在命令行运行 `scripts\start-windows.bat`。

## Linux 服务器和域名部署

### 环境要求

- Linux、systemd 和 Nginx。
- Node.js 18 或更高版本。
- OpenCode 已安装。示例服务文件默认使用 `/usr/local/bin/opencode`，请按实际安装路径修改。
- 域名的 DNS `A` 或 `AAAA` 记录已经指向服务器。

### 安装 Web 网关

将项目放到 `/opt/opencode-mobile-server`，创建服务器配置文件：

```bash
sudo mkdir -p /opt/opencode-mobile-server
sudo cp -a . /opt/opencode-mobile-server/
sudo mkdir -p /etc/opencode-mobile-server
sudo cp /opt/opencode-mobile-server/.env.example /etc/opencode-mobile-server/opencode.env
sudo chmod 600 /etc/opencode-mobile-server/opencode.env
sudo editor /etc/opencode-mobile-server/opencode.env
NODE_BIN="$(command -v node)"
sudo sed -e "s|__INSTALL_DIR__|/opt/opencode-mobile-server|g" -e "s|__NODE_BIN__|${NODE_BIN}|g" /opt/opencode-mobile-server/scripts/opencode-mobile-server.service | sudo tee /etc/systemd/system/opencode-mobile-server.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now opencode-mobile-server.service
```

推荐使用下面的 Linux 一键部署脚本。它会安装 Web 网关和 OpenCode systemd 服务；传入域名后还会生成并检查 Nginx 配置：

```bash
sudo bash scripts/deploy-linux.sh example.com
```

如果只需要安装服务、不自动写入 Nginx：

```bash
sudo bash scripts/deploy-linux.sh --skip-nginx
```

如果 OpenCode 不在 PATH 中，可以指定二进制路径：

```bash
sudo OPENCODE_BIN=/path/to/opencode bash scripts/deploy-linux.sh example.com
```

旧版的 `scripts/install-linux.sh` 仍然保留，用于只安装 Web 网关。

### 安装 OpenCode API 服务

OpenCode 服务必须使用和 `/etc/opencode-mobile-server/opencode.env` 相同的密码。项目提供了参考服务文件：

```bash
sudo cp /opt/opencode-mobile-server/scripts/opencode-server.service /etc/systemd/system/opencode-server.service
sudo editor /etc/systemd/system/opencode-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now opencode-server.service
```

安装前请检查 `ExecStart` 中的 OpenCode 路径。服务器上的 OpenCode API 默认只监听 `127.0.0.1:4096`，不要直接暴露 4096 端口。

### 配置域名访问

生成或复制 `scripts/nginx-opencode-mobile-server.conf.example`，把 `__DOMAIN__` 替换为实际域名。配置会将页面映射到：

```text
https://example.com/opencode/
```

检查并重新加载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

如果域名已经有 Nginx `server` 块，不要创建重复的 `server`，只把模板中的 `/opencode` 两个 `location` 复制到现有配置中。HTTPS 可以使用 Certbot 或服务器已有的证书管理工具配置。

## 手动运行

复制并编辑 `.env` 后执行：

```bash
npm start
```

默认访问地址：

```text
http://127.0.0.1:8787/opencode/
```

本项目没有运行时 npm 依赖，不需要执行 `npm install`。

## 配置项

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENCODE_SERVER_PASSWORD` | `opencode` | OpenCode Basic Auth 密码，必须修改 |
| `OPENCODE_API_URL` | `http://127.0.0.1:4096` | OpenCode 服务地址 |
| `OPENCODE_WEB_HOST` | `127.0.0.1` | Web 网关监听地址；Windows 脚本会使用 `0.0.0.0` |
| `OPENCODE_WEB_PORT` | `8787` | Web 网关端口 |

浏览器 API 路径固定为 `/opencode/api`，因此同一份前端代码既可以用于 Windows 局域网，也可以用于服务器域名路径，不需要重新构建。

## 故障排查

### 一直显示 401 或反复出现登录页面

检查 `.env`、`/etc/opencode-mobile-server/opencode.env` 和 `opencode serve` 使用的密码是否一致。然后退出登录，或清除网站本地存储中的 `oc_pwd` 后重新登录。

如果浏览器弹出标题为 `Secure Area` 的用户名和密码对话框，那是旧网关透传了 OpenCode 的 `WWW-Authenticate` 响应头，触发了浏览器原生 Basic Auth。当前网关会隐藏这个响应头，只显示页面自己的登录框；更新页面后请刷新浏览器缓存。

### `/opencode/api` 返回 502

Node 网关无法连接 `OPENCODE_API_URL`。检查 OpenCode 是否监听 4096 端口，以及配置文件中的地址是否正确。

### 页面能打开，但不是 `/opencode/`

请使用带结尾斜杠的完整路径。网关会自动将 `/` 和 `/opencode` 重定向到 `/opencode/`。

### 点击“加载更早消息”返回 400

新版客户端使用 OpenCode 分页接口返回的 `X-Next-Cursor` 游标。如果刚升级过，请刷新页面，避免浏览器继续使用旧的 `index.html` 缓存。

## 安全建议

- 默认密码只用于首次启动，外网部署前必须修改。
- 服务器上保持 4096 只监听回环地址。
- 公网访问必须启用 HTTPS。
- 不要把 `.env`、API 密钥或其他凭据提交到 GitHub，只提交 `.env.example`。

## English Documentation

### OpenCode Mobile Server

This is a self-hosted mobile web client and deployment gateway for the OpenCode ecosystem. It provides a session list, streaming replies, Markdown rendering, tool-call display, file uploads, and a mobile drawer navigation. You can run it on a Windows computer for phone access over your LAN, or deploy it to a Linux server and expose it with a domain over HTTPS.

### Features

- Mobile-first dark interface with safe-area support.
- Session switching with cached history and cursor-based pagination.
- Live generation updates through the OpenCode event API.
- File attachments up to 20 MB per request.
- No frontend build step and no runtime npm dependencies.
- A Node gateway serves the static page and proxies `/opencode/api/*` to OpenCode.

### How It Works

```text
Phone or desktop browser
  -> /opencode/                 mobile web page
  -> /opencode/api/*            Node gateway
                                  -> 127.0.0.1:4096 OpenCode server
```

This project is an OpenCode client and gateway. It does not include or replace the OpenCode CLI. Install OpenCode separately and make sure `opencode serve` is available.

### Default Password and Password Changes

The default password for a new installation is:

```text
opencode
```

Change it before exposing the service to the Internet. Copy `.env.example` to `.env` and edit:

```dotenv
OPENCODE_SERVER_PASSWORD=replace-with-a-random-long-password
```

The gateway and the OpenCode server must use the same password:

- Windows: edit `.env` in the project root.
- Linux server: edit `/etc/opencode-mobile-server/opencode.env`.

The mobile page stores the entered password in browser local storage. After changing the password, use the logout button to sign in again. If that does not work, clear the site's `oc_pwd` local-storage value.

### Windows LAN Deployment

#### Requirements

- Windows 10 or newer.
- Node.js 18 or newer.
- OpenCode installed and available as the `opencode` command.

#### Start

For a beginner-friendly explanation of `127.0.0.1`, `0.0.0.0`, and `192.168.x.x`, read the full [Windows LAN Access Guide](docs/WINDOWS-LAN-GUIDE.md).

For a one-click Windows deployment, double-click:

```text
scripts\deploy-windows.bat
```

It checks Node.js and OpenCode, creates `.env` when needed, starts OpenCode and the web gateway, and opens the local page. Edit the project-root `.env` after the first run to change the password, then run the script again.

If OpenCode is already listening on port 4096, the script reuses it and normally only the launcher and web-gateway windows are needed. If the script starts OpenCode itself, an additional backend window may appear. If the backend fails, the web-gateway PowerShell window keeps the error message instead of hiding it in a closed window.

Open PowerShell in the project directory:

```powershell
Copy-Item .env.example .env
notepad .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

The script starts:

- OpenCode API: `127.0.0.1:4096`, accessible only from the Windows machine.
- Web gateway: `0.0.0.0:8787`, accessible from the LAN.

Run `ipconfig` to find the Windows LAN address. For example, if it is `192.168.1.100`, open this URL on your phone:

```text
http://192.168.1.100:8787/opencode/
```

If Windows Firewall blocks port 8787, run PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "OpenCode Mobile Server" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
```

If OpenCode is already running as a separate service, start only the web gateway:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SkipBackend
```

You can also run `scripts\start-windows.bat`.

### Linux Server and Domain Deployment

#### Requirements

- Linux with systemd and Nginx.
- Node.js 18 or newer.
- OpenCode installed. The example service uses `/usr/local/bin/opencode`; adjust it to the actual path.
- An `A` or `AAAA` DNS record pointing your domain to the server.

#### Install the Web Gateway

Copy the project to `/opt/opencode-mobile-server` and create the server environment file:

```bash
sudo mkdir -p /opt/opencode-mobile-server
sudo cp -a . /opt/opencode-mobile-server/
sudo mkdir -p /etc/opencode-mobile-server
sudo cp /opt/opencode-mobile-server/.env.example /etc/opencode-mobile-server/opencode.env
sudo chmod 600 /etc/opencode-mobile-server/opencode.env
sudo editor /etc/opencode-mobile-server/opencode.env
NODE_BIN="$(command -v node)"
sudo sed -e "s|__INSTALL_DIR__|/opt/opencode-mobile-server|g" -e "s|__NODE_BIN__|${NODE_BIN}|g" /opt/opencode-mobile-server/scripts/opencode-mobile-server.service | sudo tee /etc/systemd/system/opencode-mobile-server.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now opencode-mobile-server.service
```

For a one-click Linux deployment, run the following script. It installs the web gateway and OpenCode systemd services. When you pass a domain, it also generates and checks the Nginx configuration:

```bash
sudo bash scripts/deploy-linux.sh example.com
```

To install the services without writing an Nginx configuration:

```bash
sudo bash scripts/deploy-linux.sh --skip-nginx
```

If OpenCode is not in `PATH`, provide its binary path:

```bash
sudo OPENCODE_BIN=/path/to/opencode bash scripts/deploy-linux.sh example.com
```

The older `scripts/install-linux.sh` is still available when you only want to install the web gateway.

#### Install the OpenCode API Service

The OpenCode service must use the same password as `/etc/opencode-mobile-server/opencode.env`. A reference service file is included:

```bash
sudo cp /opt/opencode-mobile-server/scripts/opencode-server.service /etc/systemd/system/opencode-server.service
sudo editor /etc/systemd/system/opencode-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now opencode-server.service
```

Review the OpenCode path in `ExecStart` before installing the service. The OpenCode API should listen on `127.0.0.1:4096`; do not expose port 4096 directly to the Internet.

#### Configure the Domain

Use `scripts/nginx-opencode-mobile-server.conf.example` and replace `__DOMAIN__` with your actual domain. The configuration maps the page to:

```text
https://example.com/opencode/
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

If the domain already has an Nginx `server` block, do not create a duplicate one. Copy only the two `/opencode` locations from the template into the existing block. Use Certbot or your existing certificate manager to configure HTTPS.

### Manual Run

Copy and edit `.env`, then run:

```bash
npm start
```

The default local URL is:

```text
http://127.0.0.1:8787/opencode/
```

There are no runtime npm dependencies, so `npm install` is not required.

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OPENCODE_SERVER_PASSWORD` | `opencode` | OpenCode Basic Auth password; change it |
| `OPENCODE_API_URL` | `http://127.0.0.1:4096` | OpenCode server address |
| `OPENCODE_WEB_HOST` | `127.0.0.1` | Web gateway bind address; Windows uses `0.0.0.0` |
| `OPENCODE_WEB_PORT` | `8787` | Web gateway port |

The browser API path is intentionally fixed to `/opencode/api`, so the same frontend works on Windows LAN and behind a domain path without rebuilding.

### Troubleshooting

#### Repeated 401 responses or login screen

Check that the password in `.env`, `/etc/opencode-mobile-server/opencode.env`, and `opencode serve` is identical. Log out, or clear the site's `oc_pwd` local-storage value, and sign in again.

If the browser shows a `Secure Area` username/password dialog, an older gateway exposed OpenCode's `WWW-Authenticate` header and triggered the browser's native Basic Auth prompt. The current gateway hides that header and shows only the web page login form. Refresh the page after upgrading.

#### 502 from `/opencode/api`

The Node gateway cannot reach `OPENCODE_API_URL`. Check that OpenCode is listening on port 4096 and that the address in `.env` is correct.

#### Page is not available at `/opencode/`

Use the complete path with the trailing slash. The gateway redirects `/` and `/opencode` to `/opencode/`.

#### Loading older messages returns 400

The current client uses the `X-Next-Cursor` cursor returned by OpenCode's paginated message API. After an upgrade, refresh the page so the browser does not keep using an old `index.html`.

### Security Recommendations

- The default password is for first-run convenience only. Change it before Internet access.
- Keep port 4096 bound to the loopback address on servers.
- Enable HTTPS for any public deployment.
- Do not commit `.env`, API keys, or other credentials to GitHub. Commit only `.env.example`.

### License

MIT License. See `LICENSE`.
