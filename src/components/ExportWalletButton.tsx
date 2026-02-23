import { Button } from '@/components/ui/button';
import { usePrivy, useExportWallet } from '@privy-io/react-auth';
import { useState } from 'react';

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
      variant="outline"
      size="sm"
      disabled={isExporting}
      className="border-border bg-secondary text-secondary-foreground hover:bg-muted text-xs"
    >
      {isExporting ? 'Exporting...' : '🔑 Export Wallet'}
    </Button>
  );
}
