// shared/useFormValidation.js — FINAL
// Universal form validation hook for all MPower forms
// Usage: const { errors, validate, touch, touched, isValid } = useFormValidation(rules)

import { useState, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// Built-in validators
// ─────────────────────────────────────────────────────────────
export const validators = {

  required: (value) => {
    if (value === null || value === undefined) return 'This field is required';
    if (typeof value === 'string' && !value.trim()) return 'This field is required';
    if (Array.isArray(value) && value.length === 0) return 'At least one selection required';
    return null;
  },

  minLength: (min) => (value) => {
    if (!value) return null;
    if (value.trim().length < min) return `Minimum ${min} characters required`;
    return null;
  },

  maxLength: (max) => (value) => {
    if (!value) return null;
    if (value.trim().length > max) return `Maximum ${max} characters allowed`;
    return null;
  },

  phone: (value) => {
    if (!value) return null;
    const clean = value.replace(/\D/g, '');
    if (clean.length !== 10 && clean.length !== 12)
      return 'Enter a valid 10-digit phone number';
    if (clean.length === 10 && !/^[6-9]/.test(clean))
      return 'Indian mobile numbers start with 6, 7, 8 or 9';
    return null;
  },

  email: (value) => {
    if (!value) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return 'Enter a valid email address';
    return null;
  },

  number: (value) => {
    if (!value && value !== 0) return null;
    if (isNaN(Number(value))) return 'Must be a number';
    return null;
  },

  positiveNumber: (value) => {
    if (!value && value !== 0) return null;
    if (isNaN(Number(value))) return 'Must be a number';
    if (Number(value) <= 0) return 'Must be greater than zero';
    return null;
  },

  integer: (value) => {
    if (!value && value !== 0) return null;
    if (!Number.isInteger(Number(value))) return 'Must be a whole number';
    return null;
  },

  minValue: (min) => (value) => {
    if (!value && value !== 0) return null;
    if (Number(value) < min) return `Minimum value is ${min}`;
    return null;
  },

  maxValue: (max) => (value) => {
    if (!value && value !== 0) return null;
    if (Number(value) > max) return `Maximum value is ${max}`;
    return null;
  },

  date: (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'Enter a valid date';
    return null;
  },

  pastDate: (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'Enter a valid date';
    if (d > new Date()) return 'Date cannot be in the future';
    return null;
  },

  futureDate: (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'Enter a valid date';
    if (d < new Date()) return 'Date must be in the future';
    return null;
  },

  notFutureDate: (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'Enter a valid date';
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (d > today) return 'Date cannot be in the future';
    return null;
  },

  minAge: (years) => (value) => {
    if (!value) return null;
    const dob  = new Date(value);
    const minD = new Date();
    minD.setFullYear(minD.getFullYear() - years);
    if (dob > minD) return `Must be at least ${years} years old`;
    return null;
  },

  maxAge: (years) => (value) => {
    if (!value) return null;
    const dob  = new Date(value);
    const maxD = new Date();
    maxD.setFullYear(maxD.getFullYear() - years);
    if (dob < maxD) return `Age cannot exceed ${years} years`;
    return null;
  },

  pincode: (value) => {
    if (!value) return null;
    if (!/^\d{6}$/.test(value)) return 'Enter a valid 6-digit PIN code';
    return null;
  },

  aadhar: (value) => {
    if (!value) return null;
    const clean = value.replace(/\s/g, '');
    if (!/^\d{12}$/.test(clean)) return 'Aadhaar number must be 12 digits';
    return null;
  },

  apaar: (value) => {
    if (!value) return null;
    if (!/^\d{12}$/.test(value)) return 'APAAR ID must be 12 digits';
    return null;
  },

  abha: (value) => {
    if (!value) return null;
    const clean = value.replace(/-/g, '');
    if (!/^\d{14}$/.test(clean)) return 'ABHA number must be 14 digits';
    return null;
  },

  admissionNo: (value) => {
    if (!value) return null;
    if (value.trim().length < 2) return 'Admission number too short';
    if (!/^[A-Za-z0-9\-\/]+$/.test(value.trim()))
      return 'Admission number can only contain letters, numbers, - and /';
    return null;
  },

  amount: (value) => {
    if (!value && value !== 0) return null;
    if (isNaN(Number(value))) return 'Enter a valid amount';
    if (Number(value) < 0)    return 'Amount cannot be negative';
    if (Number(value) > 10000000) return 'Amount seems too large — please check';
    return null;
  },

  noSpecialChars: (value) => {
    if (!value) return null;
    if (/[<>{}|\\^`]/.test(value)) return 'Special characters not allowed';
    return null;
  },

  nameField: (value) => {
    if (!value) return null;
    if (value.trim().length < 2) return 'Name is too short';
    if (/\d/.test(value)) return 'Name should not contain numbers';
    if (/[<>{}|\\^`@#$%*]/.test(value)) return 'Name contains invalid characters';
    return null;
  },
};

// ─────────────────────────────────────────────────────────────
// Sanitizers — use in onChange handlers to block invalid input
// ─────────────────────────────────────────────────────────────
export const sanitize = {

  positiveNumber: (value) => {
    const clean = String(value).replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) return parts[0] + '.' + parts[1];
    if (parts[0].length > 1 && parts[0].startsWith('0'))
      return parts[0].replace(/^0+/, '') + (parts[1] !== undefined ? '.' + parts[1] : '');
    return clean;
  },

  integer: (value) => {
    const clean = String(value).replace(/\D/g, '');
    return clean.replace(/^0+(\d)/, '$1');
  },

  percentage: (value) => {
    const clean = String(value).replace(/[^0-9.]/g, '');
    const num   = parseFloat(clean);
    if (isNaN(num)) return '';
    if (num > 100)  return '100';
    if (num < 0)    return '0';
    return clean;
  },

  phone: (value) => {
    return String(value).replace(/[^0-9+\s-]/g, '').slice(0, 15);
  },

  amount: (value) => {
    const clean = String(value).replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) return parts[0] + '.' + parts[1];
    if (parts[1]?.length > 2) return parts[0] + '.' + parts[1].slice(0, 2);
    return clean;
  },
};
// ─────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────
export function useFormValidation(rules) {
  // rules = { fieldName: [validator1, validator2, ...] }
  const [errors,  setErrors]  = useState({});
  const [touched, setTouched] = useState({});

  // Validate a single field
  const validateField = useCallback((name, value) => {
    const fieldRules = rules[name];
    if (!fieldRules) return null;

    for (const rule of fieldRules) {
      const error = rule(value);
      if (error) return error;
    }
    return null;
  }, [rules]);

  // Validate all fields at once — returns true if all valid
  const validate = useCallback((formData) => {
    const newErrors = {};
    let valid = true;

    for (const [name, fieldRules] of Object.entries(rules)) {
      const value = formData[name];
      for (const rule of fieldRules) {
        const error = rule(value);
        if (error) {
          newErrors[name] = error;
          valid = false;
          break;
        }
      }
    }

    setErrors(newErrors);
    // Mark all fields as touched so errors show
    setTouched(Object.fromEntries(Object.keys(rules).map((k) => [k, true])));
    return valid;
  }, [rules]);

  // Mark field as touched (show error after blur)
  const touch = useCallback((name, value) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, [validateField]);

  // Update error for a single field as user types
  const onChange = useCallback((name, value) => {
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  }, [touched, validateField]);

  // Clear errors
  const reset = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  const isValid = Object.values(errors).every((e) => !e);

  return { errors, touched, validate, touch, onChange, reset, isValid };
}