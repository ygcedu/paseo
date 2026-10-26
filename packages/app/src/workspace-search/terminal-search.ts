import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";
import { SEARCH_TERMINAL_NAME } from "./types";
import type { WorkspaceSearchOptions, WorkspaceSearchMatch, WorkspaceSearchBatch } from "./types";

// Start only after the existing terminal stream has subscribed. Keep the PTY alive
// until the client receives the completion marker, then remove it with killTerminal.
const SEARCH_SCRIPT = `stty -echo
rg_pid=
(sleep 20; kill -TERM $$) & watchdog=$!
trap 'test -z "$rg_pid" || kill "$rg_pid" 2>/dev/null; kill "$watchdog" 2>/dev/null; exit' EXIT
trap 'exit 1' HUP INT TERM
IFS= read -r start || exit
marker=$1
shift
rg "$@" 2>&1 & rg_pid=$!
wait "$rg_pid"; code=$?
rg_pid=
printf '\\n%s%s\\n' "$marker" "$code"
IFS= read -r finish`;

const rgMatchSchema = z.object({
  type: z.literal("match"),
  data: z.object({
    path: z.object({ text: z.string() }),
    lines: z.object({ text: z.string() }),
    line_number: z.number().int().positive(),
    submatches: z.array(z.object({ start: z.number(), end: z.number() })).min(1),
  }),
});

export class SearchEnvironmentError extends Error {}

export function searchArguments(options: WorkspaceSearchOptions): string[] {
  const args = [
    "--json",
    "--no-config",
    "--no-require-git",
    "--color=never",
    "--max-filesize=2M",
    "--glob=!.git",
    "--glob=!node_modules",
  ];
  args.push(options.caseSensitive ? "--case-sensitive" : "--ignore-case");
  if (!options.regex) args.push("--fixed-strings");
  if (options.wholeWord) args.push("--word-regexp");
  if (options.include?.trim()) args.push("--glob", options.include.trim());
  args.push("--", options.query, ".");
  return args;
}

function previewMatch(data: z.infer<typeof rgMatchSchema>["data"]): WorkspaceSearchMatch {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const raw = encoder.encode(data.lines.text);
  const offset = Math.max(
    0,
    decoder.decode(raw.subarray(0, data.submatches[0].start)).length - 120,
  );
  const text = data.lines.text.slice(offset, offset + 1000).replace(/[\r\n]+$/, "");
  const byteOffset = encoder.encode(data.lines.text.slice(0, offset)).length;
  const byteEnd = byteOffset + encoder.encode(text).length;
  const ranges: WorkspaceSearchMatch["ranges"] = [];
  for (const match of data.submatches) {
    if (match.start >= byteEnd) break;
    ranges.push({
      start: decoder.decode(raw.subarray(byteOffset, match.start)).length,
      end: decoder.decode(raw.subarray(byteOffset, Math.min(match.end, byteEnd))).length,
    });
  }
  return {
    path: data.path.text.replace(/^\.\//, "").replace(/\\/g, "/"),
    line: data.line_number,
    text,
    ranges,
  };
}

export async function searchWorkspaceThroughTerminal(
  client: DaemonClient,
  options: WorkspaceSearchOptions,
  input: { signal: AbortSignal; onBatch: (batch: WorkspaceSearchBatch) => void },
): Promise<void> {
  const { signal, onBatch } = input;
  signal.throwIfAborted();
  const marker = `PASEO_SEARCH_${crypto.randomUUID()}_`;
  const created = await client.createTerminal(options.cwd, SEARCH_TERMINAL_NAME, undefined, {
    command: "sh",
    args: ["-c", SEARCH_SCRIPT, "paseo-search", marker, ...searchArguments(options)],
    size: { cols: 240, rows: 24 },
  });
  if (!created.terminal)
    throw new SearchEnvironmentError(created.error ?? "Cannot start search terminal");
  const terminalId = created.terminal.id;
  let release: (() => Promise<void>) | undefined;
  let disconnect = () => {};
  let abort = () => {};
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  try {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let count = 0;
      let bytes = 0;
      let resultBytes = 0;
      let buffer = "";
      let stderr = "";
      let batch: WorkspaceSearchMatch[] = [];
      const decoder = new TextDecoder();
      const flush = (truncated = false) => {
        if (signal.aborted || (!batch.length && !truncated)) return;
        onBatch({ matches: batch, truncated });
        batch = [];
      };
      const finish = (error?: unknown, truncated = false) => {
        if (settled) return;
        settled = true;
        flush(truncated);
        if (error) reject(error);
        else resolve();
      };
      abort = () => finish(signal.reason ?? new Error("Search cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      deadline = setTimeout(
        () => finish(new Error("Search timed out. Narrow the search using a file filter.")),
        15_000,
      );
      flushTimer = setInterval(() => flush(), 40);
      disconnect = client.subscribeConnectionStatus((status) => {
        if (status.status !== "connected") finish(new Error("Host disconnected"));
      });
      const observation = client.observeTerminal(
        terminalId,
        (event) => {
          if (settled || event.type !== "output") return;
          bytes += event.data.length;
          if (bytes > 8 * 1024 * 1024) return finish(undefined, true);
          buffer += decoder.decode(event.data, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n")) >= 0) {
            if (settled) break;
            const line = buffer.slice(0, end).replace(/\r$/, "");
            buffer = buffer.slice(end + 1);
            if (line.startsWith(marker)) {
              const code = Number(line.slice(marker.length));
              if (code === 127) finish(new SearchEnvironmentError("ripgrep is not installed"));
              else if (code !== 0 && code !== 1)
                finish(new Error(stderr.trim() || "Search failed"));
              else finish();
              continue;
            }
            if (!line) continue;
            let json: unknown;
            try {
              json = JSON.parse(line);
            } catch {
              stderr = (stderr + line + "\n").slice(0, 4096);
              continue;
            }
            const parsed = rgMatchSchema.safeParse(json);
            if (!parsed.success) continue;
            const match = previewMatch(parsed.data.data);
            batch.push(match);
            count++;
            resultBytes += match.text.length * 2;
            if (count >= 1000 || resultBytes >= 2 * 1024 * 1024) finish(undefined, true);
            else if (count === 1 || batch.length >= 50) flush();
          }
        },
        { restore: { mode: "live" } },
      );
      release = () => observation.release();
      observation.subscribe({
        snapshot: () => {},
        update: (message) => {
          if (message.type === "terminal_stream_exit") finish(new Error("Search terminal closed"));
        },
        error: (error) => finish(error),
      });
      void observation.ready
        .then((payload) => {
          if (settled) return;
          if (payload.error) finish(new Error(payload.error));
          else client.sendTerminalInput(terminalId, { type: "input", data: "start\n" });
          return;
        })
        .catch(finish);
      if (signal.aborted) abort();
    });
  } finally {
    clearTimeout(deadline);
    clearInterval(flushTimer);
    signal.removeEventListener("abort", abort);
    disconnect();
    // These own only our temporary terminal, never a user-created shell.
    await release?.().catch(() => undefined);
    await client.killTerminal(terminalId).catch(() => undefined);
  }
}
