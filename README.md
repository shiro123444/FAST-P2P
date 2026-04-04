# @tui-framework

A minimal TUI (Terminal User Interface) framework extracted from OpenCode's `@opentui` implementation.

## Running The P2P Example

The P2P demo in `example/p2p.ts` depends on `hyperswarm`.

- From `packages/tui-framework`:

```bash
npx --yes tsx ./example/p2p.ts
```

- From `packages/tui-framework/example`:

```bash
npx --yes tsx ./p2p.ts
```

- Running with Bun currently does not support the required libuv API (`uv_interface_addresses`) used by the native module.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  render(App, options)                 │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    TUI Framework                             │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │              Solid.js Reactive Layer               │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │    │
│  │  │ useKeyboard │ │ useRenderer │ │useTerminal  │  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘  │    │
│  └──────────────────────┬──────────────────────────────┘    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │              Renderable Components                   │    │
│  │  ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌────────┐  │    │
│  │  │   box   │ │  text   │ │ scrollbox │ │textarea│  │    │
│  │  └─────────┘ └─────────┘ └───────────┘ └────────┘  │    │
│  └──────────────────────┬──────────────────────────────┘    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │              Core Primitives                         │    │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │  RGBA  │ │  Keys  │ │  Mouse   │ │ Events   │  │    │
│  │  └────────┘ └────────┘ └──────────┘ └──────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│              Output Layer (ANSI Escape Sequences)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Box Model → Layout → ANSI Render → stdout          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Renderables

The fundamental UI units are **Renderables** - objects that know how to render themselves to the terminal:

```typescript
interface Renderable {
  id: number
  isDestroyed: boolean
  focus(): void
  blur(): void
  getLayoutNode(): LayoutNode
}
```

Key renderable types:

- **BoxRenderable** - Container with layout (flexbox-like)
- **TextareaRenderable** - Editable text input
- **ScrollBoxRenderable** - Scrollable container

### 2. Layout System

The layout system uses a flexbox-inspired model:

```typescript
interface BoxProps {
  flexDirection?: "row" | "column"
  flexGrow?: number
  flexShrink?: number
  gap?: number
  padding?: number
  margin?: number
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch"
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between"
}
```

### 3. Colors (RGBA)

Color is represented as floating-point RGBA values (0-1):

```typescript
RGBA.fromHex("#fab283") // From hex string
RGBA.fromInts(255, 165, 32) // From 0-255 integers
RGBA.fromValues(1.0, 0.65, 0.5, 0.8) // Direct values
```

### 4. Keyboard Events

Keyboard events flow through a handler chain:

```
process.stdin → useKeyboard() → Keybind.match() → Action
```

```typescript
interface KeyboardEvent {
  name: string // "a", "return", "escape", etc.
  ctrl?: boolean
  meta?: boolean // Alt/Option
  shift?: boolean
  super?: boolean // Cmd/Windows
  preventDefault(): void
  stopPropagation(): void
}
```

### 5. Mouse Events

Mouse interaction is handled via callbacks on renderables:

```typescript
interface MouseEvent {
  button: MouseButton // LEFT, MIDDLE, RIGHT, etc.
  x: number
  y: number
  target?: Renderable
}
```

## Hooks API

### `useKeyboard(handler)`

Register a global keyboard handler:

```typescript
useKeyboard((evt) => {
  if (evt.ctrl && evt.name === "c") {
    console.log("Copy")
  }
  if (evt.name === "escape") {
    renderer.clearSelection()
  }
})
```

### `useRenderer()`

Get the renderer instance for manual control:

```typescript
const renderer = useRenderer()

renderer.requestRender() // Force re-render
renderer.getSelection() // Get selected text
renderer.clearSelection() // Clear selection
renderer.setTerminalTitle("My App") // Set window title
renderer.suspend() // Suspend (for external editors)
renderer.resume() // Resume
renderer.destroy() // Clean shutdown
```

### `useTerminalDimensions()`

Get current terminal size:

```typescript
const dims = useTerminalDimensions()
console.log(dims.width, dims.height) // e.g., 120, 40
```

## Component API

### `<box>`

Container component with flexbox layout:

```typescript
<box
  width={80}
  height={24}
  backgroundColor={RGBA.fromHex("#1a1a1a")}
  flexDirection="column"
  gap={2}
  padding={1}
  border={["top", "bottom"]}
  borderColor={theme.primary}
  onClick={() => console.log("clicked")}
>
  {children}
</box>
```

### `<text>`

Text display with styling:

```typescript
<text
  fg={RGBA.fromHex("#ffffff")}
  bg={RGBA.fromHex("#000000")}
  attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}
  onClick={() => console.log("clicked")}
>
  Hello World
</text>
```

### `<scrollbox>`

Scrollable container:

```typescript
<scrollbox
  width={80}
  height={20}
  scrollable={true}
  showScrollbar={true}
>
  {manyChildren}
</scrollbox>
```

### `<textarea>`

Editable text input:

```typescript
<textarea
  value={inputText}
  placeholder="Enter text..."
  cursorColor={RGBA.fromHex("#ffffff")}
  focusedBackgroundColor={RGBA.fromHex("#2a2a2a")}
  onInput={(text) => setInputText(text)}
  onKeyDown={(evt) => handleKey(evt)}
  ref={(instance) => textarea = instance}
/>
```

### `<spinner>`

Animation spinner:

```typescript
<spinner
  frames={["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]}
  interval={80}
  color={RGBA.fromHex("#fab283")}
/>
```

## Rendering Pipeline

```
┌────────────────────────────────────────────────────────────────┐
│                     RENDER PIPELINE                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Component Tree (JSX/Objects)                               │
│     └─ App() → { type: "box", props: {...}, children: [...] }  │
│                                                                 │
│  2. Reconciliation                                             │
│     └─ Diff previous vs current tree                           │
│                                                                 │
│  3. Layout Calculation                                         │
│     └─ Calculate positions based on flexbox rules               │
│                                                                 │
│  4. Rendering                                                   │
│     └─ Generate ANSI escape sequences                          │
│        - Cursor movement: \x1b[{row};{col}H                      │
│        - Colors: \x1b[38;2;{r};{g};{b}m                        │
│        - Attributes: \x1b[{attr}m                               │
│                                                                 │
│  5. Output                                                      │
│     └─ Write to stdout                                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## Extending the Framework

### Adding Custom Components

```typescript
interface ProgressBarProps {
  value: number // 0-100
  width: number
  color: RGBA
  backgroundColor: RGBA
}

function ProgressBar(props: ProgressBarProps) {
  const filled = Math.floor((props.value / 100) * props.width)
  const empty = props.width - filled

  return {
    type: "box",
    props: {
      flexDirection: "row",
      children: [
        { type: "box", props: { width: filled, backgroundColor: props.color } },
        { type: "box", props: { width: empty, backgroundColor: props.backgroundColor } },
      ],
    },
  }
}
```

### Custom Renderables

For performance-critical components, implement a custom renderable:

```typescript
class CustomRenderable {
  id = Math.random()
  isDestroyed = false

  focus() {}
  blur() {}
  getLayoutNode() {
    return { markDirty: () => {} }
  }

  render(ctx: RenderContext) {
    // Custom rendering logic
    ctx.moveTo(0, 0)
    ctx.setForeground(this.color)
    ctx.write("Custom content")
  }
}
```

## Implementation Notes

This package contains a **working implementation** of a minimal TUI framework:

### Implemented Components

| Module                           | File                 | Status     |
| -------------------------------- | -------------------- | ---------- |
| ANSI Escape Sequences            | `src/core/screen.ts` | ✅ Working |
| Screen Buffer (double buffering) | `src/core/screen.ts` | ✅ Working |
| Flexbox Layout Engine            | `src/core/layout.ts` | ✅ Working |
| Input Handler (keyboard/mouse)   | `src/core/input.ts`  | ✅ Working |
| Main TUI Orchestrator            | `src/core/tui.ts`    | ✅ Working |
| Color (RGBA) utilities           | `src/core/index.ts`  | ✅ Working |

### Key Classes

#### `TUI` - Main orchestrator

```typescript
const tui = new TUI({ targetFps: 30, exitOnCtrlC: true })
tui.start()
tui.renderElement(element) // Render UI tree
tui.stop() // Clean shutdown
```

#### `ScreenBuffer` - Double-buffered rendering

```typescript
const screen = new ScreenBuffer(width, height)
screen.setCell(x, y, char, fg, bg, attrs)
screen.render() // Returns ANSI escape string
```

#### `LayoutEngine` - Flexbox layout

```typescript
const node = LayoutEngine.fromStyle(boxProps, children)
LayoutEngine.calculate(node, container)
```

#### `InputHandler` - Keyboard/mouse input

```typescript
const input = new InputHandler()
input.enableMouse() // Enable SGR mouse protocol
input.onKey(handler) // Register keyboard handler
input.onMouse(handler) // Register mouse handler
input.start()
```

## Running Examples

```bash
# Run the interactive demo
cd packages/tui-framework
bun run example/demo.ts
```

## References

- OpenCode TUI Implementation: `packages/opencode/src/cli/cmd/tui/`
- ANSI Escape Codes: https://gist.github.com/nicerobot/2858394
- Terminal Mouse Support: https://sw.kovidgoyal.net/kitty/graphics-protocol/#mouse-tracking
