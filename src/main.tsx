import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { preloadPages, router } from './router.tsx';
// Tipografías de píxeles del tema "Net", servidas desde el propio sitio (sin pedidos a servicios de
// fuentes externos). Los `unicode-range` hacen que solo se descarguen los subconjuntos que se usan:
// `latin` y `latin-ext` cubren los acentos y la eñe.
import '@fontsource-variable/pixelify-sans/wght.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/latin-ext-400.css';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root en index.html');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

preloadPages();
