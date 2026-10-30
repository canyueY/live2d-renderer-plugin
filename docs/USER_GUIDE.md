# 肥鱼 Live2D 模型渲染插件 · 用户安装与使用指南

面向只想用肥鱼 Live2D 模型渲染插件、不想改代码的用户。

## 1. 准备

- Windows 10/11
- 已安装 **DSH**
- 下载发布页的 **MurasamePet Lite** 压缩包（约 0.4 GB）

## 2. 放置桌宠运行目录

把压缩包解压到：

```text
C:\Users\<你的用户名>\.dsh\murasame-pet
```

确认目录里直接能看到：

```text
MurasamePetLite.exe
config.json
model\dafeiyu\大肥鱼.model3.json
```

如果放在别处，设置环境变量 `MURASAMEPET_HOME` 指向该目录即可。

## 3. 安装 DSH 插件

```sh
dsh plugin --profile desktop add 'dsh-murasame-pet@github:canyueY/dsh-murasame-pet#v0.1.0'
```

装完重启 DSH，或刷新页面。插件默认会自动启动桌宠；不想自动启动，设置：

```text
MURASAMEPET_AUTOSTART=0
```

## 4. 第一次启动

1. 桌宠首次启动会弹窗要求填 **DeepSeek API Key**；
2. 也可以跳过后编辑 `config.json`：

```json
"lite_api": {
  "provider": "deepseek",
  "model": "deepseek-chat",
  "api_key": "sk-..."
}
```

3. 保存后重启桌宠。

> 没有 Key 也能看到模型和文字框，但对话会提示未配置。

## 5. 在 DSH 里控制

打开「插件 → dsh-murasame-pet」：

### 显示模式

| 模式 | 效果 |
| --- | --- |
| 人物+文字 | 默认，人物和气泡都在 |
| 仅文字 | 隐藏人物，只留文字框 |
| 仅人物 | 隐藏文字，只留立绘 |
| 全部隐藏 | 人物和文字同时消失 |

### 文字比例

- `−` / `+` 调整 `0.7×–1.6×`；
- 文字框、输入框、字号、边距会一起缩放；
- 文字位置跟随人物露出高度，并始终限制在当前 Windows 工作区内。

### 启动 / 停止

面板顶部按钮可直接启动或停止桌宠。

## 6. 不使用 DSH 时

双击桌宠目录里的：

```text
启动桌宠并连接DSH.bat
```

- 如果 DSH 的 `17357` 端口没在监听，会在后台启动 `dsh web --no-open`；
- 然后启动桌宠。

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| 插件详情页没有面板 | 确认装到了当前 profile（desktop），重启 DSH，硬刷新页面 |
| 插件提示找不到 exe | 确认 `%USERPROFILE%\.dsh\murasame-pet\MurasamePetLite.exe` 存在，或设置 `MURASAMEPET_HOME` |
| 对话报 Key 错误 | 填 `config.json` → `lite_api.api_key`，重启桌宠 |
| 人物被裁 / 副屏异常 | v0.1.0 已启用 PerMonitorV2 + 物理像素视口；记录两块屏分辨率和缩放比 |
| 想恢复默认 | 删除 `config.json`，重启会从 `config.lite.json` 重新生成 |
| 输入框挡住人物 | 调小文字比例，或切换「仅文字 / 仅人物」 |
