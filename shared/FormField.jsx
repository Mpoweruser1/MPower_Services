// shared/FormField.jsx — FINAL
// Universal form field component with validation display
// Handles: text, number, date, select, textarea, phone
// Shows: error messages, required indicator, character count

import React from 'react';

const S = {
  wrapper: { marginBottom: 16 },
  label: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  required: {
    color: '#E05A5A',
    fontSize: 13,
  },
  input: (hasError) => ({
    width: '100%',
    padding: '10px 14px',
    background: '#111113',
    border: `1px solid ${hasError ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 8,
    fontSize: 14,
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  }),
  error: {
    fontSize: 11,
    color: '#E05A5A',
    marginTop: 5,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  hint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 4,
  },
  counter: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.2)',
    marginTop: 3,
    textAlign: 'right',
  },
};

export default function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  touched,
  required = false,
  placeholder,
  hint,
  maxLength,
  min,
  max,
  options,      // for select: [{ value, label }]
  rows = 3,     // for textarea
  disabled = false,
  prefix,       // e.g. "₹" for amount fields
  suffix,       // e.g. "kg"
  style = {},
}) {
  const hasError = touched && !!error;
  const inputStyle = { ...S.input(hasError), ...style };

  function handleChange(e) {
    let val = e.target.value;

    // Type enforcement
    if (type === 'number' || type === 'amount') {
      // Allow only digits and decimal point
      val = val.replace(/[^0-9.]/g, '');
      // Prevent multiple decimal points
      const parts = val.split('.');
      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    }

    if (type === 'phone') {
      // Allow only digits, +, spaces, hyphens
      val = val.replace(/[^0-9+\s-]/g, '');
    }

    if (type === 'pincode' || type === 'aadhar') {
      val = val.replace(/\D/g, '');
    }

    onChange(name, val);
  }

  function handleBlur() {
    if (onBlur) onBlur(name, value);
  }

  // Render input based on type
  function renderInput() {
    if (type === 'select') {
      return (
        <select
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <option value="">-- Select --</option>
          {(options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    if (type === 'textarea') {
      return (
        <textarea
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
        />
      );
    }

    if (type === 'date') {
      return (
        <input
          type="date"
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          min={min}
          max={max || new Date().toISOString().slice(0, 10)}
          disabled={disabled}
          style={inputStyle}
        />
      );
    }

    // Default — text, number, phone, email etc
    const inputType = ['amount', 'phone', 'pincode', 'aadhar'].includes(type)
      ? 'text'
      : type === 'number' ? 'text' : type;

    if (prefix || suffix) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {prefix && (
            <span style={{ padding: '10px 10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${hasError ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              {prefix}
            </span>
          )}
          <input
            type={inputType}
            value={value || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            maxLength={maxLength}
            min={min}
            max={max}
            disabled={disabled}
            style={{
              ...inputStyle,
              borderRadius: prefix ? '0 8px 8px 0' : suffix ? '8px 0 0 8px' : 8,
              borderLeft: prefix ? 'none' : undefined,
              borderRight: suffix ? 'none' : undefined,
            }}
          />
          {suffix && (
            <span style={{ padding: '10px 10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${hasError ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderLeft: 'none', borderRadius: '0 8px 8px 0', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              {suffix}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        type={inputType}
        value={value || ''}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        max={max}
        disabled={disabled}
        style={inputStyle}
        inputMode={type === 'number' || type === 'amount' || type === 'phone' || type === 'pincode' ? 'numeric' : undefined}
      />
    );
  }

  return (
    <div style={S.wrapper}>
      {label && (
        <div style={S.label}>
          {label}
          {required && <span style={S.required}>*</span>}
        </div>
      )}

      {renderInput()}

      {/* Character counter */}
      {maxLength && typeof value === 'string' && (
        <div style={{
          ...S.counter,
          color: value.length > maxLength * 0.9
            ? '#E8A020'
            : 'rgba(255,255,255,0.2)',
        }}>
          {value.length}/{maxLength}
        </div>
      )}

      {/* Error message */}
      {hasError && (
        <div style={S.error}>
          <span>⚠</span>
          {error}
        </div>
      )}

      {/* Hint text */}
      {hint && !hasError && (
        <div style={S.hint}>{hint}</div>
      )}
    </div>
  );
}