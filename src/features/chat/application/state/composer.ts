import { type ComposerContextReferences, selectionReferencesEqual } from "../composer/context-references";
import type { ComposerSuggestion } from "../composer/suggestion";
import { patchObject } from "./patch";

export interface ChatComposerState {
  readonly context: Pick<ComposerContextReferences, "activeNote" | "selection">;
  readonly selectionExcluded: boolean;
  readonly draft: string;
  readonly pendingAttachmentSaveIds: readonly number[];
  readonly suggestSelected: number;
  readonly suggestions: readonly ComposerSuggestion[];
  readonly suggestionsDismissedSignature: string | null;
}

export type ComposerAction =
  | { type: "composer/context-set"; context: ChatComposerState["context"] }
  | { type: "composer/selection-toggled" }
  | {
      type: "composer/draft-set";
      draft: string;
      clearSuggestions?: boolean;
      pendingAttachmentSaveIds?: readonly number[];
    }
  | {
      type: "composer/input-set";
      draft: string;
      suggestions: readonly ComposerSuggestion[];
      selected?: number;
      dismissedSignature?: string | null;
    }
  | {
      type: "composer/suggestions-set";
      suggestions: readonly ComposerSuggestion[];
      selected?: number;
      dismissedSignature?: string | null;
    };

export function initialComposerState(): ChatComposerState {
  return {
    context: { activeNote: null, selection: null },
    selectionExcluded: false,
    draft: "",
    pendingAttachmentSaveIds: [],
    suggestSelected: 0,
    suggestions: [],
    suggestionsDismissedSignature: null,
  };
}

export function reduceComposerSlice(state: ChatComposerState, action: ComposerAction): ChatComposerState {
  switch (action.type) {
    case "composer/context-set": {
      const previous = state.context;
      const next = action.context;
      const sameSelection = selectionReferencesEqual(previous.selection, next.selection);
      const sameNote =
        previous.activeNote?.path === next.activeNote?.path &&
        previous.activeNote?.name === next.activeNote?.name &&
        previous.activeNote?.linktext === next.activeNote?.linktext;
      if (
        sameSelection &&
        sameNote &&
        previous.selection?.name === next.selection?.name &&
        previous.selection?.linktext === next.selection?.linktext
      )
        return state;
      return { ...state, context: next, selectionExcluded: sameSelection && sameNote ? state.selectionExcluded : false };
    }
    case "composer/selection-toggled":
      return state.context.selection ? { ...state, selectionExcluded: !state.selectionExcluded } : state;
    case "composer/draft-set":
      return patchObject(state, {
        draft: action.draft,
        ...(action.pendingAttachmentSaveIds === undefined ? {} : { pendingAttachmentSaveIds: action.pendingAttachmentSaveIds }),
        ...(action.clearSuggestions ? { suggestions: [], suggestSelected: 0 } : {}),
      });
    case "composer/input-set":
      return patchObject(state, {
        draft: action.draft,
        suggestions: action.suggestions,
        suggestSelected: action.selected ?? state.suggestSelected,
        suggestionsDismissedSignature: action.dismissedSignature ?? null,
      });
    case "composer/suggestions-set":
      return patchObject(state, {
        suggestions: action.suggestions,
        suggestSelected: action.selected ?? state.suggestSelected,
        suggestionsDismissedSignature:
          action.dismissedSignature === undefined ? state.suggestionsDismissedSignature : action.dismissedSignature,
      });
  }
}
