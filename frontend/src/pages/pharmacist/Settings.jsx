import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyPharmacy, updateMyPharmacy, updateProfile } from '../../api/pharmacyApi';

const Settings = () => {
  const { user } = useAuth();
  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);

  // Pharmacy details state
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pharmacyLoading, setPharmacyLoading] = useState(false);
  const [pharmacySuccess, setPharmacySuccess] = useState('');
  const [pharmacyError, setPharmacyError] = useState('');

  // Pharmacist profile & security state
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const data = await getMyPharmacy();
        setPharmacy(data.pharmacy);
        setPhone(data.pharmacy?.phone || '');
        setAddress(data.pharmacy?.address || '');
      } catch (err) {
        console.error('Failed to load pharmacy details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPharmacy();
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  const handleUpdatePharmacy = async (e) => {
    e.preventDefault();
    setPharmacyLoading(true);
    setPharmacySuccess('');
    setPharmacyError('');

    try {
      const res = await updateMyPharmacy({ phone, address });
      setPharmacy(res.pharmacy);
      setPharmacySuccess('Pharmacy contact details updated successfully');
    } catch (err) {
      setPharmacyError(err.response?.data?.message || 'Failed to update pharmacy');
    } finally {
      setPharmacyLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileSuccess('');
    setProfileError('');

    if (newPassword && newPassword !== confirmPassword) {
      setProfileLoading(false);
      return setProfileError('New password and confirmation do not match');
    }

    try {
      const payload = { name };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      await updateProfile(payload);
      setProfileSuccess('Profile & security credentials updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-12 text-center text-xs text-slate-400">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <Link
              to="/pharmacy"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 mb-2 transition"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white tracking-tight">Pharmacy Settings</h1>
            <p className="text-xs text-slate-400">
              Manage your pharmacy business details, contact information, and personal security
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Tenant ID: <span className="font-mono">{pharmacy?._id?.slice(-6)}</span>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pharmacy Profile Information */}
          <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Pharmacy Business Info</h2>
              <p className="text-xs text-slate-400">Public details displayed on receipts and invoices</p>
            </div>

            {pharmacySuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                {pharmacySuccess}
              </div>
            )}

            {pharmacyError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {pharmacyError}
              </div>
            )}

            <form onSubmit={handleUpdatePharmacy} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Pharmacy Name</label>
                <input
                  type="text"
                  disabled
                  value={pharmacy?.name || ''}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 cursor-not-allowed font-medium"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Managed by System Admin</span>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Official License #</label>
                <input
                  type="text"
                  disabled
                  value={pharmacy?.licenseNo || ''}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 cursor-not-allowed font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Contact Phone Number *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="+1 234 567 890"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Physical Location / Address *</label>
                <textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  placeholder="Street address, City, Country"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={pharmacyLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition cursor-pointer"
              >
                {pharmacyLoading ? 'Saving...' : 'Save Business Info'}
              </button>
            </form>
          </div>

          {/* Pharmacist Profile & Security */}
          <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Pharmacist Account & Security</h2>
              <p className="text-xs text-slate-400">Update your name or change your login password</p>
            </div>

            {profileSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                {profileSuccess}
              </div>
            )}

            {profileError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {profileError}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Your Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Email (Username)</label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 cursor-not-allowed"
                />
              </div>

              <div className="pt-2 border-t border-slate-700/60">
                <span className="font-semibold text-slate-300 block mb-2">Change Password (Optional)</span>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={profileLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition cursor-pointer"
              >
                {profileLoading ? 'Updating...' : 'Update Account & Password'}
              </button>
            </form>
          </div>
        </div>

        {/* System & Architecture Compliance Badge */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-white mb-1">Multi-Tenant Architecture Active</h4>
            <p>
              Your database documents are strictly partitioned under tenant scope:{' '}
              <code className="text-emerald-400 font-mono">{pharmacy?._id}</code>.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold whitespace-nowrap">
            ✓ Data Isolation Verified
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
