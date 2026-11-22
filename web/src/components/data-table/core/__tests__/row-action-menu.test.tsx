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
import { expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

import { DataTableRowActionMenu } from '../row-action-menu'

it.each(['default', 'custom'] as const)(
  'names the %s trigger and allows keyboard users to open its actions',
  async (triggerKind) => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(
      <DataTableRowActionMenu
        ariaLabel='Row actions'
        trigger={
          triggerKind === 'custom' ? (
            <Button type='button' variant='outline' size='icon-sm' />
          ) : undefined
        }
      >
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        </DropdownMenuGroup>
      </DataTableRowActionMenu>
    )

    const trigger = screen.getByRole('button', { name: 'Row actions' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    trigger.focus()
    await user.keyboard('{Enter}')

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledOnce()
  }
)
