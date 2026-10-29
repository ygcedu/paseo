import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const roots: string[] = [];
const worker = fileURLToPath(new URL("./install-local-macos.sh", import.meta.url));

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "paseo install test-"));
  roots.push(root);
  const stage = path.join(root, "staging", "Paseo.app");
  const target = path.join(root, "Applications", "Paseo.app");
  const backup = `${target}.previous-20261027-120000-1`;
  const job = path.join(root, "job");
  const lock = path.join(root, "lock");
  const bin = path.join(root, "bin");
  for (const directory of [stage, target, job, lock, bin])
    mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(stage, "version"), "new");
  const cli = path.join(stage, "Contents", "Resources", "bin", "paseo");
  mkdirSync(path.dirname(cli), { recursive: true });
  writeFileSync(
    path.join(stage, "Contents", "Info.plist"),
    JSON.stringify({ CFBundleShortVersionString: "0.14.0" }),
  );
  writeFileSync(
    cli,
    '#!/bin/sh\nif [ "$2" = stop ]; then printf "%s\\n" "$*" > "$DAEMON_RECORD"; exit "${STOP_EXIT:-0}"; fi\nif [ "$2" = start ]; then command -v test-provider >/dev/null || exit 97; printf "%s\\n" "$*" > "$DAEMON_START_RECORD"; exit "${START_EXIT:-0}"; fi\nprintf \'{"daemonVersion":"0.14.0"}\\n\'\n',
    { mode: 0o755 },
  );

  writeFileSync(path.join(target, "version"), "old");
  writeFileSync(path.join(job, "go"), "install");
  writeFileSync(path.join(bin, "ps"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(
    path.join(bin, "open"),
    '#!/bin/sh\n[ -f "$DAEMON_START_RECORD" ] || exit 99\nprintf "%s" "$1" > "$OPEN_RECORD"\n',
    {
      mode: 0o755,
    },
  );
  const shell = path.join(bin, "login-shell");
  writeFileSync(
    shell,
    '#!/bin/sh\n[ "$1" = -ilc ] || exit 98\nexport PATH="$PROVIDER_BIN:$PATH"\nexec /bin/bash -c "$2"\n',
    { mode: 0o755 },
  );
  const providerBin = path.join(root, "provider-bin");
  mkdirSync(providerBin);
  writeFileSync(path.join(providerBin, "test-provider"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    SHELL: shell,
    PROVIDER_BIN: providerBin,
    OPEN_RECORD: path.join(root, "opened"),
    DAEMON_RECORD: path.join(root, "daemon-stopped"),
    DAEMON_START_RECORD: path.join(root, "daemon-started"),
  };
  const args = [worker, "--install", stage, target, backup, job, lock];
  return { root, stage, target, backup, job, lock, bin, env, args };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("installs a staged bundle, keeps the old version, reopens, and releases the lock", () => {
  const f = fixture();
  writeFileSync(path.join(f.root, "last-install-error.log"), "previous error");
  execFileSync("bash", f.args, { env: f.env });
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
  expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
  expect(existsSync(f.job)).toBe(false);
  expect(existsSync(path.dirname(f.stage))).toBe(false);
  expect(readFileSync(f.env.OPEN_RECORD, "utf8")).toBe(f.target);
  expect(existsSync(f.lock)).toBe(false);
  expect(existsSync(path.join(f.root, "last-install-error.log"))).toBe(false);
});

test("restores the previous bundle when moving the new bundle fails", () => {
  const f = fixture();
  const olderBackup = `${f.target}.previous-20261026-120000-1`;
  mkdirSync(olderBackup);
  writeFileSync(path.join(olderBackup, "version"), "older");
  writeFileSync(
    path.join(f.bin, "mv"),
    '#!/bin/sh\nif [ "$1" = "$FAIL_SOURCE" ]; then exit 1; fi\nexec /bin/mv "$@"\n',
    { mode: 0o755 },
  );
  const result = spawnSync("bash", f.args, { env: { ...f.env, FAIL_SOURCE: f.stage } });
  expect(result.status).toBe(1);
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("old");
  expect(readFileSync(path.join(f.root, "last-install-error.log"), "utf8")).toContain("FAILED");
  expect(existsSync(f.job)).toBe(false);
  expect(existsSync(f.env.OPEN_RECORD)).toBe(false);
  expect(existsSync(f.lock)).toBe(false);
  expect(readFileSync(path.join(olderBackup, "version"), "utf8")).toBe("older");
});

test("removes older timestamped backups while retaining the current backup and unrelated paths", () => {
  const f = fixture();
  const olderBackup = `${f.target}.previous-20261026-120000-1`;
  const unrelated = `${f.target}.previous-manual`;
  const ordinaryFile = `${f.target}.previous-20261025-note`;
  mkdirSync(olderBackup);
  mkdirSync(unrelated);
  writeFileSync(ordinaryFile, "keep");
  execFileSync("bash", f.args, { env: f.env });
  expect(existsSync(olderBackup)).toBe(false);
  expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
  expect(existsSync(unrelated)).toBe(true);
  expect(readFileSync(ordinaryFile, "utf8")).toBe("keep");
});

test("keeps older backups when reopening the installed application fails", () => {
  const f = fixture();
  const olderBackup = `${f.target}.previous-20261026-120000-1`;
  mkdirSync(olderBackup);
  writeFileSync(path.join(olderBackup, "version"), "older");
  writeFileSync(path.join(f.bin, "open"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const result = spawnSync("bash", f.args, { env: f.env });
  expect(result.status).toBe(1);
  expect(readFileSync(path.join(olderBackup, "version"), "utf8")).toBe("older");
  expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
  expect(existsSync(f.job)).toBe(false);
  expect(existsSync(f.lock)).toBe(false);
});

test("preserves recovery bundles but removes task files when rollback fails", () => {
  const f = fixture();
  writeFileSync(
    path.join(f.bin, "mv"),
    '#!/bin/sh\ncase "$1" in "$FAIL_SOURCE"|"$FAIL_BACKUP") exit 1;; esac\nexec /bin/mv "$@"\n',
    { mode: 0o755 },
  );
  const result = spawnSync("bash", f.args, {
    env: { ...f.env, FAIL_SOURCE: f.stage, FAIL_BACKUP: f.backup },
  });
  expect(result.status).toBe(1);
  expect(existsSync(f.target)).toBe(false);
  expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
  expect(readFileSync(path.join(f.stage, "version"), "utf8")).toBe("new");
  expect(existsSync(f.job)).toBe(false);
  expect(existsSync(f.lock)).toBe(false);
  expect(readFileSync(path.join(f.root, "last-install-error.log"), "utf8")).toContain("restore");
});

test.skipIf(process.platform !== "darwin")(
  "launchd completes installation after the submitting process exits",
  async () => {
    const f = fixture();
    rmSync(path.join(f.job, "go"));
    const label = `sh.paseo.install-test.${process.pid}.${Date.now()}`;
    const domain = `gui/${userInfo().uid}`;
    const plist = path.join(f.job, "test.plist");
    writeFileSync(
      plist,
      JSON.stringify({
        Label: label,
        ProgramArguments: ["/bin/bash", ...f.args, `${domain}/${label}`],
        RunAtLoad: true,
        EnvironmentVariables: {
          PATH: f.env.PATH,
          SHELL: f.env.SHELL,
          PROVIDER_BIN: f.env.PROVIDER_BIN,
          OPEN_RECORD: f.env.OPEN_RECORD,
          DAEMON_START_RECORD: f.env.DAEMON_START_RECORD,
          DAEMON_RECORD: f.env.DAEMON_RECORD,
        },
        StandardOutPath: path.join(f.job, "install.log"),
        StandardErrorPath: path.join(f.job, "install.log"),
      }),
    );
    execFileSync("/usr/bin/plutil", ["-convert", "xml1", plist]);
    execFileSync(process.execPath, [
      "-e",
      'require("node:child_process").execFileSync("/bin/launchctl", ["bootstrap", process.argv[1], process.argv[2]])',
      domain,
      plist,
    ]);
    try {
      await expect.poll(() => existsSync(path.join(f.job, "ready"))).toBe(true);
      expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("old");
      writeFileSync(path.join(f.job, "go"), "install");
      await expect.poll(() => existsSync(f.job), { timeout: 5000 }).toBe(false);
      await expect
        .poll(() => spawnSync("/bin/launchctl", ["print", `${domain}/${label}`]).status, {
          timeout: 5000,
        })
        .not.toBe(0);
      expect(existsSync(f.lock)).toBe(false);
      expect(existsSync(path.dirname(f.stage))).toBe(false);
      expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
      expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
    } finally {
      spawnSync("/bin/launchctl", ["bootout", `${domain}/${label}`]);
    }
  },
);

test("requests a normal quit and waits before replacing the running application", async () => {
  const f = fixture();
  const ready = path.join(f.root, "process-ready");
  const stopped = path.join(f.root, "process-stopped");
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    const fs = require("node:fs");
    process.on("SIGTERM", () => {
      setTimeout(() => { fs.writeFileSync(process.argv[2], "stopped"); process.exit(0); }, 200);
    });
    fs.writeFileSync(process.argv[1], "ready");
    setInterval(() => {}, 1000);
  `,
      ready,
      stopped,
    ],
    { stdio: "ignore" },
  );
  try {
    await expect.poll(() => existsSync(ready), { timeout: 5000 }).toBe(true);
    writeFileSync(
      path.join(f.bin, "ps"),
      '#!/bin/sh\nif [ ! -f "$EXIT_MARKER" ]; then printf "%s %s\\n" "$TEST_PID" "$TEST_EXE"; fi\n',
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(f.bin, "mv"),
      '#!/bin/sh\n[ -f "$EXIT_MARKER" ] || exit 99\nexec /bin/mv "$@"\n',
      { mode: 0o755 },
    );
    execFileSync("bash", f.args, {
      env: {
        ...f.env,
        EXIT_MARKER: stopped,
        TEST_PID: String(child.pid),
        TEST_EXE: `${f.target}/Contents/MacOS/Paseo`,
      },
    });
    expect(readFileSync(stopped, "utf8")).toBe("stopped");
    expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
  } finally {
    child.kill("SIGKILL");
  }
});

test("stops the production daemon before installation and aborts when it cannot stop", () => {
  const f = fixture();
  const result = spawnSync("bash", f.args, { env: { ...f.env, STOP_EXIT: "1", HOME: f.root } });
  expect(result.status).toBe(1);
  expect(readFileSync(f.env.DAEMON_RECORD, "utf8")).toBe(
    `daemon stop --home ${f.root}/.paseo --timeout 120\n`,
  );
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("old");
  expect(existsSync(f.env.OPEN_RECORD)).toBe(false);
});

test("does not report success or delete older backups when the daemon version stays old", () => {
  const f = fixture();
  const olderBackup = `${f.target}.previous-20261026-120000-1`;
  mkdirSync(olderBackup);
  const cli = path.join(f.stage, "Contents", "Resources", "bin", "paseo");
  writeFileSync(
    cli,
    '#!/bin/sh\nif [ "$2" = stop ]; then exit 0; fi\nif [ "$2" = start ]; then touch "$DAEMON_START_RECORD"; exit 0; fi\nprintf \'%s\\n\' \'{"daemonVersion":"0.13.2"}\'\n',
    { mode: 0o755 },
  );
  writeFileSync(path.join(f.bin, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const result = spawnSync("bash", f.args, { env: f.env });
  expect(result.status).toBe(1);
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
  expect(existsSync(olderBackup)).toBe(true);
  expect(readFileSync(path.join(f.root, "last-install-error.log"), "utf8")).toContain(
    "new daemon did not become ready",
  );
});

test("reports daemon startup failure without reopening the application", () => {
  const f = fixture();
  const result = spawnSync("bash", f.args, { env: { ...f.env, START_EXIT: "1", HOME: f.root } });
  expect(result.status).toBe(1);
  expect(readFileSync(f.env.DAEMON_START_RECORD, "utf8")).toBe(
    `daemon start --home ${f.root}/.paseo --timeout 120\n`,
  );
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
  expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
  expect(existsSync(f.env.OPEN_RECORD)).toBe(false);
  expect(readFileSync(path.join(f.root, "last-install-error.log"), "utf8")).toContain(
    "Starting the installed daemon",
  );
});
