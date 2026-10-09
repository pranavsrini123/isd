import { createContext, useContext } from 'react'

// Student and admin share components but not density: student surfaces are
// rounder and airier, admin surfaces flatter and denser (as in the mockup).
export const PortalContext = createContext('student')
export const usePortal = () => useContext(PortalContext)
