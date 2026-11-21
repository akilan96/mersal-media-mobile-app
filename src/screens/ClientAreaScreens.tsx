import React from 'react';
import { Button, EmptyState, Header, Screen } from '../components/ui';
import { useStudio } from '../state/StudioProvider';

export function ClientPhotosScreen() {
  return <Screen>
    <Header title="Photos" />
    <EmptyState icon="image" title="No photos available" description="Your studio photos will appear here when they’re ready to select." />
  </Screen>;
}

export function ClientFavouritesScreen() {
  return <Screen>
    <Header title="Favourites" />
    <EmptyState icon="heart" title="No favourites yet" description="Photos you mark as favourites will appear here." />
  </Screen>;
}

export function ClientHelpScreen() {
  const { lock } = useStudio();
  return <Screen>
    <Header title="Help" />
    <EmptyState icon="help-circle" title="Need help with your photos?" description="Contact the studio that provided your sign-in details." />
    <Button title="Log out" icon="log-out" variant="secondary" onPress={lock} />
  </Screen>;
}
