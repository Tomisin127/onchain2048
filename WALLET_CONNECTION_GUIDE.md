# Base Account Wallet Connection & Sub Accounts Guide

This document covers the Base Account SDK integration, Sub Accounts setup, and Auto Spend Permissions configuration for the 2048 On-Chain game.

## Overview

The app supports two wallet connection methods:

1. **Privy Email Login** - Creates an embedded smart wallet, requires manual approval for each transaction
2. **Base Account Wallet** - Connects to your Base Account with Sub Account support for seamless transactions

## Key Components

### 1. **useBaseSubAccount Hook** (`src/hooks/useBaseSubAccount.ts`)

This hook handles all wallet provider initialization and management:

- **Multi-Provider Support**: Tries Farcaster miniapp SDK first, then Base Account SDK, then fallback to injected wallet
- **Sub Account Auto-Creation**: Automatically creates a Sub Account on first connection if supported
- **Auto Spend Permissions**: First transaction shows an approval popup; subsequent transactions are silent
- **Error Tracking**: Provides detailed error messages for debugging

#### Key Functions:

```typescript
const {
  provider,              // The initialized wallet provider
  universalAddress,      // Your Base Account address
  subAccountAddress,     // App-specific Sub Account address
  activeAddress,         // Either sub or universal (whichever is active)
  connected,             // Boolean connection state
  isConnecting,          // Loading state during connection
  providerSource,        // 'farcaster', 'base-sdk', 'injected', or 'none'
  error,                 // Error message if any
  connect,               // Async function to connect
  disconnect,            // Function to disconnect
  sendTransaction,       // Send transaction from sub account
} = useBaseSubAccount();
```

### 2. **Transaction Flow with Sub Accounts**

#### Auto Spend Permissions Enable This Flow:

**First Transaction:**
1. User initiates move
2. Sub Account attempts to send transaction
3. Base Account detects insufficient balance in Sub Account
4. Base Account shows approval popup
5. User grants recurring spend permission (optional)
6. Base Account auto-funds Sub Account with required amount
7. Transaction succeeds silently

**Subsequent Transactions:**
1. User initiates move
2. Sub Account sends transaction directly
3. If insufficient balance, Base Account auto-funds (no popup)
4. Transaction succeeds silently

This is all handled by Base Account's Auto Spend Permissions feature - no additional code needed!

## Configuration Details

### SDK Initialization in useBaseSubAccount

```typescript
const sdk = createBaseAccountSDK({
  appName: '2048 On-Chain',
  appLogoUrl: `${window.location.origin}/images/game-logo.png`,
  appChainIds: [base.id],
  subAccounts: {
    creation: 'on-connect',    // Auto-create on connection
    defaultAccount: 'sub',     // Use sub account by default
  },
  // Auto Spend Permissions enabled by default (funding: 'auto')
});
```

### Key Configuration Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `creation` | `'on-connect'` | Automatically creates a Sub Account when user connects |
| `defaultAccount` | `'sub'` | Use Sub Account for transactions by default |
| `funding` | `'auto'` | Enable Auto Spend Permissions (default) |

## Troubleshooting

### Issue: "No wallet provider found"

**Possible Causes:**
- App not running inside Base app
- No Web3 wallet extension installed
- Wallet provider not yet loaded

**Solutions:**
1. **For Base App (Miniapp Context):** Open the app inside the Base app (Farcaster miniapp integration)
2. **For Web Browser:** Install a Web3 wallet extension (Coinbase Wallet, MetaMask, etc.)
3. **Check Browser Console:** Look for provider initialization logs starting with `[v0]`

**Debug Output to Check:**
```
[v0] Starting wallet provider initialization...
[v0] Farcaster check: false (not in miniapp)
[v0] Attempting to load Base Account SDK...
[v0] Base Account SDK imported successfully
[v0] SDK created, getting provider...
✅ Provider from Base Account SDK
```

### Issue: "wallet_getSubAccounts not supported"

**Cause:** Running on a wallet that doesn't support the `wallet_getSubAccounts` RPC method

**Solution:** This is normal for non-Base wallets. The hook will attempt to create a new Sub Account or fall back to the universal address.

### Issue: "wallet_addSubAccount not supported"

**Cause:** Wallet doesn't support Sub Account creation (not Base Account or Base app)

**Impact:** Transactions will use the universal address and require manual approval each time

**Solution:** Use Base app or a wallet that supports Base Sub Accounts

### Issue: "Sub Account transaction failed"

**Check Logs:**
```
[v0] Attempting Sub Account transaction...
[v0] ❌ Sub Account transaction failed: [error message]
[v0] Error details: [specific error]
```

**Common Causes:**

1. **Insufficient Balance**
   - The Sub Account doesn't have enough ETH for gas
   - Base Account should auto-fund via Auto Spend Permissions
   - If this fails, user needs to approve spend permission manually

2. **Provider Not Ready**
   - `provider` is null/undefined
   - Check that `connect()` was called successfully

3. **Transaction Rejected by User**
   - First transaction shows approval popup
   - User rejected the spend permission grant
   - Try again and accept the popup

4. **Network Issues**
   - Check that you're on Base mainnet (chainId: 8453)
   - Verify Base network is reachable

### Issue: Approval popup not showing on first transaction

**Cause:** Could be several reasons:

1. **Sub Account already funded** - Balance sufficient, no popup needed
2. **Spend permission already granted** - From previous session, no popup needed
3. **Approval prompt hidden** - Check browser notification permissions

**To Reset:** Clear your wallet's transaction history in the Base app

### Issue: Subsequent transactions still require approval

**Causes:**

1. **Spend permission not granted** - User clicked "Cancel" on first transaction popup
2. **Permission expired or revoked** - Check Base account settings
3. **Using fallback address** - Not using Sub Account due to wallet limitation

**Solution:** Try the transaction again and ensure you grant the spend permission when prompted

## How to Debug

### Enable Console Logging

Open Developer Tools (F12) and check Console tab for `[v0]` prefixed logs:

```javascript
// These indicate the wallet initialization process
[v0] Starting wallet provider initialization...
[v0] Farcaster check: false
[v0] Attempting to load Base Account SDK...
[v0] Base Account SDK imported successfully
[v0] SDK created, getting provider...

// These indicate successful connection
[v0] Starting connection...
[v0] Accounts returned: ["0x..."]
[v0] Primary/Universal address: 0x...
[v0] Attempting to get existing sub accounts...
[v0] Sub Account found: 0x...
[v0] ✅ Connected! Universal: 0x... Sub: 0x... Provider Source: base-sdk

// These indicate transaction details
[v0] Attempting Sub Account transaction...
[v0] ✅ Sub Account tx sent: 0x...
```

### Check Browser DevTools

1. **Console Tab:** Look for errors starting with `[v0]` or wallet-related errors
2. **Network Tab:** Check for failed requests (RPC calls)
3. **Application/Storage Tab:** Check for wallet-related localStorage/sessionStorage

## Testing Checklist

When testing Base Account wallet integration:

- [ ] Connection completes without errors
- [ ] Sub Account address displays correctly (different from universal address)
- [ ] First move shows approval popup with spend permission option
- [ ] Second move doesn't show popup (silent transaction)
- [ ] Wallet balance updates after transaction
- [ ] Moves decrement correctly
- [ ] Game continues to play smoothly

## Production Deployment

### Before Going Live

1. **Test thoroughly** in Base app (Farcaster miniapp)
2. **Test thoroughly** with Coinbase Wallet browser extension
3. **Verify spend permissions** are requested and granted
4. **Monitor logs** for connection errors
5. **Set up error tracking** (e.g., Sentry) to catch production issues

### Recommended Configuration for Production

```typescript
const sdk = createBaseAccountSDK({
  appName: 'Your Game Name',
  appLogoUrl: 'https://your-domain.com/logo.png', // Absolute URL
  appChainIds: [base.id],
  subAccounts: {
    creation: 'on-connect',
    defaultAccount: 'sub',
  },
  // Optional: Add paymaster for gas sponsorship
  // paymasterUrls: {
  //   [base.id]: 'https://...',
  // },
});
```

## References

- [Base Account Documentation](https://docs.base.org/base-account)
- [Sub Accounts Guide](https://docs.base.org/base-account/improve-ux/sub-accounts)
- [Spend Permissions Guide](https://docs.base.org/base-account/improve-ux/spend-permissions)
- [ERC-7895 Specification](https://eips.ethereum.org/EIPS/eip-7895)

## File Structure

```
src/
├── hooks/
│   └── useBaseSubAccount.ts        # Main wallet integration hook
├── components/
│   ├── LoginScreen.tsx             # Wallet connection UI
│   ├── WalletPanel.tsx             # Wallet info display
│   └── GameBoard.tsx               # Game interface
├── pages/
│   └── Game2048.tsx                # Main game page
└── lib/
    ├── wagmi.ts                    # Wagmi configuration
    └── privy/
        └── provider.tsx            # Privy setup
```

## Support

If you encounter issues:

1. Check the console logs with `[v0]` prefix
2. Review the troubleshooting section above
3. Check Base Account documentation
4. Open the app inside the Base app for proper integration
5. Make sure you're using a Base-compatible wallet (Coinbase Wallet, Base app, etc.)
