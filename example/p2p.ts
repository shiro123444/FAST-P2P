import { RGBA, h, createTUI } from "../src"
import QRCode from "qrcode"
import { P2PSwarm } from "../src/p2p/swarm"
import { sendFile, handleIncomingTransfer } from "../src/p2p/transfer"
import type { TransferInfo, Message } from "../src/p2p/protocol"
import { RelayClient } from "../src/p2p/relay-client"
import { deriveKey, encryptChunk, decryptChunk } from "../src/p2p/crypto"
import fs from "fs"
import path from "path"
import os from "os"
import crypto from "crypto"
import { execSync } from "child_process"

// Opencode theme - exact colors from opencode.json
const theme = {
  bg: RGBA.fromHex("#0a0a0a"),
  panel: RGBA.fromHex("#141414"),
  element: RGBA.fromHex("#1e1e1e"),
  border: RGBA.fromHex("#484848"),
  borderActive: RGBA.fromHex("#606060"),
  borderSubtle: RGBA.fromHex("#3c3c3c"),
  primary: RGBA.fromHex("#fab283"),
  secondary: RGBA.fromHex("#5c9cf5"),
  success: RGBA.fromHex("#7fd88f"),
  warning: RGBA.fromHex("#f5a742"),
  error: RGBA.fromHex("#e06c75"),
  text: RGBA.fromHex("#eeeeee"),
  textMuted: RGBA.fromHex("#808080"),
  accent: RGBA.fromHex("#9d7cd8"),
}

const logoLines = [
  "██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗",
  "██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║",
  "██████╔╝██████╔╝█████╗  ███████║██║     ███████║",
  "██╔═══╝ ██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║",
  "██║     ██║  ██║███████╗██║  ██║╚██████╗██║  ██║",
  "╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝",
]

type SlashCommand = {
  name: string
  usage: string
  description: string
}

const slashCommands: SlashCommand[] = [
  { name: "connect", usage: "/connect", description: "Start LAN server with QR code" },
  { name: "lsend", usage: "/lsend <file>", description: "Send file to connected phone" },
  { name: "transfer", usage: "/transfer <file>", description: "Send file to peer via swarm" },
  { name: "rcreate", usage: "/rcreate", description: "Create relay room" },
  { name: "rjoin", usage: "/rjoin <room> [key]", description: "Join relay room" },
  { name: "rsend", usage: "/rsend <file>", description: "Send file via relay" },
  { name: "rstatus", usage: "/rstatus", description: "Show relay status" },
  { name: "rleave", usage: "/rleave", description: "Leave relay room" },
  { name: "help", usage: "/help", description: "Show commands" },
  { name: "quit", usage: "/quit", description: "Exit" },
]

const commandsNeedArg = new Set(["transfer", "rjoin", "rsend", "lsend"])

let inputValue = ""
let commandCursor = 0
let selectedPeer = 0
let tick = 0
let lastRerender = 0
const RERENDER_THROTTLE = 150

function throttledRerender() {
  const now = Date.now()
  if (now - lastRerender >= RERENDER_THROTTLE) {
    lastRerender = now
    rerender()
  }
}

const logs: string[] = []
const transfers: Map<string, TransferInfo> = new Map()
const receivedFiles: { name: string; path: string; size: number; time: number }[] = []

let swarm: P2PSwarm | null = null
let swarmReady = false
let quitting = false

let relay: RelayClient | null = null
let relayRoom: string | null = null
let relayKey: string | null = null
let relayPeer: string | null = null
const RELAY_URL = process.env.RELAY_URL ?? "ws://localhost:3000"

let lanServer: { stop: () => void } | null = null
let lanServerPort = 3001
let lanPeerConnected = false
let lanPeerWs: any = null
let qrLines: string[] = []
let qrLoading = false
let qrDismissed = false

let pendingRelayTransfer: {
  filePath: string
  id: string
  key: Buffer
  ws: fs.WriteStream
  receivedChunks: number
  totalChunks: number
  startTime: number
  bytesReceived: number
} | null = null

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function log(msg: string) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })
  logs.push(`${time} ${msg}`)
  if (logs.length > 100) logs.shift()
  rerender()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

function getLocalIP(): string {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address
    }
  }
  return "127.0.0.1"
}

function genCode(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function generateQRCode(text: string): Promise<string[]> {
  try {
    const seg = await QRCode.create(text, { errorCorrectionLevel: "M" })
    const size = seg.modules.size
    const modules = seg.modules.data
    const lines: string[] = []
    for (let y = 0; y < size; y += 2) {
      let line = ""
      for (let x = 0; x < size; x++) {
        const top = modules[y * size + x] === 1
        const bot = y + 1 < size && modules[(y + 1) * size + x] === 1
        if (top && bot) line += "█"
        else if (top && !bot) line += "▀"
        else if (!top && bot) line += "▄"
        else line += " "
      }
      lines.push(line)
    }
    return lines
  } catch {
    return ["[QR generation failed]", text, ""]
  }
}

function progressBar(progress: number, width: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * width)
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`
}

function getSlashSuggestions(input: string): SlashCommand[] {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith("/")) return []
  const token = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? ""
  if (!token) return slashCommands
  return slashCommands.filter((c) => c.name.startsWith(token))
}

function clampCommandCursor(max: number) {
  commandCursor = max <= 0 ? 0 : Math.max(0, Math.min(commandCursor, max - 1))
}

function completeFromSuggestion() {
  const suggestions = getSlashSuggestions(inputValue)
  if (suggestions.length === 0) return
  clampCommandCursor(suggestions.length)
  inputValue = `/${suggestions[commandCursor].name} `
}

function isCommandPaletteActive(input: string): boolean {
  const trimmed = input.trimStart()
  return trimmed.startsWith("/") && !trimmed.includes(" ")
}

function executeSelectedSuggestion(): boolean {
  if (!isCommandPaletteActive(inputValue)) return false
  const suggestions = getSlashSuggestions(inputValue)
  if (suggestions.length === 0) return false
  clampCommandCursor(suggestions.length)
  const picked = suggestions[commandCursor]
  if (commandsNeedArg.has(picked.name)) {
    inputValue = `/${picked.name} `
    commandCursor = 0
    return true
  }
  const command = `/${picked.name}`
  inputValue = ""
  commandCursor = 0
  void runCommand(command)
  return true
}

function pickFile(): string | null {
  try {
    const result = execSync(`osascript -e 'POSIX path of (choose file with prompt "Select file to send:")' 2>/dev/null`)
      .toString()
      .trim()
    return result || null
  } catch {
    try {
      const result = execSync('zenity --file-selection --title="Select file to send" 2>/dev/null').toString().trim()
      return result || null
    } catch {
      try {
        const result = execSync("kdialog --getopenfilename 2>/dev/null").toString().trim()
        return result || null
      } catch {
        return null
      }
    }
  }
}

function openFile(filePath: string) {
  try {
    if (process.platform === "darwin") execSync(`open "${filePath}"`)
    else if (process.platform === "win32") execSync(`start "" "${filePath}"`)
    else execSync(`xdg-open "${filePath}" 2>/dev/null`)
  } catch {
    log(`Failed to open: ${filePath}`)
  }
}

const tui = createTUI({ targetFps: 10, exitOnCtrlC: true })
tui.start()
tui.setBackground(theme.bg)

const motionTimer = setInterval(() => {
  if (quitting) return
  tick = (tick + 1) % 240
  rerender()
}, 240)

function rerender() {
  tui.renderElement(App())
}

async function initSwarm() {
  swarm = new P2PSwarm()
  await swarm.init()
  swarmReady = true
  log("Swarm initialized")
  swarm.on("peer-join", (_peerId: string, peer) => {
    log(`${peer.name} connected`)
    selectedPeer = Math.min(selectedPeer, Math.max(0, swarm!.getPeers().size - 1))
    rerender()
  })
  swarm.on("peer-leave", (peerId: string) => {
    log(`Peer ${peerId.slice(0, 6)} disconnected`)
    selectedPeer = Math.min(selectedPeer, Math.max(0, swarm!.getPeers().size - 1))
    rerender()
  })
  swarm.on("message", (peerId: string, msg: Message) => {
    if (msg.type === "offer") {
      log(`Incoming: ${msg.filename} (${formatBytes(msg.size)})`)
      const savePath = path.join(os.homedir(), "Downloads")
      const transfer = handleIncomingTransfer(swarm!, peerId, msg, savePath, (t) => {
        transfers.set(t.id, { ...t })
        throttledRerender()
      })
      transfers.set(transfer.id, transfer)
      rerender()
    }
  })
  rerender()
}

initSwarm().catch((err: unknown) => log(`Swarm error: ${getErrorMessage(err)}`))

async function shutdown(exitCode = 0) {
  if (quitting) return
  quitting = true
  clearInterval(motionTimer)
  try {
    await swarm?.destroy()
  } catch {}
  tui.stop(exitCode)
}

async function runCommand(raw: string) {
  const text = raw.trim()
  if (!text) return
  if (!text.startsWith("/")) {
    log("Use / for commands. Try /help")
    return
  }
  const [head, ...rest] = text.slice(1).split(/\s+/)
  const command = head.toLowerCase()
  const arg = rest.join(" ")

  if (command === "connect") {
    if (lanServer) {
      log("Already in LAN mode. Press Esc to stop.")
      return
    }
    const ip = getLocalIP()
    lanServerPort = 3001
    const connectUrl = `http://${ip}:${lanServerPort}`
    const rooms = new Map<string, { creator: any; ws: any }>()
    const roomCode = genCode()
    let lanRecvFile: {
      name: string
      size: number
      chunks: string[]
      total: number
      received: number
      ws: fs.WriteStream
    } | null = null

    rooms.set(roomCode, {
      creator: {
        send: () => {},
        close: () => {},
        onMessage: (msg: any) => {
          if (msg.type === "file_start") {
            const downloadDir = path.join(os.homedir(), "Downloads")
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })
            const savePath = path.join(downloadDir, msg.filename)
            lanRecvFile = {
              name: msg.filename,
              size: msg.size,
              chunks: [],
              total: msg.total,
              received: 0,
              ws: fs.createWriteStream(savePath),
            }
            log(`Incoming file: ${msg.filename} (${formatBytes(msg.size)})`)
            rerender()
          } else if (msg.type === "file_chunk") {
            if (!lanRecvFile) return
            lanRecvFile.chunks[msg.index] = msg.data
            lanRecvFile.received++
            lanRecvFile.ws.write(Buffer.from(msg.data, "base64"))
            if (lanRecvFile.received % 20 === 0 || lanRecvFile.received === lanRecvFile.total) throttledRerender()
          } else if (msg.type === "file_done") {
            if (!lanRecvFile) return
            const f = lanRecvFile
            const savedPath = String(f.ws.path)
            receivedFiles.unshift({ name: path.basename(savedPath), path: savedPath, size: f.total, time: Date.now() })
            if (receivedFiles.length > 20) receivedFiles.pop()
            f.ws.end(() => {
              log("✓ Received: " + path.basename(savedPath))
              lanRecvFile = null
              rerender()
            })
          }
        },
      },
      ws: null,
    })

    const lanHtml = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FAST P2P</title>',
      "<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#eee;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}h1{color:#fab283;margin-bottom:8px;font-size:1.5em}.panel{background:#141414;border:1px solid #484848;border-radius:12px;padding:24px;width:100%;max-width:360px;text-align:center}.btn{padding:14px 28px;border:none;border-radius:8px;font-size:1em;cursor:pointer;margin:8px 0;width:100%;font-weight:500;background:#7fd88f;color:#0a0a0a}.status{margin:16px 0;font-size:1.1em}.ok{color:#7fd88f}.err{color:#e06c75}.wait{color:#f5a742}.info{color:#5c9cf5;font-size:.9em;margin:12px 0}.result{margin:12px 0;padding:12px;border-radius:6px;font-weight:500}.result.ok{background:#7fd88f;color:#0a0a0a}.result.err{background:#e06c75;color:#fff}.hint{color:#808080;font-size:.85em;margin-top:16px}#fileInput{display:none}.progress{margin:16px 0}.pbar{background:#1e1e1e;border-radius:4px;height:8px;overflow:hidden}.pfill{height:100%;background:#fab283;width:0%;transition:width .2s}.ptxt{margin-top:8px;font-size:.85em;color:#808080}</style></head>",
      '<body><div class="panel"><h1>FAST P2P</h1><div id="status" class="status wait">Connecting...</div><div id="info" class="info"></div>',
      '<div id="sendArea" style="display:none"><button class="btn" onclick="pickFile()">Select File to Send</button><input type="file" id="fileInput"><p class="hint">Or wait to receive from terminal</p></div>',
      '<div id="progress" class="progress" style="display:none"><div class="pbar"><div id="bar" class="pfill"></div></div><div id="pct" class="ptxt">0%</div></div>',
      '<div id="result" class="result" style="display:none"></div></div>',
      "<script>",
      "var ws,pf,rt,sending=0;",
      "function ss(m,c){var s=document.getElementById('status');s.textContent=m;s.className='status '+c}",
      "function si(m){document.getElementById('info').textContent=m}",
      "function sr(m,ok){var r=document.getElementById('result');r.style.display='block';r.className='result '+(ok?'ok':'err');r.textContent=m;setTimeout(function(){r.style.display='none'},4000)}",
      "function sp(p){document.getElementById('progress').style.display='block';document.getElementById('bar').style.width=p+'%';document.getElementById('pct').textContent=p+'%'}",
      "function hp(){document.getElementById('progress').style.display='none'}",
      "function connect(){ws=new WebSocket('ws://'+location.host+'/" + roomCode + "');",
      "ws.onopen=function(){clearTimeout(rt);ss('Connected','ok');document.getElementById('sendArea').style.display='block'};",
      "ws.onclose=function(){ss('Reconnecting...','wait');document.getElementById('sendArea').style.display='none';rt=setTimeout(connect,1500)};",
      "ws.onerror=function(){};",
      "ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='file_start'){pf={name:m.filename,size:m.size,total:m.total,received:0,chunks:[]};si('Receiving: '+m.filename);sp(0)}else if(m.type==='file_chunk'){if(!pf)return;pf.chunks[m.index]=m.data;pf.received++;var p=Math.round(pf.received/pf.total*100);sp(p);if(pf.received===pf.total){var b=new Blob(pf.chunks.map(function(d){return Uint8Array.from(atob(d),function(c){return c.charCodeAt(0)})}));var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=pf.name;a.click();URL.revokeObjectURL(a.href);hp();sr('Downloaded: '+pf.name,1);si('');pf=null}}else if(m.type==='file_done'){hp()}}catch(err){}}}",
      "function pickFile(){document.getElementById('fileInput').click()}",
      "document.getElementById('fileInput').onchange=function(e){var f=e.target.files[0];if(!f||sending)return;sending=1;var C=32*1024,t=Math.ceil(f.size/C);si('Sending: '+f.name);sp(0);ws.send(JSON.stringify({type:'file_start',filename:f.name,size:f.size,total:t}));f.arrayBuffer().then(function(b){var i=0;function next(){if(i>=t){ws.send(JSON.stringify({type:'file_done'}));hp();sr('Sent: '+f.name,1);si('');sending=0;e.target.value='';return}var chunk=new Uint8Array(b.slice(i*C,(i+1)*C));var arr=[];for(var j=0;j<chunk.length;j++)arr.push(String.fromCharCode(chunk[j]));ws.send(JSON.stringify({type:'file_chunk',index:i,total:t,data:btoa(arr.join(''))}));sp(Math.round((i+1)/t*100));i++;setTimeout(next,5)}next()})};",
      "connect()</script></body></html>",
    ].join("")

    try {
      const server = Bun.serve({
        port: lanServerPort,
        fetch(req, srv) {
          const url = new URL(req.url)
          if (url.pathname === "/health") return new Response("OK")
          if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            const roomCodeFromPath = url.pathname.slice(1) || "room"
            if (srv.upgrade(req, { data: { room: roomCodeFromPath } })) return undefined
          }
          return new Response(lanHtml, { headers: { "Content-Type": "text/html" } })
        },
        websocket: {
          open(ws: any) {
            const room = rooms.get(ws.data.room)
            if (room && !room.ws) {
              room.ws = ws
              lanPeerWs = ws
              lanPeerConnected = true
              qrDismissed = true
              log("Peer connected via LAN!")
              rerender()
            }
            rerender()
          },
          message(ws: any, data: any) {
            const room = rooms.get(ws.data.room)
            if (!room) return
            const str = typeof data === "string" ? data : data.toString()
            const target = ws === room.creator ? room.ws : room.creator
            if (target) target.send(str)
            if (ws === room.ws && room.creator?.onMessage) {
              try {
                room.creator.onMessage(JSON.parse(str))
              } catch {}
            }
            rerender()
          },
          close(ws: any) {
            const room = rooms.get(ws.data.room)
            if (room) {
              if (room.creator === ws) {
                room.ws?.close()
                rooms.delete(ws.data.room)
              } else {
                room.ws = null
                lanPeerWs = null
                lanPeerConnected = false
                qrDismissed = false
              }
            }
            rerender()
          },
        },
      })
      lanServer = { stop: () => server.stop() }
      qrLoading = true
      qrLines = []
      qrDismissed = false
      log("LAN server started at " + connectUrl)
      log("Scan QR code with your phone...")
      generateQRCode(connectUrl)
        .then((lines) => {
          qrLines = lines
          qrLoading = false
          rerender()
        })
        .catch((err) => {
          qrLines = ["[QR Error]", err.message]
          qrLoading = false
          rerender()
        })
      rerender()
    } catch (err: unknown) {
      log(`LAN server failed: ${getErrorMessage(err)}`)
    }
    return
  }

  if (command === "lsend") {
    if (!lanPeerConnected || !lanPeerWs) {
      log("No LAN peer connected. Use /connect first.")
      return
    }
    let filePath = arg
    if (!filePath) {
      const picked = pickFile()
      if (!picked) {
        log("No file selected")
        return
      }
      filePath = picked
    }
    const absPath = path.resolve(filePath)
    if (!fs.existsSync(absPath)) {
      log(`File not found: ${absPath}`)
      return
    }
    const stat = fs.statSync(absPath)
    const filename = path.basename(absPath)
    const CHUNK = 32 * 1024
    const total = Math.ceil(stat.size / CHUNK)
    log(`Sending ${filename} to phone...`)
    lanPeerWs.send(JSON.stringify({ type: "file_start", filename, size: stat.size, total }))
    const stream = fs.createReadStream(absPath, { highWaterMark: CHUNK })
    let index = 0
    stream.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      lanPeerWs.send(JSON.stringify({ type: "file_chunk", index, total, data: buf.toString("base64") }))
      index++
      if (index % 10 === 0 || index === total) log(`Sending: ${Math.round((index / total) * 100)}%`)
    })
    stream.on("end", () => {
      lanPeerWs.send(JSON.stringify({ type: "file_done" }))
      log(`Sent ${filename}!`)
      rerender()
    })
    stream.on("error", (err) => {
      log(`Send error: ${err.message}`)
    })
    return
  }

  if (command === "transfer" || command === "send") {
    if (!arg) {
      log("Usage: /transfer <file>")
      return
    }
    const absPath = path.resolve(arg)
    if (!fs.existsSync(absPath)) {
      log(`File not found: ${absPath}`)
      return
    }
    if (!swarm) {
      log("Swarm not ready")
      return
    }
    const peers = Array.from(swarm.getPeers().entries())
    if (peers.length === 0) {
      log("No peers connected")
      return
    }
    const [peerId] = peers[Math.min(selectedPeer, peers.length - 1)]
    log(`Transferring ${path.basename(absPath)}...`)
    sendFile(swarm, peerId, absPath, (t) => {
      transfers.set(t.id, { ...t })
      throttledRerender()
    }).catch((err: unknown) => {
      log(`Transfer failed: ${getErrorMessage(err)}`)
    })
    return
  }

  if (command === "rcreate") {
    if (relay) {
      log("Already in relay room. Use /rleave first.")
      return
    }
    relay = new RelayClient()
    relay.on("peer-join", (peerId) => {
      relayPeer = peerId
      log(`Peer ${peerId} joined!`)
      rerender()
    })
    relay.on("peer-leave", () => {
      relayPeer = null
      log("Peer left")
      rerender()
    })
    relay.on("message", (chunk, _index, _total) => {
      if (!pendingRelayTransfer) return
      const decrypted = decryptChunk(chunk, pendingRelayTransfer.key)
      pendingRelayTransfer.ws.write(decrypted)
      pendingRelayTransfer.receivedChunks++
      pendingRelayTransfer.bytesReceived += decrypted.length
      const elapsed = (Date.now() - pendingRelayTransfer.startTime) / 1000
      const progress = pendingRelayTransfer.receivedChunks / pendingRelayTransfer.totalChunks
      transfers.set(pendingRelayTransfer.id, {
        id: pendingRelayTransfer.id,
        filename: path.basename(pendingRelayTransfer.filePath),
        size: fs.statSync(pendingRelayTransfer.filePath).size,
        hash: "",
        progress,
        speed: elapsed > 0 ? pendingRelayTransfer.bytesReceived / elapsed : 0,
        status: progress >= 1 ? "done" : "transferring",
        direction: "receive",
      })
      throttledRerender()
    })
    relay.on("done", (hash) => {
      if (pendingRelayTransfer) {
        pendingRelayTransfer.ws.end()
        transfers.set(pendingRelayTransfer.id, {
          id: pendingRelayTransfer.id,
          filename: path.basename(pendingRelayTransfer.filePath),
          size: fs.statSync(pendingRelayTransfer.filePath).size,
          hash,
          progress: 1,
          speed: 0,
          status: "done",
          direction: "receive",
        })
        pendingRelayTransfer = null
        log("Relay transfer complete!")
        rerender()
      }
    })
    relay.on("error", (err) => {
      log(`Relay error: ${err.message}`)
    })
    relay
      .connect(RELAY_URL)
      .then(() => {
        relay!.createRoom()
        const checkCreated = setInterval(() => {
          if (relay!.roomCode) {
            relayRoom = relay!.roomCode
            relayKey = relayRoom
            clearInterval(checkCreated)
            log(`Relay room created: ${relayRoom}`)
            log(`Share this code + key with your peer`)
            rerender()
          }
        }, 100)
      })
      .catch((err) => {
        log(`Failed to connect to relay: ${err.message}`)
        relay = null
      })
    log("Connecting to relay server...")
    return
  }

  if (command === "rjoin") {
    if (relay) {
      log("Already in relay room. Use /rleave first.")
      return
    }
    const parts = arg.split(/\s+/)
    const room = parts[0]
    const key = parts[1] ?? parts[0]
    if (!room) {
      log("Usage: /rjoin <room> [key]")
      return
    }
    relay = new RelayClient()
    relay.on("peer-join", (peerId) => {
      relayPeer = peerId
      log(`Peer ${peerId} joined!`)
      rerender()
    })
    relay.on("peer-leave", () => {
      relayPeer = null
      log("Peer left")
      rerender()
    })
    relay.on("message", (chunk, _index, _total) => {
      if (!pendingRelayTransfer) return
      const decrypted = decryptChunk(chunk, pendingRelayTransfer.key)
      pendingRelayTransfer.ws.write(decrypted)
      pendingRelayTransfer.receivedChunks++
      pendingRelayTransfer.bytesReceived += decrypted.length
      const elapsed = (Date.now() - pendingRelayTransfer.startTime) / 1000
      const progress = pendingRelayTransfer.receivedChunks / pendingRelayTransfer.totalChunks
      transfers.set(pendingRelayTransfer.id, {
        id: pendingRelayTransfer.id,
        filename: path.basename(pendingRelayTransfer.filePath),
        size: fs.statSync(pendingRelayTransfer.filePath).size,
        hash: "",
        progress,
        speed: elapsed > 0 ? pendingRelayTransfer.bytesReceived / elapsed : 0,
        status: progress >= 1 ? "done" : "transferring",
        direction: "receive",
      })
      throttledRerender()
    })
    relay.on("done", (hash) => {
      if (pendingRelayTransfer) {
        pendingRelayTransfer.ws.end()
        transfers.set(pendingRelayTransfer.id, {
          id: pendingRelayTransfer.id,
          filename: path.basename(pendingRelayTransfer.filePath),
          size: fs.statSync(pendingRelayTransfer.filePath).size,
          hash,
          progress: 1,
          speed: 0,
          status: "done",
          direction: "receive",
        })
        pendingRelayTransfer = null
        log("Relay transfer complete!")
        rerender()
      }
    })
    relay.on("error", (err) => {
      log(`Relay error: ${err.message}`)
    })
    relay
      .connect(RELAY_URL)
      .then(() => {
        relay!.joinRoom(room, key)
        relayRoom = room
        relayKey = key
        log(`Joining relay room: ${room}`)
      })
      .catch((err) => {
        log(`Failed to connect to relay: ${err.message}`)
        relay = null
      })
    return
  }

  if (command === "rsend") {
    if (!relay || !relayRoom || !relayKey) {
      log("Not connected to relay. Use /rcreate or /rjoin first.")
      return
    }
    if (!relayPeer) {
      log("No peer in relay room yet.")
      return
    }
    if (!arg) {
      log("Usage: /rsend <file>")
      return
    }
    const absPath = path.resolve(arg)
    if (!fs.existsSync(absPath)) {
      log(`File not found: ${absPath}`)
      return
    }
    const stat = fs.statSync(absPath)
    const filename = path.basename(absPath)
    const key = deriveKey(relayKey)
    const CHUNK_SIZE = 32 * 1024
    const totalChunks = Math.ceil(stat.size / CHUNK_SIZE)
    const id = crypto.randomBytes(4).toString("hex")
    const transfer: TransferInfo = {
      id,
      filename,
      size: stat.size,
      hash: "",
      progress: 0,
      speed: 0,
      status: "transferring",
      direction: "send",
    }
    transfers.set(id, transfer)
    log(`Sending ${filename} via relay...`)
    rerender()
    const stream = fs.createReadStream(absPath, { highWaterMark: CHUNK_SIZE })
    let chunkIndex = 0
    const startTime = Date.now()
    let sentBytes = 0
    stream.on("data", (chunk) => {
      const encrypted = encryptChunk(Buffer.from(chunk as Buffer), key)
      relay!.sendChunk(encrypted, chunkIndex, totalChunks)
      sentBytes += chunk.length
      chunkIndex++
      const elapsed = (Date.now() - startTime) / 1000
      transfer.progress = sentBytes / stat.size
      transfer.speed = elapsed > 0 ? sentBytes / elapsed : 0
      transfers.set(id, { ...transfer })
      rerender()
    })
    stream.on("end", () => {
      relay!.sendDone("")
      transfer.status = "done"
      transfer.progress = 1
      transfers.set(id, { ...transfer })
      log(`Sent ${filename} via relay!`)
      rerender()
    })
    stream.on("error", (err) => {
      log(`Send error: ${err.message}`)
      transfer.status = "error"
      transfers.set(id, { ...transfer })
      rerender()
    })
    return
  }

  if (command === "rstatus") {
    if (!relay) {
      log("Not connected to relay")
      return
    }
    log(`Relay: ${relayRoom ?? "no room"} | Key: ${relayKey ? "***" : "none"} | Peer: ${relayPeer ?? "waiting"}`)
    return
  }
  if (command === "rleave") {
    if (!relay) {
      log("Not in relay room")
      return
    }
    relay.disconnect()
    relay = null
    relayRoom = null
    relayKey = null
    relayPeer = null
    log("Left relay room")
    rerender()
    return
  }
  if (command === "help") {
    for (const c of slashCommands) log(`${c.usage.padEnd(28)} ${c.description}`)
    rerender()
    return
  }
  if (command === "quit") {
    void shutdown(0)
    return
  }

  log("Unknown command. Type /help")
}

function trim(text: string, width: number) {
  if (width <= 0) return ""
  if (text.length <= width) return text
  return text.slice(0, width - 1) + "…"
}

function fit(left: string, right: string, width: number) {
  if (width <= 0) return ""
  if (!right) return trim(left, width)
  if (left.length + right.length + 1 <= width) return left + " ".repeat(width - left.length - right.length) + right
  if (right.length >= width) return trim(right, width)
  return trim(left, width - right.length - 1) + " " + right
}

function spin() {
  return ["◜", "◠", "◝", "◞", "◡", "◟"][tick % 6]
}
function pulse() {
  return ["·", "•", "●", "•"][tick % 4]
}

function topBar(width: number) {
  const peers = swarm ? swarm.getPeers().size : 0
  const isLAN = lanServer !== null
  const live = isLAN ? lanPeerConnected : swarmReady
  const markColor = live ? theme.success : isLAN ? theme.primary : theme.textMuted
  const mode = isLAN ? (lanPeerConnected ? "connected" : "scanning") : "ready"
  const relayText = relay ? (relayPeer ? "r:on" : "r:idle") : ""
  const right = trim(`p:${peers}  t:${transfers.size}${relayText ? "  " + relayText : ""}`, Math.max(8, width - 20))
  return h(
    "box",
    { width, height: 1, flexDirection: "row", flexShrink: 0, backgroundColor: theme.panel },
    h("text", { fg: markColor }, ` ${isLAN && !lanPeerConnected ? spin() : pulse()}`),
    h("text", { fg: isLAN ? theme.primary : theme.text }, ` ${fit(`FAST P2P / ${mode}`, right, width - 2)}`),
  )
}

function statusBar(width: number, hint: string) {
  return h(
    "box",
    { paddingTop: 1, paddingBottom: 1, paddingLeft: 2, paddingRight: 2, flexDirection: "row", flexShrink: 0, gap: 2 },
    h("text", { fg: theme.textMuted }, trim(process.cwd(), Math.max(16, width - 28))),
    h("box", { flexGrow: 1 }),
    h("text", { fg: theme.textMuted }, hint),
  )
}

function InputBox(width: number) {
  const isLAN = lanServer !== null
  const tone = isLAN ? (lanPeerConnected ? theme.success : theme.primary) : theme.primary
  const body =
    inputValue.length > 0
      ? `${inputValue}_`
      : isLAN
        ? lanPeerConnected
          ? "Phone connected. /lsend <file> or pick file"
          : "Waiting for phone to scan QR..."
        : "Type / for commands"
  return h(
    "box",
    {
      width,
      backgroundColor: theme.element,
      flexDirection: "column",
      border: ["left"],
      borderColor: tone,
      customBorderChars: {
        topLeft: "",
        topRight: "",
        bottomLeft: "╹",
        bottomRight: "",
        horizontal: " ",
        vertical: "┃",
      },
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      gap: 1,
    },
    h("text", { fg: theme.text }, ` ${trim(body, Math.max(1, width - 4))}`),
    h("text", { fg: theme.textMuted }, " enter run  tab complete  ctrl+k commands"),
  )
}

function CommandPalette(width: number, suggestions: SlashCommand[]) {
  const visible = suggestions.slice(0, 5)
  const title = inputValue.length <= 1 ? "Suggested" : "Commands"
  const lines = visible.map((item, index) => {
    const active = index === commandCursor
    const marker = active ? "▸" : " "
    const color = active ? theme.primary : theme.text
    return h("text", { fg: color }, ` ${marker} ${item.usage}`)
  })
  const desc = visible[commandCursor]?.description ?? ""
  return h(
    "box",
    {
      width,
      border: ["left"],
      borderColor: theme.border,
      backgroundColor: theme.panel,
      customBorderChars: {
        topLeft: "┌",
        topRight: "┐",
        bottomLeft: "└",
        bottomRight: "┘",
        horizontal: "─",
        vertical: "│",
      },
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
      gap: 1,
    },
    h("text", { fg: theme.textMuted }, title),
    ...lines,
    h("text", { fg: theme.secondary }, desc.slice(0, Math.max(1, width - 4))),
  )
}

function Sidebar(width: number, height: number) {
  const lines: any[] = []
  const maxRows = Math.max(1, height - 4)

  if (receivedFiles.length === 0) {
    lines.push(h("text", { fg: theme.textMuted }, " No received files"))
    lines.push(h("text", { fg: theme.textMuted }, ""))
    lines.push(h("text", { fg: theme.textMuted }, " Incoming files will"))
    lines.push(h("text", { fg: theme.textMuted }, " appear here"))
  } else {
    const visible = receivedFiles.slice(0, maxRows - 2)
    for (const file of visible) {
      const size = formatBytes(file.size)
      const name = trim(file.name, Math.max(1, width - size.length - 4))
      lines.push(h("text", { fg: theme.success }, ` ▸ ${name}`))
      lines.push(h("text", { fg: theme.textMuted }, `   ${size}`))
    }
    if (receivedFiles.length > visible.length)
      lines.push(h("text", { fg: theme.textMuted }, ` ... +${receivedFiles.length - visible.length} more`))
  }

  return h(
    "box",
    { width, height, backgroundColor: theme.panel, flexDirection: "column", padding: 1, gap: 0 },
    h("text", { fg: theme.text }, " Received"),
    h("text", { fg: theme.borderSubtle }, "─".repeat(Math.max(1, width - 4))),
    ...lines,
  )
}

function ActivityPanel(width: number, height: number) {
  const maxRows = Math.max(1, height - 4)
  const items = Array.from(transfers.values())
  const lines: any[] = []

  if (items.length > 0) {
    const recent = items.slice(-3)
    for (const t of recent) {
      const dir = t.direction === "send" ? "↑" : "↓"
      const pct = Math.round(t.progress * 100)
      const bar = progressBar(t.progress, 10)
      const color = t.status === "done" ? theme.success : t.status === "error" ? theme.error : theme.primary
      const status = t.status === "done" ? "✓" : t.status === "error" ? "✗" : `${pct}%`
      lines.push(h("text", { fg: color }, ` ${dir} ${trim(t.filename, 16).padEnd(16)} ${bar} ${status.padStart(4)}`))
    }
    lines.push(h("text", { fg: theme.borderSubtle }, "─".repeat(Math.max(1, width - 4))))
  }

  const logSpace = maxRows - lines.length
  const visible = logs.slice(-logSpace)
  for (const entry of visible) lines.push(h("text", { fg: theme.textMuted }, ` ${trim(entry, Math.max(1, width - 2))}`))
  if (lines.length === 0) lines.push(h("text", { fg: theme.textMuted }, " Ready. Type /connect to share files."))

  return h(
    "box",
    { width, height, backgroundColor: theme.panel, flexDirection: "column", padding: 1, gap: 0 },
    h("text", { fg: theme.text }, " Activity"),
    h("text", { fg: theme.borderSubtle }, "─".repeat(Math.max(1, width - 4))),
    ...lines,
  )
}

function QRPanel(width: number, height: number) {
  if (qrDismissed) return null
  const renderWidth = Math.max(1, width - 4)
  const ip = getLocalIP()
  const url = `http://${ip}:${lanServerPort}`
  const lines: any[] = []

  lines.push(
    h(
      "text",
      { fg: lanPeerConnected ? theme.success : theme.primary },
      ` ${lanPeerConnected ? "● Connected" : spin() + " Scan QR"}`,
    ),
  )
  lines.push(h("text", { fg: theme.textMuted }, ` ${url}`))
  lines.push(h("text", { fg: theme.borderSubtle }, "─".repeat(Math.max(1, width - 4))))

  if (qrLines.length > 0) {
    const qrWidth = qrLines[0].length
    const maxQRRows = Math.max(1, height - 8)
    const visibleQR = qrLines.slice(0, maxQRRows)
    for (const line of visibleQR) {
      const pad = Math.max(0, Math.floor((renderWidth - qrWidth) / 2))
      lines.push(h("text", { fg: theme.text }, " ".repeat(pad) + line))
    }
  } else if (qrLoading) {
    lines.push(h("text", { fg: theme.textMuted }, " Generating QR..."))
  } else {
    lines.push(h("text", { fg: theme.error }, " QR generation failed"))
    lines.push(h("text", { fg: theme.textMuted }, ` Open ${url} manually`))
  }

  return h(
    "box",
    { width, height, backgroundColor: theme.panel, flexDirection: "column", padding: 1, gap: 0 },
    h("text", { fg: theme.text }, " LAN Share"),
    h("text", { fg: theme.borderSubtle }, "─".repeat(Math.max(1, width - 4))),
    ...lines,
  )
}

function LogoPanel() {
  const lines: any[] = []
  for (const line of logoLines) lines.push(h("text", { fg: RGBA.fromHex("#58a6ff") }, line))
  lines.push(h("text", {}, ""))
  lines.push(h("text", { fg: theme.text }, "FAST P2P file transfer hub"))
  lines.push(h("text", { fg: theme.textMuted }, "Type / to open commands"))
  return h("box", { flexDirection: "column", alignItems: "center" }, ...lines)
}

function App() {
  const { width, height } = tui.getTerminalDimensions()
  const suggestions = getSlashSuggestions(inputValue)
  clampCommandCursor(suggestions.length)
  const showPalette = suggestions.length > 0 && isCommandPaletteActive(inputValue)
  const isHome = lanServer === null
  const ip = getLocalIP()
  const hint = lanServer
    ? lanPeerConnected
      ? `${ip}:${lanServerPort}  esc stop`
      : `${ip}:${lanServerPort}  scanning...`
    : "/ commands  /connect  /help"

  return h(
    "box",
    { width, height, flexDirection: "column", backgroundColor: theme.bg },
    topBar(width),
    h(
      "box",
      { flexGrow: 1, flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, gap: 1 },
      isHome
        ? h("box", { flexGrow: 1, alignItems: "center", justifyContent: "center" }, LogoPanel())
        : h(
            "box",
            { flexGrow: 1, flexDirection: "row", gap: 2 },
            h(
              "box",
              { flexGrow: 1, flexDirection: "column", gap: 1 },
              ActivityPanel(Math.floor((width - 4 - 42) / 2), height - 12),
            ),
            qrDismissed ? null : QRPanel(Math.floor((width - 4 - 42) / 2), height - 12),
            Sidebar(42, height - 12),
          ),
      showPalette ? CommandPalette(width - 4, suggestions) : null,
      InputBox(width - 4),
    ),
    statusBar(width, hint),
  )
}

tui.onKey((evt) => {
  if (quitting) {
    evt.preventDefault()
    return
  }
  if (evt.ctrl && evt.name === "c") {
    evt.preventDefault()
    void shutdown(0)
    return
  }
  if (evt.ctrl && evt.name === "k") {
    evt.preventDefault()
    inputValue = "/"
    commandCursor = 0
    rerender()
    return
  }
  const suggestions = getSlashSuggestions(inputValue)
  clampCommandCursor(suggestions.length)
  if (evt.name === "tab" && suggestions.length > 0) {
    completeFromSuggestion()
    evt.preventDefault()
    rerender()
    return
  }
  if (evt.name === "up") {
    if (suggestions.length > 0) commandCursor = (commandCursor - 1 + suggestions.length) % suggestions.length
    else selectedPeer = Math.max(0, selectedPeer - 1)
    evt.preventDefault()
  } else if (evt.name === "down") {
    if (suggestions.length > 0) commandCursor = (commandCursor + 1) % suggestions.length
    else {
      const max = swarm ? Math.max(0, swarm.getPeers().size - 1) : 0
      selectedPeer = Math.min(max, selectedPeer + 1)
    }
    evt.preventDefault()
  } else if (evt.name === "escape") {
    if (lanServer) {
      lanServer.stop()
      lanServer = null
      lanPeerWs = null
      lanPeerConnected = false
      qrLines = []
      qrLoading = false
      qrDismissed = false
      log("LAN server stopped")
      rerender()
    } else if (inputValue.length > 0) {
      inputValue = ""
      commandCursor = 0
    }
    evt.preventDefault()
  } else if (evt.name === "backspace") {
    inputValue = inputValue.slice(0, -1)
    evt.preventDefault()
  } else if (evt.name === "return") {
    if (executeSelectedSuggestion()) {
      evt.preventDefault()
      rerender()
      return
    }
    const command = inputValue
    inputValue = ""
    commandCursor = 0
    evt.preventDefault()
    void runCommand(command)
  } else if (evt.name === "q" && inputValue.length === 0) {
    evt.preventDefault()
    void shutdown(0)
    return
  } else if (evt.key && evt.key.length === 1 && !evt.ctrl && !evt.meta) {
    inputValue += evt.key
    evt.preventDefault()
  }
  rerender()
})

rerender()
log("FAST P2P ready. Type /help")
