#!/bin/bash

echo "=== MineBot CLI 完整测试 ==="
echo "测试时间: $(date)"
echo "============================="
echo

# 测试前先停止可能运行的服务器
echo "1. 停止可能运行的服务器..."
./minebot server stop > /dev/null 2>&1
./minebot mc stop > /dev/null 2>&1
sleep 2

# 测试1: 基础帮助命令
echo "2. 测试基础帮助命令..."
echo "=== 测试: ./minebot help ==="
./minebot help
echo

# 测试2: 服务器管理
echo "3. 测试服务器管理..."
echo "=== 测试: ./minebot server start ==="
./minebot server start
sleep 3

echo "=== 测试: ./minebot status ==="
./minebot status
echo

echo "=== 测试: ./minebot server logs --lines 5 ==="
./minebot server logs --lines 5
echo

# 测试3: Minecraft服务器管理
echo "4. 测试Minecraft服务器管理..."
echo "=== 测试: ./minebot mc status ==="
./minebot mc status
echo

echo "=== 测试: ./minebot mc backup ==="
./minebot mc backup
echo

# 测试4: Bot管理
echo "5. 测试Bot管理..."
echo "=== 测试: ./minebot bot list ==="
./minebot bot list
echo

echo "=== 测试: ./minebot bot start testbot ==="
./minebot bot start testbot
sleep 5

echo "=== 测试: ./minebot bot list ==="
./minebot bot list
echo

# 获取bot ID
BOT_ID=$(./minebot bot list 2>/dev/null | grep "testbot" | sed -n 's/.*(\(bot_[^)]*\)).*/\1/p' | head -1)
if [ -n "$BOT_ID" ]; then
    echo "找到Bot ID: $BOT_ID"
    echo
    
    # 测试5: Bot详细管理
    echo "6. 测试Bot详细管理..."
    echo "=== 测试: ./minebot bot watch $BOT_ID --count 1 ==="
    timeout 5 ./minebot bot watch $BOT_ID --count 1
    echo
    
    echo "=== 测试: ./minebot bot automatic testbot survival ==="
    ./minebot bot automatic testbot survival
    sleep 3
    echo
    
    # 测试6: 配置管理
    echo "7. 测试配置管理..."
    echo "=== 测试: ./minebot config show ==="
    ./minebot config show
    echo
    
    # 测试7: 进化系统
    echo "8. 测试进化系统..."
    echo "=== 测试: ./minebot evolution stats $BOT_ID ==="
    ./minebot evolution stats $BOT_ID
    echo
    
    # 测试8: 目标系统
    echo "9. 测试目标系统..."
    echo "=== 测试: ./minebot goal status $BOT_ID ==="
    ./minebot goal status $BOT_ID
    echo
    
    echo "=== 测试: ./minebot goal select $BOT_ID gather ==="
    ./minebot goal select $BOT_ID gather
    echo
    
    # 测试9: 资源收集
    echo "10. 测试资源收集..."
    echo "=== 测试: ./minebot bot gather --botId $BOT_ID --blocks oak_log --radius 20 ==="
    ./minebot bot gather --botId $BOT_ID --blocks oak_log --radius 20
    echo
    
    # 清理测试bot
    echo "11. 清理测试bot..."
    echo "=== 测试: ./minebot bot remove $BOT_ID ==="
    ./minebot bot remove $BOT_ID
    echo
fi

# 测试10: 清理
echo "12. 测试清理功能..."
echo "=== 测试: ./minebot bot cleanup ==="
./minebot bot cleanup
echo

echo "=== 测试: ./minebot bot remove all ==="
./minebot bot remove all
echo

# 测试11: 系统命令帮助
echo "13. 测试系统命令帮助..."
echo "=== 测试: ./minebot bot help ==="
./minebot bot help | head -20
echo

echo "=== 测试: ./minebot mc help ==="
./minebot mc help
echo

echo "=== 测试: ./minebot config help ==="
./minebot config help
echo

echo "=== 测试: ./minebot evolution help ==="
./minebot evolution help
echo

echo "=== 测试: ./minebot goal help ==="
./minebot goal help
echo

echo "=== 测试: ./minebot server help ==="
./minebot server help
echo

# 停止服务器
echo "14. 停止服务器..."
echo "=== 测试: ./minebot server stop ==="
./minebot server stop
sleep 2

echo "=== 测试: ./minebot mc stop ==="
./minebot mc stop
echo

echo "=== 最终状态检查 ==="
./minebot status
echo

echo "=== 测试完成 ==="
echo "测试时间: $(date)"