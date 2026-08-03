import { describe, expect, it, vi } from "vitest";
import { deployHostinger } from "../../scripts/deploy-hostinger";

function createRunner(overrides: Record<string, string> = {}) {
  const inherited: Array<[string, string[]]> = [];
  const outputs: Array<[string, string[]]> = [];
  const defaults: Record<string, string> = {
    "git branch --show-current": "main",
    "git status --porcelain": "",
    "git rev-parse HEAD": "abc123",
    "git rev-parse refs/remotes/origin/main": "abc123",
  };

  return {
    inherited,
    outputs,
    runner: {
      output(command: string, args: string[]) {
        outputs.push([command, args]);
        return overrides[[command, ...args].join(" ")] ?? defaults[[command, ...args].join(" ")] ?? "";
      },
      inherit(command: string, args: string[]) {
        inherited.push([command, args]);
      },
    },
  };
}

describe("deployHostinger", () => {
  it("checks a synchronized main branch before pushing the deployment branch", () => {
    const { inherited, runner } = createRunner();

    deployHostinger({}, runner);

    expect(inherited).toContainEqual([
      "git",
      ["fetch", "--quiet", "origin", "refs/heads/main:refs/remotes/origin/main"],
    ]);
    expect(inherited.filter(([command, args]) => command === "git" && args[0] === "fetch")).toHaveLength(2);
    expect(inherited.at(-1)).toEqual([
      "git",
      ["push", "origin", "HEAD:refs/heads/hostinger-production"],
    ]);
    expect(inherited.filter(([command]) => command.includes("npm"))).toHaveLength(4);
  });

  it("refuses to deploy uncommitted changes", () => {
    const { inherited, runner } = createRunner({ "git status --porcelain": " M README.md" });

    expect(() => deployHostinger({}, runner)).toThrow("Commit or discard all local changes");
    expect(inherited).toEqual([]);
  });

  it("refuses to deploy a local main that differs from GitHub", () => {
    const { inherited, runner } = createRunner({
      "git rev-parse refs/remotes/origin/main": "different",
    });

    expect(() => deployHostinger({}, runner)).toThrow("must exactly match origin/main");
    expect(inherited.some(([command, args]) => command === "git" && args[0] === "push")).toBe(false);
  });

  it("can run all checks without pushing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { inherited, runner } = createRunner();

    deployHostinger({ checkOnly: true }, runner);

    expect(inherited.some(([command, args]) => command === "git" && args[0] === "push")).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("no branch was pushed"));
    log.mockRestore();
  });
});
