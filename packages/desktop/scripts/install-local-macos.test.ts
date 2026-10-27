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
  const backup = `${target}.previous`;
  const job = path.join(root, "job");
  const lock = path.join(root, "lock");
  const bin = path.join(root, "bin");
  for (const directory of [stage, target, job, lock, bin])
    mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(stage, "version"), "new");
  writeFileSync(path.join(target, "version"), "old");
  writeFileSync(path.join(job, "go"), "install");
  writeFileSync(path.join(bin, "ps"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(path.join(bin, "open"), '#!/bin/sh\nprintf "%s" "$1" > "$OPEN_RECORD"\n', {
    mode: 0o755,
  });
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    OPEN_RECORD: path.join(root, "opened"),
  };
  const args = [worker, "--install", stage, target, backup, job, lock];
  return { root, stage, target, backup, job, lock, bin, env, args };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("installs a staged bundle, keeps the old version, reopens, and releases the lock", () => {
  const f = fixture();
  execFileSync("bash", f.args, { env: f.env });
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
  expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
  expect(readFileSync(path.join(f.job, "status"), "utf8")).toBe("SUCCESS\n");
  expect(readFileSync(f.env.OPEN_RECORD, "utf8")).toBe(f.target);
  expect(existsSync(f.lock)).toBe(false);
});

test("restores the previous bundle when moving the new bundle fails", () => {
  const f = fixture();
  writeFileSync(
    path.join(f.bin, "mv"),
    '#!/bin/sh\nif [ "$1" = "$FAIL_SOURCE" ]; then exit 1; fi\nexec /bin/mv "$@"\n',
    { mode: 0o755 },
  );
  const result = spawnSync("bash", f.args, { env: { ...f.env, FAIL_SOURCE: f.stage } });
  expect(result.status).toBe(1);
  expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("old");
  expect(readFileSync(path.join(f.job, "status"), "utf8")).toContain("FAILED");
  expect(existsSync(f.env.OPEN_RECORD)).toBe(false);
  expect(existsSync(f.lock)).toBe(false);
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
        ProgramArguments: ["/bin/bash", ...f.args],
        RunAtLoad: true,
        EnvironmentVariables: { PATH: f.env.PATH, OPEN_RECORD: f.env.OPEN_RECORD },
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
      await expect
        .poll(() => readFileSync(path.join(f.job, "status"), "utf8"), { timeout: 5000 })
        .toBe("SUCCESS\n");
      expect(readFileSync(path.join(f.target, "version"), "utf8")).toBe("new");
      expect(readFileSync(path.join(f.backup, "version"), "utf8")).toBe("old");
    } finally {
      execFileSync("/bin/launchctl", ["bootout", `${domain}/${label}`]);
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
