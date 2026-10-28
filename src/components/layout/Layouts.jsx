import {
  Activity, AlertTriangle, BarChart3, Boxes, ClipboardCheck, FileSpreadsheet, ClipboardList, Cpu, FolderKanban, LayoutDashboard,
  PackageCheck, Settings, ShieldCheck, ShoppingBasket, User, Users, GraduationCap, MessageSquareText, FileSignature,
} from 'lucide-react'
import { Link } from 'react-router-dom'
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
      { to: '/student/takeaway', label: 'Take-away', icon: FileSignature },
      { to: '/student/enquiries', label: 'Enquiries', icon: MessageSquareText },
      { to: '/student/profile', label: 'Profile', icon: User },
    ] },
  ]
  return (
    <AppShell portal="student" nav={nav}
      banner={profile?.status === 'restricted' ? (
        <div className="flex items-center justify-center gap-2 border-b border-warn-solid/30 bg-warn-bg/90 px-4 py-2.5 text-center text-sm font-medium text-warn backdrop-blur">
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />
          Your account is restricted: you can browse, but new requests are paused. Contact the lab administrator.
        </div>
      ) : !profile?.department ? (
        // Accounts created before the department became mandatory keep working; this asks them to complete it.
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-warn-solid/30 bg-warn-bg/90 px-4 py-2.5 text-center text-sm font-medium text-warn backdrop-blur">
          <GraduationCap className="h-4 w-4 flex-none" aria-hidden />
          Add your department to complete your profile.
          <Link to="/student/profile#department" className="font-semibold underline underline-offset-2">Add it now</Link>
        </div>
      ) : null}
      switchLink={isAdmin ? { to: '/admin', label: 'Admin console', icon: ShieldCheck } : null}
      topRight={{ right: cart.count > 0 && (
        // The wrapper hides it on phones (the sidebar badge shows the count there).
        <span className="hidden sm:block">
          <Button to="/student/request" size="sm" variant="cyan" icon={ShoppingBasket}>
            Request list · <span className="num">{cart.count}</span>
          </Button>
        </span>
      ) }} />
  )
}

export function AdminLayout() {
  const { isSuperAdmin } = useAuth()
  const nav = [
    { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    { title: 'Operations', items: [
      { to: '/admin/requests', label: isSuperAdmin ? 'Requests' : 'Approved requests', icon: ClipboardCheck },
      { to: '/admin/issuance', label: 'Issue & returns', icon: PackageCheck },
      { to: '/admin/takeaway', label: 'Take-away', icon: FileSignature },
      { to: '/admin/enquiries', label: 'Enquiries', icon: MessageSquareText },
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
