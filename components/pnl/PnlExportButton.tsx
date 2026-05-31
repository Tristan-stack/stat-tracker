'use client';

import { useState, type RefObject } from 'react';
import { toPng } from 'html-to-image';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PnlExportButtonProps {
  nodeRef: RefObject<HTMLElement | null>;
  fileName: string;
}

export default function PnlExportButton({ nodeRef, fileName }: PnlExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const node = nodeRef.current;
    if (!node) return;
    setExporting(true);
    try {
      // Laisse le temps à l'image de fond (background-image) de se charger avant la capture.
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('[PnlExportButton]', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" disabled={exporting} onClick={() => void handleExport()}>
      {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      Exporter PNG
    </Button>
  );
}
