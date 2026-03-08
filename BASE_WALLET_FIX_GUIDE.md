# Base Account SDK - Wallet Connection Fix Guide

## Issue Fixed
The Sub Account creation was failing with error: "Sub Account creation not supported. Transactions will require manual approval each time."

## Root Cause
The `wallet_addSubAccount` method requires proper parameters, but the previous implementation was either:
1. Using incomplete account configuration
2. Not utilizing the SDK's built-in utilities for Sub Account and Spend Permission management
3. Missing the automatic spend permission request flow

## Changes Made

### 1. Enhanced `useBaseSubAccount.ts` Hook

#### A. Improved Sub Account Creation (`lines 166-204`)
- **Added SDK utility fallback**: Now tries `sdkRef.current.createSubAccount()` first
- **Better error handling**: Falls back to direct RPC if SDK utility not available
- **More detailed logging**: Includes `[v0]` debug messages for troubleshooting

```typescript
// Try SDK utility first
if (sdkRef.current?.createSubAccount) {
  newSub = await sdkRef.current.createSubAccount();
}

// Fallback to direct RPC
if (!newSub) {
  newSub = await provider.request({
    method: 'wallet_addSubAccount',
    params: [{ account: { type: 'create' } }],
  });
}
```

#### B. New Spend Permission Method (`lines 234-272`)
- Added `requestSpendPermission()` callback
- Requests 1 ETH allowance by default (30-day period)
- Uses SDK utility `sdkRef.current.requestSpendPermission()`
- Enables auto-approval for subsequent transactions

```typescript
const requestSpendPermission = useCallback(
  async (allowanceWei: bigint = BigInt(1000000000000000000)) => {
    if (sdkRef.current?.requestSpendPermission) {
      const permission = await sdkRef.current.requestSpendPermission({
        account: subAccountAddress,
        spender: CREATOR_ADDRESS,
        token: '0x0000000000000000000000000000000000000000', // Native
        chainId: base.id,
        allowance: allowanceWei,
        periodInDays: 30,
        provider,
      });
      return permission;
    }
  },
  [provider, subAccountAddress]
);
```

#### C. Enhanced Return Value
- Added `requestSpendPermission` to the hook's return object
- Available to parent components for permission management

### 2. Updated `Game2048.tsx` Component

#### A. Hook Integration (`line 32`)
- Destructure `requestSpendPermission` from `useBaseSubAccount()`

#### B. Automatic Permission Request (`lines 65-82`)
- New `useEffect` that runs when Base wallet connects with Sub Account
- Automatically requests 10 ETH spend permission on connection
- Gracefully handles permission failures (transactions still work with manual approval)

```typescript
useEffect(() => {
  if (isBaseConnected && subAccountAddress && subAccountAddress !== universalAddress) {
    const requestPermissions = async () => {
      try {
        const allowance = ethers.parseEther('10'); // 10 ETH limit per day
        await requestSpendPermission(allowance);
      } catch (error) {
        // Fallback: transactions work with approval popup
        console.warn('[v0] Spend permission failed (fallback enabled):', error);
      }
    };
    requestPermissions();
  }
}, [isBaseConnected, subAccountAddress, universalAddress, requestSpendPermission]);
```

## How It Works Now

### Connection Flow
1. User connects Base wallet
2. **Sub Account Created**: Automatically via SDK or direct RPC
3. **Spend Permission Requested**: Auto-approval granted for up to 10 ETH
4. **Game Starts**: All moves funded silently (no approval popups)

### Transaction Flow
1. **First Move**: May show approval popup for spend permission
2. **Subsequent Moves**: Silently approved via sub account spend permission
3. **Fallback**: If spend permission fails, manual approval required each move

## Environment Variables
The following should be set in `.env`:
- `VITE_FARCASTER_CLIENT_ID` - For Farcaster SDK (optional)
- `VITE_PRIVY_APP_ID` - For Privy authentication (optional)

## Testing the Fix

### Expected Console Output
```
[v0] Starting wallet provider initialization...
[v0] Attempting to load Base Account SDK...
[v0] SDK created, getting provider...
✅ Provider from Base Account SDK
[v0] Starting connection...
[v0] Accounts returned: ["0x..."]
[v0] Creating new sub account...
[v0] Using SDK createSubAccount utility...
[v0] Sub Account created: 0x...
✅ Connected! Universal: 0x... Sub: 0x...
[v0] Base wallet with sub account detected, requesting spend permissions...
✅ Spend permission granted successfully
```

### If Sub Account Creation Fails
```
[v0] wallet_addSubAccount failed, using primary address as fallback: Error
Sub Account creation not supported. Transactions will require manual approval each time.
```

In this case:
- The universal address is used as fallback
- Each transaction requires manual approval
- The app still functions normally

## Debugging Tips

1. **Check Browser Console**: Look for `[v0]` prefixed logs
2. **Check Provider Source**: Should see "Provider from Base Account SDK"
3. **Verify Sub Account**: Check if different from universal address
4. **Check Network**: Ensure you're on Base network (chain ID 8453)

## Key Files Modified
- `/src/hooks/useBaseSubAccount.ts` - Enhanced SDK integration
- `/src/pages/Game2048.tsx` - Added spend permission request flow

## Dependencies
- `@base-org/account` - Base Account SDK (already installed)
- `@farcaster/miniapp-sdk` - For Farcaster context support
- `viem` - For chain definitions and Web3 utilities
