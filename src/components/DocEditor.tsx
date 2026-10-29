"use client";

import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, Extension, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Minus, Redo2, Table2, Undo2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { cx } from "./ui";

// The document editor for proposals and scopes of work. Both are stored as
// Markdown (what Claude and the templates write), edited as a document.
// [Bracketed] blanks are highlighted so none get sent.

const BLANK = /\[([^[\]\n]{2,120})\](?!\()/g;

/** The Markdown serializer escapes brackets; [placeholders] should stay readable in the saved text. */
const unescapeBrackets = (md: string) => md.replace(/\\([[\]])/g, "$1");

/** Highlights [placeholders] left to fill. */
const Blanks = Extension.create({
  name: "blanks",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blanks"),
        props: {
          decorations(state) {
            const found: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(BLANK)) {
                if (/^[xX ]$|^\d+$/.test(m[1]!.trim())) continue;
                found.push(Decoration.inline(pos + m.index!, pos + m.index! + m[0].length, { class: "blank" }));
              }
            });
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    ];
  },
});

function Tool({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx("grid size-7 place-items-center rounded-md text-ink-2 hover:bg-panel-2 hover:text-ink disabled:opacity-40", active && "bg-accent-soft text-accent-ink")}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      table: e.isActive("table"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-line bg-panel/95 px-2 py-1 backdrop-blur">
      <Tool label="Bold" active={s.bold} on={() => c().toggleBold().run()}>
        <Bold className="size-4" />
      </Tool>
      <Tool label="Italic" active={s.italic} on={() => c().toggleItalic().run()}>
        <Italic className="size-4" />
      </Tool>
      <span className="mx-1 h-4 w-px bg-line" />
      <Tool label="Heading" active={s.h2} on={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </Tool>
      <Tool label="Subheading" active={s.h3} on={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </Tool>
      <Tool label="Bullet list" active={s.bullet} on={() => c().toggleBulletList().run()}>
        <List className="size-4" />
      </Tool>
      <Tool label="Numbered list" active={s.ordered} on={() => c().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </Tool>
      <Tool label="Divider" on={() => c().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </Tool>
      <span className="mx-1 h-4 w-px bg-line" />
      <Tool label={s.table ? "Add a row" : "Insert a table"} on={() => (s.table ? c().addRowAfter().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
        <Table2 className="size-4" />
      </Tool>
      {s.table && (
        <>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnAfter().run()} className="rounded-md px-1.5 text-xs text-ink-2 hover:bg-panel-2">
            + Column
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteRow().run()} className="rounded-md px-1.5 text-xs text-ink-2 hover:bg-panel-2">
            − Row
          </button>
        </>
      )}
      <span className="ml-auto" />
      <Tool label="Undo" disabled={!s.undo} on={() => c().undo().run()}>
        <Undo2 className="size-4" />
      </Tool>
      <Tool label="Redo" disabled={!s.redo} on={() => c().redo().run()}>
        <Redo2 className="size-4" />
      </Tool>
    </div>
  );
}

/** Edit a Markdown document in place. `onReady` hands back the editor (for Word export, printing and copying). */
export function DocEditor({ markdown, onChange, onReady, label }: { markdown: string; onChange: (md: string) => void; onReady?: (editor: Editor | null) => void; label: string }) {
  const last = useRef(markdown);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } }), TableKit.configure({ table: { resizable: false } }), Markdown, Blanks],
    content: markdown,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: { attributes: { class: "proposal-doc focus:outline-none", "aria-label": label, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const md = unescapeBrackets(e.getMarkdown());
        last.current = md;
        onChange(md);
      }, 400);
    },
  });

  // A new draft (Rewrite, a template) replaces the content; our own edits don't.
  useEffect(() => {
    if (!editor || markdown === last.current) return;
    last.current = markdown;
    editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
  }, [editor, markdown]);

  useEffect(() => {
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor, onReady]);

  // Save the last keystrokes when leaving the tab.
  useEffect(
    () => () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        onChange(unescapeBrackets(editor.getMarkdown()));
      }
    },
    [editor, onChange],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel text-ink shadow-xs">
      {editor && <Toolbar editor={editor} />}
      <div className="px-6 py-6 sm:px-10 sm:py-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
