import MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer.mjs'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs-code-block"><code class="hljs">${hljs.highlight(str, { language: lang }).value}</code></pre>`
      } catch {
        // fall through to escaped plaintext
      }
    }
    return `<pre class="hljs-code-block"><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`
  }
})

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
  const token = tokens[idx]
  const hrefIndex = token.attrIndex('href')
  const href = hrefIndex >= 0 ? token.attrs?.[hrefIndex]?.[1] ?? '' : ''

  if (/^(https?:|mailto:)/i.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }

  return (defaultLinkOpen as RenderRule)(tokens, idx, options, env, self)
}

export function renderMarkdownHtml(content: string): string {
  const rawHtml = md.render(content)
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote',
      'pre', 'code', 'span',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'hr', 'sub', 'sup'
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel']
  })
}
