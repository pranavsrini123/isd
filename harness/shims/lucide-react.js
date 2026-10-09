// Harness stand-in for lucide-react: every named icon renders a small neutral SVG.
import React from 'react'
const cache = {}
export function make(name) {
  if (!cache[name]) {
    const Icon = React.forwardRef(function Icon({ className, strokeWidth, ...rest }, ref) {
      return React.createElement('svg', { ref, className, viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: strokeWidth || 2, 'data-icon': name, ...rest },
        React.createElement('rect', { x: 4, y: 4, width: 16, height: 16, rx: 4 }))
    })
    Icon.displayName = name
    cache[name] = Icon
  }
  return cache[name]
}
