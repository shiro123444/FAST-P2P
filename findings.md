# Findings

## opencode TUI structure

- `routes/session/header.tsx` keeps a compact status header with title on the left and context/cost metadata on the right.
- `routes/session/sidebar.tsx` uses a narrow stacked information rail rather than a second equal-width main panel.
- `routes/session/footer.tsx` pushes ambient status into a low-priority footer instead of repeating it in the main content.

## p2p example problems

- `ConnectView()` is visually disconnected from `HomeView()` and `DashboardView()`.
- QR, instructions, status, received files, and log are all same-priority cards, so the eye has no dominant anchor.
- The current input area already has some good character, but the screen above it does not reinforce the same brand language.

## design direction

- Keep a persistent shell across modes.
- Make `/connect` read like a focused workspace: left overview rail, central QR hero, right or lower support cards.
- Add small motion through a shared tick so status pills and hero hints can animate later without new state plumbing.
