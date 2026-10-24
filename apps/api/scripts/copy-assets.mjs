import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("assets");
const target = resolve("dist", "assets");
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
