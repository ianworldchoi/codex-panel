import type { ChatPanelSettingsAccess } from "../../../../src/features/chat/host/contracts";
import type { CodexPanelSettings } from "../../../../src/settings/preferences";

export function chatPanelSettingsAccess(settings: CodexPanelSettings): ChatPanelSettingsAccess {
  return {
    typography: () => settings,

    attachmentFolder: () => settings.attachmentFolder,
    archiveExportEnabled: () => settings.archiveExportEnabled,
    scrollThreadFromComposerEdges: () => settings.scrollThreadFromComposerEdges,
    sendShortcut: () => settings.sendShortcut,
    showToolbar: () => settings.showToolbar,
    newConversationsEphemeral: () => settings.newConversationsEphemeral,
  };
}
