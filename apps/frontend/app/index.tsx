import React from 'react';

import { HomeScreenView } from '@/features/home/HomeScreenView';
import { useHomeController } from '@/features/home/useHomeController';

export default function HomeScreen() {
  const controller = useHomeController();
  return <HomeScreenView controller={controller} />;
}
