import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { SpendPermissionConfig, SpendPermissionValues } from '@/components/SpendPermissionConfig';

const MOVE_COST_USD = 0.0001;

interface LoginScreenProps {
  onEmailLogin: () => void;
  onBaseWalletConnect: (params?: SpendPermissionValues) => Promise<void>;
  onSelfPayConnect: () => Promise<void>;
  isBaseConnecting: boolean;
  isSelfPayConnecting: boolean;
  baseWalletError?: string;
  selfPayError?: string;
}

export function LoginScreen({
  onEmailLogin,
  onBaseWalletConnect,
  onSelfPayConnect,
  isBaseConnecting,
  isSelfPayConnecting,
  baseWalletError = '',
  selfPayError = '',
}: LoginScreenProps) {
  const [connectionError, setConnectionError] = useState('');
  const [showSpendConfig, setShowSpendConfig] = useState(false);

  const handleBaseWallet = () => {
    setConnectionError('');
    setShowSpendConfig(true);
  };

  const handleSpendConfirm = async (values: SpendPermissionValues) => {
    setConnectionError('');
    try {
      await onBaseWalletConnect(values);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[v0] Base wallet connection failed:', errorMsg);
      setConnectionError(errorMsg);
    }
  };

  const handleSelfPay = async () => {
    setConnectionError('');
    try {
      await onSelfPayConnect();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setConnectionError(errorMsg);
    }
  };

  const displayError = connectionError || baseWalletError || selfPayError;

  if (showSpendConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-4xl font-display font-bold gradient-text">2048</h1>
            <p className="text-muted-foreground text-xs font-body">Configure your spend permission</p>
          </div>

          {displayError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-xs text-destructive font-mono break-words">{displayError}</p>
            </div>
          )}

          <SpendPermissionConfig
            onConfirm={handleSpendConfirm}
            onCancel={() => setShowSpendConfig(false)}
            isConnecting={isBaseConnecting}
          />
        </div>
      </div>
    );
  }

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
          <p className="text-xs text-muted-foreground">Fees managed by the game · Sign once, play silently</p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">OR</span>
            </div>
          </div>

          <Button
            onClick={handleSelfPay}
            className="w-full bg-secondary text-secondary-foreground hover:bg-muted font-display"
            size="lg"
            variant="outline"
            disabled={isSelfPayConnecting}
          >
            {isSelfPayConnecting ? 'Connecting...' : 'Connect Wallet (Self-Pay)'}
          </Button>
          <p className="text-xs text-muted-foreground">You pay gas fees · Approve each move from your wallet</p>
        </div>
      </Card>
    </div>
  );
}
