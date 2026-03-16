import { useRef, useState } from 'react'
import { Upload, Link as LinkIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { API_URL } from '@/lib/api'

const ACCEPT = '.xlsx,.xls,.xml,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/xml,text/csv'

interface FileOrLinkInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  label?: string
  placeholder?: string
  /** Storage klasörü (örn: supplier-files/) */
  folder?: string
}

export function FileOrLinkInput({
  value,
  onChange,
  id,
  label = 'Kaynak Dosya',
  placeholder = 'Dosya yolu veya URL',
  folder = 'supplier-files/',
}: FileOrLinkInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)

      const res = await fetch(`${API_URL}/storage/upload`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yükleme başarısız')
      onChange(json.path || '')
    } catch (err) {
      console.error('File upload:', err)
      alert(err instanceof Error ? err.message : 'Yükleme başarısız')
    } finally {
      setUploading(false)
    }
  }

  function handleLinkConfirm() {
    const url = linkUrl.trim()
    if (url) {
      onChange(url)
      setLinkUrl('')
      setLinkOpen(false)
    }
  }

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex gap-0 rounded-md border overflow-hidden">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-r-none border-0 focus-visible:ring-0 flex-1 min-w-0"
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleFileSelect}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-none border-0 border-l h-10 w-10 shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Yerel dosyadan yükle</TooltipContent>
        </Tooltip>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-l-none border-0 border-l h-10 w-10 shrink-0"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Linkten ekle</TooltipContent>
            </Tooltip>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-2">
              <Label>Dosya linki</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => e.key === 'Enter' && handleLinkConfirm()}
              />
              <Button size="sm" onClick={handleLinkConfirm} className="w-full">
                Ekle
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
