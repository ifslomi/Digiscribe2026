import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { config } from '../../data/config';
import { navigationLinks } from '../../data/navigation';
import { useNavbarScroll } from '../../hooks/useNavbarScroll';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { useAppToast } from '../../hooks/useAppToast';

function NestedDropdownItem({ item, onClose, isOpen, onMouseEnter, onMouseLeave }) {
  if (!item.children) {
    return (
      <Link
        to={item.path}
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-text hover:text-primary hover:bg-gray-50 transition-colors"
      >
        <i className={`${item.icon} text-primary/60 w-4`}></i>
        {item.label}
      </Link>
    );
  }

  return (
    <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <Link
        to={item.path}
        onClick={onClose}
        className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-text hover:text-primary hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <i className={`${item.icon} text-primary/60 w-4`}></i>
          {item.label}
        </div>
        <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </Link>
      {/* Nested dropdown */}
      <div
        className={`absolute left-full top-0 pl-2 z-[60] ${
          isOpen ? '' : 'pointer-events-none'
        }`}
      >
        <div className={`w-56 bg-white rounded-xl shadow-lg border border-gray-100 ${
          isOpen
            ? 'opacity-100 visible translate-x-0 transition-all duration-200 ease-in-out'
            : 'opacity-0 invisible translate-x-2'
        }`}>
          <div className="py-2">
            {item.children.map((child) => (
              <Link
                key={child.path}
                to={child.path}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-text hover:text-primary hover:bg-gray-50 transition-colors"
              >
                <i className={`${child.icon} text-primary/60 w-4`}></i>
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavDropdown({ item, onClose, isVisible }) {
  const [openChild, setOpenChild] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!isVisible) {
      setOpenChild(null);
      clearTimeout(timeoutRef.current);
    }
  }, [isVisible]);

  const handleChildEnter = (path) => {
    clearTimeout(timeoutRef.current);
    setOpenChild(path);
  };

  const handleChildLeave = () => {
    timeoutRef.current = setTimeout(() => setOpenChild(null), 150);
  };

  return (
    <div className="py-2">
      {item.children.map((child) => (
        <NestedDropdownItem
          key={child.path}
          item={child}
          onClose={onClose}
          isOpen={openChild === child.path}
          onMouseEnter={() => handleChildEnter(child.path)}
          onMouseLeave={handleChildLeave}
        />
      ))}
    </div>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const { user } = useAuth();
  const toast = useAppToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    if (success) {
      toast.success(`Password for "${user?.email}" has been updated successfully.`, 'Password Changed');
    }
    setCurrentPassword('');
    setNewPassword('');
    setError('');
    setSuccess(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword) { setError('Please enter your current password.'); return; }
    if (newPassword.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (currentPassword === newPassword) { setError('New password must be different from your current password.'); return; }
    setLoading(true); setError('');
    try {
      // Re-authenticate first to verify current password
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      // Update password directly via Firebase client SDK (correct pattern for self-service)
      await updatePassword(auth.currentUser, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full btn-gradient flex items-center justify-center flex-shrink-0">
              <i className="fas fa-key text-white text-sm"></i>
            </div>
            <div>
              <DialogTitle>Change Password</DialogTitle>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{user?.email}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                <i className="fas fa-check text-green-500 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-dark-text">Password updated!</p>
                <p className="text-xs text-gray-400 mt-1">Your new password is active.</p>
              </div>
              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-full btn-gradient text-white text-sm font-medium"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }}
                  placeholder="Enter your current password"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                  placeholder="At least 6 characters"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <i className="fas fa-exclamation-circle text-red-400 text-xs flex-shrink-0"></i>
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-full btn-gradient text-white text-sm font-medium disabled:opacity-60 transition-opacity"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Updating...
                    </span>
                  ) : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserDropdown({ onClose }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/');
  };

  const displayEmail = user?.email?.length > 20 ? user.email.slice(0, 18) + '...' : user?.email;

  const dashboardPath = isAdmin ? '/admin/dashboard' : '/dashboard';
  const dashboardLabel = isAdmin ? 'Admin Dashboard' : 'Dashboard';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="hidden md:flex items-center gap-2 text-sm font-medium text-dark-text hover:text-primary transition-colors px-3 py-2 rounded-full border border-gray-200 hover:border-primary/30"
      >
        <i className="fas fa-user-circle text-primary"></i>
        <span className="max-w-[140px] truncate">{displayEmail}</span>
        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      <div className={`absolute top-full right-0 pt-2 z-50 ${open ? '' : 'pointer-events-none'}`}>
        <div className={`w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 ${
          open
            ? 'opacity-100 visible translate-y-0 transition-all duration-200 ease-in-out'
            : 'opacity-0 invisible translate-y-2'
        }`}>
          {/* Role badge */}
          <div className="px-4 py-2 border-b border-gray-100 mb-1">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">
              {isAdmin ? 'Admin' : 'User'}
            </p>
          </div>

          <Link
            to={dashboardPath}
            onClick={() => { setOpen(false); onClose?.(); }}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-text hover:text-primary hover:bg-gray-50 transition-colors"
          >
            <i className="fas fa-tachometer-alt text-primary/60 w-4"></i>
            {dashboardLabel}
          </Link>
          <button
            onClick={() => { setOpen(false); setChangePassOpen(true); }}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-text hover:text-primary hover:bg-gray-50 transition-colors w-full text-left"
          >
            <i className="fas fa-key text-primary/60 w-4"></i>
            Change Password
          </button>
          <div className="border-t border-gray-100 my-1"></div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-text hover:text-red-500 hover:bg-red-50 transition-colors w-full text-left"
          >
            <i className="fas fa-sign-out-alt text-gray-400 w-4"></i>
            Sign Out
          </button>
        </div>
      </div>
      <ChangePasswordModal open={changePassOpen} onClose={() => setChangePassOpen(false)} />
    </div>
  );
}

function MobileMenu({ isOpen, onClose }) {
  const [expandedItems, setExpandedItems] = useState({});
  const [expandedSubItems, setExpandedSubItems] = useState({});
  const [changePassOpen, setChangePassOpen] = useState(false);
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const toggleExpand = (key) => {
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSubExpand = (key) => {
    setExpandedSubItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    await logout();
    onClose();
    navigate('/');
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        onClick={onClose}
      />
      {/* Slide-out panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white z-50 shadow-xl transform transition-transform duration-300 ease-in-out md:hidden overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <img src={config.company.logo.main} alt={config.company.logo.alt} className="h-10 w-auto" />
            <button onClick={onClose} className="text-dark-text">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <nav className="space-y-1">
            {!user && navigationLinks.map((link) => {
              if (!link.children) {
                return (
                  <Link
                    key={link.key}
                    to={link.path}
                    onClick={onClose}
                    className="block px-3 py-3 text-base font-medium text-dark-text hover:text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                );
              }

              return (
                <div key={link.key}>
                  <button
                    onClick={() => toggleExpand(link.key)}
                    className="flex items-center justify-between w-full px-3 py-3 text-base font-medium text-dark-text hover:text-primary transition-colors"
                  >
                    {link.label}
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${expandedItems[link.key] ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </button>
                  {expandedItems[link.key] && (
                    <div className="pl-4 space-y-1">
                      {link.children.map((child) => {
                        if (!child.children) {
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={onClose}
                              className="flex items-center gap-3 px-3 py-2 text-sm text-gray-text hover:text-primary transition-colors"
                            >
                              <i className={`${child.icon} text-primary/60 w-4 text-xs`}></i>
                              {child.label}
                            </Link>
                          );
                        }

                        return (
                          <div key={child.path}>
                            <button
                              onClick={() => toggleSubExpand(child.path)}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-text hover:text-primary transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <i className={`${child.icon} text-primary/60 w-4 text-xs`}></i>
                                {child.label}
                              </div>
                              <svg
                                className={`w-3 h-3 transition-transform duration-200 ${expandedSubItems[child.path] ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                              </svg>
                            </button>
                            {expandedSubItems[child.path] && (
                              <div className="pl-6 space-y-1">
                                {child.children.map((subChild) => (
                                  <Link
                                    key={subChild.path}
                                    to={subChild.path}
                                    onClick={onClose}
                                    className="flex items-center gap-3 px-3 py-2 text-xs text-gray-text hover:text-primary transition-colors"
                                  >
                                    <i className={`${subChild.icon} text-primary/60 w-3 text-xs`}></i>
                                    {subChild.label}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Auth-dependent mobile links */}
            {user && (
              <>
{isAdmin ? (
                  <Link
                    to="/admin/dashboard"
                    onClick={onClose}
                    className="block px-3 py-3 text-base font-medium text-dark-text hover:text-primary transition-colors"
                  >
                    <i className="fas fa-tachometer-alt text-primary/60 mr-2"></i>
                    Admin Dashboard
                  </Link>
                ) : (
                  <Link
                    to="/dashboard"
                    onClick={onClose}
                    className="block px-3 py-3 text-base font-medium text-dark-text hover:text-primary transition-colors"
                  >
                    <i className="fas fa-tachometer-alt text-primary/60 mr-2"></i>
                    Dashboard
                  </Link>
                )}
              </>
            )}
          </nav>

          <div className="mt-6 space-y-3">
            {user ? (
              <>
                <div className="px-3 py-2 text-xs text-gray-text truncate">
                  <i className="fas fa-user-circle text-primary mr-1.5"></i>
                  {user.email}
                </div>
                <button
                  onClick={() => { onClose(); setTimeout(() => setChangePassOpen(true), 300); }}
                  className="block w-full text-center text-primary border border-primary px-5 py-3 rounded-full text-sm font-medium hover:bg-primary hover:text-white transition-colors"
                >
                  <i className="fas fa-key mr-1.5"></i>Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full text-center text-white px-5 py-3 rounded-full text-sm font-medium bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Sign Out
                </button>
                <ChangePasswordModal open={changePassOpen} onClose={() => setChangePassOpen(false)} />
              </>
            ) : (
              <Link
                to="/login"
                replace
                onClick={onClose}
                className="block text-center text-primary border border-primary px-5 py-3 rounded-full text-sm font-medium hover:bg-primary hover:text-white transition-colors"
              >
                Login
              </Link>
            )}
            {!user && (
              <Link
                to="/quote"
                onClick={onClose}
                className="block text-center text-white px-5 py-3 rounded-full text-sm font-medium btn-gradient"
              >
                Get a Quote
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Navbar() {
  const headerRef = useRef(null);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownTimeoutRef = useRef(null);
  const { user, isAdmin } = useAuth();

  useNavbarScroll(headerRef);

  const closeMobile = useCallback(() => setMobileMenuOpen(false), []);

  const isActive = (key) => {
    if (key === 'home') return location.pathname === '/';
    if (key === 'services') return location.pathname.startsWith('/services');
    if (key === 'projects') return location.pathname === '/projects';
    if (key === 'about') return location.pathname === '/about';
    if (key === 'upload') return location.pathname === '/upload';
    if (key === 'dashboard') return location.pathname === '/dashboard';
    return false;
  };

  const handleDropdownEnter = (key) => {
    clearTimeout(dropdownTimeoutRef.current);
    setOpenDropdown(key);
  };

  const handleDropdownLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 150);
  };

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-50 border-b">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link to={user ? (isAdmin ? '/admin/dashboard' : '/dashboard') : '/'} className="flex items-center">
              <img src={config.company.logo.main} alt={config.company.logo.alt} className="h-14 w-auto" />
            </Link>

            {/* Desktop Navigation Links — hidden when logged in */}
            {!user && <div className="hidden md:flex items-center space-x-8">
              {navigationLinks.map((link) => {
                if (!link.children) {
                  return (
                    <Link
                      key={link.key}
                      to={link.path}
                      className={`text-base font-medium transition-colors ${
                        isActive(link.key) ? 'text-primary' : 'text-dark-text hover:text-primary'
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                }

                return (
                  <div
                    key={link.key}
                    className="relative"
                    onMouseEnter={() => handleDropdownEnter(link.key)}
                    onMouseLeave={handleDropdownLeave}
                  >
                    <Link
                      to={link.path}
                      className={`text-base font-medium transition-colors flex items-center gap-1 ${
                        isActive(link.key) ? 'text-primary' : 'text-dark-text hover:text-primary'
                      }`}
                    >
                      {link.label}
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${openDropdown === link.key ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                      </svg>
                    </Link>

                    {/* Dropdown */}
                    <div
                      className={`absolute top-full left-0 pt-2 z-50 ${
                        openDropdown === link.key ? '' : 'pointer-events-none'
                      }`}
                    >
                      <div className={`w-56 bg-white rounded-xl shadow-lg border border-gray-100 ${
                        openDropdown === link.key
                          ? 'opacity-100 visible translate-y-0 transition-all duration-200 ease-in-out'
                          : 'opacity-0 invisible translate-y-2'
                      }`}>
                        <NavDropdown item={link} onClose={() => setOpenDropdown(null)} isVisible={openDropdown === link.key} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}

            {/* Right side buttons */}
            <div className="hidden md:flex items-center gap-3">

              {user ? (
                <UserDropdown />
              ) : (
                <Link
                  to="/login"
                  replace
                  className="text-primary border border-primary px-5 py-2 rounded-full text-sm font-medium transition-all hover:bg-primary hover:text-white"
                >
                  Login
                </Link>
              )}
              {!user && (
                <Link
                  to="/quote"
                  className="text-white px-5 py-2 rounded-full text-sm font-medium transition-all hover:shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #b8e4f7 0%, #0ea5e9 50%, #0369a1 100%)' }}
                >
                  Get a Quote
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-dark-text"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
          </div>
        </nav>
      </header>

      <MobileMenu isOpen={mobileMenuOpen} onClose={closeMobile} />
    </>
  );
}
