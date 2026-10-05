import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RoleRoute = ({ allowedRoles }) => {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/pharmacy'} replace />;
  }

  return <Outlet />;
};

export default RoleRoute;
