import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { PlaygroundMessageContent } from '../playground-message-content'

const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
})

test('renders an inline image in a completed assistant message with no text', () => {
  const src = 'data:image/png;base64,iVBORw0KGgo='
  render(
    <PlaygroundMessageContent
      actions={null}
      alignment='left'
      versionContent=''
      message={{
        key: 'assistant-image',
        from: 'assistant',
        status: 'complete',
        versions: [{ id: 'image-version', content: '' }],
        images: [src],
      }}
    />
  )
  expect(screen.getByRole('img')).toHaveAttribute('src', src)
})

test('image results retain generation parameters, actual dimensions and a full-size preview', async () => {
  // jsdom has no Web Animations API; the real image-preview scroll area uses it.
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  const user = userEvent.setup()
  render(
    <PlaygroundMessageContent
      actions={null}
      alignment='left'
      versionContent=''
      message={{
        key: 'image',
        from: 'assistant',
        status: 'complete',
        versions: [{ id: 'v', content: '' }],
        images: ['https://example.com/one.png', 'https://example.com/two.png'],
        imageGeneration: {
          model: 'gpt-image-2',
          group: 'default',
          prompt: 'A cat in a sunlit room',
          size: '3840x2160',
          quality: 'high',
          n: 2,
          stream: true,
        },
      }}
    />
  )
  expect(screen.getAllByRole('img')).toHaveLength(2)
  expect(screen.getByText(/gpt-image-2.*3840 × 2160/)).toBeVisible()
  expect(screen.getByText('A cat in a sunlit room')).toBeVisible()
  const image = screen.getByRole('img', { name: 'Generated image 1' })
  Object.defineProperties(image, {
    naturalWidth: { value: 3840 },
    naturalHeight: { value: 2160 },
  })
  fireEvent.load(image)
  expect(screen.getByText('3840 × 2160')).toBeVisible()
  await user.click(
    screen.getAllByRole('button', { name: 'Preview image 1' })[0]
  )
  expect(await screen.findByRole('dialog')).toBeVisible()
})

test('waiting for a long image request shows elapsed time and cancellation semantics', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T05:00:00Z'))
  render(
    <PlaygroundMessageContent
      actions={null}
      alignment='left'
      versionContent=''
      message={{
        key: 'waiting',
        from: 'assistant',
        status: 'loading',
        startedAt: Date.now() - 125_000,
        versions: [{ id: 'v', content: '' }],
        imageGeneration: {
          model: 'gpt-image-2',
          group: 'default',
          prompt: 'A cat',
          n: 1,
          stream: true,
        },
      }}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Generating images...')
  expect(screen.getByText('125s')).toBeVisible()
  expect(screen.getByText(/Still waiting for the image service/)).toBeVisible()
  expect(
    screen.getByText(/does not guarantee cancellation or a refund/)
  ).toBeVisible()
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText('127s')).toBeVisible()
})

test('a restored inline image record keeps its prompt and explains missing image data', () => {
  render(
    <PlaygroundMessageContent
      actions={null}
      alignment='left'
      versionContent=''
      message={{
        key: 'restored',
        from: 'assistant',
        status: 'complete',
        versions: [{ id: 'v', content: '' }],
        imageGeneration: {
          model: 'gpt-image-2',
          group: 'default',
          prompt: 'Saved prompt',
          n: 1,
          stream: true,
        },
      }}
    />
  )
  expect(
    screen.getByText('Image data is no longer available in this browser')
  ).toBeVisible()
  expect(screen.getByText('Saved prompt')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
