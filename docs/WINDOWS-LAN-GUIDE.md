# Windows 局域网访问指南

这份指南专门说明：OpenCode Mobile Server 在 Windows 电脑上启动后，如何让同一个 Wi-Fi 或局域网中的手机访问。

## 先理解三个地址

### `127.0.0.1`：只代表当前电脑

`127.0.0.1` 是电脑自己的回环地址。你在 Windows 电脑上打开下面的地址可以访问：

```text
http://127.0.0.1:8787/opencode/
```

但手机访问 `127.0.0.1` 时，访问的是手机自己，不是 Windows 电脑，所以手机不能使用这个地址。

### `0.0.0.0`：监听地址，不是访问地址

Windows 启动脚本会让 Web 网关监听 `0.0.0.0:8787`。这表示“监听电脑上的所有网络接口”，方便局域网设备连接。

`0.0.0.0` 不是让你填到手机浏览器里的地址，也不要把配置文件中的：

```dotenv
OPENCODE_WEB_HOST=0.0.0.0
```

改成手机要访问的 IP。这个配置应保持为 `0.0.0.0`。

### `192.168.x.x`：手机真正要访问的电脑地址

手机需要访问 Windows 电脑在局域网中的 IPv4 地址。最常见的形式是：

```text
192.168.1.100
192.168.0.23
```

也可能是 `10.x.x.x` 或 `172.16.x.x` 到 `172.31.x.x`，不一定必须以 192 开头。

## 一键启动

1. 确认 Windows 电脑和手机连接到同一个 Wi-Fi，或处于同一个局域网。
2. 双击项目中的 `scripts\deploy-windows.bat`。
3. 如果第一次运行，脚本会自动创建项目根目录的 `.env`，默认密码是 `opencode`。
4. 建议打开 `.env` 修改密码，然后再次双击脚本。
5. 不要关闭脚本启动的 OpenCode Mobile Server 窗口，否则 Web 网关会停止。

电脑本机访问地址是：

```text
http://127.0.0.1:8787/opencode/
```

## 查找 Windows 局域网 IP

### 方法一：使用 `ipconfig`

1. 按 `Win + R`。
2. 输入 `cmd`，按回车。
3. 输入：

```bat
ipconfig
```

4. 找到当前正在使用的网络适配器：
   - 无线网络通常看 `Wireless LAN adapter Wi-Fi`。
   - 网线通常看 `Ethernet adapter Ethernet`。
5. 找到其中的 `IPv4 Address` 或 `IPv4 地址`。
6. 使用这个 IPv4 地址，不要使用 `127.0.0.1`、`0.0.0.0` 或以 `169.254` 开头的地址。

例如命令行显示：

```text
Wireless LAN adapter Wi-Fi:

   IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

那么手机访问：

```text
http://192.168.1.100:8787/opencode/
```

### 方法二：使用 PowerShell

在 PowerShell 中执行：

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceAlias,IPAddress,PrefixOrigin
```

优先选择 Wi-Fi 或 Ethernet 适配器对应的地址。通常不要选择下面这些虚拟网卡：

- `Loopback`。
- `vEthernet`。
- Docker、VMware、VirtualBox 等虚拟适配器。
- VPN 适配器，除非手机确实通过同一个 VPN 访问。

## 手机访问地址

把下面示例中的 `192.168.1.100` 替换成你查到的 Windows IPv4 地址：

```text
http://192.168.1.100:8787/opencode/
```

注意：

- 使用 `http://`，不是 `https://`。
- 端口是 `8787`，不能省略。
- 路径是 `/opencode/`，不能只输入 IP 或 `/`。
- 第一次访问建议保留最后的 `/`。
- 手机和电脑必须连接到同一个局域网。

## Windows 防火墙

如果电脑本机可以访问，但手机打不开，最常见原因是 Windows 防火墙拦截了 8787 端口。

用管理员身份打开 PowerShell，执行：

```powershell
New-NetFirewallRule -DisplayName "OpenCode Mobile Server" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
```

如果只想允许局域网访问，可以在 Windows 高级防火墙中把规则的配置文件限制为“专用网络”，不要开放到公用网络。

## 按顺序测试

建议按下面顺序排查，不要一开始就反复修改 IP：

1. 在 Windows 电脑打开 `http://127.0.0.1:8787/opencode/`。
2. 如果电脑本机打不开，说明 Web 网关没有启动。检查 `OpenCode Mobile Server` 窗口和 Node.js 安装。
3. 如果电脑本机能打开，查找 `ipconfig` 中的 IPv4 地址。
4. 在手机确认和电脑连接的是同一个 Wi-Fi，不要使用访客 Wi-Fi。
5. 在手机打开 `http://电脑IPv4:8787/opencode/`。
6. 如果仍打不开，临时检查防火墙规则和路由器的“AP 隔离”“客户端隔离”设置。

## 常见问题

### 我输入了 `0.0.0.0:8787`，为什么打不开？

因为 `0.0.0.0` 只是服务端的监听地址，不是某一台电脑的实际地址。请用 `ipconfig` 找到类似 `192.168.x.x` 的 IPv4 地址，再拼成完整 URL。

### 我输入了 `127.0.0.1:8787`，电脑能开，手机不能开

这是正常现象。`127.0.0.1` 在手机上代表手机自身。手机必须使用 Windows 电脑的局域网 IPv4 地址。

### `ipconfig` 有很多个 IPv4 地址，应该选哪个？

选择当前正在联网的 Wi-Fi 或 Ethernet 适配器下的地址。一般选择 `192.168.x.x`、`10.x.x.x` 或 `172.16.x.x` 到 `172.31.x.x` 的地址，不要选虚拟网卡地址。

### 手机和电脑都连接 Wi-Fi，还是打不开

可能连接到了不同网络，或者路由器开启了访客网络、AP 隔离或客户端隔离。让手机和电脑连接同一个普通 Wi-Fi，并关闭路由器的设备隔离功能后再测试。

### 页面能打开，但登录失败

登录密码不是 Windows 登录密码，而是项目配置中的 OpenCode 密码。默认是 `opencode`，修改位置是项目根目录 `.env`。改密码后重启脚本，并清除浏览器保存的旧密码。

如果浏览器弹出标题为 `Secure Area` 的用户名和密码窗口，这是浏览器原生 Basic Auth 弹窗，不是本项目自己的登录框。新版网关会隐藏这个触发弹窗的响应头；请确认使用了最新的 `server.mjs`，然后刷新页面缓存。页面自己的登录框只需要输入 OpenCode 密码。

### 重启路由器后地址变了

局域网 IP 通常由路由器自动分配，可能发生变化。再次运行 `ipconfig`，使用新的 IPv4 地址访问即可。也可以在路由器中给 Windows 电脑设置 DHCP 地址保留。

## 安全提醒

这个部署方式适合家庭或办公室局域网使用，不建议直接把 8787 端口映射到公网。需要公网访问时，请使用 Linux 服务器、域名、HTTPS、强密码和 Nginx 反向代理。

---

# Windows LAN Access Guide

This guide explains how to open OpenCode Mobile Server from a phone when it is running on a Windows computer.

## Understand the Three Addresses

### `127.0.0.1` means this computer only

The loopback address works on the Windows computer itself:

```text
http://127.0.0.1:8787/opencode/
```

If you open `127.0.0.1` on a phone, the phone connects to itself, not to Windows.

### `0.0.0.0` is a bind address, not a browser address

The Windows launcher binds the web gateway to `0.0.0.0:8787`. This means that the gateway listens on all network interfaces so LAN devices can connect.

Do not type `0.0.0.0` into the phone browser, and do not replace this setting:

```dotenv
OPENCODE_WEB_HOST=0.0.0.0
```

### `192.168.x.x` is the address the phone should use

The phone must use the Windows computer's LAN IPv4 address. Common examples are:

```text
192.168.1.100
192.168.0.23
```

Some networks use `10.x.x.x` or `172.16.x.x` through `172.31.x.x` instead.

## One-Click Start

1. Connect the Windows computer and phone to the same Wi-Fi or LAN.
2. Double-click `scripts\deploy-windows.bat`.
3. On the first run, it creates `.env` in the project root. The default password is `opencode`.
4. Edit `.env` and change the password, then run the batch file again.
5. Keep the OpenCode Mobile Server window open while using the page.

The local Windows URL is:

```text
http://127.0.0.1:8787/opencode/
```

## Find the Windows LAN IP

### Using `ipconfig`

1. Press `Win + R`.
2. Type `cmd` and press Enter.
3. Run:

```bat
ipconfig
```

4. Find the adapter that is currently connected:
   - For Wi-Fi, look for `Wireless LAN adapter Wi-Fi`.
   - For Ethernet, look for `Ethernet adapter Ethernet`.
5. Find `IPv4 Address` or `IPv4 地址`.
6. Use that IPv4 address. Do not use `127.0.0.1`, `0.0.0.0`, or an address beginning with `169.254`.

For example:

```text
Wireless LAN adapter Wi-Fi:

   IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

The phone URL is then:

```text
http://192.168.1.100:8787/opencode/
```

### Using PowerShell

Run:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceAlias,IPAddress,PrefixOrigin
```

Prefer the address belonging to the Wi-Fi or Ethernet adapter. Usually avoid Loopback, `vEthernet`, Docker, VMware, VirtualBox, and unrelated VPN adapters.

## Phone URL

Replace `192.168.1.100` with the IPv4 address found on Windows:

```text
http://192.168.1.100:8787/opencode/
```

Remember:

- Use `http://`, not `https://`.
- Keep port `8787` in the URL.
- Use the `/opencode/` path.
- Keep the trailing slash for the first visit.
- The phone and Windows computer must be on the same LAN.

## Windows Firewall

If the page works on Windows but not on the phone, Windows Firewall is the most common cause.

Open PowerShell as Administrator and run:

```powershell
New-NetFirewallRule -DisplayName "OpenCode Mobile Server" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
```

For a safer LAN-only rule, restrict the rule to the Private network profile in Windows Advanced Firewall. Do not expose it to Public networks unless necessary.

## Test in Order

1. Open `http://127.0.0.1:8787/opencode/` on Windows.
2. If it does not open locally, the web gateway is not running. Check the OpenCode Mobile Server window and Node.js.
3. If it works locally, run `ipconfig` and find the LAN IPv4 address.
4. Confirm that the phone uses the same normal Wi-Fi, not a guest Wi-Fi.
5. Open `http://WINDOWS_IPV4:8787/opencode/` on the phone.
6. If it still fails, check Windows Firewall and the router's AP/client isolation settings.

## Common Problems

### Why does `0.0.0.0:8787` not work?

`0.0.0.0` only tells the server to listen on all interfaces. It is not the computer's real LAN address. Use `ipconfig` and enter an address such as `192.168.x.x` in the phone URL.

### Why does `127.0.0.1:8787` work on Windows but not on the phone?

That is expected. On the phone, `127.0.0.1` refers to the phone itself. Use the Windows computer's LAN IPv4 address.

### There are several IPv4 addresses. Which one should I use?

Use the address under the currently connected Wi-Fi or Ethernet adapter. Prefer `192.168.x.x`, `10.x.x.x`, or `172.16.x.x` through `172.31.x.x`. Avoid virtual adapters.

### Both devices use Wi-Fi, but the phone still cannot connect

They may be on different networks, or the router may have guest-network, AP-isolation, or client-isolation enabled. Put both devices on the same normal Wi-Fi and disable device isolation.

### The page opens but login fails

The login password is the OpenCode server password, not the Windows password. The default is `opencode`; change it in the project-root `.env`. Restart the launcher and clear the browser's old saved password after changing it.

If the browser shows a `Secure Area` username/password dialog, that is the browser's native Basic Auth prompt, not this project's login form. The current gateway hides the response header that causes it. Make sure you are using the current `server.mjs`, then refresh the browser cache. The web page login form only needs the OpenCode password.

### The IP changed after restarting the router

Routers usually assign LAN addresses automatically, so the address can change. Run `ipconfig` again and use the new IPv4 address. A DHCP reservation can make the address stable.

## Security Note

This setup is intended for a trusted home or office LAN. Do not port-forward port 8787 directly to the Internet. For public access, use a Linux server, a domain, HTTPS, a strong password, and an Nginx reverse proxy.
