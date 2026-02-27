import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ScrollToTop from './components/layout/ScrollToTop';
import ProtectedRoute from './components/auth/ProtectedRoute';
import HomeRoute from './components/auth/HomeRoute';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ProjectsPage from './pages/ProjectsPage';
import ServicesPage from './pages/ServicesPage';
import QuotePage from './pages/QuotePage';
import ServiceCategoryPage from './pages/ServiceCategoryPage';
import ServiceSubPage from './pages/ServiceSubPage';
import NotFoundPage from './pages/NotFoundPage';
import UploadPage from './pages/UploadPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import LguTranscriptionsPage from './pages/LguTranscriptionsPage';
import TranscriptionDetailPage from './pages/TranscriptionDetailPage';
import UserTranscriptionViewPage from './pages/UserTranscriptionViewPage';
import FaqFloatingButton from './components/ui/FaqFloatingButton';

function GlobalUiEffects() {
  const location = useLocation();

  useEffect(() => {
    const isDashboardRoute = location.pathname === '/dashboard' || location.pathname === '/admin/dashboard';
    if (!isDashboardRoute) return;

    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      const message = typeof reason === 'string' ? reason : reason?.message;

      if (
        typeof message === 'string' &&
        message.includes('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, [location.pathname]);

  useEffect(() => {
    const bindMedia = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (!node.matches('img, video, iframe')) return;

      const source = node.getAttribute('src') || node.getAttribute('data-src') || '';
      if (!source) return;

      const mediaStateKey = `${node.tagName}:${source}`;
      if (node.dataset.mediaStateKey === mediaStateKey && node.dataset.mediaState === 'loaded') {
        return;
      }

      node.dataset.mediaStateKey = mediaStateKey;
      node.dataset.mediaState = 'loading';
      node.classList.add('media-loading');
      node.classList.remove('media-loaded');

      const finalize = () => {
        node.dataset.mediaState = 'loaded';
        node.classList.remove('media-loading');
        node.classList.add('media-loaded');
      };

      if (node instanceof HTMLImageElement) {
        if (node.complete) {
          finalize();
          return;
        }
        node.addEventListener('load', finalize, { once: true });
        node.addEventListener('error', finalize, { once: true });
        return;
      }

      if (node instanceof HTMLVideoElement) {
        if (node.readyState >= 2) {
          finalize();
          return;
        }
        node.addEventListener('loadeddata', finalize, { once: true });
        node.addEventListener('canplay', finalize, { once: true });
        node.addEventListener('error', finalize, { once: true });
        return;
      }

      node.addEventListener('load', finalize, { once: true });
      node.addEventListener('error', finalize, { once: true });
    };

    const scanWithin = (root) => {
      if (!(root instanceof Element)) return;
      bindMedia(root);
      root.querySelectorAll('img, video, iframe').forEach(bindMedia);
    };

    scanWithin(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) scanWithin(node);
          });
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          bindMedia(mutation.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const noAnimation = location.pathname === '/dashboard' || location.pathname === '/admin/dashboard';
    root.classList.remove('page-enter-active');

    if (noAnimation) return;

    requestAnimationFrame(() => {
      root.classList.add('page-enter-active');
    });
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GlobalUiEffects />
        <ScrollToTop />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomeRoute><HomePage /></HomeRoute>} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/quote" element={<QuotePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/services/:categorySlug" element={<ServiceCategoryPage />} />
          <Route path="/services/:categorySlug/:serviceSlug" element={<ServiceSubPage />} />

          {/* User routes */}
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/transcriptions/:transcriptionId" element={<ProtectedRoute><UserTranscriptionViewPage /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin/dashboard" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/transcriptions" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <LguTranscriptionsPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/transcriptions/:fileId" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <TranscriptionDetailPage />
            </ProtectedRoute>
          } />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <FaqFloatingButton />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
