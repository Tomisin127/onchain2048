import { useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { useAccount } from 'wagmi';
import {
  Swap,
  SwapAmountInput,
  SwapToggleButton,
  SwapButton,
  SwapMessage,
  SwapToast,
  SwapSettings,
  SwapSettingsSlippageDescription,
  SwapSettingsSlippageInput,
  SwapSettingsSlippageTitle,
} from '@coinbase/onchainkit/swap';
import type { Token } from '@coinbase/onchainkit/token';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

// Your AppCoin token on Base
const APP_TOKEN: Token = {
  name: '2048 Coin',
  address: '0xa27567af20caff5747869a493c8a6a7444b20f9c',
  symbol: '2048',
  decimals: 18,
  image: 'https://raw.githubusercontent.com/base-org/web/master/apps/web/public/images/base-logo.svg',
  chainId: 8453,
};

// ETH on Base
const ETH_TOKEN: Token = {
  name: 'Ethereum',
  address: '',
  symbol: 'ETH',
  decimals: 18,
  image: 'https://dynamic-assets.coinbase.com/dbb4b4983bde81309ddab83eb598358eb44375b930b94687ebe38bc22e52c3b2125258ffb8477a5ef22e33d6bd72e32a506c391caa13af64c00e46613c3e5806/asset_icons/4113b082d21cc5fab17fc8f2d19fb996165bcce635e6900f7fc2d57c4ef33ae9.png',
  chainId: 8453,
};

// Swappable tokens list
const swappableTokens: Token[] = [ETH_TOKEN, APP_TOKEN];

interface SwapModalProps {
  walletAddress?: string;
  onSwapSuccess?: () => void;
}

export function SwapModal({ onSwapSuccess }: SwapModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { address, isConnected } = useAccount();

  const handleSwapSuccess = () => {
    console.log('✅ Swap completed successfully!');
    onSwapSuccess?.();
  };

  const handleSwapError = (error: unknown) => {
    console.error('❌ Swap error:', error);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 h-14 w-14 rounded-full border-2 border-primary/50 bg-background/95 backdrop-blur-sm shadow-lg hover:bg-primary/10 hover:border-primary transition-all duration-300 hover:scale-110"
          title="Trade 2048 Token"
        >
          <ArrowLeftRight className="h-6 w-6 text-primary" />
          <span className="sr-only">Trade Token</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md bg-background/95 backdrop-blur-md border-l border-border/50 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-xl font-display gradient-text">
            <ArrowLeftRight className="h-5 w-5" />
            Trade 2048 Coin
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {!isConnected || !address ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground font-body">
                Please connect your wallet to trade
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground font-body text-center mb-4">
                Swap ETH for 2048 tokens to power your gameplay, or sell your tokens back to ETH.
              </p>
              
              <div className="bg-card/50 rounded-xl p-4 border border-border/50">
                <Swap
                  onSuccess={handleSwapSuccess}
                  onError={handleSwapError}
                  className="w-full"
                >
                  <SwapSettings>
                    <SwapSettingsSlippageTitle>
                      Max. slippage
                    </SwapSettingsSlippageTitle>
                    <SwapSettingsSlippageDescription>
                      Your swap will revert if the price changes unfavorably by more than this percentage
                    </SwapSettingsSlippageDescription>
                    <SwapSettingsSlippageInput />
                  </SwapSettings>
                  <SwapAmountInput
                    label="Sell"
                    swappableTokens={swappableTokens}
                    token={ETH_TOKEN}
                    type="from"
                  />
                  <SwapToggleButton />
                  <SwapAmountInput
                    label="Buy"
                    swappableTokens={swappableTokens}
                    token={APP_TOKEN}
                    type="to"
                  />
                  <SwapButton />
                  <SwapMessage />
                  <SwapToast />
                </Swap>
              </div>

              <div className="text-xs text-muted-foreground/70 text-center space-y-1 font-mono pt-4">
                <p>Token: 0xa275...0f9c</p>
                <p>Network: Base Mainnet</p>
                <p>Powered by Uniswap V3</p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
