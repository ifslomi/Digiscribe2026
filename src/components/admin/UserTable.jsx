import { useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';

export default function UserTable({ users, onDeleteUser, onToggleAdmin, loading, onOpenCreate }) {
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const handleDelete = async (uid, email) => {
    setActionLoading(uid);
    try {
      await onDeleteUser(uid, email);
    } catch {
      // Error handled by parent
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleToggleAdmin = async (uid, currentIsAdmin, email) => {
    setActionLoading(uid);
    try {
      await onToggleAdmin(uid, !currentIsAdmin, email);
    } catch {
      // Error handled by parent
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card className="rounded-2xl shadow-xl overflow-hidden">
        <div className="p-12 text-center">
          <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
          <p className="text-sm text-gray-text mt-3">Loading users...</p>
        </div>
      </Card>
    );
  }

  // Empty state
  if (!users || users.length === 0) {
    return (
      <Card className="rounded-2xl shadow-xl overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-users text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-medium text-dark-text">No users found</p>
          <p className="text-xs text-gray-text mt-1">Create a new user above to get started.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 sm:p-8 pb-0">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <i className="fas fa-users text-primary"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-dark-text">Users</h3>
            <p className="text-xs text-gray-text">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
          </div>
          {onOpenCreate && (
            <Button onClick={onOpenCreate} size="sm" className="flex-shrink-0 gap-1.5">
              <i className="fas fa-user-plus text-xs"></i>
              Add New User
            </Button>
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-t border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-8 py-3 text-xs font-semibold text-gray-text uppercase tracking-wider">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-text uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-text uppercase tracking-wider">Created</th>
              <th className="text-right px-8 py-3 text-xs font-semibold text-gray-text uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary uppercase">
                        {user.email?.[0] || '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dark-text truncate max-w-[200px]">{user.email}</p>
                      {user.displayName && (
                        <p className="text-xs text-gray-text truncate max-w-[200px]">{user.displayName}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  {user.role === 'admin' ? (
                    <Badge className="gap-1 rounded-full">
                      <i className="fas fa-shield-halved text-[10px]"></i>
                      Admin
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 rounded-full">
                      <i className="fas fa-user text-[10px]"></i>
                      User
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-gray-text">{formatDate(user.createdAt)}</span>
                </td>
                <td className="px-8 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {user.role === 'admin' && !user.createdByUid ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 bg-gray-100 cursor-not-allowed"
                        title="Root admin — cannot be modified"
                      >
                        <i className="fas fa-lock text-[10px]"></i>
                        Protected
                      </span>
                    ) : (
                      <>
                        <Button
                          onClick={() => setConfirmAction({ type: 'role', user })}
                          disabled={actionLoading === user.uid}
                          size="sm"
                          variant={user.role === 'admin' ? 'secondary' : 'default'}
                          className={user.role === 'admin' ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : ''}
                          title={user.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        >
                          <i className={`fas ${user.role === 'admin' ? 'fa-user-minus' : 'fa-user-shield'}`}></i>
                          {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                        </Button>
                        <Button
                          onClick={() => setConfirmAction({ type: 'delete', user })}
                          disabled={actionLoading === user.uid}
                          size="sm"
                          variant="destructive"
                        >
                          <i className="fas fa-trash-alt"></i>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden p-4 sm:p-6 pt-0 space-y-3">
        {users.map((user) => (
          <div key={user.uid} className="p-4 rounded-xl border border-gray-100 bg-gray-50/30">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary uppercase">
                    {user.email?.[0] || '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark-text truncate">{user.email}</p>
                  {user.displayName && (
                    <p className="text-xs text-gray-text truncate">{user.displayName}</p>
                  )}
                </div>
              </div>
              {user.role === 'admin' ? (
                <Badge className="gap-1 rounded-full flex-shrink-0">
                  <i className="fas fa-shield-halved text-[10px]"></i>
                  Admin
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 rounded-full flex-shrink-0">
                  <i className="fas fa-user text-[10px]"></i>
                  User
                </Badge>
              )}
            </div>

            <p className="text-xs text-gray-text mb-3">
              <i className="fas fa-calendar-alt mr-1.5"></i>
              Created {formatDate(user.createdAt)}
            </p>

            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              {user.role === 'admin' && !user.createdByUid ? (
                <span
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-gray-400 bg-gray-100 cursor-not-allowed"
                  title="Root admin — cannot be modified"
                >
                  <i className="fas fa-lock text-[10px]"></i>
                  Protected
                </span>
              ) : (
                <>
                  <Button
                    onClick={() => setConfirmAction({ type: 'role', user })}
                    disabled={actionLoading === user.uid}
                    size="sm"
                    variant={user.role === 'admin' ? 'secondary' : 'default'}
                    className={`flex-1 ${user.role === 'admin' ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : ''}`}
                  >
                    <i className={`fas ${user.role === 'admin' ? 'fa-user-minus' : 'fa-user-shield'}`}></i>
                    {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                  </Button>
                  <Button
                    onClick={() => setConfirmAction({ type: 'delete', user })}
                    disabled={actionLoading === user.uid}
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                  >
                    <i className="fas fa-trash-alt"></i>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'role' ? 'Confirm Role Change' : 'Delete User'}
        message={confirmAction?.type === 'role'
          ? `${confirmAction?.user?.role === 'admin' ? 'Remove admin access from' : 'Grant admin access to'} ${confirmAction?.user?.email}?`
          : `Delete user ${confirmAction?.user?.email}?`}
        confirmLabel={confirmAction?.type === 'role' ? 'Confirm Role Change' : 'Delete User'}
        tone={confirmAction?.type === 'role' ? 'primary' : 'danger'}
        loading={actionLoading === confirmAction?.user?.uid}
        onConfirm={() => {
          if (!confirmAction?.user) return;
          if (confirmAction.type === 'role') {
            handleToggleAdmin(confirmAction.user.uid, confirmAction.user.role === 'admin', confirmAction.user.email);
            return;
          }
          handleDelete(confirmAction.user.uid, confirmAction.user.email);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </Card>
  );
}
