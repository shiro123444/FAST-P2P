export interface RelayFileMeta {
  id: string
  name: string
  size: number
  total: number
  hash?: string
}

export interface EncryptedChunkPayload {
  iv: string
  data: string
  tag: string
}

export interface RelayChunkPayload extends EncryptedChunkPayload {
  index: number
  total: number
  _meta?: RelayFileMeta | null
  meta?: RelayFileMeta | null
}

export type RelayClientMessage =
  | { type: "create" }
  | { type: "join"; room: string }
  | { type: "relay"; data: RelayChunkPayload }
  | { type: "done"; hash: string }
  | { type: "leave" }
  | { type: "signal"; data: unknown }

export type RelayServerMessage =
  | { type: "created"; room: string; peerId: string }
  | { type: "joined"; room: string; peerId: string; peer: string | null }
  | { type: "peer_joined"; peerId: string }
  | { type: "peer_leave"; from?: string }
  | { type: "relay"; from?: string; data: RelayChunkPayload }
  | { type: "done"; from?: string; hash: string }
  | { type: "signal"; from?: string; data: unknown }
  | { type: "error"; message: string }

export const RELAY_CHUNK_SIZE = 32 * 1024
