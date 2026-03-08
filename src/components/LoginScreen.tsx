import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const MOVE_COST_USD = 0.0001;

interface LoginScreenProps {
  onEmailLogin: () => void;
  onBaseWalletConnect: () => Promise<void>;
  isBaseConnecting: boolean;
  baseWalletError?: string;
}

export function LoginScreen({
  onEmailLogin,
  onBaseWalletConnect,
  isBaseConnecting,
  baseWalletError = '',
}: LoginScreenProps) {
  const [connectionError, setConnectionError] = useState('');

  const handleBaseWallet = async () => {
    setConnectionError('');
    try {
      await onBaseWalletConnect();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[v0] Base wallet connection failed:', errorMsg);
      setConnectionError(errorMsg);
    }
  };

  const displayError = connectionError || baseWalletError;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full text-center space-y-6 glass-card animate-fade-in">
        <div className="space-y-2">
          <h1 className="text-5xl font-display font-bold gradient-text">2048</h1>
          <p className="text-muted-foreground text-sm font-body">On-Chain Edition</p>
        </div>

        <p className="text-muted-foreground text-sm font-body">
          Every move is a blockchain transaction on Base network
        </p>
        <p className="text-xs text-muted-foreground font-mono">Move cost: ${MOVE_COST_USD}</p>

        {displayError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-left">
            <p className="text-xs text-destructive font-mono break-words">{displayError}</p>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div className="font-medium text-secondary-foreground text-sm font-body">Connect to Start</div>

          <Button
            onClick={onEmailLogin}
            className="w-full gradient-btn text-foreground font-display font-semibold"
            size="lg"
          >
            Sign In with Email
          </Button>
          <p className="text-xs text-muted-foreground">Silent transactions, no popups</p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">OR</span>
            </div>
          </div>

          <Button
            onClick={handleBaseWallet}
            className="w-full bg-secondary text-secondary-foreground hover:bg-muted font-display"
            size="lg"
            variant="outline"
            disabled={isBaseConnecting}
          >
            {isBaseConnecting ? 'Connecting...' : 'Connect Base Wallet'}
          </Button>
          <p className="text-xs text-muted-foreground">One-time approval, then seamless play</p>
        </div>
      </Card>
    </div>
  );
}
