import type { SkillMetadata } from "../../../../domain/runtime/catalog";
import type { ThreadCommandTarget } from "../slash-commands/thread-arguments";
import type { ComposerAttachment } from "./attachments";
import type {
  ActiveNoteContextReference,
  ComposerContextReferences,
  SelectionContextReference,
  SelectionContextSnapshot,
} from "./context-references";

export interface ComposerInputSnapshot {
  readonly sourcePath: string;
  readonly availableSkills: readonly SkillMetadata[];
  readonly referenceActiveNoteOnSend: boolean;
  readonly automaticSelection: SelectionContextReference | null;
  readonly contextReferences: ComposerContextReferences;
  readonly activeNoteSnapshots: readonly ActiveNoteContextReference[];
  readonly selectionSnapshots: readonly SelectionContextSnapshot[];
  readonly attachments: readonly ComposerAttachment[];
  readonly threadCommandTarget?: ThreadCommandTarget;
}
