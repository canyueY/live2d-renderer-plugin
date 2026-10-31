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
| `pet_start` | 启动桌宠 |
| `pet_stop` | 停止桌宠 |
| `pet_status` | 运行状态 / 显示模式 / 比例 / 应用路径 |
| `pet_set_visibility` | `both` / `text` / `character` / `none` |
| `pet_set_scale` | 文字框比例 `0.7–1.6` |

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

> 状态：v0.1.0，按 DSH `0.2.1-rc.3` 验证。副屏 DPI 修复使用 PerMonitorV2 + Cubism 物理像素视口。


---

> **为什么还要开发 Mnemosyne？** [阅读全文 →](WHY_MNEMOSYNE.md)
