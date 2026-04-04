import type { WebSocket } from "bun"

const PORT = Number(process.env.PORT ?? 3000)
const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FAST P2P - 文件传输</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px}
    h1{color:#58a6ff;margin-bottom:4px}
    .sub{color:#8b949e;margin-bottom:24px;font-size:.9em}
    .panel{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;width:100%;max-width:400px;margin-bottom:16px}
    .status{display:flex;align-items:center;gap:8px;margin-bottom:16px}
    .dot{width:10px;height:10px;border-radius:50%;background:#484f58}
    .dot.online{background:#3fb950}
    .dot.waiting{background:#d29922;animation:pulse 1s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .room-code{font-size:2.2em;font-weight:bold;color:#58a6ff;letter-spacing:4px;font-family:monospace;text-align:center;margin:12px 0;word-break:break-all}
    .btn{width:100%;padding:12px;border:none;border-radius:6px;font-size:1em;cursor:pointer;transition:all .2s;margin-bottom:8px}
    .btn-primary{background:#238636;color:#fff}
    .btn-primary:hover{background:#2ea043}
    .btn-secondary{background:#21262d;color:#c9d1d9;border:1px solid #30363d}
    .btn-secondary:hover{background:#30363d}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .transfer-area{border:2px dashed #30363d;border-radius:8px;padding:32px;text-align:center;cursor:pointer;transition:all .2s;margin-top:8px}
    .transfer-area:hover{border-color:#58a6ff}
    .transfer-area.dragover{border-color:#58a6ff;background:rgba(88,166,255,.1)}
    .icon{font-size:3em;margin-bottom:8px}
    .hint{color:#8b949e;font-size:.9em;margin-top:8px}
    #fileInput{display:none}
    .progress-bar{height:8px;background:#21262d;border-radius:4px;overflow:hidden;margin-top:12px}
    .progress-fill{height:100%;background:#58a6ff;transition:width .3s;width:0}
    .progress-text{margin-top:6px;font-size:.85em;color:#8b949e;text-align:center}
    .file-list{margin-top:16px}
    .file-item{display:flex;align-items:center;gap:8px;padding:8px;background:#0d1117;border-radius:4px;margin-bottom:4px;font-size:.9em}
    .file-icon{font-size:1.1em}
    .file-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .file-size{color:#8b949e}
    .done{color:#3fb950}
    .input{width:100%;padding:10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#c9d1d9;font-size:1em;text-align:center;text-transform:uppercase;letter-spacing:2px}
    .scan-area{border:2px dashed #30363d;border-radius:8px;padding:16px;text-align:center;cursor:pointer;margin-bottom:12px}
    .scan-area:hover{border-color:#58a6ff}
    .hidden{display:none!important}
    .logs{margin-top:16px;max-height:100px;overflow-y:auto;width:100%;max-width:400px;font-family:monospace;font-size:.8em}
    .log{color:#8b949e;padding:2px 0}
    #qrcode{display:flex;justify-content:center;margin:12px 0}
    #qrcode canvas{border-radius:4px}
  </style>
</head>
<body>
  <h1>FAST P2P</h1>
  <p class="sub">快速安全的点对点文件传输</p>

  <div class="panel">
    <div class="status">
      <div class="dot" id="dot"></div>
      <span id="statusText">准备连接...</span>
    </div>
    <div id="roomInfo" class="hidden">
      <div style="text-align:center;color:#8b949e">房间码</div>
      <div class="room-code" id="roomCode"></div>
      <div id="qrcode"></div>
      <div class="hint" id="roomHint"></div>
    </div>
    <div id="joinArea">
      <div class="scan-area" id="scanBtn">
        <div class="icon">📷</div>
        <div>扫码加入房间</div>
        <div class="hint">或输入下方房间码</div>
      </div>
      <input class="input" id="manualCode" placeholder="输入房间码...">
      <button class="btn btn-primary" id="joinBtn">加入房间</button>
    </div>
    <button class="btn btn-secondary" id="createBtn">创建新房间</button>
  </div>

  <div class="panel hidden" id="sendPanel">
    <div class="transfer-area" id="dropZone">
      <div class="icon">📁</div>
      <div>点击或拖拽文件发送</div>
      <div class="hint">文件将加密后直传</div>
    </div>
    <input type="file" id="fileInput">
    <div id="sendProgress" class="hidden">
      <div class="progress-bar"><div class="progress-fill" id="sendFill"></div></div>
      <div class="progress-text" id="sendProgressText"></div>
    </div>
    <div class="file-list" id="sendList"></div>
  </div>

  <div class="panel hidden" id="recvPanel">
    <div style="text-align:center;padding:20px">
      <div class="icon">📥</div>
      <div style="margin-top:8px">等待接收文件...</div>
    </div>
    <div id="recvProgress" class="hidden">
      <div class="progress-bar"><div class="progress-fill" id="recvFill"></div></div>
      <div class="progress-text" id="recvProgressText"></div>
    </div>
    <div class="file-list" id="recvList"></div>
  </div>

  <div class="logs" id="logs"></div>

  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script>
    const RELAY_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host
    const CHUNK_SIZE = 32 * 1024

    let ws, room, peerId, peer, encKey, isCreator, isConn = false
    let pendingFile = null
    const sent = [], received = []

    const $ = id => document.getElementById(id)
    const dot = $('dot'), statusText = $('statusText')
    const roomInfo = $('roomInfo'), roomCodeEl = $('roomCode'), roomHint = $('roomHint')
    const joinArea = $('joinArea'), createBtn = $('createBtn'), joinBtn = $('joinBtn')
    const manualCode = $('manualCode'), sendPanel = $('sendPanel'), recvPanel = $('recvPanel')
    const dropZone = $('dropZone'), fileInput = $('fileInput')
    const sendFill = $('sendFill'), sendProgressText = $('sendProgressText')
    const recvFill = $('recvFill'), recvProgressText = $('recvProgressText')
    const logsEl = $('logs')

    function log(msg) {
      const t = new Date().toLocaleTimeString('en-US',{hour12:false})
      const e = document.createElement('div')
      e.className = 'log'
      e.textContent = t + ' ' + msg
      logsEl.prepend(e)
    }
    function setStatus(t, s = 'waiting') { statusText.textContent = t; dot.className = 'dot ' + s }
    function showRoom(code, hint) {
      roomCodeEl.textContent = code; roomHint.textContent = hint || '发送给接收方扫码'
      roomInfo.classList.remove('hidden'); joinArea.classList.add('hidden')
      QRCode.toCanvas(document.createElement('canvas'), location.origin + '?code=' + code, {width:180}, (err, c) => {
        if (!err) $('qrcode').appendChild(c)
      })
    }

    async function deriveKey(code) {
      const enc = new TextEncoder()
      const km = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits'])
      return new Uint8Array(await crypto.subtle.deriveBits(
        {name:'PBKDF2',salt:enc.encode('fastp2p-salt'),iterations:100000,hash:'SHA-256'}, km, 256))
    }
    async function encrypt(data, key) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, data)
      return {iv:btoa(String.fromCharCode(...iv)), data:btoa(String.fromCharCode(...new Uint8Array(ct)))}
    }
    async function decrypt(d, key) {
      const iv = new Uint8Array(atob(d.iv).split('').map(c=>c.charCodeAt(0)))
      const ct = new Uint8Array(atob(d.data).split('').map(c=>c.charCodeAt(0)))
      return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv}, key, ct))
    }

    function connect() {
      ws = new WebSocket(RELAY_URL)
      ws.onopen = () => { isConn = true; log('已连接'); if (room) ws.send(JSON.stringify({type:'join',room})) }
      ws.onclose = () => { isConn = false; log('连接断开'); setTimeout(connect, 2000) }
      ws.onerror = () => log('连接错误')
      ws.onmessage = async ev => {
        let msg
        try { msg = JSON.parse(ev.data) } catch { return }
        switch (msg.type) {
          case 'created':
            room = msg.room; peerId = msg.peerId; isCreator = true
            showRoom(room, '发给接收方扫码')
            setStatus('等待对方加入', 'waiting')
            break
          case 'joined':
            room = msg.room; peerId = msg.peerId; isCreator = false
            showRoom(room, '已加入，等待文件...')
            recvPanel.classList.remove('hidden')
            setStatus('已连接', 'online')
            break
          case 'peer_joined':
            peer = msg.peerId; log('对方已加入')
            setStatus('对等方已连接', 'online')
            sendPanel.classList.remove('hidden')
            break
          case 'peer_leave':
            peer = null; log('对方已离开')
            setStatus('等待对方加入', 'waiting')
            recvPanel.classList.remove('hidden')
            break
          case 'relay':
            if (!encKey) return
            try {
              const chunk = await decrypt(msg.data, encKey)
              if (!pendingFile && msg.data._meta) {
                pendingFile = {name:msg.data._meta.name, size:msg.data._meta.size, total:msg.data._meta.total, received:0, chunks:[]}
              }
              pendingFile.chunks[msg.data.index] = chunk
              pendingFile.received++
              const pct = Math.round(pendingFile.received/pendingFile.total*100)
              recvFill.style.width = pct+'%'
              recvProgressText.textContent = pct+'% - '+pendingFile.name
              recvProgress.classList.remove('hidden')
              if (pendingFile.received === pendingFile.total) {
                const blob = new Blob(pendingFile.chunks)
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = pendingFile.name; a.click()
                URL.revokeObjectURL(a.href)
                log('收到: '+pendingFile.name)
                addFile(received, pendingFile.name, pendingFile.size, 'done', $('recvList'))
                pendingFile = null
                recvProgress.classList.add('hidden')
              }
            } catch(e) { log('解密错误') }
            break
          case 'done': log('传输完成'); break
          case 'error': log('错误: '+msg.message); break
        }
      }
    }

    async function sendFile(file) {
      if (!peer) { log('等待对等方连接...'); return }
      const total = Math.ceil(file.size / CHUNK_SIZE)
      let sent = 0
      const buf = await file.arrayBuffer()
      const start = Date.now()
      addFile(sent, file.name, file.size, 'transferring', $('sendList'))
      sendFill.parentElement.parentElement.classList.remove('hidden')
      for (let offset = 0, idx = 0; offset < buf.byteLength; offset += CHUNK_SIZE, idx++) {
        const chunk = buf.slice(offset, Math.min(offset+CHUNK_SIZE, buf.byteLength))
        const enc = await encrypt(chunk, encKey)
        ws.send(JSON.stringify({type:'relay', data:{...enc, index:idx, total, _meta: idx===0?{name:file.name,size:file.size,total}:null}}))
        sent++
        const pct = Math.round(sent/total*100)
        sendFill.style.width = pct+'%'
        sendProgressText.textContent = pct+'% - '+file.name
        await new Promise(r => setTimeout(r, 5))
      }
      ws.send(JSON.stringify({type:'done'}))
      addFile(sent, file.name, file.size, 'done', $('sendList'))
      sendFill.parentElement.parentElement.classList.add('hidden')
      log('已发送: '+file.name)
    }

    function addFile(arr, name, size, status, el) {
      arr.unshift({name, size, status})
      el.innerHTML = arr.map(f => '<div class="file-item"><span class="file-icon">'+(f.status==='done'?'✓':'...')+'</span><span class="file-name">'+f.name+'</span><span class="file-size">'+(size<1024?size+'B':size<1048576?(size/1024).toFixed(1)+'KB':(size/1048576).toFixed(1)+'MB')+'</span></div>').join('')
    }

    createBtn.onclick = () => { if (!isConn) return; ws.send(JSON.stringify({type:'create'})); createBtn.disabled = true }
    joinBtn.onclick = async () => {
      const code = manualCode.value.trim().toUpperCase()
      if (!code) return
      room = code
      encKey = await deriveKey(code)
      if (isConn) ws.send(JSON.stringify({type:'join', room}))
      joinBtn.disabled = true
    }
    dropZone.onclick = () => fileInput.click()
    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('dragover') }
    dropZone.ondragleave = () => dropZone.classList.remove('dragover')
    dropZone.ondrop = e => { e.preventDefault(); dropZone.classList.remove('dragover'); if(e.dataTransfer.files[0]) sendFile(e.dataTransfer.files[0]) }
    fileInput.onchange = () => { if(fileInput.files[0]) sendFile(fileInput.files[0]) }

    const initCode = new URLSearchParams(location.search).get('code')
    if (initCode) {
      room = initCode.toUpperCase(); manualCode.value = room
      deriveKey(initCode).then(k => { encKey = k; connect() })
      joinBtn.disabled = false
    }

    connect()
  </script>
</body>
</html>`

interface Room {
  creator: WebSocket
  joiner: WebSocket | null
  created: number
}

const rooms = new Map<string, Room>()

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function broadcast(room: Room, exclude: WebSocket, msg: string) {
  if (room.creator !== exclude) room.creator.send(msg)
  if (room.joiner && room.joiner !== exclude) room.joiner.send(msg)
}

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML, { headers: { "Content-Type": "text/html" } })
    }

    const success = server.upgrade(req, { data: {} })
    if (success) return undefined
    return new Response("WebSocket upgrade failed", { status: 500 })
  },

  websocket: {
    open(ws: WebSocket) {
      let roomCode: string | undefined
      let peerId: string | undefined

      ws.on("message", (data: string | Buffer) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(data.toString())
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }))
          return
        }

        switch (msg.type) {
          case "create": {
            roomCode = genCode()
            peerId = genCode(4)
            rooms.set(roomCode, { creator: ws, joiner: null, created: Date.now() })
            ws.send(JSON.stringify({ type: "created", room: roomCode, peerId }))
            console.log(`[Room ${roomCode}] Created`)
            break
          }
          case "join": {
            const room = rooms.get(msg.room as string)
            if (!room) {
              ws.send(JSON.stringify({ type: "error", message: "Room not found" }))
              return
            }
            if (room.joiner) {
              ws.send(JSON.stringify({ type: "error", message: "Room full" }))
              return
            }
            roomCode = msg.room as string
            peerId = genCode(4)
            room.joiner = ws
            ws.send(JSON.stringify({ type: "joined", room: roomCode, peerId }))
            room.creator.send(JSON.stringify({ type: "peer_joined", peerId }))
            console.log(`[Room ${roomCode}] Joined`)
            break
          }
          case "relay": {
            if (!roomCode) return
            const room = rooms.get(roomCode)
            if (!room) return
            broadcast(room, ws, JSON.stringify({ type: "relay", from: peerId, data: msg.data }))
            break
          }
          case "done": {
            if (!roomCode) return
            const room = rooms.get(roomCode)
            if (!room) return
            broadcast(room, ws, JSON.stringify({ type: "done", from: peerId }))
            break
          }
          case "leave": {
            if (!roomCode) return
            const room = rooms.get(roomCode)
            if (!room) return
            broadcast(room, ws, JSON.stringify({ type: "peer_leave", from: peerId }))
            if (room.creator === ws) {
              room.joiner?.close()
              rooms.delete(roomCode)
            } else {
              room.joiner = null
            }
            roomCode = undefined
            peerId = undefined
            break
          }
        }
      })

      ws.on("close", () => {
        if (!roomCode) return
        const room = rooms.get(roomCode)
        if (!room) return
        if (room.creator === ws) {
          room.joiner?.close()
          rooms.delete(roomCode)
          console.log(`[Room ${roomCode}] Creator left`)
        } else {
          room.joiner = null
          room.creator.send(JSON.stringify({ type: "peer_leave" }))
          console.log(`[Room ${roomCode}] Joiner left`)
        }
      })
    },
  },
})

console.log(`[FAST P2P] Server running at http://0.0.0.0:${PORT}`)
console.log(`[FAST P2P] WebSocket ready at ws://0.0.0.0:${PORT}`)
