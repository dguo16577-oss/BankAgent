import { Fragment } from "react";

// Formatting only: preserve the original text and never create model-provided
// links, HTML, images or controls. Business navigation uses the route registry.
function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={index}
        className="rounded bg-slate-100 px-1.5 py-0.5 text-[.9em]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/** A deliberately limited rich-text view; financial values are never parsed. */
export function AnswerContent({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const key = index;
    if (!line.trim()) {
      index++;
      continue;
    }
    if (/^```/.test(line)) {
      index++;
      const code = [];
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index++]);
      }
      if (index < lines.length) index++;
      blocks.push(
        <pre
          key={key}
          className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-100"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h3
          key={key}
          className="pt-2 text-base font-semibold tracking-tight text-slate-950"
        >
          {inline(heading[1])}
        </h3>,
      );
      index++;
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const ordered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || ordered.test(line)) {
      const pattern = bullet.test(line) ? bullet : ordered;
      const items = [];
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(
          <li key={index}>{inline(lines[index++].replace(pattern, ""))}</li>,
        );
      }
      blocks.push(
        bullet.test(line) ? (
          <ul
            key={key}
            className="list-disc space-y-1.5 pl-5 marker:text-teal-700"
          >
            {items}
          </ul>
        ) : (
          <ol
            key={key}
            start={Number(line.trim().match(/^\d+/)?.[0] ?? 1)}
            className="list-decimal space-y-1.5 pl-5 marker:text-slate-500"
          >
            {items}
          </ol>
        ),
      );
      continue;
    }
    const paragraph = [line];
    index++;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(?:#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[index])
    ) {
      paragraph.push(lines[index++]);
    }
    blocks.push(
      <p key={key} className="whitespace-pre-wrap">
        {inline(paragraph.join("\n"))}
      </p>,
    );
  }
  return (
    <div className="min-w-0 space-y-3 break-words text-[15px] leading-7 text-slate-700">
      {blocks}
    </div>
  );
}
