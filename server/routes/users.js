import { Router } from 'express';
import { adminAuth } from '../firebaseAdmin.js';
import { verifyAdmin } from '../middleware/authMiddleware.js';

const router = Router();

const VALID_ROLES = ['user', 'admin'];

// GET /api/admin/users - List all users (admin only)
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const listResult = await adminAuth.listUsers(1000);
    const users = listResult.users.map((u) => {
      const claims = u.customClaims || {};
      // Support legacy role names and admin boolean
      let role = claims.role;
      if (!role) {
        role = claims.admin ? 'admin' : 'user';
      } else if (role === 'superAdmin' || role === 'lguAdmin') {
        role = 'admin';
      }
      return {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || '',
        disabled: u.disabled,
        role,
        createdByUid: claims.createdByUid || null,
        createdAt: u.metadata.creationTime,
      };
    });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/users - Create a new user (admin only)
router.post('/users', verifyAdmin, async (req, res) => {
  const { email, password, displayName, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const userRole = VALID_ROLES.includes(role) ? role : 'user';

  try {
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || '',
    });

    const claims = { role: userRole, createdByUid: req.user.uid };
    await adminAuth.setCustomUserClaims(userRecord.uid, claims);

    res.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        role: userRole,
      },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/users/:uid - Delete a user (admin only)
router.delete('/users/:uid', verifyAdmin, async (req, res) => {
  try {
    const targetUser = await adminAuth.getUser(req.params.uid);
    const claims = targetUser.customClaims || {};
    const targetRole = claims.role || (claims.admin ? 'admin' : 'user');
    // Protect root admins — those with no createdByUid and admin role cannot be deleted
    if (targetRole === 'admin' && !claims.createdByUid) {
      return res.status(403).json({ success: false, error: 'This admin account is protected and cannot be deleted.' });
    }
    await adminAuth.deleteUser(req.params.uid);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/users/:uid/role - Update user role (admin only)
router.put('/users/:uid/role', verifyAdmin, async (req, res) => {
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
  }

  try {
    const claims = { role };
    await adminAuth.setCustomUserClaims(req.params.uid, claims);
    res.json({ success: true, role });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
