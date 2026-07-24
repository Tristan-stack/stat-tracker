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
  PNL_FONT_WEIGHT_OPTIONS,
} from '@/lib/pnl/card-settings-storage';
import type { PnlCardSettings } from '@/types/pnl';
import {
  usePnlBackgrounds,
  useAddPnlBackground,
  useDeletePnlBackground,
} from '@/features/pnl/hooks/use-pnl';

interface PnlCardCustomizerProps {
  settings: PnlCardSettings;
  onSettingsChange: (settings: PnlCardSettings) => void;
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
  bgImages,
  onRequestBackgroundImage,
  onCacheBackgroundImage,
}: PnlCardCustomizerProps) {
  const { data: backgrounds = [] } = usePnlBackgrounds();
  const addBackground = useAddPnlBackground();
  const deleteBackground = useDeletePnlBackground();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = addBackground.isPending;

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
    setError(null);
    try {
      const imageData = await readFileAsDataUrl(file);
      const background = await addBackground.mutateAsync({ name: file.name, imageData });
      onCacheBackgroundImage(background.id, imageData);
      update({ selectedBackgroundId: background.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l’upload');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteBackground = async (id: string) => {
    try {
      await deleteBackground.mutateAsync(id);
      if (settings.selectedBackgroundId === id) update({ selectedBackgroundId: null });
    } catch {
      setError('Échec de la suppression du fond');
    }
  };

  const isAxiom = settings.cardStyle === 'axiom';
  const isVertical = settings.orientation === 'vertical';

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Style</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={!isAxiom ? 'default' : 'outline'}
            onClick={() => update({ cardStyle: 'classic' })}
          >
            Classique
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isAxiom ? 'default' : 'outline'}
            onClick={() => update({ cardStyle: 'axiom' })}
          >
            Axiom
          </Button>
        </div>
        {isAxiom && (
          <p className="text-[11px] text-muted-foreground">
            Gabarit fixe façon Axiom : nom, PNL, Invested, Position. Utilise une image de fond.
          </p>
        )}
      </div>

      {!isAxiom && (
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
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pnl-text-color">Couleur du texte</Label>
          <Input
            id="pnl-text-color"
            type="color"
            value={settings.textColor}
            onChange={(e) => update({ textColor: e.target.value })}
            disabled={isVertical && !isAxiom}
            className="h-9 w-full cursor-pointer p-1 disabled:opacity-50"
          />
          {isVertical && !isAxiom && (
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
        <div className="space-y-1.5">
          <Label htmlFor="pnl-font-weight">Épaisseur du texte</Label>
          <select
            id="pnl-font-weight"
            value={settings.fontWeight}
            onChange={(e) => update({ fontWeight: Number(e.target.value) })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            {PNL_FONT_WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        {isAxiom && (
          <div className="space-y-1.5">
            <Label htmlFor="pnl-accent-color">Couleur du bloc PNL</Label>
            <Input
              id="pnl-accent-color"
              type="color"
              value={settings.accentColor}
              onChange={(e) => update({ accentColor: e.target.value })}
              className="h-9 w-full cursor-pointer p-1"
            />
          </div>
        )}
      </div>

      {isAxiom && (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={settings.showLogo}
              onChange={(e) => update({ showLogo: e.target.checked })}
            />
            Afficher le logo
          </label>
          <div className="grid grid-cols-2 gap-4">
            {settings.showLogo && (
              <div className="space-y-1.5">
                <Label htmlFor="pnl-logo-color">Couleur du logo</Label>
                <Input
                  id="pnl-logo-color"
                  type="color"
                  value={settings.logoColor}
                  onChange={(e) => update({ logoColor: e.target.value })}
                  className="h-9 w-full cursor-pointer p-1"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pnl-brand-color">Couleur de la marque</Label>
              <Input
                id="pnl-brand-color"
                type="color"
                value={settings.brandColor}
                onChange={(e) => update({ brandColor: e.target.value })}
                className="h-9 w-full cursor-pointer p-1"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Marque = nom de l’app, date et footer. Passe en foncé pour un fond clair.
          </p>
        </div>
      )}

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
