import { Children, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import QRCode from "qrcode"
import {
  RELAY_CHUNK_SIZE,
  decryptRelayChunk,
  deriveRelayKey,
  encryptRelayChunk,
  normalizeRoomCode,
  sha256Hex,
  type RelayChunkPayload,
  type RelayClientMessage,
  type RelayFileMeta,
  type RelayServerMessage,
} from "@fast-p2p/shared"
import { ToastContainer, type ToastMessage } from "../components/Toast"
import { StatusRail } from "../components/StatusRail"
import { RoomControls } from "../components/RoomControls"
import { ShareControls } from "../components/ShareControls"
import { QRCodeDisplay } from "../components/QRCodeDisplay"
import { FileUpload } from "../components/FileUpload"
import { TransferList } from "../components/TransferList"
import { ThemeToggle } from "../components/ThemeToggle"
import { CustomCursor } from "../components/CustomCursor"
import { LoadingScreen } from "../components/LoadingScreen"
import type { TransferState } from "../components/TransferItem"
import { useTheme } from "../hooks/useTheme"

type ConnectionState = "connecting" | "online" | "offline"
type IntroPhase = "loading" | "entrance" | "ready"

const DESKTOP_STAGE_QUERY = "(min-width: 1025px)"

type ScenePalette = {
  bgTop: [number, number, number]
  bgBottom: [number, number, number]
  ink: [number, number, number]
  muted: [number, number, number]
  line: [number, number, number]
  accent: [number, number, number]
  glow: [number, number, number]
}

const SCENE_PALETTES: ScenePalette[] = [
  {
    bgTop: [246, 242, 235],
    bgBottom: [231, 239, 235],
    ink: [16, 20, 31],
    muted: [47, 53, 62],
    line: [16, 20, 31],
    accent: [27, 66, 216],
    glow: [186, 211, 204],
  },
  {
    bgTop: [244, 238, 227],
    bgBottom: [233, 229, 219],
    ink: [20, 20, 20],
    muted: [62, 56, 49],
    line: [24, 24, 24],
    accent: [35, 86, 173],
    glow: [215, 196, 170],
  },
  {
    bgTop: [233, 244, 236],
    bgBottom: [212, 232, 226],
    ink: [17, 31, 24],
    muted: [44, 71, 61],
    line: [20, 40, 33],
    accent: [39, 126, 92],
    glow: [178, 219, 199],
  },
  {
    bgTop: [239, 242, 249],
    bgBottom: [221, 231, 244],
    ink: [18, 27, 49],
    muted: [54, 71, 102],
    line: [25, 35, 62],
    accent: [59, 114, 224],
    glow: [181, 204, 245],
  },
  {
    bgTop: [248, 241, 229],
    bgBottom: [238, 226, 210],
    ink: [43, 27, 10],
    muted: [94, 69, 44],
    line: [52, 33, 14],
    accent: [184, 107, 32],
    glow: [229, 191, 140],
  },
  {
    bgTop: [235, 240, 244],
    bgBottom: [215, 226, 232],
    ink: [22, 31, 38],
    muted: [64, 79, 90],
    line: [24, 34, 42],
    accent: [56, 127, 160],
    glow: [177, 210, 223],
  },
]

type SceneMediaSpec = {
  id: string
  src: string
  alt: string
  label: string
  caption: string
  width: number
  top: string
  left: string
  x: number
  y: number
  z: number
  tiltX: number
  tiltY: number
  parallaxX: number
  parallaxY: number
}

const HERO_MEDIA: SceneMediaSpec[] = [
  {
    id: "hero-intro",
    src: "/reference/assets/intro/ok.png",
    alt: "Crafted by GC intro artwork",
    label: "INTRO",
    caption: "enter the archive",
    width: 214,
    top: "18%",
    left: "14%",
    x: 0,
    y: 0,
    z: 980,
    tiltX: -6,
    tiltY: 8,
    parallaxX: 28,
    parallaxY: -16,
  },
  {
    id: "hero-jan",
    src: "/reference/assets/jan/iceland_dribbble.jpg",
    alt: "Iceland poster exploration",
    label: "JAN",
    caption: "iceland study",
    width: 248,
    top: "68%",
    left: "84%",
    x: 0,
    y: 0,
    z: 1180,
    tiltX: 6,
    tiltY: -10,
    parallaxX: -34,
    parallaxY: 18,
  },
  {
    id: "hero-feb",
    src: "/reference/assets/feb/camera-culture.jpg",
    alt: "Camera culture reference board",
    label: "FEB",
    caption: "camera culture",
    width: 188,
    top: "76%",
    left: "24%",
    x: 0,
    y: 0,
    z: 420,
    tiltX: -4,
    tiltY: 6,
    parallaxX: 16,
    parallaxY: 10,
  },
]

const SECURITY_MEDIA: SceneMediaSpec[] = [
  {
    id: "security-mar",
    src: "/reference/assets/mar/certificate-when-to-travel-sotd.jpg",
    alt: "Certificate poster reference",
    label: "MAR",
    caption: "certificate study",
    width: 224,
    top: "22%",
    left: "82%",
    x: 0,
    y: 0,
    z: 1020,
    tiltX: 5,
    tiltY: -8,
    parallaxX: -26,
    parallaxY: 14,
  },
  {
    id: "security-office",
    src: "/reference/assets/mar/asia-office.jpg",
    alt: "Asia office editorial shot",
    label: "ARCHIVE",
    caption: "office notes",
    width: 206,
    top: "74%",
    left: "16%",
    x: 0,
    y: 0,
    z: 420,
    tiltX: -5,
    tiltY: 7,
    parallaxX: 18,
    parallaxY: -10,
  },
]

const ROOM_MEDIA: SceneMediaSpec[] = [
  {
    id: "room-sep",
    src: "/reference/assets/sep/nfl_screens_4x.jpg",
    alt: "NFL screen collage",
    label: "SEP",
    caption: "screen system",
    width: 234,
    top: "18%",
    left: "84%",
    x: 0,
    y: 0,
    z: 1060,
    tiltX: 4,
    tiltY: -9,
    parallaxX: -30,
    parallaxY: 14,
  },
  {
    id: "room-nov",
    src: "/reference/assets/nov/adobe_xd_mockup.jpg",
    alt: "Adobe XD mockup board",
    label: "NOV",
    caption: "prototype deck",
    width: 210,
    top: "72%",
    left: "16%",
    x: 0,
    y: 0,
    z: 460,
    tiltX: -4,
    tiltY: 7,
    parallaxX: 20,
    parallaxY: 10,
  },
]

const SHARE_MEDIA: SceneMediaSpec[] = [
  {
    id: "share-may",
    src: "/reference/assets/may/botanical.jpg",
    alt: "Botanical packaging board",
    label: "MAY",
    caption: "botanical board",
    width: 228,
    top: "20%",
    left: "86%",
    x: 0,
    y: 0,
    z: 980,
    tiltX: 5,
    tiltY: -9,
    parallaxX: -26,
    parallaxY: 14,
  },
  {
    id: "share-jun",
    src: "/reference/assets/jun/jekka_bottle.png",
    alt: "Jekka bottle render",
    label: "JUN",
    caption: "jekka bottle",
    width: 154,
    top: "74%",
    left: "84%",
    x: 0,
    y: 0,
    z: 460,
    tiltX: -3,
    tiltY: 5,
    parallaxX: -14,
    parallaxY: 10,
  },
]

const TRANSFER_MEDIA: SceneMediaSpec[] = [
  {
    id: "transfer-aug",
    src: "/reference/assets/aug/cssda-wotd.jpg",
    alt: "CSSDA award composition",
    label: "AUG",
    caption: "award board",
    width: 218,
    top: "18%",
    left: "18%",
    x: 0,
    y: 0,
    z: 940,
    tiltX: -5,
    tiltY: 9,
    parallaxX: 24,
    parallaxY: -14,
  },
  {
    id: "transfer-dec",
    src: "/reference/assets/dec/studio_of_the_year_nom.jpg",
    alt: "Studio of the year nomination artwork",
    label: "DEC",
    caption: "studio nomination",
    width: 228,
    top: "72%",
    left: "86%",
    x: 0,
    y: 0,
    z: 460,
    tiltX: 4,
    tiltY: -7,
    parallaxX: -18,
    parallaxY: 10,
  },
]

const FUTURE_MEDIA: SceneMediaSpec[] = [
  {
    id: "future-iat",
    src: "/reference/assets/nov/iat-webdesigner.jpg",
    alt: "IAT Web Designer feature",
    label: "FWD",
    caption: "editorial cut",
    width: 226,
    top: "22%",
    left: "82%",
    x: 0,
    y: 0,
    z: 980,
    tiltX: 5,
    tiltY: -8,
    parallaxX: -26,
    parallaxY: 14,
  },
  {
    id: "future-sign",
    src: "/reference/assets/oct/sign.jpg",
    alt: "Signage reference",
    label: "OCT",
    caption: "sign system",
    width: 184,
    top: "74%",
    left: "18%",
    x: 0,
    y: 0,
    z: 420,
    tiltX: -4,
    tiltY: 6,
    parallaxX: 18,
    parallaxY: -12,
  },
]

function mixChannel(from: number, to: number, amount: number) {
  return Math.round(from + (to - from) * amount)
}

function mixRgb(
  from: [number, number, number],
  to: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    mixChannel(from[0], to[0], amount),
    mixChannel(from[1], to[1], amount),
    mixChannel(from[2], to[2], amount),
  ]
}

function rgbTupleToCss([r, g, b]: [number, number, number]) {
  return `${r} ${g} ${b}`
}

const SCENE_PALETTES_DARK: ScenePalette[] = SCENE_PALETTES.map((palette) => ({
  bgTop: mixRgb(palette.bgTop, [12, 14, 18], 0.92),
  bgBottom: mixRgb(palette.bgBottom, [7, 9, 12], 0.94),
  ink: mixRgb(palette.ink, [244, 246, 248], 0.9),
  muted: mixRgb(palette.muted, [172, 178, 186], 0.78),
  line: mixRgb(palette.line, [214, 220, 228], 0.82),
  accent: mixRgb(palette.accent, [132, 168, 255], 0.34),
  glow: mixRgb(palette.glow, [72, 88, 122], 0.72),
}))

function applyCinemaPalette(element: HTMLElement, palette: ScenePalette) {
  element.style.setProperty("--cinema-bg-top", rgbTupleToCss(palette.bgTop))
  element.style.setProperty("--cinema-bg-bottom", rgbTupleToCss(palette.bgBottom))
  element.style.setProperty("--cinema-ink-rgb", rgbTupleToCss(palette.ink))
  element.style.setProperty("--cinema-muted-rgb", rgbTupleToCss(palette.muted))
  element.style.setProperty("--cinema-line-rgb", rgbTupleToCss(palette.line))
  element.style.setProperty("--cinema-accent-rgb", rgbTupleToCss(palette.accent))
  element.style.setProperty("--cinema-glow-rgb", rgbTupleToCss(palette.glow))
}

type PendingIncoming = {
  meta: RelayFileMeta
  chunks: Array<Uint8Array | undefined>
  received: number
}

function getRelayUrl(): string {
  const explicit = import.meta.env.VITE_RELAY_URL
  if (explicit) return explicit

  const params = new URLSearchParams(window.location.search)
  const relayFromQuery = params.get("relay")
  if (relayFromQuery) return relayFromQuery

  const protocol = window.location.protocol === "https:" ? "wss" : "ws"
  const localHostnames = new Set(["localhost", "127.0.0.1"])
  const isLocalPreview = localHostnames.has(window.location.hostname)
  const frontendPort = window.location.port
  const relayPort = "3000"
  const isFrontendDevPort =
    frontendPort !== "" &&
    frontendPort !== relayPort &&
    frontendPort !== "80" &&
    frontendPort !== "443"
  const host = isLocalPreview && isFrontendDevPort ? `${window.location.hostname}:${relayPort}` : window.location.host
  return `${protocol}://${host}/ws`
}

function makeId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)
}

function downloadBlob(url: string, filename: string) {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
}

async function copyText(value: string, onSuccess: () => void, onFailure: () => void) {
  try {
    await navigator.clipboard.writeText(value)
    onSuccess()
  } catch {
    onFailure()
  }
}

type ProgressiveSectionProps = {
  as: "article" | "div" | "footer" | "header" | "section"
  children: ReactNode
  className?: string
  delay?: number
  eager?: boolean
  placeholder?: ReactNode
}

function ProgressiveSection({
  as,
  children,
  className = "",
  delay = 0,
  eager = false,
  placeholder,
}: ProgressiveSectionProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(eager)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (eager) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }

    const node = ref.current
    if (!node) return

    if (typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
      setMounted(true)
      setVisible(true)
      return
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return

        setMounted(true)
        requestAnimationFrame(() => setVisible(true))
        observer.disconnect()
      },
      {
        rootMargin: "0px 0px -28% 0px",
        threshold: 0.12,
      },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [eager])

  const Component = as
  const style = { "--reveal-delay": `${delay}ms` } as CSSProperties
  const stateClassName = `progressive-block${mounted ? " is-mounted" : ""}${visible ? " is-visible" : ""}`

  return (
    <Component ref={ref as never} className={`${className} ${stateClassName}`.trim()} style={style}>
      {mounted ? <div className="progressive-body">{children}</div> : <div className="progressive-placeholder">{placeholder}</div>}
    </Component>
  )
}

function SceneAtmosphere() {
  return (
    <div className="scene-volume" aria-hidden="true">
      <div className="scene-volume-plane" />
      <div className="scene-volume-fog" />
    </div>
  )
}

function SceneMediaCluster({
  items,
  className = "",
}: {
  items: SceneMediaSpec[]
  className?: string
}) {
  return (
    <div className={`scene-media-cluster ${className}`.trim()} aria-hidden="true">
      {items.map((item) => (
        <figure
          className="scene-media-card"
          key={item.id}
          style={
            {
              "--media-width": `${item.width}px`,
              "--media-top": item.top,
              "--media-left": item.left,
              "--media-shift-x": `${item.x}px`,
              "--media-shift-y": `${item.y}px`,
              "--media-shift-z": `${item.z}px`,
              "--media-tilt-x": `${item.tiltX}deg`,
              "--media-tilt-y": `${item.tiltY}deg`,
              "--media-parallax-x": `${item.parallaxX}px`,
              "--media-parallax-y": `${item.parallaxY}px`,
            } as CSSProperties
          }
        >
          <div className="scene-media-frame">
            <img className="scene-media-image" src={item.src} alt={item.alt} loading="lazy" decoding="async" />
          </div>
          <figcaption className="scene-media-caption">
            <span>{item.label}</span>
            <strong>{item.caption}</strong>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

function splitSceneTitle(node: ReactNode): string[] {
  const lines = [""]

  const walk = (value: ReactNode) => {
    if (value === null || value === undefined || typeof value === "boolean") return

    if (typeof value === "string" || typeof value === "number") {
      lines[lines.length - 1] += String(value)
      return
    }

    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }

    Children.forEach(value, (child) => {
      if (child === null || child === undefined || typeof child === "boolean") return

      if (typeof child === "string" || typeof child === "number") {
        lines[lines.length - 1] += String(child)
        return
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        if (child.type === "br") {
          lines.push("")
          return
        }

        walk(child.props.children)
      }
    })
  }

  walk(node)

  return lines.filter((line, index) => line.length > 0 || index < lines.length - 1)
}

function SceneHeadingLayer({
  as,
  className = "",
  marker,
  markerClassName,
  titleId,
  title,
  body,
  titleClassName = "",
  bodyClassName = "",
}: {
  as: "h1" | "h2"
  className?: string
  marker: ReactNode
  markerClassName: string
  titleId: string
  title: ReactNode
  body: ReactNode
  titleClassName?: string
  bodyClassName?: string
}) {
  const HeadingTag = as
  const titleLines = splitSceneTitle(title)
  const accessibleTitle = titleLines.join(" ")

  return (
    <div className={`scene-heading-layer ${className}`.trim()}>
      <div className="scene-heading-track">
        <span className={markerClassName}>{marker}</span>
        <HeadingTag className={`scene-title ${titleClassName}`.trim()} id={titleId} aria-label={accessibleTitle}>
          {titleLines.map((line, lineIndex) => {
            const glyphs = Array.from(line)
            const mid = (glyphs.length - 1) / 2

            return (
              <span className="scene-title-line" key={`line-${lineIndex}`}>
                {glyphs.map((glyph, glyphIndex) => {
                  const spread = glyphIndex - mid
                  const depth = Math.abs(spread)
                  const enter = Math.min(lineIndex * 0.08 + depth * 0.028, 0.42)

                  return (
                    <span
                      aria-hidden="true"
                      className="scene-title-glyph"
                      key={`glyph-${lineIndex}-${glyphIndex}-${glyph}`}
                      style={
                        {
                          "--glyph-shift": spread.toFixed(2),
                          "--glyph-depth": depth.toFixed(2),
                          "--glyph-enter": enter.toFixed(3),
                        } as CSSProperties
                      }
                    >
                      {glyph === " " ? "\u00a0" : glyph}
                    </span>
                  )
                })}
              </span>
            )
          })}
        </HeadingTag>
        <p className={`scene-body ${bodyClassName}`.trim()}>{body}</p>
      </div>
    </div>
  )
}

export function HomePage() {
  const mode =
    typeof window === "undefined"
      ? "legacy"
      : new URLSearchParams(window.location.search).get("mode") === "reference"
        ? "reference"
        : "legacy"
  const [panelOpen, setPanelOpen] = useState(false)

  if (mode === "reference") {
    return (
      <main className="reference-mode-root">
        <div className="reference-mode-toolbar">
          <button
            className="reference-mode-button"
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
          >
            {panelOpen ? "关闭功能面板" : "打开功能面板"}
          </button>
          <a className="reference-mode-button" href="/?mode=legacy">
            打开原页面
          </a>
        </div>
        <aside className={`reference-side-panel${panelOpen ? " is-open" : ""}`.trim()}>
          <iframe
            className="reference-side-frame"
            src="/?mode=legacy"
            title="Legacy Feature Panel"
          />
        </aside>
        <iframe
          className="reference-mode-frame"
          src="/reference-live/index.html"
          title="Reference Experience"
        />
      </main>
    )
  }

  const relayUrl = useMemo(() => getRelayUrl(), [])
  const initialRoom = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return normalizeRoomCode(params.get("room") ?? "")
  }, [])

  const [connection, setConnection] = useState<ConnectionState>(initialRoom ? "connecting" : "offline")
  const [roomCode, setRoomCode] = useState("")
  const [joinCode, setJoinCode] = useState(initialRoom)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [peerConnected, setPeerConnected] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [transfers, setTransfers] = useState<TransferState[]>([])
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)
  const [introPhase, setIntroPhase] = useState<IntroPhase>("loading")
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.matchMedia(DESKTOP_STAGE_QUERY).matches)
  const storySteps = 6

  const { theme, toggleTheme } = useTheme()
  const introReady = introPhase === "ready"
  const introActive = introPhase !== "loading"

  const shellRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)
  const pendingIncomingRef = useRef<PendingIncoming | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const relayNoticeShownRef = useRef(false)
  const activeSceneIndexRef = useRef(0)
  const introPhaseRef = useRef<IntroPhase>("loading")
  const themeRef = useRef(theme)
  const autoJoinRef = useRef(initialRoom)
  const autoCreateRef = useRef(false)
  const objectUrlsRef = useRef<string[]>([])
  const roomCodeRef = useRef("")

  useEffect(() => {
    roomCodeRef.current = roomCode
  }, [roomCode])

  useEffect(() => {
    introPhaseRef.current = introPhase
  }, [introPhase])

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_STAGE_QUERY)
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches)
    }

    syncViewport()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport)
      return () => {
        mediaQuery.removeEventListener("change", syncViewport)
      }
    }

    mediaQuery.addListener(syncViewport)
    return () => {
      mediaQuery.removeListener(syncViewport)
    }
  }, [])

  useEffect(() => {
    themeRef.current = theme

    const shell = shellRef.current
    if (!shell || introPhaseRef.current !== "loading") return

    const initialPalette = theme === "dark" ? SCENE_PALETTES_DARK[0] : SCENE_PALETTES[0]
    applyCinemaPalette(shell, initialPalette)
  }, [theme])

  useEffect(() => {
    if (!isDesktopViewport) {
      document.documentElement.classList.remove("cinema-scroll-locked")
      document.body.classList.remove("cinema-scroll-locked")
      return
    }

    document.documentElement.classList.add("cinema-scroll-locked")
    document.body.classList.add("cinema-scroll-locked")

    return () => {
      document.documentElement.classList.remove("cinema-scroll-locked")
      document.body.classList.remove("cinema-scroll-locked")
    }
  }, [isDesktopViewport])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    if (!introActive) {
      const initialPalette = themeRef.current === "dark" ? SCENE_PALETTES_DARK[0] : SCENE_PALETTES[0]
      applyCinemaPalette(shell, initialPalette)
      shell.style.setProperty("--story-cursor", "0.000")
      shell.style.setProperty("--story-progress", "0.000")
      shell.style.setProperty("--page-progress", "0.000")
      shell.style.setProperty("--hero-progress", "0.000")
      return
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0

    const setPointer = (x: number, y: number) => {
      shell.style.setProperty("--pointer-x", x.toFixed(3))
      shell.style.setProperty("--pointer-y", y.toFixed(3))
    }

    const resetPointer = () => {
      setPointer(0, 0)
    }

    const handleMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return
      const rect = shell.getBoundingClientRect()
      const normalizedX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      const normalizedY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setPointer(normalizedX, normalizedY)
      })
    }

    shell.addEventListener("pointermove", handleMove)
    shell.addEventListener("pointerleave", resetPointer)
    resetPointer()

    return () => {
      cancelAnimationFrame(frame)
      shell.removeEventListener("pointermove", handleMove)
      shell.removeEventListener("pointerleave", resetPointer)
    }
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    if (!isDesktopViewport) {
      const initialPalette = themeRef.current === "dark" ? SCENE_PALETTES_DARK[0] : SCENE_PALETTES[0]
      applyCinemaPalette(shell, initialPalette)
      shell.style.setProperty("--hero-progress", "0.000")
      shell.style.setProperty("--hero-drift", "0.000")
      shell.style.setProperty("--hero-depth", "1.000")
      shell.style.setProperty("--page-progress", "0.000")
      shell.style.setProperty("--story-progress", "0.000")
      shell.style.setProperty("--story-cursor", "0.000")
      shell.style.setProperty("--mouse-x", "0.000")
      shell.style.setProperty("--mouse-y", "0.000")
      shell.style.setProperty("--lens-x", "0.000")
      shell.style.setProperty("--lens-y", "0.000")
      shell.style.setProperty("--scroll-y", "0.0")
      shell.style.setProperty("--scroll-velocity", "0.000")
      shell.style.setProperty("--scene-tilt-x", "0.000")
      shell.style.setProperty("--scene-tilt-y", "0.000")
      shell.style.setProperty("--stage-tilt-x", "0.000")
      shell.style.setProperty("--stage-tilt-y", "0.000")
      shell.style.setProperty("--stage-pan-x", "0.00px")
      shell.style.setProperty("--stage-pan-y", "0.00px")
      shell.style.setProperty("--travel-lift", "0.00px")
      shell.style.setProperty("--travel-blur", "0.00px")
      shell.style.setProperty("--travel-scale", "0.0000")
      activeSceneIndexRef.current = 0
      setActiveSceneIndex(0)

      let introFrame = 0
      if (introPhaseRef.current === "entrance") {
        introFrame = window.requestAnimationFrame(() => {
          introPhaseRef.current = "ready"
          setIntroPhase("ready")
        })
      }

      return () => {
        if (introFrame) {
          window.cancelAnimationFrame(introFrame)
        }
      }
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const scenes = Array.from(shell.querySelectorAll<HTMLElement>(".depth-scene"))
    const sceneCameraLead = 0.58
    const maxStoryCursor = Math.max(scenes.length - 1 + sceneCameraLead, 1)
    let frame = 0
    let targetMouseX = 0
    let targetMouseY = 0
    let currentMouseX = 0
    let currentMouseY = 0
    let lensMouseX = 0
    let lensMouseY = 0
    let hasManualTravel = false
    let targetStoryCursor = sceneCameraLead
    let currentStoryCursor = reducedMotion.matches ? sceneCameraLead : -0.42
    let previousStoryCursor = currentStoryCursor
    let touchY: number | null = null
    let touchX: number | null = null
    let isActive = true
    let readyQueued = introPhaseRef.current === "ready"

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const smooth = (value: number) => {
      const t = clamp(value, 0, 1)
      return t * t * (3 - 2 * t)
    }
    const reach = (distance: number, span: number) => smooth(1 - distance / span)
    const isEditableTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest("input, textarea, select, option, [contenteditable='true']"))

    const canUseNativeScroll = (target: EventTarget | null, deltaY: number) => {
      if (!(target instanceof HTMLElement)) return false
      const scrollable = target.closest<HTMLElement>("[data-native-scroll]")
      if (!scrollable) return false

      const canScrollDown = scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1
      const canScrollUp = scrollable.scrollTop > 1
      return (deltaY > 0 && canScrollDown) || (deltaY < 0 && canScrollUp)
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (reducedMotion.matches) return
      
      const centerX = window.innerWidth / 2
      const centerY = window.innerHeight / 2
      
      targetMouseX = (e.clientX - centerX) / centerX
      targetMouseY = (e.clientY - centerY) / centerY
    }

    const resetMouse = () => {
      targetMouseX = 0
      targetMouseY = 0
    }

    const storyMin = sceneCameraLead - 0.06

    const applyStoryDelta = (delta: number) => {
      if (introPhaseRef.current !== "ready") return
      hasManualTravel = true
      targetStoryCursor = clamp(targetStoryCursor + delta, storyMin, maxStoryCursor)
    }

    const handleWheel = (event: WheelEvent) => {
      if (canUseNativeScroll(event.target, event.deltaY)) return

      event.preventDefault()

      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 0.024
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 0.15
          : 0.00072

      const wheelDelta = clamp(event.deltaY * multiplier, -0.14, 0.14)
      applyStoryDelta(wheelDelta)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return

      if (
        event.key === "ArrowDown" ||
        event.key === "PageDown" ||
        event.key === " " ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault()
        applyStoryDelta(0.14)
      } else if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "ArrowLeft") {
        event.preventDefault()
        applyStoryDelta(-0.14)
      } else if (event.key === "Home") {
        event.preventDefault()
        if (introPhaseRef.current !== "ready") return
        hasManualTravel = true
        targetStoryCursor = storyMin
      } else if (event.key === "End") {
        event.preventDefault()
        if (introPhaseRef.current !== "ready") return
        hasManualTravel = true
        targetStoryCursor = maxStoryCursor
      }
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (isEditableTarget(event.target) || canUseNativeScroll(event.target, 1)) {
        touchY = null
        touchX = null
        return
      }
      if (introPhaseRef.current !== "ready") return

      const touch = event.touches[0]
      if (!touch) return

      hasManualTravel = true
      touchY = touch.clientY
      touchX = touch.clientX
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (touchY === null || touchX === null) return

      const touch = event.touches[0]
      if (!touch) return

      const deltaY = touchY - touch.clientY
      const deltaX = touchX - touch.clientX

      if (Math.abs(deltaY) <= Math.abs(deltaX)) return

      event.preventDefault()
      applyStoryDelta(deltaY * 0.0012)
      touchY = touch.clientY
      touchX = touch.clientX
    }

    const handleTouchEnd = () => {
      touchY = null
      touchX = null
    }

    const queueIntroReady = () => {
      if (readyQueued || introPhaseRef.current !== "entrance") return
      readyQueued = true
      window.requestAnimationFrame(() => {
        if (!isActive) return
        introPhaseRef.current = "ready"
        setIntroPhase("ready")
      })
    }

    const updateScene = () => {
      if (!isActive) return

      if (reducedMotion.matches) {
        targetMouseX = 0
        targetMouseY = 0
      }

      // 降低更新频率，减少闪烁
      const mouseSmoothing = 0.15 // 从 0.092 提高到 0.15，减少中间帧
      const lensSmoothing = 0.05 // 从 0.02 提高到 0.05

      currentMouseX += (targetMouseX - currentMouseX) * mouseSmoothing
      currentMouseY += (targetMouseY - currentMouseY) * mouseSmoothing
      lensMouseX += (targetMouseX - lensMouseX) * lensSmoothing
      lensMouseY += (targetMouseY - lensMouseY) * lensSmoothing
      // 提高平滑度，减少抖动
      const storyLerp = reducedMotion.matches
        ? 1
        : !hasManualTravel && currentStoryCursor < sceneCameraLead - 0.02
          ? 0.08 // 从 0.046 提高到 0.08
          : 0.05 // 从 0.026 提高到 0.05
      currentStoryCursor += (targetStoryCursor - currentStoryCursor) * storyLerp

      const storyCursor = reducedMotion.matches ? Math.round(targetStoryCursor) : currentStoryCursor
      const visualStoryCursor = clamp(storyCursor, 0, maxStoryCursor)
      const sceneTimelineCursor = reducedMotion.matches ? 0 : storyCursor - sceneCameraLead
      const storyProgress = reducedMotion.matches ? 0 : clamp(visualStoryCursor / maxStoryCursor, 0, 1)
      const progress = reducedMotion.matches ? 0 : clamp(visualStoryCursor, 0, 1)
      const drift = reducedMotion.matches ? 0 : clamp(storyProgress, 0, 1)
      const pageProgress = reducedMotion.matches ? 0 : storyProgress
      const scrollY = reducedMotion.matches ? 0 : visualStoryCursor * window.innerHeight
      const velocity = reducedMotion.matches ? 0 : (currentStoryCursor - previousStoryCursor) * 120
      const travelDistance = reducedMotion.matches ? 0 : Math.abs(targetStoryCursor - currentStoryCursor)
      const tiltX = reducedMotion.matches ? 0 : clamp(lensMouseY * -8.6 + velocity * -0.03, -10, 10)
      const tiltY = reducedMotion.matches ? 0 : clamp(lensMouseX * 12.2, -13, 13)
      const stageTiltX = reducedMotion.matches ? 0 : clamp(lensMouseY * -7.2 + velocity * -0.018, -8.5, 8.5)
      const stageTiltY = reducedMotion.matches ? 0 : clamp(lensMouseX * 9.2, -10.5, 10.5)
      const stagePanX = reducedMotion.matches ? 0 : lensMouseX * 42
      const stagePanY = reducedMotion.matches ? 0 : lensMouseY * -30
      const travelLift = reducedMotion.matches ? 0 : Math.min(travelDistance * 180 + Math.abs(velocity) * 1.2, 100)
      const travelBlur = 0
      const travelScale = reducedMotion.matches ? 0 : Math.min(travelDistance * 0.002 + Math.abs(velocity) * 0.00006, 0.006)
      previousStoryCursor = currentStoryCursor

      if (introPhaseRef.current === "entrance") {
        if (reducedMotion.matches || (travelDistance < 0.01 && Math.abs(velocity) < 0.025)) {
          queueIntroReady()
        }
      }

      shell.style.setProperty("--hero-progress", progress.toFixed(3))
      shell.style.setProperty("--hero-drift", drift.toFixed(3))
      shell.style.setProperty("--hero-depth", (1 - progress).toFixed(3))
      shell.style.setProperty("--page-progress", pageProgress.toFixed(3))
      shell.style.setProperty("--story-progress", storyProgress.toFixed(3))
      shell.style.setProperty("--story-cursor", storyCursor.toFixed(3))
      
      shell.style.setProperty("--mouse-x", currentMouseX.toFixed(3))
      shell.style.setProperty("--mouse-y", currentMouseY.toFixed(3))
      shell.style.setProperty("--lens-x", lensMouseX.toFixed(3))
      shell.style.setProperty("--lens-y", lensMouseY.toFixed(3))
      shell.style.setProperty("--scroll-y", scrollY.toFixed(1))
      shell.style.setProperty("--scroll-velocity", velocity.toFixed(3))
      shell.style.setProperty("--scene-tilt-x", tiltX.toFixed(3))
      shell.style.setProperty("--scene-tilt-y", tiltY.toFixed(3))
      shell.style.setProperty("--stage-tilt-x", stageTiltX.toFixed(3))
      shell.style.setProperty("--stage-tilt-y", stageTiltY.toFixed(3))
      shell.style.setProperty("--stage-pan-x", `${stagePanX.toFixed(2)}px`)
      shell.style.setProperty("--stage-pan-y", `${stagePanY.toFixed(2)}px`)
      shell.style.setProperty("--travel-lift", `${travelLift.toFixed(2)}px`)
      shell.style.setProperty("--travel-blur", `${travelBlur.toFixed(2)}px`)
      shell.style.setProperty("--travel-scale", travelScale.toFixed(4))

      const sceneCursor = clamp(sceneTimelineCursor, 0, storySteps - 1)
      let nextActiveSceneIndex = activeSceneIndexRef.current
      while (sceneCursor >= nextActiveSceneIndex + 0.58 && nextActiveSceneIndex < storySteps - 1) {
        nextActiveSceneIndex += 1
      }
      while (sceneCursor <= nextActiveSceneIndex - 0.58 && nextActiveSceneIndex > 0) {
        nextActiveSceneIndex -= 1
      }
      if (nextActiveSceneIndex !== activeSceneIndexRef.current) {
        activeSceneIndexRef.current = nextActiveSceneIndex
        setActiveSceneIndex(nextActiveSceneIndex)
      }

      const palettes = themeRef.current === "dark" ? SCENE_PALETTES_DARK : SCENE_PALETTES
      const themeCursor = clamp(Math.max(sceneTimelineCursor, 0), 0, palettes.length - 1)
      const themeIndex = Math.floor(themeCursor)
      const nextThemeIndex = Math.min(palettes.length - 1, themeIndex + 1)
      const themeBlend = themeCursor - themeIndex
      const paletteA = palettes[themeIndex] ?? palettes[0]
      const paletteB = palettes[nextThemeIndex] ?? paletteA

      applyCinemaPalette(shell, {
        bgTop: mixRgb(paletteA.bgTop, paletteB.bgTop, themeBlend),
        bgBottom: mixRgb(paletteA.bgBottom, paletteB.bgBottom, themeBlend),
        ink: mixRgb(paletteA.ink, paletteB.ink, themeBlend),
        muted: mixRgb(paletteA.muted, paletteB.muted, themeBlend),
        line: mixRgb(paletteA.line, paletteB.line, themeBlend),
        accent: mixRgb(paletteA.accent, paletteB.accent, themeBlend),
        glow: mixRgb(paletteA.glow, paletteB.glow, themeBlend),
      })

      for (const [index, scene] of scenes.entries()) {
        const isHeroScene = index === 0
        const isSecurityScene = index === 1
        const offset = index - sceneTimelineCursor
        const absOffset = Math.abs(offset)
        const ahead = reducedMotion.matches ? 0 : Math.max(offset, 0)
        const behind = reducedMotion.matches ? 0 : Math.max(-offset, 0)
        const sceneFocus = reducedMotion.matches ? (index === 0 ? 1 : 0) : clamp(1 - absOffset * 0.34, 0, 1)
        const sceneCurrentness = reducedMotion.matches ? (index === 0 ? 1 : 0) : clamp(1 - absOffset * 0.48, 0, 1)
        const scenePresence = reducedMotion.matches ? (index === 0 ? 1 : 0) : clamp(reach(ahead, 2.32) * (1 - smooth(clamp((behind - 1.16) / 0.44, 0, 1))), 0, 1)
        const sceneDepth = reducedMotion.matches ? 0 : clamp(offset, -1.3, 2.1)
        const sceneDrift = reducedMotion.matches ? 0 : clamp(velocity * (0.28 + sceneFocus * 0.36), -34, 34)
        const sceneBaseX = 0
        const sceneBaseY = reducedMotion.matches ? 0 : ahead * 144 - behind * 12
        const sceneBaseZ = reducedMotion.matches ? 0 : ahead > 0 ? -(ahead * 9200 + ahead * ahead * 5200) : behind * 3000
        const sceneShellScale = reducedMotion.matches ? 1 : ahead > 0 ? clamp(1 - ahead * 0.08, 0.68, 1) : clamp(1 + behind * 0.04, 1, 1.12)
        const sceneShellBlur = 0
        const titleEntrySpan = isSecurityScene ? 1.62 : 1.42
        const titleLockSpan = isSecurityScene ? 0.92 : 0.82
        const titlePassSpan = isHeroScene ? 0.76 : 0.94
        const titleExitStart = isHeroScene ? 0.1 : 0.22
        const titleExitSpan = isHeroScene ? 0.14 : 0.2
        const titleEntry = reducedMotion.matches ? sceneFocus : reach(ahead, titleEntrySpan)
        const titleCentering = reducedMotion.matches ? sceneFocus : clamp(titleEntry * (isSecurityScene ? 0.94 : 0.9) + sceneCurrentness * (isSecurityScene ? 0.06 : 0.1), 0, 1)
        const titleLock = reducedMotion.matches ? sceneFocus : reach(ahead, titleLockSpan)
        const titlePass = reducedMotion.matches ? 0 : smooth(clamp(behind / titlePassSpan, 0, 1))
        const titleExit = reducedMotion.matches ? 1 : 1 - smooth(clamp((behind - titleExitStart) / titleExitSpan, 0, 1))
        const bodyEntry = reducedMotion.matches ? sceneFocus : reach(ahead, 1.18)
        const bodyExit = reducedMotion.matches ? 1 : 1 - smooth(clamp((behind - 0.28) / 0.2, 0, 1))
        const surfaceEntry = reducedMotion.matches ? sceneFocus : reach(ahead, 1.02)
        const surfaceExit = reducedMotion.matches ? 1 : 1 - smooth(clamp((behind - 0.36) / 0.24, 0, 1))
        const mediaEntry = reducedMotion.matches ? sceneFocus : reach(ahead, 1.14)
        const mediaExit = reducedMotion.matches ? 1 : 1 - smooth(clamp((behind - 0.46) / 0.28, 0, 1))
        const titleProgress = reducedMotion.matches
          ? sceneFocus
          : clamp(
              titleCentering * (isSecurityScene ? 1.02 : 0.8) +
                titlePass * (isSecurityScene ? 0.26 : isHeroScene ? 0.18 : 0.22),
              0,
              isSecurityScene ? 1.12 : 1.02,
            )
        const titleFuturePresence = reducedMotion.matches ? sceneFocus : ahead > 0 ? reach(ahead, isSecurityScene ? 1.58 : 1.32) : 1
        const titlePresence = reducedMotion.matches
          ? sceneFocus
          : clamp(titleFuturePresence * titleExit, 0, 1)
        const bodyProgress = reducedMotion.matches ? sceneFocus : clamp(bodyEntry * 0.8 + sceneCurrentness * 0.2, 0, 1)
        const bodyPresence = reducedMotion.matches
          ? sceneFocus
          : clamp(bodyEntry * bodyExit, 0, 1)
        const surfaceProgress = reducedMotion.matches ? sceneFocus : clamp(surfaceEntry * 0.78 + sceneCurrentness * 0.22, 0, 1)
        const surfacePresence = reducedMotion.matches
          ? sceneFocus
          : clamp(surfaceEntry * surfaceExit, 0, 1)
        const mediaProgress = reducedMotion.matches ? sceneFocus : clamp(mediaEntry * 0.8 + sceneCurrentness * 0.2, 0, 1)
        const mediaPresence = reducedMotion.matches
          ? sceneFocus
          : clamp(mediaEntry * mediaExit, 0, 1)
        const sceneDepthFade = reducedMotion.matches ? 0 : clamp(ahead * 0.48 + behind * 0.12, 0, 1)
        const sceneOcclusion = reducedMotion.matches ? sceneCurrentness : clamp(0.12 + reach(ahead, 1.9) * 0.88 - smooth(clamp((behind - 0.58) / 0.32, 0, 1)) * 0.86, 0, 1)
        const sceneVeil = reducedMotion.matches ? sceneCurrentness : clamp(0.14 + reach(ahead, 1.64) * 0.72 + sceneFocus * 0.16 - smooth(clamp((behind - 0.42) / 0.28, 0, 1)) * 0.68, 0, 1)
        const sceneBackplate = reducedMotion.matches
          ? (index === 0 ? 0.96 : 0)
          : clamp(0.14 + sceneCurrentness * 0.78 + reach(ahead, 1.08) * 0.18 - behind * 0.12, 0, 0.98)
        const sceneLayer = reducedMotion.matches
          ? storySteps - index
          : Math.max(1, 1600 - Math.round(offset * 180) - index * 4)

        scene.style.setProperty("--scene-index", `${index}`)
        scene.style.setProperty("--scene-progress", sceneFocus.toFixed(3))
        scene.style.setProperty("--scene-focus", sceneFocus.toFixed(3))
        scene.style.setProperty("--scene-currentness", sceneCurrentness.toFixed(3))
        scene.style.setProperty("--scene-visibility", scenePresence.toFixed(3))
        scene.style.setProperty("--scene-presence", scenePresence.toFixed(3))
        scene.style.setProperty("--scene-depth", sceneDepth.toFixed(3))
        scene.style.setProperty("--scene-offset", offset.toFixed(3))
        scene.style.setProperty("--scene-abs-offset", absOffset.toFixed(3))
        scene.style.setProperty("--scene-ahead", ahead.toFixed(3))
        scene.style.setProperty("--scene-behind", behind.toFixed(3))
        scene.style.setProperty("--scene-drift", sceneDrift.toFixed(3))
        scene.style.setProperty("--scene-base-x", `${sceneBaseX.toFixed(1)}px`)
        scene.style.setProperty("--scene-base-y", `${sceneBaseY.toFixed(1)}px`)
        scene.style.setProperty("--scene-base-z", `${sceneBaseZ.toFixed(1)}px`)
        scene.style.setProperty("--scene-z", `${sceneBaseZ.toFixed(1)}px`)
        scene.style.setProperty("--scene-shell-scale", sceneShellScale.toFixed(3))
        scene.style.setProperty("--scene-shell-inverse-scale", (1 / sceneShellScale).toFixed(3))
        scene.style.setProperty("--scene-shell-blur", `${sceneShellBlur.toFixed(2)}px`)
        scene.style.setProperty("--scene-title-presence", titlePresence.toFixed(3))
        scene.style.setProperty("--scene-title-progress", titleProgress.toFixed(3))
        scene.style.setProperty("--scene-title-lock", titleLock.toFixed(3))
        scene.style.setProperty("--scene-title-pass", titlePass.toFixed(3))
        scene.style.setProperty("--scene-body-presence", bodyPresence.toFixed(3))
        scene.style.setProperty("--scene-body-progress", bodyProgress.toFixed(3))
        scene.style.setProperty("--scene-surface-presence", surfacePresence.toFixed(3))
        scene.style.setProperty("--scene-surface-progress", surfaceProgress.toFixed(3))
        scene.style.setProperty("--scene-media-presence", mediaPresence.toFixed(3))
        scene.style.setProperty("--scene-media-progress", mediaProgress.toFixed(3))
        scene.style.setProperty("--scene-depth-fade", sceneDepthFade.toFixed(3))
        scene.style.setProperty("--scene-occlusion", sceneOcclusion.toFixed(3))
        scene.style.setProperty("--scene-veil", sceneVeil.toFixed(3))
        scene.style.setProperty("--scene-backplate", sceneBackplate.toFixed(3))
        scene.style.setProperty("--scene-pointer", sceneCurrentness > 0.76 ? "auto" : "none")
        scene.style.zIndex = String(sceneLayer)
      }

      frame = requestAnimationFrame(updateScene)
      
    }

    frame = requestAnimationFrame(updateScene)
    window.addEventListener("mousemove", handleMouseMove, { passive: true })
    window.addEventListener("mouseleave", resetMouse)
    window.addEventListener("wheel", handleWheel, { passive: false })
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("touchstart", handleTouchStart, { passive: true })
    window.addEventListener("touchmove", handleTouchMove, { passive: false })
    window.addEventListener("touchend", handleTouchEnd)
    reducedMotion.addEventListener?.("change", handleTouchEnd)

    return () => {
      isActive = false
      cancelAnimationFrame(frame)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseleave", resetMouse)
      window.removeEventListener("wheel", handleWheel)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("touchstart", handleTouchStart)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
      reducedMotion.removeEventListener?.("change", handleTouchEnd)
    }
  }, [introActive, isDesktopViewport, storySteps])

  function log(message: string) {
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false })
    setLogs((current) => [`${stamp} ${message}`, ...current].slice(0, 24))
  }

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    const id = makeId()
    setToasts((current) => [...current, { id, message, type }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3000)
  }

  function upsertTransfer(next: TransferState) {
    setTransfers((current) => {
      const index = current.findIndex((item) => item.id === next.id)
      if (index === -1) return [next, ...current].slice(0, 10)
      return current.map((item, itemIndex) => (itemIndex === index ? next : item))
    })
  }

  function patchTransfer(id: string, patch: Partial<TransferState>, seed?: Omit<TransferState, "id">) {
    setTransfers((current) => {
      const index = current.findIndex((item) => item.id === id)
      if (index === -1) {
        if (!seed) return current
        return [{ id, ...seed, ...patch }, ...current].slice(0, 10)
      }
      return current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    })
  }

  function clearRoomState() {
    setPeerId(null)
    setPeerConnected(false)
    setQrCodeUrl("")
    pendingIncomingRef.current = null
  }

  async function handleRelayChunk(payload: RelayChunkPayload) {
    const key = keyRef.current
    if (!key) {
      log("无法解密：缺少密钥")
      showToast("解密失败：当前没有可用密钥", "error")
      return
    }

    try {
      const decrypted = await decryptRelayChunk(payload, key)
      const meta = payload._meta

      if (meta) {
        pendingIncomingRef.current = {
          meta,
          chunks: Array.from({ length: meta.total }),
          received: 0,
        }
        upsertTransfer({
          id: meta.id,
          name: meta.name,
          size: meta.size,
          direction: "receive",
          status: "transferring",
          progress: 0,
          detail: "接收中",
        })
      }

      const pending = pendingIncomingRef.current
      if (!pending) {
        log("收到的数据块缺少元信息")
        showToast("收到异常数据块", "error")
        return
      }

      if (payload.index >= pending.chunks.length) {
        log(`数据块索引超出范围：${payload.index}`)
        showToast("收到无效的数据块索引", "error")
        return
      }

      pending.chunks[payload.index] = decrypted
      pending.received++
      patchTransfer(pending.meta.id, {
        progress: pending.received / pending.meta.total,
        detail: `已接收 ${pending.received}/${pending.meta.total} 块`,
      })
    } catch (error) {
      log(`数据块解密失败：${error instanceof Error ? error.message : "未知错误"}`)
      showToast("数据块解密失败", "error")
      
      const pending = pendingIncomingRef.current
      if (pending) {
        patchTransfer(pending.meta.id, {
          status: "error",
          detail: "解密失败",
        })
      }
    }
  }

  async function finishIncomingTransfer(hash: string) {
    const pending = pendingIncomingRef.current
    if (!pending) return
    pendingIncomingRef.current = null

    try {
      if (pending.chunks.some((chunk) => !chunk)) {
        patchTransfer(pending.meta.id, {
          status: "error",
          detail: "缺少数据块",
        })
        log(`接收失败：${pending.meta.name} 不完整`)
        showToast(`接收失败：${pending.meta.name} 缺少数据块`, "error")
        return
      }

      const blob = new Blob((pending.chunks as Uint8Array[]).map((chunk) => chunk.slice().buffer))
      const expectedHash = hash || pending.meta.hash || ""
      if (expectedHash) {
        const actualHash = await sha256Hex(await blob.arrayBuffer())
        if (actualHash !== expectedHash) {
          patchTransfer(pending.meta.id, {
            status: "error",
            detail: "校验不一致",
          })
          log(`接收失败：${pending.meta.name} 完整性校验不一致`)
          showToast(`接收失败：${pending.meta.name} 完整性校验未通过`, "error")
          return
        }
      }

      const url = URL.createObjectURL(blob)
      objectUrlsRef.current.push(url)
      patchTransfer(pending.meta.id, {
        status: "done",
        progress: 1,
        detail: "接收完成",
        downloadUrl: url,
      })
      downloadBlob(url, pending.meta.name)
      log(`接收完成：${pending.meta.name}`)
      showToast(`已接收文件：${pending.meta.name}`, "success")
    } catch (error) {
      patchTransfer(pending.meta.id, {
        status: "error",
        detail: "接收失败",
      })
      log(`接收失败：${error instanceof Error ? error.message : "未知错误"}`)
      showToast(`接收文件失败：${pending.meta.name}`, "error")
    }
  }

  async function handleServerMessage(message: RelayServerMessage) {
    try {
      switch (message.type) {
        case "created":
          keyRef.current = await deriveRelayKey(message.room)
          setRoomCode(message.room)
          clearRoomState()
          setQrCodeUrl(
            await QRCode.toDataURL(`${window.location.origin}?room=${message.room}`, {
              margin: 1,
              width: 216,
              color: { dark: "#102039", light: "#f7fbff" },
            }),
          )
          log(`房间已创建：${message.room}`)
          showToast(`房间已创建：${message.room}`, "success")
          break

        case "joined":
          keyRef.current = await deriveRelayKey(message.room)
          setRoomCode(message.room)
          setPeerId(message.peer)
          setPeerConnected(Boolean(message.peer))
          setQrCodeUrl("")
          log(`已加入房间：${message.room}`)
          showToast(`已加入房间：${message.room}`, "success")
          break

        case "peer_joined":
          setPeerId(message.peerId)
          setPeerConnected(true)
          log(`对端已加入：${message.peerId}`)
          showToast("对端已连接，可以开始传输", "success")
          break

        case "peer_leave":
          setPeerConnected(false)
          setPeerId(null)
          log("对端已离开房间")
          showToast("对端已断开连接", "info")
          break

        case "relay":
          await handleRelayChunk(message.data)
          break

        case "done":
          await finishIncomingTransfer(message.hash)
          break

        case "error":
          log(`服务端错误：${message.message}`)
          showToast(`服务端错误：${message.message}`, "error")
          break

        case "signal":
          log("收到未使用的信令事件。")
          break
      }
    } catch (error) {
      log(`处理服务端消息时出错：${error instanceof Error ? error.message : "未知错误"}`)
      showToast("处理服务端消息失败", "error")
    }
  }

  function connectSocket() {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    const isRoomFlowActive = Boolean(roomCodeRef.current || autoJoinRef.current)
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    if (isRoomFlowActive) {
      setConnection("connecting")
    }
    const socket = new WebSocket(relayUrl)
    wsRef.current = socket

    socket.onopen = () => {
      relayNoticeShownRef.current = false
      setConnection("online")
      log(`已连接到中继：${relayUrl}`)
      if (autoCreateRef.current) {
        autoCreateRef.current = false
        void createRoom()
      }
      if (autoJoinRef.current) {
        const code = autoJoinRef.current
        autoJoinRef.current = ""
        void joinRoom(code)
      }
    }

    socket.onclose = () => {
      wsRef.current = null
      setConnection("offline")
      setPeerConnected(false)
      setPeerId(null)
      log("中继连接已关闭")

      if (roomCodeRef.current || autoJoinRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          connectSocket()
        }, 2200)
      }
    }

    socket.onerror = () => {
      log("中继连接发生错误")
      if (!relayNoticeShownRef.current && (roomCodeRef.current || autoJoinRef.current)) {
        relayNoticeShownRef.current = true
        showToast("连接异常，正在重试...", "error")
      }
    }

    socket.onmessage = async (event) => {
      if (typeof event.data !== "string") return
      try {
        const message = JSON.parse(event.data) as RelayServerMessage
        await handleServerMessage(message)
      } catch {
        log("收到无效的中继消息")
      }
    }
  }

  useEffect(() => {
    if (initialRoom) connectSocket()
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url)
    }
  }, [relayUrl, initialRoom])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (roomCode) url.searchParams.set("room", roomCode)
    else url.searchParams.delete("room")
    window.history.replaceState({}, "", url)
  }, [roomCode])

  function sendMessage(message: RelayClientMessage) {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      log("中继服务器当前未连接")
      showToast("尚未连接到中继服务器", "error")
      return false
    }
    try {
      socket.send(JSON.stringify(message))
      return true
    } catch (error) {
      log(`发送消息失败：${error instanceof Error ? error.message : "未知错误"}`)
      showToast("向服务器发送消息失败", "error")
      return false
    }
  }

  async function createRoom() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      autoCreateRef.current = true
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connectSocket()
      }
      return
    }
    if (!sendMessage({ type: "create" })) return
    setRoomCode("")
    clearRoomState()
    log("正在创建房间")
  }

  async function joinRoom(value = joinCode) {
    const normalized = normalizeRoomCode(value)
    if (!normalized) {
      log("请先输入房间码")
      showToast("请先输入房间码", "error")
      return
    }
    setJoinCode(normalized)

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      autoJoinRef.current = normalized
      if (!wsRef.current) connectSocket()
      return
    }

    try {
      keyRef.current = await deriveRelayKey(normalized)
      if (sendMessage({ type: "join", room: normalized })) {
        log(`正在加入房间：${normalized}`)
      }
    } catch (error) {
      log(`加入房间失败：${error instanceof Error ? error.message : "未知错误"}`)
      showToast("加入房间失败", "error")
    }
  }

  function leaveRoom() {
    sendMessage({ type: "leave" })
    setRoomCode("")
    keyRef.current = null
    clearRoomState()
    log("已离开房间")
  }

  async function sendFile(file: File) {
    const socket = wsRef.current
    const key = keyRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      log("请先连接到中继")
      showToast("尚未连接到中继服务器", "error")
      return
    }
    if (!roomCode || !key) {
      log("请先创建或加入房间")
      showToast("请先创建或加入房间", "error")
      return
    }
    if (!peerConnected) {
      log("请等待对端加入")
      showToast("正在等待对端连接", "error")
      return
    }

    const id = makeId()
    
    try {
      const buffer = await file.arrayBuffer()
      const hash = await sha256Hex(buffer)
      const total = Math.max(1, Math.ceil(buffer.byteLength / RELAY_CHUNK_SIZE))

      upsertTransfer({
        id,
        name: file.name,
        size: file.size,
        direction: "send",
        status: "transferring",
        progress: 0,
        detail: "准备发送",
      })

      for (let index = 0; index < total; index++) {
        const start = index * RELAY_CHUNK_SIZE
        const end = Math.min(start + RELAY_CHUNK_SIZE, buffer.byteLength)
        const chunk = new Uint8Array(buffer.slice(start, end))
        const encrypted = await encryptRelayChunk(chunk, key)
        const meta: RelayFileMeta | null =
          index === 0
            ? {
                id,
                name: file.name,
                size: file.size,
                total,
                hash,
              }
            : null

        socket.send(
          JSON.stringify({
            type: "relay",
            data: {
              ...encrypted,
              index,
              total,
              _meta: meta,
            },
          } satisfies RelayClientMessage),
        )

        patchTransfer(id, {
          progress: (index + 1) / total,
          detail: `已发送 ${index + 1}/${total} 块`,
        })

        await new Promise((resolve) => window.setTimeout(resolve, 0))
      }

      socket.send(JSON.stringify({ type: "done", hash } satisfies RelayClientMessage))
      patchTransfer(id, {
        status: "done",
        progress: 1,
        detail: "发送完成",
      })
      log(`发送完成：${file.name}`)
      showToast(`已发送文件：${file.name}`, "success")
    } catch (error) {
      log(`发送失败：${error instanceof Error ? error.message : "未知错误"}`)
      patchTransfer(id, {
        status: "error",
        detail: "发送失败",
      })
      showToast(`发送文件失败：${file.name}`, "error")
    }
  }

  const roomLink = roomCode ? `${window.location.origin}?room=${roomCode}` : ""
  const latestLog = logs[0] ?? (connection === "connecting" ? "正在连接中继..." : "已准备就绪。")
  const recentTransfers = transfers.slice(0, 4)
  const activeTransfers = transfers.filter((transfer) => transfer.status === "transferring").length
  const stageLabel = peerConnected ? "对端已就绪" : roomCode ? "等待对端" : "创建房间"
  const interactionHint = isDesktopViewport ? "滚轮推进" : "原生滚动"
  const loadingCaption = isDesktopViewport
    ? "滚轮推进场景，页面本身不做原生上下滚动"
    : "???????????????????"
  const sceneLabels = ["入口", "安全", "建房", "分享", "传输", "延展"]
  const securityPillarsSafe = [
    "AES-256 端到端加密",
    "SHA-256 完整性校验",
    "零知识中继转发",
  ]
  const upcomingFeaturesSafe = [
    {
      id: "direct",
      label: "01",
      title: "WebRTC 直连",
      copy: "优先建立点对点直连，把时延压低，也把中间暴露面继续缩小。",
    },
    {
      id: "group",
      label: "02",
      title: "多端临时房间",
      copy: "让同一个房间接入多个设备，适合现场协作、临时小组和批量分发。",
    },
    {
      id: "history",
      label: "03",
      title: "传输记录",
      copy: "保留完成、失败与重试记录，方便回看，不必每次都重新组织流程。",
    },
  ]

  return (
    <main
      className={`page-shell ${introPhase === "loading" ? "is-intro-loading" : introPhase === "entrance" ? "is-intro-entrance" : "is-intro-ready"}`.trim()}
      ref={shellRef}
    >
      <CustomCursor />
      <LoadingScreen
        minDuration={1500}
        caption={loadingCaption}
        onLoaded={() => {
          setIntroPhase("entrance")
        }}
      />

      <div className="scroll-progress-bar" aria-hidden="true" />
      
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      
      <ThemeToggle theme={theme} onToggle={toggleTheme} />

      <ProgressiveSection as="header" className="top-rail" delay={0} eager>
        <StatusRail connection={connection} stageLabel={stageLabel} roomCode={roomCode} />
      </ProgressiveSection>

      <div className="cinema-chrome" aria-hidden="true">
        <div className="chrome-brand">
          <span className="chrome-wordmark">PREACH</span>
          <span className="chrome-meta">单页沉浸式加密传输</span>
        </div>
        <div className="chrome-edge chrome-edge-left">{sceneLabels[activeSceneIndex]}</div>
        <div className="chrome-edge chrome-edge-right">
          {String(activeSceneIndex + 1).padStart(2, "0")} / {String(storySteps).padStart(2, "0")}
        </div>
        <div className="chrome-footer chrome-footer-left">
          <span>{interactionHint}</span>
          <span>{peerConnected ? "对端已接入" : roomCode ? "房间已创建，等待加入" : "尚未创建房间"}</span>
        </div>
        <div className="chrome-footer chrome-footer-right">
          <span>{roomCode ? `房间 ${roomCode}` : "房间待创建"}</span>
          <span>{connection === "online" ? "中继在线" : connection === "connecting" ? "正在连接中继" : "中继离线"}</span>
        </div>
      </div>

      <section className="story-shell cinema-shell" ref={heroRef}>
        <div className="cinema-stage">
          <article className="depth-scene depth-scene-hero" aria-labelledby="hero-title">
            <SceneAtmosphere />
            <div className="scene-noise" aria-hidden="true" />
            <SceneMediaCluster className="scene-media-cluster-hero" items={HERO_MEDIA} />
            <SceneHeadingLayer
              as="h1"
              className="scene-heading-layer-hero scene-heading-layer-left"
              marker="端到端加密 / 本地配对 / 无需账号"
              markerClassName="scene-eyebrow"
              titleId="hero-title"
              title="PREACH"
              body="不是云盘，不是注册流程，也不是冗长的分享链路。PREACH 只保留一个临时房间、一条加密通道，以及当下就能发出去的文件。"
              titleClassName="scene-title-hero"
              bodyClassName="scene-body-hero"
            />
            <div className="scene-grid scene-grid-hero">
              <div className="scene-copy scene-copy-support scene-copy-support-empty" aria-hidden="true" />

              <div className="scene-aside scene-aside-hero">
                <div className="scene-ledger">
                  <span className="scene-ledger-label">状态</span>
                  <strong>{connection === "online" ? "中继在线" : connection === "connecting" ? "中继连接中" : "中继离线"}</strong>
                </div>
                <div className="scene-ledger">
                  <span className="scene-ledger-label">房间</span>
                  <strong>{roomCode || "待创建"}</strong>
                </div>
                <div className="scene-ledger">
                  <span className="scene-ledger-label">对端</span>
                  <strong>{peerConnected ? peerId ?? "已连接" : "等待中"}</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="depth-scene depth-scene-security" aria-labelledby="security-title">
            <SceneAtmosphere />
            <SceneMediaCluster className="scene-media-cluster-security" items={SECURITY_MEDIA} />
            <SceneHeadingLayer
              as="h2"
              className="scene-heading-layer-security scene-heading-layer-left"
              marker="01"
              markerClassName="scene-index"
              titleId="security-title"
              title={
                <>
                  安全优先。
                  <br />
                  中继只做转发。
                </>
              }
              body="密钥在端上生成，文件先加密再切块，中继只负责搬运。接收端完成重组后，再做完整性校验。"
            />
            <div className="scene-grid scene-grid-split">
              <div className="scene-copy scene-copy-support scene-copy-support-empty" aria-hidden="true" />

              <div className="scene-surface scene-surface-metrics">
                <div className="scene-metric-list">
                  {securityPillarsSafe.map((item) => (
                    <div className="scene-metric" key={item}>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <p className="scene-note">
                  不做云盘替代，不做复杂同步。只解决“现在把这个文件安全发给对面”这一件事。
                </p>
              </div>
            </div>
          </article>

          <article className="depth-scene depth-scene-room" id="main-content" aria-labelledby="room-title">
            <SceneAtmosphere />
            <SceneMediaCluster className="scene-media-cluster-room" items={ROOM_MEDIA} />
            <SceneHeadingLayer
              as="h2"
              className="scene-heading-layer-room scene-heading-layer-right"
              marker="02"
              markerClassName="scene-index"
              titleId="room-title"
              title={
                <>
                  建房或入房。
                  <br />
                  两步完成配对。
                </>
              }
              body="房间是唯一入口。创建后立刻得到短码，对端输入即可接入，不引入额外身份系统。"
            />
            <div className="scene-grid scene-grid-split">
              <div className="scene-copy scene-copy-support">
                <div className="scene-room-readout">
                  <span className="scene-ledger-label">当前房间码</span>
                  <strong>{roomCode || "------"}</strong>
                  <div className="scene-room-meta">
                    <span>{peerConnected ? "对端已接入" : "等待对端加入"}</span>
                    <span>{activeTransfers} 个活动传输</span>
                  </div>
                </div>
              </div>

              <div className="scene-surface scene-surface-control">
                <RoomControls
                  joinCode={joinCode}
                  roomCode={roomCode}
                  peerConnected={peerConnected}
                  onJoinCodeChange={setJoinCode}
                  onCreateRoom={() => void createRoom()}
                  onJoinRoom={() => void joinRoom()}
                  onLeaveRoom={leaveRoom}
                />
              </div>
            </div>
          </article>

          <article className="depth-scene depth-scene-share" aria-labelledby="share-title">
            <SceneAtmosphere />
            <SceneMediaCluster className="scene-media-cluster-share" items={SHARE_MEDIA} />
            <SceneHeadingLayer
              as="h2"
              className="scene-heading-layer-share scene-heading-layer-left"
              marker="03"
              markerClassName="scene-index"
              titleId="share-title"
              title={
                <>
                  分享房间。
                  <br />
                  然后直接发送。
                </>
              }
              body="链接、短码、二维码同时给出。对端接入后，发送动作被压缩到一个上传入口里，不让用户在页面里找路径。"
            />
            <div className="scene-grid scene-grid-share">
              <div className="scene-copy scene-copy-support">
                <div className="scene-surface scene-surface-share">
                  <ShareControls
                    roomLink={roomLink}
                    roomCode={roomCode}
                    onCopyLink={() =>
                      roomLink
                        ? copyText(
                            roomLink,
                            () => {
                              log("分享链接已复制")
                              showToast("分享链接已复制", "success")
                            },
                            () => {
                              log("写入剪贴板失败")
                              showToast("复制分享链接失败", "error")
                            },
                          )
                        : undefined
                    }
                    onCopyCode={() =>
                      roomCode
                        ? copyText(
                            roomCode,
                            () => {
                              log("房间码已复制")
                              showToast("房间码已复制", "success")
                            },
                            () => {
                              log("写入剪贴板失败")
                              showToast("复制房间码失败", "error")
                            },
                          )
                        : undefined
                    }
                  />
                </div>
              </div>

              <div className="scene-stack">
                <div className="scene-surface scene-surface-qr">
                  <QRCodeDisplay qrCodeUrl={qrCodeUrl} />
                </div>
                <div className="scene-surface scene-surface-upload">
                  <FileUpload peerConnected={peerConnected} onFileSelect={(file) => void sendFile(file)} />
                </div>
              </div>
            </div>
          </article>

          <article className="depth-scene depth-scene-transfer" aria-labelledby="transfer-title">
            <SceneAtmosphere />
            <SceneMediaCluster className="scene-media-cluster-transfer" items={TRANSFER_MEDIA} />
            <SceneHeadingLayer
              as="h2"
              className="scene-heading-layer-transfer scene-heading-layer-right"
              marker="04"
              markerClassName="scene-index"
              titleId="transfer-title"
              title={
                <>
                  状态即时可见。
                  <br />
                  完成后直接落地。
                </>
              }
              body="不隐藏传输过程。每次发送、接收、完成或失败都给出明确信号，减少“到底有没有成功”的不确定感。"
            />
            <div className="scene-grid scene-grid-transfer">
              <div className="scene-copy scene-copy-support">
                <div className="scene-ledger-stack">
                  <div className="scene-ledger">
                    <span className="scene-ledger-label">最新日志</span>
                    <strong>{latestLog}</strong>
                  </div>
                  <div className="scene-ledger">
                    <span className="scene-ledger-label">最近传输</span>
                    <strong>{recentTransfers.length}</strong>
                  </div>
                </div>
              </div>

              <div className="scene-surface scene-surface-transfer">
                <TransferList
                  transfers={recentTransfers}
                  onDownload={downloadBlob}
                  onRemove={(id) => {
                    setTransfers((prev) => prev.filter((t) => t.id !== id))
                    showToast("传输记录已移除", "info")
                  }}
                />
              </div>
            </div>
          </article>

          <article className="depth-scene depth-scene-future" aria-labelledby="future-title">
            <SceneAtmosphere />
            <SceneMediaCluster className="scene-media-cluster-future" items={FUTURE_MEDIA} />
            <SceneHeadingLayer
              as="h2"
              className="scene-heading-layer-future scene-heading-layer-left"
              marker="05"
              markerClassName="scene-index"
              titleId="future-title"
              title={
                <>
                  下一步不是加更多 UI。
                  <br />
                  而是继续缩短路径。
                </>
              }
              body="后续能力依然围绕更短链路、更少步骤、更直接的端间传递，而不是把首页继续堆成仪表盘。"
            />
            <div className="scene-grid scene-grid-future">
              <div className="scene-copy scene-copy-support scene-copy-support-empty" aria-hidden="true" />

              <div className="scene-future-list">
                {upcomingFeaturesSafe.map((feature) => (
                  <article className="future-item" key={feature.id}>
                    <span className="future-label">{feature.label}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </article>
        </div>

        <div className="story-track" aria-hidden="true">
          {["hero", "security", "room", "share", "transfer", "future"].map((step) => (
            <section className="story-step chapter" key={step} data-step={step} />
          ))}
        </div>
      </section>

      <ToastContainer toasts={toasts} />
    </main>
  )
}
