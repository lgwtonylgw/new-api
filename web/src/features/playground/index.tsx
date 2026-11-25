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

import { PlaygroundChat } from './components/chat/playground-chat'
import { PlaygroundInput } from './components/input/playground-input'
import {
  useChatHandler,
  usePlaygroundConversation,
  usePlaygroundOptions,
  usePlaygroundState,
} from './hooks'
import type { PlaygroundMode } from './types'

export function Playground() {
  const [draft, setDraft] = useState('')
  const {
    config,
    parameterEnabled,
    messages,
    isLoadingMessages,
    groups,
    updateMessages,
    setGroups,
    updateConfig,
    updateParameterEnabled,
    clearMessages,
  } = usePlaygroundState()

  const { isLoadingModels, availableModels: models } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    setGroups,
    updateConfig,
  })

  const [modePreference, setModePreference] = useState<{
    group: string
    model: string
    mode: PlaygroundMode
  }>()
  const endpoints = models.find(
    (option) => option.value === config.model
  )?.endpoints
  const supportsImage = endpoints?.includes('image-generation') ?? false
  const canSwitchMode =
    supportsImage && (endpoints?.includes('openai') ?? false)
  let mode: PlaygroundMode = supportsImage ? 'image' : 'chat'
  if (
    canSwitchMode &&
    modePreference?.group === config.group &&
    modePreference.model === config.model
  ) {
    mode = modePreference.mode
  }

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    mode,
    parameterEnabled,
    onMessageUpdate: updateMessages,
  })

  const {
    editingMessageKey,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
  } = usePlaygroundConversation({
    messages,
    updateMessages,
    sendChat,
  })

  const handleClearMessages = () => {
    handleEditOpenChange(false)
    clearMessages()
  }

  return (
    <div className='relative flex size-full min-h-0 flex-col overflow-hidden'>
      {/* Full-width scroll container: scrolling works even over side whitespace */}
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <PlaygroundChat
          mode={mode}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          onRegenerateMessage={handleRegenerateMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onSelectPrompt={mode === 'image' ? setDraft : handleSendMessage}
          isGenerating={isGenerating}
          editingKey={editingMessageKey}
          onCancelEdit={handleEditOpenChange}
          onSaveEdit={(newContent) => applyEdit(newContent, false)}
          onSaveEditAndSubmit={(newContent) => applyEdit(newContent, true)}
        />
      </div>

      {/* Input area: center content and constrain to the same container width */}
      <div className='mx-auto w-full max-w-4xl'>
        <PlaygroundInput
          value={draft}
          onValueChange={setDraft}
          config={config}
          disabled={isGenerating}
          groups={groups}
          groupValue={config.group}
          isGenerating={isGenerating}
          isModelLoading={isLoadingModels}
          modelValue={config.model}
          models={models}
          mode={mode}
          canSwitchMode={canSwitchMode}
          onModeChange={(value) =>
            setModePreference({
              model: config.model,
              group: config.group,
              mode: value,
            })
          }
          onGroupChange={(value) => updateConfig('group', value)}
          onConfigChange={updateConfig}
          onClearMessages={handleClearMessages}
          onModelChange={(value) => updateConfig('model', value)}
          onParameterEnabledChange={updateParameterEnabled}
          onStop={stopGeneration}
          onSubmit={handleSendMessage}
          parameterEnabled={parameterEnabled}
          hasMessages={messages.length > 0}
        />
      </div>
    </div>
  )
}
