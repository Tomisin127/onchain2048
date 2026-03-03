import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
import { config } from '@/lib/wagmi';
import { PrivyWrapper } from '@/lib/privy/provider';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import FarcasterWrapper from "@/components/FarcasterWrapper";
import Game2048Page from "./pages/Game2048";
import NotFound from "./pages/NotFound";
import '@coinbase/onchainkit/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5_000,
    },
  },
});

const App = () => (
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <OnchainKitProvider chain={base}>
        <PrivyWrapper>
          <FarcasterWrapper>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Game2048Page />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </FarcasterWrapper>
        </PrivyWrapper>
      </OnchainKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
