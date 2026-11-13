import { useAuth } from '../../context/useAuth';

// Renders children only when the active membership role has the permission(s).
//   <Can perm="medicine:manage">...</Can>
//   <Can perm={['po:manage', 'po:receive']} any>...</Can>   (any of them)
//   <Can perm="reports:view" fallback={<p>No access</p>}>...</Can>
const Can = ({ perm, any = false, fallback = null, children }) => {
  const { can } = useAuth();
  const perms = Array.isArray(perm) ? perm : [perm];
  const allowed = any ? perms.some((p) => can(p)) : perms.every((p) => can(p));
  return allowed ? children : fallback;
};

export default Can;
