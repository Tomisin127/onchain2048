import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SpendPermissionValues {
  allowanceEth: string;
  durationDays: number;
}

interface SpendPermissionConfigProps {
  onConfirm: (values: SpendPermissionValues) => void;
  onCancel: () => void;
  isConnecting: boolean;
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
}: SpendPermissionConfigProps) {
  const [allowanceEth, setAllowanceEth] = useState('0.1');
  const [durationDays, setDurationDays] = useState('30');
  const [customAllowance, setCustomAllowance] = useState(false);

  const handleConfirm = () => {
    const parsed = parseFloat(allowanceEth);
    if (isNaN(parsed) || parsed <= 0 || parsed > 10) {
      return;
    }
    onConfirm({
      allowanceEth,
      durationDays: parseInt(durationDays),
    });
  };

  return (
    <Card className="p-6 glass-card space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-display font-bold text-foreground">Spend Permission</h2>
        <p className="text-xs text-muted-foreground font-body">
          Set how much ETH the game can spend and for how long. You can always revoke this later.
        </p>
      </div>

      {/* Allowance */}
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

      {/* Duration */}
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

      {/* Summary */}
      <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
        <p className="text-xs text-muted-foreground font-body">
          The game will be able to spend up to{' '}
          <span className="text-foreground font-mono font-semibold">{allowanceEth} ETH</span> per
          day for{' '}
          <span className="text-foreground font-mono font-semibold">{durationDays} days</span>.
        </p>
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
          className="flex-1 gradient-btn text-foreground font-display font-semibold"
          disabled={isConnecting || !allowanceEth || parseFloat(allowanceEth) <= 0}
        >
          {isConnecting ? 'Connecting...' : 'Connect & Approve'}
        </Button>
      </div>
    </Card>
  );
}
