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

describe("asset Linux do launcher", () => {
  it("rejeita launcher stale no caminho preferido e usa o asset materializado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-asset-"));
    const stale = path.join(root, "netns-launcher");
    try {
      fs.writeFileSync(stale, "launcher stale sem o protocolo de confirmação\n");
      fs.chmodSync(stale, 0o700);
      const expectedDigest = embeddedLinuxAssetSha256("netns-launcher");
      expect(isValidEmbeddedLinuxAsset("netns-launcher", stale)).toBe(false);

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

  it("mantém a rotina de confirmação no launcher fonte", () => {
    const launcher = fs.readFileSync(path.resolve(process.cwd(), "../goLiveBypass/tools/netns-launcher.c"), "utf8");

    expect(launcher).toContain("write_confirmation(confirm_path, argv[1])");
  });

  it("materializa o asset com o protocolo e o digest declarado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-materialized-"));
    try {
      const materialized = materializeEmbeddedLinuxAsset("netns-launcher", root);
      const bytes = fs.readFileSync(materialized);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const stats = fs.statSync(materialized);
      const executable = bytes.toString("latin1");

      expect(digest).toBe(embeddedLinuxAssetSha256("netns-launcher"));
      expect(executable).toContain("--confirm=");
      expect(executable).toContain("ok %s");
      expect(stats.isFile()).toBe(true);
      expect(stats.mode & 0o111).not.toBe(0);
      expect(stats.mode & 0o022).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
