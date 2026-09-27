import { useEffect, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-python";

const CODE = `# -*- coding: utf-8 -*-
"""
教室大屏通知接收程序
用法: pythonw.exe receiver.py
依赖: pip install websockets requests
"""

import asyncio
import json
import threading
import tkinter as tk
import requests
import websockets

# ============ 配置 ============
WORKER = "https://你的worker地址"
WS_URL = WORKER.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"
API    = WORKER
# ==============================

DISPLAY_SEC  = 8
RECONNECT_SEC = 5


# ---------- 网络请求 ----------

def mark_read(msg_id: str):
    try:
        requests.post(f"{API}/api/read", json={"id": msg_id}, timeout=10)
    except Exception:
        pass


def get_unread() -> list:
    try:
        r = requests.get(f"{API}/api/unread", timeout=10)
        if r.status_code == 200:
            data = r.json()
            return data if isinstance(data, list) else data.get("messages", data.get("data", []))
    except Exception:
        pass
    return []


# ---------- 弹窗 ----------

def show_popup(msg_id: str, content: str):
    """在独立线程中弹出置顶窗口"""
    def _run():
        root = tk.Tk()
        root.title("通知")
        root.configure(bg="#ffffff")
        root.overrideredirect(False)

        W, H = 600, 300
        sx = root.winfo_screenwidth()
        sy = root.winfo_screenheight()
        root.geometry(f"{W}x{H}+{(sx - W) // 2}+{(sy - H) // 2}")
        root.resizable(False, False)
        root.attributes("-topmost", True)

        # 标题
        tk.Label(
            root, text="📢 通知", font=("Microsoft YaHei", 18, "bold"),
            bg="#ffffff", fg="#1a1a1a"
        ).pack(pady=(25, 10))

        # 分隔线
        tk.Frame(root, height=1, bg="#e0e0e0").pack(fill="x", padx=40)

        # 内容
        tk.Label(
            root, text=content, font=("Microsoft YaHei", 16),
            bg="#ffffff", fg="#333333", wraplength=520, justify="center"
        ).pack(fill="both", expand=True, padx=30, pady=15)

        # 倒计时
        remaining = [DISPLAY_SEC]
        cd_var = tk.StringVar(value=f"{remaining[0]}s 后自动关闭")
        tk.Label(
            root, textvariable=cd_var, font=("Microsoft YaHei", 10),
            bg="#ffffff", fg="#aaaaaa"
        ).pack(pady=(0, 5))

        def close():
            mark_read(msg_id)
            try:
                root.after_cancel(timer[0])
            except Exception:
                pass
            root.destroy()

        # 按钮
        tk.Button(
            root, text="知道了", font=("Microsoft YaHei", 13, "bold"),
            bg="#4CAF50", fg="white", activebackground="#45a049",
            relief="flat", padx=30, pady=6, cursor="hand2", command=close
        ).pack(pady=(0, 10))

        def tick():
            remaining[0] -= 1
            if remaining[0] <= 0:
                close()
            else:
                cd_var.set(f"{remaining[0]}s 后自动关闭")
                timer[0] = root.after(1000, tick)

        timer = [root.after(1000, tick)]
        root.protocol("WM_DELETE_WINDOW", close)
        root.mainloop()

    threading.Thread(target=_run, daemon=True).start()


# ---------- WebSocket ----------

async def on_message(raw: str):
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"id": "", "content": raw}

    msg_id  = data.get("id", "") or f"msg_{id(data)}"
    content = data.get("content") or data.get("message") or data.get("text") or str(data)
    show_popup(msg_id, content)


async def ws_loop():
    """WebSocket 主循环，断线自动重连"""
    while True:
        try:
            async with websockets.connect(WS_URL, ping_interval=30, ping_timeout=10) as ws:
                async for msg in ws:
                    await on_message(msg)
        except Exception:
            pass
        await asyncio.sleep(RECONNECT_SEC)


# ---------- 入口 ----------

async def main():
    # 启动时检查未读
    for msg in get_unread():
        if isinstance(msg, dict):
            await on_message(json.dumps(msg))
        else:
            await on_message(json.dumps({"id": "", "content": str(msg)}))

    # 进入 WebSocket 长连接
    await ws_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass`;

export default function App() {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) Prism.highlightElement(codeRef.current);
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([CODE], { type: "text/x-python;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "receiver.py";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100 font-sans">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0f1117]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-lg font-bold shadow-lg shadow-emerald-500/20">
              📢
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">receiver.py</h1>
              <p className="text-xs text-gray-500">教室大屏通知接收 · WebSocket + Tkinter</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm transition-all flex items-center gap-2"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-400">已复制</span>
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
              onClick={download}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载 receiver.py
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8 space-y-6">
        {/* Quick Start */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-400 text-lg">①</span>
              <span className="font-semibold text-sm">安装依赖</span>
            </div>
            <code className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded block">
              pip install websockets requests
            </code>
          </div>
          <div className="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-400 text-lg">②</span>
              <span className="font-semibold text-sm">修改地址</span>
            </div>
            <code className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded block truncate">
              WORKER = "https://你的worker地址"
            </code>
          </div>
          <div className="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-400 text-lg">③</span>
              <span className="font-semibold text-sm">运行</span>
            </div>
            <code className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded block">
              pythonw.exe receiver.py
            </code>
          </div>
        </div>

        {/* Feature Summary */}
        <div className="rounded-xl bg-gray-800/30 border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">功能清单</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { icon: "🔌", label: "WebSocket 长连接" },
              { icon: "🔄", label: "断线 5s 自动重连" },
              { icon: "🪟", label: "600×300 置顶弹窗" },
              { icon: "⏱️", label: "8s 自动关闭" },
              { icon: "✅", label: "关闭即标记已读" },
              { icon: "📋", label: "启动检查未读" },
              { icon: "🖥️", label: "pythonw 无窗口" },
              { icon: "📍", label: "屏幕居中显示" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-gray-400">
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Code Block */}
        <div className="rounded-xl overflow-hidden border border-gray-800 bg-[#1e1e2e] shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/60 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-gray-500 ml-2 font-mono">receiver.py</span>
            </div>
            <button
              onClick={copy}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              {copied ? "✓ 已复制" : "复制"}
            </button>
          </div>
          <div className="overflow-auto max-h-[75vh]">
            <pre className="p-5 text-[13px] leading-relaxed">
              <code ref={codeRef} className="language-python">
                {CODE}
              </code>
            </pre>
          </div>
        </div>

        {/* API Table */}
        <div className="rounded-xl bg-gray-800/30 border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">API 接口</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase">
                <th className="px-5 py-2.5">端点</th>
                <th className="px-5 py-2.5">方法</th>
                <th className="px-5 py-2.5">用途</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              <tr>
                <td className="px-5 py-3 font-mono text-xs text-cyan-400">/api/websocket</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 text-xs">WS</span></td>
                <td className="px-5 py-3 text-gray-400">实时推送通知</td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-mono text-xs text-cyan-400">/api/unread</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-green-900/40 text-green-300 text-xs">GET</span></td>
                <td className="px-5 py-3 text-gray-400">启动时拉取未读消息</td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-mono text-xs text-cyan-400">/api/read</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 text-xs">POST</span></td>
                <td className="px-5 py-3 text-gray-400">弹窗关闭时标记已读 {"{"} id {"}"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Message Format */}
        <div className="rounded-xl bg-gray-800/30 border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">消息格式</h2>
          <pre className="bg-gray-900 rounded-lg p-4 text-sm font-mono text-gray-300 overflow-x-auto">
{`{
  "id": "msg_001",
  "content": "明天下午2点在报告厅召开全体教师会议"
}`}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            支持 content / message / text 字段，id 可选（缺失时自动生成）。
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-12 py-5 text-center text-xs text-gray-600">
        receiver.py · Python 3.8+ · websockets + tkinter + requests
      </footer>
    </div>
  );
}
