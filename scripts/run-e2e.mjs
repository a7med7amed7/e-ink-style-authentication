import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = join(repositoryRoot, "tests", "e2e");
const playwrightCli = join(repositoryRoot, "node_modules", "@playwright", "test", "cli.js");

function discoverSpecs(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverSpecs(path);
    return entry.isFile() && entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

function parseOptions(args) {
  const projectArgs = [];
  let outputRoot = join(repositoryRoot, "test-results");
  let outputSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--project") projectArgs.push(argument, value);
      else {
        if (outputSeen) throw new Error("Specify --output only once");
        outputRoot = resolve(repositoryRoot, value);
        outputSeen = true;
      }
    } else if (argument.startsWith("--project=")) {
      const value = argument.slice("--project=".length);
      if (!value) throw new Error("--project requires a value");
      projectArgs.push("--project", value);
    } else if (argument.startsWith("--output=")) {
      const value = argument.slice("--output=".length);
      if (!value || outputSeen) throw new Error("Specify one non-empty --output value");
      outputRoot = resolve(repositoryRoot, value);
      outputSeen = true;
    } else {
      throw new Error(`Unsupported option ${argument}; only --project and --output are allowed`);
    }
  }

  return { projectArgs, outputRoot };
}

let options;
let specs;
try {
  options = parseOptions(process.argv.slice(2));
  specs = discoverSpecs(testRoot).sort();
  if (specs.length === 0) throw new Error(`No E2E *.spec.ts files found under ${testRoot}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid E2E runner options");
  process.exitCode = 1;
}

if (options && specs) {
  for (const spec of specs) {
    const specRelative = relative(repositoryRoot, spec).split(sep).join("/");
    const outputRelative = relative(testRoot, spec).slice(0, -extname(spec).length);
    const output = join(options.outputRoot, outputRelative);
    console.log(`\nRunning ${specRelative} in a fresh Playwright application process`);
    const result = spawnSync(
      process.execPath,
      [playwrightCli, "test", specRelative, ...options.projectArgs, "--output", output],
      { cwd: repositoryRoot, stdio: "inherit" },
    );
    if (result.error) {
      console.error(result.error.message);
      process.exitCode = 1;
      break;
    }
    if (result.signal || result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
