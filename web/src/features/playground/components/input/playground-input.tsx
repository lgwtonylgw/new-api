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
import { useState } from 'react'
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
import { PlaygroundImageSettings } from './playground-image-settings'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'

interface PlaygroundInputProps {
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
  const setText = (nextText: string) => {
    setInternalText(nextText)
    onValueChange?.(nextText)
  }

  const handleSubmit = (message: PromptInputMessage) => {
    if (isModelLoading || !models.some((model) => model.value === modelValue)) {
      return
    }
    const submittableText = getSubmittableInputText(message, disabled)

    if (!submittableText) return
    onSubmit(submittableText)
    setText('')
  }

  return (
    <div className='grid shrink-0 gap-4 px-1 md:pb-4'>
      <PromptInput
        className='relative'
        groupClassName='bg-background/95 dark:bg-background/80 border-border/70 shadow-[0_18px_60px_-32px_rgba(0,0,0,0.65)] ring-1 ring-foreground/5 rounded-xl overflow-hidden transition-all duration-200 focus-within:border-primary/45 focus-within:ring-primary/15 focus-within:shadow-[0_22px_70px_-34px_rgba(0,0,0,0.75)]'
        onSubmit={handleSubmit}
      >
        {mode === 'image' && (
          <PlaygroundImageSettings
            config={config}
            disabled={disabled}
            onConfigChange={onConfigChange}
          />
        )}
        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='min-h-20 px-5 pt-4 pb-3 leading-7 md:min-h-24 md:text-base'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            mode === 'image'
              ? t('Describe the image you want to generate')
              : t('Ask anything')
          }
          value={text}
        />

        <PromptInputFooter className='border-border/60 bg-muted/20 dark:bg-muted/10 border-t px-3 py-2.5 backdrop-blur'>
          <PlaygroundInputControls
            disabled={disabled}
            groups={groups}
            groupValue={groupValue}
            isGenerating={isGenerating}
            isModelLoading={isModelLoading}
            models={models}
            modelValue={modelValue}
            onGroupChange={onGroupChange}
            onModelChange={onModelChange}
            onStop={onStop}
            text={text}
            tools={
              <div className='flex items-center gap-2'>
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
                    <SelectTrigger aria-label={t('Playground mode')}>
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
