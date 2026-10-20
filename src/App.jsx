import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { CartProvider } from './context/CartContext'
import { isConfigured } from './lib/supabase'
import { RedirectIfSignedIn, RequireAdmin, RequireAuth } from './components/layout/Guards'
import { AdminLayout, StudentLayout } from './components/layout/Layouts'
import { PageLoader } from './components/ui/primitives'
import { ErrorBoundary } from './components/ErrorBoundary'
import SetupRequired from './pages/public/SetupRequired'
import Landing from './pages/public/Landing'
import Welcome from './pages/public/Welcome'
import { Login, Register, VerifyEmail, ForgotPassword, ResetPassword, AuthCallback } from './pages/public/Auth'
import NotFound from './pages/public/NotFound'

// Portal pages are split into their own chunks so the landing/login pages stay small.
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'))
const StudentInventory = lazy(() => import('./pages/student/Inventory'))
const ProjectLibrary = lazy(() => import('./pages/student/Projects'))
const ProjectDetails = lazy(() => import('./pages/student/ProjectDetails'))
const NewRequest = lazy(() => import('./pages/student/NewRequest'))
const MyRequests = lazy(() => import('./pages/student/MyRequests'))
const Profile = lazy(() => import('./pages/student/Profile'))

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminInventory = lazy(() => import('./pages/admin/Inventory'))
const AdminImport = lazy(() => import('./pages/admin/Import'))
const AdminRequests = lazy(() => import('./pages/admin/Requests'))
const AdminIssuance = lazy(() => import('./pages/admin/Issuance'))
const AdminProjects = lazy(() => import('./pages/admin/Projects'))
const AdminProjectEditor = lazy(() => import('./pages/admin/ProjectEditor'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminReports = lazy(() => import('./pages/admin/Reports'))
const AdminActivity = lazy(() => import('./pages/admin/Activity'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))

export default function App() {
  if (!isConfigured) return <SetupRequired />
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Welcome />} />
                <Route path="/about" element={<Landing />} />
                {/* Friendly redirects for mistyped or old addresses (e.g. /welcome, /login/welcome). */}
                <Route path="/welcome" element={<Navigate to="/" replace />} />
                <Route path="/login/*" element={<Navigate to="/login" replace />} />
                <Route path="/register/*" element={<Navigate to="/register" replace />} />
                <Route path="/login" element={<RedirectIfSignedIn><Login /></RedirectIfSignedIn>} />
                <Route path="/register" element={<RedirectIfSignedIn><Register /></RedirectIfSignedIn>} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />

                <Route element={<RequireAuth />}>
                  <Route path="/student" element={<StudentLayout />}>
                    <Route index element={<StudentDashboard />} />
                    <Route path="inventory" element={<StudentInventory />} />
                    <Route path="projects" element={<ProjectLibrary />} />
                    <Route path="projects/:id" element={<ProjectDetails />} />
                    <Route path="request" element={<NewRequest />} />
                    <Route path="requests" element={<MyRequests />} />
                    <Route path="borrowings" element={<Navigate to="/student/requests?tab=borrowed" replace />} />
                    <Route path="profile" element={<Profile />} />
                  </Route>
                  <Route element={<RequireAdmin />}>
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="inventory" element={<AdminInventory />} />
                      <Route path="import" element={<AdminImport />} />
                      <Route path="requests" element={<AdminRequests />} />
                      <Route path="issuance" element={<AdminIssuance />} />
                      <Route path="projects" element={<AdminProjects />} />
                      <Route path="projects/:id" element={<AdminProjectEditor />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="reports" element={<AdminReports />} />
                      <Route path="activity" element={<AdminActivity />} />
                      <Route path="settings" element={<AdminSettings />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
