import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  UserX,
  UserCheck,
  Building2,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { getStaff, createStaff, changeStaffRole, deactivateStaff, reactivateStaff } from '../../api/staffApi';
import { createBranch } from '../../api/branchApi';
import { useAuth } from '../../context/AuthContext';
import { MEMBERSHIP_ROLES, ROLE_LABELS } from '../../config/permissions';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import Can from '../../components/common/Can';

const ROLE_HELP = {
  owner: 'Everything, including staff, settings and audit log',
  pharmacist: 'Dispensing, prescriptions, stock, purchasing and reports',
  cashier: 'Point of sale and sales history only',
  storekeeper: 'Stock-in, adjustments, stock take and purchase orders',
};

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';
const labelCls = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';
const cardCls =
  'bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]';

const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;

const EMPTY_STAFF = { name: '', email: '', password: '', role: 'cashier' };
const EMPTY_BRANCH = { name: '', address: '', phone: '', licenseNo: '' };

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
    <div className={`relative w-full max-w-md ${cardCls} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Staff = () => {
  const { user, memberships, activePharmacy, updateSession } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', text }
  const [busyId, setBusyId] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_STAFF);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [showBranch, setShowBranch] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH);
  const [branchError, setBranchError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getStaff()
      .then((data) => {
        if (!cancelled) setStaff(data.staff || []);
      })
      .catch((err) => {
        if (!cancelled) setNotice({ type: 'error', text: errorMessage(err, 'Failed to load staff') });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const replaceMember = (member) => setStaff((prev) => prev.map((s) => (s._id === member._id ? member : s)));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (form.password.length < 8) {
      setFormError('Temporary password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      const data = await createStaff({ ...form, email: form.email.trim(), name: form.name.trim() });
      setStaff((prev) => [...prev, data.staff]);
      setShowAdd(false);
      setForm(EMPTY_STAFF);
      setNotice({ type: 'success', text: `${data.staff.name} added as ${ROLE_LABELS[data.staff.role]}` });
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to create staff account'));
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (member, role) => {
    if (role === member.role) return;
    setBusyId(member._id);
    try {
      const data = await changeStaffRole(member._id, role);
      replaceMember(data.staff);
      setNotice({ type: 'success', text: `${member.name} is now ${ROLE_LABELS[role]}` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'Failed to change role') });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (member) => {
    if (member.active && !window.confirm(`Deactivate ${member.name}? They will be signed out immediately.`)) return;
    setBusyId(member._id);
    try {
      const data = member.active ? await deactivateStaff(member._id) : await reactivateStaff(member._id);
      replaceMember(data.staff);
      setNotice({
        type: 'success',
        text: `${member.name} ${data.staff.active ? 'reactivated' : 'deactivated'}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'Failed to update staff status') });
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    setBranchError('');
    setSaving(true);
    try {
      const data = await createBranch(branchForm);
      const branch = data.branch;
      updateSession({
        memberships: [
          ...memberships,
          {
            pharmacyId: branch._id,
            role: 'owner',
            active: true,
            pharmacy: {
              _id: branch._id,
              name: branch.name,
              status: branch.status,
              organizationId: branch.organizationId,
              address: branch.address,
              phone: branch.phone,
            },
          },
        ],
      });
      setShowBranch(false);
      setBranchForm(EMPTY_BRANCH);
      setNotice({ type: 'success', text: `Branch "${branch.name}" created. Use the branch switcher to open it.` });
    } catch (err) {
      setBranchError(errorMessage(err, 'Failed to create branch'));
    } finally {
      setSaving(false);
    }
  };

  const activeCount = staff.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Team
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Staff & Roles
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage who can sign in to {activePharmacy?.name || 'this pharmacy'} and what they can do
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Can perm="branch:manage">
            <button
              onClick={() => setShowBranch(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer hover:border-emerald-400"
            >
              <Building2 className="w-4 h-4" />
              <span>New Branch</span>
            </button>
          </Can>
          <button
            onClick={() => {
              setForm(EMPTY_STAFF);
              setFormError('');
              setShowAdd(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`flex items-start gap-2 px-4 py-3 rounded-xl text-xs font-medium border ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
              : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="cursor-pointer opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MEMBERSHIP_ROLES.map((role) => (
          <div key={role} className={`${cardCls} p-4`}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">{ROLE_LABELS[role]}</span>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {staff.filter((s) => s.role === role && s.active).length}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{ROLE_HELP[role]}</p>
          </div>
        ))}
      </div>

      {/* Staff table */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">Team members</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {activeCount} active of {staff.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-48" />
            </div>
          ) : staff.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">No staff yet</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-5">Name</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {staff.map((member) => {
                  const isSelf = String(member._id) === String(user?._id);
                  const busy = busyId === member._id;
                  return (
                    <tr key={member._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {member.name?.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {member.name}
                            {isSelf && <span className="ml-1.5 text-[10px] text-slate-400 font-medium">(you)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{member.email}</td>
                      <td className="py-3 px-4">
                        <select
                          value={member.role}
                          disabled={busy}
                          onChange={(e) => handleRoleChange(member, e.target.value)}
                          className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer disabled:opacity-50"
                        >
                          {MEMBERSHIP_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={member.active ? 'active' : 'suspended'} label={member.active ? 'Active' : 'Deactivated'} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleToggleActive(member)}
                          disabled={busy}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-50 ${
                            member.active
                              ? 'text-rose-600 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900/60 dark:hover:bg-rose-500/10'
                              : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900/60 dark:hover:bg-emerald-500/10'
                          }`}
                        >
                          {member.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          {member.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && (
        <Modal title="Add staff member" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className={labelCls}>Full name</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                className={inputCls}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Temporary password (min 8 characters)</label>
              <input
                type="password"
                autoComplete="new-password"
                className={inputCls}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">Share it with the staff member; they can change it in Settings.</p>
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select
                className={inputCls}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {MEMBERSHIP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">{ROLE_HELP[form.role]}</p>
            </div>
            {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                <Plus className="w-4 h-4" /> {saving ? 'Saving...' : 'Create account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showBranch && (
        <Modal title="New branch" onClose={() => setShowBranch(false)}>
          <form onSubmit={handleCreateBranch} className="space-y-3">
            {[
              ['name', 'Branch name'],
              ['address', 'Address'],
              ['phone', 'Phone'],
              ['licenseNo', 'License number'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <input
                  className={inputCls}
                  value={branchForm[key]}
                  onChange={(e) => setBranchForm({ ...branchForm, [key]: e.target.value })}
                  required
                />
              </div>
            ))}
            <p className="text-[10px] text-slate-400">You become the owner of the new branch. Staff are managed per branch.</p>
            {branchError && <p className="text-xs text-rose-600 dark:text-rose-400">{branchError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBranch(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                <Building2 className="w-4 h-4" /> {saving ? 'Creating...' : 'Create branch'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Staff;
