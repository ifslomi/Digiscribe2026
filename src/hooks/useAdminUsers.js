import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useAdminUsers() {
  const { getIdToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch users.');
      }
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const createUser = useCallback(async ({ email, password, displayName, admin }) => {
    const token = await getIdToken();
    const role = admin ? 'admin' : 'user';
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, password, displayName, role }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to create user.');
    }
    await fetchUsers();
    return data.user;
  }, [getIdToken, fetchUsers]);

  const deleteUser = useCallback(async (uid) => {
    const token = await getIdToken();
    const res = await fetch(`/api/admin/users/${uid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete user.');
    }
    await fetchUsers();
  }, [getIdToken, fetchUsers]);

  const toggleAdmin = useCallback(async (uid, makeAdmin) => {
    const token = await getIdToken();
    const role = makeAdmin ? 'admin' : 'user';
    const res = await fetch(`/api/admin/users/${uid}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update user role.');
    }
    await fetchUsers();
  }, [getIdToken, fetchUsers]);

  const changePassword = useCallback(async (uid, password) => {
    const token = await getIdToken();
    const res = await fetch(`/api/admin/users/${uid}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to change password.');
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, loading, error, fetchUsers, createUser, deleteUser, toggleAdmin, changePassword };
}
