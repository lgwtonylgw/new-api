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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import { IMAGE_PROMPT_EXAMPLES } from '../../../lib/image/image-generation'
import { PlaygroundImageSettings } from '../playground-image-settings'
import { PlaygroundInput } from '../playground-input'

test('changing image ratio enables resolution and displays exact requested pixels', async () => {
  const update = vi.fn()
  const user = userEvent.setup()
  const config = { ...DEFAULT_CONFIG, model: 'gpt-image-2' }
  const { rerender } = render(
    <PlaygroundImageSettings config={config} onConfigChange={update} />
  )
  expect(screen.getByRole('combobox', { name: 'Resolution' })).toBeDisabled()
  await user.click(screen.getByRole('combobox', { name: 'Aspect ratio' }))
  await user.click(await screen.findByRole('option', { name: '16:9' }))
  expect(update).toHaveBeenCalledWith(
    'image',
    expect.objectContaining({ ratio: '16:9' })
  )
  const image = update.mock.calls[0][1]
  rerender(
    <PlaygroundImageSettings
      config={{ ...config, image }}
      onConfigChange={update}
    />
  )
  expect(screen.getByRole('combobox', { name: 'Resolution' })).toBeEnabled()
  await user.click(screen.getByRole('combobox', { name: 'Resolution' }))
  await user.click(await screen.findByRole('option', { name: '4K' }))
  const highResImage = update.mock.lastCall?.[1]
  rerender(
    <PlaygroundImageSettings
      config={{ ...config, image: highResImage }}
      onConfigChange={update}
    />
  )
  expect(screen.getByText('3840 × 2160')).toBeVisible()
})

test('generation locks all image controls and unsupported models keep standard sizing', () => {
  const { rerender } = render(
    <PlaygroundImageSettings
      config={{ ...DEFAULT_CONFIG, model: 'gpt-image-2' }}
      disabled
      onConfigChange={vi.fn()}
    />
  )
  for (const control of screen.getAllByRole('combobox')) {
    expect(control).toBeDisabled()
  }
  rerender(
    <PlaygroundImageSettings
      config={{
        ...DEFAULT_CONFIG,
        model: 'gpt-image-1.5',
        image: { ratio: '1:1', resolution: '4K' },
      }}
      onConfigChange={vi.fn()}
    />
  )
  expect(screen.getByRole('combobox', { name: 'Resolution' })).toBeDisabled()
  expect(screen.getByText('1024 × 1024')).toBeVisible()
})

test('choosing inspiration fills a draft and waits for the user to send', async () => {
  const submit = vi.fn()
  const user = userEvent.setup()
  render(
    <PlaygroundInput
      config={{ ...DEFAULT_CONFIG, model: 'gpt-image-2' }}
      mode='image'
      models={[{ value: 'gpt-image-2', label: 'gpt-image-2' }]}
      modelValue='gpt-image-2'
      onModelChange={vi.fn()}
      groups={[{ value: 'default', label: 'Default', ratio: 1 }]}
      groupValue='default'
      onGroupChange={vi.fn()}
      onConfigChange={vi.fn()}
      onParameterEnabledChange={vi.fn()}
      parameterEnabled={DEFAULT_PARAMETER_ENABLED}
      onSubmit={submit}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Inspiration' }))
  await user.click(
    await screen.findByRole('menuitem', { name: IMAGE_PROMPT_EXAMPLES[0] })
  )
  expect(screen.getByRole('textbox')).toHaveValue(IMAGE_PROMPT_EXAMPLES[0])
  expect(submit).not.toHaveBeenCalled()
  await user.click(screen.getAllByRole('button', { name: /^Send/ })[0])
  expect(submit).toHaveBeenCalledWith(IMAGE_PROMPT_EXAMPLES[0])
})
