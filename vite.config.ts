import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      exclude: ["mysql2", "mysql2/promise", "bcryptjs"],
    },
    ssr: {
      external: ["mysql2", "mysql2/promise", "bcryptjs"],
    },
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
      }),
      nitro(),
      viteReact(),
      {
        name: "serve-uploads-dev",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith("/api/uploads/")) return next();
            const trimmed = req.url.replace("/api/uploads/", "").split("?")[0] ?? "";
            const slash = trimmed.indexOf("/");
            if (slash < 1) {
              res.statusCode = 400;
              return res.end("Bad request");
            }
            const workspaceId = trimmed.slice(0, slash);
            const filename = trimmed.slice(slash + 1);
            if (
              !filename ||
              filename.includes("..") ||
              filename.includes("/") ||
              filename.includes("\\") ||
              !workspaceId ||
              workspaceId.includes("..")
            ) {
              res.statusCode = 400;
              return res.end("Bad request");
            }
            const ext = path.extname(filename).toLowerCase();
            const mimeMap: Record<string, string> = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".webp": "image/webp",
            };
            const mime = mimeMap[ext];
            if (!mime) {
              res.statusCode = 400;
              return res.end("Unsupported type");
            }
            const uploadDir =
              process.env["UPLOAD_DIR"] || path.join(process.cwd(), "data", "uploads");
            const filePath = path.join(uploadDir, workspaceId, filename);
            try {
              const fs = await import("node:fs/promises");
              const data = await fs.readFile(filePath);
              res.setHeader("Content-Type", mime);
              res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
              res.statusCode = 200;
              return res.end(data);
            } catch {
              res.statusCode = 404;
              return res.end("Not found");
            }
          });
        },
      },
    ],
  };
});
