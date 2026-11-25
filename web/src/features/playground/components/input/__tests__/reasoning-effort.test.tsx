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
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  STORAGE_KEYS,
} from '../../../constants'
import { usePlaygroundState } from '../../../hooks/use-playground-state'
import { buildChatCompletionPayload } from '../../../lib/streaming/payload-builder'
import { PlaygroundParameterPanel } from '../playground-parameter-panel'

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEYS.CONFIG)
})

function ChatParameters() {
  const { config, updateConfig, parameterEnabled, updateParameterEnabled } =
    usePlaygroundState()
  return (
    <PlaygroundParameterPanel
      config={config}
      onConfigChange={updateConfig}
      onParameterEnabledChange={updateParameterEnabled}
      parameterEnabled={parameterEnabled}
    />
  )
}

test('chat parameters offer reasoning effort and allow returning to the model default', async () => {
  const user = userEvent.setup()
  render(<ChatParameters />)

  await user.click(screen.getByRole('button', { name: 'Parameters' }))
  const effort = screen.getByRole('combobox', { name: 'Reasoning Effort' })
  expect(effort).toHaveTextContent('Default')
  await user.click(effort)
  await user.click(await screen.findByRole('option', { name: 'High' }))
  expect(effort).toHaveTextContent('High')
  await user.click(effort)
  await user.click(await screen.findByRole('option', { name: 'Default' }))
  expect(effort).toHaveTextContent('Default')
})

test.each([true, false])(
  'chat sends only an explicitly selected effort (stream=%s)',
  (stream) => {
    const config = { ...DEFAULT_CONFIG, stream }
    expect(
      buildChatCompletionPayload([], config, DEFAULT_PARAMETER_ENABLED)
    ).not.toHaveProperty('reasoning_effort')
    expect(
      buildChatCompletionPayload(
        [],
        { ...config, reasoning_effort: 'none' },
        DEFAULT_PARAMETER_ENABLED
      )
    ).toMatchObject({ stream, reasoning_effort: 'none' })
  }
)

test.each(['model', 'group'] as const)(
  'reasoning effort persists across reloads and clears when changing %s',
  (key) => {
    const first = renderHook(usePlaygroundState)
    act(() => first.result.current.updateConfig('reasoning_effort', 'high'))
    first.unmount()

    const { result } = renderHook(usePlaygroundState)
    expect(result.current.config.reasoning_effort).toBe('high')
    act(() => result.current.updateConfig(key, 'new-selection'))
    expect(result.current.config.reasoning_effort).toBeUndefined()
  }
)
