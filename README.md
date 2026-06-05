# CPA / Sub2API WebUI

一个纯前端、本地处理的转换工具，用于在浏览器中完成以下互转：

- `CPA / Codex JSON -> Sub2API JSON`
- `Sub2API JSON -> CPA / Codex JSON`
- `多个 CPA / Codex JSON -> 1 个 Sub2API JSON`
- `多个 CPA / Codex JSON -> 多个 Sub2API JSON`
- `包含多个 JSON / CPA 的 ZIP -> 批量转换 -> ZIP 下载`

所有数据都在浏览器本地处理，不上传到服务器。

## 功能

- 粘贴 JSON 直接识别
- 上传 `.json`、`.cpa` 文件处理
- 上传包含多个 `.json` / `.cpa` 的 `.zip` 压缩包处理
- 支持单个文件互转
- 支持多个 `CPA / Codex` 文件批量转 `Sub2API`
- 支持 `Sub2API` 多账号批量导出多个 `CPA / Codex`
- 支持多结果打包为 `.zip` 压缩包下载
- 支持 Windows 本地启动
- 支持 Docker 部署到 Linux 服务器

## 项目结构

- `index.html`: 页面结构
- `styles.css`: 页面样式
- `converter.js`: 转换规则
- `app.js`: 页面交互逻辑
- `zip.js`: ZIP 压缩包读取与打包逻辑
- `serve.mjs`: 本地静态服务器
- `start-webui.ps1`: Windows PowerShell 启动脚本
- `start-webui.cmd`: Windows CMD 启动脚本
- `Dockerfile`: Docker 镜像构建文件

## Windows 使用方法

适合本机直接打开使用，保留现有桌面端体验。

### 方式一：PowerShell

```powershell
.\start-webui.ps1
```

### 方式二：CMD

```cmd
start-webui.cmd
```

启动后浏览器会自动打开：

```text
http://127.0.0.1:4173
```

### Windows 手动启动

如果你不想用脚本，也可以直接运行：

```powershell
$env:PORT = "4173"
node .\serve.mjs
```

## Docker 部署方法

适合部署到 Linux 服务器。

### 1. 构建镜像

```bash
docker build -t cpa-sub2api:latest .
```

### 2. 启动容器

```bash
docker run -d \
  --name cpa-sub2api \
  -p 4173:4173 \
  cpa-sub2api:latest
```

启动后访问：

```text
http://服务器IP:4173
```

### 3. 停止和删除容器

```bash
docker stop cpa-sub2api
docker rm cpa-sub2api
```

### 4. 查看日志

```bash
docker logs -f cpa-sub2api
```

## 使用说明

### 单个文件转换

1. 上传一个 JSON 文件，或直接粘贴 JSON。
2. 点击“识别格式”。
3. 选择目标格式。
4. 点击“执行转换”。
5. 下载结果。

### 多个 CPA 批量转换

1. 一次选择多个 `CPA / Codex JSON` 文件，或上传包含多个 `.json` / `.cpa` 的 `.zip` 压缩包。
2. 目标格式选择 `Sub2API`。
3. 选择批量模式：
   - `合并成 1 个 Sub2API`
   - `分别导出多个 Sub2API`
4. 点击“执行转换”。
5. 合并模式下载单个 JSON；分别导出模式下载 ZIP 压缩包。

### Sub2API 批量导出 CPA

1. 上传一个 `Sub2API JSON` 文件。
2. 选择目标格式 `CPA / Codex`。
3. 点击“执行转换”。
4. 如果有多个账号，可以下载 ZIP 压缩包。

## 当前规则

- `CPA / Codex` 单对象可直接互转
- 粘贴 `CPA` 数组、一次上传多个 `CPA` 文件，或上传包含多个 `CPA` 文件的 ZIP 时，可选择合并或拆分导出 `Sub2API`
- 拆分导出多个结果时，会打包为 ZIP 压缩包下载
- `Sub2API` 输入会提取 `accounts` 中 `platform = openai` 的账号
- 缺失的 `email`、`expires_at` 等字段会优先从 token 中推断

## 安全说明

- 本工具不会主动上传你的 JSON 数据
- 建议仅在你信任的本机或服务器环境中使用
- 推送代码仓库前请不要把真实账号 JSON 示例文件放进项目目录
