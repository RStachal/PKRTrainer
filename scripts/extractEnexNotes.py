"""Pull the readable notes out of an Evernote export, without loading it whole.

The owner's ENEX archive is 1.8 GB across 39 files, one of them 1.3 GB. Almost
all of that is base64-encoded images inside <data> elements, which are useless to
us and would blow up memory if parsed as a document. So this streams the file,
skips resource payloads entirely, and keeps only the note titles and the text.

  python extractEnexNotes.py <file.enex> [--out=notes.jsonl] [--limit=N]

Emits one JSON object per note: title, created date, plain text, and the tags.
"""
import html
import io
import json
import os
import re
import sys

TAG_RE = re.compile(r"<[^>]+>")


def strip_markup(fragment: str) -> str:
    text = re.sub(r"<(en-media|br|hr)[^>]*/?>", " ", fragment)
    text = TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return re.sub(r"[ \t ]+", " ", text).strip()


def notes(path: str, limit: int = 0):
    """Yield notes, reading in chunks and never holding a <data> payload."""
    buffer = ""
    count = 0
    with io.open(path, encoding="utf8", errors="replace") as handle:
        while True:
            chunk = handle.read(1 << 20)
            if not chunk:
                break
            buffer += chunk

            # Resources are the bulk of the file and none of the value. Drop each
            # one as soon as it is complete rather than carrying it in the buffer.
            while True:
                start = buffer.find("<resource>")
                if start < 0:
                    break
                end = buffer.find("</resource>", start)
                if end < 0:
                    # Payload still arriving; keep only what precedes it.
                    if len(buffer) - start > (1 << 24):
                        buffer = buffer[:start] + "<resource>"
                    break
                buffer = buffer[:start] + buffer[end + len("</resource>"):]

            while True:
                start = buffer.find("<note>")
                end = buffer.find("</note>", start + 1) if start >= 0 else -1
                if start < 0 or end < 0:
                    break
                block = buffer[start:end]
                buffer = buffer[end + len("</note>"):]

                title = re.search(r"<title>(.*?)</title>", block, re.S)
                created = re.search(r"<created>(.*?)</created>", block, re.S)
                content = re.search(r"<content>(.*?)</content>", block, re.S)
                tags = re.findall(r"<tag>(.*?)</tag>", block, re.S)
                yield {
                    "title": html.unescape(title.group(1)).strip() if title else "",
                    "created": created.group(1) if created else "",
                    "tags": [html.unescape(t).strip() for t in tags],
                    "text": strip_markup(content.group(1)) if content else "",
                }
                count += 1
                if limit and count >= limit:
                    return


def main():
    path = sys.argv[1]
    out = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--out=")), "")
    limit = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--limit=")), 0))

    handle = io.open(out, "w", encoding="utf8") if out else None
    total = chars = 0
    for note in notes(path, limit):
        total += 1
        chars += len(note["text"])
        if handle:
            handle.write(json.dumps(note, ensure_ascii=False) + "\n")
    if handle:
        handle.close()
    print(f"{os.path.basename(path)}: {total} notes, {chars} chars of text"
          + (f" -> {out}" if out else ""))


if __name__ == "__main__":
    main()
