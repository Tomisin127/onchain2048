# Quick Wallet Connection Debugging Guide

## 🔧 Immediate Diagnostics

### Step 1: Open Developer Console
Press `F12` and go to **Console** tab

### Step 2: Try to Connect
Click "Connect Base Wallet" button

### Step 3: Check for `[v0]` Logs
Look for logs starting with `[v0]` or errors.

## 📋 Common Issues & Quick Fixes

### ❌ "No wallet provider found" Error

**Most Likely Cause:** Not running inside Base app or no Web3 wallet installed

**Quick Fix:**
1. Open the app **inside the Base app** (Farcaster miniapp)
   - OR Install [Coinbase Wallet](https://www.coinbase.com/wallet)
   - OR Install [MetaMask](https://metamask.io/)

2. Refresh the page

3. Try connecting again

**Console Check:**
```
[v0] Farcaster check: false        ← Not in miniapp
[v0] Attempting to load Base Account SDK...
[v0] Base Account SDK imported successfully
[v0] SDK created, getting provider...
❌ [v0] SDK getProvider() returned null/undefined
⚠️ No wallet provider found
```

---

### ❌ "No accounts returned" Error

**Cause:** Wallet rejected the connection request

**Quick Fix:**
1. Check if you're on **Base network** (chainId: 8453)
2. If using Coinbase Wallet, make sure Base is added
3. Click "Connect Base Wallet" again
4. **Accept** the connection popup in your wallet

**Console Check:**
```
[v0] Starting connection...
[v0] Accounts returned: []        ← Empty = user rejected
```

---

### ❌ "wallet_getSubAccounts not supported"

**Cause:** Your wallet doesn't support Sub Accounts (normal for non-Base wallets)

**Status:** This is NOT an error, it's expected. The app will:
1. Try to create a Sub Account
2. If that fails, fall back to your main address
3. Transactions will require manual approval each time

**Console Check:**
```
[v0] Attempting to get existing sub accounts...
⚠️ [v0] wallet_getSubAccounts not supported or failed: (error)
[v0] Creating new sub account...
```

---

### ❌ "wallet_addSubAccount not supported"

**Cause:** Wallet doesn't support Sub Account creation

**Status:** NOT an error for non-Base wallets

**Impact:** 
- Uses your universal address instead
- Each transaction requires manual approval

**Console Check:**
```
⚠️ [v0] wallet_addSubAccount failed, using primary address as fallback
Error message about "Sub Account creation not supported"
```

**Solution:**
- Use **Base app** (Farcaster miniapp) for full Sub Account support
- Or use **Coinbase Wallet** (may support Sub Accounts)

---

### ❌ "Sub Account transaction failed"

**Step 1: Check the Error Message**
Look for: `[v0] Error details: [your error here]`

**Step 2: Match Your Error**

| Error | Cause | Fix |
|-------|-------|-----|
| `insufficient funds` | Sub Account out of ETH | Base Account should auto-fund. If not, fund wallet |
| `user rejected` | You clicked "Reject" on popup | Try again and accept the popup |
| `network error` | Connection to Base network failed | Check internet, try refreshing |
| `provider error` | Wallet provider issue | Restart wallet app |
| `invalid params` | Something wrong with transaction | Check browser console for details |

**Step 3: Check Your Balance**
1. Click the "↻" button to refresh balance
2. If 0 ETH, you need to fund the wallet
3. Send ETH to the address shown in wallet panel

---

### ❌ "First transaction still requires approval"

**Cause:** Sub Account not being used (using fallback address)

**Check:**
```
[v0] Connected! Universal: 0x1234... Sub: 0x1234...
                         ↑ Same address = fallback being used
```

**Solution:**
- If using non-Base wallet, this is expected behavior
- You'll need to approve each transaction
- Consider using Base app for seamless experience

---

### ✅ Everything Connected But Slow

**Cause:** Could be network issues or RPC rate limiting

**Quick Fixes:**
1. Wait a few seconds between moves
2. Check internet connection
3. Try refreshing the page
4. Clear browser cache

---

## 🎯 Successful Connection Checklist

When everything works, you should see:

```
[v0] Starting wallet provider initialization...
[v0] Base Account SDK imported successfully
[v0] SDK created, getting provider...
✅ Provider from Base Account SDK
[v0] Starting connection...
[v0] Accounts returned: ["0x1234..."]
[v0] Primary/Universal address: 0x1234...
[v0] Attempting to get existing sub accounts...
[v0] Sub Account found: 0xABCD...  ← Different from universal
[v0] ✅ Connected! Universal: 0x1234... Sub: 0xABCD... Provider Source: base-sdk
```

✅ **In the Game UI:**
- [ ] Wallet address displays correctly
- [ ] Balance shows
- [ ] Can make a move
- [ ] First move shows a popup (spend permission)
- [ ] Second move works without popup

---

## 🚀 Advanced Debugging

### Get More Detailed Logs

Run this in the browser console:

```javascript
// Show all stored addresses
localStorage.getItem('baseSubAccountAddresses');

// Check if SDK was initialized
window.__baseAccountSDK;

// Manually trigger connection (advanced)
// const hook = window.__baseSubAccountHook;
// hook.connect();
```

### Check Wallet Configuration

In the console, look for:

```javascript
// Check if Base Account SDK is loaded
typeof window.__baseAccountSDK !== 'undefined'

// Check if provider is available
typeof window.ethereum !== 'undefined'
```

### Network Inspector

1. Open **Network** tab in DevTools
2. Look for requests to:
   - `https://mainnet.base.org` - RPC calls
   - `https://wallet.coinbase.com` - Coinbase Wallet
   - `api.coingecko.com` - ETH price

If any show red (failed), that's the issue.

---

## 📞 When Nothing Works

If you've tried everything above:

1. **Collect this info:**
   ```
   - Browser: [Chrome/Firefox/Safari/etc]
   - Wallet: [Base/Coinbase/MetaMask/Other]
   - OS: [Windows/Mac/Linux/Mobile]
   - Error message: [paste from console]
   - Console logs: [paste [v0] logs]
   ```

2. **Check:**
   - Are you on **Base network** (chainId: 8453)?
   - Is the app running on **HTTPS** (required for wallet)?
   - Is your wallet **unlocked**?

3. **Open an Issue** on GitHub with the collected info

---

## 🔗 Useful Links

- [Base Account Docs](https://docs.base.org/base-account)
- [Sub Accounts Guide](https://docs.base.org/base-account/improve-ux/sub-accounts)
- [Base Network RPC](https://docs.base.org/guides/getting-started)
- [Coinbase Wallet](https://www.coinbase.com/wallet)

---

## 💡 Pro Tips

1. **Always check the Console first** - Most issues are visible there
2. **Look for `[v0]` logs** - These are the debug logs added for this issue
3. **Test one wallet at a time** - Don't switch between wallets mid-debug
4. **Refresh the page** - Simple but often fixes provider issues
5. **Check network tab** - Network errors show failed RPC calls

---

## 📱 Testing on Mobile

For mobile/in-app browser:
1. Open within Base app (best experience)
2. HTTPS is required
3. Some wallet features limited in in-app browsers
4. Check wallet app's mobile documentation

---

**Last Updated:** After wallet connection fixes  
**Status:** All Sub Accounts and Auto Spend Permissions enabled ✅
