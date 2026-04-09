# Minecraft Server Management Commands Test

## Added Commands

The following commands have been added to the `minebot` CLI:

### 1. `minebot mc start`
启动Minecraft服务器
- `-p, --path <path>`: 指定Minecraft服务器JAR文件路径（默认从.env读取）
- `-m, --memory <memory>`: 分配内存大小（默认从.env读取MINECRAFT_MAX_MEMORY）
- `--args <args>`: 服务器启动参数（默认从.env读取MINECRAFT_SERVER_ARGS）

### 2. `minebot mc end` 或 `minebot mc stop`
停止Minecraft服务器
- `-f, --force`: 强制停止

### 3. `minebot mc restart`
重启Minecraft服务器
- ` -p, --path <path>`: 指定Minecraft服务器JAR文件路径
- `-m, --memory <memory>`: 分配内存大小
- `--args <args>`: 服务器启动参数

### 4. `minebot mc status`
查看Minecraft服务器状态

## Environment Variables Fallback

如果不提供命令行参数，系统会从`.env`文件读取配置：
- `MINECRAFT_SERVER_DIR`: Minecraft服务器目录（默认: `resources/java-1.21.11`）
- `MINECRAFT_JAR_PATH`: Minecraft服务器JAR文件名（默认: `minecraft_server.1.21.11.jar`）
- `MINECRAFT_MAX_MEMORY`: 分配内存大小（默认: `1G`）
- `MINECRAFT_SERVER_ARGS`: 服务器启动参数（默认: `nogui`）

## Examples

### 启动服务器（使用默认.env配置）
```bash
minebot mc start
```

### 启动服务器（指定自定义路径）
```bash
minebot mc start --path /path/to/minecraft_server.jar
```

### 启动服务器（指定内存大小）
```bash
minebot mc start --memory 2G
```

### 停止服务器
```bash
minebot mc end
# 或
minebot mc stop
```

### 强制停止服务器
```bash
minebot mc end --force
```

### 重启服务器
```bash
minebot mc restart
```

### 查看服务器状态
```bash
minebot mc status
```

## Implementation Details

1. **进程管理**: 使用PID文件跟踪运行中的服务器进程
2. **日志记录**: 服务器输出重定向到`logs/minecraft_server.log`
3. **优雅关闭**: 先发送SIGTERM，超时后发送SIGKILL
4. **状态检查**: 通过TCP端口25565连接检查服务器状态
5. **路径验证**: 启动前检查JAR文件是否存在

## Integration with Existing System

新命令与现有系统集成：
- 使用相同的`.env`配置管理
- 与现有`minebot status`命令兼容
- 使用相同的日志目录结构
- 遵循现有的CLI模式（Commander.js）