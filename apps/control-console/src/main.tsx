import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { ControlConsoleProviders } from './query';
import { router } from './router';
import '../../../ui/styles/tokens.css';
import '../../../ui/styles/contract.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ControlConsoleProviders>
    <RouterProvider router={router} />
  </ControlConsoleProviders>,
);
