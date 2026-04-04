interface Room {
  creator: Bun.WebSocket
  joiner: Bun.WebSocket | null
  created: number
}

const rooms = new Map<string, Room>()

function genCode(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < len; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function broadcast(room: Room, exclude: Bun.WebSocket, msg: string) {
  if (room.creator !== exclude) room.creator.send(msg)
  if (room.joiner && room.joiner !== exclude) room.joiner.send(msg)
}

Bun.serve<{ roomCode?: string; peerId?: string }>({
  port: Number(process.env.PORT ?? 8080),

  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === "/health") {
      return new Response("OK")
    }

    const success = server.upgrade(req, {
      data: { roomCode: undefined, peerId: undefined },
    })
    if (success) return undefined
    return new Response("WebSocket upgrade failed", { status: 500 })
  },

  websocket(ws: Bun.WebSocket<{ roomCode?: string; peerId?: string }>) {
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
          ws.data.roomCode = roomCode
          ws.data.peerId = peerId
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
          ws.data.roomCode = roomCode
          ws.data.peerId = peerId
          ws.send(JSON.stringify({ type: "joined", room: roomCode, peerId }))
          room.creator.send(JSON.stringify({ type: "peer_joined", peerId }))
          console.log(`[Room ${roomCode}] Peer joined`)
          break
        }

        case "relay": {
          if (!roomCode) return
          const room = rooms.get(roomCode)
          if (!room) return
          broadcast(room, ws, JSON.stringify({ type: "relay", from: peerId, data: msg.data }))
          break
        }

        case "signal": {
          if (!roomCode) return
          const room = rooms.get(roomCode)
          if (!room) return
          broadcast(room, ws, JSON.stringify({ type: "signal", from: peerId, data: msg.data }))
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
          broadcast(room, ws, JSON.stringify({ type: "peer_left", from: peerId }))
          if (room.creator === ws) {
            if (room.joiner) room.joiner.close()
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
        if (room.joiner) room.joiner.close()
        rooms.delete(roomCode)
        console.log(`[Room ${roomCode}] Creator left, room deleted`)
      } else {
        room.joiner = null
        room.creator.send(JSON.stringify({ type: "peer_left" }))
        console.log(`[Room ${roomCode}] Joiner left`)
      }
    })
  },
})

console.log(`[Relay] Server running on port ${process.env.PORT ?? 8080}`)
