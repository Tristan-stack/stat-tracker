'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession, updateUser } from '@/lib/auth-client';

function getInitials(name: string | null | undefined, email: string | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (email ?? '??').split('@')[0].slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [nameInitialized, setNameInitialized] = useState(false);
  const [imageInitialized, setImageInitialized] = useState(false);

  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [imageSuccess, setImageSuccess] = useState('');
  const [nameError, setNameError] = useState('');
  const [imageError, setImageError] = useState('');

  if (user && !nameInitialized) {
    setName(user.name ?? '');
    setNameInitialized(true);
  }
  if (user && !imageInitialized) {
    setImageUrl(user.image ?? '');
    setImageInitialized(true);
  }

  const handleSaveName = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess('');
    setIsSavingName(true);
    try {
      const { error } = await updateUser({ name: name.trim() });
      if (error) {
        setNameError(error.message ?? 'Erreur');
        return;
      }
      setNameSuccess('Nom mis à jour');
      setTimeout(() => setNameSuccess(''), 3000);
    } catch {
      setNameError('Erreur réseau');
    } finally {
      setIsSavingName(false);
    }
  }, [name]);

  const handleSaveImage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setImageError('');
    setImageSuccess('');
    setIsSavingImage(true);
    try {
      const { error } = await updateUser({ image: imageUrl.trim() || null });
      if (error) {
        setImageError(error.message ?? 'Erreur');
        return;
      }
      setImageSuccess('Photo mise à jour');
      setTimeout(() => setImageSuccess(''), 3000);
    } catch {
      setImageError('Erreur réseau');
    } finally {
      setIsSavingImage(false);
    }
  }, [imageUrl]);

  if (isPending) {
    return (
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground">Non connecté.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 py-10 sm:p-8 lg:py-14">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profil</h1>
        <p className="text-muted-foreground">
          Gère les informations de ton compte.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? ''} />}
              <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{user.name ?? '—'}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Inscription</p>
              <p className="text-sm">{formatDate(user.createdAt?.toString())}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Email vérifié</p>
              <p className="text-sm">{user.emailVerified ? 'Oui' : 'Non'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modifier le nom</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="profile-name">Nom</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ton nom"
                disabled={isSavingName}
              />
            </div>
            <Button type="submit" size="sm" disabled={isSavingName || name.trim() === (user.name ?? '')}>
              {isSavingName ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
          {nameError && <p className="mt-2 text-sm text-destructive">{nameError}</p>}
          {nameSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{nameSuccess}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Photo de profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {imageUrl.trim() && <AvatarImage src={imageUrl.trim()} alt="" />}
              <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <p className="text-xs text-muted-foreground">
              Aperçu en temps réel
            </p>
          </div>
          <form onSubmit={handleSaveImage} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="profile-image">URL de l&apos;image</Label>
              <Input
                id="profile-image"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                disabled={isSavingImage}
              />
            </div>
            <Button type="submit" size="sm" disabled={isSavingImage}>
              {isSavingImage ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
          {imageError && <p className="mt-2 text-sm text-destructive">{imageError}</p>}
          {imageSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{imageSuccess}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
