import { useState } from 'react';

export default function CreateUserForm({ onCreateUser, loading, onClose }) {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Enter a valid email address.';
    }
    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validate();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onCreateUser({ email: email.trim(), password, displayName: companyName.trim(), admin: role === 'admin' });
      setCompanyName('');
      setEmail('');
      setPassword('');
      setRole('user');
      setErrors({});
      onClose?.();
    } catch {
      // Error handling is done in the parent via the hook
    } finally {
      setSubmitting(false);
    }
  };

  const isDisabled = loading || submitting;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <i className="fas fa-user-plus text-primary text-xs"></i>
          </div>
          <h3 className="text-base font-semibold text-dark-text">Add New User</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-dark-text hover:bg-gray-100 transition-colors"
        >
          <i className="fas fa-times text-xs"></i>
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Company Name */}
        <div>
          <label htmlFor="create-company" className="block text-[11px] font-medium text-gray-text uppercase tracking-wide mb-1.5">
            Company Name
          </label>
          <input
            id="create-company"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            placeholder="Company Name"
            disabled={isDisabled}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="create-email" className="block text-[11px] font-medium text-gray-text uppercase tracking-wide mb-1.5">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            id="create-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: '' })); }}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all ${
              errors.email ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-gray-50'
            }`}
            placeholder="user@company.com"
            disabled={isDisabled}
          />
          {errors.email && <p className="mt-1 text-[11px] text-red-500">{errors.email}</p>}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="create-password" className="block text-[11px] font-medium text-gray-text uppercase tracking-wide mb-1.5">
            Password <span className="text-red-400">*</span>
          </label>
          <input
            id="create-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: '' })); }}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all ${
              errors.password ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-gray-50'
            }`}
            placeholder="Password (min. 6 characters)"
            disabled={isDisabled}
          />
          {errors.password && <p className="mt-1 text-[11px] text-red-500">{errors.password}</p>}
        </div>

        {/* Role */}
        <div>
          <label htmlFor="create-role" className="block text-[11px] font-medium text-gray-text uppercase tracking-wide mb-1.5">
            Role
          </label>
          <select
            id="create-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isDisabled}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all cursor-pointer"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDisabled}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isDisabled}
            className="btn-gradient text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDisabled ? (
              <i className="fas fa-spinner fa-spin text-xs"></i>
            ) : (
              <i className="fas fa-user-plus text-xs"></i>
            )}
            Create User
          </button>
        </div>
      </form>
    </>
  );
}

