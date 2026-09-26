# -*- coding: utf-8 -*-
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
        pass
