import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { cp, mkdir, readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const pdfRequire = createRequire(require.resolve("react-pdf/package.json"));
const root = dirname(pdfRequire.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const destination = new URL(`../public/pdfjs/${version}/`, import.meta.url);
await mkdir(destination, { recursive: true });
await cp(join(root, "LICENSE"), new URL("LICENSE", destination));
for (const asset of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(join(root, asset), new URL(asset, destination), { recursive: true });
}
await cp(
  join(root, "build/pdf.worker.min.mjs"),
  new URL("pdf.worker.min.mjs", destination),
);
console.info(`Recursos locais do PDF.js ${version} preparados.`);
const fonts = dirname(
  require.resolve("@fontsource/source-sans-3/package.json"),
);
const reportFonts = new URL("../public/pdf-fonts/", import.meta.url);
await mkdir(reportFonts, { recursive: true });
for (const [weight, name] of [
  [400, "regular"],
  [600, "semibold"],
]) {
  await cp(
    join(fonts, `files/source-sans-3-latin-${weight}-normal.woff`),
    new URL(`${name}.woff`, reportFonts),
  );
}
await cp(join(fonts, "LICENSE"), new URL("LICENSE", reportFonts));
