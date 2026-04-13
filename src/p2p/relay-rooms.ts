export interface RelaySocketData {
  roomCode?: string
  peerId?: string
}

export interface RelaySocket {
  data: RelaySocketData
  send(message: string): void
  close(): void
}

interface Room<TSocket extends RelaySocket> {
  creator: TSocket
  joiner: TSocket | null
  created: number
}

function defaultGenCode(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < len; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function createRelayRooms<TSocket extends RelaySocket>(
  genCode: (len?: number) => string = defaultGenCode,
): {
  handleMessage(socket: TSocket, msg: Record<string, unknown>): void
  handleClose(socket: TSocket): void
} {
  const rooms = new Map<string, Room<TSocket>>()

  function broadcast(room: Room<TSocket>, exclude: TSocket, msg: string) {
    if (room.creator !== exclude) room.creator.send(msg)
    if (room.joiner && room.joiner !== exclude) room.joiner.send(msg)
  }

  return {
    handleMessage(socket: TSocket, msg: Record<string, unknown>) {
      switch (msg.type) {
        case "create": {
          const roomCode = genCode()
          const peerId = genCode(4)
          rooms.set(roomCode, { creator: socket, joiner: null, created: Date.now() })
          socket.data.roomCode = roomCode
          socket.data.peerId = peerId
          socket.send(JSON.stringify({ type: "created", room: roomCode, peerId }))
          break
        }

        case "join": {
          const room = rooms.get(msg.room as string)
          if (!room) {
            socket.send(JSON.stringify({ type: "error", message: "Room not found" }))
            return
          }
          if (room.joiner) {
            socket.send(JSON.stringify({ type: "error", message: "Room full" }))
            return
          }

          const roomCode = msg.room as string
          const peerId = genCode(4)
          room.joiner = socket
          socket.data.roomCode = roomCode
          socket.data.peerId = peerId
          socket.send(JSON.stringify({ type: "joined", room: roomCode, peerId, peer: room.creator.data.peerId ?? null }))
          room.creator.send(JSON.stringify({ type: "peer_joined", peerId }))
          break
        }

        case "relay": {
          const roomCode = socket.data.roomCode
          if (!roomCode) return
          const room = rooms.get(roomCode)
          if (!room) return
          broadcast(room, socket, JSON.stringify({ type: "relay", from: socket.data.peerId, data: msg.data }))
          break
        }

        case "signal": {
          const roomCode = socket.data.roomCode
          if (!roomCode) return
          const room = rooms.get(roomCode)
          if (!room) return
          broadcast(room, socket, JSON.stringify({ type: "signal", from: socket.data.peerId, data: msg.data }))
          break
        }

        case "done": {
          const roomCode = socket.data.roomCode
          if (!roomCode) return
          const room = rooms.get(roomCode)
          if (!room) return
          broadcast(room, socket, JSON.stringify({ type: "done", from: socket.data.peerId, hash: msg.hash ?? "" }))
          break
        }

        case "leave": {
          const roomCode = socket.data.roomCode
          if (!roomCode) return
          const room = rooms.get(roomCode)
          if (!room) return
          broadcast(room, socket, JSON.stringify({ type: "peer_leave", from: socket.data.peerId }))
          if (room.creator === socket) {
            if (room.joiner) room.joiner.close()
            rooms.delete(roomCode)
          } else {
            room.joiner = null
          }
          socket.data.roomCode = undefined
          socket.data.peerId = undefined
          break
        }
      }
    },

    handleClose(socket: TSocket) {
      const roomCode = socket.data.roomCode
      if (!roomCode) return

      const room = rooms.get(roomCode)
      if (!room) return

      if (room.creator === socket) {
        if (room.joiner) room.joiner.close()
        rooms.delete(roomCode)
      } else {
        room.joiner = null
        room.creator.send(JSON.stringify({ type: "peer_leave" }))
      }
    },
  }
}
