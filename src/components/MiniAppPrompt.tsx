import { useEffect, useState, useCallback } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'

interface NotificationDetails {
  url: string
  token: string
}

export default function MiniAppPrompt(): JSX.Element | null {
  const [hasPrompted, setHasPrompted] = useState(false)

  const promptAddMiniApp = useCallback(async () => {
    if (hasPrompted) return

    try {
      // Check if we're inside a mini app context
      const isInMiniApp = await sdk.isInMiniApp()
      if (!isInMiniApp) {
        console.log('Not in mini app context, skipping addMiniApp prompt')
        return
      }

      // Signal that the app is ready to display
      await sdk.actions.ready()
      console.log('✅ sdk.actions.ready() called')

      // Small delay to let the app render before prompting
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Prompt user to add the mini app (favorites + notifications)
      setHasPrompted(true)
      const response = await sdk.actions.addMiniApp()
      
      console.log('✅ addMiniApp response:', response)

      // Store notification details if provided
      if (response && typeof response === 'object' && 'notificationDetails' in response) {
        const details = (response as any).notificationDetails as NotificationDetails
        if (details?.token && details?.url) {
          localStorage.setItem('miniapp_notification_token', details.token)
          localStorage.setItem('miniapp_notification_url', details.url)
          console.log('✅ Notification details saved:', { url: details.url })
        }
      }
    } catch (error: any) {
      // User rejected or not supported — that's fine
      const msg = error?.message || String(error)
      if (msg.includes('rejected') || msg.includes('Rejected')) {
        console.log('User declined to add mini app')
      } else {
        console.warn('addMiniApp error:', error)
      }
    }
  }, [hasPrompted])

  useEffect(() => {
    promptAddMiniApp()
  }, [promptAddMiniApp])

  return null
}
