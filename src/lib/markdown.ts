import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  if (!md || typeof md !== "string") return "";
  const rawHtml = marked.parse(md, { async: false }) as string;

  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "p",
      "a",
      "ul",
      "ol",
      "li",
      "b",
      "i",
      "strong",
      "em",
      "strike",
      "code",
      "hr",
      "br",
      "div",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
      "img",
      "span",
      "del",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      span: ["class"],
      th: ["align"],
      td: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || "";
        // Disallow javascript: or unsafe schemes
        if (
          href.trim().toLowerCase().startsWith("javascript:") ||
          href.trim().toLowerCase().startsWith("data:") ||
          href.trim().toLowerCase().startsWith("vbscript:")
        ) {
          return { tagName: "span", attribs: {} };
        }
        // Force rel="noopener noreferrer" for safety
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: "noopener noreferrer",
          },
        };
      },
    },
  });
}
