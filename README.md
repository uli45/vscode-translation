# ULI Translation 翻译插件

这是一个支持百度翻译API和腾讯云翻译API的VSCode翻译插件，支持多语言翻译、本地缓存和性能监控功能。

## 功能特性

- 支持多语言翻译，可选择百度翻译API或腾讯云翻译API
- 本地缓存翻译结果，提高翻译效率
- 缓存性能监控，确保响应时间在500ms内
- 自动提示清理缓存，优化性能
- 支持腾讯云机器翻译API的高级功能

## 使用要求

- 需要百度翻译API的AppID和密钥，或腾讯云翻译API的SecretId和SecretKey
- 需要VSCode 1.60.0或更高版本

## 扩展设置

本扩展提供以下设置项：

### 百度翻译API设置

- `uliTranslation.baidu.appId`: 百度翻译API的AppID
- `uliTranslation.baidu.key`: 百度翻译API的密钥
- `uliTranslation.baidu.salt`: 百度翻译API的salt值（可选）

### 腾讯云翻译API设置

- `uliTranslation.tencent.secretId`: 腾讯云API的SecretId
- `uliTranslation.tencent.secretKey`: 腾讯云API的SecretKey
- `uliTranslation.tencent.region`: 腾讯云API的地域，默认为ap-guangzhou
- `uliTranslation.tencent.projectId`: 腾讯云项目ID，默认为0

### 缓存设置

- `uliTranslation.cache.enable`: 启用/禁用翻译缓存功能
- `uliTranslation.cache.maxSizeMB`: 设置缓存大小上限（MB），建议保持在20MB以内以确保响应时间在500ms内
- `uliTranslation.cache.expirationDays`: 翻译缓存的过期天数，默认为3天

## 已知问题

- 当缓存大小超过20MB时，响应时间可能会超过500ms
- 首次翻译需要联网获取结果
- 腾讯云翻译API单次请求文本长度限制为2000字符
- 腾讯云翻译API有调用频率限制，过于频繁的请求可能会被限流

## 腾讯云翻译API使用说明

### 配置腾讯云翻译API

1. 首先，您需要在腾讯云官网申请机器翻译服务，获取SecretId和SecretKey
2. 在VS Code中，打开设置（文件 > 首选项 > 设置），搜索"uliTranslation.tencent"
3. 填写以下配置项：
   - `uliTranslation.tencent.secretId`: 您的腾讯云API SecretId
   - `uliTranslation.tencent.secretKey`: 您的腾讯云API SecretKey
   - `uliTranslation.tencent.region`: 可选，腾讯云API地域，默认为ap-guangzhou
   - `uliTranslation.tencent.projectId`: 可选，腾讯云项目ID，默认为0

### 切换翻译API

本插件支持在百度翻译API和腾讯云翻译API之间切换。系统会根据您的配置自动选择可用的翻译API：

- 如果您只配置了百度翻译API的AppID和密钥，系统将使用百度翻译API
- 如果您只配置了腾讯云翻译API的SecretId和SecretKey，系统将使用腾讯云翻译API
- 如果您同时配置了两种API，系统将优先使用腾讯云翻译API

### 腾讯云翻译API特点

- 支持多种语言之间的互译
- 支持自动语言检测（源语言设置为"auto"）
- 单次请求文本长度限制为2000字符
- 遵循腾讯云API 3.0签名v3的安全认证
- 提供详细的错误信息和故障排除提示

## 性能指标查看

您可以通过以下两种方式查看翻译插件的性能指标：

### 方式一：通过命令面板查看

1. 在 VS Code 中按下 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）打开命令面板
2. 在命令面板中输入 `uli-translation.showCacheMetrics` 或搜索 "显示翻译缓存性能指标"
3. 选择该命令后，将弹出一个信息提示框，显示以下性能指标：
   - 缓存命中率（百分比）
   - 平均响应时间（毫秒）
   - 当前缓存大小（以人类可读的格式显示，如 KB 或 MB）

### 方式二：通过性能警告提示查看

当翻译缓存的响应时间超过 500ms 时，系统会自动弹出警告提示：

1. 警告提示会显示当前响应时间，并提供三个选项："清空缓存"、"查看性能指标"和"忽略"
2. 点击"查看性能指标"按钮，将显示与方式一相同的性能指标信息

### 性能指标说明

- **缓存命中率**：表示从缓存中成功获取翻译结果的请求比例，命中率越高表示缓存效率越好
- **平均响应时间**：表示从缓存获取翻译结果的平均时间，理想情况下应保持在 500ms 以内
- **缓存大小**：当前缓存占用的存储空间，默认限制为 20MB

此外，插件还会每 10 分钟自动在 VS Code 输出面板的 "ULI Translation" 频道中记录一次性能指标，您可以通过查看输出面板来监控长期的性能趋势。

如果您发现性能指标不理想（如响应时间过长），可以考虑清空缓存以提高性能。

## 发布说明

### 1.0.0

- 初始版本发布
- 支持多语言翻译（基于百度翻译API）
- 本地缓存翻译结果

### 1.1.0

- 添加缓存性能监控功能
- 优化缓存大小默认值为20MB
- 添加响应时间监控和警告
- 添加缓存性能指标查看命令
- 添加清空缓存命令

### 1.2.0

- 添加腾讯云机器翻译API支持
- 优化翻译API错误处理
- 添加腾讯云API配置选项
- 支持在百度翻译和腾讯云翻译之间切换

---

**祝您使用愉快！**
