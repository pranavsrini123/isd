import { createContext, useContext } from 'react'

// Student and admin share components but not density: student surfaces are
// glassy, rounder and animated; admin surfaces flatter, denser and still.
export const PortalContext = createContext('student')
export const usePortal = () => useContext(PortalContext)

// 'dark' inside the glowing night heroes and panels, so buttons and inputs
// placed there switch to their light-on-dark styles automatically.
export const SurfaceContext = createContext('light')
export const useSurface = () => useContext(SurfaceContext)
