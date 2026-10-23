import {
  Activity, AlertTriangle, BarChart3, Boxes, ClipboardCheck, FileSpreadsheet, ClipboardList, Cpu, FolderKanban, LayoutDashboard,
  PackageCheck, Settings, ShieldCheck, ShoppingBasket, User, Users, GraduationCap,
} from 'lucide-react'
import { AppShell } from './AppShell'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { Button } from '../ui/primitives'

export function StudentLayout() {
  const { isAdmin, profile } = useAuth()
  const cart = useCart()
  const nav = [
    { items: [
      { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/student/inventory', label: 'Inventory', icon: Cpu },
      { to: '/student/projects', label: 'Projects', icon: FolderKanban },
      { to: '/student/request', label: 'New request', icon: ShoppingBasket, badge: cart.count || null },
      { to: '/student/requests', label: 'My requests', icon: ClipboardList },
      { to: '/student/profile', label: 'Profile', icon: User },
    ] },
  ]
  return (
    <AppShell portal="student" nav={nav}
      banner={profile?.status === 'restricted' && (
        <div className="flex items-center justify-center gap-2 border-b border-warn-solid/30 bg-warn-bg/90 px-4 py-2.5 text-center text-sm font-medium text-warn backdrop-blur">
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />
          Your account is restricted: you can browse, but new requests are paused. Contact the lab administrator.
        </div>
      )}
      switchLink={isAdmin ? { to: '/admin', label: 'Admin console', icon: ShieldCheck } : null}
      topRight={{ right: cart.count > 0 && (
        <Button to="/student/request" size="sm" variant="cyan" icon={ShoppingBasket} className="hidden sm:inline-flex">
          Request list · <span className="num">{cart.count}</span>
        </Button>
      ) }} />
  )
}

export function AdminLayout() {
  const nav = [
    { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    { title: 'Operations', items: [
      { to: '/admin/requests', label: 'Requests', icon: ClipboardCheck },
      { to: '/admin/issuance', label: 'Issue & returns', icon: PackageCheck },
    ] },
    { title: 'Catalogue', items: [
      { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
      { to: '/admin/import', label: 'Audit import', icon: FileSpreadsheet },
      { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
    ] },
    { title: 'Insight & people', items: [
      { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/activity', label: 'Activity log', icon: Activity },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ] },
  ]
  return <AppShell portal="admin" nav={nav} switchLink={{ to: '/student', label: 'Student view', icon: GraduationCap }} />
}
