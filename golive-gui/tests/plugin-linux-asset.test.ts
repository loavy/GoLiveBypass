import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@main/settings", () => ({ RendererSettings: { store: { plugins: {} } } }), { virtual: true });
vi.mock("electron", () => ({
  app: { exit: vi.fn(), quit: vi.fn(), relaunch: vi.fn(), on: vi.fn(), whenReady: () => new Promise(() => {}) },
  BrowserWindow: class {
    static fromWebContents() { return null; }
  },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { findLinuxNetnsLauncher } from "../../goLiveBypass/native";
import { embeddedLinuxAssetSha256, isValidEmbeddedLinuxAsset, materializeEmbeddedLinuxAsset } from "../../goLiveBypass/vpn-proton";

const nativeSource = fs.readFileSync(path.resolve(process.cwd(), "../goLiveBypass/native.ts"), "utf8");
const resolverStart = nativeSource.indexOf("function findLinuxNetnsLauncher");
const resolverEnd = nativeSource.indexOf("async function installFlatpakNetnsLauncher");
const resolverSource = nativeSource.slice(resolverStart, resolverEnd);

describe("asset Linux do launcher", () => {
  it("rejeita launcher stale no caminho preferido e usa o asset materializado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-asset-"));
    const stale = path.join(root, "netns-launcher");
    try {
      fs.writeFileSync(stale, "launcher stale sem o protocolo de confirmação\n");
      fs.chmodSync(stale, 0o700);
      const expectedDigest = embeddedLinuxAssetSha256("netns-launcher");
      expect(isValidEmbeddedLinuxAsset("netns-launcher", stale)).toBe(false);
      expect(resolverSource).toContain("proton.isValidEmbeddedLinuxAsset(\"netns-launcher\", candidate)");

      const resolved = findLinuxNetnsLauncher([stale], root);
      const digest = createHash("sha256").update(fs.readFileSync(resolved)).digest("hex");

      expect(resolved).not.toBe(stale);
      expect(digest).toBe(expectedDigest);
      expect(fs.statSync(resolved).isFile()).toBe(true);
      expect(fs.statSync(resolved).mode & 0o111).not.toBe(0);
      expect(fs.statSync(resolved).mode & 0o022).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("mantém o contrato de confirmação no launcher fonte e no native", () => {
    const launcher = fs.readFileSync(path.resolve(process.cwd(), "../goLiveBypass/tools/netns-launcher.c"), "utf8");
    const native = fs.readFileSync(path.resolve(process.cwd(), "../goLiveBypass/native.ts"), "utf8");

    expect(launcher).toContain("--confirm=");
    expect(launcher).toContain("write_confirmation(confirm_path, argv[1])");
    expect(native).toContain("`--confirm=${confirmMarker}`");
    expect(native).toContain("waitForFile(confirmMarker, DEFAULT_AUTH_PROMPT_TIMEOUT_MS)");
  });

  it("materializa o asset com o digest declarado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-materialized-"));
    try {
      const materialized = materializeEmbeddedLinuxAsset("netns-launcher", root);
      const digest = createHash("sha256").update(fs.readFileSync(materialized)).digest("hex");
      expect(digest).toBe(embeddedLinuxAssetSha256("netns-launcher"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
