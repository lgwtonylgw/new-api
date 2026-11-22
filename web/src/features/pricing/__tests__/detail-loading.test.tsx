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
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'

import { ModelCard, ModelDetailsDrawer } from '../components'
import type { PricingModel } from '../types'

const detailChunk = vi.hoisted(() => {
  let resolve!: () => void
  return {
    requested: false,
    ready: false,
    promise: new Promise<void>((finish) => {
      resolve = finish
    }),
    resolve: () => resolve(),
  }
})

// Model the separately downloaded detail chunk without loading chart/editor
// implementations. The card, drawer shell and user interaction remain real.
vi.mock('../components/model-details', () => {
  detailChunk.requested = true
  return {
    ModelDetails: () => null,
    ModelDetailsDrawer: () => null,
    ModelDetailsContent: (props: { model: PricingModel }) => {
      if (!detailChunk.ready) throw detailChunk.promise
      return <p>Details for {props.model.model_name}</p>
    },
  }
})

const model: PricingModel = {
  id: 1,
  model_name: 'example-model',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 3,
  enable_groups: ['default'],
}

function ModelSelection() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ModelCard model={model} onClick={() => setOpen(true)} />
      {open && (
        <ModelDetailsDrawer
          open={open}
          onOpenChange={setOpen}
          model={model}
          groupRatio={{ default: 1 }}
          usableGroup={{}}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
        />
      )}
    </>
  )
}

it('loads details on selection and keeps the loading drawer dismissible', async () => {
  const user = userEvent.setup()
  render(<ModelSelection />)
  expect(screen.getByRole('heading', { name: 'example-model' })).toBeVisible()
  expect(detailChunk.requested).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Details' }))

  const drawer = await screen.findByRole('dialog', { name: 'example-model' })
  expect(await within(drawer).findByText('Loading...')).toBeVisible()
  expect(detailChunk.requested).toBe(true)

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await act(async () => {
    detailChunk.ready = true
    detailChunk.resolve()
  })
  await user.click(screen.getByRole('button', { name: 'Details' }))

  expect(await screen.findByText('Details for example-model')).toBeVisible()
})
