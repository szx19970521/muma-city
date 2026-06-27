import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// F6 regression tests: the helper's stderr must be piped (and discarded), never
// inherited into the Electron main process's stderr.
vi.mock("../config", () => ({
  getConfigValue: vi.fn(),
}));
import { getConfigValue } from "../config";
import { CommandSecretsProvider, helperExecOptions } from "./commandProvider";

const mockedGetConfigValue = vi.mocked(getConfigValue);
const HELPER_DIR = mkdtempSync(join(tmpdir(), "hermes-command-stdio-"));
let helperCounter = 0;

function shellArg(value: string): string {
  if (process.platform === "win32") {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function nodeSecretCommand(source: string): string {
  const file = join(HELPER_DIR, `stdio-helper-${helperCounter++}.cjs`);
  writeFileSync(file, source);
  return `${shellArg(process.execPath)} ${shellArg(file)}`;
}

function emitWithStderr(stdout: string): string {
  return nodeSecretCommand(
    `process.stderr.write("STDERR_SECRET_MARKER"); process.stdout.write(${JSON.stringify(stdout)});`,
  );
}

afterAll(() => {
  rmSync(HELPER_DIR, { recursive: true, force: true });
});

describe("CommandSecretsProvider stdio hygiene (F6)", () => {
  const provider = new CommandSecretsProvider();
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedGetConfigValue.mockReset();
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function capturedStderr(): string {
    return [...stderrSpy.mock.calls, ...consoleErrorSpy.mock.calls]
      .flat()
      .map(String)
      .join("\n");
  }

  it("get(): helper stderr is discarded while stdout still resolves", () => {
    mockedGetConfigValue.mockReturnValue(emitWithStderr("OK"));
    expect(provider.get("K")).toBe("OK");
    expect(capturedStderr()).not.toContain("STDERR_SECRET_MARKER");
  });

  it("list(): helper stderr is discarded while the dotenv map still parses", () => {
    mockedGetConfigValue.mockReturnValue(emitWithStderr("A=1\nB=2\n"));
    expect(provider.list()).toEqual({ A: "1", B: "2" });
    expect(capturedStderr()).not.toContain("STDERR_SECRET_MARKER");
  });

  it("pins stdio to ignore/pipe/pipe in the shared spawn options", () => {
    // The fd-level guarantee can't be observed from inside the process (an
    // inherited stderr bypasses any JS spy), so it is pinned at the options
    // layer: dropping the stdio entry reverts to execFileSync's default,
    // which inherits the parent's stderr.
    const options = helperExecOptions("SOME_KEY");
    expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    // The key still rides along as data via the env, never the shell string.
    expect((options.env as Record<string, string>).HERMES_SECRET_KEY).toBe(
      "SOME_KEY",
    );
  });
});
