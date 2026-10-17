import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// 从 package.json 读取版本号（完整三段式，如 0.3.1）
const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const appVersion = pkg.version;

// Tauri 预期的开发服务器端口
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  // 注入版本号到前端代码
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vitest 测试配置
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
  // Vite 会自动清除控制台中的 Rust 错误信息
  // 设置 clearScreen 为 false 可以保留 Rust 侧的错误输出
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 监听 src-tauri 目录变化时不要触发 HMR
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: "dist",
    // Tauri 在 Windows 上使用 Chromium，在 macOS/Linux 上使用 WebKit
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
    // 在 debug 构建中不进行 minify
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // 在 debug 构建中生成 sourcemap
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  css: {
    postcss: "./postcss.config.mjs",
  },
}));
