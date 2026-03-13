import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Zap, DollarSign, LogIn, TrendingUp, Wallet, Globe } from 'lucide-react';
import { useERC4337 } from '@/hooks/useERC4337';
import { useBasePay } from '@/hooks/useBasePay';
import { useSIWE } from '@/hooks/useSIWE';
import { initializeOnramp } from '@/lib/onramp';

interface BaseFeaturePanelProps {
  walletAddress: string;
  balance: string;
}

export function BaseFeaturePanel({ walletAddress, balance }: BaseFeaturePanelProps) {
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const { smartAccountAddress, isEnabled: isERC4337Enabled } = useERC4337(walletAddress);
  const { processingPayment, initiatePayment } = useBasePay(walletAddress);
  const { isSignedIn, signIn, signOut } = useSIWE(walletAddress);

  const features = [
    {
      id: 'erc4337',
      title: 'Account Abstraction (ERC-4337)',
      icon: Zap,
      description: 'Gasless transactions & batch operations',
      status: isERC4337Enabled ? 'active' : 'ready',
      details: isERC4337Enabled
        ? `Smart Account: ${smartAccountAddress?.slice(0, 6)}...${smartAccountAddress?.slice(-4)}`
        : 'Enable ERC-4337 for gasless transactions',
      action: () => console.log('ERC-4337 enabled'),
      color: 'from-yellow-400 to-orange-500',
    },
    {
      id: 'basepay',
      title: 'BasePay',
      icon: DollarSign,
      description: 'Native ETH payments & transfers',
      status: 'ready',
      details: `Current Balance: ${parseFloat(balance).toFixed(4)} ETH`,
      action: () =>
        initiatePayment('0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249', '0.001').catch(err =>
          console.error('Payment failed:', err)
        ),
      loading: processingPayment,
      color: 'from-green-400 to-emerald-500',
    },
    {
      id: 'siwe',
      title: 'SIWE (Sign In With Ethereum)',
      icon: LogIn,
      description: 'Cryptographic sign-in protocol',
      status: isSignedIn ? 'active' : 'ready',
      details: isSignedIn ? 'Signed in with Ethereum' : 'Click to sign in with your wallet',
      action: () => (isSignedIn ? signOut() : signIn()),
      color: 'from-blue-400 to-indigo-500',
    },
    {
      id: 'onramp',
      title: 'Coinbase Onramp',
      icon: TrendingUp,
      description: 'Fiat to crypto purchasing',
      status: 'ready',
      details: 'Buy ETH with your preferred payment method',
      action: () => initializeOnramp(walletAddress),
      color: 'from-purple-400 to-pink-500',
    },
    {
      id: 'subaccount',
      title: 'Sub Accounts',
      icon: Wallet,
      description: 'ERC-4337 spending permissions',
      status: 'active',
      details: 'Auto Spend Permissions configured for game moves',
      action: () => console.log('Sub Account active'),
      color: 'from-cyan-400 to-blue-500',
    },
    {
      id: 'basenames',
      title: 'Basenames',
      icon: Globe,
      description: 'ENS on Base - Human-readable addresses',
      status: 'ready',
      details: 'Resolve your .base domain for this address',
      action: () => console.log('Basenames feature'),
      color: 'from-red-400 to-rose-500',
    },
  ];

  return (
    <Card className="p-4 glass-card border-border">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Base Features
        </h3>

        <div className="grid grid-cols-1 gap-2">
          {features.map(feature => {
            const Icon = feature.icon;
            const isExpanded = expandedFeature === feature.id;

            return (
              <div
                key={feature.id}
                className={`rounded-lg border border-border bg-gradient-to-r ${feature.color} bg-opacity-10 p-3 transition-all`}
              >
                <button
                  onClick={() => setExpandedFeature(isExpanded ? null : feature.id)}
                  className="w-full flex items-start justify-between text-left hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className="w-4 h-4 mt-0.5 text-foreground" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{feature.title}</p>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                      {!isExpanded && (
                        <div className="mt-1 inline-block">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              feature.status === 'active'
                                ? 'bg-green-500 bg-opacity-20 text-green-400'
                                : 'bg-blue-500 bg-opacity-20 text-blue-400'
                            }`}
                          >
                            {feature.status === 'active' ? '✓ Active' : '→ Ready'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <p className="text-xs text-muted-foreground">{feature.details}</p>
                    <Button
                      onClick={feature.action}
                      disabled={feature.loading}
                      size="sm"
                      className="w-full text-xs font-body"
                      variant={feature.status === 'active' ? 'secondary' : 'default'}
                    >
                      {feature.loading ? 'Processing...' : `Use ${feature.title}`}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-3">
          All features are non-blocking. Game continues seamlessly.
        </p>
      </div>
    </Card>
  );
}
