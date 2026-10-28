import { Input, Select } from '../ui/forms'
import { DEPARTMENT_OPTIONS, OTHER } from '../../lib/department'

/**
 * Mandatory department picker: CTech or Other (+ a typed name).
 * value = { choice, other }; the parent turns it into the stored text with joinDepartment().
 */
export function DepartmentField({ value, onChange, error, className, disabled }) {
  const otherError = value.choice === OTHER ? error : ''
  return (
    <div className={className}>
      <Select label="Department" required value={value.choice} disabled={disabled}
        placeholder="Choose your department" options={DEPARTMENT_OPTIONS}
        error={value.choice !== OTHER ? error : ''}
        // Switching to CTech clears the typed name so it is never saved by accident.
        onChange={(e) => onChange({ choice: e.target.value, other: e.target.value === OTHER ? value.other : '' })} />
      {value.choice === OTHER && (
        <Input className="mt-3" label="Department name" required value={value.other} disabled={disabled}
          maxLength={100} autoComplete="organization-title" placeholder="e.g. Electronics and Communication"
          error={otherError} onChange={(e) => onChange({ choice: OTHER, other: e.target.value })} />
      )}
    </div>
  )
}
