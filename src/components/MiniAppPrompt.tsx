import { useEffect, useState, useCallback } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'
import { supabase } from '@/integrations/supabase/client'

interface NotificationDetails {
  url: string
  token: string
}

export default function MiniAppPrompt(): JSX.Element | null {
  const [hasPrompted, setHasPrompted] = useState(false)

  const saveNotificationToken = useCallback(async (details: NotificationDetails) => {
    try {
      const { error } = await supabase
        .from('miniapp_notifications')
        .upsert(
          {
            notification_token: details.token,
            notification_url: details.url,
          },
          { onConflict: 'notification_token' }
        )
      if (error) {
        console.warn('Failed to save notification token:', error)
      } else {
        console.log('✅ Notification token saved to database')
      }
    } catch (err) {
      console.warn('Error saving notification token:', err)
    }
  }, [])

  const updateLastPlayed = useCallback(async () => {
    const token = localStorage.getItem('miniapp_notification_token')
    if (!token) return

    try {
      await supabase
        .from('miniapp_notifications')
        .update({ last_played_at: new Date().toISOString() })
        .eq('notification_token', token)
    } catch (err) {
      console.warn('Error updating last played:', err)
    }
  }, [])

  const promptAddMiniApp = useCallback(async () => {
    if (hasPrompted) return

    try {
      const isInMiniApp = await sdk.isInMiniApp()
      if (!isInMiniApp) {
        console.log('Not in mini app context, skipping addMiniApp prompt')
        return
      }

      await sdk.actions.ready()
      console.log('✅ sdk.actions.ready() called')

      // Update last played timestamp
      await updateLastPlayed()

      await new Promise(resolve => setTimeout(resolve, 1000))

      setHasPrompted(true)
      const response = await sdk.actions.addMiniApp()
      
      console.log('✅ addMiniApp response:', response)

      if (response && typeof response === 'object' && 'notificationDetails' in response) {
        const details = (response as any).notificationDetails as NotificationDetails
        if (details?.token && details?.url) {
          localStorage.setItem('miniapp_notification_token', details.token)
          localStorage.setItem('miniapp_notification_url', details.url)
          await saveNotificationToken(details)
        }
      }
    } catch (error: any) {
      const msg = error?.message || String(error)
      if (msg.includes('rejected') || msg.includes('Rejected')) {
        console.log('User declined to add mini app')
      } else {
        console.warn('addMiniApp error:', error)
      }
    }
  }, [hasPrompted, saveNotificationToken, updateLastPlayed])

  useEffect(() => {
    promptAddMiniApp()
  }, [promptAddMiniApp])

  return null
}
