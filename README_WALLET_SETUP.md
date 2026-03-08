# 🎮 2048 On-Chain - Base Account Wallet Setup Guide

## Overview

This game runs on the **Base blockchain** and uses **Base Account** with **Sub Accounts** for smooth, gasless-like gameplay. This guide explains everything you need to know.

## ⚡ Quick Start

### 1. Install a Wallet

Choose one:
- 🏅 **Base App** (Farcaster miniapp) - **Recommended** ← Best experience
- 💳 **Coinbase Wallet** - Chrome/Firefox extension
- 🦊 **MetaMask** - Chrome/Firefox extension (basic support)

### 2. Connect to the Game

1. Open the game at `https://your-app.com`
2. Click **"Connect Base Wallet"**
3. Approve the connection in your wallet
4. Done! ✅

### 3. Play the Game

1. **First move**: Approve spend permission (one-time)
2. **Subsequent moves**: Silent transactions (no popups)
3. **Enjoy**: Seamless gameplay

## 🔄 How It Works

### Account Structure

```
┌─────────────────────────────────────────┐
│      Your Base Account (Universal)       │
│  Stores your ETH + manages permissions  │
│  - Your main wallet identity             │
│  - Controls all Sub Accounts             │
│  - Secure (uses your passkey)            │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │   Sub Account (App-Specific)      │   │
│  │   2048 Game uses this for play    │   │
│  │   - Fast transactions              │   │
│  │   - Auto-funded by Base Account    │   │
│  │   - Browser-based signer           │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Transaction Flow

#### First Move
```
User Makes Move
      ↓
Sub Account low on ETH
      ↓
Base Account detects this
      ↓
📱 Shows approval popup
"Allow 2048 game to use your ETH?"
[Accept] [Decline]
      ↓
User clicks Accept
      ↓
Base Account auto-funds Sub Account
      ↓
✅ Transaction succeeds
```

#### Subsequent Moves
```
User Makes Move
      ↓
Sub Account has ETH from before
      ↓
✅ Transaction executes silently
      (Base Account auto-funds if needed, no popup)
```

## 📱 Which Wallet Should I Use?

### Base App (Farcaster) ⭐ Recommended

**Pros:**
- ✅ Full Sub Account support
- ✅ Auto Spend Permissions
- ✅ Seamless 1-click setup
- ✅ Best UX
- ✅ Designed for this

**Cons:**
- Requires Base app installed
- Only in Base app (not web browser)

**Setup:**
1. Install Base app
2. Open game inside Base app
3. Click "Connect Base Wallet"

---

### Coinbase Wallet (Browser)

**Pros:**
- ✅ Works in browser
- ✅ Sub Account support (usually)
- ✅ Auto Spend Permissions
- ✅ Multi-chain support

**Cons:**
- Extension required
- Slightly more setup

**Setup:**
1. Install Coinbase Wallet extension
2. Open game in browser
3. Click "Connect Base Wallet"

---

### MetaMask

**Pros:**
- ✅ Popular
- ✅ Easy to install

**Cons:**
- ❌ No Sub Account support
- ❌ No Auto Spend Permissions
- ⚠️ Each move requires approval

**Setup:**
1. Install MetaMask
2. Add Base network (if not present)
3. Click "Connect Base Wallet"
4. Note: Every move needs manual approval

---

### Other Wallets

**Status:** ❌ Not recommended but may work as generic EVM wallets

## 💰 Costs & Funding

### Move Cost
- **~$0.0001 USD** per move
- Varies based on Base network gas prices
- Displayed in the game

### Funding Your Wallet
1. Get ETH on Base network:
   - Withdraw from Coinbase/exchange to Base
   - Use [Base faucet](https://docs.base.org/guides/getting-started) (free ETH for testing)
   - Bridge from Ethereum mainnet

2. Fund amount: ~$0.01-0.10 USD (100+ moves)

3. When low: Game warns you with "Fund your wallet" message

## 🐛 Troubleshooting

### Can't Connect?

**Check:**
```
1. Is wallet installed?
   → Install Base/Coinbase/MetaMask

2. Is it unlocked?
   → Click wallet icon and unlock

3. Are you on Base network?
   → Check wallet's network selector
   → Should show "Base Mainnet" (chainId: 8453)

4. Is app HTTPS?
   → Web3 requires secure context
```

**If still stuck:**
- Open DevTools (F12) → Console tab
- Look for logs starting with `[v0]`
- These show exactly what's happening
- See `QUICK_DEBUG.md` for solutions

### Transaction Failed?

**Likely causes:**
- No ETH (fund wallet)
- Wrong network (switch to Base)
- Wallet rejected (try again)
- Network issue (refresh page)

**Check balance:**
- Click "↻" button in wallet panel
- Should show balance in ETH
- If 0 ETH, fund your wallet

### First Move Still Asks for Approval?

This is normal! The first move shows an approval popup where you grant "spend permission" so future moves can be silent.

**This is a feature, not a bug** ✅

Click "Approve" to continue.

## 🎮 Gameplay Tips

### Optimal Experience
1. **Use Base App** - Smoothest experience
2. **Pre-approve first** - Click "Approve" on first move popup
3. **Grant spend permission** - Allows silent future moves
4. **Keep wallet funded** - Check balance, don't run out

### If Experiencing Lag
- Give 1-2 seconds between moves
- Refresh page if stuck
- Check wallet app status (in wallet app, not in game)

## 🔐 Safety & Security

### What to Know
- ✅ Private keys stay in wallet (never shared with app)
- ✅ All approvals require your interaction
- ✅ Spend permissions are time-limited and scoped
- ✅ You control all your funds
- ✅ Wallet never shares private keys with app

### Best Practices
- ✅ Keep wallet password/passkey safe
- ✅ Don't share seed phrase
- ✅ Only approve permissions you understand
- ✅ Close wallet when done playing

## 📊 Understanding Permissions

### Spend Permission (Approval Popup)

When you see this popup:
```
┌─────────────────────────────┐
│ Grant Spend Permission?      │
│                             │
│ 2048 Game will access your  │
│ ETH up to: $X.XX per move   │
│ Period: 30 days             │
│                             │
│ [Accept] [One-time] [Deny]  │
└─────────────────────────────┘
```

**Choose:**
- **Accept** = Grant recurring permission (recommended)
- **One-time** = Single approval only
- **Deny** = Cancel transaction

**"Accept" means:**
- ✅ Future moves work silently
- ✅ No more popups (for 30 days)
- ✅ Better user experience

## 📱 Mobile/In-App Browser

### For Base App Mobile
- Open game inside Base app
- Everything works the same
- Use same "Connect Base Wallet" button

### For Mobile Browser
- Some limitations in-app browsers
- Best on native Base app
- MetaMask/Coinbase mobile apps also work

## ❓ FAQs

### Q: Why do I need a wallet?

**A:** The game runs on-chain (blockchain), so you need a wallet to pay for transactions.

### Q: Why not just use Privy email login?

**A:** Email login works (see login screen) but Sub Accounts + Auto Spend Permissions require Base Account SDK specifically.

### Q: Can I play for free?

**A:** Almost free! $0.0001 per move is negligible. Fund with $1 = 10,000+ moves.

### Q: What if I run out of ETH?

**A:** Game warns you at 3 moves left. Fund wallet to continue.

### Q: Can I use multiple wallets?

**A:** Yes, but score/history is tied to each wallet address.

### Q: Is my data private?

**A:** Wallet address is visible on-chain. Transactions are public. Game logic (moves) stored on-chain = transparent.

### Q: What if I accidentally reject the approval?

**A:** Just try your move again. You'll get another approval popup. No penalty.

## 🚀 Advanced Info

### What's a Sub Account?

A Sub Account is an app-specific wallet managed by Base Account:
- ✅ Faster transactions
- ✅ No need to sign every time
- ✅ Auto-funded by parent wallet
- ✅ App can't steal your funds (controlled by Base Account)

### What's Auto Spend Permission?

A feature that lets Base Account auto-fund Sub Accounts:
- ✅ Smart: Funds only as needed
- ✅ Safe: Limited amount + time period
- ✅ User-controlled: You approve it

### What's "Auto Spend Permissions"?

When enabled (default):
1. First transaction → Show approval popup
2. User grants permission → Future transactions silent
3. Base Account auto-funds as needed → Seamless experience

## 📚 Learn More

- [Base Account Docs](https://docs.base.org/base-account)
- [Sub Accounts Guide](https://docs.base.org/base-account/improve-ux/sub-accounts)
- [Base Blockchain](https://base.org)
- [Base Community](https://base.org/community)

## 🆘 Get Help

If something doesn't work:

1. **Check the docs:**
   - `QUICK_DEBUG.md` - Quick troubleshooting
   - `WALLET_CONNECTION_GUIDE.md` - Detailed guide
   - `FIXES_APPLIED.md` - Technical details

2. **Check browser console:**
   - Open DevTools (F12)
   - Look for `[v0]` logs
   - These show what's happening

3. **Try these steps:**
   - Refresh the page
   - Clear browser cache
   - Restart wallet app
   - Update wallet extension

4. **Still stuck?**
   - Check Base docs
   - Ask in Base community

---

## 🎉 Ready to Play?

1. **Install wallet** (or use Base app)
2. **Click "Connect Base Wallet"**
3. **Accept the popup**
4. **Make your first move**
5. **Enjoy the game!**

Happy playing! 🎮

---

**Need help?** See documentation files in project root.

**Version:** 1.0 (with Sub Accounts + Auto Spend Permissions)  
**Status:** ✅ Full functionality enabled
