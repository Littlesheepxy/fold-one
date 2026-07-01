# Mail Connector

Skill `mail.draft()` is stable; connectors are swappable.

## Router

`FOLD_MAIL_PROVIDER`:

| Value | Behavior |
|-------|----------|
| `auto` | Detect from Live Context (Gmail/Outlook URL) → else Apple Mail → file fallback |
| `apple-mail` | macOS Mail.app via AppleScript |
| `gmail-web` | Gmail web via Playwright |
| `outlook-web` | Stub (not implemented) |
| `file` | Save `.txt` draft to Desktop |

## Auto detection

Context Engine polls Chrome/Arc tab URL. When `mail.google.com` is active:

```
Live Context → resolveMailConnector() → gmail-web
```

## Gmail Web (Playwright)

1. Install browser binaries once: `pnpm exec playwright install chromium`
2. Optional: attach to logged-in Chrome:
   ```bash
   # Start Chrome with remote debugging, then:
   FOLD_CHROME_CDP_URL=http://127.0.0.1:9222
   ```
3. Without CDP: Playwright launches Chrome channel (must log in to Gmail manually first run)

## Fallback chain

```
gmail-web fail → apple-mail → file draft on Desktop
apple-mail fail → file draft on Desktop
```

## Files

```
packages/connectors/src/mail/
  router.ts       — provider resolution
  apple-mail.ts   — AppleScript
  gmail-web.ts    — Playwright compose
  file-fallback.ts
  index.ts        — createMailDraft()
```
