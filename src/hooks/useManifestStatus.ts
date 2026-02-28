import { useState, useEffect, useCallback } from 'react'

interface ManifestStatus {
  isSigned: boolean
  isLoading: boolean
  error: string | null
}

interface UseManifestStatusResult extends ManifestStatus {
  refetch: () => Promise<void>
}

interface AccountAssociation {
  header: string
  payload: string
  signature: string
}

interface FarcasterManifest {
  accountAssociation?: AccountAssociation
  miniapp?: {
    version: string
    name: string
    [key: string]: unknown
  }
}

export function useManifestStatus(): UseManifestStatusResult {
  const [status, setStatus] = useState<ManifestStatus>({
    isSigned: false,
    isLoading: true,
    error: null,
  })

  const checkManifestStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      const response = await fetch('/.well-known/farcaster.json')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status}`)
      }
      
      const manifest: FarcasterManifest = await response.json()
      
      // Check if accountAssociation exists and has valid signature
      const isSigned = Boolean(
        manifest.accountAssociation?.header &&
        manifest.accountAssociation?.payload &&
        manifest.accountAssociation?.signature
      )
      
      setStatus({
        isSigned,
        isLoading: false,
        error: null,
      })
    } catch (error) {
      setStatus({
        isSigned: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [])

  useEffect(() => {
    checkManifestStatus()
  }, [checkManifestStatus])

  return {
    ...status,
    refetch: checkManifestStatus,
  }
}

export function useIsManifestSigned(): { isSigned: boolean; isLoading: boolean } {
  const { isSigned, isLoading } = useManifestStatus()
  return { isSigned, isLoading }
}
