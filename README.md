# CPA / Sub2API WebUI

本工具用于在浏览器本地完成 `CPA / Codex JSON` 与 `Sub2API 导出 JSON` 的双向转换。

## 启动方式

Windows 下任选一个：

```powershell
.\start-webui.ps1
```

```cmd
start-webui.cmd
```

启动后会自动打开：

```text
http://127.0.0.1:4173
```

## 功能

- 粘贴 JSON 直接识别
- 上传 `.json` 文件处理
- `CPA / Codex -> Sub2API`
- `多个 CPA / Codex -> 1 个 Sub2API`
- `多个 CPA / Codex -> 多个 Sub2API`
- `Sub2API -> CPA / Codex`
- Sub2API 多账号时支持批量下载多个 CPA 文件
- 所有处理都在本地浏览器完成

## 文件说明

- `index.html`: 页面结构
- `styles.css`: 页面样式
- `converter.js`: 转换规则
- `app.js`: 页面交互逻辑
- `serve.mjs`: 本地静态服务器

## 当前规则

- `CPA / Codex` 单对象可直接互转
- 粘贴 `CPA` 数组或一次上传多个 `CPA` 文件时，可选择合并或拆分导出 `Sub2API`
- `Sub2API` 输入会提取 `accounts` 中 `platform = openai` 的账号
- 缺失的 `email`、`expires_at` 等字段会优先从 token 里推断
