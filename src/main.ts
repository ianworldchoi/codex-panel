import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { Notice, Plugin } from "obsidian";

import { VIEW_TYPE_CODEX_PANEL, VIEW_TYPE_CODEX_THREADS, VIEW_TYPE_CODEX_TURN_DIFF } from "./constants";
import { CodexChatView } from "./features/chat/host/view.obsidian";
import { registerSelectionRewriteCommand } from "./features/selection-rewrite/command.obsidian";
import { CodexThreadsView } from "./features/threads-view/view.obsidian";
import { CodexTurnDiffView } from "./features/turn-diff/view.obsidian";
import { CodexPanelRuntime } from "./plugin-runtime";
import { getVaultPath } from "./plugin-vault.obsidian";
import { CodexPanelSettingTab } from "./settings/host/tab.obsidian";
import {
  type CodexPanelSettings,
  DEFAULT_SETTINGS,
  normalizeCodexPath,
  normalizeSettings,
  settingsMatchStoredSettings,
  sharedPanelSettings,
} from "./settings/preferences";
import { editorSelectionEmphasisExtension } from "./shared/ui/editor-selection-emphasis.obsidian";
import { disposeTextareaHeightMirrors } from "./shared/ui/textarea-autogrow.measure";

const DEVICE_CODEX_PATH_KEY = "codex-panel:codexPath";

export default class CodexPanelPlugin extends Plugin {
  override settings: CodexPanelSettings = DEFAULT_SETTINGS;
  vaultPath = "";
  readonly runtime = new CodexPanelRuntime({
    app: this.app,
    settingsRef: this,
    saveSettings: (settings) => this.saveSettings(settings),
  });

  override async onload(): Promise<void> {
    disposeTextareaHeightMirrors();
    this.registerEditorExtension(editorSelectionEmphasisExtension);
    this.runtime.reset();
    this.vaultPath = getVaultPath(this.app);
    await this.loadSettings();
    this.runtime.initialize();
    this.runtime.reconnectWorkspaceViews();

    this.registerView(VIEW_TYPE_CODEX_PANEL, (leaf) => new CodexChatView(leaf, this.runtime));
    this.registerView(VIEW_TYPE_CODEX_TURN_DIFF, (leaf) => new CodexTurnDiffView(leaf));
    this.registerView(VIEW_TYPE_CODEX_THREADS, (leaf) => new CodexThreadsView(leaf, this.runtime));
    // Turn diff payloads are session-only. A plugin reload cannot recover them.
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CODEX_TURN_DIFF)) leaf.detach();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.runtime.activeWorkspaceLeafChanged(leaf);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.runtime.scheduleWorkspacePanelReconcile({ restore: false });
      }),
    );

    const openPanel = () => void this.runtime.activatePanel().catch(reportCommandError);
    this.addRibbonIcon("bot-message-square", "Open panel", openPanel);

    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: openPanel,
    });

    this.addCommand({
      id: "open-new-panel",
      name: "Open new panel",
      callback: () => void this.runtime.activateNewPanel().catch(reportCommandError),
    });

    this.addCommand({
      id: "open-threads-view",
      name: "Open threads view",
      callback: () => void this.runtime.activateThreadsView().catch(reportCommandError),
    });

    this.addCommand({
      id: "open-thread",
      name: "Open thread...",
      callback: () => {
        this.runtime.openThreadPicker();
      },
    });

    this.addCommand({
      id: "new-chat",
      name: "Start new chat",
      callback: () => void this.runtime.startNewChat().catch(reportCommandError),
    });

    this.runtime.setSelectionRewriteController(registerSelectionRewriteCommand(this, this.runtime.selectionRewritePort()));

    this.addSettingTab(new CodexPanelSettingTab(this.app, this, this.runtime.settingTabHost()));

    this.app.workspace.onLayoutReady(() => {
      this.runtime.scheduleWorkspacePanelReconcile();
    });
  }

  override onunload(): void {
    this.runtime.cancelWorkspacePanelReconcile();
    this.runtime.reset();
    disposeTextareaHeightMirrors();
  }

  async loadSettings(): Promise<void> {
    const storedSettings: unknown = await this.loadData();
    this.settings = normalizeSettings(storedSettings);
    const localPath: unknown = this.app.loadLocalStorage(DEVICE_CODEX_PATH_KEY);
    let codexPath = normalizeCodexPath(localPath);
    if (localPath === null && isAbsolute(this.settings.codexPath)) {
      try {
        await access(this.settings.codexPath, constants.X_OK);
        if ((await stat(this.settings.codexPath)).isFile()) codexPath = this.settings.codexPath;
      } catch {
        // A synced executable path may belong to another device.
      }
    }
    this.settings.codexPath = codexPath;
    this.app.saveLocalStorage(DEVICE_CODEX_PATH_KEY, codexPath);
    if (!settingsMatchStoredSettings(storedSettings, this.settings)) {
      await this.saveSettings();
    }
  }

  async saveSettings(settings: CodexPanelSettings = this.settings): Promise<void> {
    await this.saveData(sharedPanelSettings(settings));
    this.app.saveLocalStorage(DEVICE_CODEX_PATH_KEY, settings.codexPath);
  }
}

function reportCommandError(error: unknown): void {
  new Notice(`Codex Panel command failed: ${error instanceof Error ? error.message : String(error)}`);
}
