import "server-only";
import path from "node:path";

// Everything the server writes lives here. Point DATA_DIR at a mounted
// volume when you deploy.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || ".data");

/** Path of a file inside the data directory. */
export const dataPath = (name: string) => path.join(DATA_DIR, name);
