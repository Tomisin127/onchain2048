import { useEffect, useState, lazy, Suspense } from 'react'

const FarcasterToastManager = lazy(() => import('./FarcasterToastManager'))
const FarcasterManifestSigner = lazy(() => import('./FarcasterManifestSigner'))
const MiniAppPrompt = lazy(() => import('./MiniAppPrompt'))

interface FarcasterWrapperProps {
  children: React.ReactNode
}

export default function FarcasterWrapper({ children }: FarcasterWrapperProps): JSX.Element {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return <>{children}</>
  }

  return (
    <Suspense fallback={<>{children}</>}>
      <FarcasterToastManager>
        {({ onManifestSuccess, onManifestError }) => (
          <>
            <FarcasterManifestSigner 
              onSuccess={onManifestSuccess}
              onError={onManifestError}
            />
            {children}
          </>
        )}
      </FarcasterToastManager>
    </Suspense>
  )
}
