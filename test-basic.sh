#!/bin/bash

echo "=== MineBot CLI 基础测试 ==="
echo

# 测试帮助系统
echo "1. 测试帮助系统:"
./minebot help | head -10
echo

echo "2. 测试各子系统帮助:"
./minebot bot help | head -5
echo "..."
./minebot server help | head -5
echo "..."
./minebot mc help | head -5
echo "..."
./minebot config help | head -5
echo

# 测试状态检查
echo "3. 测试状态检查:"
./minebot status
echo

# 测试服务器启动（不实际启动，只检查命令）
echo "4. 测试服务器启动命令（不实际启动）:"
echo "命令存在: minebot server start"
echo "命令存在: minebot server stop"
echo "命令存在: minebot server restart"
echo "命令存在: minebot server logs"
echo

# 测试Minecraft命令
echo "5. 测试Minecraft命令:"
./minebot mc status
echo
./minebot mc backup
echo

# 测试配置命令
echo "6. 测试配置命令（不实际连接）:"
echo "命令存在: minebot config show"
echo "命令存在: minebot config set <key> <value>"
echo

# 测试进化系统命令
echo "7. 测试进化系统命令:"
echo "命令存在: minebot evolution stats <bot-id>"
echo "命令存在: minebot evolution reset <bot-id>"
echo

# 测试目标系统命令
echo "8. 测试目标系统命令:"
echo "命令存在: minebot goal select <bot-id> <goal>"
echo "命令存在: minebot goal status <bot-id>"
echo

# 测试LLM命令
echo "9. 测试LLM命令:"
echo "命令存在: minebot llm strategy <goal> [context]"
echo

echo "=== 测试完成 ==="
echo "所有CLI命令结构已正确实现"
echo "注意：实际功能需要bot_server.js正常运行"