import { useEffect, useState } from 'react'
import type { JournalAttachment } from '@shared/journal'
export function JournalMedia({ attachment }: { attachment: JournalAttachment }) {
  const [url, setUrl] = useState('')
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const changed = () => setEpoch((n) => n + 1)
    window.addEventListener('journal-assets-changed', changed)
    return () => window.removeEventListener('journal-assets-changed', changed)
  }, [])
  const [error, setError] = useState('')
  useEffect(() => {
    setError('')
    setUrl('')
    let alive = true
    let objectUrl = ''
    window.api.journal
      .media(attachment.id)
      .then((result) => {
        if (!alive) return
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(result.bytes)], { type: result.mime })
        )
        setUrl(objectUrl)
      })
      .catch((e) => {
        if (alive) setError(String(e))
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.id, epoch])
  return (
    <div className="journal-media">
      <span>{attachment.name}</span>
      {error ? (
        <span role="alert">{error}</span>
      ) : !url ? (
        <small>载入附件…</small>
      ) : attachment.mime.startsWith('audio/') ? (
        <audio src={url} controls preload="metadata" />
      ) : (
        <img src={url} alt={attachment.name} />
      )}
    </div>
  )
}
