# Minecraft Bot 实时游戏画面流 - 实施计划

## 1. 概述

### 1.1 目标
按照设计方案实现完整的实时游戏画面流传输系统，包括后端流服务、前端视频组件和Bot截图集成。

### 1.2 范围
- ✅ Bot截图模块 (`ScreenshotModule`)
- ✅ 流管理服务 (`StreamManager`, `BotStream`)
- ✅ HTTP MJPEG流路由
- ✅ WebSocket扩展消息
- ✅ React VideoPlayer组件
- ✅ 带宽控制
- ✅ 集成测试

### 1.3 时间估算
| 阶段 | 任务数 | 预计时间 | 风险 |
|------|--------|----------|------|
| Phase 1 | 8 | 3-4天 | 中等 |
| Phase 2 | 6 | 2-3天 | 低 |
| Phase 3 | 5 | 2-3天 | 中等 |
| **总计** | **19** | **7-10天** | - |

---

## 2. 依赖分析

### 2.1 外部依赖
```json
{
  "dependencies": {
    "canvas": "^2.11.2",
    "prismarine-viewer": "^1.25.0"
  }
}
```

### 2.2 内部依赖
- `bot/index.js` - 需要添加截图支持
- `bot_server.js` - 需要集成流路由
- `frontend/src/` - 需要添加VideoPlayer组件

### 2.3 前置条件
- [ ] Node.js 环境 (>= 16.x)
- [ ] 系统依赖 (cairo, pango等)
- [ ] 现有Bot系统可正常运行

---

## 3. 详细任务清单

### Phase 1: 核心基础设施 (3-4天)

#### 任务 1.1: 安装系统依赖
**文件:** 系统包管理器  
**工作量:** 0.5天  
**描述:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev
```
**验收标准:**
- [ ] 所有包安装成功
- [ ] `pkg-config` 能找到cairo

**依赖:** 无  
**风险:** 低

---

#### 任务 1.2: 安装Node依赖
**文件:** `package.json`  
**工作量:** 0.5天  
**描述:**
```bash
npm install canvas prismarine-viewer
```

**验收标准:**
- [ ] 依赖安装无错误
- [ ] `npm list` 显示新包

**依赖:** 任务 1.1  
**风险:** 中等 (canvas编译可能失败)

---

#### 任务 1.3: 实现 ScreenshotModule
**文件:** `bot/ScreenshotModule.js` (新建)  
**工作量:** 1天  
**描述:**
实现截图模块，集成prismarine-viewer和canvas

**关键代码结构:**
```javascript
class ScreenshotModule {
  constructor(bot)
  async initialize(width, height)
  async capture() -> Buffer
  destroy()
}
```

**验收标准:**
- [ ] 模块可实例化
- [ ] `capture()` 返回JPEG buffer
- [ ] 正确清理资源

**依赖:** 任务 1.2  
**风险:** 中等 (渲染可能不稳定)

---

#### 任务 1.4: 实现 BotStream
**文件:** `streaming/BotStream.js` (新建)  
**工作量:** 1天  
**描述:**
实现单个Bot的流管理，包括MJPEG流生成和观看者管理

**关键功能:**
- 观看者管理 (addViewer/removeViewer)
- MJPEG流生成 (multipart/x-mixed-replace)
- 帧缓冲和发送

**验收标准:**
- [ ] 可添加HTTP响应作为观看者
- [ ] 正确生成MJPEG流
- [ ] 支持多观看者

**依赖:** 无 (独立模块)  
**风险:** 低

---

#### 任务 1.5: 实现 StreamManager
**文件:** `streaming/StreamManager.js` (新建)  
**工作量:** 0.5天  
**描述:**
管理所有Bot流的全局管理器

**关键方法:**
- createBotStream(botId, options)
- getOrCreateStream(botId, options)
- stopStream(botId)
- getAllStreams()

**验收标准:**
- [ ] 可创建和管理多个流
- [ ] 正确清理已停止的流

**依赖:** 任务 1.4  
**风险:** 低

---

#### 任务 1.6: 创建 streaming/index.js
**文件:** `streaming/index.js` (新建)  
**工作量:** 0.5天  
**描述:**
流模块的统一导出和初始化

**内容:**
```javascript
const StreamManager = require('./StreamManager');
const BotStream = require('./BotStream');

module.exports = {
  StreamManager,
  BotStream,
  createStreamManager: (options) => new StreamManager(options)
};
```

**验收标准:**
- [ ] 模块可正确导出
- [ ] 可在其他文件require

**依赖:** 任务 1.5  
**风险:** 无

---

### Phase 2: 后端集成 (2-3天)

#### 任务 2.1: 集成 ScreenshotModule 到 Bot
**文件:** `bot/index.js` (修改)  
**工作量:** 0.5天  
**描述:**
在Bot类中集成截图功能

**修改内容:**
- 在 `spawn` 事件中初始化 ScreenshotModule
- 添加 `startScreenshot()`, `stopScreenshot()` 方法
- 在 `disconnect` 时清理资源

**验收标准:**
- [ ] Bot启动后截图模块初始化成功
- [ ] `startScreenshot()` 开始定期截图
- [ ] 停止Bot时资源正确清理

**依赖:** 任务 1.3  
**风险:** 中等

---

#### 任务 2.2: 添加 Stream HTTP 路由
**文件:** `bot_server.js` (修改)  
**工作量:** 0.5天  
**描述:**
在Express服务器中添加流媒体路由

**修改内容:**
```javascript
const streamRouter = require('./routes/stream');

// 在现有路由后添加
app.use('/api', streamRouter);
```

**验收标准:**
- [ ] `/api/streams` 可访问
- [ ] `/api/stream/:botId/mjpeg` 可访问

**依赖:** 任务 1.6  
**风险:** 低

---

#### 任务 2.3: 创建 stream.js 路由文件
**文件:** `routes/stream.js` (新建)  
**工作量:** 1天  
**描述:**
实现所有流媒体相关的HTTP路由

**路由实现:**
- `GET /api/streams` - 列出所有流
- `GET /api/streams/:botId` - 获取特定流信息
- `POST /api/streams/:botId/start` - 启动流
- `POST /api/streams/:botId/stop` - 停止流
- `GET /api/stream/:botId/mjpeg` - MJPEG视频流

**验收标准:**
- [ ] 所有路由正常工作
- [ ] 正确返回JSON或MJPEG流
- [ ] 错误处理完善

**依赖:** 任务 2.2  
**风险:** 中等

---

#### 任务 2.4: 扩展 WebSocket 消息处理
**文件:** `bot_server.js` (修改)  
**工作量:** 0.5天  
**描述:**
在现有WebSocket服务器中添加流控制消息处理

**添加处理:**
```javascript
// 在 message 处理中添加
case 'stream_command':
  handleStreamCommand(ws, message);
  break;

case 'get_stream_stats':
  sendStreamStats(ws, message.data.botId);
  break;
```

**验收标准:**
- [ ] 可接收流控制命令
- [ ] 正确广播流状态更新

**依赖:** 无 (可在任务2.2同时进行)  
**风险:** 低

---

### Phase 3: 前端与测试 (2-3天)

#### 任务 3.1: 创建 VideoPlayer 组件
**文件:** `frontend/src/components/VideoPlayer/VideoPlayer.jsx` (新建)  
**工作量:** 1天  
**描述:**
实现React视频播放器组件

**功能:**
- 使用 `<img>` 显示MJPEG流
- 播放/暂停控制
- 全屏切换
- 统计信息显示
- 自动重连

**验收标准:**
- [ ] 正确显示视频流
- [ ] 控制按钮正常工作
- [ ] 错误时显示友好提示

**依赖:** 任务 2.3  
**风险:** 低

---

#### 任务 3.2: 添加 VideoPlayer 样式
**文件:** `frontend/src/components/VideoPlayer/VideoPlayer.css` (新建)  
**工作量:** 0.5天  
**描述:**
为VideoPlayer组件添加样式

**样式要求:**
- 深色主题匹配现有UI
- 响应式布局
- 控制按钮样式
- 统计信息悬浮显示

**验收标准:**
- [ ] 样式与现有UI一致
- [ ] 在不同屏幕尺寸下正常显示

**依赖:** 任务 3.1  
**风险:** 无

---

#### 任务 3.3: 集成到 Dashboard
**文件:** `frontend/src/components/BotDashboard/BotDashboard.jsx` (修改)  
**工作量:** 0.5天  
**描述:**
在Bot Dashboard中添加VideoPlayer组件

**修改内容:**
- 添加视频显示区域
- 添加显示/隐藏视频按钮
- 传递botId给VideoPlayer

**验收标准:**
- [ ] Dashboard可显示视频
- [ ] 按钮控制视频显示/隐藏
- [ ] 切换Bot时视频正确更新

**依赖:** 任务 3.2  
**风险:** 低

---

#### 任务 3.4: 创建集成测试
**文件:** `tests/streaming/` (新建目录)  
**工作量:** 1天  
**描述:**
编写集成测试验证流媒体功能

**测试用例:**
1. `StreamManager.test.js` - 测试流管理功能
2. `BotStream.test.js` - 测试单个流实例
3. `ScreenshotModule.test.js` - 测试截图功能
4. `VideoPlayer.test.jsx` - 测试前端组件

**验收标准:**
- [ ] 所有测试用例通过
- [ ] 代码覆盖率 > 80%
- [ ] 测试文档完整

**依赖:** 任务 3.3  
**风险:** 中等

---

## 4. 里程碑与检查点

### 里程碑 1: 核心基础设施完成 (Phase 1 结束)
**日期:** 预计第4天  
**检查项:**
- [ ] ScreenshotModule 可正常截图
- [ ] BotStream 可生成MJPEG流
- [ ] StreamManager 可管理多个流
- [ ] 所有单元测试通过

### 里程碑 2: 后端集成完成 (Phase 2 结束)
**日期:** 预计第7天  
**检查项:**
- [ ] HTTP路由正常工作
- [ ] WebSocket消息处理正确
- [ ] Bot集成完成，可控制截图
- [ ] 集成测试通过

### 里程碑 3: 项目完成 (Phase 3 结束)
**日期:** 预计第10天  
**检查项:**
- [ ] VideoPlayer组件正常工作
- [ ] Dashboard集成完成
- [ ] 所有测试通过
- [ ] 文档完整
- [ ] 性能达标 (延迟<500ms, FPS>=20)

---

## 5. 风险缓解计划

| 风险 | 缓解措施 | 应急方案 |
|------|----------|----------|
| canvas编译失败 | 提供Docker环境 | 使用纯软件渲染 |
| 性能不达标 | 提前做POC测试 | 降低帧率/分辨率 |
| 截图模块不稳定 | 封装错误处理 | 自动重启截图 |
| 前端集成困难 | 提供独立测试页面 | 简化UI需求 |

---

## 6. 成功标准

项目成功的定义：

1. **功能完整性**
   - 可通过浏览器观看Bot游戏画面
   - 支持播放/暂停/全屏控制
   - 支持多Bot同时观看

2. **性能指标**
   - 延迟 < 500ms
   - 帧率 >= 20fps
   - 单路带宽 2-5 Mbps

3. **代码质量**
   - 测试覆盖率 > 80%
   - 代码审查通过
   - 文档完整

4. **用户体验**
   - 界面响应流畅
   - 错误提示友好
   - 无需刷新页面重连

---

**文档版本**: 1.0  
**创建日期**: 2024-01-XX  
**最后更新**: 2024-01-XX  
**状态**: 已批准，准备实施
