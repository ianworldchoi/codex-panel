// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRuntimeView } from "../src/features/chat/host/contracts";
import { CodexChatView } from "../src/features/chat/host/view.obsidian";
import { waitForAsyncWork } from "./support/async";
import { installObsidianDomShims } from "./support/dom";
import { chatView, leaf, pluginWithLeaves, type TestLeaf } from "./support/plugin-fixtures";

installObsidianDomShims();

describe("CodexPanelPlugin lifecycle", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads restored Codex panel leaves after startup without blocking onload", async () => {
    vi.useFakeTimers();
    const firstLeaf = leaf();
    const secondLeaf = leaf();
    const plugin = await pluginWithLeaves([firstLeaf, secondLeaf]);
    vi.spyOn(plugin, "loadData").mockResolvedValue({ showToolbar: false, sendShortcut: "mod-enter" });

    await plugin.onload();

    expect(plugin.runtime.settingTabHost().settings).toMatchObject({ showToolbar: false, sendShortcut: "mod-enter" });
    expect(firstLeaf.loadIfDeferred).not.toHaveBeenCalled();
    expect(secondLeaf.loadIfDeferred).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(firstLeaf.loadIfDeferred).toHaveBeenCalledOnce();
    expect(secondLeaf.loadIfDeferred).toHaveBeenCalledOnce();
  });

  it("keeps executable paths device-local across shared preference saves and reloads", async () => {
    const first = await pluginWithLeaves([]);
    const second = await pluginWithLeaves([]);
    let shared: unknown = null;
    const loadShared = async () => shared;
    const saveShared = async (value: unknown) => {
      shared = value;
    };
    for (const plugin of [first, second]) {
      vi.spyOn(plugin, "loadData").mockImplementation(loadShared);
      vi.spyOn(plugin, "saveData").mockImplementation(saveShared);
    }
    await first.saveSettings({ ...first.settings, codexPath: "/first/mac/codex", composerFontSize: 18 });
    await second.loadSettings();
    expect(second.settings).toMatchObject({ codexPath: "codex", composerFontSize: 18 });
    await second.saveSettings({ ...second.settings, codexPath: "/second/mac/codex", assistantFontSize: 20 });
    await first.loadSettings();
    await second.loadSettings();
    expect(first.settings).toMatchObject({ codexPath: "/first/mac/codex", composerFontSize: 18, assistantFontSize: 20 });
    expect(second.settings).toMatchObject({ codexPath: "/second/mac/codex", assistantFontSize: 20 });
    expect(shared).not.toHaveProperty("codexPath");
    first.onunload();
    second.onunload();
  });

  it("migrates an existing executable before removing its legacy shared path", async () => {
    const plugin = await pluginWithLeaves([]);
    let shared: unknown = { codexPath: process.execPath, composerFontSize: 18 };
    vi.spyOn(plugin, "loadData").mockImplementation(async () => shared);
    vi.spyOn(plugin, "saveData").mockImplementation(async (value) => {
      expect(plugin.app.loadLocalStorage("codex-panel:codexPath")).toBe(process.execPath);
      shared = value;
    });
    await plugin.loadSettings();
    expect(plugin.settings).toMatchObject({ codexPath: process.execPath, composerFontSize: 18 });
    expect(shared).not.toHaveProperty("codexPath");
    await plugin.loadSettings();
    expect(plugin.settings.codexPath).toBe(process.execPath);
    plugin.onunload();
  });

  it("ignores another device's missing legacy executable and preserves an explicit local default", async () => {
    const plugin = await pluginWithLeaves([]);
    vi.spyOn(plugin, "loadData").mockResolvedValue({ codexPath: "/missing/other/mac/codex" });
    await plugin.loadSettings();
    expect(plugin.settings.codexPath).toBe("codex");
    vi.mocked(plugin.loadData).mockResolvedValue({ codexPath: process.execPath });
    await plugin.loadSettings();
    expect(plugin.settings.codexPath).toBe("codex");
    plugin.onunload();
  });

  it("repairs background layout changes without loading restored leaves", async () => {
    vi.useFakeTimers();
    const leaves = [leaf({ state: { threadId: "same" } })];
    const plugin = await pluginWithLeaves(leaves);
    const handlers: (() => void)[] = [];
    (plugin.app.workspace.on as ReturnType<typeof vi.fn>).mockImplementation((name: string, handler: () => void) => {
      if (name === "layout-change") handlers.push(handler);
      return {};
    });
    await plugin.onload();
    await vi.advanceTimersByTimeAsync(0);
    leaves[0]?.loadIfDeferred.mockClear();
    const duplicate = leaf({ state: { threadId: "same" } });
    leaves.push(duplicate);
    for (const handler of handlers) handler();
    expect(duplicate.setViewState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(duplicate.setViewState).toHaveBeenCalledOnce();
    for (const target of leaves) expect(target.loadIfDeferred).not.toHaveBeenCalled();
    plugin.onunload();
  });

  it("does not revive reconciliation when layout becomes ready after unload", async () => {
    vi.useFakeTimers();
    const panel = leaf();
    const plugin = await pluginWithLeaves([panel]);
    let ready: (() => void) | undefined;
    (plugin.app.workspace.onLayoutReady as ReturnType<typeof vi.fn>).mockImplementation((callback: () => void) => {
      ready = callback;
    });
    await plugin.onload();
    plugin.onunload();
    ready?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.loadIfDeferred).not.toHaveBeenCalled();
  });

  it("discards turn diff leaves on plugin load because their payloads do not survive reloads", async () => {
    const turnDiffLeaf = leaf();
    const plugin = await pluginWithLeaves([], { turnDiffLeaves: [turnDiffLeaf] });

    await plugin.onload();

    expect(turnDiffLeaf.detach).toHaveBeenCalledOnce();
    expect(turnDiffLeaf.loadIfDeferred).not.toHaveBeenCalled();
  });

  it("cancels pending workspace reconciliation on unload", async () => {
    vi.useFakeTimers();
    const panelLeaf = leaf();
    const plugin = await pluginWithLeaves([panelLeaf]);

    await plugin.onload();
    plugin.onunload();
    await vi.advanceTimersByTimeAsync(0);

    expect(panelLeaf.loadIfDeferred).not.toHaveBeenCalled();
  });

  it("disposes execution-runtime views on unload", async () => {
    const view = {
      attachRuntime: vi.fn(),
      detachRuntime: vi.fn().mockResolvedValue(undefined),
    };
    const viewLeaf = leaf();
    const runtimeView = Object.assign(Object.create(CodexChatView.prototype), view) as ChatRuntimeView;
    viewLeaf.view = runtimeView;
    const plugin = await pluginWithLeaves([viewLeaf]);
    plugin.runtime.attachChatView(runtimeView);

    plugin.onunload();

    expect(view.detachRuntime).toHaveBeenCalledOnce();
  });

  it("hydrates a restored panel when Obsidian activates its leaf", async () => {
    const panelLeaf = leaf();
    panelLeaf.view = chatView(CodexChatView, panelLeaf);
    const activeLeafHandlers: ((leaf: TestLeaf | null) => void)[] = [];
    const plugin = await pluginWithLeaves([panelLeaf]);
    (plugin.app.workspace.on as ReturnType<typeof vi.fn>).mockImplementation((name: string, handler: (leaf: TestLeaf | null) => void) => {
      if (name === "active-leaf-change") activeLeafHandlers.push(handler);
      return {};
    });

    await plugin.onload();
    const hydrate = vi.spyOn((panelLeaf.view as CodexChatView).surface, "activateThread").mockResolvedValue(true);
    const handler = activeLeafHandlers.at(0);
    if (!handler) throw new Error("Expected active leaf handler to be registered.");
    handler(panelLeaf);

    await waitForAsyncWork(() => {
      expect(hydrate).toHaveBeenCalledOnce();
    });
  });

  it("loads and hydrates the startup foreground panel", async () => {
    vi.useFakeTimers();
    const activeLeaf = leaf({ state: { threadId: "thread-1", threadTitle: "Restored thread" } });
    const view = chatView(CodexChatView, activeLeaf);
    activeLeaf.loadIfDeferred.mockImplementation(async () => {
      activeLeaf.view = view;
    });
    const plugin = await pluginWithLeaves([activeLeaf]);
    (plugin.app.workspace.getMostRecentLeaf as ReturnType<typeof vi.fn>).mockReturnValue(activeLeaf);

    await plugin.onload();
    const hydrate = vi.spyOn(view.surface, "activateThread").mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(0);

    await waitForAsyncWork(() => {
      expect(activeLeaf.loadIfDeferred).toHaveBeenCalledOnce();
      expect(hydrate).toHaveBeenCalledOnce();
    });
  });

  it("repairs duplicate reattached thread panels before hydrating the owner", async () => {
    vi.useFakeTimers();
    const firstLeaf = leaf();
    const duplicateLeaf = leaf();
    const firstView = chatView(CodexChatView, firstLeaf);
    const duplicateView = chatView(CodexChatView, duplicateLeaf);
    firstLeaf.view = firstView;
    duplicateLeaf.view = duplicateView;
    const plugin = await pluginWithLeaves([firstLeaf, duplicateLeaf]);
    (plugin.app.workspace.getMostRecentLeaf as ReturnType<typeof vi.fn>).mockReturnValue(firstLeaf);

    await plugin.onload();
    vi.spyOn(firstView.surface, "openPanelSnapshot").mockReturnValue({
      viewId: "first",
      threadId: "thread-1",
      turnBusy: false,
      pending: false,
      unread: false,
      hasComposerDraft: false,
      hasForkDraft: false,
      connected: false,
    });
    vi.spyOn(duplicateView.surface, "openPanelSnapshot").mockReturnValue({
      viewId: "duplicate",
      threadId: "thread-1",
      turnBusy: false,
      pending: false,
      unread: false,
      hasComposerDraft: false,
      hasForkDraft: false,
      connected: false,
    });
    const firstHydrate = vi.spyOn(firstView.surface, "activateThread").mockResolvedValue(true);
    const duplicateHydrate = vi.spyOn(duplicateView.surface, "activateThread").mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(0);

    await waitForAsyncWork(() => {
      expect(firstHydrate).toHaveBeenCalledOnce();
      expect(duplicateLeaf.detach).toHaveBeenCalledOnce();
      expect(duplicateHydrate).not.toHaveBeenCalled();
    });
  });
});
