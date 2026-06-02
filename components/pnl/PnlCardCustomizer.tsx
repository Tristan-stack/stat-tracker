'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  PNL_ELEMENT_KEYS,
  PNL_ELEMENT_LABELS,
  PNL_FONT_OPTIONS,
} from '@/lib/pnl/card-settings-storage';
import type { PnlBackgroundMeta, PnlCardSettings } from '@/types/pnl';

interface PnlCardCustomizerProps {
  settings: PnlCardSettings;
  onSettingsChange: (settings: PnlCardSettings) => void;
  backgrounds: PnlBackgroundMeta[];
  onBackgroundsChange: (backgrounds: PnlBackgroundMeta[]) => void;
  /** Cache des data URLs des fonds (id → image), partagé avec la page. */
  bgImages: Record<string, string>;
  /** Demande le chargement de l'image d'un fond (pour la preview). */
  onRequestBackgroundImage: (id: string) => void;
  /** Insère une image déjà connue dans le cache (ex. juste uploadée). */
  onCacheBackgroundImage: (id: string, imageData: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read error'));
    reader.readAsDataURL(file);
  });
}

export default function PnlCardCustomizer({
  settings,
  onSettingsChange,
  backgrounds,
  onBackgroundsChange,
  bgImages,
  onRequestBackgroundImage,
  onCacheBackgroundImage,
}: PnlCardCustomizerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<PnlCardSettings>) => onSettingsChange({ ...settings, ...patch });

  // Charge l'image de chaque fond pour afficher les vignettes en preview.
  useEffect(() => {
    for (const bg of backgrounds) {
      if (!bgImages[bg.id]) onRequestBackgroundImage(bg.id);
    }
  }, [backgrounds, bgImages, onRequestBackgroundImage]);

  const toggleElement = (key: (typeof PNL_ELEMENT_KEYS)[number]) => {
    update({
      visibleElements: {
        ...settings.visibleElements,
        [key]: !settings.visibleElements[key],
      },
    });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const imageData = await readFileAsDataUrl(file);
      const res = await fetch('/api/pnl/backgrounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, imageData }),
      });
      const data = (await res.json()) as { background?: PnlBackgroundMeta; error?: string };
      if (!res.ok || !data.background) {
        setError(data.error ?? 'Échec de l’upload');
        return;
      }
      onBackgroundsChange([data.background, ...backgrounds]);
      onCacheBackgroundImage(data.background.id, imageData);
      update({ selectedBackgroundId: data.background.id });
    } catch {
      setError('Erreur lors de la lecture du fichier');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteBackground = async (id: string) => {
    const res = await fetch(`/api/pnl/backgrounds/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onBackgroundsChange(backgrounds.filter((b) => b.id !== id));
      if (settings.selectedBackgroundId === id) update({ selectedBackgroundId: null });
    }
  };

  const isVertical = settings.orientation === 'vertical';

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Orientation</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={!isVertical ? 'default' : 'outline'}
            onClick={() => update({ orientation: 'horizontal' })}
          >
            Horizontale
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isVertical ? 'default' : 'outline'}
            onClick={() => update({ orientation: 'vertical' })}
          >
            Verticale
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pnl-text-color">Couleur du texte</Label>
          <Input
            id="pnl-text-color"
            type="color"
            value={settings.textColor}
            onChange={(e) => update({ textColor: e.target.value })}
            disabled={isVertical}
            className="h-9 w-full cursor-pointer p-1 disabled:opacity-50"
          />
          {isVertical && (
            <p className="text-[11px] text-muted-foreground">
              Auto (noir/blanc) selon le fond en mode vertical.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pnl-font">Police</Label>
          <select
            id="pnl-font"
            value={settings.fontFamily}
            onChange={(e) => update({ fontFamily: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            {PNL_FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Éléments affichés</Label>
        <div className="grid grid-cols-2 gap-2">
          {PNL_ELEMENT_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={settings.visibleElements[key]}
                onChange={() => toggleElement(key)}
              />
              {PNL_ELEMENT_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Image de fond</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            Uploader
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update({ selectedBackgroundId: null })}
            className={cn(
              'flex h-16 w-24 items-center justify-center rounded-md border text-xs text-muted-foreground',
              settings.selectedBackgroundId === null ? 'border-primary ring-2 ring-primary' : 'border-input'
            )}
          >
            Aucun
          </button>
          {backgrounds.map((bg) => (
            <div key={bg.id} className="group relative">
              <button
                type="button"
                onClick={() => update({ selectedBackgroundId: bg.id })}
                className={cn(
                  'flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted bg-cover bg-center text-center text-[10px] text-muted-foreground',
                  settings.selectedBackgroundId === bg.id
                    ? 'border-primary ring-2 ring-primary'
                    : 'border-input'
                )}
                style={bgImages[bg.id] ? { backgroundImage: `url(${bgImages[bg.id]})` } : undefined}
                title={bg.name ?? bg.id}
              >
                {/* Tant que l'image n'est pas chargée, on affiche le nom (fallback). */}
                {!bgImages[bg.id] && <span className="line-clamp-2 px-1">{bg.name ?? 'Image'}</span>}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteBackground(bg.id)}
                className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
                aria-label="Supprimer le fond"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
