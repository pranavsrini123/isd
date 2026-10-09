// Harness stand-in for recharts: charts render a labelled box with the data size.
import React from 'react'
const CHARTS = ['AreaChart', 'BarChart', 'LineChart', 'PieChart', 'ComposedChart']
export function make(name) {
  if (name === 'ResponsiveContainer') {
    return ({ children }) => React.createElement('div', { style: { width: '100%', height: '100%' } }, children)
  }
  if (CHARTS.includes(name)) {
    return ({ data }) => React.createElement('div', {
      'data-chart': name,
      style: { width: '100%', height: '100%', minHeight: 120, border: '1px dashed #CBD5E1', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#556377', fontSize: 12 },
    }, `${name} · ${(data || []).length} points (chart placeholder in harness)`)
  }
  return () => null
}
