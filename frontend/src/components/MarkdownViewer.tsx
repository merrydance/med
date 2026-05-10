import { useMemo } from 'react'
import { renderMarkdownHtml } from './markdown'
import 'highlight.js/styles/github-dark.css'

interface MarkdownViewerProps {
  content: string
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const sanitizedHtml = useMemo(() => {
    return renderMarkdownHtml(content)
  }, [content])

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
