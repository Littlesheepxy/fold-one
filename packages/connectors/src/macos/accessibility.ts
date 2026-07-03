import { runAppleScript } from "../shell.js";

/** 从前台窗口采集可访问性文本（AX，经 System Events）。比 OCR 快且免费。 */
const READ_FRONT_WINDOW_SCRIPT = `
tell application "System Events"
  set proc to first application process whose frontmost is true
  set procName to name of proc
  set winTitle to ""
  try
    set winTitle to name of window 1 of proc
  end try
  set chunks to {}
  try
    repeat with e in (UI elements of window 1 of proc)
      try
        set t to title of e
        if t is not missing value and (count of t) > 1 then set end of chunks to t
      end try
      try
        set v to value of e
        if v is not missing value and (class of v) is text and (count of v) > 1 then set end of chunks to v
      end try
      try
        repeat with c in (UI elements of e)
          try
            set t2 to title of c
            if t2 is not missing value and (count of t2) > 1 then set end of chunks to t2
          end try
          try
            set v2 to value of c
            if v2 is not missing value and (class of v2) is text and (count of v2) > 1 then set end of chunks to v2
          end try
        end repeat
      end try
    end repeat
  end try
  set AppleScript's text item delimiters to linefeed
  set body to chunks as text
  return procName & linefeed & winTitle & linefeed & body
end tell
`.trim();

export interface FrontWindowAccessibility {
	app: string;
	windowTitle: string;
	/** 窗口内可见 UI 文本片段 */
	text: string;
}

export async function readFrontWindowAccessibilityText(
	maxChars = 3000,
): Promise<FrontWindowAccessibility | null> {
	if (process.platform !== "darwin") return null;
	try {
		const raw = await runAppleScript(READ_FRONT_WINDOW_SCRIPT, 6000);
		const lines = raw.split("\n");
		const app = lines[0]?.trim() ?? "";
		const windowTitle = lines[1]?.trim() ?? "";
		const body = lines.slice(2).join("\n").trim();
		if (!app && !windowTitle && !body) return null;
		const text = [app, windowTitle, body].filter(Boolean).join("\n").slice(0, maxChars);
		return { app, windowTitle, text };
	} catch {
		return null;
	}
}
