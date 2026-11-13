import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { landingPath } from '../config/navigation';

// Renders nested routes only when the active membership role has `perm`.
// While memberships are still loading (role unknown) the page renders; the
// backend enforces permissions anyway.
const PermissionRoute = ({ perm }) => {
  const { can, membershipRole, isAdmin } = useAuth();

  if (!perm || isAdmin || !membershipRole || can(perm)) return <Outlet />;

  const target = landingPath(can);
  return <Navigate to={target} replace />;
};

export default PermissionRoute;
