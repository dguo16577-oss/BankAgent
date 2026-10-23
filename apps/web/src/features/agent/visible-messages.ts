/** Tool-only protocol messages are not user-visible conversation bubbles. */
export function visibleMessages<
  T extends { id: string; role: string; content?: unknown },
>(messages: T[]) {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .flatMap((part: unknown) =>
                part &&
                typeof part === "object" &&
                "type" in part &&
                part.type === "text" &&
                "text" in part &&
                typeof part.text === "string"
                  ? [part.text]
                  : [],
              )
              .join("\n")
          : "";
    return text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
      ? [{ ...message, visibleText: text }]
      : [];
  });
}
