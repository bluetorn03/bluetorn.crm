import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "node-server",
  output: {
    dir: ".output",
    serverDir: ".output/server",
    publicDir: ".output/public",
  },
});
