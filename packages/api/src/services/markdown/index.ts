/**
 * Markdown Service
 * Renders Markdown to sanitized HTML for safe display
 */

import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,        // GitHub Flavored Markdown
  breaks: true,     // Convert \n to <br>
});

/**
 * Allowed HTML tags and attributes for sanitization
 */
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    // Block elements
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'div', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'br',
    // Inline elements
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
    'span', 'sub', 'sup', 'mark',
    // Media (optional, for rich content)
    'img',
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'th': ['align'],
    'td': ['align'],
    'code': ['class'],  // For syntax highlighting classes
    '*': ['class'],     // Allow class on all elements for styling
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Always add rel="noopener noreferrer" to external links
  transformTags: {
    'a': (_tagName, attribs) => {
      return {
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      };
    },
  },
};

/**
 * Render Markdown to sanitized HTML
 * @param markdown - Markdown string to render
 * @returns Sanitized HTML string
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) {
    return '';
  }

  // Parse markdown to HTML
  const rawHtml = marked.parse(markdown) as string;

  // Sanitize HTML to remove any dangerous content
  const sanitizedHtml = sanitizeHtml(rawHtml, sanitizeOptions);

  return sanitizedHtml;
}

/**
 * Render Markdown with template variable substitution
 * Variables are in the format {{variableName}}
 *
 * @param markdown - Markdown string with template variables
 * @param variables - Object with variable values
 * @returns Sanitized HTML string with variables substituted
 */
export function renderMarkdownWithVariables(
  markdown: string,
  variables: Record<string, string | undefined>
): string {
  if (!markdown) {
    return '';
  }

  // Replace template variables {{varName}} with values
  const withVariables = markdown.replace(
    /\{\{(\w+)\}\}/g,
    (match, varName: string) => {
      const value = variables[varName];
      // Escape HTML in variable values to prevent XSS
      return value !== undefined ? escapeHtml(value) : match;
    }
  );

  return renderMarkdown(withVariables);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * Strip HTML tags from text (for plain text email versions)
 * @param html - HTML string
 * @returns Plain text
 */
export function stripHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/\s+/g, ' ').trim();
}

/**
 * Get a preview of markdown content (first N characters, stripped of formatting)
 * @param markdown - Markdown string
 * @param maxLength - Maximum length of preview (default 200)
 * @returns Plain text preview
 */
export function getMarkdownPreview(markdown: string, maxLength = 200): string {
  if (!markdown) {
    return '';
  }

  const html = renderMarkdown(markdown);
  const text = stripHtml(html);

  if (text.length <= maxLength) {
    return text;
  }

  // Find a good break point
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
}
