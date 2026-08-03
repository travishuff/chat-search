import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Runner = {
  output(command: string, args: string[]): string;
  inherit(command: string, args: string[]): void;
};

type DeployOptions = {
  sourceBranch?: string;
  deployBranch?: string;
  checkOnly?: boolean;
};

const systemRunner: Runner = {
  output(command, args) {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
  },
  inherit(command, args) {
    execFileSync(command, args, { stdio: "inherit" });
  },
};

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function deployHostinger(options: DeployOptions = {}, runner: Runner = systemRunner): void {
  const sourceBranch = options.sourceBranch ?? "main";
  const deployBranch = options.deployBranch ?? "hostinger-production";

  if (sourceBranch === deployBranch) {
    throw new Error("The source and Hostinger deployment branches must be different.");
  }

  runner.output("git", ["check-ref-format", "--branch", sourceBranch]);
  runner.output("git", ["check-ref-format", "--branch", deployBranch]);

  const currentBranch = runner.output("git", ["branch", "--show-current"]);
  if (currentBranch !== sourceBranch) {
    throw new Error(`Deployments must be run from ${sourceBranch}; currently on ${currentBranch || "a detached HEAD"}.`);
  }

  if (runner.output("git", ["status", "--porcelain"])) {
    throw new Error("Commit or discard all local changes before deploying.");
  }

  runner.inherit("git", [
    "fetch",
    "--quiet",
    "origin",
    `refs/heads/${sourceBranch}:refs/remotes/origin/${sourceBranch}`,
  ]);

  const localHead = runner.output("git", ["rev-parse", "HEAD"]);
  const remoteHead = runner.output("git", ["rev-parse", `refs/remotes/origin/${sourceBranch}`]);
  if (localHead !== remoteHead) {
    throw new Error(`Local ${sourceBranch} must exactly match origin/${sourceBranch} before deploying.`);
  }

  const npm = npmCommand();
  const checks = [
    ["run", "typecheck"],
    ["test"],
    ["run", "build"],
    ["run", "test:e2e"],
  ];

  for (const args of checks) {
    runner.inherit(npm, args);
  }

  runner.inherit("git", [
    "fetch",
    "--quiet",
    "origin",
    `refs/heads/${sourceBranch}:refs/remotes/origin/${sourceBranch}`,
  ]);
  const latestRemoteHead = runner.output("git", ["rev-parse", `refs/remotes/origin/${sourceBranch}`]);
  if (localHead !== latestRemoteHead) {
    throw new Error(`origin/${sourceBranch} changed while deployment checks were running; run the command again.`);
  }

  if (options.checkOnly) {
    console.log(`Deployment checks passed for ${localHead}; no branch was pushed.`);
    return;
  }

  runner.inherit("git", ["push", "origin", `HEAD:refs/heads/${deployBranch}`]);
  console.log(`Released ${localHead} to ${deployBranch}.`);
}

function printHelp(): void {
  console.log(`Usage: npm run deploy:hostinger [-- --check]\n\nPushes a verified, clean origin/main commit to the Hostinger-connected\nhostinger-production branch. Use --check to validate without pushing.`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const unknownArgs = args.filter((arg) => arg !== "--check");
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown option: ${unknownArgs[0]}`);
  }

  deployHostinger({
    sourceBranch: process.env.HOSTINGER_SOURCE_BRANCH,
    deployBranch: process.env.HOSTINGER_DEPLOY_BRANCH,
    checkOnly: args.includes("--check"),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
