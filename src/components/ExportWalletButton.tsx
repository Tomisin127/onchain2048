import { Button } from '@/components/ui/button';
import { usePrivy, useExportWallet } from '@privy-io/react-auth';
import { useState } from 'react';
import { Key, Loader2 } from 'lucide-react';

export function ExportWalletButton() {
  const { user } = usePrivy();
  const { exportWallet } = useExportWallet();
  const [isExporting, setIsExporting] = useState(false);

  // Only show for email users
  const isEmailUser = !!user?.email;
  if (!isEmailUser) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportWallet();
    } catch (error) {
      console.error('Failed to export wallet:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      variant="ghost"
      size="icon"
      disabled={isExporting}
      className="h-7 w-7"
      aria-label="Export wallet"
    >
      {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
    </Button>
  );
}
