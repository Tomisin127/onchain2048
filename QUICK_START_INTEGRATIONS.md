# Quick Start: Using Base Features in Your Game

Copy-paste snippets to quickly integrate Base features into your 2048 game.

---

## 1. Add an "Enable Smart Accounts" Button

```typescript
// In your component
import { useERC4337 } from '@/hooks/useERC4337';

export function SmartAccountButton() {
  const { isSupported, checkERC4337Support, error } = useERC4337();

  return (
    <div>
      <button onClick={checkERC4337Support} className="...">
        {isSupported ? 'Smart Accounts Enabled' : 'Enable Smart Accounts'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

---

## 2. Add a "Buy Crypto" Button

```typescript
// In your component
import { openOnrampFlow, getBaseOnrampConfig } from '@/lib/onramp';
import { useAccount } from 'wagmi';

export function BuyCryptoButton() {
  const { address } = useAccount();

  const handleBuy = () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }
    const config = getBaseOnrampConfig(address);
    openOnrampFlow(config);
  };

  return (
    <button onClick={handleBuy} className="...">
      Buy ETH / USDC
    </button>
  );
}
```

---

## 3. Add a "Sign In with Ethereum" Button

```typescript
// In your component
import { useSIWE } from '@/hooks/useSIWE';
import { useAccount } from 'wagmi';

export function SiweButton() {
  const { address } = useAccount();
  const { signInWithEthereum, isSigningIn, error } = useSIWE();

  const handleSignIn = async () => {
    try {
      await signInWithEthereum({
        statement: 'Sign in to Crypto2048',
      });
      console.log('Signed in successfully!');
    } catch (err) {
      console.error('Sign in failed:', err);
    }
  };

  return (
    <div>
      <button onClick={handleSignIn} disabled={!address || isSigningIn} className="...">
        {isSigningIn ? 'Signing...' : 'Sign In with Ethereum'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

---

## 4. Add Score-Based Rewards (Using BasePay)

```typescript
// In your game component
import { useBasePay } from '@/hooks/useBasePay';
import { useAccount } from 'wagmi';

export function RewardButton({ playerScore }) {
  const { address } = useAccount();
  const { sendETH, isProcessing } = useBasePay();

  const handleReward = async () => {
    if (playerScore < 1000) {
      alert('Need score of 1000+ to claim reward');
      return;
    }

    try {
      // Send 0.01 ETH reward
      await sendETH(address!, '0.01');
      console.log('Reward sent!');
    } catch (err) {
      console.error('Reward failed:', err);
    }
  };

  return (
    <button
      onClick={handleReward}
      disabled={!address || isProcessing || playerScore < 1000}
      className="..."
    >
      {isProcessing ? 'Processing...' : 'Claim ETH Reward'}
    </button>
  );
}
```

---

## 5. Check Feature Availability

```typescript
// In your component
import { useERC4337 } from '@/hooks/useERC4337';
import { useSIWE } from '@/hooks/useSIWE';
import { useAccount } from 'wagmi';

export function FeatureStatus() {
  const { address } = useAccount();
  const { isSupported: smartAccountsReady } = useERC4337();
  const { address: siweAddress } = useSIWE();

  return (
    <div className="space-y-2">
      <p>Wallet: {address ? 'Connected' : 'Not connected'}</p>
      <p>Smart Accounts: {smartAccountsReady ? 'Ready' : 'Checking...'}</p>
      <p>SIWE Available: {address ? 'Yes' : 'No'}</p>
      <p>Onramp Available: {address ? 'Yes' : 'No'}</p>
    </div>
  );
}
```

---

## 6. Add to Existing Game Component

```typescript
// Example: Adding to your Game2048Page

import { BaseIntegrationsShowcase } from '@/components/BaseIntegrationsShowcase';

export default function Game2048Page() {
  return (
    <div className="flex gap-4">
      {/* Existing game on left */}
      <div className="flex-1">
        <Game2048 />
      </div>

      {/* New features on right */}
      <div className="w-64 border-l p-4">
        <BaseIntegrationsShowcase />
      </div>
    </div>
  );
}
```

---

## File Locations

Find these in your project:

| Item | Location |
|------|----------|
| ERC-4337 Hook | `src/hooks/useERC4337.ts` |
| BasePay Hook | `src/hooks/useBasePay.ts` |
| SIWE Hook | `src/hooks/useSIWE.ts` |
| Onramp Utils | `src/lib/onramp.ts` |
| Showcase Component | `src/components/BaseIntegrationsShowcase.tsx` |
| Full Docs | `src/lib/BASE_INTEGRATIONS.md` |
| Migration Summary | `MIGRATION_COMPLETE.md` |

---

## Testing

Each hook and utility is independent and can be tested:

```bash
# Start dev server
npm run dev

# Visit http://localhost:5173
# Your game works as-is
# New feature buttons appear when integrated
```

---

## Common Questions

**Q: Will this break my existing game?**  
A: No. All features are opt-in and don't modify game logic.

**Q: Do I need to use all features?**  
A: No. Pick whichever features fit your game.

**Q: Can I remove features I don't want?**  
A: Yes. Just don't import/use them. They won't be bundled.

**Q: Is SIWE required if I have Privy?**  
A: No. SIWE is optional and complements Privy.

**Q: How do I handle payments securely?**  
A: Backend validation is recommended for real rewards. See `BASE_INTEGRATIONS.md` for details.

---

## Next: Production Deployment

Once you've tested locally:

1. Commit changes to your Base branch
2. Run `npm run build` to verify
3. Deploy to Vercel (via GitHub)
4. Test in production environment
5. Monitor wallet connection rates

**That's it!** Your 2048 game is now powered by Base Network.
