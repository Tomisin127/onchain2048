/**
 * Coinbase Onramp Integration for Base
 * Enables users to purchase ETH/USDC directly within the app
 */

export interface OnrampConfig {
  destinationWalletAddress: string;
  cryptocurrencies?: string[];
  chainId?: number;
  presetFiatAmount?: number;
  fiatCurrency?: string;
}

export interface OnrampOptions extends OnrampConfig {
  appId?: string;
  redirectUrl?: string;
}

/**
 * Generate Coinbase Onramp URL
 * Users can be redirected to this URL to purchase crypto
 */
export function generateOnrampUrl(config: OnrampOptions): string {
  const baseUrl = 'https://pay.coinbase.com/buy';
  const params = new URLSearchParams();

  // Required parameters
  params.append('destination_crypto_address', config.destinationWalletAddress);

  // Optional parameters
  if (config.cryptocurrencies?.length) {
    params.append('cryptocurrencies', config.cryptocurrencies.join(','));
  }

  if (config.chainId) {
    params.append('chain_id', config.chainId.toString());
  }

  if (config.presetFiatAmount) {
    params.append('preset_fiat_amount', config.presetFiatAmount.toString());
  }

  if (config.fiatCurrency) {
    params.append('fiat_currency', config.fiatCurrency);
  }

  if (config.appId) {
    params.append('app_id', config.appId);
  }

  if (config.redirectUrl) {
    params.append('redirect_url', config.redirectUrl);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Open Coinbase Onramp in a new window
 */
export function openOnrampFlow(config: OnrampOptions): Window | null {
  const url = generateOnrampUrl(config);
  return window.open(url, 'coinbase_onramp', 'width=500,height=800');
}

/**
 * Get Base network Onramp configuration
 */
export function getBaseOnrampConfig(walletAddress: string): OnrampConfig {
  return {
    destinationWalletAddress: walletAddress,
    cryptocurrencies: ['ETH', 'USDC'],
    chainId: 8453, // Base mainnet chain ID
    fiatCurrency: 'USD',
  };
}

/**
 * Listen for Onramp completion messages (for iframe integration)
 */
export function onOnrampSuccess(callback: (event: MessageEvent) => void): () => void {
  const handleMessage = (event: MessageEvent) => {
    // Verify origin for security
    if (event.origin !== 'https://pay.coinbase.com') {
      return;
    }

    // Check if this is an onramp success message
    if (event.data?.type === 'onramp_success') {
      callback(event);
    }
  };

  window.addEventListener('message', handleMessage);

  // Return cleanup function
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}
