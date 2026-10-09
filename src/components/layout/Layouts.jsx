import {
  Activity, BarChart3, Boxes, ClipboardCheck, ClipboardList, Cpu, FolderKanban, LayoutDashboard,
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
    <>
      {profile?.status === 'restricted' && (
        <div className="bg-warn-bg px-4 py-2 text-center text-sm font-medium text-warn lg:pl-[252px]">
          Your account is restricted: you can browse, but new requests are paused. Contact the lab administrator.
        </div>
      )}
      <AppShell portal="student" nav={nav}
        switchLink={isAdmin ? { to: '/admin', label: 'Admin console', icon: ShieldCheck } : null}
        topRight={{ right: cart.count > 0 && (
          <Button to="/student/request" size="sm" variant="cyan" icon={ShoppingBasket} className="hidden sm:inline-flex">
            Request list · {cart.count}
          </Button>
        ) }} />
    </>
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
