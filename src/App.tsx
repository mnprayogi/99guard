import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/sonner'
import GuardLayout from '@/components/layout/GuardLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import Login from '@/pages/Login'
import GuardHome from '@/pages/guard/GuardHome'
import ScanPage from '@/pages/guard/ScanPage'
import IncidentForm from '@/pages/guard/IncidentForm'
import GuardHistory from '@/pages/guard/GuardHistory'
import Dashboard from '@/pages/admin/Dashboard'
import RoundsPage from '@/pages/admin/RoundsPage'
import IncidentsPage from '@/pages/admin/IncidentsPage'
import ReportsPage from '@/pages/admin/ReportsPage'
import UsersPage from '@/pages/admin/UsersPage'
import SitesPage from '@/pages/admin/SitesPage'
import StoragePage from '@/pages/admin/StoragePage'
import CheckpointsPage from '@/pages/admin/CheckpointsPage'

function HomeRedirect() {
  const { profile, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-blue" />
      </div>
    )
  }
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to={profile.role === 'satpam' ? '/patrol' : '/admin'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<ProtectedRoute roles={['satpam']} />}>
            <Route element={<GuardLayout />}>
              <Route path="/patrol" element={<GuardHome />} />
              <Route path="/patrol/scan" element={<ScanPage />} />
              <Route path="/patrol/insiden" element={<IncidentForm />} />
              <Route path="/patrol/riwayat" element={<GuardHistory />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['admin', 'superadmin']} />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/ronde" element={<RoundsPage />} />
              <Route path="/admin/insiden" element={<IncidentsPage />} />
              <Route path="/admin/laporan" element={<ReportsPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['superadmin']} />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/pengguna" element={<UsersPage />} />
              <Route path="/admin/site" element={<SitesPage />} />
              <Route path="/admin/titik" element={<CheckpointsPage />} />
              <Route path="/admin/penyimpanan" element={<StoragePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" richColors toastOptions={{ duration: 3000 }} />
      </BrowserRouter>
    </AuthProvider>
  )
}