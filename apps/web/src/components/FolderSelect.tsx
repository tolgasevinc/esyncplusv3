import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Database } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

interface StorageFolder {
  id: number
  name: string
  path: string
  type: string
}

interface FolderSelectProps {
  value?: string
  onChange?: (path: string) => void
  label?: string
  placeholder?: string
  storageKey?: string
}

export function FolderSelect({
  value,
  onChange,
  label = 'Klasör',
  placeholder = 'Klasör seçin...',
  storageKey,
}: FolderSelectProps) {
  const [folders, setFolders] = useState<StorageFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(value || '')

  useEffect(() => {
    fetch(`${API_URL}/storage/folders`)
      .then((r) => r.json())
      .then((data) => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved && !value) setSelected(saved)
    }
  }, [storageKey, value])

  useEffect(() => {
    if (value !== undefined) setSelected(value)
  }, [value])

  function handleChange(path: string) {
    setSelected(path)
    onChange?.(path)
    if (storageKey) localStorage.setItem(storageKey, path)
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Database className="h-4 w-4" />
        {label}
      </Label>
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">{placeholder}</option>
        {folders.map((f) => (
          <option key={f.id} value={f.path}>
            {f.name} ({f.path})
          </option>
        ))}
      </select>
    </div>
  )
}
