# 肥鱼 Live2D 模型渲染插件 · DSH 安装、使用与扩展指南

面向 DSH 用户、插件开发者，以及希望把肥鱼 Live2D 模型渲染能力接进 Agent 工作流的人。

## 1. 架构

```text
DSH Web/Desktop
 ├─ dsh-murasame-pet (host, lib/index.js)
 │   ├─ /dsh-murasame-pet/state      读取运行状态
 │   ├─ /dsh-murasame-pet/control    启停 / 显示模式 / 比例
 │   └─ tools: pet_start / pet_stop / pet_status / pet_set_*
 └─ dsh-murasame-pet (client, lib/client.js)
     └─ plugins.detail.section 控制面板

MurasamePetLite.exe
 ├─ pet.py          PyQt + 原文字框
 ├─ live2d_bridge   Cubism Native 渲染
 └─ config.json     轮询热更新 display.*
```

插件**不复制**约 0.4 GB 的运行目录，只做路径绑定；换模型、升级桌宠不需要重装插件。

## 2. 安装

### 从 GitHub

```sh
dsh plugin --profile desktop add 'dsh-murasame-pet@github:canyueY/dsh-murasame-pet#v0.1.0'
```

### 本地开发

```sh
dsh plugin --profile desktop add link:D:\path\to\dsh-murasame-pet
```

重启 DSH / 刷新页面。

## 3. 应用路径解析顺序

`lib/index.js` 依次检查：

1. `MURASAMEPET_HOME`
2. `MURASAMEPET_EXE`
3. `%USERPROFILE%\.dsh\murasame-pet`
4. `%LOCALAPPDATA%\MurasamePetLite`
5. 本地开发回退：`<workspace>\release\MurasamePetLite`

找到 `MurasamePetLite.exe` 即视为可用。

## 4. 工具契约

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `pet_start` | 无 | `{ok,text}` |
| `pet_stop` | 无 | `{ok,text}` |
| `pet_status` | 无 | running / visibility / scale / appRoot |
| `pet_set_visibility` | `mode: both\|text\|character\|none` | `{ok,text}` |
| `pet_set_scale` | `scale: 0.7–1.6` | `{ok,text}` |

示例：

```text
pet_set_visibility({ mode: "text" })
pet_set_scale({ scale: 1.2 })
```

## 5. 控制 API

同源路由，供 client 面板或外部脚本使用：

```http
GET  /dsh-murasame-pet/state
POST /dsh-murasame-pet/control
```

`control` body：

```json
{"action":"start"}
{"action":"stop"}
{"visibility":"character"}
{"scale":1.15}
{"visibility":"both","scale":1.0}
```

返回中带最新 `state`。

## 6. 桌宠配置键

写入 `MurasamePetLite/config.json`：

```json
{
  "display": {
    "visibility_mode": "both",
    "ui_scale": 1.0
  }
}
```

- `visibility_mode`：`both` / `text` / `character` / `none`
- `ui_scale`：`0.7–1.6`，文字框、输入框、字号、边距同步缩放

`pet.py` 已有配置轮询，约 2 秒热更新；不需要重启桌宠。

## 7. 自动启动与 DSH 绑定

- 插件默认随 DSH 加载自动启动桌宠；`MURASAMEPET_AUTOSTART=0` 关闭。
- `启动桌宠并连接DSH.bat` 在 `17357` 未监听时后台启动 `dsh web --no-open`，再启动桌宠。
- 已在运行的 DSH 不会被重复拉起。

## 8. 扩展方式

### 加一个工具

在 `lib/index.js` 的 `tools` 数组加 `toolSpec(...)`，例如加一个“让桌宠切到指定模型”：

```js
toolSpec(mod.defineTool, 'pet_set_model', '切换 Live2D 模型', {
  path: { type: 'string', required: true },
}, async (args) => {
  // 读取 config.json，写 live2d.model，桌宠轮询热更新
  return { ok: true, text: `model=${args.path}` }
})
```

同时更新 `dsh.plugin.json` 的 `contributes.tools`。

### 加一个客户端面板

`lib/client.js` 里向其他 slot 注册即可；当前用：

```js
ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({...}, Panel))
```

可扩展到 `plugins.row.config`、`shell.overlay`，但注意不要遮挡 DSH 主界面。

### 加一个桌宠配置项

1. 在 `pet.py` 的 `_apply_display_settings_from_config()` 读取新键；
2. 在 `config.lite.json` 加默认值；
3. 在插件 `setDisplay()` 写入；
4. 在 client 面板加入控件。

### 换模型 / 换角色

替换 `MurasamePetLite/model/` 下的 `.model3.json`、`.moc3`、贴图与 EXP，更新 `config.json` → `live2d.model`。

## 9. 发布

```sh
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 \
  --title "dsh-murasame-pet v0.1.0" \
  --notes "DSH 绑定、显示模式、文字比例、副屏 DPI 修复"
```

Lite 运行目录作为 release 资产上传，不要提交进 Git：

```text
MurasamePetLite-0.1.0-win64.zip
```

## 10. 已知边界

- 插件只绑定 Windows 桌宠；macOS/Linux 不适用。
- 应用目录需要在 DSH 本机；远程 DSH 无法启动本机 exe。
- 显示模式依赖 `pet.py` 的配置轮询，约 2 秒延迟。
- 运行目录中的模型/贴图版权归原作者，发布前确认授权。
