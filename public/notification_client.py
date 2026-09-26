#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
教室大屏通知接收程序
功能：通过 WebSocket 接收通知，弹出置顶窗口显示通知内容
运行方式：pythonw.exe notification_client.py（无控制台窗口）
"""

import asyncio
import json
import tkinter as tk
from tkinter import font as tkfont
import threading
import sys
import os
import requests
import websockets
from datetime import datetime

# ==================== 配置区域 ====================
# 请修改为你的 Worker 地址（不含末尾斜杠）
WORKER_URL = "https://你的worker地址"
WS_URL = f"wss://{WORKER_URL.replace('https://', '').replace('http://', '')}/api/websocket"
API_BASE = WORKER_URL
# ==================================================

# 弹窗显示时长（秒）
DISPLAY_DURATION = 8
# 重连间隔（秒）
RECONNECT_INTERVAL = 5


def log(msg: str):
    """日志输出"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")


def mark_as_read(message_id: str):
    """标记消息为已读"""
    try:
        url = f"{API_BASE}/api/read"
        response = requests.post(
            url,
            json={"id": message_id},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        if response.status_code == 200:
            log(f"消息 {message_id} 已标记为已读")
        else:
            log(f"标记已读失败: HTTP {response.status_code} - {response.text}")
    except Exception as e:
        log(f"标记已读异常: {e}")


def fetch_unread_messages():
    """获取未读消息列表"""
    try:
        url = f"{API_BASE}/api/unread"
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            messages = data if isinstance(data, list) else data.get("messages", [])
            log(f"获取到 {len(messages)} 条未读消息")
            return messages
        else:
            log(f"获取未读消息失败: HTTP {response.status_code}")
            return []
    except Exception as e:
        log(f"获取未读消息异常: {e}")
        return []


class NotificationWindow:
    """通知弹窗类"""

    def __init__(self, message_id: str, content: str, on_close=None):
        self.message_id = message_id
        self.content = content
        self.on_close = on_close
        self.root = None
        self.timer_id = None

    def show(self):
        """在独立线程中显示弹窗"""
        thread = threading.Thread(target=self._create_window, daemon=True)
        thread.start()

    def _create_window(self):
        """创建并显示弹窗"""
        self.root = tk.Tk()
        self.root.title("教室通知")
        self.root.overrideredirect(False)

        # 窗口尺寸
        width = 600
        height = 300

        # 获取屏幕尺寸并居中
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - width) // 2
        y = (screen_height - height) // 2

        self.root.geometry(f"{width}x{height}+{x}+{y}")
        self.root.resizable(False, False)

        # 置顶显示
        self.root.attributes("-topmost", True)

        # 背景色
        self.root.configure(bg="#ffffff")

        # 主框架
        main_frame = tk.Frame(self.root, bg="#ffffff", padx=30, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 标题
        title_label = tk.Label(
            main_frame,
            text="📢 通知",
            font=("Microsoft YaHei", 16, "bold"),
            bg="#ffffff",
            fg="#1a1a1a"
        )
        title_label.pack(pady=(0, 15))

        # 分隔线
        separator = tk.Frame(main_frame, height=2, bg="#e0e0e0")
        separator.pack(fill=tk.X, pady=(0, 15))

        # 通知内容（支持自动换行）
        content_label = tk.Label(
            main_frame,
            text=self.content,
            font=("Microsoft YaHei", 14),
            bg="#ffffff",
            fg="#333333",
            wraplength=520,
            justify=tk.CENTER
        )
        content_label.pack(fill=tk.BOTH, expand=True)

        # "知道了"按钮
        btn_frame = tk.Frame(main_frame, bg="#ffffff")
        btn_frame.pack(pady=(15, 0))

        btn = tk.Button(
            btn_frame,
            text="知道了",
            font=("Microsoft YaHei", 12, "bold"),
            bg="#4CAF50",
            fg="#ffffff",
            activebackground="#45a049",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            padx=30,
            pady=8,
            cursor="hand2",
            command=self._close
        )
        btn.pack()

        # 倒计时标签
        self.countdown_var = tk.StringVar(value=f"自动关闭: {DISPLAY_DURATION}s")
        countdown_label = tk.Label(
            main_frame,
            textvariable=self.countdown_var,
            font=("Microsoft YaHei", 9),
            bg="#ffffff",
            fg="#999999"
        )
        countdown_label.pack(pady=(10, 0))

        # 启动自动关闭倒计时
        self._start_countdown()

        # 窗口关闭事件绑定
        self.root.protocol("WM_DELETE_WINDOW", self._close)

        # 运行主循环
        self.root.mainloop()

    def _start_countdown(self):
        """启动倒计时"""
        self.remaining = DISPLAY_DURATION
        self._update_countdown()

    def _update_countdown(self):
        """更新倒计时显示"""
        if self.remaining <= 0:
            self._close()
            return
        self.countdown_var.set(f"自动关闭: {self.remaining}s")
        self.remaining -= 1
        if self.root and self.root.winfo_exists():
            self.timer_id = self.root.after(1000, self._update_countdown)

    def _close(self):
        """关闭弹窗并标记已读"""
        # 取消倒计时
        if self.timer_id and self.root and self.root.winfo_exists():
            try:
                self.root.after_cancel(self.timer_id)
            except Exception:
                pass

        # 标记为已读
        mark_as_read(self.message_id)
        log(f"弹窗关闭: 消息 {self.message_id}")

        # 回调
        if self.on_close:
            self.on_close()

        # 销毁窗口
        if self.root and self.root.winfo_exists():
            try:
                self.root.destroy()
            except Exception:
                pass


async def show_notification(message_id: str, content: str):
    """显示通知弹窗"""
    log(f"显示通知: [{message_id}] {content[:50]}...")
    window = NotificationWindow(message_id, content)
    window.show()


async def process_message(data: dict):
    """处理收到的消息"""
    try:
        message_id = data.get("id", "")
        content = data.get("content", "") or data.get("message", "") or data.get("text", "")

        if not content:
            log(f"收到空内容消息: {data}")
            return

        if not message_id:
            message_id = f"auto_{int(datetime.now().timestamp() * 1000)}"

        await show_notification(message_id, content)

    except Exception as e:
        log(f"处理消息异常: {e}")


async def process_startup_messages():
    """启动时处理未读消息"""
    log("检查未读消息...")
    messages = fetch_unread_messages()

    if messages:
        for i, msg in enumerate(messages):
            # 每条消息间隔显示，避免同时弹出多个窗口
            if i > 0:
                await asyncio.sleep(2)

            if isinstance(msg, dict):
                await process_message(msg)
            else:
                await show_notification(f"startup_{i}", str(msg))
    else:
        log("没有未读消息")


async def websocket_connect():
    """WebSocket 连接与重连逻辑"""
    while True:
        try:
            log(f"正在连接 WebSocket: {WS_URL}")

            async with websockets.connect(
                WS_URL,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5
            ) as ws:
                log("WebSocket 连接成功")

                async for message in ws:
                    try:
                        data = json.loads(message)
                        await process_message(data)
                    except json.JSONDecodeError:
                        # 非 JSON 消息，直接作为文本显示
                        await show_notification(
                            f"ws_{int(datetime.now().timestamp() * 1000)}",
                            message
                        )
                    except Exception as e:
                        log(f"消息处理异常: {e}")

        except websockets.exceptions.ConnectionClosed as e:
            log(f"WebSocket 连接关闭: {e}")
        except websockets.exceptions.InvalidStatusCode as e:
            log(f"WebSocket 连接被拒绝: {e}")
        except OSError as e:
            log(f"网络连接错误: {e}")
        except Exception as e:
            log(f"WebSocket 异常: {type(e).__name__}: {e}")

        log(f"将在 {RECONNECT_INTERVAL} 秒后重连...")
        await asyncio.sleep(RECONNECT_INTERVAL)


async def main():
    """主函数"""
    log("=" * 50)
    log("教室大屏通知接收程序启动")
    log(f"Worker 地址: {API_BASE}")
    log(f"WebSocket 地址: {WS_URL}")
    log("=" * 50)

    # 先处理未读消息
    await process_startup_messages()

    # 启动 WebSocket 连接
    await websocket_connect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log("程序已退出")
    except Exception as e:
        log(f"程序异常退出: {e}")
