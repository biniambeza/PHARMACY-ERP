import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, ShieldCheck, Building2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getStaff, createStaff, changeStaffRole, deactivateStaff, reactivateStaff } from '../../api/staffApi';
import { createBranch } from '../../api/branchApi';
import { useAuth } from '../../context/useAuth';
import { MEMBERSHIP_ROLES, ROLE_LABELS } from '../../config/permissions';
import Can from '../../components/common/Can';
import StaffTable from '../../components/staff/StaffTable';
import AddStaffModal from '../../components/staff/AddStaffModal';
import NewBranchModal from '../../components/staff/NewBranchModal';
import { cardCls } from '../../components/staff/staffUi';

const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;

const EMPTY_STAFF = { name: '', email: '', password: '', role: 'cashier' };
const EMPTY_BRANCH = { name: '', address: '', phone: '', licenseNo: '' };

const Staff = () => {
  const { t } = useTranslation(['staff', 'common']);
  const roleLabel = (r) => t(`roles.${r}`, { defaultValue: ROLE_LABELS[r] || r });
  const roleHelp = (r) => t(`roleHelp.${r}`);
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
        if (!cancelled) setNotice({ type: 'error', text: errorMessage(err, t('notices.loadFailed')) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const replaceMember = (member) => setStaff((prev) => prev.map((s) => (s._id === member._id ? member : s)));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (form.password.length < 8) {
      setFormError(t('notices.passwordTooShort'));
      return;
    }
    setSaving(true);
    try {
      const data = await createStaff({ ...form, email: form.email.trim(), name: form.name.trim() });
      setStaff((prev) => [...prev, data.staff]);
      setShowAdd(false);
      setForm(EMPTY_STAFF);
      setNotice({ type: 'success', text: t('notices.added', { name: data.staff.name, role: roleLabel(data.staff.role) }) });
    } catch (err) {
      setFormError(errorMessage(err, t('notices.createFailed')));
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
      setNotice({ type: 'success', text: t('notices.roleChanged', { name: member.name, role: roleLabel(role) }) });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, t('notices.roleChangeFailed')) });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (member) => {
    if (member.active && !window.confirm(t('confirmDeactivate', { name: member.name }))) return;
    setBusyId(member._id);
    try {
      const data = member.active ? await deactivateStaff(member._id) : await reactivateStaff(member._id);
      replaceMember(data.staff);
      setNotice({
        type: 'success',
        text: t(data.staff.active ? 'notices.reactivated' : 'notices.deactivated', { name: member.name }),
      });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, t('notices.statusFailed')) });
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
      setNotice({ type: 'success', text: t('notices.branchCreated', { name: branch.name }) });
    } catch (err) {
      setBranchError(errorMessage(err, t('notices.branchFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t('badge')}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle', { pharmacy: activePharmacy?.name || t('thisPharmacy') })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Can perm="branch:manage">
            <button
              onClick={() => setShowBranch(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer hover:border-emerald-400"
            >
              <Building2 className="w-4 h-4" />
              <span>{t('newBranch')}</span>
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
            <span>{t('addStaff')}</span>
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
              <span className="text-xs font-bold text-slate-900 dark:text-white">{roleLabel(role)}</span>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {staff.filter((s) => s.role === role && s.active).length}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{roleHelp(role)}</p>
          </div>
        ))}
      </div>

      {/* Staff table */}
      <StaffTable
        staff={staff}
        loading={loading}
        userId={user?._id}
        busyId={busyId}
        roleLabel={roleLabel}
        onRoleChange={handleRoleChange}
        onToggleActive={handleToggleActive}
      />

      {showAdd && (
        <AddStaffModal
          form={form}
          setForm={setForm}
          onSubmit={handleCreate}
          onClose={() => setShowAdd(false)}
          saving={saving}
          error={formError}
          roleLabel={roleLabel}
          roleHelp={roleHelp}
        />
      )}

      {showBranch && (
        <NewBranchModal
          branchForm={branchForm}
          setBranchForm={setBranchForm}
          onSubmit={handleCreateBranch}
          onClose={() => setShowBranch(false)}
          saving={saving}
          error={branchError}
        />
      )}
    </div>
  );
};

export default Staff;
