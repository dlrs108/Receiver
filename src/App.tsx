import { useEffect, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-python";

const PYTHON_CODE = `#!/usr/bin/env python3
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
        log(f"程序异常退出: {e}")`;

export default function App() {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "instructions">("instructions");

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [activeTab]);

  const handleCopy = () => {
    navigator.clipboard.writeText(PYTHON_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([PYTHON_CODE], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notification_client.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl">
              📢
            </div>
            <div>
              <h1 className="text-xl font-bold">教室大屏通知接收程序</h1>
              <p className="text-sm text-slate-400">WebSocket + Tkinter 弹窗通知</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-sm flex items-center gap-2"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  已复制
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制代码
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm flex items-center gap-2 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载 .py 文件
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="text-2xl mb-2">🔌</div>
            <h3 className="font-semibold mb-1">WebSocket 实时连接</h3>
            <p className="text-sm text-slate-400">自动连接、断线重连，确保不遗漏任何通知</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="text-2xl mb-2">🪟</div>
            <h3 className="font-semibold mb-1">置顶弹窗通知</h3>
            <p className="text-sm text-slate-400">600×300 居中弹窗，8秒自动关闭，支持手动确认</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="text-2xl mb-2">📋</div>
            <h3 className="font-semibold mb-1">已读状态同步</h3>
            <p className="text-sm text-slate-400">关闭弹窗自动调用 API 标记消息为已读</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("instructions")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "instructions"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📖 使用说明
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "code"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            💻 源代码
          </button>
        </div>

        {/* Content */}
        {activeTab === "instructions" ? (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-6">
            {/* Prerequisites */}
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">1</span>
                安装依赖
              </h2>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <code className="text-green-400">pip install websockets requests</code>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                tkinter 是 Python 标准库，无需额外安装。Windows 系统自带。
              </p>
            </section>

            {/* Configuration */}
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">2</span>
                配置 Worker 地址
              </h2>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <code>
                  <span className="text-purple-400">WORKER_URL</span>{" "}
                  <span className="text-slate-500">=</span>{" "}
                  <span className="text-yellow-300">"https://你的worker地址"</span>
                </code>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                打开 <code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300">notification_client.py</code>，
                找到配置区域，将 <code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300">WORKER_URL</code> 修改为你的实际 Worker 地址。
              </p>
            </section>

            {/* Run */}
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">3</span>
                运行程序
              </h2>
              <div className="space-y-3">
                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">带控制台窗口（调试用）：</p>
                  <code className="font-mono text-sm text-green-400">python notification_client.py</code>
                </div>
                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">无控制台窗口（正式使用，推荐）：</p>
                  <code className="font-mono text-sm text-green-400">pythonw.exe notification_client.py</code>
                </div>
              </div>
            </section>

            {/* API Format */}
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">4</span>
                API 接口说明
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-300">接口</th>
                      <th className="text-left py-2 px-3 text-slate-300">方法</th>
                      <th className="text-left py-2 px-3 text-slate-300">说明</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-3 font-mono text-xs text-blue-300">/api/websocket</td>
                      <td className="py-2 px-3">WebSocket</td>
                      <td className="py-2 px-3">实时接收通知消息</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-3 font-mono text-xs text-blue-300">/api/unread</td>
                      <td className="py-2 px-3">GET</td>
                      <td className="py-2 px-3">获取未读消息列表</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-xs text-blue-300">/api/read</td>
                      <td className="py-2 px-3">POST</td>
                      <td className="py-2 px-3">标记消息已读 {"{"} id: "消息ID" {"}"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Message Format */}
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">5</span>
                WebSocket 消息格式
              </h2>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-slate-300">{`{
  "id": "msg_001",
  "content": "明天下午2点在报告厅召开全体教师会议"
}`}</pre>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                消息支持 <code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300">content</code>、
                <code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300">message</code>、
                <code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300">text</code> 字段名。
              </p>
            </section>

            {/* Auto Start */}
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm">6</span>
                开机自启动（可选）
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-300">
                <li>按 <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs">Win + R</kbd> 输入 <code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300">shell:startup</code> 打开启动文件夹</li>
                <li>创建快捷方式，目标设为：<code className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300 text-xs">pythonw.exe C:\path\to\notification_client.py</code></li>
                <li>重启后程序将自动在后台运行</li>
              </ol>
            </section>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden border border-slate-700/50">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-md bg-slate-700/80 hover:bg-slate-600 transition-colors text-xs flex items-center gap-1.5 backdrop-blur-sm"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    已复制
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    复制
                  </>
                )}
              </button>
            </div>
            <div className="bg-[#1e1e2e] overflow-auto max-h-[70vh]">
              <pre className="p-4 text-sm leading-relaxed">
                <code ref={codeRef} className="language-python">
                  {PYTHON_CODE}
                </code>
              </pre>
            </div>
          </div>
        )}

        {/* Architecture Diagram */}
        <div className="mt-8 bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">🏗️ 程序架构</h2>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <div className="bg-blue-900/50 border border-blue-700/50 rounded-lg px-4 py-2 text-blue-300">
              Worker Server
            </div>
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="bg-purple-900/50 border border-purple-700/50 rounded-lg px-4 py-2 text-purple-300">
              WebSocket
            </div>
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="bg-green-900/50 border border-green-700/50 rounded-lg px-4 py-2 text-green-300">
              asyncio 事件循环
            </div>
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="bg-yellow-900/50 border border-yellow-700/50 rounded-lg px-4 py-2 text-yellow-300">
              tkinter 弹窗
            </div>
          </div>
          <div className="mt-4 text-center text-sm text-slate-400">
            弹窗关闭 → POST /api/read → 标记已读 → 等待下一条消息
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-12 py-6 text-center text-sm text-slate-500">
        <p>教室大屏通知接收程序 · Python + WebSocket + Tkinter</p>
        <p className="mt-1">使用 pythonw.exe 运行可隐藏控制台窗口</p>
      </footer>
    </div>
  );
}
