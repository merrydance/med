// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderMarkdownHtml } from './markdown'

describe('renderMarkdownHtml', () => {
  it('sanitizes active HTML while preserving markdown tables', () => {
    const html = renderMarkdownHtml([
      '| Study | N |',
      '|---|---:|',
      '| Trial A | 42 |',
      '',
      '<img src=x onerror=alert(1)>',
      '<script>alert(2)</script>'
    ].join('\n'))

    expect(html).toContain('<table>')
    expect(html).toContain('<td>Trial A</td>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')

    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
  })

  it('adds safe attributes to generated external links', () => {
    const html = renderMarkdownHtml('https://pubmed.ncbi.nlm.nih.gov/12345/')

    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('preserves single line breaks in clinical narrative output', () => {
    const html = renderMarkdownHtml([
      '前庭性偏头痛：常见，可反复眩晕。',
      '梅尼埃病：需要关注耳鸣和听力波动。',
      'BPPV：与体位变化相关。'
    ].join('\n'))

    expect(html).toContain('<br>')
  })

  it('highlights fenced code blocks', () => {
    const html = renderMarkdownHtml('```js\nconst dose = 5\n```')

    expect(html).toContain('hljs-code-block')
    expect(html).toContain('const')
    expect(html).toContain('dose')
  })
})
