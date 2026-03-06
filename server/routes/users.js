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
    // Protect root admins — only block deletion if the target is an admin with no createdByUid
    // AND the requester is also a root admin (no createdByUid). This prevents one created-admin
    // from deleting another, while allowing the true root admin to clean up stuck accounts.
    const requesterClaims = (await adminAuth.getUser(req.user.uid)).customClaims || {};
    const requesterIsRoot = !requesterClaims.createdByUid;
    const targetIsRoot = targetRole === 'admin' && !claims.createdByUid;
    if (targetIsRoot && !requesterIsRoot) {
      return res.status(403).json({ success: false, error: 'This admin account is protected and cannot be deleted.' });
    }
    // Root admin cannot delete themselves
    if (req.params.uid === req.user.uid) {
      return res.status(403).json({ success: false, error: 'You cannot delete your own account.' });
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
    // Preserve existing claims (e.g. createdByUid) — only overwrite role
    const targetUser = await adminAuth.getUser(req.params.uid);
    const existingClaims = targetUser.customClaims || {};
    await adminAuth.setCustomUserClaims(req.params.uid, { ...existingClaims, role });
    res.json({ success: true, role });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/users/:uid/password - Change a user's password (admin only)
router.put('/users/:uid/password', verifyAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }
  try {
    await adminAuth.updateUser(req.params.uid, { password });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
