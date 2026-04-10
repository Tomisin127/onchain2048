import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Shield, Zap } from 'lucide-react';

export interface SpendPermissionValues {
  allowanceEth: string;
  durationDays: number;
  // For advanced self-pay mode
  relayerAddress?: string;
  relayerPrivateKey?: string;
  useAdvancedMode?: boolean;
}

interface SpendPermissionConfigProps {
  onConfirm: (values: SpendPermissionValues) => void;
  onCancel: () => void;
  isConnecting: boolean;
  isForSelfPay?: boolean;
}

const DURATION_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const ALLOWANCE_PRESETS = ['0.01', '0.05', '0.1', '0.5', '1'];

export function SpendPermissionConfig({
  onConfirm,
  onCancel,
  isConnecting,
  isForSelfPay = false,
}: SpendPermissionConfigProps) {
  const [allowanceEth, setAllowanceEth] = useState('0.1');
  const [durationDays, setDurationDays] = useState('30');
  const [customAllowance, setCustomAllowance] = useState(false);
  
  // Advanced self-pay mode
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [relayerAddress, setRelayerAddress] = useState('');
  const [relayerPrivateKey, setRelayerPrivateKey] = useState('');

  const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
  const isValidPrivateKey = (key: string) => /^(0x)?[a-fA-F0-9]{64}$/.test(key.trim());

  const handleConfirm = () => {
    const parsed = parseFloat(allowanceEth);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10) {
      return;
    }
    
    // Validate advanced mode inputs
    if (isForSelfPay && useAdvancedMode) {
      const trimmedAddress = relayerAddress.trim();
      const trimmedKey = relayerPrivateKey.trim();
      
      if (!isValidAddress(trimmedAddress) || !isValidPrivateKey(trimmedKey)) {
        return;
      }
      
      onConfirm({
        allowanceEth,
        durationDays: parseInt(durationDays),
        relayerAddress: trimmedAddress,
        relayerPrivateKey: trimmedKey,
        useAdvancedMode: true,
      });
    } else {
      onConfirm({
        allowanceEth,
        durationDays: parseInt(durationDays),
        useAdvancedMode: false,
      });
    }
  };

  const isAdvancedValid = !useAdvancedMode || (isValidAddress(relayerAddress) && isValidPrivateKey(relayerPrivateKey));

  return (
    <Card className="p-6 glass-card space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-display font-bold text-foreground">
          {isForSelfPay ? 'Self-Pay Setup' : 'Spend Permission'}
        </h2>
        <p className="text-xs text-muted-foreground font-body">
          {isForSelfPay 
            ? 'Choose how you want to pay for game transactions'
            : 'Set how much ETH the game can spend and for how long. You can always revoke this later.'
          }
        </p>
      </div>

      {/* Self-Pay Mode Toggle */}
      {isForSelfPay && (
        <div className="space-y-4">
          {/* Pay Per Move (Default) */}
          <div 
            className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
              !useAdvancedMode 
                ? 'border-primary bg-primary/5' 
                : 'border-border bg-secondary/30 hover:border-muted-foreground/50'
            }`}
            onClick={() => setUseAdvancedMode(false)}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${!useAdvancedMode ? 'bg-primary/20' : 'bg-secondary'}`}>
                <Zap className={`w-5 h-5 ${!useAdvancedMode ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-foreground">Pay Per Move</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono">Recommended</span>
                </div>
                <p className="text-xs text-muted-foreground font-body">
                  Confirm and pay for each move via your wallet. Simple and secure.
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Payment goes to: 0xEA54...5249
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Mode */}
          <div 
            className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
              useAdvancedMode 
                ? 'border-amber-500 bg-amber-500/5' 
                : 'border-border bg-secondary/30 hover:border-muted-foreground/50'
            }`}
            onClick={() => setUseAdvancedMode(true)}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${useAdvancedMode ? 'bg-amber-500/20' : 'bg-secondary'}`}>
                <Shield className={`w-5 h-5 ${useAdvancedMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-foreground">Advanced: Custom Relay</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-mono">Advanced</span>
                </div>
                <p className="text-xs text-muted-foreground font-body">
                  Provide your own relayer wallet for silent, optimistic transactions.
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Mode Warning & Inputs */}
          {useAdvancedMode && (
            <div className="space-y-4 animate-fade-in">
              {/* Warning */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-amber-500">Proceed with Caution</p>
                </div>
                <ul className="text-[11px] text-amber-500/90 font-body space-y-1 ml-6">
                  <li>This game does NOT save your private key</li>
                  <li>Use a fresh wallet created specifically for gaming</li>
                  <li>Never use a wallet containing significant funds</li>
                  <li>The relayer wallet must have ETH for gas fees</li>
                </ul>
              </div>

              {/* Relayer Address */}
              <div className="space-y-2">
                <Label className="text-sm font-body text-secondary-foreground">
                  Relayer Wallet Address
                </Label>
                <Input
                  type="text"
                  value={relayerAddress}
                  onChange={(e) => setRelayerAddress(e.target.value)}
                  className={`font-mono text-sm bg-secondary border-border text-foreground ${
                    relayerAddress && !isValidAddress(relayerAddress) ? 'border-destructive' : ''
                  }`}
                  placeholder="0x..."
                />
                {relayerAddress && !isValidAddress(relayerAddress) && (
                  <p className="text-xs text-destructive">Invalid Ethereum address</p>
                )}
              </div>

              {/* Private Key */}
              <div className="space-y-2">
                <Label className="text-sm font-body text-secondary-foreground">
                  Relayer Private Key
                </Label>
                <Input
                  type="password"
                  value={relayerPrivateKey}
                  onChange={(e) => setRelayerPrivateKey(e.target.value)}
                  className={`font-mono text-sm bg-secondary border-border text-foreground ${
                    relayerPrivateKey && !isValidPrivateKey(relayerPrivateKey) ? 'border-destructive' : ''
                  }`}
                  placeholder="Enter private key (64 hex characters)"
                />
                {relayerPrivateKey && !isValidPrivateKey(relayerPrivateKey) && (
                  <p className="text-xs text-destructive">Invalid private key format</p>
                )}
                <p className="text-[10px] text-muted-foreground font-body">
                  Your key is used locally to sign transactions and is never stored or sent to any server.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Allowance - Only show for non-self-pay OR advanced mode */}
      {(!isForSelfPay || useAdvancedMode) && (
        <div className="space-y-2">
          <Label className="text-sm font-body text-secondary-foreground">
            Max allowance per period (ETH)
          </Label>
          {!customAllowance ? (
            <div className="flex flex-wrap gap-2">
              {ALLOWANCE_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={allowanceEth === preset ? 'default' : 'outline'}
                  className={
                    allowanceEth === preset
                      ? 'gradient-btn text-foreground font-mono text-xs'
                      : 'border-border bg-secondary text-secondary-foreground hover:bg-muted font-mono text-xs'
                  }
                  onClick={() => setAllowanceEth(preset)}
                >
                  {preset} ETH
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-border bg-secondary text-secondary-foreground hover:bg-muted font-mono text-xs"
                onClick={() => setCustomAllowance(true)}
              >
                Custom
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="0.001"
                max="10"
                step="0.001"
                value={allowanceEth}
                onChange={(e) => setAllowanceEth(e.target.value)}
                className="font-mono text-sm bg-secondary border-border text-foreground"
                placeholder="0.1"
              />
              <span className="text-xs text-muted-foreground font-mono">ETH</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setCustomAllowance(false);
                  setAllowanceEth('0.1');
                }}
              >
                Presets
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Duration - Only show for non-self-pay OR advanced mode */}
      {(!isForSelfPay || useAdvancedMode) && (
        <div className="space-y-2">
          <Label className="text-sm font-body text-secondary-foreground">Permission duration</Label>
          <Select value={durationDays} onValueChange={setDurationDays}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="font-mono text-sm">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary */}
      <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
        {isForSelfPay && !useAdvancedMode ? (
          <p className="text-xs text-muted-foreground font-body">
            You will be prompted to approve and pay for each move. The game will wait for your confirmation before proceeding.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground font-body">
            The game will be able to spend up to{' '}
            <span className="text-foreground font-mono font-semibold">{allowanceEth} ETH</span> per
            day for{' '}
            <span className="text-foreground font-mono font-semibold">{durationDays} days</span>.
            {useAdvancedMode && ' Transactions will be silent and optimistic.'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1 border-border bg-secondary text-secondary-foreground hover:bg-muted font-body"
          disabled={isConnecting}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          className={`flex-1 font-display font-semibold ${
            useAdvancedMode ? 'bg-amber-500 hover:bg-amber-600 text-black' : 'gradient-btn text-foreground'
          }`}
          disabled={isConnecting || !allowanceEth || parseFloat(allowanceEth) <= 0 || (isForSelfPay && useAdvancedMode && !isAdvancedValid)}
        >
          {isConnecting ? 'Connecting...' : (isForSelfPay && !useAdvancedMode ? 'Connect Wallet' : 'Connect & Approve')}
        </Button>
      </div>
    </Card>
  );
}
