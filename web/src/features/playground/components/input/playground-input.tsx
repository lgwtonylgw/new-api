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
import { useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PromptInput,
  PromptInputFooter,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { getSubmittableInputText } from '../../lib'
import type {
  ModelOption,
  GroupOption,
  ParameterEnabled,
  PlaygroundConfig,
  PlaygroundMode,
} from '../../types'
import { PlaygroundImageSettingsPopover } from './playground-image-settings'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'

interface PlaygroundInputProps {
  promptRef?: Ref<HTMLTextAreaElement>
  value?: string
  onValueChange?: (value: string) => void
  config: PlaygroundConfig
  onSubmit: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  mode?: PlaygroundMode
  canSwitchMode?: boolean
  onModeChange?: (mode: PlaygroundMode) => void
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  hasMessages?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onClearMessages?: () => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInput({
  promptRef,
  value,
  onValueChange,
  config,
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  mode = 'chat',
  canSwitchMode = false,
  onModeChange,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  hasMessages = false,
  onConfigChange,
  onClearMessages,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [internalText, setInternalText] = useState('')
  const text = value ?? internalText
  const canUseModel =
    !isModelLoading && models.some((model) => model.value === modelValue)
  const setText = (nextText: string) => {
    setInternalText(nextText)
    onValueChange?.(nextText)
  }

  const handleSubmit = (message: PromptInputMessage) => {
    const submittableText = getSubmittableInputText(
      message,
      disabled || !canUseModel
    )

    if (!submittableText) return
    onSubmit(submittableText)
    setText('')
  }

  return (
    <div className='shrink-0 pb-2 md:pb-4'>
      <PromptInput
        className='relative'
        groupClassName='bg-card border-border dark:bg-card has-disabled:bg-card dark:has-disabled:bg-card rounded-2xl shadow-sm has-disabled:opacity-100 has-[[data-slot=input-group-control]:focus-visible]:border-ring/60 has-[[data-slot=input-group-control]:focus-visible]:ring-0'
        onSubmit={handleSubmit}
      >
        <PromptInputTextarea
          ref={promptRef}
          rows={1}
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='max-h-32 min-h-10 px-3 pt-2.5 pb-1 leading-6 break-normal [overflow-wrap:anywhere] sm:px-4'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            mode === 'image'
              ? t('Describe the image you want to generate')
              : t('Ask anything')
          }
          value={text}
        />

        <PromptInputFooter className='px-2 py-1.5'>
          <PlaygroundInputControls
            canUseModel={canUseModel}
            disabled={disabled}
            groups={groups}
            groupValue={groupValue}
            isGenerating={isGenerating}
            isModelLoading={isModelLoading}
            mode={mode}
            models={models}
            modelValue={modelValue}
            onGroupChange={onGroupChange}
            onModelChange={onModelChange}
            onStop={onStop}
            text={text}
            tools={
              <div className='flex min-w-0 flex-wrap items-center gap-1'>
                {canSwitchMode && (
                  <Select
                    items={[
                      { value: 'image', label: t('Generate image') },
                      { value: 'chat', label: t('Chat') },
                    ]}
                    value={mode}
                    disabled={disabled || isModelLoading}
                    onValueChange={(value) => {
                      if (value === 'chat' || value === 'image') {
                        onModeChange?.(value)
                      }
                    }}
                  >
                    <SelectTrigger
                      aria-label={t('Playground mode')}
                      size='sm'
                      className='border-transparent px-2 shadow-none'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='image'>
                          {t('Generate image')}
                        </SelectItem>
                        <SelectItem value='chat'>{t('Chat')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                {mode === 'image' && (
                  <PlaygroundImageSettingsPopover
                    config={config}
                    disabled={disabled}
                    onConfigChange={onConfigChange}
                  />
                )}
                <PlaygroundInputTools
                  config={config}
                  imageMode={mode === 'image'}
                  onPromptSelect={setText}
                  disabled={disabled}
                  hasMessages={hasMessages}
                  onConfigChange={onConfigChange}
                  onClearMessages={onClearMessages}
                  onParameterEnabledChange={onParameterEnabledChange}
                  parameterEnabled={parameterEnabled}
                />
              </div>
            }
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
