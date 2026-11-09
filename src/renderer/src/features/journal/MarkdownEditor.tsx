import { useEffect, useRef } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/js/icons/ant.js'
import 'vditor/dist/index.css'

export function MarkdownEditor({
  initialValue,
  onChange,
  disabled
}: {
  initialValue: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const changed = useRef(onChange)
  changed.current = onChange
  useEffect(() => {
    if (!host.current) return
    let disposed = false
    let ready = false
    let lastValue = initialValue
    const publish = (value: string) => {
      if (!disposed && !disabled && value !== lastValue) {
        lastValue = value
        changed.current(value)
      }
    }
    const mount = document.createElement('div')
    host.current.appendChild(mount)
    const editor = new Vditor(mount, {
      cdn: new URL('./vditor', document.baseURI).href.replace(/\/$/, ''),
      mode: 'ir',
      minHeight: 260,
      height: 'auto',
      value: initialValue,
      cache: { enable: false },
      placeholder: '写下今天的所见、所想……',
      toolbar: [
        'headings',
        'bold',
        'italic',
        '|',
        'list',
        'check',
        'quote',
        'link',
        '|',
        'undo',
        'redo',
        '|',
        'edit-mode'
      ],
      preview: {
        delay: 250,
        hljs: { enable: false },
        math: { engine: 'KaTeX' },
        markdown: { sanitize: true },
        actions: []
      },
      input: publish,
      after: () => {
        ready = true
        if (disposed) editor.destroy()
        else if (disabled) editor.disabled()
        // Icons are bundled above. Prevent Vditor's synchronous inline-script loader
        // from running; keep the app's script CSP restricted to 'self'.
        if (!document.getElementById('vditorIconScript')) {
          const marker = document.createElement('meta')
          marker.id = 'vditorIconScript'
          document.head.appendChild(marker)
        }
      }
    })
    // Capture edits before Vditor's debounced callback, so switching notes or
    // clicking Save immediately after typing cannot lose the final characters.
    const immediate = (event: Event) => {
      if ((event as InputEvent).isComposing) return
      queueMicrotask(() => {
        if (ready && !disposed) publish(editor.getValue())
      })
    }
    mount.addEventListener('input', immediate, true)
    mount.addEventListener('focusout', immediate, true)
    mount.addEventListener('compositionend', immediate, true)
    return () => {
      disposed = true
      mount.removeEventListener('input', immediate, true)
      mount.removeEventListener('focusout', immediate, true)
      mount.removeEventListener('compositionend', immediate, true)
      if (ready) editor.destroy()
      mount.remove()
    }
    // A new instance belongs to one note. The parent keys this component by note/revision when read-only changes.
  }, [])
  return <div className="journal-markdown" ref={host} />
}
