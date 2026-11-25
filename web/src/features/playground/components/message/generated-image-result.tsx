/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { DownloadIcon, ExpandIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ResponseImage } from '@/components/ai-elements/response-renderer-image'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { ImageDialog } from '@/features/usage-logs/components/dialogs/image-dialog'
import { handleServerError } from '@/lib/handle-server-error'

import type { ImageGenerationRequest } from '../../types'

function GeneratedImage(props: { src: string; index: number }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(false)
  const [dimensions, setDimensions] = useState('')
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      const response = await fetch(props.src, { credentials: 'omit' })
      if (!response.ok) throw new Error(t('Failed to download image'))
      const blob = await response.blob()
      const extensions: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      }
      const extension = extensions[blob.type]
      if (!extension) throw new Error(t('Failed to download image'))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `generated-image-${props.index + 1}.${extension}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      handleServerError(error, t('Failed to download image'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className='bg-background min-w-0 overflow-hidden rounded-lg border'>
      <Button
        variant='ghost'
        className='h-auto w-full rounded-none p-2'
        aria-label={t('Preview image {{number}}', { number: props.index + 1 })}
        onClick={() => setPreview(true)}
      >
        <ResponseImage
          node={{
            src: props.src,
            alt: t('Generated image {{number}}', { number: props.index + 1 }),
            title: null,
          }}
          onLoad={(event) =>
            setDimensions(
              `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`
            )
          }
        />
      </Button>
      <div className='border-border/60 flex items-center justify-between gap-2 border-t px-2 py-1.5'>
        <span className='text-muted-foreground text-[11px]'>{dimensions}</span>
        <div className='flex items-center gap-1'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            aria-label={t('Preview image {{number}}', {
              number: props.index + 1,
            })}
            onClick={() => setPreview(true)}
          >
            <ExpandIcon className='size-3.5' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 text-xs'
            disabled={downloading}
            onClick={() => void download()}
          >
            <DownloadIcon className='size-3.5' />
            {t('Download')}
          </Button>
        </div>
      </div>
      {preview && (
        <ImageDialog
          imageUrl={props.src}
          open={preview}
          onOpenChange={setPreview}
        />
      )}
    </div>
  )
}

export function GeneratedImageResult(props: {
  images: string[]
  request?: ImageGenerationRequest
}) {
  const { t } = useTranslation()
  return (
    <div className='bg-muted/20 my-2 grid w-full max-w-2xl gap-3 rounded-xl border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='text-sm font-medium'>
          {props.images.length
            ? t('Generated {{count}} images', { count: props.images.length })
            : t('Image data is no longer available in this browser')}
        </span>
        {props.request && (
          <span className='text-muted-foreground text-xs'>
            {props.request.model} ·{' '}
            {props.request.size?.replace('x', ' × ') || t('Automatic size')} ·{' '}
            {t(props.request.quality || 'auto')}
          </span>
        )}
      </div>
      {props.images.length === 0 && (
        <p className='text-muted-foreground text-xs leading-5'>
          {t(
            'The generation settings are saved, but inline image data is not. Use your downloaded copy.'
          )}
        </p>
      )}
      <div
        className={
          props.images.length > 1
            ? 'grid gap-3 sm:grid-cols-2'
            : 'grid max-w-md gap-3'
        }
      >
        {props.images.map((src, index) => (
          <GeneratedImage key={src} src={src} index={index} />
        ))}
      </div>
      {props.request && (
        <div className='flex min-w-0 items-start gap-2'>
          <p className='text-muted-foreground max-h-28 min-w-0 flex-1 overflow-y-auto text-xs leading-5 break-words whitespace-pre-wrap'>
            {props.request.prompt}
          </p>
          <CopyButton
            value={props.request.prompt}
            tooltip={t('Copy prompt')}
            className='size-7'
          />
        </div>
      )}
      {props.images.some((src) => src.startsWith('data:')) && (
        <p className='text-muted-foreground text-[11px] leading-5'>
          {t(
            'Download your images before leaving. Inline images are not restored after a page refresh.'
          )}
        </p>
      )}
    </div>
  )
}
