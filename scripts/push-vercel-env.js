import fs from "node:fs";
import { spawnSync } from "node:child_process";

const raw = fs.readFileSync('.env', 'utf8');
const entries = raw
  .split(/\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .filter((line) => !line.startsWith('#'))
  .filter((line) => line.includes('='))
  .map((line) => {
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    const doubleQuoted = value.startsWith('"') && value.endsWith('"');
    const singleQuoted = value.startsWith("'") && value.endsWith("'");
    if (doubleQuoted || singleQuoted) {
      value = value.slice(1, -1);
    }
    return [key, value];
  });

const targets = ['production', 'preview', 'development'];

function run(args, input) {
  return spawnSync('npx', ['vercel', ...args], {
    encoding: 'utf8',
    input
  });
}

let ok = 0;
let fail = 0;

for (const [key, value] of entries) {
  for (const target of targets) {
    run(['env', 'rm', key, target, '--yes'], 'y\n');
    const result = run(['env', 'add', key, target, '--yes'], value);
    if (result.status === 0) {
      ok += 1;
    } else {
      fail += 1;
      console.log(`FAIL ${key} ${target}`);
      if (result.stdout) {
        console.log(result.stdout.trim());
      }
      if (result.stderr) {
        console.log(result.stderr.trim());
      }
    }
  }
}

console.log(`SYNC_DONE ok=${ok} fail=${fail}`);
if (fail > 0) {
  process.exit(1);
}
