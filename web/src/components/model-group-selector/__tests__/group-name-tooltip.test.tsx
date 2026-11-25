import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { ModelGroupSelector } from '../../model-group-selector'

test('hovering a group shows its full name and keeps it selectable', async () => {
  const fullName = 'AI 画布 · 全能生图【特惠】'
  const selectGroup = vi.fn()
  const user = userEvent.setup()
  render(
    <ModelGroupSelector
      selectedModel=''
      models={[]}
      onModelChange={() => undefined}
      selectedGroup=''
      groups={[{ label: fullName, value: 'image-special' }]}
      onGroupChange={selectGroup}
    />
  )

  await user.click(screen.getByRole('combobox'))
  const group = await screen.findByRole('button', { name: fullName })
  await user.hover(group)
  // Native browser tooltips are not rendered in jsdom; title is their contract.
  expect(group).toHaveAttribute('title', fullName)
  await user.click(group)
  expect(selectGroup).toHaveBeenCalledWith('image-special')
})
