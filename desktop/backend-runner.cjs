const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function main() {
  const backendEntry = process.argv[2];
  if (!backendEntry) {
    throw new Error("backend entry path nao informado");
  }

  const entryPath = path.resolve(backendEntry);
  await import(pathToFileURL(entryPath).href);
}

main().catch((error) => {
  console.error(String(error?.stack || error));
  process.exit(1);
});
