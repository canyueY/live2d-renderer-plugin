# 肥鱼 Live2D 模型渲染插件

> 肥鱼 Live2D 模型渲染插件：把现有 **MurasamePet Lite** 绑定进 DSH，负责启动、人物/文字显示模式与文字框比例；复用原 Live2D 渲染器，不重写模型渲染。

> 技术包名仍为 `dsh-murasame-pet`（避免破坏已安装用户）；仓库名已改为 `live2d-renderer-plugin`；项目显示名统一为 **肥鱼 Live2D 模型渲染插件**。

[用户指南](docs/USER_GUIDE.md) · [DSH 指南](docs/DSH_GUIDE.md) · [发布页](https://github.com/canyueY/live2d-renderer-plugin/releases)

## 这是什么

**肥鱼 Live2D 模型渲染插件**不是新的桌宠，也不是新的 Live2D 渲染器。它复用原工程已有的：

- PyQt5 桌宠窗口与文字气泡 / 输入框
- `pyqt-live2d-bridge` 的 Cubism Native 渲染
- 大肥鱼基础模型、表情、物理
- 多屏 / 高 DPI 适配

插件只做三件事：

1. **绑定启动**：DSH 加载时检查并启动 `MurasamePetLite.exe`；
2. **表现控制**：人物+文字 / 仅文字 / 仅人物 / 全部隐藏，以及文字比例；
3. **桌面端配置**：在 DSH 的插件详情页修改，桌宠约 2 秒内热更新。

## 安装

先下载 Lite 运行目录（发布页的 `MurasamePetLite-*.zip`），解压到：

```text
%USERPROFILE%\.dsh\murasame-pet
```

然后安装插件：

```sh
dsh plugin --profile desktop add 'dsh-murasame-pet@github:canyueY/live2d-renderer-plugin#v0.1.0'
```

本地开发：

```sh
dsh plugin --profile desktop add link:D:\path\to\live2d-renderer-plugin
```

重启 DSH 或刷新页面，打开「插件 → dsh-murasame-pet」即可看到控制面板。

## 角色指南

### 用户

关心：怎么装、怎么启动、怎么控制人物/文字、Key 填哪里、副屏裁切怎么办。

→ [用户安装与使用指南](docs/USER_GUIDE.md)

### DSH / 插件开发者

关心：插件如何绑定应用、工具契约、控制 API、`config.json` 键、如何加新工具或新 UI、如何发布。

→ [DSH 安装、使用与扩展指南](docs/DSH_GUIDE.md)

## 工具一览

| 工具 | 作用 |
| --- | --- |
| `pet_start` | 启动 Lite 桌宠 |
| `pet_stop` | 停止 Lite 桌宠 |
| `pet_status` | Lite 运行状态 / 显示模式 / 比例 / 应用路径 |
| `pet_set_visibility` | `both` / `text` / `character` / `none` |
| `pet_set_scale` | 文字框比例 `0.7–1.6` |
| `body_start` | 启动**完整工程** `pet.py` 作为身体（body 控制面 28566） |
| `body_stop` | 停止本插件启动的完整身体 |
| `body_status` | 角色 / Live2D 模型 / 显示 / TTS / B 站视频 |
| `body_say` | 让身体说话：气泡 + 表情 + 可选 TTS |
| `body_emote` | 只切 Live2D 表情 |
| `body_video` | 读取当前 B 站视频观察状态 |
| `body_music` | 读取网易云 / CDP / 当前歌曲状态 |
| `body_weather` | 查询高德天气实况/预报 |
| `body_memory` | 只读查询桌宠真实 Mnemosyne Memory Bank |
| `body_screen` | 按桌宠配置截一张当前屏幕，存 JPEG 到 `data/screenshots/`，返回路径给对话侧 `read_image` 看（不调 VL、不上传） |

### 桌宠输入 → DSH

`lib/index.js` 的 `/dsh-murasame-pet/chat` 把桌宠输入送进一个 DSH Agent session：

```text
pet.py 输入框 -> /dsh-murasame-pet/chat -> session.prompt
              -> memory_* / body_memory / body_weather / anime_*
              -> assistant 文本 -> pet.py 气泡
```

桌宠不再调用自己的云端 LLM；DSH 是唯一大脑。

### 身体组件契约

```text
DSH（大脑） --tool--> dsh-murasame-pet（宿主插件）
                         ├─ body_say  ──HTTP 28566──> pet.py（身体）
                         ├─ body_emote ─HTTP 28566──> Live2D
                         └─ body_video ─HTTP 28566──> video_observation
```

`body_say` 是 fire-and-forget：DSH 决定台词，身体只负责显示、表情与 TTS。
完整工程的 `Murasame/body_surface.py` 只监听 `127.0.0.1:28566`。

## 目录

```text
lib/index.js       host：启动、控制路由、工具、config 热更新
lib/client.js      DSH 插件详情页控制面板
cordis.patch.yml   自动挂载 profile 层
docs/USER_GUIDE.md 用户指南
docs/DSH_GUIDE.md  DSH / 扩展指南
```

## 许可

AGPL-3.0-or-later。MurasamePet Lite 运行目录中的模型/贴图版权归原作者，详见发布包内 `THIRD_PARTY_NOTICES.md`。

> 状态：v0.2.1，宿主接口兼容 DSH `0.2.1` 至 `0.2.2-rc.1`（`engines.dsh: >=0.2.1-0 <0.3.0`，含 rc）。副屏 DPI 修复使用 PerMonitorV2 + Cubism 物理像素视口。DSH 0.2.2 起 Host Service 访问必须显式 `inject`，本插件已声明 `tools`、`webServer`、`sessionController`。
