import { defineConfig } from "vitest/config";

function inlineSingleFileBuild() {
  return {
    name: "inline-single-file-build",
    apply: "build" as const,
    enforce: "post" as const,
    generateBundle(_: unknown, bundle: Record<string, unknown>) {
      const htmlAsset = bundle["index.html"];
      if (!isAsset(htmlAsset)) return;

      let html = String(htmlAsset.source);

      html = html.replace(
        /<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g,
        (tag, before: string, src: string, after: string) => {
          const fileName = src.replace(/^\.?\//, "");
          const chunk = bundle[fileName];
          if (!isChunk(chunk)) return tag;

          delete bundle[fileName];
          return `<script${before}${after}>${chunk.code.replace(
            /<\/script/gi,
            "<\\/script",
          )}</script>`;
        },
      );

      html = html.replace(
        /<link\b([^>]*)\bhref="([^"]+)"([^>]*)>/g,
        (tag, before: string, href: string, after: string) => {
          if (!/\brel="stylesheet"/.test(before + after)) return tag;

          const fileName = href.replace(/^\.?\//, "");
          const asset = bundle[fileName];
          if (!isAsset(asset)) return tag;

          delete bundle[fileName];
          return `<style>${String(asset.source).replace(
            /<\/style/gi,
            "<\\/style",
          )}</style>`;
        },
      );

      htmlAsset.source = html;
    },
  };
}

function isAsset(value: unknown): value is { type: "asset"; source: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "asset" &&
    "source" in value
  );
}

function isChunk(value: unknown): value is { type: "chunk"; code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "chunk" &&
    "code" in value &&
    typeof value.code === "string"
  );
}

export default defineConfig(({ mode }) => ({
  plugins: mode === "offline" ? [inlineSingleFileBuild()] : [],
  test: {
    environment: "node",
  },
}));
